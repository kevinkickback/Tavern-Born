/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-does-not-depend-on-ui-or-state',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/(components|hooks|pages|store)/' },
    },
    {
      name: 'production-does-not-depend-on-tests',
      severity: 'error',
      from: { path: '^(src|electron)/' },
      to: { path: '^tests/' },
    },
    {
      name: 'ui-does-not-import-managed-data',
      severity: 'error',
      from: { path: '^src/(components|pages)/' },
      to: { path: '(^|/)data/.*[.]json$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    },
  },
}
