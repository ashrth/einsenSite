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

// How strongly the machine reflects light. Higher = more visible on black.
const ENV_INTENSITY = 2;

// Camera always looks at the machine's center.
// pos: where the camera stands (pick in DEBUG mode)
// offsetX: shifts the machine on screen. Negative = machine on the right, positive = on the left.
const STOPS = [
  {
    name: "Overview",
    pos: new THREE.Vector3(8.54, 6.23, 12.77),
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
  {
    name: "Side",
    pos: new THREE.Vector3(14, 3, 0),
    target: new THREE.Vector3(0, 0, 0),
    offsetX: -0.18,
  },
];

const SECTIONS = [
  { title: "EINSEN", body: "Automated iron." },
  { title: "One touch to start", body: "Text about the power button." },
  { title: "Designed with care", body: "Text about the brand." },
  { title: "Compact from above", body: "Text about the footprint." },
  { title: "The plate slides out", body: "Text about loading the shirt." },
  { title: "Front view", body: "Text about the front." },
  { title: "Side view", body: "Text about the side." },
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
    at: [0.5, 0.67],
  },
  {
    name: "Grapple_Left001",
    type: "slide",
    axis: "z",
    amount: -0.25,
    at: [0.5, 0.67],
  },
  {
    name: "Grapple_Right001",
    type: "slide",
    axis: "z",
    amount: -0.25,
    at: [0.5, 0.67],
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
  return (
    <main style={{ background: "#000" }}>
      {/* Fixed 3D scene with a faint glow behind the machine */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "radial-gradient(ellipse 55% 45% at 50% 55%, #242424 0%, #0a0a0a 55%, #000 100%)",
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
              {/* Top softbox: lights the top surface */}
              <Lightformer
                intensity={2.5}
                position={[0, 10, 0]}
                scale={[10, 4, 1]}
                target={[0, 0, 0]}
              />
              {/* Back light: separates the machine from the background */}
              <Lightformer
                intensity={2}
                position={[0, 4, -10]}
                scale={[10, 2, 1]}
                target={[0, 0, 0]}
              />
              {/* Faint front fill */}
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
            zIndex: 2,
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
          style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}
        >
          {SECTIONS.map((s, i) => (
            <section
              key={s.title}
              style={{
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: i % 2 === 0 ? "flex-start" : "flex-end",
                padding: "0 6vw",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  maxWidth: 380,
                  fontFamily: "system-ui, sans-serif",
                  pointerEvents: "auto",
                }}
              >
                <h2
                  style={{
                    fontSize: "clamp(28px, 4vw, 48px)",
                    lineHeight: 1.1,
                    margin: "0 0 12px",
                    color: "#fff",
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                  }}
                >
                  {s.title}
                </h2>
                <p
                  style={{
                    fontSize: 18,
                    lineHeight: 1.5,
                    margin: 0,
                    color: "#8a8a8a",
                  }}
                >
                  {s.body}
                </p>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

useGLTF.preload(MODEL_PATH);
