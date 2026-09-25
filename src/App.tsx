import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { CocoaTitlebar } from './components/CocoaTitlebar';
import { CocoaStatusFooter } from './components/CocoaStatusFooter';
import { VideoPlayer } from './components/VideoPlayer';
import { VideoInfoBar } from './components/VideoInfoBar';
import { SearchAndFilters } from './components/SearchAndFilters';
import { FrontPageGrid } from './components/FrontPageGrid';

// Modals are code-split and only mounted while open, keeping them (and JSZip)
// out of the initial bundle and out of every App re-render.
const DeviceSyncModal = lazy(() => import('./components/DeviceSyncModal').then(m => ({ default: m.DeviceSyncModal })));
const OfflineManagerModal = lazy(() => import('./components/OfflineManagerModal').then(m => ({ default: m.OfflineManagerModal })));
const SocialShareModal = lazy(() => import('./components/SocialShareModal').then(m => ({ default: m.SocialShareModal })));
const NotificationSettingsModal = lazy(() => import('./components/NotificationSettingsModal').then(m => ({ default: m.NotificationSettingsModal })));
const AdBlockModal = lazy(() => import('./components/AdBlockModal').then(m => ({ default: m.AdBlockModal })));
const PageBuilderModal = lazy(() => import('./components/PageBuilderModal').then(m => ({ default: m.PageBuilderModal })));
const DownloadFilesModal = lazy(() => import('./components/DownloadFilesModal').then(m => ({ default: m.DownloadFilesModal })));
import { 
  INITIAL_VIDEOS, 
  MOCK_COMMENTS, 
  INITIAL_DEVICES, 
  INITIAL_NOTIFICATIONS 
} from './data/mockVideos';
import { 
  Video, 
  Comment, 
  SyncDevice, 
  NotificationItem, 
  NotificationSettings, 
  AdBlockStats,
  PageSectionConfig,
  PageSectionId,
  CustomVideoInput
} from './types';
import { Sliders, Plus, Zap, Activity, EyeOff, LayoutTemplate, DownloadCloud } from 'lucide-react';

const DEFAULT_SECTIONS: PageSectionConfig[] = [
  {
    id: 'searchAndFilters',
    label: 'Search & Category Quick Tabs',
    description: 'Instant search bar, filter tabs, and results count',
    visible: true,
    order: 0,
    category: 'core',
  },
  {
    id: 'playerStage',
    label: 'Video Player Viewport & Buffering Stage',
    description: 'Hardware 60FPS video canvas, engine selector, and scrub timeline',
    visible: true,
    order: 1,
    category: 'stage',
  },
  {
    id: 'videoInfo',
    label: 'Video Info & Action Bar',
    description: 'Channel subscriber lockup, like counter, offline cache, and comments',
    visible: true,
    order: 2,
    category: 'stage',
  },
  {
    id: 'upNextQueue',
    label: 'Up Next Spotlight Queue',
    description: 'Sidebar playlist and spotlight recommended streams',
    visible: true,
    order: 3,
    category: 'stage',
  },
  {
    id: 'perfTelemetry',
    label: 'Cocoa Performance & Buffering Strip',
    description: 'Live zero-latency hardware buffer status and frame rate metrics',
    visible: true,
    order: 4,
    category: 'telemetry',
  },
  {
    id: 'frontPageFeed',
    label: 'Front Page Video Catalog Feed',
    description: 'Full-screen grid of all assembly stream channels and downloads',
    visible: true,
    order: 5,
    category: 'feed',
  },
  {
    id: 'statusFooter',
    label: 'Cocoa Window Status Bar Footer',
    description: 'Bottom status bar with hardware specs, continuity, and ad-blocking status',
    visible: true,
    order: 6,
    category: 'core',
  },
];


interface YouTubeSearchResult {
  youtubeId: string;
  title: string;
  channel: string;
  description: string;
  duration: string;
  views: string;
  publishedDate: string;
  thumbnailUrl: string;
}

const parseDurationSeconds = (duration: string) =>
  duration.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);

const toYouTubeVideo = (r: YouTubeSearchResult): Video => ({
  id: `yt-${r.youtubeId}`,
  title: r.title,
  channel: r.channel,
  channelAvatar: r.channel.slice(0, 2).toUpperCase() || 'YT',
  subscribers: '',
  views: r.views ? `${r.views}${/views?$/i.test(r.views) ? '' : ' views'}` : '',
  viewCount: 0,
  publishedDate: r.publishedDate,
  duration: r.duration,
  durationSeconds: parseDurationSeconds(r.duration) || 600,
  description: r.description,
  category: 'Tech',
  tags: [],
  videoUrl: `https://www.youtube.com/watch?v=${r.youtubeId}`,
  youtubeId: r.youtubeId,
  thumbnailGradient: 'from-zinc-800 via-neutral-900 to-black',
  thumbnailUrl: r.thumbnailUrl,
  source: 'youtube',
  previewSvgIcon: 'play',
  resolution: 'YouTube',
  fps: 30,
  isLiked: false,
  likeCount: 0,
  isOffline: false,
  sponsorsSegments: [],
});

export default function App() {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('assembly_dark_mode');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Window state
  const [isWindowMaximized, setIsWindowMaximized] = useState<boolean>(false);
  const [activeLayoutMode, setActiveLayoutMode] = useState<'standard' | 'theater' | 'compact'>('standard');

  // Page Builder section state
  const [sections, setSections] = useState<PageSectionConfig[]>(() => {
    try {
      const saved = localStorage.getItem('assembly_page_sections');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return DEFAULT_SECTIONS;
  });

  // Video catalog & Active stream
  const [videos, setVideos] = useState<Video[]>(() => {
    try {
      const saved = localStorage.getItem('assembly_cached_videos');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return INITIAL_VIDEOS;
  });

  const [activeVideo, setActiveVideo] = useState<Video>(INITIAL_VIDEOS[0]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [initialSeekTime, setInitialSeekTime] = useState<number | undefined>(undefined);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS);

  // Devices & Cross-device sync
  const [devices, setDevices] = useState<SyncDevice[]>(INITIAL_DEVICES);

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    channelAlerts: 'all',
    categories: {
      tech: true,
      design: true,
      space: true,
      ambient: false,
      engineering: true,
      science: true,
    },
    soundAlerts: true,
    desktopPush: false,
    quietHours: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  });

  // AdBlock Stats
  const [adBlockStats, setAdBlockStats] = useState<AdBlockStats>({
    isEnabled: true,
    skipSponsors: true,
    adsBlockedCount: 14,
    sponsorsSkippedCount: 6,
    trackersBlockedCount: 38,
    timeSavedSeconds: 184,
  });

  // Modals state
  const [showDeviceSyncModal, setShowDeviceSyncModal] = useState<boolean>(false);
  const [showOfflineModal, setShowOfflineModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);
  const [showAdBlockModal, setShowAdBlockModal] = useState<boolean>(false);
  const [showPageBuilderModal, setShowPageBuilderModal] = useState<boolean>(false);
  const [showDownloadFilesModal, setShowDownloadFilesModal] = useState<boolean>(false);
  const [shareVideoTarget, setShareVideoTarget] = useState<Video>(INITIAL_VIDEOS[0]);

  // Persist dark mode
  useEffect(() => {
    try {
      localStorage.setItem('assembly_dark_mode', String(isDarkMode));
    } catch {}
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Persist videos
  useEffect(() => {
    try {
      localStorage.setItem('assembly_cached_videos', JSON.stringify(videos));
    } catch {}
  }, [videos]);

  // Persist page sections
  useEffect(() => {
    try {
      localStorage.setItem('assembly_page_sections', JSON.stringify(sections));
    } catch {}
  }, [sections]);

  // Cross-device sync via BroadcastChannel
  useEffect(() => {
    let syncChannel: BroadcastChannel | null = null;
    try {
      syncChannel = new BroadcastChannel('assembly_cocoa_sync_channel');
      syncChannel.onmessage = (event) => {
        const { type, data } = event.data || {};
        if (type === 'SYNC_TIME' && data.currentTime !== undefined) {
          setCurrentTime(data.currentTime);
        } else if (type === 'HANDOFF_VIDEO' && data.video) {
          setActiveVideo(data.video);
          if (data.timestamp !== undefined) {
            setInitialSeekTime(data.timestamp);
          }
        }
      };
    } catch {}

    return () => {
      syncChannel?.close();
    };
  }, []);

  // Live YouTube search: debounced, cancels stale requests, and memoizes per query
  const [remoteResults, setRemoteResults] = useState<Video[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchCacheRef = useRef<Map<string, Video[]>>(new Map());

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2 || isOfflineMode) {
      setRemoteResults([]);
      setIsSearching(false);
      return;
    }

    const cached = searchCacheRef.current.get(q);
    if (cached) {
      setRemoteResults(cached);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        const mapped: Video[] = (data.results ?? []).map(toYouTubeVideo);
        searchCacheRef.current.set(q, mapped);
        setRemoteResults(mapped);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setRemoteResults([]);
      }
      setIsSearching(false);
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, isOfflineMode]);

  // Lowercased search text per video, rebuilt only when the catalog changes
  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const v of videos) {
      index.set(v.id, `${v.title} ${v.channel} ${v.description} ${v.tags.join(' ')}`.toLowerCase());
    }
    return index;
  }, [videos]);

  // Filtered videos based on search, category, and offline mode
  const filteredVideos = useMemo(() => {
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const local = videos.filter((v) => {
      if (isOfflineMode && !v.isOffline) return false;
      if (selectedCategory === 'Offline Saved' && !v.isOffline) return false;

      if (
        selectedCategory !== 'All' && 
        selectedCategory !== 'Offline Saved' && 
        v.category !== selectedCategory
      ) {
        return false;
      }

      if (terms.length) {
        // Every word must appear somewhere (title, channel, description or tags)
        const haystack = searchIndex.get(v.id) ?? '';
        return terms.every(t => haystack.includes(t));
      }

      return true;
    });

    // Live YouTube results have no category, so they only show under "All"
    if (!terms.length || selectedCategory !== 'All' || isOfflineMode) return local;
    const localIds = new Set(local.map(v => v.youtubeId));
    return [...local, ...remoteResults.filter(v => !localIds.has(v.youtubeId))];
  }, [videos, searchIndex, searchQuery, selectedCategory, isOfflineMode, remoteResults]);

  const upNextVideos = useMemo(
    () => filteredVideos.filter(v => v.id !== activeVideo.id).slice(0, 6),
    [filteredVideos, activeVideo.id]
  );

  // In-app suggestions shown on the player's pause / end screen
  const upNextVideos = useMemo(
    () => filteredVideos.filter(v => v.id !== activeVideo.id).slice(0, 4),
    [filteredVideos, activeVideo.id]
  );

  // Section visibility helpers
  const isSectionVisible = useCallback((id: PageSectionId) => {
    const sec = sections.find(s => s.id === id);
    return sec ? sec.visible : true;
  }, [sections]);

  const handleToggleSection = useCallback((id: PageSectionId) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  }, []);

  const handleMoveSection = useCallback((id: PageSectionId, direction: 'up' | 'down') => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  }, []);

  const handleResetSections = useCallback(() => {
    setSections(DEFAULT_SECTIONS);
  }, []);

  // Add custom video handler
  const handleAddCustomVideo = useCallback((newVid: CustomVideoInput) => {
    // Extract potential YouTube ID
    let ytId: string | undefined = undefined;
    if (newVid.videoUrl) {
      const match = newVid.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (match && match[1]) {
        ytId = match[1];
      }
    }

    const createdVideo: Video = {
      id: `custom-vid-${Date.now()}`,
      title: newVid.title,
      channel: newVid.channel,
      channelAvatar: newVid.channel.slice(0, 2).toUpperCase() || 'CV',
      subscribers: '12K',
      views: 'Just added',
      viewCount: 1,
      publishedDate: 'Just now',
      duration: '10:00',
      durationSeconds: 600,
      description: newVid.description || 'Custom stream added via Assembly Page Builder.',
      category: newVid.category,
      tags: ['Custom', newVid.category, 'Assembly'],
      videoUrl: newVid.videoUrl || 'procedural',
      youtubeId: ytId || 'kJQP7kiw5Fk',
      thumbnailGradient: 'from-rose-950 via-zinc-900 to-black',
      previewSvgIcon: 'cpu',
      resolution: '4K Ultra 60fps',
      fps: 60,
      isLiked: false,
      likeCount: 1,
      isOffline: true,
      offlineSizeMb: 120.4,
      downloadDate: 'Today',
      sponsorsSegments: [],
    };

    setVideos(prev => [createdVideo, ...prev]);
    setActiveVideo(createdVideo);
    setInitialSeekTime(0);
  }, []);

  // Handlers
  const handleToggleDarkMode = useCallback(() => setIsDarkMode(prev => !prev), []);
  const handleToggleOfflineMode = useCallback(() => setIsOfflineMode(prev => !prev), []);
  const handleToggleMaximizeWindow = useCallback(() => setIsWindowMaximized(prev => !prev), []);

  // Stable modal openers so memoized children don't re-render on every App update
  const openAdBlockModal = useCallback(() => setShowAdBlockModal(true), []);
  const openDeviceSync = useCallback(() => setShowDeviceSyncModal(true), []);
  const openOfflineManager = useCallback(() => setShowOfflineModal(true), []);
  const openNotifications = useCallback(() => setShowNotificationsModal(true), []);
  const openPageBuilder = useCallback(() => setShowPageBuilderModal(true), []);
  const openDownloadFiles = useCallback(() => setShowDownloadFilesModal(true), []);

  // Players report time several times a second; App only needs whole seconds
  // (for handoff/share), and React skips the re-render when the value is unchanged.
  const handleTimeUpdateSync = useCallback((t: number) => setCurrentTime(Math.floor(t)), []);

  const handleSelectVideo = useCallback((video: Video) => {
    setActiveVideo(video);
    setInitialSeekTime(0);
    const stage = document.getElementById('assembly-stage-top');
    stage?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleToggleLike = useCallback((videoId: string) => {
    setVideos(prev => prev.map(v => {
      if (v.id === videoId) {
        const isLiked = !v.isLiked;
        return {
          ...v,
          isLiked,
          likeCount: isLiked ? v.likeCount + 1 : v.likeCount - 1,
        };
      }
      return v;
    }));
    setActiveVideo(prev => {
      if (prev.id === videoId) {
        const isLiked = !prev.isLiked;
        return {
          ...prev,
          isLiked,
          likeCount: isLiked ? prev.likeCount + 1 : prev.likeCount - 1,
        };
      }
      return prev;
    });
  }, []);

  const handleDownloadVideo = useCallback((videoId: string) => {
    setVideos(prev => prev.map(v => {
      if (v.id === videoId) {
        const isNowOffline = !v.isOffline;
        return {
          ...v,
          isOffline: isNowOffline,
          offlineSizeMb: isNowOffline ? (v.offlineSizeMb || 164.8) : undefined,
          downloadDate: isNowOffline ? 'Just now' : undefined,
        };
      }
      return v;
    }));
    setActiveVideo(prev => {
      if (prev.id === videoId) {
        const isNowOffline = !prev.isOffline;
        return {
          ...prev,
          isOffline: isNowOffline,
          offlineSizeMb: isNowOffline ? (prev.offlineSizeMb || 164.8) : undefined,
          downloadDate: isNowOffline ? 'Just now' : undefined,
        };
      }
      return prev;
    });
  }, []);

  const handleRemoveDownload = useCallback((videoId: string) => {
    handleDownloadVideo(videoId);
  }, [handleDownloadVideo]);

  const handleClearAllDownloads = useCallback(() => {
    setVideos(prev => prev.map(v => ({ ...v, isOffline: false, offlineSizeMb: undefined })));
  }, []);

  const handleOpenShare = useCallback((videoToShare: Video) => {
    setShareVideoTarget(videoToShare);
    setShowShareModal(true);
  }, []);

  const handleOpenShareActive = useCallback(() => {
    handleOpenShare(activeVideo);
  }, [handleOpenShare, activeVideo]);

  const handleHandoffToDevice = useCallback((targetDevice: SyncDevice) => {
    try {
      const channel = new BroadcastChannel('assembly_cocoa_sync_channel');
      channel.postMessage({
        type: 'HANDOFF_VIDEO',
        data: {
          video: activeVideo,
          timestamp: currentTime,
          targetDeviceId: targetDevice.id,
        }
      });
      channel.close();
    } catch {}

    setDevices(prev => prev.map(d => {
      if (d.id === targetDevice.id) {
        return {
          ...d,
          currentVideoId: activeVideo.id,
          currentTimestamp: currentTime,
          lastActive: 'Active Now (Stream Pushed)',
        };
      }
      return d;
    }));
    setShowDeviceSyncModal(false);
  }, [activeVideo, currentTime]);

  const handleResumeFromDevice = useCallback((sourceDevice: SyncDevice) => {
    if (sourceDevice.currentVideoId) {
      const match = videos.find(v => v.id === sourceDevice.currentVideoId);
      if (match) {
        setActiveVideo(match);
      }
    }
    if (sourceDevice.currentTimestamp !== undefined) {
      setInitialSeekTime(sourceDevice.currentTimestamp);
    }
    setShowDeviceSyncModal(false);
  }, [videos]);

  const handleAdBlocked = useCallback((count: number = 1) => {
    setAdBlockStats(prev => ({
      ...prev,
      adsBlockedCount: prev.adsBlockedCount + count,
      trackersBlockedCount: prev.trackersBlockedCount + 2,
    }));
  }, []);

  const handleSponsorSkipped = useCallback((seconds: number) => {
    setAdBlockStats(prev => ({
      ...prev,
      sponsorsSkippedCount: prev.sponsorsSkippedCount + 1,
      timeSavedSeconds: prev.timeSavedSeconds + Math.round(seconds),
    }));
  }, []);

  const handleAddComment = useCallback((text: string) => {
    const newComment: Comment = {
      id: `comm-${Date.now()}`,
      author: 'Assembly Host User',
      avatar: 'AU',
      timeAgo: 'Just now',
      text,
      likes: 1,
      isLiked: true,
    };
    setComments(prev => [newComment, ...prev]);
  }, []);

  const handleToggleLikeComment = useCallback((commentId: string) => {
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        const isLiked = !c.isLiked;
        return {
          ...c,
          isLiked,
          likes: isLiked ? c.likes + 1 : c.likes - 1,
        };
      }
      return c;
    }));
  }, []);

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const handleSelectVideoById = useCallback((id: string) => {
    const v = videos.find(item => item.id === id);
    if (v) handleSelectVideo(v);
  }, [videos, handleSelectVideo]);

  const unreadNotifCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  const activeDevice = useMemo(() => devices.find(d => d.isCurrentDevice), [devices]);

  return (
    <div className={`min-h-screen p-2 sm:p-4 lg:p-6 transition-colors duration-200 flex flex-col items-center justify-center ${
      isDarkMode ? 'bg-[#0f1013] text-neutral-100' : 'bg-[#e7e9ee] text-neutral-900'
    }`}>
      {/* Assembly Cocoa Window Enclosure */}
      <div 
        className={`w-full transition-all duration-200 rounded-2xl flex flex-col overflow-hidden border shadow-2xl ${
          isWindowMaximized 
            ? 'fixed inset-2 z-50 rounded-lg max-w-none h-[calc(100vh-16px)]' 
            : 'max-w-[1540px] max-h-[96vh]'
        } ${
          isDarkMode 
            ? 'bg-[#121316] border-white/[0.12] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.8)]' 
            : 'bg-[#fafbfc] border-black/[0.12] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.18)]'
        }`}
      >
        {/* Cocoa Window Titlebar */}
        <CocoaTitlebar
          isDarkMode={isDarkMode}
          onToggleDarkMode={handleToggleDarkMode}
          isOfflineMode={isOfflineMode}
          onToggleOfflineMode={handleToggleOfflineMode}
          adBlockStats={adBlockStats}
          onOpenAdBlockModal={openAdBlockModal}
          onOpenDeviceSync={openDeviceSync}
          onOpenOfflineManager={openOfflineManager}
          onOpenNotifications={openNotifications}
          onOpenShareModal={handleOpenShareActive}
          onOpenSettings={openNotifications}
          onOpenPageBuilder={openPageBuilder}
          onOpenDownloadFiles={openDownloadFiles}
          unreadNotificationsCount={unreadNotifCount}
          syncedDeviceCount={devices.length}
          activeLayoutMode={activeLayoutMode}
          onChangeLayoutMode={setActiveLayoutMode}
          isWindowMaximized={isWindowMaximized}
          onToggleMaximizeWindow={handleToggleMaximizeWindow}
        />

        {/* Cocoa Main Window Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 space-y-6">
          <div id="assembly-stage-top" />

          {/* Quick Page Builder Floating Bar (Always enables user to add streams or toggle elements) */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs bg-white/[0.02] border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-neutral-300 font-semibold text-[11px]">
                Ultra-Fast Hardware Pipeline (Zero Hosting Required · 60FPS Instant Play)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openDownloadFiles}
                className="px-2.5 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                title="Download all project files (.zip) for macOS"
              >
                <DownloadCloud className="w-3 h-3" />
                <span>Download Files (.ZIP)</span>
              </button>

              <button
                type="button"
                onClick={openPageBuilder}
                className="px-2.5 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-[11px] font-medium flex items-center gap-1.5 transition-colors"
              >
                <Sliders className="w-3 h-3" />
                <span>Build / Hide Parts</span>
              </button>

              <button
                type="button"
                onClick={openPageBuilder}
                className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add Stream</span>
              </button>
            </div>
          </div>

          {/* Module 1: Search & Filter Tabs */}
          {isSectionVisible('searchAndFilters') && (
            <section aria-label="Search and Categorization">
              <SearchAndFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                isDarkMode={isDarkMode}
                totalResults={filteredVideos.length}
                isSearching={isSearching}
                isOfflineMode={isOfflineMode}
                onToggleOfflineOnly={handleToggleOfflineMode}
              />
            </section>
          )}

          {/* Module 2: Performance Telemetry Banner */}
          {isSectionVisible('perfTelemetry') && (
            <div className={`p-2.5 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 font-mono ${
              isDarkMode ? 'bg-white/[0.02] border-white/10 text-neutral-300' : 'bg-neutral-50 border-black/10 text-neutral-700'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> 60 FPS ULTRA BUFFER
                </span>
                <span className="text-neutral-500 hidden sm:inline">|</span>
                <span className="hidden sm:inline">Engine: Hardware Generative + HTML5 + YouTube</span>
                <span className="text-neutral-500 hidden md:inline">|</span>
                <span className="text-sky-400 hidden md:inline">Latency: ~0ms (Instantaneous)</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSection('perfTelemetry')}
                  className="text-neutral-500 hover:text-white flex items-center gap-1 text-[10px]"
                  title="Hide this telemetry strip"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>Hide bar</span>
                </button>
              </div>
            </div>
          )}

          {/* Standard View Layout */}
          {activeLayoutMode === 'standard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Stage (8 Cols): Video Player & Info */}
                <div className="lg:col-span-8 space-y-4">
                  {isSectionVisible('playerStage') && (
                    <VideoPlayer
                      video={activeVideo}
                      isDarkMode={isDarkMode}
                      adBlockStats={adBlockStats}
                      onAdBlocked={handleAdBlocked}
                      onSponsorSkipped={handleSponsorSkipped}
                      onTimeUpdateSync={handleTimeUpdateSync}
                      initialSeekTime={initialSeekTime}
                      onOpenShareModal={handleOpenShareActive}
                      onToggleLike={handleToggleLike}
                      onDownloadVideo={handleDownloadVideo}
                      isOfflineMode={isOfflineMode}
                      onOpenPageBuilder={openPageBuilder}
                    />
                  )}

                  {isSectionVisible('videoInfo') && (
                    <VideoInfoBar
                      video={activeVideo}
                      isDarkMode={isDarkMode}
                      onToggleLike={handleToggleLike}
                      onOpenShareModal={handleOpenShareActive}
                      onDownloadVideo={handleDownloadVideo}
                      onOpenDeviceSync={openDeviceSync}
                      comments={comments}
                      onAddComment={handleAddComment}
                      onToggleLikeComment={handleToggleLikeComment}
                    />
                  )}
                </div>

                {/* Right Stage (4 Cols): Up Next Queue */}
                {isSectionVisible('upNextQueue') && (
                  <div className="lg:col-span-4 space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-white/[0.08]">
                      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Up Next on Stage
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400">
                        Instant 60FPS
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
                      {upNextVideos.map(v => (
                          <div
                            key={v.id}
                            onClick={() => handleSelectVideo(v)}
                            className={`p-2 rounded-lg border flex gap-3 cursor-pointer transition-colors ${
                              isDarkMode 
                                ? 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]' 
                                : 'bg-white border-black/10 hover:bg-neutral-50 shadow-sm'
                            }`}
                          >
                            <div className="relative w-28 aspect-video rounded bg-neutral-900 overflow-hidden shrink-0 flex items-center justify-center">
                              <div className={`absolute inset-0 bg-gradient-to-br ${v.thumbnailGradient} opacity-60`} />
                              {v.thumbnailUrl && (
                                <img src={v.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                              )}
                              <span className="text-white text-[10px] font-mono font-semibold relative z-10 px-1 rounded bg-black/60">
                                {v.duration}
                              </span>
                              {v.isOffline && (
                                <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-amber-500 text-black text-[9px] font-bold">
                                  Offline
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                              <h4 className="text-xs font-semibold line-clamp-2 leading-snug">
                                {v.title}
                              </h4>
                              <div className="text-[11px] text-neutral-400 font-mono">
                                <span>{v.channel}</span>
                                <span className="mx-1">·</span>
                                <span>{v.views}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Module 6: Front Page Catalog Feed */}
              {isSectionVisible('frontPageFeed') && (
                <section className="pt-4 border-t border-white/[0.08]" aria-label="Front Page Catalog">
                  <FrontPageGrid
                    videos={filteredVideos}
                    activeVideoId={activeVideo.id}
                    onSelectVideo={handleSelectVideo}
                    onDownloadVideo={handleDownloadVideo}
                    onOpenShareModal={handleOpenShare}
                    onOpenDeviceSync={openDeviceSync}
                    isDarkMode={isDarkMode}
                    isSearching={isSearching}
                    title="Front Page Stream Catalog"
                  />
                </section>
              )}
            </div>
          )}

          {/* Theater View Layout */}
          {activeLayoutMode === 'theater' && (
            <div className="space-y-6">
              <div className="max-w-6xl mx-auto space-y-4">
                {isSectionVisible('playerStage') && (
                  <VideoPlayer
                    video={activeVideo}
                    isDarkMode={isDarkMode}
                    adBlockStats={adBlockStats}
                    onAdBlocked={handleAdBlocked}
                    onSponsorSkipped={handleSponsorSkipped}
                    onTimeUpdateSync={handleTimeUpdateSync}
                    initialSeekTime={initialSeekTime}
                    onOpenShareModal={handleOpenShareActive}
                    onToggleLike={handleToggleLike}
                    onDownloadVideo={handleDownloadVideo}
                    isOfflineMode={isOfflineMode}
                    onOpenPageBuilder={openPageBuilder}
                  />
                )}

                {isSectionVisible('videoInfo') && (
                  <VideoInfoBar
                    video={activeVideo}
                    isDarkMode={isDarkMode}
                    onToggleLike={handleToggleLike}
                    onOpenShareModal={handleOpenShareActive}
                    onDownloadVideo={handleDownloadVideo}
                    onOpenDeviceSync={openDeviceSync}
                    comments={comments}
                    onAddComment={handleAddComment}
                    onToggleLikeComment={handleToggleLikeComment}
                  />
                )}
              </div>

              {isSectionVisible('frontPageFeed') && (
                <section className="pt-6 border-t border-white/[0.08]" aria-label="Front Page Catalog">
                  <FrontPageGrid
                    videos={filteredVideos}
                    activeVideoId={activeVideo.id}
                    onSelectVideo={handleSelectVideo}
                    onDownloadVideo={handleDownloadVideo}
                    onOpenShareModal={handleOpenShare}
                    onOpenDeviceSync={openDeviceSync}
                    isDarkMode={isDarkMode}
                    isSearching={isSearching}
                    title="Front Page Stream Catalog"
                  />
                </section>
              )}
            </div>
          )}

          {/* Compact View Layout */}
          {activeLayoutMode === 'compact' && (
            <div className="space-y-6">
              <div className="max-w-2xl mx-auto space-y-3">
                {isSectionVisible('playerStage') && (
                  <VideoPlayer
                    video={activeVideo}
                    isDarkMode={isDarkMode}
                    adBlockStats={adBlockStats}
                    onAdBlocked={handleAdBlocked}
                    onSponsorSkipped={handleSponsorSkipped}
                    onTimeUpdateSync={handleTimeUpdateSync}
                    initialSeekTime={initialSeekTime}
                    onOpenShareModal={handleOpenShareActive}
                    onToggleLike={handleToggleLike}
                    onDownloadVideo={handleDownloadVideo}
                    isOfflineMode={isOfflineMode}
                    onOpenPageBuilder={openPageBuilder}
                  />
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold truncate">{activeVideo.title}</span>
                  <span className="text-neutral-400 font-mono text-[11px] shrink-0 ml-2">{activeVideo.channel}</span>
                </div>
              </div>

              {isSectionVisible('frontPageFeed') && (
                <section className="pt-4 border-t border-white/[0.08]">
                  <FrontPageGrid
                    videos={filteredVideos}
                    activeVideoId={activeVideo.id}
                    onSelectVideo={handleSelectVideo}
                    onDownloadVideo={handleDownloadVideo}
                    onOpenShareModal={handleOpenShare}
                    onOpenDeviceSync={openDeviceSync}
                    isDarkMode={isDarkMode}
                    isSearching={isSearching}
                    title="Front Page Feed"
                  />
                </section>
              )}
            </div>
          )}
        </main>

        {/* Cocoa Status Bar Footer */}
        {isSectionVisible('statusFooter') && (
          <CocoaStatusFooter
            isDarkMode={isDarkMode}
            isOfflineMode={isOfflineMode}
            adsBlocked={adBlockStats.adsBlockedCount}
            activeDevice={activeDevice}
            onOpenDeviceSync={openDeviceSync}
            onOpenOfflineManager={openOfflineManager}
          />
        )}
      </div>

      {/* Floating Modals */}
      <Suspense fallback={null}>
      {showPageBuilderModal && <PageBuilderModal
        isOpen
        onClose={() => setShowPageBuilderModal(false)}
        sections={sections}
        onToggleSection={handleToggleSection}
        onMoveSection={handleMoveSection}
        onResetSections={handleResetSections}
        onAddCustomVideo={handleAddCustomVideo}
        isDarkMode={isDarkMode}
      />}

      {showDeviceSyncModal && <DeviceSyncModal
        isOpen
        onClose={() => setShowDeviceSyncModal(false)}
        devices={devices}
        currentVideo={activeVideo}
        currentTime={currentTime}
        onHandoffToDevice={handleHandoffToDevice}
        onResumeFromDevice={handleResumeFromDevice}
        isDarkMode={isDarkMode}
      />}

      {showOfflineModal && <OfflineManagerModal
        isOpen
        onClose={() => setShowOfflineModal(false)}
        videos={videos}
        isOfflineMode={isOfflineMode}
        onToggleOfflineMode={handleToggleOfflineMode}
        onSelectVideo={handleSelectVideo}
        onRemoveDownload={handleRemoveDownload}
        onClearAllDownloads={handleClearAllDownloads}
        isDarkMode={isDarkMode}
      />}

      {showShareModal && <SocialShareModal
        isOpen
        onClose={() => setShowShareModal(false)}
        video={shareVideoTarget}
        currentTime={currentTime}
        isDarkMode={isDarkMode}
      />}

      {showNotificationsModal && <NotificationSettingsModal
        isOpen
        onClose={() => setShowNotificationsModal(false)}
        notifications={notifications}
        settings={notificationSettings}
        onUpdateSettings={setNotificationSettings}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onSelectVideoById={handleSelectVideoById}
        isDarkMode={isDarkMode}
      />}

      {showAdBlockModal && <AdBlockModal
        isOpen
        onClose={() => setShowAdBlockModal(false)}
        stats={adBlockStats}
        onToggleAdShield={() => setAdBlockStats(p => ({ ...p, isEnabled: !p.isEnabled }))}
        onToggleSkipSponsors={() => setAdBlockStats(p => ({ ...p, skipSponsors: !p.skipSponsors }))}
        isDarkMode={isDarkMode}
      />}

      {showDownloadFilesModal && <DownloadFilesModal
        isOpen
        onClose={() => setShowDownloadFilesModal(false)}
        isDarkMode={isDarkMode}
      />}
      </Suspense>
    </div>
  );
}
