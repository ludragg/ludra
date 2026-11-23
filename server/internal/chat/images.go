package chat

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
	"ludra/internal/ids"
	"ludra/internal/imaging"
	"ludra/internal/unfurl"
)

type Image struct {
	ID     string
	Width  int32
	Height int32
}

const imageChunk = 256 << 10

type ImageData struct {
	Data  []byte
	Total int32
	Mime  string
}

func (s *Service) SendImage(ctx context.Context, senderID, conversationID, replyToID string, data []byte) (database.Message, Image, []string, error) {
	photo, ok := imaging.ReadPhoto(data)
	if !ok {
		return database.Message{}, Image{}, nil, ErrInvalidImage
	}
	if !ids.Valid(conversationID) {
		return database.Message{}, Image{}, nil, ErrConversationNotFound
	}
	if err := s.canSend(ctx, senderID, conversationID); err != nil {
		return database.Message{}, Image{}, nil, err
	}

	var message database.Message
	var image database.SaveImageRow
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		if err := reserveGif(ctx, q, senderID); err != nil {
			return err
		}
		var err error
		message, err = q.CreateImageMessage(ctx, database.CreateImageMessageParams{ConversationID: conversationID, SenderID: senderID})
		if err != nil {
			return err
		}
		image, err = q.SaveImage(ctx, database.SaveImageParams{
			MessageID:      message.ID,
			ConversationID: conversationID,
			Role:           "photo",
			Data:           data,
			Mime:           photo.Mime,
			Width:          int32(photo.Width),
			Height:         int32(photo.Height),
		})
		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, Image{}, nil, ErrConversationNotFound
	}
	if err != nil {
		return database.Message{}, Image{}, nil, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, conversationID)
	if err != nil {
		return database.Message{}, Image{}, nil, err
	}
	return s.attachReply(ctx, message, replyToID), Image(image), recipients, nil
}

func (s *Service) GetImage(ctx context.Context, userID, imageID string, offset uint32) (ImageData, error) {
	if !ids.Valid(imageID) || offset > imaging.MaxPhotoBytes {
		return ImageData{}, ErrImageNotFound
	}
	row, err := s.queries.GetImage(ctx, database.GetImageParams{
		Start:  int32(offset) + 1,
		Length: imageChunk,
		UserID: userID,
		ID:     imageID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return ImageData{}, ErrImageNotFound
	}
	if err != nil {
		return ImageData{}, err
	}
	return ImageData(row), nil
}

func (s *Service) SetPreview(ctx context.Context, messageID, link string, preview unfurl.Preview) (database.Message, *Image, []string, error) {
	var message database.Message
	var image *Image
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		var err error
		message, err = q.SetPreview(ctx, database.SetPreviewParams{
			ID:          messageID,
			Link:        link,
			Url:         &preview.URL,
			Site:        &preview.Site,
			Title:       &preview.Title,
			Description: &preview.Description,
		})
		if err != nil {
			return err
		}
		if err := q.DeletePreviewImage(ctx, messageID); err != nil {
			return err
		}
		if len(preview.Image) == 0 {
			return nil
		}
		saved, err := q.SaveImage(ctx, database.SaveImageParams{
			MessageID:      messageID,
			ConversationID: message.ConversationID,
			Role:           "preview",
			Data:           preview.Image,
			Mime:           "image/jpeg",
			Width:          int32(preview.Width),
			Height:         int32(preview.Height),
		})
		if err != nil {
			return err
		}
		image = &Image{ID: saved.ID, Width: saved.Width, Height: saved.Height}
		return nil
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, nil, nil, ErrMessageNotFound
	}
	if err != nil {
		return database.Message{}, nil, nil, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, message.ConversationID)
	if err != nil {
		return database.Message{}, nil, nil, err
	}
	return message, image, recipients, nil
}

func (s *Service) RemovePreview(ctx context.Context, userID, messageID string) (database.Message, []string, error) {
	target, err := s.messageTarget(ctx, messageID)
	if err != nil {
		return database.Message{}, nil, err
	}
	if target.SenderID != userID || target.Kind != "text" {
		return database.Message{}, nil, ErrMessageForbidden
	}

	var message database.Message
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		var err error
		message, err = q.ClearPreview(ctx, messageID)
		if err != nil {
			return err
		}
		return q.DeletePreviewImage(ctx, messageID)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, nil, ErrMessageNotFound
	}
	if err != nil {
		return database.Message{}, nil, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, target.ConversationID)
	if err != nil {
		return database.Message{}, nil, err
	}
	return message, recipients, nil
}
