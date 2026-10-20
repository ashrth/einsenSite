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
} from "@react-three/drei";
import ChoppedText from "./component/ChoppedText";
import WaitlistSection from "./component/WaitlistSection";
import { HeroWord } from "./component/Hero";
import ScrollRevealText from "./component/ScrollRevealText";
import WaitlistButton from "./component/WaitlistButton";

// ---- Mobile ----
const MOBILE_BP = 768; // screens narrower than this count as mobile
const REF_ASPECT = 1.4; // screens narrower (relative to height) than this get zoomed out
const MAX_ZOOM_OUT = 2.2; // how far the camera can pull back on very narrow screens
const MOBILE_OFFSET_Y = 0.12; // on mobile, lifts the machine up, leaving room for text below

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

const DEBUG = false;
const MODEL_PATH = "/models/model2.glb";
const MODEL_SIZE = 8;

// Zoom: smaller = more zoomed in (try 25–35)
const FOV = 30;

const ANIM_AT: [number, number] = [0.52, 0.75]; // scroll range that plays it (0 = top, 1 = bottom)
const ANIM_LENGTH = 15;

// ---- Blender studio lights (from File 2) ----
// Positions and directions are Blender's own numbers (x, y, z), converted in code.
const BLENDER_LIGHTS = [
  {
    name: "Area.004 (main)",
    pos: [-13.225, 3.233, 3.502],
    dir: [1.239, 0.715, 0.753],
    size: 3.65,
    intensity: 7,
  },
  {
    name: "Area.005",
    pos: [-0.23, 0.321, 0.903],
    dir: [0.841, 0.503, -0.201],
    size: 0.652,
    intensity: 3.9,
  },
  {
    name: "Area.003",
    pos: [0.138, -0.935, 0.903],
    dir: [0.841, 0.503, -0.201],
    size: 1.139,
    intensity: 0.9,
  },
  {
    name: "Area.002",
    pos: [0.63, -0.13, 0.151],
    dir: [-0.667, 0.686, -0.291],
    size: 0.463,
    intensity: 0.9,
  },
];
const LIGHT_BOOST = 1; // brightens or dims all studio lights together
const WORLD_COLOR = "#404040"; // Blender World color
const MODEL_CENTER = new THREE.Vector3(-0.002, 0.0655, 0.061); // machine center in the file (meters)
const MODEL_WIDTH = 0.75; // machine width in the file (meters)

// Blender (Z up) → website (Y up), scaled the same way as the model
function blenderToWeb([x, y, z]: number[]) {
  return new THREE.Vector3(x, z, -y)
    .sub(MODEL_CENTER)
    .multiplyScalar(MODEL_SIZE / MODEL_WIDTH);
}

const LED_NAME = "LED_EN_OG_4mm";
const LED_VIEW = 2; // which STOPS line it shows on (0 = first). 3 = bird's-eye
const LED_SPEED = 1.5; // how fast it travels around
const LED_LENGTH = 40; // higher = shorter light streak
const LED_BRIGHTNESS = 6;
const GLOW_VIEW = 2; // which STOPS line it shows on (3 = bird's-eye)
const GLOW_BRIGHTNESS = 4; // brightness of the outline
const GLOW_SPEED = 0.8; // speed of the travelling highlight
const HALO_STRENGTH = 1; // brightness of the light pool under the machine
const HALO_SIZE = 2.2; // size, relative to the machine

// Text fades out as it scrolls up toward the header (pixels from top of screen)
const FADE_START = 280; // starts fading here
const FADE_END = 110; // fully gone here (just below the header)

// How strongly the machine reflects light. Higher = more visible on black.
const ENV_INTENSITY = 1;

// Camera always looks at the machine's center.
// pos: where the camera stands (pick in DEBUG mode)
// offsetX: shifts the machine on screen. Negative = machine on the right, positive = on the left.
const STOPS = [
  {
    name: "Logo",
    pos: new THREE.Vector3(-0.1, 1.74, 9.78),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: 0,
    offsetY: 0.48,
  },
  {
    name: "Overview",
    pos: new THREE.Vector3(5.41, 5.03, 9.29),
    target: new THREE.Vector3(-3.99, 1.43, -1.17),
    offsetX: -0.18,
    offsetY: 0,
  },

  {
    name: "Bird's-eye",
    pos: new THREE.Vector3(0, 14, 0.5),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: 0.18,
    offsetY: 0,
  },
  {
    name: "Plate out",
    pos: new THREE.Vector3(0, 13, 3),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: -0.18,
    offsetY: 0,
  },
  {
    name: "Front",
    pos: new THREE.Vector3(0, 2, 14),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: 0.18,
    offsetY: 0,
  },
];

const FONT = "var(--font-display), system-ui, sans-serif";

const SECTIONS = [
  { label: "", text: "" }, // hero
  {
    label: "Power",
    text: "One touch starts the cycle. No settings, no guesswork, just a perfectly pressed shirt.",
    side: "left",
  },

  {
    label: "Footprint",
    text: "Compact from above. Fits on a shelf, a counter or a laundry room corner.",
    side: "right",
  },
  {
    label: "Loading",
    text: "The plate slides out. Lay your shirt down and let the machine take over.",
    side: "left",
  },
  {
    label: "Front",
    text: "Every detail engineered for one job: crisp, wrinkle-free clothes in minutes.",
    side: "right",
  },
];
const SMOOTHING = 5;

const scrollState = { progress: 0 };

const range = (p: number, [a, b]: [number, number]) =>
  Math.min(Math.max((p - a) / (b - a), 0), 1);
const smooth = (k: number) => k * k * (3 - 2 * k);

function getScrollProgress() {
  const el = document.getElementById("scroll-sections");
  const total = el ? el.offsetHeight : document.documentElement.scrollHeight;
  const max = total - window.innerHeight;
  return max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
}

function ScrollTracker() {
  useFrame((_, delta) => {
    const target = getScrollProgress();
    scrollState.progress +=
      (target - scrollState.progress) * (1 - Math.exp(-SMOOTHING * delta));
  });
  return null;
}

function Machine() {
  const { scene, animations } = useGLTF(MODEL_PATH);

  const { scale, height } = useMemo(() => {
    const size = new THREE.Box3()
      .setFromObject(scene)
      .getSize(new THREE.Vector3());
    const s = MODEL_SIZE / Math.max(size.x, size.y, size.z);
    return { scale: s, height: size.y * s };
  }, [scene]);

  // Soft round glow texture for the floor
  const halo = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,255,255,0.35)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.08)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  // Make every surface reflect the studio lights more strongly
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
      }
    });
  }, [scene]);

  // Blender's animations, ready to be scrubbed by the scroll
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

  const led = useMemo(() => {
    const root = scene.getObjectByName(LED_NAME);
    if (!root) {
      console.warn(`LED not found: "${LED_NAME}"`);
      return null;
    }
    const uniforms = {
      uAngle: { value: 0 },
      uStrength: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
    };
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.boundingBox!.getCenter(uniforms.uCenter.value);
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vLedPos;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvLedPos = position;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vLedPos;\nuniform float uAngle;\nuniform float uStrength;\nuniform vec3 uCenter;",
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
          vec3 lp = vLedPos - uCenter;
          float a = atan(lp.z, lp.x);
          float d = abs(mod(a - uAngle + 3.14159265, 6.2831853) - 3.14159265);
          totalEmissiveRadiance += vec3(1.0) * exp(-d * d * ${LED_LENGTH.toFixed(1)}) * uStrength * ${LED_BRIGHTNESS.toFixed(1)};`,
          );
      };
      mesh.material = mat;
    });
    return uniforms;
  }, [scene]);

  useFrame((_, delta) => {
    if (led) {
      led.uAngle.value += delta * LED_SPEED;
      const viewAt = LED_VIEW / (STOPS.length - 1);
      const dist = Math.abs(scrollState.progress - viewAt);
      led.uStrength.value = Math.max(0, 1 - dist / 0.1);
    }
    // Set each part's animation to the moment matching the scroll
    const t = range(scrollState.progress, ANIM_AT) * ANIM_LENGTH;
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
      {/* Light pool under the machine */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -height / 2 - 0.002, 0]}
        renderOrder={-1}
      >
        <planeGeometry
          args={[MODEL_SIZE * HALO_SIZE, MODEL_SIZE * HALO_SIZE * 0.6]}
        />
        <meshBasicMaterial
          map={halo}
          transparent
          depthWrite={false}
          toneMapped={false}
          opacity={HALO_STRENGTH}
        />
      </mesh>
    </>
  );
}

// Moves the camera around the machine's center, like orbiting it
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

  useFrame(({ camera, size }) => {
    const t = scrollState.progress * (stops.length - 1);
    const i = Math.min(Math.floor(t), stops.length - 2);
    const e = smooth(t - i);
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

    // Pull the camera back on narrow screens so the machine fits
    const aspect = size.width / size.height;
    sph.radius *= Math.min(Math.max(REF_ASPECT / aspect, 1), MAX_ZOOM_OUT);

    camera.position.setFromSpherical(sph).add(target);
    camera.lookAt(target);

    // Desktop: machine shifts left/right beside the text. Mobile: centered and lifted up.
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

function EdgeGlow() {
  const ring = useRef<THREE.Mesh>(null);
  const sweep = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const viewAt = GLOW_VIEW / (STOPS.length - 1);
    const k = Math.max(0, 1 - Math.abs(scrollState.progress - viewAt) / 0.1);

    // Ring above the machine: shows up as an outline on the rounded edges
    if (ring.current) {
      (ring.current.material as THREE.MeshBasicMaterial).color.setScalar(
        GLOW_BRIGHTNESS * k,
      );
    }
    // Strip circling the machine: a highlight that travels along the edges
    if (sweep.current) {
      sweep.current.rotation.y += delta * GLOW_SPEED;
      sweep.current.scale.setScalar(Math.max(k, 0.001));
    }
  });

  return (
    <>
      <Lightformer
        ref={ring}
        form="ring"
        position={[0, 5, 0]}
        scale={10}
        intensity={0}
        target={[0, 0, 0]}
      />
      <group ref={sweep}>
        <Lightformer
          position={[6, 6, 0]}
          scale={[2, 8, 1]}
          intensity={20}
          target={[0, 0, 0]}
        />
      </group>
    </>
  );
}

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

export default function Home() {
  const isMobile = useIsMobile();
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
        el.style.transform = `translateY(${(1 - o) * -10}px)`; // slight drift up as it fades
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
  return (
    <main style={{ position: "relative", background: "#000" }}>
      {/* Background glow */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse 55% 45% at 50% 55%, #242424 0%, #0a0a0a 55%, #000 100%)",
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
          dpr={isMobile ? [1, 1.5] : [1, 2]}
          gl={{ toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1 }}
        >
          <Suspense fallback={null}>
            <Environment resolution={256} frames={isMobile ? 1 : Infinity}>
              {/* Blender World */}
              <color attach="background" args={[WORLD_COLOR]} />
              {/* Blender's 4 studio lights */}
              <StudioLights />
              {/* Not in Blender: faint edge strips so the black body separates from the black page */}
              <Lightformer
                intensity={3}
                position={[-10, 2, 0]}
                scale={[8, 0.6, 1]}
                target={[0, 0, 0]}
              />
              <Lightformer
                intensity={3}
                position={[10, 2, 0]}
                scale={[8, 0.6, 1]}
                target={[0, 0, 0]}
              />
              <EdgeGlow />
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
          {SECTIONS.map((s, i) =>
            i === 0 ? (
              <section
                key="hero"
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
                    color: "rgba(255,255,255,0.7)",
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
            ) : (
              <section
                key={s.label}
                style={{
                  height: "100vh",
                  display: "flex",
                  alignItems: isMobile ? "flex-end" : "center",
                  justifyContent: isMobile
                    ? "flex-start"
                    : s.side === "right"
                      ? "flex-end"
                      : "flex-start",
                  padding: isMobile ? "0 6vw 12vh" : "25vh 6vw 0",
                  boxSizing: "border-box",
                }}
              >
                <div
                  data-fade
                  style={{
                    maxWidth: 520,
                    fontFamily: FONT,
                    pointerEvents: "auto",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 20px",
                      fontSize: 12,
                      letterSpacing: "0.4em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.5)",
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
                      color: "#fff",
                    }}
                  />
                </div>
              </section>
            ),
          )}
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
