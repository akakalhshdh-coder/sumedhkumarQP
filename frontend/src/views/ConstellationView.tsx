import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { AGENTS, type AgentName, type AgentResult } from "../lib/types";
import { weakGpu } from "../lib/format";

const ConstellationScene = lazy(() => import("../scenes/ConstellationScene"));

const STATUS_STYLE: Record<string, string> = {
  ok: "text-emerald-300 border-profit/40 bg-profit/10",
  veto: "text-rose-300 border-loss/50 bg-loss/10",
  skip: "text-slate-400 border-white/10 bg-white/5",
  error: "text-amber-200 border-warn/50 bg-warn/10",
};

/** 2D fallback for weak GPUs / mobile: same data, SVG nodes and animated links. */
function Constellation2D() {
  const agents = useStore((s) => s.agents);
  const selected = useStore((s) => s.selectedAgent);
  const set = useStore((s) => s.set);
  const pts = AGENTS.map((_, i) => ({ x: 70 + i * 120, y: 150 + Math.sin(i * 1.3) * 70 }));
  return (
    <svg viewBox="0 0 860 320" className="h-full w-full">
      {pts.slice(1).map((p, i) => (
        <motion.line key={i} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y} stroke={AGENTS[i].color} strokeWidth="2" strokeDasharray="6 5"
          animate={{ strokeDashoffset: [0, -22] }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} opacity={0.6} />
      ))}
      {AGENTS.map((a, i) => {
        const live = agents[a.name];
        const veto = Date.now() - live.vetoAt < 1800;
        return (
          <g key={a.name} onClick={() => set({ selectedAgent: a.name })} data-cursor="Inspect" style={{ cursor: "pointer" }}>
            <motion.circle key={live.pulse} cx={pts[i].x} cy={pts[i].y} r={26} fill={veto ? "#f43f5e" : a.color} opacity={0.25}
              initial={{ r: 26 }} animate={{ r: [26, 40, 26] }} transition={{ duration: 0.6 }} />
            <circle cx={pts[i].x} cy={pts[i].y} r={20} fill={veto ? "#f43f5e" : a.color} stroke={selected === a.name ? "#fff" : "none"} strokeWidth="2"
              style={{ filter: `drop-shadow(0 0 10px ${a.color})` }} />
            <text x={pts[i].x} y={pts[i].y + 44} textAnchor="middle" fill="#e2e8f0" fontSize="13" fontFamily="Space Grotesk">{a.name}</text>
            <text x={pts[i].x} y={pts[i].y + 59} textAnchor="middle" fill="#64748b" fontSize="9.5">{a.role.toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

function AgentPanel({ name }: { name: AgentName }) {
  const live = useStore((s) => s.agents[name]);
  const beginner = useStore((s) => s.beginner);
  const set = useStore((s) => s.set);
  const spec = AGENTS.find((a) => a.name === name)!;
  const last = live.last;
  const avgLatency = live.history.length ? live.history.reduce((a, r) => a + r.latency_ms, 0) / live.history.length : 0;
  return (
    <motion.aside initial={{ x: 420, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="glass-strong absolute bottom-4 right-4 top-4 z-10 flex w-[400px] max-w-[calc(100%-32px)] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/[0.06] p-4">
        <span className="h-9 w-9 rounded-full" style={{ background: spec.color, boxShadow: `0 0 18px ${spec.color}` }} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold text-white">{spec.name}</div>
          <div className="label">{spec.role}</div>
        </div>
        <button onClick={() => set({ selectedAgent: null })} data-cursor="Close" className="btn-ghost h-8 w-8 p-0">✕</button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-sm text-slate-300">{spec.blurb}</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-black/25 p-2"><div className="label">Status</div>
            <span className={`chip mt-1 ${STATUS_STYLE[last?.status ?? "skip"]}`}>{(last?.status ?? "idle").toUpperCase()}</span></div>
          <div className="rounded-lg bg-black/25 p-2"><div className="label">Latency</div><div className="num mt-1 text-sm text-white">{last ? `${last.latency_ms} ms` : "—"}</div></div>
          <div className="rounded-lg bg-black/25 p-2"><div className="label">Avg</div><div className="num mt-1 text-sm text-white">{avgLatency ? `${avgLatency.toFixed(1)} ms` : "—"}</div></div>
        </div>
        <div>
          <div className="label mb-1.5">Live reasoning {last?.instrument ? `· ${last.instrument}` : ""}</div>
          <div className="rounded-xl border border-white/[0.07] bg-black/30 p-3 text-[13px] leading-relaxed text-slate-100">
            {last?.summary ?? "Waiting for the next 5M candle close…"}
          </div>
        </div>
        {!beginner && last && (
          <div>
            <div className="label mb-1.5">Outputs (data)</div>
            <pre className="max-h-56 overflow-auto rounded-xl bg-black/40 p-3 font-mono text-[10.5px] leading-snug text-cyan-100/90">
              {JSON.stringify(last.data, null, 2).slice(0, 4000)}
            </pre>
          </div>
        )}
        <div>
          <div className="label mb-1.5">Recent runs</div>
          <ul className="space-y-1">
            {live.history.slice(0, beginner ? 6 : 14).map((r, i) => (
              <li key={`${r.timestamp}-${i}`} className="flex items-center gap-2 text-[11.5px]">
                <span className={`h-1.5 w-1.5 flex-none rounded-full ${r.status === "ok" ? "bg-profit" : r.status === "veto" ? "bg-loss" : r.status === "error" ? "bg-warn" : "bg-slate-600"}`} />
                <span className="num w-14 flex-none text-slate-500">{new Date(r.timestamp * 1000).toLocaleTimeString("en-GB")}</span>
                <span className="truncate text-slate-300">{r.instrument} · {r.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.aside>
  );
}

function Ticker() {
  const ticker = useStore((s) => s.ticker);
  const items: AgentResult[] = useMemo(() => ticker.slice(0, 5), [ticker]);
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 w-[440px] max-w-[calc(100%-32px)] space-y-1.5">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((r) => (
          <motion.div key={`${r.timestamp}-${r.agent}-${r.instrument}`} layout initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11.5px]">
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: AGENTS.find((a) => a.name === r.agent)?.color }} />
            <span className="font-semibold text-white">{r.agent}</span>
            <span className={`chip flex-none py-0 text-[9px] ${STATUS_STYLE[r.status]}`}>{r.status}</span>
            <span className="truncate text-slate-300">{r.summary}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConstellationView() {
  const selected = useStore((s) => s.selectedAgent);
  const force2D = useStore((s) => s.force2D);
  const [weak] = useState(() => weakGpu());
  const use2D = force2D || weak;
  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-white/[0.06]" data-tour="constellation" data-testid="constellation">
      <div className="absolute inset-0">
        {use2D ? (
          <div className="flex h-full items-center justify-center p-6"><Constellation2D /></div>
        ) : (
          <Suspense fallback={<div className="skeleton h-full w-full" />}><ConstellationScene /></Suspense>
        )}
      </div>
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <div className="font-display text-xl font-semibold text-white">Agent Constellation</div>
        <div className="mt-0.5 text-xs text-slate-400">Scout → Cartographer → Hunter → Analyst → Guardian → Executioner → Chronicler · click an orb to inspect {use2D ? "· 2D mode" : "· drag to orbit"}</div>
      </div>
      <Ticker />
      <AnimatePresence>{selected && <AgentPanel key={selected} name={selected} />}</AnimatePresence>
    </div>
  );
}
