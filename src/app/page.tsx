"use client";

import { useEffect, useRef } from "react";
import { createZeldoEngine } from "../game/engine";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zeldo = createZeldoEngine(canvas);
    return () => zeldo.dispose();
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full outline-none" />
      <div className="pointer-events-none absolute left-4 top-4 select-none">
        <h1 className="text-2xl font-bold tracking-widest text-white/90 drop-shadow">
          ZELDO
        </h1>
        <p className="text-xs text-white/60">stage 1 — engine boot</p>
      </div>
    </main>
  );
}
