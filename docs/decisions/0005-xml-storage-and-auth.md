# 0005: XML storage and deferred auth
Status: proposed
Date: 2026-10-07
Deciders: Joao Vitor

## Context
The XML is the legal document and the source every agent output must trace back to. Phase 1 is used by the founders only.

## Decision
- Raw XML is immutable and stored in private blob storage, keyed by its sha256. The database keeps metadata, the hash and the blob key. Vercel Blob is the first choice if it supports private access; otherwise S3 or R2.
- Documents are unique per `(client_id, chave)`, so capture is idempotent.
- Authentication is deferred: phase 1 runs as an internal tool behind Vercel deployment protection. The data model is multi-tenant from day one (`firm_id` on every tenant-owned table) so auth can be added without a migration of meaning.

## Consequences
- Auth gets its own decision record before the first firm outside the founders uses the product.
- No real client data in previews until auth exists.
