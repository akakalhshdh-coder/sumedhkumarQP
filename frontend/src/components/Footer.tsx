import { LogoMark } from "./Logo";
import { SOCIAL, openSocial } from "../config/social";

/** Footer on every screen: disclaimer, brand and social row. */
export function Footer() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 flex h-8 items-center gap-3 border-t border-white/[0.06] bg-space-950/85 px-4 text-[11px] text-slate-400 backdrop-blur-xl">
      <LogoMark size={16} spin={false} />
      <span className="font-display font-semibold tracking-widest grad-text">QUANT PILOT</span>
      <span className="hidden sm:inline">by {SOCIAL.creator} · {SOCIAL.brand}</span>
      <span className="mx-auto font-medium text-amber-200/90">Educational use only. Not financial advice. Trading involves risk of loss.</span>
      <button data-cursor="Subscribe" onClick={() => openSocial("youtube")} className="hidden text-red-300 hover:text-red-200 md:inline">YouTube</button>
      <button data-cursor="Follow" onClick={() => openSocial("instagram")} className="hidden text-pink-300 hover:text-pink-200 md:inline">Instagram</button>
    </footer>
  );
}
