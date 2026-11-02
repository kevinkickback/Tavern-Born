import type { ClassSpellRoute } from '@/types/spellRoutes'

/** Data-only static SourceUtil/Parser policy, pinned 5etools b9061583 utils.js:608 and parser.js:4056.
 * Joined plain class filters exclude nonstandard sources; browser Brew/Prerelease registries and
 * decorated class-filter labels are outside this actor's supported grammar. No feature registry. */
const nonstandard = new Set([
  'aatm',
  'aitfr',
  'aitfr-avt',
  'aitfr-dn',
  'aitfr-fcd',
  'aitfr-isf',
  'aitfr-thp',
  'awm',
  'azfyt',
  'bqgt',
  'coa',
  'dod',
  'gotsf',
  'hat-lmi',
  'hat-tg',
  'hbtd',
  'hfstcm',
  'imr',
  'lk',
  'llk',
  'lr',
  'mabjov',
  'mcv3mc',
  'mcv4ec',
  'mff',
  'mgelft',
  'mismv1',
  'nrh',
  'nrh-ass',
  'nrh-at',
  'nrh-avitw',
  'nrh-awol',
  'nrh-coi',
  'nrh-tcmc',
  'nrh-tlt',
  'oga',
  'pip',
  'rtg',
  'sads',
  'scoee',
  'sja',
  'tlk',
  'ttp',
  'uthftlh',
  'vd',
  'xmts',
])
const prefixes = ['ua', 'xua', 'ps', 'mcv']
const standard = (source: string) =>
  !nonstandard.has(source.toLowerCase()) &&
  !prefixes.some((prefix) => source.toLowerCase().startsWith(prefix))

export function matchesJoinedSpellClassFilter(route: ClassSpellRoute, classes: readonly string[]) {
  return (
    standard(route[4]) &&
    (route[5] === 'class' || (route[6] !== null && standard(route[6]))) &&
    classes.some(
      (name) => name.trim().toLowerCase() === route[3].split('(')[0].trim().toLowerCase(),
    )
  )
}
