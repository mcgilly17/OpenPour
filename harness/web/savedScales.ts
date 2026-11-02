import { describeError } from "./explainFailure.js";
import { identifierProblem } from "./fixtureDetails.js";

/** The localStorage key. Storage is per origin, so another `--port` keeps another list. */
export const SAVED_SCALES_KEY = "openpour-harness:saved-scales";

/** What a contributor saves about one scale, to prefill the export form. */
export interface SavedScaleDetails {
  nickname: string;
  model: string;
  modelYear: string;
  firmware: string;
}

/**
 * One saved scale, keyed by the browser's `BluetoothDevice.id`. It lives only in this browser's
 * storage: the ID never enters a fixture, an export, the log or a file.
 */
export interface SavedScale extends SavedScaleDetails {
  id: string;
  /** The brand and matched name prefix, e.g. "Acaia LUNAR"; never the whole advertised name. */
  name: string;
}

export type ScaleStorage = Pick<Storage, "getItem" | "setItem">;

const FIELDS = ["id", "name", "nickname", "model", "modelYear", "firmware"] as const;
const DETAILS = ["nickname", "model", "modelYear", "firmware"] as const;

function isSavedScale(value: unknown): value is SavedScale {
  if (typeof value !== "object" || value === null) return false;
  const entries: Record<string, unknown> = { ...value };
  return FIELDS.every((field) => typeof entries[field] === "string");
}

/** The saved scales; none when storage is unavailable or holds something else. */
export function readSavedScales(storage: ScaleStorage | undefined): SavedScale[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(SAVED_SCALES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSavedScale) : [];
  } catch {
    return [];
  }
}

/** Why `scales` couldn't be stored, or undefined once they are. */
function write(storage: ScaleStorage | undefined, scales: SavedScale[]): string | undefined {
  try {
    if (!storage) throw new Error("this page has no localStorage");
    storage.setItem(SAVED_SCALES_KEY, JSON.stringify(scales));
    return undefined;
  } catch (error) {
    return `Couldn't store the change: the browser's storage is unavailable (${describeError(error)}). Everything else still works.`;
  }
}

/** The save form's answers, trimmed. */
export function savedScaleDetails(answers: FormData): SavedScaleDetails {
  const text = (name: string): string => {
    const value = answers.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    nickname: text("nickname"),
    model: text("model"),
    modelYear: text("modelYear"),
    firmware: text("firmware"),
  };
}

/**
 * Adds `scale`, or replaces the saved one with its ID in place. Returns why it wasn't saved: a
 * detail that looks like a device identifier, as an export would refuse it, or no storage.
 */
export function saveScale(
  storage: ScaleStorage | undefined,
  scale: SavedScale,
): string | undefined {
  for (const name of DETAILS) {
    const problem = identifierProblem(name, scale[name]);
    if (problem) return problem;
  }
  const scales = readSavedScales(storage);
  const at = scales.findIndex(({ id }) => id === scale.id);
  return write(storage, at === -1 ? [...scales, scale] : scales.with(at, scale));
}

export function removeSavedScale(
  storage: ScaleStorage | undefined,
  id: string,
): string | undefined {
  return write(
    storage,
    readSavedScales(storage).filter((scale) => scale.id !== id),
  );
}
