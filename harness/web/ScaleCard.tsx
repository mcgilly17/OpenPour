import { BookmarkIcon, TriangleAlertIcon } from "lucide-react";
import { type JSX, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { CommandBar } from "./CommandBar.js";
import { ComparePanel } from "./ComparePanel.js";
import type { PacketRun } from "./comparePackets.js";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import { Button } from "./components/ui/button.js";
import { Card, CardContent } from "./components/ui/card.js";
import { EMPTY_FIELD, type ScalePanelStore } from "./createScalePanel.js";
import { InvestigateSection } from "./InvestigateSection.js";
import { LogTable } from "./LogTable.js";
import type { MarkSlot, Marks } from "./Marks.js";
import { NotesList } from "./NotesList.js";
import { Readouts } from "./Readouts.js";
import { RecordingsSection } from "./RecordingsSection.js";
import { SavedScaleForm } from "./SavedScaleForm.js";
import { ScaleHeader } from "./ScaleHeader.js";
import { type SavedScale, type SavedScaleDetails, withSavedDetails } from "./savedScales.js";

function ListenWarning(): JSX.Element {
  return (
    <Alert className="border-sky-300 bg-sky-50 text-sky-950">
      <TriangleAlertIcon />
      <AlertDescription className="text-sky-950">
        Listen-only: the page records what the scale sends but sends nothing, not even heartbeats,
        so the scale may disconnect within seconds. Start session to keep it connected.
      </AlertDescription>
    </Alert>
  );
}

export interface ScaleCardProps {
  panel: ScalePanelStore;
  /** The brand and matched name prefix, e.g. "Acaia PEARL". */
  name: string;
  /** This scale's saved details, if it is saved. */
  saved: SavedScale | undefined;
  /** Saves this scale's details; returns why they weren't saved, or undefined. */
  onSave(details: SavedScaleDetails): string | undefined;
}

/** One scale's card, rendered from its panel store. */
export function ScaleCard({ panel, name, saved, onSave }: ScaleCardProps): JSX.Element {
  const { fields, connection, controls, commands, recordings, log, errors, investigation } =
    useSyncExternalStore(panel.subscribe, panel.getSnapshot);
  const exportForm = useRef<HTMLFormElement>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [isSaving, setSaving] = useState(false);
  const mark = useCallback(
    (slot: MarkSlot, run: PacketRun) => setMarks((marked) => ({ ...marked, [slot]: run })),
    [],
  );
  const title = fields.title ?? "Scale";
  return (
    <Card className="min-w-0 gap-4 py-4">
      <ScaleHeader
        title={saved ? `${title} · ${saved.nickname}` : title}
        connection={connection}
        protocol={fields.protocol ?? EMPTY_FIELD}
        controls={controls}
        onAction={panel.act}
      >
        <Button variant="outline" size="sm" onClick={() => setSaving(true)}>
          <BookmarkIcon />
          {saved ? "Edit saved scale" : "Save scale"}
        </Button>
      </ScaleHeader>
      <CardContent className="grid gap-6 px-4">
        {isSaving && (
          <SavedScaleForm initial={saved} onSave={onSave} onClose={() => setSaving(false)} />
        )}
        {connection === "listening" && <ListenWarning />}
        <Readouts fields={fields} />
        <CommandBar availability={commands} onCommand={panel.act} />
        <InvestigateSection
          investigation={investigation}
          canStart={connection === "connected"}
          name={name}
          commands={commands}
          answers={() => withSavedDetails(new FormData(exportForm.current ?? undefined), saved)}
          onInvestigate={panel.investigate}
        />
        <NotesList lines={errors} />
        <RecordingsSection
          recordings={recordings}
          defaults={saved}
          onExport={panel.exportFixture}
          onDiscard={panel.discard}
          formRef={exportForm}
        />
        <LogTable rows={log} marks={marks} onMark={mark} />
        <ComparePanel marks={marks} onMark={mark} findEarlier={panel.findEarlier} />
      </CardContent>
    </Card>
  );
}
