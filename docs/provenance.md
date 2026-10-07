# Provenance

Provenance records which source owns each materialized grant so changing a race, class, background,
feat, spell choice, or equipment option can retract only what that source supplied.

## Ownership model

`character.provenance` contains source tags for proficiencies, ability bonuses, features, feats,
spells, equipment, and structured choices. A tag identifies the source type/name/reference, grant
type, label, and domain-specific metadata such as class level or choice ID.

Normalization is case-insensitive for identity but preserves readable/source-qualified data for
display and resolution. Multiple tags may own the same grant; removing one owner must retain the
grant while another owner remains.

## Layers

| Layer | Responsibility |
| --- | --- |
| `src/lib/provenance/` | Pure ledger primitives, normalization, summaries, source-specific grant helpers. |
| `src/lib/character/commands/` | Complete domain transitions and reconciliation. |
| Domain mutation hooks | Gather active state/data and commit one command result. |
| `useProvenanceRows` / UI components | Read-only explanation of current ownership. |

Production pages call their domain hook directly. `useProvenance` and
`useProvenanceMutations` are integration-test aggregators, not a production mutation API.

## Command pattern

```ts
const result = applyDomainChange(character, ledger, input, dependencies)

updateCharacter(character.id, {
  ...result.characterPatch,
  provenance: result.provenanceUpdate,
})
```

A command owns identity updates, old-source reconciliation, materialized fields, and the ledger.
Batch choices accumulate the full result before the single store write.

## Reconciliation rules

- Match the complete owner identity, including source and choice/level metadata where applicable.
- Remove only tags owned by the replaced or unavailable source.
- Remove the materialized value only when no tag remains.
- Preserve manual and unrelated grants.
- Rebuild dependent fields (for example expertise or fixed spell ownership) in the same command.
- Level-down/class removal processes spell replacement events in reverse order before pruning them.
- Initial creation uses the same commands as later editing.

Never clear a whole category because one source changed.

## Origin ability scores

Origin rules depend on `character.originSystem`:

- 2014: race/subrace owns origin ability bonuses and racial feat choices.
- 2024: background owns origin ability assignment and origin feat grants.

`resolveRaceAsiChoices()` and the background normalization/command path validate selections against
parsed blocks. Unresolved choices remain explicit readiness issues; commands do not invent defaults.
Allocated base scores are never modified by origin or feat contributions. Effective scores consume
the ledger through `CharacterCalculationContext`.

Materialized race versions own their complete mechanics under the selected subrace identity. Their
parent contributes selection identity and origin-policy flags, without reapplying parent grants.
Switching to or from a version rebuilds both race and subrace ownership in one command so explicitly
removed proficiencies, spells, feats, and abilities are not restored or doubled. Traditional subrace
changes retain the existing additive ownership behavior.

Child versions retain upstream revised-parent metadata as `_baseFreeRules2024`. Origin normalization
recognizes that marker on complete versions so 2014 characters do not gain inherited revised racial
feats when saved selections are resolved from the raw catalog.

Complete versions also derive the legacy language fallback from their own string-valued lineage
when explicit language blocks are absent. Explicit arrays, including an empty array, suppress that
fallback for both parents and versions. The version owns both the fixed language and its choice;
traditional subraces do not synthesize a second parent fallback. The 2024 origin policy suppresses
racial language grants and retains its independent baseline.

Race commands compare proficiency ownership before removal with the ledger after all replaced
owners are removed, then apply the new grants. A value shared only by the old race and subrace
leaves with their final owner. Values still owned by a manual or unrelated source, and untracked
manual values, remain. Skill expertise is pruned with any proficiency that becomes unavailable.

Spell-profile adapters use the same complete-version boundary: `useCharacterRaceData` omits parent
spell blocks for a materialized version, including inherited blocks already present on that version
and blocks explicitly removed by it. Traditional subrace spell blocks remain additive, with named
parent blocks filtered to the selected subrace. Saved selections use the same rule when resolved
from the unfiltered catalog.

Race selection commands rebuild the persisted racial spell profile at the actual total character
level. They remove obsolete racial profiles and choice ownership, then restore saved choices only
for the same source-qualified profile and compatible choice rules. Existing choice commands enforce
current pool and count limits. Casting ability selections survive only while allowed by the current
fixed ability or choice options; removing that rule clears a historical ability. Independent class
and special profiles and spell-slot usage remain intact. A shared pure selection adapter keeps
command and spell-hook labels and blocks consistent; legacy profile labels and choice identifiers
remain stable.
Actions and PDF action projection consume the same resolved parent/subrace context and selection
adapter as the spell hook. They preserve those profile identities when projecting saved choices,
filter named parent blocks to the selected child, and respect complete-version spell removal.
An unavailable selected child projects its existing saved racial profiles, even when the available
parent has spell grants. Available class and subclass data still derive current grants at the
character's level. Each unavailable exact class or selected subclass retains its own saved profile
even when another class resolves. When all class data is unavailable, the full saved-profile fallback remains.
This fallback derives available subclass grants with their explicit spell source qualifiers, including
new level grants, so a competing printing cannot replace the requested spell. The shared spell-token
adapter accepts source-preserving decoding; existing callers retain their legacy decoding contract.
Only a resolved race selection can establish which racial spell blocks apply or were removed.
Mutation hooks resolve both current and previous subrace metadata from the unfiltered catalog.
Commands can therefore rebuild full race ownership when leaving a version hidden by source filters.
If the previous saved child is unavailable even in that catalog, its mechanics cannot establish an
additive transition. The command rebuilds the complete race selection and resets racial choices
against the newly selected data, preserving manual and unrelated ownership.

## Class ownership

Class tags include source-qualified class identity and, where needed, the granting level/choice.
This allows multiclass-safe removal, per-level spell editing, level rollback, and subclass changes.

Class-page spell choices and replacements use pure spell commands. `useSpellProvenanceMutations`
exposes only `setClassSpellSelectionsAtLevel` and `swapClassSpellAtLevel`; general Spells-page writes
use `useSpellProfileMutations`, which already commits profile and provenance changes together.

## Equipment ownership

Starting packages and manual inventory/proficiency changes use equipment commands. Package option
identity, chosen concrete generic item, inventory record, currency, and ledger change atomically.
Replacing a background package removes its prior items/currency before applying the new package.

## Invariants

- No orphaned materialized grant after its final owner is removed.
- No lost value while another source still owns it.
- No separate component-level provenance patch after a domain mutation.
- Every automatic grant has an explainable source label.
- Every reversible choice has stable owner metadata.
- Unknown/ambiguous parser input remains diagnostic rather than becoming a grant.

## Testing

Test pure commands first. Cover:

- initial grant;
- replacement/source change;
- removal and level-down;
- overlapping owners;
- manual-grant preservation;
- atomic materialized + ledger output;
- source-qualified identity collisions.

Use hook integration tests only for adapter/store behavior or cross-domain composition. Avoid tests
that mutate the ledger separately from the materialized state; that is not a supported workflow.
