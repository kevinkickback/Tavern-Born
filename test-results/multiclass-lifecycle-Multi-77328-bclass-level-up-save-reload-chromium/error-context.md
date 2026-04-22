# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiclass-lifecycle.spec.ts >> Multiclass lifecycle and equipment choices >> add class, multiclass, change subclass, level up, save, reload
- Location: tests\e2e\multiclass-lifecycle.spec.ts:8:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /new character/i }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /new character/i }).first()

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - complementary:
        - generic:
          - link:
            - /url: /
            - img
            - generic: Tavern Born
        - navigation:
          - list:
            - listitem:
              - generic:
                - link:
                  - /url: /
                  - generic:
                    - img
                  - generic: Home
            - listitem:
              - generic:
                - button:
                  - generic:
                    - img
                  - generic: Build
                  - img
              - generic:
                - list:
                  - listitem:
                    - link:
                      - /url: /build/race
                      - generic:
                        - img
                      - generic: Race
                  - listitem:
                    - link:
                      - /url: /build/class
                      - generic:
                        - img
                      - generic: Class
                  - listitem:
                    - link:
                      - /url: /build/background
                      - generic:
                        - img
                      - generic: Background
                  - listitem:
                    - link:
                      - /url: /build/ability-scores
                      - generic:
                        - img
                      - generic: Ability Scores
                  - listitem:
                    - link:
                      - /url: /build/proficiencies
                      - generic:
                        - img
                      - generic: Proficiencies
            - listitem:
              - generic:
                - link:
                  - /url: /feats
                  - generic:
                    - img
                  - generic: Feats
            - listitem:
              - generic:
                - link:
                  - /url: /spells
                  - generic:
                    - img
                  - generic: Spells
            - listitem:
              - generic:
                - link:
                  - /url: /equipment
                  - generic:
                    - img
                  - generic: Equipment
            - listitem:
              - generic:
                - button:
                  - generic:
                    - img
                  - generic: Details
                  - img
            - listitem:
              - generic:
                - link:
                  - /url: /character-sheet
                  - generic:
                    - img
                  - generic: Character Sheet
            - listitem:
              - generic:
                - link:
                  - /url: /settings
                  - generic:
                    - img
                  - generic: Settings
        - generic:
          - generic:
            - button:
              - generic:
                - img
            - button:
              - generic:
                - img
            - button:
              - generic:
                - img
      - generic:
        - navigation:
          - generic:
            - paragraph: No Character Loaded
          - generic:
            - button [disabled]:
              - img
              - text: Save
        - main:
          - generic:
            - generic:
              - generic:
                - img
                - generic:
                  - heading [level=1]: Home
                  - paragraph: Manage and switch between your characters
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic: Characters
                      - generic:
                        - button:
                          - img
                          - text: New Character
                        - button:
                          - img
                          - text: Import
                      - generic:
                        - generic:
                          - generic:
                            - img
                          - generic:
                            - heading [level=3]: No Characters Yet
                            - paragraph: Create your first character to begin your adventure
                          - generic:
                            - button:
                              - img
                              - text: Import
                            - button:
                              - img
                              - text: New Character
                    - generic:
                      - generic:
                        - generic: Filters
                      - generic:
                        - generic:
                          - generic: Sort by
                          - combobox:
                            - generic: Recently Modified
                            - img
                        - button:
                          - img
                          - text: Multi-Select
    - region "Notifications alt+T"
  - dialog "Welcome to Tavern Born" [ref=e2]:
    - generic [ref=e3]:
      - heading "Welcome to Tavern Born" [level=2] [ref=e4]
      - paragraph [ref=e5]:
        - text: This application requires 5etools D&D data files to operate. These files are not included and must be obtained separately. The
        - link "5etools wiki" [ref=e6] [cursor=pointer]:
          - /url: https://wiki.tercept.net/en/home
        - text: may point to
        - strong [ref=e7]:
          - emphasis [ref=e8]: source code
        - text: where they can be found.
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - img [ref=e13]
          - generic [ref=e16]: Data Source Configuration
        - paragraph [ref=e17]: Configure where to load game data from
      - generic [ref=e18]:
        - generic [ref=e19]:
          - tablist [ref=e22]:
            - tab "Remote URL" [active] [selected] [ref=e23]:
              - img
              - text: Remote URL
            - tab "Local Directory" [ref=e24]:
              - img
              - text: Local Directory
          - tabpanel "Remote URL" [ref=e25]:
            - generic [ref=e26]:
              - generic [ref=e27]: Repository URL
              - textbox "Repository URL" [ref=e29]:
                - /placeholder: https://github.com/username/example-data
              - paragraph [ref=e30]: Enter URL to a 5etools data repository
        - generic [ref=e32]:
          - button "Save & Load" [disabled]:
            - img
            - text: Save & Load
    - button "Close" [ref=e33]:
      - img
      - generic [ref=e34]: Close
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | import { ensureStartupPromptResolved, selectCharacterFromHome } from './helpers/startup'
  3  | 
  4  | // This E2E test covers the multiclass lifecycle: add class → modify subclass → change levels → save → reload
  5  | // and verifies spell slot recalculation and equipment choices using the 5etools DSL in the real UI.
  6  | 
  7  | test.describe('Multiclass lifecycle and equipment choices', () => {
  8  |   test('add class, multiclass, change subclass, level up, save, reload', async ({ page }) => {
  9  |     // 1. Go to home and create a new character
  10 |     await page.goto('/')
  11 |     await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  12 | 
  13 |     // 2. Create a new character (simulate UI flow)
  14 |     const newCharBtn = page.getByRole('button', { name: /new character/i }).first()
> 15 |     await expect(newCharBtn).toBeVisible()
     |                              ^ Error: expect(locator).toBeVisible() failed
  16 |     await expect(newCharBtn).toBeEnabled()
  17 |     await newCharBtn.click()
  18 |     await page.getByLabel('Name').fill('Multiclass Hero')
  19 |     await page.getByRole('button', { name: /create/i }).click()
  20 |     await selectCharacterFromHome(page, 'Multiclass Hero')
  21 | 
  22 |     // 3. Add a class (e.g., Fighter)
  23 |     await page.getByRole('button', { name: /class/i }).click()
  24 |     await page.getByRole('button', { name: /add class/i }).click()
  25 |     await page.getByRole('option', { name: /fighter/i }).click()
  26 |     await page.getByRole('button', { name: /confirm/i }).click()
  27 |     await expect(page.getByText('Fighter')).toBeVisible()
  28 | 
  29 |     // 4. Add a second class (e.g., Wizard)
  30 |     await page.getByRole('button', { name: /add class/i }).click()
  31 |     await page.getByRole('option', { name: /wizard/i }).click()
  32 |     await page.getByRole('button', { name: /confirm/i }).click()
  33 |     await expect(page.getByText('Wizard')).toBeVisible()
  34 | 
  35 |     // 5. Change subclass for Wizard (if available)
  36 |     if ((await page.getByRole('button', { name: /choose subclass/i }).count()) > 0) {
  37 |       await page.getByRole('button', { name: /choose subclass/i }).click()
  38 |       await page.getByRole('option').first().click()
  39 |       await page.getByRole('button', { name: /confirm/i }).click()
  40 |     }
  41 | 
  42 |     // 6. Level up (increase total level)
  43 |     await page.getByRole('button', { name: /level up/i }).click()
  44 |     await page.getByRole('button', { name: /confirm/i }).click()
  45 |     await expect(page.getByText('Level 2')).toBeVisible()
  46 | 
  47 |     // 7. Pick starting equipment via equipment choice DSL
  48 |     await page.getByRole('link', { name: /equipment/i }).click()
  49 |     if ((await page.getByRole('button', { name: /choose equipment/i }).count()) > 0) {
  50 |       await page.getByRole('button', { name: /choose equipment/i }).click()
  51 |       await page.getByRole('option').first().click()
  52 |       await page.getByRole('button', { name: /confirm/i }).click()
  53 |     }
  54 |     await expect(page.getByText(/inventory/i)).toBeVisible()
  55 | 
  56 |     // 8. Verify spell slots are recalculated for multiclass
  57 |     await page.getByRole('link', { name: /spells/i }).click()
  58 |     await expect(page.getByText(/spell slots/i)).toBeVisible()
  59 |     // (Optional: check for expected slot numbers)
  60 | 
  61 |     // 9. Save and reload
  62 |     await page.getByRole('button', { name: /save/i }).click()
  63 |     await page.reload()
  64 |     await ensureStartupPromptResolved(page, 'e2e-multiclass-seed')
  65 |     await selectCharacterFromHome(page, 'Multiclass Hero')
  66 |     await page.getByRole('link', { name: /class/i }).click()
  67 |     await expect(page.getByText('Fighter')).toBeVisible()
  68 |     await expect(page.getByText('Wizard')).toBeVisible()
  69 |     await page.getByRole('link', { name: /equipment/i }).click()
  70 |     await expect(page.getByText(/inventory/i)).toBeVisible()
  71 |     await page.getByRole('link', { name: /spells/i }).click()
  72 |     await expect(page.getByText(/spell slots/i)).toBeVisible()
  73 |   })
  74 | })
  75 | 
```