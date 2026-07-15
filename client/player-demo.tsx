"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

type PlaylistMode = 'simple' | 'llhls';
type Quality = 'original' | 'auto' | '720p' | '480p' | '360p';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

export interface SubTSPlayerProps {
    /** The full HLS playlist URL to play */
    url: string;
    /** Optional security token (will be added to the Authorization header if provided) */
    token?: string;
    /** Number of concurrent viewers (optional) */
    viewerCount?: number;
    /** View minutes (optional) */
    viewerMinutes?: number;
    /** Is the stream currently live? (triggers auto-play) */
    isLive?: boolean;
}

interface Stats {
    latency: string;
    buffer: string;
    resolution: string;
    rendition: string;
    bitrate: string;
    bandwidth: string;
    abrMode: string;
    abrModeColor: string;
    hitrate: string;
    playlistHitrate: string;
}

interface AbrLog {
    time: string;
    icon: string;
    message: string;
}

interface CdnStats {
    hits: number;
    misses: number;
    expired: number;
    total: number;
}

const DEFAULT_STATS: Stats = {
    latency: '--', buffer: '--', resolution: '--', rendition: '--',
    bitrate: '--', bandwidth: '--', abrMode: '--', abrModeColor: '#3ea6ff',
    hitrate: '--', playlistHitrate: '--',
};

const DEFAULT_CDN: CdnStats = { hits: 0, misses: 0, expired: 0, total: 0 };

// ---- SVG Icons ----
const PlayIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);
const VolumeIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
);
const MutedIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
);
const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
);
const FullscreenIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
);
const ExitFullscreenIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
);

// ---- Component ----
export default function SubTSPlayer({
    url,
    token,
    viewerCount = 0,
    viewerMinutes = 0,
    isLive = false,
}: SubTSPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mediaErrorCountRef = useRef<number>(0);
    const cdnStatsRef = useRef<CdnStats>({ ...DEFAULT_CDN });
    const cdnPlaylistStatsRef = useRef<CdnStats>({ ...DEFAULT_CDN });
    const viewerIdRef = useRef<string>(
        sessionStorage.getItem('hls_viewer_id') ??
        (() => { const id = crypto.randomUUID(); sessionStorage.setItem('hls_viewer_id', id); return id; })(),
    );

    const [playlistMode, setPlaylistMode] = useState<PlaylistMode>('llhls');
    const quality: Quality = 'auto';
    const [forceHlsJs, setForceHlsJs] = useState(false);

    const [status, setStatus] = useState<Status>('idle');
    const [statusMsg, setStatusMsg] = useState('Not connected');
    const [playerInfo, setPlayerInfo] = useState('');
    const [stats, setStats] = useState<Stats>({ ...DEFAULT_STATS });
    const [abrLogs, setAbrLogs] = useState<AbrLog[]>([]);
    const [isAtLiveEdge, setIsAtLiveEdge] = useState(true);

    // UI state
    const [isPaused, setIsPaused] = useState(true);
    const [isMuted, setIsMuted] = useState(false); // Start muted to allow auto-play
    const [volume, setVolume] = useState(1); // Start volume at 1
    const [controlsVisible, setControlsVisible] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const settingsOpenRef = useRef(settingsOpen);
    const lastMoveRef = useRef(0);
    useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);

    // ---- URL builder ----
    const buildUrl = useCallback((): string | null => {
        if (!url) return null;

        // If we want to support switching between llhls and simple, we might need to alter the URL 
        // if the user passes a URL ending with playlist.m3u8 or simple-master.m3u8.
        // For now, we will just use the provided URL directly, but adapt it based on mode if possible:
        let finalUrl = url;
        if (playlistMode === 'simple' && finalUrl.endsWith('playlist.m3u8')) {
            finalUrl = finalUrl.replace('playlist.m3u8', 'simple-master.m3u8');
        } else if (playlistMode === 'llhls' && finalUrl.endsWith('simple-master.m3u8')) {
            finalUrl = finalUrl.replace('simple-master.m3u8', 'playlist.m3u8');
        }
        return finalUrl;
    }, [url, playlistMode]);

    // ---- Controls visibility ----
    const showControls = useCallback(() => {
        const now = Date.now();
        if (now - lastMoveRef.current < 200) return;
        lastMoveRef.current = now;

        setControlsVisible(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
            if (!settingsOpenRef.current) setControlsVisible(false);
        }, 3000);
    }, []);

    // ---- Stats loop ----
    const startStats = useCallback(() => {
        if (statsTimerRef.current) clearInterval(statsTimerRef.current);
        statsTimerRef.current = setInterval(() => {
            const video = videoRef.current;
            const hls = hlsRef.current;
            if (!video || !video.buffered.length) return;

            const end = video.buffered.end(video.buffered.length - 1);
            const bufferTotal = (end - video.buffered.start(0)).toFixed(1) + 's';

            let latency: string;
            if (isFinite(video.duration) && video.duration > 0) {
                latency = (video.duration - video.currentTime).toFixed(2) + 's';
            } else if (hls && typeof (hls as any).latency === 'number' && isFinite((hls as any).latency)) {
                latency = ((hls as any).latency as number).toFixed(2) + 's';
            } else {
                latency = (end - video.currentTime).toFixed(2) + 's';
            }

            let resolution = video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '--';
            let rendition = '--';
            let bitrate = '--';
            let bandwidth = '--';
            let abrMode = '--';
            let abrModeColor = '#3ea6ff';

            if (hls) {
                const currentLevel = hls.currentLevel;
                const totalLevels = hls.levels?.length ?? 0;
                const level = hls.levels?.[currentLevel];

                if (quality !== 'auto') {
                    rendition = quality;
                } else if (level) {
                    rendition = level.height ? `${level.height}p (auto)` : '--';
                }
                if (level?.bitrate) bitrate = `${(level.bitrate / 1_000_000).toFixed(2)} Mbps`;
                bandwidth = hls.bandwidthEstimate > 0
                    ? `${(hls.bandwidthEstimate / 1_000_000).toFixed(2)} Mbps`
                    : '--';
                const isAuto = hls.autoLevelEnabled;
                abrMode = isAuto
                    ? `Auto (${currentLevel + 1}/${totalLevels})`
                    : `Fixed (${currentLevel + 1}/${totalLevels})`;
                abrModeColor = isAuto ? '#3ea6ff' : '#ffa500';
            }

            const segTotal = cdnStatsRef.current.total;
            const hitrate = segTotal > 0
                ? `${((cdnStatsRef.current.hits / segTotal) * 100).toFixed(1)}% (${cdnStatsRef.current.hits}/${segTotal})`
                : '--';
            const plTotal = cdnPlaylistStatsRef.current.total;
            const playlistHitrate = plTotal > 0
                ? `${((cdnPlaylistStatsRef.current.hits / plTotal) * 100).toFixed(1)}% (${cdnPlaylistStatsRef.current.hits}/${plTotal})`
                : '--';

            let currentLatency = 0;
            if (hls && typeof (hls as any).latency === 'number' && isFinite((hls as any).latency)) {
                currentLatency = (hls as any).latency as number;
            } else if (isFinite(video.duration) && video.duration > 0) {
                currentLatency = video.duration - video.currentTime;
            } else {
                currentLatency = end - video.currentTime;
            }
            setIsAtLiveEdge(currentLatency < 8);

            if (settingsOpenRef.current) {
                setStats({ latency, buffer: bufferTotal, resolution, rendition, bitrate, bandwidth, abrMode, abrModeColor, hitrate, playlistHitrate });
            }
        }, 2000);
    }, [quality]);

    const stopStats = useCallback(() => {
        if (statsTimerRef.current) { clearInterval(statsTimerRef.current); statsTimerRef.current = null; }
    }, []);

    const resetAll = useCallback(() => {
        setStats({ ...DEFAULT_STATS });
        setAbrLogs([]);
        cdnStatsRef.current = { ...DEFAULT_CDN };
        cdnPlaylistStatsRef.current = { ...DEFAULT_CDN };
        setPlayerInfo('');
    }, []);

    const addAbrLog = useCallback((message: string, type: 'switch' | 'manual' | 'auto') => {
        if (!settingsOpenRef.current) return;
        const icon = type === 'switch' ? '↔️' : type === 'manual' ? '🎯' : '🔄';
        const time = new Date().toLocaleTimeString();
        setAbrLogs((prev) => [{ time, icon, message }, ...prev].slice(0, 5));
    }, []);

    const seekToLive = useCallback(() => {
        const video = videoRef.current;
        if (!video || !video.buffered.length) return;
        const end = video.buffered.end(video.buffered.length - 1);
        video.currentTime = Math.max(0, end - 2);
        video.play().catch(() => { });
        setIsAtLiveEdge(true);
    }, []);

    // ---- Core play logic ----
    const play = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        video.src = '';
        video.load();
        stopStats();
        mediaErrorCountRef.current = 0;
        resetAll();

        const url = buildUrl();
        if (!url) { setStatus('error'); setStatusMsg('Invalid URL'); return; }

        setStatus('connecting');
        setStatusMsg('Connecting...');

        const isAutoABR = quality === 'auto';
        const mode = playlistMode;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || /iPad|iPhone|iPod/.test(navigator.userAgent);
        const canUseNative = !!video.canPlayType('application/vnd.apple.mpegurl');

        const onLoaded = () => {
            setStatus('connected');
            setStatusMsg('Live');
            startStats();
            video.play().catch(e => console.warn('Autoplay prevented:', e));
        };

        if (!forceHlsJs && isSafari && canUseNative) {
            setPlayerInfo(mode === 'llhls' ? 'Safari Native (LL-HLS)' : 'Safari Native');
            video.src = url;
            video.onloadedmetadata = onLoaded;
            video.onerror = () => { setStatus('error'); setStatusMsg('Playback error'); };
            return;
        }

        if (!Hls.isSupported()) {
            setPlayerInfo('Native HLS');
            video.src = url;
            video.onloadedmetadata = onLoaded;
            video.onerror = () => { setStatus('error'); setStatusMsg('Playback error'); };
            return;
        }

        setPlayerInfo(mode === 'llhls' ? 'HLS.js (LL-HLS)' : 'HLS.js (Standard)');

        const hlsConfig: Partial<Hls['config']> = {
            enableWorker: true,
            debug: false,
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
            xhrSetup: (xhr: XMLHttpRequest) => {
                if (token) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                }
                xhr.setRequestHeader('X-Viewer-Id', viewerIdRef.current);
            },
            ...(mode === 'llhls'
                ? {
                    lowLatencyMode: true,
                    liveSyncDuration: 2,
                    liveMaxLatencyDuration: 4.5,
                    maxLiveSyncPlaybackRate: 1.1,
                }
                : {
                    lowLatencyMode: false,
                    liveSyncDurationCount: 3,
                    liveMaxLatencyDurationCount: 10,
                }),
        };

        const hls = new Hls(hlsConfig as any);
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
            if (!isAutoABR) {
                const targetHeight =
                    quality === 'original'
                        ? Math.max(...data.levels.map((l: any) => l.height))
                        : parseInt((quality as any).replace('p', ''), 10);
                const idx = data.levels.findIndex((l: any) => l.height === targetHeight);
                if (idx >= 0) { hls.currentLevel = idx; addAbrLog(`Manual: ${quality}`, 'manual'); }
            } else {
                hls.currentLevel = -1;
                addAbrLog('ABR enabled', 'auto');
            }
            onLoaded();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
            const level = hls.levels[data.level];
            if (level && isAutoABR) {
                const bw = hls.bandwidthEstimate ? (hls.bandwidthEstimate / 1_000_000).toFixed(2) : '?';
                addAbrLog(`${level.height}p (bw: ${bw} Mbps)`, 'switch');
            }
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) {
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    setStatus('error');
                    setStatusMsg('Network error – retrying…');
                    setTimeout(() => hlsRef.current?.startLoad(), 2000);
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    mediaErrorCountRef.current += 1;
                    if (mediaErrorCountRef.current <= 2) {
                        setStatus('error');
                        setStatusMsg(`Media error – recovering (${mediaErrorCountRef.current})…`);
                        hls.recoverMediaError();
                    } else {
                        mediaErrorCountRef.current = 0;
                        playRef.current();
                    }
                } else {
                    setStatus('error');
                    setStatusMsg(`Error: ${data.details}`);
                    setTimeout(() => playRef.current(), 3000);
                }
            }
        });

        hls.loadSource(url);
        hls.attachMedia(video);
    }, [buildUrl, quality, playlistMode, forceHlsJs, startStats, stopStats, resetAll, addAbrLog, token]);

    const stop = useCallback(() => {
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        const video = videoRef.current;
        if (video) { video.src = ''; video.load(); }
        stopStats();
        mediaErrorCountRef.current = 0;
        setStatus('idle');
        setStatusMsg('Not connected');
        resetAll();
    }, [stopStats, resetAll]);

    const playRef = useRef(play);
    const stopRef = useRef(stop);
    useEffect(() => { playRef.current = play; }, [play]);
    useEffect(() => { stopRef.current = stop; }, [stop]);

    // Auto-play when isLive becomes true or immediately if mounted and live
    const isMountedRef = useRef(false);
    useEffect(() => {
        if (!isMountedRef.current) {
            isMountedRef.current = true;
            if (isLive) {
                const t = setTimeout(() => playRef.current(), 600);
                return () => clearTimeout(t);
            }
            return;
        }
        if (isLive) {
            const t = setTimeout(() => playRef.current(), 600);
            return () => clearTimeout(t);
        } else {
            stopRef.current();
        }
    }, [isLive]);

    useEffect(() => () => { stop(); }, [stop]);

    // Fullscreen events
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            if (!hlsRef.current && video.src === '') play();
            else {
                if (status === 'connected') seekToLive();
                video.play().catch(() => { });
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
        if (!document.fullscreenElement) el.requestFullscreen().catch(() => { });
        else document.exitFullscreen();
    };

    // ---- Dot/status display ----
    const dotColor = status === 'connected' ? (isAtLiveEdge ? '#ff0000' : '#888') : status === 'error' ? '#ff4444' : '#555';
    const dotGlow = status === 'connected' && isAtLiveEdge ? '0 0 8px #ff0000' : undefined;
    const statusLabel = status === 'connected' ? (isAtLiveEdge ? 'LIVE' : 'GO LIVE') : status === 'connecting' ? 'CONNECTING...' : status === 'error' ? statusMsg : 'OFFLINE';
    const statusColor = status === 'connected' ? (isAtLiveEdge ? '#fff' : '#ccc') : status === 'error' ? '#ff4444' : '#999';

    const statsItems: [string, string, string?][] = [
        ['Latency', stats.latency],
        ['Buffer', stats.buffer],
        ['Resolution', stats.resolution],
        ['Rendition', stats.rendition],
        ['Bitrate', stats.bitrate],
        ['Bandwidth', stats.bandwidth],
        ['ABR Mode', stats.abrMode, stats.abrModeColor],
        ['CDN Seg', stats.hitrate],
        ['CDN Playlist', stats.playlistHitrate],
        ['Player', playerInfo || '--', '#999'],
    ];

    const ctrlBtn: React.CSSProperties = {
        background: 'none', border: 'none', color: 'white', cursor: 'pointer',
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, transition: 'color 0.2s',
    };

    const panelSelect: React.CSSProperties = {
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: 'white', padding: '7px 10px',
        borderRadius: 6, fontSize: 12,
        width: 160, outline: 'none',
    };

    return (
        <div
            ref={wrapperRef}
            style={{ position: 'relative', width: '100%', background: '#000', borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', cursor: 'default' }}
            onMouseMove={showControls}
            onMouseLeave={() => { if (!settingsOpen) setControlsVisible(false); }}
        >
            {/* Loader */}
            {status === 'connecting' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none' }}>
                    <div style={{ width: 44, height: 44, border: '4px solid rgba(255,255,255,0.15)', borderLeftColor: '#3ea6ff', borderRadius: '50%', animation: 'hlsSpin 1s linear infinite' }} />
                </div>
            )}

            {/* Big Play Button Overlay */}
            {isPaused && status !== 'connecting' && status !== 'error' && (
                <div
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, cursor: 'pointer', background: 'rgba(0,0,0,0.3)' }}
                    onClick={togglePlay}
                >
                    <div className="big-play-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor" width={40} height={40}>
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            )}

            {/* Error Overlay */}
            {status === 'error' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 15, background: 'rgba(0,0,0,0.7)', color: '#ff4444', textAlign: 'center', padding: 20 }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width={48} height={48} style={{ marginBottom: 12 }}>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>Playback Error</div>
                    <div style={{ fontSize: 13, color: '#f1f1f1', wordBreak: 'break-all' }}>{statusMsg}</div>
                    <button onClick={() => playRef.current()} style={{ marginTop: 16, padding: '8px 16px', background: '#3ea6ff', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                        Try Again
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
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
            />

            {/* Top badges */}
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 6, pointerEvents: 'none' }}>
                {status === 'connected' && (
                    <div style={{ background: '#e50914', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                        ● LIVE
                    </div>
                )}
                {viewerCount > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        👁 {viewerCount}
                    </div>
                )}
                {viewerMinutes > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        ⏱ {viewerMinutes.toFixed(1)}m
                    </div>
                )}
            </div>

            {/* Controls overlay */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)',
                padding: '28px 16px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                opacity: controlsVisible || settingsOpen ? 1 : 0,
                transition: 'opacity 0.25s ease',
                zIndex: 20,
            }}>
                {/* Left Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Play/Pause */}
                    <button style={ctrlBtn} onClick={togglePlay} title={isPaused ? 'Play' : 'Pause'}
                        onMouseEnter={e => (e.currentTarget.style.color = '#3ea6ff')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'white')}>
                        {isPaused ? <PlayIcon /> : <PauseIcon />}
                    </button>

                    {/* Volume */}
                    <div style={{ display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => {
                            const s = e.currentTarget.querySelector<HTMLInputElement>('input');
                            if (s) { s.style.width = '72px'; s.style.opacity = '1'; s.style.marginLeft = '4px'; }
                        }}
                        onMouseLeave={e => {
                            const s = e.currentTarget.querySelector<HTMLInputElement>('input');
                            if (s) { s.style.width = '0'; s.style.opacity = '0'; s.style.marginLeft = '0'; }
                        }}>
                        <button style={ctrlBtn} onClick={toggleMute}
                            onMouseEnter={e => (e.currentTarget.style.color = '#3ea6ff')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'white')}>
                            {isMuted || volume === 0 ? <MutedIcon /> : <VolumeIcon />}
                        </button>
                        <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            style={{ width: 0, opacity: 0, marginLeft: 0, transition: 'width 0.25s, opacity 0.25s, margin-left 0.25s', cursor: 'pointer', accentColor: 'white', height: 3 }} />
                    </div>

                    {/* Live badge button */}
                    <button onClick={seekToLive} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: dotGlow, transition: 'background 0.2s, box-shadow 0.2s', flexShrink: 0 }} />
                        <span style={{ color: statusColor, fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', fontFamily: 'inherit' }}>{statusLabel}</span>
                    </button>
                </div>

                {/* Right Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button style={ctrlBtn} onClick={() => setSettingsOpen(s => !s)} title="Settings"
                        onMouseEnter={e => (e.currentTarget.style.color = '#3ea6ff')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'white')}>
                        <SettingsIcon />
                    </button>
                    <button style={ctrlBtn} onClick={toggleFullscreen} title="Fullscreen"
                        onMouseEnter={e => (e.currentTarget.style.color = '#3ea6ff')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'white')}>
                        {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                    </button>
                </div>
            </div>

            {/* Settings Panel */}
            {settingsOpen && (
                <div style={{
                    position: 'absolute', bottom: 56, right: 12,
                    background: 'rgba(22,22,22,0.97)', backdropFilter: 'blur(16px)',
                    borderRadius: 12, width: 320, maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
                    color: '#f1f1f1', display: 'flex', flexDirection: 'column', padding: 18,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)',
                    zIndex: 30, fontSize: 13,
                    scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent',
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Stream Settings</span>
                        <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                    </div>

                    {/* Playback section */}
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#666', letterSpacing: '0.6px', fontWeight: 600, marginBottom: 10 }}>Playback</div>

                    <SettingsRow label="Mode">
                        <select value={playlistMode} onChange={e => setPlaylistMode(e.target.value as PlaylistMode)} style={panelSelect}>
                            <option value="llhls">LL-HLS</option>
                            <option value="simple">Standard HLS</option>
                        </select>
                    </SettingsRow>

                    <SettingsRow label="Force HLS.js">
                        <input type="checkbox" checked={forceHlsJs} onChange={e => setForceHlsJs(e.target.checked)}
                            style={{ width: 15, height: 15, accentColor: '#3ea6ff' }} />
                    </SettingsRow>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
                        <button onClick={play} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 12, background: '#3ea6ff', color: '#000', transition: 'background 0.2s' }}>
                            ▶ Connect
                        </button>
                        <button onClick={stop} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 12, background: 'rgba(255,255,255,0.12)', color: 'white' }}>
                            ⏹ Stop
                        </button>
                    </div>

                    {/* Stats section */}
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#666', letterSpacing: '0.6px', fontWeight: 600, marginBottom: 10, marginTop: 4 }}>Statistics</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8 }}>
                        {statsItems.map(([label, value, color]) => (
                            <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 9, color: '#666', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: color || '#3ea6ff' }}>{value}</span>
                            </div>
                        ))}
                    </div>

                    {/* ABR log */}
                    {abrLogs.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Quality Log</div>
                            <div style={{ fontSize: 10, color: '#888', maxHeight: 60, overflowY: 'auto' }}>
                                {abrLogs.map((log, i) => (
                                    <div key={i} style={{ padding: '2px 0' }}>
                                        {log.icon} <span style={{ opacity: 0.6 }}>{log.time}</span> {log.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Playlist URL */}
                    <div style={{ marginTop: 12, fontSize: 10, color: '#555', wordBreak: 'break-all', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                        {buildUrl() ?? '—'}
                    </div>
                </div>
            )}

            {/* Global CSS for Animations */}
            <style>{`
        @keyframes hlsSpin { 100% { transform: rotate(360deg); } }
        .big-play-btn {
          width: 72px; height: 72px;
          background: rgba(0,0,0,0.6);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: white;
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .big-play-btn:hover {
          background: rgba(0,0,0,0.8);
          transform: scale(1.05);
        }
      `}</style>
        </div>
    );
}

// ---- Helper sub-component ----
function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#ccc' }}>{label}</span>
            {children}
        </div>
    );
}
