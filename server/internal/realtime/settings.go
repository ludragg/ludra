package realtime

import (
	"context"

	"ludra/internal/account"
	"ludra/internal/protocol"
)

func (s *session) verifyTwoFactor(ctx context.Context, req *protocol.VerifyTwoFactor) *protocol.ServerFrame {
	challenge := s.challenge
	if challenge == nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_CODE, "no pending sign in")
	}
	if !s.guard.allowCodeCheck(s.ip, challenge.Email) {
		return tooManyRequests()
	}

	reply := s.signIn(func() (account.Outcome, error) {
		return s.account.VerifyTwoFactor(ctx, challenge.UserID, req.Code)
	})
	if reply.GetLoggedIn() != nil {
		s.challenge = nil
	}
	return reply
}

func (s *session) resendTwoFactor(ctx context.Context, req *protocol.ResendTwoFactor) *protocol.ServerFrame {
	challenge := s.challenge
	if challenge == nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_CODE, "no pending sign in")
	}
	if !s.guard.allowCodeSend(s.ip, challenge.Email) {
		return tooManyRequests()
	}

	if err := s.account.ResendTwoFactor(ctx, challenge.UserID, req.Locale); err != nil {
		return failed(err)
	}
	return codeSentFrame()
}

func (s *session) changePassword(ctx context.Context, req *protocol.ChangePassword) *protocol.ServerFrame {
	if !s.guard.passwordChecks.Allow(s.user.Id) {
		return tooManyRequests()
	}
	if err := s.account.ChangePassword(ctx, s.user.Id, s.sessionID, req.CurrentPassword, req.NewPassword); err != nil {
		return failed(err)
	}

	s.hub.disconnect(s.user.Id, s)
	return passwordChangedFrame()
}

func (s *session) setTwoFactor(ctx context.Context, req *protocol.SetTwoFactor) *protocol.ServerFrame {
	if !s.guard.passwordChecks.Allow(s.user.Id) {
		return tooManyRequests()
	}
	if err := s.account.SetTwoFactor(ctx, s.user.Id, req.Enabled, req.Password); err != nil {
		return failed(err)
	}

	reply := twoFactorChangedFrame(req.Enabled)
	s.hub.publish([]string{s.user.Id}, reply, s)
	return reply
}

func (s *session) setIdentityKey(ctx context.Context, req *protocol.SetIdentityKey) *protocol.ServerFrame {
	if !s.guard.identityChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}
	if err := s.account.SetIdentityKey(ctx, s.user.Id, req.Key); err != nil {
		return failed(err)
	}
	return ackFrame()
}

func (s *session) listIdentityKeys(ctx context.Context, req *protocol.ListIdentityKeys) *protocol.ServerFrame {
	if !s.guard.identityLookups.Allow(s.user.Id) {
		return tooManyRequests()
	}
	keys, err := s.account.IdentityKeys(ctx, req.UserIds)
	if err != nil {
		return failed(err)
	}
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_IdentityKeys{IdentityKeys: &protocol.IdentityKeys{Keys: keys}},
	}
}

func (s *session) setAvatar(ctx context.Context, req *protocol.SetAvatar) *protocol.ServerFrame {
	if !s.guard.avatarChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}

	avatar, err := s.account.SetAvatar(ctx, s.user.Id, req.Image)
	if err != nil {
		return failed(err)
	}
	return s.updateAvatar(avatar)
}

func (s *session) removeAvatar(ctx context.Context) *protocol.ServerFrame {
	if !s.guard.avatarChanges.Allow(s.user.Id) {
		return tooManyRequests()
	}
	if err := s.account.RemoveAvatar(ctx, s.user.Id); err != nil {
		return failed(err)
	}
	return s.updateAvatar("")
}

func (s *session) updateAvatar(avatar string) *protocol.ServerFrame {
	s.user.Avatar = avatar
	reply := userUpdatedFrame(&protocol.User{Id: s.user.Id, Username: s.user.Username, Avatar: avatar})

	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()

	recipients, err := s.friends.IDs(ctx, s.user.Id)
	if err != nil {
		recipients = nil
	}
	s.hub.publish(append(recipients, s.user.Id), reply, s)
	return reply
}
