import { describe, expect, test } from "vitest";

import { bytesToHex } from "../../replay/replay.js";
import { ACAIA_COMMAND_VECTORS } from "../../test/acaiaVectors.js";
import { type AcaiaCommand, commands } from "./commands.js";
import { checksum, encodeFrame } from "./encodeFrame.js";

describe("encodeFrame", () => {
  test("sums even and odd bytes separately, keeping one byte each", () => {
    expect(checksum(Uint8Array.of(0xff, 0x01, 0x02, 0xff))).toEqual([0x01, 0x00]);
    expect(bytesToHex(encodeFrame(0x04, Uint8Array.of(0x00)))).toBe("efdd04000000");
  });
});

describe("commands", () => {
  test.each(Object.entries(ACAIA_COMMAND_VECTORS))("%s matches the public vector", (name, hex) => {
    expect(bytesToHex(commands[name as AcaiaCommand]())).toBe(hex);
  });

  test("returns a fresh array each call", () => {
    const first = commands.tare();
    first[0] = 0;
    expect(commands.tare()[0]).toBe(0xef);
  });
});
