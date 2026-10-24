# Phase 00 — Inspection, Requirements, Architecture, Design

Status: **Complete — awaiting approval** · Date: 2026-10-24

## Inspection findings
- `D:\Dukaan Saathi` was empty, so this is a greenfield project.
- The git root is `D:\` (remote `Solstra-Info-IT-Solutions/aayesha-fashion-admin`) and contains unrelated projects. → ADR-001: create a dedicated repo in Phase 01 before the first commit.
- Toolchain on this machine: Node 24.15, npm 11.12, git 2.54, Java 23. **Not installed:** pnpm, Supabase CLI, Docker.

## Deliverables
All documents listed in [../INDEX.md](../INDEX.md): product requirements, UI flows, system/MVVM/clean/repository architecture,
data-flow diagrams, API/RPC catalogue with error contract, database design + ERD + data dictionary, security model,
authorization matrix, feature configuration, admin spec, offline design, testing strategy, deployment guide,
11 feature specs + template, 16 phase documents, backlog, decisions, status, limitations.

## Key decisions
ADR-001…ADR-017 in [../DECISIONS.md](../DECISIONS.md). Most consequential: integer paise/milli-units, single `create_sale`
RPC, per-device invoice series, server recomputes totals, ledgers with projections, offline sales never rejected for
business reasons, server-side entitlements and flags, admin via operator JWT + MFA.

## Open decisions
OD-01…OD-16 with recommended defaults (DECISIONS.md). OD-01 (git repo), OD-13 (Docker) block Phase 01; OD-02 (SMS) blocks real-phone login in production; OD-05 (subscription payments) blocks Phase 12 payment automation.

## Verification
Documentation only. No code, builds or tests exist, so none were run. Mermaid diagrams have not been rendered/validated by a tool.
