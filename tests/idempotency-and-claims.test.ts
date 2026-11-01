import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { requestFingerprint, isValidIdempotencyKey } from '../server/idempotency.js'
import { claimTransition, createOrGetRequest } from '../server/research/repo.js'
import { canTransition, NO_RESIGN } from '../server/research/state.js'
import { createResearch, getResearch } from '../server/research/service.js'
import { testDb } from './helpers.js'

const USER = '0x' + '11'.repeat(20)
const USER2 = '0x' + '22'.repeat(20)

describe('idempotency bound to user, opportunity, topics and body', () => {
  it('fingerprint ignores topic order and duplicates but changes with any bound input', () => {
    const base = { userId: USER, opportunityId: 'pool-1', topics: ['fees', 'audits'], intents: [], requestBodies: [] }
    const f = requestFingerprint(base)
    expect(requestFingerprint({ ...base, topics: ['audits', 'fees', 'fees'] })).toBe(f)
    expect(requestFingerprint({ ...base, userId: USER.toUpperCase().replace('0X', '0x') })).toBe(f)
    expect(requestFingerprint({ ...base, opportunityId: 'pool-2' })).not.toBe(f)
    expect(requestFingerprint({ ...base, topics: ['fees'] })).not.toBe(f)
    expect(requestFingerprint({ ...base, userId: USER2 })).not.toBe(f)
    expect(requestFingerprint({ ...base, requestBodies: ['{"a":1}'] })).not.toBe(f)
  })

  it('accepts only UUIDv4 keys', () => {
    expect(isValidIdempotencyKey(randomUUID())).toBe(true)
    expect(isValidIdempotencyKey('abc')).toBe(false)
    expect(isValidIdempotencyKey(undefined)).toBe(false)
  })

  it('same key + same inputs returns the existing request; different inputs is 422', async () => {
    const db = await testDb()
    const deps = { db, allowlist: { status: 'not_configured' as const } }
    const key = randomUUID()
    const a = await createResearch(deps, USER, key, { opportunityId: 'pool-1', topics: ['fees'] })
    const b = await createResearch(deps, USER, key, { opportunityId: 'pool-1', topics: ['fees'] })
    const c = await createResearch(deps, USER, key, { opportunityId: 'pool-2', topics: ['fees'] })
    expect((a.body as any).request.id).toBe((b.body as any).request.id)
    expect(c.status).toBe(422)
    expect((c.body as any).error).toBe('idempotency_key_mismatch')
    const rows = await db.query(`SELECT count(*)::int AS n FROM research_requests`)
    expect((rows.rows[0] as any).n).toBe(1)
  })

  it('the same key used by another user is a separate request', async () => {
    const db = await testDb()
    const deps = { db, allowlist: { status: 'not_configured' as const } }
    const key = randomUUID()
    const a = await createResearch(deps, USER, key, { opportunityId: 'pool-1', topics: ['fees'] })
    const b = await createResearch(deps, USER2, key, { opportunityId: 'pool-1', topics: ['fees'] })
    expect((a.body as any).request.id).not.toBe((b.body as any).request.id)
  })

  it('concurrent identical creates produce exactly one row', async () => {
    const db = await testDb()
    const key = randomUUID()
    const input = { userId: USER, idempotencyKey: key, fingerprint: 'f'.repeat(64), opportunityId: 'p', topics: ['fees'], status: 'created' as const }
    const out = await Promise.all(Array.from({ length: 25 }, () => createOrGetRequest(db, input)))
    expect(out.filter((o) => o.kind === 'created')).toHaveLength(1)
    expect(out.filter((o) => o.kind === 'existing')).toHaveLength(24)
  })

  it('blocks purchases while providers are not configured, honestly', async () => {
    const db = await testDb()
    const r = await createResearch({ db, allowlist: { status: 'not_configured' } }, USER, randomUUID(), { opportunityId: 'pool-1', topics: ['audits'] })
    expect(r.status).toBe(503)
    expect((r.body as any).error).toBe('telegraph_not_connected')
    expect((r.body as any).request.status).toBe('blocked_not_connected')
  })

  it('validates input and requires a key', async () => {
    const db = await testDb()
    const deps = { db, allowlist: { status: 'not_configured' as const } }
    expect((await createResearch(deps, USER, undefined, { opportunityId: 'p', topics: ['fees'] })).status).toBe(400)
    expect((await createResearch(deps, USER, randomUUID(), { opportunityId: 'p', topics: ['steal-funds'] })).status).toBe(400)
    expect((await createResearch(deps, USER, randomUUID(), { opportunityId: '../x', topics: ['fees'] })).status).toBe(400)
  })

  it('ownership: another user cannot read a request (same 404 as missing)', async () => {
    const db = await testDb()
    const r = await createResearch({ db, allowlist: { status: 'not_configured' } }, USER, randomUUID(), { opportunityId: 'p', topics: ['fees'] })
    const id = (r.body as any).request.id
    expect((await getResearch(db, USER, id)).status).toBe(200)
    expect((await getResearch(db, USER2, id)).status).toBe(404)
    expect((await getResearch(db, USER2, randomUUID())).status).toBe(404)
  })
})

describe('atomic claim step (no double signing)', () => {
  it('exactly one concurrent caller wins confirmed -> paying', async () => {
    const db = await testDb()
    const created = await createOrGetRequest(db, { userId: USER, idempotencyKey: randomUUID(), fingerprint: 'a'.repeat(64), opportunityId: 'p', topics: ['fees'], status: 'created' })
    const id = (created as any).row.id
    await db.transaction((q) => claimTransition(q, id, 'created', 'quoted'))
    await db.transaction((q) => claimTransition(q, id, 'quoted', 'confirmed'))
    const wins = await Promise.all(Array.from({ length: 20 }, () => db.transaction((q) => claimTransition(q, id, 'confirmed', 'paying'))))
    expect(wins.filter(Boolean)).toHaveLength(1)
    const events = await db.query(`SELECT count(*)::int AS n FROM payment_events WHERE request_id = $1 AND to_status = 'paying'`, [id])
    expect((events.rows[0] as any).n).toBe(1)
  })

  it('illegal transitions are refused and re-signing states are terminal for signing', () => {
    expect(canTransition('paying', 'confirmed')).toBe(false)
    expect(canTransition('completed_final', 'reorged_reconciling')).toBe(true)
    expect(canTransition('blocked_not_connected', 'paying')).toBe(false)
    expect(NO_RESIGN).toContain('outcome_unknown')
  })
})
