"use client";

import { Suspense, useEffect, useMemo } from "react";
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
const MODEL_SIZE = 5;

// Zoom: smaller = more zoomed in (try 25–35)
const FOV = 30;

// How strongly the machine reflects light. Higher = more visible on black.
const ENV_INTENSITY = 2;

// Camera always looks at the machine's center.
// pos: where the camera stands (pick in DEBUG mode)
// offsetX: shifts the machine on screen. Negative = machine on the right, positive = on the left.
const STOPS = [
  {
    name: "Side view",
    pos: new THREE.Vector3(7.38, 5.48, 16.5),
    offsetX: -0.18,
  },
  {
    name: "Top view",
    pos: new THREE.Vector3(-18.1, 4.77, 12.02),
    offsetX: 0.18,
  },
  {
    name: "Close-up",
    pos: new THREE.Vector3(6.2, 4.49, 13.84),
    offsetX: -0.18,
  },
  {
    name: "Front / output",
    pos: new THREE.Vector3(-12.18, 2.75, 3.18),
    offsetX: 0.18,
  },
];

const SECTIONS = [
  {
    title: "Built for the fabrics you love",
    body: "Replace this with a one-line description of your machine.",
  },
  {
    title: "Compact from above",
    body: "Talk about footprint, layout, or how it fits on a shop floor.",
  },
  {
    title: "What happens inside",
    body: "Explain the pressing mechanism and what makes it reliable.",
  },
  {
    title: "Finished output",
    body: "Describe what comes out of the machine, and add a contact button here.",
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
    at: [0.4, 0.67],
  },
  {
    name: "Grapple_Left001",
    type: "slide",
    axis: "z",
    amount: -0.25,
    at: [0.4, 0.67],
  },
  {
    name: "Grapple_Right001",
    type: "slide",
    axis: "z",
    amount: -0.25,
    at: [0.4, 0.67],
  },
];

const scrollState = { progress: 0 };

const range = (p: number, [a, b]: [number, number]) =>
  Math.min(Math.max((p - a) / (b - a), 0), 1);
const smooth = (k: number) => k * k * (3 - 2 * k);

function getScrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
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

  useFrame(() => {
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
  const spheres = useMemo(
    () => STOPS.map((s) => new THREE.Spherical().setFromVector3(s.pos)),
    [],
  );
  const sph = useMemo(() => new THREE.Spherical(), []);
  const center = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame(({ camera, size }) => {
    const t = scrollState.progress * (STOPS.length - 1);
    const i = Math.min(Math.floor(t), STOPS.length - 2);
    const e = smooth(t - i);
    const a = spheres[i];
    const b = spheres[i + 1];

    // Take the shortest way around
    let dTheta = b.theta - a.theta;
    dTheta =
      ((((dTheta + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
      Math.PI;

    sph.set(
      THREE.MathUtils.lerp(a.radius, b.radius, e),
      THREE.MathUtils.lerp(a.phi, b.phi, e),
      a.theta + dTheta * e,
    );
    camera.position.setFromSpherical(sph);
    camera.lookAt(center);

    const offsetX = THREE.MathUtils.lerp(
      STOPS[i].offsetX,
      STOPS[i + 1].offsetX,
      e,
    );
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

  useEffect(() => {
    camera.clearViewOffset();
  }, [camera]);

  useFrame(() => {
    const el = document.getElementById("cam-readout");
    if (!el) return;
    const p = camera.position;
    const f = (n: number) => n.toFixed(2);
    el.textContent = `pos: new THREE.Vector3(${f(p.x)}, ${f(p.y)}, ${f(p.z)}),`;
  });

  return null;
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
            <Environment resolution={256}>
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
            </Environment>
            <directionalLight position={[6, 10, 4]} intensity={0.8} />

            <ScrollTracker />
            <Machine />
            {DEBUG ? (
              <>
                <OrbitControls makeDefault enablePan={false} />
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
        <div style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
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


// well jaljsdn