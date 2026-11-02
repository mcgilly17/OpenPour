import type { ScaleEvent } from "openpour";
import type { FixtureRecord } from "openpour/replay";

/**
 * One row of a scale's log, in the order the runner reported it, so a packet's decoded events
 * follow it directly. Times are on the page's shared base: a packet's `t` is its fixture line's.
 */
export type LogEntry =
  /** One notification, read result or write, exactly as its recording keeps it. */
  | { kind: "packet"; recording: number; record: FixtureRecord }
  | { kind: "event"; t: number; event: ScaleEvent }
  /** What the page did: started listening or a session, or saw the connection end. */
  | { kind: "marker"; t: number; text: string };
