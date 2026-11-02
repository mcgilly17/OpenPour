import { TriangleAlertIcon } from "lucide-react";
import { type JSX, useCallback, useState, useSyncExternalStore } from "react";
import { CommandBar } from "./CommandBar.js";
import { ComparePanel } from "./ComparePanel.js";
import type { PacketRun } from "./comparePackets.js";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import { Card, CardContent } from "./components/ui/card.js";
import { EMPTY_FIELD, type ScalePanelStore } from "./createScalePanel.js";
import { LogTable } from "./LogTable.js";
import type { MarkSlot, Marks } from "./Marks.js";
import { NotesList } from "./NotesList.js";
import { Readouts } from "./Readouts.js";
import { RecordingsSection } from "./RecordingsSection.js";
import { ScaleHeader } from "./ScaleHeader.js";

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

/** One scale's card, rendered from its panel store. */
export function ScaleCard({ panel }: { panel: ScalePanelStore }): JSX.Element {
  const { fields, connection, controls, commands, recordings, log, errors } = useSyncExternalStore(
    panel.subscribe,
    panel.getSnapshot,
  );
  const [marks, setMarks] = useState<Marks>({});
  const mark = useCallback(
    (slot: MarkSlot, run: PacketRun) => setMarks((marked) => ({ ...marked, [slot]: run })),
    [],
  );
  return (
    <Card className="min-w-0 gap-4 py-4">
      <ScaleHeader
        title={fields.title ?? "Scale"}
        connection={connection}
        protocol={fields.protocol ?? EMPTY_FIELD}
        controls={controls}
        onAction={panel.act}
      />
      <CardContent className="grid gap-6 px-4">
        {connection === "listening" && <ListenWarning />}
        <Readouts fields={fields} />
        <CommandBar availability={commands} onCommand={panel.act} />
        <NotesList lines={errors} />
        <RecordingsSection
          recordings={recordings}
          onExport={panel.exportFixture}
          onDiscard={panel.discard}
        />
        <LogTable rows={log} marks={marks} onMark={mark} />
        <ComparePanel marks={marks} onMark={mark} findEarlier={panel.findEarlier} />
      </CardContent>
    </Card>
  );
}
