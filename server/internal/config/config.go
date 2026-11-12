package config

import (
	"os"
	"strings"
)

type Config struct {
	Addr        string
	DatabaseURL string
	Origins     []string
}

func Load() Config {
	return Config{
		Addr:        env("LUDRA_ADDR", "127.0.0.1:8080"),
		DatabaseURL: env("LUDRA_DATABASE_URL", "postgres://ludra:ludra@localhost:5433/ludra?sslmode=disable"),
		Origins:     strings.Split(env("LUDRA_ORIGINS", "localhost,localhost:*,tauri.localhost"), ","),
	}
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
