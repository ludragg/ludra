package unfurl

import (
	"regexp"
	"strings"
)

const maxLinkLength = 2048

var linkPattern = regexp.MustCompile(`(?i)(?:^|[\s(<\[{"'])((?:https?://|www\.)[^\s\p{Cf}]+)`)

type Link struct {
	URL  string
	Text string
}

func FirstLink(content string) (Link, bool) {
	for _, match := range linkPattern.FindAllStringSubmatch(content, 8) {
		text := strings.TrimRightFunc(match[1], trailing)
		if len(text) < 8 || len(text) > maxLinkLength {
			continue
		}
		address := text
		if !strings.HasPrefix(strings.ToLower(address), "http") {
			address = "https://" + address
		}
		return Link{URL: address, Text: text}, true
	}
	return Link{}, false
}

func trailing(r rune) bool {
	return strings.ContainsRune(".,!?;:)]}'\">", r)
}
