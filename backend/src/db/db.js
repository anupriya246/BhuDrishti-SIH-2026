/**
 * BhuDrishti — PostgreSQL connection pool
 * Uses the `pg` (node-postgres) library.
 * All route files import { query } from this module.
 */

import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'bhudrishti',
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD || '',
  max:      10,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

// Verify connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌  PostgreSQL connection error:', err.message)
    return
  }
  client.query('SELECT NOW()', (err2, result) => {
    release()
    if (err2) {
      console.error('❌  PostgreSQL query error:', err2.message)
    } else {
      console.log(`✓  PostgreSQL connected — server time: ${result.rows[0].now}`)
    }
  })
})

/**
 * Thin wrapper around pool.query.
 * Usage: const { rows } = await query('SELECT * FROM users WHERE id=$1', [id])
 */
export async function query(text, params) {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[pg] ${Date.now() - start}ms — ${text.substring(0, 80)}`)
    }
    return res
  } catch (err) {
    console.error('[pg] Query error:', err.message, '\nSQL:', text)
    throw err
  }
}

export default pool
