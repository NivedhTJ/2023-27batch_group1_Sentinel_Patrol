import { useRef, useEffect, useState } from 'react'
import { Camera, Wifi, WifiOff, Circle, Video, VideoOff } from 'lucide-react'

// ── Sample surveillance/traffic MP4 clips for cams 2-4 ──────────
const SAMPLE_CAMERAS = [
  {
    id: 'cam-02',
    label: 'Station Entrance',
    sublabel: 'Main Gate – Cam 02',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    status: 'LIVE',
  },
  {
    id: 'cam-03',
    label: 'Lockup Bay',
    sublabel: 'Rear Corridor – Cam 03',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
    status: 'LIVE',
  },
  {
    id: 'cam-04',
    label: 'Main Gate',
    sublabel: 'North Perimeter – Cam 04',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    status: 'RECORDING',
  },
]

// ── Corner crosshair decoration ──────────────────────────────────
function Crosshairs() {
  return (
    <>
      {['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'].map((pos, i) => (
        <div key={i} className={`absolute ${pos} z-10 opacity-40 group-hover:opacity-70 transition-opacity`}>
          <div className="relative w-4 h-4">
            <div className="absolute top-0 left-0 w-2 h-px bg-blue-400" />
            <div className="absolute top-0 left-0 w-px h-2 bg-blue-400" />
          </div>
        </div>
      ))}
    </>
  )
}

// ── LiveWebcamFeed – Card 01 ─────────────────────────────────────
function LiveWebcamFeed() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  // 'pending' | 'granted' | 'denied'
  const [permissionState, setPermissionState] = useState('pending')

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setPermissionState('granted')
      } catch (err) {
        if (!cancelled) {
          console.warn('[LiveWebcamFeed] Camera access denied:', err.message)
          setPermissionState('denied')
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  return (
    <div
      className="relative rounded-2xl overflow-hidden cctv-glow group"
      style={{ background: '#000', aspectRatio: '16/9' }}
    >
      {/* ── Live video element ── */}
      {permissionState !== 'denied' && (
        <video
          ref={videoRef}
          id="cam-01-live"
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.9) contrast(1.1) saturate(0.8)' }}
        />
      )}

      {/* ── Permission denied fallback ── */}
      {permissionState === 'denied' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
        >
          <VideoOff size={36} className="text-slate-600" />
          <div className="text-center px-4">
            <p className="text-sm font-semibold text-slate-400">Camera Access Denied</p>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              Allow camera permission in your browser<br />to view the live device feed.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-mono mt-1">
            <WifiOff size={10} />
            <span>NO SIGNAL</span>
          </div>
        </div>
      )}

      {/* ── Pending spinner ── */}
      {permissionState === 'pending' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-20"
          style={{ background: '#000' }}
        >
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] text-slate-500 font-mono">INITIALISING FEED…</p>
        </div>
      )}

      {/* ── CRT scanline overlay ── */}
      <div className="cctv-overlay" />

      {/* ── Top HUD bar ── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-start justify-between p-3 z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.80) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-2">
          <Camera size={13} className="text-slate-400" />
          <div>
            <p className="text-xs font-bold text-white leading-tight">Local Device</p>
            <p className="text-[10px] text-slate-400 leading-tight font-mono">Webcam Feed – Cam 01</p>
          </div>
        </div>

        {/* Status badge */}
        {permissionState === 'granted' && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: '#4ade80' }}
              />
              <span
                className="relative inline-flex rounded-full h-2.5 w-2.5"
                style={{ backgroundColor: '#22c55e' }}
              />
            </span>
            <span className="text-[10px] font-bold tracking-widest uppercase text-green-400">
              LIVE
            </span>
          </div>
        )}
        {permissionState === 'denied' && (
          <div className="flex items-center gap-1.5">
            <Circle size={7} fill="#f87171" stroke="none" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-red-400">
              OFFLINE
            </span>
          </div>
        )}
      </div>

      {/* ── Centre hover-reveal badge ── */}
      {permissionState === 'granted' && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10
                     opacity-0 group-hover:opacity-100 transition-opacity duration-300
                     pointer-events-none"
        >
          <div
            className="px-3 py-1 rounded-full text-[11px] font-bold tracking-widest text-green-300
                       border border-green-500/50 backdrop-blur-sm"
            style={{ background: 'rgba(0,0,0,0.65)' }}
          >
            🔴 LIVE – LAPTOP / PHONE CAMERA
          </div>
        </div>
      )}

      {/* ── Bottom HUD bar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2.5 z-10"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-1.5 text-[9px] font-mono">
          {permissionState === 'granted' ? (
            <>
              <Wifi size={9} className="text-green-400" />
              <span className="text-green-400">SIGNAL OK</span>
            </>
          ) : (
            <>
              <WifiOff size={9} className="text-red-400" />
              <span className="text-red-400">NO SIGNAL</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-600 font-mono">
          <span>REC</span>
          <Circle
            size={5}
            fill={permissionState === 'granted' ? '#4ade80' : '#475569'}
            stroke="none"
            className={permissionState === 'granted' ? 'animate-pulse' : ''}
          />
        </div>
        <span className="text-[9px] text-slate-600 font-mono">
          {new Date().toLocaleTimeString('en-IN', { hour12: false })}
        </span>
      </div>

      <Crosshairs />
    </div>
  )
}

// ── Static sample video card ─────────────────────────────────────
function CameraCard({ cam }) {
  const videoRef = useRef(null)

  return (
    <div
      className="relative rounded-2xl overflow-hidden cctv-glow group"
      style={{ background: '#000', aspectRatio: '16/9' }}
    >
      <video
        ref={videoRef}
        id={cam.id}
        src={cam.src}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover"
        style={{ filter: 'brightness(0.85) contrast(1.1) saturate(0.85)' }}
      />

      {/* CRT scanline overlay */}
      <div className="cctv-overlay" />

      {/* Top HUD bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-start justify-between p-3 z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-2">
          <Camera size={13} className="text-slate-400" />
          <div>
            <p className="text-xs font-bold text-white leading-tight">{cam.label}</p>
            <p className="text-[10px] text-slate-400 leading-tight font-mono">{cam.sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Circle
            size={7}
            fill={cam.status === 'LIVE' ? '#f87171' : '#fb923c'}
            stroke="none"
            className="animate-pulse"
          />
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: cam.status === 'LIVE' ? '#f87171' : '#fb923c' }}
          >
            {cam.status}
          </span>
        </div>
      </div>

      {/* Bottom HUD bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2.5 z-10"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono">
          <Wifi size={9} className="text-green-400" />
          <span>SIGNAL OK</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-600 font-mono">
          <span>REC</span>
          <Circle size={5} fill="#f87171" stroke="none" className="animate-pulse" />
        </div>
        <span className="text-[9px] text-slate-600 font-mono">
          {new Date().toLocaleTimeString('en-IN', { hour12: false })}
        </span>
      </div>

      <Crosshairs />
    </div>
  )
}

// ── CCTVGrid – main export ───────────────────────────────────────
export default function CCTVGrid() {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="glass rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Camera size={18} className="text-blue-400" />
          <div>
            <h2 className="text-sm font-bold text-white">Station CCTV Surveillance</h2>
            <p className="text-xs text-slate-500">Live feeds · Kerala Police HQ</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Video size={12} />
            <span className="font-medium">Cam 01: Live Device</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Wifi size={12} />
            <span className="font-medium">4/4 Online</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <Circle size={6} fill="#f87171" stroke="none" className="animate-pulse" />
            <span>RECORDING</span>
          </div>
        </div>
      </div>

      {/* 2×2 grid – Card 01 is live webcam, 02-04 are sample videos */}
      <div className="flex-1 grid grid-cols-2 gap-4">
        <LiveWebcamFeed />
        {SAMPLE_CAMERAS.map(cam => (
          <CameraCard key={cam.id} cam={cam} />
        ))}
      </div>

      {/* Status bar */}
      <div className="glass rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-500 font-mono">
        <span>SENTINEL CCTV CONTROL SYSTEM v2.4</span>
        <div className="flex items-center gap-4">
          <span>ENCODING: H.264</span>
          <span>RESOLUTION: 1080p</span>
          <span className="text-green-400">● ALL SYSTEMS NOMINAL</span>
        </div>
      </div>
    </div>
  )
}
