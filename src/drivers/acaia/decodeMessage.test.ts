import { describe, expect, test } from "vitest";

import { hexToBytes } from "../../replay/replay.js";
import { ACAIA_VECTORS } from "../../test/acaiaVectors.js";
import { createFrameReader } from "./createFrameReader.js";
import { type AcaiaMessage, decodeMessage } from "./decodeMessage.js";

function decode(name: keyof typeof ACAIA_VECTORS): AcaiaMessage | undefined {
  const [frame, ...rest] = createFrameReader().push(hexToBytes(ACAIA_VECTORS[name]));
  if (!frame || rest.length > 0) throw new Error(`${name} is not exactly one frame`);
  return decodeMessage(frame);
}

function records(name: keyof typeof ACAIA_VECTORS): unknown {
  const message = decode(name);
  return message?.type === "event" ? message.records : message;
}

describe("decodeMessage: weight", () => {
  test("decodes grams and the trailing timer", () => {
    expect(records("weight")).toEqual([
      { kind: "weight", grams: 175.9 },
      { kind: "timer", ms: 200 },
    ]);
    expect(records("weightWithTimer")).toEqual([
      { kind: "weight", grams: 0 },
      { kind: "timer", ms: 8100 },
    ]);
  });

  test("applies the sign flag", () => {
    expect(records("weightNegative")).toEqual([{ kind: "weight", grams: -175.9 }]);
  });

  test("divides by the number of decimals", () => {
    expect(records("weightTwoDecimals")).toEqual([{ kind: "weight", grams: 17.59 }]);
    expect(records("weightThreeDecimals")).toEqual([{ kind: "weight", grams: 1.759 }]);
    expect(records("weightFourDecimals")).toEqual([{ kind: "weight", grams: 0.1759 }]);
  });

  test("skips a weight with an invalid unit", () => {
    expect(records("weightBadUnit")).toEqual([]);
  });

  test("keeps whole records and drops a truncated one", () => {
    expect(records("weightTruncatedTimer")).toEqual([{ kind: "weight", grams: 175.9 }]);
    expect(records("weightTooShort")).toEqual([]);
  });

  test("reads a header inside the payload as data", () => {
    expect(records("weightContainingHeader")).toEqual([{ kind: "weight", grams: 5681.5 }]);
  });

  test("never reports negative zero", () => {
    const message = decodeMessage({ type: 12, payload: Uint8Array.of(5, 0, 0, 0, 0, 1, 2) });
    // toEqual treats -0 and 0 as different, so this fails on negative zero.
    expect(message).toEqual({ type: "event", records: [{ kind: "weight", grams: 0 }] });
  });
});

describe("decodeMessage: timer, ack, battery", () => {
  test("decodes minutes, seconds and tenths", () => {
    expect(records("timer")).toEqual([{ kind: "timer", ms: 90_500 }]);
  });

  test("skips heartbeat replies but keeps what follows", () => {
    expect(records("ack")).toEqual([]);
    expect(records("ackWithWeightAndTimer")).toEqual([
      { kind: "weight", grams: 175.9 },
      { kind: "timer", ms: 90_500 },
    ]);
  });

  test("decodes a battery record", () => {
    const message = decodeMessage({ type: 12, payload: Uint8Array.of(6, 42) });
    expect(message).toEqual({ type: "event", records: [{ kind: "battery", percent: 42 }] });
  });
});

describe("decodeMessage: buttons", () => {
  test("decodes the key and the records after it", () => {
    expect(records("buttonStop")).toEqual([
      { kind: "button", button: "stop" },
      { kind: "weight", grams: 55.1 },
      { kind: "timer", ms: 9700 },
    ]);
    expect(records("buttonStart")).toEqual([
      { kind: "button", button: "start" },
      { kind: "weight", grams: 54.9 },
    ]);
    expect(records("buttonReset")).toEqual([{ kind: "button", button: "reset" }]);
    expect(records("buttonTare")).toEqual([
      { kind: "button", button: "tare" },
      { kind: "weight", grams: 175.9 },
    ]);
  });

  test("skips an unknown key and stops at an unknown tag", () => {
    expect(records("buttonUnknown")).toEqual([]);
    expect(records("buttonThenUnknownTag")).toEqual([{ kind: "button", button: "stop" }]);
  });
});

describe("decodeMessage: settings", () => {
  test("decodes battery, timer state and units", () => {
    expect(decode("settings")).toEqual({
      type: "settings",
      settings: { batteryPercent: 93, isTimerRunning: false, units: "grams" },
    });
    expect(decode("settingsTimerStopped")).toMatchObject({
      settings: { batteryPercent: 74, isTimerRunning: false },
    });
    expect(decode("settingsTimerRunning")).toMatchObject({
      settings: { batteryPercent: 74, isTimerRunning: true },
    });
    expect(decode("settingsOunces")).toMatchObject({ settings: { units: "ounces" } });
  });

  test("ignores settings too short to read", () => {
    expect(decodeMessage({ type: 8, payload: Uint8Array.of(0x5d) })).toBeUndefined();
  });
});

test("ignores message types sessions do not use", () => {
  expect(decode("unknownType")).toBeUndefined();
});
