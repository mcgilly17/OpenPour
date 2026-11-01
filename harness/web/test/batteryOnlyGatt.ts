import type { GattLayout } from "openpour";

/** A device that has a GATT server but none of the Acaia services: only the standard battery one. */
export const BATTERY_ONLY_GATT: GattLayout = [
  {
    uuid: "0000180f-0000-1000-8000-00805f9b34fb",
    characteristics: [
      { uuid: "00002a19-0000-1000-8000-00805f9b34fb", properties: ["read", "notify"] },
    ],
  },
];
