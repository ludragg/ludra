package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

const sendTimeout = 10 * time.Second

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

func (s smtpSender) Send(ctx context.Context, to, subject, body string) error {
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

	if err := s.deliver(ctx, to, []byte(message)); err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	return nil
}

func (s smtpSender) deliver(ctx context.Context, to string, message []byte) error {
	ctx, cancel := context.WithTimeout(ctx, sendTimeout)
	defer cancel()

	address := net.JoinHostPort(s.cfg.Host, s.cfg.Port)
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	deadline, _ := ctx.Deadline()
	if err := conn.SetDeadline(deadline); err != nil {
		conn.Close()
		return err
	}

	client, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		conn.Close()
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: s.cfg.Host}); err != nil {
			return err
		}
	}
	if ok, _ := client.Extension("AUTH"); ok {
		if err := client.Auth(smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)); err != nil {
			return err
		}
	}
	if err := client.Mail(envelope(s.cfg.From)); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(message); err != nil {
		writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func envelope(from string) string {
	start := strings.LastIndex(from, "<")
	end := strings.LastIndex(from, ">")
	if start >= 0 && end > start {
		return from[start+1 : end]
	}
	return from
}
