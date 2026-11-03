/**
 * Puts the firmware the scale reported into the export form, unless the Firmware field already
 * holds something besides "unknown": a saved scale's firmware, or what the contributor typed. The
 * export still checks it for identifiers, like any answer.
 */
export function prefillFirmware(form: HTMLFormElement | null, firmware: string): void {
  const field = form?.elements.namedItem("firmware");
  if (!(field instanceof HTMLInputElement)) return;
  const current = field.value.trim();
  if (current === "" || current === "unknown") field.value = firmware;
}
