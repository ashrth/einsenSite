'use client'

import { useEffect, useRef, useState } from 'react'
import { liquidGlass } from '@/lib/liquidGlass'
import styles from './WaitlistModal.module.css'

const OPEN_EVENT = 'open-waitlist'

// Any button can call this to open the form
export function openWaitlist() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export default function WaitlistModal() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const cardRef = useRef<HTMLDivElement>(null)

  // Listen for "open" requests from the buttons
  useEffect(() => {
    const onOpen = () => {
      setStatus('idle')
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // While open: glass effect, Esc to close, stop the page from scrolling
  useEffect(() => {
    if (!open) return
    const el = cardRef.current
    if (!el) return
    const glass = liquidGlass(el)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el.querySelector('input')?.focus()
    return () => {
      glass.destroy()
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  // Glare follows the cursor
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`)
    e.currentTarget.style.setProperty('--gy', `${((e.clientY - r.top) / r.height) * 100}%`)
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget))
    setStatus('sending')
    // TODO: save to Supabase. For now it's only logged.
    console.log('Waitlist signup:', data)
    await new Promise((r) => setTimeout(r, 600))
    setStatus('done')
  }

  if (!open) return null

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-title"
        onMouseMove={onMove}
      >
        <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>

        {status === 'done' ? (
          <>
            <h2 id="waitlist-title" className={styles.title}>You’re on the list.</h2>
            <p className={styles.sub}>We’ll email you as soon as Einsen is ready.</p>
          </>
        ) : (
          <>
            <div className={styles.head}>
              <h2 id="waitlist-title" className={styles.title}>Join the waitlist</h2>
              <span className={styles.badge}>Prototype</span>
            </div>
            <p className={styles.sub}>Be among the first to own Einsen.</p>

            <form className={styles.form} onSubmit={onSubmit}>
              <input name="name" placeholder="Your name" autoComplete="name" required />
              <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
              <label className={styles.switch}>
                <span>Send me product updates</span>
                <input type="checkbox" name="updates" defaultChecked />
                <span className={styles.track}>
                  <span className={styles.thumb} />
                </span>
              </label>
              <button type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Joining…' : 'Join the waitlist'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}