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
	silent     bool
	direct     bool
}

type finisher func(callerID, calleeID, messageID, outcome string, duration time.Duration)

type calls struct {
	hub     *hub
	finish  finisher
	mu      sync.Mutex
	byID    map[string]*call
	byUser  map[string]*call
	waiting map[string]*call
}

func newCalls(hub *hub, finish finisher) *calls {
	return &calls{
		hub:     hub,
		finish:  finish,
		byID:    make(map[string]*call),
		byUser:  make(map[string]*call),
		waiting: make(map[string]*call),
	}
}

func (c *calls) busy(userID string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	current := c.byUser[userID]
	return current != nil && (current.callerID == userID || current.callee != nil)
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

	current := c.waiting[userID]
	if current == nil {
		current = c.byUser[userID]
	}
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

func (c *calls) start(caller *session, calleeID string, calleeBusy, direct bool) (*call, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	callerID := caller.user.Id
	if c.byUser[callerID] != nil {
		return nil, false
	}

	existing := c.byUser[calleeID]
	alreadyRinging := c.waiting[calleeID] != nil ||
		(existing != nil && existing.callee == nil && existing.calleeID == calleeID)

	id := make([]byte, 16)
	rand.Read(id)
	ringing := &call{
		id:       hex.EncodeToString(id),
		callerID: callerID,
		caller:   caller,
		calleeID: calleeID,
		silent:   alreadyRinging,
		direct:   direct,
	}
	ringing.timer = time.AfterFunc(ringTimeout, func() { c.expire(ringing.id) })

	c.byID[ringing.id] = ringing
	c.byUser[callerID] = ringing
	switch {
	case ringing.silent:
	case calleeBusy || existing != nil:
		c.waiting[calleeID] = ringing
	default:
		c.byUser[calleeID] = ringing
	}
	return ringing, true
}

func (c *calls) answer(id string, s *session) (*call, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	ringing := c.byID[id]
	if ringing == nil || ringing.silent || ringing.callee != nil || ringing.calleeID != s.user.Id {
		return nil, false
	}
	if c.waiting[s.user.Id] == ringing {
		if c.byUser[s.user.Id] != nil {
			return nil, false
		}
		delete(c.waiting, s.user.Id)
		c.byUser[s.user.Id] = ringing
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
	return ringing != nil && !ringing.silent && ringing.callee == nil && ringing.calleeID == userID
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
	return c.finishCall(c.remove(id, by, false), by, reason)
}

func (c *calls) expire(id string) {
	c.finishCall(c.remove(id, nil, true), nil, protocol.CallEndReason_CALL_END_REASON_MISSED)
}

func (c *calls) finishCall(ended *call, by *session, reason protocol.CallEndReason) bool {
	if ended == nil {
		return false
	}
	byCaller := by != nil && by.user.Id == ended.callerID

	if ended.messageID != "" {
		go c.finish(ended.callerID, ended.calleeID, ended.messageID, outcome(ended, by), duration(ended))
	}

	frame := callEndedFrame(ended.id, reason)
	switch {
	case ended.silent:
		if by != ended.caller {
			ended.caller.reply(frame)
		}
	case ended.callee != nil && by == ended.caller:
		ended.callee.reply(frame)
	case ended.callee != nil:
		ended.caller.reply(frame)
	case byCaller:
		if by != ended.caller {
			ended.caller.reply(frame)
		}
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

func (c *calls) endBetween(s *session, otherID string) {
	type pending struct {
		id string
		by *session
	}

	c.mu.Lock()
	var found []pending
	for _, current := range []*call{c.byUser[s.user.Id], c.waiting[s.user.Id], c.waiting[otherID]} {
		if current == nil {
			continue
		}
		if (current.callerID == s.user.Id && current.calleeID == otherID) ||
			(current.callerID == otherID && current.calleeID == s.user.Id) {
			by := s
			if current.callerID == s.user.Id {
				by = current.caller
			} else if current.callee != nil {
				by = current.callee
			}
			found = append(found, pending{id: current.id, by: by})
		}
	}
	c.mu.Unlock()

	for _, item := range found {
		c.end(item.id, item.by, protocol.CallEndReason_CALL_END_REASON_HUNG_UP)
	}
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

func (c *calls) displace(userID string) {
	c.mu.Lock()
	current := c.byUser[userID]
	held := current != nil && (current.callerID == userID || current.callee != nil)
	c.mu.Unlock()
	if !held {
		return
	}

	ended := c.remove(current.id, nil, false)
	if ended == nil {
		return
	}
	if ended.messageID != "" {
		go c.finish(ended.callerID, ended.calleeID, ended.messageID, outcome(ended, nil), duration(ended))
	}

	frame := callEndedFrame(ended.id, protocol.CallEndReason_CALL_END_REASON_DISCONNECTED)
	ended.caller.reply(frame)
	switch {
	case ended.callee != nil:
		ended.callee.reply(frame)
	case !ended.silent:
		c.hub.publish([]string{ended.calleeID}, callEndedFrame(ended.id, protocol.CallEndReason_CALL_END_REASON_MISSED), nil)
	}
}

func (c *calls) remove(id string, by *session, onlyRinging bool) *call {
	c.mu.Lock()
	defer c.mu.Unlock()

	current := c.byID[id]
	if current == nil || (onlyRinging && current.callee != nil) {
		return nil
	}
	if by != nil && by.user.Id != current.callerID && by.user.Id != current.calleeID {
		return nil
	}
	if current.callee != nil && by != nil && by != current.caller && by != current.callee {
		return nil
	}

	if current.silent && by != nil && by.user.Id != current.callerID {
		return nil
	}

	current.timer.Stop()
	delete(c.byID, id)
	for _, userID := range []string{current.callerID, current.calleeID} {
		if c.byUser[userID] == current {
			delete(c.byUser, userID)
		}
		if c.waiting[userID] == current {
			delete(c.waiting, userID)
		}
	}
	return current
}

func outcome(ended *call, by *session) string {
	switch {
	case ended.callee != nil:
		return "completed"
	case by != nil && by.user.Id != ended.callerID:
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
