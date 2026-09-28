/**
 * BhuDrishti Dashboard — Root Component
 * Tabs: Overview (map + stats) | Predict | Forecast
 */
import React, { useState, useEffect, useCallback } from 'react'
import { fetchStats, fetchRegionRisks, logout } from './services/api'
import AuthPage       from './components/AuthPage'
import AlertBanner    from './components/AlertBanner'
import MapView        from './components/MapView'
import RiskDashboard  from './components/RiskDashboard'
import PredictForm    from './components/PredictForm'
import ForecastPanel  from './components/ForecastPanel'

const TABS = ['Overview', 'Predict Risk', 'Forecast']
const REFRESH_INTERVAL = 60_000 // 1 minute

function hasToken() {
  return !!localStorage.getItem('bhudrishti_token')
}

export default function App() {
  const [authed,          setAuthed]          = useState(hasToken)
  const [activeTab,       setActiveTab]       = useState('Overview')
  const [stats,           setStats]           = useState(null)
  const [regions,         setRegions]         = useState([])
  const [selectedRegion,  setSelectedRegion]  = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [lastUpdated,     setLastUpdated]      = useState(null)
  const [apiOnline,       setApiOnline]        = useState(null)

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
    if (!authed) return
    loadData()
    const id = setInterval(loadData, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [authed, loadData])

  function handleAuth() {
    setAuthed(true)
    setLoading(true)
  }

  function handleLogout() {
    logout()
    setAuthed(false)
    setStats(null)
    setRegions([])
    setLoading(true)
    setApiOnline(null)
  }

  // Show login/register screen if not authenticated
  if (!authed) {
    return <AuthPage onAuth={handleAuth} />
  }

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header" role="banner">
        <div className="header__brand">
          <span className="header__logo" aria-hidden="true">🏔️</span>
          <div>
            <h1 className="header__title">BhuDrishti</h1>
            <p className="header__subtitle">AI-Based Landslide Early Warning — North-East India</p>
          </div>
        </div>

        <div className="header__meta">
          <span
            className={`status-dot ${apiOnline === true ? 'status-dot--online' : apiOnline === false ? 'status-dot--offline' : ''}`}
            aria-label={apiOnline ? 'API online' : 'API offline'}
          />
          <span className="header__api-status">
            {apiOnline === true ? 'API Online' : apiOnline === false ? 'API Offline' : 'Connecting…'}
          </span>
          {lastUpdated && (
            <span className="header__updated">
              Updated {lastUpdated.toLocaleTimeString('en-IN')}
            </span>
          )}
          <button className="btn btn--ghost" onClick={loadData} aria-label="Refresh data">
            🔄 Refresh
          </button>
          <button className="btn btn--ghost" onClick={handleLogout} aria-label="Sign out">
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Alert Banner ───────────────────────────────────────────────── */}
      <AlertBanner regions={regions} />

      {/* ── Navigation Tabs ────────────────────────────────────────────── */}
      <nav className="tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`tabs__btn ${activeTab === tab ? 'tabs__btn--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Overview'      && '📊 '}
            {tab === 'Predict Risk'  && '🔍 '}
            {tab === 'Forecast'      && '⏱️ '}
            {tab}
          </button>
        ))}
      </nav>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main className="main" role="main">
        {loading && (
          <div className="loading" aria-live="polite" aria-busy="true">
            <div className="spinner" aria-hidden="true" />
            Loading data…
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

        {activeTab === 'Predict Risk' && <PredictForm />}
        {activeTab === 'Forecast'     && <ForecastPanel />}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="footer" role="contentinfo">
        <span>BhuDrishti — InnoVision | Smart India Hackathon 2026</span>
        <span>Data: IMD · USGS · Open-Meteo · Mendeley Landslide Dataset</span>
      </footer>
    </div>
  )
}
