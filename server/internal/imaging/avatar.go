package imaging

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"

	"golang.org/x/image/webp"
)

const (
	avatarSize     = 256
	maxAvatarBytes = 48 << 10
)

func ValidAvatar(image []byte) bool {
	if len(image) == 0 || len(image) > maxAvatarBytes {
		return false
	}
	config, err := webp.DecodeConfig(bytes.NewReader(image))
	return err == nil && config.Width == avatarSize && config.Height == avatarSize
}

func Version() (string, error) {
	version := make([]byte, 8)
	if _, err := rand.Read(version); err != nil {
		return "", err
	}
	return hex.EncodeToString(version), nil
}
