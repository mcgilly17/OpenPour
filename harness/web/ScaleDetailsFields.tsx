import { type JSX, useId } from "react";
import { Input } from "./components/ui/input.js";
import { Field } from "./Field.js";
import type { SavedScaleDetails } from "./savedScales.js";

export type ScaleDetails = Pick<SavedScaleDetails, "model" | "modelYear" | "firmware">;

/**
 * Model, model year and firmware, starting from `defaults` or unknown. Both the export form and the
 * saved-scale form ask for them. A field starts afresh when its default changes, such as on saving.
 */
export function ScaleDetailsFields({
  defaults,
}: {
  defaults?: ScaleDetails | undefined;
}): JSX.Element {
  const id = useId();
  return (
    <>
      <Field label="Model" id={`${id}-model`}>
        <Input
          key={defaults?.model}
          id={`${id}-model`}
          name="model"
          defaultValue={defaults?.model ?? "unknown"}
          required
        />
      </Field>
      <Field label="Model year" id={`${id}-year`}>
        <Input
          key={defaults?.modelYear}
          id={`${id}-year`}
          name="modelYear"
          defaultValue={defaults?.modelYear ?? "unknown"}
          required
          pattern="\d{4}|unknown"
          title="A year like 2021, or unknown"
        />
      </Field>
      <Field label="Firmware" id={`${id}-firmware`}>
        <Input
          key={defaults?.firmware}
          id={`${id}-firmware`}
          name="firmware"
          defaultValue={defaults?.firmware ?? "unknown"}
          required
        />
      </Field>
    </>
  );
}
