import express from 'express'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { execFile, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'data')
const dataFile = path.join(dataDir, 'zhixu-server.json')
const port = Number(process.env.ZHIXU_PORT || 4174)
const clients = new Set()

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  } catch {
    return { tasks: {}, feedback: [] }
  }
}

function writeStore(store) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf8')
}

function localAddress() {
  if (process.env.ZHIXU_HOST) return process.env.ZHIXU_HOST
  if (process.platform === 'win32') {
    try {
      const script = "$r=Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object {$_.NextHop -ne '0.0.0.0'} | Sort-Object RouteMetric | Select-Object -First 1; (Get-NetIPAddress -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '169.254*'} | Select-Object -First 1).IPAddress"
      const value = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim()
      if (value) return value
    } catch {
      return fallbackAddress()
    }
  }
  return fallbackAddress()
}

function fallbackAddress() {
  const preferred = []
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (/vmware|virtual|vmnet|vethernet|loopback|bluetooth/i.test(name)) continue
    for (const item of entries || []) {
      if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.') && !item.address.startsWith('198.18.')) preferred.push(item.address)
    }
  }
  if (preferred.length) return preferred[0]
  return '127.0.0.1'
}

function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`
  for (const client of clients) client.write(line)
}

const app = express()
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'lan', address: localAddress(), port, origin: `http://${localAddress()}:${port}/teacher-copilot/` })
})

app.get('/api/tasks/:id', (req, res) => {
  const task = readStore().tasks[req.params.id]
  if (!task) return res.status(404).json({ error: 'task_not_found' })
  res.json({ task })
})

app.post('/api/tasks', (req, res) => {
  const task = req.body?.task
  if (!task?.id || !task?.title) return res.status(400).json({ error: 'invalid_task' })
  const store = readStore()
  store.tasks[task.id] = task
  writeStore(store)
  res.json({ ok: true, url: `http://${localAddress()}:${port}/teacher-copilot/#/student?task=${encodeURIComponent(task.id)}` })
})

app.get('/api/feedback', (_req, res) => {
  res.json({ feedback: readStore().feedback })
})

app.post('/api/voice/recognize', (_req, res) => {
  if (process.platform !== 'win32') return res.status(501).json({ error: 'windows_only' })
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'server', 'recognize-voice.ps1')], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true
  }, (error, stdout) => {
    const text = stdout.trim()
    if (error || !text) return res.status(422).json({ error: 'not_recognized' })
    res.json({ text })
  })
})

app.post('/api/feedback', (req, res) => {
  const feedback = req.body?.feedback
  if (!feedback?.id || !feedback?.taskId || !feedback?.student) return res.status(400).json({ error: 'invalid_feedback' })
  const store = readStore()
  if (!store.feedback.some(item => item.id === feedback.id)) {
    store.feedback.unshift(feedback)
    writeStore(store)
    broadcast({ type: 'feedback', feedback })
  }
  res.json({ ok: true })
})

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write(`data: ${JSON.stringify({ type: 'ready' })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

app.use('/teacher-copilot', express.static(path.join(root, 'dist')))
app.use(express.static(path.join(root, 'dist')))
app.get('*path', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))

app.listen(port, '0.0.0.0', () => {
  const address = localAddress()
  console.log(`以昕教师端：http://localhost:${port}/teacher-copilot/`)
  console.log(`学生扫码地址：http://${address}:${port}/teacher-copilot/`)
  console.log('请确保手机与电脑连接同一 Wi-Fi')
  if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', `http://localhost:${port}/teacher-copilot/`], { windowsHide: true })
})
