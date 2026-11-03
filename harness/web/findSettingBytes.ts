import type { CaptureFrames, KindInCapture } from "./captureFrames.js";
import { spacedHex } from "./describeRun.js";

/** What one step read after setting `option`. The last step repeats the first option. */
export interface StepFrames {
  option: string;
  frames: CaptureFrames;
}

/** One frame byte that changed between steps, or a kind of frame some steps never saw. */
export interface Finding {
  /** The frame's kind, as hex. */
  kind: string;
  /** The byte's index in the frame; null for a kind missing from some steps. */
  index: number | null;
  /** The byte under each option, as hex; "--" where that frame was too short to have it. */
  values: Readonly<Record<string, string>>;
  /** Steady within each step, different between options, and back again on the repeat. */
  follows: boolean;
  /** e.g. "follows Sound: on 01 · off 00". */
  note: string;
}

const NO_BYTE = "--";

function byteAt(frame: string, index: number): string {
  return frame.slice(index * 2, index * 2 + 2) || NO_BYTE;
}

/** "on", "off", then "on again" for the repeat. */
function stepLabels(steps: readonly StepFrames[]): string[] {
  return steps.map(({ option }, i) => (i === steps.length - 1 ? `${option} again` : option));
}

/** e.g. "on 01 · off 00". */
function listValues(labels: readonly string[], bytes: readonly string[]): string {
  return labels.map((label, i) => `${label} ${bytes[i]}`).join(" · ");
}

function missingKind(kind: string, steps: readonly StepFrames[]): Finding {
  const labels = stepLabels(steps);
  const missing = steps.flatMap(({ frames }, i) =>
    frames[kind] ? [] : [`step ${i + 1} (${labels[i]})`],
  );
  const note = `not seen in every step: missing from ${missing.join(", ")}`;
  return { kind, index: null, values: {}, follows: false, note };
}

function byteFinding(
  setting: string,
  kind: string,
  index: number,
  steps: readonly StepFrames[],
  bytes: readonly string[],
): Finding {
  const options = steps.slice(0, -1).map(({ option }) => option);
  const values = Object.fromEntries(options.map((option, i) => [option, bytes[i] ?? NO_BYTE]));
  const isBackOnRepeat = bytes.at(-1) === bytes[0];
  const follows = isBackOnRepeat && new Set(Object.values(values)).size > 1;
  const note = follows
    ? `follows ${setting}: ${listValues(options, bytes)}`
    : `changed, but not with ${setting}: ${listValues(stepLabels(steps), bytes)}`;
  return { kind, index, values, follows, note };
}

/** The bytes of one kind, seen in every step, that differ between steps and stay put within each. */
function byteFindings(
  setting: string,
  kind: string,
  steps: readonly StepFrames[],
  seen: readonly KindInCapture[],
): Finding[] {
  const live = new Set(seen.flatMap(({ varying }) => varying));
  const length = Math.max(...seen.map(({ frame }) => frame.length / 2));
  return Array.from({ length }, (_, index) => index).flatMap((index) => {
    const bytes = seen.map(({ frame }) => byteAt(frame, index));
    const isSteady = bytes.every((byte) => byte === bytes[0]);
    return live.has(index) || isSteady ? [] : [byteFinding(setting, kind, index, steps, bytes)];
  });
}

/**
 * Which frame bytes follow `setting` across `steps`, by kind of frame. Bytes that vary within a
 * step are live data, such as weight, and never count.
 */
export function findSettingBytes(setting: string, steps: readonly StepFrames[]): Finding[] {
  const kinds = [...new Set(steps.flatMap(({ frames }) => Object.keys(frames)))].sort();
  return kinds.flatMap((kind) => {
    const seen = steps.flatMap(({ frames }) => frames[kind] ?? []);
    return seen.length < steps.length
      ? [missingKind(kind, steps)]
      : byteFindings(setting, kind, steps, seen);
  });
}

function describeFinding({ kind, index, note }: Finding): string {
  const frame = `Frame ${spacedHex(kind)}`;
  return index === null
    ? `${frame} ${note}`
    : `${frame} (seen in every step), byte ${index} ${note}`;
}

/** The result as lines, bytes that follow the setting first. */
export function describeFindings(setting: string, findings: readonly Finding[]): string[] {
  const following = findings.filter(({ follows }) => follows);
  const others = findings.filter(({ follows }) => !follows);
  const summary =
    following.length === 0 ? [`${setting} didn't change anything the scale sent.`] : [];
  return [...summary, ...[...following, ...others].map(describeFinding)];
}
