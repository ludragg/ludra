package chat

import (
	"regexp"

	"github.com/jackc/pgx/v5/pgxpool"

	"ludra/internal/database"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type Service struct {
	pool    *pgxpool.Pool
	queries *database.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: database.New(pool)}
}

func isUUID(value string) bool {
	return uuidPattern.MatchString(value)
}
