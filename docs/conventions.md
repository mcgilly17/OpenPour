# Coding conventions

Biome and the compiler enforce most of these rules. Why we chose them: [ADR 0016](adr/0016-coding-conventions.md).

## Naming

| Thing                      | Style                         | Example                                   |
| -------------------------- | ----------------------------- | ----------------------------------------- |
| Types, interfaces, classes | PascalCase, no `I` prefix     | `Scale`, `Reading`                        |
| Functions, variables       | camelCase                     | `decodeFrame`, `lastReading`              |
| Tuning values              | UPPER_SNAKE named constants   | `FLOW_WINDOW_MS`, `HEARTBEAT_INTERVAL_MS` |
| Booleans                   | yes/no question               | `isStable`, `hasTare`                     |
| Files                      | named after their main export | `decodeFrame.ts`, `FlowFilter.ts`         |
| Folders                    | kebab-case                    | `transports/ble-plx/`                     |

```ts
// ✅
export const FLOW_DEADBAND_GRAMS = 0.05
// ❌ magic number, no unit
if (Math.abs(delta) < 0.05) return 0
```

## Types

1. **String unions, never enums.** Enums emit runtime code, can't run under Node's type stripping, and log as numbers.

   ```ts
   type ScaleState = "connecting" | "connected" | "disconnected"   // ✅
   enum ScaleState { Connecting, Connected, Disconnected }          // ❌
   ```
2. **Explicit types on every export.** `isolatedDeclarations` requires them.

   ```ts
   export function decodeWeight(bytes: Uint8Array): number { … }   // ✅
   export function decodeWeight(bytes: Uint8Array) { … }           // ❌
   ```
3. **Outside data is `unknown` until checked.** That includes BLE bytes, fixture files and user options. Use `any` only with a comment explaining why.
4. **No non-null `!`.** Handle the missing case.

   ```ts
   const chr = service.characteristics.find(isNotify)
   if (!chr) throw new OpenPourError("protocol", "no notify characteristic")  // ✅
   service.characteristics.find(isNotify)!                                      // ❌
   ```
5. **`interface` for things, `type` for unions and combinations.**

   ```ts
   interface Reading { t: number; grams: number; stable: boolean; flowGramsPerSec: number }
   type ScaleEvent = ButtonEvent | TimerEvent
   ```
6. **Units in names.** Use `grams`, `…Ms` and `…GramsPerSec`, never a bare `weight` or `delay`.

## Modules and files

- **Named exports only.** No `export default`, and no barrel files except the package entry points listed in `exports`.
- **Small files and functions.** If a section needs a comment to explain what it does, make it a function.
- **Comments explain _why_,** not what the code does.

## Tests

- **Placement:** each test sits next to the file it tests, as `decodeFrame.ts` and `decodeFrame.test.ts`.
- **Helpers and fixtures:** shared helpers live in `src/test/`, and recorded captures in `fixtures/<brand>/` ([ADR 0013](adr/0013-jsonl-fixtures.md)).
- **Driver changes:** every driver change comes with a fixture and a replay test.
