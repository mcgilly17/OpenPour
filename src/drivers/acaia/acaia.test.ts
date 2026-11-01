import { describe, expect, test } from "vitest";

import { isOpenPourError } from "../../core/errors.js";
import type { Command, GattLayout, ScaleSession } from "../../core/types.js";
import type { Fixture, FixtureRecord } from "../../replay/parseFixture.js";
import { bytesToHex, replay } from "../../replay/replay.js";
import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../test/acaiaVectors.js";
import { acaia } from "./acaia.js";
import { SILENCE_TIMEOUT_MS, SUBSCRIBE_SETTLE_MS } from "./createAcaiaSession.js";
import { encodeFrame } from "./encodeFrame.js";
import { NEW_STYLE_HEARTBEAT_MS, OLD_STYLE_HEARTBEAT_MS } from "./findVariant.js";

const SVC = "49535343-FE7D-4AE5-8FA9-9FAFD205E455";
const WRITE = "49535343-8841-43F4-A8D4-ECBE34729BB3";
const NOTIFY = "49535343-1E4D-4BD9-BA61-23C647249616";

const NEW_STYLE_GATT: GattLayout = [
  { uuid: "180A", characteristics: [{ uuid: "2A29", properties: ["read"] }] },
  {
    uuid: SVC,
    characteristics: [
      { uuid: WRITE, properties: ["write", "writeWithoutResponse"] },
      { uuid: NOTIFY, properties: ["notify"] },
    ],
  },
];
const OLD_STYLE_GATT: GattLayout = [
  { uuid: "0x1820", characteristics: [{ uuid: "2A80", properties: ["notify", "write"] }] },
];

const NOT_IDENTIFIED = bytesToHex(encodeFrame(7, Uint8Array.of(0x01)));

function rx(t: number, hex: string, chr = NOTIFY): FixtureRecord {
  return { t, dir: "rx", svc: SVC, chr, hex };
}

function fixture(...records: FixtureRecord[]): Fixture {
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
    },
    records,
  };
}

function hexOf(command: Command): string {
  return command.type === "write" ? bytesToHex(command.bytes) : command.type;
}

function run(session: ScaleSession, ...records: FixtureRecord[]) {
  const result = replay(session, fixture(...records));
  const writesAt = (t: number): string[] =>
    result.commands.filter((c) => c.t === t).map((c) => hexOf(c.command));
  const eventsOf = (type: string) => result.events.filter(({ event }) => event.type === type);
  return { ...result, writesAt, eventsOf };
}

describe("acaia driver", () => {
  test("picks the variant from the GATT layout, not the name", () => {
    const write = acaia.createSession(NEW_STYLE_GATT).tare(0).commands[0];
    expect(write).toMatchObject({ svc: SVC, chr: WRITE, mode: "noResponse" });

    const oldWrite = acaia.createSession(OLD_STYLE_GATT).tare(0).commands[0];
    expect(oldWrite).toMatchObject({ svc: "0x1820", chr: "2A80", mode: "noResponse" });
  });

  test("writes with response when the characteristic doesn't offer otherwise", () => {
    const gatt: GattLayout = [
      {
        uuid: SVC,
        characteristics: [
          { uuid: WRITE, properties: ["write"] },
          { uuid: NOTIFY, properties: ["notify"] },
        ],
      },
    ];
    expect(acaia.createSession(gatt).tare(0).commands[0]).toMatchObject({ mode: "response" });
  });

  test("rejects a device with no Acaia service", () => {
    try {
      acaia.createSession([{ uuid: "180A", characteristics: [] }]);
      expect.unreachable();
    } catch (error) {
      expect(isOpenPourError(error) && error.code).toBe("unknown-device");
    }
  });
});

describe("acaia session handshake", () => {
  test("subscribes, waits, identifies, then reports ready on the first data", () => {
    const result = run(acaia.createSession(NEW_STYLE_GATT), rx(0, ""), rx(500, RX.weight));

    expect(result.commands[0]?.command).toEqual({ type: "subscribe", svc: SVC, chr: NOTIFY });
    expect(result.writesAt(SUBSCRIBE_SETTLE_MS)).toEqual([TX.identify, TX.notificationRequest]);
    expect(result.events.map(({ t, event }) => [t, event.type])).toEqual([
      [0, "state"],
      [500, "state"],
      [500, "reading"],
      [500, "timer"],
    ]);
    expect(result.events[1]?.event).toEqual({ type: "state", state: "ready" });
  });

  test("re-identifies on heartbeats until the scale answers", () => {
    const firstBeat = SUBSCRIBE_SETTLE_MS + NEW_STYLE_HEARTBEAT_MS;
    const result = run(acaia.createSession(NEW_STYLE_GATT), rx(0, ""), rx(firstBeat, ""));

    expect(result.writesAt(firstBeat)).toEqual([TX.identify, TX.heartbeat, TX.notificationRequest]);
  });

  test("identifies again when the scale says it isn't identified", () => {
    const result = run(acaia.createSession(NEW_STYLE_GATT), rx(0, ""), rx(300, NOT_IDENTIFIED));
    expect(result.writesAt(300)).toEqual([TX.identify]);
  });

  test("heartbeats with a notification request once ready, at the variant's interval", () => {
    const t1 = SUBSCRIBE_SETTLE_MS + OLD_STYLE_HEARTBEAT_MS;
    const result = run(
      acaia.createSession(OLD_STYLE_GATT),
      rx(0, ""),
      rx(200, RX.weight, "2A80"),
      rx(t1, RX.weight, "2A80"),
    );
    expect(result.writesAt(t1)).toEqual([TX.heartbeat, TX.notificationRequest]);
  });
});

describe("acaia session data", () => {
  test("decodes weight, timer, buttons and battery into events", () => {
    const result = run(
      acaia.createSession(NEW_STYLE_GATT),
      rx(0, ""),
      rx(200, RX.buttonStart),
      rx(300, RX.timer),
      rx(400, RX.settings),
      rx(500, RX.ackWithNegativeWeight),
    );

    expect(result.eventsOf("button").map((e) => e.event)).toEqual([
      { type: "button", button: "start" },
    ]);
    expect(result.eventsOf("timer")[0]?.event).toEqual({
      type: "timer",
      running: true,
      ms: 90_500,
    });
    expect(result.eventsOf("battery")[0]?.event).toEqual({ type: "battery", percent: 93 });
    expect(result.eventsOf("reading").at(-1)?.event).toMatchObject({
      reading: { t: 500, grams: -598 },
    });
  });

  test("computes flow from successive weights and restarts it on a tare button", () => {
    const rising = (grams: number) => {
      const tenths = Math.round(grams * 10);
      const body = Uint8Array.of(0x05, tenths & 0xff, tenths >> 8, 0, 0, 1, 0);
      return bytesToHex(encodeFrame(12, Uint8Array.of(body.length + 1, ...body)));
    };
    const result = run(
      acaia.createSession(NEW_STYLE_GATT),
      rx(0, ""),
      rx(200, rising(10)),
      rx(300, rising(11)),
      rx(400, rising(12)),
      rx(500, RX.buttonTare),
    );

    const readings = result
      .eventsOf("reading")
      .map(({ event }) => (event.type === "reading" ? event.reading : undefined));
    expect(readings[2]?.flowGramsPerSec).toBeCloseTo(10);
    expect(readings[2]?.stable).toBe(false);
    expect(readings[3]).toMatchObject({ grams: 175.9, flowGramsPerSec: 0, stable: true });
  });

  test("ignores notifications from other characteristics", () => {
    const result = run(acaia.createSession(NEW_STYLE_GATT), rx(0, ""), rx(200, RX.weight, "2A19"));
    expect(result.eventsOf("reading")).toEqual([]);
  });

  test("reports silence once as a timeout, and again after data resumes and stops", () => {
    const beat = (n: number) => SUBSCRIBE_SETTLE_MS + n * NEW_STYLE_HEARTBEAT_MS;
    const result = run(
      acaia.createSession(NEW_STYLE_GATT),
      rx(0, ""),
      rx(beat(8), ""),
      rx(beat(8) + 1, RX.weight),
      rx(beat(16), ""),
    );

    const errors = result
      .eventsOf("error")
      .map(({ t, event }) => [t, event.type === "error" && event.error.code]);
    expect(errors).toEqual([
      [beat(5), "timeout"],
      [beat(14), "timeout"],
    ]);
    expect(SILENCE_TIMEOUT_MS).toBe(5000);
  });
});

describe("acaia session commands", () => {
  test("tare, timer and battery send the matching messages", () => {
    const session = acaia.createSession(NEW_STYLE_GATT);
    const sent = [
      session.tare(0),
      session.timer.start(0),
      session.timer.stop(0),
      session.timer.reset(0),
      session.requestBattery(0),
    ].flatMap((step) => step.commands.map(hexOf));

    expect(sent).toEqual([TX.tare, TX.timerStart, TX.timerStop, TX.timerReset, TX.getSettings]);
  });

  test("a tick before the wake-up does nothing and keeps the wake-up", () => {
    const session = acaia.createSession(NEW_STYLE_GATT);
    session.start(0);
    expect(session.tick(50)).toEqual({ events: [], commands: [], wakeAt: SUBSCRIBE_SETTLE_MS });
  });
});
