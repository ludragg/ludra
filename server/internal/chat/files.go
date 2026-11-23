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

type FileSpec struct {
	Name string
	Mime string
	Size uint64
}

const MaxMessageFiles = 5

func (s *Service) SendDirectFile(ctx context.Context, senderID, conversationID string, specs []FileSpec, content, replyToID string) (database.Message, []database.MessageFile, []string, error) {
	if len(specs) == 0 || len(specs) > MaxMessageFiles {
		return database.Message{}, nil, nil, ErrInvalidFile
	}
	for _, spec := range specs {
		if spec.Size == 0 || spec.Size > MaxDirectFile {
			return database.Message{}, nil, nil, ErrInvalidFile
		}
	}
	content = strings.TrimFunc(content, invisible)
	if utf8.RuneCountInString(content) > maxMessageLength {
		return database.Message{}, nil, nil, ErrMessageTooLong
	}
	if !ids.Valid(conversationID) {
		return database.Message{}, nil, nil, ErrConversationNotFound
	}
	if err := s.canSend(ctx, senderID, conversationID); err != nil {
		return database.Message{}, nil, nil, err
	}
	for i := range specs {
		if !mimePattern.MatchString(specs[i].Mime) {
			specs[i].Mime = "application/octet-stream"
		}
	}

	var message database.Message
	extras := make([]database.MessageFile, 0, len(specs)-1)
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		var err error
		message, err = q.CreateFileMessage(ctx, database.CreateFileMessageParams{
			ConversationID: conversationID,
			SenderID:       senderID,
			Content:        content,
			FileName:       cleanName(specs[0].Name),
			FileSize:       int64(specs[0].Size),
			FileMime:       specs[0].Mime,
			FileDirect:     true,
		})
		if err != nil {
			return err
		}
		for i, spec := range specs[1:] {
			extra, err := q.AddMessageFile(ctx, database.AddMessageFileParams{
				MessageID: message.ID,
				Position:  int16(i + 1),
				Name:      cleanName(spec.Name),
				Size:      int64(spec.Size),
				Mime:      spec.Mime,
			})
			if err != nil {
				return err
			}
			extras = append(extras, extra)
		}
		return nil
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return database.Message{}, nil, nil, ErrConversationNotFound
	}
	if err != nil {
		return database.Message{}, nil, nil, err
	}

	recipients, err := s.queries.ListParticipantIDs(ctx, conversationID)
	if err != nil {
		return database.Message{}, nil, nil, err
	}
	return s.attachReply(ctx, message, replyToID), extras, recipients, nil
}

func (s *Service) ExtraFiles(ctx context.Context, rows []database.ListMessagesRow) (map[string][]database.MessageFile, error) {
	var ids []string
	for _, row := range rows {
		if row.Message.Kind == "file" {
			ids = append(ids, row.Message.ID)
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	list, err := s.queries.ListMessageFiles(ctx, ids)
	if err != nil {
		return nil, err
	}
	result := make(map[string][]database.MessageFile)
	for _, extra := range list {
		result[extra.MessageID] = append(result[extra.MessageID], extra)
	}
	return result, nil
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
