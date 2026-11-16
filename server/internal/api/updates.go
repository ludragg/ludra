package api

import (
	"net/http"

	"ludra/internal/updates"
)

func latestUpdate(feed *updates.Feed) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := feed.Latest()
		if err != nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(body)
	}
}
