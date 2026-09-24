# Bundled SRD Provenance Record

Tavern Born's bundled SRD 1.0.0 pack completed its one-time provenance audit on 2026-09-20.
The approved snapshot was produced from 5etools v2.35.1 at commit
`e5d052071b635f58cc8006e9727053eaf78ea8f9` and compared with the exact official English SRD 5.1
and SRD 5.2.1 documents pinned in `resources/srd/core/provenance.json`.

The final audit covered 3,102 distributed records:

- 2,672 records matched normalized official text automatically;
- 430 records used 530 reviewed, hash-bound representation exceptions for structured rows,
  source tags, or PDF layout that could not be matched contiguously;
- 0 records and 0 evidence fragments remained unresolved;
- 0 approvals were stale.

The review corrected or removed non-SRD material rather than approving it. This included book-only
sidebars and references, setting-only text, catalog metadata, protected-name variants replaced by
their official SRD names, incorrectly marked 2024 trade goods, supplemental deity domains,
full-book equipment descriptions, and source wording that differed from the official documents.
It also verified the generated magic-item families, equipment tables, class references, and the
complete source-qualified record inventory.

The full transient audit report had SHA-256
`9348df6e2bb205c5533b9409fb6fb22b599a4d3b6e1b2f678fdaeb531e8e58a2`. Its compact result is
retained in `provenance.json`; the exception queue, source converter, PDF audit, and review-only
fixtures were removed after the approved snapshot was reproduced byte-for-byte.

Release validation now protects the reviewed bytes directly. `manifest.json` lists every bundled
JSON file and checksum. `npm run check:bundle -- --require-srd` rejects missing, extra, changed, or
unapproved bundled files and verifies that the packaged legal notices match the manifest and
provenance. The committed corpus test also loads the pack through Tavern Born's production parser
and checks its normalized capabilities.

The one-time native packaging verification completed successfully on 2026-09-21 for commit
`bb3e3a7`. [GitHub Actions run 35570457115](https://github.com/kevinkickback/Tavern-Born/actions/runs/35570457115)
built unpublished Windows, macOS, and Linux packages, verified the exact 50-file SRD manifest and
checksums, confirmed that development-only `data/` files were absent, and completed the Included
SRD application journey on every platform. The temporary verification workflow and its supporting
code were removed after this successful run.

This technical provenance review is not a substitute for legal advice. The retained authoritative
references are:

- <https://www.dndbeyond.com/srd>
- <https://www.dndbeyond.com/creator-faq>
- <https://creativecommons.org/licenses/by/4.0/>
