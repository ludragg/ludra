package account

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
	"ludra/internal/imaging"
)

func (s *Service) SetAvatar(ctx context.Context, userID string, image []byte) (string, error) {
	if !imaging.ValidAvatar(image) {
		return "", ErrInvalidAvatar
	}
	avatar, err := imaging.Version()
	if err != nil {
		return "", err
	}

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
