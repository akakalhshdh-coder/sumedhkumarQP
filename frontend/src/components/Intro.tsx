import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { useStore } from "../store/useStore";
import { SOCIAL, SUPPORT_SEEN_KEY, safeStorage } from "../config/social";
import { prefersReducedMotion, weakGpu } from "../lib/format";
import { Magnetic } from "./Magnetic";

const IntroScene = lazy(() => import("../scenes/IntroScene"));

/** Cinematic intro: 3D starfield, the logo assembles itself, "Launch Desk" warps into the dashboard. */
export function Intro() {
  const set = useStore((s) => s.set);
  const warp = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [use3D] = useState(() => !weakGpu() && !useStore.getState().force2D);
  const reduce = prefersReducedMotion();

  useEffect(() => {
    if (!root.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(".qp-ring", { scale: 0, rotate: -180, opacity: 0, transformOrigin: "50% 50%", duration: 1.4, stagger: 0.18 })
        .from(".qp-core", { scale: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.9 }, "-=1.0")
        .from(".qp-sat", { opacity: 0, scale: 0, transformOrigin: "50% 50%", duration: 0.6, stagger: 0.1 }, "-=0.5")
        .from(".qp-letter", { y: 40, opacity: 0, rotateX: -90, duration: 0.9, stagger: 0.045 }, "-=0.6")
        .from(".qp-sub", { opacity: 0, y: 12, duration: 0.8 }, "-=0.4")
        .from(".qp-cta", { opacity: 0, y: 20, scale: 0.9, duration: 0.8 }, "-=0.4");
      if (reduce) tl.progress(1);
    }, root);
    return () => ctx.revert();
  }, [reduce]);

  const launch = () => {
    if (leaving) return;
    setLeaving(true);
    gsap.to(warp, { current: 1, duration: reduce ? 0.1 : 1.3, ease: "power3.in" });
    gsap.to(".qp-intro-ui", { scale: 1.6, opacity: 0, filter: "blur(10px)", duration: reduce ? 0.1 : 1.0, ease: "power3.in" });
    window.setTimeout(() => {
      set({ introDone: true, supportOpen: !safeStorage()?.getItem(SUPPORT_SEEN_KEY) });
      if (safeStorage()?.getItem(SUPPORT_SEEN_KEY) && !safeStorage()?.getItem("qp_tour_done")) {
        window.setTimeout(() => set({ tourOpen: true }), 700);
      }
    }, reduce ? 150 : 1500);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && launch();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const word = "QUANT PILOT".split("");
  return (
    <div ref={root} className="fixed inset-0 z-[100] overflow-hidden bg-space-950" data-testid="intro">
      <div className="absolute inset-0">
        {use3D ? (
          <Suspense fallback={null}><IntroScene warp={warp} /></Suspense>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,.25),transparent_60%)]" />
        )}
      </div>
      <div className="qp-intro-ui relative flex h-full flex-col items-center justify-center" style={{ perspective: 800 }}>
        <svg width="150" height="150" viewBox="0 0 64 64" className="mb-6 drop-shadow-[0_0_30px_rgba(34,211,238,.6)]">
          <defs>
            <linearGradient id="ig" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
            <radialGradient id="ic"><stop offset="0" stopColor="#fff" /><stop offset=".45" stopColor="#22d3ee" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></radialGradient>
          </defs>
          <circle className="qp-core" cx="32" cy="32" r="14" fill="url(#ic)" />
          {[0, 60, 120].map((r, i) => (
            <g key={r} transform={`rotate(${r} 32 32)`}>
              <g style={{ transformOrigin: "32px 32px", transformBox: "view-box", animation: `qp-spin ${8 + i * 3}s linear infinite` }}>
                <ellipse className="qp-ring" cx="32" cy="32" rx="28" ry="10.5" fill="none" stroke="url(#ig)" strokeWidth="1.6" />
                <circle className="qp-sat" cx="60" cy="32" r="2.2" fill={i === 1 ? "#10b981" : "#22d3ee"} />
              </g>
            </g>
          ))}
        </svg>
        <h1 className="flex font-display text-5xl font-bold tracking-[0.28em] md:text-7xl" style={{ transformStyle: "preserve-3d" }}>
          {word.map((ch, i) => (
            <span key={i} className="qp-letter grad-text inline-block" style={{ minWidth: ch === " " ? "0.6em" : undefined }}>{ch}</span>
          ))}
        </h1>
        <p className="qp-sub mt-4 text-sm tracking-[0.3em] text-slate-300 md:text-base">
          BY {SOCIAL.creator.toUpperCase()} · {SOCIAL.brand}
        </p>
        <p className="qp-sub mt-2 max-w-md text-center text-xs text-slate-500">
          Seven AI agents hunting liquidity sweeps on XAUUSD &amp; BTCUSD. Paper trading by default.
        </p>
        <div className="qp-cta mt-10">
          <Magnetic onClick={launch} cursor="Launch" className="btn-primary rounded-2xl px-9 py-4 text-base tracking-wider" data-testid="launch">
            Launch Desk →
          </Magnetic>
        </div>
        <button onClick={launch} className="qp-cta mt-4 text-[11px] uppercase tracking-widest text-slate-500 hover:text-slate-300">press enter</button>
      </div>
      <AnimatePresence>
        {leaving && (
          <motion.div className="pointer-events-none absolute inset-0 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.9, 0] }}
            transition={{ duration: 1.5, times: [0, 0.6, 0.85, 1] }} />
        )}
      </AnimatePresence>
      <div className="absolute inset-x-0 bottom-3 text-center text-[11px] text-amber-200/70">
        Educational use only. Not financial advice. Trading involves risk of loss.
      </div>
    </div>
  );
}
