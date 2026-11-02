import { CrosshairIcon, DownloadIcon, ScanIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, type JSX, useId, useRef } from "react";
import { DEFAULT_PREFIX_BYTES } from "./ComparePanel.js";
import type { PacketRun } from "./comparePackets.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table.js";
import { spacedHex } from "./describeRun.js";
import { Field } from "./Field.js";
import type { MarkSlot } from "./Marks.js";
import { Section } from "./Section.js";
import {
  baselineOf,
  changesFrom,
  describeChanges,
  hexOf,
  type Sweep,
  type SweepAction,
  type SweepRow,
} from "./settingsSweep.js";

function TrackControls({
  sweep,
  markA,
  onSweep,
}: Pick<SweepSectionProps, "sweep" | "markA" | "onSweep">): JSX.Element {
  const prefix = useRef<HTMLInputElement>(null);
  const prefixId = useId();
  const { tracked } = sweep;
  function track(): void {
    const prefixBytes = Math.max(1, prefix.current?.valueAsNumber || DEFAULT_PREFIX_BYTES);
    if (markA) onSweep({ type: "track", run: markA, prefixBytes });
  }
  return (
    <div className="grid gap-2 text-sm">
      <p>
        Frame to track:{" "}
        {tracked ? (
          <span className="font-mono text-xs">
            {spacedHex(hexOf(tracked.prefix))} … (from the A mark, {tracked.length} bytes)
          </span>
        ) : (
          <span className="text-muted-foreground">none yet</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={prefixId} className="inline-flex items-center gap-2">
          Match the first
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
        <Button variant="outline" size="sm" disabled={markA === undefined} onClick={track}>
          <CrosshairIcon />
          Track this frame
        </Button>
      </div>
    </div>
  );
}

function CaptureForm({
  canCapture,
  onCapture,
}: {
  canCapture: boolean;
  onCapture(setting: string, value: string): void;
}): JSX.Element {
  const id = useId();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const answers = new FormData(event.currentTarget);
    onCapture(String(answers.get("setting") ?? ""), String(answers.get("value") ?? ""));
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Field label="Setting" id={`${id}-setting`}>
        <Input id={`${id}-setting`} name="setting" required placeholder="baseline, or e.g. sound" />
      </Field>
      <Field label="Value" id={`${id}-value`}>
        <Input id={`${id}-value`} name="value" placeholder="e.g. off" />
      </Field>
      <Button type="submit" size="sm" disabled={!canCapture}>
        <ScanIcon />
        Capture
      </Button>
    </form>
  );
}

function changedBytes(row: SweepRow, baseline: SweepRow | undefined): string {
  return baseline === undefined || row === baseline
    ? "— (baseline)"
    : describeChanges(changesFrom(baseline, row));
}

function SweepRows({
  rows,
  onSweep,
  onMark,
}: { rows: readonly SweepRow[] } & Pick<SweepSectionProps, "onSweep" | "onMark">): JSX.Element {
  const baseline = baselineOf(rows);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Setting</TableHead>
          <TableHead>Value</TableHead>
          <TableHead className="w-full">Changed bytes</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows hold no state of their own, and the same frame can be captured twice.
          <TableRow key={index}>
            <TableCell>{row.setting}</TableCell>
            <TableCell>{row.value || "—"}</TableCell>
            <TableCell className="whitespace-normal font-mono text-xs">
              {changedBytes(row, baseline)}
            </TableCell>
            <TableCell className="flex gap-1">
              <Button variant="outline" size="xs" onClick={() => onMark("A", row.run)}>
                A
              </Button>
              <Button variant="ghost" size="xs" onClick={() => onSweep({ type: "remove", index })}>
                <Trash2Icon />
                Remove
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export interface SweepSectionProps {
  sweep: Sweep;
  /** The A mark, which Track this frame starts from. */
  markA: PacketRun | undefined;
  /** The export form's answers, as captures and the sweep's export use them. */
  answers(): FormData;
  onSweep(action: SweepAction): void;
  onMark(slot: MarkSlot, run: PacketRun): void;
}

/** Tracks one frame through a series of one-setting changes, a row per change. */
export function SweepSection(props: SweepSectionProps): JSX.Element {
  const { sweep, answers, onSweep } = props;
  const capture = (setting: string, value: string) =>
    onSweep({ type: "capture", setting, value, answers: answers() });
  return (
    <Section
      title="Settings sweep"
      hint="Mark the frame as A and track it. After each setting change and reconnect, ask for the frame again, then Capture: the row lists the bytes that changed from the baseline, and the recording is exported as its evidence."
    >
      <TrackControls {...props} />
      <CaptureForm canCapture={sweep.tracked !== undefined} onCapture={capture} />
      {sweep.problem && <p className="text-destructive text-sm">{sweep.problem}</p>}
      {sweep.rows.length > 0 && <SweepRows rows={sweep.rows} {...props} />}
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={sweep.rows.length === 0}
          onClick={() => onSweep({ type: "export", answers: answers() })}
        >
          <DownloadIcon />
          Export sweep
        </Button>
      </div>
    </Section>
  );
}
