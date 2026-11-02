import { bytesToHex, type FixtureHeader, type FixtureRecord, parseFixture } from "openpour/replay";
import type { Packet } from "./startRunner.js";

/** Fixture times keep µs: finer than platform timestamps, without float noise in the diffs. */
export const FIXTURE_TIME_DECIMALS = 3;

/** The header fields a recording can't know by itself. */
export type FixtureDetails = Omit<FixtureHeader, "v" | "scrubbed" | "sessionStartT">;

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
  /** Pass the runner's `started` time for this scale; it becomes the header's `sessionStartT`. */
  sessionStarted(t: number): void;
  /** Pass every runner `packet` event for this scale. */
  add(packet: Packet): void;
  /** Whether any packet was added, i.e. whether there is anything to lose by discarding this. */
  hasPackets(): boolean;
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
function headerOf(
  details: FixtureDetails,
  label: string,
  sessionStartT: number | undefined,
): FixtureHeader {
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
    ...(sessionStartT === undefined ? {} : { sessionStartT }),
  };
}

/** Records one scale's session start and packets for export as a fixture. */
export function createRecorder({ startT, label }: RecorderOptions): Recorder {
  const records: FixtureRecord[] = [];
  let sessionStartT: number | undefined;
  const relative = (t: number): number => Number((t - startT).toFixed(FIXTURE_TIME_DECIMALS));
  return {
    sessionStarted(t) {
      sessionStartT = relative(t);
    },
    add({ t, dir, svc, chr, bytes }) {
      records.push({ t: relative(t), dir, svc, chr, hex: bytesToHex(bytes) });
    },
    hasPackets: () => records.length > 0,
    export(details) {
      const header = headerOf(details, label, sessionStartT);
      // A write arrives once it succeeds, after packets received while it was in flight. The sort
      // is stable, so packets with the same time keep their order.
      const inTimeOrder = records.toSorted((a, b) => a.t - b.t);
      const jsonl = `${[header, ...inTimeOrder].map((line) => JSON.stringify(line)).join("\n")}\n`;
      parseFixture(jsonl);
      const name = [header.model, `fw${header.firmware}`, header.scenario].map(fileNamePart);
      return { fileName: `${name.join("_")}.jsonl`, jsonl };
    },
  };
}
