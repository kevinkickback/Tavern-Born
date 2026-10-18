# Prerequisite eligibility

Read this reference only when changing this contract. Start with the [topic index](../README.md).

The shared prerequisite checker consumes the upstream raw shape. Blocks in `prerequisite[]` are
alternatives (OR); conditions within one block must all hold (AND). Ability requirements use maps
such as `{ dex: 13 }`: every score in a map is required, and separate maps in `ability[]` are
alternatives. Never substitute the checker-specific `{ ability, score }` shape or an implicit
threshold for source data. Class-qualified level requirements use the matching class/subclass
progression and supplied source, not total multiclass level or just the primary class.
Class-choice snapshots resolve the selected subclass's upstream short name from the exact
source-qualified class catalog. An unavailable subclass identity requires review rather than
guessing an alias; levels belonging to distinct class entries are never added to meet one owner.
Contextual class choices and subclass eligibility carry the selected parent class source into
numeric level checks. A missing saved source cannot prove a source-qualified subclass condition.

The aggregate result distinguishes `met`, `unmet`, and `unsupported`. Unknown condition keys or
malformed supported conditions require manual review and cannot prove eligibility. A satisfied
alternative is sufficient even when another alternative is unsupported; a definitely failed
condition makes its own AND block unmet. Selection filters and feat details expose review reasons.
This does not imply that every upstream condition is automated: unsupported feat, campaign,
proficiency, and other conditions retain that explicit review state until their mechanics are
implemented against an authoritative character snapshot.

Known spell/cantrip names are decoded from source-qualified selections before prerequisite matching,
consistent with the existing logical spell-name equality contract. Spell lists are alternatives;
filtered spell choices and unknown spell-reference suffixes require manual review.
