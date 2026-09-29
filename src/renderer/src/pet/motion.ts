// Easing, duration and walking bob for autonomous pet movement. Pure module.
import type { Speed } from './protocol';

const SPEED_DIP_PER_S: Record<Speed, number> = { slow: 60, normal: 120 };
const MIN_DURATION_MS = 800;
const MAX_DURATION_MS = 8000;
const BOB_AMPLITUDE_DIP = 4;
const BOB_HZ = 2;

export function easeInOutSine(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function durationFor(distanceDip: number, speed: Speed): number {
  const ms = (Math.abs(distanceDip) / SPEED_DIP_PER_S[speed]) * 1000;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, ms));
}

/**
 * Upward bob in DIP (subtract from y) at progress `t01` of a move lasting
 * `durationMs`: 2 Hz hops under a sine envelope so it is 0 at both ends.
 */
export function bobOffset(t01: number, durationMs: number): number {
  const t = Math.min(1, Math.max(0, t01));
  const seconds = (t * durationMs) / 1000;
  return BOB_AMPLITUDE_DIP * Math.abs(Math.sin(2 * Math.PI * BOB_HZ * seconds)) * Math.sin(Math.PI * t);
}
