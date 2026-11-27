package realtime

import (
	"context"
	"slices"

	"ludra/internal/chat"
	"ludra/internal/protocol"
)

const (
	maxTransferID = 64
	maxFileBytes  = 1 << 32
)

var fileSignalKinds = map[protocol.FileSignalKind]bool{
	protocol.FileSignalKind_FILE_SIGNAL_KIND_REQUEST:     true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_OFFER:       true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_ANSWER:      true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_CANCEL:      true,
	protocol.FileSignalKind_FILE_SIGNAL_KIND_UNAVAILABLE: true,
}

func (s *session) sendDirectFile(ctx context.Context, req *protocol.SendDirectFile) *protocol.ServerFrame {
	if len(req.Extra) >= chat.MaxMessageFiles {
		return errorFrame(protocol.ErrorCode_ERROR_CODE_INVALID_REQUEST, "too many files")
	}
	specs := []chat.FileSpec{{Name: req.Name, Mime: req.Mime, Size: req.Size, Censored: req.Censored}}
	for _, extra := range req.Extra {
		specs = append(specs, chat.FileSpec{Name: extra.Name, Mime: extra.Mime, Size: extra.Size, Censored: extra.Censored})
	}
	message, extras, recipients, err := s.chat.SendDirectFile(ctx, s.user.Id, req.ConversationId, specs, req.Content, req.ReplyToId)
	if err != nil {
		return failed(err)
	}

	result := named(toMessage(message), s.user.Username, nil)
	withExtraFiles(result, extras)
	frame := messageCreatedFrame(result)
	s.hub.publish(recipients, frame, s)
	return frame
}

func (s *session) fileSignal(ctx context.Context, req *protocol.FileSignal) *protocol.ServerFrame {
	if !fileSignalKinds[req.Kind] || req.TransferId == "" || len(req.TransferId) > maxTransferID || len(req.Payload) > maxSignalSize || req.Offset > maxFileBytes || req.Length > maxFileBytes || req.FileIndex >= chat.MaxMessageFiles {
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
		FileIndex:  req.FileIndex,
		Offset:     req.Offset,
		Length:     req.Length,
		Ranged:     req.Ranged,
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
