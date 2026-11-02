import type { Capabilities } from "openpour";

/** The driver's own commands the page can send on demand. Never arbitrary bytes. */
export const KNOWN_COMMANDS = ["tare", "timerStart", "timerStop", "timerReset", "battery"] as const;
export type KnownCommand = (typeof KNOWN_COMMANDS)[number];

/** Why each command can't be sent now; a command with no reason can. */
export type CommandAvailability = Record<KnownCommand, string | undefined>;

const CAPABILITY: Record<KnownCommand, "tare" | "timer" | "battery"> = {
  tare: "tare",
  timerStart: "timer",
  timerStop: "timer",
  timerReset: "timer",
  battery: "battery",
};

export const NEEDS_SESSION = "needs a running session";

/** A capability the driver declares false is the reason before anything else. */
export function commandAvailability(
  capabilities: Capabilities | undefined,
  isRunning: boolean,
): CommandAvailability {
  const reason = (command: KnownCommand): string | undefined => {
    const capability = CAPABILITY[command];
    if (capabilities?.[capability] === false) return `the driver declares no ${capability} support`;
    return isRunning ? undefined : NEEDS_SESSION;
  };
  return {
    tare: reason("tare"),
    timerStart: reason("timerStart"),
    timerStop: reason("timerStop"),
    timerReset: reason("timerReset"),
    battery: reason("battery"),
  };
}
