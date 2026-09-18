/**
 * usePatrolWebSocket
 *
 * Manages a persistent WebSocket connection to the patrol tracking endpoint.
 * Receives broadcast messages from the server and maintains a state map of
 * all active officers: { [officer_id]: { name, lat, lng, last_updated } }
 *
 * Also exposes `sendLocation(lat, lng)` so the Patrol Simulator widget can
 * push location updates through the same socket.
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const WS_BASE = 'ws://127.0.0.1:8000/ws/patrol'
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

// Known officer names – in a real app this would come from a user-lookup.
const OFFICER_NAMES = {
  officer_101: 'Sub-Inspector Arjun Nair',
  officer_102: 'Constable Priya Menon',
  officer_103: 'Inspector Rajesh Kumar',
}

export function usePatrolWebSocket(officerId = 'officer_101') {
  /** Map of officer positions:  { [id]: { name, lat, lng, last_updated } } */
  const [officers, setOfficers] = useState({})
  const [wsStatus, setWsStatus] = useState('disconnected') // 'connecting'|'connected'|'disconnected'|'error'

  const wsRef = useRef(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    setWsStatus('connecting')
    const url = `${WS_BASE}/${officerId}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      reconnectAttempts.current = 0
      setWsStatus('connected')
      console.info(`[Patrol WS] Connected as ${officerId}`)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data)
        const { officer_id, lat, lng, timestamp } = msg
        if (officer_id && lat != null && lng != null) {
          setOfficers(prev => ({
            ...prev,
            [officer_id]: {
              name: OFFICER_NAMES[officer_id] || `Officer ${officer_id}`,
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              last_updated: timestamp || new Date().toISOString(),
            },
          }))
        }
      } catch (err) {
        console.warn('[Patrol WS] Failed to parse message:', err)
      }
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setWsStatus('error')
      console.warn('[Patrol WS] Connection error')
    }

    ws.onclose = (ev) => {
      if (!mountedRef.current) return
      setWsStatus('disconnected')
      console.info(`[Patrol WS] Closed (code=${ev.code}). Reconnecting…`)

      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current += 1
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS)
      } else {
        console.error('[Patrol WS] Max reconnect attempts reached.')
        setWsStatus('error')
      }
    }
  }, [officerId])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null   // prevent reconnect loop on intentional unmount
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  /** Send a location update through the active WebSocket */
  const sendLocation = useCallback((lat, lng) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ lat, lng }))
    } else {
      console.warn('[Patrol WS] Cannot send – socket not open')
    }
  }, [])

  return { officers, wsStatus, sendLocation }
}
