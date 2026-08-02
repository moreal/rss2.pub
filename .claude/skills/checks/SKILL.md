---
name: checks
description: Run the full quality gate (typecheck, unit tests, e2e tests) and fix what fails. Use before finishing any task, before commits, or when asked to verify the project is healthy.
---

# Quality gate

Run the gate in this order, stopping at the first failure:

1. `yarn typecheck`
2. `yarn test:unit`
3. `yarn test:e2e`

On failure:

- Read the full error output before touching code; identify the root cause,
  not the first suppressible symptom.
- Never "fix" a type error with `any`, `as`, or `!` — adjust the types or the
  design (see AGENTS.md type discipline).
- Never delete or skip a failing test to make the gate pass. If a test is
  genuinely obsolete, say so explicitly and get confirmation.
- After each fix, rerun from step 1 (a test fix can break typecheck and vice
  versa).

Finish by reporting: which steps ran, what failed, what was changed to fix it,
and the final green run's summary line for each step.
