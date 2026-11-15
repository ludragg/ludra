package api

import (
	"errors"
	"net/http"

	"ludra/internal/account"
	"ludra/internal/chat"
	"ludra/internal/ids"
)

func avatars(accounts *account.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.PathValue("id")
		if !ids.Valid(userID) {
			http.NotFound(w, r)
			return
		}

		image, err := accounts.Avatar(r.Context(), userID)
		if errors.Is(err, account.ErrAvatarNotFound) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		writeImage(w, image)
	}
}

func groupAvatars(chats *chat.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		image, err := chats.GroupAvatar(r.Context(), r.PathValue("id"))
		if errors.Is(err, chat.ErrGroupNotFound) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		writeImage(w, image)
	}
}

func writeImage(w http.ResponseWriter, image []byte) {
	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(image)
}
