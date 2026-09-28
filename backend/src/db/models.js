/**
 * BhuDrishti — PostgreSQL schema reference
 *
 * This project uses raw pg queries (no ORM).
 * The actual tables are created by running:
 *   psql -U postgres -d bhudrishti -f src/db/schema.sql
 *
 * Tables:
 *   users         — id (UUID), name, email, password_hash, role, district, phone, created_at, updated_at
 *   predictions   — id (UUID), user_id, district, latitude, longitude,
 *                   slope, elevation, curvature, aspect, precipitation, ndvi,
 *                   soil_moisture, soil_type, lulc, dist_road, dist_fault,
 *                   risk_label, risk_category, confidence,
 *                   prob_low, prob_moderate, prob_high, prob_critical,
 *                   source, created_at
 *   alerts        — id (UUID), prediction_id, district, latitude, longitude,
 *                   risk_category, message, status, sms_sent, sms_sent_at,
 *                   recipients (TEXT[]), acknowledged_by, acknowledged_at,
 *                   resolved_at, created_at
 *   field_reports — id (UUID), user_id, district, latitude, longitude,
 *                   report_type, description, severity, image_url,
 *                   verified, verified_by, verified_at, created_at
 *
 * All queries are in the route files under src/routes/.
 */

export const TABLES = {
  USERS:         'users',
  PREDICTIONS:   'predictions',
  ALERTS:        'alerts',
  FIELD_REPORTS: 'field_reports',
}

export const RISK_LABELS = { 0: 'Low', 1: 'Moderate', 2: 'High', 3: 'Critical' }

export const ROLES = ['citizen', 'field_officer', 'district_admin', 'superadmin']
