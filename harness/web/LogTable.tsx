import { PauseIcon, PlayIcon } from "lucide-react";
import { type JSX, type MouseEvent, memo, useLayoutEffect, useRef, useState } from "react";
import type { PacketRun } from "./comparePackets.js";
import { Button } from "./components/ui/button.js";
import { cn } from "./components/ui/cn.js";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table.js";
import type { LogRow } from "./createScalePanel.js";
import type { LogEntry } from "./LogEntry.js";
import {
  cellsOf,
  entriesBetween,
  isMarked,
  isShown,
  ROW_FILTERS,
  type RowFilter,
  type RowFilters,
} from "./logRows.js";
import type { MarkSlot, Marks } from "./Marks.js";
import { Section } from "./Section.js";
import { selectRun } from "./selectRun.js";

const ALL_SHOWN: RowFilters = { tx: true, rx: true, reading: true, event: true };

const FILTER_LABELS: Record<RowFilter, string> = {
  tx: "tx",
  rx: "rx",
  reading: "readings",
  event: "other events",
};

function rowStyle(entry: LogEntry): string {
  if (entry.kind === "marker") return "italic";
  if (entry.kind === "event") return "text-muted-foreground";
  return entry.record.dir === "tx" ? "text-blue-700" : "";
}

function MarkButtons(): JSX.Element {
  return (
    <div className="flex gap-1">
      {(["A", "B"] as const).map((slot) => (
        <Button key={slot} variant="outline" size="xs" data-mark={slot}>
          {slot}
        </Button>
      ))}
    </div>
  );
}

interface LogLineProps {
  row: LogRow;
  isMarkedA: boolean;
  isMarkedB: boolean;
}

/** One row; memoised, so a new packet renders one row rather than the whole log. */
const LogLine = memo(function LogLine({ row, isMarkedA, isMarkedB }: LogLineProps) {
  const { entry } = row;
  const isRx = entry.kind === "packet" && entry.record.dir === "rx";
  return (
    <TableRow
      data-row={row.id}
      title={entry.kind === "packet" ? entry.record.chr : undefined}
      className={cn(
        "hover:bg-muted/30",
        rowStyle(entry),
        isMarkedA && "bg-yellow-100 hover:bg-yellow-100",
        isMarkedB && "bg-sky-100 hover:bg-sky-100",
      )}
    >
      <TableCell className="px-1.5 py-0.5">{isRx && <MarkButtons />}</TableCell>
      {cellsOf(entry).map((text, column) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a row's cells are fixed columns.
        <TableCell key={column} className="px-1.5 py-0.5">
          {text}
        </TableCell>
      ))}
    </TableRow>
  );
});

function FilterBox({
  filter,
  filters,
  onChange,
}: {
  filter: RowFilter;
  filters: RowFilters;
  onChange(filters: RowFilters): void;
}): JSX.Element {
  return (
    <label className="inline-flex items-center gap-1">
      <input
        type="checkbox"
        className="size-3.5 accent-primary"
        checked={filters[filter]}
        onChange={(event) => onChange({ ...filters, [filter]: event.target.checked })}
      />
      {FILTER_LABELS[filter]}
    </label>
  );
}

export interface LogTableProps {
  rows: readonly LogRow[];
  marks: Marks;
  onMark(slot: MarkSlot, run: PacketRun): void;
}

/**
 * The live log: one row per packet, decoded event or marker, in the order reported. Pausing
 * freezes what is on screen while rows keep arriving behind it.
 */
export function LogTable({ rows, marks, onMark }: LogTableProps): JSX.Element {
  const [frozen, setFrozen] = useState<readonly LogRow[]>();
  const [filters, setFilters] = useState(ALL_SHOWN);
  const anchors = useRef<Partial<Record<MarkSlot, LogRow>>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const shown = (frozen ?? rows).filter(({ entry }) => isShown(entry, filters));

  useLayoutEffect(() => {
    if (!frozen && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  });

  // A click marks one row; a shift-click extends the mark from the last clicked row to this one.
  function mark(event: MouseEvent<HTMLElement>): void {
    const button = event.target instanceof Element ? event.target.closest("[data-mark]") : null;
    const rowId = button?.closest("tr")?.getAttribute("data-row");
    const row = shown.find(({ id }) => String(id) === rowId);
    if (!(button instanceof HTMLElement) || !row) return;
    const slot: MarkSlot = button.dataset.mark === "B" ? "B" : "A";
    const anchor = anchors.current[slot];
    const from = event.shiftKey && anchor && shown.includes(anchor) ? anchor : row;
    anchors.current[slot] = from;
    const run = selectRun(entriesBetween(shown, from, row));
    if (run) onMark(slot, run);
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Button
        variant={frozen ? "default" : "outline"}
        size="xs"
        aria-pressed={frozen !== undefined}
        onClick={() => setFrozen(frozen ? undefined : rows)}
      >
        {frozen ? <PlayIcon /> : <PauseIcon />}
        {frozen ? "Resume display" : "Pause display"}
      </Button>
      <span className="text-muted-foreground">Show</span>
      {ROW_FILTERS.map((filter) => (
        <FilterBox key={filter} filter={filter} filters={filters} onChange={setFilters} />
      ))}
    </div>
  );
  return (
    <Section title="Log" actions={controls}>
      <div ref={scroller} className="h-80 overflow-auto rounded-md border font-mono text-xs">
        <table className="w-full">
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              {["Mark", "Time", "Dir", "Source", "Data"].map((heading) => (
                <TableHead key={heading} className="h-7 px-1.5">
                  {heading}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody onClick={mark}>
            {shown.map((row) => (
              <LogLine
                key={row.id}
                row={row}
                isMarkedA={isMarked(row.entry, marks.A)}
                isMarkedB={isMarked(row.entry, marks.B)}
              />
            ))}
          </TableBody>
        </table>
      </div>
    </Section>
  );
}
