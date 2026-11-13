package account

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"

	"github.com/jackc/pgx/v5"
	"golang.org/x/image/webp"

	"ludra/internal/database"
)

const (
	avatarSize     = 256
	maxAvatarBytes = 48 << 10
)

func (s *Service) SetAvatar(ctx context.Context, userID string, image []byte) (string, error) {
	if len(image) == 0 || len(image) > maxAvatarBytes {
		return "", ErrInvalidAvatar
	}
	config, err := webp.DecodeConfig(bytes.NewReader(image))
	if err != nil || config.Width != avatarSize || config.Height != avatarSize {
		return "", ErrInvalidAvatar
	}

	version := make([]byte, 8)
	if _, err := rand.Read(version); err != nil {
		return "", err
	}
	avatar := hex.EncodeToString(version)

	if err := s.queries.SaveAvatar(ctx, database.SaveAvatarParams{UserID: userID, Image: image}); err != nil {
		return "", err
	}
	if err := s.queries.SetAvatar(ctx, database.SetAvatarParams{ID: userID, Avatar: avatar}); err != nil {
		return "", err
	}
	return avatar, nil
}

func (s *Service) RemoveAvatar(ctx context.Context, userID string) error {
	if err := s.queries.SetAvatar(ctx, database.SetAvatarParams{ID: userID, Avatar: ""}); err != nil {
		return err
	}
	return s.queries.DeleteAvatar(ctx, userID)
}

func (s *Service) Avatar(ctx context.Context, userID string) ([]byte, error) {
	image, err := s.queries.GetAvatar(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAvatarNotFound
	}
	return image, err
}
