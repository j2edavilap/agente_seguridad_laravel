# Authorization interview — paso 0 del orquestador

Objective: the auditor's first action is a single structured interview that collects every field needed to produce the authorization document, then writes it as a draft the human signs and renames.
Branch: n/a (documentation repo, not under git).
Delivery strategy: single-pr.
Test runner: `powershell -ExecutionPolicy Bypass -File .\tools\tests\verify-variants.ps1` (structural regression, no unit-test framework).

## Specs

- **S1 — Interview first.** Before any other action (no file exploration, no project command, no subagent), if `scope/authorization.md` is missing or incomplete the orchestrator asks the human for the authorization data in ONE numbered message.
- **S2 — Draft, never the real file.** The agent writes `scope/authorization.draft.md`. It must never create, edit or overwrite `scope/authorization.md`. Activation of the audit requires a human rename plus signature. (User decision, 2026-11-03.)
- **S3 — Self-contained.** The interview questions and the full Markdown skeleton live inside `agents/laravel-sec-auditor.md`. The agent must not read `templates/` at runtime.
- **S4 — No fabrication.** Missing answers are recorded as `PENDIENTE`, never invented. Production is always `Nunca`. Signature fields are always left empty. Checkboxes are marked only on explicit human authorization. Secrets are never requested in clear.
- **S5 — Write barrier in all three runtimes.** The allowed write surface becomes `reports/**` + `scope/authorization.draft.md`. The real `scope/authorization.md` is explicitly denied or read-only in OpenCode, Claude Code and Codex.
- **S6 — Activation gate.** No phase runs unless `scope/authorization.md` exists, does not say `Estado: BORRADOR`, the 5 validated fields are complete and the signature block is filled.
- **S7 — Idempotence.** An existing signed authorization is used as-is and never touched. An existing draft is only rewritten after the human confirms.
- **S8 — Propagated and tested.** Docs, template and the structural regression are updated; the three runtimes are regenerated and reinstalled.

## Tasks

- T1 (S1, S3, S4) — write the interview section and the embedded skeleton in `agents/laravel-sec-auditor.md`; update REGLA CERO, preflight and flow. Route: inline. Status: done.
- T2 (S5) — update the write barrier: OpenCode frontmatter, `claude/settings.template.json`, `codex/project-kit/.codex/config.toml`. Route: inline. Status: done.
- T3 (S2, S8) — align `templates/scope-authorization.md` with the generated draft (header, `Estado`, signature gate). Route: inline. Status: done.
- T4 (S8) — update `reference/01-reglas-y-flujo.md`, `README.md`, `AGENTS.md`, `CHANGELOG.md`. Route: inline. Status: done.
- T5 (S8) — update `tools/tests/verify-variants.ps1` for the new paths and counts; regenerate and reinstall. Route: inline. Status: done.
- T6 (S5, S6) — independent verification of the widened write surface. Route: delegated + recheck inline. Status: done.

## Log

L1 — (user) "quiero que el agente tenga un paso inicial en el cual pida los permisos he informacion necesaria para generar el archivo con toda la informacion necesaria"

L2 — (user, decision) Chose "Borrador + rename manual": the agent writes `scope/authorization.draft.md`; the human reviews, signs and saves it as `scope/authorization.md`. Rationale given: writing the same file the agent later validates would let it authorize itself.

L3 — Constraint from `AGENTS.md`: agents are self-contained, so the interview and skeleton are embedded in the prompt and propagated by `tools/build-variants.ps1`; `templates/` is not read at runtime.

L4 — Blocker B1 (encontrado en la verificación independiente): `permission.bash` de OpenCode permite todo salvo una denegación, así que el agente podía escribir `scope/authorization.md` por comandos. Corregido: regla `"*authorization.md*": deny` al final del bloque bash (gana por "último match gana"), no afecta al borrador (`authorization.draft.md` no contiene esa subcadena), y documentado el límite honesto de OpenCode (no es un sandbox; la garantía funcional es la puerta de firma) en `README.md`, `AGENTS.md` y `reference/01-reglas-y-flujo.md`.

L5 — Blocker B2: el esqueleto incrustado pre-llenaba valores no consensuados (`Sí` en staging, `≥ 80/85/75` en umbrales, zona horaria por defecto). Corregido: todo queda en `PENDIENTE` salvo límites fijos; los cuatro `[x]` de la sección 7 y el `Nunca` de producción se justifican explícitamente como límites fijos del agente, no autorizaciones del humano.

L6 — Evidencia final: `tools/tests/verify-variants.ps1` → `TODO CORRECTO` (0 fallos; incluye los 34 deny de bash con `*authorization.md*`, el borrador permitido, la autorización firmada denegada, el Paso 0 y el esqueleto sin pre-llenar). `deploy.ps1` → `OK: OpenCode, Claude Code y Codex validados.` Dist y los tres runtimes regenerados e instalados.

L7 — Integration of new attack vectors into Paso 0 and subagents: reverse brute force, credential stuffing distributed, API endpoint attacks, and OTP/PIN brute force added to `agents/sec-dynamic.md` (auth and API sections), `agents/sec-static.md` (fallback grep checks for missing rate limiting, CAPTCHA, API auth), and `reference/06-mejores-practicas-laravel13.md` (section 3 with defenses per attack type). The Paso 0 interview already collects the fields needed to evaluate these attacks (staging URL, whitelist, roles, thresholds).
