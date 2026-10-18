# Class ownership and automatic feature actions

Read this reference only when changing this contract. Start with the [topic index](../README.md).

## Class ownership

Class tags include source-qualified class identity and, where needed, the granting level/choice.
This allows multiclass-safe removal, per-level spell editing, level rollback, and subclass changes.

### Automatic feature actions

Actions and PDF use one pure projection. Class/subclass references retain the complete encoded
feature UID and the actual selected owner, including the full selected subclass name and printing.
UID source defaults, casing and display aliases identify
one feature; subclass UIDs use their separate field order. A positive integer encoded gain level
is authoritative; malformed nonempty UIDs never borrow materialized metadata. Rows without a UID
require valid materialized levels and complete feature ownership. Absent reference fields retain
the materialized target's identity fields; explicit reference values remain authoritative.

Distinct owners, printings and different gain-level rules remain separate. Repeated gains share
one action only when their parsed entries are structurally identical within the same owner/feature
family. Object field order is immaterial; array order, all field values and embedded qualified
targets remain significant even when rendered text matches.
Passive references do not consume an action identity. Standalone saved feature rows permanently
retain their own IDs. Unique catalog enrichment may supply their text, but cannot establish an owner,
replace their ID or suppress an independently earned action.

Action group IDs encode the actual owner, canonical target family/printing and a SHA-256 signature
of canonicalized parsed entries. Only the gain level is excluded from the family. No available
member supplies the group's identity, so an earlier identical gain returning cannot change it.
Its ID remains stable through UID enrichment, canonical spelling refresh and owner competition. Manual overrides
and PDF selections match the exact current ID. Different manual IDs remain independent player rows.
An unavailable or ineligible source leaves its manual action explicit; restoring the same target
reunites it by exact ID, and removing an override reveals the still-earned action.

Class-choice normalization, option views and persistence retain the full feature UID. Choices resolve
only that complete target; a matching label cannot supply another owner, gain or printing. An omitted
or empty duplicate source uses the source encoded or defaulted by the UID; an explicit conflicting
source rejects resolution. Materialized features retain that source so new selections remain saveable.
Feature IDs use actual owner plus exact target, independent of the granting choice's order or ID.
Removing one choice retains the same feature when another choice of that owner still grants it.
Different owners retain separate materialized rows and action groups.
Subclass-owned choices and readiness resolve within the full selected subclass, so a shared short name cannot
supply another owner's rules. Missing-content indicators and retained choice details use the same
complete target identity; a class choice may explicitly target another class's feature.
Composed subclass catalogs retain complete owner indexes. Repeated catalog copies within one
owner do not make a target ambiguous. A class-owned subclass target requires one exact owner;
competing owners leave the option unresolved in the picker, readiness, details and action projection.
Actions and PDF receive the complete target catalog separately from selected classes: an explicit
target may belong to an unselected class, whose unrelated features are not thereby earned.
Production choice targets use the same filtered catalog as picker/readiness; unavailable competing
owners cannot suppress a resolved choice. One explicit feature-choice bundle contains the authoritative
filtered class-feature catalog and complete subclass owner index; missing or empty inputs cannot be
replenished from selected classes, embedded class references or raw dictionaries. Picker, readiness,
availability, retained-details availability, Actions and PDF share its builder and exact resolver.
Raw lookups still supply standalone saved-feature text and separately labelled source-unavailable
retained details. Filtering uses the encoded or canonical current target printing, including upstream
blank-source defaults, independently of the actual enclosing or granting owner.

Qualified choice actions require the exact target's parsed rules. Missing or incomplete targets
remain saved intents without emitting or enriching an opaque action. Their materialized feature rows
are excluded from standalone action projection. Exact manual overrides remain explicit during
absence, and stored PDF preferences can select the same group when unchanged rules return.
No action/rules snapshot or derived mirror is added to the saved character.

Version 1.0 does not support earlier action-ID forms. No raw-UID/name-source compatibility aliases,
opaque saved-row handoff aliases, historical ownership inference or character conversion are added.
Wholly stale PDF selections follow the usual automatic fallback. Upstream UID defaults and complete
materialized current feature metadata still determine canonical data identity; they are not saved
character compatibility adapters.

Class-page spell choices and replacements use pure spell commands. `useSpellProvenanceMutations`
exposes only `setClassSpellSelectionsAtLevel` and `swapClassSpellAtLevel`; general Spells-page writes
use `useSpellProfileMutations`, which already commits profile and provenance changes together.

The bonus picker blocks spell targets already known through any profile. Existing overlapping
owners remain independent when later class or origin changes grant an already selected bonus spell.
Bonus spell selection records manual ownership with the selected spell printing. Replacing the
bonus list retracts only its removed manual targets. Removing a bonus copy preserves racial,
class and feat ownership of the same target, including independently prepared class spells.
Qualified removals never assign an unknown-source grant to the requested printing.
