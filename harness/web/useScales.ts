import type { Driver } from "openpour";
import { acaia } from "openpour/acaia";
import { useRef, useState } from "react";
import { browserClock } from "./browserClock.js";
import { chooseScale } from "./chooseScale.js";
import { type ConnectMode, createScale } from "./createScale.js";
import { createScalePanel, type ScalePanelStore } from "./createScalePanel.js";
import { explainChooseFailure } from "./explainFailure.js";

// Acaia is the only driver so far; scales of other brands won't appear in the chooser.
const driver: Driver = acaia;
const clock = browserClock;

export interface ScaleEntry {
  /** "a", "b"…, in the order the scales were chosen. */
  label: string;
  panel: ScalePanelStore;
}

export interface Scales {
  scales: readonly ScaleEntry[];
  /** Why the latest Connect click added no scale. */
  problem: string | undefined;
  /** Opens the browser's chooser, so call it only from a click, then connects the chosen scale. */
  addScale(mode: ConnectMode): Promise<void>;
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

  async function addScale(mode: ConnectMode): Promise<void> {
    setProblem(undefined);
    let device: BluetoothDevice;
    try {
      device = await chooseScale(navigator.bluetooth, driver);
    } catch (error) {
      setProblem(explainChooseFailure(error));
      return;
    }
    if (devices.current.includes(device)) {
      setProblem("That scale already has a panel below; use its Reconnect button.");
      return;
    }
    devices.current.push(device);
    const label = String.fromCharCode("a".charCodeAt(0) + devices.current.length - 1);
    const panel = createScalePanel();
    const scale = createScale({
      device,
      label,
      driver,
      clock,
      recordingStartT: startRecording,
      panel,
    });
    setScales((added) => [...added, { label, panel }]);
    await scale.connect(mode);
  }

  return { scales, problem, addScale };
}
