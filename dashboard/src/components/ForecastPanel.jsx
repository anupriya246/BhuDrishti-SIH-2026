/**
 * ForecastPanel — 24-hour lead-time alert using Open-Meteo live rainfall forecast.
 * Shows when the risk is expected to breach the threshold and a timeline.
 */
import React, { useState } from 'react'
import { fetchForecast } from '../services/api'

const RISK_COLORS = {
  low:      '#2ecc71',
  moderate: '#f39c12',
  high:     '#e74c3c',
  critical: '#8e44ad',
}

// Preset NER locations with real district-specific terrain data
// (matches DISTRICT_PROFILES in ml/api/app.py)
// precipitation & soil_moisture are omitted — Flask fetches them live from Open-Meteo.
const PRESETS = [
  {
    label: 'Cherrapunji', lat: 25.25,  lon: 91.73,
    slope: 54, elevation: 1313, curvature: 3.1, aspect: 225,
    ndvi: 0.20, soil_type: 2, lulc: 1, dist_road: 400, dist_fault: 3000,
  },
  {
    label: 'Tawang',      lat: 27.59,  lon: 91.86,
    slope: 48, elevation: 3048, curvature: 2.2, aspect: 210,
    ndvi: 0.45, soil_type: 2, lulc: 0, dist_road: 800, dist_fault: 6000,
  },
  {
    label: 'Kohima',      lat: 25.67,  lon: 94.11,
    slope: 41, elevation: 1444, curvature: 2.0, aspect: 200,
    ndvi: 0.40, soil_type: 2, lulc: 0, dist_road: 350, dist_fault: 5000,
  },
  {
    label: 'Aizawl',      lat: 23.73,  lon: 92.72,
    slope: 36, elevation: 1132, curvature: 1.8, aspect: 195,
    ndvi: 0.42, soil_type: 2, lulc: 0, dist_road: 300, dist_fault: 6500,
  },
  {
    label: 'Gangtok',     lat: 27.34,  lon: 88.61,
    slope: 45, elevation: 1650, curvature: 2.5, aspect: 215,
    ndvi: 0.38, soil_type: 2, lulc: 0, dist_road: 500, dist_fault: 4000,
  },
]

export default function ForecastPanel() {
  const [presetIdx, setPresetIdx]   = useState(0)
  const [lat, setLat]               = useState(PRESETS[0].lat)
  const [lon, setLon]               = useState(PRESETS[0].lon)
  const [threshold, setThreshold]   = useState('high')
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)

  // Derive terrain features from the selected preset.
  // precipitation & soil_moisture are excluded — Flask fetches them live per hour.
  function getStaticFeatures(idx) {
    const p = PRESETS[idx]
    return {
      slope:      p.slope,
      elevation:  p.elevation,
      curvature:  p.curvature,
      aspect:     p.aspect,
      ndvi:       p.ndvi,
      soil_type:  p.soil_type,
      lulc:       p.lulc,
      dist_road:  p.dist_road,
      dist_fault: p.dist_fault,
    }
  }

  async function handleForecast(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await fetchForecast(lat, lon, getStaticFeatures(presetIdx), threshold)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Forecast failed. Check internet connection and Flask API.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card forecast-card">
      <h2 className="card__title">
        <span aria-hidden="true">⏱️</span> 24-Hour Early Warning Forecast
      </h2>

      <form onSubmit={handleForecast} className="forecast-form" aria-label="Forecast form">
        <div className="forecast-form__row">
          <div className="form-field">
            <label htmlFor="preset">Quick Select</label>
            <select
              id="preset"
              value={presetIdx}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10)
                const p = PRESETS[idx]
                setPresetIdx(idx)
                setLat(p.lat)
                setLon(p.lon)
              }}
            >
              {PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="f-lat">Latitude</label>
            <input id="f-lat" type="number" step="0.01" value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value))} required />
          </div>
          <div className="form-field">
            <label htmlFor="f-lon">Longitude</label>
            <input id="f-lon" type="number" step="0.01" value={lon}
              onChange={(e) => setLon(parseFloat(e.target.value))} required />
          </div>
          <div className="form-field">
            <label htmlFor="f-threshold">Alert Threshold</label>
            <select id="f-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)}>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? 'Fetching…' : 'Run Forecast'}
          </button>
        </div>
      </form>

      {error && <div className="predict-result predict-result--error" role="alert">⚠️ {error}</div>}

      {result && (
        <div className="forecast-result" aria-live="polite">
          {/* Summary */}
          <div className={`forecast-summary ${result.alert_expected ? 'forecast-summary--alert' : 'forecast-summary--safe'}`}>
            {result.alert_expected ? (
              <>
                <span aria-hidden="true">🚨</span>
                <div>
                  <strong>Alert expected in {result.hours_until_alert} hour{result.hours_until_alert !== 1 ? 's' : ''}</strong>
                  <p>Threshold breach at <strong>{result.alert_time}</strong> — predicted zone: <strong style={{ color: RISK_COLORS[result.predicted_zone_at_alert] }}>{result.predicted_zone_at_alert}</strong></p>
                </div>
              </>
            ) : (
              <>
                <span aria-hidden="true">✅</span>
                <strong>No alert expected in the next 24 hours</strong>
              </>
            )}
          </div>

          {/* Hourly timeline */}
          <div className="forecast-timeline" role="list" aria-label="Hourly forecast">
            {result.full_24h_forecast.map((h) => {
              const color = RISK_COLORS[h.predicted_zone] || '#64748b'
              return (
                <div
                  key={h.hour}
                  className="timeline-item"
                  style={{ borderBottom: `3px solid ${color}` }}
                  role="listitem"
                  title={`${h.time} — ${h.predicted_zone} (${h.precipitation} mm)`}
                >
                  <div className="timeline-item__hour">{h.hour}h</div>
                  <div className="timeline-item__rain">🌧 {h.precipitation.toFixed(1)}</div>
                  <div className="timeline-item__zone" style={{ color, fontSize: '0.7rem' }}>
                    {h.predicted_zone}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
