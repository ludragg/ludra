package unfurl

import (
	"net/netip"
	"net/url"
	"testing"
)

func TestPublic(t *testing.T) {
	blocked := []string{"127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::7f00:1", "64:ff9b:1::a00:1"}
	for _, address := range blocked {
		if public(netip.MustParseAddr(address).Unmap()) {
			t.Errorf("%s should be blocked", address)
		}
	}
	allowed := []string{"140.82.112.3", "8.8.8.8", "2606:4700::1111"}
	for _, address := range allowed {
		if !public(netip.MustParseAddr(address)) {
			t.Errorf("%s should be allowed", address)
		}
	}
}

func TestSafeDialPorts(t *testing.T) {
	if safeDial("tcp4", "140.82.112.3:443", nil) != nil {
		t.Error("port 443 should be allowed")
	}
	if safeDial("tcp4", "140.82.112.3:8080", nil) == nil {
		t.Error("port 8080 should be blocked")
	}
	if safeDial("udp4", "140.82.112.3:443", nil) == nil {
		t.Error("udp should be blocked")
	}
}

func TestFirstLink(t *testing.T) {
	cases := map[string]Link{
		"olha https://github.com/ludragg/ludra.": {URL: "https://github.com/ludragg/ludra", Text: "https://github.com/ludragg/ludra"},
		"(www.example.com/path)":                 {URL: "https://www.example.com/path", Text: "www.example.com/path"},
	}
	for input, want := range cases {
		got, ok := FirstLink(input)
		if !ok || got != want {
			t.Errorf("FirstLink(%q) = %+v, %v", input, got, ok)
		}
	}
	for _, input := range []string{"no links here", "bob@www.example.com", "javascript:alert(1)"} {
		if _, ok := FirstLink(input); ok {
			t.Errorf("FirstLink(%q) should find nothing", input)
		}
	}
}

func TestReadMeta(t *testing.T) {
	page := readMeta(`<html><head><title>Fallback</title>
<meta property="og:title" content="GitHub - ludragg/ludra: Open-source app">
<meta content='Chat &amp; play' name="description">
<meta property="og:site_name" content="GitHub">
<meta property="og:image" content="https://example.com/a.png"></head><body><meta property="og:title" content="ignored"></body>`)
	if page.title != "GitHub - ludragg/ludra: Open-source app" || page.description != "Chat & play" || page.site != "GitHub" || page.image != "https://example.com/a.png" {
		t.Errorf("unexpected page: %+v", page)
	}
}

func TestVideoID(t *testing.T) {
	cases := map[string]string{
		"https://www.youtube.com/watch?v=0EsISvNBhS4":         "0EsISvNBhS4",
		"https://m.youtube.com/watch?v=0EsISvNBhS4&t=10":      "0EsISvNBhS4",
		"https://youtu.be/0EsISvNBhS4?si=abc":                 "0EsISvNBhS4",
		"https://youtube.com/shorts/0EsISvNBhS4":              "0EsISvNBhS4",
		"https://www.youtube.com/@channel/live":               "",
		"https://www.youtube.com/watch?v=short":               "",
		"https://example.com/watch?v=0EsISvNBhS4":             "",
		"https://youtube.com.example.com/watch?v=0EsISvNBhS4": "",
	}
	for input, want := range cases {
		target, err := url.Parse(input)
		if err != nil {
			t.Fatal(err)
		}
		if got := videoID(target); got != want {
			t.Errorf("videoID(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestStrippedPage(t *testing.T) {
	youtube, _ := url.Parse("https://www.youtube.com/watch?v=0EsISvNBhS4")
	other, _ := url.Parse("https://example.com/")
	if !strippedPage(youtube, "- YouTube") || !strippedPage(youtube, "YouTube") {
		t.Error("a stripped YouTube page should be refused")
	}
	if strippedPage(youtube, "A video - YouTube") || strippedPage(other, "YouTube") {
		t.Error("real titles should be kept")
	}
}
