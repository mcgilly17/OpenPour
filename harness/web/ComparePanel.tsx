import { SearchIcon } from "lucide-react";
import { type JSX, useId, useRef, useState } from "react";
import { ByteTable } from "./ByteTable.js";
import { compareRuns, describeDifferences, type PacketRun } from "./comparePackets.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import type { FindEarlier } from "./createScalePanel.js";
import { describeRun, spacedHex } from "./describeRun.js";
import type { MarkSlot, Marks } from "./Marks.js";
import { Section } from "./Section.js";

/** How many leading bytes "find earlier" matches on until the contributor changes it. */
export const DEFAULT_PREFIX_BYTES = 3;

function describeMarked(run: PacketRun): string {
  return `${describeRun(run)}: ${spacedHex(run.records.map(({ hex }) => hex).join(""))}`;
}

function MarkedRun({ slot, run }: { slot: MarkSlot; run: PacketRun | undefined }): JSX.Element {
  return (
    <p className="break-all font-mono text-xs">
      <span className="mr-2 font-sans font-semibold">{slot}</span>
      {run ? describeMarked(run) : "–"}
    </p>
  );
}

function EarlierRuns({
  runs,
  onCompare,
}: {
  runs: readonly PacketRun[];
  onCompare(run: PacketRun): void;
}): JSX.Element {
  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No earlier packet starts with these bytes.</p>
    );
  }
  return (
    <ol className="grid gap-1">
      {runs.map((run) => (
        <li key={`${run.recording}-${run.records[0]?.t}`} className="flex items-start gap-2">
          <span className="min-w-0 flex-1 break-all font-mono text-xs">{describeMarked(run)}</span>
          <Button variant="outline" size="xs" onClick={() => onCompare(run)}>
            Compare as B
          </Button>
        </li>
      ))}
    </ol>
  );
}

export interface ComparePanelProps {
  marks: Marks;
  onMark(slot: MarkSlot, run: PacketRun): void;
  findEarlier: FindEarlier;
}

/** The two marked runs byte by byte, and earlier runs, from any kept recording, that start like A. */
export function ComparePanel({ marks, onMark, findEarlier }: ComparePanelProps): JSX.Element {
  const { A, B } = marks;
  const prefix = useRef<HTMLInputElement>(null);
  const prefixId = useId();
  const [earlier, setEarlier] = useState<PacketRun[]>();
  const cells = A && B ? compareRuns(A.records, B.records) : [];

  function find(): void {
    const prefixBytes = Math.max(1, prefix.current?.valueAsNumber || DEFAULT_PREFIX_BYTES);
    if (A) setEarlier(findEarlier(A, prefixBytes));
  }

  return (
    <Section
      title="Compare packets"
      hint="Click A or B on an rx row to mark it. Shift-click a later row to extend the mark over a frame split across notifications. Pause the display first if rows are scrolling."
    >
      <MarkedRun slot="A" run={A} />
      <MarkedRun slot="B" run={B} />
      {cells.length > 0 && <ByteTable cells={cells} />}
      {A && B && <p className="text-sm">{describeDifferences(cells)}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={prefixId} className="inline-flex items-center gap-2">
          Find earlier packets starting with the first
          <Input
            id={prefixId}
            ref={prefix}
            type="number"
            min={1}
            defaultValue={DEFAULT_PREFIX_BYTES}
            className="h-8 w-16"
          />
          bytes of A
        </label>
        <Button variant="outline" size="sm" disabled={A === undefined} onClick={find}>
          <SearchIcon />
          Find
        </Button>
      </div>
      {earlier && <EarlierRuns runs={earlier} onCompare={(run) => onMark("B", run)} />}
    </Section>
  );
}
