package realtime

import (
	"sync"
	"testing"
	"time"
)

type finished struct {
	messageID string
	outcome   string
	duration  time.Duration
}

func TestCloseAllKeepsRealCallDurations(t *testing.T) {
	var mu sync.Mutex
	var done []finished
	record := func(_, _, messageID, outcome string, duration time.Duration) {
		mu.Lock()
		defer mu.Unlock()
		done = append(done, finished{messageID, outcome, duration})
	}

	registry := newCalls(newHub(), record)
	registry.byID["answered"] = &call{
		id: "answered", callerID: "a", calleeID: "b", callee: &session{},
		messageID: "m1", answeredAt: time.Now().Add(-7 * time.Minute), timer: time.NewTimer(time.Hour),
	}
	registry.byID["ringing"] = &call{
		id: "ringing", callerID: "c", calleeID: "d",
		messageID: "m2", timer: time.NewTimer(time.Hour),
	}
	registry.closeAll()

	if len(registry.byID) != 0 {
		t.Fatalf("calls left after closeAll: %d", len(registry.byID))
	}
	results := map[string]finished{}
	for _, item := range done {
		results[item.messageID] = item
	}
	if got := results["m1"]; got.outcome != "completed" || got.duration < 7*time.Minute {
		t.Fatalf("answered call finished as %+v", got)
	}
	if got := results["m2"]; got.outcome != "missed" || got.duration != 0 {
		t.Fatalf("ringing call finished as %+v", got)
	}
}

func TestCloseAllFinishesGroupRoomsOnce(t *testing.T) {
	var mu sync.Mutex
	var done []time.Duration
	registry := newRooms(func(_, messageID string, duration time.Duration) {
		mu.Lock()
		defer mu.Unlock()
		if messageID == "g1" {
			done = append(done, duration)
		}
	})
	member := &session{}
	registry.byID["room"] = &room{
		id: "room", conversationID: "conversation", messageID: "g1",
		sessions: map[*session]string{member: "user"}, startedAt: time.Now().Add(-12 * time.Minute),
		voice: map[string]voiceState{}, direct: map[string]bool{}, previews: map[string]string{},
	}
	registry.byConversation["conversation"] = registry.byID["room"]
	registry.byUser["user"] = registry.byID["room"]

	registry.closeAll()
	registry.closeAll()

	if len(done) != 1 || done[0] < 12*time.Minute {
		t.Fatalf("group call finished as %v", done)
	}
	if len(registry.byID) != 0 || len(registry.byUser) != 0 || len(registry.byConversation) != 0 {
		t.Fatal("rooms left after closeAll")
	}
}
