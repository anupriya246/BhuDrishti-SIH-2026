/**
 * RiskDashboard — stat cards + bar chart showing zone distribution.
 * Uses Chart.js via react-chartjs-2.
 */
import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, ArcElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, ArcElement,
  Title, Tooltip, Legend
)

const RISK_COLORS = {
  Low:      '#2ecc71',
  Moderate: '#f39c12',
  High:     '#e74c3c',
  Critical: '#8e44ad',
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `4px solid ${color}` }}>
      <div className="stat-card__icon" aria-hidden="true">{icon}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}

export default function RiskDashboard({ stats, regions, selectedRegion }) {
  // Count zones per category
  const counts = { Low: 0, Moderate: 0, High: 0, Critical: 0 }
  ;(regions || []).forEach((r) => { counts[r.risk_category] = (counts[r.risk_category] || 0) + 1 })

  // Bar chart — rainfall by district
  const barData = {
    labels:   (regions || []).map((r) => r.name),
    datasets: [
      {
        label:           'Rainfall (mm)',
        data:            (regions || []).map((r) => r.rainfall_mm),
        backgroundColor: (regions || []).map((r) => RISK_COLORS[r.risk_category] + 'cc'),
        borderColor:     (regions || []).map((r) => RISK_COLORS[r.risk_category]),
        borderWidth:     1,
        borderRadius:    4,
      },
    ],
  }

  const barOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text:    'Rainfall by District (mm)',
        color:   '#e2e8f0',
        font:    { size: 14 },
      },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} mm` } },
    },
    scales: {
      x: { ticks: { color: '#94a3b8', maxRotation: 45 }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' },                  grid: { color: '#334155' } },
    },
  }

  // Doughnut — risk distribution
  const doughnutData = {
    labels:   Object.keys(counts),
    datasets: [{
      data:            Object.values(counts),
      backgroundColor: Object.keys(counts).map((k) => RISK_COLORS[k] + 'cc'),
      borderColor:     Object.keys(counts).map((k) => RISK_COLORS[k]),
      borderWidth:     2,
    }],
  }

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#e2e8f0' } },
      title: {
        display: true,
        text:    'Risk Zone Distribution',
        color:   '#e2e8f0',
        font:    { size: 14 },
      },
    },
  }

  return (
    <div className="risk-dashboard">
      {/* Stat cards */}
      <div className="stat-cards" role="list" aria-label="Summary statistics">
        <StatCard label="Monitored Zones"  value={stats?.total_monitored_zones ?? '—'} icon="📍" color="#3b82f6" />
        <StatCard label="Active Alerts"    value={stats?.active_alerts ?? '—'}          icon="🔔" color="#f59e0b" />
        <StatCard label="High Risk Zones"  value={counts.High}                          icon="⚠️"  color="#ef4444" />
        <StatCard label="Critical Zones"   value={counts.Critical}                      icon="🚨" color="#8e44ad" />
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="card chart-card">
          <Bar data={barData} options={barOptions} aria-label="Rainfall bar chart" />
        </div>
        <div className="card chart-card chart-card--small">
          <Doughnut data={doughnutData} options={doughnutOptions} aria-label="Risk distribution doughnut chart" />

          {/* Top Risk Districts */}
          <div className="top-districts" aria-label="Top risk districts">
            <h4 className="top-districts__title">⚠️ Top Risk Districts</h4>
            <ul className="top-districts__list">
              {[...( regions || [])]
                .sort((a, b) => b.risk_label - a.risk_label || b.rainfall_mm - a.rainfall_mm)
                .slice(0, 5)
                .map((r) => (
                  <li key={r.name} className="top-districts__item">
                    <span
                      className="top-districts__dot"
                      style={{ background: RISK_COLORS[r.risk_category] }}
                      aria-hidden="true"
                    />
                    <span className="top-districts__name">{r.name}</span>
                    <span
                      className="top-districts__badge"
                      style={{ color: RISK_COLORS[r.risk_category] }}
                    >
                      {r.risk_category}
                    </span>
                    <span className="top-districts__rain">🌧 {r.rainfall_mm} mm</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Selected region detail */}
      {selectedRegion && (
        <div
          className="card region-detail"
          style={{ borderLeft: `4px solid ${RISK_COLORS[selectedRegion.risk_category]}` }}
          aria-live="polite"
        >
          <h3>{selectedRegion.name} — Details</h3>
          <div className="region-detail__grid">
            <div><span>Risk Level</span>
              <strong style={{ color: RISK_COLORS[selectedRegion.risk_category] }}>
                {selectedRegion.risk_category}
              </strong>
            </div>
            <div><span>Rainfall</span>      <strong>{selectedRegion.rainfall_mm} mm</strong></div>
            <div><span>Avg Slope</span>     <strong>{selectedRegion.slope_avg}°</strong></div>
            <div><span>Coordinates</span>   <strong>{selectedRegion.lat.toFixed(3)}, {selectedRegion.lon.toFixed(3)}</strong></div>
          </div>
        </div>
      )}
    </div>
  )
}
