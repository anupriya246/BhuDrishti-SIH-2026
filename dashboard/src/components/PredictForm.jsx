/**
 * PredictForm — manual risk prediction form.
 * Calls POST /api/predict and shows the result with a confidence bar.
 */
import React, { useState } from 'react'
import { predictRisk } from '../services/api'

const DEFAULTS = {
  slope:         35,
  elevation:     1000,
  curvature:     2.0,
  aspect:        180,
  precipitation: 80,
  ndvi:          0.3,
  soil_moisture: 0.5,
  soil_type:     1,
  lulc:          0,
  dist_road:     500,
  dist_fault:    8000,
}

const FIELDS = [
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
  const [form, setForm]       = useState(DEFAULTS)
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

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
      setError(err.response?.data?.error || 'API unreachable. Make sure Flask is running.')
    } finally {
      setLoading(false)
    }
  }

  const cfg = result ? RISK_CONFIG[result.risk_category] : null

  return (
    <div className="card predict-form-card">
      <h2 className="card__title">
        <span aria-hidden="true">🔍</span> Manual Risk Prediction
      </h2>

      <form onSubmit={handleSubmit} className="predict-form" aria-label="Landslide risk prediction form">
        <div className="predict-form__grid">
          {FIELDS.map(({ key, label, min, max, step }) => (
            <div key={key} className="form-field">
              <label htmlFor={key}>{label}</label>
              <input
                id={key}
                name={key}
                type="number"
                min={min}
                max={max}
                step={step}
                value={form[key]}
                onChange={handleChange}
                required
              />
            </div>
          ))}

          <div className="form-field">
            <label htmlFor="soil_type">Soil Type</label>
            <select id="soil_type" name="soil_type" value={form.soil_type} onChange={handleChange}>
              {SOIL_TYPES.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="lulc">Land Use / Land Cover</label>
            <select id="lulc" name="lulc" value={form.lulc} onChange={handleChange}>
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
