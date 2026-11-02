import { type FixtureDetails, fileNamePart } from "../runner/createRecorder.js";
import { compareRuns, hexByte, type PacketRun } from "./comparePackets.js";
import type { RunPattern } from "./findEarlierRuns.js";
import type { SavedScaleDetails } from "./savedScales.js";

/** The investigation scenario every capture exports its recording as. */
export const SWEEP_SCENARIO = "settings-change";

/** The setting that names a sweep's baseline; without one, the first capture is the baseline. */
export const BASELINE_SETTING = "baseline";

export const NO_MATCHING_FRAME =
  "No matching frame in this recording yet. Ask the scale for it, for example with a driver command such as Request battery, then capture again.";

/** One capture: the setting just changed, the tracked frame that followed, and its evidence. */
export interface SweepRow {
  setting: string;
  value: string;
  run: PacketRun;
  /** The fixture the capture exported its recording as. */
  fixtureFile: string;
}

/** One scale's settings sweep, kept with its recordings. */
export interface Sweep {
  /** The frame each capture looks for, taken from the A mark. */
  tracked: RunPattern | undefined;
  rows: readonly SweepRow[];
  /** Why the latest capture or export did nothing. */
  problem: string | undefined;
}

export const EMPTY_SWEEP: Sweep = { tracked: undefined, rows: [], problem: undefined };

/** The sweep's clicks. Capture and export carry the export form's answers, from `sweepAnswers`. */
export type SweepAction =
  | { type: "track"; run: PacketRun; prefixBytes: number }
  | { type: "capture"; setting: string; value: string; answers: FormData }
  | { type: "remove"; index: number }
  | { type: "export"; answers: FormData };

/** A byte where a frame differs from the baseline's, in hex; "--" on the side without it. */
export interface ByteChange {
  index: number;
  from: string;
  to: string;
}

export function hexOf(bytes: readonly number[]): string {
  return bytes.map(hexByte).join("");
}

export function frameHex({ records }: PacketRun): string {
  return records.map(({ hex }) => hex).join("");
}

/** The row named "baseline", else the first. */
export function baselineOf(rows: readonly SweepRow[]): SweepRow | undefined {
  return rows.find(({ setting }) => setting.toLowerCase() === BASELINE_SETTING) ?? rows[0];
}

export function changesFrom(baseline: SweepRow, row: SweepRow): ByteChange[] {
  return compareRuns(baseline.run.records, row.run.records).flatMap(
    ({ index, a, b, isDifferent }) =>
      isDifferent ? [{ index, from: hexByte(a), to: hexByte(b) }] : [],
  );
}

/** e.g. "byte 5: 02 → 05, byte 12: 0d → 10". */
export function describeChanges(changes: readonly ByteChange[]): string {
  if (changes.length === 0) return "no change";
  return changes.map(({ index, from, to }) => `byte ${index}: ${from} → ${to}`).join(", ");
}

/** "auto-off" and "10 min" make "auto-off-10-min", a capture's scenario detail. */
export function sweepDetail(setting: string, value: string): string {
  return `${setting}-${value}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The export form's `answers` with the saved scale's details over them, as a sweep exports. */
export function sweepAnswers(answers: FormData, saved: SavedScaleDetails | undefined): FormData {
  if (saved) {
    for (const name of ["model", "modelYear", "firmware"] as const) answers.set(name, saved[name]);
  }
  answers.set("scenario", SWEEP_SCENARIO);
  answers.delete("scenarioDetail");
  return answers;
}

export interface SweepFile {
  /** `<model>_fw<firmware>_settings-sweep.json`, like a fixture's name. */
  fileName: string;
  json: string;
}

/**
 * The sweep as one JSON file: a header, then every row with the bytes it changed. Built field by
 * field from `details`, whose brand is the card's public name, so no device ID, nickname or
 * Device Information can reach it.
 */
export function sweepFile(sweep: Sweep, details: FixtureDetails, exportedAt: string): SweepFile {
  const { brand, model, modelYear, firmware } = details;
  const baseline = baselineOf(sweep.rows);
  const header = {
    scale: brand,
    model,
    ...(modelYear === undefined ? {} : { modelYear }),
    firmware,
    trackedPrefix: hexOf(sweep.tracked?.prefix ?? []),
    exportedAt,
  };
  const rows = sweep.rows.map((row) => ({
    setting: row.setting,
    value: row.value,
    frameHex: frameHex(row.run),
    fixtureFile: row.fixtureFile,
    changes: baseline ? changesFrom(baseline, row) : [],
  }));
  const name = [model, `fw${firmware}`, "settings-sweep"].map(fileNamePart).join("_");
  return { fileName: `${name}.json`, json: `${JSON.stringify({ header, rows }, null, 2)}\n` };
}
