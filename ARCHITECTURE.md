# Architecture

## Overview

Frontend (PWA)
↓
Domain Layer
↓
SQLite (WASM)
↓
Sync Layer
↓
REST API
↓
Cloud

## Layers

- Frontend
- Domain Services
- SQLite
- Synchronization
- Backend API
- AI Services

## Principles

- Offline First
- End-to-End Encryption for synchronized diary content
- Modular
- Testable
- Extensible
- Separation of concerns

## Security Direction

- cloud backend nema byt schopen cist obsah deniku v otevrene podobe
- server ma drzet pouze sifrovany payload a synchronizacni metadata
- klice a desifrovani patri na klientska zarizeni uzivatele
