/**
 * Acaia frames from public protocol notes, as hex. None is verified on our hardware yet:
 * roadmap 1.5b checks them against our own captures.
 *
 * "captured" frames were recorded from a scale. "built" frames were assembled by hand
 * to exercise one case, so they only show the layout is self-consistent.
 */
export const ACAIA_VECTORS = {
  /** captured: 175.9 g, then timer 0.2 s. */
  weight: "efdd0c0c05df060000010007000002f30d",
  /** captured on a 2021+ Lunar: 0 g, then timer 8.1 s. */
  weightWithTimer: "efdd0c0c05000000000100070008011c06",
  /** built: −175.9 g. */
  weightNegative: "efdd0c0805df0600000102e80d",
  /** built: 1759 with two, three and four decimals. */
  weightTwoDecimals: "efdd0c0805df0600000200e90b",
  weightThreeDecimals: "efdd0c0805df0600000300ea0b",
  weightFourDecimals: "efdd0c0805df0600000400eb0b",
  /** built: decimals byte 0 is not a valid unit. */
  weightBadUnit: "efdd0c0805df0600000000e70b",
  /** built: 175.9 g, then a timer record cut short. */
  weightTruncatedTimer: "efdd0c0a05df06000001000700f10b",
  /** built: a weight record shorter than 6 bytes. */
  weightTooShort: "efdd0c0305000305",
  /** built: the weight bytes contain the frame header; 5681.5 g. */
  weightContainingHeader: "efdd0c0805efdd00000100f8e2",
  /** built: timer 90.5 s. */
  timer: "efdd0c0507011e050b25",
  /** built: a bare heartbeat reply. */
  ack: "efdd0c040b00e004eb",
  /** built: heartbeat reply, then weight 175.9 g, then timer 90.5 s. */
  ackWithWeightAndTimer: "efdd0c0f0b000005df060000010007011e052010",
  /** captured payload: stop button, 55.1 g, timer 9.7 s. */
  buttonStop: "efdd0c0e080a05270200000101070009075017",
  /** captured payload: start button behind a heartbeat reply, 54.9 g. */
  buttonStart: "efdd0c0d08080b00e0052502000001011d19",
  /** captured payload on a 2021+ scale: bare reset button. */
  buttonReset: "efdd0c0308090c08",
  /** built: tare button with 175.9 g. */
  buttonTare: "efdd0c0a080005df0600000100ea13",
  /** built: unknown key code 7. */
  buttonUnknown: "efdd0c040807070b0f",
  /** built: stop button, then an unknown record tag. */
  buttonThenUnknownTag: "efdd0c04080a0d0e15",
  /** captured: battery 93 %, grams. */
  settings: "efdd08095d020201000101000d60",
  /** captured on a 2021+ Lunar: battery 74 %, timer stopped and running. */
  settingsTimerStopped: "efdd08094a020101000101010e4c",
  settingsTimerRunning: "efdd0809ca020101000101010ecc",
  /** built: as `settings`, in ounces. */
  settingsOunces: "efdd08095d050201000101001060",
  /** built: a message type sessions do not use. */
  unknownType: "efdd0502000200",
} as const;

/** What the phone sends, per the same notes. */
export const ACAIA_COMMAND_VECTORS = {
  heartbeat: "efdd0002000200",
  identify: "efdd0b2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d683b",
  notificationRequest: "efdd0c0900010102020503041506",
  getSettings: "efdd06000000000000000000000000000000000000",
  tare: "efdd04000000",
  timerStart: "efdd0d00000000",
  timerStop: "efdd0d00020002",
  timerReset: "efdd0d00010001",
} as const;
