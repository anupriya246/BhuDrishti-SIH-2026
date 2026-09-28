/**
 * AuthPage — Login / Register form for BhuDrishti.
 * Shown when no JWT token exists in localStorage.
 */
import React, { useState } from 'react'
import { login, register } from '../services/api'

const DISTRICTS = [
  'Cherrapunji', 'Tawang', 'Kohima', 'Shillong', 'Itanagar',
  'Imphal', 'Dibrugarh', 'Aizawl', 'Agartala', 'Gangtok',
  'Silchar', 'Jorhat',
]

const ROLES = [
  { value: 'citizen',        label: 'Citizen' },
  { value: 'field_officer',  label: 'Field Officer' },
  { value: 'district_admin', label: 'District Admin' },
]

export default function AuthPage({ onAuth }) {
  const [mode,     setMode]     = useState('login')   // 'login' | 'register'
  const [form,     setForm]     = useState({
    name: '', email: '', password: '', role: 'citizen', district: 'Shillong', phone: '',
  })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
      } else {
        await register(form.name, form.email, form.password, form.role, form.district, form.phone)
      }
      onAuth()
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay" role="main">
      <div className="auth-card">
        {/* Brand */}
        <div className="auth-brand">
          <span className="auth-brand__logo" aria-hidden="true">🏔️</span>
          <div>
            <h1 className="auth-brand__title">BhuDrishti</h1>
            <p className="auth-brand__sub">AI Landslide Early Warning · NER</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="auth-toggle" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-toggle__btn ${mode === 'login' ? 'auth-toggle__btn--active' : ''}`}
            onClick={() => { setMode('login'); setError(null) }}
          >
            Sign In
          </button>
          <button
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-toggle__btn ${mode === 'register' ? 'auth-toggle__btn--active' : ''}`}
            onClick={() => { setMode('register'); setError(null) }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Register-only fields */}
          {mode === 'register' && (
            <>
              <div className="form-field">
                <label htmlFor="auth-name">Full Name</label>
                <input
                  id="auth-name"
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Your full name"
                  required
                  autoComplete="name"
                />
              </div>
              <div className="form-field">
                <label htmlFor="auth-role">Role</label>
                <select id="auth-role" value={form.role} onChange={e => set('role', e.target.value)}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="auth-district">District</label>
                <select id="auth-district" value={form.district} onChange={e => set('district', e.target.value)}>
                  {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="auth-phone">Phone (optional)</label>
                <input
                  id="auth-phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+91 XXXXXXXXXX"
                  autoComplete="tel"
                />
              </div>
            </>
          )}

          {/* Shared fields */}
          <div className="form-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="form-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={mode === 'register' ? 'Min. 8 characters' : 'Your password'}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              ⚠️ {error}
            </div>
          )}

          <button type="submit" className="btn btn--primary auth-submit" disabled={loading}>
            {loading
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="auth-footer">
          {mode === 'login'
            ? <>No account? <button className="auth-link" onClick={() => setMode('register')}>Register here</button></>
            : <>Have an account? <button className="auth-link" onClick={() => setMode('login')}>Sign in</button></>
          }
        </p>
      </div>
    </div>
  )
}
