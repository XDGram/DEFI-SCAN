import { CSSProperties, useEffect, useState } from 'react'
import WalletControl from './dashboard/WalletControl'
import { formatUsd, usePools } from './usePools'
import { Letters, Words, useCinematic } from './cinematic'

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="4" />
      <rect x="14" y="0" width="4" height="9" rx="2" fill="currentColor" />
      <rect x="14" y="23" width="4" height="9" rx="2" fill="currentColor" />
      <rect x="0" y="14" width="9" height="4" rx="2" fill="currentColor" />
      <rect x="23" y="14" width="9" height="4" rx="2" fill="currentColor" />
      <circle cx="16" cy="16" r="3.5" fill="currentColor" />
    </svg>
  )
}

function DotIcon() {
  const dots = [
    [1, 0], [1, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [3, 1], [3, 3], [1, 3], [1, 4],
  ]
  return (
    <svg width="14" height="14" viewBox="0 0 5 5" aria-hidden="true">
      {dots.map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x + 0.5} cy={y + 0.5} r="0.32" fill="currentColor" />
      ))}
    </svg>
  )
}

function PillButton({
  href,
  children,
  variant = 'dark',
  accent = false,
}: {
  href: string
  children: React.ReactNode
  variant?: 'dark' | 'light'
  accent?: boolean
}) {
  return (
    <a className={`pill-btn pill-btn--${variant}`} href={href}>
      <span className={`pill-btn__icon${accent ? ' pill-btn__icon--accent' : ''}`}>
        <DotIcon />
      </span>
      {children}
    </a>
  )
}

function Navbar() {
  return (
    <header className="nav-wrap">
      <nav className="nav">
        <a className="nav__brand" href="#top">
          <Logo size={24} />
          <span>DeFi Opportunity Scout</span>
        </a>
        <div className="nav__links">
          <a href="#how-it-works">How It Works</a>
          <a href="/app/discover">Explore</a>
        </div>
        <div className="nav__wallet wallet-scope">
          <WalletControl />
        </div>
      </nav>
    </header>
  )
}

const leftNodes = [
  { label: 'Pools', x: 22, y: 22 },
  { label: 'APY', x: 8, y: 78 },
  { label: 'TVL', x: 24, y: 78 },
]
const rightNodes = [
  { label: 'Telegraph', x: 76, y: 22 },
  { label: 'Evidence', x: 70, y: 78 },
  { label: 'Report', x: 86, y: 78 },
]

function HeroDiagram() {
  return (
    <div className="diagram" aria-hidden="true">
      <svg className="diagram__lines" viewBox="0 0 1000 300" preserveAspectRatio="none">
        <g className="diagram__paths" fill="none" stroke="var(--line)" strokeWidth="1.2">
          <path d="M0 66 H300 C360 66 380 66 420 110" pathLength="1" />
          <path d="M0 234 H330 C380 234 400 234 420 190" pathLength="1" />
          <path d="M1000 66 H700 C640 66 620 66 580 110" pathLength="1" />
          <path d="M1000 234 H670 C620 234 600 234 580 190" pathLength="1" />
        </g>
        <g className="diagram__dots" fill="var(--ink)">
          <circle cx="60" cy="66" r="4" />
          <circle cx="300" cy="66" r="4" />
          <circle cx="330" cy="234" r="4" />
          <circle cx="700" cy="66" r="4" />
          <circle cx="670" cy="234" r="4" />
          <circle cx="940" cy="66" r="4" />
        </g>
      </svg>
      {[...leftNodes, ...rightNodes].map((n, i) => (
        <span
          key={n.label}
          className="tag diagram__tag"
          style={{ left: `${n.x}%`, top: `${n.y}%`, '--i': i } as CSSProperties}
        >
          {n.label}
        </span>
      ))}
      <div className="diagram__tile">
        <div className="diagram__tile-inner">
          <Logo size={56} />
        </div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="hero" id="top">
      <span className="tag tag--badge hero__fade" style={{ '--d': '0s' } as CSSProperties}>Built for Telegraph Protocol Hackathon Season II</span>
      <h1 className="dot-title hero__title-top">
        <Letters text="FIND. RESEARCH." delay={0.2} />
      </h1>
      <HeroDiagram />
      <p className="dot-title dot-title--second hero__title-bottom" aria-hidden="true">
        <Letters text="DECIDE." delay={1.4} />
      </p>
      <h2 className="hero__headline hero__fade" style={{ '--d': '1.9s' } as CSSProperties}>Find Yield Opportunities. Research Before You Decide.</h2>
      <p className="hero__sub hero__fade" style={{ '--d': '2.05s' } as CSSProperties}>
        Discover and compare DeFi opportunities, then use Telegraph-powered intelligence to
        investigate details beyond APY.
      </p>
      <div className="hero__actions hero__fade" style={{ '--d': '2.2s' } as CSSProperties}>
        <PillButton href="/app/discover" accent>
          Explore Opportunities
        </PillButton>
        <PillButton href="#how-it-works" variant="light">
          How It Works
        </PillButton>
      </div>
    </section>
  )
}

function timeAgo(ms: number): string {
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  return `${Math.floor(min / 60)} h ago`
}

function OpportunityPreview() {
  const state = usePools(3)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])
  const fetchedAgo = state.status === 'ready' ? timeAgo(now - state.fetchedAt.getTime()) : null
  const fetchedExact =
    state.status === 'ready'
      ? `Loaded from DefiLlama by this page at ${state.fetchedAt.toLocaleString()}. This is not DefiLlama's last update time.`
      : undefined

  return (
    <section className="panel" data-reveal id="opportunities" aria-labelledby="opps-heading">
      <h2 id="opps-heading" className="sr-only">
        Opportunity preview
      </h2>
      {state.status === 'loading' &&
        [0, 1, 2].map((i) => (
          <div className="panel__col opp opp--placeholder" key={i}>
            <span className="tag">Loading live data…</span>
            <span className="dot-num dot-num--muted">--.--%</span>
          </div>
        ))}

      {state.status === 'error' && (
        <div className="panel__col panel__col--wide opp">
          <span className="tag tag--warn">Live data unavailable</span>
          <p className="opp__error">
            We couldn't load market data from DefiLlama right now. No figures are shown rather than
            estimated ones. Please try again later.
          </p>
        </div>
      )}

      {state.status === 'ready' &&
        state.pools.map((p, i) => (
          <article className="panel__col opp" key={p.pool} style={{ '--i': i } as CSSProperties}>
            <div className="opp__head">
              <span className="tag">{p.chain}</span>
              <span className="tag tag--live">Live</span>
            </div>
            <div>
              <span className="dot-num">{p.apy!.toFixed(2)}%</span>
              <p className="opp__label">APY</p>
            </div>
            <div className="opp__body">
              <p className="opp__name">{p.symbol}</p>
              <p className="opp__project">{p.project}</p>
              <dl className="opp__meta">
                <div>
                  <dt>TVL</dt>
                  <dd>{formatUsd(p.tvlUsd)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>DefiLlama</dd>
                </div>
                <div>
                  <dt>Fetched</dt>
                  <dd title={fetchedExact}>{fetchedAgo}</dd>
                </div>
              </dl>
            </div>
          </article>
        ))}

      <div className="panel__col panel__cta" style={{ '--i': 3 } as CSSProperties}>
        <p>
          A preview of the largest pools by TVL. APY is variable and can change at any time — it
          is not a measure of safety or suitability. &ldquo;Fetched&rdquo; is when this page loaded
          the data from DefiLlama, not when DefiLlama last updated it.
        </p>
        <PillButton href="/app/discover" variant="light">
          Explore All Opportunities
        </PillButton>
      </div>
    </section>
  )
}

const steps = [
  { n: '01', title: 'Discover', text: 'Find available DeFi opportunities.' },
  {
    n: '02',
    title: 'Investigate',
    text: 'Request additional intelligence through Telegraph.',
  },
  {
    n: '03',
    title: 'Compare',
    text: 'Review evidence, risks, and limitations before deciding.',
  },
]

function HowItWorks() {
  return (
    <section className="section" id="how-it-works">
      <h2 className="split-heading" data-reveal>
        <Words text="How it works." />{' '}
        <span className="muted">
          <Words text="From discovery to an informed decision," start={3} />
        </span>{' '}
        <Words text="in three steps." start={9} />
      </h2>
      <div className="steps" data-reveal>
        {steps.map((s, i) => (
          <div className="step" key={s.n} style={{ '--i': i } as CSSProperties}>
            <span className="dot-num dot-num--sm">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Halftone() {
  const cols = 44
  const rows = 26
  const dots: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < cols; i++) {
    const t = i / (cols - 1)
    const curve = rows * (0.85 - 0.6 * t - 0.12 * Math.sin(t * 9))
    for (let j = 0; j < rows; j++) {
      const d = j - curve
      if (d < 0) continue
      const r = Math.max(0, 0.42 - d * 0.035 + 0.06 * Math.sin(i * 1.7 + j * 2.3))
      if (r > 0.08) dots.push({ x: i, y: j, r })
    }
  }
  return (
    <svg className="halftone" data-reveal viewBox={`0 0 ${cols} ${rows}`} aria-hidden="true">
      {dots.map((d) => (
        <circle
          key={`${d.x}-${d.y}`}
          cx={d.x + 0.5}
          cy={d.y + 0.5}
          r={d.r}
          fill="var(--ink-soft)"
          style={{ '--x': d.x / cols, '--y': d.y / rows } as CSSProperties}
        />
      ))}
    </svg>
  )
}

const reasons = [
  {
    title: 'Compare more than APY.',
    text: 'Weigh liquidity, fees, withdrawal conditions and protocol risk alongside headline yield.',
  },
  {
    title: 'Investigate opportunities using additional intelligence.',
    text: 'Request deeper intelligence through Telegraph when the public data isn’t enough.',
  },
  {
    title: 'See supporting evidence and information gaps.',
    text: 'See where each finding comes from, how fresh it is, and what is still unknown.',
  },
]

function WhyScout() {
  return (
    <section className="section why">
      <div className="why__intro">
        <h2 className="split-heading split-heading--lg" data-reveal>
          <Words text="Why DeFi Opportunity Scout?" />{' '}
          <span className="muted">
            <Words text="Research the risks" start={4} />
          </span>{' '}
          <Words text="behind the yield." start={7} />
        </h2>
        <div className="why__list" data-reveal>
          {reasons.map((r, i) => (
            <div key={r.title} className="why__item" style={{ '--i': i } as CSSProperties}>
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </div>
      <Halftone />
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer" data-reveal>
      <div className="footer__top">
        <a className="nav__brand" href="#top">
          <Logo size={22} />
          <span>DeFi Opportunity Scout</span>
        </a>
        <div className="footer__links">
          <a href="#about">About</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#disclaimer">Financial Disclaimer</a>
        </div>
      </div>
      <div className="footer__cols">
        <div id="about">
          <h4>About</h4>
          <p>
            A DeFi research platform built for the Telegraph Protocol Hackathon Season II. It helps
            you discover, compare and research yield opportunities. It never moves or holds funds.
          </p>
        </div>
        <div id="disclaimer">
          <h4>Financial disclaimer</h4>
          <p>
            For research and information only — not financial advice. DeFi carries significant
            risk, including total loss of funds. Research findings are not guarantees of safety,
            suitability or future returns. Always do your own research.
          </p>
        </div>
      </div>
      <p className="footer__fine">Market data: DefiLlama. Telegraph integration in progress.</p>
    </footer>
  )
}

export default function App() {
  useCinematic()
  return (
    <>
      <div className="scroll-bar" aria-hidden="true" />
      <Navbar />
      <main>
        <Hero />
        <OpportunityPreview />
        <HowItWorks />
        <WhyScout />
      </main>
      <Footer />
    </>
  )
}
