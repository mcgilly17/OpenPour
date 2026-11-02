import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { advanceTo } from "../test/useFakeClock.js";
import { downloadText } from "./downloadText.js";
import type { SavedScale } from "./savedScales.js";
import { selectRun } from "./selectRun.js";
import { NO_MATCHING_FRAME, type SweepAction, sweepAnswers } from "./settingsSweep.js";
import {
  type ConnectedScale,
  click,
  connectTo,
  logged,
  notifyHex,
  pearlS,
} from "./test/connectScale.js";
import { type StubGatt, stubGatt } from "./test/stubGatt.js";
import type { StubPanel } from "./test/stubPanel.js";

vi.mock("./downloadText.js");

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const RECONNECT_T = 5000;

function sweep(panel: StubPanel, action: SweepAction): void {
  panel.onSweep.mock.calls[0]?.[0](action);
}

const sweepShown = (panel: StubPanel) => panel.showSweep.mock.calls.at(-1)?.[0];
const downloads = () => vi.mocked(downloadText).mock.calls;

function capture(panel: StubPanel, setting: string, value = "", saved?: SavedScale): void {
  const answers = sweepAnswers(new FormData(), saved);
  sweep(panel, { type: "capture", setting, value, answers });
}

/** Connects, receives the settings frame split in two at 200 ms, and tracks it from the A mark. */
async function trackSettings(gatt: StubGatt = stubGatt(ACAIA_GATT)): Promise<ConnectedScale> {
  const scale = connectTo(gatt);
  await scale.connected;
  await advanceTo(scale.clock, 200);
  notifyHex(gatt, RX.settings.slice(0, 6), 200);
  notifyHex(gatt, RX.settings.slice(6), 210);
  const run = selectRun(logged(scale.panel));
  if (!run) throw new Error("no run selected");
  sweep(scale.panel, { type: "track", run, prefixBytes: 3 });
  return scale;
}

async function reconnect({ clock, panel }: ConnectedScale): Promise<void> {
  click(panel, "disconnect");
  await advanceTo(clock, RECONNECT_T);
  click(panel, "reconnect");
  await advanceTo(clock, RECONNECT_T + 200);
}

describe("createScale settings sweep", () => {
  test("Capture adds the current recording's newest tracked frame, joined across notifications, and exports that recording", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel } = await trackSettings(gatt);
    await advanceTo(clock, 300);
    notifyHex(gatt, RX.settingsOunces.slice(0, 12), 300);
    notifyHex(gatt, RX.settingsOunces.slice(12), 310);

    capture(panel, "baseline");

    const fixtureFile = "unknown_fwunknown_settings-change-baseline-a.jsonl";
    const [row] = sweepShown(panel)?.rows ?? [];
    expect(row?.run.records.map(({ t, hex }) => [t, hex])).toEqual([
      [300, RX.settingsOunces.slice(0, 12)],
      [310, RX.settingsOunces.slice(12)],
    ]);
    expect(row).toMatchObject({ setting: "baseline", value: "", fixtureFile });
    expect(downloads().map(([fileName]) => fileName)).toEqual([fixtureFile]);
  });

  test("Capture with no tracked frame in the current recording adds no row and exports nothing", async () => {
    const scale = await trackSettings();
    await reconnect(scale);

    capture(scale.panel, "baseline");

    expect(sweepShown(scale.panel)).toMatchObject({ rows: [], problem: NO_MATCHING_FRAME });
    expect(downloadText).not.toHaveBeenCalled();
  });

  test("each later capture lists the bytes that differ from the baseline, and the sweep exports them", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const scale = await trackSettings(gatt);
    const { panel } = scale;
    capture(panel, "baseline");
    await reconnect(scale);
    // In ounces, with one byte more than the baseline.
    notifyHex(gatt, `${RX.settingsOunces}ff`, RECONNECT_T + 200);

    capture(panel, "units", "oz");
    sweep(panel, { type: "export", answers: sweepAnswers(new FormData(), undefined) });

    const [fileName, json] = downloads().at(-1) ?? [];
    expect(fileName).toBe("unknown_fwunknown_settings-sweep.json");
    expect(JSON.parse(json ?? "")).toEqual({
      header: {
        scale: "Acaia PEARL",
        model: "unknown",
        firmware: "unknown",
        trackedPrefix: "efdd08",
        exportedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      },
      rows: [
        {
          setting: "baseline",
          value: "",
          frameHex: RX.settings,
          fixtureFile: "unknown_fwunknown_settings-change-baseline-a.jsonl",
          changes: [],
        },
        {
          setting: "units",
          value: "oz",
          frameHex: `${RX.settingsOunces}ff`,
          fixtureFile: "unknown_fwunknown_settings-change-units-oz-a.jsonl",
          changes: [
            { index: 5, from: "02", to: "05" },
            { index: 12, from: "0d", to: "10" },
            { index: 14, from: "--", to: "ff" },
          ],
        },
      ],
    });
  });

  test("Remove drops a row", async () => {
    const { panel } = await trackSettings();
    capture(panel, "baseline");
    capture(panel, "sound", "on");

    sweep(panel, { type: "remove", index: 0 });

    expect(sweepShown(panel)?.rows.map(({ setting }) => setting)).toEqual(["sound"]);
  });
});

describe("createScale settings sweep and device identifiers", () => {
  test("refuses a setting value that looks like a device identifier: says why, adds no row and exports nothing", async () => {
    const { panel } = await trackSettings();

    capture(panel, "sound", "D9F8BC");

    expect(sweepShown(panel)?.rows).toEqual([]);
    expect(sweepShown(panel)?.problem).toContain(
      'scenario "settings-change-sound-d9f8bc" contains d9f8bc',
    );
    expect(downloadText).not.toHaveBeenCalled();
  });

  test("no capture or sweep export holds the device ID, the nickname or Device Information", async () => {
    // Shaped like Chrome's IDs, without a hex run the identifier check would catch anyway.
    const deviceId = "Xq7Lm+Pz2wRk/5Ny0Ab==";
    const gatt = pearlS();
    Object.assign(gatt.device, { id: deviceId });
    const saved: SavedScale = {
      id: deviceId,
      name: "Acaia PEARL",
      nickname: "Kitchen Pearl",
      model: "AL008",
      modelYear: "2021",
      firmware: "2.6",
    };
    const { panel } = await trackSettings(gatt);
    capture(panel, "baseline", "", saved);

    sweep(panel, { type: "export", answers: sweepAnswers(new FormData(), saved) });

    expect(downloads().map(([fileName]) => fileName)).toEqual([
      "AL008_fw2.6_settings-change-baseline-a.jsonl",
      "AL008_fw2.6_settings-sweep.json",
    ]);
    expect(JSON.parse(downloads()[1]?.[1] ?? "").header).toMatchObject({
      model: "AL008",
      modelYear: 2021,
      firmware: "2.6",
    });
    const written = JSON.stringify(downloads());
    for (const secret of [deviceId, "Kitchen Pearl", "SERIAL", "PEARLS", "1.0.016"]) {
      expect(written).not.toContain(secret);
    }
  });
});
