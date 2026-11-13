package api

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ludra/internal/account"
)

func NewHandler(pool *pgxpool.Pool, accounts *account.Service, realtime http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health(pool))
	mux.HandleFunc("GET /avatars/{id}", avatars(accounts))
	mux.Handle("GET /ws", realtime)
	return mux
}

func health(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := pool.Ping(ctx); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}

		w.Write([]byte("ok"))
	}
}
