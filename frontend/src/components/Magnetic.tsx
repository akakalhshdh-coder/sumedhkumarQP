import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { useRef, type ReactNode, type ButtonHTMLAttributes } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> & {
  children: ReactNode;
  cursor?: string;
  strength?: number;
};

/** Button that springs toward the pointer (magnetic micro-interaction). */
export function Magnetic({ children, cursor, strength = 0.28, className = "", ...rest }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 16 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 16 });
  return (
    <motion.button
      ref={ref}
      data-cursor={cursor}
      style={{ x, y }}
      whileTap={{ scale: 0.95 }}
      onMouseMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
