package realtime

import (
	"context"
	"log/slog"

	"ludra/internal/friends"
	"ludra/internal/protocol"
)

const maxSignalSize = 16 << 10

var signalKinds = map[protocol.SignalKind]bool{
	protocol.SignalKind_SIGNAL_KIND_OFFER:     true,
	protocol.SignalKind_SIGNAL_KIND_ANSWER:    true,
	protocol.SignalKind_SIGNAL_KIND_CANDIDATE: true,
	protocol.SignalKind_SIGNAL_KIND_STATE:     true,
}

func (s *session) startCall(ctx context.Context, req *protocol.StartCall) *protocol.ServerFrame {
	if !s.guard.callStarts.Allow(s.user.Id) {
		return tooManyRequests()
	}

	friend, err := s.friends.Get(ctx, s.user.Id, req.UserId)
	if err != nil {
		return failed(err)
	}
	callerIce, err := s.iceServers(s.user.Id)
	if err != nil {
		return failed(err)
	}
	calleeIce, err := s.iceServers(friend.ID)
	if err != nil {
		return failed(err)
	}

	ringing, ok := s.calls.start(s, friend.ID)
	if !ok {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAVAILABLE, "busy")
	}

	me := &protocol.User{Id: s.user.Id, Username: s.user.Username, Avatar: s.user.Avatar}
	incoming := callIncomingFrame(&protocol.Call{Id: ringing.id, Peer: me, IceServers: calleeIce})
	s.calls.setIncoming(ringing.id, incoming)
	s.hub.publish([]string{friend.ID}, incoming, nil)
	s.logCall(ctx, ringing.id, friend.ID)

	peer := s.friend(friends.Friend{ID: friend.ID, Username: friend.Username, Avatar: friend.Avatar, State: friends.Accepted}).User
	return callStartedFrame(&protocol.Call{Id: ringing.id, Peer: peer, IceServers: callerIce})
}

func (s *session) answerCall(req *protocol.AnswerCall) *protocol.ServerFrame {
	answered, ok := s.calls.answer(req.CallId, s)
	if !ok {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "call not found")
	}

	answered.caller.reply(callAcceptedFrame(answered.id))
	s.hub.publish(
		[]string{s.user.Id},
		callEndedFrame(answered.id, protocol.CallEndReason_CALL_END_REASON_ANSWERED_ELSEWHERE),
		s,
	)
	return callAcceptedFrame(answered.id)
}

func (s *session) endCall(req *protocol.EndCall) *protocol.ServerFrame {
	reason := protocol.CallEndReason_CALL_END_REASON_HUNG_UP
	if s.calls.peer(req.CallId, s) == nil && s.calls.ringingFor(req.CallId, s.user.Id) {
		reason = protocol.CallEndReason_CALL_END_REASON_DECLINED
	}

	if !s.calls.end(req.CallId, s, reason) {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "call not found")
	}
	return callEndedFrame(req.CallId, reason)
}

func (s *session) relaySignal(req *protocol.CallSignal) *protocol.ServerFrame {
	if !s.guard.signals.Allow(s.user.Id) {
		return tooManyRequests()
	}
	if !signalKinds[req.Kind] || len(req.Payload) > maxSignalSize {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "invalid signal")
	}

	other := s.calls.peer(req.CallId, s)
	if other == nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "call not found")
	}

	other.reply(callSignalFrame(&protocol.CallSignal{CallId: req.CallId, Kind: req.Kind, Payload: req.Payload}))
	return ackFrame()
}

func (s *session) logCall(ctx context.Context, callID, calleeID string) {
	message, err := s.chat.StartCallMessage(ctx, s.user.Id, calleeID)
	if err != nil {
		slog.Error("start call message", "error", err)
		return
	}

	s.hub.publish([]string{s.user.Id, calleeID}, messageCreatedFrame(toMessage(message)), nil)
	if !s.calls.attachMessage(callID, message.ID) {
		go s.calls.finish(s.user.Id, calleeID, message.ID, "missed", 0)
	}
}

func (s *session) iceServers(userID string) ([]*protocol.IceServer, error) {
	server, err := s.relay.Credentials(userID)
	if err != nil {
		return nil, err
	}
	return []*protocol.IceServer{{Urls: server.URLs, Username: server.Username, Credential: server.Credential}}, nil
}
