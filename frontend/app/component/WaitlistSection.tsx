import heroStyles from './Hero.module.css'

const FONT = 'var(--font-display), system-ui, sans-serif'

export default function WaitlistSection() {
  return (
    <section
      id="waitlist"
      style={{
        position: 'relative', zIndex: 3, background: '#000',
        minHeight: '70vh', // section height
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 32, padding: '10vh 6vw', boxSizing: 'border-box',
        textAlign: 'center', fontFamily: FONT, color: '#fff',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 72px)', fontWeight: 300, letterSpacing: '-0.02em' }}>
        Join the waitlist today.
      </h2>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 300, color: 'rgba(255,255,255,0.6)', maxWidth: 460 }}>
        Be among the first to own Einsen when it ships.
      </p>
      <a href="#waitlist" className={heroStyles.button}>
        get it shipped
      </a>
    </section>
  )
}