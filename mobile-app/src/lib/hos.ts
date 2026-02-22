import type { LegEvent } from './types';

const DRIVE_START_EVENTS = new Set(['START_ROUTE', 'AUTO_START_ROUTE', 'RESUME_ROUTE']);
const DRIVE_STOP_EVENTS = new Set(['PAUSE_ROUTE', 'ARRIVED', 'HANDOFF_COMPLETE']);
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const CYCLE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

function intersectWindow(start: number, end: number, windowStart: number, windowEnd: number) {
  const from = Math.max(start, windowStart);
  const to = Math.min(end, windowEnd);
  return Math.max(0, to - from);
}

export function computeHosUsage(events: LegEvent[], nowMs: number) {
  const sorted = [...events]
    .filter((event) => !!event.createdAt)
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  const intervals: Array<{ start: number; end: number }> = [];
  let activeStart: number | null = null;

  for (const event of sorted) {
    const ts = new Date(event.createdAt || 0).getTime();
    if (!Number.isFinite(ts)) continue;
    if (DRIVE_START_EVENTS.has(event.eventType)) {
      if (activeStart === null) activeStart = ts;
      continue;
    }
    if (DRIVE_STOP_EVENTS.has(event.eventType)) {
      if (activeStart !== null && ts > activeStart) intervals.push({ start: activeStart, end: ts });
      activeStart = null;
    }
  }

  if (activeStart !== null && nowMs > activeStart) intervals.push({ start: activeStart, end: nowMs });

  let cycleMs = 0;
  const cycleStart = nowMs - CYCLE_WINDOW_MS;
  for (const interval of intervals) {
    cycleMs += intersectWindow(interval.start, interval.end, cycleStart, nowMs);
  }

  let shiftStartIdx = 0;
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start - intervals[index - 1].end >= TEN_HOURS_MS) shiftStartIdx = index;
  }

  let shiftMs = 0;
  for (let index = shiftStartIdx; index < intervals.length; index += 1) {
    shiftMs += Math.max(0, intervals[index].end - intervals[index].start);
  }

  return {
    shiftHours: Number((shiftMs / 3600000).toFixed(2)),
    cycleHours: Number((cycleMs / 3600000).toFixed(2)),
    activelyDriving: activeStart !== null,
  };
}

export function legDriveState(phase?: string): 'DRIVING' | 'PAUSED' | 'IDLE' {
  const normalized = (phase || '').toUpperCase();
  if (normalized === 'PAUSE_ROUTE') return 'PAUSED';
  if (DRIVE_START_EVENTS.has(normalized)) return 'DRIVING';
  return 'IDLE';
}

export function nextLegAction(phase?: string): 'START_ROUTE' | 'ARRIVE' | 'HANDOFF' | null {
  const normalized = (phase || '').toUpperCase();
  if (normalized === 'ARRIVED') return 'HANDOFF';
  if (normalized === 'START_ROUTE' || normalized === 'AUTO_START_ROUTE' || normalized === 'RESUME_ROUTE') return 'ARRIVE';
  if (normalized === 'PAUSE_ROUTE') return null;
  if (normalized === 'HANDOFF_COMPLETE') return null;
  return 'START_ROUTE';
}
