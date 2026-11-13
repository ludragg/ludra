package account

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"

	"ludra/internal/database"
)

type Purpose string

const (
	PurposeVerifyEmail   Purpose = "verify_email"
	PurposeResetPassword Purpose = "reset_password"
)

const (
	codeLifetime    = 15 * time.Minute
	codeCooldown    = time.Minute
	maxCodeAttempts = 5
)

func (s *Service) sendCode(ctx context.Context, user database.User, purpose Purpose) error {
	existing, err := s.queries.GetCode(ctx, database.GetCodeParams{UserID: user.ID, Purpose: string(purpose)})
	if err == nil && time.Since(existing.CreatedAt) < codeCooldown {
		return ErrCodeCooldown
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	code, err := newCode()
	if err != nil {
		return err
	}

	err = s.queries.SaveCode(ctx, database.SaveCodeParams{
		UserID:    user.ID,
		Purpose:   string(purpose),
		CodeHash:  hashCode(user.ID, code),
		ExpiresAt: time.Now().Add(codeLifetime),
	})
	if err != nil {
		return err
	}

	message := codeMessage(purpose, user.Username, code)
	return s.mailer.Send(ctx, user.Email, message.subject, message.body)
}

func (s *Service) checkCode(ctx context.Context, userID string, purpose Purpose, code string) error {
	key := database.GetCodeParams{UserID: userID, Purpose: string(purpose)}
	row, err := s.queries.GetCode(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidCode
	}
	if err != nil {
		return err
	}

	if time.Now().After(row.ExpiresAt) || row.Attempts >= maxCodeAttempts {
		return errors.Join(ErrInvalidCode, s.deleteCode(ctx, userID, purpose))
	}

	if subtle.ConstantTimeCompare(hashCode(userID, code), row.CodeHash) != 1 {
		attempt := database.CountCodeAttemptParams{UserID: userID, Purpose: string(purpose)}
		return errors.Join(ErrInvalidCode, s.queries.CountCodeAttempt(ctx, attempt))
	}

	return s.deleteCode(ctx, userID, purpose)
}

func (s *Service) deleteCode(ctx context.Context, userID string, purpose Purpose) error {
	return s.queries.DeleteCode(ctx, database.DeleteCodeParams{UserID: userID, Purpose: string(purpose)})
}

func newCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func hashCode(userID, code string) []byte {
	sum := sha256.Sum256([]byte(userID + ":" + code))
	return sum[:]
}
