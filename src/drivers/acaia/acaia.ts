import { OpenPourError } from "../../core/errors.js";
import type { Driver } from "../../core/types.js";
import { createAcaiaSession } from "./createAcaiaSession.js";
import { findVariant } from "./findVariant.js";

export const acaia: Driver = {
  brand: "Acaia",
  namePrefixes: ["ACAIA", "LUNAR", "PYXIS", "PROCH", "PEARL", "CINCO"],
  services: ["49535343-fe7d-4ae5-8fa9-9fafd205e455", "00001820-0000-1000-8000-00805f9b34fb"],
  createSession(gatt) {
    const variant = findVariant(gatt);
    if (!variant) throw new OpenPourError("unknown-device", "no Acaia service in the GATT layout");
    return createAcaiaSession(variant);
  },
};
