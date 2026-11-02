import type { JSX } from "react";
import { Badge } from "./components/ui/badge.js";
import { type ConnectionState, EMPTY_FIELD } from "./createScalePanel.js";

const CONNECTION_TEXT: Record<ConnectionState, string> = {
  connecting: "connecting…",
  waiting: "waiting for the scale to advertise…",
  listening: "listening only: nothing is sent",
  connected: "connected",
  disconnected: "disconnected",
  failed: "connect failed",
};

const BUSY = "border-transparent bg-amber-100 text-amber-900";
const GOOD = "border-transparent bg-emerald-100 text-emerald-900";
const IDLE = "border-transparent bg-secondary text-secondary-foreground";

const CONNECTION_STYLE: Record<ConnectionState, string> = {
  connecting: BUSY,
  waiting: BUSY,
  listening: "border-transparent bg-sky-100 text-sky-900",
  connected: GOOD,
  disconnected: IDLE,
  failed: "border-transparent bg-destructive text-white",
};

/** The session's own states; anything else, such as listen-only, shows as idle. */
const PROTOCOL_STYLE: Record<string, string> = { handshaking: BUSY, ready: GOOD };

function Labelled({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
      {label}
      {children}
    </span>
  );
}

/** Connection and protocol side by side: a connected scale can still be handshaking. */
export function StatusBadges({
  connection,
  protocol,
}: {
  connection: ConnectionState | undefined;
  protocol: string;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Labelled label="Connection">
        <Badge
          data-field="connection"
          variant="outline"
          className={connection && CONNECTION_STYLE[connection]}
        >
          {connection ? CONNECTION_TEXT[connection] : EMPTY_FIELD}
        </Badge>
      </Labelled>
      <Labelled label="Protocol">
        <Badge data-field="protocol" variant="outline" className={PROTOCOL_STYLE[protocol] ?? IDLE}>
          {protocol}
        </Badge>
      </Labelled>
    </div>
  );
}
