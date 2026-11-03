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

/** A settled weight record, as decoded. */
function weight(value: number, decimals = 1) {
  return { kind: "weight", value, decimals, isStable: true };
}

describe("decodeMessage: weight", () => {
  test("decodes the value and the trailing timer", () => {
    expect(records("weight")).toEqual([weight(175.9), { kind: "timer", ms: 200 }]);
    expect(records("weightWithTimer")).toEqual([weight(0), { kind: "timer", ms: 8100 }]);
  });

  test("applies the sign flag", () => {
    expect(records("weightNegative")).toEqual([weight(-175.9)]);
  });

  test("divides by the number of decimals, and keeps them", () => {
    expect(records("weightTwoDecimals")).toEqual([weight(17.59, 2)]);
    expect(records("weightThreeDecimals")).toEqual([weight(1.759, 3)]);
    expect(records("weightFourDecimals")).toEqual([weight(0.1759, 4)]);
  });

  test("reads bit 0x01 of the flags as not settled", () => {
    expect(records("weightUnsettled")).toEqual([{ ...weight(115.3), isStable: false }]);
    expect(records("weightOunces")).toEqual([{ ...weight(4.175, 3), isStable: false }]);
  });

  test("skips a weight with an invalid unit", () => {
    expect(records("weightBadUnit")).toEqual([]);
  });

  test("keeps whole records and drops a truncated one", () => {
    expect(records("weightTruncatedTimer")).toEqual([weight(175.9)]);
    expect(records("weightTooShort")).toEqual([]);
  });

  test("reads a header inside the payload as data", () => {
    expect(records("weightContainingHeader")).toEqual([weight(5681.5)]);
  });

  test("never reports negative zero", () => {
    const message = decodeMessage({ type: 12, payload: Uint8Array.of(5, 0, 0, 0, 0, 1, 2) });
    // toEqual treats -0 and 0 as different, so this fails on negative zero.
    expect(message).toEqual({ type: "event", records: [weight(0)] });
  });
});

describe("decodeMessage: timer, ack, battery", () => {
  test("decodes minutes, seconds and tenths", () => {
    expect(records("timer")).toEqual([{ kind: "timer", ms: 90_500 }]);
  });

  test("keeps the order of a timer sent ahead of the weight", () => {
    expect(records("timerStopNotice")).toEqual([
      { kind: "timer", ms: 4500 },
      { ...weight(0.1), isStable: false },
    ]);
  });

  test("skips heartbeat replies but keeps what follows", () => {
    expect(records("ack")).toEqual([]);
    expect(records("ackWithNegativeWeight")).toEqual([weight(-598)]);
    expect(records("ackWithWeightAndTimer")).toEqual([
      weight(175.9),
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
      { ...weight(55.1), isStable: false },
      { kind: "timer", ms: 9700 },
    ]);
    expect(records("buttonStart")).toEqual([
      { kind: "button", button: "start" },
      { ...weight(54.9), isStable: false },
    ]);
    expect(records("buttonReset")).toEqual([{ kind: "button", button: "reset" }]);
    expect(records("buttonTare")).toEqual([{ kind: "button", button: "tare" }, weight(175.9)]);
  });

  test("skips an unknown key and stops at an unknown tag", () => {
    expect(records("buttonUnknown")).toEqual([]);
    expect(records("buttonThenUnknownTag")).toEqual([{ kind: "button", button: "stop" }]);
  });
});

describe("decodeMessage: settings", () => {
  test("decodes battery, masking bit 7, and units from byte 1 of the Lunar's 8 bytes", () => {
    expect(decode("settings")).toEqual({
      type: "settings",
      settings: { batteryPercent: 93, unit: "g" },
    });
    expect(decode("settingsTimerStopped")).toMatchObject({ settings: { batteryPercent: 74 } });
    expect(decode("settingsTimerRunning")).toMatchObject({ settings: { batteryPercent: 74 } });
    expect(decode("settingsOunces")).toMatchObject({ settings: { unit: "oz" } });
    expect(decode("settingsLunarOunces")).toEqual({
      type: "settings",
      settings: { batteryPercent: 75, unit: "oz" },
    });
  });

  test("reads units from byte 2 of the Pearl S's 30 bytes", () => {
    expect(decode("settingsPearlS")).toEqual({
      type: "settings",
      settings: { batteryPercent: 100, unit: "g" },
    });
    expect(decode("settingsPearlSOunces")).toMatchObject({ settings: { unit: "oz" } });
  });

  test("leaves a units code it doesn't know undefined", () => {
    expect(decode("settingsUnknownUnit")).toMatchObject({ settings: { unit: undefined } });
  });

  test("ignores settings too short to read", () => {
    expect(decodeMessage({ type: 8, payload: Uint8Array.of(0x5d) })).toBeUndefined();
  });
});

describe("decodeMessage: info", () => {
  test("reads the model code as hex and bytes 2–4 as the firmware", () => {
    expect(decode("infoPearlS")).toEqual({
      type: "info",
      info: { firmware: "1.0.8", modelCode: "035c" },
    });
    expect(decode("infoLunar")).toEqual({
      type: "info",
      info: { firmware: "1.0.19", modelCode: "021a" },
    });
  });

  test("ignores a frame too short to hold them", () => {
    expect(decodeMessage({ type: 7, payload: Uint8Array.of(3, 0x5c, 1, 0) })).toBeUndefined();
  });
});

test("ignores message types sessions do not use", () => {
  expect(decode("unknownType")).toBeUndefined();
});
