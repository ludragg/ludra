package realtime

import (
	"strings"
	"time"

	"ludra/internal/limit"
	"ludra/internal/protocol"
)

const (
	maxConnectionsPerIP = 20
	authTimeout         = 30 * time.Second
	challengeTimeout    = 15 * time.Minute
	callInterval        = 5 * time.Second
)

type guard struct {
	connections *limit.Counter
	authByIP    *limit.Limiter
	logins      *limit.Limiter
	codeChecks  *limit.Limiter
	codeSends   *limit.Limiter
	codesByIP   *limit.Limiter
	messages    *limit.Limiter
	openings    *limit.Limiter

	friendRequests  *limit.Limiter
	friendChanges   *limit.Limiter
	presenceChanges *limit.Limiter
	passwordChecks  *limit.Limiter
	avatarChanges   *limit.Limiter
	callStarts      *limit.Limiter
	callCooldown    *limit.Limiter
	signals         *limit.Limiter
	groupChanges    *limit.Limiter
	roomStarts      *limit.Limiter
	voiceChanges    *limit.Limiter
	largeSignals    *limit.Limiter
	identityChanges *limit.Limiter
	identityLookups *limit.Limiter
	usernameChanges *limit.Limiter
	images          *limit.Limiter
	imageReads      *limit.Limiter
	gifSearches     *limit.Limiter
	diagnostics     *limit.Limiter
}

func newGuard() *guard {
	return &guard{
		connections: limit.NewCounter(maxConnectionsPerIP),
		authByIP:    limit.New(30, 10*time.Minute),
		logins:      limit.New(10, 15*time.Minute),
		codeChecks:  limit.New(10, time.Hour),
		codeSends:   limit.New(5, time.Hour),
		codesByIP:   limit.New(10, time.Hour),
		messages:    limit.New(20, 10*time.Second),
		openings:    limit.New(30, time.Minute),

		friendRequests:  limit.New(20, time.Hour),
		friendChanges:   limit.New(60, time.Minute),
		presenceChanges: limit.New(20, time.Minute),
		passwordChecks:  limit.New(10, 15*time.Minute),
		avatarChanges:   limit.New(10, 10*time.Minute),
		callStarts:      limit.New(10, time.Minute),
		callCooldown:    limit.New(1, callInterval),
		signals:         limit.New(100, 10*time.Second),
		groupChanges:    limit.New(30, 10*time.Minute),
		roomStarts:      limit.New(3, 5*time.Minute),
		voiceChanges:    limit.New(10, 10*time.Second),
		largeSignals:    limit.New(6, 10*time.Second),
		identityChanges: limit.New(20, time.Hour),
		identityLookups: limit.New(60, time.Minute),
		usernameChanges: limit.New(10, time.Hour),
		images:          limit.New(10, time.Minute),
		imageReads:      limit.New(1200, time.Minute),
		gifSearches:     limit.New(60, time.Minute),
		diagnostics:     limit.New(30, 10*time.Minute),
	}
}

func (g *guard) allowAuth(ip string) bool {
	return g.authByIP.Allow(ip)
}

func (g *guard) allowLogin(ip, login string) bool {
	return g.allowAuth(ip) && g.logins.Allow(normalize(login))
}

func (g *guard) allowCodeCheck(ip, email string) bool {
	return g.allowAuth(ip) && g.codeChecks.Allow(normalize(email))
}

func (g *guard) allowCodeSend(ip, email string) bool {
	return g.codesByIP.Allow(ip) && g.codeSends.Allow(normalize(email))
}

func normalize(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func tooManyRequests() *protocol.ServerFrame {
	return errorFrame(protocol.ErrorCode_ERROR_CODE_TOO_MANY_REQUESTS, "too many requests")
}
