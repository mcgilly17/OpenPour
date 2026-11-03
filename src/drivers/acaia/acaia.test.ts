import { describe, expect, test } from "vitest";

import { isOpenPourError } from "../../core/errors.js";
import type { GattLayout } from "../../core/types.js";
import { bytesToHex } from "../../replay/replay.js";
import { ACAIA_VECTORS as RX, ACAIA_COMMAND_VECTORS as TX } from "../../test/acaiaVectors.js";
import {
  hexOf,
  NEW_STYLE_GATT,
  NOTIFY,
  OLD_STYLE_GATT,
  runAcaia,
  rx,
  SVC,
  synthetic,
  WRITE,
} from "../../test/runAcaia.js";
import { acaia } from "./acaia.js";
import { INFO_WAIT_MS, SILENCE_TIMEOUT_MS } from "./createAcaiaSession.js";
import { encodeFrame } from "./encodeFrame.js";
import { NEW_STYLE_HEARTBEAT_MS, OLD_STYLE_HEARTBEAT_MS } from "./findVariant.js";

const NOT_IDENTIFIED = bytesToHex(encodeFrame(7, Uint8Array.of(0x01)));

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
  test("subscribes, waits for the scale's description, identifies, then reports ready on data", () => {
    const result = runAcaia(
      synthetic(rx(INFO_WAIT_MS + 100, RX.settings), rx(INFO_WAIT_MS + 200, RX.weight)),
    );

    expect(result.commands[0]?.command).toEqual({ type: "subscribe", svc: SVC, chr: NOTIFY });
    expect(result.writesAt(INFO_WAIT_MS)).toEqual([TX.identify, TX.notificationRequest]);
    expect(result.events.map(({ t, event }) => [t, event.type])).toEqual([
      [0, "state"],
      [INFO_WAIT_MS + 100, "state"],
      [INFO_WAIT_MS + 100, "battery"],
      [INFO_WAIT_MS + 200, "reading"],
      [INFO_WAIT_MS + 200, "timer"],
    ]);
    expect(result.events[1]?.event).toEqual({ type: "state", state: "ready" });
  });

  test("identifies as soon as the scale describes itself, and reports the description once", () => {
    const result = runAcaia(synthetic(rx(60, RX.infoPearlS), rx(430, RX.infoPearlS)));

    expect(result.writesAt(60)).toEqual([TX.identify, TX.notificationRequest]);
    expect(result.writesAt(430)).toEqual([TX.identify]);
    expect(result.writesAt(INFO_WAIT_MS)).toEqual([]);
    expect(result.eventsOf("info")).toEqual([
      { type: "info", firmware: "1.0.8", modelCode: "035c" },
    ]);
    expect(result.eventsOf("state")).toEqual([{ type: "state", state: "handshaking" }]);
  });

  test("reports the Lunar's description the same way", () => {
    const result = runAcaia(synthetic(rx(1150, RX.infoLunar, "2A80")), OLD_STYLE_GATT);

    expect(result.writesAt(1150)).toEqual([TX.identify, TX.notificationRequest]);
    expect(result.eventsOf("info")).toEqual([
      { type: "info", firmware: "1.0.19", modelCode: "021a" },
    ]);
  });

  test("identifies on a not-identified frame too short to describe the scale", () => {
    const result = runAcaia(synthetic(rx(300, NOT_IDENTIFIED), rx(600, NOT_IDENTIFIED)));

    expect(result.writesAt(300)).toEqual([TX.identify, TX.notificationRequest]);
    expect(result.writesAt(600)).toEqual([TX.identify]);
    expect(result.eventsOf("info")).toEqual([]);
  });

  test("re-identifies on heartbeats until the scale answers", () => {
    const firstBeat = INFO_WAIT_MS + NEW_STYLE_HEARTBEAT_MS;
    const result = runAcaia(synthetic(rx(firstBeat, "")));

    expect(result.writesAt(firstBeat)).toEqual([TX.identify, TX.heartbeat, TX.notificationRequest]);
  });

  test("heartbeats with a notification request once ready, at the variant's interval", () => {
    const t1 = INFO_WAIT_MS + OLD_STYLE_HEARTBEAT_MS;
    const result = runAcaia(
      synthetic(
        rx(INFO_WAIT_MS + 50, RX.settings, "2A80"),
        rx(INFO_WAIT_MS + 100, RX.weight, "2A80"),
        rx(t1, RX.weight, "2A80"),
      ),
      OLD_STYLE_GATT,
    );
    expect(result.writesAt(t1)).toEqual([TX.heartbeat, TX.notificationRequest]);
  });
});

describe("acaia session data", () => {
  test("decodes weight, timer, buttons and battery into events", () => {
    const result = runAcaia(
      synthetic(
        rx(200, RX.buttonStart),
        rx(300, RX.timer),
        rx(400, RX.settings),
        rx(500, RX.ackWithNegativeWeight),
      ),
    );

    expect(result.eventsOf("button")).toEqual([{ type: "button", button: "start" }]);
    expect(result.eventsOf("timer")).toEqual([{ type: "timer", running: true, ms: 90_500 }]);
    expect(result.eventsOf("battery")).toEqual([{ type: "battery", percent: 93 }]);
    expect(result.readings()).toEqual([
      { t: 500, value: -598, unit: "g", decimals: 1, stable: true, flowPerSec: 0 },
    ]);
  });

  test("computes flow from successive weights and restarts it on a tare button", () => {
    const rising = (grams: number) => {
      const tenths = Math.round(grams * 10);
      const body = Uint8Array.of(0x05, tenths & 0xff, tenths >> 8, 0, 0, 1, 1);
      return bytesToHex(encodeFrame(12, Uint8Array.of(body.length + 1, ...body)));
    };
    const result = runAcaia(
      synthetic(
        rx(100, RX.settings),
        rx(200, rising(10)),
        rx(300, rising(11)),
        rx(400, rising(12)),
        rx(500, RX.buttonTare),
      ),
    );

    const readings = result.readings();
    expect(readings[2]).toMatchObject({ value: 12, unit: "g", stable: false });
    expect(readings[2]?.flowPerSec).toBeCloseTo(10);
    expect(readings[3]).toMatchObject({ value: 175.9, flowPerSec: 0, stable: true });
  });

  test("ignores notifications from other characteristics", () => {
    const result = runAcaia(synthetic(rx(100, RX.settings, "2A19"), rx(200, RX.weight, "2A19")));
    expect(result.eventsOf("reading")).toEqual([]);
  });

  test("reports silence once as a timeout, and again after data resumes and stops", () => {
    const beat = (n: number) => INFO_WAIT_MS + n * NEW_STYLE_HEARTBEAT_MS;
    const result = runAcaia(
      synthetic(rx(beat(8), ""), rx(beat(8) + 1, RX.weight), rx(beat(16), "")),
    );

    const errors = result.events.flatMap(({ t, event }) =>
      event.type === "error" ? [[t, event.error.code]] : [],
    );
    expect(errors).toEqual([
      [beat(4), "timeout"],
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
    expect(session.tick(50)).toEqual({ events: [], commands: [], wakeAt: INFO_WAIT_MS });
  });
});
