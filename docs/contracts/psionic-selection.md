# Mystic psionic setup

Mystic talents and disciplines use the shared Class-choice controls and saved
`classChoiceSelections`. They are distinct from spells and optional features. Current source
declarations govern two class-owned progressions and separate subclass-owned bonus discipline
choices. Ordinary disciplines may come from any order. A bonus discipline must match the order
declared by its granting feature; Soul Knife has no bonus discipline grant.

## Current source authority

The loader recognizes `psionics.json` as an external content family. Revalidate an existing content
source to add this resource to its inventory. The Included SRD does not request or distribute it.
An inventoried resource that becomes unavailable is a loading failure under the usual refresh
policy. Missing individual content leaves retained setup recoverable rather than borrowing another
printing. Unknown psionic types or unsupported source structure supply no selection benefits.

Psionic identity is the explicit name/source tuple. Talent/discipline type and discipline order
are current eligibility metadata. Same-layer duplicate identities remain ambiguous through layer
composition; a later exact layer may replace them. Empty filtered catalogs are authoritative.

The source adapter verifies the complete qualified Psionics and unrestricted-discipline declarations,
plus each order's intro frame and bonus declaration. Compact hashes certify prose relationships
which lack structured semantics; current class-table columns supply counts and earned gain slots.
Changed or conflicting declarations cannot use cached normalized choices as authority. Semantic
certificate changes require source reassessment; regenerating hashes does not itself approve rules.
Duplicate parent class identities suspend all setup authority; duplicate subclass owners suspend
their bonus pool. Shared audits run before parser or layer composition can discard a competitor.
The source-conflict marker survives parsed caching; an exact
singular winning overlay may restore authority through ordinary whole-row replacement.

## Saved choices and ownership

The reserved choice ID carries the actual class/subclass owner, declaring feature target, pool and
root gain. Full selected subclass names remain separate from short names in upstream feature UIDs.
Selected psionics carry explicit name/source and their earned `slotLevel`; they save no rules text,
focus benefit or activity flag. The existing managed Feature IDs and provenance ledger record the
owned grant. Strict admission validates both directions of any materialized Feature/tag relation;
neither may impersonate another selection. Unavailable intent may omit both derived row and tag.

Commands verify current source, count, type/order, earned slots and exact target uniqueness across
the same Mystic class entry's base and bonus pools. Shared slot assignment preserves existing
acquisition levels. An old slot which no longer exists stays occupied and inactive; unchanged
confirmation cannot silently move it. Correct setup by clearing and choosing again. Oversubscribed
slots or duplicate exact targets suspend every affected allocation rather than choosing a winner.

Source filtering or changed/missing rules retains saved intent and suspends current benefits.
Exact restoration rebuilds benefits without a write. Clear removes only the addressed allocation;
intentional class/subclass removal and level rollback remove only lost owners or earned slots.
Independent grants and manual Features remain independently owned.

## Consumers and limits

One current effective-choice projection supplies Class completion, details, readiness, Review,
Actions and PDF. Managed stored Feature descriptions remain empty; readable descriptions are
enriched only in read-only projections from current source entries. The safe shared renderer and
rules-preview manager present focus, mode/submode, psi-cost and concentration text using an
attributed pure adaptation of upstream entry grammar. Description-enabled PDFs include that text;
names-only PDFs retain names. Unavailable choices remain explicitly recoverable.

Intelligence is the psionic ability. Existing Psi Points resource calculations and long-rest
recovery remain shared with other class resources. Learning a discipline does not automatically
apply its Psychic Focus benefits. These controls correct initial/earned setup; they do not track
gameplay replacements, focus selection, psi spending/limit enforcement or concentration. The
source does not explicitly settle order restrictions when a bonus discipline is later replaced;
that event policy remains outside this contract.

Entry points: [source adapter](../../src/lib/5etools/psionicChoices.ts),
[choice commands](../../src/lib/character/commands/classChoiceCommands.ts),
[effective choices](../../src/lib/character/effectiveClassChoiceFeatures.ts),
[admission](../../src/lib/schema/psionicValidation.ts).
