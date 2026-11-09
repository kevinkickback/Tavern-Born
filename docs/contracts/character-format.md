# Character format and admission

The app admits only `CURRENT_CHARACTER_SCHEMA_VERSION` (15). The strict schema verifies saved
ownership before catalog data is available. It checks both directions between selections,
materialized rows and provenance. A structurally valid save does not prove current eligibility.
Earlier and newer formats are rejected without conversion. Incompatible originals stay in
durable exportable quarantine. The parsed catalog cache has its own version.
[Schema](../../src/types/characterSchema.ts) · [Persistence](../state-management.md#schema-compatibility)

- Starting equipment records the initial Class independently of class order, exact item arrays,
  physical grant lots, owned coins and spending debits. [Equipment](equipment-state.md)
- Managed spells save actual owner, domain, exact declaration, earned slot, target and monotonic
  revision. Ordinary, feature-cantrip and Arcanum intents are distinct. An unavailable choice
  may omit both its materialized row and reserved tag. If either is present, both must agree exactly.
  Learned preparation can remain saved while unavailable. [Spell selection](spell-selection.md)
- Class adoptions and specialized choices save the exact owner, target and gain. Missing adoption
  means unselected. Conflicting families, unknown roots and orphan rows reject. Recoverable
  intent stays separate from current benefit. [Class ownership](class-ownership.md)
- A revised Epic Boon uses an ordinary feat or ASI at the earned slot. Starting-class skill
  choices come from the ledger written at class selection.
- Feats distinguish ordinary, bonus, fixed and configured choice owners. Configured choices need
  exact printings. Duplicate or orphan setup rejects even when the catalog is missing.
  [Feat ownership](feat-ownership.md)
- Racial ability choices use exact selected owners and dense block ordinals. Revised origins
  have no racial ability grants. Racial defenses require an exact selected-context snapshot,
  including empty grants. Native spells save the selected setup and applied owner/suite/target
  snapshot. Full targets have two nonempty name/source fields. Foreign contexts, orphan tags,
  invalid counts and duplicate identities reject. [Racial ownership](racial-ownership.md)
- Reserved IDs, variant settings and numeric fields must match the current schema. Special
  profiles reject contradictory spell kinds. Racial context and choice fields belong only to
  racial profiles.

A breaking change updates the version, type/schema, empty character, fixtures, cutoff
documentation and import/recovery checks together. Retain export-before-removal recovery.
