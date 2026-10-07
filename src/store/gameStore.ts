import { create } from "zustand";

/**
 * Zeldo game state — the single source of truth for the simulation.
 *
 * Everything in here is plain serializable data (no Babylon objects).
 * Babylon is a *view* over this state: the render loop reads it via
 * `useGameStore.getState()` every frame and moves meshes to match.
 *
 * Two lanes:
 *  - Hot lane (positions, facing): read directly in the render loop.
 *    Never subscribe a React component to these at 60fps.
 *  - UI lane (hearts, rupees, screen — coming in later stages):
 *    React subscribes with selectors; these change rarely, so
 *    re-renders stay cheap.
 */

export interface PlayerState {
  x: number;
  z: number;
  /** Y rotation in radians. 0 faces "up-screen" (-z). */
  facing: number;
}

interface GameState {
  player: PlayerState;
  setPlayerPosition: (x: number, z: number) => void;
  setPlayerFacing: (facing: number) => void;
  reset: () => void;
}

const INITIAL_PLAYER: PlayerState = { x: 0, z: 0, facing: 0 };

export const useGameStore = create<GameState>()((set) => ({
  player: INITIAL_PLAYER,

  setPlayerPosition: (x, z) =>
    set((s) => ({ player: { ...s.player, x, z } })),

  setPlayerFacing: (facing) =>
    set((s) => ({ player: { ...s.player, facing } })),

  reset: () => set({ player: INITIAL_PLAYER }),
}));
