import { acaia } from "openpour/acaia";
import { describe, expect, test } from "vitest";

import { explainConnectFailure, isOutOfRange } from "./explainFailure.js";

const OUT_OF_RANGE = new DOMException("Bluetooth Device is no longer in range.", "NetworkError");

describe("explainConnectFailure", () => {
  test("adds a full stop only when the browser's message lacks one", () => {
    const timedOut = new Error("connect timed out after 10000 ms");

    expect(explainConnectFailure(OUT_OF_RANGE, acaia)).not.toContain("..");
    expect(explainConnectFailure(timedOut, acaia)).toMatch(
      /^Couldn't connect: connect timed out after 10000 ms\. Check/,
    );
  });

  test("an out-of-range scale is first told to wait if it was just switched on", () => {
    expect(explainConnectFailure(OUT_OF_RANGE, acaia)).toMatch(
      /^Couldn't connect: NetworkError: Bluetooth Device is no longer in range\. If you just switched the scale on, wait a few seconds/,
    );
  });
});

describe("isOutOfRange", () => {
  test("matches only the browser's out-of-range NetworkError", () => {
    const dropped = new DOMException("GATT Server is disconnected.", "NetworkError");

    expect(isOutOfRange(OUT_OF_RANGE)).toBe(true);
    expect(isOutOfRange(dropped)).toBe(false);
    expect(isOutOfRange(new Error("Bluetooth Device is no longer in range."))).toBe(false);
  });
});
