"use client";

import { useEffect, useRef } from "react";
import { createZeldoEngine } from "../game/engine";
import { useGameStore } from "../store/gameStore";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zeldo = createZeldoEngine(canvas);
    // Debug handle for automated verification (screenshots, scripted walks).
    (window as unknown as { __ZELDO__: unknown }).__ZELDO__ = {
      store: useGameStore,
    };
    return () => zeldo.dispose();
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full outline-none" />
      <div className="pointer-events-none absolute left-4 top-4 select-none">
        <h1 className="text-2xl font-bold tracking-widest text-white/90 drop-shadow">
          ZELDO
        </h1>
        <p className="text-xs text-white/60">stage 2 — world</p>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 select-none">
        <p className="text-xs text-white/60">WASD / arrows to walk</p>
      </div>
    </main>
  );
}
