import { describe, expect, test } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../test/acaiaVectors.js";
import { runAcaia, rx, synthetic } from "../../test/runAcaia.js";
import {
  SETTINGS_REPLY_TIMEOUT_MS,
  UNIT_CONFIRM_TIMEOUT_MS,
  UNIT_DECIMALS,
} from "./createAcaiaSession.js";

// Captured frames in hand-written sequences: no recording holds a settings reply after a unit
// switch made on the scale, because the session that recorded them never asked for one.

/** `hex` every 500 ms from `from` to `to`, inclusive. */
function every500(hex: string, from: number, to: number) {
  return Array.from({ length: (to - from) / 500 + 1 }, (_, i) => rx(from + i * 500, hex));
}

describe("acaia session units", () => {
  test("uses the documented decimals per unit", () => {
    expect(UNIT_DECIMALS).toEqual({ g: 1, oz: 3 });
    expect(SETTINGS_REPLY_TIMEOUT_MS).toBe(1000);
    expect(UNIT_CONFIRM_TIMEOUT_MS).toBe(3000);
  });

  test("holds readings until settings give the unit, asking once the scale's own are overdue", () => {
    const late = SETTINGS_REPLY_TIMEOUT_MS + 100;
    const result = runAcaia(
      synthetic(
        rx(100, RX.weightUnsettled),
        rx(late, RX.weightUnsettled),
        rx(late + 50, RX.settingsPearlS),
      ),
    );

    expect(result.readings()).toEqual([]);
    expect(result.timesOf(TX.getSettings)).toEqual([late]);
  });

  test("holds readings through a unit switch on the scale, and resumes in the confirmed unit", () => {
    const result = runAcaia(
      synthetic(
        rx(100, RX.settingsPearlS),
        rx(1100, RX.weightUnsettled),
        rx(1200, RX.weightOunces),
        rx(1300, RX.weightOunces),
        rx(1350, RX.settingsPearlSOunces),
        rx(1400, RX.weightOunces),
      ),
    );

    expect(result.timesOf(TX.getSettings)).toEqual([1200]);
    expect(result.readings()).toEqual([
      { t: 1100, value: 115.3, unit: "g", decimals: 1, stable: false, flowPerSec: 0 },
      { t: 1400, value: 4.175, unit: "oz", decimals: 3, stable: false, flowPerSec: 0 },
    ]);
  });

  test("keeps holding and asks again each timeout while settings contradict the decimals", () => {
    const at = (n: number) => 2000 + n * SETTINGS_REPLY_TIMEOUT_MS;
    const result = runAcaia(
      synthetic(
        rx(100, RX.settingsPearlS),
        rx(at(0), RX.weightOunces),
        rx(at(0) + 150, RX.settingsPearlS),
        rx(at(1) - 1, RX.weightOunces),
        rx(at(1), RX.weightOunces),
      ),
    );

    expect(result.readings()).toEqual([]);
    expect(result.timesOf(TX.getSettings)).toEqual([at(0), at(1)]);
  });

  test("holds readings for a units code it doesn't know", () => {
    const result = runAcaia(synthetic(rx(100, RX.settingsUnknownUnit), rx(200, RX.weight)));

    expect(result.readings()).toEqual([]);
    expect(result.eventsOf("battery")).toEqual([{ type: "battery", percent: 93 }]);
  });

  test.each([
    ["no settings", [], RX.weight, "weights carry 1 decimal, no settings came"],
    [
      "a units code it doesn't know",
      [rx(100, RX.settingsUnknownUnit)],
      RX.weight,
      "weights carry 1 decimal, settings say units code 0x03",
    ],
    [
      "settings that contradict the decimals",
      [rx(100, RX.settingsPearlS)],
      RX.weightOunces,
      "weights carry 3 decimals, settings say g",
    ],
  ])(
    "reports readings held for %s once, as a timeout, and keeps asking",
    (_, settings, weight, says) => {
      const result = runAcaia(synthetic(...settings, ...every500(weight, 1000, 6000)));

      expect(result.readings()).toEqual([]);
      expect(result.errors()).toEqual([
        [1000 + UNIT_CONFIRM_TIMEOUT_MS, "timeout", `unit unconfirmed: ${says}`],
      ]);
      expect(result.timesOf(TX.getSettings)).toEqual([1000, 2000, 3000, 4000, 5000, 6000]);
    },
  );

  test("reports again when readings resume, then a later switch holds them too long", () => {
    const result = runAcaia(
      synthetic(
        rx(100, RX.settingsPearlS),
        ...every500(RX.weightOunces, 1000, 4500),
        rx(4600, RX.settingsPearlSOunces),
        rx(4700, RX.weightOunces),
        ...every500(RX.weightUnsettled, 5000, 8500),
      ),
    );

    expect(result.readings().map(({ t, unit }) => [t, unit])).toEqual([[4700, "oz"]]);
    expect(result.errors().map(([t, , message]) => [t, message])).toEqual([
      [4000, "unit unconfirmed: weights carry 3 decimals, settings say g"],
      [8000, "unit unconfirmed: weights carry 1 decimal, settings say oz"],
    ]);
  });
});
