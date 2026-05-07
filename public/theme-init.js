var _a
var _c
var _r = document.documentElement
try {
  _a = localStorage.getItem('tb.theme.appearance')
  _c = localStorage.getItem('tb.theme.accent')
  if (_a === 'dark' || !_a) {
    _r.classList.add('dark')
    _r.setAttribute('data-appearance', 'dark')
  }
  if (_c) {
    _r.setAttribute('data-accent', _c)
  }
} catch {
  /* localStorage unavailable */
}
