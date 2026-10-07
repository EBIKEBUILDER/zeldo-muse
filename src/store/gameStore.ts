import { create } from "zustand";
import { SPAWN } from "../world/tiles";

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
 *  - UI lane (screen, hearts, rupees — hearts/rupees arrive in stage 3+):
 *    React subscribes with selectors; these change rarely, so
 *    re-renders stay cheap.
 */

export interface PlayerState {
  x: number;
  z: number;
  /** Y rotation in radians. 0 faces "up-screen" (-z). */
  facing: number;
}

export interface ScreenState {
  x: number;
  y: number;
}

interface GameState {
  player: PlayerState;
  /** Which overworld screen the player is on (for future per-screen systems). */
  screen: ScreenState;
  setPlayerPosition: (x: number, z: number) => void;
  setPlayerFacing: (facing: number) => void;
  setScreen: (x: number, y: number) => void;
  reset: () => void;
}

const INITIAL_PLAYER: PlayerState = { x: SPAWN.x, z: SPAWN.z, facing: 0 };
const INITIAL_SCREEN: ScreenState = { x: 0, y: 0 };

export const useGameStore = create<GameState>()((set) => ({
  player: INITIAL_PLAYER,
  screen: INITIAL_SCREEN,

  setPlayerPosition: (x, z) =>
    set((s) => ({ player: { ...s.player, x, z } })),

  setPlayerFacing: (facing) =>
    set((s) => ({ player: { ...s.player, facing } })),

  setScreen: (x, y) => set({ screen: { x, y } }),

  reset: () => set({ player: INITIAL_PLAYER, screen: INITIAL_SCREEN }),
}));
