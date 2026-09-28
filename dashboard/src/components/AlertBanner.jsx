/**
 * BhuDrishti — AlertBanner
 * Light mode, warm earthy colours
 */
import React from 'react'

const LEVEL_CONFIG = {
  Critical: { bg: '#ece0fa', border: '#9050d0', icon: '🚨', txtColor: '#380868' },
  High:     { bg: '#fde8e4', border: '#d06050', icon: '⚠️',  txtColor: '#681808' },
  Moderate: { bg: '#fef3d0', border: '#d4a020', icon: '📢', txtColor: '#6a3800' },
  Low:      { bg: '#e0f5e8', border: '#50b878', icon: '✅', txtColor: '#0a3c18' },
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
              style={{ borderLeft: `4px solid ${cfg.border}`, background: cfg.bg, color: cfg.txtColor }}
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
