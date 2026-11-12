package chat

import (
	"context"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"ludra/internal/database"
)

var (
	usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_.]{3,32}$`)
	uuidPattern     = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

type Service struct {
	pool    *pgxpool.Pool
	queries *database.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: database.New(pool)}
}

func (s *Service) Login(ctx context.Context, username string) (database.User, error) {
	username = strings.TrimSpace(username)
	if !usernamePattern.MatchString(username) {
		return database.User{}, ErrInvalidUsername
	}
	return s.queries.UpsertUser(ctx, username)
}

func isUUID(value string) bool {
	return uuidPattern.MatchString(value)
}
