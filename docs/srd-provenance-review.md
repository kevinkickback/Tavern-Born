# Bundled SRD Provenance Audit

This is the release gate for Tavern Born's bundled SRD data. The generator proves deterministic
selection, dependency closure, output identity, and exclusion policy. The provenance audit then
compares the transformed user-facing passages with the pinned official SRD PDFs and produces a
focused, hash-bound exception queue. Review exceptions rather than blindly approving every emitted
record.

This workflow is temporary, one-time release preparation. Once the first distributable snapshot is
approved and materialized, remove the PDF audit command, source-corpus conversion corrections,
table-reconstruction adapters, exception queue, approvals, and other review-only helpers. Keep only
the finished bundle, its attribution/provenance, and validation needed to ensure the packaged
application ships those reviewed bytes. Future corrections do not require maintaining a
general-purpose SRD update pipeline.

This is intentionally not infrastructure for future SRD refreshes. After approval, future
corrections to the small curated bundle can be made directly and checked against the retained
packaged-byte validation; do not preserve the temporary source-ingestion and PDF-review machinery
for hypothetical updates.

The audit is evidence for the release decision. It does not replace legal review when one is
needed, and an automated match must never be treated as permission to include Basic Rules-only
text, non-SRD supplements, setting material, product art, logos, or trade dress.

## Required inputs

1. The clean 5etools v2.35.1 checkout at commit
   `e5d052071b635f58cc8006e9727053eaf78ea8f9`, outside Tavern Born's managed `data/` directory.
2. The exact English SRD 5.1 and SRD 5.2.1 PDFs pinned in
   `resources/srd/core/provenance.json`.
3. The dependency allowlist and exclusions in
   `resources/srd/core/dependency-allowlist.json`.
4. The reviewed, hash-bound exceptions in
   `resources/srd/core/provenance-exceptions.json`.

The ignored local `data/` directory is useful for development but is not the release input. It was
confirmed to produce the same candidate as the pinned checkout, but it carries no independent
revision identity.

## Generate the candidate snapshot

```text
npm run review:srd -- \
  --source-root .tmp/5etools-src-v2.35.1/data \
  --upstream-revision e5d052071b635f58cc8006e9727053eaf78ea8f9
```

The command writes the transformed candidate, manifest, and legacy row inventory to the ignored
`.tmp/srd-review/` directory. Every emitted record is bound to its transformed SHA-256 hash.

## Run the automated audit

```text
npm run audit:srd -- \
  --srd-5.1-pdf <path-to-SRD_CC_v5.1.pdf> \
  --srd-5.2.1-pdf <path-to-SRD_CC_v5.2.1.pdf> \
  --approvals resources/srd/core/provenance-exceptions.json
```

The audit first verifies both PDF hashes. It strips 5etools presentation markup, normalizes PDF
line wrapping and typography, splits long passages into stable evidence fragments, and looks for
each fragment in the corresponding official document. It writes:

- `.tmp/srd-audit/provenance-audit.json`, the complete machine-readable result with matching PDF
  pages;
- `.tmp/srd-audit/provenance-exceptions.csv`, only records or passages requiring a decision.

Unmatched passages include up to three likely PDF pages ranked by distinctive-word coverage. These
are navigation hints, never automatic approval. The CSV also includes the closest normalized
official excerpt from the strongest candidate page so wording differences can be assessed directly.

An exact normalized match is automatic evidence for that passage. The temporary audit also
reconstructs deterministic weapon, armor, and simple equipment rows from their structured fields
and requires the complete row to appear in the corresponding official table. Generated
magic-item variants are accepted only when their complete transformed record matches a narrow
family representation and the official parent entry and variant row both appear in the PDF.
Shared 5etools item-entry templates are materialized before this comparison rather than shipped as
hidden internal references. Short structured records without an explicit table adapter deliberately
enter the exception queue so they are not silently waved through. The snapshot generator separately rejects unexplained records,
unauthorized source families, prohibited presentation fields, unresolved references, and stale
dependency approvals.

## Resolve exceptions

For every row in `provenance-exceptions.csv`:

1. Open the complete transformed record identified by `relativePath`, `collection`, and `identity`.
2. Compare the unmatched passage and its surrounding structured mechanics with the correct official
   SRD. A matching record name is not sufficient.
3. Prefer fixing the extractor or adding a narrow exclusion when the emitted data differs from the
   SRD. Regenerate and rerun the audit after the fix.
4. When the difference is only a verified representation or PDF-extraction artifact, add an entry
   to `provenance-exceptions.json` with the PDF hash, record hash, fragment hash, exact official
   location, and a meaningful reason.

Approvals are valid only for that document, transformed record, and evidence fragment. Changed text
produces new hashes and returns to the exception queue. Duplicate, malformed, unused, or stale
approvals fail the clean release audit.

Run the final gate with `--require-clean`:

```text
npm run audit:srd -- \
  --srd-5.1-pdf <path-to-SRD_CC_v5.1.pdf> \
  --srd-5.2.1-pdf <path-to-SRD_CC_v5.2.1.pdf> \
  --approvals resources/srd/core/provenance-exceptions.json \
  --require-clean
```

## Promote an approved pack

Only after the clean automated audit and notice review:

1. Set a release pack version, generation timestamp, pinned upstream revision, and
   `approved-for-distribution` status through the reviewed provenance change.
2. Update `THIRD_PARTY_NOTICES.md` with the same pack version. Preserve both prescribed
   attributions, official source URLs, the CC BY 4.0 link, and Tavern Born's transformation notice.
3. Generate the managed snapshot into `resources/srd/core`, then verify it byte-for-byte from the
   same pinned checkout and revision.
4. Run `npm run check:bundle -- --require-srd` and the full test, build, Electron smoke, offline
   character-journey, and installer/portable gates in the implementation plan.
5. Retain the audit report with the release records.
