import { type Driver, isOpenPourError } from "openpour";

/** One line for any thrown value, keeping the browser's error name (e.g. NetworkError). */
export function describeError(error: unknown): string {
  if (isOpenPourError(error)) return `${error.code}: ${error.message}`;
  if (!(error instanceof Error)) return String(error);
  return error.name === "Error" ? error.message : `${error.name}: ${error.message}`;
}

/** Why this page can't use Bluetooth at all, or undefined when it can. */
export function supportProblem(): string | undefined {
  if (!window.isSecureContext) {
    return "This page isn't a secure context, so the browser hides Web Bluetooth. Open it at http://localhost (not a network address) or over https.";
  }
  if (!("bluetooth" in navigator)) {
    return "This browser has no Web Bluetooth. Use Chrome or Edge on macOS, Windows, Linux or Android; Safari and Firefox don't support it.";
  }
  return undefined;
}

export function explainChooseFailure(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotFoundError") {
    return `No scale was chosen. The chooser was cancelled, or Bluetooth is off or not allowed for this browser. (${describeError(error)})`;
  }
  if (name === "SecurityError") {
    return `The browser blocked Bluetooth. Open the page on localhost or https and connect with a click. (${describeError(error)})`;
  }
  return `The device chooser failed: ${describeError(error)}`;
}

// Chrome's message when the device isn't advertising, e.g. a scale still starting up.
const OUT_OF_RANGE = /no longer in range/i;

/** Whether connecting failed because the device isn't advertising right now. */
export function isOutOfRange(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "NetworkError" &&
    OUT_OF_RANGE.test(error.message)
  );
}

function asSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

export function explainConnectFailure(error: unknown, driver: Driver): string {
  if (isOpenPourError(error) && error.code === "unknown-device") {
    const services = driver.services.join(", ");
    return `Connected, but none of the ${driver.brand} driver's services were found (unknown-device). The page can only see the services it asks for: ${services}. This may be a different scale or an unsupported protocol variant.`;
  }
  const failure = `Couldn't connect: ${asSentence(describeError(error))}`;
  if (isOutOfRange(error)) {
    return `${failure} If you just switched the scale on, wait a few seconds and reconnect: it isn't advertising yet. Otherwise wake it and bring it closer.`;
  }
  return `${failure} Check that the scale is on, awake and nearby, and not connected to another app or tab: it accepts one connection at a time. After a drop, some scales need a few seconds before they accept a new connection.`;
}
