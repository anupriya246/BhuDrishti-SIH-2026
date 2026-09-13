/**
 * AlertBanner — shows active critical/high alerts at the top of the page.
 * In production these map to SMS triggers sent via the Node.js backend.
 */
import React from 'react'

const LEVEL_CONFIG = {
  Critical: { bg: '#5b21b6', icon: '🚨', border: '#8b5cf6' },
  High:     { bg: '#991b1b', icon: '⚠️',  border: '#ef4444' },
  Moderate: { bg: '#92400e', icon: '📢', border: '#f59e0b' },
  Low:      { bg: '#065f46', icon: '✅', border: '#10b981' },
}

export default function AlertBanner({ regions }) {
  const alerts = (regions || []).filter(
    (r) => r.risk_category === 'Critical' || r.risk_category === 'High'
  )

  if (alerts.length === 0) return null

  return (
    <div className="alert-banner" role="alert" aria-live="assertive">
      <div className="alert-banner__header">
        <span className="alert-banner__pulse" aria-hidden="true" />
        <strong>ACTIVE ALERTS — {alerts.length} zone{alerts.length > 1 ? 's' : ''} at risk</strong>
      </div>
      <div className="alert-banner__list">
        {alerts.map((a) => {
          const cfg = LEVEL_CONFIG[a.risk_category] || LEVEL_CONFIG.High
          return (
            <div
              key={a.name}
              className="alert-banner__item"
              style={{ borderLeft: `4px solid ${cfg.border}`, background: `${cfg.bg}33` }}
            >
              <span className="alert-banner__icon" aria-hidden="true">{cfg.icon}</span>
              <span>
                <strong>{a.name}</strong> — {a.risk_category} risk
                &nbsp;|&nbsp; Rainfall: {a.rainfall_mm} mm
                &nbsp;|&nbsp; Slope: {a.slope_avg}°
              </span>
              <span className="alert-banner__sms">📱 SMS sent to authorities</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
