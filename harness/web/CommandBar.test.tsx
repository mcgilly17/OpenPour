// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CommandBar } from "./CommandBar.js";
import type { KnownCommand } from "./commandAvailability.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NO_TIMER = "the driver declares no timer support";

function renderBar() {
  const onCommand = vi.fn<(command: KnownCommand) => void>();
  const availability = {
    tare: undefined,
    timerStart: NO_TIMER,
    timerStop: NO_TIMER,
    timerReset: NO_TIMER,
    battery: undefined,
  };
  render(<CommandBar availability={availability} onCommand={onCommand} />);
  return { onCommand, button: (name: string) => screen.getByRole("button", { name }) };
}

describe("CommandBar", () => {
  test("disables the commands the driver can't send, says why, and sends only the others", () => {
    const { onCommand, button } = renderBar();

    for (const name of ["Start timer", "Stop timer", "Reset timer"]) {
      expect(button(name)).toHaveProperty("disabled", true);
      fireEvent.click(button(name));
    }
    fireEvent.click(button("Tare"));

    expect(onCommand.mock.calls).toEqual([["tare"]]);
    expect(button("Request battery")).toHaveProperty("disabled", false);
    expect(screen.getByText(`Start timer, Stop timer, Reset timer: ${NO_TIMER}.`)).toBeDefined();
  });

  test("hovering a disabled command shows its reason in a tooltip", async () => {
    // jsdom has no ResizeObserver; the tooltip uses one to size its arrow.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const { button } = renderBar();

    const wrapper = button("Stop timer").parentElement;
    if (!wrapper) throw new Error("no tooltip trigger");
    fireEvent.pointerMove(wrapper);

    expect((await screen.findByRole("tooltip")).textContent).toBe(NO_TIMER);
  });
});
