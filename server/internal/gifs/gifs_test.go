package gifs

import "testing"

func TestParse(t *testing.T) {
	body := []byte(`{"results":[
		{"id":"1","title":"","content_description":"Cat dance","media_formats":{
			"gif":{"url":"https://static.klipy.com/huge.gif","dims":[1920,1080],"size":20000000},
			"mediumgif":{"url":"https://static.klipy.com/a.gif","dims":[498,280],"size":10},
			"tinygif":{"url":"https://static.klipy.com/a-tiny.gif","dims":[220,124],"size":2}}},
		{"id":"2","title":"broken","media_formats":{"gif":{"url":"","dims":[1,1]}}}
	],"next":"24"}`)
	list, next, err := parse(body)
	if err != nil {
		t.Fatal(err)
	}
	if next != "24" || len(list) != 1 {
		t.Fatalf("got %d gifs, next %q", len(list), next)
	}
	gif := list[0]
	if gif.Title != "Cat dance" || gif.PreviewURL != "https://static.klipy.com/a-tiny.gif" || gif.URL != "https://static.klipy.com/a.gif" || gif.PreviewWidth != 220 {
		t.Fatalf("unexpected gif %+v", gif)
	}
}
