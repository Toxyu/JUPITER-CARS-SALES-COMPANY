package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const cacheTTL = 10 * time.Minute

type Vehicle struct {
	ID          string  `json:"id"`
	VIN         string  `json:"vin"`
	Make        string  `json:"make"`
	Model       string  `json:"model"`
	ModelYear   int     `json:"year"`
	VehicleType string  `json:"type"`
	SalePrice   *string `json:"salePrice"`
	DailyRate   *string `json:"dailyRate"`
	Status      string  `json:"status"`
	ImageURL    *string `json:"imageUrl"`
	Description string  `json:"description"`
}

type server struct {
	db    *pgxpool.Pool
	cache *redis.Client
}

func main() {
	ctx := context.Background()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("configure database: %v", err)
	}
	defer db.Close()

	cache := redis.NewClient(&redis.Options{Addr: envOr("REDIS_ADDR", "localhost:6379"), DialTimeout: 2 * time.Second, ReadTimeout: 2 * time.Second, WriteTimeout: 2 * time.Second})
	defer cache.Close()

	api := &server{db: db, cache: cache}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", api.health)
	mux.HandleFunc("GET /api/v1/vehicles/search", api.searchVehicles)
	mux.HandleFunc("GET /api/v1/vehicles/{vin}", api.getVehicle)
	port := envOr("PORT", "8080")
	httpServer := &http.Server{Addr: "0.0.0.0:" + port, Handler: requestLog(mux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		log.Printf("inventory API listening on :%s", port)
	}()
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) searchVehicles(w http.ResponseWriter, r *http.Request) {
	filters, err := parseSearch(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	key := "vehicles:search:" + filters.key()
	var vehicles []Vehicle
	if s.readCache(r.Context(), key, &vehicles) {
		w.Header().Set("X-Cache", "HIT")
		writeJSON(w, http.StatusOK, map[string]any{"items": vehicles})
		return
	}
	query := `SELECT id, vin, make, model, model_year, vehicle_type, sale_price::text, daily_rate::text, status, image_url, description
		FROM vehicles WHERE status = 'available'
		AND ($1 = '' OR make ILIKE '%' || $1 || '%' OR model ILIKE '%' || $1 || '%' OR vin ILIKE '%' || $1 || '%')
		AND ($2 = '' OR vehicle_type = $2)
		AND (($5 = 'rental' AND daily_rate IS NOT NULL) OR ($5 = 'sale' AND sale_price IS NOT NULL))
		AND ($3::numeric IS NULL OR (CASE WHEN $5 = 'rental' THEN daily_rate ELSE sale_price END) >= $3)
		AND ($4::numeric IS NULL OR (CASE WHEN $5 = 'rental' THEN daily_rate ELSE sale_price END) <= $4)
		ORDER BY created_at DESC LIMIT 100`
	rows, err := s.db.Query(r.Context(), query, filters.query, filters.vehicleType, filters.minPrice, filters.maxPrice, filters.purpose)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "inventory temporarily unavailable")
		return
	}
	defer rows.Close()
	vehicles = make([]Vehicle, 0)
	for rows.Next() {
		var v Vehicle
		if err := rows.Scan(&v.ID, &v.VIN, &v.Make, &v.Model, &v.ModelYear, &v.VehicleType, &v.SalePrice, &v.DailyRate, &v.Status, &v.ImageURL, &v.Description); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read inventory")
			return
		}
		vehicles = append(vehicles, v)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusServiceUnavailable, "inventory temporarily unavailable")
		return
	}
	s.writeCache(r.Context(), key, vehicles)
	w.Header().Set("X-Cache", "MISS")
	writeJSON(w, http.StatusOK, map[string]any{"items": vehicles})
}

func (s *server) getVehicle(w http.ResponseWriter, r *http.Request) {
	vin := strings.ToUpper(strings.TrimSpace(r.PathValue("vin")))
	if len(vin) != 17 {
		writeError(w, http.StatusBadRequest, "VIN must contain 17 characters")
		return
	}
	key := "vehicle:" + vin
	var vehicle Vehicle
	if s.readCache(r.Context(), key, &vehicle) {
		w.Header().Set("X-Cache", "HIT")
		writeJSON(w, http.StatusOK, vehicle)
		return
	}
	vehicle, err := scanVehicle(s.db.QueryRow(r.Context(), `SELECT id, vin, make, model, model_year, vehicle_type, sale_price::text, daily_rate::text, status, image_url, description FROM vehicles WHERE vin = $1`, vin))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "vehicle not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "inventory temporarily unavailable")
		return
	}
	s.writeCache(r.Context(), key, vehicle)
	w.Header().Set("X-Cache", "MISS")
	writeJSON(w, http.StatusOK, vehicle)
}

type searchFilters struct {
	query       string
	vehicleType string
	purpose     string
	minPrice    *float64
	maxPrice    *float64
}

func parseSearch(values url.Values) (searchFilters, error) {
	filters := searchFilters{query: strings.TrimSpace(values.Get("q")), vehicleType: strings.TrimSpace(values.Get("type")), purpose: values.Get("purpose")}
	if filters.purpose == "" {
		filters.purpose = "sale"
	}
	if filters.purpose != "sale" && filters.purpose != "rental" {
		return filters, fmt.Errorf("purpose must be sale or rental")
	}
	if len(filters.query) > 80 {
		return filters, fmt.Errorf("q must be at most 80 characters")
	}
	if filters.vehicleType != "" && !oneOf(filters.vehicleType, "sedan", "suv", "truck", "coupe", "van", "other") {
		return filters, fmt.Errorf("unsupported vehicle type")
	}
	for name, target := range map[string]**float64{"minPrice": &filters.minPrice, "maxPrice": &filters.maxPrice} {
		value := values.Get(name)
		if value == "" {
			continue
		}
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil || parsed < 0 || parsed > 1_000_000 {
			return filters, fmt.Errorf("%s must be between 0 and 1000000", name)
		}
		*target = &parsed
	}
	if filters.minPrice != nil && filters.maxPrice != nil && *filters.minPrice > *filters.maxPrice {
		return filters, fmt.Errorf("minPrice cannot exceed maxPrice")
	}
	return filters, nil
}

func (f searchFilters) key() string {
	min, max := "", ""
	if f.minPrice != nil {
		min = strconv.FormatFloat(*f.minPrice, 'f', 2, 64)
	}
	if f.maxPrice != nil {
		max = strconv.FormatFloat(*f.maxPrice, 'f', 2, 64)
	}
	return fmt.Sprintf("q=%s&type=%s&purpose=%s&min=%s&max=%s", strings.ToLower(f.query), f.vehicleType, f.purpose, min, max)
}

func (s *server) readCache(ctx context.Context, key string, target any) bool {
	value, err := s.cache.Get(ctx, key).Bytes()
	if err != nil {
		return false
	}
	if json.Unmarshal(value, target) != nil {
		_ = s.cache.Del(ctx, key).Err()
		return false
	}
	return true
}

func (s *server) writeCache(ctx context.Context, key string, value any) {
	data, err := json.Marshal(value)
	if err == nil {
		_ = s.cache.Set(ctx, key, data, cacheTTL).Err()
	}
}

func scanVehicle(row pgx.Row) (Vehicle, error) {
	var v Vehicle
	err := row.Scan(&v.ID, &v.VIN, &v.Make, &v.Model, &v.ModelYear, &v.VehicleType, &v.SalePrice, &v.DailyRate, &v.Status, &v.ImageURL, &v.Description)
	return v, err
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("http request", "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(started).Milliseconds())
	})
}