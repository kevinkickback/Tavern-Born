# Bundled SRD Core Pack

This directory contains Tavern Born's approved, read-only SRD 5.1 and SRD 5.2.1 data pack.

- `data/` contains the reviewed 5etools-compatible JSON consumed by the normal game-data loader.
- `manifest.json` identifies every packaged data file by SHA-256 checksum and records the source
  documents, upstream revision, transformation coverage, and pack version.
- `provenance.json` pins the official documents and records the completed one-time audit.
- [PROVENANCE.md](PROVENANCE.md) summarizes that audit and the original packaging verification.
- `THIRD_PARTY_NOTICES.md` contains the prescribed attributions, source links, license, pack
  version, and Tavern Born transformation notice.

The release and bundle-budget checks require an `approved-for-distribution` manifest, verify that
the packaged data-file set exactly matches the manifest, validate every checksum, and confirm that
the notices agree with the manifest and provenance. The original source-conversion and PDF-review
tools were intentionally removed after the approved 1.0.0 snapshot was materialized. Future fixes
should be deliberate edits to this curated pack, followed by manifest checksum updates and the
normal bundle, parser, and application test gates.
