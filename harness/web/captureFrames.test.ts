import type { FixtureRecord } from "openpour/replay";
import { describe, expect, test } from "vitest";

import { captureFrames, inferSync, joinFrames, MAX_FRAME_BYTES } from "./captureFrames.js";

const WEIGHT = "efdd0c0c05df060000010007000002f30d";
const SETTINGS = "efdd081f5d020201000101000d60";

function rx(hex: string, chr = "notify"): FixtureRecord {
  return { t: 0, dir: "rx", svc: "svc", chr, hex };
}

describe("inferSync", () => {
  test("is the 2-byte prefix most notifications start with", () => {
    expect(inferSync([WEIGHT, "efdd", "081f5d", WEIGHT, "00ff"])).toBe("efdd");
  });

  test("is undefined when no notification has 2 bytes", () => {
    expect(inferSync(["ef", "dd"])).toBeUndefined();
  });
});

describe("joinFrames", () => {
  test("joins a frame split across notifications, however it was split", () => {
    const notifications = [WEIGHT, "efdd", "081f5d0202", "01000101000d60", WEIGHT];

    expect(joinFrames(notifications)).toEqual([WEIGHT, SETTINGS, WEIGHT]);
  });

  test("starts a frame wherever its sync is, even mid-notification", () => {
    const notifications = [WEIGHT.slice(0, 20), WEIGHT.slice(20) + SETTINGS.slice(0, 6), WEIGHT];
    notifications.splice(2, 0, SETTINGS.slice(6));

    expect(joinFrames(notifications)).toEqual([WEIGHT, SETTINGS, WEIGHT]);
  });

  test("drops bytes before the first sync, and cuts a frame at MAX_FRAME_BYTES", () => {
    const long = `efdd${"00".repeat(MAX_FRAME_BYTES + 10)}`;

    const frames = joinFrames(["0102", WEIGHT, WEIGHT, long]);

    expect(frames).toEqual([WEIGHT, WEIGHT, long.slice(0, MAX_FRAME_BYTES * 2)]);
  });
});

describe("captureFrames", () => {
  test("keeps each kind's latest frame and the bytes that varied within the recording", () => {
    const heavier = `${WEIGHT.slice(0, 10)}e0${WEIGHT.slice(12)}`;
    const records = [rx(WEIGHT), rx("efdd"), rx(SETTINGS.slice(4)), rx(heavier)];

    expect(captureFrames(records)).toEqual({
      efdd0c: { frame: heavier, varying: [5] },
      efdd08: { frame: SETTINGS, varying: [] },
    });
  });

  test("joins each characteristic on its own sync, and ignores writes", () => {
    const records: FixtureRecord[] = [
      rx(WEIGHT),
      rx("aa5501020304", "other"),
      { ...rx("efdd0c99"), dir: "tx" },
      rx("aa5502", "other"),
      rx("0506", "other"),
    ];

    expect(Object.keys(captureFrames(records)).sort()).toEqual(["aa5501", "aa5502", "efdd0c"]);
    expect(captureFrames(records).aa5502?.frame).toBe("aa55020506");
  });
});
