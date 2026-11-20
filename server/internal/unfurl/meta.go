package unfurl

import (
	"html"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	metaPattern      = regexp.MustCompile(`(?is)<meta\s[^>]*>`)
	attributePattern = regexp.MustCompile(`(?is)([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`)
	titlePattern     = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	spacePattern     = regexp.MustCompile(`\s+`)
)

type page struct {
	url         string
	site        string
	title       string
	description string
	image       string
}

func readMeta(document string) page {
	document = strings.ToValidUTF8(document, "")
	if end := strings.Index(strings.ToLower(document), "</head>"); end >= 0 {
		document = document[:end]
	}

	values := map[string]string{}
	for _, tag := range metaPattern.FindAllString(document, 400) {
		attributes := map[string]string{}
		for _, match := range attributePattern.FindAllStringSubmatch(tag, 16) {
			attributes[strings.ToLower(match[1])] = match[2] + match[3] + match[4]
		}
		key := strings.ToLower(attributes["property"])
		if key == "" {
			key = strings.ToLower(attributes["name"])
		}
		if _, seen := values[key]; key != "" && !seen {
			values[key] = attributes["content"]
		}
	}

	title := pick(values, "og:title", "twitter:title")
	if title == "" {
		if match := titlePattern.FindStringSubmatch(document); match != nil {
			title = match[1]
		}
	}

	return page{
		url:         strings.TrimSpace(html.UnescapeString(pick(values, "og:url"))),
		site:        clean(pick(values, "og:site_name", "application-name"), 80),
		title:       clean(title, 200),
		description: clean(pick(values, "og:description", "twitter:description", "description"), 300),
		image:       strings.TrimSpace(html.UnescapeString(pick(values, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"))),
	}
}

func pick(values map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(values[key]); value != "" {
			return value
		}
	}
	return ""
}

func clean(value string, limit int) string {
	value = strings.TrimSpace(spacePattern.ReplaceAllString(html.UnescapeString(value), " "))
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:limit-1])) + "…"
}
