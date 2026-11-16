package updates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

const (
	manifestName = "latest.json"
	cacheFor     = 5 * time.Minute
	retryAfter   = 30 * time.Second
	maxBody      = 1 << 20
)

var ErrNoRelease = errors.New("no published release with an update manifest")

type Feed struct {
	repo    string
	client  *http.Client
	mu      sync.Mutex
	body    []byte
	expires time.Time
}

func NewFeed(repo string) *Feed {
	return &Feed{
		repo:   repo,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (f *Feed) Latest(ctx context.Context) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if time.Now().Before(f.expires) {
		if f.body == nil {
			return nil, ErrNoRelease
		}
		return f.body, nil
	}

	body, err := f.fetch(ctx)
	if err != nil {
		f.expires = time.Now().Add(retryAfter)
		if f.body != nil {
			return f.body, nil
		}
		return nil, err
	}

	f.body = body
	f.expires = time.Now().Add(cacheFor)
	return body, nil
}

type release struct {
	Draft  bool `json:"draft"`
	Assets []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

func (f *Feed) fetch(ctx context.Context) ([]byte, error) {
	var releases []release
	listURL := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=20", f.repo)
	if err := f.getJSON(ctx, listURL, "application/vnd.github+json", &releases); err != nil {
		return nil, err
	}

	for _, release := range releases {
		if release.Draft {
			continue
		}
		for _, asset := range release.Assets {
			if asset.Name != manifestName {
				continue
			}
			var manifest struct {
				Version string `json:"version"`
			}
			body, err := f.get(ctx, asset.URL, "application/octet-stream")
			if err != nil {
				return nil, err
			}
			if err := json.Unmarshal(body, &manifest); err != nil || manifest.Version == "" {
				return nil, fmt.Errorf("invalid update manifest in %s", asset.URL)
			}
			return body, nil
		}
	}
	return nil, ErrNoRelease
}

func (f *Feed) getJSON(ctx context.Context, url, accept string, target any) error {
	body, err := f.get(ctx, url, accept)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, target)
}

func (f *Feed) get(ctx context.Context, url, accept string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", accept)
	request.Header.Set("User-Agent", "ludra-server")

	response, err := f.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", url, response.Status)
	}
	return io.ReadAll(io.LimitReader(response.Body, maxBody))
}
