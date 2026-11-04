# Multi-runtime port — OpenCode / Claude Code / Codex CLI

Objective: deliver the same Laravel 13 security auditor to three runtimes from one source of truth (`agents/*.md`).
Branch: n/a (this repo is documentation only, not a git repository).
Delivery strategy: single-pr (all variants generated at once, installed by `deploy.ps1`).
Test runner: none (no code under test); verification is structural — YAML/TOML parse, frontmatter fields, generated diff parity.

## Specs

- **S1 — Single source of truth.** `agents/*.md` (5 files: `laravel-sec-auditor`, `sec-static`, `sec-config`, `sec-dynamic`, `sec-quality`) remain the only hand-edited prompts. Every runtime variant is generated from them; no variant may hold prompt text that does not exist in the source.
- **S2 — OpenCode unchanged.** `agents/*.md` keep their current frontmatter (`mode`, `temperature`, `permission` with 33 bash deny rules plus one `edit` deny rule — 34 `deny` lines total) and are installed to `~/.config/opencode/agent/` byte-for-byte as today.
- **S3 — Claude Code variants.** Generate `dist/claude/agents/<name>.md` with frontmatter `name`, `description`, `tools` (comma-separated allowlist) and the adapted body. Body substitutions: `` `task` `` → `` `Agent` `` and `` `webfetch` `` → `` `WebFetch` ``. Orchestrator tool list uses `Agent(sec-static, sec-config, sec-dynamic, sec-quality)`.
- **S4 — Claude Code write barrier.** Ship `claude/settings.template.json` for the audited project's `.claude/settings.json`. Deny rules use `Edit(...)` path specifiers (never `Write(...)`, which Claude Code accepts but never matches), plus `Bash(...)` and `PowerShell(...)` deny rules. `Edit(./reports/**)` and `Edit(./scope/authorization.template.md)` are allowed.
- **S5 — Codex subagents.** Generate `dist/codex/agents/<name>.toml` for the four subagents with required fields `name`, `description`, `developer_instructions` (TOML literal multiline string, so Windows backslashes stay literal). The orchestrator is NOT a TOML subagent.
- **S6 — Codex protocol file.** Generate `dist/codex/project-kit/AGENTS.md` from the orchestrator body, adapted for Codex (subagents referenced by name from `~/.codex/agents/`). It is copied into the audited project root, never into `~/.codex/AGENTS.md`, so it cannot hijack unrelated Codex sessions.
- **S7 — Codex read-only barrier.** Ship `codex/project-kit/.codex/config.toml` defining a `laravel-audit` permission profile that extends `:read-only`, keeps the workspace root readable, and grants write only to `reports` and `scope/authorization.template.md`. Also ship `.codex/rules/laravel-audit.rules` with `forbidden` prefix rules. Document that the sandbox profile is the real barrier and the rules file is a second layer restricted to matching argv prefixes.
- **S8 — Deployer.** `deploy.ps1` regenerates variants, installs OpenCode, Claude and Codex agents, creates missing target directories, backs up replaced files as `<name>.bak_<yyyyMMdd_HHmmss>`, and validates each artifact. It must exit non-zero when any validation fails.
- **S9 — Honest verification.** Codex CLI is not installed; no runtime execution of Codex or Claude variants is claimed. Only structural validation is claimed. The docs state this explicitly.
- **S10 — Encoding.** All read/write of prompts uses UTF-8 without BOM. Windows PowerShell 5.1 default ANSI reads must not be used for these files.

Assumptions:
- A1: Claude Code tool canonical names are `Read`, `Grep`, `Glob`, `Bash`, `PowerShell`, `Edit`, `Write`, `TodoWrite`, `WebFetch`, `Agent` (from the official sub-agents reference).
- A2: Codex `[permissions.<name>]` profiles are beta; the kit is documented as such.

## Tasks

- T1 (S1, S8) — `tools/build-variants.ps1` generator. Route: inline. Status: done.
- T2 (S3) — Claude agent generation + `claude/settings.template.json`. Route: inline. Status: done.
- T3 (S5, S6, S7) — Codex TOML generation + project kit (AGENTS.md, config.toml, rules). Route: inline. Status: done.
- T4 (S8) — extend `deploy.ps1` for three runtimes. Route: inline. Status: done.
- T5 (S9) — update `README.md`, `AGENTS.md`, `CHANGELOG.md` with runtime matrix and limitations. Route: inline. Status: done.
- T6 (S2, S8) — run generator + deployer, validate all artifacts. Route: inline. Status: done.
- T7 (S10) — independent verification found mojibake in the Codex artifacts caused by the generator's own missing BOM. Fixed scripts to UTF-8 with BOM, added a self-guard, fixed the ANSI `Get-Content` read in `deploy.ps1`, deepened the deployer's kit validation, and added `tools/tests/verify-variants.ps1` as the regression. Route: inline. Status: done.

## Log

L1 — (user) "What did we do so far?" followed by "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."

L2 — (previous session, resumed) Next move was: confirm Claude Code permission path syntax and Codex CLI customization surface, then create runtime variants and extend `deploy.ps1`.

L3 — Evidence gathered from official docs:
- Claude Code `permissions.md`: `Write(path)`, `NotebookEdit(path)` and `Glob(path)` rules are accepted but never match; `Edit(path)` covers all file-editing tools. Path patterns use gitignore syntax; `//` = filesystem root, `~/` = home, `/` = settings source, `./` = cwd. A `/path` rule in `~/.claude/settings.json` anchors at `~/.claude/path`, NOT the project — so project-scoped path denies must live in the audited project's `.claude/settings.json`.
- Claude Code `sub-agents.md`: `name` and `description` are required; `tools` is a comma-separated allowlist; `disallowedTools` with a specifier removes the whole tool (so Bash allow/deny must go to `permissions.deny`, not `disallowedTools`); `Agent(agent_type)` allowlist works only for a main-thread agent launched with `--agent`; files without `name` are treated as documentation.
- Codex `agents-md.md`: global `~/.codex/AGENTS.md`, project chain from repo root, 32 KiB default cap.
- Codex `subagents.md`: custom agents are standalone TOML under `~/.codex/agents/` or `.codex/agents/`, requiring `name`, `description`, `developer_instructions`; they inherit parent sandbox and cannot create their own read-only sandbox.
- Codex `permissions.md`: `default_permissions` + `[permissions.<name>]` with `extends = ":read-only"` and `:workspace_roots` subpath rules (`"." = "read"`, `"reports" = "write"`).
- Codex `rules.md`: `.rules` Starlark `prefix_rule(pattern=..., decision="forbidden")`, loaded from `rules/` next to a config layer.

L4 — Decision: generate, never duplicate. All runtime variants derive from `agents/*.md`; the generator applies a two-entry substitution table per runtime. This removes the drift risk the repo's `AGENTS.md` warns about.

L5 — Decision: Codex protocol goes to the audited project root, not `~/.codex/AGENTS.md`, because that global file is concatenated into every Codex session on the machine.

L6 — Decision: Claude Code keeps `permissionMode: default` (Manual). `acceptEdits` auto-accepts `mv`/`cp` inside the working directory, which would break the no-modification guarantee.

L7 — Fixed in the source during the port: `laravel-sec-auditor.md` line 99 said "delegas con la herramienta `task`", which only exists in OpenCode; each generated variant gets the correct delegation wording.

L8 — Independent verification (10 probes, temp dir `verify-996acbf3`): S1–S9 met, **S10 unmet (blocker)**. Cause: `tools/build-variants.ps1` was UTF-8 **without** BOM, so Windows PowerShell 5.1 decoded the script itself as ANSI and corrupted every non-ASCII literal before writing it. Symptoms: the kit `AGENTS.md` had `auditoría`, `raíz`, `están` and the em dash decoded as the classic two-byte `Ã` plus continuation-byte sequence, and every `dist/codex/agents/*.toml` line 1 had the em dash in the same state. Bodies copied from `agents/*.md` (read with `[System.IO.File]`) were correct, which is why only script-owned literals were affected. Advisories: README claimed 34 bash deny rules (actual 33 + 1 edit = 34 total); `deploy.ps1` validated only the existence of the kit files; partial `OutDir` remained after a generation failure.

L9 — Fixes (T7):
- `tools/build-variants.ps1`, `deploy.ps1` and `tools/tests/verify-variants.ps1` re-saved as UTF-8 **with** BOM.
- Added a self-guard at the top of the generator: if the script contains non-ASCII bytes and no BOM, it throws before writing anything instead of silently producing mojibake.
- `deploy.ps1`: `Get-Content` → `[System.IO.File]::ReadAllText(..., UTF8)`; validation now checks `default_permissions`, `extends = ":read-only"`, write access on `reports`, absence of `sandbox_mode` mixing, the four `prefix_rule` blocks, mojibake in the kit `AGENTS.md`, and that `claude/settings.template.json` parses with no dead `Write(`/`Glob(`/`NotebookEdit(` rule.
- `tools/tests/verify-variants.ps1` added: generates into a temp dir, validates encoding (no BOM, no U+FFFD, no mojibake), Claude frontmatter and tool substitution, TOML delimiters, Codex profile and rules, deployer contract, and byte parity with `dist/`. Cleans its temp dir unless `-KeepOutput`.

L10 — Evidence after the fix: `tools/tests/verify-variants.ps1` → `TODO CORRECTO`, 0 failures (12 artifacts, all encoding checks pass, 98 deny / 2 allow rules, 4 prefix_rule blocks, parity with `dist/`). `deploy.ps1` → `OK: OpenCode, Claude Code y Codex validados.` Files verified byte-level: `dist/codex/project-kit/AGENTS.md` line 3 is `# Protocolo de auditoría de seguridad — Laravel 13 / PHP 8.5` with no mojibake. The remaining garbling of accented words in the console output is `[Console]::OutputEncoding = ibm850` on this machine, not file corruption.
