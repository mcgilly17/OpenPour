import { describe, expect, test } from "vitest";

import { createFlowFilter, FLOW_DEADBAND_GRAMS_PER_SEC, FLOW_WINDOW_MS } from "./flow.js";

const SAMPLE_INTERVAL_MS = 100; // Acaia streams at about 10 Hz

/** Deterministic pseudo-random numbers in [0, 1) so noise tests never flake. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

function pushSeries(
  push: (t: number, grams: number) => number,
  count: number,
  gramsAt: (t: number) => number,
): number[] {
  const flows: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i * SAMPLE_INTERVAL_MS;
    flows.push(push(t, gramsAt(t)));
  }
  return flows;
}

describe("createFlowFilter", () => {
  test("uses the documented defaults", () => {
    expect(FLOW_WINDOW_MS).toBe(500);
    expect(FLOW_DEADBAND_GRAMS_PER_SEC).toBe(0.05);
  });

  test("reports 0 until it has two samples", () => {
    const filter = createFlowFilter();
    expect(filter.push(0, 10)).toBe(0);
    expect(filter.push(100, 10.5)).toBeCloseTo(5, 2);
  });

  test("measures a steady pour", () => {
    const filter = createFlowFilter();
    const flows = pushSeries(filter.push, 30, (t) => (5 * t) / 1000);
    for (const flow of flows.slice(1)) expect(flow).toBeCloseTo(5, 2);
  });

  test("reports 0 when nothing is poured", () => {
    const filter = createFlowFilter();
    const flows = pushSeries(filter.push, 30, () => 250);
    for (const flow of flows) expect(flow).toBe(0);
  });

  test("keeps load-cell noise far below a real pour", () => {
    // ±0.1 g jitter at 10 Hz over a 500 ms window gives a slope spread of about 0.14 g/s;
    // 0.5 g/s leaves margin and is still well below the slowest real pour (~2 g/s).
    const random = seededRandom(42);
    const filter = createFlowFilter();
    const flows = pushSeries(filter.push, 600, () => 100 + (random() - 0.5) * 0.2);
    for (const flow of flows) expect(Math.abs(flow)).toBeLessThan(0.5);
  });

  test("applies the deadband to slow drift", () => {
    const filter = createFlowFilter();
    const flows = pushSeries(filter.push, 20, (t) => (0.04 * t) / 1000);
    for (const flow of flows) expect(flow).toBe(0);
  });

  test("forgets samples older than the window", () => {
    const filter = createFlowFilter();
    // 5 g/s for 2 s, then the pour stops.
    const flows = pushSeries(filter.push, 40, (t) => Math.min(t, 2000) * 0.005);
    const settledAfterStop = flows.slice(
      2000 / SAMPLE_INTERVAL_MS + FLOW_WINDOW_MS / SAMPLE_INTERVAL_MS,
    );
    for (const flow of settledAfterStop) expect(flow).toBe(0);
  });

  test("a tare step without reset is gone once it leaves the window", () => {
    const filter = createFlowFilter();
    pushSeries(filter.push, 10, () => 300);
    filter.push(1000, 0);
    let flow = 0;
    for (let t = 1100; t <= 1000 + FLOW_WINDOW_MS; t += SAMPLE_INTERVAL_MS)
      flow = filter.push(t, 0);
    expect(flow).toBe(0);
  });

  test("reset clears the window so a tare never shows as a negative flow", () => {
    const filter = createFlowFilter();
    pushSeries(filter.push, 10, () => 300);
    filter.reset();
    expect(filter.push(1000, 0)).toBe(0);
    expect(filter.push(1100, 0)).toBe(0);
  });

  test("handles identical timestamps without dividing by zero", () => {
    const filter = createFlowFilter();
    expect(filter.push(0, 10)).toBe(0);
    expect(filter.push(0, 11)).toBe(0);
    expect(filter.push(100, 11.5)).toBeGreaterThan(0);
  });

  test("ignores a sample older than the newest one", () => {
    const filter = createFlowFilter();
    filter.push(0, 0);
    const flow = filter.push(100, 0.5);
    expect(filter.push(50, 99)).toBe(flow);
    expect(filter.push(200, 1)).toBeCloseTo(5, 2);
  });

  test("accepts a custom window and deadband", () => {
    const filter = createFlowFilter({ windowMs: 200, deadbandGramsPerSec: 10 });
    const flows = pushSeries(filter.push, 10, (t) => (5 * t) / 1000);
    for (const flow of flows) expect(flow).toBe(0);
  });
});
