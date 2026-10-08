# 0004: Custody of client digital certificates
Status: proposed
Date: 2026-10-07
Deciders: Joao Vitor

## Context
Distribuicao DF-e and event submission require mutual TLS with the client's own A1 certificate (.pfx plus password). Losing one lets an attacker act as the company before government services. LGPD applies.

## Decision
Envelope encryption:
- For each certificate, request a data key from AWS KMS. Encrypt the .pfx and its password with AES-256-GCM using the data key. Store only the ciphertexts, the IVs and the KMS-wrapped data key.
- Only the capture worker may unwrap the key. It decrypts in memory for the duration of one job (`withCertificate`) and never writes plaintext to disk, the database or logs.
- Every decrypt writes a row to `audit_log`.
- On upload we read holder CNPJ, validity and fingerprint, and reject expired certificates.

## Consequences
- An AWS account with a KMS key is required; a human creates it and sets credentials as Vercel environment variables.
- The KMS client sits behind an interface so tests use a fake.
- Code in `packages/vault` needs a human to merge.
