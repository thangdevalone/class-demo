import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Hls from 'hls.js';

interface Camera {
  name: string;
  url: string;
  description?: string;
}

interface TeacherStream {
  streamId: string;
  masterUrl: string;
  ingestUrl: string;
  serverUrl: string;
  streamKey: string;
}

interface CameraPanelProps {
  cameras: Camera[];
  teacherStream?: TeacherStream | null;
}

// ---- SVG Icons ----
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);
const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
);
const MutedIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
);
const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
);
const ExitFullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
);

type PlayerStatus = 'idle' | 'connecting' | 'connected' | 'error';

// ---- HLS Camera Player ----
function HLSCameraPlayer({ url, name, description, isTeacherStream }: { url: string; name: string; description?: string; isTeacherStream?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaErrorCountRef = useRef<number>(0);
  const lastMoveRef = useRef(0);

  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(!isTeacherStream); // Teacher stream unmuted by default
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true);

  // ---- Controls visibility ----
  const showControls = useCallback(() => {
    const now = Date.now();
    if (now - lastMoveRef.current < 200) return;
    lastMoveRef.current = now;
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  // ---- Live edge check ----
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.buffered.length) return;
      const end = video.buffered.end(video.buffered.length - 1);
      const hls = hlsRef.current;
      let currentLatency = 0;
      if (hls && typeof (hls as any).latency === 'number' && isFinite((hls as any).latency)) {
        currentLatency = (hls as any).latency;
      } else if (isFinite(video.duration) && video.duration > 0) {
        currentLatency = video.duration - video.currentTime;
      } else {
        currentLatency = end - video.currentTime;
      }
      setIsAtLiveEdge(currentLatency < 8);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ---- Core play ----
  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.src = '';
    video.load();
    mediaErrorCountRef.current = 0;

    if (!url) { setStatus('error'); setStatusMsg('URL không hợp lệ'); return; }

    setStatus('connecting');
    setStatusMsg('Đang kết nối...');

    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || /iPad|iPhone|iPod/.test(navigator.userAgent);
    const canUseNative = !!video.canPlayType('application/vnd.apple.mpegurl');

    const onLoaded = () => {
      setStatus('connected');
      setStatusMsg('');
      video.play().catch(e => console.warn('Autoplay prevented:', e));
    };

    if (isSafari && canUseNative) {
      video.src = url;
      video.onloadedmetadata = onLoaded;
      video.onerror = () => { setStatus('error'); setStatusMsg('Lỗi phát video'); };
      return;
    }

    if (!Hls.isSupported()) {
      video.src = url;
      video.onloadedmetadata = onLoaded;
      video.onerror = () => { setStatus('error'); setStatusMsg('Lỗi phát video'); };
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      debug: false,
      lowLatencyMode: true,
      liveSyncDuration: 2,
      liveMaxLatencyDuration: 4.5,
      maxLiveSyncPlaybackRate: 1.1,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      startLevel: -1,
      abrEwmaDefaultEstimate: 2_000_000,
      abrEwmaFastLive: 3.0,
      abrEwmaSlowLive: 9.0,
      abrBandWidthFactor: 0.85,
      abrBandWidthUpFactor: 0.72,
      abrMaxWithRealBitrate: true,
      maxStarvationDelay: 4,
      maxLoadingDelay: 4,
      fragLoadingMaxRetry: 6,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
    } as any);

    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      hls.currentLevel = -1; // ABR auto
      onLoaded();
    });

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setStatus('error');
          setStatusMsg('Lỗi mạng – đang thử lại…');
          setTimeout(() => hlsRef.current?.startLoad(), 2000);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          mediaErrorCountRef.current += 1;
          if (mediaErrorCountRef.current <= 2) {
            setStatus('error');
            setStatusMsg(`Lỗi media – đang phục hồi (${mediaErrorCountRef.current})…`);
            hls.recoverMediaError();
          } else {
            mediaErrorCountRef.current = 0;
            playRef.current();
          }
        } else {
          setStatus('error');
          setStatusMsg(`Lỗi: ${data.details}`);
          setTimeout(() => playRef.current(), 3000);
        }
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);
  }, [url]);

  const stop = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    const video = videoRef.current;
    if (video) { video.src = ''; video.load(); }
    mediaErrorCountRef.current = 0;
    setStatus('idle');
    setStatusMsg('');
  }, []);

  const playRef = useRef(play);
  const stopRef = useRef(stop);
  useEffect(() => { playRef.current = play; }, [play]);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  // Auto-play on mount
  useEffect(() => {
    const t = setTimeout(() => playRef.current(), 400);
    return () => { clearTimeout(t); stopRef.current(); };
  }, [url]);

  // Fullscreen events
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const seekToLive = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.buffered.length) return;
    const end = video.buffered.end(video.buffered.length - 1);
    video.currentTime = Math.max(0, end - 2);
    video.play().catch(() => {});
    setIsAtLiveEdge(true);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (!hlsRef.current && video.src === '') play();
      else {
        if (status === 'connected') seekToLive();
        video.play().catch(() => {});
      }
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    setIsMuted(video.muted);
    setVolume(video.muted ? 0 : video.volume);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
    setVolume(v);
    setIsMuted(v === 0);
  };

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };

  const dotColor = status === 'connected' ? (isAtLiveEdge ? '#ff0000' : '#888') : status === 'error' ? '#ff4444' : '#555';
  const dotGlow = status === 'connected' && isAtLiveEdge ? '0 0 8px #ff0000' : undefined;
  const statusLabel = status === 'connected'
    ? (isAtLiveEdge ? 'LIVE' : 'GO LIVE')
    : status === 'connecting' ? 'CONNECTING...'
    : status === 'error' ? 'ERROR'
    : 'OFFLINE';
  const statusColor = status === 'connected' ? (isAtLiveEdge ? '#fff' : '#ccc') : status === 'error' ? '#ff4444' : '#999';

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full bg-black overflow-hidden"
      style={{ cursor: 'default' }}
      onMouseMove={showControls}
      onMouseLeave={() => setControlsVisible(false)}
    >
      {/* Loader */}
      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none">
          <div className="w-11 h-11 border-4 border-white/15 border-l-blue-400 rounded-full animate-spin" />
        </div>
      )}

      {/* Big Play Button */}
      {isPaused && status !== 'connecting' && status !== 'error' && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer bg-black/30"
          onClick={togglePlay}
        >
          <div className="w-[72px] h-[72px] bg-black/60 rounded-full flex items-center justify-center text-white transition-all hover:bg-black/80 hover:scale-105">
            <svg viewBox="0 0 24 24" fill="currentColor" width={40} height={40}><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[15] bg-black/70 text-red-400 text-center p-5">
          <svg viewBox="0 0 24 24" fill="currentColor" width={48} height={48} className="mb-3">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <div className="text-base font-bold mb-2">Lỗi phát video</div>
          <div className="text-[13px] text-slate-200 break-all">{statusMsg}</div>
          <button
            onClick={() => playRef.current()}
            className="mt-4 px-4 py-2 bg-blue-500 text-black border-none rounded font-bold cursor-pointer hover:bg-blue-400 transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Video Element */}
      <video
        ref={videoRef}
        crossOrigin="anonymous"
        playsInline
        autoPlay
        muted={isMuted}
        onPlay={() => setIsPaused(false)}
        onPause={() => setIsPaused(true)}
        className="w-full h-full block object-contain"
      />

      {/* Top badges */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5 pointer-events-none">
        {isTeacherStream && (
          <div className="bg-blue-600 text-white px-2 py-0.5 rounded text-[11px] font-bold tracking-wider flex items-center gap-1">
            🎤 Giáo viên
          </div>
        )}
        {status === 'connected' && (
          <div className="bg-red-600 text-white px-2 py-0.5 rounded text-[11px] font-bold tracking-wider">
            ● LIVE
          </div>
        )}
        <div className="bg-black/60 text-white px-2 py-0.5 rounded text-[11px] font-medium backdrop-blur-sm">
          {name}
        </div>
      </div>

      {description && (
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <span className="bg-black/40 text-slate-200 px-2 py-1 rounded text-[10px] backdrop-blur-sm">
            {description}
          </span>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-200"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)',
          padding: '28px 16px 12px',
          opacity: controlsVisible ? 1 : 0,
        }}
      >
        <div className="flex justify-between items-center">
          {/* Left Controls */}
          <div className="flex items-center gap-1">
            {/* Play/Pause */}
            <button
              className="bg-transparent border-none text-white cursor-pointer w-[34px] h-[34px] flex items-center justify-center rounded-md transition-colors hover:text-blue-400"
              onClick={togglePlay}
              title={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </button>

            {/* Volume */}
            <div className="flex items-center group">
              <button
                className="bg-transparent border-none text-white cursor-pointer w-[34px] h-[34px] flex items-center justify-center rounded-md transition-colors hover:text-blue-400"
                onClick={toggleMute}
              >
                {isMuted || volume === 0 ? <MutedIcon /> : <VolumeIcon />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 opacity-0 ml-0 transition-all duration-200 cursor-pointer h-[3px] group-hover:w-[72px] group-hover:opacity-100 group-hover:ml-1"
                style={{ accentColor: 'white' }}
              />
            </div>

            {/* Live badge button */}
            <button
              onClick={seekToLive}
              className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-2"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0 transition-all"
                style={{ background: dotColor, boxShadow: dotGlow }}
              />
              <span
                className="text-xs font-semibold tracking-wide"
                style={{ color: statusColor }}
              >
                {statusLabel}
              </span>
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1">
            <button
              className="bg-transparent border-none text-white cursor-pointer w-[34px] h-[34px] flex items-center justify-center rounded-md transition-colors hover:text-blue-400"
              onClick={toggleFullscreen}
              title="Toàn màn hình"
            >
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Camera Panel (multi-cam layout) ----
export default function CameraPanel({ cameras, teacherStream }: CameraPanelProps) {
  // Build combined list: teacher stream first (with audio), then cameras (video-only)
  const allFeeds = useMemo(() => {
    const feeds: { name: string; url: string; description?: string; isTeacherStream: boolean }[] = [];
    
    if (teacherStream && teacherStream.masterUrl) {
      feeds.push({
        name: 'Giáo viên',
        url: teacherStream.masterUrl,
        description: 'Hình + Tiếng',
        isTeacherStream: true,
      });
    }
    
    cameras.forEach((cam) => {
      if (cam.url) {
        feeds.push({
          name: cam.name,
          url: cam.url,
          description: cam.description,
          isTeacherStream: false,
        });
      }
    });
    
    return feeds;
  }, [cameras, teacherStream]);

  const [activeIndex, setActiveIndex] = useState(0);
  const thumbnailRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const activeFeed = allFeeds[activeIndex];

  // Find teacher stream index (always index 0 if exists)
  const teacherFeedIndex = allFeeds.findIndex(f => f.isTeacherStream);
  const teacherFeed = teacherFeedIndex >= 0 ? allFeeds[teacherFeedIndex] : null;
  const isViewingTeacher = activeIndex === teacherFeedIndex;

  // Initialize thumbnail streams (muted, low quality previews)
  useEffect(() => {
    const hlsInstances: Hls[] = [];

    allFeeds.forEach((feed, i) => {
      const thumbEl = thumbnailRefs.current[i];
      if (!thumbEl || i === activeIndex) return;
      // Skip teacher stream thumbnail — it's always playing via the persistent player
      if (feed.isTeacherStream) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false,
          maxBufferLength: 5,
          maxMaxBufferLength: 10,
        });
        hls.loadSource(feed.url);
        hls.attachMedia(thumbEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          thumbEl.play().catch(() => {});
        });
        hlsInstances.push(hls);
      } else if (thumbEl.canPlayType('application/vnd.apple.mpegurl')) {
        thumbEl.src = feed.url;
        thumbEl.play().catch(() => {});
      }
    });

    return () => {
      hlsInstances.forEach((h) => h.destroy());
    };
  }, [allFeeds, activeIndex]);

  const switchCamera = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
  };

  return (
    <div className="flex h-full w-full flex-col gap-2 p-2">
      {/* Main Video Feed */}
      <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-800 bg-black shadow-lg">
        {/*
          Teacher stream is ALWAYS rendered to keep audio alive.
          When viewing another camera, teacher stream is hidden (off-screen)
          but still plays audio. The active non-teacher camera is shown on top.
        */}
        {teacherFeed && (
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              // When viewing teacher: visible. When viewing other cam: hidden but still playing audio.
              zIndex: isViewingTeacher ? 1 : -1,
              opacity: isViewingTeacher ? 1 : 0,
              pointerEvents: isViewingTeacher ? 'auto' : 'none',
            }}
          >
            <HLSCameraPlayer
              key={`teacher-stream-persistent`}
              url={teacherFeed.url}
              name={teacherFeed.name}
              description={teacherFeed.description}
              isTeacherStream={true}
            />
          </div>
        )}

        {/* Active non-teacher camera feed */}
        {activeFeed && !activeFeed.isTeacherStream && (
          <div className="absolute inset-0 w-full h-full" style={{ zIndex: 2 }}>
            <HLSCameraPlayer
              key={`feed-${activeIndex}-${activeFeed.url}`}
              url={activeFeed.url}
              name={activeFeed.name}
              description={activeFeed.description}
              isTeacherStream={false}
            />
          </div>
        )}
      </div>

      {/* Camera Thumbnails */}
      {allFeeds.length > 1 && (
        <div className="flex h-24 shrink-0 gap-2 overflow-x-auto overflow-y-hidden py-1 hide-scrollbar">
          {allFeeds.map((feed, i) => (
            <button
              key={i}
              className={`relative h-full aspect-video shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                i === activeIndex
                  ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] opacity-100'
                  : 'border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600'
              }`}
              onClick={() => switchCamera(i)}
            >
              {i === activeIndex ? (
                <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 text-slate-400">
                  <span className="text-[10px] font-medium uppercase tracking-widest text-emerald-500">Đang xem</span>
                </div>
              ) : (
                <video
                  ref={(el) => { thumbnailRefs.current[i] = el; }}
                  className="absolute inset-0 h-full w-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-left">
                <div className="flex items-center gap-1">
                  {feed.isTeacherStream && (
                    <span className="text-[9px] bg-blue-600 text-white px-1 rounded">🎤</span>
                  )}
                  <span className="truncate text-[10px] font-medium text-white">{feed.name}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
