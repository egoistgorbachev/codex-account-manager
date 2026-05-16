# Product Core 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** превратить релиз 1.8.0 в более цельный операционный центр Codex с командной палитрой, безопасным умным выбором, видимой историей действий и более читаемым интерфейсом.

**Architecture:** новая логика остается local-first и использует существующие сервисы аккаунтов, настроек, диагностики и истории переключений. Командная палитра живет в renderer-слое и вызывает уже существующие IPC-методы, а умный выбор усиливается в shared-слое, чтобы backend и UI принимали одинаковые решения.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, better-sqlite3, lucide-react.

---

### Task 1: Smart Core Logic

**Files:**
- Modify: `src/shared/smartSelection.ts`
- Test: `tests/shared/smartSelection.test.ts`

- [ ] Add tests that archived, stale and broken accounts are excluded from smart recommendations.
- [ ] Add explicit stale handling with a default 15 minute freshness window.
- [ ] Keep workspace-bound accounts preferred only when they are still usable and fresh.
- [ ] Run `npm.cmd run test:run -- tests/shared/smartSelection.test.ts`.

### Task 2: Command Palette Model

**Files:**
- Create: `src/shared/commandPalette.ts`
- Test: `tests/shared/commandPalette.test.ts`

- [ ] Add a pure command model that groups account, navigation, diagnostics and transfer actions.
- [ ] Filter commands by Russian labels, hints and keywords.
- [ ] Keep the model free of Electron/React dependencies.
- [ ] Run `npm.cmd run test:run -- tests/shared/commandPalette.test.ts`.

### Task 3: Renderer Product Core

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] Add Ctrl+K command palette with account switching, refresh, import/export, diagnostics and navigation commands.
- [ ] Add dashboard operation timeline from switch history.
- [ ] Add clearer smart mode status and quick actions.
- [ ] Increase contrast and reduce decorative weight without changing the 16:9 no-scroll shell.

### Task 4: Release Pipeline Repair

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] Add scripts for Node native rebuild and clear post-build testing order.
- [ ] Document that `electron-builder` rebuilds native modules for Electron and tests may need Node rebuild afterward.

### Task 5: Verification

**Commands:**
- `npm.cmd rebuild better-sqlite3`
- `npm.cmd run typecheck`
- `npm.cmd run test:run`
- `npm.cmd run build:dir`
- browser preview at `http://127.0.0.1:52272/`

- [ ] Verify tests, typecheck and unpacked build.
- [ ] Verify the preview at 1366x768 has no page scroll and command palette opens.
