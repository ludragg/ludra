package imaging

import (
	"bytes"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

const (
	MaxPhotoBytes = 8 << 20
	maxPhotoSide  = 4096
)

var photoTypes = map[string]string{
	"png":  "image/png",
	"jpeg": "image/jpeg",
	"gif":  "image/gif",
	"webp": "image/webp",
}

type Photo struct {
	Width  int
	Height int
	Mime   string
}

func ReadPhoto(data []byte) (Photo, bool) {
	if len(data) == 0 || len(data) > MaxPhotoBytes {
		return Photo{}, false
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Photo{}, false
	}
	mime, ok := photoTypes[format]
	if !ok || config.Width <= 0 || config.Height <= 0 || config.Width > maxPhotoSide || config.Height > maxPhotoSide {
		return Photo{}, false
	}
	return Photo{Width: config.Width, Height: config.Height, Mime: mime}, true
}
