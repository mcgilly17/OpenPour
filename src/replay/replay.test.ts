import { describe, expect, test } from "vitest";

import { isOpenPourError } from "../core/errors.js";
import type { ScaleSession, Step } from "../core/types.js";
import type { Fixture, FixtureRecord } from "./parseFixture.js";
import { bytesToHex, compareWrites, hexToBytes, replay } from "./replay.js";

const HEARTBEAT_MS = 1000;
const HEARTBEAT = new Uint8Array([0xef, 0xdd, 0x00]);

function fixture(...records: FixtureRecord[]): Fixture {
  return {
    header: {
      v: 1,
      brand: "test",
      model: "Synthetic",
      firmware: "0.0.0",
      captured: "2026-11-01",
      tool: "hand-written",
      scenario: "unit",
      scrubbed: true,
    },
    records,
  };
}

function rx(t: number, hex: string): FixtureRecord {
  return { t, dir: "rx", svc: "s", chr: "n", hex };
}

function tx(t: number, hex: string): FixtureRecord {
  return { t, dir: "tx", svc: "s", chr: "w", hex };
}

/** Subscribes on start, reports each packet's first byte as grams, and heartbeats every second. */
function fakeSession(
  nextWake: (t: number) => number | undefined = (t) => t + HEARTBEAT_MS,
): ScaleSession {
  const heartbeat = (t: number): Step => {
    const wakeAt = nextWake(t);
    return {
      events: [],
      commands: [{ type: "write", svc: "s", chr: "w", bytes: HEARTBEAT, mode: "noResponse" }],
      ...(wakeAt === undefined ? {} : { wakeAt }),
    };
  };
  const idle: Step = { events: [], commands: [] };
  return {
    info: { brand: "test", model: "Synthetic" },
    capabilities: { tare: false, timer: false, battery: false, resolutionGrams: 1, maxRateHz: 10 },
    start: (t) => ({
      events: [{ type: "state", state: "handshaking" }],
      commands: [{ type: "subscribe", svc: "s", chr: "n" }],
      wakeAt: t + HEARTBEAT_MS,
    }),
    receive: (_chr, bytes, t) => ({
      events: [
        { type: "reading", reading: { t, grams: bytes[0] ?? 0, stable: true, flowGramsPerSec: 0 } },
      ],
      commands: [],
      wakeAt: Math.ceil(t / HEARTBEAT_MS) * HEARTBEAT_MS || HEARTBEAT_MS,
    }),
    tick: heartbeat,
    tare: () => idle,
    timer: { start: () => idle, stop: () => idle, reset: () => idle },
    requestBattery: () => idle,
  };
}

describe("replay", () => {
  test("feeds rx packets in order with their recorded time, skipping tx", () => {
    const result = replay(fakeSession(), fixture(tx(0, "aa"), rx(100, "12"), rx(250, "13")));

    expect(result.events).toEqual([
      { t: 0, event: { type: "state", state: "handshaking" } },
      {
        t: 100,
        event: {
          type: "reading",
          reading: { t: 100, grams: 0x12, stable: true, flowGramsPerSec: 0 },
        },
      },
      {
        t: 250,
        event: {
          type: "reading",
          reading: { t: 250, grams: 0x13, stable: true, flowGramsPerSec: 0 },
        },
      },
    ]);
    expect(result.commands[0]).toEqual({
      t: 0,
      command: { type: "subscribe", svc: "s", chr: "n" },
    });
  });

  test("ticks at each due wake-up before the next packet, and not after the recording ends", () => {
    const result = replay(fakeSession(), fixture(rx(0, "01"), rx(2500, "02")));

    const ticks = result.commands
      .filter(({ command }) => command.type === "write")
      .map(({ t }) => t);
    expect(ticks).toEqual([1000, 2000]);
  });

  test("stops ticking when the session no longer asks", () => {
    const result = replay(
      fakeSession(() => undefined),
      fixture(rx(0, "01"), rx(5000, "02")),
    );

    const ticks = result.commands
      .filter(({ command }) => command.type === "write")
      .map(({ t }) => t);
    expect(ticks).toEqual([1000]);
  });

  test("rejects a session that asks to wake in the past", () => {
    try {
      replay(
        fakeSession((t) => t),
        fixture(rx(0, "01"), rx(5000, "02")),
      );
      expect.unreachable();
    } catch (error) {
      expect(isOpenPourError(error) && error.code).toBe("protocol");
    }
  });

  test("replays an empty fixture as just the start step", () => {
    expect(replay(fakeSession(), fixture()).events).toHaveLength(1);
  });

  test("compares the session's writes with the recorded tx packets", () => {
    const recorded = fixture(rx(0, "01"), tx(1000, "EFDD00"), rx(1500, "02"));
    const result = replay(fakeSession(), recorded);

    expect(compareWrites(result, recorded)).toEqual({ expected: ["efdd00"], produced: ["efdd00"] });
  });
});

describe("hex helpers", () => {
  test("round-trip bytes", () => {
    expect(bytesToHex(hexToBytes("00ff7aEF"))).toBe("00ff7aef");
    expect(hexToBytes("")).toEqual(new Uint8Array());
  });
});
