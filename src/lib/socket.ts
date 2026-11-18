import { io } from 'socket.io-client'
import type { Ack } from '../../shared/protocol'

export const socket = io({ autoConnect: true })

export const emit = (event: string, payload?: unknown): Promise<Ack> =>
  new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err: Error | null, res: Ack) => {
      resolve(err ? { ok: false, error: 'Sin respuesta del servidor' } : res)
    })
  })
