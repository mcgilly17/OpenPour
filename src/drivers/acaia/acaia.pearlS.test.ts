import { describe, expect, test } from "vitest";
import timer from "../../../fixtures/acaia/Pearl-S_fw1.0.8_C9-scale-timer-after-battery-requests.jsonl?raw";
import unitSwitch from "../../../fixtures/acaia/Pearl-S_fw1.0.8_C12-units-switched-to-oz-on-scale.jsonl?raw";
import unitsAtConnect from "../../../fixtures/acaia/Pearl-S_fw1.0.8_units-oz-set-in-vendor-app-then-connected.jsonl?raw";
import { parseFixture } from "../../replay/parseFixture.js";
import { ACAIA_COMMAND_VECTORS as TX } from "../../test/acaiaVectors.js";
import { runAcaia } from "../../test/runAcaia.js";
import { SETTINGS_REPLY_TIMEOUT_MS } from "./createAcaiaSession.js";

const PEARL_S_INFO = { type: "info", firmware: "1.0.8", modelCode: "035c" };

describe("Pearl S: units switched to ounces on the scale mid-session (C12)", () => {
  const result = runAcaia(parseFixture(unitSwitch));
  const readings = result.readings();
  // The first weights in ounces, 25.395 and 14.78 in one notification, are the scale mid-switch.
  const SWITCH_T = 24551.1;

  test("identifies as soon as the scale describes itself, and reports the description once", () => {
    expect(result.writesAt(60.9)).toEqual([TX.identify, TX.notificationRequest]);
    expect(result.writesAt(431.1)).toEqual([TX.identify]);
    expect(result.eventsOf("info")).toEqual([PEARL_S_INFO]);
  });

  test("reads grams from settings byte 2, with the scale's decimals and settled flag", () => {
    expect(readings[0]).toEqual({
      t: 581.5,
      value: 0,
      unit: "g",
      decimals: 1,
      stable: true,
      flowPerSec: 0,
    });
    expect(readings.find(({ t }) => t === 6159.9)).toMatchObject({ value: 10.8, stable: false });
    expect(readings.find(({ t }) => t === 8239.1)).toMatchObject({ value: 116.4, stable: true });
    expect(readings.every(({ unit, decimals }) => unit === "g" && decimals === 1)).toBe(true);
  });

  test("holds every reading from the switch on, junk included", () => {
    expect(readings.at(-1)).toMatchObject({ t: 23380, value: 115.3, unit: "g" });
    expect(readings.filter(({ t }) => t >= SWITCH_T)).toEqual([]);
  });

  test("asks for settings at the switch, then again each timeout while none answers", () => {
    const asks = result.timesOf(TX.getSettings);
    expect(asks[0]).toBe(SWITCH_T);
    const gaps = asks.slice(1).map((t, i) => t - (asks[i] ?? t));
    // Asks ride on weights, which arrive about every 0.1 s, so each is due within a weight of the timeout.
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(SETTINGS_REPLY_TIMEOUT_MS);
    for (const gap of gaps) expect(gap).toBeLessThan(SETTINGS_REPLY_TIMEOUT_MS + 200);
  });
});

describe("Pearl S: ounces set in the vendor app, then connected", () => {
  const result = runAcaia(parseFixture(unitsAtConnect));
  const readings = result.readings();

  test("holds the weight that came before the settings, then reports ounces", () => {
    expect(readings[0]).toEqual({
      t: 1256569.3,
      value: 0,
      unit: "oz",
      decimals: 3,
      stable: true,
      flowPerSec: 0,
    });
    expect(readings).toHaveLength(121);
    expect(readings.every(({ unit, decimals }) => unit === "oz" && decimals === 3)).toBe(true);
  });

  test("needed no settings request: the scale sent its own after identify", () => {
    expect(result.eventsOf("info")).toEqual([PEARL_S_INFO]);
    expect(result.timesOf(TX.getSettings)).toEqual([]);
  });
});

describe("Pearl S: the scale's timer button, after battery requests (C9, C11)", () => {
  const fixture = parseFixture(timer);
  const result = runAcaia(fixture);
  const timerEvents = result.events.flatMap(({ t, event }): [number, boolean, number][] =>
    event.type === "timer" ? [[t, event.running, event.ms]] : [],
  );

  test("runs while the timer records advance, stops on the stop notice, then resets", () => {
    expect(timerEvents).toEqual([
      [26002.6, true, 700],
      [26511.9, true, 1200],
      [26991.9, true, 1600],
      [27442.5, true, 2100],
      [27951.9, true, 2600],
      [28462.7, true, 3100],
      [29001.8, true, 3600],
      [29481.8, true, 4200],
      [29935.1, false, 4500],
      [31221.4, false, 200],
    ]);
    expect(result.eventsOf("button")).toEqual([]);
  });

  test("answered every settings request within the reply timeout", () => {
    const asked = fixture.records.filter((r) => r.dir === "tx" && r.hex === TX.getSettings);
    const answered = result.events
      .filter(({ event }) => event.type === "battery")
      .map(({ t }) => t);
    expect(asked).toHaveLength(16);
    for (const { t } of asked) {
      expect(answered.some((a) => a > t && a - t < SETTINGS_REPLY_TIMEOUT_MS)).toBe(true);
    }
  });
});
