import type { Command, GattLayout, Reading, ScaleEvent } from "../core/types.js";
import { acaia } from "../drivers/acaia/acaia.js";
import type { Fixture, FixtureRecord } from "../replay/parseFixture.js";
import { bytesToHex, type ReplayResult, replay } from "../replay/replay.js";

export const SVC = "49535343-FE7D-4AE5-8FA9-9FAFD205E455";
export const WRITE = "49535343-8841-43F4-A8D4-ECBE34729BB3";
export const NOTIFY = "49535343-1E4D-4BD9-BA61-23C647249616";

export const NEW_STYLE_GATT: GattLayout = [
  { uuid: "180A", characteristics: [{ uuid: "2A29", properties: ["read"] }] },
  {
    uuid: SVC,
    characteristics: [
      { uuid: WRITE, properties: ["write", "writeWithoutResponse"] },
      { uuid: NOTIFY, properties: ["notify"] },
    ],
  },
];
export const OLD_STYLE_GATT: GattLayout = [
  { uuid: "0x1820", characteristics: [{ uuid: "2A80", properties: ["notify", "write"] }] },
];

export function rx(t: number, hex: string, chr: string = NOTIFY): FixtureRecord {
  return { t, dir: "rx", svc: SVC, chr, hex };
}

/** A hand-written fixture of `records`, starting the session at 0. */
export function synthetic(...records: FixtureRecord[]): Fixture {
  return {
    header: {
      v: 1,
      brand: "Acaia",
      model: "Synthetic",
      firmware: "0.0.0",
      captured: "2026-11-01",
      tool: "hand-written",
      scenario: "unit",
      scrubbed: true,
      sessionStartT: 0,
    },
    records,
  };
}

export function hexOf(command: Command): string {
  return command.type === "write" ? bytesToHex(command.bytes) : command.type;
}

export interface AcaiaRun extends ReplayResult {
  /** The session's commands at `t`, writes as hex. */
  writesAt(t: number): string[];
  /** When the session wrote `hex`. */
  timesOf(hex: string): number[];
  eventsOf<T extends ScaleEvent["type"]>(type: T): Extract<ScaleEvent, { type: T }>[];
  readings(): Reading[];
}

/** Replays `fixture` through a fresh Acaia session for `gatt`. */
export function runAcaia(fixture: Fixture, gatt: GattLayout = NEW_STYLE_GATT): AcaiaRun {
  const result = replay(acaia.createSession(gatt), fixture);
  const eventsOf = <T extends ScaleEvent["type"]>(type: T) =>
    result.events.flatMap(({ event }) =>
      event.type === type ? [event as Extract<ScaleEvent, { type: T }>] : [],
    );
  return {
    ...result,
    writesAt: (t) => result.commands.filter((c) => c.t === t).map((c) => hexOf(c.command)),
    timesOf: (hex) => result.commands.filter((c) => hexOf(c.command) === hex).map((c) => c.t),
    eventsOf,
    readings: () => eventsOf("reading").map(({ reading }) => reading),
  };
}
