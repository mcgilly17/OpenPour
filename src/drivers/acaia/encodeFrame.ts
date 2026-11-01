export const FRAME_HEADER: readonly [number, number] = [0xef, 0xdd];

/** The sum of the even-index bytes and the sum of the odd-index bytes, each kept to one byte. */
export function checksum(bytes: Uint8Array): [number, number] {
  let even = 0;
  let odd = 0;
  bytes.forEach((byte, i) => {
    if (i % 2 === 0) even += byte;
    else odd += byte;
  });
  return [even & 0xff, odd & 0xff];
}

/**
 * Builds a frame: header, message type, payload, checksum of the payload.
 * Frames from the scale use the same layout, with a length byte as the first payload byte.
 */
export function encodeFrame(type: number, payload: Uint8Array): Uint8Array {
  return Uint8Array.of(...FRAME_HEADER, type, ...payload, ...checksum(payload));
}
