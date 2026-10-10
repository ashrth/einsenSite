"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
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
import heroStyles from "./component/Hero.module.css";
import ScrollRevealText from "./component/ScrollRevealText";
const DEBUG = false;
const MODEL_PATH = "/models/modelwithlogo.glb";
const MODEL_SIZE = 8;

// Zoom: smaller = more zoomed in (try 25–35)
const FOV = 30;

const LED_NAME = "LED_EN_OG_4mm";
const LED_VIEW = 3; // which STOPS line it shows on (0 = first). 3 = bird's-eye
const LED_SPEED = 1.5; // how fast it travels around
const LED_LENGTH = 40; // higher = shorter light streak
const LED_BRIGHTNESS = 6;
const GLOW_VIEW = 3; // which STOPS line it shows on (3 = bird's-eye)
const GLOW_BRIGHTNESS = 4; // brightness of the outline
const GLOW_SPEED = 0.8; // speed of the travelling highlight

// Text fades out as it scrolls up toward the header (pixels from top of screen)
const FADE_START = 280; // starts fading here
const FADE_END = 110; // fully gone here (just below the header)

// How strongly the machine reflects light. Higher = more visible on black.
const ENV_INTENSITY = 2;

// Camera always looks at the machine's center.
// pos: where the camera stands (pick in DEBUG mode)
// offsetX: shifts the machine on screen. Negative = machine on the right, positive = on the left.
const STOPS = [
  {
    name: "Overview",
    pos: new THREE.Vector3(5.41, 5.03, 9.29),
    target: new THREE.Vector3(-3.99, 1.43, -1.17),
    offsetX: 0,
  },
  {
    name: "Power button",
    pos: new THREE.Vector3(-2.03, 2.13, 6.53),
    target: new THREE.Vector3(2.32, 1.68, 0.68),
    offsetX: 0,
  },

  {
    name: "Logo",
    pos: new THREE.Vector3(0.2, 0.77, 6.81),
    target: new THREE.Vector3(0.39, 1.65, 0.61),
    offsetX: 0,
  },

  {
    name: "Bird's-eye",
    pos: new THREE.Vector3(0, 14, 0.5),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: 0.18,
  },
  {
    name: "Plate out",
    pos: new THREE.Vector3(0, 13, 3),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: -0.18,
  },
  {
    name: "Front",
    pos: new THREE.Vector3(0, 2, 14),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: 0.18,
  },
];

const FONT = "var(--font-display), system-ui, sans-serif";

const SECTIONS = [
  { label: "", text: "" }, // hero
  {
    label: "Power",
    text: "One touch starts the cycle. No settings, no guesswork, just a perfectly pressed shirt.",
  },
  {
    label: "Identity",
    text: "Designed to sit quietly in your home, built to do the work you never wanted to.",
  },
  {
    label: "Footprint",
    text: "Compact from above. Fits on a shelf, a counter or a laundry room corner.",
  },
  {
    label: "Loading",
    text: "The plate slides out. Lay your shirt down and let the machine take over.",
  },
  {
    label: "Front",
    text: "Every detail engineered for one job: crisp, wrinkle-free clothes in minutes.",
  },
];
const SMOOTHING = 5;

// Each line moves one part from CLOSED to its Blender (open) position.
// at: scroll range when it opens [start, end]. Sections are at 0, 0.33, 0.67, 1.
const MOVES: {
  name: string;
  type: "slide" | "rotate";
  axis: "x" | "y" | "z";
  amount: number;
  at: [number, number];
}[] = [
  {
    name: "B_Plate001",
    type: "slide",
    axis: "z",
    amount: -0.25,
    at: [0.6, 0.8],
  },
  {
    name: "Grapple_Left001",
    type: "slide",
    axis: "z",
    amount: -0.25,
    at: [0.6, 0.8],
  },
  {
    name: "Grapple_Right001",
    type: "slide",
    axis: "z",
    amount: -0.25,
    at: [0.6, 0.8],
  },
];

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
  const { scene } = useGLTF(MODEL_PATH);

  const scale = useMemo(() => {
    const size = new THREE.Box3()
      .setFromObject(scene)
      .getSize(new THREE.Vector3());
    return MODEL_SIZE / Math.max(size.x, size.y, size.z);
  }, [scene]);

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

  const parts = useMemo(() => {
    const map = new Map<THREE.Object3D, typeof MOVES>();
    for (const m of MOVES) {
      const obj = scene.getObjectByName(m.name);
      if (!obj) {
        console.warn(`Part not found: "${m.name}"`);
        continue;
      }
      if (!obj.userData.startPos) obj.userData.startPos = obj.position.clone();
      if (!obj.userData.startRot) obj.userData.startRot = obj.rotation.clone();
      map.set(obj, [...(map.get(obj) ?? []), m]);
    }
    return [...map.entries()];
  }, [scene]);

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
    const p = scrollState.progress;
    for (const [obj, moves] of parts) {
      obj.position.copy(obj.userData.startPos);
      obj.rotation.copy(obj.userData.startRot);
      for (const m of moves) {
        const closed = 1 - smooth(range(p, m.at));
        if (m.type === "slide") obj.position[m.axis] += m.amount * closed;
        else
          obj.rotation[m.axis] += THREE.MathUtils.degToRad(m.amount) * closed;
      }
    }
  });

  return (
    <Center>
      <primitive object={scene} scale={scale} />
    </Center>
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

    camera.position.setFromSpherical(sph).add(target);
    camera.lookAt(target);

    const offsetX = THREE.MathUtils.lerp(a.offsetX, b.offsetX, e);
    (camera as THREE.PerspectiveCamera).setViewOffset(
      size.width,
      size.height,
      offsetX * size.width,
      0,
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

export default function Home() {
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
        <Canvas camera={{ position: [5, 1, 0], fov: FOV }}>
          <Suspense fallback={null}>
            <Environment resolution={256} frames={Infinity}>
              {/* Rim strips: outline the edges */}
              <Lightformer
                intensity={6}
                position={[-10, 3, 0]}
                scale={[8, 0.8, 1]}
                target={[0, 0, 0]}
              />
              <Lightformer
                intensity={6}
                position={[10, 3, 0]}
                scale={[8, 0.8, 1]}
                target={[0, 0, 0]}
              />
              {/* Top softbox */}
              <Lightformer
                intensity={2.5}
                position={[0, 10, 0]}
                scale={[10, 4, 1]}
                target={[0, 0, 0]}
              />
              {/* Back light */}
              <Lightformer
                intensity={2}
                position={[0, 4, -10]}
                scale={[10, 2, 1]}
                target={[0, 0, 0]}
              />
              {/* Front fill */}
              <Lightformer
                intensity={0.6}
                position={[0, 3, 10]}
                scale={[10, 2, 1]}
                target={[0, 0, 0]}
              />
              <EdgeGlow />
            </Environment>
            <directionalLight position={[6, 10, 4]} intensity={0.8} />

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
                  justifyContent: "space-between",
                  padding: "0 6vw 18vh",
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
                    bottom: "33vh",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <a href="#waitlist" data-fade className={heroStyles.button}>
                    Join the waitlist
                  </a>
                </div>
              </section>
            ) : (
              <section
                key={s.label}
                style={{
                  height: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: i % 2 === 0 ? "flex-start" : "flex-end",
                  padding: "25vh 6vw 0",
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
