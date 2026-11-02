// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ConnectMode } from "./createScale.js";
import { SavedScalesSection } from "./SavedScalesSection.js";
import type { SavedScale } from "./savedScales.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const KITCHEN: SavedScale = {
  id: "Xq7Lm+Pz2wRk/5Ny0Ab==",
  name: "Acaia LUNAR",
  nickname: "Kitchen Lunar",
  model: "AL008",
  modelYear: "2021",
  firmware: "1.0.016",
};

function renderSection(canConnect: boolean) {
  const onConnect = vi.fn(async (_id: string, _mode: ConnectMode) => "The browser forgot it.");
  const onSave = vi.fn((_scale: SavedScale): string | undefined => undefined);
  const onRemove = vi.fn((_scale: SavedScale): string | undefined => undefined);
  render(
    <SavedScalesSection
      saved={[KITCHEN]}
      canConnect={canConnect}
      onConnect={onConnect}
      onSave={onSave}
      onRemove={onRemove}
    />,
  );
  return {
    onConnect,
    onSave,
    onRemove,
    button: (name: string) => screen.getByRole("button", { name }),
  };
}

describe("SavedScalesSection", () => {
  test("Connect finds the scale by its ID and shows why it couldn't on the row", async () => {
    const { onConnect, button } = renderSection(true);

    fireEvent.click(button("Connect listen-only"));

    expect(await screen.findByText("The browser forgot it.")).toBeDefined();
    expect(onConnect.mock.calls).toEqual([[KITCHEN.id, "listen"]]);
  });

  test("without getDevices there is no Connect, and the row says to use the chooser", () => {
    renderSection(false);

    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.getByText(/no navigator.bluetooth.getDevices/).textContent).toContain(
      "use Connect a scale",
    );
  });

  test("Edit saves the new details under the same ID, or shows why not; Remove asks first", () => {
    const { onSave, onRemove, button } = renderSection(true);
    onSave.mockReturnValueOnce("looks like a device identifier");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(button("Edit"));
    fireEvent.change(screen.getByLabelText("Firmware"), { target: { value: "1.1.0" } });
    fireEvent.click(button("Save"));
    expect(screen.getByText("looks like a device identifier")).toBeDefined();
    fireEvent.click(button("Save"));
    fireEvent.click(button("Remove"));

    const edited = { ...KITCHEN, firmware: "1.1.0" };
    expect(onSave.mock.calls).toEqual([[edited], [edited]]);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(confirm).toHaveBeenCalledOnce();
    expect(onRemove.mock.calls).toEqual([[KITCHEN]]);
  });
});
