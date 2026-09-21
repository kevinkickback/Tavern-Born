# React Patterns

Established conventions for React hooks and rendering in this codebase.

---

## Stable Empty-Array Fallbacks

`?? []` creates a new array reference every render. When the result is used as a `useMemo`/`useCallback` dependency or passed as a prop to a `memo`-wrapped child, the new reference defeats memoization.

```tsx
// ❌ new [] every render when character.feats is undefined
const feats = character?.feats ?? []
const memoized = useMemo(() => compute(feats), [feats])

// ✅ same reference every render
const EMPTY_FEATS: Feat[] = []
const feats = character?.feats ?? EMPTY_FEATS
const memoized = useMemo(() => compute(feats), [feats])
```

`?? []` inside a `useMemo`/`useCallback` body (not as a dep) is fine — it only affects the computation, not dep comparison.

---

## Key Prop for Component Reset

When a modal or subtree needs to reset its internal state on open/close, use a `key` prop — not `useEffect` + a counter.

```tsx
// ❌ extra render cycle, effect noise
const [mountKey, setMountKey] = useState(0)
useEffect(() => { if (open) setMountKey(k => k + 1) }, [open])
<Inner key={mountKey} />

// ✅ React handles the reset declaratively
<Inner key={String(open)} />
```

---

## Lazy useState Initializers for One-Time Setup

When a component conditionally mounts (e.g. inside `{condition && <Modal />}`), React already resets state on unmount. Use lazy `useState` initializers instead of a `useEffect` that re-runs on every open:

```tsx
// ❌ re-initializes on mount AND on subsequent prop changes
const [steps, setSteps] = useState<Step[]>([])
useEffect(() => { setSteps(deriveSteps(feat)) }, [feat, open])

// ✅ runs once on mount; component unmounts/remounts to reset
const [steps, setSteps] = useState<Step[]>(() => deriveSteps(feat))
```

---

## Large Selection Lists

`SelectionModal` virtualizes its complete filtered result set with `@tanstack/react-virtual`. Keep search, filters, and virtualizer state local to the modal, use stable item IDs for virtual row keys, and keep the canonical item arrays in `gameDataStore`. Do not replace the complete virtual range with incremental batches: the scrollbar and any result must remain available immediately.

---

## Ref-Based Dep Narrowing for Trigger-Only Effects

When a `useEffect` should run only when a specific trigger changes (e.g. "when the selected race key changes"), but needs access to current values of other variables, use refs to read the current values without adding them to the dep array.

```tsx
// ❌ fires on every character update (character in deps → updateCharacter writes → re-fires)
useEffect(() => {
  if (!character || !selectedRace || selectedSubrace) return
  applySubraceChange(selectedRace, subraces[0])
}, [character, selectedRace, selectedSubrace, subraces, applySubraceChange, updateCharacter])

// ✅ fires only when selectedRaceKey changes
const characterRef = useRef(character)
characterRef.current = character
const subracesRef = useRef(subraces)
subracesRef.current = subraces

// biome-ignore lint/correctness/useExhaustiveDependencies: selectedRaceKey is the trigger
useEffect(() => {
  const char = characterRef.current
  const currentSubraces = subracesRef.current
  if (!char || !selectedRaceKey) return
  // ...
}, [selectedRaceKey, applySubraceChange, updateCharacter])
```

Only suppress the Biome exhaustive-deps rule when the pattern is intentional and the suppression comment explains the trigger dep by name.

---

## Content Page Layout

Workbench-style pages use `WorkspacePage` as the flat parent surface. If a page has functional tabs or controls, place them in a full-width `WorkspacePaneHeader`, then put the scrolling content in `WorkspaceBody` with a centered max-width inner container.

List/detail workspaces use the shared `SplitPane`. Give both compact panes concise, page-specific
labels. Below the shared container breakpoint, `SplitPane` shows one full-width pane at a time;
selection handlers that reveal details should control `compactPane` and select the right pane without
changing the desktop `leftCollapsed` or `rightCollapsed` preferences. Toolbars inside a pane should
respond to their own container width rather than the application viewport.
On desktop, a collapsed pane must be removed from flex sizing (`flex-none` at zero width), allowing
the visible pane to fill the workspace rather than leaving an invisible reserved column.

Character Rules and Conditions are the reference tabbed pages. Their parent remains flat while each
meaningful section may use its own bordered card. The Sources page is the reference for a flat
configuration panel with controls placed directly inside its constrained content area. Avoid
wrapping the entire content area in a second card unless the page intentionally uses the
dual-pane/workbench pattern.

Use the shared `Button` `accentOutline` variant for compact edit/configure affordances that lead to
an existing setup workflow. It provides an accent border and text without a filled resting state.
Incomplete or destructive actions retain their warning/destructive semantic variants instead of
using `accentOutline`.

Settings and Compendium retain their established route-specific containers. Character cards and the sidebar remain full-bleed by design.

Portrait pan values use the character card's 360 x 240 logical coordinate space. Convert those
values to card-relative percentages in the shared frame renderer so the portrait editor preview
and finished card retain the same crop at different responsive widths. Do not apply persisted pan
values directly as viewport pixels. Keep slider drag values local to the portrait editor and write
the completed transform to the character store on commit; validating the full character on every
pointer movement makes large uploaded portraits visibly stall. The expandable preview renders the
entire card in that logical coordinate space and scales its canvas uniformly; text, icons, actions,
padding, and portrait framing must enlarge together while editor controls outside the card retain
their normal application size. In the portrait editor, contain that canvas within the space above
the controls so expanding the preview pane never pushes those controls out of view. Keep the stacked
image controls centered and constrained to the rendered card width rather than stretching them
across an expanded pane. With both portrait panes open, keep the width-driven preview at the top
with its controls immediately below it and allow that pane to scroll only when its height requires
it. Use the height-constrained, no-scroll arrangement when the portrait library is collapsed.

---

## Feature Controller Hooks

When a route coordinates multiple independently changing domains, extract one controller hook per
domain. A controller owns its picker/modal state, derives its view model through pure `src/lib/`
functions, and exposes command-backed actions. Keep the route responsible for section arrangement,
pane state, and cross-domain presentation only.

`BuildClassPage` is the reference: subclass, spell, ASI/feat, and optional-feature controllers live
under `src/pages/build/class/hooks/`. Its generic class-choice controller also resolves normalized
choice descriptors into source-qualified view models while the pure resolver remains in
`src/lib/character/classChoiceOptions.ts`. Do not move canonical rules into a controller; rules
remain pure calculations or commands.

---

## Rules Preview Manager

All rules-entry and spell-name previews are owned by the single `RulesPreviewManager` mounted at the
application root. Triggers resolve an immutable content descriptor and send it to the manager; pages,
cards, virtualized rows, and individual rendered text blocks never own preview state or portals.

The manager keeps a rolling chain of at most two unpinned previews. Opening a reference from the
newest preview preserves that spawning surface, retires the oldest unpinned ancestor, and reuses
the retired ancestor's physical slot for the new child. Neither visible shell moves or swaps under
the pointer while its content changes. A pinned preview remains immutable and may coexist with both
transient levels, for a bounded maximum of three windows. Opening roots or recursive references can
only change transient slots; only an explicit pin action may transfer the single global pin. Escape
closes the newest transient, then its transient parent, then the pin.

Pinned descriptors contain all content needed to render and have no lifecycle dependency on their
source element. A pinned preview therefore survives route content changes and virtualized-row
unmounts without retaining hidden rows or increasing overscan. The visible pinned title is the
pointer and keyboard drag handle through `useDraggablePreview`.

`RulesPreviewManager` creates one portal at `document.body`. Floating UI owns measured anchoring,
flipping, and viewport shifting; the manager supplies a synchronous collision-safe fallback so an
overlay never flashes at the viewport origin. Transient placement also reserves the bounds of the
pin and earlier transient ancestors, trying every side of the spawning shell so deeper content
cannot cover the context that opened it. Recursive hover uses a short intent delay, while
invisible collision-aware corridors bridge physical gaps between parent and child shells. Delayed
dismissal and a document-level outside-chain fallback prevent size changes, pin transfers, or
unpinning beneath a stationary pointer from stranding or prematurely closing the chain. Preview
entry uses a fade only; never animate position or dimensions beneath the pointer. Interactive
content uses `RenderedHtml`, and the shared shell contains wheel events so a portaled preview scrolls
independently of an underlying modal or virtual list.
