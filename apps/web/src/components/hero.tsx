"use client";

import { motion } from "framer-motion";

export function Hero() {
  return (
    <motion.h1
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="font-display text-4xl font-semibold tracking-tight sm:text-6xl"
    >
      Playful, geometric,
      <br />
      and <span className="text-brand-blue">human</span>.
    </motion.h1>
  );
}
