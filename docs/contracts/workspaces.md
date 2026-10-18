# Workspace layouts and portrait presentation

Read this reference only when changing this contract. Start with the [topic index](../README.md).

Workbench-style pages use `WorkspacePage` as the flat parent surface. If a page has functional tabs or controls, place them in a full-width `WorkspacePaneHeader`, then put the scrolling content in `WorkspaceBody` with a centered max-width inner container.

List/detail workspaces use the shared `SplitPane`. Give both compact panes concise, page-specific
labels. Below the shared container breakpoint, `SplitPane` shows one full-width pane at a time;
selection handlers that reveal details should control `compactPane` and select the right pane without
changing the desktop `leftCollapsed` or `rightCollapsed` preferences. Toolbars inside a pane should
respond to their own container width rather than the application viewport.
On desktop, a collapsed pane must be removed from flex sizing (`flex-none` at zero width), allowing
the visible pane to fill the workspace rather than leaving an invisible reserved column.

Character Rules and Conditions are the reference tabbed pages. Their parent remains flat while each
meaningful section may use its own bordered card. The Additional Content page is the reference for
a flat configuration panel with controls placed directly inside its constrained content area. Avoid
wrapping the entire content area in a second card unless the page intentionally uses the
dual-pane/workbench pattern.

Hand-built page tab bars use `handleTabListKeyDown` for arrow, Home, and End navigation. Only the
selected tab has `tabIndex=0`; each tab's `aria-controls` and the active panel's `aria-labelledby`
must refer to each other.

Use the shared `Button` `accentOutline` variant for compact edit/configure affordances that lead to
an existing setup workflow. It provides an accent border and text without a filled resting state.
Incomplete or destructive actions retain their warning/destructive semantic variants instead of
using `accentOutline`.

Settings and Compendium retain their established route-specific containers. Character cards and the sidebar remain full-bleed by design.
The About panel keeps the Settings width and normal text sizes. Compact metadata, two-column PDF
credits, and paired Built With/Links sections reduce its height on desktop; narrow windows stack
these groups and retain normal scrolling. Attribution categories start collapsed and expand on demand.
Links from PDF pages open the relevant credits automatically; complete attribution text and creator
links remain available inside the sections.

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
