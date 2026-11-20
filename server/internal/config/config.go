package config

import (
	"net/netip"
	"os"
	"strings"

	"ludra/internal/mail"
	"ludra/internal/voice"
)

type Config struct {
	Addr        string
	DatabaseURL string
	Origins     []string
	Proxies     []netip.Prefix
	UpdatesRepo string
	KlipyKey    string
	Mail        mail.Config
	Turn        voice.Config
}

func Load() Config {
	return Config{
		Addr:        env("LUDRA_ADDR", "127.0.0.1:8080"),
		DatabaseURL: env("LUDRA_DATABASE_URL", "postgres://ludra:ludra@localhost:5433/ludra?sslmode=disable"),
		Origins:     strings.Split(env("LUDRA_ORIGINS", "localhost,localhost:*,tauri.localhost"), ","),
		Proxies:     prefixes(env("LUDRA_TRUSTED_PROXIES", "")),
		UpdatesRepo: env("LUDRA_UPDATES_REPO", "ludragg/ludra"),
		KlipyKey:    env("LUDRA_KLIPY_KEY", ""),
		Mail: mail.Config{
			Host:     env("LUDRA_SMTP_HOST", ""),
			Port:     env("LUDRA_SMTP_PORT", "587"),
			Username: env("LUDRA_SMTP_USERNAME", ""),
			Password: env("LUDRA_SMTP_PASSWORD", ""),
			From:     env("LUDRA_MAIL_FROM", "Ludra <no-reply@ludra.gg>"),
		},
		Turn: voice.Config{
			Listen: env("LUDRA_TURN_LISTEN", "0.0.0.0:3478"),
			Host:   env("LUDRA_TURN_HOST", ""),
			Ports:  env("LUDRA_TURN_PORTS", "49160-49999"),
			Secret: env("LUDRA_TURN_SECRET", ""),
		},
	}
}

func prefixes(value string) []netip.Prefix {
	var result []netip.Prefix
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if prefix, err := netip.ParsePrefix(part); err == nil {
			result = append(result, prefix)
		} else if addr, err := netip.ParseAddr(part); err == nil {
			result = append(result, netip.PrefixFrom(addr, addr.BitLen()))
		}
	}
	return result
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
