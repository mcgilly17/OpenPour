/** Past this many lines the oldest go, so a long failing session can't grow the page forever. */
export const MAX_ERRORS_SHOWN = 50;

/** One line of a panel's error list: a message and how many times in a row it came. */
export interface ErrorLine {
  text: string;
  count: number;
}

/** Adds `text` to `lines`, counting a repeat of the last line into it instead of adding one. */
export function addErrorLine(lines: ErrorLine[], text: string): void {
  const last = lines.at(-1);
  if (last?.text === text) last.count += 1;
  else lines.push({ text, count: 1 });
  if (lines.length > MAX_ERRORS_SHOWN) lines.shift();
}

/** The line as shown, e.g. "write 2a80 failed: … (×4)". */
export function describeErrorLine({ text, count }: ErrorLine): string {
  return count === 1 ? text : `${text} (×${count})`;
}
