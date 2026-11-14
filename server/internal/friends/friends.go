package friends

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ludra/internal/database"
	"ludra/internal/ids"
)

type State int

const (
	Accepted State = iota + 1
	Incoming
	Outgoing
)

var states = map[string]State{
	"accepted": Accepted,
	"incoming": Incoming,
	"outgoing": Outgoing,
}

type Friend struct {
	ID       string
	Username string
	Avatar   string
	State    State
}

type Service struct {
	pool    *pgxpool.Pool
	queries *database.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: database.New(pool)}
}

func (s *Service) List(ctx context.Context, userID string) ([]Friend, error) {
	rows, err := s.queries.ListFriends(ctx, userID)
	if err != nil {
		return nil, err
	}

	friends := make([]Friend, len(rows))
	for i, row := range rows {
		friends[i] = Friend{ID: row.ID, Username: row.Username, Avatar: row.Avatar, State: states[row.State]}
	}
	return friends, nil
}

func (s *Service) Get(ctx context.Context, userID, friendID string) (Friend, error) {
	if !ids.Valid(friendID) {
		return Friend{}, ErrNotFriends
	}

	row, err := s.queries.GetFriend(ctx, database.GetFriendParams{UserID: userID, FriendID: friendID})
	if errors.Is(err, pgx.ErrNoRows) {
		return Friend{}, ErrNotFriends
	}
	if err != nil {
		return Friend{}, err
	}
	return Friend{ID: row.ID, Username: row.Username, Avatar: row.Avatar, State: Accepted}, nil
}

func (s *Service) IDs(ctx context.Context, userID string) ([]string, error) {
	return s.queries.ListFriendIDs(ctx, userID)
}

func (s *Service) Add(ctx context.Context, userID, username string) (Friend, error) {
	target, err := s.queries.GetVerifiedUserByUsername(ctx, strings.TrimSpace(username))
	if errors.Is(err, pgx.ErrNoRows) {
		return Friend{}, ErrUserNotFound
	}
	if err != nil {
		return Friend{}, err
	}
	if target.ID == userID {
		return Friend{}, ErrSelfRequest
	}

	state := Outgoing
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)

		if err := q.LockFriendPair(ctx, pairKey(userID, target.ID)); err != nil {
			return err
		}

		friends, err := q.AreFriends(ctx, database.AreFriendsParams{UserID: userID, FriendID: target.ID})
		if err != nil {
			return err
		}
		if friends {
			return ErrAlreadyFriends
		}

		sent, err := q.HasFriendRequest(ctx, database.HasFriendRequestParams{SenderID: userID, RecipientID: target.ID})
		if err != nil {
			return err
		}
		if sent {
			return ErrAlreadyRequested
		}

		received, err := q.DeleteFriendRequest(ctx, database.DeleteFriendRequestParams{SenderID: target.ID, RecipientID: userID})
		if err != nil {
			return err
		}
		if received > 0 {
			state = Accepted
			return q.CreateFriendship(ctx, database.CreateFriendshipParams{UserID: userID, FriendID: target.ID})
		}

		return q.CreateFriendRequest(ctx, database.CreateFriendRequestParams{SenderID: userID, RecipientID: target.ID})
	})
	if err != nil {
		return Friend{}, err
	}

	return Friend{ID: target.ID, Username: target.Username, Avatar: target.Avatar, State: state}, nil
}

func pairKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + ":" + b
}

func (s *Service) Accept(ctx context.Context, userID, requesterID string) (Friend, error) {
	if !ids.Valid(requesterID) {
		return Friend{}, ErrRequestNotFound
	}

	var requester database.User
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)

		removed, err := q.DeleteFriendRequest(ctx, database.DeleteFriendRequestParams{SenderID: requesterID, RecipientID: userID})
		if err != nil {
			return err
		}
		if removed == 0 {
			return ErrRequestNotFound
		}

		if err := q.CreateFriendship(ctx, database.CreateFriendshipParams{UserID: userID, FriendID: requesterID}); err != nil {
			return err
		}

		requester, err = q.GetUser(ctx, requesterID)
		return err
	})
	if err != nil {
		return Friend{}, err
	}

	return Friend{ID: requester.ID, Username: requester.Username, Avatar: requester.Avatar, State: Accepted}, nil
}

func (s *Service) Remove(ctx context.Context, userID, otherID string) error {
	if !ids.Valid(otherID) {
		return ErrRequestNotFound
	}

	removed, err := s.queries.DeleteRelationship(ctx, database.DeleteRelationshipParams{UserID: userID, OtherID: otherID})
	if err != nil {
		return err
	}
	if removed == 0 {
		return ErrRequestNotFound
	}
	return nil
}
