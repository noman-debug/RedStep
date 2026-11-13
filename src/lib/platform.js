// Which desktop the visitor is on. Only the keyboard shortcut text follows it (⌘ on Mac,
// Ctrl elsewhere); the look is identical on every OS (see styles/platform.css).
export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  // ?platform=mac or ?platform=windows shows the other look (for demos and testing)
  const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).get('platform')
  if (forced === 'mac' || forced === 'windows') return forced
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase()
  if (/mac|iphone|ipad|ipod/.test(p)) return 'mac'
  if (/win/.test(p)) return 'windows'
  return 'other'
}

export const platform = detectPlatform()
export const isMac = platform === 'mac'
/** Keyboard shortcut text in the platform's own style, e.g. shortcut('Shift', 'S'). */
export const shortcut = (...keys) => (isMac ? ['⌘', ...keys.map((k) => (k === 'Shift' ? '⇧' : k))].join('') : ['Ctrl', ...keys].join('+'))
