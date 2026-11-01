import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { Db } from '../server/db/db.js'

export async function testDb(): Promise<Db> {
  const pg = new PGlite()
  await pg.exec(readFileSync(new URL('../server/db/schema.sql', import.meta.url), 'utf8'))
  return {
    query: (t, p) => pg.query(t, p) as never,
    transaction: async (fn) => (await pg.transaction((tx) => fn({ query: (t, p) => tx.query(t, p) as never })))!,
  }
}

// Synthetic, obviously fake test fixtures. Never live provider values.
export const FAKE = {
  network: 'eip155:11155111',
  asset: '0x' + 'a1'.repeat(20),
  payTo: '0x' + 'b2'.repeat(20),
  agent: '0x' + 'c3'.repeat(20),
  other: '0x' + 'd4'.repeat(20),
}

export function b64(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}
