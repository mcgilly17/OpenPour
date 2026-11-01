import { bytesToHex, type FixtureHeader, type FixtureRecord, parseFixture } from "openpour/replay";
import type { Packet } from "./startRunner.js";

/** Fixture times keep µs: finer than platform timestamps, without float noise in the diffs. */
export const FIXTURE_TIME_DECIMALS = 3;

/** The header fields a recording can't know by itself. */
export type FixtureDetails = Omit<FixtureHeader, "v" | "scrubbed">;

export interface RecorderOptions {
  /** Shared by every scale in one recording, so their times line up. */
  startT: number;
  /** Tells this scale's fixture apart in a multi-scale recording, e.g. "a". Never a device ID. */
  label: string;
}

export interface ExportedFixture {
  /** `<model>_fw<firmware>_<scenario>.jsonl`, per ADR 0013. */
  fileName: string;
  jsonl: string;
}

export interface Recorder {
  /** Pass every runner `packet` event for this scale. */
  add(packet: Packet): void;
  /** This scale's ADR 0013 fixture, checked with `parseFixture`; the label joins the scenario. */
  export(details: FixtureDetails): ExportedFixture;
}

const UNSAFE_FILE_NAME_CHARS = /[^A-Za-z0-9.-]+/g;

function fileNamePart(value: string): string {
  return value.replace(UNSAFE_FILE_NAME_CHARS, "-");
}

/**
 * Builds the header field by field, so nothing else the caller's object carries can reach it.
 * `scrubbed` is true because a recording holds only the session's own traffic: no addresses,
 * device IDs or other devices. There is no per-driver payload masking yet.
 */
function headerOf(details: FixtureDetails, label: string): FixtureHeader {
  const { brand, model, modelYear, firmware, captured, tool, scenario } = details;
  return {
    v: 1,
    brand,
    model,
    ...(modelYear === undefined ? {} : { modelYear }),
    firmware,
    captured,
    tool,
    scenario: `${scenario}-${label}`,
    scrubbed: true,
  };
}

/** Records one scale's packets for export as a fixture. */
export function createRecorder({ startT, label }: RecorderOptions): Recorder {
  const records: FixtureRecord[] = [];
  return {
    add({ t, dir, svc, chr, bytes }) {
      const relativeT = Number((t - startT).toFixed(FIXTURE_TIME_DECIMALS));
      records.push({ t: relativeT, dir, svc, chr, hex: bytesToHex(bytes) });
    },
    export(details) {
      const header = headerOf(details, label);
      const jsonl = `${[header, ...records].map((line) => JSON.stringify(line)).join("\n")}\n`;
      parseFixture(jsonl);
      const name = [header.model, `fw${header.firmware}`, header.scenario].map(fileNamePart);
      return { fileName: `${name.join("_")}.jsonl`, jsonl };
    },
  };
}
