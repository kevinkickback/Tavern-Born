# Feat setup and special-spell ownership

Ordinary and bonus setup require an explicit collection and exact feat printing. A printing can
have one record per collection. Fixed, class and racial/background choice owners remain separate.
Configured choice records require one exact saved printing. A name-only unconfigured choice
may be retained or removed, and must be reselected before setup.

Finish resolves new choices before changing the draft. It replaces the addressed owner's setup
and retracts old benefits from saved state rather than a dialog snapshot. Clear leaves an empty
configured record and can run offline. Removal retracts that owner only. Fixed setup remains until
its last matching grant disappears. Distinct printings and independent grants survive.
[Owner tests](../../tests/lib/featSetupOwners.test.ts) · [Lifecycle tests](../../tests/unit/featSetupLifecycle.test.ts)

Strict admission checks exact saved options and tags in both directions. Reject duplicate choices,
orphan benefits and invalid spell UIDs. Revised class feat slots use prerequisites at the earned
gain, including total character level there. Incomplete history requires review when it cannot
prove eligibility. Existing exact picks stay recoverable.

Skilled and Skill Expert exclude already proficient or expert new picks where applicable.
An exact owner's prior selection remains editable through overlap. Expertise and proficiency have
separate ownership, and removing proficiency expires the corresponding expertise.

Special spells use the exact target printing and retain the granting feat separately. Special
owners of one target share its current spell kind. Exact metadata can reclassify it atomically
without losing locks, manual intent or independent class/racial profiles. Clear uses saved
ownership even when rules are missing. Bulk writes preserve fixed targets without manufacturing
manual owners. Unqualified manual values remain separate from catalog printings.
