# Provenance

Provenance records which source owns each materialized grant so changing a race, class, background,
feat, spell choice, or equipment option can retract only what that source supplied.

## Ownership model

`character.provenance` contains source tags for proficiencies, ability bonuses, features, feats,
spells, equipment, and structured choices. A tag identifies the source type/name/reference, grant
type, label, and domain-specific metadata such as class level or choice ID.

`sourceRef` identifies the granting owner's printing. Fixed feat tags separately store the granted
feat's printing in `grantSource` and its parameter in `grantVariant`; neither replaces owner identity.
Resolution and fixed setup keys use that target printing/variant. Ledger deduplication includes both
owner and target, so one owner can grant two printings without collapsing them. An unqualified fixed
target remains unresolved, even if only one printing is loaded; the owner's printing is not a default.

Normalization is case-insensitive for identity but preserves readable/source-qualified data for
display and resolution. Multiple tags may own the same grant; removing one owner must retain the
grant while another owner remains.
Separate owner name/source fields normalize only whitespace and case, preserving their complete
literal values. Proficiency/item key normalization must not truncate or reinterpret those fields.

Completed current-format characters have one active racial owner set: the selected source-qualified
parent and optional child. Every racial tag and choice in every ledger domain must match that set;
a selected child requires a parent. Persistence validates the complete character and rejects foreign
or orphan ownership, without requiring loaded metadata or inferring missing references. Empty
drafts without racial ownership remain valid. Creation and mutation commands commit identity,
materialized fields and provenance atomically; intermediate Finish patches are not saved characters.

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

Fixed feat option edits opt into normalized name/reference and fixed-variant matching, consistent
with saved option keys. Choice/class owner keys still match exactly; another printing or distinct
variant retains its benefits. Other `removeGrantsBySourceRef` callers retain exact comparison.

## Domain contracts

| Change | Read |
| --- | --- |
| Feat setup, ordinary/bonus/fixed owners, special spell kinds or expertise | [Feat ownership](contracts/feat-ownership.md) |
| Race/subrace/version transitions, origin abilities, native spells or defenses | [Racial ownership](contracts/racial-ownership.md) |
| Class gains, feature actions, target catalogs or action IDs | [Class ownership](contracts/class-ownership.md) |
| Equipment grants and AC ownership | [Equipment state](contracts/equipment-state.md) |
| Strict save admission | [Character format](contracts/character-format.md) |

## Feat setup ownership

See [Feat ownership](contracts/feat-ownership.md).

## Origin ability scores

See [Origin ability scores](contracts/racial-ownership.md#origin-ability-scores).

### Racial defenses

See [Racial defenses](contracts/racial-ownership.md#racial-defenses).

### Native racial spells

See [Native racial spells](contracts/racial-ownership.md#native-racial-spells).

## Class ownership

See [Class ownership](contracts/class-ownership.md#class-ownership).

### Automatic feature actions

See [Automatic feature actions](contracts/class-ownership.md#automatic-feature-actions).

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
