"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./Header.module.css";

// Change these to wherever the links should go (e.g. your WordPress pages)
const LINKS = [
  { label: "Contact", href: "/contact" },
  { label: "Home", href: "/" },
];

function GlassLink({
  label,
  href,
  refract,
}: {
  label: string;
  href: string;
  refract: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  // Moves the shine to follow the cursor
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };

  return (
    <Link
      ref={ref}
      href={href}
      onMouseMove={onMove}
      className={`${styles.glass} ${refract ? styles.refract : ""}`}
    >
      <span className={styles.label}>{label}</span>
    </Link>
  );
}

export default function Header() {
  // The liquid distortion only works in Chrome-based browsers; others get plain frosted glass
  const [refract, setRefract] = useState(false);
  useEffect(() => setRefract(!!(window as any).chrome), []);

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo} aria-label="Home">
        <img src="/logo.svg" alt="Einsen" />
      </Link>

      <nav className={styles.nav}>
        {LINKS.map((l) => (
          <GlassLink key={l.label} {...l} refract={refract} />
        ))}
      </nav>

      {/* Distortion filter used by the liquid glass effect */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="liquid-text">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.06"
            numOctaves="2"
            seed="2"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              dur="6s"
              values="0.02 0.06;0.035 0.09;0.02 0.06"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="3"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    </header>
  );
}
