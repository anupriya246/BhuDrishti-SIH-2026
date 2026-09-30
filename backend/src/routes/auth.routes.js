// /**
//  * BhuDrishti — Auth Routes
//  * POST /api/auth/register
//  * POST /api/auth/login
//  * GET  /api/auth/me      (protected)
//  */

// import { Router } from 'express'
// import bcrypt from 'bcrypt'
// import { query } from '../db/db.js'
// import crypto from 'crypto'
// import rateLimit from 'express-rate-limit'
// import { requireAuth, signToken } from '../middleware/auth.js'

// const router = Router()
// const SALT_ROUNDS = 12

// // Staff roles need a secret access code. Citizens don't.
// const ROLE_CODES = {
//   field_officer:  process.env.FIELD_OFFICER_CODE,
//   district_admin: process.env.DISTRICT_ADMIN_CODE,
// }

// const validRoles = ['citizen', 'field_officer', 'district_admin']

// // ── Register ──────────────────────────────────────────────────────────────────
// router.post('/register', async (req, res) => {
//   const { name, email, password, role = 'citizen', district, phone } = req.body

//   // Input validation
//   if (!name || !email || !password) {
//     return res.status(400).json({ error: 'name, email, and password are required.' })
//   }
//   if (password.length<8 || password.length>72) {
//     return res.status(400).json({ error: 'Password must be at least 8-72 characters.' })
//   }

  
 
//   if (!validRoles.includes(role)) {
//     return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(', ')}` })
//   }

//   try {
//     // Check if email already exists
//     const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
//     if (existing.rows.length > 0) {
//       return res.status(409).json({ error: 'Email already registered.' })
//     }

//     const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

//     const { rows } = await query(
//       `INSERT INTO users (name, email, password_hash, role, district, phone)
//        VALUES ($1, $2, $3, $4, $5, $6)
//        RETURNING id, name, email, role, district, phone, created_at`,
//       [name.trim(), email.toLowerCase(), passwordHash, role, district || null, phone || null]
//     )

//     const user  = rows[0]
//     const token = signToken(user)

//     return res.status(201).json({ token, user })
//   } catch (err) {
//     console.error('[auth/register]', err.message)
//     return res.status(500).json({ error: 'Registration failed. Please try again.' })
//   }
// })

// // ── Login ─────────────────────────────────────────────────────────────────────
// router.post('/login', async (req, res) => {
//   const { email, password } = req.body

//   if (!email || !password) {
//     return res.status(400).json({ error: 'email and password are required.' })
//   }

//   try {
//     const { rows } = await query(
//       'SELECT id, name, email, password_hash, role, district, phone FROM users WHERE email = $1',
//       [email.toLowerCase()]
//     )

//     if (rows.length === 0) {
//       return res.status(401).json({ error: 'Invalid email or password.' })
//     }

//     const user  = rows[0]
//     const match = await bcrypt.compare(password, user.password_hash)
//     if (!user || !match) {
//       return res.status(401).json({ error: 'Invalid email or password.' })
//     }

//     // Don't send password hash to client
//     delete user.password_hash
//     const token = signToken(user)

//     return res.status(200).json({ token, user })
//   } catch (err) {
//     console.error('[auth/login]', err.message)
//     return res.status(500).json({ error: 'Login failed. Please try again.' })
//   }
// })

// // ── Me (current user) ─────────────────────────────────────────────────────────
// router.get('/me', requireAuth, async (req, res) => {
//   try {
//     const { rows } = await query(
//       'SELECT id, name, email, role, district, phone, created_at FROM users WHERE id = $1',
//       [req.user.id]
//     )
//     if (rows.length === 0) return res.status(404).json({ error: 'User not found.' })
//     return res.json(rows[0])
//   } catch (err) {
//     console.error('[auth/me]', err.message)
//     return res.status(500).json({ error: 'Could not fetch user.' })
//   }
// })

// export default router

/**
 * BhuDrishti — Auth Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me      (protected)
 *
 * Needs: npm i express-rate-limit
 * Env:   FIELD_OFFICER_CODE, DISTRICT_ADMIN_CODE  (long random strings you hand
 *        out to staff; if unset, that role's registration is disabled)
 */
 
import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { query } from '../db/db.js'
import { requireAuth, signToken } from '../middleware/auth.js'
 
const router = Router()
const SALT_ROUNDS = 12
 
const VALID_ROLES = ['citizen', 'field_officer', 'district_admin']
 
// Keep in sync with the DISTRICTS list in AuthPage.jsx
const DISTRICTS = [
  'Cherrapunji', 'Tawang', 'Kohima', 'Shillong', 'Itanagar',
  'Imphal', 'Dibrugarh', 'Aizawl', 'Agartala', 'Gangtok',
  'Silchar', 'Jorhat',
]
 
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 
// Staff roles need a secret access code. Citizens don't.
const ROLE_CODES = {
  field_officer:  process.env.FIELD_OFFICER_CODE,
  district_admin: process.env.DISTRICT_ADMIN_CODE,
}
 
// Used to make "unknown email" take as long as "wrong password"
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS)
 
// 20 attempts / 15 min / IP on auth endpoints (set app.set('trust proxy', 1) behind a proxy)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
})
 
const isStr = (v) => typeof v === 'string'
 
function codeMatches(expected, provided) {
  if (!expected || !isStr(provided)) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
 
// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password, role = 'citizen', district, phone, accessCode } = req.body || {}
 
  if (![name, email, password].every(isStr) || !name.trim() || !email.trim() || !password) {
    return res.status(400).json({ error: 'name, email, and password are required.' })
  }
  // Column sizes from schema.sql: name 120, email 255, phone 20
  const cleanEmail = email.trim().toLowerCase()
  const cleanPhone = isStr(phone) ? phone.trim() : ''
  if (name.trim().length > 120 || cleanEmail.length > 255 || cleanPhone.length > 20) {
    return res.status(400).json({ error: 'Name, email or phone is too long.' })
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (password.length < 8 || password.length > 72) { // bcrypt ignores bytes past 72
    return res.status(400).json({ error: 'Password must be 8–72 characters.' })
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` })
  }
  if (district && !DISTRICTS.includes(district)) {
    return res.status(400).json({ error: 'Invalid district.' })
  }
 
  // Privileged roles: no access code required for this project —
  // role-based API protection is enforced per-endpoint via requireRole middleware.
  // District is required for staff accounts.
  if (role !== 'citizen') {
    if (!district) {
      return res.status(400).json({ error: 'District is required for staff accounts.' })
    }
  }
 
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
 
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, district, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, district, phone, created_at`,
      [name.trim(), cleanEmail, passwordHash, role, district || null, cleanPhone || null]
    )
 
    const user  = rows[0]
    const token = signToken(user)
    return res.status(201).json({ token, user })
  } catch (err) {
    // 23505 = unique_violation (also covers two simultaneous signups with same email).
    // Make sure users.email has a UNIQUE constraint.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered.' })
    }
    console.error('[auth/register]', err.message)
    return res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})
 
// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {}
 
  if (!isStr(email) || !isStr(password) || !email.trim() || !password) {
    return res.status(400).json({ error: 'email and password are required.' })
  }
 
  try {
    const { rows } = await query(
      'SELECT id, name, email, password_hash, role, district, phone FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    )
 
    const user  = rows[0]
    const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH)
    if (!user || !match) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }
 
    delete user.password_hash
    const token = signToken(user)
    return res.status(200).json({ token, user })
  } catch (err) {
    console.error('[auth/login]', err.message)
    return res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})
 
// ── Me (current user) ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role, district, phone, created_at FROM users WHERE id = $1',
      [req.user.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    return res.json(rows[0])
  } catch (err) {
    console.error('[auth/me]', err.message)
    return res.status(500).json({ error: 'Could not fetch user.' })
  }
})
 
export default router