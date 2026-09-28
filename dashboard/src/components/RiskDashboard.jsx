/**
 * BhuDrishti — RiskDashboard
 * Stat cards (vivid coloured) + bar chart + doughnut + region detail
 */
import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, ArcElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

const RISK_COLORS = {
  Low:      '#1a7a32',
  Moderate: '#b86000',
  High:     '#a02818',
  Critical: '#6020a8',
}

// Each stat card gets a vivid gradient background
const STAT_CARD_STYLES = {
  monitored: { background: 'linear-gradient(145deg,#1060b0,#1a90d8)', boxShadow: '0 6px 24px #1060b040' },
  alerts:    { background: 'linear-gradient(145deg,#c07010,#e09020)', boxShadow: '0 6px 24px #c0701040' },
  high:      { background: 'linear-gradient(145deg,#a02818,#d04030)', boxShadow: '0 6px 24px #a0281840' },
  critical:  { background: 'linear-gradient(145deg,#5a1898,#8030c8)', boxShadow: '0 6px 24px #5a189840' },
}

function StatCard({ label, value, icon, styleKey }) {
  return (
    <div className="stat-card" style={STAT_CARD_STYLES[styleKey]}>
      <div className="stat-card__icon" aria-hidden="true">{icon}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}

export default function RiskDashboard({ stats, regions, selectedRegion }) {
  const counts = { Low: 0, Moderate: 0, High: 0, Critical: 0 }
  ;(regions || []).forEach((r) => { counts[r.risk_category] = (counts[r.risk_category] || 0) + 1 })

  const barData = {
    labels: (regions || []).map((r) => r.name),
    datasets: [{
      label: 'Rainfall (mm)',
      data: (regions || []).map((r) => r.rainfall_mm),
      backgroundColor: (regions || []).map((r) => RISK_COLORS[r.risk_category] + 'cc'),
      borderColor:     (regions || []).map((r) => RISK_COLORS[r.risk_category]),
      borderWidth: 2,
      borderRadius: 6,
    }],
  }

  const barOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Rainfall by District (mm)', color: '#3a0870', font: { size: 13, weight: '700' } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} mm` } },
    },
    scales: {
      x: { ticks: { color: '#5a3890', maxRotation: 40, font: { size: 10 } }, grid: { color: '#e8d8f8' } },
      y: { ticks: { color: '#5a3890', font: { size: 10 } },                  grid: { color: '#e8d8f8' } },
    },
  }

  const doughnutData = {
    labels: Object.keys(counts),
    datasets: [{
      data: Object.values(counts),
      backgroundColor: Object.keys(counts).map((k) => RISK_COLORS[k] + 'cc'),
      borderColor:     Object.keys(counts).map((k) => RISK_COLORS[k]),
      borderWidth: 3,
    }],
  }

  const doughnutOptions = {
    responsive: true,
    cutout: '62%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#3a0870', font: { size: 10 }, padding: 12 } },
      title: { display: true, text: 'Risk Zone Distribution', color: '#3a0870', font: { size: 13, weight: '700' } },
    },
  }

  return (
    <div className="risk-dashboard">
      {/* Stat cards */}
      <div className="stat-cards" role="list" aria-label="Summary statistics">
        <StatCard label="Monitored Zones" value={stats?.total_monitored_zones ?? '—'} icon="📍" styleKey="monitored" />
        <StatCard label="Active Alerts"   value={stats?.active_alerts ?? '—'}          icon="🔔" styleKey="alerts"    />
        <StatCard label="High Risk Zones" value={counts.High}                           icon="⚠️"  styleKey="high"      />
        <StatCard label="Critical Zones"  value={counts.Critical}                       icon="🚨" styleKey="critical"  />
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="card chart-card">
          <Bar data={barData} options={barOptions} aria-label="Rainfall bar chart" />
        </div>
        <div className="card chart-card">
          <Doughnut data={doughnutData} options={doughnutOptions} aria-label="Risk distribution chart" />
        </div>
      </div>

      {/* Selected region detail */}
      {selectedRegion && (
        <div
          className="card region-detail"
          style={{ borderLeft: `4px solid ${RISK_COLORS[selectedRegion.risk_category]}`, background: 'linear-gradient(145deg,#fff8e8,#fff0c8)', borderColor: '#e8c870' }}
          aria-live="polite"
        >
          <h3>{selectedRegion.name} — Details</h3>
          <div className="region-detail__grid">
            <div><span>Risk Level</span>
              <strong style={{ color: RISK_COLORS[selectedRegion.risk_category] }}>
                {selectedRegion.risk_category}
              </strong>
            </div>
            <div><span>Rainfall</span>    <strong>{selectedRegion.rainfall_mm} mm</strong></div>
            <div><span>Avg Slope</span>   <strong>{selectedRegion.slope_avg}°</strong></div>
            <div><span>Coordinates</span> <strong>{selectedRegion.lat.toFixed(3)}, {selectedRegion.lon.toFixed(3)}</strong></div>
          </div>
        </div>
      )}
    </div>
  )
}
