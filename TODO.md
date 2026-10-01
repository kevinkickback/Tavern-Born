# TODO

## Branch integration order

After each squash merge, bring the updated `main` into the next branch, run `npm run check:pr`, then push or update its PR.

1. `fix/level-transition-hit-points` (PR #42)
2. `feat/bulk-character-transfer` (PR #44)
3. `fix/equipment-restriction-consistency` (PR #43)
4. `fix/equipment-property-labels` (PR #45)
5. `fix/pdf-export-presentation` (open a PR after updating from `main`)
6. `feat/5etools-ingestion-parity` (open a PR after updating from `main`)

When updating the PDF branch, reconcile the weapon property label changes in `src/lib/calculations/actions.ts`. When updating the ingestion branch, keep the game-data cache schema at version 14.

## README screenshots

- Refresh the README screenshots after the equipment property labels are verified. Preserve the current dimensions, image quality, and accent colors.
- Use a portrait that matches Irelia Tizesh, or change the character name to match the pictured portrait.
- Retake the Equipment screenshot with Quarterstaff selected and the current Item Details pane showing its populated statistics and description.
