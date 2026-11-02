import { BluetoothIcon, CircleAlertIcon, EarIcon } from "lucide-react";
import type { JSX } from "react";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import { Button } from "./components/ui/button.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import type { ConnectMode } from "./createScale.js";
import { canRemember } from "./rememberedDevice.js";
import { SavedScalesSection } from "./SavedScalesSection.js";
import { ScaleCard } from "./ScaleCard.js";
import type { SavedScale } from "./savedScales.js";
import { useSavedScales } from "./useSavedScales.js";
import { useScales } from "./useScales.js";

function Problem({ text }: { text: string }): JSX.Element {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/** The only path to the device chooser: browsers require a click, and the page never scans by itself. */
function ConnectButtons({
  isDisabled,
  onConnect,
}: {
  isDisabled: boolean;
  onConnect(mode: ConnectMode): void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={isDisabled} onClick={() => onConnect("session")}>
        <BluetoothIcon />
        Connect a scale
      </Button>
      <Button variant="outline" disabled={isDisabled} onClick={() => onConnect("listen")}>
        <EarIcon />
        Connect listen-only
      </Button>
    </div>
  );
}

/** The page: connect buttons, then one card per scale, two side by side on a laptop screen. */
export function App({ supportProblem }: { supportProblem: string | undefined }): JSX.Element {
  const { scales, problem, addScale, connectSaved, forget } = useScales();
  const { saved, save, remove } = useSavedScales();
  const savedFor = ({ id }: BluetoothDevice) => saved.find((scale) => scale.id === id);

  function removeSaved({ id }: SavedScale): string | undefined {
    const refused = remove(id);
    if (refused === undefined) void forget(id);
    return refused;
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-muted/50">
        <header className="border-b bg-background">
          <div className="mx-auto flex max-w-[110rem] flex-wrap items-center justify-between gap-4 px-4 py-3">
            <div className="grid gap-0.5">
              <h1 className="font-semibold text-lg">OpenPour web harness</h1>
              <p className="text-muted-foreground text-sm">
                Connect one or two scales, then export a fixture for each recording. See{" "}
                <code>harness/README.md</code> for prerequisites, troubleshooting and investigating
                a protocol.
              </p>
            </div>
            <ConnectButtons
              isDisabled={supportProblem !== undefined}
              onConnect={(mode) => void addScale(mode)}
            />
          </div>
        </header>
        <main className="mx-auto grid max-w-[110rem] gap-4 p-4">
          {supportProblem && <Problem text={supportProblem} />}
          {problem && <Problem text={problem} />}
          <SavedScalesSection
            saved={saved}
            canConnect={supportProblem === undefined && canRemember(navigator.bluetooth)}
            onConnect={connectSaved}
            onSave={save}
            onRemove={removeSaved}
          />
          {scales.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              No scale yet. Connect one to open its panel here.
            </p>
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {scales.map(({ label, panel, device, name }) => (
                <ScaleCard
                  key={label}
                  panel={panel}
                  saved={savedFor(device)}
                  onSave={(details) => save({ ...details, id: device.id, name })}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
