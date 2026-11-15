import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "../store/useStore";
import { AGENTS, type AgentName } from "../lib/types";

/** Agent positions on a tilted spiral so beams read left-to-right as data flows. */
export const POSITIONS: THREE.Vector3[] = AGENTS.map((_, i) => {
  const a = -Math.PI * 0.85 + (i / (AGENTS.length - 1)) * Math.PI * 1.7;
  return new THREE.Vector3(Math.sin(a) * 5.2, Math.sin(i * 1.3) * 0.9 + (i % 2 ? 0.5 : -0.4), -Math.cos(a) * 2.4 - 1.2);
});
const MT5_POS = new THREE.Vector3(POSITIONS[5].x + 1.6, POSITIONS[5].y - 2.0, POSITIONS[5].z + 0.6);
const ROSE = new THREE.Color("#f43f5e");
const AMBER = new THREE.Color("#f59e0b");
const EMERALD = new THREE.Color("#10b981");

function Orb({ index }: { index: number }) {
  const spec = AGENTS[index];
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const flash = useRef(0);
  const lastPulse = useRef(0);
  const base = useMemo(() => new THREE.Color(spec.color), [spec.color]);
  const tmp = useMemo(() => new THREE.Color(), []);
  const { gl } = useThree();

  useFrame((state, dt) => {
    const live = useStore.getState().agents[spec.name];
    const selected = useStore.getState().selectedAgent === spec.name;
    if (live.pulse !== lastPulse.current) {
      lastPulse.current = live.pulse;
      if (live.last?.status !== "skip") flash.current = 1;
    }
    flash.current = Math.max(0, flash.current - dt * 1.1);
    const status = live.last?.status;
    const vetoRecent = Date.now() - live.vetoAt < 1800;
    const mt5Hit = spec.name === "Executioner" && Date.now() - mt5FlashAt.current < 2500;
    tmp.copy(base);
    if (vetoRecent) tmp.lerp(ROSE, 0.85);
    else if (status === "error") tmp.lerp(AMBER, 0.7);
    else if (mt5Hit) tmp.lerp(EMERALD, 0.9);
    if (core.current) {
      core.current.emissive.copy(tmp);
      core.current.color.copy(tmp);
      core.current.emissiveIntensity = 0.55 + flash.current * 2.4 + (selected ? 0.8 : 0) + (status === "skip" ? -0.2 : 0);
    }
    if (halo.current) {
      const s = 1.25 + flash.current * 0.7 + Math.sin(state.clock.elapsedTime * 2 + index) * 0.05;
      halo.current.scale.setScalar(s);
      (halo.current.material as THREE.MeshBasicMaterial).color.copy(tmp);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + flash.current * 0.25;
    }
    if (group.current) {
      const p = POSITIONS[index];
      const shake = vetoRecent ? Math.sin(state.clock.elapsedTime * 60) * 0.06 : 0;
      group.current.position.set(p.x + shake, p.y + Math.sin(state.clock.elapsedTime * 0.8 + index) * 0.12, p.z);
    }
  });

  return (
    <group ref={group}>
      <mesh
        onClick={(e) => { e.stopPropagation(); useStore.getState().set({ selectedAgent: spec.name }); }}
        onPointerOver={() => gl.domElement.setAttribute("data-cursor", "Inspect")}
        onPointerOut={() => gl.domElement.removeAttribute("data-cursor")}
      >
        <sphereGeometry args={[0.42, 48, 48]} />
        <meshStandardMaterial ref={core} color={spec.color} emissive={spec.color} emissiveIntensity={0.6} roughness={0.25} metalness={0.3} toneMapped={false} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshBasicMaterial color={spec.color} transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <Html center distanceFactor={9} position={[0, -0.85, 0]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap text-center">
          <div className="font-display text-[13px] font-semibold text-white drop-shadow">{spec.name}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400">{spec.role}</div>
        </div>
      </Html>
    </group>
  );
}

const mt5FlashAt = { current: 0 };

/** Light beam between two agents with a travelling data packet when the destination fires. */
function Beam({ from, to, toName, color }: { from: THREE.Vector3; to: THREE.Vector3; toName: AgentName; color: string }) {
  const packet = useRef<THREE.Mesh>(null);
  const prog = useRef(1);
  const last = useRef(0);
  const line = useRef<any>(null);
  useFrame((_, dt) => {
    const live = useStore.getState().agents[toName];
    if (live.pulse !== last.current) {
      last.current = live.pulse;
      if (live.last?.status !== "skip") prog.current = 0;
    }
    prog.current = Math.min(1, prog.current + dt * 2.6);
    if (packet.current) {
      packet.current.position.lerpVectors(from, to, prog.current);
      packet.current.visible = prog.current < 1;
    }
    if (line.current?.material) {
      line.current.material.dashOffset -= dt * 0.8;
      line.current.material.opacity = 0.25 + (1 - prog.current) * 0.75;
    }
  });
  return (
    <group>
      <Line ref={line} points={[from, to]} color={color} lineWidth={1.6} dashed dashSize={0.25} gapSize={0.15} transparent opacity={0.35} toneMapped={false} />
      <mesh ref={packet}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#e0fbff" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** MT5 terminal node: the Executioner fires an emerald beam into it when an order is placed. */
function Mt5Node() {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const beam = useRef<any>(null);
  const seen = useRef(useStore.getState().mt5Pulse);
  useFrame(() => {
    const st = useStore.getState();
    if (st.mt5Pulse !== seen.current) {
      seen.current = st.mt5Pulse;
      mt5FlashAt.current = Date.now();
    }
    const k = Math.max(0, 1 - (Date.now() - mt5FlashAt.current) / 2500);
    const connected = !!st.mt5?.connected;
    if (mat.current) mat.current.emissiveIntensity = (connected ? 0.5 : 0.15) + k * 3;
    if (beam.current?.material) beam.current.material.opacity = 0.12 + k * 0.88;
  });
  return (
    <group>
      <Line ref={beam} points={[POSITIONS[5], MT5_POS]} color="#10b981" lineWidth={2.4} transparent opacity={0.15} toneMapped={false} />
      <mesh position={MT5_POS} rotation={[0.4, 0.6, 0]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial ref={mat} color="#064e3b" emissive="#10b981" emissiveIntensity={0.4} roughness={0.3} metalness={0.6} toneMapped={false} />
      </mesh>
      <Html center distanceFactor={9} position={[MT5_POS.x, MT5_POS.y - 0.75, MT5_POS.z]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-300">MT5</div>
      </Html>
    </group>
  );
}

/** Flies the camera to the selected agent; returns home when deselected. Auto-rotates when idle. */
function CameraRig({ controls }: { controls: React.MutableRefObject<OrbitControlsImpl | null> }) {
  const home = useMemo(() => new THREE.Vector3(0, 3.2, 14.5), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lastInteraction = useRef(performance.now());
  const flying = useRef(false);
  const prevSel = useRef<string | null>(null);
  useFrame((state, dt) => {
    const sel = useStore.getState().selectedAgent;
    const c = controls.current;
    if (!c) return;
    if (sel !== prevSel.current) {
      prevSel.current = sel;
      flying.current = true;
    }
    if (flying.current) {
      if (sel) {
        const p = POSITIONS[AGENTS.findIndex((a) => a.name === sel)];
        target.copy(p);
        desired.copy(p).add(new THREE.Vector3(p.x * 0.25, 1.1, 3.6));
      } else {
        target.set(0, 0, 0);
        desired.copy(home);
      }
      const k = 1 - Math.pow(0.02, dt);
      state.camera.position.lerp(desired, k);
      c.target.lerp(target, k);
      if (state.camera.position.distanceTo(desired) < 0.05) flying.current = false;
    }
    c.autoRotate = !sel && performance.now() - lastInteraction.current > 6000;
    c.update();
  });
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const mark = () => { lastInteraction.current = performance.now(); };
    const el = gl.domElement;
    el.addEventListener("pointerdown", mark);
    el.addEventListener("wheel", mark, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", mark);
      el.removeEventListener("wheel", mark);
    };
  }, [gl]);
  return null;
}

export default function ConstellationScene() {
  const controls = useRef<OrbitControlsImpl | null>(null);
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 3.2, 14.5], fov: 50 }} gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => useStore.getState().set({ selectedAgent: null })}>
      <color attach="background" args={["#04050d"]} />
      <fog attach="fog" args={["#04050d", 14, 34]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 6, 6]} intensity={40} color="#8b5cf6" />
      <pointLight position={[-6, -3, 4]} intensity={25} color="#22d3ee" />
      <Stars radius={60} depth={40} count={2500} factor={3} fade speed={0.6} />
      <Sparkles count={90} scale={[16, 6, 8]} size={2.2} speed={0.35} color="#67e8f9" opacity={0.5} />
      {AGENTS.slice(1).map((a, i) => (
        <Beam key={a.name} from={POSITIONS[i]} to={POSITIONS[i + 1]} toName={a.name} color={AGENTS[i].color} />
      ))}
      {AGENTS.map((a, i) => <Orb key={a.name} index={i} />)}
      <Mt5Node />
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={4} maxDistance={20} autoRotateSpeed={0.5} enableDamping />
      <CameraRig controls={controls} />
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.2} luminanceSmoothing={0.5} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
