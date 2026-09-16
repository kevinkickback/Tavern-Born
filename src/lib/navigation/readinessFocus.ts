const READINESS_FOCUS_PARAM = 'attention'

/** Adds a Review issue target without disturbing page-specific deep-link parameters. */
export function addReadinessFocus(target: string, issueId: string): string {
  const [pathname, search = ''] = target.split('?')
  const params = new URLSearchParams(search)
  params.set(READINESS_FOCUS_PARAM, issueId)
  const nextSearch = params.toString()
  return nextSearch ? `${pathname}?${nextSearch}` : pathname
}

export function getReadinessFocus(searchParams: URLSearchParams): string | null {
  return searchParams.get(READINESS_FOCUS_PARAM)
}
