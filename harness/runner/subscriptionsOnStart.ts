import type { ScaleSession } from "openpour";

export interface Characteristic {
  svc: string;
  chr: string;
}

/**
 * The characteristics `session` subscribes to when it starts. Sessions are pure (ADR 0017), so
 * starting a spare one just to read its commands sends nothing; pass one nobody else uses.
 */
export function subscriptionsOnStart(session: ScaleSession, t: number): Characteristic[] {
  return session
    .start(t)
    .commands.flatMap((command) =>
      command.type === "subscribe" ? [{ svc: command.svc, chr: command.chr }] : [],
    );
}
