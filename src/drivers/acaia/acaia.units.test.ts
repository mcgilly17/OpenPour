import { describe, expect, test } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../test/acaiaVectors.js";
import { runAcaia, rx, synthetic } from "../../test/runAcaia.js";
import { SETTINGS_REPLY_TIMEOUT_MS, UNIT_DECIMALS } from "./createAcaiaSession.js";

// Captured frames in hand-written sequences: no recording holds a settings reply after a unit
// switch made on the scale, because the session that recorded them never asked for one.

describe("acaia session units", () => {
  test("uses the documented decimals per unit", () => {
    expect(UNIT_DECIMALS).toEqual({ g: 1, oz: 3 });
    expect(SETTINGS_REPLY_TIMEOUT_MS).toBe(1000);
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
});
