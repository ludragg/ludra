package chat

import "ludra/internal/failure"

var (
	ErrSelfConversation     = failure.New(failure.Invalid, "cannot start a conversation with yourself")
	ErrEmptyMessage         = failure.New(failure.Invalid, "message cannot be empty")
	ErrMessageTooLong       = failure.New(failure.Invalid, "message cannot exceed 4000 characters")
	ErrInvalidCursor        = failure.New(failure.Invalid, "invalid cursor")
	ErrUserNotFound         = failure.New(failure.NotFound, "user not found")
	ErrConversationNotFound = failure.New(failure.NotFound, "conversation not found")
	ErrNotFriends           = failure.New(failure.Forbidden, "not friends")
)
