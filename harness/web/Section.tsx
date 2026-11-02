import type { JSX, ReactNode } from "react";

export interface SectionProps {
  title: string;
  /** A line under the title on how to use the section. */
  hint?: string;
  /** Controls at the right of the title, such as the log's filters. */
  actions?: ReactNode;
  children: ReactNode;
}

/** One titled part of a scale's card. */
export function Section({ title, hint, actions, children }: SectionProps): JSX.Element {
  return (
    <section className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">{title}</h3>
        {actions}
      </div>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      {children}
    </section>
  );
}
