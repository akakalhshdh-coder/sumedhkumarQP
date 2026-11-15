import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { Glass } from "../components/Glass";
import { Mt5ExecutionLog, Mt5StatusCard } from "../components/Mt5Panels";
import { api, post } from "../lib/api";
import { dateTime, px, usd } from "../lib/format";
import type { JournalRow, Mt5Position, PaperPosition } from "../lib/types";

const isPaper = (p: PaperPosition | Mt5Position): p is PaperPosition => "entry_price" in p;

function Positions() {
  const positions = useStore((s) => s.positions);
  const execution = useStore((s) => s.execution);
  const close = async (p: PaperPosition | Mt5Position) => {
    if (isPaper(p)) await post(`/api/paper/close/${p.id}`);
    else await post(`/api/mt5/close/${p.ticket}`);
  };
  return (
    <Glass className="p-4" title={`Open positions · ${execution === "mt5" ? "MT5" : "Paper"}`} right={<span className="num text-xs text-slate-400">{positions.length}</span>}>
      {!positions.length && <p className="py-6 text-center text-sm text-slate-500">Flat. Approved signals will animate in here.</p>}
      <div className="mt-2 space-y-2">
        <AnimatePresence initial={false}>
          {positions.map((p) => {
            const paper = isPaper(p);
            const dir = paper ? p.direction : p.type === "BUY" ? "LONG" : "SHORT";
            const pnl = paper ? p.unrealized_pnl + p.realized_pnl : p.profit;
            const key = paper ? p.id : String(p.ticket);
            return (
              <motion.div key={key} layout initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 80 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 p-3">
                <span className={`chip ${dir === "LONG" ? "border-profit/50 text-emerald-300" : "border-loss/50 text-rose-300"}`}>{dir}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-sm font-semibold text-white">
                    {paper ? p.instrument : p.symbol} <span className="num text-xs text-slate-400">{p.volume} lots {paper ? "" : `· #${p.ticket}`}</span>
                    {paper && p.tp1_hit && <span className="chip ml-2 border-profit/40 text-[9px] text-emerald-300">TP1 ✓</span>}
                    {paper && p.breakeven && <span className="chip ml-1 border-cyan-neon/40 text-[9px] text-cyan-200">BE</span>}
                  </div>
                  <div className="num mt-0.5 text-[11px] text-slate-400">
                    @ {px(paper ? p.entry_price : p.price_open)} · SL {px(paper ? p.stop_loss : p.sl)} · TP {paper ? `${px(p.take_profit_1)} / ${px(p.take_profit_2)}` : px(p.tp)}
                  </div>
                </div>
                <div className={`num text-sm font-semibold ${pnl >= 0 ? "text-profit" : "text-loss"}`}>{pnl >= 0 ? "+" : ""}{usd(pnl)}</div>
                <button onClick={() => void close(p)} data-cursor="Close trade" className="btn-danger px-2.5 py-1 text-xs">Close</button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Glass>
  );
}

function SignalFeed() {
  const [rows, setRows] = useState<JournalRow[]>([]);
  const cycles = useStore((s) => s.lastCycle);
  useEffect(() => {
    api<{ decisions: JournalRow[] }>("/api/journal?limit=25").then((d) => setRows(d.decisions)).catch(() => undefined);
  }, [cycles.XAUUSD?.cycle_id, cycles.BTCUSD?.cycle_id]);
  const tone: Record<string, string> = { taken: "border-profit/50 text-emerald-300", vetoed: "border-loss/50 text-rose-300", skipped: "border-warn/50 text-amber-200", error: "border-loss/50 text-rose-300" };
  return (
    <Glass className="flex h-full min-h-0 flex-col p-4" title="Signal feed">
      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {!rows.length && <p className="py-6 text-center text-sm text-slate-500">No signals yet. Sweeps appear here the moment the Hunter finds one.</p>}
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.div key={r.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2 text-[12px]">
              <span className={`chip flex-none ${tone[r.outcome] ?? "border-white/10 text-slate-300"}`}>{r.outcome}</span>
              <div className="min-w-0">
                <div className="text-slate-200"><b>{r.instrument}</b> · <span className="num text-slate-500">{dateTime(r.ts)}</span></div>
                <div className="truncate text-slate-400">{r.summary}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Glass>
  );
}

function Mt5Sync() {
  const pos = useStore((s) => s.mt5Positions);
  const deals = useStore((s) => s.mt5Deals);
  const connected = useStore((s) => s.mt5?.connected);
  if (!connected) return null;
  return (
    <Glass className="p-4" title="MT5 terminal sync (every 2s)" glow="none">
      <div className="mt-2 text-[11.5px] text-slate-400">{pos.length} open position(s) in the terminal · {deals.length} recent deal(s). Manual changes in MT5 show up here.</div>
      <div className="mt-2 max-h-40 overflow-y-auto">
        {deals.slice(0, 12).map((d) => (
          <div key={d.ticket} className="num flex justify-between border-b border-white/[0.04] py-1 text-[11px] text-slate-300">
            <span>#{d.ticket} {d.symbol} {d.type} {d.entry}</span>
            <span>{d.volume} @ {px(d.price)}</span>
            <span className={d.profit >= 0 ? "text-profit" : "text-loss"}>{usd(d.profit)}</span>
            {d.quantpilot && <span className="text-cyan-300">QP</span>}
          </div>
        ))}
      </div>
    </Glass>
  );
}

export function SignalsView() {
  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto pb-2 xl:grid-cols-2">
      <div className="flex min-h-0 flex-col gap-3">
        <Positions />
        <Mt5Sync />
        <div className="min-h-[300px] flex-1"><SignalFeed /></div>
      </div>
      <div className="flex min-h-0 flex-col gap-3">
        <Mt5StatusCard />
        <div className="min-h-[280px] flex-1"><Mt5ExecutionLog /></div>
      </div>
    </div>
  );
}
