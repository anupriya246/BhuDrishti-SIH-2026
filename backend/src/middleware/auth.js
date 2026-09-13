/**
 * BhuDrishti — JWT Authentication Middleware
 *
 * Usage in routes:
 *   import { requireAuth, requireRole } from '../middleware/auth.js'
 *
 *   router.get('/protected', requireAuth, handler)
 *   router.post('/admin',    requireAuth, requireRole('district_admin'), handler)
 */

import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'bhusanket_dev_secret_change_in_prod'

/**
 * Verifies the Bearer token in the Authorization header.
 * Attaches decoded payload to req.user on success.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required.' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded   // { id, email, role, district }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' })
    }
    return res.status(401).json({ error: 'Invalid token.' })
  }
}

/**
 * Role-based access control. Must be used AFTER requireAuth.
 * Accepts a single role string or array of allowed roles.
 *
 * Role hierarchy: citizen < field_officer < district_admin < superadmin
 */
export function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat()
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      })
    }
    next()
  }
}

/**
 * Signs a JWT for a given user object.
 * Called after successful login/register.
 */
export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, district: user.district },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}
