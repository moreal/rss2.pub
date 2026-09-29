# ADR-0017: RSS author attribution candidates

- Status: accepted (2026-09-30)
- Context: `docs/TODO.md`, [ADR-0014](0014-atom-authors-as-multiple-attributions.md)

## Decision

Only explicit absolute HTTP(S) values in RSS item `<author>` or Dublin Core
`dc:creator` become attribution lookup candidates. A normal RSS `<author>`
email (including the `email (name)` form), a plain display name, and an
`acct:` identifier are not candidates. Email addresses must never be inferred
to be Fediverse handles. As with Atom, only a lookup result that is an
ActivityPub Actor with a canonical HTTP(S) ID enters `attributedTo`.

The feed actor remains first. The candidate ordering, limit of eight,
poll-local memoization, best-effort failure policy, and unchanged body and
audience from ADR-0014 also apply to RSS items.
