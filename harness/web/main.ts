import type { Driver } from "openpour";
import { acaia } from "openpour/acaia";
import { browserClock } from "./browserClock.js";
import { chooseScale } from "./chooseScale.js";
import { type ConnectMode, createScale } from "./createScale.js";
import { createScalePanel } from "./createScalePanel.js";
import { explainChooseFailure, supportProblem } from "./explainFailure.js";
import { findElement } from "./findElement.js";

// Acaia is the only driver so far; scales of other brands won't appear in the chooser.
const driver: Driver = acaia;
const clock = browserClock;
const devices: BluetoothDevice[] = [];
let recordingStartT: number | undefined;

const connectButtons: [HTMLButtonElement, ConnectMode][] = [
  [findElement(document, "#connect", HTMLButtonElement), "session"],
  [findElement(document, "#connect-listening", HTMLButtonElement), "listen"],
];
const connectProblem = findElement(document, "#connect-problem", HTMLElement);
const scales = findElement(document, "#scales", HTMLElement);

function showProblem(element: HTMLElement, text: string | undefined): void {
  element.hidden = text === undefined;
  element.textContent = text ?? "";
}

/** The recording starts with the first connection, and every later one shares its start. */
function startRecording(): number {
  recordingStartT ??= clock.now();
  return recordingStartT;
}

async function choose(): Promise<BluetoothDevice | undefined> {
  try {
    return await chooseScale(navigator.bluetooth, driver);
  } catch (error) {
    showProblem(connectProblem, explainChooseFailure(error));
    return undefined;
  }
}

async function addScale(mode: ConnectMode): Promise<void> {
  showProblem(connectProblem, undefined);
  const device = await choose();
  if (!device) return;
  if (devices.includes(device)) {
    showProblem(connectProblem, "That scale already has a panel below; use its Reconnect button.");
    return;
  }
  devices.push(device);
  const label = String.fromCharCode("a".charCodeAt(0) + devices.length - 1);
  const panel = createScalePanel(scales);
  await createScale({
    device,
    label,
    driver,
    clock,
    recordingStartT: startRecording,
    panel,
  }).connect(mode);
}

const problem = supportProblem();
showProblem(findElement(document, "#support-problem", HTMLElement), problem);
// The only path to the device chooser: browsers require a click, and the page never scans by itself.
for (const [button, mode] of connectButtons) {
  button.disabled = problem !== undefined;
  button.addEventListener("click", () => void addScale(mode));
}
