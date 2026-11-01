import type { AllowlistState } from '../allowlist.js'
import type { Db } from '../db/db.js'
import { errorResult, type ApiResult } from '../http.js'
import { isValidIdempotencyKey, normaliseTopics, requestFingerprint } from '../idempotency.js'
import { createOrGetRequest, getRequestForUser, listRequestsForUser, type ResearchRow } from './repo.js'

export const RESEARCH_TOPIC_IDS = ['audits', 'contracts', 'liquidity', 'withdrawal', 'fees', 'yield-source'] as const
const OPPORTUNITY_ID = /^[A-Za-z0-9-]{1,80}$/

function publicView(r: ResearchRow) {
  return { id: r.id, opportunityId: r.opportunity_id, topics: r.topics, status: r.status, createdAt: r.created_at }
}

export async function createResearch(
  deps: { db: Db | null; allowlist: AllowlistState },
  userId: string,
  idempotencyKey: string | undefined,
  body: unknown,
): Promise<ApiResult> {
  if (!deps.db) return errorResult(503, 'storage_not_configured')
  if (!isValidIdempotencyKey(idempotencyKey)) return errorResult(400, 'idempotency_key_required')
  const b = body as { opportunityId?: unknown; topics?: unknown } | null
  if (!b || typeof b.opportunityId !== 'string' || !OPPORTUNITY_ID.test(b.opportunityId)) return errorResult(400, 'invalid_opportunity')
  if (!Array.isArray(b.topics) || b.topics.some((t) => typeof t !== 'string' || !(RESEARCH_TOPIC_IDS as readonly string[]).includes(t))) {
    return errorResult(400, 'invalid_topics')
  }
  const topics = normaliseTopics(b.topics as string[])
  if (!topics.length) return errorResult(400, 'invalid_topics')

  // Until live providers are verified and allowlisted, no intent or upstream body exists, so nothing can be bought.
  const ready = deps.allowlist.status === 'ready'
  const fingerprint = requestFingerprint({ userId, opportunityId: b.opportunityId, topics, intents: [], requestBodies: [] })
  const out = await createOrGetRequest(deps.db, {
    userId,
    idempotencyKey,
    fingerprint,
    opportunityId: b.opportunityId,
    topics,
    status: ready ? 'created' : 'blocked_not_connected',
  })
  if (out.kind === 'key_mismatch') return errorResult(422, 'idempotency_key_mismatch')
  const status = out.kind === 'created' ? 201 : 200
  if (!ready) return { status: 503, body: { error: 'telegraph_not_connected', request: publicView(out.row) } }
  return { status, body: { request: publicView(out.row), note: 'payment flow is not enabled in this phase' } }
}

export async function getResearch(db: Db | null, userId: string, id: string): Promise<ApiResult> {
  if (!db) return errorResult(503, 'storage_not_configured')
  if (!/^[0-9a-f-]{36}$/.test(id)) return errorResult(404, 'not_found')
  const row = await getRequestForUser(db, id, userId)
  // Same answer for "missing" and "someone else's", so ownership cannot be probed.
  return row ? { status: 200, body: { request: publicView(row) } } : errorResult(404, 'not_found')
}

export async function listResearch(db: Db | null, userId: string): Promise<ApiResult> {
  if (!db) return errorResult(503, 'storage_not_configured')
  return { status: 200, body: { requests: (await listRequestsForUser(db, userId)).map(publicView) } }
}
