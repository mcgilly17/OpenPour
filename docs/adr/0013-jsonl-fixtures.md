# 0013. Scrubbed JSONL fixtures

Status: Accepted · 2026-10-31

## Context

Driver regressions are caught by replaying real captures. Raw PacketLogger
and btsnoop files are binary, can't be diffed, and contain hardware addresses
and unrelated devices. The repo is public.

## Decision

- **Format:** `fixtures/<brand>/<model>_fw<ver>_<scenario>.jsonl`. Line 1 is a
  header `{v, brand, model, modelYear, firmware, captured, tool, scenario,
  scrubbed}`; every other line is `{t, dir, svc, chr, hex}`, one raw
  notification or write, never reassembled.
- **Import:** `scripts/import-capture` (tshark) keeps only the scale's own
  characteristics, and each driver's `scrub()` hook masks identifying payloads.
- **Safety:** raw formats are gitignored. CI rejects MAC-shaped strings,
  `scrubbed` not set to true, and unknown header keys.

## Consequences

- Readable diffs, no parser dependency, real timing and real packet splits.
  − Contributors need Wireshark/tshark to import a capture.

Rejected: committing raw captures; hand-written hex without timing.
