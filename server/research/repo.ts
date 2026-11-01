import { randomUUID } from 'node:crypto'
import type { SpendCaps } from '../config.js'
import type { Db, Query } from '../db/db.js'
import { assertTransition, type ResearchStatus } from './state.js'

export interface ResearchRow {
  id: string
  user_id: string
  idempotency_key: string
  fingerprint: string
  opportunity_id: string
  topics: string[]
  status: ResearchStatus
  created_at: string
}

export type CreateOutcome =
  | { kind: 'created'; row: ResearchRow }
  | { kind: 'existing'; row: ResearchRow }
  | { kind: 'key_mismatch' }

export async function createOrGetRequest(
  db: Db,
  input: { userId: string; idempotencyKey: string; fingerprint: string; opportunityId: string; topics: string[]; status: ResearchStatus },
): Promise<CreateOutcome> {
  return db.transaction(async (q) => {
    const id = randomUUID()
    const inserted = await q.query<ResearchRow>(
      `INSERT INTO research_requests (id, user_id, idempotency_key, fingerprint, opportunity_id, topics, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING *`,
      [id, input.userId.toLowerCase(), input.idempotencyKey, input.fingerprint, input.opportunityId, JSON.stringify(input.topics), input.status],
    )
    if (inserted.rows[0]) {
      await q.query(`INSERT INTO payment_events (request_id, to_status, detail) VALUES ($1, $2, $3)`, [id, input.status, '{}'])
      return { kind: 'created', row: inserted.rows[0] }
    }
    const existing = await q.query<ResearchRow>(
      `SELECT * FROM research_requests WHERE user_id = $1 AND idempotency_key = $2`,
      [input.userId.toLowerCase(), input.idempotencyKey],
    )
    const row = existing.rows[0]
    if (!row) throw new Error('idempotency row vanished')
    return row.fingerprint === input.fingerprint ? { kind: 'existing', row } : { kind: 'key_mismatch' }
  })
}

// Compare-and-set: exactly one caller wins the move into `to`. Losers get null and must not sign.
export async function claimTransition(q: Query, id: string, from: ResearchStatus, to: ResearchStatus, detail: object = {}): Promise<boolean> {
  assertTransition(from, to)
  const r = await q.query(
    `UPDATE research_requests SET status = $3, updated_at = now() WHERE id = $1 AND status = $2 RETURNING id`,
    [id, from, to],
  )
  if (!r.rows.length) return false
  await q.query(`INSERT INTO payment_events (request_id, from_status, to_status, detail) VALUES ($1, $2, $3, $4)`, [id, from, to, JSON.stringify(detail)])
  return true
}

export async function getRequestForUser(db: Query, id: string, userId: string): Promise<ResearchRow | null> {
  const r = await db.query<ResearchRow>(`SELECT * FROM research_requests WHERE id = $1 AND user_id = $2`, [id, userId.toLowerCase()])
  return r.rows[0] ?? null
}

export async function listRequestsForUser(db: Query, userId: string, limit = 50): Promise<ResearchRow[]> {
  const r = await db.query<ResearchRow>(
    `SELECT * FROM research_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId.toLowerCase(), limit],
  )
  return r.rows
}

export type ReserveOutcome =
  | { ok: true }
  | { ok: false; reason: 'kill_switch' | 'payments_disabled' | 'caps_not_configured' | 'over_request_cap' | 'over_user_daily_cap' | 'over_global_daily_cap' | 'over_global_total_cap' }

// Serialised with a transaction-scoped advisory lock so concurrent reservations cannot jointly exceed a cap.
export async function reserveSpend(
  db: Db,
  input: { paymentId: string; userId: string; amountUusdc: bigint; paymentsEnabled: boolean; caps: SpendCaps; day?: string },
): Promise<ReserveOutcome> {
  if (!input.paymentsEnabled) return { ok: false, reason: 'payments_disabled' }
  const c = input.caps
  if (c.perRequestUusdc <= 0n || c.perUserDailyUusdc <= 0n || c.globalDailyUusdc <= 0n || c.globalTotalUusdc <= 0n) {
    return { ok: false, reason: 'caps_not_configured' }
  }
  if (input.amountUusdc <= 0n || input.amountUusdc > c.perRequestUusdc) return { ok: false, reason: 'over_request_cap' }
  return db.transaction(async (q) => {
    await q.query(`SELECT pg_advisory_xact_lock(424242)`)
    const flag = await q.query<{ value: boolean }>(`SELECT value FROM system_flags WHERE name = 'payments_kill_switch'`)
    if (flag.rows[0]?.value !== false) return { ok: false, reason: 'kill_switch' } as const
    const day = input.day ?? new Date().toISOString().slice(0, 10)
    const sums = await q.query<{ user_day: string; global_day: string; global_total: string }>(
      `SELECT
         COALESCE(SUM(amount_uusdc) FILTER (WHERE user_id = $1 AND day = $2), 0)::text AS user_day,
         COALESCE(SUM(amount_uusdc) FILTER (WHERE day = $2), 0)::text AS global_day,
         COALESCE(SUM(amount_uusdc), 0)::text AS global_total
       FROM spend_reservations WHERE state IN ('reserved', 'spent')`,
      [input.userId.toLowerCase(), day],
    )
    const s = sums.rows[0]
    const amt = input.amountUusdc
    if (BigInt(s.user_day) + amt > c.perUserDailyUusdc) return { ok: false, reason: 'over_user_daily_cap' } as const
    if (BigInt(s.global_day) + amt > c.globalDailyUusdc) return { ok: false, reason: 'over_global_daily_cap' } as const
    if (BigInt(s.global_total) + amt > c.globalTotalUusdc) return { ok: false, reason: 'over_global_total_cap' } as const
    await q.query(
      `INSERT INTO spend_reservations (payment_id, user_id, amount_uusdc, day, state) VALUES ($1, $2, $3, $4, 'reserved')`,
      [input.paymentId, input.userId.toLowerCase(), amt.toString(), day],
    )
    return { ok: true } as const
  })
}

export async function setKillSwitch(db: Query, on: boolean) {
  await db.query(`UPDATE system_flags SET value = $1 WHERE name = 'payments_kill_switch'`, [on])
}
