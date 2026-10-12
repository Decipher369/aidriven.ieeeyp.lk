"use client";
import { useEffect } from "react";
import gsap from "gsap";
import styles from "./Summit.module.scss";

// Fixed seeds keep the sky stable across renders and scene transitions.
function starMap(count, seed, near) {
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = Array.from({ length: count }, () => {
    const x = random() * 1600,
      y = random() * 1000;
    const radius = near ? 0.7 + random() * 0.65 : 0.35 + random() * 0.5;
    const opacity = 0.25 + random() * 0.6;
    const color = random() > 0.94 ? "#e3c27c" : "#fcf9e7";
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`;
  }).join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">${stars}</svg>`)}")`;
}
const farMap = starMap(210, 2026, false);
const nearMap = starMap(85, 831, true);

export default function Starfield({ root, motion, reduced }) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    element.style.setProperty("--stars-far", farMap);
    element.style.setProperty("--stars-near", nearMap);
    let x = 0,
      y = 0;
    const paint = () => {
      element.style.setProperty("--stars-x", `${x.toFixed(2)}px`);
      element.style.setProperty("--stars-y", `${y.toFixed(2)}px`);
      element.style.setProperty("--stars-near-x", `${(x * 2.4).toFixed(2)}px`);
      element.style.setProperty("--stars-near-y", `${(y * 2.4).toFixed(2)}px`);
    };
    paint();
    const update = (_, delta) => {
      if (document.hidden) return;
      const pointer = motion.current.pointer;
      const targetX = pointer.active ? (pointer.x - 0.5) * -28 : 0;
      const targetY = pointer.active ? (pointer.y - 0.5) * -22 : 0;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) < 0.02) return;
      const ease = 1 - Math.exp(-Math.min(delta, 64) * 0.006);
      x += (targetX - x) * ease;
      y += (targetY - y) * ease;
      paint();
    };
    if (!reduced) gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
  }, [root, motion, reduced]);
  return <div className={styles.starfield} aria-hidden="true" />;
}
