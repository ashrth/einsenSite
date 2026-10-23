"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useGLTF,
  Environment,
  Center,
  OrbitControls,
  Lightformer,
  ContactShadows,
} from "@react-three/drei";
import ChoppedText from "./component/ChoppedText";
import WaitlistSection from "./component/WaitlistSection";
import { HeroWord } from "./component/Hero";
import ScrollRevealText from "./component/ScrollRevealText";
import WaitlistButton from "./component/WaitlistButton";

// =====================================================================
// SETTINGS
// =====================================================================

// true = rotate freely and copy camera positions. false = scroll animation.
const DEBUG = false;
const DEBUG_OPEN = 1; // in DEBUG mode: 0 = parts closed, 1 = parts open

const MODEL_PATH = "/models/model4withproperlogo.glb";
const MODEL_SIZE = 8;
const FOV = 30; // zoom: smaller = more zoomed in

// ---- Background: light beige on the left, grey on the right ----
const BACKGROUND = [
  // fine grain, like a real surface
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  // angle: 75deg tilts the split so the grey side is larger at the top, like the reference
  "linear-gradient(75deg, #dddbd6 0%, #d4d2cd 58%, #9c9b98 66%, #555554 76%, #454544 100%)",
].join(", ");

const TRANSITIONS = ["move", "fade"];
function gapEase(i: number, f: number) {
  return TRANSITIONS[i] === "fade" ? (f < 0.5 ? 0 : 1) : smooth(f);
}

const LOGO_GLOW = 5; // brightness of the logo, LED strip and text

// ---- Camera stops, in scroll order ----
// pos: where the camera stands. target: what it looks at.
// offsetX: shifts the machine on screen (negative = right, positive = left).
// offsetY: pushes the machine down on screen (positive = lower).
const STOPS = [
  {
    name: "Hero",
    pos: new THREE.Vector3(-0.1, 1.74, 9.78),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: 0,
    offsetY: 0.48,
  },
  {
    name: "Plates out (reference image)",
    pos: new THREE.Vector3(-4.3, 12.5, 6.8),
    target: new THREE.Vector3(-4.3, 0, 1),
    offsetX: 0,
    offsetY: 0.04,
  },
  // {
  //   name: "Bird's-eye",
  //   pos: new THREE.Vector3(0, 14, 0.5),
  //   target: new THREE.Vector3(0, 0, 0),
  //   offsetX: -0.18,
  //   offsetY: 0,
  // },
  {
    name: "Side (pinned: scroll moves the parts)",
    pos: new THREE.Vector3(14, 3, 3),
    target: new THREE.Vector3(0, 0, 1.2),
    offsetX: -0.15,
    offsetY: 0,
  },
];

// How open the machine is at each stop (0 = closed, 1 = fully open).
// The LAST stop is pinned: there, scrolling opens it from closed to fully open.
const OPEN_AT_STOP = [0, 1, 0];

// How much scrolling the pinned last stop takes (in screen heights x 100).
// Bigger = the parts move slower relative to the scroll.
const OPEN_PART = 0.75; // share of the pinned scroll used for opening; the rest shows the button
const PIN_LENGTH = 160; // slightly longer, to make room for the button moment

// Length of the Blender animation used (seconds): everything has finished moving by 10s
const ANIM_END = 7.2;

const FONT = "var(--font-display), system-ui, sans-serif";

// One per stop. side: "left" or "right" (where the text sits).
const SECTIONS = [
  { label: "", text: "", side: "left", height: 100 }, // hero
  {
    label: "Ready",
    text: "One touch starts the cycle. No settings, no guesswork, just a perfectly pressed shirt.",
    side: "left",
    height: 60,
  },

  {
    label: "Loading",
    text: "The door opens, the plates slide out. Lay your shirt down and let the machine take over.",
    side: "left",
    height: 100,
  },
];

// ---- Mobile ----
const MOBILE_BP = 768;
const REF_ASPECT = 1.4;
const MAX_ZOOM_OUT = 2.2;
const MOBILE_OFFSET_Y = 0.12;

// ---- Blender studio lights (from File 2) ----
const BLENDER_LIGHTS = [
  {
    name: "Area (main)",
    pos: [-0.218, 0.14, 0.649],
    dir: [1.796, -0.9, 0.379],
    size: 0.99,
    intensity: 3.5,
    color: "#f7f0ff",
  },
];
const LIGHT_BOOST = 1;
const WORLD_COLOR = "#404040";
const MODEL_CENTER = new THREE.Vector3(-0.0127, 0.0651, 0.061);
const MODEL_WIDTH = 0.7504;
const ENV_INTENSITY = 1;

// ---- Soft shadow under the machine ----
const SHADOW_OPACITY = 0.5;

// Text fades out as it scrolls up toward the header (pixels from top of screen)
const FADE_START = 280;
const FADE_END = 110;

// How quickly the camera and parts follow the scroll
const SMOOTHING = 5;

// =====================================================================
// SCROLL
// =====================================================================

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smooth = (k: number) => k * k * (3 - 2 * k);

// cam: which stop the camera is at (1.5 = halfway between stop 1 and 2)
// pin: progress through the pinned last stop (0 = start, 1 = parts fully out)
const scrollState = { cam: 0, pin: 0 };

function readScroll() {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-stop]"));
  if (!els.length) return { cam: 0, pin: 0 };
  const y = window.scrollY;
  const vh = window.innerHeight;
  const tops = els.map((e) => e.getBoundingClientRect().top + y);
  const last = els.length - 1;

  // Inside the pinned last section
  if (y >= tops[last]) {
    const pinLen = els[last].offsetHeight - vh;
    return {
      cam: last,
      pin: pinLen > 0 ? clamp01((y - tops[last]) / pinLen) : 1,
    };
  }

  // Between two stops
  let i = 0;
  while (i < last - 1 && y >= tops[i + 1]) i++;
  return { cam: i + clamp01((y - tops[i]) / (tops[i + 1] - tops[i])), pin: 0 };
}

function ScrollTracker() {
  useFrame((_, delta) => {
    const target = readScroll();
    const k = 1 - Math.exp(-SMOOTHING * delta);
    scrollState.cam += (target.cam - scrollState.cam) * k;
    scrollState.pin += (target.pin - scrollState.pin) * k;
  });
  return null;
}

// How open the machine should be right now (0 = closed, 1 = open)
function currentOpenAmount() {
  if (DEBUG) return DEBUG_OPEN;
  const last = STOPS.length - 1;
  const { cam, pin } = scrollState;
  if (cam >= last - 0.001) return clamp01(pin / OPEN_PART);
  const i = Math.min(Math.floor(cam), last - 1);
  return THREE.MathUtils.lerp(
    OPEN_AT_STOP[i],
    OPEN_AT_STOP[i + 1],
    gapEase(i, cam - i),
  );
}

// =====================================================================
// HELPERS
// =====================================================================

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

// Blender (Z up) → website (Y up), scaled the same way as the model
function blenderToWeb([x, y, z]: number[]) {
  return new THREE.Vector3(x, z, -y)
    .sub(MODEL_CENTER)
    .multiplyScalar(MODEL_SIZE / MODEL_WIDTH);
}

// =====================================================================
// MACHINE
// =====================================================================

function Machine() {
  const { scene, animations } = useGLTF(MODEL_PATH);

  const { scale, height } = useMemo(() => {
    const size = new THREE.Box3()
      .setFromObject(scene)
      .getSize(new THREE.Vector3());
    const s = MODEL_SIZE / Math.max(size.x, size.y, size.z);
    return { scale: s, height: size.y * s };
  }, [scene]);

  // Reflection strength of every surface
  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const m of mats) {
        // Reflection strength
        if ("envMapIntensity" in m) {
          (m as THREE.MeshStandardMaterial).envMapIntensity = ENV_INTENSITY;
          m.needsUpdate = true;
        }

        if (m.name === "Material.007") {
          // Brighter logo, LED, text and power icon
          if ("emissiveIntensity" in m) {
            (m as THREE.MeshStandardMaterial).emissiveIntensity = LOGO_GLOW;
          }

          // Logo, LED and text sit flat on the body: draw them slightly in front, so they don't flicker.
          // The power button is different (its icon runs through the button), so it gets its own copy without this.
          const isButton =
            mesh.name.startsWith("Button") ||
            (mesh.parent?.name ?? "").startsWith("Button");
          if (isButton && !Array.isArray(mesh.material)) {
            const own = m.clone(); // copies the glow and reflection settings above
            own.polygonOffset = false;
            mesh.material = own;
          } else {
            m.polygonOffset = true;
            m.polygonOffsetFactor = -1;
            m.polygonOffsetUnits = -4;
          }
        }
      }
    });
  }, [scene]);

  // Blender's animations (door, plates, grapples), positioned by the scroll
  const { mixer, actions } = useMemo(() => {
    const m = new THREE.AnimationMixer(scene);
    const list = animations.map((clip) => {
      const action = m.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      return action;
    });
    return { mixer: m, actions: list };
  }, [scene, animations]);

  useFrame((_, delta) => {
    // Place every part at the moment of the animation matching the scroll
    const t = currentOpenAmount() * ANIM_END;
    for (const a of actions) {
      a.enabled = true;
      a.paused = false;
      a.time = Math.min(t, a.getClip().duration);
    }
    mixer.update(0);
  });

  return (
    <>
      <Center>
        <primitive object={scene} scale={scale} />
      </Center>
      {/* Soft shadow on the surface */}
      <ContactShadows
        position={[0.5, -height / 2, 0.3]}
        scale={MODEL_SIZE * 2.5}
        blur={2.5}
        opacity={SHADOW_OPACITY}
        far={MODEL_SIZE}
      />
    </>
  );
}

// =====================================================================
// CAMERA
// =====================================================================

function CameraRig() {
  const stops = useMemo(
    () =>
      STOPS.map((s) => ({
        target: s.target,
        sph: new THREE.Spherical().setFromVector3(s.pos.clone().sub(s.target)),
        offsetX: s.offsetX,
        offsetY: s.offsetY,
      })),
    [],
  );
  const sph = useMemo(() => new THREE.Spherical(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size, gl }) => {
    const t = scrollState.cam;
    const i = Math.min(Math.floor(t), stops.length - 2);
    const f = clamp01(t - i);
    const e = gapEase(i, f);

    // For "fade" gaps: the 3D scene fades out, switches view, then fades back in
    const fade = TRANSITIONS[i] === "fade" ? Math.abs(1 - 2 * f) : 1;
    gl.domElement.style.opacity = String(fade);
    const a = stops[i];
    const b = stops[i + 1];

    let dTheta = b.sph.theta - a.sph.theta;
    dTheta =
      ((((dTheta + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
      Math.PI;

    sph.set(
      THREE.MathUtils.lerp(a.sph.radius, b.sph.radius, e),
      THREE.MathUtils.lerp(a.sph.phi, b.sph.phi, e),
      a.sph.theta + dTheta * e,
    );
    target.lerpVectors(a.target, b.target, e);

    // Pull back on narrow screens so the machine fits
    const aspect = size.width / size.height;
    sph.radius *= Math.min(Math.max(REF_ASPECT / aspect, 1), MAX_ZOOM_OUT);

    camera.position.setFromSpherical(sph).add(target);
    camera.lookAt(target);

    // Desktop: machine shifted beside the text. Mobile: centered and lifted.
    const mobile = size.width < MOBILE_BP;
    const offsetX = mobile ? 0 : THREE.MathUtils.lerp(a.offsetX, b.offsetX, e);
    const offsetY =
      (mobile ? MOBILE_OFFSET_Y : 0) -
      THREE.MathUtils.lerp(a.offsetY, b.offsetY, e);
    (camera as THREE.PerspectiveCamera).setViewOffset(
      size.width,
      size.height,
      offsetX * size.width,
      offsetY * size.height,
      size.width,
      size.height,
    );
  });

  return null;
}

function CameraReadout() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as any;

  useEffect(() => {
    camera.clearViewOffset();
  }, [camera]);

  useFrame(() => {
    const el = document.getElementById("cam-readout");
    if (!el || !controls) return;
    const p = camera.position;
    const t = controls.target;
    const f = (n: number) => n.toFixed(2);
    el.textContent =
      `pos: new THREE.Vector3(${f(p.x)}, ${f(p.y)}, ${f(p.z)}), ` +
      `target: new THREE.Vector3(${f(t.x)}, ${f(t.y)}, ${f(t.z)}),`;
  });

  return null;
}

// =====================================================================
// LIGHTING
// =====================================================================

function StudioLights() {
  const k = MODEL_SIZE / MODEL_WIDTH;
  return (
    <>
      {BLENDER_LIGHTS.map((l) => {
        const p = blenderToWeb(l.pos);
        const [dx, dy, dz] = l.dir;
        const d = new THREE.Vector3(dx, dz, -dy).normalize();
        const target = p.clone().add(d);
        return (
          <Lightformer
            key={l.name}
            form="rect"
            color={l.color}
            intensity={l.intensity * LIGHT_BOOST}
            position={p.toArray()}
            scale={[l.size * k, l.size * k, 1]}
            target={target.toArray()}
          />
        );
      })}
    </>
  );
}

// =====================================================================
// PAGE
// =====================================================================

export default function Home() {
  const isMobile = useIsMobile();

  // "Join the waitlist" button that appears once the machine is fully open
  const ctaRef = useRef<HTMLDivElement>(null);
  const textWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = ctaRef.current;
      if (el) {
        const k = clamp01(
          ((scrollState.pin - OPEN_PART) / (1 - OPEN_PART)) * 2,
        );
        el.style.opacity = String(k);
        el.style.transform = `translateY(${(1 - k) * 16}px)`;
        el.style.pointerEvents = k > 0.5 ? "auto" : "none";
      }
      // The text fades out as the button fades in
      if (textWrapRef.current) {
        const k = clamp01(
          ((scrollState.pin - OPEN_PART) / (1 - OPEN_PART)) * 2,
        );
        textWrapRef.current.style.opacity = String(1 - k);
        textWrapRef.current.style.pointerEvents = k > 0.5 ? "none" : "auto";
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  // Text fades out before reaching the header
  useEffect(() => {
    if (DEBUG) return;
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>("[data-fade]"),
    );
    let raf = 0;

    const update = () => {
      for (const el of blocks) {
        const top = el.getBoundingClientRect().top;
        const o = Math.min(
          Math.max((top - FADE_END) / (FADE_START - FADE_END), 0),
          1,
        );
        el.style.opacity = String(o);
        el.style.transform = `translateY(${(1 - o) * -10}px)`;
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Layout of a text section (left or right of the machine)
  const textLayout = (side: string): React.CSSProperties => ({
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: isMobile
      ? "flex-start"
      : side === "right"
        ? "flex-end"
        : "flex-start",
    padding: isMobile ? "0 6vw 12vh" : "25vh 6vw 0",
    boxSizing: "border-box",
  });

  const textBlock = (s: (typeof SECTIONS)[number]) => (
    <div
      data-fade
      style={{ maxWidth: 520, fontFamily: FONT, pointerEvents: "auto" }}
    >
      <p
        style={{
          margin: "0 0 20px",
          fontSize: 12,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
        }}
      >
        • {s.label}
      </p>
      <ScrollRevealText
        text={s.text}
        style={{
          margin: 0,
          fontSize: "clamp(28px, 3.2vw, 46px)",
          fontWeight: 300,
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
          color: "var(--text)",
        }}
      />
    </div>
  );

  return (
    <main style={{ position: "relative", background: "var(--bg)" }}>
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: BACKGROUND,
        }}
      />

      {/* Giant brand name, behind the machine */}
      {!DEBUG && <HeroWord word="einsen" />}

      {/* 3D scene */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2,
          pointerEvents: DEBUG ? "auto" : "none",
        }}
      >
        <Canvas
          camera={{ position: [5, 1, 0], fov: FOV }}
          dpr={[1, 2]}
          gl={{ toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1 }}
        >
          <Suspense fallback={null}>
            <Environment
              resolution={isMobile ? 256 : 512}
              frames={isMobile ? 1 : Infinity}
            >
              <color attach="background" args={[WORLD_COLOR]} />
              <StudioLights />
              {/* Long strip above and behind the machine: creates the diagonal band on the top and plate */}
              {/* Diagonal light strip: placed exactly where the top surface reflects it from stop 2 */}
              <Lightformer
                form="rect"
                intensity={8}
                position={[0, 12.7, -5.9]}
                scale={[2.5, 30, 1]}
                target={[0, 0, 0]}
              />
            </Environment>

            <ScrollTracker />
            <Machine />
            {DEBUG ? (
              <>
                <OrbitControls makeDefault />
                <CameraReadout />
              </>
            ) : (
              <CameraRig />
            )}
          </Suspense>
        </Canvas>
      </div>

      {DEBUG ? (
        <div
          id="cam-readout"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 5,
            padding: "12px 16px",
            background: "rgba(255,255,255,0.9)",
            fontFamily: "monospace",
            fontSize: 14,
            userSelect: "all",
          }}
        />
      ) : (
        <div
          id="scroll-sections"
          style={{ position: "relative", zIndex: 3, pointerEvents: "none" }}
        >
          {SECTIONS.map((s, i) => {
            // Stop 1: hero
            if (i === 0) {
              return (
                <section
                  key="hero"
                  data-stop
                  style={{
                    position: "relative",
                    height: "100vh",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: isMobile ? "center" : "space-between",
                    padding: "0 6vw 20vh",
                    boxSizing: "border-box",
                  }}
                >
                  <p
                    data-fade
                    style={{
                      margin: 0,
                      fontFamily: FONT,
                      fontSize: 13,
                      letterSpacing: "0.4em",
                      textTransform: "uppercase",
                      color: "var(--text-dim)",
                    }}
                  >
                    Prototype out now
                  </p>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: isMobile ? "26vh" : "28vh",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <WaitlistButton data-fade />
                  </div>
                </section>
              );
            }

            // Last stop: pinned. The screen holds still while scrolling moves the parts.
            if (i === SECTIONS.length - 1) {
              return (
                <section
                  key={s.label}
                  data-stop
                  style={{
                    position: "relative",
                    height: `${100 + PIN_LENGTH}vh`,
                  }}
                >
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      height: "100vh",
                      ...textLayout(s.side),
                    }}
                  >
                    {/* Text and button share the same spot: one fades out as the other fades in */}
                    <div style={{ display: "grid" }}>
                      <div ref={textWrapRef} style={{ gridArea: "1 / 1" }}>
                        {textBlock(s)}
                      </div>
                      <div
                        ref={ctaRef}
                        style={{
                          gridArea: "1 / 1",
                          alignSelf: "center",
                          opacity: 0,
                        }}
                      >
                        <WaitlistButton />
                      </div>
                    </div>
                  </div>
                </section>
              );
            }

            // Normal stops
            return (
              <section
                key={s.label}
                data-stop
                style={{ height: `${s.height}vh`, ...textLayout(s.side) }}
              >
                {textBlock(s)}
              </section>
            );
          })}
        </div>
      )}

      {!DEBUG && (
        <>
          <ChoppedText
            kicker="The end of manual"
            word="ironing."
            before="tiring chore."
            after="effortless results."
          />
          <WaitlistSection />
        </>
      )}
    </main>
  );
}

useGLTF.preload(MODEL_PATH);
