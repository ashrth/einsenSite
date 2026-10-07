import Link from 'next/link'
import { LiquidChrome } from './LiquidChrome'
import styles from './Footer.module.css'

// Change hrefs to the real pages
const FOOTER_LINKS = [
  { label: 'Strategic Partners & Investors', href: '/partners' },
  { label: 'Contact', href: '/contact' },
]

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.bg}>
        <LiquidChrome baseColor={[0.05, 0.05, 0.05]} speed={0.6} amplitude={0.5} />
      </div>
      <div className={styles.overlay} />

      <nav className={styles.links}>
        {FOOTER_LINKS.map((l) => (
          <Link key={l.label} href={l.href} className={styles.link}>
            {l.label}
          </Link>
        ))}
        <p className={styles.copy}>© Einsen {new Date().getFullYear()}</p>
      </nav>
    </footer>
  )
}