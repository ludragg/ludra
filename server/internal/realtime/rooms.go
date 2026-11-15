package realtime

import (
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"ludra/internal/protocol"
)

type room struct {
	id             string
	conversationID string
	sessions       map[*session]string
	startedAt      time.Time
	messageID      string
	alone          *time.Timer
	ringing        map[string]bool
	ringTimer      *time.Timer
	voice          map[string]voiceState
}

type voiceState struct {
	muted    bool
	deafened bool
}

const aloneTimeout = 5 * time.Minute

type roomFinisher func(conversationID, messageID string, duration time.Duration)

type rooms struct {
	finish         roomFinisher
	mu             sync.Mutex
	byID           map[string]*room
	byConversation map[string]*room
	byUser         map[string]*room
}

func newRooms(finish roomFinisher) *rooms {
	return &rooms{
		finish:         finish,
		byID:           make(map[string]*room),
		byConversation: make(map[string]*room),
		byUser:         make(map[string]*room),
	}
}

func (r *rooms) busy(userID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.byUser[userID] != nil
}

func (r *rooms) join(conversationID string, s *session) (*room, bool, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	userID := s.user.Id
	if r.byUser[userID] != nil {
		return nil, false, false
	}

	current := r.byConversation[conversationID]
	created := current == nil
	if created {
		id := make([]byte, 16)
		rand.Read(id)
		current = &room{
			id:             hex.EncodeToString(id),
			conversationID: conversationID,
			sessions:       make(map[*session]string),
			ringing:        make(map[string]bool),
			voice:          make(map[string]voiceState),
			startedAt:      time.Now(),
		}
		r.byID[current.id] = current
		r.byConversation[conversationID] = current
	}

	current.sessions[s] = userID
	r.byUser[userID] = current
	delete(current.ringing, userID)
	r.watchAlone(current)
	return current, created, true
}

func (r *rooms) attachMessage(roomID, messageID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byID[roomID]
	if current == nil {
		return false
	}
	current.messageID = messageID
	return true
}

func (r *rooms) leave(s *session) (string, bool) {
	r.mu.Lock()
	var found *room
	for _, current := range r.byID {
		if _, ok := current.sessions[s]; ok {
			found = current
			break
		}
	}
	if found == nil {
		r.mu.Unlock()
		return "", false
	}

	empty := r.leaveLocked(found, s)
	r.mu.Unlock()

	r.finishIfEmpty(found, empty)
	return found.conversationID, true
}

func (r *rooms) leaveLocked(found *room, s *session) bool {
	delete(found.voice, found.sessions[s])
	delete(r.byUser, found.sessions[s])
	delete(found.sessions, s)
	empty := len(found.sessions) == 0
	if empty {
		delete(r.byID, found.id)
		delete(r.byConversation, found.conversationID)
		if found.ringTimer != nil {
			found.ringTimer.Stop()
		}
	}
	r.watchAlone(found)
	return empty
}

func (r *rooms) finishIfEmpty(found *room, empty bool) {
	if empty && found.messageID != "" {
		go r.finish(found.conversationID, found.messageID, time.Since(found.startedAt))
	}
}

func (r *rooms) setVoice(roomID string, from *session, state voiceState) (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byID[roomID]
	if current == nil {
		return "", false
	}
	userID, ok := current.sessions[from]
	if !ok || current.voice[userID] == state {
		return "", false
	}
	current.voice[userID] = state
	return current.conversationID, true
}

func (r *rooms) exists(conversationID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.byConversation[conversationID] != nil
}

func (r *rooms) unring(conversationID, userID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byConversation[conversationID]
	if current == nil || !current.ringing[userID] {
		return false
	}
	delete(current.ringing, userID)
	if len(current.ringing) == 0 && current.ringTimer != nil {
		current.ringTimer.Stop()
	}
	return true
}

func (r *rooms) ring(roomID string, userIDs []string, expired func()) {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byID[roomID]
	if current == nil || len(userIDs) == 0 {
		return
	}
	for _, userID := range userIDs {
		if r.byUser[userID] != current {
			current.ringing[userID] = true
		}
	}
	if len(current.ringing) == 0 {
		return
	}
	current.ringTimer = time.AfterFunc(ringTimeout, func() {
		r.mu.Lock()
		pending := r.byID[roomID] == current && len(current.ringing) > 0
		clear(current.ringing)
		r.mu.Unlock()
		if pending {
			expired()
		}
	})
}

func (r *rooms) watchAlone(current *room) {
	if len(current.sessions) != 1 {
		if current.alone != nil {
			current.alone.Stop()
			current.alone = nil
		}
		return
	}
	if current.alone == nil {
		var timer *time.Timer
		timer = time.AfterFunc(aloneTimeout, func() { r.endAlone(current, timer) })
		current.alone = timer
	}
}

func (r *rooms) endAlone(current *room, timer *time.Timer) {
	r.mu.Lock()
	if r.byID[current.id] != current || current.alone != timer || len(current.sessions) != 1 {
		r.mu.Unlock()
		return
	}
	current.alone = nil
	var lone *session
	for s := range current.sessions {
		lone = s
	}
	empty := r.leaveLocked(current, lone)
	r.mu.Unlock()

	r.finishIfEmpty(current, empty)
	lone.reply(groupCallUpdatedFrame(current.conversationID, nil))
	lone.announceRoom(current.conversationID)
}

func (r *rooms) sessionOf(conversationID, userID string) *session {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byConversation[conversationID]
	if current == nil {
		return nil
	}
	for s, id := range current.sessions {
		if id == userID {
			return s
		}
	}
	return nil
}

func (r *rooms) peer(roomID string, from *session, userID string) *session {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byID[roomID]
	if current == nil {
		return nil
	}
	if _, ok := current.sessions[from]; !ok {
		return nil
	}
	for s, id := range current.sessions {
		if id == userID && s != from {
			return s
		}
	}
	return nil
}

func (r *rooms) others(roomID string, from *session) []*session {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byID[roomID]
	if current == nil {
		return nil
	}
	if _, ok := current.sessions[from]; !ok {
		return nil
	}

	result := make([]*session, 0, len(current.sessions))
	for s := range current.sessions {
		if s != from {
			result = append(result, s)
		}
	}
	return result
}

func (r *rooms) state(conversationID string) *protocol.GroupCall {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.byConversation[conversationID]
	if current == nil {
		return nil
	}

	participants := make([]string, 0, len(current.sessions))
	for _, id := range current.sessions {
		participants = append(participants, id)
	}
	sort.Strings(participants)
	ringing := make([]string, 0, len(current.ringing))
	for id := range current.ringing {
		ringing = append(ringing, id)
	}
	sort.Strings(ringing)
	var muted, deafened []string
	for _, id := range participants {
		state := current.voice[id]
		if state.muted {
			muted = append(muted, id)
		}
		if state.deafened {
			deafened = append(deafened, id)
		}
	}
	return &protocol.GroupCall{Id: current.id, ParticipantIds: participants, StartedAt: timestamppb.New(current.startedAt), RingingIds: ringing, MutedIds: muted, DeafenedIds: deafened}
}
