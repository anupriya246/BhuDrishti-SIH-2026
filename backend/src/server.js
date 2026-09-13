/**
 * BhuDrishti — Express Server Entry Point
 *
 * Architecture:
 *   React Dashboard (5173) → Node/Express (3001) → Flask ML API (5000)
 *                                    ↓
 *                             PostgreSQL (5432)
 *
 * Run: node src/server.js  OR  npm run dev (with nodemon)
 */

import express        from 'express'
import cors           from 'cors'
import helmet         from 'helmet'
import morgan         from 'morgan'
import rateLimit      from 'express-rate-limit'
import dotenv         from 'dotenv'

import authRoutes        from './routes/auth.routes.js'
import predictionsRoutes from './routes/predictions.routes.js'
import alertsRoutes      from './routes/alerts.routes.js'
import fieldReportRoutes from './routes/fieldReports.routes.js'
import mlRoutes          from './routes/ml.routes.js'

dotenv.config()

const app  = express()
const PORT = process.env.PORT || 3001

// ── Security & Logging ────────────────────────────────────────────────────────
app.use(helmet())
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please try again later.' },
})
app.use(limiter)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes)
app.use('/api/predictions',   predictionsRoutes)
app.use('/api/alerts',        alertsRoutes)
app.use('/api/field-reports', fieldReportRoutes)
app.use('/api/ml',            mlRoutes)

// ── Root health check ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'BhuDrishti API',
    version: '1.0.0',
    time:    new Date().toISOString(),
  })
})

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` })
})

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err.message)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  BhuDrishti API running on http://localhost:${PORT}`)
  console.log(`    Environment : ${process.env.NODE_ENV || 'development'}`)
  console.log(`    ML API      : ${process.env.ML_API_URL || 'http://localhost:5000'}`)
  console.log(`    Database    : PostgreSQL — ${process.env.PG_DATABASE || 'bhudrishti'} @ ${process.env.PG_HOST || 'localhost'}\n`)
})

export default app
