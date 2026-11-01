import { acaia } from "openpour/acaia";
import { hexToBytes } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { type RunnerEvent, startRunner } from "../runner/startRunner.js";
import { ACAIA_GATT, ACAIA_NOTIFY, ACAIA_SVC, ACAIA_WRITE } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { createWebBluetoothSource } from "./createWebBluetoothSource.js";
import {
  asCharacteristics,
  asServer,
  notify,
  type StubCharacteristic,
  stubGatt,
} from "./test/stubGatt.js";
import { GATT_OPERATION_TIMEOUT_MS } from "./withTimeout.js";

const never = (): Promise<never> => new Promise(() => {});

afterEach(() => {
  vi.useRealTimers();
});

function connect() {
  const clock = useFakeClock();
  const gatt = stubGatt(ACAIA_GATT);
  const source = createWebBluetoothSource({
    server: asServer(gatt.server),
    characteristics: asCharacteristics(gatt.characteristics),
    clock,
  });
  const characteristic = (uuid: string): StubCharacteristic => {
    const found = gatt.characteristics.find((c) => c.uuid === uuid);
    if (!found) throw new Error(`no stub for ${uuid}`);
    return found;
  };
  return {
    clock,
    gatt,
    source,
    notifier: characteristic(ACAIA_NOTIFY),
    writer: characteristic(ACAIA_WRITE),
  };
}

describe("createWebBluetoothSource", () => {
  test("hands over a copy of each notification's bytes, stamped with the event's timeStamp", async () => {
    const { source, notifier } = connect();
    const received: [Uint8Array, number][] = [];
    await source.subscribe(ACAIA_SVC, ACAIA_NOTIFY, (bytes, t) => received.push([bytes, t]));
    const reused = Uint8Array.of(0xaa, 1, 2, 3, 0xbb);

    notify(notifier, new DataView(reused.buffer, 1, 3), 1234.5);
    reused.fill(9);

    expect(notifier.startNotifications).toHaveBeenCalledOnce();
    expect(received).toEqual([[Uint8Array.of(1, 2, 3), 1234.5]]);
  });

  test("maps write modes to writeValueWithResponse and writeValueWithoutResponse", async () => {
    const { source, writer } = connect();

    await source.write(ACAIA_SVC, ACAIA_WRITE, Uint8Array.of(1), "response");
    await source.write(ACAIA_SVC, ACAIA_WRITE, Uint8Array.of(2), "noResponse");

    expect(writer.writeValueWithResponse.mock.calls).toEqual([[Uint8Array.of(1)]]);
    expect(writer.writeValueWithoutResponse.mock.calls).toEqual([[Uint8Array.of(2)]]);
  });

  test("reads with readValue and returns a copy of the value", async () => {
    const { source, writer } = connect();
    const reused = Uint8Array.of(0xaa, 93);
    writer.readValue.mockResolvedValueOnce(new DataView(reused.buffer, 1));

    const bytes = await source.read(ACAIA_SVC, ACAIA_WRITE);
    reused.fill(0);

    expect(bytes).toEqual(Uint8Array.of(93));
  });

  test("rejects a command for a characteristic that discovery didn't find", async () => {
    const { source } = connect();

    await expect(source.read(ACAIA_SVC, "2a19")).rejects.toThrow("was not discovered");
  });

  test("a failed subscription stops listening", async () => {
    const { source, notifier } = connect();
    const listener = vi.fn();
    notifier.startNotifications.mockRejectedValueOnce(new DOMException("failed", "NetworkError"));

    await expect(source.subscribe(ACAIA_SVC, ACAIA_NOTIFY, listener)).rejects.toThrow("failed");
    notify(notifier, new DataView(new ArrayBuffer(1)), 10);

    expect(listener).not.toHaveBeenCalled();
  });

  test("reports the browser's disconnect once, and disconnect() closes the GATT connection", async () => {
    const { gatt, source } = connect();
    const listener = vi.fn();
    source.onDisconnect(listener);

    await source.disconnect();
    gatt.server.device.dispatchEvent(new Event("gattserverdisconnected"));

    expect(gatt.server.disconnect).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("a stalled GATT operation", () => {
  test("fails at the timeout, so the runner's queue moves on to the Acaia handshake", async () => {
    const { clock, source, notifier, writer } = connect();
    notifier.startNotifications.mockImplementationOnce(never);
    const events: RunnerEvent[] = [];
    const session = acaia.createSession(ACAIA_GATT);
    startRunner({ source, session, clock, onEvent: (event) => events.push(event) });
    const written = () => writer.writeValueWithoutResponse.mock.calls.map(([bytes]) => bytes);

    await advanceTo(clock, GATT_OPERATION_TIMEOUT_MS - 1);
    expect(written()).toEqual([]);
    await advanceTo(clock, GATT_OPERATION_TIMEOUT_MS);

    const handshake = [TX.identify, TX.notificationRequest].map(hexToBytes);
    expect(written().slice(0, 2)).toEqual(handshake);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "commandFailed", t: GATT_OPERATION_TIMEOUT_MS }),
    );
  });
});
