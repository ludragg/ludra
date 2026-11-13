package account

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

const tokenSize = 32

func newToken() (string, []byte, error) {
	raw := make([]byte, tokenSize)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}

	token := base64.RawURLEncoding.EncodeToString(raw)
	return token, hashToken(token), nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
