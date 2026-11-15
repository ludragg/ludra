package realtime

import (
	"log/slog"
	"sync"

	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"

	"ludra/internal/protocol"
)

type hub struct {
	mu        sync.RWMutex
	sessions  map[string]map[*session]struct{}
	invisible map[string]bool
	busy      map[string]bool
}

func newHub() *hub {
	return &hub{
		sessions:  make(map[string]map[*session]struct{}),
		invisible: make(map[string]bool),
		busy:      make(map[string]bool),
	}
}

func (h *hub) register(userID string, s *session, invisible, busy bool) (appeared bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	before := h.visible(userID)
	if h.sessions[userID] == nil {
		h.sessions[userID] = make(map[*session]struct{})
	}
	h.sessions[userID][s] = struct{}{}
	h.invisible[userID] = invisible
	h.busy[userID] = busy
	return !before && h.visible(userID)
}

func (h *hub) unregister(userID string, s *session) (vanished bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	before := h.visible(userID)
	delete(h.sessions[userID], s)
	if len(h.sessions[userID]) == 0 {
		delete(h.sessions, userID)
		delete(h.invisible, userID)
		delete(h.busy, userID)
	}
	return before && !h.visible(userID)
}

func (h *hub) setStatus(userID string, invisible, busy bool) (changed bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	before := h.status(userID)
	h.invisible[userID] = invisible
	h.busy[userID] = busy
	return before != h.status(userID)
}

func (h *hub) status(userID string) protocol.Presence {
	switch {
	case !h.visible(userID):
		return protocol.Presence_PRESENCE_OFFLINE
	case h.busy[userID]:
		return protocol.Presence_PRESENCE_BUSY
	default:
		return protocol.Presence_PRESENCE_ONLINE
	}
}

func (h *hub) visible(userID string) bool {
	return len(h.sessions[userID]) > 0 && !h.invisible[userID]
}

func (h *hub) disconnect(userID string, keep *session) {
	h.mu.RLock()
	targets := make([]*session, 0, len(h.sessions[userID]))
	for s := range h.sessions[userID] {
		if s != keep {
			targets = append(targets, s)
		}
	}
	h.mu.RUnlock()

	for _, s := range targets {
		go s.conn.Close(websocket.StatusPolicyViolation, "session revoked")
	}
}

func (h *hub) presence(userID string) protocol.Presence {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return h.status(userID)
}

func (h *hub) publish(userIDs []string, frame *protocol.ServerFrame, skip *session) {
	data, err := proto.Marshal(frame)
	if err != nil {
		slog.Error("marshal frame", "error", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, userID := range userIDs {
		for s := range h.sessions[userID] {
			if s != skip {
				s.push(data)
			}
		}
	}
}
