import type { ScalePanel } from "./createScalePanel.js";
import { DEVICE_INFO_FIELDS, type DeviceInfoResult } from "./readDeviceInfo.js";

/**
 * Shows what the Device Information service reported. On the scales tested so far it describes
 * the Bluetooth module (e.g. Microchip BM70), not the scale, so it never fills the export form:
 * the scale's own model and firmware come from its app until the driver can read them.
 */
export function showDeviceInfo(panel: ScalePanel, { info, note }: DeviceInfoResult): void {
  for (const field of DEVICE_INFO_FIELDS) panel.show(field, info[field] ?? "unknown");
  if (note) panel.addNote(note);
}
