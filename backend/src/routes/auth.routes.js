/**
 * BhuDrishti — Auth Routes
 *
 * POST /api/auth/register          — email/password registration
 * POST /api/auth/login             — email/password login
 * GET  /api/auth/me                — current user (protected)
 * POST /api/auth/send-otp          — send OTP to phone number
 * POST /api/auth/login-phone       — verify OTP and sign in
 * POST /api/auth/register-phone    — verify OTP and create account
 * POST /api/auth/forgot-password   — request password reset link
 *
 * Authority registration requires AUTHORITY_INVITE_CODE env var.
 * If unset, district_admin / field_officer registration is disabled.
 */

import { Router }    from 'express'
import bcrypt        from 'bcrypt'
import crypto        from 'crypto'
import rateLimit     from 'express-rate-limit'
import { query }     from '../db/db.js'
import { requireAuth, signToken } from '../middleware/auth.js'

const router     = Router()
const SALT_ROUNDS = 12

const VALID_ROLES = ['citizen', 'field_officer', 'district_admin']

const DISTRICTS = [
  'Cherrapunji', 'Tawang', 'Kohima', 'Shillong', 'Itanagar',
  'Imphal', 'Dibrugarh', 'Aizawl', 'Agartala', 'Gangtok',
  'Silchar', 'Jorhat',
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+91[6-9]\d{9}$/   // +91 followed by 10 digits starting with 6-9

// Timing-safe dummy hash to prevent user-enumeration on login
const DUMMY_HASH = bcrypt.hashSync('bhudrishti-dummy-hash-not-a-real-password', SALT_ROUNDS)

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
})

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait 10 minutes.' },
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const isStr = (v) => typeof v === 'string'

function timingSafeEqual(a, b) {
  if (!a || !b) return false
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

/** Check authority invite code from env var (timing-safe). Returns false if env var is unset → registration disabled. */
function verifyAuthorityCode(provided) {
  const expected = process.env.AUTHORITY_INVITE_CODE
  if (!expected) return false   // not configured → authority registration disabled
  return timingSafeEqual(expected, provided)
}

// ── POST /register ────────────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const {
    name, email, password,
    role = 'citizen',
    district, phone,
    authorityCode,          // required for non-citizen roles
  } = req.body || {}

  // Basic presence checks
  if (![name, email, password].every(isStr) || !name.trim() || !email.trim() || !password) {
    return res.status(400).json({ error: 'name, email, and password are required.' })
  }

  const cleanEmail = email.trim().toLowerCase()
  const cleanPhone = isStr(phone) ? phone.trim() : ''
  const cleanName  = name.trim()

  // Length guards (match DB column sizes)
  if (cleanName.length > 120 || cleanEmail.length > 255 || cleanPhone.length > 20) {
    return res.status(400).json({ error: 'Name, email or phone is too long.' })
  }

  if (!EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: 'Password must be 8–72 characters.' })
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role.` })
  }
  if (district && !DISTRICTS.includes(district)) {
    return res.status(400).json({ error: 'Invalid district.' })
  }

  // Authority roles require a valid invite code
  if (role !== 'citizen') {
    if (!district) {
      return res.status(400).json({ error: 'District is required for authority accounts.' })
    }
    if (!verifyAuthorityCode(authorityCode)) {
      return res.status(403).json({
        error: 'Invalid or missing authority invite code. Contact your district administrator.',
      })
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, district, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, district, phone, created_at`,
      [cleanName, cleanEmail, passwordHash, role, district || null, cleanPhone || null]
    )

    const user  = rows[0]
    const token = signToken(user)
    return res.status(201).json({ token, user })

  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered.' })
    }
    console.error('[auth/register]', err.message)
    return res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

// ── POST /login ───────────────────────────────────────────────────────────────
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
    // Always run bcrypt.compare — prevents timing-based user enumeration
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

// ── GET /me ───────────────────────────────────────────────────────────────────
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

// ── POST /send-otp ────────────────────────────────────────────────────────────
// Sends a 6-digit OTP to the given phone number via SMS.
// Requires an SMS provider to be configured (TWILIO_*, MSG91_*, etc.).
// Returns 503 with clear instructions when no provider is configured.
router.post('/send-otp', otpLimiter, async (req, res) => {
  const { phone } = req.body || {}

  if (!isStr(phone) || !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Enter a valid Indian mobile number (+91XXXXXXXXXX).' })
  }

  // ── SMS provider hook ──────────────────────────────────────────────────────
  // To enable OTP, install an SMS library and set env vars, then replace this
  // block. Example providers: Twilio, MSG91, Fast2SMS.
  //
  // const otp = crypto.randomInt(100000, 999999).toString()
  // Store otp + expiry in Redis or a DB table, then send via SMS provider.
  //
  // Example (MSG91):
  //   await sendMsg91OTP(phone, otp)
  //   await cacheOTP(phone, otp, expiresInSeconds=600)
  //   return res.json({ message: 'OTP sent.' })
  // ──────────────────────────────────────────────────────────────────────────
  const smsConfigured = !!(
    process.env.TWILIO_ACCOUNT_SID ||
    process.env.MSG91_AUTH_KEY      ||
    process.env.FAST2SMS_API_KEY
  )

  if (!smsConfigured) {
    return res.status(503).json({
      error: 'OTP service not configured. Please use email authentication or contact the administrator.',
    })
  }

  // Placeholder — replace with real SMS provider logic
  return res.status(503).json({
    error: 'OTP service not configured. Please use email authentication.',
  })
})

// ── POST /login-phone ─────────────────────────────────────────────────────────
router.post('/login-phone', authLimiter, async (req, res) => {
  const { phone, otp } = req.body || {}

  if (!isStr(phone) || !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number.' })
  }
  if (!isStr(otp) || otp.trim().length !== 6) {
    return res.status(400).json({ error: 'Enter the 6-digit OTP.' })
  }

  // ── OTP verification hook ──────────────────────────────────────────────────
  // Replace this block with real OTP verification once send-otp is implemented.
  // Example:
  //   const valid = await verifyOTP(phone, otp.trim())
  //   if (!valid) return res.status(401).json({ error: 'Invalid or expired OTP.' })
  // ──────────────────────────────────────────────────────────────────────────
  return res.status(503).json({
    error: 'OTP service not configured. Please use email authentication.',
  })
})

// ── POST /register-phone ──────────────────────────────────────────────────────
router.post('/register-phone', authLimiter, async (req, res) => {
  const { phone, otp, name, role = 'citizen', authorityCode } = req.body || {}

  if (!isStr(phone) || !PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number.' })
  }
  if (!isStr(otp) || otp.trim().length !== 6) {
    return res.status(400).json({ error: 'Enter the 6-digit OTP.' })
  }
  if (!isStr(name) || !name.trim()) {
    return res.status(400).json({ error: 'Full name is required.' })
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' })
  }
  if (role !== 'citizen') {
    if (!verifyAuthorityCode(authorityCode)) {
      return res.status(403).json({
        error: 'Invalid or missing authority invite code. Contact your district administrator.',
      })
    }
  }

  // ── OTP verification hook ──────────────────────────────────────────────────
  return res.status(503).json({
    error: 'OTP service not configured. Please use email authentication.',
  })
})

// ── POST /forgot-password ─────────────────────────────────────────────────────
// Sends a password-reset link to the registered email.
// Requires an email provider (SMTP_HOST / SENDGRID_API_KEY / etc.).
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body || {}

  if (!isStr(email) || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }

  const cleanEmail = email.trim().toLowerCase()

  try {
    // Look up user — but always return 200 to prevent email enumeration
    const { rows } = await query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [cleanEmail]
    )

    if (rows.length > 0) {
      // ── Email provider hook ────────────────────────────────────────────────
      // To enable password reset, set SMTP_HOST / SENDGRID_API_KEY / etc. and
      // replace this block with real email sending + token storage.
      //
      // const resetToken = crypto.randomBytes(32).toString('hex')
      // const expiry     = new Date(Date.now() + 60 * 60 * 1000)  // 1 hour
      // await query(
      //   'UPDATE users SET reset_token=$1, reset_expires=$2 WHERE id=$3',
      //   [resetToken, expiry, rows[0].id]
      // )
      // await sendResetEmail(cleanEmail, `${process.env.APP_URL}/reset?token=${resetToken}`)
      // ──────────────────────────────────────────────────────────────────────
      console.log(`[auth/forgot-password] Reset requested for ${cleanEmail} — email provider not configured.`)
    }

    // Always return the same response (prevents email enumeration)
    return res.json({
      message: 'If this email is registered, a reset link has been sent.',
    })

  } catch (err) {
    console.error('[auth/forgot-password]', err.message)
    // Still return 200 — don't leak whether the email exists
    return res.json({
      message: 'If this email is registered, a reset link has been sent.',
    })
  }
})

export default router
