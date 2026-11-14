package friends

import "ludra/internal/failure"

var (
	ErrUserNotFound     = failure.New(failure.NotFound, "user not found")
	ErrRequestNotFound  = failure.New(failure.NotFound, "friend request not found")
	ErrSelfRequest      = failure.New(failure.Invalid, "cannot add yourself")
	ErrAlreadyFriends   = failure.New(failure.Conflict, "already friends")
	ErrAlreadyRequested = failure.New(failure.Conflict, "friend request already sent")
	ErrNotFriends       = failure.New(failure.Forbidden, "not friends")
)
