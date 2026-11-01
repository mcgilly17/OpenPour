import type { GattLayout } from "openpour";
import { type Mock, vi } from "vitest";

/** A stand-in for a Web Bluetooth characteristic: an EventTarget whose GATT calls are spies. */
export interface StubCharacteristic extends EventTarget {
  uuid: string;
  service: { uuid: string };
  properties: Record<string, boolean>;
  value: DataView | undefined;
  startNotifications: Mock<() => Promise<unknown>>;
  writeValueWithResponse: Mock<(value: BufferSource) => Promise<void>>;
  writeValueWithoutResponse: Mock<(value: BufferSource) => Promise<void>>;
  readValue: Mock<() => Promise<DataView>>;
}

export interface StubService {
  uuid: string;
  getCharacteristics: Mock<() => Promise<StubCharacteristic[]>>;
}

export interface StubServer {
  device: EventTarget;
  connected: boolean;
  connect: Mock<() => Promise<unknown>>;
  getPrimaryServices: Mock<() => Promise<unknown[]>>;
  /** Like the browser, fires `gattserverdisconnected` on the device. */
  disconnect: Mock<() => void>;
}

export interface StubGatt {
  /** The chosen device: an EventTarget with a name and its GATT server. */
  device: EventTarget & { name: string; gatt: StubServer };
  server: StubServer;
  services: StubService[];
  characteristics: StubCharacteristic[];
}

function stubCharacteristic(svc: string, uuid: string, properties: string[]): StubCharacteristic {
  const characteristic: StubCharacteristic = Object.assign(new EventTarget(), {
    uuid,
    service: { uuid: svc },
    properties: Object.fromEntries(properties.map((name) => [name, true])),
    value: undefined,
    startNotifications: vi.fn(async (): Promise<unknown> => characteristic),
    writeValueWithResponse: vi.fn(async (_value: BufferSource) => {}),
    writeValueWithoutResponse: vi.fn(async (_value: BufferSource) => {}),
    readValue: vi.fn(async () => new DataView(new ArrayBuffer(0))),
  });
  return characteristic;
}

function stubServer(device: EventTarget, services: StubService[]): StubServer {
  const server: StubServer = {
    device,
    connected: false,
    connect: vi.fn(async (): Promise<unknown> => {
      server.connected = true;
      return server;
    }),
    getPrimaryServices: vi.fn(async (): Promise<unknown[]> => services),
    disconnect: vi.fn(() => {
      server.connected = false;
      device.dispatchEvent(new Event("gattserverdisconnected"));
    }),
  };
  return server;
}

/** A device named `name` whose GATT server, services and characteristics follow `layout`. */
export function stubGatt(layout: GattLayout, name = "PEARL S"): StubGatt {
  const characteristics: StubCharacteristic[] = [];
  const services = layout.map(({ uuid, characteristics: listed }) => {
    const found = listed.map((c) => stubCharacteristic(uuid, c.uuid, c.properties));
    characteristics.push(...found);
    return { uuid, getCharacteristics: vi.fn(async () => found) };
  });
  const target = new EventTarget();
  const server = stubServer(target, services);
  const device = Object.assign(target, { name, gatt: server });
  return { device, server, services, characteristics };
}

/** Every GATT call made on `gatt`, by method name, in the order they were made. */
export function operationsOn({ server, services, characteristics }: StubGatt): string[] {
  const spies: [string, Mock][] = [
    ["connect", server.connect],
    ["getPrimaryServices", server.getPrimaryServices],
    ["disconnect", server.disconnect],
    ...services.map((s): [string, Mock] => ["getCharacteristics", s.getCharacteristics]),
    ...characteristics.flatMap((c): [string, Mock][] => [
      ["startNotifications", c.startNotifications],
      ["writeValueWithResponse", c.writeValueWithResponse],
      ["writeValueWithoutResponse", c.writeValueWithoutResponse],
      ["readValue", c.readValue],
    ]),
  ];
  const calls = spies.flatMap(([name, spy]) =>
    spy.mock.invocationCallOrder.map((order): [number, string] => [order, name]),
  );
  return calls.sort(([a], [b]) => a - b).map(([, name]) => name);
}

/** Delivers `view` the way the browser does: as the new `value`, then an event stamped `timeStamp`. */
export function notify(
  characteristic: StubCharacteristic,
  view: DataView,
  timeStamp: number,
): void {
  characteristic.value = view;
  const event = new Event("characteristicvaluechanged");
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  characteristic.dispatchEvent(event);
}

// The stubs implement only what the harness calls; these casts let them stand in for the browser's.
export const asDevice = (stub: StubGatt["device"]): BluetoothDevice =>
  stub as unknown as BluetoothDevice;
export const asServer = (stub: StubServer): BluetoothRemoteGATTServer =>
  stub as unknown as BluetoothRemoteGATTServer;
export const asCharacteristics = (
  stubs: StubCharacteristic[],
): BluetoothRemoteGATTCharacteristic[] => stubs as unknown as BluetoothRemoteGATTCharacteristic[];
