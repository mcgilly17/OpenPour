import type { JSX } from "react";
import { cn } from "./components/ui/cn.js";
import { EMPTY_FIELD, type PanelField, type PanelState } from "./createScalePanel.js";
import { DEVICE_INFO_FIELDS, type DeviceInfoField } from "./readDeviceInfo.js";

const DEVICE_INFO_LABELS: Record<DeviceInfoField, string> = {
  manufacturer: "Manufacturer",
  modelNumber: "Model number",
  firmwareRevision: "Firmware",
  hardwareRevision: "Hardware rev",
  softwareRevision: "Software rev",
};

type Fields = PanelState["fields"];

function Value({ fields, name }: { fields: Fields; name: PanelField }): JSX.Element {
  return <span data-field={name}>{fields[name] ?? EMPTY_FIELD}</span>;
}

function Stat({
  label,
  children,
  isLarge = false,
}: {
  label: string;
  children: JSX.Element;
  isLarge?: boolean;
}): JSX.Element {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn("font-medium tabular-nums", isLarge ? "text-2xl" : "text-base")}>
        {children}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** What the driver reported, then what the Bluetooth module reported, which isn't the scale. */
export function Readouts({ fields }: { fields: Fields }): JSX.Element {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        <Stat label="Weight" isLarge>
          <Value fields={fields} name="weight" />
        </Stat>
        <Stat label="Timer">
          <Value fields={fields} name="timer" />
        </Stat>
        <Stat label="Battery">
          <Value fields={fields} name="battery" />
        </Stat>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <Detail label="Driver reports">
          <Value fields={fields} name="info" />
        </Detail>
        <Detail label="Capabilities">
          <Value fields={fields} name="capabilities" />
        </Detail>
      </dl>
      <details open className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Bluetooth module: reported by the radio chip, not the scale
        </summary>
        <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          {DEVICE_INFO_FIELDS.map((name) => (
            <Detail key={name} label={DEVICE_INFO_LABELS[name]}>
              <Value fields={fields} name={name} />
            </Detail>
          ))}
        </dl>
      </details>
    </div>
  );
}
