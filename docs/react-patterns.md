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

Settings, Compendium, and all Details sub-nav pages use a centered max-width container:

```tsx
<div className="max-w-7xl mx-auto w-full">
  <Card className="w-full">...</Card>
</div>
```

Exceptions: character cards, sidebar (full-bleed by design).
