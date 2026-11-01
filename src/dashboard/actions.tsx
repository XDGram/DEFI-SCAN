import type { LlamaPool } from './data'
import { COMPARE_LIMIT, snapshotOf, useCompare, useWatchlist } from './store'

export function WatchButton({ pool, fetchedAt, compact }: { pool: LlamaPool; fetchedAt: number; compact?: boolean }) {
  const [list, setList] = useWatchlist()
  const saved = list.some((s) => s.pool === pool.pool)
  return (
    <button
      type="button"
      className={`btn ${saved ? 'btn--saved' : 'btn--light'}${compact ? ' btn--sm' : ''}`}
      aria-pressed={saved}
      onClick={() =>
        setList((prev) =>
          saved ? prev.filter((s) => s.pool !== pool.pool) : [...prev, snapshotOf(pool, fetchedAt)],
        )
      }
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M6 3h12v18l-6-4.5L6 21z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {saved ? 'In Watchlist' : 'Add to Watchlist'}
    </button>
  )
}

export function CompareToggle({ poolId }: { poolId: string }) {
  const [ids, setIds] = useCompare()
  const on = ids.includes(poolId)
  const full = !on && ids.length >= COMPARE_LIMIT
  return (
    <label className={`check check--sm${full ? ' is-disabled' : ''}`} title={full ? `You can compare up to ${COMPARE_LIMIT} opportunities` : undefined}>
      <input
        type="checkbox"
        checked={on}
        disabled={full}
        onChange={() => setIds((prev) => (on ? prev.filter((i) => i !== poolId) : [...prev, poolId]))}
      />
      <span className="check__box" aria-hidden="true">
        <svg viewBox="0 0 12 10">
          <path d="M1 5.5 4.2 8.5 11 1.5" />
        </svg>
      </span>
      <span>Compare</span>
    </label>
  )
}
