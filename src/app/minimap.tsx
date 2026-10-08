"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import {
  WorldDef,
  isSolid,
  tileAtWorld,
  worldById,
} from "../world/tiles";

/**
 * RPG-style minimap: a top-down tile view of the current world drawn on
 * a canvas at ~4px per tile. Player = gold, enemies = red, boss =
 * magenta, doorway = cyan. Drawn in a rAF loop reading the store
 * directly (no React subscriptions), so it never triggers re-renders.
 */

const PX = 4;

const COLORS: Record<string, string> = {
  walk: "#1d2b1f", // grass / floor
  path: "#2a3324", // path tiles
  solid: "#0d130e", // walls, water, trees
  door: "#4fd8ff",
};

function tileColor(w: WorldDef, tx: number, tz: number, gateOpen: boolean): string {
  const t = tileAtWorld(w, tx, tz);
  if (t === null) return COLORS.solid;
  if (t === "D") return COLORS.door;
  if (isSolid(t, gateOpen)) return COLORS.solid;
  if (t === "," || t === "=") return COLORS.path;
  return COLORS.walk;
}

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phase = useGameStore((s) => s.quest.phase);
  const worldId = useGameStore((s) => s.player.world);
  const areaName = useGameStore((s) => {
    const w = worldById(s.player.world);
    return w.names[s.screen.y][s.screen.x];
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    // Cache the static tile layer; rebuild when world or gate changes.
    let cacheKey = "";
    const cache = document.createElement("canvas");

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const st = useGameStore.getState();
      if (st.quest.phase !== "playing") return;
      const w = worldById(st.player.world);
      const cols = w.sx * 16;
      const rows = w.sz * 12;
      const key = `${w.id}:${st.quest.gateOpen}`;
      if (key !== cacheKey) {
        cacheKey = key;
        cache.width = cols * PX;
        cache.height = rows * PX;
        const cctx = cache.getContext("2d");
        if (cctx) {
          for (let tx = 0; tx < cols; tx++) {
            for (let tz = 0; tz < rows; tz++) {
              cctx.fillStyle = tileColor(w, tx, tz, st.quest.gateOpen);
              cctx.fillRect(tx * PX, tz * PX, PX, PX);
            }
          }
        }
        canvas.width = cols * PX;
        canvas.height = rows * PX;
      }
      ctx.drawImage(cache, 0, 0);

      const px = ((st.player.x - w.originX) / 2) * PX;
      const pz = ((st.player.z - w.originZ) / 2) * PX;

      // Enemies.
      for (const e of st.enemies) {
        if (e.dead || e.world !== st.player.world) continue;
        const ex = ((e.x - w.originX) / 2) * PX;
        const ez = ((e.z - w.originZ) / 2) * PX;
        ctx.fillStyle = e.boss ? "#e040fb" : "#ff5252";
        ctx.beginPath();
        ctx.arc(ex, ez, e.boss ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player (gold dot + white ring).
      ctx.fillStyle = "#ffd54a";
      ctx.beginPath();
      ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, pz, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (phase !== "playing") return null;

  return (
    <div className="pointer-events-none absolute left-4 top-4 select-none">
      <div className="rounded-lg border-2 border-amber-200/40 bg-black/55 p-1.5 shadow-lg backdrop-blur-[2px]">
        <canvas ref={canvasRef} className="block rounded" />
      </div>
      <div className="mt-1 text-center text-[11px] font-bold tracking-widest text-amber-100/90 drop-shadow">
        {areaName.toUpperCase()}
      </div>
    </div>
  );
}
