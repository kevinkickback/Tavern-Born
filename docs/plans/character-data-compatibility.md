# Character Data Compatibility Plan

Status: future 1.0 planning.

## Current pre-1.0 policy

- Preserve stored character choices when source or ruleset compatibility changes.
- Stop offering incompatible choices for new selections.
- Warn about stored choices that no longer match the configured ruleset; warnings must not include
  explicitly supported compatibility exceptions.
- Do not silently replace races, classes, subclasses, backgrounds, feats, equipment, or other
  character-owned choices. Replacements can change grants, provenance, and required decisions.
- Never delete a character merely because it was created by a pre-1.0 release.

## Decision required before 1.0

Choose the support boundary after the 1.0 character schema and rules model stabilize:

1. Prefer tested, one-way migrations when old choices have unambiguous equivalents.
2. When reliable conversion is not possible, retain the original character as a clearly labeled
   legacy character that remains viewable, printable, and exportable.
3. A future “Duplicate and upgrade” workflow may provide best-effort conversion, but it must keep
   the original and list every unresolved choice.
4. If support for part of the pre-1.0 migration chain is deliberately removed, announce the cutoff
   in advance and provide export or backup recovery before updating stored data.

## 1.0 acceptance criteria

- Character schema versions are distinguishable from application versions.
- Every supported migration is pure, one-way, idempotent, and covered by fixture-based tests.
- Failed or partial migrations cannot overwrite the original character.
- Legacy characters remain discoverable and their compatibility state is explained in the UI.
- Release notes state which character schema versions can be edited, converted, or viewed only.
- Post-1.0 releases treat persisted-character compatibility as a product contract; breaking that
  contract requires an explicit migration or legacy-access plan.
