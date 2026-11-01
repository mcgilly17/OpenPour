import { OpenPourError } from "../core/errors.js";

export interface FixtureHeader {
  v: 1;
  brand: string;
  model: string;
  modelYear?: number;
  firmware: string;
  captured: string;
  tool: string;
  scenario: string;
  scrubbed: true;
  /** When `session.start` was called, on the records' time base (ADR 0018). */
  sessionStartT?: number;
}

export interface FixtureRecord {
  /** ms since the capture started */
  t: number;
  dir: "tx" | "rx";
  svc: string;
  chr: string;
  hex: string;
}

export interface Fixture {
  header: FixtureHeader;
  records: FixtureRecord[];
}

const REQUIRED_STRING_KEYS = [
  "brand",
  "model",
  "firmware",
  "captured",
  "tool",
  "scenario",
] as const;
const HEADER_KEYS = new Set<string>([
  "v",
  "modelYear",
  "scrubbed",
  "sessionStartT",
  ...REQUIRED_STRING_KEYS,
]);
// A hardware address in a public fixture means the capture wasn't scrubbed (ADR 0013).
const MAC_ADDRESS = /([0-9a-f]{2}:){5}[0-9a-f]{2}/i;
const HEX = /^(?:[0-9a-f]{2})*$/i;

function fail(line: number, reason: string): never {
  throw new OpenPourError("protocol", `fixture line ${line}: ${reason}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLine(text: string, line: number): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new OpenPourError("protocol", `fixture line ${line}: not JSON`, { cause });
  }
  if (!isObject(value)) fail(line, "not a JSON object");
  return value;
}

function checkHeader(value: Record<string, unknown>): FixtureHeader {
  const unknownKey = Object.keys(value).find((key) => !HEADER_KEYS.has(key));
  if (unknownKey) fail(1, `unknown header key "${unknownKey}"`);
  if (value.v !== 1) fail(1, "unsupported version, expected v: 1");
  if (value.scrubbed !== true) fail(1, "scrubbed must be true");
  for (const key of REQUIRED_STRING_KEYS) {
    if (typeof value[key] !== "string") fail(1, `header "${key}" must be a string`);
  }
  if (value.modelYear !== undefined && typeof value.modelYear !== "number") {
    fail(1, `header "modelYear" must be a number`);
  }
  // Number.isFinite never coerces, so it rejects strings, and JSON's 1e999 (Infinity) too.
  if (value.sessionStartT !== undefined && !Number.isFinite(value.sessionStartT)) {
    fail(1, `header "sessionStartT" must be a finite number`);
  }
  return value as unknown as FixtureHeader;
}

// Replay starts the session at sessionStartT, so a record before it would reach the session first.
function checkSessionStart(fixture: Fixture): Fixture {
  const { sessionStartT } = fixture.header;
  const first = fixture.records[0];
  if (sessionStartT !== undefined && first !== undefined && sessionStartT > first.t) {
    fail(1, `header "sessionStartT" is after the first record`);
  }
  return fixture;
}

function checkRecord(value: Record<string, unknown>, line: number): FixtureRecord {
  const { t, dir, svc, chr, hex } = value;
  if (typeof t !== "number" || !Number.isFinite(t)) fail(line, "t must be a number");
  if (dir !== "tx" && dir !== "rx") fail(line, `dir must be "tx" or "rx"`);
  if (typeof svc !== "string" || typeof chr !== "string") fail(line, "svc and chr must be strings");
  if (typeof hex !== "string" || !HEX.test(hex)) fail(line, "hex must be pairs of hex digits");
  return { t, dir, svc, chr, hex };
}

/** Parses and validates a JSONL fixture: a header line, then one line per raw packet. */
export function parseFixture(jsonl: string): Fixture {
  if (MAC_ADDRESS.test(jsonl)) {
    throw new OpenPourError("protocol", "fixture contains a MAC-shaped string; scrub it");
  }
  const lines = jsonl.split("\n").filter((line) => line.trim() !== "");
  const [first, ...rest] = lines;
  if (first === undefined) throw new OpenPourError("protocol", "fixture is empty");
  return checkSessionStart({
    header: checkHeader(parseLine(first, 1)),
    records: rest.map((text, i) => checkRecord(parseLine(text, i + 2), i + 2)),
  });
}
