'use client'

import type { ButtonHTMLAttributes } from 'react'
import { openWaitlist } from './WaitlistModal'
import heroStyles from './Hero.module.css'

export default function WaitlistButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={heroStyles.button} onClick={openWaitlist}>
      Join the waitlist
    </button>
  )
}