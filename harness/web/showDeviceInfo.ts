import type { PrefilledAnswer, ScalePanel } from "./createScalePanel.js";
import { identifierProblem } from "./fixtureDetails.js";
import { DEVICE_INFO_FIELDS, type DeviceInfoResult } from "./readDeviceInfo.js";

function prefill(panel: ScalePanel, answer: PrefilledAnswer, value: string | undefined): void {
  if (value === undefined) return;
  panel.prefill(answer, value);
  // Export refuses it too; saying so now spares a surprise at the end of a recording.
  const problem = identifierProblem(answer, value);
  if (problem) panel.addNote(problem);
}

/**
 * Shows what the Device Information service reported, and fills the export form's model and
 * firmware from it. Firmware falls back to the software revision when the scale has none.
 */
export function showDeviceInfo(panel: ScalePanel, { info, note }: DeviceInfoResult): void {
  for (const field of DEVICE_INFO_FIELDS) panel.show(field, info[field] ?? "unknown");
  prefill(panel, "model", info.modelNumber);
  prefill(panel, "firmware", info.firmwareRevision ?? info.softwareRevision);
  if (note) panel.addNote(note);
}
