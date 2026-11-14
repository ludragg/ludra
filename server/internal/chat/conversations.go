package chat

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
)

type Conversation struct {
	ID          string
	Peer        database.User
	LastMessage *database.Message
	IsFriend    bool
}

func (s *Service) ListConversations(ctx context.Context, userID string) ([]Conversation, error) {
	rows, err := s.queries.ListConversations(ctx, userID)
	if err != nil {
		return nil, err
	}

	conversations := make([]Conversation, 0, len(rows))
	for _, row := range rows {
		conversation := Conversation{
			ID:       row.ID,
			Peer:     database.User{ID: row.PeerID, Username: row.PeerUsername, Avatar: row.PeerAvatar},
			IsFriend: row.IsFriend,
		}

		if row.LastMessageID != nil {
			conversation.LastMessage = &database.Message{
				ID:             *row.LastMessageID,
				ConversationID: row.ID,
				SenderID:       *row.LastMessageSenderID,
				Content:        *row.LastMessageContent,
				CreatedAt:      *row.LastMessageCreatedAt,
				Kind:           *row.LastMessageKind,
				CallOutcome:    row.LastMessageCallOutcome,
				CallDuration:   row.LastMessageCallDuration,
			}
		}

		conversations = append(conversations, conversation)
	}

	return conversations, nil
}

func (s *Service) OpenConversation(ctx context.Context, userID, peerUsername string) (Conversation, error) {
	peer, err := s.queries.GetVerifiedUserByUsername(ctx, peerUsername)
	if errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, ErrUserNotFound
	}
	if err != nil {
		return Conversation{}, err
	}

	if peer.ID == userID {
		return Conversation{}, ErrSelfConversation
	}

	friends, err := s.queries.AreFriends(ctx, database.AreFriendsParams{UserID: userID, FriendID: peer.ID})
	if err != nil {
		return Conversation{}, err
	}
	if !friends {
		return Conversation{}, ErrNotFriends
	}

	id, err := s.directConversation(ctx, userID, peer.ID)
	if err != nil {
		return Conversation{}, err
	}

	return Conversation{ID: id, Peer: peer, IsFriend: true}, nil
}

func (s *Service) directConversation(ctx context.Context, a, b string) (string, error) {
	var id string
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)

		var err error
		id, err = q.UpsertDirectConversation(ctx, directKey(a, b))
		if err != nil {
			return err
		}

		for _, member := range []string{a, b} {
			err := q.AddParticipant(ctx, database.AddParticipantParams{ConversationID: id, UserID: member})
			if err != nil {
				return err
			}
		}
		return nil
	})
	return id, err
}

func directKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + ":" + b
}
