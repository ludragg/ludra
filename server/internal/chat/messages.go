package chat

import (
	"context"
	"errors"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
	"ludra/internal/ids"
)

const (
	maxMessageLength = 4000
	defaultPageSize  = 50
	maxPageSize      = 100
)

func (s *Service) SendMessage(ctx context.Context, senderID, conversationID, content string) (database.Message, []string, error) {
	if strings.TrimSpace(content) == "" {
		return database.Message{}, nil, ErrEmptyMessage
	}
	if utf8.RuneCountInString(content) > maxMessageLength {
		return database.Message{}, nil, ErrMessageTooLong
	}
	if !ids.Valid(conversationID) {
		return database.Message{}, nil, ErrConversationNotFound
	}

	peer, err := s.queries.GetDirectPeer(ctx, database.GetDirectPeerParams{ConversationID: conversationID, UserID: senderID})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, nil, ErrConversationNotFound
	}
	if err != nil {
		return database.Message{}, nil, err
	}
	if !peer.IsFriend {
		return database.Message{}, nil, ErrNotFriends
	}

	message, err := s.queries.CreateMessage(ctx, database.CreateMessageParams{
		ConversationID: conversationID,
		SenderID:       senderID,
		Content:        content,
	})
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

func (s *Service) LoadMessages(ctx context.Context, userID, conversationID, beforeID string, limit uint32) ([]database.Message, bool, error) {
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
