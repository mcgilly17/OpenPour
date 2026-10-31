# 0005. pnpm-managed git hooks

Status: Accepted · 2026-10-31

## Context

Contributors should get quick feedback without installing Nix or anything else
beyond pnpm. Running tests on every commit makes commits slow.

## Decision

husky + lint-staged + commitlint are installed by `pnpm install`.
- pre-commit: Biome on staged files.
- commit-msg: commitlint (conventional commits).
- pre-push: typecheck and tests.

The config belongs to this repo and changes independently of any consuming app.

## Consequences

- Fast commits; broken pushes are rare. CI still enforces everything.
  − Three dev dependencies. Contributors can bypass hooks with `--no-verify`.

Rejected: Nix-managed hooks; no hooks (CI only); tests on pre-commit.
