/**
 * BhuDrishti — Routing Routes
 * Proxies road-network routing requests to the public OSRM demo server
 * (https://router.project-osrm.org) which uses real OpenStreetMap data.
 *
 * No API key is required for the OSRM public demo server.
 * Keeping this as a backend proxy means we can swap to a self-hosted OSRM
 * or a key-based engine (GraphHopper, openrouteservice) later without any
 * frontend changes — just update ROUTING_BASE_URL and the query format here.
 *
 * GET /api/routing/route
 *   Query params:
 *     origin_lat, origin_lon     — start point (decimal degrees)
 *     dest_lat,   dest_lon       — end point   (decimal degrees)
 *     alternatives               — "true" | "false" (default "true")
 *
 *   Response (forwarded from OSRM, trimmed):
 *   {
 *     "routes": [
 *       {
 *         "distance":  12345.6,          // metres
 *         "duration":  3210.4,           // seconds
 *         "geometry": { "type": "LineString", "coordinates": [[lon,lat], ...] }
 *       },
 *       ...                              // alternative routes when alternatives=true
 *     ],
 *     "waypoints": [ ... ]
 *   }
 */

import { Router } from 'express'
import axios     from 'axios'

const router = Router()

// Public OSRM demo server — OpenStreetMap-based, no API key required.
// Override with a self-hosted instance via env var if desired.
const OSRM_BASE = process.env.OSRM_URL || 'https://router.project-osrm.org'

// ── Route calculation ─────────────────────────────────────────────────────────
router.get('/route', async (req, res) => {
  const { origin_lat, origin_lon, dest_lat, dest_lon, alternatives = 'true' } = req.query

  // Validate all four coordinates are present and numeric
  const coords = [origin_lat, origin_lon, dest_lat, dest_lon].map(Number)
  if (coords.some(isNaN)) {
    return res.status(400).json({
      error: 'origin_lat, origin_lon, dest_lat, dest_lon are all required numeric query params.',
    })
  }

  const [oLat, oLon, dLat, dLon] = coords

  // OSRM coordinate format: lon,lat (note: longitude first)
  const coordStr = `${oLon},${oLat};${dLon},${dLat}`
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}`

  try {
    const { data } = await axios.get(url, {
      params: {
        overview:    'full',        // full route geometry (not simplified)
        geometries:  'geojson',     // GeoJSON LineString — Leaflet-compatible
        alternatives: alternatives, // return up to 3 alternative routes
        steps:       'false',       // don't need turn-by-turn steps
      },
      timeout: 12000,
      headers: { 'User-Agent': 'BhuDrishti-SIH-2026/1.0' },
    })

    if (data.code !== 'Ok') {
      return res.status(502).json({ error: `OSRM returned code: ${data.code}` })
    }

    // Return only the fields the frontend needs — avoids leaking internal OSRM details
    const routes = (data.routes || []).map((r, i) => ({
      index:    i,
      distance: Math.round(r.distance),       // metres
      duration: Math.round(r.duration),       // seconds
      geometry: r.geometry,                   // GeoJSON LineString {type, coordinates}
    }))

    return res.json({
      routes,
      waypoints: data.waypoints || [],
      osrm_code: data.code,
    })
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Routing service timed out.' })
    }
    const status = err.response?.status || 502
    return res.status(status).json({
      error: err.response?.data?.message || 'Routing service unavailable.',
    })
  }
})

export default router
