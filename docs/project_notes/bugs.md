# Bug Playbook

### 2026-02-24 - Child process shell drift to `bash.exe` on Windows hosts
- **Symptom:** Automated one-shot runs used Bash tool behavior tied to Git Bash instead of PowerShell on some hosts, causing command behavior drift and failures.
- **Root cause:** Child processes inherited `SHELL=bash.exe` from parent environments (for example PM2 launched from Git Bash).
- **Fix:** Forced `SHELL` in child env to `pwsh` via `sanitizeEnv()` and mirrored the same override in interactive launcher scripts.
- **Prevention:** Keep explicit `SHELL` assignment in both one-shot and interactive launch paths and treat inherited shell env as untrusted.
- **References:** `e91fa35`, `ea91304`

### 2026-02-24 - Interactive hangs with default strict MCP mode
- **Symptom:** Interactive sessions could open a terminal but appear stuck with no usable Claude prompt when strict MCP defaults were applied.
- **Root cause:** Applying strict MCP suppression as a default in interactive `openSession()` introduced startup hangs in supervised/visible-session usage.
- **Fix:** Changed interactive default to `strictMcp: false`, leaving strict MCP as an explicit opt-in; added launcher diagnostics and variable-based prompt loading for better runtime visibility.
- **Prevention:** Keep strict MCP as a pipeline default only; if enabling it in interactive mode, require an explicit call-site decision and smoke-test on target host.
- **References:** `72d3fd8`, `ea91304`, `docs/project_notes/adrs.md` (ADR-005)

### 2026-02-24 - Interactive `EINVAL` failures from shared temp paths
- **Symptom:** Concurrent interactive sessions could fail with `EINVAL` while Claude wrote temporary task/output artifacts.
- **Root cause:** Child sessions shared the same temp target, leading to path/handle collisions across simultaneous runs.
- **Fix:** `openSession()` now reuses its unique `mkdtemp` directory as child `TEMP` and `TMP`.
- **Prevention:** Keep per-session temp isolation in launcher env setup and avoid overriding interactive child temp vars to shared directories.
- **References:** `794fdfa`
