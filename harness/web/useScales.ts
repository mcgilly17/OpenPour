import type { Driver } from "openpour";
import { acaia } from "openpour/acaia";
import { useRef, useState } from "react";
import { browserClock } from "./browserClock.js";
import { chooseScale } from "./chooseScale.js";
import { type ConnectMode, createScale, publicName } from "./createScale.js";
import { createScalePanel, type ScalePanelStore } from "./createScalePanel.js";
import { describeError, explainChooseFailure } from "./explainFailure.js";
import { findRememberedDevice, rememberedDevice } from "./rememberedDevice.js";
import { waitForAdvertisement } from "./waitForAdvertisement.js";

// Acaia is the only driver so far; scales of other brands won't appear in the chooser.
const driver: Driver = acaia;
const clock = browserClock;

const ALREADY_SHOWN = "That scale already has a panel below; use its Reconnect button.";

export interface ScaleEntry {
  /** "a", "b"…, in the order the scales were chosen. */
  label: string;
  panel: ScalePanelStore;
  /** Matches the card to its saved scale. Its `id` stays in memory and the browser's storage. */
  device: BluetoothDevice;
  /** The brand and matched name prefix, e.g. "Acaia LUNAR", as a saved scale keeps it. */
  name: string;
}

export interface Scales {
  scales: readonly ScaleEntry[];
  /** Why the latest Connect click added no scale. */
  problem: string | undefined;
  /** Opens the browser's chooser, so call it only from a click, then connects the chosen scale. */
  addScale(mode: ConnectMode): Promise<void>;
  /**
   * Connects the saved scale `id` without the chooser, once the browser has seen it advertise,
   * then the same way as a chosen one. Resolves to why it couldn't, or undefined.
   */
  connectSaved(id: string, mode: ConnectMode): Promise<string | undefined>;
  /** Makes the browser forget the scale `id` where it can, which also drops its connection. */
  forget(id: string): Promise<void>;
}

/** The page's scales, one panel each, sharing one recording start. */
export function useScales(): Scales {
  const [scales, setScales] = useState<readonly ScaleEntry[]>([]);
  const [problem, setProblem] = useState<string>();
  const devices = useRef<BluetoothDevice[]>([]);
  const recordingStartT = useRef<number | undefined>(undefined);

  /** The recording starts with the first connection, and every later one shares its start. */
  function startRecording(): number {
    recordingStartT.current ??= clock.now();
    return recordingStartT.current;
  }

  function isShown(id: string): boolean {
    return devices.current.some((device) => device.id === id);
  }

  /** Adds `device`'s panel, starting with `note` if there is one, and connects it. */
  async function connectNew(
    device: BluetoothDevice,
    mode: ConnectMode,
    note?: string,
  ): Promise<void> {
    devices.current.push(device);
    const label = String.fromCharCode("a".charCodeAt(0) + devices.current.length - 1);
    const panel = createScalePanel();
    if (note !== undefined) panel.addNote(note);
    const scale = createScale({
      device,
      label,
      driver,
      clock,
      recordingStartT: startRecording,
      panel,
    });
    const name = publicName(driver, device.name);
    setScales((added) => [...added, { label, panel, device, name }]);
    await scale.connect(mode);
  }

  async function addScale(mode: ConnectMode): Promise<void> {
    setProblem(undefined);
    let device: BluetoothDevice;
    try {
      device = await chooseScale(navigator.bluetooth, driver);
    } catch (error) {
      setProblem(explainChooseFailure(error));
      return;
    }
    if (isShown(device.id)) {
      setProblem(ALREADY_SHOWN);
      return;
    }
    await connectNew(device, mode);
  }

  async function connectSaved(id: string, mode: ConnectMode): Promise<string | undefined> {
    if (isShown(id)) return ALREADY_SHOWN;
    let device: BluetoothDevice;
    try {
      device = await findRememberedDevice(navigator.bluetooth, id, driver);
    } catch (error) {
      return describeError(error);
    }
    const note = await waitForAdvertisement(device, clock);
    // The chooser may have added it while the page waited.
    if (isShown(id)) return ALREADY_SHOWN;
    await connectNew(device, mode, note);
    return undefined;
  }

  async function forget(id: string): Promise<void> {
    try {
      const shown = devices.current.find((device) => device.id === id);
      const device = shown ?? (await rememberedDevice(navigator.bluetooth, id));
      if (typeof device?.forget === "function") await device.forget();
    } catch (error) {
      setProblem(`The browser couldn't forget the removed scale: ${describeError(error)}`);
    }
  }

  return { scales, problem, addScale, connectSaved, forget };
}
