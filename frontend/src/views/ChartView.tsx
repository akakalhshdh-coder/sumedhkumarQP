import { useEffect, useRef } from "react";
import { createChart, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time } from "lightweight-charts";
import { useStore } from "../store/useStore";
import { loadCandles } from "../lib/live";
import { Glass } from "../components/Glass";
import { SweepVisualizer } from "../components/SweepVisualizer";
import type { Instrument } from "../lib/types";
import { px } from "../lib/format";

export function InstrumentTabs() {
  const instrument = useStore((s) => s.instrument);
  const set = useStore((s) => s.set);
  const last = useStore((s) => s.candles);
  return (
    <div className="flex gap-1.5 rounded-xl border border-white/[0.07] bg-black/20 p-1">
      {(["XAUUSD", "BTCUSD"] as Instrument[]).map((i) => {
        const c = last[i]?.[last[i]!.length - 1];
        return (
          <button key={i} onClick={() => set({ instrument: i })} data-cursor="Switch"
            className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${instrument === i ? "bg-cyan-500/15 text-white shadow-glow" : "text-slate-400 hover:text-slate-200"}`}>
            <div className="font-display font-semibold">{i}</div>
            <div className="num text-[10.5px] opacity-80">{c ? px(c.close, i) : "…"}</div>
          </button>
        );
      })}
    </div>
  );
}

function LiveChart() {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const timers = useRef<number[]>([]);
  const instrument = useStore((s) => s.instrument);
  const candles = useStore((s) => s.candles[s.instrument]);
  const cycle = useStore((s) => s.lastCycle[s.instrument]);
  const fitted = useRef<string>("");

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: "#ffffff" }, textColor: "#334155", fontFamily: "JetBrains Mono", fontSize: 11 },
      grid: { vertLines: { color: "rgba(15,23,42,.07)" }, horzLines: { color: "rgba(15,23,42,.07)" } },
      rightPriceScale: { borderColor: "rgba(15,23,42,.2)" },
      timeScale: { borderColor: "rgba(15,23,42,.2)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "rgba(8,145,178,.6)" }, horzLine: { color: "rgba(8,145,178,.6)" } },
    });
    series.current = c.addCandlestickSeries({
      upColor: "#10b981", downColor: "#f43f5e", wickUpColor: "#10b981", wickDownColor: "#f43f5e", borderVisible: false,
    });
    chart.current = c;
    return () => {
      timers.current.forEach(clearTimeout);
      c.remove();
      chart.current = null;
      series.current = null;
      lines.current = [];
    };
  }, []);

  useEffect(() => {
    loadCandles(instrument).catch(() => undefined);
    fitted.current = "";
  }, [instrument]);

  useEffect(() => {
    if (!series.current || !candles?.length) return;
    series.current.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    if (fitted.current !== instrument) {
      chart.current?.timeScale().setVisibleLogicalRange({ from: candles.length - 140, to: candles.length + 8 });
      fitted.current = instrument;
    }
  }, [candles, instrument]);

  // levels + live setup ladder; the ladder slides in step by step like the visualizer
  useEffect(() => {
    const s = series.current;
    if (!s || !cycle) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    lines.current = [];
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cycle.levels.slice(-14).forEach((lv) => {
      lines.current.push(s.createPriceLine({ price: lv.price, color: lv.side === "high" ? "rgba(8,145,178,.8)" : "rgba(124,58,237,.8)",
        lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: lv.name }));
    });
    const st = cycle.setup;
    const markers: SeriesMarker<Time>[] = [];
    if (st && candles?.some((c) => c.time === st.confirm_time)) {
      markers.push({ time: st.sweep_time as UTCTimestamp, position: st.direction === "SHORT" ? "aboveBar" : "belowBar", color: "#f472b6", shape: "circle", text: "SWEEP" });
      markers.push({ time: st.confirm_time as UTCTimestamp, position: st.direction === "SHORT" ? "aboveBar" : "belowBar", color: "#fbbf24",
        shape: st.direction === "SHORT" ? "arrowDown" : "arrowUp", text: `${st.direction} ${cycle.outcome === "taken" ? "✓" : cycle.outcome}` });
      const ladder = [
        { price: st.entry_price, color: "#0891b2", title: "ENTRY", style: LineStyle.Solid },
        { price: st.stop_loss, color: "#f43f5e", title: "SL", style: LineStyle.Dashed },
        { price: st.take_profit_1, color: "#10b981", title: "TP1", style: LineStyle.Dashed },
        { price: st.take_profit_2, color: "#059669", title: "TP2", style: LineStyle.Dashed },
      ];
      ladder.forEach((l, i) => {
        timers.current.push(window.setTimeout(() => {
          if (!series.current) return;
          lines.current.push(series.current.createPriceLine({ price: l.price, color: l.color, lineWidth: 2, lineStyle: l.style, axisLabelVisible: true, title: l.title }));
        }, 350 * (i + 1)));
      });
    }
    s.setMarkers(markers);
  }, [cycle, candles?.length]);

  return <div ref={el} className="h-full w-full" data-testid="live-chart" />;
}

export function ChartView() {
  const cycle = useStore((s) => s.lastCycle[s.instrument]);
  const candles = useStore((s) => s.candles[s.instrument]);
  const dataSource = useStore((s) => s.dataSource);
  return (
    <div className="flex h-full flex-col gap-3">
      <Glass className="flex min-h-[500px] flex-[1.6] flex-col p-3" glow="none">
        <div className="mb-2 flex items-center gap-3">
          <InstrumentTabs />
          <div className="text-xs text-slate-400">5M · {dataSource === "mt5" ? "MT5 live data" : dataSource === "kraken" ? "Kraken live data" : "synthetic replay with planted sweeps"} · dotted lines are mapped liquidity pools</div>
        </div>
        <div className="min-h-0 flex-1"><LiveChart /></div>
      </Glass>
      <SweepVisualizer setup={cycle?.setup} candles={candles} height={180} />
    </div>
  );
}
