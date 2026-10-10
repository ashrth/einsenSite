import styles from './Hero.module.css'

export function HeroWord({ word }: { word: string }) {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.word}>
        {Array.from(word).map((ch, i) => (
          <span key={i} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
            {ch}
          </span>
        ))}
      </h1>
    </div>
  )
}