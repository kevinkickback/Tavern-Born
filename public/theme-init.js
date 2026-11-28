var _a
var _c
var _r = document.documentElement
try {
  _a = localStorage.getItem('tb.theme.appearance')
  _c = localStorage.getItem('tb.theme.accent')
} catch {
  /* localStorage unavailable */
}
_a = _a === 'light' ? 'light' : 'dark'
_r.classList.toggle('dark', _a === 'dark')
_r.setAttribute('data-appearance', _a)
if (_c) {
  _r.setAttribute('data-accent', _c)
}

// Wait for the deferred app entry before requesting the optional web fonts.
document.addEventListener(
  'DOMContentLoaded',
  () => {
    const fontStylesheet = document.createElement('link')
    fontStylesheet.rel = 'stylesheet'
    fontStylesheet.href =
      'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap'
    document.head.append(fontStylesheet)
  },
  { once: true },
)
