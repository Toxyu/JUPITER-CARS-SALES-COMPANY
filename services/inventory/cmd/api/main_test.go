package main

import (
	"net/url"
	"testing"
)

func TestParseSearchRejectsInvalidRangesAndTypes(t *testing.T) {
	for _, raw := range []string{"minPrice=80000000&maxPrice=20", "type=spaceship", "minPrice=-1", "q=" + string(make([]byte, 81)), "sort=price_low%3BDROP%20TABLE%20vehicles", "limit=101", "location=../nairobi"} {
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

func TestParseSearchAcceptsKenyanMarketPriceRange(t *testing.T) {
	values := url.Values{"purpose": {"sale"}, "minPrice": {"1100000"}, "maxPrice": {"4000000"}}
	filters, err := parseSearch(values)
	if err != nil {
		t.Fatalf("expected KES price range to parse, got %v", err)
	}
	if filters.minPrice == nil || *filters.minPrice != 1_100_000 {
		t.Fatalf("unexpected KES minimum price: %#v", filters.minPrice)
	}
}

func TestParseSearchAcceptsDiscoveryFiltersAndPagination(t *testing.T) {
	values := url.Values{
		"purpose": {"rental"}, "type": {"suv"}, "yearFrom": {"2018"}, "yearTo": {"2024"},
		"fuel": {"hybrid"}, "transmission": {"automatic"}, "mileageTo": {"80000"},
		"location": {"nairobi"}, "seats": {"5"}, "engineFrom": {"1500"},
		"sort": {"price_low"}, "limit": {"24"}, "offset": {"48"},
	}
	filters, err := parseSearch(values)
	if err != nil {
		t.Fatalf("expected valid discovery filters, got %v", err)
	}
	if filters.purpose != "rental" || filters.location != "nairobi" || filters.limit != 24 || filters.offset != 48 || filters.sort != "price_low" {
		t.Fatalf("unexpected parsed filters: %#v", filters)
	}
}

func TestSearchCacheKeyIncludesAllFilterFacets(t *testing.T) {
	first, err := parseSearch(url.Values{"type": {"suv"}, "fuel": {"hybrid"}})
	if err != nil {
		t.Fatal(err)
	}
	second, err := parseSearch(url.Values{"type": {"suv"}, "fuel": {"diesel"}})
	if err != nil {
		t.Fatal(err)
	}
	if first.key() == second.key() {
		t.Fatal("expected distinct cache keys for distinct filter combinations")
	}
}
