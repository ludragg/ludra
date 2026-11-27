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
	"ludra/internal/gifs"
	"ludra/internal/mail"
	"ludra/internal/realtime"
	"ludra/internal/unfurl"
	"ludra/internal/updates"
	"ludra/internal/voice"
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
	relay, err := voice.NewRelay(cfg.Turn)
	if err != nil {
		return err
	}
	defer relay.Close()
	slog.Info("voice relay listening", "url", relay.URL())

	chats := chat.NewService(pool)
	if err := chats.CloseStaleCalls(ctx); err != nil {
		return err
	}

	fetcher := unfurl.New()
	gateway := realtime.NewGateway(
		chats, friends.NewService(pool), accounts, relay, fetcher, gifs.New(cfg.KlipyKey, fetcher), cfg.Origins, cfg.Proxies,
	)
	feed := updates.NewFeed(cfg.UpdatesRepo)
	go feed.Run(ctx, gateway.AnnounceUpdate)
	go cleanup(ctx, accounts, chats)

	if cfg.Mail.Host == "" {
		slog.Warn("SMTP is not configured, verification codes will be written to this log")
	}

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.NewHandler(pool, accounts, chats, feed, gateway),
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
	err = server.Shutdown(shutdownCtx)

	closeCtx, closeCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer closeCancel()
	gateway.Close(closeCtx)
	return err
}

func cleanup(ctx context.Context, accounts *account.Service, chats *chat.Service) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	for {
		if err := accounts.Cleanup(ctx); err != nil && ctx.Err() == nil {
			slog.Error("cleanup failed", "error", err)
		}
		if _, err := chats.ExpireFiles(ctx); err != nil && ctx.Err() == nil {
			slog.Error("expire files failed", "error", err)
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
