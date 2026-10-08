"use client";

import { useEffect, useRef, useState } from "react";
import { queueAttack, setVirtualMove } from "../game/input";

/**
 * Mobile controls: a virtual joystick (left) for movement and a big
 * sword button (right) for attacking. Only renders on touch devices.
 *
 * The joystick reports a world-space move vector. Screen-right is -x in
 * world space (the camera looks north with +x rendering as screen-left),
 * so the x axis is negated; screen-down is +z.
 */

const STICK_R = 56; // joystick base radius, px
const KNOB_R = 24;

function isTouchDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  );
}

function Joystick() {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const touchId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const setFromEvent = (clientX: number, clientY: number) => {
    let dx = clientX - origin.current.x;
    let dy = clientY - origin.current.y;
    const d = Math.hypot(dx, dy);
    const max = STICK_R;
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    setKnob({ x: dx, y: dy });
    // Dead zone so a resting thumb doesn't drift.
    const mag = Math.hypot(dx, dy) / max;
    if (mag < 0.18) {
      setVirtualMove(0, 0);
    } else {
      setVirtualMove(-dx / max, dy / max);
    }
  };

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchId.current = t.identifier;
      const rect = base.getBoundingClientRect();
      origin.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      setActive(true);
      setFromEvent(t.clientX, t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId.current) {
          e.preventDefault();
          setFromEvent(t.clientX, t.clientY);
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId.current) {
          touchId.current = null;
          setActive(false);
          setKnob({ x: 0, y: 0 });
          setVirtualMove(0, 0);
        }
      }
    };

    base.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      base.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      setVirtualMove(0, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto absolute bottom-8 left-8 select-none"
      style={{ width: STICK_R * 2, height: STICK_R * 2, touchAction: "none" }}
    >
      <div
        className="absolute inset-0 rounded-full border-2 border-white/25 bg-black/35 backdrop-blur-[2px]"
        style={{
          boxShadow: active ? "0 0 18px rgba(255,255,255,0.25)" : undefined,
        }}
      />
      <div
        className="absolute rounded-full bg-white/70"
        style={{
          width: KNOB_R * 2,
          height: KNOB_R * 2,
          left: STICK_R - KNOB_R + knob.x,
          top: STICK_R - KNOB_R + knob.y,
        }}
      />
    </div>
  );
}

function AttackButton() {
  return (
    <button
      className="pointer-events-auto absolute bottom-8 right-8 flex select-none items-center justify-center rounded-full border-2 border-amber-200/50 bg-amber-500/40 backdrop-blur-[2px] active:bg-amber-400/60"
      style={{ width: 88, height: 88, touchAction: "none" }}
      onTouchStart={(e) => {
        e.preventDefault();
        queueAttack();
      }}
      aria-label="Swing sword"
    >
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-amber-100" fill="currentColor">
        <path d="M14.5 2.5l7 7-2.1 2.1-7-7zM12.6 8.6L4 17.2V20h2.8l8.6-8.6zM3 21l1.5-4.5L7 19z" />
      </svg>
    </button>
  );
}

export function TouchControls() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(isTouchDevice());
  }, []);
  if (!touch) return null;
  return (
    <>
      <Joystick />
      <AttackButton />
    </>
  );
}
