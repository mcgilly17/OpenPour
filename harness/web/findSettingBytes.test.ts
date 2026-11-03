import { describe, expect, test } from "vitest";

import type { CaptureFrames } from "./captureFrames.js";
import { describeFindings, findSettingBytes, type StepFrames } from "./findSettingBytes.js";

// A settings frame: battery at byte 4, sound at byte 9.
const SETTINGS = "efdd08095d020201000101000d60";
const WEIGHT = "efdd0c0c05df060000010007000002f30d";

/** `frame` with byte `index` replaced by `hex`. */
function withByte(frame: string, index: number, hex: string): string {
  return frame.slice(0, index * 2) + hex + frame.slice(index * 2 + 2);
}

function settings(battery: string, sound: string): CaptureFrames {
  return { efdd08: { frame: withByte(withByte(SETTINGS, 4, battery), 9, sound), varying: [] } };
}

/** Sound on, off, then on again. */
function soundSteps(...frames: CaptureFrames[]): StepFrames[] {
  return frames.map((stepFrames, i) => ({ option: i === 1 ? "off" : "on", frames: stepFrames }));
}

describe("findSettingBytes", () => {
  test("a byte steady within each step, set by the option and back on the repeat follows the setting", () => {
    const steps = soundSteps(settings("5d", "01"), settings("5d", "00"), settings("5d", "01"));

    expect(findSettingBytes("Sound", steps)).toEqual([
      {
        kind: "efdd08",
        index: 9,
        values: { on: "01", off: "00" },
        follows: true,
        note: "follows Sound: on 01 · off 00",
      },
    ]);
  });

  test("a byte that differs between steps but not back on the repeat changed, but not with the setting", () => {
    const steps = soundSteps(settings("5d", "01"), settings("5c", "01"), settings("5b", "01"));

    expect(findSettingBytes("Sound", steps)).toEqual([
      {
        kind: "efdd08",
        index: 4,
        values: { on: "5d", off: "5c" },
        follows: false,
        note: "changed, but not with Sound: on 5d · off 5c · on again 5b",
      },
    ]);
  });

  test("bytes that vary within a step are live data and never count", () => {
    const weight = (grams: string, varying: number[]): CaptureFrames => ({
      efdd0c: { frame: withByte(WEIGHT, 5, grams), varying },
    });
    const steps = soundSteps(weight("df", []), weight("10", [5]), weight("df", []));

    expect(findSettingBytes("Sound", steps)).toEqual([]);
  });

  test("a kind of frame some steps never saw is reported as missing", () => {
    const steps = soundSteps(settings("5d", "01"), {}, settings("5d", "01"));

    expect(findSettingBytes("Sound", steps)).toEqual([
      {
        kind: "efdd08",
        index: null,
        values: {},
        follows: false,
        note: "not seen in every step: missing from step 2 (off)",
      },
    ]);
  });
});

describe("describeFindings", () => {
  test("lists the bytes that follow the setting first", () => {
    const steps = soundSteps(settings("5d", "01"), settings("5c", "00"), settings("5b", "01"));

    expect(describeFindings("Sound", findSettingBytes("Sound", steps))).toEqual([
      "Frame ef dd 08 (seen in every step), byte 9 follows Sound: on 01 · off 00",
      "Frame ef dd 08 (seen in every step), byte 4 changed, but not with Sound: on 5d · off 5c · on again 5b",
    ]);
  });

  test("says so when nothing follows the setting", () => {
    const steps = soundSteps({}, settings("5d", "01"), settings("5d", "01"));

    expect(describeFindings("Sound", findSettingBytes("Sound", steps))).toEqual([
      "Sound didn't change anything the scale sent.",
      "Frame ef dd 08 not seen in every step: missing from step 1 (on)",
    ]);
  });
});
