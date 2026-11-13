package realtime

import (
	"log/slog"
	"sync"

	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"

	"ludra/internal/protocol"
)

type hub struct {
	mu       sync.RWMutex
	sessions map[string]map[*session]struct{}
}

func newHub() *hub {
	return &hub{sessions: make(map[string]map[*session]struct{})}
}

func (h *hub) register(userID string, s *session) (first bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.sessions[userID] == nil {
		h.sessions[userID] = make(map[*session]struct{})
	}
	h.sessions[userID][s] = struct{}{}
	return len(h.sessions[userID]) == 1
}

func (h *hub) unregister(userID string, s *session) (last bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.sessions[userID], s)
	if len(h.sessions[userID]) > 0 {
		return false
	}
	delete(h.sessions, userID)
	return true
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

	if len(h.sessions[userID]) > 0 {
		return protocol.Presence_PRESENCE_ONLINE
	}
	return protocol.Presence_PRESENCE_OFFLINE
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
