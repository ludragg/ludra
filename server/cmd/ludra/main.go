package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ludra/internal/account"
	"ludra/internal/api"
	"ludra/internal/chat"
	"ludra/internal/config"
	"ludra/internal/database"
	"ludra/internal/friends"
	"ludra/internal/mail"
	"ludra/internal/realtime"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	accounts, err := account.NewService(database.New(pool), mail.New(cfg.Mail))
	if err != nil {
		return err
	}
	gateway := realtime.NewGateway(chat.NewService(pool), friends.NewService(pool), accounts, cfg.Origins)
	go cleanup(ctx, accounts)

	if cfg.Mail.Host == "" {
		slog.Warn("SMTP is not configured, verification codes will be written to this log")
	}

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.NewHandler(pool, accounts, gateway),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       time.Minute,
		MaxHeaderBytes:    16 << 10,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}

	errs := make(chan error, 1)
	go func() {
		slog.Info("server listening", "addr", cfg.Addr)
		errs <- server.ListenAndServe()
	}()

	select {
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

func cleanup(ctx context.Context, accounts *account.Service) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	for {
		if err := accounts.Cleanup(ctx); err != nil && ctx.Err() == nil {
			slog.Error("cleanup failed", "error", err)
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
