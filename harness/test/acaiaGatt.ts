import type { GattLayout } from "openpour";

/** A new-style Acaia layout, in the upper case some platforms report. */
export const ACAIA_SVC = "49535343-FE7D-4AE5-8FA9-9FAFD205E455";
export const ACAIA_WRITE = "49535343-8841-43F4-A8D4-ECBE34729BB3";
export const ACAIA_NOTIFY = "49535343-1E4D-4BD9-BA61-23C647249616";

export const ACAIA_GATT: GattLayout = [
  {
    uuid: ACAIA_SVC,
    characteristics: [
      { uuid: ACAIA_WRITE, properties: ["write", "writeWithoutResponse"] },
      { uuid: ACAIA_NOTIFY, properties: ["notify"] },
    ],
  },
];
