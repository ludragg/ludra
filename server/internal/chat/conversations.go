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
}

func (s *Service) ListConversations(ctx context.Context, userID string) ([]Conversation, error) {
	rows, err := s.queries.ListConversations(ctx, userID)
	if err != nil {
		return nil, err
	}

	conversations := make([]Conversation, 0, len(rows))
	for _, row := range rows {
		conversation := Conversation{
			ID:   row.ID,
			Peer: database.User{ID: row.PeerID, Username: row.PeerUsername},
		}

		if row.LastMessageID != nil {
			conversation.LastMessage = &database.Message{
				ID:             *row.LastMessageID,
				ConversationID: row.ID,
				SenderID:       *row.LastMessageSenderID,
				Content:        *row.LastMessageContent,
				CreatedAt:      *row.LastMessageCreatedAt,
			}
		}

		conversations = append(conversations, conversation)
	}

	return conversations, nil
}

func (s *Service) Contacts(ctx context.Context, userID string) ([]string, error) {
	return s.queries.ListContactIDs(ctx, userID)
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

	var id string
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)

		id, err = q.UpsertDirectConversation(ctx, directKey(userID, peer.ID))
		if err != nil {
			return err
		}

		for _, member := range []string{userID, peer.ID} {
			err := q.AddParticipant(ctx, database.AddParticipantParams{ConversationID: id, UserID: member})
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return Conversation{}, err
	}

	return Conversation{ID: id, Peer: peer}, nil
}

func directKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + ":" + b
}
