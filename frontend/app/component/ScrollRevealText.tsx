'use client'

import { Fragment, useEffect, useRef } from 'react'

const DIM = 0.18 // brightness of unread letters
const SOFT = 10  // how many letters the glowing edge spans

export default function ScrollRevealText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chars = Array.from(el.querySelectorAll<HTMLSpanElement>('[data-c]'))
    const n = chars.length
    let raf = 0

    const update = () => {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 when the text enters the lower screen, 1 when it's higher up
      const p = Math.min(Math.max((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0), 1)
      const head = p * (n + SOFT)
      for (let i = 0; i < n; i++) {
        const k = Math.min(Math.max((head - i) / SOFT, 0), 1)
        const glow = Math.sin(k * Math.PI) // brightest mid-reveal
        chars[i].style.opacity = String(DIM + (1 - DIM) * k)
        chars[i].style.textShadow = glow > 0.01 ? `0 0 ${14 * glow}px rgba(255,255,255,${0.55 * glow})` : 'none'
      }
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [text])

  const words = text.split(' ')
  return (
    <p ref={ref} style={style}>
      {words.map((w, wi) => (
        <Fragment key={wi}>
          <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {Array.from(w).map((ch, ci) => (
              <span key={ci} data-c style={{ opacity: DIM }}>
                {ch}
              </span>
            ))}
          </span>{' '}
        </Fragment>
      ))}
    </p>
  )
}