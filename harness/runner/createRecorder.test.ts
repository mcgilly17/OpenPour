import { acaia, NEW_STYLE_HEARTBEAT_MS, SUBSCRIBE_SETTLE_MS } from "openpour/acaia";
import {
  bytesToHex,
  type FixtureRecord,
  hexToBytes,
  parseFixture,
  type ReplayResult,
  replay,
  type TimedEvent,
} from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT, ACAIA_NOTIFY, ACAIA_SVC } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { createFakeSource } from "./createFakeSource.js";
import { createRecorder, type FixtureDetails } from "./createRecorder.js";
import { startRunner } from "./startRunner.js";

const DETAILS: FixtureDetails = {
  brand: "Acaia",
  model: "Pearl S",
  firmware: "1.0",
  captured: "2026-11-01",
  tool: "fake source",
  scenario: "split frame",
};
const DECODED = new Set(["reading", "timer", "button", "battery"]);

afterEach(() => {
  vi.useRealTimers();
});

/** A live event moved onto the recording's time base, where replay reports it. */
function relativeTo(startT: number, { t, event }: TimedEvent): TimedEvent {
  if (event.type !== "reading") return { t: t - startT, event };
  return { t: t - startT, event: { ...event, reading: { ...event.reading, t: t - startT } } };
}

/** The session's writes during replay, shaped like the fixture's "tx" records. */
function replayedWrites({ commands }: ReplayResult): FixtureRecord[] {
  return commands.flatMap(({ t, command }) =>
    command.type === "write"
      ? [{ t, dir: "tx", svc: command.svc, chr: command.chr, hex: bytesToHex(command.bytes) }]
      : [],
  );
}

describe("createRecorder", () => {
  test("keeps packet boundaries, with times relative to the start", () => {
    const recorder = createRecorder({ startT: 1000.25, label: "a" });
    recorder.add({ t: 1100.35, dir: "rx", svc: "s", chr: "n", bytes: Uint8Array.of(0xef, 0xdd) });
    recorder.add({ t: 1100.45, dir: "rx", svc: "s", chr: "n", bytes: Uint8Array.of(0x0c) });
    recorder.add({ t: 1200.25, dir: "tx", svc: "s", chr: "w", bytes: Uint8Array.of(0x00) });

    expect(parseFixture(recorder.export(DETAILS).jsonl).records).toEqual([
      { t: 100.1, dir: "rx", svc: "s", chr: "n", hex: "efdd" },
      { t: 100.2, dir: "rx", svc: "s", chr: "n", hex: "0c" },
      { t: 200, dir: "tx", svc: "s", chr: "w", hex: "00" },
    ]);
  });

  test("exports only ADR 0013 header fields, named per scale", () => {
    const withDeviceId = { ...DETAILS, modelYear: 2023, deviceId: "temporary-id" };

    const exported = createRecorder({ startT: 0, label: "left" }).export(withDeviceId);

    expect(parseFixture(exported.jsonl).header).toEqual({
      v: 1,
      ...DETAILS,
      modelYear: 2023,
      scenario: "split frame-left",
      scrubbed: true,
    });
    expect(exported.jsonl).not.toContain("temporary-id");
    expect(exported.fileName).toBe("Pearl-S_fw1.0_split-frame-left.jsonl");
  });

  test("refuses an export that parseFixture would reject", () => {
    const recorder = createRecorder({ startT: 0, label: "a" });
    expect(() => recorder.export({ ...DETAILS, tool: "AA:BB:CC:DD:EE:FF" })).toThrow("MAC-shaped");
  });

  test("a live recording replays through the Acaia driver with the same decoded events", async () => {
    const startT = 10_000;
    const clock = useFakeClock(startT);
    const source = createFakeSource(clock);
    const recorder = createRecorder({ startT, label: "a" });
    const live: TimedEvent[] = [];
    startRunner({
      source,
      session: acaia.createSession(ACAIA_GATT),
      clock,
      onEvent(event) {
        if (event.type === "packet") recorder.add(event.packet);
        if (event.type === "scale") live.push(relativeTo(startT, event));
      },
    });
    const traffic: [number, string][] = [
      [300, RX.weight],
      [450, RX.settings],
      [700, RX.buttonStart],
      [1200, RX.timer],
      [1500, RX.ackWithNegativeWeight],
      [1800, RX.weight.slice(0, 16)],
      [1810, RX.weight.slice(16)],
      [2600, RX.buttonStop],
    ];
    for (const [t, hex] of traffic) {
      await advanceTo(clock, startT + t);
      source.notify(ACAIA_SVC, ACAIA_NOTIFY, hexToBytes(hex));
    }

    const fixture = parseFixture(recorder.export(DETAILS).jsonl);
    const replayed = replay(acaia.createSession(ACAIA_GATT), fixture);

    const records = (dir: string) => fixture.records.filter((r) => r.dir === dir);
    expect(records("rx").map(({ t, hex }) => [t, hex])).toEqual(traffic);
    expect(records("tx").map(({ t }) => t)).toEqual([100, 100, 1100, 1100, 2100, 2100]);
    const decoded = (events: TimedEvent[]) => events.filter(({ event }) => DECODED.has(event.type));
    expect(decoded(live)).toHaveLength(12);
    expect(decoded(replayed.events)).toEqual(decoded(live));
  });

  test("a live recording replays from its session start with the same writes, times and events", async () => {
    // The recording began 250 ms before this session, as it does for a second scale.
    const recordingStartT = 9750;
    const sessionStartT = 10_000;
    const clock = useFakeClock(sessionStartT);
    const source = createFakeSource(clock);
    const recorder = createRecorder({ startT: recordingStartT, label: "b" });
    const live: TimedEvent[] = [];
    startRunner({
      source,
      session: acaia.createSession(ACAIA_GATT),
      clock,
      onEvent(event) {
        if (event.type === "started") recorder.sessionStarted(event.t);
        if (event.type === "packet") recorder.add(event.packet);
        if (event.type === "scale") live.push(relativeTo(recordingStartT, event));
      },
    });
    const traffic: [number, string][] = [
      [300, RX.weight],
      [450, RX.settings],
      [700, RX.buttonStart],
      [1500, RX.timer],
      [1800, RX.weight.slice(0, 16)],
      [1810, RX.weight.slice(16)],
      [2600, RX.ackWithNegativeWeight],
      [3300, RX.buttonStop],
    ];
    for (const [t, hex] of traffic) {
      await advanceTo(clock, sessionStartT + t);
      source.notify(ACAIA_SVC, ACAIA_NOTIFY, hexToBytes(hex));
    }
    // End the recording on a heartbeat, which replay must still produce.
    await advanceTo(clock, sessionStartT + SUBSCRIBE_SETTLE_MS + 4 * NEW_STYLE_HEARTBEAT_MS);

    const fixture = parseFixture(recorder.export(DETAILS).jsonl);
    const replayed = replay(acaia.createSession(ACAIA_GATT), fixture);

    const recordedWrites = fixture.records.filter((r) => r.dir === "tx");
    expect(fixture.header.sessionStartT).toBe(sessionStartT - recordingStartT);
    expect(recordedWrites.filter(({ hex }) => hex === TX.heartbeat)).toHaveLength(4);
    expect(fixture.records.at(-1)?.hex).toBe(TX.notificationRequest);
    expect(replayedWrites(replayed)).toEqual(recordedWrites);
    expect(replayed.events.filter(({ event }) => DECODED.has(event.type))).toHaveLength(12);
    expect(replayed.events).toEqual(live);
  });
});
