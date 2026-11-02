import type { PacketRun } from "./comparePackets.js";

/** "ef dd 0c": the recorded hex, spaced into bytes and otherwise unchanged. */
export function spacedHex(hex: string): string {
  return hex.replace(/(..)(?!$)/g, "$1 ");
}

/** ms on the page's shared base, as fixture lines count them. */
export function formatT(t: number): string {
  return `${t.toFixed(1)} ms`;
}

const BASE_UUID = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i;

/** "2a80" for a 16-bit UUID, else its first two groups, which tell a module's characteristics apart. */
export function shortUuid(uuid: string): string {
  return BASE_UUID.exec(uuid)?.[1] ?? uuid.split("-").slice(0, 2).join("-");
}

/** e.g. "#2 at 1234.5 ms, 2 notifications, 14 bytes". */
export function describeRun({ recording, records }: PacketRun): string {
  const byteCount = records.reduce((sum, { hex }) => sum + hex.length / 2, 0);
  const notifications = records.length === 1 ? "1 notification" : `${records.length} notifications`;
  return `#${recording} at ${formatT(records[0]?.t ?? 0)}, ${notifications}, ${byteCount} bytes`;
}
