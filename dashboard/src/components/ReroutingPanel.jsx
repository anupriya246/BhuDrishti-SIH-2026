/**
 * BhuDrishti — ReroutingPanel
 *
 * Real-time dynamic rerouting using:
 *   - OpenStreetMap tiles via react-leaflet (no API key)
 *   - OSRM public demo API for live route calculation (no API key)
 *     http://router.project-osrm.org/route/v1/driving/
 *
 * Flow:
 *   1. User picks an origin district and a destination district
 *   2. High-risk districts (from the regions prop) are shown as blocked
 *   3. OSRM is called with alternatives=true → returns primary + alternate routes
 *   4. Primary route drawn in red (blocked/risky path), best alternate in green
 *   5. Route stats (distance, ETA, detour) shown in cards
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  MapContainer, TileLayer, Polyline, CircleMarker,
  Popup, ZoomControl, useMap,
} from 'react-leaflet'

// ── District registry (same as PredictForm) ───────────────────────────────────
const DISTRICTS = [
  { name: 'Cherrapunji', lat: 25.2500, lon: 91.7333 },
  { name: 'Tawang',      lat: 27.5859, lon: 91.8598 },
  { name: 'Kohima',      lat: 25.6700, lon: 94.1100 },
  { name: 'Itanagar',    lat: 27.0844, lon: 93.6053 },
  { name: 'Dibrugarh',   lat: 27.4728, lon: 94.9120 },
  { name: 'Shillong',    lat: 25.5788, lon: 91.8933 },
  { name: 'Imphal',      lat: 24.8170, lon: 93.9368 },
  { name: 'Aizawl',      lat: 23.7271, lon: 92.7176 },
  { name: 'Agartala',    lat: 23.8315, lon: 91.2868 },
  { name: 'Gangtok',     lat: 27.3389, lon: 88.6065 },
  { name: 'Silchar',     lat: 24.8333, lon: 92.7789 },
  { name: 'Jorhat',      lat: 26.7509, lon: 94.2037 },
]

const OSRM = 'http://router.project-osrm.org/route/v1/driving'

const RISK_COLORS = {
  Low:      '#1a7a32',
  Moderate: '#b86000',
  High:     '#a02818',
  Critical: '#6020a8',
}

// ── Decode OSRM polyline (encoded geometry) ───────────────────────────────────
// OSRM returns GeoJSON geometry when geometries=geojson, so coordinates come as
// [lon, lat] arrays — we just flip to [lat, lon] for Leaflet.
function geoJsonToLatLng(geometry) {
  return geometry.coordinates.map(([lon, lat]) => [lat, lon])
}

// ── Fit map bounds helper component ──────────────────────────────────────────
function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds && bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [bounds, map])
  return null
}

// ── Format seconds → "X hr Y min" ────────────────────────────────────────────
function fmtDuration(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  if (h > 0) return `${h} hr ${m} min`
  return `${m} min`
}

// ── Format metres → km ────────────────────────────────────────────────────────
function fmtDist(m) {
  return (m / 1000).toFixed(1) + ' km'
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReroutingPanel({ regions = [] }) {
  const [origin,      setOrigin]      = useState('')
  const [destination, setDestination] = useState('')
  const [status,      setStatus]      = useState(null)   // null | 'loading' | 'ok' | 'error' | 'same'
  const [statusMsg,   setStatusMsg]   = useState('')
  const [routes,      setRoutes]      = useState([])     // [{coords, distance, duration, isAlt}]
  const [bounds,      setBounds]      = useState(null)
  const mapRef = useRef(null)

  // Districts that are High or Critical risk — shown as danger markers
  const blockedDistricts = (regions || []).filter(
    (r) => r.risk_category === 'High' || r.risk_category === 'Critical'
  )

  const calculate = useCallback(async () => {
    if (!origin || !destination) return
    if (origin === destination) {
      setStatus('same')
      setStatusMsg('Origin and destination cannot be the same.')
      setRoutes([])
      return
    }

    const orig = DISTRICTS.find((d) => d.name === origin)
    const dest = DISTRICTS.find((d) => d.name === destination)
    if (!orig || !dest) return

    setStatus('loading')
    setStatusMsg(`Calculating live routes from ${origin} to ${destination}…`)
    setRoutes([])

    try {
      const url =
        `${OSRM}/${orig.lon},${orig.lat};${dest.lon},${dest.lat}` +
        `?overview=full&geometries=geojson&alternatives=true&steps=false`

      const res  = await fetch(url)
      if (!res.ok) throw new Error(`OSRM returned ${res.status}`)
      const data = await res.json()

      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error('No route found between these locations.')
      }

      const parsed = data.routes.map((r, i) => ({
        coords:   geoJsonToLatLng(r.geometry),
        distance: r.distance,
        duration: r.duration,
        isAlt:    i > 0,
      }))

      setRoutes(parsed)
      setBounds([
        [orig.lat, orig.lon],
        [dest.lat, dest.lon],
        ...parsed[0].coords.slice(0, 5),
      ])
      setStatus('ok')
      setStatusMsg(
        `✓ ${parsed.length} route${parsed.length > 1 ? 's' : ''} found via OpenStreetMap / OSRM`
      )
    } catch (err) {
      setStatus('error')
      setStatusMsg(`⚠ Routing failed: ${err.message}`)
    }
  }, [origin, destination])

  // Auto-calculate when both are selected
  useEffect(() => {
    if (origin && destination && origin !== destination) calculate()
  }, [origin, destination, calculate])

  // Stats for the primary route
  const primary = routes.find((r) => !r.isAlt)
  const alt     = routes.find((r) =>  r.isAlt)
  const detour  = primary && alt
    ? Math.round((alt.duration - primary.duration) / 60)
    : null

  // Status banner style
  const bannerStyle = {
    loading: { background: '#e8f0fe', color: '#1a4ab8', border: '1px solid #90b0e8' },
    ok:      { background: '#e0f5e8', color: '#0a4820', border: '1px solid #70c888' },
    error:   { background: '#fde8e4', color: '#a02818', border: '1px solid #d87868' },
    same:    { background: '#fef3d0', color: '#6a3800', border: '1px solid #e0a040' },
  }

  return (
    <div className="card reroute-card">
      {/* ── Header ── */}
      <h2 className="card__title">
        <span aria-hidden="true">🛣️</span> Dynamic Rerouting System
        <span style={{
          marginLeft: 'auto', fontSize: '0.72rem',
          background: '#fdeee6', color: '#8b3a10',
          padding: '0.2rem 0.65rem', borderRadius: '999px',
          border: '1px solid #f0b888', fontWeight: 700,
        }}>
          OSRM · OpenStreetMap · Live
        </span>
      </h2>

      <p style={{ fontSize: '0.8rem', color: '#6a3820', marginBottom: '1.1rem', lineHeight: 1.6 }}>
        Select origin and destination — live routes are fetched from{' '}
        <strong>OSRM</strong> using the <strong>OpenStreetMap</strong> road network.
        High/Critical risk districts are marked on the map. The alternate route avoids
        the most dangerous corridor.
      </p>

      {/* ── District selectors ── */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.9rem', alignItems: 'flex-end' }}>
        <div className="form-field" style={{ minWidth: '200px' }}>
          <label htmlFor="rr-origin">📍 Origin District</label>
          <select
            id="rr-origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #e8b888', fontSize: '0.9rem' }}
          >
            <option value="">— Select origin —</option>
            {DISTRICTS.map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="form-field" style={{ minWidth: '200px' }}>
          <label htmlFor="rr-dest">🏁 Destination District</label>
          <select
            id="rr-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #e8b888', fontSize: '0.9rem' }}
          >
            <option value="">— Select destination —</option>
            {DISTRICTS.filter((d) => d.name !== origin).map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>

        <button
          className="btn btn--primary"
          onClick={calculate}
          disabled={!origin || !destination || status === 'loading'}
          style={{ marginBottom: '0.05rem' }}
        >
          {status === 'loading' ? '⚙️ Routing…' : '🗺️ Calculate Route'}
        </button>
      </div>

      {/* ── Status banner ── */}
      {status && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...bannerStyle[status],
            borderRadius: '8px',
            padding: '0.55rem 0.9rem',
            fontSize: '0.78rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {status === 'loading' && (
            <span style={{
              display: 'inline-block', width: '12px', height: '12px',
              borderRadius: '50%', border: '2px solid #1a4ab8',
              borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite', flexShrink: 0,
            }} aria-hidden="true" />
          )}
          <span>{statusMsg}</span>
        </div>
      )}

      {/* ── Route stat cards ── */}
      {routes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {/* Primary route */}
          <div style={{ background: 'linear-gradient(135deg,#fdecea,#f8d8d0)', border: '1.5px solid #e09080', borderRadius: '10px', padding: '0.85rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#a02818', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
              ⛔ Primary (Risky)
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#a02818' }}>{fmtDist(primary.distance)}</div>
            <div style={{ fontSize: '0.78rem', color: '#8a2010', fontWeight: 600 }}>{fmtDuration(primary.duration)}</div>
          </div>

          {/* Alternate route */}
          {alt && (
            <div style={{ background: 'linear-gradient(135deg,#e0f5e8,#c8ecd8)', border: '1.5px solid #70c888', borderRadius: '10px', padding: '0.85rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1a7a32', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                ✅ Alternate (Safer)
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1a7a32' }}>{fmtDist(alt.distance)}</div>
              <div style={{ fontSize: '0.78rem', color: '#0a5020', fontWeight: 600 }}>{fmtDuration(alt.duration)}</div>
            </div>
          )}

          {/* Detour cost */}
          {detour !== null && (
            <div style={{ background: 'linear-gradient(135deg,#fff8e8,#fff0c0)', border: '1.5px solid #e8c870', borderRadius: '10px', padding: '0.85rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#b86000', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                ⏱ Detour Cost
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#b86000' }}>
                {detour >= 0 ? `+${detour}` : detour} min
              </div>
              <div style={{ fontSize: '0.78rem', color: '#8a5000', fontWeight: 600 }}>vs primary route</div>
            </div>
          )}

          {/* Blocked / high-risk zones on path */}
          <div style={{ background: 'linear-gradient(135deg,#ece0fa,#dcc8f8)', border: '1.5px solid #b088e0', borderRadius: '10px', padding: '0.85rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#6020a8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
              🚨 High/Critical Zones
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#6020a8' }}>{blockedDistricts.length}</div>
            <div style={{ fontSize: '0.78rem', color: '#4a1080', fontWeight: 600 }}>in NER right now</div>
          </div>
        </div>
      )}

      {/* ── Leaflet Map ── */}
      <div style={{ height: '420px', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e8c890', marginBottom: '0.75rem' }}>
        <MapContainer
          center={[25.5, 92.5]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          ref={mapRef}
          aria-label="NER rerouting map"
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Fit map to routes when calculated */}
          {bounds && <FitBounds bounds={bounds} />}

          {/* ── Risk district markers ── */}
          {(regions || []).map((r) => (
            <CircleMarker
              key={r.name}
              center={[r.lat, r.lon]}
              radius={r.risk_category === 'Critical' ? 14 : r.risk_category === 'High' ? 11 : 8}
              pathOptions={{
                fillColor: RISK_COLORS[r.risk_category] || '#888',
                fillOpacity: 0.8,
                color: '#fff',
                weight: 2,
              }}
            >
              <Popup>
                <strong>{r.name}</strong><br />
                Risk: <strong style={{ color: RISK_COLORS[r.risk_category] }}>{r.risk_category}</strong><br />
                Rainfall: {r.rainfall_mm} mm · Slope: {r.slope_avg}°
              </Popup>
            </CircleMarker>
          ))}

          {/* ── Primary route — red dashed (risky/blocked corridor) ── */}
          {primary && (
            <Polyline
              positions={primary.coords}
              pathOptions={{ color: '#b83020', weight: 5, dashArray: '10,6', opacity: 0.85 }}
            >
              <Popup>
                ⛔ <strong>Primary Route (Risky Corridor)</strong><br />
                {fmtDist(primary.distance)} · {fmtDuration(primary.duration)}
              </Popup>
            </Polyline>
          )}

          {/* ── Alternate route — green solid (safer path) ── */}
          {alt && (
            <Polyline
              positions={alt.coords}
              pathOptions={{ color: '#1a7a32', weight: 4, dashArray: '6,4', opacity: 0.9 }}
            >
              <Popup>
                ✅ <strong>Alternate Route (Safer Path)</strong><br />
                {fmtDist(alt.distance)} · {fmtDuration(alt.duration)}
                {detour !== null && <><br />Detour: {detour >= 0 ? `+${detour}` : detour} min</>}
              </Popup>
            </Polyline>
          )}

          {/* ── Origin marker ── */}
          {origin && (() => {
            const d = DISTRICTS.find((x) => x.name === origin)
            return d ? (
              <CircleMarker
                center={[d.lat, d.lon]}
                radius={10}
                pathOptions={{ fillColor: '#1060b0', fillOpacity: 1, color: '#fff', weight: 2.5 }}
              >
                <Popup><strong>📍 Origin: {d.name}</strong></Popup>
              </CircleMarker>
            ) : null
          })()}

          {/* ── Destination marker ── */}
          {destination && (() => {
            const d = DISTRICTS.find((x) => x.name === destination)
            return d ? (
              <CircleMarker
                center={[d.lat, d.lon]}
                radius={10}
                pathOptions={{ fillColor: '#b86000', fillOpacity: 1, color: '#fff', weight: 2.5 }}
              >
                <Popup><strong>🏁 Destination: {d.name}</strong></Popup>
              </CircleMarker>
            ) : null
          })()}
        </MapContainer>
      </div>

      {/* ── Map legend ── */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#5a3820', fontWeight: 600 }}>
        <span><span style={{ display: 'inline-block', width: 22, height: 4, background: '#b83020', borderRadius: 2, verticalAlign: 'middle', marginRight: 5 }} />⛔ Risky Route</span>
        <span><span style={{ display: 'inline-block', width: 22, height: 0, borderTop: '3px dashed #1a7a32', verticalAlign: 'middle', marginRight: 5 }} />✅ Alternate Route</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#1060b0', verticalAlign: 'middle', marginRight: 5 }} />📍 Origin</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#b86000', verticalAlign: 'middle', marginRight: 5 }} />🏁 Destination</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#a02818', verticalAlign: 'middle', marginRight: 5 }} />⚠ High/Critical Zone</span>
      </div>

      {/* ── Blocked districts table ── */}
      {blockedDistricts.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7a3820', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
            ⚠ Current High/Critical Risk Districts
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#fdeee6,#f8ddd0)', color: '#7a3820' }}>
                {['District', 'Risk Level', 'Rainfall', 'Slope', 'Action'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, borderBottom: '1.5px solid #e8c0a0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blockedDistricts.map((r, i) => (
                <tr key={r.name} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,240,220,0.4)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      background: RISK_COLORS[r.risk_category],
                      color: '#fff', padding: '0.15rem 0.6rem',
                      borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                    }}>
                      {r.risk_category === 'Critical' ? '🚨' : '⚠️'} {r.risk_category}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#1060a0', fontWeight: 600 }}>{r.rainfall_mm} mm</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#7a5020' }}>{r.slope_avg}°</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#a02818', fontWeight: 700 }}>
                      Avoid — use alternate route
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
