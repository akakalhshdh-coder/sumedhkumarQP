import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { Glass } from "./Glass";
import { post } from "../lib/api";
import { loadMt5Log } from "../lib/live";
import { dateTime, px, usd } from "../lib/format";

/** MT5 status: connection light, account, balance/equity, server, ping, and every failing check with its fix. */
export function Mt5StatusCard({ showActions = true }: { showActions?: boolean }) {
  const mt5 = useStore((s) => s.mt5);
  const [busy, setBusy] = useState<string | null>(null);
  const acc = mt5?.account;
  const ready = !!mt5?.connected && !(mt5?.issues ?? []).some((i) => ["algo", "account_trade", "terminal", "account_mismatch"].includes(i.code));
  const light = !mt5?.available ? "bg-slate-500" : ready ? "bg-profit shadow-profit" : mt5?.connected ? "bg-warn" : "bg-loss shadow-loss";
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } catch { /* toast already shown */ } finally { setBusy(null); }
  };
  return (
    <Glass className="p-4" title="MetaTrader 5" right={
      <span className="flex items-center gap-2 text-[11px] text-slate-300">
        <span className={`h-2.5 w-2.5 rounded-full ${light}`} />
        {!mt5?.available ? "Unavailable" : ready ? "Ready" : mt5?.connected ? "Needs attention" : "Disconnected"}
      </span>}>
      {acc ? (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          <div className="text-slate-400">Account</div><div className="num text-right text-slate-100">{acc.login}</div>
          <div className="text-slate-400">Name</div><div className="truncate text-right text-slate-100">{acc.name}</div>
          <div className="text-slate-400">Server</div><div className="truncate text-right text-slate-100">{acc.server}</div>
          <div className="text-slate-400">Type</div>
          <div className={`text-right font-semibold ${acc.trade_mode === "DEMO" ? "text-emerald-300" : "text-rose-300"}`}>{acc.trade_mode}</div>
          <div className="text-slate-400">Balance</div><div className="num text-right text-slate-100">{usd(acc.balance)}</div>
          <div className="text-slate-400">Equity</div><div className="num text-right text-slate-100">{usd(acc.equity)}</div>
          <div className="text-slate-400">Ping</div><div className="num text-right text-slate-100">{mt5?.ping_ms ?? "—"} ms</div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">{mt5?.available ? "No account information yet." : "MT5 bridge unavailable on this machine."}</p>
      )}
      {!!mt5?.issues?.length && (
        <ul className="mt-3 space-y-2">
          {mt5.issues.map((i) => (
            <li key={i.code} className="rounded-lg border border-warn/30 bg-warn/[0.07] p-2.5 text-[12px]">
              <div className="font-semibold text-amber-200">{i.message}</div>
              <div className="mt-0.5 text-slate-300"><span className="text-amber-300">Fix:</span> {i.fix}</div>
            </li>
          ))}
        </ul>
      )}
      {showActions && mt5?.available && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={!!busy} onClick={() => run("rc", () => post("/api/mt5/reconnect"))}>
            {busy === "rc" ? "Reconnecting…" : "↻ Reconnect"}
          </button>
          <button className="btn-ghost px-3 py-1.5 text-xs" data-cursor="Test" disabled={!ready || !!busy || acc?.trade_mode !== "DEMO"}
            title={acc?.trade_mode !== "DEMO" ? "Test orders are DEMO-only" : "Places the minimum lot, then closes it"}
            onClick={() => run("test", () => post("/api/mt5/test-order", { instrument: "XAUUSD" }))}>
            {busy === "test" ? "Placing & closing…" : "Send test order (min lot)"}
          </button>
        </div>
      )}
    </Glass>
  );
}

const KIND_STYLE: Record<string, string> = {
  order_filled: "text-emerald-300", test_open: "text-emerald-300", close: "text-cyan-200", modify: "text-violet-200",
  order_failed: "text-rose-300", rejected: "text-rose-300", refused: "text-rose-300", test_failed: "text-rose-300",
  close_failed: "text-rose-300", modify_failed: "text-rose-300",
};

/** Every MT5 request with retcode, ticket and fill price. */
export function Mt5ExecutionLog() {
  const log = useStore((s) => s.mt5Log);
  useEffect(() => { loadMt5Log().catch(() => undefined); }, []);
  return (
    <Glass className="flex h-full min-h-0 flex-col p-4" title="MT5 execution log" glow="none">
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {!log.length && <p className="py-6 text-center text-sm text-slate-500">No MT5 requests yet. Orders, closes and SL moves appear here live.</p>}
        <table className="w-full text-[11.5px]">
          <tbody>
            <AnimatePresence initial={false}>
              {log.map((r, i) => (
                <motion.tr key={`${r.ts}-${i}`} initial={{ opacity: 0, backgroundColor: "rgba(34,211,238,.15)" }} animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }}
                  className="border-b border-white/[0.04] align-top">
                  <td className="num whitespace-nowrap py-1.5 pr-2 text-slate-500">{dateTime(r.ts)}</td>
                  <td className={`py-1.5 pr-2 font-semibold ${KIND_STYLE[r.kind] ?? "text-slate-300"}`}>{r.kind}</td>
                  <td className="py-1.5 pr-2 text-slate-300">{r.symbol}</td>
                  <td className="num py-1.5 pr-2 text-slate-400">{r.retcode ?? "—"}</td>
                  <td className="num py-1.5 pr-2 text-slate-300">{r.ticket ? `#${r.ticket}` : "—"}</td>
                  <td className="num py-1.5 pr-2 text-slate-300">{r.price ? px(r.price) : "—"}</td>
                  <td className="py-1.5 text-slate-400">{r.message}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </Glass>
  );
}
