package main

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func TestParseForwardedIdentityAndRoles(t *testing.T) {
	payload, err := json.Marshal(map[string]any{
		"sub":          "staff-123",
		"realm_access": map[string]any{"roles": []string{"CONTENT_MANAGER"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	identity, err := parseForwardedIdentity(encoded)
	if err != nil {
		t.Fatalf("parse identity: %v", err)
	}
	if identity.subject != "staff-123" || !identity.hasAnyRole("ADMIN", "CONTENT_MANAGER") {
		t.Fatalf("unexpected identity claims: %#v", identity)
	}
	if identity.hasAnyRole("RENTAL_MANAGER") {
		t.Fatal("content manager must not inherit rental-manager permissions")
	}
}

func TestParseForwardedIdentityRejectsInvalidPayloads(t *testing.T) {
	for _, input := range []string{"", "not-base64", base64.RawURLEncoding.EncodeToString([]byte(`{"realm_access":{}}`))} {
		if _, err := parseForwardedIdentity(input); err == nil {
			t.Fatalf("expected invalid identity %q to be rejected", input)
		}
	}
}

func TestValidateAdminVehicleEnforcesKenyanKESAndHTTPSMedia(t *testing.T) {
	price := int64(1_850_000)
	valid := AdminVehicleInput{
		VIN: "JTDBR32E502123456", Make: "Toyota", Model: "Corolla Fielder", Year: 2019,
		Type: "sedan", SalePrice: &price, Status: "available",
		Images: []string{"https://cdn.example.test/fielder.webp"},
	}
	if err := validateAdminVehicle(valid); err != nil {
		t.Fatalf("expected valid KES listing, got %v", err)
	}
	valid.Images = []string{"http://untrusted.example.test/car.jpg"}
	if err := validateAdminVehicle(valid); err == nil {
		t.Fatal("expected insecure image URL to be rejected")
	}
}
