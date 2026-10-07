"use client";

import { useGameStore } from "../store/gameStore";
import { worldById } from "../world/tiles";

/**
 * Stage 4 — HUD. Subscribes only to slow-changing UI state
 * (hp, rupees, screen, quest) — never to per-frame positions.
 */

function HeartSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

/** fill: 0 = empty, 1 = half, 2 = full */
function Heart({ fill }: { fill: number }) {
  return (
    <span className="relative inline-block h-6 w-6">
      <HeartSvg className="absolute inset-0 h-6 w-6 text-black/50" />
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${(Math.min(2, Math.max(0, fill)) / 2) * 100}%` }}
      >
        <HeartSvg className="h-6 w-6 text-red-500" />
      </span>
    </span>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-5 w-5 text-amber-300">
      <circle cx="7" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M10.5 12 H21 M17 12 v5 M20.5 12 v3.5" strokeLinecap="round" />
    </svg>
  );
}

export function Hud() {
  const hp = useGameStore((s) => s.player.hp);
  const maxHp = useGameStore((s) => s.player.maxHp);
  const rupees = useGameStore((s) => s.rupees);
  const screen = useGameStore((s) => s.screen);
  const worldId = useGameStore((s) => s.player.world);
  const hasKey = useGameStore((s) => s.quest.hasKey);
  const message = useGameStore((s) => s.quest.message);
  const messageT = useGameStore((s) => s.quest.messageT);
  const phase = useGameStore((s) => s.quest.phase);
  const boss = useGameStore((s) =>
    s.enemies.find((e) => e.boss && !e.dead && e.world === s.player.world),
  );

  const hearts = [];
  for (let i = 0; i < maxHp / 2; i++) {
    hearts.push(<Heart key={i} fill={Math.min(2, Math.max(0, hp - i * 2))} />);
  }

  if (phase !== "playing") return null;

  return (
    <>
      <div className="pointer-events-none absolute right-4 top-4 flex select-none flex-col items-end gap-2">
        <div className="flex gap-1">{hearts}</div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-4 rotate-45 bg-green-400 shadow" />
          <span className="text-lg font-bold text-white drop-shadow">× {rupees}</span>
        </div>
        {hasKey && (
          <div className="flex items-center gap-1.5 rounded bg-black/40 px-2 py-1">
            <KeyIcon />
            <span className="text-xs font-bold text-amber-200">Dungeon Key</span>
          </div>
        )}
        <div className="text-xs text-white/60">
          {worldById(worldId).names[screen.y][screen.x]}
        </div>
      </div>

      {messageT > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 select-none">
          <div className="rounded-lg bg-black/70 px-4 py-2 text-center text-sm text-amber-100 shadow-lg">
            {message}
          </div>
        </div>
      )}

      {boss && worldId === "dungeon" && screen.x === 1 && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 w-80 -translate-x-1/2 select-none">
          <div className="mb-1 text-center text-xs font-bold tracking-widest text-purple-200">
            DUNGEON BOSS
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-black/60 shadow">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400 transition-all"
              style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
