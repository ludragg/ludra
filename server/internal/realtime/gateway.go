package realtime

import (
	"net/http"

	"github.com/coder/websocket"

	"ludra/internal/chat"
)

type Gateway struct {
	chat    *chat.Service
	origins []string
	hub     *hub
}

func NewGateway(chat *chat.Service, origins []string) *Gateway {
	return &Gateway{chat: chat, origins: origins, hub: newHub()}
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: g.origins})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	conn.SetReadLimit(maxFrameSize)

	s := &session{
		conn: conn,
		hub:  g.hub,
		chat: g.chat,
		send: make(chan []byte, sendBuffer),
	}
	s.run(r.Context())
}
