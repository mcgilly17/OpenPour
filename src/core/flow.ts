/** Trailing window for the flow slope. Long enough to average out jitter, short enough to follow a pour. */
export const FLOW_WINDOW_MS = 500;
/** Slopes smaller than this are load-cell drift, not a pour. */
export const FLOW_DEADBAND_GRAMS_PER_SEC = 0.05;

export interface FlowFilterOptions {
  windowMs?: number;
  deadbandGramsPerSec?: number;
}

export interface FlowFilter {
  /** Adds a sample and returns the current flow in g/s. */
  push(t: number, grams: number): number;
  /** Forgets every sample. The session calls this on tare, because a tare is a known event, not a pour. */
  reset(): void;
}

interface Sample {
  t: number;
  grams: number;
}

/** Least-squares slope of grams over time, in g/s; 0 when the samples span no time. */
function slopeGramsPerSec(samples: Sample[]): number {
  const n = samples.length;
  const meanT = samples.reduce((sum, s) => sum + s.t, 0) / n;
  const meanGrams = samples.reduce((sum, s) => sum + s.grams, 0) / n;
  let covariance = 0;
  let varianceT = 0;
  for (const s of samples) {
    covariance += (s.t - meanT) * (s.grams - meanGrams);
    varianceT += (s.t - meanT) ** 2;
  }
  return varianceT === 0 ? 0 : (covariance / varianceT) * 1000;
}

export function createFlowFilter(options: FlowFilterOptions = {}): FlowFilter {
  const windowMs = options.windowMs ?? FLOW_WINDOW_MS;
  const deadbandGramsPerSec = options.deadbandGramsPerSec ?? FLOW_DEADBAND_GRAMS_PER_SEC;
  let samples: Sample[] = [];
  let flowGramsPerSec = 0;

  function push(t: number, grams: number): number {
    const newest = samples.at(-1);
    // A sample older than the newest one can't be placed on the curve; keep the last answer.
    if (newest && t < newest.t) return flowGramsPerSec;
    samples.push({ t, grams });
    samples = samples.filter((s) => s.t >= t - windowMs);
    const slope = samples.length < 2 ? 0 : slopeGramsPerSec(samples);
    flowGramsPerSec = Math.abs(slope) < deadbandGramsPerSec ? 0 : slope;
    return flowGramsPerSec;
  }

  function reset(): void {
    samples = [];
    flowGramsPerSec = 0;
  }

  return { push, reset };
}
