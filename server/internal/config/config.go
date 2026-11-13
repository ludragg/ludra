package config

import (
	"os"
	"strings"

	"ludra/internal/mail"
)

type Config struct {
	Addr        string
	DatabaseURL string
	Origins     []string
	Mail        mail.Config
}

func Load() Config {
	return Config{
		Addr:        env("LUDRA_ADDR", "127.0.0.1:8080"),
		DatabaseURL: env("LUDRA_DATABASE_URL", "postgres://ludra:ludra@localhost:5433/ludra?sslmode=disable"),
		Origins:     strings.Split(env("LUDRA_ORIGINS", "localhost,localhost:*,tauri.localhost"), ","),
		Mail: mail.Config{
			Host:     env("LUDRA_SMTP_HOST", ""),
			Port:     env("LUDRA_SMTP_PORT", "587"),
			Username: env("LUDRA_SMTP_USERNAME", ""),
			Password: env("LUDRA_SMTP_PASSWORD", ""),
			From:     env("LUDRA_MAIL_FROM", "Ludra <no-reply@ludra.gg>"),
		},
	}
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
