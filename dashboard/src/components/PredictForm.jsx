/**
 * BhuDrishti — PredictForm
 * AI Risk Assessment — auto-fetches live weather params from Open-Meteo
 * when the user picks a district. All fields remain editable after fill.
 */
import React, { useState, useCallback } from 'react'
import { predictRisk } from '../services/api'

// ── District registry ─────────────────────────────────────────────────────────
// Static terrain properties per district (slope, aspect, curvature, ndvi,
// dist_road, dist_fault, soil_type, lulc) are terrain/geological constants —
// they don't change with weather. Elevation & precipitation & soil_moisture
// are fetched live from Open-Meteo.
const DISTRICTS = [
  {
    name: 'Cherrapunji',  lat: 25.2500, lon: 91.7333,
    slope: 54, aspect: 210, curvature: 3.2, ndvi: 0.42,
    dist_road: 800,  dist_fault: 6200,  soil_type: 2, lulc: 1,
  },
  {
    name: 'Tawang',       lat: 27.5859, lon: 91.8598,
    slope: 48, aspect: 195, curvature: 4.1, ndvi: 0.35,
    dist_road: 1200, dist_fault: 9800,  soil_type: 2, lulc: 0,
  },
  {
    name: 'Kohima',       lat: 25.6700, lon: 94.1100,
    slope: 41, aspect: 180, curvature: 2.8, ndvi: 0.48,
    dist_road: 600,  dist_fault: 11000, soil_type: 1, lulc: 0,
  },
  {
    name: 'Itanagar',     lat: 27.0844, lon: 93.6053,
    slope: 38, aspect: 165, curvature: 2.4, ndvi: 0.52,
    dist_road: 400,  dist_fault: 7500,  soil_type: 1, lulc: 1,
  },
  {
    name: 'Dibrugarh',    lat: 27.4728, lon: 94.9120,
    slope: 12, aspect: 90,  curvature: 0.8, ndvi: 0.61,
    dist_road: 300,  dist_fault: 14000, soil_type: 1, lulc: 1,
  },
  {
    name: 'Shillong',     lat: 25.5788, lon: 91.8933,
    slope: 32, aspect: 200, curvature: 2.1, ndvi: 0.44,
    dist_road: 350,  dist_fault: 8200,  soil_type: 2, lulc: 3,
  },
  {
    name: 'Imphal',       lat: 24.8170, lon: 93.9368,
    slope: 22, aspect: 150, curvature: 1.4, ndvi: 0.55,
    dist_road: 250,  dist_fault: 5400,  soil_type: 1, lulc: 1,
  },
  {
    name: 'Kohima',       lat: 25.6700, lon: 94.1100,
    slope: 41, aspect: 180, curvature: 2.8, ndvi: 0.48,
    dist_road: 600,  dist_fault: 11000, soil_type: 1, lulc: 0,
  },
  {
    name: 'Aizawl',       lat: 23.7271, lon: 92.7176,
    slope: 44, aspect: 220, curvature: 3.5, ndvi: 0.50,
    dist_road: 700,  dist_fault: 7800,  soil_type: 2, lulc: 0,
  },
  {
    name: 'Agartala',     lat: 23.8315, lon: 91.2868,
    slope: 18, aspect: 130, curvature: 1.1, ndvi: 0.58,
    dist_road: 200,  dist_fault: 12000, soil_type: 1, lulc: 1,
  },
  {
    name: 'Gangtok',      lat: 27.3389, lon: 88.6065,
    slope: 51, aspect: 240, curvature: 4.6, ndvi: 0.38,
    dist_road: 900,  dist_fault: 4200,  soil_type: 2, lulc: 0,
  },
  {
    name: 'Silchar',      lat: 24.8333, lon: 92.7789,
    slope: 16, aspect: 110, curvature: 0.9, ndvi: 0.60,
    dist_road: 280,  dist_fault: 9500,  soil_type: 1, lulc: 1,
  },
  {
    name: 'Jorhat',       lat: 26.7509, lon: 94.2037,
    slope: 10, aspect: 80,  curvature: 0.6, ndvi: 0.63,
    dist_road: 220,  dist_fault: 16000, soil_type: 1, lulc: 1,
  },
]

// Deduplicate (Kohima appeared twice)
const DISTRICT_LIST = DISTRICTS.filter(
  (d, i, arr) => arr.findIndex((x) => x.name === d.name) === i
)

const DEFAULTS = {
  slope: 35, elevation: 1000, curvature: 2.0, aspect: 180,
  precipitation: 80, ndvi: 0.3, soil_moisture: 0.5,
  soil_type: 1, lulc: 0, dist_road: 500, dist_fault: 8000,
}

const FIELDS = [
  { key: 'slope',         label: 'Slope (°)',           min: 0,   max: 90,    step: 0.1  },
  { key: 'elevation',     label: 'Elevation (m)',        min: 0,   max: 5000,  step: 1    },
  { key: 'curvature',     label: 'Curvature',            min: -10, max: 10,    step: 0.1  },
  { key: 'aspect',        label: 'Aspect (°)',           min: 0,   max: 360,   step: 1    },
  { key: 'precipitation', label: 'Precipitation (mm)',   min: 0,   max: 600,   step: 0.1  },
  { key: 'ndvi',          label: 'NDVI',                 min: -1,  max: 1,     step: 0.01 },
  { key: 'soil_moisture', label: 'Soil Moisture (0–1)',  min: 0,   max: 1,     step: 0.01 },
  { key: 'dist_road',     label: 'Dist. to Road (m)',    min: 0,   max: 10000, step: 10   },
  { key: 'dist_fault',    label: 'Dist. to Fault (m)',   min: 0,   max: 30000, step: 100  },
]

// Which fields are fetched live vs static terrain
const LIVE_FIELDS   = new Set(['elevation', 'precipitation', 'soil_moisture'])
const STATIC_FIELDS = new Set(['slope', 'curvature', 'aspect', 'ndvi', 'dist_road', 'dist_fault'])

const SOIL_TYPES = ['Sandy', 'Loamy', 'Clay', 'Rocky']
const LULC_TYPES = ['Forest', 'Agriculture', 'Barren', 'Urban', 'Waterbody']

const RISK_CONFIG = {
  Low:      { color: '#1a7a32', bg: 'linear-gradient(145deg,#e0f5e8,#c8ecd8)', border: '#70c888', emoji: '✅' },
  Moderate: { color: '#b86000', bg: 'linear-gradient(145deg,#fef3d0,#fde8b0)', border: '#e0a840', emoji: '📢' },
  High:     { color: '#a02818', bg: 'linear-gradient(145deg,#fde8e4,#fcd8d0)', border: '#d87868', emoji: '⚠️'  },
  Critical: { color: '#6020a8', bg: 'linear-gradient(145deg,#ece0fa,#dcc8f8)', border: '#a870d8', emoji: '🚨' },
}

const OPEN_METEO_FORECAST  = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_ELEVATION = 'https://api.open-meteo.com/v1/elevation'

// ── Live fetch from Open-Meteo ────────────────────────────────────────────────
async function fetchLiveParams(lat, lon) {
  const [forecastRes, elevationRes] = await Promise.all([
    fetch(
      `${OPEN_METEO_FORECAST}?latitude=${lat}&longitude=${lon}` +
      `&current=precipitation,soil_moisture_0_to_1cm` +
      `&timezone=Asia%2FKolkata`
    ),
    fetch(`${OPEN_METEO_ELEVATION}?latitude=${lat}&longitude=${lon}`),
  ])

  if (!forecastRes.ok || !elevationRes.ok) {
    throw new Error('Open-Meteo API returned an error. Try again.')
  }

  const forecast  = await forecastRes.json()
  const elevation = await elevationRes.json()

  const current = forecast.current
  return {
    elevation:     Math.round(elevation.elevation?.[0] ?? 1000),
    precipitation: parseFloat((current?.precipitation    ?? 0).toFixed(2)),
    soil_moisture: parseFloat((current?.soil_moisture_0_to_1cm ?? 0.3).toFixed(3)),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PredictForm() {
  const [form,           setForm]           = useState(DEFAULTS)
  const [result,         setResult]         = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [fetchStatus,    setFetchStatus]    = useState(null)   // null | 'loading' | 'ok' | 'error'
  const [fetchMsg,       setFetchMsg]       = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [error,          setError]          = useState(null)
  const [lastFetchedAt,  setLastFetchedAt]  = useState(null)

  // When a district is chosen, fetch live weather + static terrain in one shot
  const handleDistrictChange = useCallback(async (e) => {
    const name = e.target.value
    setSelectedDistrict(name)
    setResult(null)
    setError(null)

    if (!name) return

    const district = DISTRICT_LIST.find((d) => d.name === name)
    if (!district) return

    // First apply static terrain values immediately
    setForm((prev) => ({
      ...prev,
      slope:       district.slope,
      curvature:   district.curvature,
      aspect:      district.aspect,
      ndvi:        district.ndvi,
      dist_road:   district.dist_road,
      dist_fault:  district.dist_fault,
      soil_type:   district.soil_type,
      lulc:        district.lulc,
    }))

    // Then fetch live values from Open-Meteo
    setFetchStatus('loading')
    setFetchMsg(`Fetching live data for ${name}…`)

    try {
      const live = await fetchLiveParams(district.lat, district.lon)
      setForm((prev) => ({
        ...prev,
        elevation:     live.elevation,
        precipitation: live.precipitation,
        soil_moisture: live.soil_moisture,
      }))
      setLastFetchedAt(new Date())
      setFetchStatus('ok')
      setFetchMsg(
        `✓ Live data fetched for ${name} — ` +
        `${live.precipitation} mm rain · ${live.soil_moisture} moisture · ${live.elevation} m elevation`
      )
    } catch (err) {
      setFetchStatus('error')
      setFetchMsg(`⚠ Could not fetch live data: ${err.message}`)
    }
  }, [])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: parseFloat(value) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await predictRisk(form)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'API unreachable. Make sure Flask is running on port 5000.')
    } finally {
      setLoading(false)
    }
  }

  const cfg = result ? RISK_CONFIG[result.risk_category] : null

  // Badge colour for fetch status
  const statusStyle = {
    loading: { background: '#e8f0fe', color: '#1a4ab8', border: '1px solid #90b0e8' },
    ok:      { background: '#e0f5e8', color: '#0a4820', border: '1px solid #70c888' },
    error:   { background: '#fde8e4', color: '#a02818', border: '1px solid #d87868' },
  }

  return (
    <div className="card predict-form-card">
      <h2 className="card__title">
        <span aria-hidden="true">🤖</span> AI Risk Assessment
        <span style={{
          marginLeft: 'auto', fontSize: '0.72rem',
          background: '#d0f0d8', color: '#0a4820',
          padding: '0.2rem 0.65rem', borderRadius: '999px',
          border: '1px solid #70c888', fontWeight: 700,
        }}>
          Random Forest Classifier
        </span>
      </h2>

      <p style={{ fontSize: '0.8rem', color: '#3a5820', marginBottom: '1.2rem', lineHeight: 1.6, maxWidth: '740px' }}>
        Select a district — precipitation, soil moisture, and elevation are fetched live from{' '}
        <strong>Open-Meteo</strong>. Terrain parameters (slope, NDVI, etc.) are pre-loaded per district.
        All values can be adjusted before running the model.
      </p>

      {/* ── District selector ── */}
      <div className="form-field" style={{ marginBottom: '0.9rem', maxWidth: '340px' }}>
        <label htmlFor="district-select" style={{ fontWeight: 700, color: '#1a4a2a' }}>
          📍 Select District
        </label>
        <select
          id="district-select"
          value={selectedDistrict}
          onChange={handleDistrictChange}
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #b0d4b8', fontSize: '0.9rem', cursor: 'pointer' }}
          aria-label="Select NER district to auto-fill parameters"
        >
          <option value="">— Choose a district —</option>
          {DISTRICT_LIST.map((d) => (
            <option key={d.name} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* ── Live fetch status banner ── */}
      {fetchStatus && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...statusStyle[fetchStatus],
            borderRadius: '8px',
            padding: '0.55rem 0.9rem',
            fontSize: '0.78rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {fetchStatus === 'loading' && (
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #1a4ab8', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} aria-hidden="true" />
          )}
          <span>{fetchMsg}</span>
          {fetchStatus === 'ok' && lastFetchedAt && (
            <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
              at {lastFetchedAt.toLocaleTimeString('en-IN')}
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} aria-label="Landslide risk prediction form">
        <div className="predict-form__grid">
          {FIELDS.map(({ key, label, min, max, step }) => {
            const isLive   = LIVE_FIELDS.has(key)
            const isStatic = STATIC_FIELDS.has(key)
            const isFilled = selectedDistrict && (isLive || isStatic)
            return (
              <div key={key} className="form-field">
                <label htmlFor={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {label}
                  {isFilled && isLive && (
                    <span title="Fetched live from Open-Meteo" style={{ fontSize: '0.65rem', background: '#d0eaf8', color: '#0a3a6a', padding: '0.1rem 0.4rem', borderRadius: '999px', border: '1px solid #90c0e8', fontWeight: 700 }}>
                      🛰 live
                    </span>
                  )}
                  {isFilled && isStatic && (
                    <span title="Pre-loaded terrain data for this district" style={{ fontSize: '0.65rem', background: '#e8f5e8', color: '#1a4a2a', padding: '0.1rem 0.4rem', borderRadius: '999px', border: '1px solid #90c888', fontWeight: 700 }}>
                      📍 district
                    </span>
                  )}
                </label>
                <input
                  id={key} name={key} type="number"
                  min={min} max={max} step={step}
                  value={form[key]}
                  onChange={handleChange}
                  required
                  style={isFilled && isLive ? { borderColor: '#6ab4e8', background: '#f0f8ff' } : undefined}
                />
              </div>
            )
          })}

          <div className="form-field">
            <label htmlFor="soil_type">
              Soil Type
              {selectedDistrict && (
                <span title="Pre-loaded terrain data for this district" style={{ marginLeft: '0.35rem', fontSize: '0.65rem', background: '#e8f5e8', color: '#1a4a2a', padding: '0.1rem 0.4rem', borderRadius: '999px', border: '1px solid #90c888', fontWeight: 700 }}>
                  📍 district
                </span>
              )}
            </label>
            <select id="soil_type" name="soil_type" value={form.soil_type} onChange={handleChange}>
              {SOIL_TYPES.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="lulc">
              Land Use / Cover
              {selectedDistrict && (
                <span title="Pre-loaded terrain data for this district" style={{ marginLeft: '0.35rem', fontSize: '0.65rem', background: '#e8f5e8', color: '#1a4a2a', padding: '0.1rem 0.4rem', borderRadius: '999px', border: '1px solid #90c888', fontWeight: 700 }}>
                  📍 district
                </span>
              )}
            </label>
            <select id="lulc" name="lulc" value={form.lulc} onChange={handleChange}>
              {LULC_TYPES.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? '⚙️ Analysing…' : '🤖 Run AI Prediction'}
        </button>
      </form>

      {error && (
        <div className="predict-result predict-result--error" role="alert">⚠️ {error}</div>
      )}

      {result && cfg && (
        <div
          className="predict-result"
          style={{ background: cfg.bg, borderColor: cfg.border, borderLeft: `5px solid ${cfg.color}` }}
          role="status"
          aria-live="polite"
        >
          <div className="predict-result__header">
            <span className="predict-result__emoji" aria-hidden="true">{cfg.emoji}</span>
            <span className="predict-result__label" style={{ color: cfg.color }}>
              {result.risk_category} Risk
            </span>
            {selectedDistrict && (
              <span style={{ fontSize: '0.8rem', color: '#555', fontWeight: 600 }}>
                — {selectedDistrict}
              </span>
            )}
            <span className="predict-result__confidence">
              Confidence: {(result.confidence * 100).toFixed(1)}%
            </span>
          </div>
          <div className="confidence-bar">
            <div
              className="confidence-bar__fill"
              style={{ width: `${result.confidence * 100}%`, background: `linear-gradient(90deg,${cfg.color},${cfg.color}aa)` }}
            />
          </div>
          <div className="prob-breakdown">
            {Object.entries(result.probabilities).map(([label, prob]) => {
              const c = RISK_CONFIG[label]
              return (
                <div key={label} className="prob-item">
                  <span style={{ color: c?.color, fontWeight: 700 }}>{label}</span>
                  <div className="prob-bar">
                    <div
                      className="prob-bar__fill"
                      style={{ width: `${prob * 100}%`, background: c?.color }}
                      aria-label={`${label}: ${(prob * 100).toFixed(1)}%`}
                    />
                  </div>
                  <span style={{ color: c?.color, fontWeight: 700 }}>{(prob * 100).toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* spinner keyframe — injected inline so no CSS file changes needed */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
