package unfurl

import (
	"context"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	pageLimit    = 2 << 20
	imageLimit   = 5 << 20
	maxRedirects = 3
	cacheTTL     = time.Hour
	cacheSize    = 512
	parallel     = 4
	userAgent    = "Mozilla/5.0 (compatible; LudraBot/1.0; +https://github.com/ludragg/ludra)"
)

type Preview struct {
	URL         string
	Site        string
	Title       string
	Description string
	Image       []byte
	Width       int
	Height      int
}

type cached struct {
	preview Preview
	ok      bool
	expires time.Time
}

type Fetcher struct {
	client *http.Client
	slots  chan struct{}
	mu     sync.Mutex
	cache  map[string]cached
}

func New() *Fetcher {
	dialer := &net.Dialer{Timeout: 5 * time.Second, Control: safeDial}
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 5 * time.Second,
		MaxIdleConns:          8,
		IdleConnTimeout:       30 * time.Second,
	}
	return &Fetcher{
		client: &http.Client{
			Transport: transport,
			Timeout:   10 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= maxRedirects || !allowedScheme(req.URL) {
					return http.ErrUseLastResponse
				}
				return nil
			},
		},
		slots: make(chan struct{}, parallel),
		cache: map[string]cached{},
	}
}

func (f *Fetcher) Fetch(ctx context.Context, rawURL string) (Preview, bool) {
	if entry, ok := f.cached(rawURL); ok {
		return entry.preview, entry.ok
	}

	select {
	case f.slots <- struct{}{}:
		defer func() { <-f.slots }()
	case <-ctx.Done():
		return Preview{}, false
	}

	preview, err := f.fetch(ctx, rawURL)
	f.store(rawURL, preview, err == nil)
	return preview, err == nil
}

func (f *Fetcher) fetch(ctx context.Context, rawURL string) (Preview, error) {
	target, err := url.Parse(rawURL)
	if err != nil || !allowedScheme(target) || target.Hostname() == "" {
		return Preview{}, errors.New("invalid url")
	}

	body, final, err := f.get(ctx, target.String(), pageLimit, "text/html")
	if err != nil {
		return Preview{}, err
	}
	meta := readMeta(string(body))
	if meta.title == "" {
		return Preview{}, errors.New("no title")
	}

	preview := Preview{URL: canonical(rawURL, final, meta.url), Site: meta.site, Title: meta.title, Description: meta.description}
	if preview.Site == "" {
		preview.Site = strings.TrimPrefix(final.Hostname(), "www.")
	}
	if meta.image == "" {
		return preview, nil
	}
	source, err := final.Parse(meta.image)
	if err != nil || !allowedScheme(source) {
		return preview, nil
	}
	data, _, err := f.get(ctx, source.String(), imageLimit, "image/")
	if err != nil {
		return preview, nil
	}
	if image, width, height, err := thumbnail(data); err == nil {
		preview.Image, preview.Width, preview.Height = image, width, height
	}
	return preview, nil
}

func (f *Fetcher) get(ctx context.Context, address string, limit int64, accept string) ([]byte, *url.URL, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
	switch accept {
	case "text/html":
		req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
	case "image/":
		req.Header.Set("Accept", "image/webp,image/png,image/jpeg,image/*;q=0.8")
	default:
		req.Header.Set("Accept", accept)
	}

	res, err := f.client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, nil, errors.New("unexpected status")
	}
	kind, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type"))
	if !strings.HasPrefix(kind, accept) && !(accept == "text/html" && kind == "application/xhtml+xml") {
		return nil, nil, errors.New("unexpected content type")
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return nil, nil, err
	}
	if int64(len(body)) > limit {
		if accept != "text/html" {
			return nil, nil, errors.New("too large")
		}
		body = body[:limit]
	}
	return body, res.Request.URL, nil
}

func (f *Fetcher) Download(ctx context.Context, address string, limit int64, accept string) ([]byte, error) {
	target, err := url.Parse(address)
	if err != nil || !allowedScheme(target) {
		return nil, errors.New("invalid url")
	}
	body, _, err := f.get(ctx, target.String(), limit, accept)
	return body, err
}

func (f *Fetcher) cached(key string) (cached, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	entry, ok := f.cache[key]
	if !ok || time.Now().After(entry.expires) {
		return cached{}, false
	}
	return entry, true
}

func (f *Fetcher) store(key string, preview Preview, ok bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.cache) >= cacheSize {
		for stale := range f.cache {
			delete(f.cache, stale)
			if len(f.cache) < cacheSize/2 {
				break
			}
		}
	}
	f.cache[key] = cached{preview: preview, ok: ok, expires: time.Now().Add(cacheTTL)}
}

func canonical(rawURL string, final *url.URL, declared string) string {
	target, err := final.Parse(declared)
	if declared == "" || err != nil || !allowedScheme(target) || bareHost(target) != bareHost(final) {
		return rawURL
	}
	return target.String()
}

func bareHost(target *url.URL) string {
	return strings.TrimPrefix(strings.ToLower(target.Hostname()), "www.")
}

func allowedScheme(target *url.URL) bool {
	return target.Scheme == "http" || target.Scheme == "https"
}
