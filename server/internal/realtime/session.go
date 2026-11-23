package realtime

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"

	"ludra/internal/account"
	"ludra/internal/chat"
	"ludra/internal/failure"
	"ludra/internal/friends"
	"ludra/internal/gifs"
	"ludra/internal/protocol"
	"ludra/internal/unfurl"
	"ludra/internal/voice"
)

const (
	maxFrameSize      = 64 << 10
	signedInFrameSize = 1 << 20
	sendBuffer        = 64
	writeTimeout      = 5 * time.Second
	pingInterval      = 10 * time.Second
	pingTimeout       = 10 * time.Second
)

type session struct {
	conn      *websocket.Conn
	hub       *hub
	guard     *guard
	chat      *chat.Service
	friends   *friends.Service
	account   *account.Service
	relay     *voice.Relay
	calls     *calls
	rooms     *rooms
	voice     *sync.Mutex
	ip        string
	previews  *unfurl.Fetcher
	gifs      *gifs.Client
	user      *protocol.User
	sessionID string
	challenge *account.Challenge
	expires   time.Time
	handling  atomic.Bool
	receiving atomic.Bool
	later     []*protocol.ServerFrame
	send      chan []byte
}

func (s *session) run(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	s.expires = time.Now().Add(authTimeout)
	go s.writeLoop(ctx, cancel)
	go s.heartbeat(ctx)
	s.readLoop(ctx)
	s.signOut()
}

func (s *session) readLoop(ctx context.Context) {
	for {
		kind, data, err := s.read(ctx)
		if err != nil {
			return
		}

		if kind != websocket.MessageBinary {
			s.conn.Close(websocket.StatusUnsupportedData, "binary frames only")
			return
		}

		frame := &protocol.ClientFrame{}
		if err := proto.Unmarshal(data, frame); err != nil {
			s.reply(errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "malformed frame"))
			continue
		}

		s.handling.Store(true)
		reply := s.handle(ctx, frame)
		s.handling.Store(false)
		reply.RequestId = frame.RequestId
		s.reply(reply)
		for _, pending := range s.later {
			s.reply(pending)
		}
		s.later = nil
	}
}

func (s *session) read(ctx context.Context) (websocket.MessageType, []byte, error) {
	if s.user == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithDeadline(ctx, s.expires)
		defer cancel()
	}

	kind, reader, err := s.conn.Reader(ctx)
	if err != nil {
		return 0, nil, err
	}
	s.receiving.Store(true)
	defer s.receiving.Store(false)
	data, err := io.ReadAll(reader)
	return kind, data, err
}

func (s *session) writeLoop(ctx context.Context, cancel context.CancelFunc) {
	defer cancel()

	for {
		select {
		case <-ctx.Done():
			return
		case data := <-s.send:
			writeCtx, done := context.WithTimeout(ctx, writeTimeout)
			err := s.conn.Write(writeCtx, websocket.MessageBinary, data)
			done()
			if err != nil {
				return
			}
		}
	}
}

func (s *session) heartbeat(ctx context.Context) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if s.handling.Load() || s.receiving.Load() {
				continue
			}
			pingCtx, done := context.WithTimeout(ctx, pingTimeout)
			err := s.conn.Ping(pingCtx)
			done()
			if err != nil && ctx.Err() == nil && !s.handling.Load() && !s.receiving.Load() {
				s.conn.CloseNow()
				return
			}
		}
	}
}

func (s *session) reply(frame *protocol.ServerFrame) {
	data, err := proto.Marshal(frame)
	if err != nil {
		slog.Error("marshal frame", "error", err)
		return
	}
	s.push(data)
}

func (s *session) offer(frame *protocol.ServerFrame) {
	data, err := proto.Marshal(frame)
	if err != nil {
		slog.Error("marshal frame", "error", err)
		return
	}
	s.deliver(data)
}

func (s *session) deliver(data []byte) {
	if len(s.send) >= sendBuffer/2 {
		return
	}
	select {
	case s.send <- data:
	default:
	}
}

func (s *session) push(data []byte) {
	select {
	case s.send <- data:
	default:
		s.conn.CloseNow()
	}
}

func (s *session) handle(ctx context.Context, frame *protocol.ClientFrame) *protocol.ServerFrame {
	switch payload := frame.Payload.(type) {
	case *protocol.ClientFrame_Ping:
		return ackFrame()
	case *protocol.ClientFrame_Register:
		req := payload.Register
		if !s.guard.allowAuth(s.ip) {
			return tooManyRequests()
		}
		return s.signIn(func() (account.Outcome, error) {
			return s.account.Register(ctx, req.Email, req.Username, req.Password, req.Locale)
		})
	case *protocol.ClientFrame_Login:
		req := payload.Login
		if !s.guard.allowLogin(s.ip, req.Login) {
			return tooManyRequests()
		}
		return s.signIn(func() (account.Outcome, error) {
			return s.account.Login(ctx, req.Login, req.Password, req.Locale)
		})
	case *protocol.ClientFrame_Resume:
		req := payload.Resume
		if !s.guard.allowAuth(s.ip) {
			return tooManyRequests()
		}
		return s.signIn(func() (account.Outcome, error) {
			return s.account.Resume(ctx, req.Token)
		})
	case *protocol.ClientFrame_VerifyEmail:
		req := payload.VerifyEmail
		if !s.guard.allowCodeCheck(s.ip, req.Email) {
			return tooManyRequests()
		}
		return s.signIn(func() (account.Outcome, error) {
			return s.account.VerifyEmail(ctx, req.Email, req.Code)
		})
	case *protocol.ClientFrame_ResetPassword:
		req := payload.ResetPassword
		if !s.guard.allowCodeCheck(s.ip, req.Email) {
			return tooManyRequests()
		}
		reply := s.signIn(func() (account.Outcome, error) {
			return s.account.ResetPassword(ctx, req.Email, req.Code, req.Password)
		})
		if reply.GetLoggedIn() != nil {
			s.hub.disconnect(s.user.Id, s)
		}
		return reply
	case *protocol.ClientFrame_SendCode:
		if !s.guard.allowCodeSend(s.ip, payload.SendCode.Email) {
			return tooManyRequests()
		}
		return s.sendCode(ctx, payload.SendCode)
	case *protocol.ClientFrame_VerifyTwoFactor:
		return s.verifyTwoFactor(ctx, payload.VerifyTwoFactor)
	case *protocol.ClientFrame_ResendTwoFactor:
		return s.resendTwoFactor(ctx, payload.ResendTwoFactor)
	}

	if s.user == nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAUTHENTICATED, "login required")
	}

	switch payload := frame.Payload.(type) {
	case *protocol.ClientFrame_Logout:
		return s.logout(ctx)
	case *protocol.ClientFrame_ListConversations:
		return s.listConversations(ctx)
	case *protocol.ClientFrame_LoadMessages:
		return s.loadMessages(ctx, payload.LoadMessages)
	case *protocol.ClientFrame_OpenConversation:
		if !s.guard.openings.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.openConversation(ctx, payload.OpenConversation)
	case *protocol.ClientFrame_SendMessage:
		if !s.guard.messages.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.sendMessage(ctx, payload.SendMessage)
	case *protocol.ClientFrame_GetImage:
		if !s.guard.imageReads.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.getImage(ctx, payload.GetImage)
	case *protocol.ClientFrame_SearchGifs:
		if !s.guard.gifSearches.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.searchGifs(ctx, payload.SearchGifs)
	case *protocol.ClientFrame_GetGifPreview:
		if !s.guard.imageReads.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.gifPreview(ctx, payload.GetGifPreview)
	case *protocol.ClientFrame_SendGif:
		if !s.guard.images.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.sendGif(ctx, payload.SendGif)
	case *protocol.ClientFrame_SendDirectFile:
		if !s.guard.messages.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.sendDirectFile(ctx, payload.SendDirectFile)
	case *protocol.ClientFrame_FileSignal:
		if !s.guard.signals.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.fileSignal(ctx, payload.FileSignal)
	case *protocol.ClientFrame_RemovePreview:
		if !s.guard.messages.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.removePreview(ctx, payload.RemovePreview)
	case *protocol.ClientFrame_EditMessage:
		if !s.guard.messages.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.editMessage(ctx, payload.EditMessage)
	case *protocol.ClientFrame_DeleteMessage:
		if !s.guard.messages.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.deleteMessage(ctx, payload.DeleteMessage)
	case *protocol.ClientFrame_SetUsername:
		if !s.guard.usernameChanges.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.setUsername(ctx, payload.SetUsername)
	case *protocol.ClientFrame_ListFriends:
		return s.listFriends(ctx)
	case *protocol.ClientFrame_ListBlocked:
		return s.listBlocked(ctx)
	case *protocol.ClientFrame_SetIdentityKey:
		return s.setIdentityKey(ctx, payload.SetIdentityKey)
	case *protocol.ClientFrame_ListIdentityKeys:
		return s.listIdentityKeys(ctx, payload.ListIdentityKeys)
	case *protocol.ClientFrame_RenameGroup:
		return s.renameGroup(ctx, payload.RenameGroup)
	case *protocol.ClientFrame_SetGroupAvatar:
		return s.setGroupAvatar(ctx, payload.SetGroupAvatar)
	case *protocol.ClientFrame_BlockUser:
		return s.blockUser(ctx, payload.BlockUser)
	case *protocol.ClientFrame_UnblockUser:
		return s.unblockUser(ctx, payload.UnblockUser)
	case *protocol.ClientFrame_AddFriend:
		if !s.guard.friendRequests.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.addFriend(ctx, payload.AddFriend)
	case *protocol.ClientFrame_AcceptFriend:
		if !s.guard.friendChanges.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.acceptFriend(ctx, payload.AcceptFriend)
	case *protocol.ClientFrame_RemoveFriend:
		if !s.guard.friendChanges.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.removeFriend(ctx, payload.RemoveFriend)
	case *protocol.ClientFrame_SetPresence:
		if !s.guard.presenceChanges.Allow(s.user.Id) {
			return tooManyRequests()
		}
		return s.setPresence(ctx, payload.SetPresence)
	case *protocol.ClientFrame_ChangePassword:
		return s.changePassword(ctx, payload.ChangePassword)
	case *protocol.ClientFrame_SetTwoFactor:
		return s.setTwoFactor(ctx, payload.SetTwoFactor)
	case *protocol.ClientFrame_SetAvatar:
		return s.setAvatar(ctx, payload.SetAvatar)
	case *protocol.ClientFrame_RemoveAvatar:
		return s.removeAvatar(ctx)
	case *protocol.ClientFrame_StartCall:
		return s.startCall(ctx, payload.StartCall)
	case *protocol.ClientFrame_AnswerCall:
		return s.answerCall(payload.AnswerCall)
	case *protocol.ClientFrame_EndCall:
		return s.endCall(payload.EndCall)
	case *protocol.ClientFrame_CallSignal:
		return s.relaySignal(payload.CallSignal)
	case *protocol.ClientFrame_CreateGroup:
		return s.createGroup(ctx, payload.CreateGroup)
	case *protocol.ClientFrame_AddGroupMembers:
		return s.addGroupMembers(ctx, payload.AddGroupMembers)
	case *protocol.ClientFrame_RemoveGroupMember:
		return s.removeGroupMember(ctx, payload.RemoveGroupMember)
	case *protocol.ClientFrame_LeaveGroup:
		return s.leaveGroup(ctx, payload.LeaveGroup)
	case *protocol.ClientFrame_JoinGroupCall:
		return s.joinGroupCall(ctx, payload.JoinGroupCall)
	case *protocol.ClientFrame_LeaveGroupCall:
		return s.leaveGroupCall()
	case *protocol.ClientFrame_DeclineGroupCall:
		return s.declineGroupCall(payload.DeclineGroupCall)
	case *protocol.ClientFrame_DeleteGroup:
		return s.deleteGroup(ctx, payload.DeleteGroup)
	case *protocol.ClientFrame_TransferGroup:
		return s.transferGroup(ctx, payload.TransferGroup)
	default:
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "unsupported request")
	}
}

func (s *session) announce(presence protocol.Presence) {
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()

	watchers, err := s.account.PresenceIDs(ctx, s.user.Id)
	if err != nil {
		slog.Error("load presence audience", "error", err)
		return
	}
	s.hub.publish(watchers, presenceChangedFrame(s.user.Id, presence), nil)
}

func (s *session) conversation(conversation chat.Conversation) *protocol.Conversation {
	result := toConversation(conversation)
	result.Peer.Presence = s.hub.presence(result.Peer.Id)
	return result
}

func (s *session) listConversations(ctx context.Context) *protocol.ServerFrame {
	conversations, err := s.chat.ListConversations(ctx, s.user.Id)
	if err != nil {
		return failed(err)
	}
	groups, err := s.chat.ListGroups(ctx, s.user.Id)
	if err != nil {
		return failed(err)
	}

	list := make([]*protocol.Conversation, 0, len(conversations)+len(groups))
	for _, conversation := range conversations {
		list = append(list, s.conversation(conversation))
	}
	for _, group := range groups {
		list = append(list, s.groupConversation(group))
		for userID, image := range s.rooms.previewsOf(group.ID) {
			s.offer(streamPreviewFrame(group.ID, userID, image))
		}
	}
	return conversationListFrame(list)
}

func (s *session) loadMessages(ctx context.Context, req *protocol.LoadMessages) *protocol.ServerFrame {
	messages, hasMore, err := s.chat.LoadMessages(ctx, s.user.Id, req.ConversationId, req.BeforeId, req.Limit)
	if err != nil {
		return failed(err)
	}
	extras, err := s.chat.ExtraFiles(ctx, messages)
	if err != nil {
		return failed(err)
	}
	return messageHistoryFrame(req.ConversationId, messages, extras, hasMore)
}

func (s *session) openConversation(ctx context.Context, req *protocol.OpenConversation) *protocol.ServerFrame {
	conversation, err := s.chat.OpenConversation(ctx, s.user.Id, req.Username)
	if err != nil {
		return failed(err)
	}
	return conversationOpenedFrame(s.conversation(conversation))
}

func (s *session) sendMessage(ctx context.Context, req *protocol.SendMessage) *protocol.ServerFrame {
	message, recipients, err := s.chat.SendMessage(ctx, s.user.Id, req.ConversationId, req.Content, req.ReplyToId)
	if err != nil {
		return failed(err)
	}

	frame := messageCreatedFrame(named(toMessage(message), s.user.Username, nil))
	s.hub.publish(recipients, frame, s)
	s.unfurl(ctx, message)
	return frame
}

func (s *session) editMessage(ctx context.Context, req *protocol.EditMessage) *protocol.ServerFrame {
	message, recipients, err := s.chat.EditMessage(ctx, s.user.Id, req.MessageId, req.Content)
	if err != nil {
		return failed(err)
	}

	frame := messageUpdatedFrame(named(toMessage(message), s.user.Username, nil))
	s.hub.publish(recipients, frame, s)
	s.unfurl(ctx, message)
	return frame
}

func (s *session) deleteMessage(ctx context.Context, req *protocol.DeleteMessage) *protocol.ServerFrame {
	deletion, err := s.chat.DeleteMessage(ctx, s.user.Id, req.MessageId)
	if err != nil {
		return failed(err)
	}

	frame := messageDeletedFrame(deletion, req.MessageId)
	s.hub.publish(deletion.Recipients, frame, s)
	return frame
}

var errorCodes = map[failure.Kind]protocol.ErrorCode{
	failure.Invalid:         protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST,
	failure.NotFound:        protocol.ErrorCode_ERROR_CODE_NOT_FOUND,
	failure.Conflict:        protocol.ErrorCode_ERROR_CODE_ALREADY_EXISTS,
	failure.Denied:          protocol.ErrorCode_ERROR_CODE_INVALID_CREDENTIALS,
	failure.Unauthorized:    protocol.ErrorCode_ERROR_CODE_UNAUTHENTICATED,
	failure.InvalidCode:     protocol.ErrorCode_ERROR_CODE_INVALID_CODE,
	failure.TooManyRequests: protocol.ErrorCode_ERROR_CODE_TOO_MANY_REQUESTS,
	failure.Forbidden:       protocol.ErrorCode_ERROR_CODE_FORBIDDEN,
	failure.Unavailable:     protocol.ErrorCode_ERROR_CODE_UNAVAILABLE,
	failure.QuotaExceeded:   protocol.ErrorCode_ERROR_CODE_QUOTA_EXCEEDED,
}

func failed(err error) *protocol.ServerFrame {
	var appErr *failure.Error
	if errors.As(err, &appErr) {
		return errorFrame(errorCodes[appErr.Kind], appErr.Message)
	}

	slog.Error("request failed", "error", err)
	return errorFrame(protocol.ErrorCode_ERROR_CODE_INTERNAL, "internal error")
}
