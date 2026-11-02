import type { ComponentProps, JSX } from "react";
import { cn } from "./cn.js";

export function Card({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">): JSX.Element {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}
