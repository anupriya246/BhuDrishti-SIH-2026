/**
 * BhuDrishti Dashboard — Root Component
 * Tabs: Overview (map + stats) | AI Risk Assessment | Forecast
 */
import React, { useState, useEffect, useCallback } from 'react'
import { fetchStats, fetchRegionRisks } from './services/api'
import AlertBanner    from './components/AlertBanner'
import MapView        from './components/MapView'
import RiskDashboard  from './components/RiskDashboard'
import PredictForm    from './components/PredictForm'
import ForecastPanel  from './components/ForecastPanel'

const TABS = ['Overview', 'AI Risk Assessment', 'Forecast']
const REFRESH_INTERVAL = 60_000

export default function App() {
  const [activeTab,      setActiveTab]      = useState('Overview')
  const [stats,          setStats]          = useState(null)
  const [regions,        setRegions]        = useState([])
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [lastUpdated,    setLastUpdated]     = useState(null)
  const [apiOnline,      setApiOnline]       = useState(null)

  const loadData = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([fetchStats(), fetchRegionRisks()])
      setStats(s)
      setRegions(r)
      setLastUpdated(new Date())
      setApiOnline(true)
    } catch {
      setApiOnline(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [loadData])

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header" role="banner">
        <div className="header__brand">
          {/* BhuDrishti icon — mountain with eye (भू=earth, दृष्टि=vision) */}
          <div className="header__logo" aria-hidden="true" />
          <div>
            <h1 className="header__title">BhuDrishti</h1>
            <p className="header__subtitle">AI-Based Landslide Early Warning — North-East India · SIH 2026</p>
          </div>
        </div>

        <div className="header__meta">
          <span
            className={`status-dot ${
              apiOnline === true  ? 'status-dot--online'  :
              apiOnline === false ? 'status-dot--offline' : ''
            }`}
            aria-label={apiOnline ? 'API online' : 'API offline'}
          />
          <span className="header__api-status">
            {apiOnline === true  ? '● API Online'   :
             apiOnline === false ? '● API Offline'  : 'Connecting…'}
          </span>
          {lastUpdated && (
            <span className="header__updated">
              Updated {lastUpdated.toLocaleTimeString('en-IN')}
            </span>
          )}
          <button className="btn btn--ghost" onClick={loadData} aria-label="Refresh data">
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* ── Alert Banner ── */}
      <AlertBanner regions={regions} />

      {/* ── Tabs ── */}
      <nav className="tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`tabs__btn ${activeTab === tab ? 'tabs__btn--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Overview'           && '⬡ '}
            {tab === 'AI Risk Assessment' && '🤖 '}
            {tab === 'Forecast'           && '⏱ '}
            {tab}
          </button>
        ))}
      </nav>

      {/* ── Main ── */}
      <main className="main" role="main">
        {loading && (
          <div className="loading" aria-live="polite" aria-busy="true">
            <div className="spinner" aria-hidden="true" />
            Loading BhuDrishti data…
          </div>
        )}

        {!loading && activeTab === 'Overview' && (
          <>
            <RiskDashboard
              stats={stats}
              regions={regions}
              selectedRegion={selectedRegion}
            />
            <MapView
              regions={regions}
              onSelectRegion={setSelectedRegion}
            />
          </>
        )}

        {activeTab === 'AI Risk Assessment' && <PredictForm />}
        {activeTab === 'Forecast'           && <ForecastPanel />}
      </main>

      {/* ── Footer ── */}
      <footer className="footer" role="contentinfo">
        <span><strong>BhuDrishti</strong> — Team InnoVision · Smart India Hackathon 2026 · IGDTUW</span>
        <span>Stack: Python · scikit-learn · Flask · Node.js · Express · <strong>PostgreSQL</strong> · React · Leaflet · Chart.js</span>
      </footer>
    </div>
  )
}
