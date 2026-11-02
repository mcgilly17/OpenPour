import type { JSX, ReactNode } from "react";
import { Button } from "./components/ui/button.js";
import { CardHeader, CardTitle } from "./components/ui/card.js";
import type {
  ConnectionAction,
  ConnectionControls,
  ConnectionState,
  PanelAction,
} from "./createScalePanel.js";
import { StatusBadges } from "./StatusBadges.js";

const BUTTONS: [ConnectionAction, string][] = [
  ["disconnect", "Disconnect"],
  ["reconnect", "Reconnect"],
  ["listen", "Reconnect listen-only"],
  ["startSession", "Start session"],
  ["cancel", "Cancel"],
];

export interface ScaleHeaderProps {
  title: string;
  connection: ConnectionState | undefined;
  protocol: string;
  /** Which buttons work, as the scale reports them. */
  controls: ConnectionControls;
  onAction(action: PanelAction): void;
  /** More buttons after the connection ones. */
  children?: ReactNode;
}

/** The scale's name, its status, and the buttons that open or close its connection. */
export function ScaleHeader({
  title,
  connection,
  protocol,
  controls,
  onAction,
  children,
}: ScaleHeaderProps): JSX.Element {
  return (
    <CardHeader className="flex flex-col gap-3 border-b [.border-b]:pb-4">
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <StatusBadges connection={connection} protocol={protocol} />
      </div>
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map(([action, label]) => (
          <Button
            key={action}
            variant="outline"
            size="sm"
            disabled={!controls[action]}
            onClick={() => onAction(action)}
          >
            {label}
          </Button>
        ))}
        {children}
      </div>
    </CardHeader>
  );
}
