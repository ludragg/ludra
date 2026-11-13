package realtime

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"

	"ludra/internal/account"
	"ludra/internal/chat"
	"ludra/internal/failure"
	"ludra/internal/friends"
	"ludra/internal/protocol"
)

const (
	maxFrameSize = 64 << 10
	sendBuffer   = 64
	writeTimeout = 5 * time.Second
)

type session struct {
	conn      *websocket.Conn
	hub       *hub
	guard     *guard
	chat      *chat.Service
	friends   *friends.Service
	account   *account.Service
	ip        string
	user      *protocol.User
	sessionID string
	send      chan []byte
}

func (s *session) run(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go s.writeLoop(ctx, cancel)
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

		reply := s.handle(ctx, frame)
		reply.RequestId = frame.RequestId
		s.reply(reply)
	}
}

func (s *session) read(ctx context.Context) (websocket.MessageType, []byte, error) {
	if s.user != nil {
		return s.conn.Read(ctx)
	}

	ctx, cancel := context.WithTimeout(ctx, authTimeout)
	defer cancel()
	return s.conn.Read(ctx)
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

func (s *session) reply(frame *protocol.ServerFrame) {
	data, err := proto.Marshal(frame)
	if err != nil {
		slog.Error("marshal frame", "error", err)
		return
	}
	s.push(data)
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
	case *protocol.ClientFrame_Register:
		req := payload.Register
		if !s.guard.allowAuth(s.ip) {
			return tooManyRequests()
		}
		return s.signIn(func() (account.Outcome, error) {
			return s.account.Register(ctx, req.Email, req.Username, req.Password)
		})
	case *protocol.ClientFrame_Login:
		req := payload.Login
		if !s.guard.allowLogin(s.ip, req.Login) {
			return tooManyRequests()
		}
		return s.signIn(func() (account.Outcome, error) {
			return s.account.Login(ctx, req.Login, req.Password)
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
	case *protocol.ClientFrame_ListFriends:
		return s.listFriends(ctx)
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
	default:
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "unsupported request")
	}
}

func (s *session) announce(presence protocol.Presence) {
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()

	friendIDs, err := s.friends.IDs(ctx, s.user.Id)
	if err != nil {
		slog.Error("load friends", "error", err)
		return
	}
	s.hub.publish(friendIDs, presenceChangedFrame(s.user.Id, presence), nil)
}

func (s *session) conversation(conversation chat.Conversation) *protocol.Conversation {
	result := toConversation(conversation)
	result.Peer.Presence = protocol.Presence_PRESENCE_OFFLINE
	if conversation.IsFriend {
		result.Peer.Presence = s.hub.presence(result.Peer.Id)
	}
	return result
}

func (s *session) listConversations(ctx context.Context) *protocol.ServerFrame {
	conversations, err := s.chat.ListConversations(ctx, s.user.Id)
	if err != nil {
		return failed(err)
	}

	list := make([]*protocol.Conversation, len(conversations))
	for i, conversation := range conversations {
		list[i] = s.conversation(conversation)
	}
	return conversationListFrame(list)
}

func (s *session) loadMessages(ctx context.Context, req *protocol.LoadMessages) *protocol.ServerFrame {
	messages, hasMore, err := s.chat.LoadMessages(ctx, s.user.Id, req.ConversationId, req.BeforeId, req.Limit)
	if err != nil {
		return failed(err)
	}
	return messageHistoryFrame(req.ConversationId, messages, hasMore)
}

func (s *session) openConversation(ctx context.Context, req *protocol.OpenConversation) *protocol.ServerFrame {
	conversation, err := s.chat.OpenConversation(ctx, s.user.Id, req.Username)
	if err != nil {
		return failed(err)
	}
	return conversationOpenedFrame(s.conversation(conversation))
}

func (s *session) sendMessage(ctx context.Context, req *protocol.SendMessage) *protocol.ServerFrame {
	message, recipients, err := s.chat.SendMessage(ctx, s.user.Id, req.ConversationId, req.Content)
	if err != nil {
		return failed(err)
	}

	s.hub.publish(recipients, messageCreatedFrame(toMessage(message)), s)
	return messageCreatedFrame(toMessage(message))
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
}

func failed(err error) *protocol.ServerFrame {
	var appErr *failure.Error
	if errors.As(err, &appErr) {
		return errorFrame(errorCodes[appErr.Kind], appErr.Message)
	}

	slog.Error("request failed", "error", err)
	return errorFrame(protocol.ErrorCode_ERROR_CODE_INTERNAL, "internal error")
}
