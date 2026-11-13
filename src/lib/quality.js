// Device tier for the 3D views: 'low' on weak hardware, 'high' otherwise. A guess from what the
// browser reports (memory, cores, data saver, a software GPU). The views also watch their own
// frame rate and step down further when frames run slow, so a wrong guess corrects itself.
let cached = null

export function deviceTier() {
  if (cached) return cached
  if (typeof navigator === 'undefined') return (cached = 'high')
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  if (params.get('quality') === 'low' || params.get('quality') === 'high') return (cached = params.get('quality'))
  const mem = navigator.deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 8
  const saveData = navigator.connection?.saveData === true
  let gpu = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { /* no WebGL: the views show their fallbacks */ }
  const softwareGpu = /swiftshader|llvmpipe|software|basic render/i.test(gpu)
  // Integrated Intel graphics are common in laptops but often struggle with high-DPI WebGL.
  // Start them at the lighter tier; users can still override with ?quality=high.
  const integratedGpu = /Intel.*(HD Graphics|UHD Graphics|Iris Xe)|AMD Radeon(?:\\(TM\\))? Graphics/i.test(gpu)
  cached = saveData || softwareGpu || integratedGpu || mem <= 4 || cores <= 4 ? 'low' : 'high'
  return cached
}

/**
 * Frame-rate watchdog. Call tick() once per rendered frame; it calls onSlow() when the median
 * frame over the last 90 takes longer than `budgetMs`. A median ignores the odd long frame
 * (a texture upload, a garbage collection), and gaps over 250 ms (tab in the background, a
 * pause) are skipped entirely, so only steady slowness counts.
 */
export function frameWatch({ budgetMs = 26, onSlow }) {
  const N = 90
  const buf = new Float32Array(N)
  let last = 0
  let n = 0
  return {
    tick(now = performance.now()) {
      const d = last ? now - last : 0
      last = now
      if (!d || d > 250) return
      buf[n++ % N] = d
      if (n % N === 0 && n >= N * 2) {
        const median = [...buf].sort((a, b) => a - b)[N >> 1]
        if (median > budgetMs) onSlow()
      }
    },
    reset() { last = 0; n = 0 },
  }
}
