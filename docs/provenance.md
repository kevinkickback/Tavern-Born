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
