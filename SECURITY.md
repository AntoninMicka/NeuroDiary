# Security

## Goals

- Protect personal health data
- Secure synchronization
- Privacy by design

## Authentication

- Passkeys
- WebAuthn
- JWT

## Encryption

- Local encryption
- End-to-end encrypted synchronization

## GDPR

- Datový inventář, návrh retenčních pravidel a přehled práv jsou v [docs/gdpr.md](docs/gdpr.md).
- Produkční provoz vyžaduje doplnění identity správce, potvrzení právních titulů a DPIA.
- Export účtu, úplný výmaz a verzovaná evidence souhlasů zatím zůstávají implementačními úkoly.

## Threat Model

- Lost device
- Account compromise
- Network interception
- Backend attack
