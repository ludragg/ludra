package mail

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/smtp"
	"strings"
)

type Sender interface {
	Send(ctx context.Context, to, subject, body string) error
}

type Config struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

func New(cfg Config) Sender {
	if cfg.Host == "" {
		return logSender{}
	}
	return smtpSender{cfg: cfg}
}

type logSender struct{}

func (logSender) Send(_ context.Context, to, subject, body string) error {
	slog.Info("email not sent, SMTP is not configured", "to", to, "subject", subject, "body", body)
	return nil
}

type smtpSender struct {
	cfg Config
}

func (s smtpSender) Send(_ context.Context, to, subject, body string) error {
	if strings.ContainsAny(to+subject, "\r\n") {
		return errors.New("invalid email header")
	}

	headers := []string{
		"From: " + s.cfg.From,
		"To: " + to,
		"Subject: " + mime.QEncoding.Encode("utf-8", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
	}
	message := strings.Join(headers, "\r\n") + "\r\n\r\n" + strings.ReplaceAll(body, "\n", "\r\n")

	auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
	address := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	if err := smtp.SendMail(address, auth, envelope(s.cfg.From), []string{to}, []byte(message)); err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	return nil
}

func envelope(from string) string {
	start := strings.LastIndex(from, "<")
	end := strings.LastIndex(from, ">")
	if start >= 0 && end > start {
		return from[start+1 : end]
	}
	return from
}
