import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useStore } from "../store/useStore";
import { LogoMark } from "./Logo";
import { SOCIAL, SUPPORT_SEEN_KEY, openSocial, safeStorage } from "../config/social";

/** "Support the creator" modal: optional, never gates features, never verifies follows. */
export function SupportModal() {
  const open = useStore((s) => s.supportOpen);
  const set = useStore((s) => s.set);
  const [thanks, setThanks] = useState(false);
  const close = () => {
    safeStorage()?.setItem(SUPPORT_SEEN_KEY, "1");
    set({ supportOpen: false });
    window.setTimeout(() => setThanks(false), 400);
    if (!safeStorage()?.getItem("qp_tour_done")) window.setTimeout(() => set({ tourOpen: true }), 450);
  };
  const click = (k: "youtube" | "instagram") => {
    openSocial(k);
    safeStorage()?.setItem(SUPPORT_SEEN_KEY, "1");
    setThanks(true);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="glass-strong w-[440px] max-w-[calc(100vw-32px)] p-7 text-center">
            <div className="mx-auto mb-3 w-fit"><LogoMark size={56} /></div>
            <h2 className="font-display text-2xl font-bold text-white">Support the creator</h2>
            <p className="mt-2 text-sm text-slate-300">
              QUANT PILOT is built by {SOCIAL.creator}. If you find it useful, a subscribe or follow helps more tools like this get made.
              Everything in the app stays free and unlocked either way.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button onClick={() => click("youtube")} data-cursor="Subscribe"
                className="btn rounded-xl border border-red-500/50 bg-red-600/20 py-3 text-red-50 shadow-[0_0_22px_rgba(239,68,68,.45)] hover:bg-red-600/35">
                ▶ {SOCIAL.youtube.label}
              </button>
              <button onClick={() => click("instagram")} data-cursor="Follow"
                className="btn rounded-xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-600 py-3 text-white shadow-[0_0_22px_rgba(217,70,239,.45)]">
                ◎ {SOCIAL.instagram.label}
              </button>
            </div>
            <AnimatePresence>
              {thanks && (
                <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-sm font-medium text-emerald-300">
                  Thanks! Tap Subscribe / Follow in the tab that opened.
                </motion.p>
              )}
            </AnimatePresence>
            <button onClick={close} className="mt-4 text-xs text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline">
              {thanks ? "Continue to the desk" : "Skip for now"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
