import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const COUNT = 2600;

/** Instanced streaking starfield. `warp` (0..1) stretches stars and accelerates them toward the camera. */
function Starfield({ warp }: { warp: React.MutableRefObject<number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 2 + Math.random() * 38;
      const a = Math.random() * Math.PI * 2;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = Math.sin(a) * r;
      arr[i * 3 + 2] = -Math.random() * 200;
    }
    return arr;
  }, []);
  const colors = useMemo(() => {
    const c = new THREE.Color();
    const out = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      c.set(Math.random() < 0.7 ? "#a5f3fc" : Math.random() < 0.5 ? "#c4b5fd" : "#ffffff");
      c.toArray(out, i * 3);
    }
    return out;
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m) return;
    const w = warp.current;
    const speed = 8 + w * 260;
    for (let i = 0; i < COUNT; i++) {
      let z = data[i * 3 + 2] + speed * dt;
      if (z > 5) z = -200;
      data[i * 3 + 2] = z;
      dummy.position.set(data[i * 3], data[i * 3 + 1], z);
      dummy.scale.set(1, 1, 1 + w * 60);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.fov = 70 + w * 45;
    cam.updateProjectionMatrix();
    cam.rotation.z += dt * (0.03 + w * 0.6);
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[0.05, 6, 6]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </sphereGeometry>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

export default function IntroScene({ warp }: { warp: React.MutableRefObject<number> }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 5], fov: 70 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <color attach="background" args={["#03040b"]} />
      <Starfield warp={warp} />
      <EffectComposer>
        <Bloom intensity={1.2} luminanceThreshold={0.15} luminanceSmoothing={0.4} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
