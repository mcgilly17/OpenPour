import type { ComponentProps, JSX } from "react";
import { cn } from "./cn.js";

export type AlertVariant = "default" | "destructive";

const BASE =
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current";

const VARIANTS: Record<AlertVariant, string> = {
  default: "bg-card text-card-foreground",
  destructive:
    "bg-card text-destructive [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
};

export interface AlertProps extends ComponentProps<"div"> {
  variant?: AlertVariant;
}

export function Alert({ className, variant = "default", ...props }: AlertProps): JSX.Element {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(BASE, VARIANTS[variant], className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}
