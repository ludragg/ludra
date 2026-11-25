package unfurl

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
)

const oembedLimit = 64 << 10

var (
	videoPattern     = regexp.MustCompile(`^[\w-]{11}$`)
	videoPathPattern = regexp.MustCompile(`^/(?:shorts|embed|live)/([\w-]{11})`)
	thumbnailNames   = []string{"maxresdefault", "hq720", "mqdefault"}
)

func videoID(target *url.URL) string {
	host := strings.ToLower(target.Hostname())
	for _, prefix := range []string{"www.", "m.", "music."} {
		if trimmed, found := strings.CutPrefix(host, prefix); found {
			host = trimmed
			break
		}
	}

	var id string
	switch host {
	case "youtu.be":
		id, _, _ = strings.Cut(strings.TrimPrefix(target.Path, "/"), "/")
	case "youtube.com":
		if target.Path == "/watch" {
			id = target.Query().Get("v")
		} else if match := videoPathPattern.FindStringSubmatch(target.Path); match != nil {
			id = match[1]
		}
	}
	if !videoPattern.MatchString(id) {
		return ""
	}
	return id
}

func strippedPage(target *url.URL, title string) bool {
	host := bareHost(target)
	if host != "youtube.com" && host != "m.youtube.com" && host != "youtu.be" {
		return false
	}
	title = strings.TrimSpace(title)
	return title == "YouTube" || title == "- YouTube"
}

func (f *Fetcher) video(ctx context.Context, address, id string) (Preview, error) {
	endpoint := "https://www.youtube.com/oembed?format=json&url=" +
		url.QueryEscape("https://www.youtube.com/watch?v="+id)
	body, _, err := f.get(ctx, endpoint, oembedLimit, "application/json")
	if err != nil {
		return Preview{}, err
	}
	var data struct {
		Title  string `json:"title"`
		Author string `json:"author_name"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return Preview{}, err
	}
	if strings.TrimSpace(data.Title) == "" {
		return Preview{}, errors.New("no title")
	}

	preview := Preview{URL: address, Site: "YouTube", Title: clean(data.Title, 200), Description: clean(data.Author, 300)}
	for _, name := range thumbnailNames {
		picture, _, err := f.get(ctx, "https://i.ytimg.com/vi/"+id+"/"+name+".jpg", imageLimit, "image/")
		if err != nil {
			continue
		}
		if image, width, height, err := thumbnail(picture); err == nil {
			preview.Image, preview.Width, preview.Height = image, width, height
			break
		}
	}
	return preview, nil
}
