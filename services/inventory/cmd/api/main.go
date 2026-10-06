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
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const cacheTTL = 10 * time.Minute

type Vehicle struct {
	ID           string   `json:"id"`
	VIN          string   `json:"vin"`
	Make         string   `json:"make"`
	Model        string   `json:"model"`
	ModelYear    int      `json:"year"`
	VehicleType  string   `json:"type"`
	SalePrice    *string  `json:"salePrice"`
	DailyRate    *string  `json:"dailyRate"`
	Status       string   `json:"status"`
	ImageURL     *string  `json:"imageUrl"`
	Images       []string `json:"images"`
	VideoURL     *string  `json:"videoUrl,omitempty"`
	Description  string   `json:"description"`
	MileageKM    *int     `json:"mileageKm,omitempty"`
	FuelType     string   `json:"fuelType"`
	Transmission string   `json:"transmission"`
	EngineCC     *int     `json:"engineCc,omitempty"`
	Seats        *int     `json:"seats,omitempty"`
	Color        string   `json:"color"`
	Location     string   `json:"location"`
	Featured     bool     `json:"isFeatured"`
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
	mux.HandleFunc("GET /api/v1/locations", api.listPublicLocations)
	mux.HandleFunc("GET /api/v1/admin/vehicles", api.listAdminVehicles)
	mux.HandleFunc("GET /api/v1/admin/locations", api.listAdminLocations)
	mux.HandleFunc("POST /api/v1/admin/vehicles", api.createAdminVehicle)
	mux.HandleFunc("PUT /api/v1/admin/vehicles/{id}", api.updateAdminVehicle)
	mux.HandleFunc("DELETE /api/v1/admin/vehicles/{id}", api.archiveAdminVehicle)
	mux.HandleFunc("PATCH /api/v1/admin/vehicles/{id}/publish", api.publishAdminVehicle)
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

func (s *server) listPublicLocations(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT slug, name, county FROM locations WHERE is_active=TRUE ORDER BY name`)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "locations temporarily unavailable")
		return
	}
	defer rows.Close()
	type location struct {
		Slug   string `json:"slug"`
		Name   string `json:"name"`
		County string `json:"county"`
	}
	items := make([]location, 0)
	for rows.Next() {
		var item location
		if err := rows.Scan(&item.Slug, &item.Name, &item.County); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read locations")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusServiceUnavailable, "locations temporarily unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
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
	priceColumn := "v.sale_price"
	if filters.purpose == "rental" {
		priceColumn = "v.daily_rate"
	}
	orderBy := "v.is_featured DESC, v.created_at DESC"
	switch filters.sort {
	case "newest":
		orderBy = "v.created_at DESC"
	case "price_low":
		orderBy = priceColumn + " ASC NULLS LAST, v.created_at DESC"
	case "price_high":
		orderBy = priceColumn + " DESC NULLS LAST, v.created_at DESC"
	case "year_new":
		orderBy = "v.model_year DESC, v.created_at DESC"
	case "mileage_low":
		orderBy = "v.mileage_km ASC NULLS LAST, v.created_at DESC"
	}
	query := fmt.Sprintf(`SELECT v.id, v.vin, v.make, v.model, v.model_year, v.vehicle_type, v.sale_price::text, v.daily_rate::text,
		v.status, v.image_url, v.description, COALESCE((SELECT jsonb_agg(image_url ORDER BY sort_order) FROM vehicle_images WHERE vehicle_id = v.id), v.image_urls),
		v.video_url, v.mileage_km, v.fuel_type, v.transmission, v.engine_cc, v.seats, v.color, COALESCE(l.name,''), v.is_featured
		FROM vehicles v LEFT JOIN locations l ON l.id = v.location_id
		WHERE v.status = 'available' AND v.is_published = TRUE AND v.archived_at IS NULL
		AND ($1 = '' OR v.make ILIKE '%%' || $1 || '%%' OR v.model ILIKE '%%' || $1 || '%%' OR v.vin ILIKE '%%' || $1 || '%%')
		AND ($2 = '' OR v.vehicle_type = $2)
		AND (($5 = 'rental' AND v.daily_rate IS NOT NULL) OR ($5 = 'sale' AND v.sale_price IS NOT NULL))
		AND ($3::numeric IS NULL OR %s >= $3)
		AND ($4::numeric IS NULL OR %s <= $4)
		AND ($6::int IS NULL OR v.model_year >= $6) AND ($7::int IS NULL OR v.model_year <= $7)
		AND ($8 = '' OR v.fuel_type = $8) AND ($9 = '' OR v.transmission = $9)
		AND ($10::int IS NULL OR v.mileage_km >= $10) AND ($11::int IS NULL OR v.mileage_km <= $11)
		AND ($12 = '' OR l.slug = $12) AND ($13::int IS NULL OR v.seats >= $13)
		AND ($14::int IS NULL OR v.engine_cc >= $14) AND ($15::int IS NULL OR v.engine_cc <= $15)
		ORDER BY %s LIMIT $16 OFFSET $17`, priceColumn, priceColumn, orderBy)
	rows, err := s.db.Query(r.Context(), query, filters.query, filters.vehicleType, filters.minPrice, filters.maxPrice, filters.purpose,
		filters.yearFrom, filters.yearTo, filters.fuelType, filters.transmission, filters.mileageFrom, filters.mileageTo,
		filters.location, filters.seats, filters.engineFrom, filters.engineTo, filters.limit+1, filters.offset)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "inventory temporarily unavailable")
		return
	}
	defer rows.Close()
	vehicles = make([]Vehicle, 0)
	for rows.Next() {
		var v Vehicle
		if err := rows.Scan(&v.ID, &v.VIN, &v.Make, &v.Model, &v.ModelYear, &v.VehicleType, &v.SalePrice, &v.DailyRate, &v.Status, &v.ImageURL, &v.Description, &v.Images, &v.VideoURL, &v.MileageKM, &v.FuelType, &v.Transmission, &v.EngineCC, &v.Seats, &v.Color, &v.Location, &v.Featured); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read inventory")
			return
		}
		vehicles = append(vehicles, v)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusServiceUnavailable, "inventory temporarily unavailable")
		return
	}
	hasMore := len(vehicles) > filters.limit
	if hasMore {
		vehicles = vehicles[:filters.limit]
	}
	s.writeCache(r.Context(), key, vehicles)
	w.Header().Set("X-Cache", "MISS")
	writeJSON(w, http.StatusOK, map[string]any{"items": vehicles, "limit": filters.limit, "offset": filters.offset, "hasMore": hasMore})
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
	vehicle, err := scanVehicle(s.db.QueryRow(r.Context(), `SELECT id, vin, make, model, model_year, vehicle_type, sale_price::text, daily_rate::text, status, image_url, description, image_urls, video_url FROM vehicles WHERE vin = $1 AND is_published = TRUE AND archived_at IS NULL`, vin))
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
	query        string
	vehicleType  string
	purpose      string
	minPrice     *float64
	maxPrice     *float64
	yearFrom     *int
	yearTo       *int
	fuelType     string
	transmission string
	mileageFrom  *int
	mileageTo    *int
	location     string
	seats        *int
	engineFrom   *int
	engineTo     *int
	sort         string
	limit        int
	offset       int
}

var locationSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func parseSearch(values url.Values) (searchFilters, error) {
	filters := searchFilters{
		query: strings.TrimSpace(values.Get("q")), vehicleType: strings.TrimSpace(values.Get("type")), purpose: values.Get("purpose"),
		fuelType: strings.ToLower(strings.TrimSpace(values.Get("fuel"))), transmission: strings.ToLower(strings.TrimSpace(values.Get("transmission"))),
		location: strings.ToLower(strings.TrimSpace(values.Get("location"))), sort: values.Get("sort"),
	}
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
	if filters.fuelType != "" && !oneOf(filters.fuelType, "petrol", "diesel", "hybrid", "electric", "unknown") {
		return filters, fmt.Errorf("unsupported fuel type")
	}
	if filters.transmission != "" && !oneOf(filters.transmission, "automatic", "manual", "unknown") {
		return filters, fmt.Errorf("unsupported transmission")
	}
	if filters.location != "" && (len(filters.location) > 80 || !locationSlugPattern.MatchString(filters.location)) {
		return filters, fmt.Errorf("invalid location")
	}
	if filters.sort == "" {
		filters.sort = "featured"
	}
	if !oneOf(filters.sort, "featured", "newest", "price_low", "price_high", "year_new", "mileage_low") {
		return filters, fmt.Errorf("unsupported sort order")
	}
	for name, target := range map[string]**float64{"minPrice": &filters.minPrice, "maxPrice": &filters.maxPrice} {
		value := values.Get(name)
		if value == "" {
			continue
		}
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil || parsed < 0 || parsed > 100_000_000 {
			return filters, fmt.Errorf("%s must be between 0 and 100000000 KES", name)
		}
		*target = &parsed
	}
	if filters.minPrice != nil && filters.maxPrice != nil && *filters.minPrice > *filters.maxPrice {
		return filters, fmt.Errorf("minPrice cannot exceed maxPrice")
	}
	for key, target := range map[string]**int{"yearFrom": &filters.yearFrom, "yearTo": &filters.yearTo, "mileageFrom": &filters.mileageFrom, "mileageTo": &filters.mileageTo, "seats": &filters.seats, "engineFrom": &filters.engineFrom, "engineTo": &filters.engineTo} {
		minimum, maximum := 0, 2_000_000
		switch key {
		case "yearFrom", "yearTo":
			minimum, maximum = 1886, 2100
		case "seats":
			minimum, maximum = 1, 80
		case "engineFrom", "engineTo":
			minimum, maximum = 0, 20_000
		}
		value := values.Get(key)
		if value == "" {
			continue
		}
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < minimum || parsed > maximum {
			return filters, fmt.Errorf("%s is outside its allowed range", key)
		}
		*target = &parsed
	}
	if filters.yearFrom != nil && filters.yearTo != nil && *filters.yearFrom > *filters.yearTo {
		return filters, fmt.Errorf("yearFrom cannot exceed yearTo")
	}
	if filters.mileageFrom != nil && filters.mileageTo != nil && *filters.mileageFrom > *filters.mileageTo {
		return filters, fmt.Errorf("mileageFrom cannot exceed mileageTo")
	}
	if filters.engineFrom != nil && filters.engineTo != nil && *filters.engineFrom > *filters.engineTo {
		return filters, fmt.Errorf("engineFrom cannot exceed engineTo")
	}
	filters.limit = 24
	filters.offset = 0
	if value := values.Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 100 {
			return filters, fmt.Errorf("limit must be between 1 and 100")
		}
		filters.limit = parsed
	}
	if value := values.Get("offset"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 0 || parsed > 100_000 {
			return filters, fmt.Errorf("offset must be between 0 and 100000")
		}
		filters.offset = parsed
	}
	return filters, nil
}

func (f searchFilters) key() string {
	values := url.Values{
		"q": {strings.ToLower(f.query)}, "type": {f.vehicleType}, "purpose": {f.purpose}, "fuel": {f.fuelType},
		"transmission": {f.transmission}, "location": {f.location}, "sort": {f.sort},
		"limit": {strconv.Itoa(f.limit)}, "offset": {strconv.Itoa(f.offset)},
	}
	if f.minPrice != nil {
		values.Set("minPrice", strconv.FormatFloat(*f.minPrice, 'f', 2, 64))
	}
	if f.maxPrice != nil {
		values.Set("maxPrice", strconv.FormatFloat(*f.maxPrice, 'f', 2, 64))
	}
	for key, value := range map[string]*int{"yearFrom": f.yearFrom, "yearTo": f.yearTo, "mileageFrom": f.mileageFrom, "mileageTo": f.mileageTo, "seats": f.seats, "engineFrom": f.engineFrom, "engineTo": f.engineTo} {
		if value != nil {
			values.Set(key, strconv.Itoa(*value))
		}
	}
	return values.Encode()
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
	err := row.Scan(&v.ID, &v.VIN, &v.Make, &v.Model, &v.ModelYear, &v.VehicleType, &v.SalePrice, &v.DailyRate, &v.Status, &v.ImageURL, &v.Description, &v.Images, &v.VideoURL)
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
