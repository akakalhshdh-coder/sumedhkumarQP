import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Wordmark } from "./Logo";
import { Magnetic } from "./Magnetic";
import { SOCIAL, openSocial } from "../config/social";
import { useStore } from "../store/useStore";
import { post } from "../lib/api";

const MODE_STYLE: Record<string, string> = {
  DEMO: "border-cyan-neon/50 text-cyan-200 bg-cyan-500/10",
  PAPER: "border-violet-neon/50 text-violet-200 bg-violet-500/10",
  "MT5 DEMO": "border-profit/60 text-emerald-200 bg-emerald-500/10",
  "MT5 LIVE": "border-loss text-white bg-loss/70 shadow-loss",
};

export function ModePill() {
  const mode = useStore((s) => s.mode);
  return (
    <span data-cursor="Mode" className={`chip font-mono tracking-widest ${MODE_STYLE[mode] ?? MODE_STYLE.DEMO}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${mode === "MT5 LIVE" ? "bg-white animate-pulse" : "bg-current"}`} />
      {mode}
    </span>
  );
}

function fmtHMS(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

/** Live timer chip (kraken mode only): seconds since Dhaka midnight, ticking
 *  every second. Anchored on the API's live_seconds_today and re-anchored on
 *  every state load; the % 86_400 wrap makes the midnight reset automatic
 *  even if the tab stays open across 00:00 Asia/Dhaka. */
export function LiveTimerChip() {
  const liveTimer = useStore((s) => s.liveTimer);
  const dataSource = useStore((s) => s.dataSource);
  const [, setTick] = useState(0);
  const anchorRef = useRef<{ at: number; base: number } | null>(null);
  useEffect(() => {
    if (liveTimer) anchorRef.current = { at: Date.now(), base: liveTimer.live_seconds_today };
  }, [liveTimer]);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (dataSource !== "kraken" || !liveTimer || !anchorRef.current) return null;
  const seconds = (anchorRef.current.base + (Date.now() - anchorRef.current.at) / 1000) % 86400;
  return (
    <span data-cursor="Live timer" className="chip font-mono tracking-widest border-profit/60 text-emerald-200 bg-emerald-500/10">
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      LIVE TODAY {fmtHMS(seconds)}
    </span>
  );
}

/** Session badge with a day/night arc: the sun travels across the UTC day. */
export function SessionBadge() {
  const s = useStore((st) => st.session);
  if (!s) return <div className="skeleton h-9 w-40 rounded-xl" />;
  const p = s.day_progress;
  const ang = Math.PI * (1 - p);
  const cx = 22 + Math.cos(ang) * 18;
  const cy = 22 - Math.sin(ang) * 14;
  const night = p < 0.25 || p > 0.875;
  const color = s.session === "LONDON" ? "#22d3ee" : s.session === "NEW_YORK" ? "#8b5cf6" : s.session === "ASIAN" ? "#f59e0b" : "#64748b";
  return (
    <div data-cursor="Session" className="glass flex items-center gap-2 rounded-xl px-2.5 py-1">
      <svg width="44" height="26" viewBox="0 0 44 26" aria-hidden>
        <path d="M4 22 A18 14 0 0 1 40 22" fill="none" stroke="rgba(255,255,255,.15)" strokeDasharray="2 3" />
        <circle cx={cx} cy={cy} r="4" fill={night ? "#c7d2fe" : "#fcd34d"} style={{ filter: `drop-shadow(0 0 4px ${night ? "#a5b4fc" : "#fbbf24"})` }} />
        <line x1="2" x2="42" y1="22.5" y2="22.5" stroke="rgba(255,255,255,.2)" />
      </svg>
      <div className="leading-tight">
        <div className="text-[11px] font-semibold" style={{ color }}>{s.session.replace("_", " ")}</div>
        <div className="num text-[10px] text-slate-400">{s.utc} UTC · {s.ist} IST</div>
      </div>
    </div>
  );
}

export function SocialPills({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Magnetic
        cursor="Subscribe"
        onClick={() => openSocial("youtube")}
        className={`btn rounded-full border border-red-500/50 bg-red-600/15 text-red-100 shadow-[0_0_18px_rgba(239,68,68,.45)] hover:bg-red-600/30 ${small ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-xs"}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9L15.5 12l-5.8 3.1Z" /></svg>
        {SOCIAL.youtube.label}
      </Magnetic>
      <Magnetic
        cursor="Follow"
        onClick={() => openSocial("instagram")}
        className={`btn rounded-full bg-gradient-to-r from-pink-500/80 via-fuchsia-500/80 to-violet-600/80 text-white shadow-[0_0_18px_rgba(217,70,239,.45)] hover:brightness-110 ${small ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-xs"}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
        {SOCIAL.instagram.label}
      </Magnetic>
    </div>
  );
}

export function TopBar() {
  const { beginner, sound, toggle, set, wsConnected, dataSource } = useStore();
  const runScenario = async () => {
    const r = await post<{ ok: boolean; message?: string; instrument?: string }>("/api/demo/scenario", {});
    if (!r.ok) useStore.getState().pushToast({ level: "warning", title: "Scenario", message: r.message ?? "Unavailable" });
    else useStore.getState().set({ instrument: (r.instrument as never) ?? "XAUUSD" });
  };
  return (
    <header className="relative z-40 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-space-900/70 px-4 backdrop-blur-xl">
      <Wordmark compact />
      <div className="ml-2 hidden items-center gap-2 md:flex">
        <ModePill />
        <LiveTimerChip />
        <span title={wsConnected ? "Live stream connected" : "Reconnecting"} className={`h-2 w-2 rounded-full ${wsConnected ? "bg-profit shadow-profit" : "bg-warn animate-pulse"}`} />
      </div>
      <div className="mx-auto hidden lg:block"><SessionBadge /></div>
      <div className="ml-auto flex items-center gap-2">
        <span className="md:hidden"><LiveTimerChip /></span>
        <motion.button
          data-tour="scenario"
          data-cursor="Play"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          disabled={dataSource !== "demo"}
          onClick={runScenario}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          ▶ Run Demo Scenario
        </motion.button>
        <div className="hidden xl:block"><SocialPills small /></div>
        <button onClick={() => toggle("beginner")} data-cursor="Toggle" className="btn-ghost px-2.5 py-1.5 text-xs">
          <span className={beginner ? "text-cyan-200" : "text-slate-500"}>Beginner</span>
          <span className="text-slate-600">/</span>
          <span className={!beginner ? "text-violet-200" : "text-slate-500"}>Pro</span>
        </button>
        <button onClick={() => toggle("sound")} data-cursor={sound ? "Mute" : "Sound"} aria-label="Toggle sound" className="btn-ghost px-2.5 py-1.5 text-xs">
          {sound ? "🔊" : "🔇"}
        </button>
        <button onClick={() => set({ paletteOpen: true })} data-cursor="Search" className="btn-ghost hidden px-2.5 py-1.5 font-mono text-[11px] md:inline-flex">
          Ctrl K
        </button>
      </div>
    </header>
  );
}
