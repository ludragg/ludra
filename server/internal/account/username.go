package account

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
)

func (s *Service) SetUsername(ctx context.Context, userID, current, username string) (database.User, error) {
	username = strings.TrimSpace(username)
	if !usernamePattern.MatchString(username) {
		return database.User{}, ErrInvalidUsername
	}
	if username == current {
		return database.User{}, ErrSameUsername
	}

	avatar, err := s.queries.SetUsername(ctx, database.SetUsernameParams{ID: userID, Username: username})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.User{}, ErrUsernameCooldown
	}
	if err != nil {
		return database.User{}, uniqueViolation(err)
	}
	return database.User{ID: userID, Username: username, Avatar: avatar}, nil
}

func (s *Service) ContactIDs(ctx context.Context, userID string) ([]string, error) {
	return s.queries.ListContactIDs(ctx, userID)
}
