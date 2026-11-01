import { ReactNode, useState } from 'react'
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
