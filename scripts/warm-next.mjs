/**
 * Keeps the Next.js home route compiled during local demos.
 * Polls until :5100 is up, then re-warms `/` (debounced) when frontend files change.
 */
import { watch } from 'node:fs'
import { request } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.NEXT_WARM_PORT || 5100)
const HOST = process.env.NEXT_WARM_HOST || 'localhost'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WATCH_DIR = path.join(ROOT, 'frontend')
const DEBOUNCE_MS = 400

let timer = null
let ready = false

function warm(reason) {
  const req = request(
    {
      hostname: HOST,
      port: PORT,
      path: '/',
      method: 'GET',
      timeout: 30_000,
    },
    (res) => {
      res.resume()
      if (!ready) {
        ready = true
        console.log(`[warm-next] ready — warmed / (${res.statusCode})`)
      } else {
        console.log(`[warm-next] re-warmed / after ${reason} (${res.statusCode})`)
      }
    },
  )
  req.on('error', () => {
    // Dev server not up yet — keep polling.
  })
  req.on('timeout', () => {
    req.destroy()
  })
  req.end()
}

function schedule(reason) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => warm(reason), DEBOUNCE_MS)
}

console.log(`[warm-next] waiting for http://${HOST}:${PORT} …`)
const boot = setInterval(() => warm('boot'), 1000)

watch(
  WATCH_DIR,
  { recursive: true },
  (_event, filename) => {
    if (!filename) return
    const name = String(filename)
    if (name.includes('node_modules') || name.includes('.next')) return
    if (!/\.(tsx?|jsx?|css|json)$/.test(name)) return
    if (!ready) return
    clearInterval(boot)
    schedule(name)
  },
)

// Stop boot polling once first successful warm happened (checked inside warm).
setInterval(() => {
  if (ready) clearInterval(boot)
}, 500)
