<details>
<summary><strong>v0.4.0</strong></summary>

## ✨ Changes

* **Added complete Weapon Mastery selection support to the Class builder.** Required choices now appear at the level where they are earned; Weapon Mastery offers only class-eligible weapons, derives attack type from game data, filters by mastery, weapon category, or attack type, and explains each mastery. Saved options that are no longer eligible remain available for replacement without counting as complete, choices stay with the class that granted them, and unearned benefits are removed after lowering a class level.
* **Added an Actions & Effects workspace for equipment, spells, ancestry, feats, classes, and manual entries.** Source-derived and manual entries can be collapsed or temporarily disabled, and the same action list supplies the Action, Bonus Action, and Reaction fields on 2014 character sheets.
* **Added Review as the final Builder section.** It provides exact links that reveal and highlight incomplete choices or diagnostics, plus a focused overview of calculated totals, movement, actions, content sources, and PDF readiness.
* **PDF export now warns about incomplete choices, missing content, unsupported mechanics, and entries that will not fit on the selected sheet before downloading.**
* **The Spells page now gives each class its own tab and handles multiclass and Pact Magic slots separately.** Existing spell names are recognized regardless of capitalization while preserving the selected sourcebook version, and selecting spells gained at later levels no longer removes earlier class spell choices.
* **Level-up choices now remain attached to the class level that granted them.** Adding later feats, Fighting Styles, Eldritch Invocations, Metamagic, or other normalized class choices no longer lets catalog sorting reassign an earlier choice to a later slot, so lowering a level removes the correct benefit.
* **Character calculations now apply ability-score, equipment, and feat bonuses consistently** across totals, prerequisites, spellcasting, movement, carrying capacity, and exported sheets.
* **Movement management now supports walking, climbing, swimming, flying, burrowing, hover, custom movement modes, situational changes, and exact overrides** without replacing ancestry-based speeds.
* **Character cards now support both exact duplication and reusable build copies.** Reusable builds reset current HP, conditions, used resources, and spell-slot usage; cards also offer a clearly labeled export action, and creating a character now returns to the Characters page.
* Refreshed the light theme with softer neutral backgrounds, clearer borders, and stronger contrast
* Tooltip and entry previews no longer collide with window controls; previews can now be pinned, dragged by their title, and revisited through their history
* List-and-detail pages now switch to a focused single-pane view in narrow windows, keep page navigation available, and let the remaining pane reclaim the full workspace when its companion is collapsed
* Equipment summaries and filters now adapt to smaller windows, item details show only relevant fields, and Add Item includes spellcasting foci and unfamiliar or homebrew item types
* Class resource trackers now distinguish partial short-rest recovery from full recovery and use corrected 2024 Bard, Fighter, Paladin, and Wizard rules
* Class, race, and background feat choices now retain their selected sourcebook printing and follow-up setup; feat details, changes, and removal distinguish between printings with the same name
* Stat-management previews now retain active typed effects, subclass spellcasting limits follow the selected subclass, Wizard spellbook and prepared-spell totals are validated independently, reusable build copies begin with full class resources, 2014 Paladin Channel Divinity uses the correct capacity, and action lists resolve class and feat rules from loaded source data
* Armor Class and Hit Point management now separates calculation breakdowns from manual changes, making every contributing source visible without overwhelming heavily modified characters
* Sources now lives alongside other character settings in Rules, and choosing no optional sources during creation correctly keeps only the core sourcebook for the selected ruleset
* Race and background setup now previews unresolved ability and movement choices, keeps feat and ability setup on their dedicated pages, links directly to remaining choices, and safely handles incomplete 2024 species lineages
* Contextual hints now return correctly after being reset or after their controls appear in a responsive layout
* Built-in organization cards now use neutral backgrounds, and 2014 character sheets place the selected or custom emblem in the organization section
* Remote game data now works with more hosting services, while GitHub sources accept branch names containing slashes and provide clearer guidance for ambiguous URLs
* Character imports now clearly reject files created by a newer unsupported version instead of silently dropping unfamiliar information

</details>

<details>
<summary><strong>v0.3.0</strong></summary>

## ✨ Changes

* Characters can now use average HP, roll hit die, or enter a roll manually when leveling up
* Click the heart in the app header panel to manage current, temporary, and custom HP values
* Click the shield in the app header panel to manage Armor Class bonuses, penalties, and custom values
* Character rules can now be reviewed and changed after creation from the new Rules page
* The Conditions page now provides focused trackers, condition reminders, and ruleset-specific exhaustion guidance
* PDF generation for both 2014 & 2024 character sheets should be mostly complete
* Enabling armor-slot and proficiency enforcement now automatically unequips invalid equipment
* Tooltip previews are now fully recursive and should work across the entire app, not just certain pages
* Fixed class icons not being displayed properly


</details>

<details>
<summary><strong>v0.2.0</strong></summary>

## ✨ Changes

* **Complete UI overhaul with a redesigned look and feel**
* New app icon
* Added zoom controls to PDF character sheet previews
* Future updates will install automatically after download
* Various security and stability improvements
* Fixed several issues affecting subclass-granted spells
* Fixed ASIs, feats, and subclasses from overlapping when multiclassing
* Imported or persisted characters with duplicate IDs receive new UUIDs

## ⚠️ Known Issues

* Due to security improvements, users may need to reconfigure their game data source. Local folder users may need to reselect their game data directory, while remote URL users may need to update their source URL because only HTTPS URLs are now supported.
* PDF generation for the 2014 and 2024 character sheets is working but incomplete. Still under active development

</details>

<details>
<summary><strong>v0.1.6</strong></summary>

## ✨ Changes

* Refreshed the header and sidebar for clearer navigation and improved layouts on smaller screens
* Exhaustion details now display the cumulative effects of the selected level and all previous levels
* Contextual hints now hide when their related control is obscured and return when it becomes visible again
* Improved the responsiveness of equipment, spell, and other selection windows containing large lists
* Automatic game data refreshes now provide a notification only when new data has been successfully applied

## ⚠️ Known Issues

* PDF generation for both the 2014 and 2024 character sheets is incomplete. The 2024 format is especially unfinished and still under active development

</details>

<details>
<summary><strong>v0.1.5</strong></summary>

## ✨ Changes

* Fixed pdf generation not working at all (oops!)
* Starting equipment no longer added when multiclassing
* Original subclass selection no longer leaks onto other class tabs when they have a subclass choice pending
* Races should no longer display a dropdown box if no subclass options exsist
* Racial spells aquired after level 1 now properly display on spells page
* Class resource tracker expanded with more options
* Character equipment now added to 2014 pdf generation

## ⚠️ Known Issues

* PDF generation for both the 2014 and 2024 character sheets is incomplete. The 2024 format is especially unfinished and still under active development

</details>

<details>
<summary><strong>v0.1.4</strong></summary>

## ✨ Changes

* Adjusted size and spacing of character cards on home page at different resolutions
* Collapse/expand either side of the display on build pages
* Sorting options added to proficiencies tabs
* Optional Class Features properly hidden when disabled
* More fields added to 2014/2024 PDF fields

## ⚠️ Known Issues

* PDF generation for both the 2024 character sheets is incomplete and under active development

</details>

<details>
<summary><strong>v0.1.3</strong></summary>

## ✨ Changes

* Character save file extension changed from `.dndchar` to `.tbc`
* Added missing skill expertise logic
* Added ability grouping to the skill proficiency tab
* Compendium and Languages now respect allowed sources

## ⚠️ Known Issues

* PDF generation for both the 2014 and 2024 character sheets is incomplete. The 2024 format is especially unfinished and still under active development

</details>

<details>
<summary><strong>v0.1.2</strong></summary>

## Initial Public Release

As this is the initial public release, bugs and incomplete features are expected. If you encounter any issues, please report them using the GitHub Issues page

## ⚠️ Known Issues

* PDF generation for both the 2014 and 2024 character sheets is incomplete. The 2024 format is especially unfinished and still under active development

</details>
