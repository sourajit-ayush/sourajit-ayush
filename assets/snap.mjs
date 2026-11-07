// Renders an HTML file to a 1280x800 JPEG through headless Edge (DevTools protocol).
// Usage: node snap.mjs <in.html> <out.jpg>
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [input, output, W = '1280', H = '800', DPR = '1'] = process.argv.slice(2)
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const port = 9334
const profile = mkdtempSync(join(tmpdir(), 'cover-edge-'))
const browser = spawn(edge, ['--headless', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--allow-file-access-from-files', 'about:blank'])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')
  } catch {}
}
if (!target) throw new Error('Edge did not start')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
const events = []
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg)
  else if (msg.method) events.push(msg.method)
})
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const n = ++id
    pending.set(n, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result)))
    ws.send(JSON.stringify({ id: n, method, params }))
  })
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: +DPR, mobile: +W < 600 })
await send('Page.navigate', { url: /^https?:/.test(input) ? input : pathToFileURL(resolve(input)).href })
for (let i = 0; i < 50 && !events.includes('Page.loadEventFired'); i++) await sleep(100)
await sleep(+(process.env.WAIT ?? 800))
const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: +W, height: +H, scale: 1 } })
writeFileSync(output, Buffer.from(data, 'base64'))
ws.close()
browser.kill()
console.log('wrote', output)
