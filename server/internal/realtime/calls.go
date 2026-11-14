package realtime

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"ludra/internal/protocol"
)

const ringTimeout = 30 * time.Second

type call struct {
	id         string
	callerID   string
	caller     *session
	calleeID   string
	callee     *session
	messageID  string
	incoming   *protocol.ServerFrame
	answeredAt time.Time
	timer      *time.Timer
}

type finisher func(callerID, calleeID, messageID, outcome string, duration time.Duration)

type calls struct {
	hub    *hub
	finish finisher
	mu     sync.Mutex
	byID   map[string]*call
	byUser map[string]*call
}

func newCalls(hub *hub, finish finisher) *calls {
	return &calls{hub: hub, finish: finish, byID: make(map[string]*call), byUser: make(map[string]*call)}
}

func (c *calls) setIncoming(id string, frame *protocol.ServerFrame) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if current := c.byID[id]; current != nil {
		current.incoming = frame
	}
}

func (c *calls) ringing(userID string) *protocol.ServerFrame {
	c.mu.Lock()
	defer c.mu.Unlock()

	current := c.byUser[userID]
	if current == nil || current.callee != nil || current.calleeID != userID {
		return nil
	}
	return current.incoming
}

func (c *calls) attachMessage(id, messageID string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	current := c.byID[id]
	if current == nil {
		return false
	}
	current.messageID = messageID
	return true
}

func (c *calls) start(caller *session, calleeID string) (*call, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	callerID := caller.user.Id
	if c.byUser[callerID] != nil || c.byUser[calleeID] != nil {
		return nil, false
	}

	id := make([]byte, 16)
	rand.Read(id)
	ringing := &call{id: hex.EncodeToString(id), callerID: callerID, caller: caller, calleeID: calleeID}
	ringing.timer = time.AfterFunc(ringTimeout, func() {
		c.end(ringing.id, nil, protocol.CallEndReason_CALL_END_REASON_MISSED)
	})

	c.byID[ringing.id] = ringing
	c.byUser[callerID] = ringing
	c.byUser[calleeID] = ringing
	return ringing, true
}

func (c *calls) answer(id string, s *session) (*call, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	ringing := c.byID[id]
	if ringing == nil || ringing.callee != nil || ringing.calleeID != s.user.Id {
		return nil, false
	}
	ringing.timer.Stop()
	ringing.callee = s
	ringing.answeredAt = time.Now()
	return ringing, true
}

func (c *calls) ringingFor(id, userID string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	ringing := c.byID[id]
	return ringing != nil && ringing.callee == nil && ringing.calleeID == userID
}

func (c *calls) peer(id string, s *session) *session {
	c.mu.Lock()
	defer c.mu.Unlock()

	active := c.byID[id]
	switch {
	case active == nil || active.callee == nil:
		return nil
	case active.caller == s:
		return active.callee
	case active.callee == s:
		return active.caller
	default:
		return nil
	}
}

func (c *calls) end(id string, by *session, reason protocol.CallEndReason) bool {
	ended := c.remove(id, by)
	if ended == nil {
		return false
	}

	if ended.messageID != "" {
		go c.finish(ended.callerID, ended.calleeID, ended.messageID, outcome(ended, by), duration(ended))
	}

	frame := callEndedFrame(ended.id, reason)
	switch {
	case ended.callee != nil && by == ended.caller:
		ended.callee.reply(frame)
	case ended.callee != nil:
		ended.caller.reply(frame)
	case by == ended.caller:
		c.hub.publish([]string{ended.calleeID}, callEndedFrame(ended.id, protocol.CallEndReason_CALL_END_REASON_MISSED), nil)
	case by != nil:
		ended.caller.reply(frame)
		c.hub.publish([]string{ended.calleeID}, frame, by)
	default:
		ended.caller.reply(frame)
		c.hub.publish([]string{ended.calleeID}, frame, nil)
	}
	return true
}

func (c *calls) leave(s *session) {
	c.mu.Lock()
	current := c.byUser[s.user.Id]
	c.mu.Unlock()

	if current == nil || (current.caller != s && current.callee != s) {
		return
	}
	c.end(current.id, s, protocol.CallEndReason_CALL_END_REASON_DISCONNECTED)
}

func (c *calls) remove(id string, by *session) *call {
	c.mu.Lock()
	defer c.mu.Unlock()

	current := c.byID[id]
	if current == nil {
		return nil
	}
	if by != nil && by.user.Id != current.callerID && by.user.Id != current.calleeID {
		return nil
	}
	if current.callee != nil && by != nil && by != current.caller && by != current.callee {
		return nil
	}

	current.timer.Stop()
	delete(c.byID, id)
	delete(c.byUser, current.callerID)
	delete(c.byUser, current.calleeID)
	return current
}

func outcome(ended *call, by *session) string {
	switch {
	case ended.callee != nil:
		return "completed"
	case by != nil && by != ended.caller:
		return "declined"
	default:
		return "missed"
	}
}

func duration(ended *call) time.Duration {
	if ended.callee == nil {
		return 0
	}
	return time.Since(ended.answeredAt)
}
