---
name: add-feature
description: Domain-first workflow for adding any feature or behavior change. Use whenever implementing new functionality (new use case, new domain rule, new endpoint, new adapter) so work proceeds domain → application → infrastructure → wiring, with tests at each step.
---

# Domain-first feature workflow

Work strictly in this order. Never start from the adapter or the route.

## 0. Orient

Read `docs/PLAN.md` (architecture, decisions) and any ADR touching the area
(`docs/adr/`). Check whether the concept already exists in `src/domain` before
inventing a new one.

## 1. Domain (`src/domain`)

- Model new concepts as value objects with smart constructors returning
  `Result<T, E>`; identifiers get branded types. Make invalid states
  unrepresentable rather than checked.
- Express new failure modes as discriminated-union error types.
- If the feature needs a capability the domain can't provide (storage, network,
  time, federation), define or extend a **port** in `src/domain/ports/`.
- Write unit tests for every rule introduced, in the same change.
- Constraint check: domain files import only `src/shared` and other domain
  modules — nothing else.

## 2. Application (`src/application`)

- Add or extend a use case that orchestrates domain objects through ports.
- Unit-test it against in-memory port implementations (create them under
  `src/infrastructure/persistence` if missing — they double as test doubles
  and reference implementations).

## 3. Infrastructure (`src/infrastructure`)

- Implement or extend the real adapter for any new/changed port
  (Drizzle repository, rss-parser fetcher, BotKit gateway...).
- Keep external-library types confined to the adapter; translate to domain
  types at the boundary.

## 4. Wiring (`src/web`)

- Wire the new pieces in the composition root; add routes/UI if user-facing.

## 5. Verify

- Add an e2e test when the feature is externally observable (HTTP endpoint,
  federation behavior, UI page).
- Run the `/checks` skill until green.

If at any point the layering feels forced (e.g. a "domain" concept that only
reformats adapter data), stop and reconsider the altitude — don't ship
ceremony. Note deliberate deviations in the final report.
