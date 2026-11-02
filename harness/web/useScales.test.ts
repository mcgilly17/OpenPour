// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { DISCOVERY } from "./test/connectScale.js";
import { BATTERY_ONLY_GATT, operationsOn, type StubGatt, stubGatt } from "./test/stubGatt.js";
import { useScales } from "./useScales.js";

vi.mock("./downloadText.js");

const SAVED_ID = "remembered-device-id";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "bluetooth");
});

/** A device the browser remembers as `SAVED_ID`, which advertises as soon as it's watched. */
function rememberedScale(gatt: StubGatt) {
  const watchAdvertisements = vi.fn(async () => {
    queueMicrotask(() => gatt.device.dispatchEvent(new Event("advertisementreceived")));
  });
  const forget = vi.fn(async () => {});
  const device = Object.assign(gatt.device, { id: SAVED_ID, watchAdvertisements, forget });
  return { device, watchAdvertisements, forget };
}

function stubBluetooth(bluetooth: object): void {
  Object.defineProperty(navigator, "bluetooth", { value: bluetooth, configurable: true });
}

/** Renders the page's scales with fake timers, so a started session's wake-ups never fire. */
function renderScales() {
  vi.useFakeTimers();
  const { result } = renderHook(useScales);
  async function connectSaved(): Promise<string | undefined> {
    let problem: string | undefined;
    await act(async () => {
      problem = await result.current.connectSaved(SAVED_ID, "session");
    });
    return problem;
  }
  return { result, connectSaved };
}

describe("useScales connecting a saved scale", () => {
  test("waits for an advertisement, then connects the way a chosen scale does", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { device, watchAdvertisements } = rememberedScale(gatt);
    stubBluetooth({ getDevices: async () => [device] });
    const { result, connectSaved } = renderScales();

    expect(await connectSaved()).toBeUndefined();

    const [entry] = result.current.scales;
    const state = entry?.panel.getSnapshot();
    expect(state?.connection).toBe("connected");
    expect(operationsOn(gatt)).toEqual([...DISCOVERY, "startNotifications"]);
    expect(watchAdvertisements.mock.invocationCallOrder[0]).toBeLessThan(
      gatt.server.connect.mock.invocationCallOrder[0] ?? 0,
    );
    expect(state?.errors.map(({ text }) => text)).toEqual([
      expect.stringMatching(/advertised \d+ ms after/),
    ]);
    expect(JSON.stringify(state)).not.toContain(SAVED_ID);
  });

  test("a saved scale without the driver's services fails the same unknown-device check", async () => {
    const gatt = stubGatt(BATTERY_ONLY_GATT);
    const { device } = rememberedScale(gatt);
    stubBluetooth({ getDevices: async () => [device] });
    const { result, connectSaved } = renderScales();

    await connectSaved();

    const state = result.current.scales[0]?.panel.getSnapshot();
    expect(state?.connection).toBe("failed");
    expect(state?.errors.at(-1)?.text).toContain("(unknown-device)");
    expect(operationsOn(gatt)).toEqual([...DISCOVERY, "disconnect"]);
  });

  test("a remembered device not named like the driver's scales is refused untouched", async () => {
    const gatt = stubGatt(ACAIA_GATT, "HEADPHONES");
    const { device, watchAdvertisements } = rememberedScale(gatt);
    stubBluetooth({ getDevices: async () => [device] });
    const { result, connectSaved } = renderScales();

    expect(await connectSaved()).toContain("matches none of the Acaia driver's prefixes");
    expect(result.current.scales).toEqual([]);
    expect(watchAdvertisements).not.toHaveBeenCalled();
    expect(operationsOn(gatt)).toEqual([]);
  });

  test("says plainly when the browser can't list remembered devices, or forgot this one", async () => {
    stubBluetooth({});
    const { connectSaved } = renderScales();
    expect(await connectSaved()).toContain("no navigator.bluetooth.getDevices");

    stubBluetooth({ getDevices: async () => [] });
    expect(await connectSaved()).toContain("no longer remembers this scale");
  });

  test("a scale already on the page isn't connected twice, and forget makes the browser forget it", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { device, forget } = rememberedScale(gatt);
    stubBluetooth({ getDevices: async () => [device] });
    const { result, connectSaved } = renderScales();
    await connectSaved();

    expect(await connectSaved()).toContain("already has a panel");
    await act(() => result.current.forget(SAVED_ID));

    expect(result.current.scales).toHaveLength(1);
    expect(forget).toHaveBeenCalledOnce();
  });
});
