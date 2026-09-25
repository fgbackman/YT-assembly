import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Maximize, 
  ShieldCheck, 
  Activity, 
  Zap, 
  Check, 
  Cpu, 
  Youtube, 
  Film,
  Sliders,
  Settings2,
  Info,
  Tv
} from 'lucide-react';
import { Video, BufferMetrics, AdBlockStats } from '../types';
import { ProceduralCanvasVideo } from './ProceduralCanvasVideo';

interface VideoPlayerProps {
  video: Video;
  isDarkMode: boolean;
  adBlockStats: AdBlockStats;
  onAdBlocked: (count?: number) => void;
  onSponsorSkipped: (secondsSaved: number) => void;
  onTimeUpdateSync?: (time: number) => void;
  initialSeekTime?: number;
  onOpenShareModal: () => void;
  onToggleLike: (videoId: string) => void;
  onDownloadVideo: (videoId: string) => void;
  isOfflineMode: boolean;
  onOpenPageBuilder?: () => void;
}

export type PlaybackEngine = 'youtube_embed' | 'html5_mp4' | 'procedural_assembly';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  isDarkMode,
  adBlockStats,
  onAdBlocked,
  onSponsorSkipped,
  onTimeUpdateSync,
  initialSeekTime,
  onOpenShareModal,
  onToggleLike,
  onDownloadVideo,
  isOfflineMode,
  onOpenPageBuilder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Default to YouTube engine whenever video has youtubeId, otherwise HTML5 or procedural
  const [engine, setEngine] = useState<PlaybackEngine>(() => {
    return video.youtubeId ? 'youtube_embed' : (video.videoUrl && video.videoUrl !== 'procedural' ? 'html5_mp4' : 'procedural_assembly');
  });

  const [useNativeYouTubeControls, setUseNativeYouTubeControls] = useState<boolean>(false);
  const [ytApiReady, setYtApiReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(video.durationSeconds || 300);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showBufferInspector, setShowBufferInspector] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(true);
  const [sponsorNotification, setSponsorNotification] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Performance telemetry metrics
  const [bufferSettings, setBufferSettings] = useState<BufferMetrics>({
    bufferedSeconds: 60,
    bufferHealthPercent: 100,
    droppedFrames: 0,
    currentBitrateMbps: 18.5,
    simulatedNetwork: 'fiber',
    preloadStrategy: 'aggressive',
  });

  // When active video changes, reset state
  useEffect(() => {
    setCurrentTime(initialSeekTime || 0);
    setDuration(video.durationSeconds || 300);
    setIsPlaying(true);
    setStatusMessage(null);

    // If video has a YouTube ID, prefer YouTube engine
    if (video.youtubeId) {
      setEngine('youtube_embed');
    } else if (video.videoUrl && video.videoUrl !== 'procedural') {
      setEngine('html5_mp4');
    } else {
      setEngine('procedural_assembly');
    }
  }, [video.id, video.youtubeId, video.videoUrl, video.durationSeconds, initialSeekTime]);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtApiReady(true);
      return;
    }

    const existingScript = document.getElementById('youtube-iframe-api');
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      setYtApiReady(true);
    };

    const interval = setInterval(() => {
      if (window.YT && window.YT.Player) {
        setYtApiReady(true);
        clearInterval(interval);
      }
    }, 150);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      // Even if API doesn't report ready, fallback embed still works
    }, 4000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize YouTube Player via API when in youtube_embed mode without native controls
  useEffect(() => {
    if (engine !== 'youtube_embed') {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
      return;
    }

    if (!video.youtubeId || useNativeYouTubeControls) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
      return;
    }

    if (!ytApiReady || !window.YT || !window.YT.Player) {
      return;
    }

    const containerId = `yt-embed-player-${video.id}`;
    const el = document.getElementById(containerId);
    if (!el) return;

    try {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }

      ytPlayerRef.current = new window.YT.Player(containerId, {
        videoId: video.youtubeId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          start: Math.floor(initialSeekTime || 0),
        },
        events: {
          onReady: (event: any) => {
            const player = event.target;
            const dur = player.getDuration();
            if (dur && dur > 0) setDuration(dur);
            player.setVolume(Math.round(volume * 100));
            if (isMuted) player.mute();
            player.setPlaybackRate(playbackRate);
            player.playVideo();
            setIsPlaying(true);
          },
          onStateChange: (event: any) => {
            if (event.data === 1) { // Playing
              setIsPlaying(true);
            } else if (event.data === 2) { // Paused
              setIsPlaying(false);
            } else if (event.data === 0) { // Ended
              setIsPlaying(false);
            }
          },
          onError: () => {
            setStatusMessage('YouTube API restricted embed. Switched to Native YouTube Web mode.');
            setUseNativeYouTubeControls(true);
          }
        }
      });
    } catch {
      setUseNativeYouTubeControls(true);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [engine, video.id, video.youtubeId, useNativeYouTubeControls, ytApiReady]);

  // Polling loop for current time, duration & buffer fraction from YouTube player
  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    if (engine === 'youtube_embed' && !useNativeYouTubeControls && ytPlayerRef.current) {
      pollIntervalRef.current = setInterval(() => {
        const player = ytPlayerRef.current;
        if (!player || typeof player.getCurrentTime !== 'function') return;

        try {
          const cur = player.getCurrentTime() || 0;
          const dur = player.getDuration() || duration;
          const loadedFraction = player.getVideoLoadedFraction() || 0;

          setCurrentTime(cur);
          if (dur > 0 && Math.abs(dur - duration) > 1) {
            setDuration(dur);
          }
          if (onTimeUpdateSync) onTimeUpdateSync(cur);

          const aheadSeconds = Math.max(0, (loadedFraction * dur) - cur);
          setBufferSettings(prev => ({
            ...prev,
            bufferedSeconds: Math.round(aheadSeconds),
            bufferHealthPercent: Math.min(100, Math.round(loadedFraction * 100)),
          }));
        } catch {}
      }, 250);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [engine, useNativeYouTubeControls, duration, onTimeUpdateSync]);

  // HTML5 Video tag events
  useEffect(() => {
    if (engine !== 'html5_mp4') return;
    const v = videoRef.current;
    if (!v) return;

    const handleLoadedMetadata = () => {
      if (v.duration && !isNaN(v.duration)) setDuration(v.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(v.currentTime);
      if (onTimeUpdateSync) onTimeUpdateSync(v.currentTime);

      if (v.buffered.length > 0) {
        const bufEnd = v.buffered.end(v.buffered.length - 1);
        const ahead = Math.max(0, bufEnd - v.currentTime);
        setBufferSettings(prev => ({
          ...prev,
          bufferedSeconds: Math.round(ahead),
          bufferHealthPercent: Math.min(100, Math.round((bufEnd / (v.duration || 1)) * 100)),
        }));
      }
    };

    const handleError = () => {
      setStatusMessage('Stream unavailable. Switched seamlessly to YouTube Web Player.');
      setEngine(video.youtubeId ? 'youtube_embed' : 'procedural_assembly');
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    v.addEventListener('loadedmetadata', handleLoadedMetadata);
    v.addEventListener('timeupdate', handleTimeUpdate);
    v.addEventListener('error', handleError);
    v.addEventListener('play', handlePlay);
    v.addEventListener('pause', handlePause);

    v.play().catch(() => {});

    return () => {
      v.removeEventListener('loadedmetadata', handleLoadedMetadata);
      v.removeEventListener('timeupdate', handleTimeUpdate);
      v.removeEventListener('error', handleError);
      v.removeEventListener('play', handlePlay);
      v.removeEventListener('pause', handlePause);
    };
  }, [engine, video.youtubeId, onTimeUpdateSync]);

  // SponsorBlock auto-skipping
  useEffect(() => {
    if (adBlockStats.skipSponsors && video.sponsorsSegments && video.sponsorsSegments.length > 0) {
      for (const seg of video.sponsorsSegments) {
        if (currentTime >= seg.start && currentTime < seg.end) {
          const skipDuration = seg.end - seg.start;
          handleSeek(seg.end);
          onSponsorSkipped(skipDuration);
          setSponsorNotification(`⚡ Skipped ${seg.label} (+${Math.round(skipDuration)}s saved)`);
          setTimeout(() => setSponsorNotification(null), 3000);
          break;
        }
      }
    }
  }, [currentTime, video.sponsorsSegments, adBlockStats.skipSponsors, onSponsorSkipped]);

  // Controls Handlers
  const handleTogglePlay = () => {
    if (engine === 'youtube_embed' && ytPlayerRef.current) {
      try {
        if (isPlaying) {
          ytPlayerRef.current.pauseVideo();
          setIsPlaying(false);
        } else {
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        }
      } catch {}
    } else if (engine === 'html5_mp4' && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    } else {
      setIsPlaying(p => !p);
    }
  };

  const handleSeek = (newTime: number) => {
    const clampedTime = Math.max(0, Math.min(duration || 100, newTime));
    setCurrentTime(clampedTime);

    if (engine === 'youtube_embed' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.seekTo(clampedTime, true);
      } catch {}
    } else if (engine === 'html5_mp4' && videoRef.current) {
      videoRef.current.currentTime = clampedTime;
    }

    if (onTimeUpdateSync) onTimeUpdateSync(clampedTime);
  };

  const handleSkip = (seconds: number) => {
    handleSeek(currentTime + seconds);
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (engine === 'youtube_embed' && ytPlayerRef.current) {
      try {
        if (nextMuted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
      } catch {}
    } else if (engine === 'html5_mp4' && videoRef.current) {
      videoRef.current.volume = nextMuted ? 0 : volume;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    const muted = newVol === 0;
    setIsMuted(muted);

    if (engine === 'youtube_embed' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setVolume(Math.round(newVol * 100));
        if (muted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
      } catch {}
    } else if (engine === 'html5_mp4' && videoRef.current) {
      videoRef.current.volume = newVol;
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);

    if (engine === 'youtube_embed' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setPlaybackRate(rate);
      } catch {}
    } else if (engine === 'html5_mp4' && videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleMouseMove = () => {
    setIsHovered(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setIsHovered(false);
    }, 2800);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentPercentage = Math.min(100, Math.max(0, (currentTime / (duration || 1)) * 100));

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video bg-[#08080a] rounded-xl overflow-hidden group select-none shadow-2xl border border-white/10"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setIsHovered(false)}
    >
      {/* 1) YOUTUBE ENGINE */}
      {engine === 'youtube_embed' && (
        <div className="w-full h-full relative bg-black">
          {/* If native controls are requested, render clean responsive embed iframe */}
          {useNativeYouTubeControls ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.youtubeId || 'kJQP7kiw5Fk'}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&rel=0&modestbranding=1`}
              title={video.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            /* YouTube IFrame API Target Container */
            <div className="w-full h-full relative">
              <div 
                id={`yt-embed-player-${video.id}`} 
                ref={ytContainerRef}
                className="w-full h-full pointer-events-none"
              />
              {/* Click overlay to toggle play/pause */}
              <div 
                className="absolute inset-0 cursor-pointer z-10"
                onClick={handleTogglePlay}
              />
            </div>
          )}
        </div>
      )}

      {/* 2) HTML5 MP4 ENGINE */}
      {engine === 'html5_mp4' && (
        <video
          ref={videoRef}
          src={video.videoUrl}
          autoPlay
          playsInline
          className="w-full h-full object-contain cursor-pointer"
          onClick={handleTogglePlay}
        />
      )}

      {/* 3) PROCEDURAL ASSEMBLY GENERATIVE ENGINE */}
      {engine === 'procedural_assembly' && (
        <div className="w-full h-full cursor-pointer" onClick={handleTogglePlay}>
          <ProceduralCanvasVideo
            videoId={video.id}
            category={video.category}
            title={video.title}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            onTimeUpdate={(t) => {
              setCurrentTime(t);
              if (onTimeUpdateSync) onTimeUpdateSync(t);
            }}
            speed={playbackRate}
            volume={volume}
            isMuted={isMuted}
          />
        </div>
      )}

      {/* Top Left: Cocoa Engine Switcher & AdShield Status */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2 flex-wrap">
        <div className="px-2.5 py-1 rounded-md text-[10px] font-mono flex items-center gap-1.5 shadow-md backdrop-blur-md border bg-emerald-950/80 border-emerald-500/40 text-emerald-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold">COCOA AD-SHIELD</span>
          <span className="text-emerald-400 font-bold">ACTIVE</span>
        </div>

        {/* Engine switcher quick pill */}
        <div className="flex items-center p-0.5 rounded-md bg-black/80 border border-white/15 backdrop-blur-md text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setEngine('youtube_embed')}
            className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
              engine === 'youtube_embed' 
                ? 'bg-rose-600 text-white font-semibold shadow-sm' 
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Official YouTube Stream Engine"
          >
            <Youtube className="w-3 h-3" />
            <span>YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => setEngine('html5_mp4')}
            className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
              engine === 'html5_mp4' 
                ? 'bg-rose-600 text-white font-semibold shadow-sm' 
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Direct HTML5 Video Stream"
          >
            <Film className="w-3 h-3" />
            <span>HTML5</span>
          </button>

          <button
            type="button"
            onClick={() => setEngine('procedural_assembly')}
            className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
              engine === 'procedural_assembly' 
                ? 'bg-rose-600 text-white font-semibold shadow-sm' 
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Assembly Hardware 60FPS Generative Canvas"
          >
            <Cpu className="w-3 h-3" />
            <span>Generative</span>
          </button>
        </div>

        {/* Cocoa Controls vs Native YouTube Controls Toggle (when in youtube_embed) */}
        {engine === 'youtube_embed' && (
          <button
            type="button"
            onClick={() => setUseNativeYouTubeControls(!useNativeYouTubeControls)}
            className={`px-2 py-1 rounded-md text-[10px] font-mono backdrop-blur-md border transition-colors flex items-center gap-1 ${
              useNativeYouTubeControls
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-black/70 border-white/10 text-neutral-300 hover:text-white'
            }`}
            title="Switch between Cocoa window controls overlay and native YouTube player controls"
          >
            <Tv className="w-3 h-3" />
            <span>{useNativeYouTubeControls ? 'Native YouTube Controls' : 'Cocoa Controls'}</span>
          </button>
        )}
      </div>

      {/* Top Right: Buffer Health & Speed Status */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowBufferInspector(!showBufferInspector)}
          className="px-2 py-1 rounded-md bg-black/80 hover:bg-black/95 border border-white/15 text-[11px] font-mono text-white/90 backdrop-blur-md flex items-center gap-1.5 transition-colors"
        >
          <Activity className="w-3.5 h-3.5 text-sky-400" />
          <span>Buffer: +{bufferSettings.bufferedSeconds}s</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        <div className="px-2 py-1 rounded-md bg-black/80 border border-white/10 text-[11px] font-mono text-white/80 backdrop-blur-md">
          {video.resolution}
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-md bg-sky-950/90 border border-sky-500/40 text-sky-200 font-mono text-xs shadow-lg flex items-center gap-2 backdrop-blur-md">
          <Info className="w-3.5 h-3.5 text-sky-400" />
          <span>{statusMessage}</span>
          <button 
            type="button" 
            onClick={() => setStatusMessage(null)}
            className="ml-2 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* SponsorBlock Auto-Skip Toast */}
      {sponsorNotification && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-md bg-amber-500 text-black font-semibold text-xs shadow-lg flex items-center gap-2 animate-bounce">
          <Zap className="w-3.5 h-3.5 fill-black" />
          <span>{sponsorNotification}</span>
        </div>
      )}

      {/* Center Big Play/Pause Overlay (when Cocoa controls are active) */}
      {!useNativeYouTubeControls && (!isPlaying || isHovered) && (
        <button
          type="button"
          onClick={handleTogglePlay}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-transform hover:scale-105 active:scale-95 shadow-2xl z-20"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
        </button>
      )}

      {/* Buffer Inspector Overlay */}
      {showBufferInspector && (
        <div className="absolute top-12 right-3 z-40 w-72 p-3 rounded-lg bg-neutral-900/95 border border-white/15 text-xs text-neutral-200 backdrop-blur-xl shadow-2xl space-y-2.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              Cocoa Buffer Inspector
            </span>
            <button 
              type="button"
              onClick={() => setShowBufferInspector(false)}
              className="text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="p-1.5 rounded bg-white/5">
              <div className="text-neutral-400">Buffer Ahead</div>
              <div className="text-emerald-400 font-bold text-sm">+{bufferSettings.bufferedSeconds}s</div>
            </div>
            <div className="p-1.5 rounded bg-white/5">
              <div className="text-neutral-400">Stream Health</div>
              <div className="text-sky-400 font-bold text-sm">{bufferSettings.bufferHealthPercent}% 60FPS</div>
            </div>
            <div className="p-1.5 rounded bg-white/5">
              <div className="text-neutral-400">Bitrate</div>
              <div className="text-white font-semibold">18.5 Mbps</div>
            </div>
            <div className="p-1.5 rounded bg-white/5">
              <div className="text-neutral-400">Dropped Frames</div>
              <div className="text-emerald-400 font-semibold">0 (0.00%)</div>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400 flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hardware acceleration: Active (Metal WebGL2/AV1)</span>
          </div>
        </div>
      )}

      {/* Floating Cocoa Bottom Controls Bar (Rendered when Cocoa controls are active) */}
      {!useNativeYouTubeControls && (
        <div 
          className={`absolute bottom-0 inset-x-0 z-30 pt-8 pb-3 px-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-200 ${
            isHovered || !isPlaying ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Scrubber Timeline */}
          <div className="relative w-full h-4 flex items-center group/scrubber cursor-pointer mb-2">
            <div className="absolute inset-x-0 h-1 group-hover/scrubber:h-1.5 bg-white/20 rounded-full transition-all overflow-hidden">
              {/* Buffer line */}
              <div 
                className="absolute left-0 top-0 bottom-0 bg-white/40 transition-all"
                style={{ width: `${Math.min(100, currentPercentage + (bufferSettings.bufferedSeconds / (duration || 1)) * 100)}%` }}
              />

              {/* Sponsor segments markers */}
              {video.sponsorsSegments && video.sponsorsSegments.map((seg, idx) => {
                const segStart = (seg.start / (duration || 1)) * 100;
                const segWidth = ((seg.end - seg.start) / (duration || 1)) * 100;
                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 bg-amber-400/90 z-10"
                    style={{ left: `${segStart}%`, width: `${segWidth}%` }}
                    title={`${seg.label} (auto-skipped)`}
                  />
                );
              })}

              {/* Current Playhead */}
              <div 
                className="absolute left-0 top-0 bottom-0 bg-rose-500 rounded-full"
                style={{ width: `${currentPercentage}%` }}
              />
            </div>

            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer scrub-slider z-20"
              aria-label="Seek Video"
            />

            <div 
              className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md pointer-events-none -translate-x-1/2 opacity-0 group-hover/scrubber:opacity-100 transition-opacity z-10"
              style={{ left: `${currentPercentage}%` }}
            />
          </div>

          {/* Lower row */}
          <div className="flex items-center justify-between text-white text-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="p-1 hover:text-rose-400 transition-colors"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              <button
                type="button"
                onClick={() => handleSkip(-10)}
                className="p-1 hover:text-neutral-300 transition-colors"
                title="Rewind 10s"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleSkip(10)}
                className="p-1 hover:text-neutral-300 transition-colors"
                title="Forward 10s"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="p-1 hover:text-neutral-300 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
                  aria-label="Volume"
                />
              </div>

              {/* Time display */}
              <div className="text-[11px] font-mono text-neutral-300 tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span className="text-neutral-500 mx-1">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Playback speed selector */}
              <div className="flex items-center gap-1 font-mono text-[11px]">
                {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handlePlaybackRateChange(r)}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      playbackRate === r ? 'bg-white/20 text-white font-bold' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="p-1 hover:text-neutral-300 transition-colors"
                title="Fullscreen Stage"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
