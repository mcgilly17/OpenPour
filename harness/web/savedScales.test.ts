import { describe, expect, test } from "vitest";

import {
  readSavedScales,
  removeSavedScale,
  SAVED_SCALES_KEY,
  type SavedScale,
  type ScaleStorage,
  saveScale,
} from "./savedScales.js";

function memoryStorage(): ScaleStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const KITCHEN: SavedScale = {
  id: "device-id-1",
  name: "Acaia LUNAR",
  nickname: "Kitchen Lunar",
  model: "AL008",
  modelYear: "2021",
  firmware: "1.0.016",
};
const DESK: SavedScale = { ...KITCHEN, id: "device-id-2", nickname: "Desk Pearl" };

describe("saved scales", () => {
  test("saves, replaces in place by device ID, and removes", () => {
    const storage = memoryStorage();

    expect(saveScale(storage, KITCHEN)).toBeUndefined();
    saveScale(storage, DESK);
    saveScale(storage, { ...KITCHEN, firmware: "1.1" });
    expect(readSavedScales(storage)).toEqual([{ ...KITCHEN, firmware: "1.1" }, DESK]);

    expect(removeSavedScale(storage, KITCHEN.id)).toBeUndefined();
    expect(readSavedScales(storage)).toEqual([DESK]);
  });

  test.each(["nickname", "model", "firmware"] as const)(
    "refuses a %s that looks like a device identifier, as an export would, and stores nothing",
    (name) => {
      const storage = memoryStorage();

      const problem = saveScale(storage, { ...KITCHEN, [name]: "PEARLSD9F8BC" });

      expect(problem).toContain(`${name} "PEARLSD9F8BC" contains D9F8BC`);
      expect(storage.items.size).toBe(0);
    },
  );

  test("without usable storage nothing is saved, and nothing throws", () => {
    const throwing: ScaleStorage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };

    for (const storage of [throwing, undefined]) {
      expect(readSavedScales(storage)).toEqual([]);
      expect(saveScale(storage, KITCHEN)).toContain("storage is unavailable");
      expect(removeSavedScale(storage, KITCHEN.id)).toContain("storage is unavailable");
    }
  });

  test("ignores stored data that isn't a list of saved scales", () => {
    const storage = memoryStorage();
    for (const stored of ["not json", '{"id":"x"}', JSON.stringify([KITCHEN, { id: 1 }, null])]) {
      storage.setItem(SAVED_SCALES_KEY, stored);
      expect(readSavedScales(storage)).toEqual(stored.startsWith("[") ? [KITCHEN] : []);
    }
  });
});
