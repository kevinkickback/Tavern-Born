# Desktop UI Redesign Recommendations

## Purpose

This document defines the desktop-oriented redesign now being implemented for Tavern-Born. It uses Nexus Mods Vortex and Deadlock Mod Manager as comparative references because both solve similar desktop problems: persistent application chrome, deep feature navigation, active profile context, data-heavy screens, and background application state.

The goal is not to reproduce Vortex's appearance, source code, branding, or complete architecture. The useful reference is its separation of application chrome, context, commands, and working content. Tavern-Born should express those principles with its own D&D-focused identity and a simpler structure appropriate to a character manager.

## Executive recommendation

Move Tavern-Born from a centered, card-based web-dashboard layout to a full-window desktop workspace built from four structural regions:

```text
+-----------+----------------------+--------------------------------------+
| Primary   | Context navigation   | Title bar / contextual toolbar      |
| rail      | or item list         +--------------------------------------+
|           |                      |                                      |
|           |                      | Main working pane                    |
|           |                      |                                      |
+-----------+----------------------+--------------------------------------+
| Status strip / background task indicator                              |
+---------------------------------------------------------------------------+
```

The primary rail changes the user's workspace. The contextual pane changes according to that workspace. The toolbar contains commands for the current screen. The main pane holds the actual editing or browsing experience and uses the full available window.

This is the most valuable Vortex-like structural choice for Tavern-Born. It addresses the current app's web-like feel without copying Vortex's styling.

## What Deadlock Mod Manager adds to the reference

Deadlock Mod Manager reinforces the direction already chosen for Tavern-Born while contributing one particularly useful desktop convention: a thin, persistent status bar for application state.

### 1. Keep operational state out of the main toolbar

Deadlock Mod Manager separates profile and launch commands in the top toolbar from connectivity, filesystem, download, update, and readiness state in a bottom bar. Tavern-Born now applies the same general information hierarchy with its own content and denser 24 px geometry.

The implemented Tavern-Born status strip spans the bottom edge to the right of the full-height primary rail, beneath contextual navigation and the workspace. It belongs to the dark outer application shell and shows only real, durable state:

- Game data loading progress and the current resource.
- Background refresh, cached/offline, unconfigured, ready, and error states.
- Active-character saved or unsaved state.
- Local or remote data-source type, with the configured path available on hover.
- Application version when running in Electron.

This strip is deliberately informational. Page commands stay in the workspace toolbar, character commands stay in the header, and transient confirmations remain toasts.

The native platform title bar is replaced by a 32 px application-owned drag surface using the same outer-shell background. Electron's native caption controls remain overlaid on Windows/Linux, preserving minimize, maximize/restore, close, snapping, and platform behavior; macOS retains its native traffic lights through the hidden-inset title-bar mode. The overlay colors follow the app's light/dark appearance setting.

### 2. Group navigation by user task

Deadlock Mod Manager uses labeled navigation groups and count/status badges rather than an undifferentiated icon list. Tavern-Born already follows the useful portion of this convention: stable global workspaces in the primary rail and labeled task groups inside the Start and Build contextual panes.

Badges should be introduced only for actionable state—for example, validation issues in a build section—not as decoration or a count on every destination.

### 3. Preserve one dominant action hierarchy

Deadlock Mod Manager keeps profile context and high-value launch commands in a stable top region while search and filtering live with the collection below. This validates Tavern-Born's separation of active-character context from Characters and Compendium collection controls.

Tavern-Born should retain its current approach: the header describes the active character and exposes Save/Level Up when relevant, while each workspace owns its own search, sort, filters, and collection-local creation actions.

## What Vortex gets right

### 1. It treats the window as a workspace, not a page container

Vortex's modern layout composes a narrow `Spine`, a `Header`, a contextual `Menu`, and a `ModernContentPane` into one edge-to-edge application shell. These are structural regions rather than rounded surfaces floating over a background.

Tavern-Born uses a controlled inversion of that pattern. Primary/context navigation and the status bar sit directly on one dark outer shell, while the page header and working content form one inset focal workspace. The primary rail spans the complete window height through the title and status rows. The inset is structural rather than a dashboard card: it consumes the remaining window, uses only a small gutter and one-pixel boundary, and contains no decorative shadow or marketing presentation. Data and editing screens have no global content-width cap; centered readable widths remain reserved for prose-heavy content such as About, release notes, and documentation.

### 2. It separates global navigation from contextual navigation

Vortex's modern interface has a narrow primary spine and a second menu region. That separation is useful here, although Tavern-Born needs fewer destinations.

Recommended Tavern-Born primary rail:

1. Start
2. Build
3. Character Sheet
4. Compendium

The contextual pane is workspace-specific but remains rendered at a stable width in every workspace:

| Workspace | Context pane |
| --- | --- |
| Start | Characters and Settings. Settings owns its categories as in-page tabs. |
| Build (`Character Core`) | Race, Class, Background, Ability Scores, Proficiencies, Feats, Spells, Equipment |
| Character Sheet | Sheet sections, PDF/export options, validation summary |
| Compendium | Persistent pane; useful browse shortcuts and context will be assigned in a later pass. |

This is clearer than placing the entire information architecture in one large sidebar. It also allows the primary rail to remain stable while the second pane provides the detailed navigation appropriate to the current task.

The contextual pane is now a permanent part of every workspace. Pages that do not yet have meaningful contextual content retain the empty region temporarily rather than changing the shell geometry; future passes should populate it with useful navigation, commands, or summaries without inventing filler. Primary and contextual navigation remain transparent over the same dark shell used by the status bar. The contextual pane has no hard right border or separate header; navigation begins directly at the top of its content row. The primary rail spans the title, content, and status rows, while neither navigation region repeats the application logo or title.

### 3. It gives the active context a first-class place

Vortex keeps the managed game/profile context visible because most commands act on it. Tavern-Born has an equivalent concept: the active character.

The implemented active-character context in the top bar contains:

- The actual character portrait when available, with a restrained fallback when absent.
- Character name.
- Race, total character level, and compact class summary. One or two classes remain visible by name without a tooltip. Three or more are represented semantically as `3 classes`, `6 classes`, and so on; only that condensed form receives a tooltip containing the full class/level breakdown.
- Compact, labeled AC and HP values.

The focal workspace header is 64 px tall. Its left region pairs a larger page title with an even larger matching contextual-navigation icon, while its center enlarges the character portrait, name, class summary, AC, and HP. AC and HP icons remain visually larger than their labels and values. These elements remain deliberately grouped rather than distributed across unrelated header regions.

`Level Up` and `Save` are contextual commands:

- Save remains visible in every workspace and is disabled when no character is loaded or there are no changes to save. The persistent status strip owns the unsaved-state indicator, so the button does not repeat it.
- Level Up appears only in Build, Character Sheet, and related character-editing workspaces and always uses a visible button surface rather than relying on hover to communicate interactivity.

### 4. It uses page primitives rather than bespoke page wrappers

Vortex has been moving screens onto composable Page, PageHeader, PageScroll, and Tabs-style structures. The important idea is that pages share behavior and geometry without every page repeating its own large banner and container markup.

Create equivalent Tavern-Born layout primitives:

- `WorkspacePage`: fills the available pane and owns overflow.
- `WorkspaceToolbar`: compact title, commands, filters, and overflow behavior.
- `WorkspaceBody`: scrollable or fixed working region.
- `MasterDetail`: resizable list/detail split.
- `InspectorPane`: optional right-side details or editing pane.
- `Section`: flat grouping with a heading and separator.
- `EmptyState`: the only place where large centered explanatory presentation is common.

Pages should compose these primitives instead of independently recreating `page-header-band`, `max-w-7xl`, and outer Card structures.

### 5. It treats toolbars as responsive command surfaces

Vortex's recent UI work includes pinned toolbar actions, tooltips, and automatic movement of controls that do not fit into an overflow menu. This is a strong desktop pattern for Tavern-Born.

Each workspace toolbar should distinguish:

- Primary command: the most common action for the current screen.
- Persistent utilities: search, filter, sort, view mode.
- Selection commands: only visible when items are selected.
- Overflow commands: less-common actions in an ellipsis menu.

Do not solve narrow widths by wrapping a toolbar into a second irregular row. Preserve its height and move lower-priority actions into overflow.

Characters and Compendium use an inset command region with 12 px vertical and 16 px horizontal padding. The subtle neutral surface and bottom divider separate page commands from the global title bar without introducing a floating card. Expanded filters remain attached to this region, and result counts sit inside the search fields.

### 6. It supports both guided and expert use

Vortex's product goal is to simplify complex work for new users while retaining control for experienced users. Tavern-Born has the same tension: character creation needs explanation, but repeated explanatory copy slows experienced players.

Recommended approach:

- Keep validation and rules explanations close to the field or choice they affect.
- Put extended rules text in an inspector, disclosure, or tooltip.
- Show a compact completion/issue summary for each build section.
- Provide keyboard-accessible search and command execution.
- Remember pane widths, collapsed sections, filters, and view modes.
- Avoid a separate "advanced mode" until there are genuinely different capabilities to reveal. Progressive disclosure is sufficient for the present app.

### 7. It has a real design-system boundary

Vortex's frontend guidance explicitly calls for semantic design tokens, shared components, small composable feature UI, accessibility roles, and component demos. Tavern-Born already has many Radix/shadcn primitives, but the application layer often styles them ad hoc with long utility strings.

Add an application-level design system above the low-level primitives. It should define:

- Workspace geometry.
- Toolbar and row density.
- Navigation states.
- Surface hierarchy.
- Selection and validation states.
- List, table, and inspector patterns.
- Empty, loading, and error states.

Low-level components such as Button, Select, Dialog, and Tooltip should remain generic. Workspace components should encode Tavern-Born's product-level conventions.

## Choices not to copy from Vortex

### Do not reproduce its full navigation complexity

Vortex manages hundreds of games, profiles, downloads, plugins, extensions, tools, health checks, and account state. Tavern-Born does not need an equally large spine or deeply configurable navigation. Begin with five stable primary workspaces and add destinations only when they represent genuinely different work.

### Do not introduce a customizable dashboard

Vortex's dashlets make sense for a system with downloads, news, managed games, and background operations. Tavern-Born's home screen has a clear primary purpose: choose or create a character. A customizable widget dashboard would add complexity and recreate the card-heavy problem.

### Do not copy its visual identity

Avoid importing Vortex's colors, industrial styling, icons, spacing values, or layouts verbatim. Tavern-Born should retain a restrained fantasy identity through its accent palette, illustrations, character portraits, and occasional display typography.

The same applies to Deadlock Mod Manager's cream palette, branded serif chrome, mod-card presentation, and game-launch controls. Those are product-specific choices, not a Tavern-Born theme direction.

### Do not copy implementation code

Both projects use GPL-3.0, but this redesign should still be independently implemented. The reference should remain at the level of common desktop interaction and information-architecture patterns. Do not copy Vortex assets, component source, or branded visual details.

### Do not overbuild extension architecture

Vortex's feature registration and extension model are central to its product. Tavern-Born should use ordinary route and workspace configuration unless third-party extensibility becomes a real product requirement.

## Proposed Tavern-Born shell

### Primary rail

- Width: 64 px.
- Edge-to-edge, square structural surface.
- Icon plus tooltip for each primary workspace.
- Each workspace target uses a clearly visible but neutral one-pixel outline so neighboring icons read as distinct controls. Hover strengthens the neutral outline, while the selected item replaces it with the accent edge and subtle filled background.
- Application settings belong to the Start contextual pane instead of consuming a primary workspace slot.
- Avoid nested controls and decorative separators.

### Context pane

- Default width: 208-240 px.
- Resizable where item names benefit from additional width.
- Permanently visible so workspace geometry and navigation location remain stable.
- Contains navigation, searchable lists, or filters, depending on workspace.
- Uses compact 32-40 px rows.
- Uses group labels and dividers rather than cards.

### Title and command surfaces

- The unbranded Electron drag surface is 32 px tall and flush to the window.
- The inset focal workspace header is 64 px tall.
- Left: larger current-page title with the matching navigation icon.
- Center: enlarged active-character portrait, name, race/class/level summary, AC, and HP.
- Right: vertically centered Level Up where relevant and an always-present Save control.
- The focal header and page canvas form one continuous surface, so the header has no bottom divider. Page inset, pane borders, and local pane headers establish the content hierarchy without adding another full-width line.

### Main pane

- Takes all remaining width and height.
- Page content is normally left-aligned and full-width.
- Owns its scrolling explicitly; avoid nested page-level scrolling unless using list/detail panes.
- Does not use a global background texture.

### Status strip

- Height: 24 px.
- Flush to the bottom of the window without an additional top divider.
- Left: game-data readiness/loading/error state and active-character save state.
- Right: configured source type and application version.
- Long details such as a source path or error message are available on hover instead of expanding the strip.
- Future import, export, PDF generation, and update progress may temporarily replace lower-priority status items while active.

## Visual system changes

### Density

Create a density system independently from the existing UI scale. UI scale enlarges everything; density determines how much information fits in a workspace.

The implementation uses `rem` for typography, controls, pane headers, rows, spacing, and shell geometry. The existing 80–120% Interface Scale preference changes the root font size and therefore remains the single authoritative scale control. One-pixel borders and other intentionally physical separators do not scale. Do not introduce a second transform-based zoom or page-specific scale multiplier.

Recommended default targets:

| Element | Target |
| --- | --- |
| Draggable title surface | 32 px |
| Focal workspace header | 64 px |
| Toolbar | 40-44 px |
| Standard control | 32-36 px |
| Compact row | 32 px |
| Comfortable row | 40 px |
| Primary rail | 64 px |
| Base spacing grid | 4 px |
| Common content gap | 8 or 12 px |

An optional Compact/Comfortable density preference can be added later. Do not conflate it with 80-120% interface scaling.

### Readability and interaction affordances

- Readability takes priority over maximizing information density. Prefer a comfortable row or a small amount of scrolling over cramped controls, compressed prose, or visually noisy metadata.
- Body and rules text should normally be at least 14 px with a relaxed line height. Reserve 11-12 px text for short labels, badges, counts, and secondary metadata rather than descriptions or instructions.
- Use whitespace, alignment, and restrained dividers to establish groups before adding borders, fills, icons, or decorative containers.
- Interactive targets should generally be at least 32 px high and must have visible hover and keyboard-focus states.
- Explicit commands and editable choices—buttons, segmented options, removable selections, and similar controls—must use the pointer cursor when enabled. Inspect-only rows and score/feat surfaces may retain the default cursor when clicking only changes the adjacent details pane; their persistent selected state and keyboard focus must still make that relationship clear. Disabled controls must never imply clickability.
- When hover changes an inspector, the entire visually grouped row or entity must own that hover behavior; do not restrict the response to an unexpectedly small sub-element such as its name.
- Selection and hover are distinct states. Selection persists after the pointer leaves; hover may preview a different item, but the styling must make that temporary relationship clear.

### Settled workspace conventions

These conventions capture the detailed adjustments made during the completed redesign passes and are the default for every page converted afterward:

- Give redesigned pages a 12 px outer inset. In split workspaces, frame each working pane independently with a rounded one-pixel border and separate visible panes with a 12 px gap. Collection and navigation panes use `--workspace-pane`; rules and inspector panes use `--workspace-detail`. Both remain distinct from `--workspace-canvas` and the darker `--app-shell`. Do not propagate extra structural surfaces into nested entity cards or controls. Do not let page content crowd the application header or status strip.
- Use matching 44 px pane headers. Inspector headers describe the pane (`Race details`, `Feat details`, `Ability details`) and do not repeat the currently selected entity; the entity name belongs in the inspector content heading.
- Use `--workspace-master-width: clamp(24rem, 34%, 42rem)` for either a left master pane or a right inspector. The side may change, but comparable panes should remain aligned across pages.
- Give each pane one explicit scroll owner. Fixed headers, pane-local search, command strips, and the Sources footer remain outside the scrolling content region.
- Pane-local search belongs directly beneath the pane header. Page-wide toolbars are reserved for controls that affect the whole workspace.
- Prefer one neutral pane canvas and spacing between real rows over alternating grid-cell fills. Empty cells or uneven final columns must disappear into the canvas rather than resembling selected entries.
- Use restrained fills for selected, granted, warning, and unavailable states; balance their apparent brightness so one passive state does not overpower another. Do not add a second hover or selection border when spacing, fill, and focus already communicate state.
- Whole-row inspection is click/keyboard selected and persistent unless a page explicitly benefits from temporary hover preview. Hovering only an entity name must never be the sole way to update an inspector.
- Keep related rows and collection-local actions in the same padded stack. A dashed add/import/create tile uses the same width, inset, radius, background, and vertical gap as its neighboring entities; it must not gain an extra divider or wrapper surface.
- Optional collections use state-aware creation placement. When empty, show one restrained centered empty state with a meaningful icon, a concise explanation of the feature, and a conventional labeled button. Once the collection contains entries, move the add command to the section header's trailing edge and let the entries occupy the content stack. Do not retain a large add tile beneath an already populated collection unless creation itself is a peer item, as on the Characters page.
- Keep ordinary descriptive text at a comfortable reading size and line height. Small uppercase text is reserved for pane headings, short metadata, counts, and badges.
- Use at least 32 px action targets; destructive row actions use a 36 px target where space permits. Only the actionable subcontrol receives the pointer cursor when the surrounding entity is inspect-only.
- Preserve a compact Sources footer on data-derived build pages. Avoid repeating full provenance in every row when the footer and inspector already communicate it.

### Radius

- Structural panes: 0 px.
- Inputs and buttons: 4-6 px.
- Small popovers and menus: 6-8 px.
- Dialogs and meaningful cards: 8-10 px.
- Pills only for tags, statuses, and counts.
- Circular shapes only for avatars, radio controls, and icon-only actions that conventionally use them.

### Elevation

- Structural panes and content sections: no shadow.
- Selected rows and inline panels: color and border only.
- Popovers, menus, tooltips, dialogs, and dragged items: shadow permitted.
- Avoid `shadow-sm` as a default component treatment.

### Color and texture

- Use three principal neutral surfaces: application base, navigation, and working pane.
- Use one-pixel borders to establish hierarchy.
- Remove the dotted main-pane texture.
- Remove gradients from ordinary section headers and metric panels.
- Reserve the accent color for selection, focus, primary commands, and important state.
- Reserve semantic colors for warnings, errors, success, and informational status.

The surface hierarchy is implemented as semantic roles rather than page-specific colors:

| Role | Purpose |
| --- | --- |
| `--app-shell` | Title surface, navigation regions, and status chrome outside the focal workspace |
| `--workspace-canvas` | Main inset content window and page canvas |
| `--workspace-pane` | Collection, navigator, progression, or editing pane |
| `--workspace-detail` | Inspector and rules-detail pane, one neutral step above the collection pane |
| `--surface-raised` | Headers, table headings, controls, and locally raised sections |
| `--surface-hover` | Neutral transient hover state |
| `--surface-selected` | Persistent accent-derived selection state |
| `--border-subtle/default/strong` | Internal grouping, pane structure, and emphasized shell/control boundaries |

Neutral surface roles derive only from the active light/dark neutral scale. Selection, focus, and primary actions derive from the complete user-selected accent scale, so Blue, Violet, Grove, and Crimson retain equivalent hierarchy rather than relying on blue-specific utilities. Adjacent workbench panes must use `--workspace-pane` and `--workspace-detail`; sidebar translucency is not a substitute for a content-surface role.

### Typography

- Use the system sans-serif for application chrome, page titles, panels, tabs, forms, and tables.
- Keep Cinzel for the Tavern-Born brand, character names, and rare thematic moments.
- Standard page titles should be approximately 20 px rather than oversized display headings.
- Use tabular numerals for scores, modifiers, levels, currency, armor class, hit points, and other aligned values.
- Use the shared caption, label, body, pane-title, and page-title roles. Ordinary instructions and rules prose use the body role with a relaxed line height; caption text is limited to short metadata, badges, counts, status text, and uppercase structural labels.

### Iconography

- Use one icon family and consistent weights in application chrome.
- Prefer regular or medium-weight interface icons over duotone decorative icons.
- Keep class/race/fantasy illustrations within content, not utility navigation.
- Every icon-only command requires a tooltip and accessible name.

## Page-specific recommendations

### Characters

- Characters is the first destination in the permanent Start contextual pane, alongside application settings destinations.
- The inset command region contains only collection utilities: search, sort, group, result count, and Gallery/List selection.
- Gallery view retains portrait-rich entity cards; List view uses compact data rows.
- New Character and Import live inside the collection instead of the toolbar. Gallery uses a rounded, dashed, two-part action tile with New Character on top and Import below. Each half has an independent styling hook for optional future background artwork.
- List and grouped views use a compact creation/import action row.
- Export and Delete use an overflow menu in List view; bulk operations appear in a temporary selection toolbar.
- Active-character state uses an accent edge and status label. The selected view mode is persisted.

### Build workspace

- Use the context pane as a persistent build outline.
- Give every section a completion state: complete, incomplete, warning, or error.
- Keep the main pane focused on the current decision.
- Use a right inspector for rules text and source provenance when helpful.
- Keep previous/next navigation compact and sticky rather than embedding another large card footer.
- Preserve direct navigation; do not force a linear wizard after initial character creation.

### Race, class, and background

Use a selection/configuration layout for choice-driven pages:

```text
Searchable options | Configuration and rules canvas
```

- Option lists should be rows, not cards.
- Search fields for a master list belong directly in that pane's header; do not reserve a page-wide toolbar for a control that filters only the left pane.
- Do not force the navigator and configuration canvas into one shared bordered card. Frame each region independently with a restrained one-pixel boundary, separate them with a 12 px workspace gap, and let the larger canvas read as the primary task surface. This preserves clear containment without returning to one oversized card.
- Move controls for the selected option out of dense list rows and into a persistent configuration strip at the top of the canvas.
- Constrain long rules prose to approximately 72 characters while allowing compact summary data to use the wider content measure.
- The selected option may receive a richer summary header.
- Related traits should use flat sections or a compact table.
- Collapse the inspector when window width is constrained.

### Ability scores and proficiencies

- Treat ability values as editable data, not six independent decorative cards.
- Use a compact score grid or table with aligned score, base, bonus, modifier, and source columns.
- Keep method selection in a segmented control or toolbar.
- Use inline validation and a persistent remaining-points/status summary.
- Present proficiencies as grouped checkable rows with origin/source information in a secondary column.

### Feats and spells

- Use a dense searchable list or table as the primary browsing surface.
- Open the selected feat or spell in a right inspector or detail pane.
- Keep prepared/known/selected state visible as a column and support multi-selection where rules allow it.
- Place spell-profile switching in the toolbar or context pane.
- Avoid a separate rounded container for every spellcasting fact.

### Equipment

- Use the standard inset, independently framed collection/inspector workbench: Inventory on the left and Item details on the right.
- Keep weight, encumbrance, attunement, armor class, and editable currency in one compact horizontally resilient summary strip rather than separate dashboard cards.
- Present equipment as a searchable, category-filtered table-like list with stable columns for quantity, equipped state, attunement, and removal.
- Selecting an item's identity region opens its full statistics in the inspector; embedded row controls remain independent and retain their existing behavior.
- Preserve the add-item modal, restriction override, onboarding hint, source attribution, attunement limits, and armor-class calculation.

### Compendium

Compendium is the implemented master-detail reference screen.

- The permanent contextual pane is currently empty; a later pass should add useful browse shortcuts or context without duplicating the Results master pane.
- The inset command region contains the prominent search field, result count, filter toggle, and expanded type/source filters.
- Filters default to open and their open/closed state is persisted independently from sidebar state.
- The results pane uses dense rows with type, source, and preview metadata and is wider than the initial pilot width.
- The command region and master-detail workspace use the standard 12 px page inset and matched 44 px pane headers. Results and Entry Details are independently framed with restrained one-pixel borders and a 12 px gap because they have distinct navigation and inspection roles; the search/filter command region remains one toolbar rather than becoming an unnecessary third workbench.
- The detail pane owns its own scrolling and displays the selected entry without a nested structural Card.

### Character sheet and PDF preview

- Treat the character sheet as a document workspace.
- Use toolbar controls for view mode, zoom, export, and print.
- Allow Generated Sheet, PDF Preview, and Validation/Issues as tabs or view modes.
- Keep document controls visually distinct from character editing commands.

### Settings

- Keep Settings as one Start-context destination and one canonical page.
- Switch General, Appearance, Game Data, and About with compact header tabs matching the established Proficiencies category pattern.
- Present settings as flat labeled rows grouped by section headings and separators.
- Keep descriptions concise and adjacent to their controls.
- Retain visual theme previews only where they materially aid the choice.
- Avoid wrapping each settings section in a large Card.

## Desktop interaction recommendations

### Native application menu

The Electron main process currently removes the application menu. Add a platform-appropriate menu:

- File: New Character, Import, Export, Save, Close.
- Edit: Undo, Redo, Cut, Copy, Paste, Select All.
- View: Back, Forward, Toggle Context Pane, Command Palette, Zoom, Full Screen.
- Character: Switch Character, Level Up, Validate, Open Sheet.
- Help: Documentation, Report Issue, Changelog, About.

Use standard platform roles where Electron provides them.

### Keyboard commands

Initial command set:

| Command | Windows/Linux | macOS |
| --- | --- | --- |
| Save | Ctrl+S | Cmd+S |
| New character | Ctrl+N | Cmd+N |
| Open/switch character | Ctrl+O | Cmd+O |
| Command palette | Ctrl+K or Ctrl+Shift+P | Cmd+K or Cmd+Shift+P |
| Global search | Ctrl+F | Cmd+F |
| Toggle context pane | Ctrl+B | Cmd+B |
| Back/forward | Alt+Left/Right | Cmd+Left/Right |

The command palette primitive already exists in the codebase and should become an actual product feature rather than remaining only a low-level component.

### Context menus

Use the existing context-menu primitives on:

- Character cards and rows.
- Compendium results.
- Spells and feats.
- Equipment rows.
- Build selections where reset, replace, inspect source, or copy actions are meaningful.

Context menus must duplicate commands available elsewhere; they should accelerate use, not hide required functionality.

### Background activity and notifications

- Use toasts only for transient confirmation.
- Put actionable or persistent problems in an issue/status center.
- Show import, export, PDF generation, data loading, and updates as durable background tasks when they take noticeable time.
- Avoid repeated success toasts for automatic or continuous work.

## Implementation status and remaining sequence

### Phase 0: Baseline and rules

1. Capture screenshots at representative window sizes and both themes.
2. Add visual regression coverage for the shell and pilot pages.
3. Document surface, density, typography, radius, and elevation rules.
4. Inventory current usages of Card, gradients, shadows, page-header-band, and max-width page wrappers.

Exit criterion: the redesign has measurable rules rather than a collection of one-off restyles.

### Phase 1: Foundations

1. Introduce semantic workspace tokens.
2. Add `WorkspacePage`, `WorkspaceToolbar`, `WorkspaceBody`, `MasterDetail`, `InspectorPane`, and flat `Section` components.
3. Add compact navigation-row and data-row primitives.
4. Change Card so elevation and large spacing are opt-in, or introduce a separate EntityCard and stop using Card structurally.
5. Define responsive toolbar overflow behavior.

Exit criterion: a new screen can be built without assembling its shell from long one-off utility-class strings.

Status: substantially complete. Workspace page, toolbar, body, pane header, master-detail, and flat section primitives are in use. Inspector and generalized toolbar overflow remain future work.

### Phase 2: Application shell

1. Replace the floating header and sidebar with the primary rail, contextual pane, and flush title/command bar.
2. Add the active-character context control.
3. Add the durable application status strip.
4. Keep the contextual navigation width stable across workspaces; page-local master/detail panes retain their own collapse behavior.
5. Remove the global dotted texture.
6. Establish clear overflow ownership for every pane.

Exit criterion: all existing pages run inside the new shell even if their internal layouts remain temporarily unchanged.

Status: complete for the current shell. The full-height 64 px edge-to-edge primary rail, headerless permanent contextual pane, minimal unbranded 32 px draggable title surface, 64 px focal page header, enlarged active-character context, persistent Save command, 24 px operational status strip, and explicit pane overflow are implemented. Start owns Characters and application settings so the primary rail remains focused on major workflows.

### Phase 3: Pilot screens

1. Convert Compendium to the new master-detail pattern.
2. Convert Settings to one tabbed page with flat grouped rows.
3. Validate keyboard navigation, narrow-window behavior, light/dark themes, and scaling.

Exit criterion: the chosen patterns work for both data browsing and forms/preferences.

Status: complete. Compendium is converted, and Settings is consolidated into one canonical page with header-integrated General, Appearance, Game Data, and About tabs; focused regression coverage and production builds validate the current patterns.

### Phase 4: Character and build flow

1. Characters conversion is complete: inset collection utilities, persisted Gallery/List modes, collection-local creation/import actions, and selection workflows.
2. The persistent Build contextual outline is implemented; completion and issue indicators remain to be added.
3. Race, Background, and Class use the approved independently framed workspace. Their navigation/progression and configuration/rules panes use restrained one-pixel borders with a 12 px gap, while the standard left/right collapse controls remain in the top-right of the details pane. Each details header is followed by a stronger selected-entity identity strip with the larger name, source, and page-specific context. Race exposes subrace and racial-feat decisions. Background exposes 2024 ability/feat decisions and starting-equipment choices, using an independently scrollable configuration region when those controls become tall. Class preserves progression as the primary task pane and uses the second pane as an independently framed class/feature inspector; its identity strip shows the active class or feature, source, level, and subclass context. Long rules prose uses a narrower 72-character reading measure where appropriate. Race and Background place their primary search field directly in the navigator header instead of repeating an `Available…` label above it; the compact result count remains visible at the trailing edge. When a character is multiclassed, the Class progression header changes to `Current class` and pairs that context label with the full-name class selector.
   - Class level headers use a warning-colored choice badge while any user decision at that level remains unresolved. Once subclass, ASI/feat, spell, and progression choices are all complete, the badge changes to the success treatment and gains a check mark for at-a-glance scanning.
   - ASI and feat decisions are owned by a specific class, source, and class level. Multiclass characters therefore receive independent Level 4 choices for each eligible class. Legacy unscoped feat selections are migrated in class-progression order to the first unresolved earned ASI slots.
   - Split workbenches must establish an explicit full-height flex viewport so fixed pane headers remain visible and each pane's scroll region receives a bounded height.
   - Redesigned master/list panes and right-side rules inspectors use the shared `--workspace-master-width` token: `clamp(24rem, 34%, 42rem)`. This keeps either pane near one-third of the workbench, allows it to contract on smaller windows, and preserves a practical 24rem floor for selection controls and readable rules text. Race, Background, Class, Ability Scores, Proficiencies, Feats, and future pages migrated to this workbench pattern should opt into the token; untouched legacy pages retain their existing splits until redesigned.
   - Build workbenches use 12 px page padding rather than touching the viewport edges. Independently framed panes with a restrained one-pixel border and 12 px inter-pane gap are the standard for all redesigned split workspaces, including editor/inspector pages. Ability Scores, Proficiencies, Feats, and Spells now use this treatment alongside Race, Background, and Class. Do not manufacture extra workbenches around controls or content that do not have an independent navigation, editing, or inspection role; toolbars and single-purpose canvases remain singular surfaces.
   - Master and detail panes use matching 44 px section headers, with a stronger divider and contrasting navigation surface separating available choices from details. When the pane's purpose is already clear, its primary local control may replace a redundant static title: search for Race/Background, method selection for Ability Scores, and category selection for Proficiencies. Embedded search fields use identical flexible tracks, fixed-width result counters, and optical vertical centering. Header switchers use flat desktop tabs with a bottom-edge active indicator rather than nesting another bordered segmented container inside the header.
   - Build detail panes use `WorkspaceDetailContent` for a universal centered `max-w-4xl` reading width and 20 px content padding. Race, Background, Class, Ability Scores, and future redesigned detail panes must use this wrapper rather than page-specific width rules.
4. Ability Scores uses the inset Build workbench with matched pane headers, independent scrolling, a details inspector using the shared responsive master-pane width, and responsive rounded ability tiles with a conventional one-pixel neutral border. The inspector header remains the static `Ability details` label; the selected ability name appears only in the content heading. Every tile reserves the same 3.25rem control bay, so Point Buy buttons, Standard Array selects, and Custom number inputs never change the tile or grid dimensions when switching methods. Base and bonus metadata occupies a reserved, centered, two-line-capable region so narrow tiles cannot push controls outside their boundary. The score-display area intentionally uses the default cursor; only explicit editing controls use their control-specific cursor. The scoring-method switcher replaces the redundant pane title and stays horizontally scrollable at compact widths. The Point Buy meter remains right-aligned in the content command strip and uses only the explicit `used / budget` value and progress bar. Racial bonuses use a centered `max-w-2xl` bounded control group with a clear heading, concise explanation, centered assignments, and the racial-distribution switcher aligned to the header's trailing edge. Unnecessary dividers between the point meter, tiles, and racial controls are omitted. Sources remains the standard persistent footer pattern.
5. Proficiencies uses the same inset Build workbench and a right-side inspector using the shared responsive master-pane width. Its compact horizontally scrollable category switcher replaces the redundant pane title and retains available-choice counts, while every category always exposes its complete catalog without a separate scope toggle. Every real row uses the full `--surface-raised` neutral background, a comfortable minimum height, and an explicit Chosen, Granted, Available, or Unavailable badge. Neutral hover advances to `--surface-hover`; chosen and granted states retain restrained, brightness-balanced accent and success treatments. Grid shells use the collection-pane background so unused cells disappear rather than resembling selected entries. Only rows that can currently be selected or deselected use the pointer cursor; fixed, unavailable, generic, and inspect-only rows retain the default cursor. Inspector preview and selection add no extra border or ring; keyboard focus owns the accessibility ring. Saving Throws and Armor reserve the same 32px command row and following gap used by sortable categories, keeping every list aligned beneath the header. Sorting, grouping, choices, expertise, specialized tool selectors, provenance, and the persistent Sources footer remain intact.
6. Feats uses an inset list/detail workbench with a right-side rules inspector using the shared responsive master-pane width. The collection header is functional: count-bearing `All`, `Character`, and `Bonus` tabs filter one shared page, while `Needs Setup` appears only when outstanding ASI, racial, origin, or feat-configuration work exists. `All` is the default. Character and Bonus are flat section groups with a heading and divider rather than bordered outer cards; individual feats remain comfortable rounded entity rows. Clicking or keyboard-selecting a feat updates the inspector, while hover and ordinary focus do not replace the current selection. Rows retain the default cursor, only selected feats receive the restrained inset selection treatment, and explicit setup, edit, remove, and add controls use their normal interactive affordances. When Bonus Feats is empty it follows the optional-collection empty-state standard with a lightning icon, concise examples of DM- or item-granted feats, and a conventional `Add Bonus Feat` button. Once populated, the add command moves to the section header and the content region contains only feat rows. Pending work shares one restrained issue region, while Sources remains pinned below the independently scrolling list.
7. Spells uses the same inset collection/inspector workbench and responsive right-side width. Its collection header provides count-bearing `All`, `Class`, `Racial`, and `Bonus` filters over one shared page, with `All` as the default. Spell profiles remain collapsible but are flat section groups: the profile trigger is a simple divider-backed heading, not a rounded bordered outer card. Spell levels remain bounded collections because that hierarchy materially improves scanning; each uses one rounded structural border, neutral header, responsive gap-pixel grid, comfortable 44px rows, and separators only around real entries. Because spell names provide complete pinnable rules tooltips, rows do not duplicate spell descriptions or add a second inspector selection model. The static `Spellcasting details` pane remains reserved for compact casting statistics and slot summaries. Profile totals count every displayed row, including the available class list for true prepared casters. Subclass grants remain within their parent class profile, carry source attribution, and respect fixed/always-prepared behavior. Bonus Spells follows the optional-collection pattern: the empty profile presents an icon, concise explanation, and normal add button; after spells exist, the add command moves to the profile section's trailing action region. Racial selection, bonus selection, known/prepared limits, swaps, removal, preparation, tooltips, and Sources remain functional.
8. Equipment now uses the standard inset collection/inspector workbench and responsive right-side width. Four oversized summary cards and the nested inventory card have been replaced by a compact horizontal character-equipment strip plus a flat, searchable inventory table. Weight and encumbrance, attunement usage, derived armor class, and editable denomination fields remain continuously visible without dominating the workspace. Category tabs and search sit directly above the independently scrolling list. Each row retains quantity editing, equip and attune switches, restriction handling, and removal, while its item-identity control selects a structured rules inspector without turning the row's embedded controls into one ambiguous click target. The add-item modal, onboarding hint, restriction override, provenance footer, attunement limits, and armor calculations remain intact. Narrow workspaces allow the data table and summary strip to scroll horizontally rather than clipping controls.

Exit criterion: the complete character-building workflow no longer depends on nested structural cards.

### Phase 5: Data-heavy workspaces

1. Equipment is converted to a compact table and item inspector while retaining all inventory-management behavior.
2. Spells and Feats are converted to dense list/detail layouts; complete representative visual validation before closing the phase.
3. Convert Character Sheet and PDF preview to a document workspace.

Exit criterion: large collections remain usable without excessive scrolling or visual noise.

### Phase 6: Desktop integration and polish

1. Add the native application menu and accelerators.
2. Add the command palette and command registry.
3. Add context menus and selection toolbars.
4. Add background-task and persistent-issue presentation.
5. Tune focus states, keyboard traversal, reduced motion, and screen-reader semantics.

Exit criterion: desktop behavior supports the visual redesign rather than merely resembling it.

## Known issues

- Proficiencies: a second readability-focused pass now provides explicit shared states and an always-visible complete catalog across every category. Keep it marked for final visual validation until it has been reviewed in the running desktop application at representative window sizes.

## Suggested code ownership

Recommended new application-level structure:

```text
src/
  components/
    workspace/
      AppShell.tsx
      PrimaryRail.tsx
      ContextPane.tsx
      TitleBar.tsx
      CharacterContext.tsx
      WorkspacePage.tsx
      WorkspaceToolbar.tsx
      WorkspacePaneHeader.tsx
      WorkspacePaneSearch.tsx
      MasterDetail.tsx
      InspectorPane.tsx
      Section.tsx
  commands/
    commandRegistry.ts
    applicationCommands.ts
    characterCommands.ts
  navigation/
    workspaceConfig.ts
    buildNavigation.ts
```

The existing low-level `components/ui` directory should continue to own generic controls. Product structure and workflow conventions should live under `components/workspace` rather than being added to Card, Button, or other generic primitives.

## Acceptance criteria

The redesign should be considered successful when:

- Navigation and status chrome remain edge-to-edge, while the header and page content form one restrained inset focal workspace rather than multiple card-like shell containers.
- Core pages use the full available desktop window.
- A user can always identify the active character and current workspace.
- Search, filter, selection, and commands occupy predictable workspace-specific locations; entity creation may live in the collection when that is the clearer context.
- Lower-priority commands move into overflow instead of wrapping or disappearing.
- Cards are used mainly for actual entities or optional gallery presentation.
- Data-heavy screens provide list/table views with keyboard navigation.
- All primary actions are accessible through visible UI and the command system.
- Save, navigation, and common creation actions have keyboard shortcuts.
- Pane sizes, view modes, and filters persist where useful.
- Light and dark modes preserve the same surface hierarchy.
- The interface remains usable at the supported UI scales and at compact desktop window sizes.
- Fantasy styling remains recognizable but does not reduce utility or density.

## Reference material

Primary Vortex sources reviewed:

- [Vortex repository and product goals](https://github.com/Nexus-Mods/Vortex)
- [Modern layout composition](https://github.com/Nexus-Mods/Vortex/blob/master/src/renderer/src/views/layout/ModernLayout.tsx)
- [Layout component structure](https://github.com/Nexus-Mods/Vortex/tree/master/src/renderer/src/views/layout)
- [Frontend design-system and accessibility guidance](https://github.com/Nexus-Mods/Vortex/blob/master/AGENTS-FRONTEND.md)
- [Vortex releases and recent UI changes](https://github.com/Nexus-Mods/Vortex/releases)
- [Vortex changelog](https://github.com/Nexus-Mods/Vortex/blob/master/CHANGELOG.md)

Primary Deadlock Mod Manager sources reviewed:

- [Deadlock Mod Manager repository](https://github.com/deadlock-mod-manager/deadlock-mod-manager)
- [Desktop application screenshot](https://github.com/deadlock-mod-manager/deadlock-mod-manager/blob/main/docs/assets/deadlock-mod-manager.png)
- [Grouped, collapsible application sidebar](https://github.com/deadlock-mod-manager/deadlock-mod-manager/blob/main/apps/desktop/src/components/layout/app-sidebar.tsx)
- [Profile and application-command toolbar](https://github.com/deadlock-mod-manager/deadlock-mod-manager/blob/main/apps/desktop/src/components/layout/toolbar.tsx)
- [Operational bottom status bar](https://github.com/deadlock-mod-manager/deadlock-mod-manager/blob/main/apps/desktop/src/components/layout/bottom-bar.tsx)

Relevant Tavern-Born implementation areas:

- `src/components/layout/AppLayout.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/SplitPane.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/context-menu.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/styles/index.css`
- `src/styles/main.css`
- `electron/main.ts`
