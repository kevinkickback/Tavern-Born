# Tavern Born

<div align="center">

<img src="public/assets/images/ui/logo_name.png" alt="Tavern Born Logo" width="250"/>

**A desktop Dungeons & Dragons 5th Edition character creator**

[![Electron](https://img.shields.io/badge/Electron-Latest-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![5etools](https://img.shields.io/badge/Data-5etools-orange)](https://wiki.tercept.net/en/home)

</div>

## ✨ Features

- **Step-by-step character creation** — Race, class, background, and ability scores with source filtering
- **Level-up wizard** — Multiclassing, ASI/feat selection, and automatic feature detection
- **Spell management** — Class spell lists, preparation, and multiclass slot calculation
- **Equipment & inventory** — Item management with encumbrance tracking
- **Multiple ability score methods** — Point Buy, Standard Array, Rolling, or Manual Entry
- **Character details** — Portraits, backstory, and physical characteristics
- **PDF export** — Generate a printable character sheet as a PDF

## 📸 Screenshots

<details>
<summary>🏠 Home</summary>

![Home](docs/images/home.png)
*Browse and manage your characters*

</details>

<details>
<summary>🎲 Ability Scores</summary>

![Ability Scores](docs/images/ability_scores.png)
*Set ability scores using Point Buy, Standard Array, Rolling, or Manual Entry*

</details>

<details>
<summary>📖 Spell Selection</summary>

![Spell Selection](docs/images/spell_select.png)
*Browse and select spells with full descriptions and filters*

</details>

<details>
<summary>✨ Spell List</summary>

![Spell List](docs/images/spell_list.png)
*Manage prepared spells, cantrips, and view spellcasting details*

</details>

<details>
<summary>⚔️ Equipment</summary>

![Equipment](docs/images/equipment.png)
*Track inventory, weight, attunement slots, armor class, and currency*

</details>

<details>
<summary>⬆️ Level Up & Multiclassing</summary>

![Level Up](docs/images/level_up.png)
*Level up, multiclass, and select ASIs or feats*

</details>

## 🚀 Getting Started

### Option 1: Download a Release (Recommended)

Download the latest installer or portable build for your platform from the
[Releases](../../releases) page. Published builds do not bundle game data; configure a compatible
data source when the app first starts.

### Option 2: Build from Source

**Prerequisites:** [Node.js](https://nodejs.org/) 20.19 or newer and npm. CI uses Node 20.19.0.

```bash
git clone https://github.com/kevinkickback/Tavern-Born.git
cd Tavern-Born
npm ci
npm run dev
```

Useful validation commands:

```bash
npx biome ci .
npx tsc -b
npm test
npm run build
```

## 📊 Game Data

> **⚠️ Important:** Tavern-Born does **NOT** include Dungeons & Dragons game data.

You must provide your own compatible 5etools JSON data, either from a local folder or an HTTPS
source. See [Data Ingestion](docs/data-ingestion.md) for the supported source model and loading
pipeline. The [5etools Wiki](https://wiki.tercept.net/en/home) may help you obtain the source data.

## Contributing

Start with the [documentation hub](docs/README.md) and
[contributor guide](docs/contributor-start-here.md). Keep game data outside source control and do
not edit `data/`; parser fixups belong under `src/lib/5etools/`.


## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
