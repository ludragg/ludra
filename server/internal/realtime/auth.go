package realtime

import (
	"context"

	"ludra/internal/account"
	"ludra/internal/protocol"
)

var purposes = map[protocol.CodePurpose]account.Purpose{
	protocol.CodePurpose_CODE_PURPOSE_VERIFY_EMAIL:   account.PurposeVerifyEmail,
	protocol.CodePurpose_CODE_PURPOSE_RESET_PASSWORD: account.PurposeResetPassword,
}

func (s *session) signIn(start func() (account.Outcome, error)) *protocol.ServerFrame {
	if s.user != nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "already logged in")
	}

	outcome, err := start()
	if err != nil {
		return failed(err)
	}
	if outcome.PendingEmail != "" {
		return verificationRequiredFrame(outcome.PendingEmail)
	}

	session := outcome.Session
	presence := protocol.Presence_PRESENCE_ONLINE
	if session.Invisible {
		presence = protocol.Presence_PRESENCE_INVISIBLE
	}

	s.sessionID = session.ID
	s.user = &protocol.User{Id: session.UserID, Username: session.Username, Presence: presence}
	if s.hub.register(s.user.Id, s, session.Invisible) {
		s.announce(protocol.Presence_PRESENCE_ONLINE)
	}
	return loggedInFrame(s.user, session.Token)
}

func (s *session) sendCode(ctx context.Context, req *protocol.SendCode) *protocol.ServerFrame {
	purpose, ok := purposes[req.Purpose]
	if !ok {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "invalid purpose")
	}
	if err := s.account.SendCode(ctx, req.Email, purpose); err != nil {
		return failed(err)
	}
	return codeSentFrame()
}

func (s *session) logout(ctx context.Context) *protocol.ServerFrame {
	if err := s.account.Logout(ctx, s.sessionID); err != nil {
		return failed(err)
	}
	s.signOut()
	return loggedOutFrame()
}

func (s *session) signOut() {
	if s.user == nil {
		return
	}
	if s.hub.unregister(s.user.Id, s) {
		s.announce(protocol.Presence_PRESENCE_OFFLINE)
	}
	s.user = nil
	s.sessionID = ""
}
