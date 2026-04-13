# Implementation Plan: Spell & Feat Workflow Refactoring

This document outlines the step-by-step implementation plan for all issues identified in `spell-workflow-audit.md` and `feat-workflow-audit copy.md`.

## Execution Strategy

- **Phase 1:** Critical correctness fixes (must run first; blocks nothing else)
- **Phase 2:** Code quality improvements (can run in parallel; low interdependencies)
- **Phase 3:** Complex refactors (low-risk extractions; tested via linting)
- All phases run linting/type checks after each step (Rule 11 from copilot-instructions.md)

---

## Phase 1: Critical Correctness Fixes

### Feat-1.1: Memoize `characterSnapshot` and `profileSpells` in FeatsPage

**File:** `src/pages/feats/FeatsPage.tsx`

**Status:** Unblocked  
**Risk:** Low (pure refactor of existing computation)  
**Validation:** Run tests, verify no visual/behavioral changes

**Steps:**

1. Locate the bare `profileSpells` definition (around line 210–213):
   ```tsx
   const profileSpells = character
     ? collectKnownSpells(ensureSpellProfiles(character))
     : { cantrips: [], spellsKnown: [], preparedSpells: [] }
   ```

2. Replace with memoized version:
   ```tsx
   const profileSpells = useMemo(
     () =>
       character
         ? collectKnownSpells(ensureSpellProfiles(character))
         : { cantrips: [], spellsKnown: [], preparedSpells: [] },
     [character],
   )
   ```

3. Locate the bare `characterSnapshot` definition (lines 215–234).

4. Replace with memoized version:
   ```tsx
   const characterSnapshot = useMemo<PrereqCharacterSnapshot>(
     () => ({
       level: character?.level ?? 0,
       class: character?.class ?? '',
       race: character?.race ?? '',
       abilityScores: character?.abilityScores ?? {
         strength: 10,
         dexterity: 10,
         constitution: 10,
         intelligence: 10,
         wisdom: 10,
         charisma: 10,
       },
       features: character?.features ?? [],
       spells: {
         cantrips: profileSpells.cantrips,
         spellsKnown: profileSpells.spellsKnown,
         preparedSpells: profileSpells.preparedSpells,
       },
     }),
     [character, profileSpells],
   )
   ```

5. Verify `profileSpells` is declared before `characterSnapshot`.

6. Run `npm run lint` and fix any linting errors.

7. Run `npm run test` to verify no regressions.

**Success Criteria:**
- `profileSpells` wrapped in `useMemo` with `[character]` dependency
- `characterSnapshot` wrapped in `useMemo` with `[character, profileSpells]` dependency
- All linting passes
- All tests pass
- No visual changes to feat cards

---

## Phase 2: Code Quality Improvements (Parallel Execution)

### Spell-2.1: Extract Cantrip Rendering Component in SpellProfileManager

**File:** `src/pages/spells/components/SpellProfileManager.tsx`

**Status:** Unblocked  
**Risk:** Low (pure extraction, no logic changes)  
**Validation:** Type checking, linting, visual inspection

**Steps:**

1. At the top of the component body (after imports, before return), define the `CantripGroupProps` interface:
   ```tsx
   interface CantripGroupProps {
     profileId: string
     items: SpellListItem[]
     span: ReturnType<typeof getSpanForGroup>
     swappedByAddedName: Map<string, { removed: string; level: number }>
     selectionSource: Map<string, string>
     renderSpellName: SpellProfileManagerProps['renderSpellName']
     onRemoveSpell: (item: SpellListItem) => void
   }
   ```

2. Define the internal `CantripGroup` component (copy cantrip rendering block from lines ~424–467):
   ```tsx
   function CantripGroup({
     profileId,
     items,
     span,
     swappedByAddedName,
     selectionSource,
     renderSpellName,
     onRemoveSpell,
   }: CantripGroupProps) {
     const cantripItems = items.filter((item) => item.level === 0)
     // ... (rest of current cantrip rendering verbatim)
   }
   ```

3. In the `isTruePrepared` render branch (around line 424), replace the cantrip block with:
   ```tsx
   {levels.includes(0) ? (
     <CantripGroup
       profileId={profile.id}
       items={items}
       span={getSpanForGroup(groupIndex++, totalGroups)}
       swappedByAddedName={swappedByAddedName}
       selectionSource={selectionSourceByProfileAndSpell}
       renderSpellName={renderSpellName}
       onRemoveSpell={onRemoveSpell}
     />
   ) : null}
   ```

4. In the non-`isTruePrepared` render branch (around line 573), replace the cantrip block with the same component call.

5. Run `npm run lint` and fix any linting errors.

6. Run `npm run test` to verify no regressions.

**Success Criteria:**
- `CantripGroup` component extracts all cantrip rendering logic
- Both branches use the same component
- No duplicate code remaining
- Type checking passes
- Visual output identical before/after

---

### Spell-2.2: Precompute Synthetic Spell Items in SpellsPage

**File:** `src/pages/spells/SpellsPage.tsx` and `src/pages/spells/components/SpellProfileManager.tsx`

**Status:** Depends on: Understanding current `preparedCasterSpellsByProfile` structure  
**Risk:** Low (refactor existing data prep)  
**Validation:** Type checking, linting

**Steps:**

1. In `SpellsPage.tsx`, after `detailsByProfileId` useMemo (around line 320), add a new useMemo:
   ```tsx
   const preparedCasterItemsByProfile = useMemo(() => {
     const map = new Map<string, { spell: Spell5e; item: SpellListItem }[]>()
     for (const detail of spellcastingDetails) {
       if (!detail.isTruePreparedCaster || detail.maxSpellLevel < 1) continue
       const profile = spellProfiles.find((p) => p.id === detail.profileId)
       if (!profile || profile.type !== 'class') continue

       const available = allSpells.filter(
         (spell) =>
           spell.level > 0 &&
           spell.level <= detail.maxSpellLevel &&
           isSpellOnClassList(spell, profile.className, profile.classSource),
       )
       available.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

       map.set(
         detail.profileId,
         available.map((spell) => ({
           spell,
           item: {
             profileId: profile.id,
             profileLabel: profile.label,
             className: profile.className,
             classSource: profile.classSource,
             name: spell.name,
             level: spell.level,
             kind: 'spell' as const,
             prepared: false,
             isPreparedCaster: true,
           } as SpellListItem,
         })),
       )
     }
     return map
   }, [allSpells, spellcastingDetails, spellProfiles])
   ```

2. Update the prop passed to `SpellProfileManager`:
   - Remove `preparedCasterSpellsByProfile={preparedCasterSpellsByProfile}`
   - Add `preparedCasterItemsByProfile={preparedCasterItemsByProfile}`

3. In `SpellProfileManager.tsx` props interface, update:
   ```tsx
   preparedCasterItemsByProfile?: Map<string, { spell: Spell5e; item: SpellListItem }[]>
   ```

4. In the `isTruePrepared` render branch where synthetic items are created (around line 509), change from:
   ```tsx
   const spellsAtLevel = availableClassSpells.filter((s) => s.level === spellLevel)
   spellsAtLevel.map((spell) => {
     const syntheticItem: SpellListItem = { ... }
   ```

   To:
   ```tsx
   const itemsAtLevel = (preparedCasterItemsByProfile?.get(profile.id) ?? [])
     .filter(({ spell }) => spell.level === spellLevel)
   itemsAtLevel.map(({ spell, item }) => {
   ```

5. Update spell reference from `spell` instead of reconstructing.

6. Run `npm run lint` and fix linting errors.

7. Run `npm run test` to verify no regressions.

**Success Criteria:**
- Synthetic items are pre-computed in `SpellsPage`
- `SpellProfileManager` no longer constructs items per-render
- Type checking passes
- Visual output identical before/after

---

### Feat-2.2: Delete Unused `src/pages/feats/model/selection.ts`

**File:** `src/pages/feats/model/selection.ts` (deletion)

**Status:** Unblocked (verified unused)  
**Risk:** Low (file is unused)  
**Validation:** Ensure no imports break

**Steps:**

1. Verify no imports of `buildFeatModalFeats` or `partitionSelectedFeats` from `@/pages/feats/model/selection` exist via grep:
   ```bash
   grep -r "from '@/pages/feats/model/selection" src/
   grep -r "from '@/pages/feats/model" src/
   ```

2. If any imports found, update them to use `src/pages/build/class/model/pageUtils.ts` instead (ClassPage already does this).

3. Delete `src/pages/feats/model/selection.ts`.

4. Run `npm run lint` and verify no broken imports.

5. Run `npm run test` to ensure no test failures.

**Success Criteria:**
- File deleted
- No import errors
- No tests broken
- Linting passes

---

## Phase 3: Moderate Refactors (Parallel Execution)

### Spell-3.1: Extract Tooltip Component to Route-Local File

**Files:** 
- Create: `src/pages/spells/components/SpellNameTooltip.tsx`
- Create: `src/pages/spells/components/spellTooltipUtils.ts`
- Update: `src/pages/spells/SpellsPage.tsx`

**Status:** Depends on: Understanding tooltip utility functions  
**Risk:** Medium (component extraction; visual regression risk)  
**Validation:** Visual testing, linting, type checking

**Steps:**

1. **Create `src/pages/spells/components/spellTooltipUtils.ts`:**
   - Extract functions: `parseRecursiveReference`, `normalizeKind`, `getPreviewHtml`, `getRecursiveTooltipData`, `getRecursiveHintPosition`
   - Extract interfaces: `TooltipEntityLike`, `RecursiveReference`, `RecursiveTooltipData`, `RecursiveHintState`, `RecursiveLookup`
   - Copy implementation from `SpellsPage.tsx` lines 27–195 verbatim

2. **Export all functions and types from the new utility file.**

3. **Create `src/pages/spells/components/SpellNameTooltip.tsx`:**
   - Extract `SpellNameTooltip` component from `SpellsPage` (lines 853–1011)
   - Import tooltip utilities from `./spellTooltipUtils`
   - Import `getEntryWithHoverTitles` from `@/lib/renderer` (will be added in Spell-3.2)
   - Keep all Tooltip/TooltipContent/TooltipTrigger imports from `@/components/ui/tooltip`

4. **Update `src/pages/spells/SpellsPage.tsx`:**
   - Remove the extracted functions and interfaces
   - Import `SpellNameTooltip` from `./components/SpellNameTooltip`
   - Keep `recursiveLookup` useMemo as-is (page orchestration logic)
   - Verify the render call passes correct props

5. **Run `npm run lint` and fix linting errors.**

6. **Run `npm run test` and visually verify tooltip renders correctly.**

**Success Criteria:**
- Tooltip component and utilities extracted to route-local files
- `SpellsPage.tsx` loses ~200 lines
- All imports resolve correctly
- Type checking passes
- Tooltips render identically before/after
- No linting errors

---

### Spell-3.2: Add `getEntryWithHoverTitles` to `src/lib/renderer.ts`

**File:** `src/lib/renderer.ts`

**Status:** Depends on: Spell-3.1 (used by extracted tooltip)  
**Risk:** Low (pure addition to existing module)  
**Validation:** Type checking, linting

**Steps:**

1. At the end of `src/lib/renderer.ts`, add the function:
   ```tsx
   export function getEntryWithHoverTitles(entry: unknown): string {
     const html = renderEntry(entry) ?? ''
     return html
       .replace(
         /\stitle="([^"]+)"((?:\sdata-hover-type="[^"]*")?)(?:\sdata-hover-name="([^"]*)")?((?:\sdata-hover-source="[^"]*")?)/g,
         (_match, title, maybeType = '', hoverName = '', maybeSource = '') =>
           ` title="${title}" data-recursive-title="${title}"${maybeType}${hoverName ? ` data-hover-name="${hoverName}"` : ''}${maybeSource}`,
       )
       .replace(/\scursor-help/g, ' cursor-help underline decoration-dotted underline-offset-2')
   }
   ```

2. Copy the implementation from `SpellsPage.tsx` lines 172–195 verbatim.

3. Run `npm run lint` and fix any linting errors.

4. Run `npm run test` to verify no regressions.

**Success Criteria:**
- Function exported from `src/lib/renderer.ts`
- No linting errors
- Function is used by tooltip component

---

### Spell-4.1: Extract Attribution Logic to `src/lib/calculations/spellProfiles.attribution.ts`

**File:** `src/lib/calculations/spellProfiles.attribution.ts`

**Status:** Depends on: Understanding provenance ledger structure  
**Risk:** Low (pure function extraction)  
**Validation:** Type checking, linting

**Steps:**

1. In `src/lib/calculations/spellProfiles.attribution.ts`, add the new function at the end:
   ```tsx
   export function buildSpellSelectionSourceMap(
     spellProfiles: SpellProfile[],
     ledger: ProvenanceLedger,
   ): Map<string, string> {
     const map = new Map<string, string>()
     for (const profile of spellProfiles) {
       for (const spellName of [...profile.cantrips, ...profile.spellsKnown]) {
         const key = `${profile.id}|${spellName}`
         const tags = ledger.spells[normalizeKey(spellName)] ?? []

         if (profile.type === 'class' && profile.className) {
           const classTag = tags.find(
             (tag) =>
               tag.sourceType === 'class' &&
               tag.sourceName === profile.className &&
               (tag.sourceRef ?? '') === (profile.classSource ?? ''),
           )
           if (!classTag) continue

           if (classTag.spellGrantedAtLevel) {
             const suffix =
               classTag.spellAttributionMode === 'inferred-lowest-eligible'
                 ? 'Inferred Choice'
                 : 'Choice'
             map.set(key, `${profile.className} Lv. ${classTag.spellGrantedAtLevel} ${suffix}`)
             continue
           }

           map.set(key, `${profile.className} Choice`)
           continue
         }

         if (tags.some((tag) => tag.sourceType === 'manual')) {
           map.set(key, 'User Choice')
         }
       }
     }
     return map
   }
   ```

2. Ensure `ProvenanceLedger` type is imported at the top of the file.

3. Ensure `normalizeKey` is imported (should already be).

4. In `src/pages/spells/SpellsPage.tsx`, replace the useMemo (around lines 455–489) with:
   ```tsx
   const selectionSourceByProfileAndSpell = useMemo(
     () => buildSpellSelectionSourceMap(spellProfiles, ledger),
     [spellProfiles, ledger],
   )
   ```

5. Add import at the top of `SpellsPage.tsx`:
   ```tsx
   import { buildSpellSelectionSourceMap } from '@/lib/calculations/spellProfiles.attribution'
   ```

6. Run `npm run lint` and fix any linting errors.

7. Run `npm run test` to verify no regressions.

**Success Criteria:**
- Function exists in `spellProfiles.attribution.ts`
- `SpellsPage` calls it from a useMemo
- No linting errors
- Output identical before/after
- Tests pass

---

### Spell-5.1: Remove Modal Rendering from SpellProfileManager

**Files:**
- `src/pages/spells/components/SpellProfileManager.tsx`
- `src/pages/spells/SpellsPage.tsx`

**Status:** Depends on: Understanding modal state ownership  
**Risk:** Medium (prop/callback refactoring)  
**Validation:** Linting, functional testing

**Steps:**

1. **Update `SpellProfileManager` props interface:**
   - Remove: `racialChoiceModalOpen?: boolean`
   - Remove: `onRacialChoiceModalOpenChange?: (open: boolean) => void`
   - Remove: `racialChoiceModalConfig?: SpellModalConfigLike | null`
   - Remove: `onConfirmRacialChoice?: (names: string[]) => void`
   - Keep: `onOpenRacialChoice?: (profileId: string, choiceId: string) => void` (already exists as `onOpenRacialChoiceModal`)

2. **Destructure `onOpenRacialChoice` instead of the four modal props.**

3. **Remove the `<SpellSelectionModal>` render at the bottom of SpellProfileManager.**

4. **In `SpellsPage.tsx`, update the `SpellProfileManager` props:**
   - Remove: `racialChoiceModalOpen={racialChoiceModalOpen}`
   - Remove: `onRacialChoiceModalOpenChange={setRacialChoiceModalOpen}`
   - Remove: `racialChoiceModalConfig={racialChoiceModalConfig}`
   - Remove: `onConfirmRacialChoice={handleConfirmRacialChoice}`
   - Rename: `onOpenRacialChoiceModal={handleOpenRacialChoiceModal}` to `onOpenRacialChoice={handleOpenRacialChoiceModal}`

5. **Move the `<SpellSelectionModal>` render after the `SpellProfileManager` call in `SpellsPage`:**
   ```tsx
   {racialChoiceModalConfig ? (
     <SpellSelectionModal
       open={racialChoiceModalOpen ?? false}
       onOpenChange={setRacialChoiceModalOpen}
       // ... rest of props
     />
   ) : null}
   ```

6. Run `npm run lint` and fix any linting errors.

7. Run `npm run test` to verify modal still opens/closes correctly.

**Success Criteria:**
- `SpellProfileManager` no longer renders modal
- Modal props removed from interface
- `SpellsPage` owns modal rendering
- Modal still functions identically
- All linting passes
- Tests pass

---

### Feat-3.1: Refactor Badge Logic in FeatDetailCard

**File:** `src/pages/feats/FeatsPage.tsx` (FeatDetailCard component around lines 84–124)

**Status:** Unblocked  
**Risk:** Low (UI refactor, visual testing needed)  
**Validation:** Visual inspection, linting

**Steps:**

1. In `FeatDetailCard`, before the return statement, add:
   ```tsx
   const originLabel: string | null = isOrigin
     ? grantedBy
       ? `Origin: ${grantedBy.split(': ').slice(1).join(': ') || grantedBy}`
       : 'Origin Feat'
     : null

   const grantLabel: string | null = !isOrigin && grantedBy ? grantedBy : null
   ```

2. Replace the nested ternary badge block (lines 104–122) with flat conditionals:
   ```tsx
   {isBonus && (
     <Badge className="text-xs px-1.5 py-0 h-5 bg-warning/20 text-warning border border-warning/40">
       Bonus
     </Badge>
   )}
   {originLabel && (
     <Badge className="text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary border border-primary/30">
       <Sparkle className="h-2.5 w-2.5 mr-0.5" weight="duotone" />
       {originLabel}
     </Badge>
   )}
   {grantLabel && (
     <Badge className="text-xs px-1.5 py-0 h-5 bg-accent/20 text-accent border border-accent/40">
       <Sparkle className="h-2.5 w-2.5 mr-0.5" weight="duotone" />
       {grantLabel}
     </Badge>
   )}
   {!met && (
     <Badge
       variant="outline"
       className="text-xs px-1.5 py-0 h-5 text-destructive border-destructive/50"
     >
       Prereqs unmet
     </Badge>
   )}
   ```

3. Run `npm run lint` and fix any linting errors.

4. Visually inspect feat cards to verify badges render identically.

**Success Criteria:**
- Badge display logic extracted before return
- Nested ternary replaced with flat conditionals
- Visual output identical before/after
- Linting passes

---

### Feat-4.1: Collapse Chained useMemo Calls for Feat Partitioning

**File:** `src/pages/feats/FeatsPage.tsx` (around lines 220–280)

**Status:** Unblocked  
**Risk:** Low (pure refactor)  
**Validation:** Linting, testing

**Steps:**

1. Replace the six useMemo calls (lines 223–268) with a single useMemo:
   ```tsx
   const {
     resolvedOriginChoices,
     resolvedRacialChoices,
     pendingOriginChoices,
     pendingRacialChoices,
   } = useMemo(() => {
     const origin = ledger.choices.filter(
       (c) => c.domain === 'feats' && c.sourceTag.sourceType === 'background',
     )
     const racial = ledger.choices.filter(
       (c) =>
         c.domain === 'feats' &&
         (c.sourceTag.sourceType === 'race' || c.sourceTag.sourceType === 'subrace'),
     )
     return {
       resolvedOriginChoices: origin.filter((c) => c.selected.length > 0),
       resolvedRacialChoices: racial.filter((c) => c.selected.length > 0),
       pendingOriginChoices: origin.filter((c) => c.selected.length === 0),
       pendingRacialChoices: racial.filter((c) => c.selected.length === 0),
     }
   }, [ledger.choices])
   ```

2. Remove the six individual useMemo declarations.

3. Remove intermediate variable declarations (e.g., `featChoices`, `originChoices`, `racialChoices`).

4. Verify all references to removed intermediate variables are gone.

5. Run `npm run lint` and fix any linting errors.

6. Run `npm run test` to verify no regressions.

**Success Criteria:**
- Single useMemo replaces six
- All intermediate variables removed
- Linting passes
- Tests pass
- No functional changes

---

## Phase 4: Low-Priority Deprecation (Deferred)

### Spell-6.1: Add Deprecation Notices to useSpellSlots Legacy Wrappers

**File:** `src/hooks/character/useSpellSlots.ts`

**Status:** Deferred (requires test migration)  
**Risk:** Low (deprecation only, no removal yet)  
**Validation:** CI/lint passes

**Steps:**

1. Above each legacy wrapper function in `useSpellSlots`, add:
   ```tsx
   /**
    * @deprecated Use addSpellToProfile directly instead.
    */
   ```

2. Same for `removeCantrip`, `addSpellKnown`, `removeSpellKnown`.

3. Document migration path in a separate task (not included in this plan).

4. Run `npm run lint` to verify no issues.

**Success Criteria:**
- Deprecation notices added
- No functional changes
- Linting passes

---

## Validation & Testing Summary

After each phase/task, execute:

```bash
# Linting
npm run lint

# Type checking (if separate)
npm run type-check

# Unit/integration tests
npm run test

# E2E tests (if relevant)
npm run test:e2e
```

**Success is when all checks pass.**

---

## Dependency Graph

```
Phase 1 (Critical)
├── Feat-1.1 (Memoize snapshot/spells)
│   └── Unblocks: Feat-2.2, Feat-3.1, Feat-4.1

Phase 2 (Code Quality - Parallel)
├── Spell-2.1 (Cantrip extraction)
├── Spell-2.2 (Synthetic items prep)
├── Feat-2.2 (Delete selection.ts)
└── All unblocked

Phase 3 (Moderate Refactors - Parallel)
├── Spell-3.1 (Extract tooltip component) 
│   └── Depends on: Spell-3.2
├── Spell-3.2 (Add getEntryWithHoverTitles)
│   └── Unblocks: Spell-3.1
├── Spell-4.1 (Attribution logic)
├── Spell-5.1 (Modal ownership)
├── Feat-3.1 (Badge refactor)
└── Feat-4.1 (Collapse useMemos)

Phase 4 (Deprecation - Deferred)
└── Spell-6.1 (Deprecate legacy wrappers)
```

---

## Summary Table

| Issue | File(s) | Severity | Phase | Est. Complexity |
|-------|---------|----------|-------|-----------------|
| Spell-1 | SpellsPage, SpellProfileManager, SpellNameTooltip | High | 3 | Medium |
| Spell-2 | SpellProfileManager | High | 2 | Low |
| Spell-3 | SpellProfileManager, SpellsPage | Medium | 2 | Low |
| Spell-4 | SpellsPage, spellProfiles.attribution | Medium | 3 | Low |
| Spell-5 | SpellsPage, SpellProfileManager | Medium | 3 | Medium |
| Spell-6 | useSpellSlots | Low | 4 | Low |
| Feat-1 | FeatsPage | **Critical** | 1 | Low |
| Feat-2 | FeatsPage, selection.ts | Medium | 2 | Low |
| Feat-3 | FeatsPage | Low-Medium | 3 | Low |
| Feat-4 | FeatsPage | Low | 3 | Low |

---

## Handoff Notes

- All tasks are discrete and can be assigned to AI agents autonomously.
- Each task specifies files, code snippets, and success criteria clearly.
- Linting is a gating criterion after every step (per copilot-instructions.md Rule 11).
- Tests must pass after each significant change.
- Visual changes (Spell-3.1, Feat-3.1) require human verification despite passing tests.
