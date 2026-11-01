import { describe, expect, test } from "vitest";

import { isOpenPourError } from "../core/errors.js";
import { parseFixture } from "./parseFixture.js";

const HEADER = {
  v: 1,
  brand: "test",
  model: "Synthetic",
  firmware: "0.0.0",
  captured: "2026-11-01",
  tool: "hand-written",
  scenario: "unit",
  scrubbed: true,
};

function jsonl(header: object, ...records: object[]): string {
  return [header, ...records].map((line) => JSON.stringify(line)).join("\n");
}

function protocolError(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isOpenPourError(error) && error.code === "protocol") return error.message;
    throw error;
  }
  throw new Error("expected an OpenPourError");
}

describe("parseFixture", () => {
  test("parses the header and records, ignoring blank lines", () => {
    const text = `${jsonl(
      { ...HEADER, modelYear: 2023 },
      { t: 0, dir: "tx", svc: "s", chr: "w", hex: "EFDD0B" },
      { t: 104, dir: "rx", svc: "s", chr: "n", hex: "efdd0c" },
    )}\n\n`;

    const fixture = parseFixture(text);

    expect(fixture.header.modelYear).toBe(2023);
    expect(fixture.records).toEqual([
      { t: 0, dir: "tx", svc: "s", chr: "w", hex: "EFDD0B" },
      { t: 104, dir: "rx", svc: "s", chr: "n", hex: "efdd0c" },
    ]);
  });

  test.each([
    ["an empty file", "", "empty"],
    ["a non-JSON line", `${jsonl(HEADER)}\nnot json`, "line 2: not JSON"],
    ["a non-object line", "[1, 2]", "not a JSON object"],
    ["another version", jsonl({ ...HEADER, v: 2 }), "unsupported version"],
    ["an unscrubbed capture", jsonl({ ...HEADER, scrubbed: false }), "scrubbed must be true"],
    ["an unknown header key", jsonl({ ...HEADER, phone: "x" }), 'unknown header key "phone"'],
    [
      "a missing header key",
      jsonl({ ...HEADER, firmware: undefined }),
      '"firmware" must be a string',
    ],
    [
      "a non-numeric model year",
      jsonl({ ...HEADER, modelYear: "2023" }),
      '"modelYear" must be a number',
    ],
  ])("rejects %s", (_, text, reason) => {
    expect(protocolError(() => parseFixture(text))).toContain(reason);
  });

  test.each([
    [{ t: "0", dir: "rx", svc: "s", chr: "n", hex: "00" }, "t must be a number"],
    [{ t: 0, dir: "up", svc: "s", chr: "n", hex: "00" }, 'dir must be "tx" or "rx"'],
    [{ t: 0, dir: "rx", svc: 1, chr: "n", hex: "00" }, "svc and chr must be strings"],
    [{ t: 0, dir: "rx", svc: "s", chr: "n", hex: "0g" }, "hex must be pairs"],
    [{ t: 0, dir: "rx", svc: "s", chr: "n", hex: "abc" }, "hex must be pairs"],
  ])("rejects a bad record %#", (record, reason) => {
    expect(protocolError(() => parseFixture(jsonl(HEADER, record)))).toContain(`line 2: ${reason}`);
  });

  test("rejects anything shaped like a MAC address", () => {
    const text = jsonl({ ...HEADER, tool: "capture of AA:bb:cc:01:02:03" });
    expect(protocolError(() => parseFixture(text))).toContain("MAC-shaped");
  });
});

describe("parseFixture session start", () => {
  const FIRST = { t: 104, dir: "rx", svc: "s", chr: "n", hex: "00" };

  test.each([0, 3.25, 104])("accepts %s, no later than the first record", (sessionStartT) => {
    const fixture = parseFixture(jsonl({ ...HEADER, sessionStartT }, FIRST));
    expect(fixture.header.sessionStartT).toBe(sessionStartT);
  });

  test("is optional", () => {
    expect(parseFixture(jsonl(HEADER, FIRST)).header).not.toHaveProperty("sessionStartT");
  });

  test.each([
    ["a string", jsonl({ ...HEADER, sessionStartT: "0" }), "must be a finite number"],
    ["null", jsonl({ ...HEADER, sessionStartT: null }), "must be a finite number"],
    ["1e999", jsonl(HEADER).replace(/}$/, ',"sessionStartT":1e999}'), "must be a finite number"],
    ["after the first record", jsonl({ ...HEADER, sessionStartT: 104.001 }, FIRST), "is after"],
  ])("rejects %s", (_, text, reason) => {
    expect(protocolError(() => parseFixture(text))).toContain(
      `line 1: header "sessionStartT" ${reason}`,
    );
  });
});
