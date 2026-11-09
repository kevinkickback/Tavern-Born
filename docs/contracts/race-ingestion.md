# Race copies, versions and native spell parsing

The data-only copy engine reads own properties and rejects prototype keys and unsafe paths or
directives. Failed copies cannot alter prototypes or replace a usable catalog. Race parents use
exact name/source. Subrace parents also include race name/source. Missing parents, cycles,
unattached subraces and unsupported rules fail the completed catalog. Raw stacks may defer
resolution until composition.

Versions substitute template values, apply overrides and then run copy modifications. Honor
explicit null removals. Subrace versions compose the exact parent before applying child version
rules. They do not inherit parent version definitions. Complete versions retain their full
mechanics and exact saved identity. Ordinary children keep domain-specific inheritance.
Named race templates are unsupported.
[Pinned upstream copy and version rules](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js) · [Pinned subrace merge](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/render.js)

Native additional spells preserve named suites, abilities, earned schedules and exact fixed or
choice targets. Known, innate and prepared support direct, at-will, ritual and bounded daily/rest
declarations. Daily can use `pb`. Expanded `s0`–`s9` grants list eligibility only. Whole-field
null removes inheritance. Malformed or unsupported supplied blocks fail as a whole. No resource
or rest-use tracking is created.

Spell UIDs default an omitted source to PHB and retain printing and recognized casting modifiers.
Filters require valid class or level constraints. An empty supplied class constraint cannot
become unrestricted. Structural suite and descriptor IDs encode exact owner, grant kind and
usage bucket. Equivalent casing and order preserve identity. Duplicate descriptors reject.
The evaluator activates one valid suite, while the save retains its applied snapshot.
[Native spell parser tests](../../tests/lib/5etools/raceSpells.test.ts)
