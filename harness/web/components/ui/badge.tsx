import type { ComponentProps, JSX } from "react";
import { cn } from "./cn.js";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const BASE =
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3";

const VARIANTS: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  destructive: "border-transparent bg-destructive text-white",
  outline: "text-foreground",
};

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps): JSX.Element {
  return <span data-slot="badge" className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}
