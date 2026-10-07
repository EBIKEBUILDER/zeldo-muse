"use client";

import { useCallback, useEffect } from "react";
import { initAudio, sfx } from "../game/audio";
import { useGameStore } from "../store/gameStore";

/**
 * Stage 4 — title, game-over, and victory screens.
 * Click or Enter starts / retries. Audio unlocks on that first gesture.
 */

function useConfirm(action: () => void, when: boolean) {
  const fire = useCallback(() => {
    if (!when) return;
    initAudio();
    sfx.ui();
    action();
  }, [when, action]);

  useEffect(() => {
    if (!when) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        fire();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [when, fire]);

  return fire;
}

function Shell({
  children,
  onConfirm,
}: {
  children: React.ReactNode;
  onConfirm: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center bg-black/70 select-none"
      onClick={onConfirm}
    >
      {children}
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Overlays() {
  const phase = useGameStore((s) => s.quest.phase);
  const playTime = useGameStore((s) => s.quest.playTime);
  const rupees = useGameStore((s) => s.rupees);
  const startGame = useGameStore((s) => s.startGame);

  const begin = useConfirm(startGame, phase === "title");
  const retry = useConfirm(startGame, phase === "dead");
  const again = useConfirm(startGame, phase === "victory");

  if (phase === "title") {
    return (
      <Shell onConfirm={begin}>
        <h1 className="text-7xl font-black tracking-[0.2em] text-amber-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
          ZELDO
        </h1>
        <p className="mt-3 text-lg text-emerald-100/90">
          A tiny 3D Zeldo-like in your browser
        </p>
        <div className="mt-8 rounded-lg bg-black/50 px-6 py-4 text-sm leading-7 text-white/85">
          <p>
            <span className="font-bold text-white">WASD / arrows</span> — walk
          </p>
          <p>
            <span className="font-bold text-white">Space / J / click</span> — swing sword
          </p>
          <p>
            <span className="font-bold text-white">M</span> — mute
          </p>
          <p className="mt-2 text-amber-200/90">
            Find the dungeon in the Rocks, grab the key,
            <br />
            slay the boss, claim the Sun Shard.
          </p>
        </div>
        <p className="mt-8 animate-pulse text-xl font-bold text-white">
          — press Enter or click to begin —
        </p>
      </Shell>
    );
  }

  if (phase === "dead") {
    return (
      <Shell onConfirm={retry}>
        <h1 className="text-6xl font-black tracking-widest text-red-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.8)]">
          GAME OVER
        </h1>
        <p className="mt-4 text-lg text-white/80">The monsters got you...</p>
        <p className="mt-8 animate-pulse text-xl font-bold text-white">
          — press Enter to try again —
        </p>
      </Shell>
    );
  }

  if (phase === "victory") {
    return (
      <Shell onConfirm={again}>
        <h1 className="text-6xl font-black tracking-widest text-amber-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.6)]">
          VICTORY!
        </h1>
        <p className="mt-4 text-lg text-emerald-100/90">
          You claimed the Sun Shard. The land is safe... for now.
        </p>
        <div className="mt-6 rounded-lg bg-black/50 px-6 py-4 text-center text-white/85">
          <p>
            Time: <span className="font-bold text-white">{formatTime(playTime)}</span>
          </p>
          <p>
            Rupees: <span className="font-bold text-white">{rupees}</span>
          </p>
        </div>
        <p className="mt-8 animate-pulse text-xl font-bold text-white">
          — press Enter to play again —
        </p>
      </Shell>
    );
  }

  return null;
}
