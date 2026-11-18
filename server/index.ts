import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import express from 'express'
import { Server } from 'socket.io'
import { networkInterfaces } from 'node:os'
import { initRooms, registerSocket } from './rooms'

const PORT = Number(process.env.PORT ?? 3001)

const lanIps = () =>
  Object.values(networkInterfaces()).flatMap((list) =>
    (list ?? []).filter((i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')).map((i) => i.address),
  )

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer)

initRooms(io)
io.on('connection', registerSocket)

const dist = join(process.cwd(), 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(join(dist, 'index.html'))
  })
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de Preguntados en http://localhost:${PORT}`)
  const serving = existsSync(dist) ? ' (sirviendo build de producción)' : ''
  for (const ip of lanIps()) {
    console.log(`  Red local: http://${ip}:${PORT}${serving}`)
  }
})
