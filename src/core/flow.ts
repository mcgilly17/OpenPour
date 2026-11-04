import type { WeightUnit } from "./types.js";

/** Trailing window for the flow slope. Long enough to average out jitter, short enough to follow a pour. */
export const FLOW_WINDOW_MS = 500;
/** Slopes smaller than this are load-cell drift, not a pour. */
const FLOW_DEADBAND_GRAMS_PER_SEC = 0.05;
export const GRAMS_PER_OUNCE = 28.349523125;
/** The same drift in each unit a reading can carry. */
export const FLOW_DEADBAND_PER_SEC: Readonly<Record<WeightUnit, number>> = {
  g: FLOW_DEADBAND_GRAMS_PER_SEC,
  oz: FLOW_DEADBAND_GRAMS_PER_SEC / GRAMS_PER_OUNCE,
};

export interface FlowFilterOptions {
  windowMs?: number;
  deadbandPerSec?: Readonly<Record<WeightUnit, number>>;
}

export interface FlowFilter {
  /**
   * Adds a sample and returns the current flow in `unit` per second. A sample in another unit
   * than the last one starts again, since the two can't share a slope.
   */
  push(t: number, value: number, unit: WeightUnit): number;
  /** Forgets every sample. The session calls this on tare, because a tare is a known event, not a pour. */
  reset(): void;
}

interface Sample {
  t: number;
  value: number;
}

/** Least-squares slope of the values over time, per second; 0 when the samples span no time. */
function slopePerSec(samples: Sample[]): number {
  const n = samples.length;
  const meanT = samples.reduce((sum, s) => sum + s.t, 0) / n;
  const meanValue = samples.reduce((sum, s) => sum + s.value, 0) / n;
  let covariance = 0;
  let varianceT = 0;
  for (const s of samples) {
    covariance += (s.t - meanT) * (s.value - meanValue);
    varianceT += (s.t - meanT) ** 2;
  }
  return varianceT === 0 ? 0 : (covariance / varianceT) * 1000;
}

export function createFlowFilter(options: FlowFilterOptions = {}): FlowFilter {
  const windowMs = options.windowMs ?? FLOW_WINDOW_MS;
  const deadbandPerSec = options.deadbandPerSec ?? FLOW_DEADBAND_PER_SEC;
  let samples: Sample[] = [];
  let samplesUnit: WeightUnit | undefined;
  let flowPerSec = 0;

  function reset(): void {
    samples = [];
    flowPerSec = 0;
  }

  function push(t: number, value: number, unit: WeightUnit): number {
    if (unit !== samplesUnit) reset();
    samplesUnit = unit;
    const newest = samples.at(-1);
    // A sample older than the newest one can't be placed on the curve; keep the last answer.
    if (newest && t < newest.t) return flowPerSec;
    samples.push({ t, value });
    samples = samples.filter((s) => s.t >= t - windowMs);
    const slope = samples.length < 2 ? 0 : slopePerSec(samples);
    flowPerSec = Math.abs(slope) < deadbandPerSec[unit] ? 0 : slope;
    return flowPerSec;
  }

  return { push, reset };
}
