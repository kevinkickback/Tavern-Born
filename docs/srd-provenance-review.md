# Bundled SRD Provenance Review

This checklist is the human release gate for Tavern Born's bundled SRD data. The generator and
tests can prove selection, dependency closure, deterministic transformation, and output identity;
they cannot prove that every retained field is licensed SRD material. Do not change the pack to
`approved-for-distribution` solely because the automated checks pass.

## Required inputs

1. A 5etools-format checkout at a known immutable upstream commit, outside Tavern Born's managed
   repository data. Record that full commit hash as the upstream revision.
2. The exact English SRD 5.1 and SRD 5.2.1 PDFs pinned in
   `resources/srd/core/provenance.json`. Verify their SHA-256 hashes before review.
3. The dependency allowlist and root/reference exclusions in
   `resources/srd/core/dependency-allowlist.json`.

The local ignored `data/` directory is suitable for development tests, but it is not acceptable as
the final review input unless its upstream revision can be independently established.

## Generate the review artifact

```text
npm run review:srd -- --source-root <pinned-checkout> --upstream-revision <full-commit-sha>
```

The command writes an ignored artifact to `.tmp/srd-review/`. It contains the full transformed data,
the review-required manifest, and `review-inventory.csv`. The CSV has one row for every emitted
top-level record and binds the review to that record's SHA-256 hash.

## Review every row

For each CSV row:

1. Open the generated JSON record named by `relativePath`, `collection`, and `identity`.
2. Confirm the `srd` record against SRD 5.1 or the `srd52` record against SRD 5.2.1. For an
   `approved-dependency`, confirm the allowlisted official section and reason.
3. Inspect the complete transformed record, including nested entries and mechanical expansion
   fields. A matching name is not sufficient provenance.
4. Record the official PDF page/section in `officialLocation`, set `reviewStatus` to `approved`, and
   add any material explanation to `reviewNotes`.
5. If any field cannot be traced, change the extractor or add a narrow, reasoned exclusion. Do not
   approve the row. Regenerate and review the new hash.

Reviewers must explicitly reject D&D Beyond Basic Rules-only text, non-SRD supplements, setting
material, product art, logos, trade dress, and presentation assets. The Creator FAQ distinguishes
the D&D Beyond Basic Rules from reusable SRD content.

## Invalidate stale review work

Regeneration may change record hashes. A prior approval applies only when `relativePath`,
`collection`, `identity`, SRD version, and `recordSha256` are unchanged. Re-review every changed or
new row, and account for every removed row before accepting the new artifact.

## Promote an approved pack

Only after content and notice review is complete:

1. Set a release pack version, generation timestamp, pinned upstream revision, and
   `approved-for-distribution` status through the reviewed provenance change.
2. Update `THIRD_PARTY_NOTICES.md` with the same pack version. Preserve both prescribed
   attributions, official source URLs, the CC BY 4.0 link, and Tavern Born's transformation notice.
3. Generate the managed snapshot into `resources/srd/core`, then verify it byte-for-byte from the
   same pinned checkout and revision.
4. Run `npm run check:bundle -- --require-srd`. It must verify approval metadata, notices, the exact
   data-file set, every file checksum, and the SRD and combined bundle budgets.
5. Run the full test, build, Electron smoke, offline character-journey, and installer/portable
   inspection gates in the implementation plan before release.

Keep the completed review evidence with the release records. This process is an engineering content
audit and does not replace legal review when one is needed.
