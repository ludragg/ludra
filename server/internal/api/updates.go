package api

import (
	"errors"
	"log/slog"
	"net/http"

	"ludra/internal/updates"
)

func latestUpdate(feed *updates.Feed) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := feed.Latest(r.Context())
		if err != nil {
			if !errors.Is(err, updates.ErrNoRelease) {
				slog.Warn("update feed unavailable", "error", err)
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(body)
	}
}
