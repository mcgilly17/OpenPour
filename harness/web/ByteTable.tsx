import type { JSX } from "react";
import { type ByteCell, hexByte } from "./comparePackets.js";
import { cn } from "./components/ui/cn.js";

interface ByteRowProps {
  label: string;
  cells: readonly ByteCell[];
  text(cell: ByteCell): string;
  /** Draws a bar where a notification began, so a split frame shows its split points. */
  startsPacket?(cell: ByteCell): boolean;
}

function ByteRow({ label, cells, text, startsPacket }: ByteRowProps): JSX.Element {
  return (
    <tr>
      <th scope="row" className="px-1.5 text-left font-medium text-muted-foreground">
        {label}
      </th>
      {cells.map((cell) => {
        const isSplit = cell.index > 0 && startsPacket?.(cell) === true;
        return (
          <td
            key={cell.index}
            data-diff={cell.isDifferent || undefined}
            data-split={isSplit || undefined}
            className={cn(
              "px-1 text-center",
              cell.isDifferent && "bg-red-200 font-bold",
              isSplit && "border-foreground/50 border-l-2",
            )}
          >
            {text(cell)}
          </td>
        );
      })}
    </tr>
  );
}

/** A and B byte by byte under their index, with differing bytes and split points marked. */
export function ByteTable({ cells }: { cells: readonly ByteCell[] }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-md border py-1">
      <table className="font-mono text-xs">
        <tbody>
          <ByteRow label="index" cells={cells} text={({ index }) => String(index)} />
          <ByteRow
            label="A"
            cells={cells}
            text={({ a }) => hexByte(a)}
            startsPacket={({ startsPacketA }) => startsPacketA}
          />
          <ByteRow
            label="B"
            cells={cells}
            text={({ b }) => hexByte(b)}
            startsPacket={({ startsPacketB }) => startsPacketB}
          />
        </tbody>
      </table>
    </div>
  );
}
