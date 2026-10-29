# Documentation Index

Every document has one owner topic. If two documents disagree, the more specific one wins
(feature spec > cross-cutting doc), and the disagreement is a bug to fix.

## Product

| Document | Purpose |
|---|---|
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Personas, business scope, functional and non-functional requirements, business rules |
| [UI_FLOWS.md](UI_FLOWS.md) | Mobile navigation map, screen inventory, key user journeys |
| [features/](features/) | One specification per substantial feature (screens, ViewModels, use cases, repositories, RPCs, tests, acceptance criteria) |

## Architecture

| Document | Purpose |
|---|---|
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Monorepo layout, apps, backend, deployment topology |
| [MVVM_ARCHITECTURE.md](MVVM_ARCHITECTURE.md) | Mobile presentation layer: screens, ViewModels, state, dependency flow |
| [CLEAN_ARCHITECTURE.md](CLEAN_ARCHITECTURE.md) | Layer rules, import boundaries, enforcement |
| [REPOSITORY_PATTERN.md](REPOSITORY_PATTERN.md) | Repository and data-source conventions, mappers, error translation |
| [DATA_FLOW_DIAGRAMS.md](DATA_FLOW_DIAGRAMS.md) | Mermaid diagrams for the main flows |
| [API_AND_RPC_CONTRACTS.md](API_AND_RPC_CONTRACTS.md) | Catalogue of every RPC, Edge Function, table access and error code |
| [DECISIONS.md](DECISIONS.md) | Architecture decision log and open decisions |

## Data

| Document | Purpose |
|---|---|
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | Schemas, money/quantity/tax rules, invoice numbering, transactions, ledgers |
| [DATABASE_ERD.md](DATABASE_ERD.md) | Entity relationship diagrams |
| [DATABASE_DATA_DICTIONARY.md](DATABASE_DATA_DICTIONARY.md) | Column-level definitions |

## Security and configuration

| Document | Purpose |
|---|---|
| [SECURITY_MODEL.md](SECURITY_MODEL.md) | Threat model, tenant isolation, RLS, privileged functions, secrets, storage |
| [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) | Permissions per shop role and per platform role |
| [FEATURE_CONFIGURATION.md](FEATURE_CONFIGURATION.md) | Settings, entitlements, feature flags, dynamic content, config versioning |
| [ADMIN_PANEL_SPECIFICATION.md](ADMIN_PANEL_SPECIFICATION.md) | Admin modules, roles, actions, audit |

## Delivery

| Document | Purpose |
|---|---|
| [OFFLINE_SYNC_DESIGN.md](OFFLINE_SYNC_DESIGN.md) | Local persistence, outbox, sync protocol, conflicts |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Test pyramid, tools, security tests, CI gates |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Environments, credentials, release process, backups |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Step by step: accounts and settings to create, what to send, from demo phone to Play Store |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Automated and manual regression, builds, go / no-go |
| [PILOT_PLAYBOOK.md](PILOT_PLAYBOOK.md) | Choosing and onboarding the 10 pilot shops, what to measure |
| [SUPPORT_RUNBOOK.md](SUPPORT_RUNBOOK.md) | Daily support routine, common problems, incidents |
| [legal/](legal/) | Privacy policy and terms drafts for legal review |
| [BACKLOG.md](BACKLOG.md) | Every requirement as a backlog item mapped to a phase |
| [phases/](phases/) | One document per phase with scope and acceptance criteria |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | What is actually done, verified, and pending |
| [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) | Deliberate gaps and constraints |
