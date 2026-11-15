package realtime

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"ludra/internal/account"
	"ludra/internal/chat"
	"ludra/internal/friends"
	"ludra/internal/voice"
)

type Gateway struct {
	chat    *chat.Service
	friends *friends.Service
	account *account.Service
	relay   *voice.Relay
	calls   *calls
	rooms   *rooms
	voice   *sync.Mutex
	origins []string
	hub     *hub
	guard   *guard
}

func NewGateway(
	chat *chat.Service,
	friends *friends.Service,
	account *account.Service,
	relay *voice.Relay,
	origins []string,
) *Gateway {
	hub := newHub()
	finish := func(callerID, calleeID, messageID, outcome string, duration time.Duration) {
		ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
		defer cancel()

		message, err := chat.FinishCallMessage(ctx, messageID, outcome, duration)
		if err != nil {
			slog.Error("finish call message", "error", err)
			return
		}
		hub.publish([]string{callerID, calleeID}, messageUpdatedFrame(toMessage(message)), nil)
	}

	finishRoom := func(conversationID, messageID string, duration time.Duration) {
		ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
		defer cancel()

		message, err := chat.FinishCallMessage(ctx, messageID, "completed", duration)
		if err != nil {
			slog.Error("finish group call message", "error", err)
			return
		}
		members, err := chat.ParticipantIDs(ctx, conversationID)
		if err != nil {
			slog.Error("load group members", "error", err)
			return
		}
		hub.publish(members, messageUpdatedFrame(toMessage(message)), nil)
	}

	return &Gateway{
		chat:    chat,
		friends: friends,
		account: account,
		relay:   relay,
		calls:   newCalls(hub, finish),
		rooms:   newRooms(finishRoom),
		voice:   &sync.Mutex{},
		origins: origins,
		hub:     hub,
		guard:   newGuard(),
	}
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !g.guard.connections.Acquire(ip) {
		http.Error(w, "too many connections", http.StatusTooManyRequests)
		return
	}
	defer g.guard.connections.Release(ip)

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: g.origins})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	conn.SetReadLimit(maxFrameSize)

	s := &session{
		conn:    conn,
		hub:     g.hub,
		guard:   g.guard,
		chat:    g.chat,
		friends: g.friends,
		account: g.account,
		relay:   g.relay,
		calls:   g.calls,
		rooms:   g.rooms,
		voice:   g.voice,
		ip:      ip,
		send:    make(chan []byte, sendBuffer),
	}
	s.run(r.Context())
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
