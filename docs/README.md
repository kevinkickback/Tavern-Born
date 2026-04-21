# Tavern-Born Documentation Hub

This folder contains architecture and implementation docs intended to keep development fast and consistent as the codebase grows.

## Start Here

If you are new to the repository, read these in order:

1. contributor-start-here.md
2. architecture-map.md
3. data-flow.md
4. state-management.md
5. data-ingestion.md

## Documents

- architecture-map.md: Layered system map, ownership boundaries, and where to put code.
- data-flow.md: End-to-end runtime flows from startup to save/persist.
- data-ingestion.md: 5etools loading/parsing/validation/caching pipeline.
- state-management.md: Character and game-data store contracts, mutation rules, and derived data policy.
- provenance.md: Grant tracking, reconciliation behavior, and key invariants.
- testing-map.md: Current coverage, gaps, and recommended test additions.
- codebase-tour.md: Concern-to-file routing table for fast navigation.
- contributor-start-here.md: Practical onboarding sequence and first-change checklist.
- feat-update-system.md: Implementation plan for the auto-update system (electron-updater, startup check, changelog modal, settings toggle).

## Update Policy

Update docs in this folder whenever one of these changes:

- Folder ownership boundaries or major architecture direction
- Data loading/parsing/caching behavior
- Character state shape or mutation lifecycle
- Provenance behavior (new grant/reconciliation rules)
- Build or test conventions

When in doubt, update docs in the same pull request as the behavior change.
