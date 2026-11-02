import { useState } from "react";
import {
  readSavedScales,
  removeSavedScale,
  type SavedScale,
  type ScaleStorage,
  saveScale,
} from "./savedScales.js";

export interface SavedScales {
  saved: readonly SavedScale[];
  /** Returns why the scale wasn't saved, or undefined. */
  save(scale: SavedScale): string | undefined;
  /** Returns why the scale wasn't removed, or undefined. */
  remove(id: string): string | undefined;
}

/** localStorage, or undefined where even reaching it throws, such as with site data blocked. */
function browserStorage(): ScaleStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The scales saved in this browser, for this origin only. */
export function useSavedScales(): SavedScales {
  const [saved, setSaved] = useState(() => readSavedScales(browserStorage()));

  function change(problem: string | undefined): string | undefined {
    setSaved(readSavedScales(browserStorage()));
    return problem;
  }

  return {
    saved,
    save: (scale) => change(saveScale(browserStorage(), scale)),
    remove: (id) => change(removeSavedScale(browserStorage(), id)),
  };
}
