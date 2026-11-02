/** The checks in docs/checks.md, by ID, as an export's scenario. */
export const CHECK_SCENARIOS = [
  "C1-connect",
  "C2-keeps-streaming",
  "C3-zero",
  "C4-known-weights",
  "C5-settling",
  "C6-negative",
  "C7-app-tare",
  "C8-scale-tare",
  "C9-scale-timer",
  "C10-app-timer",
  "C11-battery",
  "C12-units",
  "C13-steady-pour",
  "C14-pour-stops",
  "C15-drop",
  "C16-reconnect",
  "C17-two-scales",
  "C18-identity",
] as const;

/** Scenarios for investigating a protocol rather than running a check. */
export const INVESTIGATION_SCENARIOS = ["mode", "settings-change", "info-frame", "smoke"] as const;
