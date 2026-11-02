import { createRecorder, type Recorder } from "../runner/createRecorder.js";

/** "listen-only" holds what arrived before any session started; "session" what a session did. */
export type RecordingKind = "session" | "listen-only";

export interface Recording {
  /** 1, 2, 3… within one scale's panel. */
  readonly id: number;
  readonly kind: RecordingKind;
  readonly brand: string;
  /** The page's shared start, which every time on the panel counts from. */
  readonly startT: number;
  readonly recorder: Recorder;
  /** Still receiving packets: the connection is open and no later recording has started. */
  isLive: boolean;
  /** The latest export's file name. */
  exportedAs?: string;
}

export interface RecordingsOptions {
  /** Tells scales apart in fixture names: "a", "b"… Never a device ID. */
  label: string;
  /** The page's shared start, so every recording's times line up. */
  recordingStartT: () => number;
}

/** One scale's recordings, kept until discarded, so a reconnect never loses one. */
export interface Recordings {
  /** Ends the live recording, if any, and starts the next. */
  start(kind: RecordingKind, brand: string): Recording;
  find(id: number): Recording | undefined;
  /** Drops an ended recording for good; returns false, keeping it, for the live one. */
  discard(id: number): boolean;
  all(): readonly Recording[];
}

export function createRecordings({ label, recordingStartT }: RecordingsOptions): Recordings {
  let kept: Recording[] = [];
  let nextId = 1;
  return {
    start(kind, brand) {
      for (const recording of kept) recording.isLive = false;
      const startT = recordingStartT();
      const recorder = createRecorder({ startT, label });
      const recording: Recording = { id: nextId++, kind, brand, startT, recorder, isLive: true };
      kept.push(recording);
      return recording;
    },
    find: (id) => kept.find((recording) => recording.id === id),
    discard(id) {
      const before = kept.length;
      kept = kept.filter((recording) => recording.id !== id || recording.isLive);
      return kept.length < before;
    },
    all: () => kept,
  };
}

/**
 * e.g. "#1 listen-only, ended, 3 packets, exported as Lunar_fw1.0_type-7-a.jsonl". A live one has
 * no count: the list is redrawn only when a recording starts, ends or exports, so its buttons stay
 * clickable while packets stream in.
 */
export function describeRecording({ id, kind, recorder, isLive, exportedAs }: Recording): string {
  const status = isLive ? "live" : `ended, ${recorder.records().length} packets`;
  const parts = [`#${id} ${kind}`, status];
  if (exportedAs) parts.push(`exported as ${exportedAs}`);
  return parts.join(", ");
}
