# Class and subclass feature ingestion

Read this reference only when changing this contract. Start with the [topic index](../README.md).

Class-feature references decode the pinned upstream
[`DataUtil.class` UID contract](https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js)
through `classFeatureIdentity.ts`. Resolution includes feature name, owner class name/source,
positive integer gain level and feature source. Empty packed class sources default to PHB; empty
feature sources default to the decoded class source, independently of the surrounding class.
Whitespace/case normalization does not change the retained raw UID or subclass-gain flag. An absent
exact target or incomplete UID remains unresolved; another owner, level or printing cannot supply
it, and a resolved record never rewrites the reference's encoded identity. Source-stack composition
uses the same identity codec for overlays and can resolve an absent target later using the retained
identity, including upstream default source fields. Incomplete reference fields remain unresolved
after layering. Embedded targets absent from the completed catalog are cleared, and their owning
class rules are rebuilt before required-reference validation. Choice owners and option references
use the resolved feature source, falling back
to the decoded UID source for omitted or blank target sources before considering the enclosing
class source.
This contract covers class-feature ingestion; global search/display lookups and stored-feature
consumer identities have separate compatibility requirements. Class ASI, expertise, subclass
selection, automatic class actions, and feature-owned choice gain levels use the same codec:
a complete encoded UID supplies the level
even when materialized metadata disagrees. A malformed nonempty UID cannot gain a level from
metadata or display text. Rows without a UID may use an explicit positive integer numeric level,
or the attached feature level when that field is absent. Subclass selection retains its legacy
level-three default only when there is no class-feature reference marked for subclass gain;
a marked reference with an invalid level remains unknown and cannot enable a selection. Readiness
navigation for an unavailable selected subclass omits the level when it is unknown.
Subclass references retain their separate layout and normalization contract.

The global `classFeaturesByKey` dictionary uses the same complete identity as ingestion and layers.
Incomplete records are retained under opaque catalog-local keys, which are not valid feature UIDs.
Stored features with only name/source may enrich their descriptions from exactly one matching
catalog record. Multiple owner/level matches preserve saved text; they cannot select a printing or
fall through to an optional feature. Actions and PDF use this shared description projection.
Standalone saved feature actions retain their own IDs; description enrichment cannot attach them
to or suppress an earned class/subclass action. Qualified class choices retain complete target UIDs
and actual granting owners. Their actions require exact parsed rules and share stable structural
groups only within the same owner and feature family. Missing or ambiguous targets remain saved
intents without emitting opaque source-backed actions. The [provenance contract](../provenance.md)
owns grouping, manual override and restoration behavior.
A parsed-cache rebuild covers normalized class choices/schedules, lookup dictionaries and race/subrace normalization together.
For a declaration with no packed UID, direct, filtered and creature choice provenance retains the
complete materialized target in canonical UID order. Explicit reference fields override attached
metadata; selected class/subclass ownership never fills a missing target parent. The raw reference
stays unchanged. Incomplete materialized identities and malformed nonempty UIDs remain unverified.

## Composition and subclass presentation

Class/subclass choice options preserve their complete encoded feature UIDs through normalization
and exact catalog resolution. Dependency and capability audits check every owner, gain and printing
field rather than only `name|source`. A complete feature UID supplies its encoded or upstream-default
printing when the duplicated source is absent or blank; explicit source/name conflicts remain
unresolved. Other choice types still require an explicit source. Subclass feature parsing shares
the same UID defaults and complete identity codec. Every target field, including class, subclass
and feature printing, must match the declared UID. A copied subclass may have a different selected
class owner while retaining the exact original target; this does not relax target identity. An absent
printing stays unresolved, including inline references, intro text and level groups. Subclass intro
and level content come only from declared references; unreferenced raw rows are never synthesized
into subclass content or target catalogs. Content-layer collection and restoration use this same
complete identity, including omitted/blank upstream defaults; non-string sources are invalid and
selected owners do not supply target source fallbacks. Intro entries share one declared-reference
projection across parsing, composition and source filtering. The original intro UID remains its
target even when filtered out; another printing or gain cannot replace it. Subclass detail selection
retains its qualified owner/printing and derives content from the current filtered catalog. The panel
renders expanded intro references once within their level group; an exact target displayed as a
level feature is excluded from nested expansion. Different gains and printings remain distinct,
and the authoritative features retain their mechanical choices and Actions.
Changes to target identity/intro projections require a parsed-cache rebuild.

## Internal subclass-feature copies

Class documents materialize internal subclass-feature copies through the shared data-only copy
resolver before reference expansion and rule normalization. Production loading prepares the document
once for its class and class-feature projections; direct parser entry points use the same boundary.
Copy parents match all seven identity fields, with established source defaults and case/whitespace
normalization. Structural keys keep literal delimiters distinct; multiple exact parents are ambiguous.
The copied feature retains its own owner/gain while inherited nested references keep their original
targets. Local overrides, null removal and explicit upstream preservation rules apply without mutating
source data. Missing, invalid, ambiguous, cyclic or unsafe copies fail the required class resource;
foreground loads and background refreshes cannot replace complete memory/cache with that partial result.
Feature wildcard/template transformations are unsupported and fail explicitly. Existing explicit
shared copy operations retain their supported semantics. External cross-file feature-copy dependencies
and class-feature copies are outside this adapter's scope.

A parsed-cache rebuild restores previously empty copied bodies; saved character format11 is unchanged.
Restored text and nested declarations flow into the existing catalogs, Actions and PDF projections.
Materialization does not itself implement prose-only choices or qualify complete character journeys.

## Source-backed feature options

The exact PHB Dragon Ancestor target supplies a choose-one Draconic Ancestry selector through
the existing class-choice modal and shared SelectionModal. Rows and damage types come from the
resolved source table, including supported tagged damage cells. A saved `feature-option` selection
uses `featureOption` references: a JSON tuple of parent kind, complete canonical parent UID,
table and row. The actual selected subclass owner and earned level belong to the choice ID;
a copied owner never changes the encoded PHB target.

Only the current earned declaration and authoritative filtered owner catalog can verify a row.
Equivalent producer copies agree; conflicting, malformed, missing or filtered source data cannot
borrow an embedded/raw fallback. Audited source uncertainty is computed after copy materialization
and before first-match enrichment. Derived uncertainty metadata is excluded from action rule identity.

Builder, readiness, retained Overview details and both PDF summaries share this resolution.
They display the selected damage type and, once earned and source-verified, Elemental Affinity's
conditional Charisma bonus to one damage roll and optional one-sorcery-point, one-hour resistance.
Description-off summaries retain the selected name and verified damage type; unavailable rows
contribute no related context. They omit conditional rule prose.
They do not materialize an action, permanent resistance or a universal spell bonus. Fixed language,
interaction and Draconic Resilience rules retain their existing source presentation.

Missing source rules retain saved intent. Even a wholly pruned declaration produces a routed
restore-or-remove state for an existing saved selection. The same modal permits keeping/removing
saved rows without inventing a quota or replacement pool. Exact restoration verifies the original
selection; opening, Cancel and unchanged confirmation preserve its saved spelling, timestamps and
dirty state. Confirmation rechecks current source options. Clear/subclass removal/level rollback
retract only this owner's intent and preserve independently owned benefits.

This additive category uses character format11 and parsed cache43. Strict admission validates
the saved tuple/category/owner/slot relation without a catalog; live rules still govern entitlement.
Natural Explorer uses the separate literal-group boundary below; general passive automation remains outside these adapters.

## Required setup diagnostics

Normalization reports a bounded set of source-audited mandatory setup gaps: unavailable or
unverified Storm Aura/Natural Explorer declarations, PHB Ranger Favored Enemy, TCE Deft Explorer/Canny
and Mystic Psionics. Unsupported families remain diagnostic; unavailable Storm rules stay unverified.
Diagnostics never synthesize selectors or guess option counts. A retained known
UID with absent, conflicting or changed source rules reports unverified setup instead. Exact target
identity remains separate from the selected owner; nested diagnostics begin at the earliest reachable
grant after all enclosing levels are met. Unselected options are not earned declarations.

Builder and Review/readiness share active diagnostics and the filtered feature catalog. A known
Ranger base warnings remain until an exact explicit optional adoption governs their family.
An adopted missing-source replacement reserves its original and creates one restore-or-clear root
obligation, avoiding duplicate domain duties. The shared catalog retains repeated complete
class-feature identities for this audit before its lookup projection. Verified adopted Deft Explorer
supplies the Canny requirements below; current-root vocabulary failures keep their domain recovery. These
diagnostics do not change selections, benefits or character saves. Capability reports retain
all normalized gaps independently of a character's optional-feature toggle.

This detector covers retained, unconditionally reachable declarations. Fully pruned declarations or
unavailable enclosing features are not reconstructed. Other prose-only requirements and complete
choice coverage remain unqualified; zero diagnostics is not a completeness certificate.

## Storm Aura environment

The exact XGE Storm Aura declaration supplies one environment choice using real Desert, Sea or
Tundra subclass-feature UIDs at level 3. This bounded adapter derives its count from the audited
choose-one declaration; other countless options groups remain presentation. PHB and copied XPHB
Barbarian owners retain the original PHB targets. Both the declared intro-to-Aura path and its
current owner-scoped source parents must qualify before any option is eligible. A structured
`subclass-options:` ID binds the
actual owner, exact Aura target, environment group and earned gain. Strict admission checks this
new saved relation without requiring live catalogs; these relations remain additive within character format 12.

One choice governs earned Storm Soul, Shielding Storm and Raging Storm. Shared filtered source
resolution supplies Builder, readiness, retained details, calculations, Actions and both PDF
families. Raw duplicate conflicts are audited before first-match enrichment.
The finite adapter qualifies all 14 source bodies with audited canonical SHA-256 fingerprints
and a top-level shape guard, including every duplicate producer before enrichment. Ordered source
rules and references are preserved; attached enrichment and recomputed audit metadata are ignored.
Unknown text, extra rule fields or a new source revision remain unverified until explicit re-audit,
even when some familiar phrases remain. The digest table distributes no source rules prose. Absent, empty,
changed or ambiguous rules preserve intent while retracting affected benefits and reporting an
unverified stage. The existing shared modal handles unchanged Edit, Cancel, replacement, Clear
and removal-only recovery even after the declaration is pruned. Confirmation rechecks availability.

Verified Storm Soul derives the selected resistance and Sea swimming speed through existing
character effects; independent faster movement, overrides and other grants retain their ownership.
Underwater breathing and extreme-temperature protection stay selected source context. Shielding
Storm describes chosen allies' conditional resistance in the aura. Aura supplies its bonus action;
Desert/Tundra Soul supply actions, Desert/Sea Raging supply reactions, and Tundra Raging augments
Aura's activation context. No future or alternative environment benefit is granted.

Action IDs use actual owner, selected real target and genuine source structure. Aura combines
parent and selected child source rules; later display context and character level do not change
its ID. Exact manual overrides and PDF action preferences remain bound through source loss and
restoration. Combat activation, damage, temporary hit points, target/ally state and duration
application remain player-managed. This adapter does not certify complete class automation or
complete legal progression coverage.

## Natural Explorer favored terrain

The exact PHB Ranger Natural Explorer pool supplies eight source literals, without fake terrain
entities or a table. Its level 1 grant and exact level 6 and 10 improvement declarations each earn
one independent choice. A `feature-literals:` ID binds actual owner, complete pool target, group,
complete grant target and earned level. The `featureOption` reference is the JSON tuple
`["source-group","classFeature",completePoolUid,"favored-terrain",canonicalTerrain]`.
Existing table-option and Storm identities remain unchanged. Offline admission validates the full
relation, exact slot, one pick and distinct gains/terrains within the same owner's pool and group,
including dormant records; current declarations still determine entitlement.

Four bounded source bodies (pool, both improvements and TCE Deft Explorer) qualify through full
ordered fingerprints and top-level shape guards. Every raw class-feature producer is audited
before first-match enrichment, including documents without subclasses. Unknown semantic fields,
nested changes or conflicting duplicates remain unverified. Equivalent audited pool/grant copies
may agree; the optional replacement must be singular. Current explicit empty catalogs remain
absent. A missing base invalidates the family; a missing later improvement affects that gain only.

The exact PHB Ranger Deft Explorer1 adoption suppresses that owner's terrain family while permission
is ON. Missing/empty adoption leaves standard terrain active. Adopted source loss retains the family
reservation; OFF or exact Clear restores eligible standard choices. Exact source restoration while
ON reactivates the prior adoption. Other explicitly declaring owners remain independent. A shared
effective selection view derives activity; saved inactivity is only a hint. Reads never write saves.
Authorized commands reconcile persisted hints; unchanged confirmation preserves saved bytes.
Dormant intent retains names and gains marked
Inactive, with no eligible options, conditional facts, quota or recovery demand.

Builder, readiness, Overview, source/availability checks and both PDF families use these boundaries.
Unavailable grant warnings keep complete target and earned-level identity in navigation and list keys,
including explicit enclosing declarations that earn distinct targets at the same level. A saved
recovery replaces only its matching owner/grant/earned warning; unsaved gains remain unresolved.
Selected summaries keep conditional Intelligence/Wisdom proficiency and the full hour-or-more
travel qualifiers once per owner family, omitting alternative terrain names and future instructions.
Compact exports retain selected terrain names, gains and activity. The gain 6 Favored Enemy/language
paragraph does not become a terrain benefit. No global expertise, movement, resistance, travel state
or action is granted; other conditional Ranger prose retains its source presentation.

The shared selector handles Choose/Edit, unchanged confirmation, Cancel, per-gain Replace/Clear
and removal-only recovery after source/class loss. Confirmation validates current source authority
and distinctness against the latest character. Other earned gains and independent/manual grants
survive replacement/removal. These relations remain additive within character format 12; parsed cache invalidation rebuilds
normalization and source audits. Complete Ranger automation and legal levels 1–20 remain unqualified.

## Canny proficiencies

The exact `Deft Explorer|Ranger|PHB|1|TCE` declaration supplies Canny's one existing skill proficiency
for doubled proficiency and two additional languages. It reuses the complete TCE body/shape audit
above and requires one current producer and one unconditional retained declaration. Explicit target
fields must agree with the UID. Source candidates retain enclosing gains; the current PHB Ranger
actor adapter requires the reviewed native gain1 adoption/declaration. Moving the same target into
an invented wrapper does not certify a new adoption gain. Unselected options do not confer entitlement.
The selected class owner remains separate from the TCE feature target.
Absent, changed, conflicting or ambiguous authority cannot verify new selections.

The general `proficiency` choice kind stores intent in `classChoiceSelections`. A canonical
`feature-proficiencies:` ID binds actual class owner, complete granting feature, expertise/languages
domain and earned level. Named option references use `["proficiency",domain,canonicalName]`, with
no invented printing. Proficiencies are semantic names: equivalent PHB/XPHB language rows deduplicate.
The filtered skill/language vocabulary is explicit authority, including empty catalogs. Existing
language policy applies: language type and player/DM permission context remain visible; the picker
does not certify every offered language as legal in a particular campaign.

Canny grants no underlying skill. A new language cannot already be independently known; later
independent overlap preserves the saved Canny intent. Existing expertise stays doubled, never
quadrupled. Remaining pooled expertise slots count only manual or untracked expertise; removing a
manual owner through overlap frees its slot while Canny or a feat can keep the benefit. Clearing
Canny retracts only its own tags and preserves independent grants and the sibling choice domain.

Pure commands recheck current source authority, eligibility and quotas, then apply intent and
owned materialization atomically. Read projections strip owned tags before recomputing effective
benefits. Proficiency-only edits and recovery preserve unrelated features and the supplied feature
ownership ledger instead of rebuilding other selected features. Read projections never invent manual
ownership or write saves. Source loss or optional deactivation
suspends Canny benefits; exact restoration reactivates retained intent. Underlying skill loss
suspends only that expertise. Builder/readiness, skill modifiers, Languages/Sources, Review and
both PDF families use the same effective character and provenance. Shared Choose/Edit/Cancel/Clear,
unchanged confirmation and removal-only recovery preserve these boundaries. Canny is passive and
introduces no action or new generic prerequisite semantics.

These relations remain additive within character format 12. Offline admission validates the reserved identity, owner,
domain, slot, quota and bidirectional applied-tag relation while allowing unavailable intent without
applied tags. [Parsed cache invalidation](../data-ingestion.md#cache-compatibility) rebuilds source
normalization. Adopted TCE Roving/Tireless visibility follows the earned child activity above;
their movement/resource automation, Favored Enemy setup and complete Ranger progression remain
separate mechanics boundaries. Revised XPHB Deft Explorer keeps its standard selectable rules.

## Rogue Expertise and pending setup

The four audited Rogue Expertise targets (PHB and XPHB, levels 1 and 6) use the existing shared modal
and controller on Class. Proficiencies also edits the same source-owned choices through a skill's
Expertise circle. Each gain keeps its
own quota of two. Class shows progress and a link to underlying proficiency setup. Empty or partial
choices can remain pending; navigation and ordinary proficiency selection never force a modal.
Links preserve exact owner, printing, gain and choice ID. Class's proficiency reminder appears only
while actual proficiency choices remain. Cancel and visits do not write; partial confirmation, unchanged Edit, Clear and source-unavailable
removal preserve the existing owned-choice boundaries.

PHB allows proficient skills and proficient thieves' tools within one shared quota. Level 6 chooses
more proficiencies distinct from that owner's earlier gain. XPHB allows proficient skills only and
excludes new picks already granted by manual, feat or other current eligible owners, following its
linked Expertise rule. Established intent excludes its own contribution while editing and does not
mutually suspend independent current contributors. A later gain still cannot repeat its own earlier gain.
No selection grants the underlying skill or tool proficiency, and overlapping expertise stays x2.

Each target requires one complete audited body/shape and one unconditional retained declaration.
Explicit fields must agree with the UID; actual selected owner and target owner remain separate.
Empty filtered authority, conflicting producers or changed rules fail closed. Existing Canny IDs,
three-part named option tuples and modal flow stay compatible. PHB Rogue tools use the explicit
`["proficiency","expertise","tool",canonicalName]` tuple. Format 11 strict admission validates its
owner, target, slot, quota and applied provenance. Parsed cache 47 rebuilds the adapters.

All registered selectable class targets stop contributing legacy pooled additions, independently
of current source availability. Unregistered printings retain their pooled behavior. Existing
manual/untracked expertise remains removable and is never allocated to a guessed Rogue gain.
Missing source or proficiency retains intent and suspends the dependent benefit; restoration
re-evaluates it. Intentional class removal, replacement or level-down removes the removed gains.
Tools badges/details, Sources/Review and both PDF families use effective ownership. Custom 2014
keeps narrow tool names and writes named tool expertise mechanics before defensive Extra Notes.

Skills show one larger Expertise circle, filled only when effective expertise applies, independent
of ordinary proficiency. An empty circle with one permissible add or a unique removal updates its
actual owner immediately. Multiple actions, or any add on an already-filled circle, require an
explicit source chooser; opening or dismissing it makes no change. Adding another source spends
that source's allowance and leaves the circle filled. Removing one contributor preserves the others.
Class/Feat editors reopen the same saved choices. Skills has separate proficiency and Expertise
remaining-choice counts. Expertise counts source quotas once, subtracts retained skill/tool intent,
and does not promise that every remaining choice has an eligible skill yet. Sources uses the same
short source-type notes as other proficiencies (class, feat, and so on), with selected skill/tool and
retained inactive state. The source chooser retains exact feature/feat, printing and owner/gain labels. Legacy
pooled/manual controls remain separate and do not acquire guessed Rogue ownership. Within each
selectable Proficiencies category, unselected entries excluded from every remaining pool are muted
while that category has choices left. Once those choices are filled, normal styling returns.
Rows reserve a consistent leading slot for contextual choice/check/removal and granted/lock icons;
other rows leave that slot empty instead of showing a default category icon. Skill columns have a
small gap to keep each Expertise circle visually attached to its own skill. Empty circles are muted
whenever no permitted action exists for that skill, including exhausted allowances and ineligible
skills; filled circles remain visible. The one-time Expertise hint only explains clicking the
circle to add or remove Expertise. It follows actual circle actions, including owned class and
feat choices, rather than legacy slot capacity alone, and retains its saved dismissal.

## Other selectable class Expertise

Bard PHB (3/10) and XPHB (2/9), Expert Sidekick TCE (3/15), Ranger XPHB Deft Explorer (2) and
Expertise (9), and Wizard XPHB Scholar (2) use the same owned choices and shared controls. Each
gain retains its own count. Later Bard/Sidekick gains choose additional skills distinct from the
same owner's earlier gain; revised Expertise also excludes new picks already doubled by other
owners. Scholar chooses one proficient skill from its tagged six-skill list. Revised Ranger's
Deft Explorer keeps one Expertise choice and two language choices separate; its languages come
from the referenced Chapter 2 Standard/Rare tables and cannot already be independently known.
Revised Ranger base features remain available with optional class features OFF.

`scripts/generate-class-proficiency-rules.mjs` derives a reviewed mechanical checkpoint from
complete supported source clauses, identities, metadata and tagged pools. The data does not provide
structured Expertise grants, so closed prose adapters are necessary; unsupported fields, wrappers,
clauses and duplicate producers stop generation. The linked revised Expertise rule and language
tables are versioned development-time inputs, including ordered digests and full consumed-input
hashes in `scripts/generated/class-proficiency-inputs.json`. Run the generator with `--check` to
detect dependency drift even when resulting choices are unchanged. Regeneration requires normal
code review. The application never regenerates trusted rules on load: current complete granting
feature bodies/declarations and filtered skill/language vocabulary retain their existing runtime
authority. Loading full book text is not required for these base-class mechanics. Strict offline
admission also checks restricted skill/language pools, including retained inactive intent.

These selectable adapters do not implement fixed proficiency grants, automatic tool doubling,
conditional Expertise or optional Expertise replacement timing.

### Paired subclass proficiency and Expertise

Both source printings of Blessings of Knowledge share the same modal and skill-circle controls.
Each of the two skill choices grants proficiency and Expertise together from the selected subclass;
it needs no prior proficiency. Its tagged skill pool comes from the feature declaration. The PHB
printing separately allows two languages; FRHoF separately allows one artisan-tool proficiency.
Already-proficient paired skills and tools are allowed. FRHoF's linked Expertise rule excludes new
already-doubled skills, while established independently overlapping owners remain effective at x2.

The generator discovers actual full subclass owners through production copy preparation and UID
paths. Root/copy/ancestor certificates bind complete ordered raw declarations and their unique source
occurrences before first-match projection. Current selected parent/root uniqueness, filtered owner
candidate indexes, original intro, exact enclosing gain and every explicit UID field must still agree.
Filtered declarations may retain an ordered subset; empty references or scoped catalogs cannot be
replenished from retained details. Conservative root metadata changes suspend these grants until the
checkpoint is regenerated and reviewed. The development-only ancestor semantic adapter binds complete
materialized parent features separately: ordinary generation reads it without rewriting it, and new
parent prose, conditions, wrappers or targets require independent source review before an adapter
update. Leaf mechanics still require the closed source grammar. Parsed audit evidence stays in the
catalog, never the character.

Existing two-field class owner IDs remain unchanged. Subclass proficiency IDs add full selected
subclass name/source to the owner tuple independently of the target UID's short name/printing.
Applied paired choices require both exact choice-owned tags and both materialized values; fully
dormant saved intent remains valid. Tags use the actual subclass source, and Sources labels it subclass.

One shared projection strips cached class/feat contributions, applies current paired foundations and
sibling domains, then derives feat and class Expertise. Source or skill loss removes the pair and
dependent Expertise in one projection; exact restoration reactivates the same saved intent. Intentional
class/subclass or earned-level removal clears only that owner's choices. Independent grants survive.
The artisan pool comes from the referenced structured item group and qualified members, intersected
with the current filtered concrete artisan-tool vocabulary. Losing the final equivalent tool printing
suspends that tool only. Class progress, circles, commands, readiness, Review and PDF use this authority.
If a known selected printing's required source cannot qualify before setup, Class and readiness show
an unverified-source warning at the certified gain. A saved recovery for that full owner/target/gain
replaces the same warning; source absence never silently certifies the setup as complete.

Five audited one-skill feat declarations use selective Expertise-only writes: Boon of Skill XPHB,
Echoing Soul RHW, Prodigy XGE and Skill Expert TCE/XPHB. Complete printing, declaration, skill boundary
and ordered rules body are checked; changed/ambiguous/missing current authority permits recovery
but no new pick. All require real proficiency without existing Expertise for new picks. Ordinary,
bonus, class, provenance-choice and fixed owners stay separate; fixed providers sharing one saved
option key share one allowance. Expertise never grants underlying proficiency. Old coupled records
remain narrowly admissible, but their implicit skill grant cannot authorize itself. Current source
or proficiency loss suspends the benefit without deleting intent; exact restoration re-evaluates it.

Inline feat changes preserve sibling setup. Partial options, including an empty object, stay pending;
Complete/Edit prefill the exact owner's saved options and reject stale Finish snapshots. Expertise
eligibility uses the real proficiency pool after the proposed skill edit, preserving independent
contributions and excluding old implicit self-grants. Current completion/readiness requires the exact
owner's contribution to apply; retained unavailable intent remains incomplete. The bounded feat
editor recognizes declared any-skill choices for these sources. Fixed Expertise is not a free choice.
Broader feat parser coverage and Echoing Soul's conflicting structured/prose skill counts and rest
replacement timing remain separate qualification gaps; this adapter does not claim their completion.
Other feat families retain their established setup, admission and benefit behavior. Shared domain
Edit/Clear retract the addressed current owner's actual saved setup; caller snapshots are not removal
authority. Class option display and admission use the same current feat authority, including an
explicit empty catalog, while saved intent and ownership remain persistence authority.

Feat URLs carry a read-only canonical owner focus tuple as well as the complete feat printing.
Ordinary, bonus, class-progression, provenance-choice and fixed-provider contexts stay distinct;
fixed setup retains its existing shared option key. Current owner membership and agreeing explicit
name/source fields validate focus. Removed or conflicting owners cannot borrow a same-name copy.
Query changes focus the exact current card and correct group without opening a modal or writing
intent. Owner-agnostic detail links keep their existing meaning. No new saved field is introduced.

The optional setting supplies permission for [individual source-backed adoptions](class-ownership.md#individual-optional-class-features).
Exact adopted declaration/choice routes govern effective rows, nested bodies, details and Actions.
OFF suspends those optional routes while preserving setup and eligible originals. Raw candidates,
independent stored features and independently granted optional-feature entities keep their own
authority; a source, matching name or general `Optional Rule` prefix cannot create adoption rights.

### Fixed skills and automatic tool Expertise

Scout Survivalist grants its tagged Nature and Survival proficiency and Expertise without spending
an Expertise choice. Legacy Royal Envoy grants Persuasion proficiency and Expertise independently of
its fallback setup. Both PHB and copied XPHB parent owners keep the original legacy leaf identity;
their complete current selected subclass, original intro and earned path remain required. A direct
Royal declaration at level 7 does not invent an entitlement through the level-3 intro.

Royal's Class setup asks whether Persuasion was already proficient when the feature was gained.
An absent answer remains pending; current Persuasion never supplies historical evidence. A confirmed
false answer retains an empty setup record with no fallback capacity. True permits zero or one
ordinary skill from the feature's tagged fallback pool, including an independently known skill.
Clearing that skill retains the answer; correcting the answer removes only its former fallback.
Filtering sources retains inactive setup, while intentional subclass/earned-level removal clears it.
Re-earning requires a new explicit answer. This is an additive, narrowly validated format-11 relation.

TCE Artificer Tool Expertise doubles checks with every currently proficient concrete mundane tool.
It grants no tool, item or selectable slot. The shared current vocabulary uses production-resolved
item sources from the filtered item/base-item catalogs, including artisan tools, gaming sets,
instruments and kits. Equivalent printings share a proficiency name; magic item names, groups,
unknown manual names and generic tool labels do not qualify. Removing the final eligible printing
suspends only that tool's automatic Expertise, preserving its independent proficiency.

Tool source preparation retains raw copy context through supported presentation enrichment and
parsed-cache reopening. A development-only semantic certificate excludes the enchanted LLK gaming
set whose copied mundane fields alone cannot classify its added magic rules. Ordinary generation
never rewrites that certificate; unfamiliar otherwise-eligible copy semantics require review.
Runtime uses exact source evidence, with no name or prose guessing.

Fixed ownership uses `feature-fixed-proficiencies:` with a canonical full owner/target/earned-level
tuple. Strict reopening checks the finite source-derived relation, exact domains and attributed
skill/Expertise pairs; independent tags cannot complete a missing fixed half. Automatic tool tags
also require the underlying saved tool proficiency and an offline recognized name. These tags grant
no removable choice. The shared projection applies fixed and paired foundations before dependent
Expertise, and commands preserve genuinely preexisting manual owners before first fixed ownership.
Class progress, circles, Sources, calculations and both sheet editions share the resulting values.
Conditional benefits remain separate from unconditional Expertise.

### Conditional proficiency checks

Fire Rune, legacy Dragon Ancestor and Natural Explorer contribute qualified, player-applied check
notes through the calculation context. They grant no skill/tool proficiency, unconditional Expertise,
circle fill, quota or numeric modifier. Sources and Review display active notes; Adjustments can
suppress an exact note. Suppression survives source absence and restoration without saving derived rules.

Fire requires the current certified Rune Knight/Rune Carver path, exact Fire Rune printing and a legal
native Runes selection, including earned slot multiplicity and current eligibility. Partial selection
is sufficient. Knowing the rune does not establish wearing or carrying an inscribed object; its full
condition remains visible. The native Runes chooser retains its existing setup/replacement behavior;
this note does not implement inscription state or historical gameplay replacement events.

Legacy Dragon Ancestor requires its actual current full owner and earned intro/path, including the
XPHB-parent level-3 intro that reaches the legacy level-1 leaf. Its Charisma-check note applies when
interacting with dragons and proficiency applies, independently of ancestry damage-table setup.
Natural Explorer aggregates only active, available selected terrain gains; its INT/WIS proficient-skill
clause is independent of the separate hour-travel rule. The terrain family ID stays stable as the
selected terrain list changes. Existing optional replacement/dormancy policy still governs terrain.

Current raw/copy/ancestor certificates remain authoritative. Fire occurrences are audited before
lookup/layer collapse, distinguishing agreeing mirrors of one origin from competing raw producers.
Explicit empty current optional collections/candidate indexes remain empty. Development-only complete
leaf/ancestor meaning and the admitted conditional owner/intro/path closure are read-only inputs to
ordinary generation; new qualifiers, wrappers, owners or canonical duplicate producers require review.
Derived note targets and their reserved IDs are inadmissible in saved manual effects.
Conditional certificate uncertainty stays separate from the ancestry table's own source audit.
A supported ancestry table can remain selectable when its independent conditional-note proof is
unavailable; conflicting table producers still disable that table. Older proficiency audits retain
their existing conflict behavior, including any shared consumed target.
