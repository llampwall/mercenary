#!/usr/bin/env node
// mercenary/hooks/precompact-qwen-barebones.mjs
//
// A PreCompact hook for LOCAL-MODEL (qwen) sessions only. It is wired from
// data/claude-local-model-settings.json, which is passed as --settings to exactly those spawns, so
// it never touches an operator's interactive Claude session.
//
// WHAT IT DOES: whatever a PreCompact hook prints on stdout becomes the compaction's custom
// instructions (Claude Code joins every succeeding hook's stdout and hands it to the summarizer as
// "Additional Instructions"). This prints a barebones brief.
//
// WHY: measured on the rig 2026-08-19, one auto-compaction of an 84.5K-token qwen build cost ~135s
// of prefill (92,806 tokens re-processed at 685 tok/s, zero cache reuse) plus 5,548+ generated
// tokens at ~30 tok/s. The generated half is the half a prompt can shrink. The built-in template
// asks for an eight-section retrospective and opens a <think> block first; on a 27B at 30 tok/s
// that deliberation is pure latency, and most of what it carefully preserves is already on disk in
// the worktree and in the session's own checklist file.
//
// WHAT IT CANNOT DO: custom instructions are APPENDED to the built-in summary template, not
// substituted for it. The <analysis>/<summary> scaffold and the section headings still arrive. This
// makes each section terse; it cannot delete them.

const instructions = [
  'COMPACTION MODE: BAREBONES. You are compacting a machine-dispatched build session, not a human conversation. Optimize for the smallest summary that lets the build continue.',
  '',
  'Write the summary DIRECTLY. Do not deliberate about how to write it, do not weigh what to include, do not re-read the conversation twice. Keep any thinking to a single sentence.',
  '',
  'Keep only:',
  '- The task sentence, the file allowlist, the done-condition and the gate command from the original brief, verbatim.',
  '- The checklist file path and which steps are done, if the session is keeping one.',
  '- Any reviewer correction the session was told was mandatory, verbatim.',
  '- The last error or failing test, with the exact command that produced it.',
  '- Files actually modified so far, as a bare list of paths.',
  '- Any security or safety instruction stated in the brief, verbatim.',
  '',
  'Omit entirely: code blocks, file contents, diffs, command transcripts, tool output, narration of what was tried, reasoning about approach, anything already written to a file on disk, and anything the next turn can re-read from the repo in one tool call.',
  '',
  'Every section must be at most three lines. If a section has nothing that survives these rules, write "none" and move on. A section is not worth a paragraph.',
].join('\n');

process.stdout.write(instructions);
