import type { ComponentProps, JSX } from "react";
import { cn } from "./cn.js";

/** shadcn's Label on a native label: the harness needs nothing Radix's adds. */
export function Label({ className, ...props }: ComponentProps<"label">): JSX.Element {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or nest the control.
    <label
      data-slot="label"
      className={cn(
        "flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
