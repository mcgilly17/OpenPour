import type { JSX } from "react";
import { Label } from "./components/ui/label.js";

/** One labelled form control. */
export function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
