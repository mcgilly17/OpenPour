import type { JSX } from "react";
import { NOTE_PREFIX } from "./createScalePanel.js";
import { describeErrorLine, type ErrorLine } from "./errorLines.js";
import { Section } from "./Section.js";

/** The panel's failures, and its notes, newest last. */
export function NotesList({ lines }: { lines: readonly ErrorLine[] }): JSX.Element {
  return (
    <Section title="Errors and notes">
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">None so far.</p>
      ) : (
        <ol className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 text-sm">
          {lines.map((line, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity; the list only appends and drops its oldest.
              key={index}
              className={
                line.text.startsWith(NOTE_PREFIX) ? "text-muted-foreground" : "text-destructive"
              }
            >
              {describeErrorLine(line)}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
