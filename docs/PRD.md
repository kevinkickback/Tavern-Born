# Planning Guide

A comprehensive D&D 5e character creation and management tool that empowers players to build, customize, and maintain their characters with full rule enforcement, offline capability, and extensible data architecture.

**Experience Qualities**:
1. **Authoritative** - The app feels like an official, reliable reference tool with accurate rule enforcement and comprehensive options
2. **Immersive** - Rich fantasy aesthetics with detailed character portraits and thematic design that evokes the D&D universe
3. **Efficient** - Streamlined workflows reduce character creation time while maintaining depth and customization options

**Complexity Level**: Complex Application (advanced functionality, likely with multiple views)
This is a comprehensive character management system with multiple interconnected views, rule enforcement engine, data persistence layer, modal-based workflows, and dynamic state management across race/class/feat/spell/equipment systems.

## Essential Features

**Character Creation Modal**
- Functionality: Guided multi-step modal for initial character setup (name, race, class, background, ability scores, source book selection)
- Purpose: Reduce intimidation factor of blank character sheets and provide structured entry point
- Trigger: "New Character" button on home page
- Progression: Name entry → Rules & source selection → Race selection → Class selection → Background selection → Ability score allocation → Character created
- Success criteria: Character saved to storage with valid starting configuration and source restrictions applied

**Rule Data Loading System**
- Functionality: Modular adapter system that loads and parses 5etools JSON data from local or remote sources
- Purpose: Enable offline functionality and support multiple dataset sources including homebrew
- Trigger: App initialization or manual data source configuration in Settings
- Progression: Data source validation → JSON parsing → Rule data indexed → UI populated with options
- Success criteria: All race/class/spell/equipment options available for selection with full descriptions

**Character Persistence Layer**
- Functionality: Dual persistence using IndexedDB for local storage and JSON export/import for file-based saves
- Purpose: Prevent data loss and enable character sharing/backup across devices
- Trigger: Auto-save on every change, manual export via header controls
- Progression: Character modified → State serialized → IndexedDB updated → Success toast displayed
- Success criteria: Character data survives page refresh and can be exported/imported without data loss

**Sidebar Navigation System**
- Functionality: Hierarchical navigation with collapsible sections for Build workflow and flat items for other pages
- Purpose: Provide clear mental model of character creation workflow and quick access to all features
- Trigger: Click on navigation item
- Progression: Nav item clicked → Route changes → Content area updates → Active state highlighted
- Success criteria: User can navigate between all pages without losing character state

**Selection Modal System**
- Functionality: Reusable modal component for choosing from rule options (spells, feats, equipment, class features)
- Purpose: Handle complex selections with search, filtering, and detailed descriptions
- Trigger: User needs to make a rule-based choice (spell selection, feat choice, equipment pack)
- Progression: Selection triggered → Modal opens → Search/filter applied → Option selected → Rules applied → Modal closes
- Success criteria: User can find and select appropriate options with full rule descriptions visible

**Character Sheet View**
- Functionality: Full calculated character sheet with all stats, proficiencies, features, spells, and equipment
- Purpose: Provide print-ready reference sheet for gameplay
- Trigger: Navigate to Character Sheet page
- Progression: Character data loaded → Stats calculated → Sheet rendered → Export to PDF available
- Success criteria: All calculated values match D&D 5e rules and sheet is printable

**Build Workflow Pages**
- Functionality: Step-by-step pages for Race, Class, Background, Proficiencies, and Ability Scores with source book filtering
- Purpose: Guide users through character creation with rule enforcement and respect character source restrictions
- Trigger: Navigate to Build section items
- Progression: Option selected → Rules validated → Character updated → Dependent features unlocked
- Success criteria: Character progression follows official D&D 5e rules with appropriate restrictions and only shows content from allowed sources

**Source Book Filtering System**
- Functionality: Per-character filtering of all game content (races, classes, spells, feats, items, backgrounds) based on selected source books
- Purpose: Allow players to restrict content to specific campaign settings or rule sets (e.g., PHB-only campaigns)
- Trigger: Source selection during character creation wizard (Rules step)
- Progression: Sources selected → Character saved with allowed sources → All game data filtered throughout app → Only allowed content displayed
- Success criteria: Characters only see races, classes, spells, and other content from their selected source books across all pages

## Edge Case Handling

- **Missing Data Source**: Show friendly setup wizard directing user to configure data source in Settings
- **Corrupted Character File**: Validate on import and show specific error messages with recovery options
- **Rule Conflicts**: Display warnings when homebrew content conflicts with official rules; allow user override
- **Unsaved Changes**: Show confirmation modal before navigation if autosave failed or is disabled
- **Invalid Ability Scores**: Enforce point buy, standard array, or manual entry with validation feedback
- **Multiclassing Rules**: Calculate proficiencies and spell slots correctly; warn about multiclass prerequisites
- **Large Dataset Performance**: Implement lazy loading and virtualization for spell/equipment lists

## Design Direction

The design should evoke the feeling of a well-worn spellbook or adventurer's journal - rich, tactile, and steeped in fantasy tradition. Deep, saturated colors with parchment-like textures create an immersive D&D atmosphere. The interface should feel both authoritative (like official rulebooks) and magical (like discovering ancient tomes).

## Color Selection

A dark fantasy theme with rich burgundy accents and warm parchment tones.

- **Primary Color**: Deep burgundy red (oklch(0.35 0.15 15)) - Evokes leather-bound tomes and dragon's blood ink; used for primary actions and branding
- **Secondary Colors**: 
  - Charcoal gray (oklch(0.18 0.01 270)) - Provides sophisticated dark background
  - Warm slate (oklch(0.25 0.02 260)) - Used for cards and elevated surfaces
- **Accent Color**: Bright crimson (oklch(0.55 0.22 15)) - Attention-grabbing for CTAs and important interactive elements
- **Foreground/Background Pairings**: 
  - Background charcoal (oklch(0.18 0.01 270)): Warm white text (oklch(0.95 0.01 60)) - Ratio 12.5:1 ✓
  - Card slate (oklch(0.25 0.02 260)): Off-white text (oklch(0.93 0.01 60)) - Ratio 10.2:1 ✓
  - Primary burgundy (oklch(0.35 0.15 15)): White text (oklch(0.98 0 0)) - Ratio 7.8:1 ✓
  - Accent crimson (oklch(0.55 0.22 15)): White text (oklch(0.98 0 0)) - Ratio 4.9:1 ✓

## Font Selection

Typography should balance medieval fantasy character with modern readability, using display faces for headings and clean sans-serifs for data-heavy content.

- **Typographic Hierarchy**: 
  - App Branding: Cinzel Bold/24px/tight letter-spacing - Evokes classic fantasy lettering
  - Section Headers (H1): Cinzel Semibold/32px/normal letter-spacing
  - Page Headers (H2): Cinzel Medium/24px/normal letter-spacing  
  - Card Titles (H3): Inter Semibold/18px/tight letter-spacing
  - Body Text: Inter Regular/14px/relaxed line-height (1.6)
  - Stats/Numbers: JetBrains Mono Medium/14px/tabular numbers
  - Labels: Inter Medium/12px/uppercase/wide letter-spacing

## Animations

Animations should feel purposeful and slightly magical, suggesting the turning of pages and the revealing of arcane knowledge.

- Page transitions use a gentle fade with slight vertical slide (300ms) to mimic turning pages
- Modal appearances use scale-up from 95% with fade (200ms) for depth
- Selection highlights pulse subtly with crimson glow on hover
- Card appearances on home page stagger with 50ms delay between each
- Sidebar navigation items slide their backgrounds in on active state
- Save button shows brief success pulse animation with icon morph
- Dice icons in stat blocks rotate slightly on hover to suggest interactivity

## Component Selection

- **Components**: 
  - Dialog/AlertDialog for character creation and selection modals
  - Card for character display on home page
  - ScrollArea for long lists (spells, equipment, feats)
  - Tabs for organizing multi-section pages (Build workflow)
  - Select and Combobox for dropdowns with search
  - Button with variants (default, destructive, outline, ghost)
  - Input and Textarea for text entry
  - Checkbox and RadioGroup for rule options
  - Badge for tags and status indicators
  - Separator for visual section breaks
  - Tooltip for rule clarifications and help text
  - Progress for level/XP tracking
  - Sheet for mobile navigation drawer
  
- **Customizations**: 
  - Custom CharacterCard component with portrait, stats overlay, and action buttons
  - Custom StatBlock component with dice icon, ability name, modifier display
  - Custom RuleOption component showing source book, description, prerequisites
  - Custom NavigationSidebar with collapsible sections and icon integration
  - Custom Header with character summary center-aligned
  
- **States**: 
  - Buttons show active glow effect on press with subtle transform
  - Inputs highlight with crimson ring on focus
  - Disabled states use 50% opacity with grayscale filter
  - Loading states show skeleton screens with pulsing gradient
  - Selection items show checkmark icon and crimson left border when selected
  
- **Icon Selection**: 
  - Home: House
  - Character Build: Sword (or User)
  - Feats: Star
  - Spells: Wand (MagicWand)
  - Equipment: Backpack (or Shield)
  - Details: User
  - Character Sheet: FileText
  - Settings: Gear
  - Notifications: Bell
  - Save: FloppyDisk
  - Import: FolderOpen
  - Export: Download
  - Delete: Trash
  - Add: Plus
  - Edit: Pencil
  
- **Spacing**: 
  - Page padding: p-6 (24px)
  - Card padding: p-4 (16px)
  - Section gaps: gap-6 (24px)
  - Element gaps: gap-4 (16px)
  - Tight spacing: gap-2 (8px)
  
- **Mobile**: 
  - Sidebar collapses to hamburger menu using Sheet component
  - Header stacks vertically with character name centered
  - Character cards stack single column
  - Selection modals become full-screen on mobile
  - Stat blocks reduce to 2-column grid on small screens
