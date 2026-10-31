# 0006. semantic-release to npm

Status: Accepted · 2026-10-31 (one open item below)

## Context

Users depend on version numbers, and public API changes need changelog notes.
Commits already follow conventional commits, which the hooks enforce (ADR 0005).

## Decision

- `.releaserc.json` uses the `conventionalcommits` preset with commit-analyzer,
  release-notes-generator, `@semantic-release/npm` and `@semantic-release/github`.
- Releases go out as tags plus GitHub Releases, with no bot commits to `main`.
- The release job runs only after the quality job passes.
- PRs are squash-merged, and CI lints PR titles, because the PR title becomes
  the commit message.

## Consequences

- **Pro:** Fully automatic releases with no per-PR note files.
- **Con:** A poor PR title gives the wrong version, which is mitigated by the title lint.
- **Con:** **Open:** confirm that `@semantic-release/npm` supports npm trusted publishing (OIDC, provenance) before the first publish.

Rejected: changesets; release-please; manual releases.
