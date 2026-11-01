export type ResearchStatus =
  | 'created'
  | 'blocked_not_connected'
  | 'quoted'
  | 'confirmed'
  | 'paying'
  | 'settling'
  | 'delivered_awaiting_finality'
  | 'completed_final'
  | 'completed_partial'
  | 'failed_prepayment'
  | 'failed_credited'
  | 'suspected_preemption'
  | 'settlement_missing'
  | 'outcome_unknown'
  | 'verification_failed'
  | 'reorged_reconciling'

const TRANSITIONS: Record<ResearchStatus, ResearchStatus[]> = {
  created: ['blocked_not_connected', 'quoted', 'failed_prepayment'],
  blocked_not_connected: [],
  quoted: ['confirmed', 'failed_prepayment'],
  confirmed: ['paying', 'failed_prepayment'],
  paying: ['settling', 'failed_prepayment', 'outcome_unknown'],
  settling: [
    'delivered_awaiting_finality',
    'completed_partial',
    'failed_credited',
    'suspected_preemption',
    'settlement_missing',
    'verification_failed',
    'outcome_unknown',
  ],
  delivered_awaiting_finality: ['completed_final', 'reorged_reconciling'],
  completed_partial: ['reorged_reconciling'],
  completed_final: ['reorged_reconciling'],
  reorged_reconciling: ['settling', 'suspected_preemption', 'settlement_missing', 'verification_failed'],
  outcome_unknown: ['settling', 'failed_credited', 'suspected_preemption', 'settlement_missing'],
  failed_prepayment: [],
  failed_credited: [],
  suspected_preemption: [],
  settlement_missing: [],
  verification_failed: [],
}

export function canTransition(from: ResearchStatus, to: ResearchStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: ResearchStatus, to: ResearchStatus) {
  if (!canTransition(from, to)) throw new Error(`illegal transition ${from} -> ${to}`)
}

// States in which a new signature must never be produced for the same request.
export const NO_RESIGN: ResearchStatus[] = ['paying', 'settling', 'outcome_unknown', 'reorged_reconciling']
