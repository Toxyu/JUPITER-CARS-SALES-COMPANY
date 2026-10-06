package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

var validVIN = regexp.MustCompile(`^[A-HJ-NPR-Z0-9]{17}$`)

var adminVehicleSelect = `
	SELECT v.id::text, v.vin, v.make, v.model, v.model_year, v.vehicle_type,
	       v.sale_price::text, v.daily_rate::text, v.status, v.image_url, v.description,
	       COALESCE((SELECT jsonb_agg(image_url ORDER BY sort_order) FROM vehicle_images WHERE vehicle_id = v.id), v.image_urls),
	       v.video_url, v.variant, v.mileage_km, v.fuel_type, v.transmission, v.engine_cc,
	       v.seats, v.color, COALESCE(v.location_id::text, ''), COALESCE(l.name, ''),
	       v.weekly_rate::text, v.monthly_rate::text, v.deposit::text, v.currency,
	       v.is_featured, v.is_published,
	       COALESCE((SELECT jsonb_agg(name ORDER BY category, name) FROM vehicle_features WHERE vehicle_id = v.id), '[]'::jsonb)
	FROM vehicles v LEFT JOIN locations l ON l.id = v.location_id`

type AdminVehicle struct {
	Vehicle
	Variant      string   `json:"variant"`
	MileageKM    *int     `json:"mileageKm"`
	FuelType     string   `json:"fuelType"`
	Transmission string   `json:"transmission"`
	EngineCC     *int     `json:"engineCc"`
	Seats        *int     `json:"seats"`
	Color        string   `json:"color"`
	LocationID   string   `json:"locationId"`
	Location     string   `json:"location"`
	WeeklyRate   *string  `json:"weeklyRate"`
	MonthlyRate  *string  `json:"monthlyRate"`
	Deposit      *string  `json:"deposit"`
	Currency     string   `json:"currency"`
	Featured     bool     `json:"isFeatured"`
	Published    bool     `json:"isPublished"`
	Features     []string `json:"features"`
}

type AdminVehicleInput struct {
	VIN          string   `json:"vin"`
	Make         string   `json:"make"`
	Model        string   `json:"model"`
	Variant      string   `json:"variant"`
	Year         int      `json:"year"`
	Type         string   `json:"type"`
	SalePrice    *int64   `json:"salePrice"`
	DailyRate    *int64   `json:"dailyRate"`
	WeeklyRate   *int64   `json:"weeklyRate"`
	MonthlyRate  *int64   `json:"monthlyRate"`
	Deposit      *int64   `json:"deposit"`
	MileageKM    *int     `json:"mileageKm"`
	FuelType     string   `json:"fuelType"`
	Transmission string   `json:"transmission"`
	EngineCC     *int     `json:"engineCc"`
	Seats        *int     `json:"seats"`
	Color        string   `json:"color"`
	LocationID   string   `json:"locationId"`
	Description  string   `json:"description"`
	Images       []string `json:"images"`
	VideoURL     string   `json:"videoUrl"`
	Features     []string `json:"features"`
	Status       string   `json:"status"`
	Featured     bool     `json:"isFeatured"`
	Published    bool     `json:"isPublished"`
}

type verifiedAdmin struct {
	subject string
	roles   []string
}

func parseForwardedIdentity(encoded string) (verifiedAdmin, error) {
	if encoded == "" || len(encoded) > 16_384 {
		return verifiedAdmin{}, errors.New("missing identity")
	}
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		payload, err = base64.StdEncoding.DecodeString(encoded)
	}
	if err != nil {
		return verifiedAdmin{}, errors.New("invalid identity")
	}
	var claims struct {
		Subject     string `json:"sub"`
		RealmAccess struct {
			Roles []string `json:"roles"`
		} `json:"realm_access"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Subject == "" || len(claims.Subject) > 255 {
		return verifiedAdmin{}, errors.New("invalid identity claims")
	}
	return verifiedAdmin{subject: claims.Subject, roles: claims.RealmAccess.Roles}, nil
}

func (identity verifiedAdmin) hasAnyRole(allowed ...string) bool {
	for _, role := range identity.roles {
		for _, candidate := range allowed {
			if role == candidate || role == "admin" && candidate == "ADMIN" {
				return true
			}
		}
	}
	return false
}

func (s *server) authorizeAdmin(w http.ResponseWriter, r *http.Request, allowed ...string) (verifiedAdmin, bool) {
	identity, err := parseForwardedIdentity(r.Header.Get("x-jwt-payload"))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return verifiedAdmin{}, false
	}
	if !identity.hasAnyRole(allowed...) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return verifiedAdmin{}, false
	}
	return identity, true
}

func (s *server) listAdminVehicles(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.authorizeAdmin(w, r, "SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER", "SALES_MANAGER", "RENTAL_MANAGER"); !ok {
		return
	}
	limit := queryInt(r.URL.Query(), "limit", 50, 1, 100)
	offset := queryInt(r.URL.Query(), "offset", 0, 0, 100_000)
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(search) > 80 || status != "" && !oneOf(status, "available", "reserved", "sold", "maintenance") {
		writeError(w, http.StatusBadRequest, "invalid catalog filter")
		return
	}
	rows, err := s.db.Query(r.Context(), adminVehicleSelect+`
		WHERE v.archived_at IS NULL AND ($1 = '' OR v.status = $1)
		  AND ($2 = '' OR v.make ILIKE '%' || $2 || '%' OR v.model ILIKE '%' || $2 || '%' OR v.vin ILIKE '%' || $2 || '%')
		ORDER BY v.is_featured DESC, v.created_at DESC LIMIT $3 OFFSET $4`, status, search, limit, offset)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	defer rows.Close()
	items := make([]AdminVehicle, 0)
	for rows.Next() {
		vehicle, err := scanAdminVehicle(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not read vehicle catalog")
			return
		}
		items = append(items, vehicle)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "limit": limit, "offset": offset})
}

func (s *server) listAdminLocations(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.authorizeAdmin(w, r, "SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER", "SALES_MANAGER", "RENTAL_MANAGER"); !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id::text, name, county FROM locations WHERE is_active=TRUE ORDER BY name`)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "location catalog unavailable")
		return
	}
	defer rows.Close()
	type location struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		County string `json:"county"`
	}
	items := make([]location, 0)
	for rows.Next() {
		var item location
		if err := rows.Scan(&item.ID, &item.Name, &item.County); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read locations")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusServiceUnavailable, "location catalog unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *server) createAdminVehicle(w http.ResponseWriter, r *http.Request) {
	identity, ok := s.authorizeAdmin(w, r, "SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER")
	if !ok {
		return
	}
	input, err := decodeAdminVehicle(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateAdminVehicle(input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if err := validateLocation(r.Context(), tx, input.LocationID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	imageJSON, _ := json.Marshal(input.Images)
	var id string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO vehicles (vin, make, model, variant, model_year, vehicle_type, sale_price, daily_rate, weekly_rate, monthly_rate, deposit, mileage_km, fuel_type, transmission, engine_cc, seats, color, location_id, status, image_url, image_urls, video_url, description, is_featured, is_published, currency)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NULLIF($18,'')::uuid,$19,$20,$21::jsonb,$22,$23,$24,$25,'KES')
		RETURNING id::text`, input.VIN, input.Make, input.Model, input.Variant, input.Year, input.Type, input.SalePrice, input.DailyRate, input.WeeklyRate, input.MonthlyRate, input.Deposit, input.MileageKM, input.FuelType, input.Transmission, input.EngineCC, input.Seats, input.Color, input.LocationID, input.Status, firstImage(input.Images), string(imageJSON), nullableString(input.VideoURL), input.Description, input.Featured, input.Published).Scan(&id)
	if err != nil {
		writeDatabaseError(w, err)
		return
	}
	if err := replaceVehicleMedia(r.Context(), tx, id, input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := readAdminVehicle(r.Context(), tx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read saved vehicle")
		return
	}
	if err := writeAudit(r.Context(), tx, identity, "vehicle.created", id, nil, created); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record audit entry")
		return
	}
	if err := writeInventoryEvent(r.Context(), tx, id, "vehicle.created", created); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record vehicle event")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "could not save vehicle")
		return
	}
	s.invalidateVehicleCache(r.Context())
	writeJSON(w, http.StatusCreated, created)
}

func (s *server) updateAdminVehicle(w http.ResponseWriter, r *http.Request) {
	identity, ok := s.authorizeAdmin(w, r, "SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER")
	if !ok {
		return
	}
	input, err := decodeAdminVehicle(w, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateAdminVehicle(input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	id := r.PathValue("id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	before, err := readAdminVehicle(r.Context(), tx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "vehicle not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	if err := validateLocation(r.Context(), tx, input.LocationID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	imageJSON, _ := json.Marshal(input.Images)
	_, err = tx.Exec(r.Context(), `
		UPDATE vehicles SET vin=$2, make=$3, model=$4, variant=$5, model_year=$6, vehicle_type=$7, sale_price=$8, daily_rate=$9, weekly_rate=$10, monthly_rate=$11, deposit=$12, mileage_km=$13, fuel_type=$14, transmission=$15, engine_cc=$16, seats=$17, color=$18, location_id=NULLIF($19,'')::uuid, status=$20, image_url=$21, image_urls=$22::jsonb, video_url=$23, description=$24, is_featured=$25, is_published=$26, updated_at=now()
		WHERE id=$1 AND archived_at IS NULL`, id, input.VIN, input.Make, input.Model, input.Variant, input.Year, input.Type, input.SalePrice, input.DailyRate, input.WeeklyRate, input.MonthlyRate, input.Deposit, input.MileageKM, input.FuelType, input.Transmission, input.EngineCC, input.Seats, input.Color, input.LocationID, input.Status, firstImage(input.Images), string(imageJSON), nullableString(input.VideoURL), input.Description, input.Featured, input.Published)
	if err != nil {
		writeDatabaseError(w, err)
		return
	}
	if err := replaceVehicleMedia(r.Context(), tx, id, input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	after, err := readAdminVehicle(r.Context(), tx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read updated vehicle")
		return
	}
	if err := writeAudit(r.Context(), tx, identity, "vehicle.updated", id, before, after); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record audit entry")
		return
	}
	if err := writeInventoryEvent(r.Context(), tx, id, "vehicle.updated", after); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record vehicle event")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "could not save vehicle")
		return
	}
	s.invalidateVehicleCache(r.Context())
	writeJSON(w, http.StatusOK, after)
}

func (s *server) archiveAdminVehicle(w http.ResponseWriter, r *http.Request) {
	identity, ok := s.authorizeAdmin(w, r, "SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER")
	if !ok {
		return
	}
	id := r.PathValue("id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	before, err := readAdminVehicle(r.Context(), tx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "vehicle not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE vehicles SET archived_at=now(), is_published=FALSE, status='maintenance', updated_at=now() WHERE id=$1`, id)
	if err != nil {
		writeDatabaseError(w, err)
		return
	}
	if err := writeAudit(r.Context(), tx, identity, "vehicle.archived", id, before, map[string]any{"archived": true}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record audit entry")
		return
	}
	if err := writeInventoryEvent(r.Context(), tx, id, "vehicle.archived", map[string]any{"vehicleId": id}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record vehicle event")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "could not archive vehicle")
		return
	}
	s.invalidateVehicleCache(r.Context())
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) publishAdminVehicle(w http.ResponseWriter, r *http.Request) {
	identity, ok := s.authorizeAdmin(w, r, "SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER")
	if !ok {
		return
	}
	var input struct {
		Published bool `json:"isPublished"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid publish request")
		return
	}
	id := r.PathValue("id")
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	before, err := readAdminVehicle(r.Context(), tx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "vehicle not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE vehicles SET is_published=$2, updated_at=now() WHERE id=$1`, id, input.Published); err != nil {
		writeDatabaseError(w, err)
		return
	}
	after, err := readAdminVehicle(r.Context(), tx, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read updated vehicle")
		return
	}
	if err := writeAudit(r.Context(), tx, identity, "vehicle.published", id, before, after); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record audit entry")
		return
	}
	if err := writeInventoryEvent(r.Context(), tx, id, "vehicle.updated", after); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record vehicle event")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "could not update publish state")
		return
	}
	s.invalidateVehicleCache(r.Context())
	writeJSON(w, http.StatusOK, after)
}

func decodeAdminVehicle(w http.ResponseWriter, r *http.Request) (AdminVehicleInput, error) {
	var input AdminVehicleInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return input, fmt.Errorf("invalid vehicle payload")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return input, fmt.Errorf("request must contain one JSON object")
	}
	input.VIN = strings.ToUpper(strings.TrimSpace(input.VIN))
	input.Make = strings.TrimSpace(input.Make)
	input.Model = strings.TrimSpace(input.Model)
	input.Variant = strings.TrimSpace(input.Variant)
	input.Color = strings.TrimSpace(input.Color)
	input.Description = strings.TrimSpace(input.Description)
	input.FuelType = strings.ToLower(strings.TrimSpace(input.FuelType))
	input.Transmission = strings.ToLower(strings.TrimSpace(input.Transmission))
	input.Type = strings.ToLower(strings.TrimSpace(input.Type))
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
	if input.Status == "" {
		input.Status = "available"
	}
	input.VideoURL = strings.TrimSpace(input.VideoURL)
	for i := range input.Images {
		input.Images[i] = strings.TrimSpace(input.Images[i])
	}
	for i := range input.Features {
		input.Features[i] = strings.TrimSpace(input.Features[i])
	}
	return input, nil
}

func validateAdminVehicle(v AdminVehicleInput) error {
	if !validVIN.MatchString(v.VIN) || v.Make == "" || len(v.Make) > 60 || v.Model == "" || len(v.Model) > 80 || len(v.Variant) > 100 {
		return errors.New("valid VIN, make, and model are required")
	}
	if v.Year < 1886 || v.Year > 2100 || !oneOf(v.Type, "sedan", "suv", "truck", "coupe", "van", "other") {
		return errors.New("invalid model year or vehicle type")
	}
	if v.SalePrice == nil && v.DailyRate == nil {
		return errors.New("provide a sale price, daily hire rate, or both")
	}
	for label, price := range map[string]*int64{"sale price": v.SalePrice, "daily rate": v.DailyRate, "weekly rate": v.WeeklyRate, "monthly rate": v.MonthlyRate, "deposit": v.Deposit} {
		if price != nil && (*price <= 0 || *price > 1_000_000_000) {
			return fmt.Errorf("%s must be between 1 and 1000000000 KES", label)
		}
	}
	if v.MileageKM != nil && (*v.MileageKM < 0 || *v.MileageKM > 2_000_000) || v.EngineCC != nil && (*v.EngineCC < 0 || *v.EngineCC > 20_000) || v.Seats != nil && (*v.Seats < 1 || *v.Seats > 80) {
		return errors.New("invalid mileage, engine capacity, or seat count")
	}
	if v.Status == "" {
		v.Status = "available"
	}
	if !oneOf(v.Status, "available", "reserved", "sold", "maintenance") || len(v.Description) > 10_000 {
		return errors.New("invalid status or description is too long")
	}
	if len(v.Images) > 20 || len(v.Features) > 80 {
		return errors.New("vehicle can have at most 20 images and 80 features")
	}
	for _, image := range v.Images {
		if !validHTTPSURL(image) {
			return errors.New("vehicle images must use HTTPS URLs")
		}
	}
	if v.VideoURL != "" && !validHTTPSURL(v.VideoURL) {
		return errors.New("walkaround video must use an HTTPS URL")
	}
	for _, feature := range v.Features {
		if feature == "" || len(feature) > 100 {
			return errors.New("features must contain 1 to 100 characters")
		}
	}
	return nil
}

func validHTTPSURL(value string) bool {
	parsed, err := url.ParseRequestURI(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
}

func queryInt(values url.Values, key string, fallback, minimum, maximum int) int {
	value := values.Get(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minimum || parsed > maximum {
		return fallback
	}
	return parsed
}

func validateLocation(ctx context.Context, tx pgx.Tx, locationID string) error {
	if locationID == "" {
		return nil
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM locations WHERE id=$1 AND is_active=TRUE)`, locationID).Scan(&exists); err != nil || !exists {
		return errors.New("location does not exist or is inactive")
	}
	return nil
}

func replaceVehicleMedia(ctx context.Context, tx pgx.Tx, id string, input AdminVehicleInput) error {
	if _, err := tx.Exec(ctx, `DELETE FROM vehicle_images WHERE vehicle_id=$1`, id); err != nil {
		return err
	}
	for order, image := range input.Images {
		alt := fmt.Sprintf("%d %s %s exterior view %d", input.Year, input.Make, input.Model, order+1)
		if _, err := tx.Exec(ctx, `INSERT INTO vehicle_images (vehicle_id, image_url, alt_text, sort_order, is_primary) VALUES ($1,$2,$3,$4,$5)`, id, image, alt, order, order == 0); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM vehicle_features WHERE vehicle_id=$1`, id); err != nil {
		return err
	}
	for _, feature := range input.Features {
		if _, err := tx.Exec(ctx, `INSERT INTO vehicle_features (vehicle_id, category, name) VALUES ($1,'general',$2) ON CONFLICT DO NOTHING`, id, feature); err != nil {
			return err
		}
	}
	return nil
}

func scanAdminVehicle(row pgx.Row) (AdminVehicle, error) {
	var vehicle AdminVehicle
	var imagesJSON, featuresJSON []byte
	err := row.Scan(&vehicle.ID, &vehicle.VIN, &vehicle.Make, &vehicle.Model, &vehicle.ModelYear, &vehicle.VehicleType, &vehicle.SalePrice, &vehicle.DailyRate, &vehicle.Status, &vehicle.ImageURL, &vehicle.Description, &imagesJSON, &vehicle.VideoURL, &vehicle.Variant, &vehicle.MileageKM, &vehicle.FuelType, &vehicle.Transmission, &vehicle.EngineCC, &vehicle.Seats, &vehicle.Color, &vehicle.LocationID, &vehicle.Location, &vehicle.WeeklyRate, &vehicle.MonthlyRate, &vehicle.Deposit, &vehicle.Currency, &vehicle.Featured, &vehicle.Published, &featuresJSON)
	if err != nil {
		return vehicle, err
	}
	if err := json.Unmarshal(imagesJSON, &vehicle.Images); err != nil {
		return vehicle, err
	}
	if err := json.Unmarshal(featuresJSON, &vehicle.Features); err != nil {
		return vehicle, err
	}
	return vehicle, nil
}

func readAdminVehicle(ctx context.Context, tx pgx.Tx, id string) (AdminVehicle, error) {
	return scanAdminVehicle(tx.QueryRow(ctx, adminVehicleSelect+` WHERE v.id=$1 AND v.archived_at IS NULL FOR UPDATE OF v`, id))
}

func writeAudit(ctx context.Context, tx pgx.Tx, identity verifiedAdmin, action, id string, before, after any) error {
	roles, _ := json.Marshal(identity.roles)
	beforeJSON, err := marshalOptional(before)
	if err != nil {
		return err
	}
	afterJSON, err := marshalOptional(after)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_logs (actor_id, actor_roles, action, entity_type, entity_id, before_state, after_state) VALUES ($1,$2::jsonb,$3,'vehicle',$4,$5::jsonb,$6::jsonb)`, identity.subject, string(roles), action, id, beforeJSON, afterJSON)
	return err
}

func marshalOptional(value any) (any, error) {
	if value == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(value)
	return string(encoded), err
}

func writeInventoryEvent(ctx context.Context, tx pgx.Tx, id, eventType string, payload any) error {
	encoded, err := json.Marshal(map[string]any{"action": eventType, "vehicle": payload})
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO event_outbox (event_type, aggregate_id, payload) VALUES ('inventory.updated',$1,$2::jsonb)`, id, string(encoded))
	return err
}

func firstImage(images []string) *string {
	if len(images) == 0 {
		return nil
	}
	return &images[0]
}

func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func writeDatabaseError(w http.ResponseWriter, err error) {
	if code := databaseErrorCode(err); code != "" {
		switch code {
		case "23505":
			writeError(w, http.StatusConflict, "a vehicle with that VIN already exists")
			return
		case "23503", "23514", "22P02":
			writeError(w, http.StatusBadRequest, "vehicle data violates a catalog constraint")
			return
		}
	}
	writeError(w, http.StatusServiceUnavailable, "vehicle catalog unavailable")
}

type pgError struct{ code string }

func databaseErrorCode(err error) string {
	var databaseError interface{ SQLState() string }
	if errors.As(err, &databaseError) {
		return databaseError.SQLState()
	}
	return ""
}

func (s *server) invalidateVehicleCache(ctx context.Context) {
	for _, pattern := range []string{"vehicles:search:*", "vehicle:*"} {
		var cursor uint64
		for {
			keys, next, err := s.cache.Scan(ctx, cursor, pattern, 250).Result()
			if err != nil {
				return
			}
			if len(keys) > 0 {
				_ = s.cache.Del(ctx, keys...).Err()
			}
			cursor = next
			if cursor == 0 {
				break
			}
		}
	}
}
