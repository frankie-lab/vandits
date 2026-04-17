# ADR 002 — `preferencesBus` is a bridge, not the destination

## Status
Accepted — 2026-04-17

## Context
The shared preferences system (`src/shared/preferences/`) needs all open
instances of `usePreferences()` to react in real time when any panel
updates a preference. Today this is implemented with a thin wrapper
around `window.dispatchEvent` / `addEventListener` on a custom event
named `vandits:pref-changed` (see `preferencesBus.ts`).

This works, but it is not the long-term shape we want:

- It couples preference reactivity to the DOM `window` object.
- It cannot be consumed from non-DOM contexts (workers, SSR-style
  rendering, isolated tests).
- Optimistic updates and persistence are entangled inside
  `usePreferences.ts` instead of living in a single source of truth.

## Decision
We treat `preferencesBus` explicitly as a **temporary bridge**. It keeps
the public API (`emitPrefChanged`, `onPrefChanged`, `PrefListener`)
stable so that consumers do not need to change when we migrate the
implementation.

The intended destination is one of:

1. A dedicated reactive store (Zustand slice) keyed by
   `unitId + scope`, with `useSyncExternalStore` selectors.
2. Or a tiny custom `Set<Listener>` emitter living in module scope,
   without the `window` round-trip.

Either path keeps the `emit` / `on` surface identical.

## Consequences
- New code MUST import from `@/shared/preferences` (the bus is an
  implementation detail) — never call `window.dispatchEvent` directly
  for preference changes.
- The migration can happen in a single self-contained PR because the
  surface is small (3 exports) and unit-tested
  (`src/test/preferences-bus.test.ts`).
- Level-B admin config channels (e.g. `useMarkerSizeConfig`) are NOT
  part of this bus and follow their own contract; see ADR 001.
