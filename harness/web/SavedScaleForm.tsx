import { type FormEvent, type JSX, useId, useState } from "react";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Field } from "./Field.js";
import { ScaleDetailsFields } from "./ScaleDetailsFields.js";
import { type SavedScaleDetails, savedScaleDetails } from "./savedScales.js";

export interface SavedScaleFormProps {
  /** The saved details being edited, or undefined for a scale not saved yet. */
  initial: SavedScaleDetails | undefined;
  /** Saves the answers; returns why they weren't saved, or undefined. */
  onSave(details: SavedScaleDetails): string | undefined;
  onClose(): void;
}

/** Nickname, model, model year and firmware, saved in this browser only. */
export function SavedScaleForm({ initial, onSave, onClose }: SavedScaleFormProps): JSX.Element {
  const id = useId();
  const [problem, setProblem] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const refused = onSave(savedScaleDetails(new FormData(event.currentTarget)));
    setProblem(refused);
    if (refused === undefined) onClose();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Nickname" id={`${id}-nickname`}>
          <Input
            id={`${id}-nickname`}
            name="nickname"
            defaultValue={initial?.nickname}
            placeholder="e.g. Kitchen Lunar"
            required
          />
        </Field>
        <ScaleDetailsFields defaults={initial} />
      </div>
      {problem && <p className="text-destructive text-sm">{problem}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
