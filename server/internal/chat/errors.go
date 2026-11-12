package chat

type Kind int

const (
	Invalid Kind = iota + 1
	NotFound
)

type Error struct {
	Kind    Kind
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

var (
	ErrInvalidUsername      = &Error{Invalid, "username must be 3 to 32 characters: letters, numbers, _ or ."}
	ErrSelfConversation     = &Error{Invalid, "cannot start a conversation with yourself"}
	ErrEmptyMessage         = &Error{Invalid, "message cannot be empty"}
	ErrMessageTooLong       = &Error{Invalid, "message cannot exceed 4000 characters"}
	ErrInvalidCursor        = &Error{Invalid, "invalid cursor"}
	ErrUserNotFound         = &Error{NotFound, "user not found"}
	ErrConversationNotFound = &Error{NotFound, "conversation not found"}
)
