import { describe, expect, test } from "vitest";

import { isOpenPourError, OpenPourError } from "./errors.js";

describe("OpenPourError", () => {
  test("carries its code, message and cause", () => {
    const cause = new Error("bad checksum");
    const error = new OpenPourError("protocol", "frame rejected", { cause });

    expect(error.code).toBe("protocol");
    expect(error.message).toBe("frame rejected");
    expect(error.cause).toBe(cause);
    expect(error.name).toBe("OpenPourError");
  });

  test("is recognised by shape, so a second installed copy still matches", () => {
    const foreign = Object.assign(new Error("tare not supported"), {
      name: "OpenPourError",
      code: "unsupported",
    });

    expect(isOpenPourError(new OpenPourError("timeout", "no heartbeat reply"))).toBe(true);
    expect(isOpenPourError(foreign)).toBe(true);
    expect(isOpenPourError(new Error("other"))).toBe(false);
    expect(isOpenPourError("unsupported")).toBe(false);
  });
});
