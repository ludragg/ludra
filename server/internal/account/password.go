package account

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonMemory  = 19 * 1024
	argonTime    = 2
	argonThreads = 1
	argonKeySize = 32
	saltSize     = 16
)

var (
	encoding = base64.RawStdEncoding
	hashing  = make(chan struct{}, 4)
)

func derive(password, salt []byte, time, memory uint32, threads uint8, size uint32) []byte {
	hashing <- struct{}{}
	defer func() { <-hashing }()
	return argon2.IDKey(password, salt, time, memory, threads, size)
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, saltSize)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	key := derive([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeySize)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		encoding.EncodeToString(salt), encoding.EncodeToString(key),
	), nil
}

func verifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("unsupported password hash")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errors.New("unsupported argon2 version")
	}

	var memory, time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, err
	}

	salt, err := encoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}
	expected, err := encoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}

	key := derive([]byte(password), salt, time, memory, threads, uint32(len(expected)))
	return subtle.ConstantTimeCompare(key, expected) == 1, nil
}
