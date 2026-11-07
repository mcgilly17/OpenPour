# 0020. Stay on 0.x until 1.0 is chosen

Status: Accepted · 2026-11-07

## Context

OpenPour is usable for the Acaia Pearl S and Lunar but not yet verified against the formal checks, and only one driver has shaped its API. semantic-release (ADR 0006) starts at 1.0.0 when there are no tags, and on 0.x it turns a breaking change into 1.0.0. Either would promise a stable API before the maintainers are ready to.

## Decision

- The first release is **0.1.0**, published by a maintainer and tagged `v0.1.0`. semantic-release counts up from that tag.
- While on 0.x, `.releaserc.json` has a commit-analyzer release rule `{ "breaking": true, "release": "minor" }`: a breaking change bumps the minor version (0.3.0 → 0.4.0), a feature bumps the minor, a fix bumps the patch.
- **1.0.0 is a maintainer decision,** made by removing that rule in a commit marked `BREAKING CHANGE`, which semantic-release then releases as 1.0.0. Expect it after the formal checks pass and a second driver has used the API.
- Release notes mark breaking changes on 0.x clearly, since `^0.x` ranges don't protect users from them.

## Consequences

- **Pro:** Users can install and try it now, and the version says honestly that the API may change.
- **Pro:** No accidental 1.0 from a commit title.
- **Con:** On 0.x, `^0.4.0` accepts only 0.4.x, so users must bump by hand for each minor.
- **Con:** One more rule to remember to delete at 1.0.

Rejected: publishing 1.0.0 now; waiting to publish until 1.0; switching to release-please for its pre-major options.
