package chat

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
	"ludra/internal/ids"
)

const (
	maxMessageLength = 4000
	defaultPageSize  = 50
	maxExcerptLength = 140
	voiceMime        = "audio/webm"
	maxPageSize      = 100
)

func (s *Service) SendMessage(ctx context.Context, senderID, conversationID, content, replyToID string) (database.Message, []string, error) {
	content = strings.TrimFunc(content, invisible)
	if content == "" {
		return database.Message{}, nil, ErrEmptyMessage
	}
	if utf8.RuneCountInString(content) > maxMessageLength {
		return database.Message{}, nil, ErrMessageTooLong
	}
	if !ids.Valid(conversationID) {
		return database.Message{}, nil, ErrConversationNotFound
	}

	if err := s.canSend(ctx, senderID, conversationID); err != nil {
		return database.Message{}, nil, err
	}

	params := database.CreateMessageParams{
		ConversationID: conversationID,
		SenderID:       senderID,
		Content:        content,
	}
	if replyToID != "" {
		quoted, err := s.quote(ctx, conversationID, replyToID)
		if err != nil {
			return database.Message{}, nil, err
		}
		params.ReplyTo = &quoted.id
		params.ReplySenderID = &quoted.senderID
		params.ReplyKind = &quoted.kind
		params.ReplyExcerpt = &quoted.excerpt
	}

	message, err := s.queries.CreateMessage(ctx, params)
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, nil, ErrConversationNotFound
	}
	if err != nil {
		return database.Message{}, nil, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, conversationID)
	if err != nil {
		return database.Message{}, nil, err
	}

	return message, recipients, nil
}

type quotation struct {
	id       string
	senderID string
	kind     string
	excerpt  string
}

func (s *Service) quote(ctx context.Context, conversationID, replyToID string) (quotation, error) {
	if !ids.Valid(replyToID) {
		return quotation{}, ErrMessageNotFound
	}
	target, err := s.queries.GetReplyTarget(ctx, replyToID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && target.ConversationID != conversationID) {
		return quotation{}, ErrMessageNotFound
	}
	if err != nil {
		return quotation{}, err
	}

	result := quotation{id: target.ID, senderID: target.SenderID, kind: "text", excerpt: truncate(target.Content, maxExcerptLength)}
	switch target.Kind {
	case "call", "event":
		return quotation{}, ErrMessageNotFound
	case "image":
		result.kind, result.excerpt = "image", ""
	case "file":
		result.kind, result.excerpt = "file", ""
		if target.FileMime != nil && *target.FileMime == voiceMime {
			result.kind = "voice"
		}
	}
	return result, nil
}

func (s *Service) attachReply(ctx context.Context, message database.Message, replyToID string) database.Message {
	if replyToID == "" {
		return message
	}
	quoted, err := s.quote(ctx, message.ConversationID, replyToID)
	if err != nil {
		return message
	}
	updated, err := s.queries.SetMessageReply(ctx, database.SetMessageReplyParams{
		ID:            message.ID,
		ReplyTo:       quoted.id,
		ReplySenderID: quoted.senderID,
		ReplyKind:     quoted.kind,
		ReplyExcerpt:  quoted.excerpt,
	})
	if err != nil {
		return message
	}
	return updated
}

func truncate(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit])
}

func (s *Service) EditMessage(ctx context.Context, userID, messageID, content string) (database.Message, []string, error) {
	content = strings.TrimFunc(content, invisible)
	if content == "" {
		return database.Message{}, nil, ErrEmptyMessage
	}
	if utf8.RuneCountInString(content) > maxMessageLength {
		return database.Message{}, nil, ErrMessageTooLong
	}

	target, err := s.messageTarget(ctx, messageID)
	if err != nil {
		return database.Message{}, nil, err
	}
	if target.SenderID != userID || target.Kind != "text" {
		return database.Message{}, nil, ErrMessageForbidden
	}
	if err := s.canSend(ctx, userID, target.ConversationID); err != nil {
		return database.Message{}, nil, err
	}

	var message database.Message
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		var err error
		message, err = q.EditMessage(ctx, database.EditMessageParams{ID: messageID, Content: content})
		if err != nil {
			return err
		}
		return q.DeletePreviewImage(ctx, messageID)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, nil, ErrMessageNotFound
	}
	if err != nil {
		return database.Message{}, nil, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, target.ConversationID)
	if err != nil {
		return database.Message{}, nil, err
	}
	return message, recipients, nil
}

type Deletion struct {
	ConversationID string
	Recipients     []string
	Last           *database.ListMessagesRow
}

func (s *Service) DeleteMessage(ctx context.Context, userID, messageID string) (Deletion, error) {
	target, err := s.messageTarget(ctx, messageID)
	if err != nil {
		return Deletion{}, err
	}

	member, err := s.queries.IsParticipant(ctx, database.IsParticipantParams{ConversationID: target.ConversationID, UserID: userID})
	if err != nil {
		return Deletion{}, err
	}
	if !member {
		return Deletion{}, ErrMessageNotFound
	}
	owner := target.ConversationKind == "group" && target.OwnerID != nil && *target.OwnerID == userID
	if (target.Kind != "text" && target.Kind != "image" && target.Kind != "file") || (target.SenderID != userID && !owner) {
		return Deletion{}, ErrMessageForbidden
	}

	if err := s.queries.DeleteMessage(ctx, messageID); err != nil {
		return Deletion{}, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, target.ConversationID)
	if err != nil {
		return Deletion{}, err
	}
	latest, err := s.queries.ListMessages(ctx, database.ListMessagesParams{ConversationID: target.ConversationID, RowLimit: 1})
	if err != nil {
		return Deletion{}, err
	}

	deletion := Deletion{ConversationID: target.ConversationID, Recipients: recipients}
	if len(latest) > 0 {
		deletion.Last = &latest[0]
	}
	return deletion, nil
}

func (s *Service) messageTarget(ctx context.Context, messageID string) (database.GetMessageTargetRow, error) {
	if !ids.Valid(messageID) {
		return database.GetMessageTargetRow{}, ErrMessageNotFound
	}
	target, err := s.queries.GetMessageTarget(ctx, messageID)
	if errors.Is(err, pgx.ErrNoRows) {
		return database.GetMessageTargetRow{}, ErrMessageNotFound
	}
	return target, err
}

func (s *Service) canSend(ctx context.Context, senderID, conversationID string) error {
	conversation, err := s.queries.GetConversation(ctx, conversationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrConversationNotFound
	}
	if err != nil {
		return err
	}

	if conversation.Kind == "group" {
		member, err := s.queries.IsParticipant(ctx, database.IsParticipantParams{ConversationID: conversationID, UserID: senderID})
		if err != nil {
			return err
		}
		if !member {
			return ErrConversationNotFound
		}
		return nil
	}

	peer, err := s.queries.GetDirectPeer(ctx, database.GetDirectPeerParams{ConversationID: conversationID, UserID: senderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrConversationNotFound
	}
	if err != nil {
		return err
	}
	if !peer.IsFriend {
		return ErrNotFriends
	}
	return nil
}

func (s *Service) LoadMessages(ctx context.Context, userID, conversationID, beforeID string, limit uint32) ([]database.ListMessagesRow, bool, error) {
	if !ids.Valid(conversationID) {
		return nil, false, ErrConversationNotFound
	}

	var before *string
	if beforeID != "" {
		if !ids.Valid(beforeID) {
			return nil, false, ErrInvalidCursor
		}
		before = &beforeID
	}

	isParticipant, err := s.queries.IsParticipant(ctx, database.IsParticipantParams{ConversationID: conversationID, UserID: userID})
	if err != nil {
		return nil, false, err
	}
	if !isParticipant {
		return nil, false, ErrConversationNotFound
	}

	size := pageSize(limit)
	messages, err := s.queries.ListMessages(ctx, database.ListMessagesParams{
		ConversationID: conversationID,
		BeforeID:       before,
		RowLimit:       int32(size + 1),
	})
	if err != nil {
		return nil, false, err
	}

	hasMore := len(messages) > size
	if hasMore {
		messages = messages[:size]
	}
	slices.Reverse(messages)

	return messages, hasMore, nil
}

func pageSize(limit uint32) int {
	if limit == 0 {
		return defaultPageSize
	}
	return int(min(limit, maxPageSize))
}

var fillers = map[rune]bool{'\u115f': true, '\u1160': true, '\u2800': true, '\u3164': true, '\uffa0': true}

func invisible(r rune) bool {
	return unicode.IsSpace(r) || unicode.Is(unicode.Cf, r) || fillers[r]
}

func (s *Service) StartCallMessage(ctx context.Context, callerID, calleeID string) (database.Message, error) {
	conversationID, err := s.directConversation(ctx, callerID, calleeID)
	if err != nil {
		return database.Message{}, err
	}
	return s.queries.CreateCallMessage(ctx, database.CreateCallMessageParams{ConversationID: conversationID, SenderID: callerID})
}

func (s *Service) FinishCallMessage(ctx context.Context, id, outcome string, duration time.Duration) (database.Message, error) {
	seconds := int32(duration / time.Second)
	return s.queries.FinishCallMessage(ctx, database.FinishCallMessageParams{
		ID:           id,
		CallOutcome:  &outcome,
		CallDuration: &seconds,
	})
}

func (s *Service) CloseStaleCalls(ctx context.Context) error {
	return s.queries.CloseStaleCalls(ctx)
}
