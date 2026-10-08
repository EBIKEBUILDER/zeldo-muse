"use client";

import { useEffect, useRef, useState } from "react";
import { createZeldoEngine } from "../game/engine";
import { useGameStore } from "../store/gameStore";
import { Hud } from "./hud";
import { Minimap } from "./minimap";
import { Overlays } from "./overlays";
import { TouchControls } from "./touch-controls";

function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);
  return touch;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isTouch = useIsTouch();

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
      <Minimap />
      <Hud />
      <Overlays />
      <TouchControls />
      {!isTouch && (
        <div className="pointer-events-none absolute bottom-4 left-4 select-none">
          <h1 className="text-lg font-bold tracking-widest text-white/90 drop-shadow">
            ZELDO
          </h1>
          <p className="mt-1 text-xs text-white/60">
            WASD / arrows to walk · Space / click to swing · M to mute
          </p>
        </div>
      )}
    </main>
  );
}
