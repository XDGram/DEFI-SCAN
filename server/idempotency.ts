import { canonicalJson, sha256Hex } from './canonical.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && UUID_V4.test(key)
}

export interface FingerprintInput {
  userId: string
  opportunityId: string
  topics: string[]
  intents: string[]
  requestBodies: string[]
}

export function normaliseTopics(topics: string[]): string[] {
  return [...new Set(topics.map((t) => t.trim()).filter(Boolean))].sort()
}

// Binds a key to the exact user, opportunity, topics and the exact bytes that would be sent upstream.
export function requestFingerprint(input: FingerprintInput): string {
  return sha256Hex(
    canonicalJson({
      user_id: input.userId.toLowerCase(),
      opportunity_id: input.opportunityId,
      topics: normaliseTopics(input.topics),
      intents: [...input.intents].sort(),
      request_body_sha256: input.requestBodies.map(sha256Hex).sort(),
    }),
  )
}
