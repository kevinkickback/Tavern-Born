# Class and subclass feature ingestion

The shared UID codec follows the pinned [5etools class reference format](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js).
A class feature needs its name, class name and printing, positive gain level and feature printing.
Subclass features also require the subclass short name and printing in their own UID field order.
Blank class and subclass sources default to PHB. A blank feature source uses the decoded class
source for a class feature and the decoded subclass source for a subclass feature.
Compare normalized fields without rewriting raw UIDs. Explicit conflicts and incomplete or
ambiguous targets remain unresolved.

A complete encoded level overrides attached metadata. A malformed nonempty UID cannot borrow a
level. A row without a UID can use a valid explicit or attached level. Subclass gain defaults to
level 3 only when no class reference is marked as the subclass gain.

## Composition and subclass presentation

Layering re-resolves complete targets and rebuilds owning rules before required-reference
validation. A repeated label or selected parent cannot fill a missing target owner. Keep actual
selected owner, declaring feature and target identities separate. Intro presentation follows the
declared intro references. Raw unavailable details may remain readable without granting rules.
Legacy stored name/source descriptions can enrich only on one unique owner/level match.

Builder follows the selected class and subclass's direct references, including exact targets
printed under another class. This keeps inherited descriptions and the Epic Boon choice tied
to the selected owner. Supported resource counters also require a matching declared feature
and the selected class's own table. Their saved counters are separate across printings.
An inherited Epic Boon claim retains its exact declaration so it can suspend or be cleared
when the class source is withdrawn.

## Internal subclass-feature copies

Resolve copies before reference expansion, with the shared data-only copy engine. Match all seven
fields and retain the copied row's owner and level. Nested references keep their original targets.
The indexed `_meta.dependencies.subclassFeature` scope supplies copy parents only. Dependency rows
do not become the requesting document's own rules. Missing, ambiguous, cyclic, unsafe or
unsupported copies fail the required class resource. [Copy tests](../../tests/lib/5etools/subclassFeatureCopies.test.ts)

## Source-backed feature options

A structured option saves its canonical feature, table/row or source-group address, actual
selected owner and earned slot. Current exact rules determine its pool and derived benefit.
Classic Dragon Ancestor uses a table row. Revised Elemental Affinity uses an authored damage
type. Conflicting, absent or filtered declarations preserve saved selections for recovery without
granting benefits. Opening and cancelling leave the save alone. Clear removes the addressed owner.

## Required setup diagnostics

A known, reachable declaration with unverified rules reports a setup gap. The bounded detectors
cover Storm Aura, Natural Explorer, Favored Enemy, Canny and Mystic setup. They never guess counts
or reconstruct wholly pruned rules. An adopted unavailable replacement has one restore-or-clear
duty. An empty diagnostics list does not qualify all class choices.

## Specialized setup

- Storm Aura, Natural Explorer and Favored Enemy retain distinct earned choices. Campaign-authored
  humanoid labels are literals, and an explicit language assertion or none belongs to its own gain.
- Canny and other Expertise choices require current qualifying proficiency. Paired
  proficiency/Expertise uses its declared order. Save each provider separately so removal
  preserves independently earned proficiency and Expertise.
- Conditional proficiencies use exact declarations and the effective character. Unknown conditions
  require review. [Class choice normalization tests](../../tests/lib/5etools/classChoiceNormalization.test.ts)
