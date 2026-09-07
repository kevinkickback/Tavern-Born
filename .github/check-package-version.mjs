import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const packageLock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
const version = packageJson.version;

// Release verification and the updater use the stable latest*.yml channel.
if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('Releases require a stable X.Y.Z package version (no prerelease or build suffix).');
}

const versions = new Map([
  ['package-lock.json', packageLock.version],
  ['package-lock.json root package', packageLock.packages?.['']?.version],
]);
const mismatches = [...versions].filter(([, value]) => value !== version);
if (mismatches.length > 0) {
  const details = mismatches.map(([source, value]) => `${source}: ${value ?? 'missing'}`).join('\n');
  throw new Error(`Version metadata does not match package.json (${version}):\n${details}`);
}

const tag = `v${version}`;
const changelog = await readFile(new URL('docs/changelog.md', root), 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.indexOf(`<summary><strong>${tag}</strong></summary>`);
const end = lines.indexOf('</details>', start + 1);
if (start === -1 || end === -1 || lines.slice(start + 1, end).some(line => line.includes('<details>'))) {
  throw new Error(`No complete changelog section found for ${tag} in docs/changelog.md.`);
}
if (!lines.slice(start + 1, end).join('\n').trim()) {
  throw new Error(`Release notes for ${tag} are empty.`);
}

console.log(`Stable version metadata and release notes validated for ${tag}.`);
