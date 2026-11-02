import type { JSX } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select.js";
import { CHECK_SCENARIOS, INVESTIGATION_SCENARIOS } from "./scenarios.js";

const GROUPS: [string, readonly string[]][] = [
  ["Checks (docs/checks.md)", CHECK_SCENARIOS],
  ["Investigations", INVESTIGATION_SCENARIOS],
];

/** The export's `scenario`: required, so the browser refuses an export until one is chosen. */
export function ScenarioSelect({ id }: { id: string }): JSX.Element {
  return (
    <Select name="scenario" required>
      <SelectTrigger id={id}>
        <SelectValue placeholder="choose…" />
      </SelectTrigger>
      <SelectContent>
        {GROUPS.map(([label, scenarios]) => (
          <SelectGroup key={label}>
            <SelectLabel>{label}</SelectLabel>
            {scenarios.map((scenario) => (
              <SelectItem key={scenario} value={scenario}>
                {scenario}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
