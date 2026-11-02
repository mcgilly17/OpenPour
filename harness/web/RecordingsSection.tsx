import { DownloadIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, type JSX, type Ref, useId } from "react";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Table, TableBody, TableCell, TableRow } from "./components/ui/table.js";
import type { RecordingSummary } from "./createScalePanel.js";
import { Field } from "./Field.js";
import { type ScaleDetails, ScaleDetailsFields } from "./ScaleDetailsFields.js";
import { ScenarioSelect } from "./ScenarioSelect.js";
import { Section } from "./Section.js";

/** The fixture header's answers, which the scale's export checks before writing a file. */
function ExportFields({ defaults }: { defaults: ScaleDetails | undefined }): JSX.Element {
  const id = useId();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <ScaleDetailsFields defaults={defaults} />
      <Field label="Scenario" id={`${id}-scenario`}>
        <ScenarioSelect id={`${id}-scenario`} />
      </Field>
      <Field label="Detail" id={`${id}-detail`}>
        <Input
          id={`${id}-detail`}
          name="scenarioDetail"
          placeholder="optional, e.g. oz or auto-tare"
        />
      </Field>
    </div>
  );
}

function confirmDiscard(id: number, onDiscard: (recording: number) => void): void {
  if (confirm(`Discard recording #${id}? It can't be recovered.`)) onDiscard(id);
}

interface RecordingRowsProps {
  recordings: readonly RecordingSummary[];
  onDiscard(recording: number): void;
}

function RecordingRows({ recordings, onDiscard }: RecordingRowsProps): JSX.Element {
  if (recordings.length === 0) {
    return <p className="text-muted-foreground text-sm">No recording yet.</p>;
  }
  return (
    <Table>
      <TableBody>
        {recordings.map(({ id, text, canDiscard }) => (
          <TableRow key={id}>
            <TableCell className="w-full whitespace-normal">{text}</TableCell>
            <TableCell>
              <Button type="submit" name="recording" value={String(id)} size="sm">
                <DownloadIcon />
                Export
              </Button>
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canDiscard}
                onClick={() => confirmDiscard(id, onDiscard)}
              >
                <Trash2Icon />
                Discard
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export interface RecordingsSectionProps extends RecordingRowsProps {
  /** Gets the form's answers and the chosen `recording`, once the browser validated them. */
  onExport(answers: FormData): void;
  /** Where model, model year and firmware start: the saved scale's, still editable. */
  defaults?: ScaleDetails | undefined;
  /** The export form, whose current answers the settings sweep exports with. */
  formRef?: Ref<HTMLFormElement>;
}

/** The kept recordings and the form every export uses: each Export button submits it. */
export function RecordingsSection({
  recordings,
  onExport,
  onDiscard,
  defaults,
  formRef,
}: RecordingsSectionProps): JSX.Element {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const { nativeEvent } = event;
    const submitter = nativeEvent instanceof SubmitEvent ? nativeEvent.submitter : null;
    onExport(new FormData(event.currentTarget, submitter));
  }
  return (
    <Section
      title="Recordings"
      hint="Every connection's recording stays here until you discard it. Fill these in, then export any recording."
    >
      <form ref={formRef} onSubmit={submit} className="grid gap-3">
        {/* The form's default button: disabled, so Enter in a field exports nothing. */}
        <button type="submit" disabled hidden />
        <ExportFields defaults={defaults} />
        <RecordingRows recordings={recordings} onDiscard={onDiscard} />
      </form>
    </Section>
  );
}
