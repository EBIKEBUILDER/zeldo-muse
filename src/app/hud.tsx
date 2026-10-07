"use client";

import { useGameStore } from "../store/gameStore";
import { SCREEN_NAMES } from "../world/tiles";

/**
 * Stage 3 — HUD. Subscribes only to slow-changing UI state
 * (hp, rupees, screen) — never to per-frame positions.
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

export function Hud() {
  const hp = useGameStore((s) => s.player.hp);
  const maxHp = useGameStore((s) => s.player.maxHp);
  const rupees = useGameStore((s) => s.rupees);
  const screen = useGameStore((s) => s.screen);

  const hearts = [];
  for (let i = 0; i < maxHp / 2; i++) {
    hearts.push(<Heart key={i} fill={Math.min(2, Math.max(0, hp - i * 2))} />);
  }

  return (
    <div className="pointer-events-none absolute right-4 top-4 flex select-none flex-col items-end gap-2">
      <div className="flex gap-1">{hearts}</div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-4 w-4 rotate-45 bg-green-400 shadow" />
        <span className="text-lg font-bold text-white drop-shadow">× {rupees}</span>
      </div>
      <div className="text-xs text-white/60">
        {SCREEN_NAMES[screen.y][screen.x]}
      </div>
    </div>
  );
}
