# React patterns

Keep canonical rules in pure domain modules and writes in commands. Components coordinate
interaction; hooks adapt stores and derive view models. See the [architecture map](architecture-map.md).

## Stable empty-array fallbacks

Use module-level empty arrays when a fallback participates in memo dependencies or memoized props.
A fresh `?? []` inside a computation is harmless; a fresh dependency defeats memoization.

## Key prop for component reset

Use a key when a subtree must reset its local state. Conditional unmounting already resets state;
avoid effects and counters that duplicate that lifecycle.

## Lazy useState initializers for one-time setup

Initialize mount-local derived state with a lazy initializer. Use an effect only when later changes
must update it, with an explicit policy for preserving entered input.

## Large selection lists

`SelectionModal` virtualizes the complete filtered result set with stable item IDs. Search, filters
and virtualizer state stay local; canonical catalogs stay in `gameDataStore`. Incremental batches
must not replace the full virtual range. Use `Number.POSITIVE_INFINITY` for an uncapped category.

## Ref-based dep narrowing for trigger-only effects

An effect that intentionally runs only for a specific trigger may read other current values through
refs. Name the trigger in the exhaustive-dependencies suppression and verify that unrelated store
writes cannot retrigger a mutation loop. This is a narrow safeguard, not a general dependency escape.

## Content page layout

Use `WorkspacePage`, `WorkspacePaneHeader` and `WorkspaceBody` for a flat page with a centered
scrolling content column. `SplitPane` uses container width and separate compact pane selection
and desktop collapse preferences. Selecting details on compact layouts opens its pane without
changing desktop preferences. A collapsed desktop pane reserves zero space.

Use `handleTabListKeyDown` for arrow, Home and End keys, with one tabbable selected tab and
matching tab/panel ARIA relationships. Keep portrait attribution accessible. Portrait pan uses
the card's 360 × 240 logical space and renders as card-relative percentages. Scale the whole
preview uniformly and commit drag changes once at the end.

## Feature controller hooks

Extract one controller per independently changing domain. Controllers own picker/modal state,
invoke pure resolvers and expose command-backed actions; routes arrange sections and shared panes.
`src/pages/build/class/hooks/` provides examples. Type-specific choice presentation comes from the
resolver, preserving complete source-qualified identities rather than interpreting raw data in React.

### Subclass configuration

Group only stable, initial, never-replaced nonrepeatable choices under the exact current subclass
and earned gain. Later, cumulative or regularly changing choices remain independent. Confirmation
may sequence missing setup through the shared modal; visits, refresh and configured reselect do not.
Cancel preserves the subclass and reachable missing choices. Nested setup completes before the next
picker opens. Character, owner, level, variant or catalog changes end a pending sequence.
Readiness requires current subclass resolution; unavailable saved choices retain recovery controls.
Do not add a saved parent/child status mirror.

## Creator steps

The creator uses semantic step IDs for component and validation selection. Ordinal progress comes
from the ordered step metadata. Rules owns the ruleset and variant options and defaults to 5e
Legacy. Sourcebooks owns draft source selection. The wizard and Rules → Additional Content share
the sourcebook browser. Search and filters change the visible list while presets, selected counts
and option availability use the complete catalog. An empty selection of supplemental books is valid.

Create Character and Build share the ability score editor and origin bonus panels. The wizard
adapts those controls to its draft and creates the character after Review. Build applies changes
to the active character through its existing store and provenance commands.

## Rules preview manager

Interactive 5etools content uses `GameContent` and one root `RulesPreviewManager`. Creator triggers
and nested references use the wizard's catalog. Triggers pass immutable descriptors so a pinned
preview survives route changes and virtual row unmounts.

Two transient shells roll forward without moving the shell under the pointer. An explicit pin
action controls the one independent draggable snapshot. Escape closes the newest transient
first and restores focus without reopening the trigger. Ordinary dialogs, menus and listboxes
retain their own focus and Escape behavior.

The creator hosts the stable portal inside its viewport-fixed modal boundary before Radix hides
siblings. Host changes clear transient previews and preserve the pin. Use Floating UI with the
existing collision fallback, hover corridors and fade-only entry. Preview scrolling stays
inside its own shell.

## Spell presentation

Use [spell selection](contracts/spell-selection.md) for selection restrictions and
[spell state](state-management.md#spell-state) for write ownership.
