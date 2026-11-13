import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Writes dist/sw.js with a precache list of the app shell and the Jezero data.
// Kept small on purpose: world-map tiles beyond zoom 1, other sites and the 4K texture are
// cached at runtime, the first time they are viewed.
function offline() {
  let outDir = 'dist'
  return {
    name: 'marswalk-offline',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    closeBundle() {
      const root = path.resolve(outDir)
      const files = []
      const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name)
          if (e.isDirectory()) walk(p)
          else files.push('/' + path.relative(root, p).split(path.sep).join('/'))
        }
      }
      walk(root)
      const keep = (f) =>
        f === '/index.html' || f === '/favicon.svg' || f === '/manifest.webmanifest' || /^\/icons\//.test(f) ||
        (/^\/assets\//.test(f) && !/\.woff$/.test(f) && !/(cyrillic|greek|vietnamese)/.test(f)) ||
        (/^\/data\/jezero\//.test(f) && !/-2k\./.test(f)) || // low-memory copies are cached when used
        /^\/data\/names\.json$/.test(f) ||
        (/^\/data\/globe\//.test(f) && !/4k/.test(f)) ||
        /^\/data\/tiles\/[^/]+\/[0-1]\//.test(f)
      const precache = files.filter(keep).sort()
      const hash = crypto.createHash('sha1').update(precache.join('\n')).update(String(fs.statSync(path.join(root, 'index.html')).mtimeMs)).digest('hex').slice(0, 10)
      const tpl = fs.readFileSync(path.resolve('scripts/sw-template.js'), 'utf8')
      fs.writeFileSync(path.join(root, 'sw.js'), tpl.replace('__VERSION__', hash).replace('__PRECACHE__', JSON.stringify(precache)))
      const bytes = precache.reduce((s, f) => s + fs.statSync(path.join(root, f)).size, 0)
      console.log(`sw.js: ${precache.length} files precached (${(bytes / 1048576).toFixed(1)} MB), version ${hash}`)
    },
  }
}


// The home page is a lazy chunk, so the browser used to discover it only after the app shell
// had downloaded and run: two round trips before the scene could start. This injects a tiny
// script that, on "/" only, asks for the home chunk, its CSS, the hero scene chunk and its
// dependencies, the text fonts and all four globe textures in parallel with the app shell.
function homePreload() {
  return {
    name: 'redstep-home-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const b = ctx.bundle || {}
        const home = Object.values(b).find((c) => c.type === 'chunk' && /home\/HomePage\.jsx$/.test(c.facadeModuleId || ''))
        if (!home) return html
        const hero = Object.values(b).find((c) => c.type === 'chunk' && /home\/three\/heroScene\.js$/.test(c.facadeModuleId || ''))
        const js = [...new Set([home.fileName, ...home.imports, ...(hero ? [hero.fileName, ...hero.imports] : [])])].map((f) => '/' + f)
        const css = [...(home.viteMetadata?.importedCss || [])].map((f) => '/' + f)
        const fonts = Object.keys(b).filter((f) => /(switzer-(400|500)|syne-latin-700-normal)[^/]*\.woff2$/.test(f)).map((f) => '/' + f)
        const imgs = ['/data/globe/earth-day-2k.webp', '/data/globe/earth-night-2k.webp', '/data/globe/mars-viking-2k.webp', '/data/globe/moon-lro-1k.webp']
        const list = JSON.stringify({ js, css, fonts, imgs })
        const tag = `<script>(function(){if(location.pathname!=='/')return;var d=${list},h=document.head;function l(r,u,a){var e=document.createElement('link');e.rel=r;e.href=u;if(a)e.as=a;if(r==='modulepreload'||a==='font'||a==='image')e.crossOrigin='';h.appendChild(e)}d.js.forEach(function(u){l('modulepreload',u)});d.css.forEach(function(u){l('preload',u,'style')});d.fonts.forEach(function(u){l('preload',u,'font')});d.imgs.forEach(function(u){l('preload',u,'image')})})()</script>`
        return html.replace('</head>', tag + '\n  </head>')
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), offline(), homePreload()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
})
