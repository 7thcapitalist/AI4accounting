# 0002: Database
Status: proposed
Date: 2026-10-07
Deciders: Joao Vitor

## Context
Phase 1 (fiscal capture) needs a relational store for firms, clients, certificates, sync state and fiscal document metadata. ADR 0001 left the database open.

## Decision
Turso (libSQL, SQLite-compatible) with Drizzle ORM. Schema and migrations live in `packages/db`, generated with drizzle-kit. Tests run against a local libSQL file.

## Consequences
- SQLite dialect: no Postgres-only features (e.g. JSONB operators, rich enums). Enums are text columns checked in code.
- Money columns are integers (centavos).
- One migration PR open at a time; migrations need a human to merge.
