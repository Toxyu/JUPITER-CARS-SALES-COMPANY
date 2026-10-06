package main

import (
	"net/url"
	"testing"
)

func TestParseSearchRejectsInvalidRangesAndTypes(t *testing.T) {
	for _, raw := range []string{"minPrice=80&maxPrice=20", "type=spaceship", "minPrice=-1", "q=" + string(make([]byte, 81))} {
		t.Run(raw, func(t *testing.T) {
			values, err := url.ParseQuery(raw)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := parseSearch(values); err == nil {
				t.Fatalf("expected invalid search parameters to be rejected")
			}
		})
	}
}

func TestSearchCacheKeyNormalizesQuery(t *testing.T) {
	first, err := parseSearch(url.Values{"q": {"Tesla"}, "type": {"sedan"}})
	if err != nil {
		t.Fatal(err)
	}
	second, err := parseSearch(url.Values{"q": {"tesla"}, "type": {"sedan"}})
	if err != nil {
		t.Fatal(err)
	}
	if first.key() != second.key() {
		t.Fatalf("expected case-insensitive cache keys, got %q and %q", first.key(), second.key())
	}
}