/**
 * PredictForm — AI risk prediction form.
 * When a district is selected, live precipitation + soil moisture are fetched
 * from Open-Meteo via the Flask /weather endpoint, all terrain fields are
 * auto-populated from the district profile, and the prediction runs instantly.
 * Manual entry remains available when no district is selected.
 */
import React, { useState, useCallback } from 'react'
import { predictRisk } from '../services/api'

// ML API base URL — same as what index.html uses
const ML_API = 'https://bhudrishti-ml.onrender.com'

// Districts available in DISTRICT_PROFILES on the Flask side
const DISTRICTS = [
  'Cherrapunji', 'Tawang', 'Kohima', 'Shillong', 'Itanagar',
  'Imphal', 'Aizawl', 'Gangtok', 'Dibrugarh', 'Agartala', 'Silchar', 'Jorhat',
]

const DEFAULTS = {
  slope:         35,
  elevation:     1000,
  curvature:     2.0,
  aspect:        180,
  precipitation: 0,      // replaced by live Open-Meteo value on district select
  ndvi:          0.3,
  soil_moisture: 0.5,    // replaced by live Open-Meteo value on district select
  soil_type:     1,
  lulc:          0,
  dist_road:     500,
  dist_fault:    8000,
}

// Fields that are always manually editable (when no district is selected)
const MANUAL_FIELDS = [
  { key: 'slope',         label: 'Slope (°)',           min: 0,    max: 90,    step: 0.1  },
  { key: 'elevation',     label: 'Elevation (m)',        min: 0,    max: 5000,  step: 1    },
  { key: 'curvature',     label: 'Curvature',            min: -10,  max: 10,    step: 0.1  },
  { key: 'aspect',        label: 'Aspect (°)',           min: 0,    max: 360,   step: 1    },
  { key: 'precipitation', label: 'Precipitation (mm)',   min: 0,    max: 600,   step: 0.1  },
  { key: 'ndvi',          label: 'NDVI',                 min: -1,   max: 1,     step: 0.01 },
  { key: 'soil_moisture', label: 'Soil Moisture (0–1)',  min: 0,    max: 1,     step: 0.01 },
  { key: 'dist_road',     label: 'Dist. to Road (m)',    min: 0,    max: 10000, step: 10   },
  { key: 'dist_fault',    label: 'Dist. to Fault (m)',   min: 0,    max: 30000, step: 100  },
]

const SOIL_TYPES = ['Sandy', 'Loamy', 'Clay', 'Rocky']
const LULC_TYPES = ['Forest', 'Agriculture', 'Barren', 'Urban', 'Waterbody']

const RISK_CONFIG = {
  Low:      { color: '#2ecc71', bg: '#052e16', emoji: '✅' },
  Moderate: { color: '#f39c12', bg: '#431407', emoji: '📢' },
  High:     { color: '#e74c3c', bg: '#450a0a', emoji: '⚠️'  },
  Critical: { color: '#8e44ad', bg: '#2e1065', emoji: '🚨' },
}

export default function PredictForm() {
  const [form, setForm]             = useState(DEFAULTS)
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [district, setDistrict]     = useState('')
  const [weatherStatus, setWeather] = useState(null)   // null | 'fetching' | 'live' | 'fallback' | 'error'
  const [wxMessage, setWxMessage]   = useState('')
  const [districtLoaded, setDistrictLoaded] = useState(false)

  // ── District auto-load ──────────────────────────────────────────────────────
  const handleDistrictChange = useCallback(async (e) => {
    const name = e.target.value
    setDistrict(name)
    setResult(null)
    setError(null)

    if (!name) {
      setWeather(null)
      setWxMessage('')
      setDistrictLoaded(false)
      setForm(DEFAULTS)
      return
    }

    setWeather('fetching')
    setWxMessage(`Fetching live data for ${name}…`)
    setDistrictLoaded(false)

    try {
      const resp = await fetch(`${ML_API}/weather?district=${encodeURIComponent(name)}`)
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${resp.status}`)
      }
      const w = await resp.json()
      if (w.error) throw new Error(w.error)

      // Populate all form fields from live weather + district profile
      setForm({
        slope:         w.slope,
        elevation:     w.elevation,
        curvature:     w.curvature,
        aspect:        w.aspect,
        precipitation: w.precipitation,    // ← live Open-Meteo value
        ndvi:          w.ndvi,
        soil_moisture: w.soil_moisture,    // ← live Open-Meteo value
        soil_type:     w.soil_type,
        lulc:          w.lulc,
        dist_road:     w.dist_road,
        dist_fault:    w.dist_fault,
      })

      setDistrictLoaded(true)
      setWeather(w.live_data ? 'live' : 'fallback')
      setWxMessage(
        w.live_data
          ? `Live data — precipitation: ${w.precipitation} mm · soil moisture: ${w.soil_moisture}`
          : `Profile data (Open-Meteo unavailable) — precipitation: ${w.precipitation} mm`
      )

      // Auto-run prediction with freshly loaded values
      setLoading(true)
      setError(null)
      try {
        const prediction = await predictRisk({
          slope: w.slope, elevation: w.elevation, curvature: w.curvature,
          aspect: w.aspect, precipitation: w.precipitation, ndvi: w.ndvi,
          soil_moisture: w.soil_moisture, soil_type: w.soil_type, lulc: w.lulc,
          dist_road: w.dist_road, dist_fault: w.dist_fault,
        })
        setResult(prediction)
      } catch (predErr) {
        setError(predErr.response?.data?.error || 'Prediction failed. Check Flask API.')
      } finally {
        setLoading(false)
      }

    } catch (err) {
      setWeather('error')
      setWxMessage(err.message)
      setDistrictLoaded(false)
      setLoading(false)
    }
  }, [])

  // ── Manual field edit ───────────────────────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: parseFloat(value) }))
  }

  // ── Manual submit ───────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await predictRisk(form)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'API unreachable. Make sure Flask is running.')
    } finally {
      setLoading(false)
    }
  }

  const cfg = result ? RISK_CONFIG[result.risk_category] : null
  const isReadOnly = districtLoaded  // all fields read-only once district is loaded

  return (
    <div className="card predict-form-card">
      <h2 className="card__title">
        <span aria-hidden="true">🔍</span> AI Risk Prediction
      </h2>

      {/* District selector — triggers live Open-Meteo fetch */}
      <div className="form-field" style={{ marginBottom: '1rem' }}>
        <label htmlFor="district-select" style={{ fontWeight: 700 }}>
          District&nbsp;
          <span style={{ fontSize: '.7rem', color: '#c0541a', fontWeight: 700 }}>
            ▸ select to auto-load live weather
          </span>
        </label>
        <select
          id="district-select"
          value={district}
          onChange={handleDistrictChange}
          style={{ borderColor: '#c0541a', fontWeight: 700 }}
        >
          <option value="">— Select district (or fill manually below) —</option>
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Weather status banner */}
      {weatherStatus === 'fetching' && (
        <div style={{ padding: '.65rem 1rem', background: '#f0faf4', borderRadius: 8,
                      fontSize: '.82rem', color: '#0e4820', marginBottom: '.75rem',
                      display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span>🌐</span> {wxMessage}
        </div>
      )}
      {weatherStatus === 'live' && (
        <div style={{ padding: '.65rem 1rem', background: '#e0f4f0', borderRadius: 8,
                      fontSize: '.82rem', color: '#0e4820', marginBottom: '.75rem',
                      display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span>🟢</span> <strong>Live Open-Meteo data</strong> — {wxMessage}
        </div>
      )}
      {weatherStatus === 'fallback' && (
        <div style={{ padding: '.65rem 1rem', background: '#fef8e8', borderRadius: 8,
                      fontSize: '.82rem', color: '#6a3800', marginBottom: '.75rem',
                      display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span>📌</span> <strong>District profile</strong> — {wxMessage}
        </div>
      )}
      {weatherStatus === 'error' && (
        <div style={{ padding: '.65rem 1rem', background: '#fdecea', borderRadius: 8,
                      fontSize: '.82rem', color: '#8b1a10', marginBottom: '.75rem',
                      display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span>⚠️</span> Could not fetch weather data: {wxMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="predict-form" aria-label="Landslide risk prediction form">
        <div className="predict-form__grid">
          {MANUAL_FIELDS.map(({ key, label, min, max, step }) => {
            const isLiveField = key === 'precipitation' || key === 'soil_moisture'
            return (
              <div key={key} className="form-field">
                <label htmlFor={key}>
                  {label}
                  {isLiveField && weatherStatus === 'live' && (
                    <span style={{ fontSize: '.65rem', color: '#1a7a6e', fontWeight: 700,
                                   marginLeft: '.4rem' }}>🟢 live</span>
                  )}
                  {isLiveField && weatherStatus === 'fallback' && (
                    <span style={{ fontSize: '.65rem', color: '#6a3800', fontWeight: 700,
                                   marginLeft: '.4rem' }}>📌 profile</span>
                  )}
                </label>
                <input
                  id={key}
                  name={key}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={form[key]}
                  onChange={handleChange}
                  readOnly={isReadOnly}
                  style={isReadOnly ? { background: '#f0faf4' } : undefined}
                  required
                />
              </div>
            )
          })}

          <div className="form-field">
            <label htmlFor="soil_type">Soil Type</label>
            <select
              id="soil_type" name="soil_type"
              value={form.soil_type}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              {SOIL_TYPES.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="lulc">Land Use / Land Cover</label>
            <select
              id="lulc" name="lulc"
              value={form.lulc}
              onChange={handleChange}
              disabled={isReadOnly}
            >
              {LULC_TYPES.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Predicting…' : 'Predict Risk'}
        </button>
      </form>

      {error && (
        <div className="predict-result predict-result--error" role="alert">
          ⚠️ {error}
        </div>
      )}

      {result && cfg && (
        <div
          className="predict-result"
          style={{ background: cfg.bg, borderLeft: `4px solid ${cfg.color}` }}
          role="status"
          aria-live="polite"
        >
          <div className="predict-result__header">
            <span className="predict-result__emoji" aria-hidden="true">{cfg.emoji}</span>
            <span className="predict-result__label" style={{ color: cfg.color }}>
              {result.risk_category} Risk
            </span>
            <span className="predict-result__confidence">
              Confidence: {(result.confidence * 100).toFixed(1)}%
            </span>
          </div>

          {/* Confidence bar */}
          <div className="confidence-bar" aria-label={`Confidence: ${(result.confidence * 100).toFixed(1)}%`}>
            <div
              className="confidence-bar__fill"
              style={{ width: `${result.confidence * 100}%`, background: cfg.color }}
            />
          </div>

          {/* Probability breakdown */}
          <div className="prob-breakdown">
            {Object.entries(result.probabilities).map(([label, prob]) => {
              const c = RISK_CONFIG[label]
              return (
                <div key={label} className="prob-item">
                  <span style={{ color: c?.color }}>{label}</span>
                  <div className="prob-bar">
                    <div
                      className="prob-bar__fill"
                      style={{ width: `${prob * 100}%`, background: c?.color }}
                      aria-label={`${label}: ${(prob * 100).toFixed(1)}%`}
                    />
                  </div>
                  <span>{(prob * 100).toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
