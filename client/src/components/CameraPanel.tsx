import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';

interface Camera {
  name: string;
  url: string;
  description?: string;
}

interface CameraPanelProps {
  cameras: Camera[];
}

export default function CameraPanel({ cameras }: CameraPanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const thumbnailRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const activeCamera = cameras[activeIndex];

  // Initialize main HLS stream
  const loadStream = useCallback((url: string, videoEl: HTMLVideoElement) => {
    // Destroy previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
      });
      hls.loadSource(url);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('Camera network error, retrying...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('Camera media error, recovering...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Camera fatal error:', data);
              hls.destroy();
              break;
          }
        }
      });
      hlsRef.current = hls;
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      videoEl.src = url;
      videoEl.play().catch(() => {});
    }
  }, []);

  // Load main stream when active camera changes
  useEffect(() => {
    if (videoRef.current && activeCamera) {
      loadStream(activeCamera.url, videoRef.current);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeIndex, activeCamera, loadStream]);

  // Initialize thumbnail streams (muted, low quality previews)
  useEffect(() => {
    const hlsInstances: Hls[] = [];

    cameras.forEach((cam, i) => {
      const thumbEl = thumbnailRefs.current[i];
      if (!thumbEl || i === activeIndex) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false,
          maxBufferLength: 5,
          maxMaxBufferLength: 10,
        });
        hls.loadSource(cam.url);
        hls.attachMedia(thumbEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          thumbEl.play().catch(() => {});
        });
        hlsInstances.push(hls);
      } else if (thumbEl.canPlayType('application/vnd.apple.mpegurl')) {
        thumbEl.src = cam.url;
        thumbEl.play().catch(() => {});
      }
    });

    return () => {
      hlsInstances.forEach((h) => h.destroy());
    };
  }, [cameras, activeIndex]);

  const switchCamera = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
  };

  return (
    <div className="flex h-full w-full flex-col gap-2 p-2">
      {/* Main Video Feed */}
      <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-800 bg-black shadow-lg">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          playsInline
          muted
        />
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-md">
              {activeCamera?.name || 'Camera'}
            </span>
          </div>
          {activeCamera?.description && (
            <span className="max-w-xs rounded-md bg-black/40 px-2 py-1 text-[10px] text-slate-200 backdrop-blur-sm">
              {activeCamera.description}
            </span>
          )}
        </div>
      </div>

      {/* Camera Thumbnails */}
      {cameras.length > 1 && (
        <div className="flex h-24 shrink-0 gap-2 overflow-x-auto overflow-y-hidden py-1 hide-scrollbar">
          {cameras.map((cam, i) => (
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
                <span className="truncate text-[10px] font-medium text-white">{cam.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
