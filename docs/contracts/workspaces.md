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

Hand-built page tab bars use `handleTabListKeyDown` for arrow, Home, and End navigation. Only the
selected tab has `tabIndex=0`; each tab's `aria-controls` and the active panel's `aria-labelledby`
must refer to each other.

Keep complete attribution and creator links accessible from Settings and PDF credit links.

Portrait pan values use the character card's 360 x 240 logical coordinate space. Convert those
values to card-relative percentages in the shared frame renderer so the portrait editor preview
and finished card retain the same crop at different responsive widths. Do not apply persisted pan
values directly as viewport pixels. Keep slider drag values local to the portrait editor and write
the completed transform to the character store on commit; validating the full character on every
pointer movement makes large uploaded portraits visibly stall. Preview the entire card in that logical space and scale it uniformly, preserving responsive crop
and readable editor controls.
