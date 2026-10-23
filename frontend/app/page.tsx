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
  "linear-gradient(75deg, #dddbd6 0%, #d4d2cd 58%, #9c9b98 66%, #555554 76%, #454544 100%)",
].join(", ");

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
    // Phones: machine between the brand name and the button
    mobile: { offsetY: 0.49 },
  },
  {
    name: "Plates out (reference image)",
    pos: new THREE.Vector3(-4.3, 12.5, 6.8),
    target: new THREE.Vector3(-4.3, 0, 1),
    offsetX: 0,
    offsetY: 0.04,
    // Phones: whole machine centered, in the upper part, text below
    mobile: {
      pos: new THREE.Vector3(0, 12.5, 6.8),
      target: new THREE.Vector3(0, 0, 1),
      offsetY: -0.2,
    },
  },
  {
    name: "Side (the machine opens here)",
    pos: new THREE.Vector3(14, 3, 3),
    target: new THREE.Vector3(0, 0, 1.2),
    offsetX: -0.15,
    offsetY: 0,
    mobile: { offsetY: -0.2 },
  },
];

// How the camera travels between stops (one entry per gap):
// "move" = glides to the next view, "fade" = dissolves into the next view (no swinging)
const TRANSITIONS = ["move", "fade"];

// How open the machine is at each stop (0 = closed, 1 = open).
// The last stop opens by itself once the camera arrives.
const OPEN_AT_STOP = [0, 1, 0];

// Scroll held at the side view while it opens (in screen heights x 100)
const PIN_LENGTH = 80;
const ANIM_SPEED = 2; // 1 = Blender speed, 2 = twice as fast
const ANIM_END = 7.2; // seconds: everything in the Blender animation has finished by then

const FONT = "var(--font-display), system-ui, sans-serif";

// One per stop. side: "left" or "right" (where the text sits).
// height: screen height of the section (%). Smaller = quicker transition to the next stop.
const SECTIONS = [
  { label: "", text: "", side: "left", height: 100 }, // hero
  {
    label: "Ready",
    text: "One touch starts the cycle. No settings, no guesswork, just a perfectly pressed shirt.",
    side: "left",
    height: 40,
  },
  {
    label: "Loading",
    text: "The door opens, the plates slide out. Lay your shirt down and let the machine take over.",
    side: "left",
    height: 100, // not used: the last section's length is PIN_LENGTH
  },
];

// ---- Mobile ----
const MOBILE_BP = 768;
const REF_ASPECT = 1.4;
const MAX_ZOOM_OUT = 3.2;

// ---- Light (from the Blender file) ----
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

// How quickly the camera follows the scroll
const SMOOTHING = 5;

// =====================================================================
// SCROLL
// =====================================================================

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smooth = (k: number) => k * k * (3 - 2 * k);

// Easing for a gap: gliding uses a smooth curve; fading switches view halfway (while invisible)
function gapEase(i: number, f: number) {
  return TRANSITIONS[i] === "fade" ? (f < 0.5 ? 0 : 1) : smooth(f);
}

// cam: which stop the camera is at (1.5 = halfway between stop 1 and 2)
// inPin: true while the side view is held on screen
const scrollState = { cam: 0, inPin: false };

// How open the machine is right now (0 = closed, 1 = open)
const machineState = { open: 0 };

function readScroll() {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-stop]"));
  if (!els.length) return { cam: 0, inPin: false };
  const y = window.scrollY;
  const vh = window.innerHeight;
  const tops = els.map((e) => e.getBoundingClientRect().top + y);
  const last = els.length - 1;
  const pinLen = els[last].offsetHeight - vh;
  const inPin = y >= tops[last] - vh * 0.02 && y <= tops[last] + pinLen;

  if (y >= tops[last]) return { cam: last, inPin };

  let i = 0;
  while (i < last - 1 && y >= tops[i + 1]) i++;
  return { cam: i + clamp01((y - tops[i]) / (tops[i + 1] - tops[i])), inPin };
}

function ScrollTracker() {
  useFrame((_, delta) => {
    const target = readScroll();
    const k = 1 - Math.exp(-SMOOTHING * delta);
    scrollState.cam += (target.cam - scrollState.cam) * k;
    scrollState.inPin = target.inPin;
  });
  return null;
}

// How open the machine should be, based on where the scroll is
function targetOpenAmount() {
  if (DEBUG) return DEBUG_OPEN;
  const last = STOPS.length - 1;
  const { cam } = scrollState;
  if (cam >= last - 0.05) return 1; // side view reached: open
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
  const prevCam = useRef(0);

  const { scale, height } = useMemo(() => {
    const size = new THREE.Box3()
      .setFromObject(scene)
      .getSize(new THREE.Vector3());
    const s = MODEL_SIZE / Math.max(size.x, size.y, size.z);
    return { scale: s, height: size.y * s };
  }, [scene]);

  // Materials: reflections, logo brightness, no flicker on flat details
  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const m of mats) {
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
          // The power button's icon runs through the button, so it gets its own copy without this.
          const isButton =
            mesh.name.startsWith("Button") ||
            (mesh.parent?.name ?? "").startsWith("Button");
          if (isButton && !Array.isArray(mesh.material)) {
            const own = m.clone();
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

  // Blender's animations (door, plates, grapples)
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
    const last = STOPS.length - 1;
    const cam = scrollState.cam;
    const target = targetOpenAmount();
    const sideShowing = !DEBUG && cam >= last - 0.5; // the side view is the one on screen

    // Just switched to the side view (at the invisible moment of the fade): start closed
    if (sideShowing && prevCam.current < last - 0.5) machineState.open = 0;

    if (sideShowing) {
      // Open and close at a steady speed
      const step = (delta * ANIM_SPEED) / ANIM_END;
      machineState.open =
        target > machineState.open
          ? Math.min(target, machineState.open + step)
          : Math.max(target, machineState.open - step * 2);
    } else {
      // Other views follow the stops directly
      machineState.open = target;
    }
    prevCam.current = cam;

    const t = machineState.open * ANIM_END;
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
  const { deskStops, mobileStops } = useMemo(() => {
    const toRig = (s: {
      pos: THREE.Vector3;
      target: THREE.Vector3;
      offsetX: number;
      offsetY: number;
    }) => ({
      target: s.target,
      sph: new THREE.Spherical().setFromVector3(s.pos.clone().sub(s.target)),
      offsetX: s.offsetX,
      offsetY: s.offsetY,
    });
    return {
      deskStops: STOPS.map(toRig),
      mobileStops: STOPS.map((s) => toRig({ ...s, ...s.mobile })),
    };
  }, []);
  const sph = useMemo(() => new THREE.Spherical(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size, gl }) => {
    const mobile = size.width < MOBILE_BP;
    const stops = mobile ? mobileStops : deskStops;
    const t = scrollState.cam;
    const i = Math.min(Math.floor(t), stops.length - 2);
    const f = clamp01(t - i);
    const e = gapEase(i, f);

    // "fade" gaps: the 3D scene fades out, switches view, then fades back in
    gl.domElement.style.opacity = String(
      TRANSITIONS[i] === "fade" ? Math.abs(1 - 2 * f) : 1,
    );

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
    // Phones: no sideways shift; each stop's own up/down position
    const offsetX = mobile ? 0 : THREE.MathUtils.lerp(a.offsetX, b.offsetX, e);
    const offsetY = -THREE.MathUtils.lerp(a.offsetY, b.offsetY, e);
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
            <Environment resolution={isMobile ? 256 : 512} frames={1}>
              <color attach="background" args={[WORLD_COLOR]} />
              <StudioLights />
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
                    padding: isMobile ? "0 6vw 26vh" : "0 6vw 20vh",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: isMobile ? "center" : "space-between",
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
                      bottom: isMobile ? "14vh" : "28vh",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <WaitlistButton data-fade />
                  </div>
                </section>
              );
            }

            // Last stop: pinned while the machine opens
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
                    {textBlock(s)}
                  </div>
                </section>
              );
            }

            // Normal stops
            return (
              <section
                key={s.label}
                data-stop
                style={{
                  height: `${isMobile ? Math.max(s.height, 70) : s.height}vh`,
                  ...textLayout(s.side),
                }}
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
