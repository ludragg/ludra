package account

import (
	"context"
	"errors"
	"strings"

	"ludra/internal/database"
)

type Challenge struct {
	UserID string
	Email  string
}

func (c Challenge) Hint() string {
	at := strings.LastIndex(c.Email, "@")
	if at < 0 {
		return ""
	}

	local := []rune(c.Email[:at])
	visible := min(2, max(len(local)-1, 1))
	return string(local[:visible]) + "•••" + c.Email[at:]
}

func (s *Service) VerifyTwoFactor(ctx context.Context, userID, code string) (Outcome, error) {
	user, err := s.queries.GetUser(ctx, userID)
	if err != nil {
		return Outcome{}, err
	}
	if err := s.checkCode(ctx, user.ID, PurposeTwoFactor, code); err != nil {
		return Outcome{}, err
	}
	return s.startSession(ctx, user)
}

func (s *Service) ResendTwoFactor(ctx context.Context, userID, locale string) error {
	user, err := s.queries.GetUser(ctx, userID)
	if err != nil {
		return err
	}
	if err := s.sendCode(ctx, user, PurposeTwoFactor, locale); err != nil && !errors.Is(err, ErrCodeCooldown) {
		return err
	}
	return nil
}

func (s *Service) ChangePassword(ctx context.Context, userID, sessionID, current, next string) error {
	if !validPassword(next) {
		return ErrInvalidPassword
	}
	if err := s.confirmPassword(ctx, userID, current); err != nil {
		return err
	}

	passwordHash, err := hashPassword(next)
	if err != nil {
		return err
	}
	if err := s.queries.UpdatePassword(ctx, database.UpdatePasswordParams{ID: userID, PasswordHash: passwordHash}); err != nil {
		return err
	}
	return s.queries.DeleteOtherSessions(ctx, database.DeleteOtherSessionsParams{UserID: userID, ID: sessionID})
}

func (s *Service) SetTwoFactor(ctx context.Context, userID string, enabled bool, password string) error {
	if !enabled {
		if err := s.confirmPassword(ctx, userID, password); err != nil {
			return err
		}
	}
	return s.queries.SetTwoFactor(ctx, database.SetTwoFactorParams{ID: userID, TwoFactor: enabled})
}

func (s *Service) confirmPassword(ctx context.Context, userID, password string) error {
	user, err := s.queries.GetUser(ctx, userID)
	if err != nil {
		return err
	}

	ok, err := verifyPassword(password, user.PasswordHash)
	if err != nil {
		return err
	}
	if !ok {
		return ErrWrongPassword
	}
	return nil
}
