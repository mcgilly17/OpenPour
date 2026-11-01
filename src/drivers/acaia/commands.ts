import { encodeFrame } from "./encodeFrame.js";

export type AcaiaCommand =
  | "heartbeat"
  | "identify"
  | "notificationRequest"
  | "getSettings"
  | "tare"
  | "timerStart"
  | "timerStop"
  | "timerReset";

const DASH = 0x2d;
const IDENTIFY_ID_BYTES = 15;
const SETTINGS_REQUEST_BYTES = 16;

/**
 * Asks for weight, battery, timer and button events. The first byte is the payload length; the
 * rest are pairs of event kind and interval.
 */
const NOTIFICATION_REQUEST = [0x09, 0x00, 0x01, 0x01, 0x02, 0x02, 0x05, 0x03, 0x04];

function frame(type: number, payload: number[]): () => Uint8Array {
  return () => encodeFrame(type, Uint8Array.from(payload));
}

/** Every message the phone sends. Each call returns a fresh array, so callers may keep it. */
export const commands: Record<AcaiaCommand, () => Uint8Array> = {
  heartbeat: frame(0, [0x02, 0x00]),
  identify: frame(11, Array(IDENTIFY_ID_BYTES).fill(DASH)),
  notificationRequest: frame(12, NOTIFICATION_REQUEST),
  getSettings: frame(6, Array(SETTINGS_REQUEST_BYTES).fill(0)),
  tare: frame(4, [0x00]),
  timerStart: frame(13, [0x00, 0x00]),
  timerReset: frame(13, [0x00, 0x01]),
  timerStop: frame(13, [0x00, 0x02]),
};
