import { OpenPourError } from "../core/errors.js";
import type { Command, ScaleEvent, ScaleSession, Step } from "../core/types.js";
import type { Fixture } from "./parseFixture.js";

export interface TimedEvent {
  t: number;
  event: ScaleEvent;
}

export interface TimedCommand {
  t: number;
  command: Command;
}

export interface ReplayResult {
  events: TimedEvent[];
  commands: TimedCommand[];
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Plays a fixture's "rx" packets into a session at their recorded times, ticking whenever a
 * requested wake-up falls due, exactly as an app's glue would. The session starts at the header's
 * `sessionStartT`, or at the first record when the header has none (ADR 0018). Wake-ups after the
 * last packet are not run: the recording ended there.
 */
export function replay(session: ScaleSession, fixture: Fixture): ReplayResult {
  const result: ReplayResult = { events: [], commands: [] };
  let wakeAt: number | undefined;

  function apply(step: Step, t: number): void {
    for (const event of step.events) result.events.push({ t, event });
    for (const command of step.commands) result.commands.push({ t, command });
    wakeAt = step.wakeAt;
  }

  function tickUntil(t: number): void {
    while (wakeAt !== undefined && wakeAt <= t) {
      const due = wakeAt;
      apply(session.tick(due), due);
      // A session that keeps asking to wake at or before now would spin forever.
      if (wakeAt !== undefined && wakeAt <= due) {
        throw new OpenPourError(
          "protocol",
          `session asked to wake at ${wakeAt} after ticking at ${due}`,
        );
      }
    }
  }

  const startT = fixture.header.sessionStartT ?? fixture.records[0]?.t ?? 0;
  apply(session.start(startT), startT);
  for (const record of fixture.records) {
    tickUntil(record.t);
    if (record.dir === "rx")
      apply(session.receive(record.chr, hexToBytes(record.hex), record.t), record.t);
  }
  return result;
}

/** The session's writes next to the fixture's recorded "tx" packets, as hex, for a toEqual check. */
export function compareWrites(
  result: ReplayResult,
  fixture: Fixture,
): { expected: string[]; produced: string[] } {
  return {
    expected: fixture.records.filter((r) => r.dir === "tx").map((r) => r.hex.toLowerCase()),
    produced: result.commands.flatMap(({ command }) =>
      command.type === "write" ? [bytesToHex(command.bytes)] : [],
    ),
  };
}
