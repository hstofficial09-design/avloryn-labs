"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogoMark } from "@/components/ui/logo";

/**
 * Brief, tasteful intro. Shows once per browser session so repeat
 * navigation never feels slow.
 */
export function Preloader() {
  const [done, setDone] = useState(true);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("avloryn-intro") === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;

    setDone(false);
    const t = setTimeout(() => {
      setDone(true);
      try {
        sessionStorage.setItem("avloryn-intro", "1");
      } catch {
        /* ignore */
      }
    }, 1300);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex flex-col items-center gap-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-foreground"
            >
              <LogoMark size={40} />
            </motion.div>
            <div className="h-[2px] w-28 overflow-hidden rounded-full bg-muted">
              <motion.span
                className="block h-full bg-foreground"
                initial={{ x: "-100%" }}
                animate={{ x: "0%" }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
