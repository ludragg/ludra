package realtime

import (
	"context"
	"slices"

	"ludra/internal/protocol"
)

const maxTransferID = 64

var fileSignalKinds = map[protocol.FileSignalKind]bool{
	protocol.FileSignalKind_FILE_SIGNAL_KIND_REQUEST:     true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_OFFER:       true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_ANSWER:      true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_CANCEL:      true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_UNAVAILABLE: true,
}

func (s *session) sendDirectFile(ctx context.Context, req *protocol.SendDirectFile) *protocol.ServerFrame {
	message, recipients, err := s.chat.SendDirectFile(ctx, s.user.Id, req.ConversationId, req.Name, req.Mime, req.Size)
	if err != nil {
		return failed(err)
	}

	frame := messageCreatedFrame(named(toMessage(message), s.user.Username, nil))
	s.hub.publish(recipients, frame, s)
	return frame
}

func (s *session) fileSignal(ctx context.Context, req *protocol.FileSignal) *protocol.ServerFrame {
	if !fileSignalKinds[req.Kind] || req.TransferId == "" || len(req.TransferId) > maxTransferID || len(req.Payload) > maxSignalSize {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "invalid signal")
	}

	file, err := s.chat.DirectFile(ctx, s.user.Id, req.MessageId)
	if err != nil {
		return failed(err)
	}

	target := req.PeerId
	if req.Kind == protocol.FileSignalKind_FILE_SIGNAL_KIND_REQUEST {
		target = file.SenderID
	}
	if target == s.user.Id || (s.user.Id != file.SenderID && target != file.SenderID) {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "invalid peer")
	}
	members, err := s.chat.ParticipantIDs(ctx, file.ConversationID)
	if err != nil {
		return failed(err)
	}
	if !slices.Contains(members, target) {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_NOT_FOUND, "peer not found")
	}
	if _, err := s.friends.Get(ctx, s.user.Id, target); err != nil {
		return failed(err)
	}
	if !s.hub.connected(target) {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_UNAVAILABLE, "peer offline")
	}

	forwarded := &protocol.FileSignal{
		MessageId:  req.MessageId,
		TransferId: req.TransferId,
		PeerId:     s.user.Id,
		Kind:       req.Kind,
		Payload:    req.Payload,
		Direct:     req.Direct,
	}
	if req.Kind != protocol.FileSignalKind_FILE_SIGNAL_KIND_REQUEST {
		s.hub.publish([]string{target}, fileSignalFrame(forwarded), s)
		return ackFrame()
	}

	senderIce, err := s.iceServers(target)
	if err != nil {
		return failed(err)
	}
	ownIce, err := s.iceServers(s.user.Id)
	if err != nil {
		return failed(err)
	}
	forwarded.IceServers = senderIce
	s.hub.publish([]string{target}, fileSignalFrame(forwarded), s)
	return &protocol.ServerFrame{
		Payload: &protocol.ServerFrame_FileTransfer{FileTransfer: &protocol.FileTransfer{IceServers: ownIce}},
	}
}

func fileSignalFrame(signal *protocol.FileSignal) *protocol.ServerFrame {
	return &protocol.ServerFrame{Payload: &protocol.ServerFrame_FileSignal{FileSignal: signal}}
}
