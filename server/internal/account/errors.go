package account

import "ludra/internal/failure"

var (
	ErrInvalidEmail       = failure.New(failure.Invalid, "invalid email")
	ErrInvalidUsername    = failure.New(failure.Invalid, "username must be 3 to 32 characters: letters, numbers, _ or .")
	ErrInvalidPassword    = failure.New(failure.Invalid, "password must be 8 to 128 characters with letters and numbers, without spaces or uncommon symbols")
	ErrEmailTaken         = failure.New(failure.Conflict, "email already in use")
	ErrUsernameTaken      = failure.New(failure.Conflict, "username already in use")
	ErrInvalidCredentials = failure.New(failure.Denied, "invalid login or password")
	ErrSessionExpired     = failure.New(failure.Unauthorized, "session expired")
	ErrInvalidCode        = failure.New(failure.InvalidCode, "invalid or expired code")
	ErrCodeCooldown       = failure.New(failure.TooManyRequests, "wait before requesting a new code")
	ErrWrongPassword      = failure.New(failure.Denied, "wrong password")
	ErrSamePassword       = failure.New(failure.Invalid, "new password must be different")
	ErrInvalidAvatar      = failure.New(failure.Invalid, "invalid avatar")
	ErrInvalidIdentityKey = failure.New(failure.Invalid, "invalid identity key")
	ErrAvatarNotFound     = failure.New(failure.NotFound, "avatar not found")
)
