import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { protocolLogo } from './data'

export function DotLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="dot-loader" role="status">
      <span className="dot-loader__grid" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${(i % 3) * 0.12 + Math.floor(i / 3) * 0.12}s` }} />
        ))}
      </span>
      <span>{label}</span>
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <label className={`switch${disabled ? ' is-disabled' : ''}`} title={hint}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">{label}</span>
    </label>
  )
}

export function Check({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={`check${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__box" aria-hidden="true">
        <svg viewBox="0 0 12 10">
          <path d="M1 5.5 4.2 8.5 11 1.5" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T | null
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  name: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o.value} className={value === o.value ? 'is-on' : ''}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

export function ProtocolLogo({ slug, size = 32 }: { slug: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <span className="plogo plogo--fallback" style={{ width: size, height: size }} aria-hidden="true">
        {slug[0]?.toUpperCase()}
      </span>
    )
  return (
    <img
      className="plogo"
      src={protocolLogo(slug)}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function Missing({ children = 'Not available from current sources' }: { children?: ReactNode }) {
  return <span className="missing">{children}</span>
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'live' | 'warn' | 'info' | 'dark'; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__dots" aria-hidden="true" />
      <h3>{title}</h3>
      {children && <div className="empty__body">{children}</div>}
    </div>
  )
}

export function ErrorBox({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <Badge tone="warn">{title}</Badge>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn--light" type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

const CHAIN_ICON_ALIASES: Record<string, string[]> = {
  BSC: ['binance', 'bsc'],
  'zkSync Era': ['zksync era', 'era'],
  'Polygon zkEVM': ['polygon zkevm'],
  'OP Mainnet': ['optimism'],
  Hyperliquid: ['hyperliquid l1', 'hyperliquid'],
}

function chainIconCandidates(chain: string) {
  const names = [...(CHAIN_ICON_ALIASES[chain] ?? []), chain.toLowerCase()]
  return [...new Set(names)].map((n) => `https://icons.llamao.fi/icons/chains/rsz_${encodeURIComponent(n)}.jpg`)
}

export function ChainLogo({ chain, size = 16 }: { chain: string; size?: number }) {
  const [i, setI] = useState(0)
  const urls = chainIconCandidates(chain)
  if (i >= urls.length)
    return (
      <span className="clogo clogo--fallback" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">
        {chain[0]?.toUpperCase()}
      </span>
    )
  return (
    <img
      key={urls[i]}
      className="clogo"
      src={urls[i]}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setI((n) => n + 1)}
    />
  )
}

export function Chain({ chain, size = 16 }: { chain: string; size?: number }) {
  return (
    <span className="chain">
      <ChainLogo chain={chain} size={size} />
      {chain}
    </span>
  )
}

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  hint?: string
}

export function Select({
  value,
  options,
  onChange,
  label,
  disabled,
  searchable,
  placeholder = 'Select',
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  label: string
  disabled?: boolean
  searchable?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = options.find((o) => o.value === value)
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    ref.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const choose = (o: SelectOption | undefined) => {
    if (!o || o.disabled) return
    onChange(o.value)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false)
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      return setOpen(true)
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(shown.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(shown[active])
    }
  }

  return (
    <div className={`select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} ref={ref} onKeyDown={onKey}>
      <button
        type="button"
        className="select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {current?.icon}
        <span className="select__value">{current?.label ?? placeholder}</span>
        <svg className="select__chev" viewBox="0 0 12 8" width="10" height="8" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="select__menu">
          {searchable && (
            <input
              className="select__search"
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setActive(0)
              }}
            />
          )}
          <ul role="listbox" id={listId} aria-label={label}>
            {shown.map((o, i) => (
              <li
                key={o.value + o.label}
                role="option"
                data-idx={i}
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                className={`${o.value === value ? 'is-selected' : ''}${i === active ? ' is-active' : ''}${o.disabled ? ' is-disabled' : ''}`}
                style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                {o.icon}
                <span className="select__opt">
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
                {o.value === value && (
                  <svg viewBox="0 0 12 10" width="12" height="10" aria-hidden="true">
                    <path d="M1 5.5 4.2 8.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            ))}
            {!shown.length && <li className="select__none">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div className="modal" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal__box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <div className="modal__body">{children}</div>
        <div className="modal__actions">
          <button ref={cancelRef} className="btn btn--light" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--danger" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
