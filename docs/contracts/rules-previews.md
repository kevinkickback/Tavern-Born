# Shared rules previews

Read this reference only when changing this contract. Start with the [topic index](../README.md).

The shared manager is the required integration boundary for equivalent creator/app previews.
Creator race/class feature buttons use the same manager for the outer feature and its descendants.
They and the Background step pass the wizard's lookup explicitly, so a different active character's
books do not determine draft details. `RulesPreviewButton` shares root pointer/keyboard behavior
with spell-name triggers; `GameContent` continues to delegate generated inline references.

Shared rules-entry and spell-name previews use the single `RulesPreviewManager` mounted at the
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

`RulesPreviewManager` owns one stable portal root, normally at `document.body`. It supplies
shared dialogs with the portal container and identifies preview surfaces as part of the active
interaction. Ordinary shared dialogs portal into this root so modal accessibility hiding can
target individual surfaces. The creator's own dialog stays at the body to avoid an ancestor
cycle. Its `DialogContent.viewportPortalHostRef` moves that root into a viewport-fixed host inside the Radix
modal's focus/scroll boundary. Opted-in content uses transform-free centering and fade-only entry so
fixed preview coordinates stay relative to the viewport. Registration moves the root before Radix
hides siblings. Leaving the host returns it to the body; changing hosts clears only transient chains.
Pinned descriptors and shells remain the same snapshots, including their scroll and drag state.
An unrelated nested discard dialog still owns focus and Escape above the creator. Escape from
preview content closes its chain/pin and returns to a connected trigger without reopening it through
the trigger's focus handler. Escape from a normal dialog, listbox or menu retains that overlay's
behavior and leaves an independent pin intact.

Floating UI owns measured anchoring,
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
