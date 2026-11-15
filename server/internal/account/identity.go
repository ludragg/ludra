package account

import (
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"

	"ludra/internal/database"
	"ludra/internal/ids"
)

const maxIdentityLookups = 20

func (s *Service) SetIdentityKey(ctx context.Context, userID, key string) error {
	if !validIdentityKey(key) {
		return ErrInvalidIdentityKey
	}
	return s.queries.SetIdentityKey(ctx, database.SetIdentityKeyParams{ID: userID, IdentityKey: key})
}

func (s *Service) IdentityKeys(ctx context.Context, userIDs []string) (map[string]string, error) {
	valid := make([]string, 0, len(userIDs))
	for _, id := range userIDs {
		if ids.Valid(id) && len(valid) < maxIdentityLookups {
			valid = append(valid, id)
		}
	}
	rows, err := s.queries.ListIdentityKeys(ctx, valid)
	if err != nil {
		return nil, err
	}
	keys := make(map[string]string, len(rows))
	for _, row := range rows {
		if row.IdentityKey != "" {
			keys[row.ID] = row.IdentityKey
		}
	}
	return keys, nil
}

func validIdentityKey(key string) bool {
	if len(key) == 0 || len(key) > 200 {
		return false
	}
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return false
	}
	parsed, err := x509.ParsePKIXPublicKey(raw)
	if err != nil {
		return false
	}
	_, ok := parsed.(*ecdsa.PublicKey)
	return ok
}
