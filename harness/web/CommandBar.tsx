import type { JSX } from "react";
import {
  type CommandAvailability,
  KNOWN_COMMANDS,
  type KnownCommand,
} from "./commandAvailability.js";
import { Button } from "./components/ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip.js";
import { Section } from "./Section.js";

export const COMMAND_LABELS: Record<KnownCommand, string> = {
  tare: "Tare",
  timerStart: "Start timer",
  timerStop: "Stop timer",
  timerReset: "Reset timer",
  battery: "Request battery",
};

/** e.g. "Start timer, Stop timer, Reset timer: the driver declares no timer support." */
function describeUnavailable(availability: CommandAvailability): string {
  const byReason = new Map<string, string[]>();
  for (const command of KNOWN_COMMANDS) {
    const reason = availability[command];
    if (reason) byReason.set(reason, [...(byReason.get(reason) ?? []), COMMAND_LABELS[command]]);
  }
  return [...byReason].map(([reason, labels]) => `${labels.join(", ")}: ${reason}.`).join(" ");
}

interface CommandButtonProps {
  command: KnownCommand;
  reason: string | undefined;
  onCommand(command: KnownCommand): void;
}

function CommandButton({ command, reason, onCommand }: CommandButtonProps): JSX.Element {
  const button = (
    <Button variant="secondary" disabled={reason !== undefined} onClick={() => onCommand(command)}>
      {COMMAND_LABELS[command]}
    </Button>
  );
  if (reason === undefined) return button;
  // A disabled button gets no pointer events, so the tooltip hangs on a wrapper.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export interface CommandBarProps {
  availability: CommandAvailability;
  onCommand(command: KnownCommand): void;
}

/** The driver's own commands. A command it can't send now is disabled, with the reason. */
export function CommandBar({ availability, onCommand }: CommandBarProps): JSX.Element {
  const unavailable = describeUnavailable(availability);
  return (
    <Section title="Driver commands">
      <div className="flex flex-wrap gap-2">
        {KNOWN_COMMANDS.map((command) => (
          <CommandButton
            key={command}
            command={command}
            reason={availability[command]}
            onCommand={onCommand}
          />
        ))}
      </div>
      {unavailable && <p className="text-muted-foreground text-xs">{unavailable}</p>}
    </Section>
  );
}
