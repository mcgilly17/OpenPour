import { PlayIcon } from "lucide-react";
import { type FormEvent, type JSX, useId } from "react";
import { COMMAND_LABELS } from "./CommandBar.js";
import {
  type CommandAvailability,
  KNOWN_COMMANDS,
  type KnownCommand,
  NEEDS_SESSION,
} from "./commandAvailability.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select.js";
import type { InvestigateAction } from "./createInvestigation.js";
import { Field } from "./Field.js";
import { readLastAskCommand, saveLastAskCommand } from "./lastAskCommand.js";

/** The select's value for asking the scale nothing. */
const NOTHING = "nothing";

export interface InvestigateFormProps {
  /** The card's public name, such as "Acaia PEARL", which the last choice is remembered by. */
  name: string;
  commands: CommandAvailability;
  onInvestigate(action: InvestigateAction): void;
}

/** The setting, its options, and what to ask the scale with at each step. */
export function InvestigateForm({
  name,
  commands,
  onInvestigate,
}: InvestigateFormProps): JSX.Element {
  const id = useId();
  // The driver's commands, whether or not a session runs now: each step starts its own.
  const available = KNOWN_COMMANDS.filter((command) =>
    [undefined, NEEDS_SESSION].includes(commands[command]),
  );
  const remembered = readLastAskCommand(name);
  const initial = available.find((command) => command === remembered) ?? NOTHING;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const answers = new FormData(event.currentTarget);
    const text = (field: string): string => String(answers.get(field) ?? "");
    const choice = text("command");
    saveLastAskCommand(name, choice);
    const command = available.find((known): known is KnownCommand => known === choice);
    onInvestigate({ type: "start", setting: text("setting"), options: text("options"), command });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Setting name" id={`${id}-setting`}>
          <Input id={`${id}-setting`} name="setting" required placeholder="e.g. Sound" />
        </Field>
        <Field label="Options" id={`${id}-options`}>
          <Input id={`${id}-options`} name="options" required placeholder="e.g. on, off" />
        </Field>
        <Field label="Ask the scale with" id={`${id}-command`}>
          <Select name="command" defaultValue={initial}>
            <SelectTrigger id={`${id}-command`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOTHING}>nothing</SelectItem>
              {available.map((command) => (
                <SelectItem key={command} value={command}>
                  {COMMAND_LABELS[command]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <PlayIcon />
          Start
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onInvestigate({ type: "cancel" })}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
