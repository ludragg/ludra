package gifs

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"ludra/internal/failure"
	"ludra/internal/imaging"
	"ludra/internal/unfurl"
)

const (
	apiBase       = "https://api.klipy.com/v2/"
	pageSize      = 24
	responseLimit = 2 << 20
	previewLimit  = 2 << 20
	knownTTL      = 6 * time.Hour
	knownLimit    = 5000
	previewBudget = 48 << 20
	maxQuery      = 100
)

var (
	ErrUnavailable = failure.New(failure.Unavailable, "gifs are not available")
	ErrNotFound    = failure.New(failure.NotFound, "gif not found")
)

type Gif struct {
	ID            string
	Title         string
	PreviewURL    string
	PreviewWidth  int
	PreviewHeight int
	URL           string
}

type known struct {
	gif     Gif
	expires time.Time
}

type Client struct {
	key     string
	fetcher *unfurl.Fetcher

	mu       sync.Mutex
	known    map[string]known
	previews map[string][]byte
	order    []string
	bytes    int
}

func New(key string, fetcher *unfurl.Fetcher) *Client {
	return &Client{
		key:      key,
		fetcher:  fetcher,
		known:    map[string]known{},
		previews: map[string][]byte{},
	}
}

type media struct {
	URL  string `json:"url"`
	Dims []int  `json:"dims"`
	Size int    `json:"size"`
}

type response struct {
	Results []struct {
		ID                 string           `json:"id"`
		Title              string           `json:"title"`
		ContentDescription string           `json:"content_description"`
		MediaFormats       map[string]media `json:"media_formats"`
	} `json:"results"`
	Next string `json:"next"`
}

func (c *Client) Search(ctx context.Context, query, pos, locale string) ([]Gif, string, error) {
	if c.key == "" {
		return nil, "", ErrUnavailable
	}
	query = strings.TrimSpace(query)
	if len([]rune(query)) > maxQuery {
		query = string([]rune(query)[:maxQuery])
	}

	params := url.Values{}
	params.Set("key", c.key)
	params.Set("limit", strconv.Itoa(pageSize))
	params.Set("media_filter", "gif,tinygif,nanogif,mediumgif")
	params.Set("contentfilter", "medium")
	if locale != "" {
		params.Set("locale", locale)
	}
	if pos != "" {
		params.Set("pos", pos)
	}
	endpoint := "featured"
	if query != "" {
		endpoint = "search"
		params.Set("q", query)
	}

	body, err := c.fetcher.Download(ctx, apiBase+endpoint+"?"+params.Encode(), responseLimit, "application/json")
	if err != nil {
		return nil, "", err
	}
	result, next, err := parse(body)
	if err != nil {
		return nil, "", err
	}
	c.remember(result)
	return result, next, nil
}

func parse(body []byte) ([]Gif, string, error) {
	var parsed response
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, "", err
	}

	result := make([]Gif, 0, len(parsed.Results))
	for _, item := range parsed.Results {
		preview, ok := pick(item.MediaFormats, previewLimit, "tinygif", "nanogif", "mediumgif", "gif")
		full, fullOK := pick(item.MediaFormats, imaging.MaxPhotoBytes, "gif", "mediumgif", "tinygif")
		if !ok || !fullOK || item.ID == "" {
			continue
		}
		title := item.Title
		if title == "" {
			title = item.ContentDescription
		}
		result = append(result, Gif{
			ID:            item.ID,
			Title:         title,
			PreviewURL:    preview.URL,
			PreviewWidth:  preview.Dims[0],
			PreviewHeight: preview.Dims[1],
			URL:           full.URL,
		})
	}
	return result, parsed.Next, nil
}

func (c *Client) Preview(ctx context.Context, id string) ([]byte, error) {
	gif, ok := c.lookup(id)
	if !ok {
		return nil, ErrNotFound
	}
	c.mu.Lock()
	data, cached := c.previews[id]
	c.mu.Unlock()
	if cached {
		return data, nil
	}

	data, err := c.fetcher.Download(ctx, gif.PreviewURL, previewLimit, "image/")
	if err != nil {
		return nil, err
	}
	c.keepPreview(id, data)
	return data, nil
}

func (c *Client) Full(ctx context.Context, id string) ([]byte, error) {
	gif, ok := c.lookup(id)
	if !ok {
		return nil, ErrNotFound
	}
	return c.fetcher.Download(ctx, gif.URL, imaging.MaxPhotoBytes, "image/")
}

func pick(formats map[string]media, limit int, names ...string) (media, bool) {
	for _, name := range names {
		format, ok := formats[name]
		if ok && format.URL != "" && format.Size <= limit && len(format.Dims) == 2 && format.Dims[0] > 0 && format.Dims[1] > 0 {
			return format, true
		}
	}
	return media{}, false
}

func (c *Client) remember(list []Gif) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	if len(c.known)+len(list) > knownLimit {
		for id, entry := range c.known {
			if now.After(entry.expires) || len(c.known)+len(list) > knownLimit {
				delete(c.known, id)
			}
		}
	}
	for _, gif := range list {
		c.known[gif.ID] = known{gif: gif, expires: now.Add(knownTTL)}
	}
}

func (c *Client) lookup(id string) (Gif, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.known[id]
	if !ok || time.Now().After(entry.expires) {
		return Gif{}, false
	}
	return entry.gif, true
}

func (c *Client) keepPreview(id string, data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.previews[id]; ok {
		return
	}
	c.previews[id] = data
	c.order = append(c.order, id)
	c.bytes += len(data)
	for c.bytes > previewBudget && len(c.order) > 0 {
		oldest := c.order[0]
		c.order = c.order[1:]
		c.bytes -= len(c.previews[oldest])
		delete(c.previews, oldest)
	}
}
