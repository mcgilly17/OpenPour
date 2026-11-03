/** The localStorage key: the last "Ask the scale with" choice, by the card's public name. */
export const LAST_ASK_COMMAND_KEY = "openpour-harness:investigate-command";

function readAll(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(localStorage.getItem(LAST_ASK_COMMAND_KEY) ?? "{}");
  return typeof parsed === "object" && parsed !== null ? { ...parsed } : {};
}

/** The choice last made for scales named `name`, such as "Acaia PEARL"; undefined without storage. */
export function readLastAskCommand(name: string): string | undefined {
  try {
    const choice = readAll()[name];
    return typeof choice === "string" ? choice : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers `choice` for scales named `name`; without storage, it is simply not remembered. */
export function saveLastAskCommand(name: string, choice: string): void {
  try {
    localStorage.setItem(LAST_ASK_COMMAND_KEY, JSON.stringify({ ...readAll(), [name]: choice }));
  } catch {
    // A page without storage asks again next time.
  }
}
