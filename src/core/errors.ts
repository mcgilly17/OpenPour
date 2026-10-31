export type OpenPourErrorCode = "unsupported" | "timeout" | "unknown-device" | "protocol";

/**
 * The only error type OpenPour throws or emits. Check `code`, not `instanceof`,
 * so checks still work when two copies of the package are installed (ADR 0012).
 */
export class OpenPourError extends Error {
  readonly code: OpenPourErrorCode;

  constructor(code: OpenPourErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenPourError";
    this.code = code;
  }
}

export function isOpenPourError(value: unknown): value is OpenPourError {
  return value instanceof Error && value.name === "OpenPourError" && "code" in value;
}
