# Operating Brief

## One-liner
- `mercenary` is an early-stage scaffold repository with guardrails and placeholder CI, waiting for its first concrete application implementation.

## Goals
- Keep repository conventions explicit and consistent across contributors and AI tooling.
- Establish canonical project memory in `docs/project_notes/` to reduce context drift.
- Prepare the repo for first implementation milestones with clear run/test/lint expectations.

## Non-goals
- Defining product architecture before code and runtime choices exist.
- Treating placeholder CI output as proof of application health.

## Current state
- Working: repository guardrails are documented in `AGENTS.md`; baseline instructions exist in `CLAUDE.md`.
- Working: CI workflow exists at `.github/workflows/ci.yml` and runs a placeholder sanity step.
- Fragile: README is minimal, and no executable app entrypoint is committed yet.
- Missing: runtime manifest and concrete install/dev/test/lint commands.

## Repo map
- `AGENTS.md`: primary maintainer and workflow guardrails.
- `CLAUDE.md`: mirrored assistant instructions for cross-tool compatibility.
- `.github/workflows/ci.yml`: current placeholder CI workflow.
- `.env.example`: declared environment variable names and default host/port values.
- `docs/project_notes/`: canonical institutional memory for this project.
- `docs/memory/`: legacy memory location from an older format.
- `scripts/` and `tools/`: reserved locations for automation (currently empty).
- `logs/`: log output directory (ignored by git except `.keep`).

## System map
- Components:
  - Policy/config layer: `AGENTS.md`, `CLAUDE.md`, `.editorconfig`, `.gitattributes`, `.gitignore`
  - Documentation/memory layer: `docs/project_notes/*`
  - CI layer: `.github/workflows/ci.yml`
- Data flow:
  1) A contributor pushes a branch or opens a pull request.
  2) GitHub Actions runs the `sanity` job, which currently only echoes a placeholder message.

## Active constraints
- ADR-001: Canonical project memory lives in `docs/project_notes/`.
- ADR-002: Script execution and line-ending guardrails are enforced for cross-platform reliability.

## Known hazards
- CI can report green while still providing zero coverage of build, test, or runtime behavior.
- `docs/memory/` and `docs/project_notes/` can diverge if both are treated as canonical.
- `.env.example` defines expected ports, but no committed service binds them yet.

## Next steps
1) Introduce a concrete runtime (manifest + entrypoint) and define install/dev/test/lint commands.
2) Replace placeholder CI steps with real validation that fails on regressions.
3) Consolidate legacy memory (`docs/memory/*`) into `docs/project_notes/*` or clearly retire legacy files.

## How to get oriented fast
- Start here: `README.md`, then this file.
- Runbook: `docs/project_notes/key_facts.md`
- ADR constraints: `docs/project_notes/adrs.md`
- Work checkpoints: `docs/project_notes/worklog.md`
- Bug playbook: `docs/project_notes/bugs.md`
