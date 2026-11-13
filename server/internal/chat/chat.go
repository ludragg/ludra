package chat

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"ludra/internal/database"
)

type Service struct {
	pool    *pgxpool.Pool
	queries *database.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: database.New(pool)}
}
