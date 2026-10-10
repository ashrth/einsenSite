'use client'

import { useEffect, useRef } from 'react'

const FONT = 'var(--font-display), system-ui, sans-serif'

const SLICES = 8
const OFFSETS = [-0.5, 0.8, -0.2, 0.6, -0.9, 0.35, -0.6, 0.3]
const STEPS = 6

type Props = { kicker: string; word: string; before: string; after: string }

export default function ChoppedText({ kicker, word, before, after }: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const slicesRef = useRef<(HTMLSpanElement | null)[]>([])
  const beforeRef = useRef<HTMLParagraphElement>(null)
  const afterRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let raf = 0

    const update = () => {
      const el = sectionRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const scrollable = r.height - window.innerHeight
      let k = Math.min(Math.max(-r.top / (scrollable * 0.7), 0), 1)
      if (STEPS) k = Math.round(k * STEPS) / STEPS

      slicesRef.current.forEach((s, i) => {
        if (s) s.style.transform = `translateX(${OFFSETS[i] * k}em)`
      })
      if (beforeRef.current) beforeRef.current.style.opacity = String(1 - k)
      if (afterRef.current) afterRef.current.style.opacity = String(k)
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
  }, [])

  return (
    <section
      ref={sectionRef}
      style={{
        position: 'relative',
        zIndex: 3,
        height: '220vh',
        background: 'linear-gradient(to bottom, transparent 0, #000 40vh)',
      }}
    >
      <div
        style={{
          position: 'sticky', top: 0, height: '100vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 6vw', boxSizing: 'border-box', overflow: 'hidden',
          textAlign: 'center', fontFamily: FONT, color: '#fff',
        }}
      >
        <p style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 72px)', fontWeight: 300 }}>{kicker}</p>

        <div
          style={{
            position: 'relative', fontSize: 'clamp(80px, 17vw, 300px)', fontWeight: 400,
            lineHeight: 1, letterSpacing: '-0.04em', whiteSpace: 'nowrap',
          }}
        >
          <span style={{ visibility: 'hidden' }}>{word}</span>
          {Array.from({ length: SLICES }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              ref={(el) => {
                slicesRef.current[i] = el
              }}
              style={{
                position: 'absolute', inset: 0,
                clipPath: `inset(${(i * 100) / SLICES}% 0 ${100 - ((i + 1) * 100) / SLICES}% 0)`,
              }}
            >
              {word}
            </span>
          ))}
        </div>

        <div style={{ display: 'grid', marginTop: '5vh', fontSize: 18, fontWeight: 300, color: 'rgba(255,255,255,0.7)' }}>
          <p ref={beforeRef} style={{ gridArea: '1 / 1', margin: 0 }}>{before}</p>
          <p ref={afterRef} style={{ gridArea: '1 / 1', margin: 0, opacity: 0 }}>{after}</p>
        </div>
      </div>
    </section>
  )
}