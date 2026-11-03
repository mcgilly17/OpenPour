import { CheckIcon, DownloadIcon, FlaskConicalIcon, RotateCwIcon, ScanIcon } from "lucide-react";
import type { JSX } from "react";
import type { CommandAvailability } from "./commandAvailability.js";
import { Button } from "./components/ui/button.js";
import type {
  InvestigateAction,
  InvestigationState,
  SettingResult,
  SettingRun,
} from "./createInvestigation.js";
import { describeFindings } from "./findSettingBytes.js";
import { InvestigateForm } from "./InvestigateForm.js";
import { Section } from "./Section.js";

export interface InvestigateSectionProps {
  investigation: InvestigationState;
  /** Whether a session runs now, which starting an investigation needs. */
  canStart: boolean;
  /** The card's public name, such as "Acaia PEARL". */
  name: string;
  commands: CommandAvailability;
  /** The export form's answers, saved details over them, as each step exports with. */
  answers(): FormData;
  onInvestigate(action: InvestigateAction): void;
}

type Props = InvestigateSectionProps;

function ExportResults({ investigation, answers, onInvestigate }: Props): JSX.Element {
  const count = investigation.results.length;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={count === 0}
      onClick={() => onInvestigate({ type: "export", answers: answers() })}
    >
      <DownloadIcon />
      Export results{count > 1 ? ` (${count} settings)` : ""}
    </Button>
  );
}

function Idle(props: Props): JSX.Element {
  const { canStart, onInvestigate } = props;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={!canStart} onClick={() => onInvestigate({ type: "open" })}>
        <FlaskConicalIcon />
        Investigate a setting
      </Button>
      {props.investigation.results.length > 0 && <ExportResults {...props} />}
    </div>
  );
}

/** "✓ Sound = on captured", for the step just done. */
function LastCapture({ run }: { run: SettingRun }): JSX.Element | null {
  const last = run.captures.at(-1);
  if (!last) return null;
  return (
    <p className="flex items-center gap-1.5 text-emerald-700 text-sm">
      <CheckIcon className="size-4" />
      {run.setting} = {last.option} captured
    </p>
  );
}

function Step(
  props: Props & { run: SettingRun; status: "waiting" | "reading" | "failed" },
): JSX.Element {
  const { run, status, answers, onInvestigate } = props;
  const index = run.captures.length;
  const read = () => onInvestigate({ type: "read", answers: answers() });
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <LastCapture run={run} />
      <p className="text-sm">
        Step {index + 1} of {run.plan.length} — In the vendor app, set{" "}
        <strong>
          {run.setting} → {run.plan[index]}
        </strong>
        , then close the app.
      </p>
      {status === "reading" && (
        <p className="text-muted-foreground text-sm">
          Reading the scale… this takes a few seconds.
        </p>
      )}
      <div className="flex gap-2">
        {status === "failed" ? (
          <Button size="sm" onClick={read}>
            <RotateCwIcon />
            Retry
          </Button>
        ) : (
          <Button size="sm" disabled={status === "reading"} onClick={read}>
            <ScanIcon />
            Done, read the scale
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={status === "reading"}
          onClick={() => onInvestigate({ type: "cancel" })}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Result(props: Props & { result: SettingResult }): JSX.Element {
  const { result, onInvestigate } = props;
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <h4 className="font-semibold text-sm">Result: {result.setting}</h4>
      <ul className="grid gap-1 font-mono text-xs">
        {describeFindings(result.setting, result.findings).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onInvestigate({ type: "open" })}>
          <FlaskConicalIcon />
          Next setting
        </Button>
        <ExportResults {...props} />
      </div>
    </div>
  );
}

function Screen(props: Props): JSX.Element {
  const { screen } = props.investigation;
  switch (screen.stage) {
    case "idle":
      return <Idle {...props} />;
    case "form":
      return <InvestigateForm {...props} />;
    case "step":
      return <Step {...props} run={screen.run} status={screen.status} />;
    case "result":
      return <Result {...props} result={screen.result} />;
  }
}

/** A guided run through one setting's options, reading the scale after each change. */
export function InvestigateSection(props: Props): JSX.Element {
  const { problem } = props.investigation;
  return (
    <Section
      title="Investigate a setting"
      hint="Change one setting in the vendor app, option by option; after each, the page reconnects, asks the scale, exports the recording and finds the frame bytes that follow the setting. The investigation stays with this card across reconnects; reloading the page loses it."
    >
      <Screen {...props} />
      {problem && <p className="text-destructive text-sm">{problem}</p>}
    </Section>
  );
}
