package voice

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/pion/turn/v4"

	"ludra/internal/limit"
)

const (
	realm              = "ludra"
	credentialLifetime = 12 * time.Hour
	allocationsPerUser = 20
	allocationWindow   = 10 * time.Minute
)

type Config struct {
	Listen string
	Host   string
	Ports  string
	Secret string
}

type IceServer struct {
	URLs       []string
	Username   string
	Credential string
}

type Relay struct {
	server *turn.Server
	secret string
	url    string
}

func NewRelay(cfg Config) (*Relay, error) {
	host := cfg.Host
	if host == "" {
		host = localIP()
	}
	relayIP := net.ParseIP(host)
	if relayIP == nil {
		return nil, fmt.Errorf("turn host must be an IP address: %q", host)
	}

	minPort, maxPort, err := portRange(cfg.Ports)
	if err != nil {
		return nil, err
	}

	_, port, err := net.SplitHostPort(cfg.Listen)
	if err != nil {
		return nil, fmt.Errorf("turn listen address: %w", err)
	}

	secret := cfg.Secret
	if secret == "" {
		random := make([]byte, 32)
		if _, err := rand.Read(random); err != nil {
			return nil, err
		}
		secret = hex.EncodeToString(random)
	}

	listener, err := net.ListenPacket("udp4", cfg.Listen)
	if err != nil {
		return nil, fmt.Errorf("turn listen: %w", err)
	}

	allocations := limit.New(allocationsPerUser, allocationWindow)
	server, err := turn.NewServer(turn.ServerConfig{
		Realm:       realm,
		AuthHandler: turn.LongTermTURNRESTAuthHandler(secret, nil),
		QuotaHandler: func(username, _ string, _ net.Addr) bool {
			_, user, _ := strings.Cut(username, ":")
			return allocations.Allow(user)
		},
		PacketConnConfigs: []turn.PacketConnConfig{{
			PacketConn: listener,
			RelayAddressGenerator: &turn.RelayAddressGeneratorPortRange{
				RelayAddress: relayIP,
				Address:      "0.0.0.0",
				MinPort:      minPort,
				MaxPort:      maxPort,
			},
			PermissionHandler: func(_ net.Addr, peerIP net.IP) bool {
				return peerIP.Equal(relayIP)
			},
		}},
	})
	if err != nil {
		listener.Close()
		return nil, err
	}

	return &Relay{
		server: server,
		secret: secret,
		url:    "turn:" + net.JoinHostPort(host, port) + "?transport=udp",
	}, nil
}

func (r *Relay) URL() string {
	return r.url
}

func (r *Relay) Credentials(userID string) (IceServer, error) {
	username, credential, err := turn.GenerateLongTermTURNRESTCredentials(r.secret, userID, credentialLifetime)
	if err != nil {
		return IceServer{}, err
	}
	return IceServer{URLs: []string{r.url}, Username: username, Credential: credential}, nil
}

func (r *Relay) Close() error {
	return r.server.Close()
}

func localIP() string {
	conn, err := net.Dial("udp4", "1.1.1.1:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.UDPAddr).IP.String()
}

func portRange(value string) (uint16, uint16, error) {
	low, high, found := strings.Cut(value, "-")
	if !found {
		return 0, 0, fmt.Errorf("turn ports must look like 49160-49200: %q", value)
	}

	minPort, err := strconv.ParseUint(strings.TrimSpace(low), 10, 16)
	if err != nil {
		return 0, 0, fmt.Errorf("turn ports: %w", err)
	}
	maxPort, err := strconv.ParseUint(strings.TrimSpace(high), 10, 16)
	if err != nil {
		return 0, 0, fmt.Errorf("turn ports: %w", err)
	}
	if minPort == 0 || maxPort < minPort {
		return 0, 0, fmt.Errorf("turn ports: invalid range %q", value)
	}
	return uint16(minPort), uint16(maxPort), nil
}
