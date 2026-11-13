package failure

type Kind int

const (
	Invalid Kind = iota + 1
	NotFound
	Conflict
	Denied
	Unauthorized
	InvalidCode
	TooManyRequests
	Forbidden
)

type Error struct {
	Kind    Kind
	Message string
}

func New(kind Kind, message string) *Error {
	return &Error{Kind: kind, Message: message}
}

func (e *Error) Error() string {
	return e.Message
}
