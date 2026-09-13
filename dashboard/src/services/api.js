/**
 * BhuDrishti API Service
 * All calls go through Vite's proxy (/api → http://localhost:3001)
 * so the browser never hits CORS issues during development.
 */

import axios from 'axios'

// All requests go to the Node.js/Express backend (port 3001).
// Vite proxies /api → http://localhost:3001 during development.
// The Node backend then proxies ML calls to Flask internally.
const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Attach JWT token to every request if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('bhudrishti_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password })
  if (data.token) localStorage.setItem('bhudrishti_token', data.token)
  return data
}

export async function register(name, email, password, role, district, phone) {
  const { data } = await client.post('/auth/register', { name, email, password, role, district, phone })
  if (data.token) localStorage.setItem('bhudrishti_token', data.token)
  return data
}

export function logout() {
  localStorage.removeItem('bhudrishti_token')
}

export async function fetchMe() {
  const { data } = await client.get('/auth/me')
  return data
}

// ── ML (proxied through Node backend) ────────────────────────────────────────

/** Check if Flask ML API is alive (via Node proxy) */
export async function fetchHealth() {
  const { data } = await client.get('/ml/health')
  return data
}

/** Risk data for all NER districts — used by the map + chart */
export async function fetchRegionRisks() {
  const { data } = await client.get('/ml/region-risks')
  return data.regions
}

/**
 * Single-location risk prediction (saved to PostgreSQL automatically)
 * @param {Object} features - { slope, elevation, curvature, aspect,
 *   precipitation, ndvi, soil_moisture, soil_type, lulc,
 *   dist_road, dist_fault, district, latitude, longitude }
 */
export async function predictRisk(features) {
  const { data } = await client.post('/ml/predict', features)
  return data
}

/**
 * 24-hour lead-time early warning forecast
 */
export async function fetchForecast(lat, lon, staticFeatures, alertThreshold = 'high') {
  const { data } = await client.post('/ml/forecast', {
    latitude:        lat,
    longitude:       lon,
    static_features: staticFeatures,
    alert_threshold: alertThreshold,
  })
  return data
}

// ── Stats ─────────────────────────────────────────────────────────────────────
// Merges Node DB counts (per-category totals) with Flask's monitored zones count
// so all 4 stat cards in RiskDashboard show real values.
export async function fetchStats() {
  const [{ data: dbStats }, { data: mlStats }] = await Promise.all([
    client.get('/predictions/stats'),
    client.get('/ml/stats'),
  ])
  return {
    // From Flask — fixed count of monitored NER districts
    total_monitored_zones: mlStats.total_monitored_zones,
    // From Node DB — live counts from PostgreSQL
    active_alerts:  dbStats.active_alerts ?? mlStats.active_alerts,
    high_count:     parseInt(dbStats.high_count)     || 0,
    critical_count: parseInt(dbStats.critical_count) || 0,
    moderate_count: parseInt(dbStats.moderate_count) || 0,
    low_count:      parseInt(dbStats.low_count)      || 0,
    total:          parseInt(dbStats.total)          || 0,
    last_24h:       parseInt(dbStats.last_24h)       || 0,
  }
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export async function fetchAlerts(params = {}) {
  const { data } = await client.get('/alerts', { params })
  return data
}

export async function acknowledgeAlert(id) {
  const { data } = await client.patch(`/alerts/${id}/acknowledge`)
  return data
}

export async function resolveAlert(id) {
  const { data } = await client.patch(`/alerts/${id}/resolve`)
  return data
}

export async function sendAlertSMS(id) {
  const { data } = await client.post(`/alerts/${id}/sms`)
  return data
}

// ── Field Reports ─────────────────────────────────────────────────────────────
export async function fetchFieldReports(params = {}) {
  const { data } = await client.get('/field-reports', { params })
  return data
}

export async function submitFieldReport(report) {
  const { data } = await client.post('/field-reports', report)
  return data
}

export async function verifyFieldReport(id) {
  const { data } = await client.patch(`/field-reports/${id}/verify`)
  return data
}
