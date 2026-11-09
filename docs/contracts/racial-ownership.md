# Racial ability, defense and spell ownership

## Origin ability scores

2014 racial owners supply origin abilities and racial choices. 2024 backgrounds own origin
abilities and origin feat grants. Allocated base scores stay separate. Exact race/subrace
abilities use bounded choices with source-qualified owner and block ordinal. Current sources
validate new picks. Missing exact metadata preserves saved bonuses and disables new edits.
Refreshing rules reconciles valid selections and replaces only the affected ownership.

Complete versions own their entire mechanics and suppress parent mechanics. Switching to or
from a version rebuilds both owners together. An ordinary child change preserves unrelated
parent choices. Changing only ability distribution preserves nonability setup.

### Racial defenses

`racialDefenses` binds the exact selected context to fixed grants and actual field owners.
Inherited fields belong to the parent. Child replacements and explicit removals apply per
field, and a complete version owns its own fields. Missing either exact record preserves the
snapshot. Exact restoration reconciles it with current rules. Creation and edits save the
selection and snapshot together. Manual, feat and equipment effects retain separate ownership.

2014 PHB Dragonborn requires a current catalog-backed ancestry. The creator requires it to
finish. Builder readiness reports missing ancestry instead of inferring one.

### Native racial spells

Use one profile per granting parent or child, scoped to the complete selected context.
The save retains suite, ability, target choices and the applied snapshot. The current catalog
supplies schedule and eligibility. Complete versions suppress parent blocks. A missing exact
context keeps the snapshot. Restore at current level. Keep compatible exact targets and casting
ability through unambiguous correspondence. A changed alternative suite needs explicit
reselection. Ambiguity keeps setup recoverable.

Clear uses the saved descriptor's membership and never removes another owner or printing.
New targets require current exact metadata and eligibility. Race, level and spell edits
reconcile materialization and provenance atomically. Read-only views do not write inactive
library records. The active store handles durable corrections through its acknowledged queue.
Class/special preparation and shared/Pact usage stay independent.
[Native spell command tests](../../tests/unit/raceSpellProfileCommand.test.ts)
