import { BluetoothIcon, EarIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { type JSX, useState } from "react";
import { Button } from "./components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card.js";
import type { ConnectMode } from "./createScale.js";
import { NO_DEVICE_LIST } from "./rememberedDevice.js";
import { SavedScaleForm } from "./SavedScaleForm.js";
import type { SavedScale } from "./savedScales.js";

export interface SavedScalesSectionProps {
  saved: readonly SavedScale[];
  /** Whether the browser lists the devices it remembers, so Connect needs no chooser. */
  canConnect: boolean;
  /** Resolves to why the scale couldn't be connected, or undefined. */
  onConnect(id: string, mode: ConnectMode): Promise<string | undefined>;
  /** Returns why the scale wasn't saved, or undefined. */
  onSave(scale: SavedScale): string | undefined;
  /** Returns why the scale wasn't removed, or undefined. */
  onRemove(scale: SavedScale): string | undefined;
}

type RowProps = Omit<SavedScalesSectionProps, "saved"> & { scale: SavedScale };

function describeScale({ name, model, modelYear, firmware }: SavedScale): string {
  return `${name} · model ${model} · year ${modelYear} · firmware ${firmware}`;
}

function SavedScaleRow({ scale, canConnect, onConnect, onSave, onRemove }: RowProps): JSX.Element {
  const [isEditing, setEditing] = useState(false);
  const [isConnecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string>();

  async function connect(mode: ConnectMode): Promise<void> {
    setConnecting(true);
    setStatus(await onConnect(scale.id, mode));
    setConnecting(false);
  }

  function remove(): void {
    const question = `Remove ${scale.nickname}? The browser also forgets the scale, which drops its connection, and connecting it again needs the chooser.`;
    if (confirm(question)) setStatus(onRemove(scale));
  }

  return (
    <li className="grid gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <span className="font-medium">{scale.nickname}</span>
          <span className="text-muted-foreground text-xs">{describeScale(scale)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canConnect && (
            <>
              <Button size="sm" disabled={isConnecting} onClick={() => void connect("session")}>
                <BluetoothIcon />
                Connect
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isConnecting}
                onClick={() => void connect("listen")}
              >
                <EarIcon />
                Connect listen-only
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2Icon />
            Remove
          </Button>
        </div>
      </div>
      {!canConnect && <p className="text-muted-foreground text-xs">{NO_DEVICE_LIST}</p>}
      {isConnecting && <p className="text-muted-foreground text-xs">Connecting…</p>}
      {status && <p className="text-destructive text-sm">{status}</p>}
      {isEditing && (
        <SavedScaleForm
          initial={scale}
          onSave={(details) => onSave({ ...scale, ...details })}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  );
}

/** The scales saved in this browser: connect one without the chooser, edit or remove it. */
export function SavedScalesSection({ saved, ...rowProps }: SavedScalesSectionProps): JSX.Element {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>Saved scales</CardTitle>
        <p className="text-muted-foreground text-xs">
          Kept in this browser's storage for this address only, never in a fixture. A saved scale's
          card shows its nickname and starts the export form with its details.
        </p>
      </CardHeader>
      <CardContent className="px-4">
        {saved.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None yet. Connect a scale, then use Save scale on its card.
          </p>
        ) : (
          <ul>
            {saved.map((scale) => (
              <SavedScaleRow key={scale.id} scale={scale} {...rowProps} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
