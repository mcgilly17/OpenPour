import type { Driver } from "openpour";
import { acaia } from "openpour/acaia";
import { bytesToHex, type Fixture, hexToBytes, parseFixture } from "openpour/replay";
import { type Mock, vi } from "vitest";
import type { Clock } from "../../runner/Clock.js";
import { ACAIA_GATT, ACAIA_NOTIFY } from "../../test/acaiaGatt.js";
import { useFakeClock } from "../../test/useFakeClock.js";
import { type ConnectMode, createScale } from "../createScale.js";
import type { PanelAction, RecordingSummary } from "../createScalePanel.js";
import { downloadText } from "../downloadText.js";
import type { LogEntry } from "../LogEntry.js";
import {
  asDevice,
  characteristicOf,
  DEVICE_INFORMATION_GATT,
  DIS,
  notify,
  readsAs,
  type StubGatt,
  stubGatt,
} from "./stubGatt.js";
import { type StubPanel, stubPanel } from "./stubPanel.js";

// Test files using these helpers must call vi.mock("./downloadText.js").

export const DISCOVERY: string[] = ["connect", "getPrimaryServices", "getCharacteristics"];
export const TWO_SERVICE_DISCOVERY: string[] = [...DISCOVERY, "getCharacteristics"];
export const DEVICE_INFO_READS: string[] = Array<string>(5).fill("readValue");
export const HANDSHAKE: string[] = [
  "startNotifications",
  "writeValueWithoutResponse",
  "writeValueWithoutResponse",
];

/** The unsolicited type 7 frame a Pearl S can send right after subscribing (docs/design.md). */
export const TYPE_7 = "efdd0707035c01000801640c";

export interface ConnectOptions {
  driver?: Driver;
  mode?: ConnectMode;
  /** Where the fake clock starts; the page's shared recording start is `recordingStartT`. */
  clockStartT?: number;
  recordingStartT?: number;
}

export interface ConnectedScale {
  clock: Clock;
  panel: StubPanel;
  recordingStartT: Mock<() => number>;
  /** Settles once the first connection attempt has. */
  connected: Promise<void>;
}

export function connectTo(gatt: StubGatt, options: ConnectOptions = {}): ConnectedScale {
  const {
    driver = acaia,
    mode = "session",
    clockStartT = 0,
    recordingStartT: startT = 0,
  } = options;
  const clock = useFakeClock(clockStartT);
  const panel = stubPanel();
  const recordingStartT = vi.fn(() => startT);
  const device = asDevice(gatt.device);
  const scale = createScale({ device, label: "a", driver, clock, recordingStartT, panel });
  return { clock, panel, recordingStartT, connected: scale.connect(mode) };
}

/** What a Pearl S lets the page see: the Acaia service and Device Information. */
export function pearlS(): StubGatt {
  const gatt = stubGatt([...ACAIA_GATT, ...DEVICE_INFORMATION_GATT]);
  readsAs(gatt, DIS.modelNumber, "PEARLS");
  readsAs(gatt, DIS.serialNumber, "SERIAL-1234");
  readsAs(gatt, DIS.firmwareRevision, "1.0.016");
  return gatt;
}

/** Clicks the panel's `action` button, through the handler the scale registered for it. */
export function click(panel: StubPanel, action: PanelAction): void {
  const handler = panel.onAction.mock.calls.find(([name]) => name === action)?.[1];
  if (!handler) throw new Error(`no handler for ${action}`);
  handler();
}

/** Exports recording `id` with `answers`; returns the fixture it downloaded, if it downloaded one. */
export function exportFixture(
  panel: StubPanel,
  id: number,
  answers: FormData = new FormData(),
): Fixture | undefined {
  const downloads = vi.mocked(downloadText).mock.calls;
  const before = downloads.length;
  answers.set("recording", String(id));
  panel.onExport.mock.calls[0]?.[0](answers);
  const jsonl = downloads.length > before ? downloads.at(-1)?.[1] : undefined;
  return jsonl === undefined ? undefined : parseFixture(jsonl);
}

/** Delivers `hex` on the Acaia notify characteristic, as the browser would, stamped `t`. */
export function notifyHex(gatt: StubGatt, hex: string, t: number): void {
  notify(characteristicOf(gatt, ACAIA_NOTIFY), new DataView(hexToBytes(hex).buffer), t);
}

export function writtenHex({ characteristics }: StubGatt): string[] {
  return characteristics.flatMap((c) =>
    // The source writes Uint8Arrays.
    [...c.writeValueWithResponse.mock.calls, ...c.writeValueWithoutResponse.mock.calls].map(
      ([value]) => bytesToHex(value as Uint8Array),
    ),
  );
}

export function shown(panel: StubPanel, field: string): string[] {
  return panel.show.mock.calls.flatMap(([name, text]) => (name === field ? [text] : []));
}

export function logged(panel: StubPanel): LogEntry[] {
  return panel.log.mock.calls.map(([entry]) => entry);
}

/** The packets the log showed, as [recording, dir, hex]. */
export function packetsLogged(panel: StubPanel): [number, string, string][] {
  return logged(panel).flatMap((e) =>
    e.kind === "packet"
      ? [[e.recording, e.record.dir, e.record.hex] as [number, string, string]]
      : [],
  );
}

export function recordingsShown(panel: StubPanel): readonly RecordingSummary[] | undefined {
  return panel.showRecordings.mock.calls.at(-1)?.[0];
}
