# Worklog

### 2026-02-23 - Initial Mercenary CLI/module implementation landed
- **Outcome:** `mercenary.js` now provides one-shot (`run`) and interactive (`openSession`) Claude process orchestration with Windows-safe process-tree termination and env sanitization.
- **Why:** Established one reusable subprocess primitive for local CLI usage and downstream AllMind consumers.
- **Links:** `e83cb6d`, `docs/project_notes/adrs.md` (ADR-003)

### 2026-02-24 - Role presets and streaming hooks added
- **Outcome:** Added role-based presets (`pipeline`, `coordinator`, `allmind`) and `run()` callbacks (`onStart`, `onData`) plus new interactive options (`cwd`, `allowedTools`, `model`).
- **Why:** Reduced duplicated caller flag assembly and enabled realtime orchestration/log streaming integrations.
- **Links:** `d7d7ccc`, `docs/project_notes/adrs.md` (ADR-003)

### 2026-02-24 - MCP isolation behavior split by mode
- **Outcome:** Pipeline runs keep strict MCP defaults; interactive sessions now default to non-strict mode with strict behavior available only by explicit opt-in.
- **Why:** Preserved deterministic headless automation while preventing interactive startup hangs.
- **Links:** `72d3fd8`, `ea91304`, `docs/project_notes/adrs.md` (ADR-004, ADR-005), `docs/project_notes/bugs.md` (interactive strict MCP hang)

### 2026-02-24 - Interactive launcher reliability diagnostics shipped
- **Outcome:** Interactive launcher added startup/prompt/exit diagnostics and switched prompt passing to variable-based file loading to avoid inline subexpression parsing failures.
- **Why:** Improved failure visibility and reduced false negatives where sessions appeared to launch but did not execute prompt payloads correctly.
- **Links:** `ea91304`, `docs/project_notes/bugs.md` (interactive strict MCP hang)
