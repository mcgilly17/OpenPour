# 0019. Readings in the scale's own unit, and scale info

Status: Accepted · 2026-11-03

## Context

A `Reading` carried `grams` and `flowGramsPerSec`. On hardware, an Acaia scale
sends the number on its display, with no unit: in ounces it sends `4.106`, and
the driver reported that as 4.106 g. The unit is only in the settings frame, at
a byte that differs by model, and a unit switch made on the scale sends no new
settings, only a change in the number of decimals. OpenPour's job is to deliver
what the scale says in one shape for every brand; what an app shows, stores or
converts is the app's choice, and an app that matches the scale's display needs
the scale's own value, unit and resolution.

Both tested scales also describe themselves before they are identified, in a
frame carrying their firmware version and a code that differs by model. The
session identified at once, so the frame usually never arrived.

## Decision

- A `Reading` reports the scale's own `value`, its `unit` (`"g"` or `"oz"`)
  and its `decimals`, with `stable` and `t` as before. OpenPour never converts
  units.
- Flow is `flowPerSec`, in the reading's unit per second. The flow filter
  starts again whenever the unit changes, and its deadband is a named constant
  per unit.
- A driver that cannot be sure of the unit (for example, while a unit switch
  is being confirmed) reports no readings until it is.
- A new `info` event carries what the scale says about itself: `firmware` as a
  string, and the model code as raw bytes until codes are confirmed across
  models. A driver may wait a bounded, named time for this information before
  continuing its handshake.

## Consequences

- **Pro:** An app can show exactly what the scale shows, and readings never
  carry a unit the scale didn't use.
- **Pro:** Brands share one shape; a brand that only speaks grams reports `"g"`.
- **Con:** Apps that compare or store readings across unit changes convert
  themselves, and a flow value is meaningless without its unit.
- **Con:** Connecting can take up to the info wait longer.

Rejected: always reporting grams (the app could not match the display without
converting back, and rounding would differ from the scale's); reporting both
grams and the displayed value (two sources of truth for one reading); moving
flow to the app (every app would re-implement the same filter).
