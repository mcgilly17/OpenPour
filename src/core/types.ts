import type { OpenPourError } from "./errors.js";

/** What the app saw while scanning. Every field is optional because platforms expose different parts. */
export interface Advertisement {
  name?: string;
  serviceUuids?: string[];
  manufacturerData?: Uint8Array;
}

/** The services and characteristics the app discovered after connecting. */
export type GattLayout = {
  uuid: string;
  characteristics: { uuid: string; properties: string[] }[];
}[];

/** Something the app must do on the radio for the session. */
export type Command =
  | { type: "subscribe"; svc: string; chr: string }
  | { type: "write"; svc: string; chr: string; bytes: Uint8Array; mode: "response" | "noResponse" }
  | { type: "read"; svc: string; chr: string };

export interface Reading {
  /** Arrival time in ms, as passed in by the app. */
  t: number;
  /** Signed: a negative weight after tare is real data. */
  grams: number;
  /** The device's settled flag, or inferred when the device has none. */
  stable: boolean;
  /** Computed by OpenPour so curves compare across brands. */
  flowGramsPerSec: number;
}

export type ScaleEvent =
  | { type: "reading"; reading: Reading }
  | { type: "battery"; percent: number }
  | { type: "button"; button: string }
  | { type: "timer"; running: boolean; ms: number }
  | { type: "state"; state: "handshaking" | "ready" }
  | { type: "error"; error: OpenPourError };

/** The result of every session call: what happened, what to do, and when to call tick() next. */
export interface Step {
  events: ScaleEvent[];
  commands: Command[];
  wakeAt?: number;
}

export interface ScaleInfo {
  brand: string;
  model: string;
  firmware?: string;
}

export interface Capabilities {
  tare: boolean;
  timer: boolean;
  battery: boolean;
  /** Smallest weight step, e.g. 0.1. */
  resolutionGrams: number;
  maxRateHz: number;
}

/**
 * A synchronous state machine for one connected scale. It never performs I/O:
 * the app feeds it bytes with their arrival time and carries out the returned commands.
 */
export interface ScaleSession {
  readonly info: ScaleInfo;
  readonly capabilities: Capabilities;
  /** Call once, right after connecting. */
  start(t: number): Step;
  /** Call for every notification and every read result. */
  receive(chr: string, bytes: Uint8Array, t: number): Step;
  /** Call at or after the last `wakeAt`. */
  tick(t: number): Step;
  /** Throws `OpenPourError("unsupported")` when `capabilities.tare` is false. */
  tare(t: number): Step;
  /** Each method throws `OpenPourError("unsupported")` when `capabilities.timer` is false. */
  timer: { start(t: number): Step; stop(t: number): Step; reset(t: number): Step };
  requestBattery(t: number): Step;
}

/** One per scale brand. */
export interface Driver {
  brand: string;
  /** Advertised name prefixes, for the app's scan filter. */
  namePrefixes: string[];
  /** Service UUIDs, for the scan filter and Web Bluetooth `optionalServices`. */
  services: string[];
  /** Refines a name match, e.g. to reject a look-alike device. */
  matches?(ad: Advertisement): boolean;
  /** The GATT layout picks the protocol variant. Throws `OpenPourError("unknown-device")` when none fits. */
  createSession(gatt: GattLayout): ScaleSession;
}
