import type { OptionalClassFeatureSourceProof } from '@/types/5etools'
import { createDeclarationSourceAccess } from './declarationSourceAccess'
import generated from './optionalClassDeclarationRules.generated.json' with { type: 'json' }
import type { OptionalDeclarationRule } from './optionalClassDeclarationStructure'

export const OPTIONAL_CLASS_DECLARATIONS =
  generated.relations as unknown as OptionalDeclarationRule[]
const access = createDeclarationSourceAccess(
  OPTIONAL_CLASS_DECLARATIONS,
  'declaration',
  (catalog) =>
    (
      (catalog as { optionalClassFeatureSources?: OptionalClassFeatureSourceProof[] })
        .optionalClassFeatureSources ?? []
    ).filter(
      (row): row is OptionalClassFeatureSourceProof & { kind: 'declaration' } =>
        row.kind === 'declaration',
    ),
)
export const auditOptionalClassDeclarationSources = access.audit
export const getCurrentOptionalDeclaration = access.current
export const mergeOptionalClassDeclarationSources = access.merge
