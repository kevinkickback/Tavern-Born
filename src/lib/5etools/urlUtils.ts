export function normalizeGitHubUrl(inputUrl: string): string {
  try {
    let cleanUrl = inputUrl.trim();

    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }

    const url = new URL(cleanUrl);

    if (
      !url.hostname.includes('github.com') &&
      !url.hostname.includes('githubusercontent.com')
    ) {
      return cleanUrl;
    }

    if (url.hostname === 'raw.githubusercontent.com') {
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 3) {
        return `https://raw.githubusercontent.com/${pathParts[0]}/${pathParts[1]}/${pathParts[2]}`;
      }
      return cleanUrl;
    }

    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return cleanUrl;

    const owner = pathParts[0];
    const repo = pathParts[1];
    let branch = 'main';

    if (url.pathname.includes('/tree/')) {
      const treeIndex = pathParts.indexOf('tree');
      if (treeIndex !== -1 && pathParts.length > treeIndex + 1) {
        branch = pathParts[treeIndex + 1];
      }
    } else if (url.pathname.includes('/blob/')) {
      const blobIndex = pathParts.indexOf('blob');
      if (blobIndex !== -1 && pathParts.length > blobIndex + 1) {
        branch = pathParts[blobIndex + 1];
      }
    }

    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  } catch {
    return inputUrl;
  }
}

async function testUrlWithBranch(
  owner: string,
  repo: string,
  branch: string,
  testFile: string,
): Promise<boolean> {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/${testFile}`;
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function findCorrectBranch(
  owner: string,
  repo: string,
): Promise<string> {
  const branches = ['main', 'master'];

  for (const branch of branches) {
    const isValid = await testUrlWithBranch(owner, repo, branch, 'races.json');
    if (isValid) {
      return branch;
    }
  }

  return 'main';
}
