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

The implemented Tavern-Born status strip shows only real, durable state:

- Game data loading progress and the current resource.
- Background refresh, cached/offline, unconfigured, ready, and error states.
- Active-character saved or unsaved state.
- Local or remote data-source type, with the configured path available on hover.
- Application version when running in Electron.

This strip is deliberately informational. Page commands stay in the workspace toolbar, character commands stay in the header, and transient confirmations remain toasts.

### 2. Group navigation by user task

Deadlock Mod Manager uses labeled navigation groups and count/status badges rather than an undifferentiated icon list. Tavern-Born already follows the useful portion of this convention: stable global workspaces in the primary rail and labeled task groups inside the Build and Settings contextual panes.

Badges should be introduced only for actionable state—for example, validation issues in a build section—not as decoration or a count on every destination.

### 3. Preserve one dominant action hierarchy

Deadlock Mod Manager keeps profile context and high-value launch commands in a stable top region while search and filtering live with the collection below. This validates Tavern-Born's separation of active-character context from Characters and Compendium collection controls.

Tavern-Born should retain its current approach: the header describes the active character and exposes Save/Level Up when relevant, while each workspace owns its own search, sort, filters, and collection-local creation actions.

## What Vortex gets right

### 1. It treats the window as a workspace, not a page container

Vortex's modern layout composes a narrow `Spine`, a `Header`, a contextual `Menu`, and a `ModernContentPane` into one edge-to-edge application shell. These are structural regions rather than rounded surfaces floating over a background.

Tavern-Born currently does the opposite at its outermost level:

- The header is an inset, rounded, translucent card with a border and shadow.
- The sidebar is another floating, rounded card.
- Pages are generally centered inside `max-w-7xl` containers.
- Large page introductions consume vertical space before the work begins.
- The dotted page texture reinforces the feeling that panels sit on a web canvas.

Recommended adaptation:

- Attach the application rail, navigation pane, header, and content pane directly to the window edges.
- Separate structural regions with background tone and one-pixel dividers, not shadows or large radii.
- Remove global content width caps from data and editing screens.
- Reserve centered readable widths for prose-heavy content such as About, release notes, and documentation.

### 2. It separates global navigation from contextual navigation

Vortex's modern interface has a narrow primary spine and a second menu region. That separation is useful here, although Tavern-Born needs fewer destinations.

Recommended Tavern-Born primary rail:

1. Characters
2. Build
3. Character Sheet
4. Compendium
5. Settings

The contextual pane is workspace-specific and is only rendered when it contains meaningful navigation:

| Workspace | Context pane |
| --- | --- |
| Characters | None. The collection itself is the navigation surface. |
| Build | Race, Class, Background, Ability Scores, Proficiencies, Feats, Spells, Equipment |
| Character Sheet | Sheet sections, PDF/export options, validation summary |
| Compendium | None. The results master pane is the navigation surface. |
| Settings | General, Appearance, Game Data, About |

This is clearer than placing the entire information architecture in one large sidebar. It also allows the primary rail to remain stable while the second pane provides the detailed navigation appropriate to the current task.

Do not keep a contextual pane merely to repeat a single route or hold commands. Characters and Compendium deliberately omit it, reclaiming the width for their collection and master-detail layouts. Where a contextual pane exists, it is collapsible and its preference is remembered.

### 3. It gives the active context a first-class place

Vortex keeps the managed game/profile context visible because most commands act on it. Tavern-Born has an equivalent concept: the active character.

The implemented active-character context in the top bar contains:

- The actual character portrait when available, with a restrained fallback when absent.
- Character name.
- Race/class/level summary.
- Compact, labeled AC and HP values.

The header is 56 px tall so the portrait, name, class summary, AC, and HP remain readable without becoming a second content panel. These elements are grouped at the center of the title bar with deliberate spacing rather than distributed across unrelated header regions.

`Level Up` and `Save` are contextual commands:

- Save appears as a prominent action only while changes are pending. The persistent status strip owns the unsaved-state indicator, so the button does not repeat it.
- Level Up appears only in Build, Character Sheet, and related character-editing workspaces.

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

- Width: 48-56 px.
- Edge-to-edge, square structural surface.
- Icon plus tooltip for each primary workspace.
- Selected item uses an accent edge and subtle filled background.
- Settings and help can sit at the bottom.
- Avoid nested controls and decorative separators.

### Context pane

- Default width: 208-240 px.
- Resizable where item names benefit from additional width.
- Collapsible to the primary rail.
- Contains navigation, searchable lists, or filters, depending on workspace.
- Uses compact 32-40 px rows.
- Uses group labels and dividers rather than cards.

### Title and command bar

- Height: 56 px.
- Flush to the window; it can also provide the Electron drag region.
- Left: current page title or back/breadcrumb control.
- Center: enlarged active-character portrait, name, race/class/level summary, AC, and HP.
- Right: only commands relevant to the current workspace and state.
- Use a single bottom divider instead of a rounded border and shadow.

### Main pane

- Takes all remaining width and height.
- Page content is normally left-aligned and full-width.
- Owns its scrolling explicitly; avoid nested page-level scrolling unless using list/detail panes.
- Does not use a global background texture.

### Status strip

- Height: 24 px.
- Flush to the bottom of the working region with a one-pixel top divider.
- Left: game-data readiness/loading/error state and active-character save state.
- Right: configured source type and application version.
- Long details such as a source path or error message are available on hover instead of expanding the strip.
- Future import, export, PDF generation, and update progress may temporarily replace lower-priority status items while active.

## Visual system changes

### Density

Create a density system independently from the existing UI scale. UI scale enlarges everything; density determines how much information fits in a workspace.

Recommended default targets:

| Element | Target |
| --- | --- |
| Title bar | 56 px |
| Toolbar | 40-44 px |
| Standard control | 32-36 px |
| Compact row | 32 px |
| Comfortable row | 40 px |
| Primary rail | 48-56 px |
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

- Give redesigned pages a 12 px outer inset and place their working panes inside one rounded, one-pixel bordered workbench. Do not let page content crowd the application header or status strip.
- Use matching 44 px pane headers. Inspector headers describe the pane (`Race details`, `Feat details`, `Ability details`) and do not repeat the currently selected entity; the entity name belongs in the inspector content heading.
- Use `--workspace-master-width: clamp(24rem, 34%, 42rem)` for either a left master pane or a right inspector. The side may change, but comparable panes should remain aligned across pages.
- Give each pane one explicit scroll owner. Fixed headers, pane-local search, command strips, and the Sources footer remain outside the scrolling content region.
- Pane-local search belongs directly beneath the pane header. Page-wide toolbars are reserved for controls that affect the whole workspace.
- Prefer one neutral pane canvas and spacing between real rows over alternating grid-cell fills. Empty cells or uneven final columns must disappear into the canvas rather than resembling selected entries.
- Use restrained fills for selected, granted, warning, and unavailable states; balance their apparent brightness so one passive state does not overpower another. Do not add a second hover or selection border when spacing, fill, and focus already communicate state.
- Whole-row inspection is click/keyboard selected and persistent unless a page explicitly benefits from temporary hover preview. Hovering only an entity name must never be the sole way to update an inspector.
- Keep related rows and collection-local actions in the same padded stack. A dashed add/import/create tile uses the same width, inset, radius, background, and vertical gap as its neighboring entities; it must not gain an extra divider or wrapper surface.
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

### Typography

- Use the system sans-serif for application chrome, page titles, panels, tabs, forms, and tables.
- Keep Cinzel for the Tavern-Born brand, character names, and rare thematic moments.
- Standard page titles should be approximately 16-18 px rather than 24 px display headings.
- Use tabular numerals for scores, modifiers, levels, currency, armor class, hit points, and other aligned values.

### Iconography

- Use one icon family and consistent weights in application chrome.
- Prefer regular or medium-weight interface icons over duotone decorative icons.
- Keep class/race/fantasy illustrations within content, not utility navigation.
- Every icon-only command requires a tooltip and accessible name.

## Page-specific recommendations

### Characters

- The page uses no contextual pane and no outer structural Card.
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

Use a master-detail-inspector layout:

```text
Searchable options | Selection details and choices | Rules/source inspector
```

- Option lists should be rows, not cards.
- Search fields for a master list belong inside that pane, immediately below its header; do not reserve a page-wide toolbar for a control that filters only the left pane.
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

- Replace the four prominent summary cards with a compact summary strip.
- Use a table for inventory with sortable columns, selection, context actions, and keyboard navigation.
- Open item details in an inspector rather than expanding multiple nested cards.
- Keep encumbrance visible as a restrained status meter.
- Make currency editable in a compact aligned group.

### Compendium

Compendium is the implemented master-detail reference screen.

- It has no contextual pane; the wider results pane already provides contextual navigation.
- The inset command region contains the prominent search field, result count, filter toggle, and expanded type/source filters.
- Filters default to open and their open/closed state is persisted independently from sidebar state.
- The results pane uses dense rows with type, source, and preview metadata and is wider than the initial pilot width.
- The command region and master-detail workbench use the same 12 px page inset, rounded border, matched 44 px pane headers, stronger master divider, and contrasting selection surface as the Race screen.
- The detail pane owns its own scrolling and displays the selected entry without a nested structural Card.

### Character sheet and PDF preview

- Treat the character sheet as a document workspace.
- Use toolbar controls for view mode, zoom, export, and print.
- Allow Generated Sheet, PDF Preview, and Validation/Issues as tabs or view modes.
- Keep document controls visually distinct from character editing commands.

### Settings

- Use the contextual pane for categories instead of a wide horizontal tab row.
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
4. Add navigation state persistence and pane collapse/resize behavior.
5. Remove the global dotted texture.
6. Establish clear overflow ownership for every pane.

Exit criterion: all existing pages run inside the new shell even if their internal layouts remain temporarily unchanged.

Status: complete for the current shell. The edge-to-edge rail, conditional contextual pane, 56 px title bar, active-character context, 24 px operational status strip, persisted collapse state, and explicit pane overflow are implemented.

### Phase 3: Pilot screens

1. Convert Compendium to the new master-detail pattern.
2. Convert Settings to a contextual category pane and flat grouped rows.
3. Validate keyboard navigation, narrow-window behavior, light/dark themes, and scaling.

Exit criterion: the chosen patterns work for both data browsing and forms/preferences.

Status: complete. Compendium and Settings are converted; focused regression coverage and production builds validate the current patterns.

### Phase 4: Character and build flow

1. Characters conversion is complete: inset collection utilities, persisted Gallery/List modes, collection-local creation/import actions, and selection workflows.
2. The persistent Build contextual outline is implemented; completion and issue indicators remain to be added.
3. Race is the reference Build master-detail screen. Class and Background now use the same inset workbench, matched pane headers, contrasting master surfaces, compact collapse controls, and flat outer structure. Race and Background place their primary search field directly in the master-pane header instead of repeating an `Available…` label above it; the compact result count remains visible at the trailing edge. When a character is multiclassed, the Class progression header changes to `Current class` and pairs that context label with the full-name class selector. Background's 2024 origin ability and feat choices remain in a compact contextual strip above the workbench.
   - Class level headers use a warning-colored choice badge while any user decision at that level remains unresolved. Once subclass, ASI/feat, spell, and progression choices are all complete, the badge changes to the success treatment and gains a check mark for at-a-glance scanning.
   - ASI and feat decisions are owned by a specific class, source, and class level. Multiclass characters therefore receive independent Level 4 choices for each eligible class. Legacy unscoped feat selections are migrated in class-progression order to the first unresolved earned ASI slots.
   - Split workbenches must establish an explicit full-height flex viewport so fixed pane headers remain visible and each pane's scroll region receives a bounded height.
   - Redesigned master/list panes and right-side rules inspectors use the shared `--workspace-master-width` token: `clamp(24rem, 34%, 42rem)`. This keeps either pane near one-third of the workbench, allows it to contract on smaller windows, and preserves a practical 24rem floor for selection controls and readable rules text. Race, Background, Class, Ability Scores, Proficiencies, Feats, and future pages migrated to this workbench pattern should opt into the token; untouched legacy pages retain their existing splits until redesigned.
   - Build workbenches use 12 px page padding and one bordered split-pane surface rather than touching the viewport edges.
   - Master and detail panes use matching 44 px section headers, with a stronger divider and contrasting navigation surface separating available choices from details. When the pane's purpose is already clear, its primary local control may replace a redundant static title: search for Race/Background, method selection for Ability Scores, and category selection for Proficiencies. Embedded search fields use identical flexible tracks, fixed-width result counters, and optical vertical centering. Header switchers use flat desktop tabs with a bottom-edge active indicator rather than nesting another bordered segmented container inside the header.
   - Build detail panes use `WorkspaceDetailContent` for a universal centered `max-w-4xl` reading width and 20 px content padding. Race, Background, Class, Ability Scores, and future redesigned detail panes must use this wrapper rather than page-specific width rules.
4. Ability Scores now uses the inset Build workbench with matched pane headers, independent scrolling, a details inspector using the shared responsive master-pane width, and responsive 10rem × 14rem chamfered ability tiles with appropriately scaled typography. The inspector header remains the static `Ability details` label; the selected ability name appears only in the content heading. Every tile reserves the same 3.25rem control bay, so Point Buy buttons, Standard Array selects, and Custom number inputs never change the tile or grid dimensions when switching methods. The score-display area intentionally uses the default cursor even though it can update the details inspector; only explicit editing controls use their control-specific cursor, including the pointer cursor on Point Buy `−/+` buttons. The scoring-method switcher replaces the redundant `Ability scores` pane title and stays horizontally scrollable at compact widths. The larger Point Buy usage meter remains right-aligned in the content command strip when relevant, using the explicit `used / budget` value and progress bar without a redundant remaining-points label. The narrower centered `max-w-xl` racial allocation dock contains the fixed bonuses and ability assignments, with the matching racial-distribution segmented control right-aligned in its header. Sources remains the standard persistent footer pattern.
5. Proficiencies now uses the same inset Build workbench and a right-side inspector using the shared responsive master-pane width. Its compact horizontally scrollable category switcher replaces the redundant `Proficiencies` pane title and retains the available-choice count for Skills, Armor, Weapons, Tools, and Languages, while every category always exposes its complete catalog without a separate scope toggle. Every row uses a readable neutral surface with an explicit Chosen, Granted, Available, or Unavailable badge, a minimum comfortable row height, whole-row inspector preview, and matching keyboard-focus behavior. Chosen rows use a restrained primary-accent surface, check-to-undo hover affordance, and pointer cursor; permanently granted rows use a distinct success tint balanced to the same visual brightness, lock icon, and default cursor. Neutral hover uses a lighter primary wash rather than a darker secondary fill. Grid shells use the pane background so unused cells disappear into the canvas, while a slightly brighter inset structural separator is drawn only around real entries. Inspector preview and selection do not add another border or ring to rows; only actual keyboard focus replaces the structural separator with its accessibility ring. Inline source names are omitted because provenance remains available through the Details context and persistent Sources footer. Only rows that can currently be selected or deselected use the pointer cursor; fixed, unavailable, generic, and inspect-only rows retain the default cursor, while the expertise control independently uses a pointer only when it can be toggled. The page and details-pane headers remain concise without redundant scope or selected-item labels. Sorting, grouping, choice selection, expertise, specialized tool selectors, and provenance remain intact. The Details pane uses the universal content width, and Sources remains pinned below the independently scrolling data region. This is the second Proficiencies design pass and remains subject to final visual validation. Convert Feats next using the dense list/detail pattern.
6. Feats now uses an inset list/detail workbench with a right-side rules inspector using the shared responsive master-pane width. The inspector header remains the static `Feat details` label; the selected feat name appears only in the content heading. Character and bonus feats are comfortable grouped rows rather than expandable cards; clicking or keyboard-selecting a feat updates the full description and prerequisite state in the inspector, while hover and ordinary focus no longer replace the current selection. Rows retain the default cursor despite supporting selection, and only explicit controls use their normal interactive cursor. Each feat receives the same 12px section inset, rounded neutral border, and 12px vertical separation as the Add Bonus Feat action, keeping every entry aligned while clearly separating adjacent feats. Ordinary rows have no colored left border, and only the selected feat receives a restrained inset selection treatment. Source and category are quiet plain metadata while semantic conditions remain badges, reducing header clutter. Setup, edit, remove, grant-origin, and bonus-feat actions remain inline with each row; remove uses a larger 36px target. Add Bonus Feat is consistently presented as a rounded, dashed action tile whether or not bonus feats already exist, and no extra divider or wrapper surface separates it from the preceding feat rows. Pending ASI, racial, origin, and setup issues share one restrained issue region, while Sources remains pinned below the independently scrolling list.
7. Spells now uses the same inset collection/inspector workbench and responsive right-side width. The page-level marketing header and structural cards are removed. Spell profiles remain collapsible, but each profile is one flat bordered section with restrained status badges and level groups rather than a stacked dashboard card. Because spell names already provide complete, pinnable rules tooltips, rows do not duplicate spell descriptions in the right pane or add a second selection mode. The static `Spellcasting details` pane is reserved for compact class/racial casting statistics and slot summaries, with no redundant nested title. Spell-level collections follow the Proficiencies list treatment: one rounded structural border, a neutral header, a responsive gap-pixel grid, comfortable 44 px rows, and restrained inset separators only around real entries. Prepared state remains separately visible, and removable spells receive the standard 36 px destructive target. A profile's `Total` badge counts every spell row actually displayed; for true prepared casters this means the available class list plus displayed cantrips, rather than only the smaller set stored directly on the character profile. Subclass-granted spells belong to their parent class profile rather than creating a separate subclass card. Every automatic subclass grant is locked against removal; `prepared` and `innate` grants are additionally always prepared and do not consume the class preparation allowance, while `known` grants retain the preparation behavior of their parent class. The spell tooltip and Sources footer identify the subclass that supplied each grant. The final Bonus Spells profile retains the same complete border as every preceding profile. Racial selection, bonus-spell selection, known/prepared limits, spell swaps, removal, preparation, and existing hover references remain functional. Sources is pinned beneath the independently scrolling collection. Equipment is the next untouched data-heavy workspace.

Exit criterion: the complete character-building workflow no longer depends on nested structural cards.

### Phase 5: Data-heavy workspaces

1. Convert Equipment to a table and inspector.
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

- Background → Available backgrounds: a selected starting-equipment option with a particularly long label can still cause the trailing dropdown or source metadata to clip while the application window is being narrowed. The issue is isolated to the selected-row control's intrinsic sizing and is deferred for a later focused responsive-layout pass.
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

- The shell is edge-to-edge and uses no card-like structural containers.
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
