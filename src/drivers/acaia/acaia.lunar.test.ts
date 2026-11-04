import { describe, expect, test } from "vitest";

import tareAndTimers from "../../../fixtures/acaia/Lunar-AL008_fw1.0.019_C8-scale-tare-C9-scale-timer-C10-app-timer.jsonl?raw";
import ounces from "../../../fixtures/acaia/Lunar-AL008_fw1.0.019_C12-units-oz-at-connect.jsonl?raw";
import { parseFixture } from "../../replay/parseFixture.js";
import { ACAIA_COMMAND_VECTORS as TX } from "../../test/acaiaVectors.js";
import { OLD_STYLE_GATT, runAcaia } from "../../test/runAcaia.js";

describe("Lunar: tare on the scale, its timer button, then the app's timer (C8, C9, C10)", () => {
  const fixture = parseFixture(tareAndTimers);
  const result = runAcaia(fixture, OLD_STYLE_GATT);
  const readings = result.readings();
  const timerEvents = result.events.flatMap(({ t, event }): [number, boolean, number][] =>
    event.type === "timer" ? [[t, event.running, event.ms]] : [],
  );
  const stops = timerEvents.filter(([, running]) => !running);

  test("reads grams from settings byte 1, with the scale's settled flag", () => {
    expect(readings.find(({ t }) => t === 506948.5)).toMatchObject({ value: 145.9, stable: false });
    expect(readings.find(({ t }) => t === 507589.4)).toEqual({
      t: 507589.4,
      value: 116.4,
      unit: "g",
      decimals: 1,
      stable: true,
      flowPerSec: 0,
    });
    expect(readings.every(({ unit, decimals }) => unit === "g" && decimals === 1)).toBe(true);
  });

  test("a tare on the scale only drops the weight: no button event", () => {
    expect(readings.find(({ t }) => t === 512315.5)).toMatchObject({ value: 0 });
    expect(result.eventsOf("button").map(({ button }) => button)).toEqual([
      "start",
      "stop",
      "reset",
    ]);
  });

  test("the timer button: a button event for each press, the timer state from its values", () => {
    const buttons = result.events.flatMap(({ t, event }) =>
      event.type === "button" ? [[t, event.button]] : [],
    );
    expect(buttons).toEqual([
      [534573.3, "start"],
      [544098.1, "stop"],
      [546014.2, "reset"],
    ]);
    // The start press carries 0.2 s, not yet advanced; the stop press comes alone.
    expect(timerEvents.find(([, running]) => running)).toEqual([534790.5, true, 400]);
    // The idle timer's first record, at 500726, is the baseline; its second shows it stopped.
    expect(stops.slice(0, 3)).toEqual([
      [500960.2, false, 200],
      [544193.9, false, 9600],
      [546014.2, false, 200],
    ]);
  });

  test("the app's timer, with no button events: running, stopped at 7.2 s, reset", () => {
    const sent = (hex: string) => fixture.records.filter((r) => r.dir === "tx" && r.hex === hex);
    expect(sent(TX.timerStart).map(({ t }) => t)).toEqual([570368.1]);
    const app = timerEvents.filter(([t]) => t > 570_000);
    expect(app[0]).toEqual([570691, true, 300]);
    expect(app.at(-3)).toEqual([577666.7, true, 7200]);
    expect(app.slice(-2)).toEqual([
      [577883, false, 7200],
      [579133.4, false, 200],
    ]);
  });

  test("reports each change once: an idle or stopped timer sends the same value every message", () => {
    expect(stops).toHaveLength(5);
    const states = timerEvents.map(([, running, ms]) => `${running} ${ms}`);
    expect(states.filter((state, i) => state === states[i - 1])).toEqual([]);
  });

  test("identifies after the info wait: this recording's own session identified at once", () => {
    expect(result.eventsOf("info")).toEqual([]);
    expect(result.timesOf(TX.identify)[0]).toBe(501859);
  });
});

describe("Lunar: ounces set before connecting (C12)", () => {
  const result = runAcaia(parseFixture(ounces), OLD_STYLE_GATT);
  const readings = result.readings();

  test("reads ounces from settings byte 1, with three decimals", () => {
    expect(readings[0]).toEqual({
      t: 374.2,
      value: 0,
      unit: "oz",
      decimals: 3,
      stable: true,
      flowPerSec: 0,
    });
    expect(readings.find(({ t }) => t === 5654.6)).toMatchObject({ value: 4.106, stable: true });
    expect(readings.every(({ unit, decimals }) => unit === "oz" && decimals === 3)).toBe(true);
  });
});
