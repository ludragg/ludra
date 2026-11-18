package realtime

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"strings"

	"ludra/internal/friends"
	"ludra/internal/protocol"
)

const (
	maxSignalSize    = 16 << 10
	largeStateSize   = 1 << 10
	maxPreviewLength = 14_000
	previewPrefix    = "data:image/jpeg;base64,"
)

var signalKinds = map[protocol.SignalKind]bool{
	protocol.SignalKind_SIGNAL_KIND_OFFER:     true,
	protocol.SignalKind_SIGNAL_KIND_ANSWER:    true,
	protocol.SignalKind_SIGNAL_KIND_CANDIDATE: true,
	protocol.SignalKind_SIGNAL_KIND_STATE:     true,
}

func (s *session) startCall(ctx context.Context, req *protocol.StartCall) *protocol.ServerFrame {
	if !s.guard.callCooldown.Allow(s.user.Id) || !s.guard.callStarts.Allow(s.user.Id) {
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

	s.displace()
	s.voice.Lock()
	if s.rooms.busy(s.user.Id) {
		s.voice.Unlock()
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAVAILABLE, "busy")
	}
	ringing, ok := s.calls.start(s, friend.ID, s.rooms.busy(friend.ID), req.Direct)
	s.voice.Unlock()
	if !ok {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAVAILABLE, "busy")
	}

	if _, err := s.friends.Get(ctx, s.user.Id, friend.ID); err != nil {
		s.calls.end(ringing.id, s, protocol.CallEndReason_CALL_END_REASON_HUNG_UP)
		return failed(err)
	}

	s.logCall(ctx, ringing.id, friend.ID)
	if !ringing.silent {
		me := &protocol.User{Id: s.user.Id, Username: s.user.Username, Avatar: s.user.Avatar}
		incoming := callIncomingFrame(&protocol.Call{Id: ringing.id, Peer: me, IceServers: calleeIce, Direct: req.Direct})
		s.calls.setIncoming(ringing.id, incoming)
		s.hub.publish([]string{friend.ID}, incoming, nil)
	}

	peer := s.friend(friends.Friend{ID: friend.ID, Username: friend.Username, Avatar: friend.Avatar, State: friends.Accepted}).User
	return callStartedFrame(&protocol.Call{Id: ringing.id, Peer: peer, IceServers: callerIce})
}

func (s *session) answerCall(req *protocol.AnswerCall) *protocol.ServerFrame {
	if !s.calls.ringingFor(req.CallId, s.user.Id) {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "call not found")
	}
	s.displace()
	s.voice.Lock()
	if s.rooms.busy(s.user.Id) {
		s.voice.Unlock()
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAVAILABLE, "busy")
	}
	answered, ok := s.calls.answer(req.CallId, s)
	s.voice.Unlock()
	if !ok {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "call not found")
	}

	answered.caller.reply(callAcceptedFrame(answered.id, req.Direct))
	s.hub.publish(
		[]string{s.user.Id},
		callEndedFrame(answered.id, protocol.CallEndReason_CALL_END_REASON_ANSWERED_ELSEWHERE),
		s,
	)
	return callAcceptedFrame(answered.id, answered.direct)
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
	if req.Kind == protocol.SignalKind_SIGNAL_KIND_STATE && len(req.Payload) > largeStateSize &&
		!s.guard.largeSignals.Allow(s.user.Id) {
		return tooManyRequests()
	}

	forwarded := callSignalFrame(&protocol.CallSignal{CallId: req.CallId, Kind: req.Kind, Payload: req.Payload, PeerId: s.user.Id})

	if req.PeerId == "" {
		other := s.calls.peer(req.CallId, s)
		if other == nil {
			return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "call not found")
		}
		other.offer(forwarded)
		return ackFrame()
	}

	if req.PeerId == "*" && req.Kind == protocol.SignalKind_SIGNAL_KIND_STATE {
		for _, other := range s.rooms.others(req.CallId, s) {
			other.offer(forwarded)
		}
		var state struct {
			Muted    *bool   `json:"muted"`
			Deafened bool    `json:"deafened"`
			Sharing  bool    `json:"sharing"`
			Direct   *bool   `json:"direct"`
			Preview  *string `json:"preview"`
			Camera   string  `json:"camera"`
		}
		if json.Unmarshal([]byte(req.Payload), &state) != nil {
			return ackFrame()
		}
		if state.Preview != nil && validPreview(*state.Preview) {
			s.sharePreview(req.CallId, *state.Preview)
		}
		if state.Muted != nil {
			voice := voiceState{muted: *state.Muted, deafened: state.Deafened, sharing: state.Sharing, camera: state.Camera != ""}
			conversationID, changed := s.rooms.setVoice(req.CallId, s, voice, state.Direct)
			if changed && s.guard.voiceChanges.Allow(s.user.Id) {
				s.announceRoom(conversationID)
			}
		}
		return ackFrame()
	}

	other := s.rooms.peer(req.CallId, s, req.PeerId)
	if other == nil {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "call not found")
	}
	other.offer(forwarded)
	return ackFrame()
}

func validPreview(image string) bool {
	if len(image) > maxPreviewLength || !strings.HasPrefix(image, previewPrefix) {
		return false
	}
	_, err := base64.StdEncoding.DecodeString(image[len(previewPrefix):])
	return err == nil
}

func (s *session) displace() {
	s.calls.displace(s.user.Id)

	holder, conversationID := s.rooms.holder(s.user.Id)
	if holder == nil {
		return
	}
	if _, found := s.rooms.leave(holder); !found {
		return
	}
	if holder != s {
		holder.reply(groupCallUpdatedFrame(conversationID, nil))
	}
	s.announceRoom(conversationID)
}

func (s *session) logCall(ctx context.Context, callID, calleeID string) {
	message, err := s.chat.StartCallMessage(ctx, s.user.Id, calleeID)
	if err != nil {
		slog.Error("start call message", "error", err)
		return
	}

	s.hub.publish([]string{s.user.Id, calleeID}, messageCreatedFrame(named(toMessage(message), s.user.Username, nil)), nil)
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
