import { Link } from 'react-router-dom'
import { Badge, PageHeader } from './ui'

type Tone = 'neutral' | 'live' | 'warn' | 'info' | 'dark'

// Mirrors server/research/state.ts. Wording never claims facilitator verification.
export const PAYMENT_STATES: { id: string; label: string; tone: Tone; showsResult: boolean; text: string }[] = [
  { id: 'blocked_not_connected', label: 'Telegraph not connected', tone: 'warn', showsResult: false, text: 'No verified provider is configured, so nothing can be purchased.' },
  { id: 'quoted', label: 'Price quoted', tone: 'info', showsResult: false, text: 'The provider’s actual price is shown. Nothing has been paid.' },
  { id: 'confirmed', label: 'Confirmed by you', tone: 'info', showsResult: false, text: 'You approved the quoted price. The agent will pay within the spending limits.' },
  { id: 'paying', label: 'Paying', tone: 'info', showsResult: false, text: 'The agent wallet is sending the signed payment with the request.' },
  { id: 'settling', label: 'Checking settlement', tone: 'info', showsResult: false, text: 'Waiting to find the payment on-chain and match it to the node’s receipt.' },
  { id: 'delivered_awaiting_finality', label: 'Awaiting finality', tone: 'info', showsResult: true, text: 'Payment found on-chain and matched to the node’s receipt (node-reconciled). Results are shown; the payment is not final yet.' },
  { id: 'completed_final', label: 'Payment final', tone: 'live', showsResult: true, text: 'The settlement block passed the network’s finality check.' },
  { id: 'completed_partial', label: 'Partial result', tone: 'warn', showsResult: true, text: 'Paid and delivered, but some fields were missing or rejected. Only valid fields are used.' },
  { id: 'failed_prepayment', label: 'Failed before payment', tone: 'warn', showsResult: false, text: 'The request was refused before any payment. You were not charged.' },
  { id: 'failed_credited', label: 'Failed — credited', tone: 'warn', showsResult: false, text: 'Payment settled but the provider failed. Per Telegraph, the amount is credited to the agent’s escrow balance.' },
  { id: 'suspected_preemption', label: 'Suspected preemption', tone: 'warn', showsResult: false, text: 'The payment authorisation was used on-chain but not by the delivery the node reported. Under review.' },
  { id: 'settlement_missing', label: 'Settlement missing', tone: 'warn', showsResult: false, text: 'The node reported delivery but no matching on-chain payment was found before expiry.' },
  { id: 'outcome_unknown', label: 'Outcome unknown', tone: 'warn', showsResult: false, text: 'The connection failed after paying. Reconciling on-chain; the payment will not be re-sent.' },
  { id: 'verification_failed', label: 'Verification failed', tone: 'warn', showsResult: false, text: 'Payment evidence did not match. The result is held back.' },
  { id: 'reorged_reconciling', label: 'Re-checking after reorg', tone: 'warn', showsResult: false, text: 'The settlement block was replaced. Verified status was revoked while the payment is reconciled.' },
]

export function PaymentStatesPreview() {
  return (
    <div className="research">
      <Link className="back" to="/app/discover">
        ← Back to Discover
      </Link>
      <PageHeader
        title="Research payment states"
        description="Every state a paid research request can be in, and what the user sees."
        actions={<Badge tone="warn">Simulated preview</Badge>}
      />
      <p className="notice notice--sim" role="note">
        <strong>Simulated data.</strong> This page shows interface states only. No Telegraph request, provider, price, receipt
        or transaction exists here, and nothing was paid.
      </p>
      <div className="state-grid">
        {PAYMENT_STATES.map((s) => (
          <article key={s.id} className="card state-card">
            <div className="state-card__head">
              <Badge tone={s.tone}>{s.label}</Badge>
              <span className="mono small muted">{s.id}</span>
            </div>
            <p>{s.text}</p>
            <p className="fine">{s.showsResult ? 'Research result is displayed.' : 'No research result is displayed.'}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
