import { CSSProperties, useEffect } from 'react'

export function useCinematic() {
  useEffect(() => {
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced) root.classList.add('motion')

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.15) e.target.classList.add('is-in')
          else if (!e.isIntersecting) e.target.classList.remove('is-in')
        }
      },
      { threshold: [0, 0.15] },
    )
    const observeAll = () =>
      document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el))
    observeAll()
    const mo = new MutationObserver(observeAll)
    mo.observe(document.body, { childList: true, subtree: true })

    let frame = 0
    const update = () => {
      frame = 0
      const hero = document.querySelector<HTMLElement>('.hero')
      if (hero) {
        const p = Math.min(1, Math.max(0, window.scrollY / hero.offsetHeight))
        hero.style.setProperty('--p', p.toFixed(4))
      }
      const total = root.scrollHeight - window.innerHeight
      root.style.setProperty('--scroll', total > 0 ? (window.scrollY / total).toFixed(4) : '0')
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    if (!reduced) {
      update()
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll)
    }

    return () => {
      io.disconnect()
      mo.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
}

export function Letters({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className="letters" aria-label={text}>
      {[...text].map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="letter"
          style={{ '--i': i, '--d': `${delay}s` } as CSSProperties}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

export function Words({
  text,
  start = 0,
  className,
}: {
  text: string
  start?: number
  className?: string
}) {
  let n = start
  return (
    <>
      {text.split(/(\s+)/).map((w, i) =>
        /^\s+$/.test(w) || !w ? (
          w
        ) : (
          <span
            key={i}
            className={`word ${className ?? ''}`}
            style={{ '--w': n++ } as CSSProperties}
          >
            <span className="word__inner">{w}</span>
          </span>
        ),
      )}
    </>
  )
}
