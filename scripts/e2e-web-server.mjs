import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { stop } from 'esbuild'
import { build } from 'vite'

const target = process.argv[2]
if (target !== 'public' && target !== 'admin') {
  throw new Error('Expected the target to be "public" or "admin".')
}

const root = target === 'admin' ? resolve('admin') : process.cwd()
const port = target === 'admin' ? 4174 : 4173

await build({
  root,
  mode: 'e2e',
  configLoader: 'runner',
})
stop()

const dist = resolve(root, 'dist')
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://e2e.local').pathname)
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    let file = resolve(dist, relativePath)

    if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
      response.writeHead(403).end()
      return
    }

    try {
      if (!(await stat(file)).isFile()) file = resolve(dist, 'index.html')
    } catch {
      file = resolve(dist, 'index.html')
    }

    const body = await readFile(file)
    const type = contentTypes[extname(file)] ?? 'application/octet-stream'
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    response.end(body)
  } catch {
    response.writeHead(500).end()
  }
}).listen(port, '127.0.0.1')

const terminate = () => {
  server.closeAllConnections?.()
  process.exit(0)
}

let idleTimer = setTimeout(terminate, 15_000)
server.on('request', () => {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(terminate, 15_000)
})

process.once('SIGINT', terminate)
process.once('SIGTERM', terminate)
if (process.platform === 'win32') process.once('SIGBREAK', terminate)
