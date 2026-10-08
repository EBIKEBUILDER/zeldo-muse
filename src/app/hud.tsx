"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore";

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

/** Current quest objective, in plain words. */
function objective(
  worldId: string,
  hasKey: boolean,
  gateOpen: boolean,
  bossAlive: boolean,
): string {
  if (bossAlive === false) return "Claim the treasure chest!";
  if (worldId === "dungeon") {
    if (!hasKey) return "Find the Dungeon Key";
    if (!gateOpen) return "Unlock the boss gate";
    return "Slay the boss, claim the Sun Shard";
  }
  return "Find the dungeon entrance";
}

/** Fullscreen toggle for mobile — hides the browser chrome while playing. */
function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    setTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!touch) return null;

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      className="pointer-events-auto mt-2 flex h-10 w-10 items-center justify-center rounded-lg border-2 border-amber-200/40 bg-black/55 text-amber-100 shadow-lg backdrop-blur-[2px] active:bg-black/75"
    >
      {isFullscreen ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
        </svg>
      )}
    </button>
  );
}

export function Hud() {
  const hp = useGameStore((s) => s.player.hp);
  const maxHp = useGameStore((s) => s.player.maxHp);
  const rupees = useGameStore((s) => s.rupees);
  const screen = useGameStore((s) => s.screen);
  const worldId = useGameStore((s) => s.player.world);
  const hasKey = useGameStore((s) => s.quest.hasKey);
  const gateOpen = useGameStore((s) => s.quest.gateOpen);
  const message = useGameStore((s) => s.quest.message);
  const messageT = useGameStore((s) => s.quest.messageT);
  const phase = useGameStore((s) => s.quest.phase);
  const hurtFlashT = useGameStore((s) => s.quest.hurtFlashT);
  const boss = useGameStore((s) =>
    s.enemies.find((e) => e.boss && !e.dead && e.world === s.player.world),
  );
  const bossDead = useGameStore((s) =>
    s.enemies.some((e) => e.boss && e.dead),
  );

  const hearts = [];
  for (let i = 0; i < maxHp / 2; i++) {
    hearts.push(<Heart key={i} fill={Math.min(2, Math.max(0, hp - i * 2))} />);
  }

  if (phase !== "playing") return null;

  return (
    <>
      {hurtFlashT > 0 && (
        <div
          className="pointer-events-none absolute inset-0 select-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 52%, rgba(220, 30, 30, ${Math.min(0.55, hurtFlashT * 1.8)}) 100%)`,
          }}
        />
      )}
      <div className="pointer-events-none absolute right-4 top-4 flex select-none flex-col items-end gap-2">
        {/* RPG status panel */}
        <div className="rounded-lg border-2 border-amber-200/40 bg-black/55 px-3 py-2 shadow-lg backdrop-blur-[2px]">
          <div className="flex gap-1">{hearts}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="inline-block h-4 w-4 rotate-45 bg-green-400 shadow" />
            <span className="text-lg font-bold text-white drop-shadow">× {rupees}</span>
          </div>
          {hasKey && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <KeyIcon />
              <span className="text-xs font-bold text-amber-200">Dungeon Key</span>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <FullscreenButton />
        </div>
      </div>

      {/* Quest objective */}
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 select-none max-sm:left-4 max-sm:top-40 max-sm:translate-x-0">
        <div className="flex items-center gap-2 rounded-lg border border-amber-200/30 bg-black/55 px-3 py-1.5 shadow-lg backdrop-blur-[2px]">
          <span className="text-amber-300">◆</span>
          <span className="text-xs font-bold tracking-wide text-amber-100">
            {objective(worldId, hasKey, gateOpen, !bossDead)}
          </span>
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
