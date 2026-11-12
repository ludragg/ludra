package realtime

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"

	"ludra/internal/chat"
	"ludra/internal/protocol"
)

const (
	maxFrameSize = 64 << 10
	sendBuffer   = 64
	writeTimeout = 5 * time.Second
)

type session struct {
	conn *websocket.Conn
	hub  *hub
	chat *chat.Service
	user *protocol.User
	send chan []byte
}

func (s *session) run(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go s.writeLoop(ctx, cancel)
	s.readLoop(ctx)

	if s.user != nil && s.hub.unregister(s.user.Id, s) {
		s.announce(protocol.Presence_PRESENCE_OFFLINE)
	}
}

func (s *session) readLoop(ctx context.Context) {
	for {
		kind, data, err := s.conn.Read(ctx)
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
	if login, ok := frame.Payload.(*protocol.ClientFrame_Login); ok {
		return s.login(ctx, login.Login)
	}

	if s.user == nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAUTHENTICATED, "login required")
	}

	switch payload := frame.Payload.(type) {
	case *protocol.ClientFrame_ListConversations:
		return s.listConversations(ctx)
	case *protocol.ClientFrame_LoadMessages:
		return s.loadMessages(ctx, payload.LoadMessages)
	case *protocol.ClientFrame_OpenConversation:
		return s.openConversation(ctx, payload.OpenConversation)
	case *protocol.ClientFrame_SendMessage:
		return s.sendMessage(ctx, payload.SendMessage)
	default:
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "unsupported request")
	}
}

func (s *session) login(ctx context.Context, req *protocol.Login) *protocol.ServerFrame {
	if s.user != nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "already logged in")
	}

	user, err := s.chat.Login(ctx, req.Username)
	if err != nil {
		return failure(err)
	}

	s.user = toUser(user)
	s.user.Presence = protocol.Presence_PRESENCE_ONLINE
	if s.hub.register(user.ID, s) {
		s.announce(protocol.Presence_PRESENCE_ONLINE)
	}
	return loggedInFrame(s.user)
}

func (s *session) announce(presence protocol.Presence) {
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()

	contacts, err := s.chat.Contacts(ctx, s.user.Id)
	if err != nil {
		slog.Error("load contacts", "error", err)
		return
	}
	s.hub.publish(contacts, presenceChangedFrame(s.user.Id, presence), nil)
}

func (s *session) conversation(conversation chat.Conversation) *protocol.Conversation {
	result := toConversation(conversation)
	result.Peer.Presence = s.hub.presence(result.Peer.Id)
	return result
}

func (s *session) listConversations(ctx context.Context) *protocol.ServerFrame {
	conversations, err := s.chat.ListConversations(ctx, s.user.Id)
	if err != nil {
		return failure(err)
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
		return failure(err)
	}
	return messageHistoryFrame(req.ConversationId, messages, hasMore)
}

func (s *session) openConversation(ctx context.Context, req *protocol.OpenConversation) *protocol.ServerFrame {
	conversation, err := s.chat.OpenConversation(ctx, s.user.Id, req.Username)
	if err != nil {
		return failure(err)
	}
	return conversationOpenedFrame(s.conversation(conversation))
}

func (s *session) sendMessage(ctx context.Context, req *protocol.SendMessage) *protocol.ServerFrame {
	message, recipients, err := s.chat.SendMessage(ctx, s.user.Id, req.ConversationId, req.Content)
	if err != nil {
		return failure(err)
	}

	s.hub.publish(recipients, messageCreatedFrame(toMessage(message)), s)
	return messageCreatedFrame(toMessage(message))
}

func failure(err error) *protocol.ServerFrame {
	var chatErr *chat.Error
	if errors.As(err, &chatErr) {
		switch chatErr.Kind {
		case chat.NotFound:
			return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, chatErr.Message)
		case chat.Invalid:
			return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, chatErr.Message)
		}
	}

	slog.Error("request failed", "error", err)
	return errorFrame(protocol.ErrorCode_ERROR_CODE_INTERNAL, "internal error")
}
