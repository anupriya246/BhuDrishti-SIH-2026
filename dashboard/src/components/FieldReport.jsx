/**
 * FieldReport — Submit a ground-truth observation from the field.
 * Calls POST /api/field-reports via the existing submitFieldReport() service.
 *
 * Fields match the backend's fieldReports.routes.js validation exactly:
 *   report_type (required), district, latitude, longitude,
 *   description, severity, image_url
 */
import React, { useState } from 'react'
import { submitFieldReport } from '../services/api'

const REPORT_TYPES = [
  { value: 'crack',                 label: '🪨 Crack / Ground Movement' },
  { value: 'blocked_road',          label: '🚧 Blocked Road' },
  { value: 'landslide_occurred',    label: '⛰️ Landslide Occurred' },
  { value: 'flooding',              label: '🌊 Flooding' },
  { value: 'infrastructure_damage', label: '🏚️ Infrastructure Damage' },
  { value: 'other',                 label: '📝 Other' },
]

const SEVERITIES = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'low',     label: 'Low' },
  { value: 'medium',  label: 'Medium' },
  { value: 'high',    label: 'High' },
]

const SEVERITY_COLORS = {
  unknown: '#64748b',
  low:     '#2ecc71',
  medium:  '#f39c12',
  high:    '#e74c3c',
}

const EMPTY_FORM = {
  report_type: '',
  district:    '',
  latitude:    '',
  longitude:   '',
  description: '',
  severity:    'unknown',
  image_url:   '',
}

export default function FieldReport() {
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)   // submitted report object
  const [error,   setError]   = useState(null)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Frontend validation — report_type is the only required field (matches backend)
    if (!form.report_type) {
      setError('Please select a report type.')
      return
    }

    // Build payload — omit blank optional fields
    const payload = { report_type: form.report_type }
    if (form.district.trim())   payload.district    = form.district.trim()
    if (form.description.trim()) payload.description = form.description.trim()
    if (form.image_url.trim())  payload.image_url   = form.image_url.trim()
    if (form.severity)          payload.severity    = form.severity
    if (form.latitude  !== '')  payload.latitude    = parseFloat(form.latitude)
    if (form.longitude !== '')  payload.longitude   = parseFloat(form.longitude)

    setLoading(true)
    try {
      const data = await submitFieldReport(payload)
      setSuccess(data)
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Could not submit report. Please check your connection and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  function handleNewReport() {
    setSuccess(null)
    setError(null)
  }

  const sevColor = SEVERITY_COLORS[form.severity] || SEVERITY_COLORS.unknown

  return (
    <div className="card predict-form-card">
      <h2 className="card__title">
        <span aria-hidden="true">📋</span> Submit Field Report
      </h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Report ground observations — cracks, blocked roads, landslides, or flooding — directly from the field.
      </p>

      {/* ── Success state ─────────────────────────────────────────────── */}
      {success && (
        <div
          className="predict-result"
          style={{ background: '#052e16', borderLeft: '4px solid #2ecc71' }}
          role="status"
          aria-live="polite"
        >
          <div className="predict-result__header">
            <span className="predict-result__emoji" aria-hidden="true">✅</span>
            <span className="predict-result__label" style={{ color: '#2ecc71' }}>
              Report Submitted Successfully
            </span>
          </div>
          <div style={{ color: '#cbd5e1', fontSize: '0.875rem', marginTop: '0.75rem', lineHeight: 1.6 }}>
            <div><strong style={{ color: '#e2e8f0' }}>Report ID:</strong> {success.id}</div>
            <div><strong style={{ color: '#e2e8f0' }}>Type:</strong> {REPORT_TYPES.find(t => t.value === success.report_type)?.label ?? success.report_type}</div>
            {success.district   && <div><strong style={{ color: '#e2e8f0' }}>District:</strong>  {success.district}</div>}
            {success.severity   && <div><strong style={{ color: '#e2e8f0' }}>Severity:</strong>  {success.severity}</div>}
            {success.created_at && <div><strong style={{ color: '#e2e8f0' }}>Submitted:</strong> {new Date(success.created_at).toLocaleString('en-IN')}</div>}
          </div>
          <button
            className="btn btn--primary"
            style={{ marginTop: '1.25rem' }}
            onClick={handleNewReport}
          >
            Submit Another Report
          </button>
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────── */}
      {!success && (
        <form onSubmit={handleSubmit} className="predict-form" aria-label="Field report submission form" noValidate>
          <div className="predict-form__grid">

            {/* Report Type — required */}
            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="report_type">
                Report Type <span style={{ color: '#e74c3c' }} aria-hidden="true">*</span>
              </label>
              <select
                id="report_type"
                name="report_type"
                value={form.report_type}
                onChange={handleChange}
                required
                aria-required="true"
                style={{ background: form.report_type ? undefined : '#1e293b' }}
              >
                <option value="" disabled>— Select report type —</option>
                {REPORT_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div className="form-field">
              <label htmlFor="severity">Severity</label>
              <select
                id="severity"
                name="severity"
                value={form.severity}
                onChange={handleChange}
                style={{ borderLeft: `3px solid ${sevColor}` }}
              >
                {SEVERITIES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* District */}
            <div className="form-field">
              <label htmlFor="district">District</label>
              <input
                id="district"
                name="district"
                type="text"
                placeholder="e.g. Cherrapunji"
                value={form.district}
                onChange={handleChange}
              />
            </div>

            {/* Latitude */}
            <div className="form-field">
              <label htmlFor="latitude">Latitude</label>
              <input
                id="latitude"
                name="latitude"
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                placeholder="e.g. 25.2500"
                value={form.latitude}
                onChange={handleChange}
              />
            </div>

            {/* Longitude */}
            <div className="form-field">
              <label htmlFor="longitude">Longitude</label>
              <input
                id="longitude"
                name="longitude"
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                placeholder="e.g. 91.7300"
                value={form.longitude}
                onChange={handleChange}
              />
            </div>

            {/* Image URL */}
            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="image_url">Image URL (optional)</label>
              <input
                id="image_url"
                name="image_url"
                type="url"
                placeholder="https://…"
                value={form.image_url}
                onChange={handleChange}
              />
            </div>

            {/* Description */}
            <div className="form-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="Describe what you observed — extent, movement, affected structures, etc."
                value={form.description}
                onChange={handleChange}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.6rem 0.75rem',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

          </div>

          {/* Error */}
          {error && (
            <div
              className="predict-result predict-result--error"
              role="alert"
              style={{ marginBottom: '1rem' }}
            >
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? 'Submitting…' : '📤 Submit Report'}
          </button>
        </form>
      )}
    </div>
  )
}
