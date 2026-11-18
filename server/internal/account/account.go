package account

import (
	"context"
	"errors"
	"log/slog"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"ludra/internal/database"
	mailer "ludra/internal/mail"
)

const (
	sessionLifetime    = 90 * 24 * time.Hour
	unverifiedLifetime = 24 * time.Hour
	minPasswordLength  = 8
	maxPasswordLength  = 128
	maxEmailLength     = 254
)

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_.]{3,32}$`)

type Session struct {
	ID        string
	Token     string
	UserID    string
	Username  string
	Email     string
	Avatar    string
	Invisible bool
	Busy      bool
	TwoFactor bool
	Renamed   *time.Time
}

type Outcome struct {
	Session      Session
	PendingEmail string
	Challenge    *Challenge
}

type Service struct {
	queries   *database.Queries
	mailer    mailer.Sender
	dummyHash string
}

func NewService(queries *database.Queries, sender mailer.Sender) (*Service, error) {
	dummyHash, err := hashPassword("ludra")
	if err != nil {
		return nil, err
	}
	return &Service{queries: queries, mailer: sender, dummyHash: dummyHash}, nil
}

func (s *Service) Register(ctx context.Context, email, username, password, locale string) (Outcome, error) {
	email = strings.TrimSpace(email)
	username = strings.TrimSpace(username)

	if !validEmail(email) {
		return Outcome{}, ErrInvalidEmail
	}
	if !usernamePattern.MatchString(username) {
		return Outcome{}, ErrInvalidUsername
	}
	if !validPassword(password) {
		return Outcome{}, ErrInvalidPassword
	}

	passwordHash, err := hashPassword(password)
	if err != nil {
		return Outcome{}, err
	}

	user, err := s.queries.CreateUser(ctx, database.CreateUserParams{
		Username:     username,
		Email:        email,
		PasswordHash: passwordHash,
	})
	if err != nil {
		return Outcome{}, uniqueViolation(err)
	}

	if err := s.sendCode(ctx, user, PurposeVerifyEmail, locale); err != nil {
		slog.Error("send verification code", "error", err)
	}
	return Outcome{PendingEmail: user.Email}, nil
}

func (s *Service) Login(ctx context.Context, login, password, locale string) (Outcome, error) {
	user, err := s.queries.GetUserByLogin(ctx, strings.TrimSpace(login))
	if errors.Is(err, pgx.ErrNoRows) {
		verifyPassword(password, s.dummyHash)
		return Outcome{}, ErrInvalidCredentials
	}
	if err != nil {
		return Outcome{}, err
	}

	ok, err := verifyPassword(password, user.PasswordHash)
	if err != nil {
		return Outcome{}, err
	}
	if !ok {
		return Outcome{}, ErrInvalidCredentials
	}

	if user.EmailVerifiedAt == nil {
		err := s.sendCode(ctx, user, PurposeVerifyEmail, locale)
		if err != nil && !errors.Is(err, ErrCodeCooldown) {
			return Outcome{}, err
		}
		return Outcome{PendingEmail: user.Email}, nil
	}

	if user.TwoFactor {
		err := s.sendCode(ctx, user, PurposeTwoFactor, locale)
		if err != nil && !errors.Is(err, ErrCodeCooldown) {
			return Outcome{}, err
		}
		return Outcome{Challenge: &Challenge{UserID: user.ID, Email: user.Email}}, nil
	}

	return s.startSession(ctx, user)
}

func (s *Service) VerifyEmail(ctx context.Context, email, code string) (Outcome, error) {
	user, err := s.userByEmail(ctx, email)
	if err != nil {
		return Outcome{}, err
	}
	if user.EmailVerifiedAt != nil {
		return Outcome{}, ErrInvalidCode
	}

	if err := s.checkCode(ctx, user.ID, PurposeVerifyEmail, code); err != nil {
		return Outcome{}, err
	}
	if err := s.queries.MarkEmailVerified(ctx, user.ID); err != nil {
		return Outcome{}, err
	}

	return s.startSession(ctx, user)
}

func (s *Service) SendCode(ctx context.Context, email string, purpose Purpose, locale string) error {
	user, err := s.userByEmail(ctx, email)
	if errors.Is(err, ErrInvalidCode) {
		return nil
	}
	if err != nil {
		return err
	}
	if purpose == PurposeVerifyEmail && user.EmailVerifiedAt != nil {
		return nil
	}

	if err := s.sendCode(ctx, user, purpose, locale); err != nil && !errors.Is(err, ErrCodeCooldown) {
		return err
	}
	return nil
}

func (s *Service) Cleanup(ctx context.Context) error {
	return errors.Join(
		s.queries.DeleteUnverifiedUsers(ctx, time.Now().Add(-unverifiedLifetime)),
		s.queries.DeleteExpiredSessions(ctx),
		s.queries.DeleteExpiredCodes(ctx),
	)
}

func (s *Service) ResetPassword(ctx context.Context, email, code, password string) (Outcome, error) {
	if !validPassword(password) {
		return Outcome{}, ErrInvalidPassword
	}

	user, err := s.userByEmail(ctx, email)
	if err != nil {
		return Outcome{}, err
	}
	if err := s.checkCode(ctx, user.ID, PurposeResetPassword, code); err != nil {
		return Outcome{}, err
	}

	passwordHash, err := hashPassword(password)
	if err != nil {
		return Outcome{}, err
	}
	if err := s.queries.UpdatePassword(ctx, database.UpdatePasswordParams{ID: user.ID, PasswordHash: passwordHash}); err != nil {
		return Outcome{}, err
	}
	if err := s.queries.DeleteUserSessions(ctx, user.ID); err != nil {
		return Outcome{}, err
	}
	if err := s.queries.MarkEmailVerified(ctx, user.ID); err != nil {
		return Outcome{}, err
	}

	return s.startSession(ctx, user)
}

func (s *Service) Resume(ctx context.Context, token string) (Outcome, error) {
	row, err := s.queries.GetSession(ctx, hashToken(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return Outcome{}, ErrSessionExpired
	}
	if err != nil {
		return Outcome{}, err
	}

	err = s.queries.ExtendSession(ctx, database.ExtendSessionParams{
		ID:        row.SessionID,
		ExpiresAt: time.Now().Add(sessionLifetime),
	})
	if err != nil {
		return Outcome{}, err
	}

	return Outcome{Session: Session{
		ID:        row.SessionID,
		Token:     token,
		UserID:    row.ID,
		Username:  row.Username,
		Email:     row.Email,
		Avatar:    row.Avatar,
		Invisible: row.Invisible,
		Busy:      row.Busy,
		TwoFactor: row.TwoFactor,
		Renamed:   row.UsernameChangedAt,
	}}, nil
}

func (s *Service) Logout(ctx context.Context, sessionID string) error {
	return s.queries.DeleteSession(ctx, sessionID)
}

func (s *Service) SetStatus(ctx context.Context, userID string, invisible, busy bool) error {
	return s.queries.SetStatus(ctx, database.SetStatusParams{ID: userID, Invisible: invisible, Busy: busy})
}

func (s *Service) userByEmail(ctx context.Context, email string) (database.User, error) {
	user, err := s.queries.GetUserByEmail(ctx, strings.TrimSpace(email))
	if errors.Is(err, pgx.ErrNoRows) {
		return database.User{}, ErrInvalidCode
	}
	return user, err
}

func (s *Service) startSession(ctx context.Context, user database.User) (Outcome, error) {
	token, tokenHash, err := newToken()
	if err != nil {
		return Outcome{}, err
	}

	id, err := s.queries.CreateSession(ctx, database.CreateSessionParams{
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(sessionLifetime),
	})
	if err != nil {
		return Outcome{}, err
	}

	return Outcome{Session: Session{
		ID:        id,
		Token:     token,
		UserID:    user.ID,
		Username:  user.Username,
		Email:     user.Email,
		Avatar:    user.Avatar,
		Invisible: user.Invisible,
		Busy:      user.Busy,
		TwoFactor: user.TwoFactor,
		Renamed:   user.UsernameChangedAt,
	}}, nil
}

func validEmail(email string) bool {
	if len(email) > maxEmailLength {
		return false
	}
	address, err := mail.ParseAddress(email)
	return err == nil && address.Address == email
}

func validPassword(password string) bool {
	length := utf8.RuneCountInString(password)
	if length < minPasswordLength || length > maxPasswordLength {
		return false
	}
	for _, r := range password {
		if r < '!' || r > '~' {
			return false
		}
	}
	return strings.ContainsFunc(password, isLetter) && strings.ContainsFunc(password, unicode.IsDigit)
}

func isLetter(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

func uniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return err
	}

	switch pgErr.ConstraintName {
	case "users_email_key":
		return ErrEmailTaken
	case "users_username_key":
		return ErrUsernameTaken
	default:
		return err
	}
}
