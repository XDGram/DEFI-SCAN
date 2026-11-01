import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Db } from '../server/db/db.js'
import { createOrGetRequest, reserveSpend, setKillSwitch } from '../server/research/repo.js'
import { testDb } from './helpers.js'

const CAPS = { perRequestUusdc: 50_000n, perUserDailyUusdc: 100_000n, globalDailyUusdc: 250_000n, globalTotalUusdc: 1_000_000n }
const USER = '0x' + '11'.repeat(20)

async function paymentRow(db: Db, user = USER) {
  const r = await createOrGetRequest(db, { userId: user, idempotencyKey: randomUUID(), fingerprint: 'e'.repeat(64), opportunityId: 'p', topics: ['fees'], status: 'created' })
  const id = randomUUID()
  await db.query(
    `INSERT INTO telegraph_payments (id, research_request_id, intent, target_url, request_body_sha256, status) VALUES ($1, $2, 'TEST_INTENT', 'https://node.invalid/x', $3, 'quoted')`,
    [id, (r as any).row.id, '0'.repeat(64)],
  )
  return id
}

const reserve = (db: Db, paymentId: string, amount: bigint, extra: object = {}) =>
  reserveSpend(db, { paymentId, userId: USER, amountUusdc: amount, paymentsEnabled: true, caps: CAPS, ...extra })

describe('spending controls', () => {
  it('kill switch is ON by default (fail closed) and blocks reservations', async () => {
    const db = await testDb()
    expect(await reserve(db, await paymentRow(db), 10_000n)).toEqual({ ok: false, reason: 'kill_switch' })
  })

  it('payments disabled in config and missing caps both block', async () => {
    const db = await testDb()
    await setKillSwitch(db, false)
    const id = await paymentRow(db)
    expect(await reserve(db, id, 10_000n, { paymentsEnabled: false })).toEqual({ ok: false, reason: 'payments_disabled' })
    expect(await reserve(db, id, 10_000n, { caps: { ...CAPS, globalTotalUusdc: 0n } })).toEqual({ ok: false, reason: 'caps_not_configured' })
  })

  it('enforces the per-request cap', async () => {
    const db = await testDb()
    await setKillSwitch(db, false)
    expect(await reserve(db, await paymentRow(db), 50_001n)).toEqual({ ok: false, reason: 'over_request_cap' })
  })

  it('concurrent reservations cannot jointly exceed the per-user daily cap', async () => {
    const db = await testDb()
    await setKillSwitch(db, false)
    const ids = await Promise.all(Array.from({ length: 12 }, () => paymentRow(db)))
    const out = await Promise.all(ids.map((id) => reserve(db, id, 10_000n)))
    expect(out.filter((o) => o.ok)).toHaveLength(10)
    expect(out.filter((o) => !o.ok).every((o) => !o.ok && o.reason === 'over_user_daily_cap')).toBe(true)
  })

  it('enforces global daily and global total caps across users', async () => {
    const db = await testDb()
    await setKillSwitch(db, false)
    const users = Array.from({ length: 6 }, (_, i) => '0x' + String(i + 3).repeat(40).slice(0, 40))
    const results = []
    for (const u of users) results.push(await reserveSpend(db, { paymentId: await paymentRow(db, u), userId: u, amountUusdc: 50_000n, paymentsEnabled: true, caps: CAPS }))
    expect(results.filter((r) => r.ok)).toHaveLength(5)
    expect(results[5]).toEqual({ ok: false, reason: 'over_global_daily_cap' })
    const total = await reserveSpend(db, { paymentId: await paymentRow(db, users[0]), userId: users[0], amountUusdc: 1n, paymentsEnabled: true, caps: { ...CAPS, globalDailyUusdc: 10_000_000n, globalTotalUusdc: 250_000n }, day: '2099-01-01' })
    expect(total).toEqual({ ok: false, reason: 'over_global_total_cap' })
  })

  it('turning the kill switch back on stops new reservations immediately', async () => {
    const db = await testDb()
    await setKillSwitch(db, false)
    expect((await reserve(db, await paymentRow(db), 10_000n)).ok).toBe(true)
    await setKillSwitch(db, true)
    expect(await reserve(db, await paymentRow(db), 10_000n)).toEqual({ ok: false, reason: 'kill_switch' })
  })
})
