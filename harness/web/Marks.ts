import type { PacketRun } from "./comparePackets.js";

export type MarkSlot = "A" | "B";

/** The runs marked A and B in the log, which the compare view lines up byte by byte. */
export type Marks = Partial<Record<MarkSlot, PacketRun>>;
