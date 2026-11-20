package unfurl

import (
	"bytes"
	"errors"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	thumbnailSide   = 640
	maxSourcePixels = 16_000_000
)

var errBadImage = errors.New("bad image")

func thumbnail(data []byte) ([]byte, int, int, error) {
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width*config.Height > maxSourcePixels {
		return nil, 0, 0, errBadImage
	}
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, 0, 0, errBadImage
	}

	width, height := fit(config.Width, config.Height)
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.ApproxBiLinear.Scale(target, target.Bounds(), source, source.Bounds(), draw.Src, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, target, &jpeg.Options{Quality: 82}); err != nil {
		return nil, 0, 0, err
	}
	return out.Bytes(), width, height, nil
}

func fit(width, height int) (int, int) {
	scale := min(1, float64(thumbnailSide)/float64(width), float64(thumbnailSide)/float64(height))
	return max(1, int(float64(width)*scale)), max(1, int(float64(height)*scale))
}
