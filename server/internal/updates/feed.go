package updates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

const (
	manifestName = "latest.json"
	pollEvery    = 30 * time.Second
	maxBody      = 1 << 20
)

var ErrNoRelease = errors.New("no published release with an update manifest")

type Feed struct {
	repo    string
	client  *http.Client
	mu      sync.RWMutex
	body    []byte
	version string
	asset   string
	etag    string
}

func NewFeed(repo string) *Feed {
	return &Feed{
		repo:   repo,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (f *Feed) Latest() ([]byte, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	if f.body == nil {
		return nil, ErrNoRelease
	}
	return f.body, nil
}

func (f *Feed) Run(ctx context.Context, released func(version string)) {
	ticker := time.NewTicker(pollEvery)
	defer ticker.Stop()

	for {
		previous := f.currentVersion()
		version, err := f.refresh(ctx)
		if err != nil && ctx.Err() == nil && !errors.Is(err, ErrNoRelease) {
			slog.Warn("update feed unavailable", "error", err)
		}
		if err == nil && previous != "" && version != previous {
			slog.Info("new release published", "version", version)
			released(version)
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (f *Feed) currentVersion() string {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.version
}

type release struct {
	Draft  bool `json:"draft"`
	Assets []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

func (f *Feed) refresh(ctx context.Context) (string, error) {
	f.mu.RLock()
	etag, current, version := f.etag, f.asset, f.version
	f.mu.RUnlock()

	listURL := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=20", f.repo)
	body, newETag, err := f.get(ctx, listURL, "application/vnd.github+json", etag)
	if err != nil {
		return "", err
	}
	if body == nil {
		return version, nil
	}

	var releases []release
	if err := json.Unmarshal(body, &releases); err != nil {
		return "", err
	}

	asset := newestManifest(releases)
	if asset == "" {
		return "", ErrNoRelease
	}
	if asset == current {
		f.setETag(newETag)
		return version, nil
	}

	manifest, _, err := f.get(ctx, asset, "application/octet-stream", "")
	if err != nil {
		return "", err
	}
	var parsed struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(manifest, &parsed); err != nil || parsed.Version == "" {
		return "", fmt.Errorf("invalid update manifest in %s", asset)
	}

	f.mu.Lock()
	f.body, f.version, f.asset, f.etag = manifest, parsed.Version, asset, newETag
	f.mu.Unlock()
	return parsed.Version, nil
}

func (f *Feed) setETag(etag string) {
	f.mu.Lock()
	f.etag = etag
	f.mu.Unlock()
}

func newestManifest(releases []release) string {
	for _, release := range releases {
		if release.Draft {
			continue
		}
		for _, asset := range release.Assets {
			if asset.Name == manifestName {
				return asset.URL
			}
		}
	}
	return ""
}

func (f *Feed) get(ctx context.Context, url, accept, etag string) ([]byte, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("Accept", accept)
	request.Header.Set("User-Agent", "ludra-server")
	if etag != "" {
		request.Header.Set("If-None-Match", etag)
	}

	response, err := f.client.Do(request)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()

	switch response.StatusCode {
	case http.StatusNotModified:
		return nil, etag, nil
	case http.StatusOK:
		body, err := io.ReadAll(io.LimitReader(response.Body, maxBody))
		return body, response.Header.Get("ETag"), err
	default:
		return nil, "", fmt.Errorf("GET %s: %s", url, response.Status)
	}
}
