"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { liquidGlass } from "@/lib/liquidGlass";
import styles from "./WaitlistModal.module.css";

const OPEN_EVENT = "open-waitlist";

// Any button can call this to open the form
export function openWaitlist() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM " +
  "FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM " +
  "JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO " +
  "MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT " +
  "PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL " +
  "TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");
function CountrySelect() {
  const list = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return COUNTRY_CODES.map((code) => names.of(code) ?? code).sort((a, b) =>
      a.localeCompare(b),
    );
  }, []);

  return (
    <select name="country" required defaultValue="" aria-label="Your country">
      <option value="" disabled>
        Your country
      </option>
      {list.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

export default function WaitlistModal() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const cardRef = useRef<HTMLDivElement>(null);

  // Listen for "open" requests from the buttons
  useEffect(() => {
    const onOpen = () => {
      setStatus("idle");
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // While open: glass effect, Esc to close, stop the page from scrolling
  useEffect(() => {
    if (!open) return;
    const el = cardRef.current;
    if (!el) return;
    const glass = liquidGlass(el);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el.querySelector("input")?.focus();
    return () => {
      glass.destroy();
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Glare follows the cursor
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty(
      "--gx",
      `${((e.clientX - r.left) / r.width) * 100}%`,
    );
    e.currentTarget.style.setProperty(
      "--gy",
      `${((e.clientY - r.top) / r.height) * 100}%`,
    );
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setStatus("sending");
    // TODO: save to Supabase. For now it's only logged.
    console.log("Waitlist signup:", data);
    await new Promise((r) => setTimeout(r, 600));
    setStatus("done");
  };

  if (!open) return null;

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
        <button
          className={styles.close}
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ×
        </button>

        {status === "done" ? (
          <>
            <h2 id="waitlist-title" className={styles.title}>
              You’re on the list.
            </h2>
            <p className={styles.sub}>
              We’ll email you as soon as Einsen is ready.
            </p>
          </>
        ) : (
          <>
            <div className={styles.head}>
              <h2 id="waitlist-title" className={styles.title}>
                Join the waitlist
              </h2>
              <span className={styles.badge}>Prototype</span>
            </div>
            <p className={styles.sub}>Be among the first to own Einsen.</p>

            <form className={styles.form} onSubmit={onSubmit}>
              <input
                name="name"
                placeholder="Your name"
                autoComplete="name"
                required
              />
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <CountrySelect />
              <label className={styles.switch}>
                <span>Send me product updates</span>
                <input type="checkbox" name="updates" defaultChecked />
                <span className={styles.track}>
                  <span className={styles.thumb} />
                </span>
              </label>
              <button type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Joining…" : "Join the waitlist"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
