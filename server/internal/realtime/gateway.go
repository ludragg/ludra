package realtime

import (
	"net"
	"net/http"

	"github.com/coder/websocket"

	"ludra/internal/account"
	"ludra/internal/chat"
	"ludra/internal/friends"
)

type Gateway struct {
	chat    *chat.Service
	friends *friends.Service
	account *account.Service
	origins []string
	hub     *hub
	guard   *guard
}

func NewGateway(chat *chat.Service, friends *friends.Service, account *account.Service, origins []string) *Gateway {
	return &Gateway{
		chat:    chat,
		friends: friends,
		account: account,
		origins: origins,
		hub:     newHub(),
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
