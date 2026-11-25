package realtime

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"ludra/internal/account"
	"ludra/internal/chat"
	"ludra/internal/diagnostics"
	"ludra/internal/friends"
	"ludra/internal/gifs"
	"ludra/internal/protocol"
	"ludra/internal/unfurl"
	"ludra/internal/voice"
)

type Gateway struct {
	diagnostics *diagnostics.Service
	chat        *chat.Service
	friends     *friends.Service
	account     *account.Service
	relay       *voice.Relay
	calls       *calls
	rooms       *rooms
	voice       *sync.Mutex
	origins     []string
	hub         *hub
	guard       *guard
	proxies     []netip.Prefix
	previews    *unfurl.Fetcher
	gifs        *gifs.Client
	pending     *atomic.Int32
}

func NewGateway(
	chat *chat.Service,
	friends *friends.Service,
	account *account.Service,
	relay *voice.Relay,
	previews *unfurl.Fetcher,
	gifs *gifs.Client,
	diagnostics *diagnostics.Service,
	origins []string,
	proxies []netip.Prefix,
) *Gateway {
	hub := newHub()
	pending := &atomic.Int32{}
	finish := func(callerID, calleeID, messageID, outcome string, duration time.Duration) {
		pending.Add(1)
		go func() {
			defer pending.Add(-1)
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			defer cancel()

			message, err := chat.FinishCallMessage(ctx, messageID, outcome, duration)
			if err != nil {
				slog.Error("finish call message", "error", err)
				return
			}
			hub.publish([]string{callerID, calleeID}, messageUpdatedFrame(toMessage(message)), nil)
		}()
	}

	finishRoom := func(conversationID, messageID string, duration time.Duration) {
		pending.Add(1)
		go func() {
			defer pending.Add(-1)
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
		}()
	}

	return &Gateway{
		diagnostics: diagnostics,
		chat:        chat,
		friends:     friends,
		account:     account,
		relay:       relay,
		calls:       newCalls(hub, finish),
		rooms:       newRooms(finishRoom),
		voice:       &sync.Mutex{},
		origins:     origins,
		proxies:     proxies,
		hub:         hub,
		guard:       newGuard(),
		previews:    previews,
		gifs:        gifs,
		pending:     pending,
	}
}

func (g *Gateway) Close(ctx context.Context) {
	g.calls.closeAll()
	g.rooms.closeAll()
	for g.pending.Load() > 0 {
		select {
		case <-ctx.Done():
			return
		case <-time.After(20 * time.Millisecond):
		}
	}
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ip := g.clientIP(r)
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
		diagnostics: g.diagnostics,
		conn:        conn,
		hub:         g.hub,
		guard:       g.guard,
		chat:        g.chat,
		friends:     g.friends,
		account:     g.account,
		relay:       g.relay,
		calls:       g.calls,
		rooms:       g.rooms,
		voice:       g.voice,
		ip:          ip,
		previews:    g.previews,
		gifs:        g.gifs,
		send:        make(chan []byte, sendBuffer),
	}
	s.run(r.Context())
}

func (g *Gateway) AnnounceUpdate(version string) {
	g.hub.broadcast(&protocol.ServerFrame{
		Payload: &protocol.ServerFrame_UpdateAvailable{UpdateAvailable: &protocol.UpdateAvailable{Version: version}},
	})
}

func (g *Gateway) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if !g.trusted(host) {
		return host
	}

	hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop := strings.TrimSpace(hops[i])
		addr, err := netip.ParseAddr(hop)
		if err != nil {
			break
		}
		if !g.trusted(hop) {
			return addr.Unmap().String()
		}
	}
	return host
}

func (g *Gateway) trusted(ip string) bool {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	addr = addr.Unmap()
	for _, prefix := range g.proxies {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}
