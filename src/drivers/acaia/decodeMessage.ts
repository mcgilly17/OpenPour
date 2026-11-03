import type { WeightUnit } from "../../core/types.js";
import type { Frame } from "./createFrameReader.js";

export type AcaiaButton = "tare" | "start" | "stop" | "reset";

/** One record of an event message. Event messages chain several, e.g. a button press with the weight. */
export type AcaiaRecord =
  | { kind: "weight"; value: number; decimals: number; isStable: boolean }
  | { kind: "timer"; ms: number }
  | { kind: "button"; button: AcaiaButton }
  | { kind: "battery"; percent: number };

export interface AcaiaSettings {
  batteryPercent: number;
  isTimerRunning: boolean;
  /** Undefined for a units code not seen yet. */
  unit: WeightUnit | undefined;
}

/** What the scale says about itself while it waits to be identified. */
export interface AcaiaInfo {
  /** Major.minor.patch, e.g. "1.0.8". */
  firmware: string;
  /** Two bytes as hex, e.g. "035c": they differ between models, but no table of them exists yet. */
  modelCode: string;
}

export type AcaiaMessage =
  | { type: "event"; records: AcaiaRecord[] }
  | { type: "settings"; settings: AcaiaSettings }
  | { type: "info"; info: AcaiaInfo };

const INFO_TYPE = 7;
const SETTINGS_TYPE = 8;
const EVENT_TYPE = 12;

const WEIGHT_TAG = 5;
const BATTERY_TAG = 6;
const TIMER_TAG = 7;
const BUTTON_TAG = 8;
const ACK_TAG = 11;

/** Body size of each record tag. A tag missing here ends the walk, since its size is unknown. */
const RECORD_BYTES: ReadonlyMap<number, number> = new Map([
  [WEIGHT_TAG, 6],
  [BATTERY_TAG, 1],
  [TIMER_TAG, 3],
  [BUTTON_TAG, 1],
  [ACK_TAG, 2],
]);

const BUTTONS: ReadonlyMap<number, AcaiaButton> = new Map([
  [0x00, "tare"],
  [0x08, "start"],
  [0x09, "reset"],
  [0x0a, "stop"],
]);

const UNSETTLED_FLAG = 0x01;
const NEGATIVE_FLAG = 0x02;
const TIMER_RUNNING_FLAG = 0x80;
const UNITS: ReadonlyMap<number, WeightUnit> = new Map([
  [0x02, "g"],
  [0x05, "oz"],
]);
/** The Pearl S's settings are this long and keep units in byte 2; the Lunar's 8 bytes keep them in byte 1. */
const LONG_SETTINGS_BYTES = 30;
const INFO_BYTES = 5;

/**
 * Bytes 0–2 are the value, little-endian; byte 4 is the number of decimals; in byte 5, bit 0x01
 * marks a reading that hasn't settled and bit 0x02 the sign. Byte 3 is not decoded yet.
 */
function decodeWeight(body: Uint8Array): AcaiaRecord | undefined {
  const [b0 = 0, b1 = 0, b2 = 0, , decimals = 0, flags = 0] = body;
  if (decimals < 1 || decimals > 4) return undefined;
  const value = (b0 | (b1 << 8) | (b2 << 16)) / 10 ** decimals;
  const isNegative = (flags & NEGATIVE_FLAG) !== 0 && value !== 0;
  return {
    kind: "weight",
    value: isNegative ? -value : value,
    decimals,
    isStable: (flags & UNSETTLED_FLAG) === 0,
  };
}

function decodeTimer(body: Uint8Array): AcaiaRecord {
  const [minutes = 0, seconds = 0, tenths = 0] = body;
  return { kind: "timer", ms: minutes * 60_000 + seconds * 1000 + tenths * 100 };
}

function decodeButton(body: Uint8Array): AcaiaRecord | undefined {
  const button = BUTTONS.get(body[0] ?? -1);
  return button && { kind: "button", button };
}

function decodeRecord(tag: number, body: Uint8Array): AcaiaRecord | undefined {
  switch (tag) {
    case WEIGHT_TAG:
      return decodeWeight(body);
    case TIMER_TAG:
      return decodeTimer(body);
    case BUTTON_TAG:
      return decodeButton(body);
    case BATTERY_TAG:
      return { kind: "battery", percent: body[0] ?? 0 };
    default:
      // Acks carry nothing a session needs; any frame at all shows the scale is alive.
      return undefined;
  }
}

/** Walks the record chain, stopping at an unknown tag or a truncated record. */
function decodeRecords(payload: Uint8Array): AcaiaRecord[] {
  const records: AcaiaRecord[] = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload[i] ?? -1;
    const size = RECORD_BYTES.get(tag);
    if (size === undefined || i + 1 + size > payload.length) break;
    const record = decodeRecord(tag, payload.subarray(i + 1, i + 1 + size));
    if (record) records.push(record);
    i += 1 + size;
  }
  return records;
}

function decodeSettings(payload: Uint8Array): AcaiaSettings | undefined {
  const battery = payload[0];
  const units = payload[payload.length >= LONG_SETTINGS_BYTES ? 2 : 1];
  if (battery === undefined || units === undefined) return undefined;
  return {
    batteryPercent: battery & ~TIMER_RUNNING_FLAG,
    isTimerRunning: (battery & TIMER_RUNNING_FLAG) !== 0,
    unit: UNITS.get(units),
  };
}

function decodeInfo(payload: Uint8Array): AcaiaInfo | undefined {
  if (payload.length < INFO_BYTES) return undefined;
  const hex = (byte: number) => byte.toString(16).padStart(2, "0");
  const [code0 = 0, code1 = 0, major = 0, minor = 0, patch = 0] = payload;
  return { firmware: `${major}.${minor}.${patch}`, modelCode: hex(code0) + hex(code1) };
}

/** Returns undefined for message types a session does not use, and for unreadable settings or info. */
export function decodeMessage(frame: Frame): AcaiaMessage | undefined {
  switch (frame.type) {
    case EVENT_TYPE:
      return { type: "event", records: decodeRecords(frame.payload) };
    case SETTINGS_TYPE: {
      const settings = decodeSettings(frame.payload);
      return settings && { type: "settings", settings };
    }
    case INFO_TYPE: {
      const info = decodeInfo(frame.payload);
      return info && { type: "info", info };
    }
    default:
      return undefined;
  }
}
