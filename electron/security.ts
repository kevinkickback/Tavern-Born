import { isAbsolute, relative, sep } from 'node:path'

export function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativeTarget = relative(rootPath, targetPath)
  return !(
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget)
  )
}

export function isTrustedRendererUrl(
  senderUrl: string,
  rendererRootUrl: string,
  devServerUrl?: string,
): boolean {
  try {
    const sender = new URL(senderUrl)
    if (devServerUrl) {
      const devServer = new URL(devServerUrl)
      return (
        (devServer.protocol === 'http:' || devServer.protocol === 'https:') &&
        sender.origin === devServer.origin
      )
    }

    const rendererRoot = new URL(rendererRootUrl)
    return (
      sender.protocol === 'file:' &&
      rendererRoot.protocol === 'file:' &&
      sender.href.startsWith(rendererRoot.href)
    )
  } catch {
    return false
  }
}
