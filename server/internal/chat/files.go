package chat

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
	"ludra/internal/ids"
)

const (
	DailyGifs     = 10
	MaxDirectFile = 2 << 30
	maxFileName   = 200
)

var mimePattern = regexp.MustCompile(`^[a-zA-Z0-9.+-]{1,60}/[a-zA-Z0-9.+-]{1,60}$`)

type DirectFile struct {
	SenderID       string
	ConversationID string
}

func reserveGif(ctx context.Context, q *database.Queries, userID string) error {
	if err := q.LockUploads(ctx, userID); err != nil {
		return err
	}
	sent, err := q.CountRecentPhotos(ctx, userID)
	if err != nil {
		return err
	}
	if sent >= DailyGifs {
		return ErrGifLimit
	}
	return nil
}

func (s *Service) SendDirectFile(ctx context.Context, senderID, conversationID, name, mime string, size uint64) (database.Message, []string, error) {
	if size == 0 || size > MaxDirectFile {
		return database.Message{}, nil, ErrInvalidFile
	}
	if !ids.Valid(conversationID) {
		return database.Message{}, nil, ErrConversationNotFound
	}
	if err := s.canSend(ctx, senderID, conversationID); err != nil {
		return database.Message{}, nil, err
	}
	if !mimePattern.MatchString(mime) {
		mime = "application/octet-stream"
	}

	message, err := s.queries.CreateFileMessage(ctx, database.CreateFileMessageParams{
		ConversationID: conversationID,
		SenderID:       senderID,
		FileName:       cleanName(name),
		FileSize:       int64(size),
		FileMime:       mime,
		FileDirect:     true,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, nil, ErrConversationNotFound
	}
	if err != nil {
		return database.Message{}, nil, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, conversationID)
	if err != nil {
		return database.Message{}, nil, err
	}
	return message, recipients, nil
}

func (s *Service) DirectFile(ctx context.Context, userID, messageID string) (DirectFile, error) {
	if !ids.Valid(messageID) {
		return DirectFile{}, ErrMessageNotFound
	}
	row, err := s.queries.GetDirectFile(ctx, database.GetDirectFileParams{UserID: userID, ID: messageID})
	if errors.Is(err, pgx.ErrNoRows) {
		return DirectFile{}, ErrMessageNotFound
	}
	if err != nil {
		return DirectFile{}, err
	}
	return DirectFile(row), nil
}

func (s *Service) ExpireFiles(ctx context.Context) (int64, error) {
	return s.queries.ExpireImages(ctx)
}

func cleanName(name string) string {
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || strings.ContainsRune(`\/:*?"<>|`, r) {
			return -1
		}
		return r
	}, name)
	name = strings.Trim(strings.TrimSpace(name), ".")
	if utf8.RuneCountInString(name) > maxFileName {
		runes := []rune(name)
		name = string(runes[len(runes)-maxFileName:])
	}
	if name == "" {
		return "arquivo"
	}
	return name
}
