<details>
<summary><strong>v0.4.0</strong></summary>

## ✨ Changes

* Refreshed the light theme with softer neutral backgrounds, clearer borders, and stronger contrast
* Window controls no longer obscure tooltips or preview windows
* Tooltip previews can now pin any entry, drag pinned previews by their title, and jump directly to earlier entries from the preview history
* Each class now has its own tab on the Spells page, making multiclass spell lists easier to browse
* List-and-detail pages now switch to a focused single-pane view in narrow windows while keeping page navigation available
* Redesigned the Equipment summary and filters to remain usable at smaller window sizes
* Equipment details now adapt to each item type, hiding irrelevant fields and showing matching category icons
* The Add Item window now includes spellcasting foci and unfamiliar or homebrew item types instead of silently hiding them
* Class resource trackers now distinguish partial short-rest recovery from full recovery and use corrected 2024 Bard, Fighter, Paladin, and Wizard rules
* Spell selection now recognizes existing spell names regardless of capitalization and preserves explicit source choices
* Class-granted feats now stay with the class that awarded them, so multiclass and bonus feat choices no longer overwrite one another
* Race and background feat choices now retain their selected printing and setup choices, and changing them cleanly removes their previous benefits
* Feat details and removal now distinguish between different sourcebook printings with the same name
* Choosing no optional sources during character creation now correctly keeps only the core sourcebook for the selected ruleset
* Remote game data sources now work with hosts that do not support lightweight availability checks
* Character imports now clearly reject files created by a newer unsupported version instead of silently dropping unfamiliar information
* Equipment summaries and PDFs now share carrying-capacity effects, and lowering a class level cleanly removes ASIs that are no longer earned
* 2014 character sheets now place the selected or custom organization emblem in the organization section
* Polished several builder screens by simplifying Race and Background entries, removing unused Class artwork information, and improving the Bonus Feat action
* Armor Class and Hit Point management now show their full calculation sources, including equipped armor and active typed effects
* Manual effects and actions now live on a dedicated Builder Adjustments page instead of header dialogs
* Origin ability bonuses now share one editor on Ability Scores, with corrected Review links for both rulesets
* Resetting one-time hints now takes effect immediately, and warning/destructive banner colors are restored
* Character creation stays on the Characters page after Create, while Review uses character-focused completion wording
* Armor Class and Hit Point management now separates the full calculation overview from manual changes, keeping heavily modified characters manageable
* Rules now includes Sources as a character-configuration tab, while manual Actions & Effects lives with Builder Details and uses the same functional page header as other builder sections
* Race summaries once again preview unresolved ability-bonus options and keep their ability and movement actions inside the relevant summary cells
* Character cards now keep one clearly labeled character export action; separate template files were removed in favor of local reusable-build duplication
* Race and background setup links now share a visible accent-outline style, and selected feat follow-up choices have clear accent feedback
* Rest controls are reserved for a future live-play experience instead of appearing in the builder header
* Built-in organization cards now use a neutral background so their artwork is not paired with arbitrary colors
* PDF regression coverage now uses separate 2014 and 2024 kitchen-sink characters generated and audited against the configured 5etools corpus
* Opening an incomplete 2024 character no longer crashes when its species lineage is selected before background setup is complete
* Actions now opens first on Actions & Effects, while Review has a dedicated final section in Builder navigation
* Race details only offer bonus setup when a 2014 race choice is still incomplete
* Spellcasting details show spell-slot capacity without live-session spend and restore controls
* Actions & Effects now includes read-only actions and modifiers derived from equipment, spells, ancestry, feats, and classes while keeping manual entries clearly separate
* Simplified Actions & Effects layouts by removing repeated nested cards
* 2024 background selection no longer interrupts the workflow with an automatic feat setup window, and its ability-bonus summary now shows every available assignment pattern
* Fixed the Armor Class and Hit Point hint failing to appear when its responsive header controls became available after initial layout
* Actions & Effects now uses a responsive workbench with manual-entry forms beside the complete current mechanics list
* Review now separates required attention items from the full character overview with header tabs
* Background ability choices use shorter summaries, and configurable origin feats link directly to their source-qualified Feats entry
* Ability Scores now shows pending 2024 background bonus sources before ability selections are complete and uses ruleset-correct setup guidance

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
