import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface StreamPlayerProps {
  source?: {
    src: string;
    type?: "hls" | "dash" | "mp4";
  };
  className?: string;
}

const PLAYER_LOAD_TIMEOUT = 15000;

export const StreamPlayer = ({ source, className }: StreamPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);
  const isMountedRef = useRef(true);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState([75]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
    let cleanUrl = url;
    let drmInfo = null;
    
    if (url.includes('?|') || url.includes('|')) {
      const separator = url.includes('?|') ? '?|' : '|';
      const [baseUrl, drmParams] = url.split(separator);
      cleanUrl = baseUrl;
      
      if (drmParams) {
        const params = new URLSearchParams(drmParams);
        const drmScheme = params.get('drmScheme');
        const drmLicense = params.get('drmLicense');
        
        if (drmScheme && drmLicense) {
          drmInfo = { scheme: drmScheme, license: drmLicense };
        }
      }
    }
  
    const urlLower = cleanUrl.toLowerCase();
    
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/') || drmInfo) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/')) {
      return { type: 'hls', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.mp4') || urlLower.includes('.webm')) {
      return { type: 'native', cleanUrl, drmInfo };
    }
    
    return { type: 'hls', cleanUrl, drmInfo };
  }, []);

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (shakaPlayerRef.current) {
      shakaPlayerRef.current.destroy();
      shakaPlayerRef.current = null;
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    playerTypeRef.current = null;
  }, []);

  const initHlsPlayer = useCallback(async (url: string, video: HTMLVideoElement) => {
    try {
      const Hls = (await import('hls.js')).default;
      
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          debug: false,
          capLevelToPlayerSize: true,
          maxLoadingDelay: 1,
          maxBufferLength: 15,
          maxBufferSize: 20 * 1000 * 1000,
          fragLoadingTimeOut: 8000,
          manifestLoadingTimeOut: 4000,
          startLevel: -1,
        });
        
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMountedRef.current) return;
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          
          video.muted = isMuted;
          video.play().catch(console.warn);
          setIsLoading(false);
          setError(null);
          setIsPlaying(true);
          console.log('HLS stream loaded successfully');
        });
        
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!isMountedRef.current) return;
          console.error('HLS error:', data);
          
          if (data.fatal) {
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error, attempting recovery...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error, attempting recovery...');
                hls.recoverMediaError();
                break;
              default:
                setError(`HLS Error: ${data.details}`);
                setIsLoading(false);
                destroyPlayer();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('Using native HLS support');
        playerTypeRef.current = 'native';
        video.src = url;
        
        const onLoadedMetadata = () => {
          if (!isMountedRef.current) return;
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          video.muted = isMuted;
          video.play().catch(console.warn);
          setIsLoading(false);
          setError(null);
          setIsPlaying(true);
        };
        
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      } else {
        throw new Error('HLS is not supported in this browser');
      }
    } catch (error) {
      throw error;
    }
  }, [isMuted, destroyPlayer]);

  const initShakaPlayer = useCallback(async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    try {
      const shaka = await import('shaka-player/dist/shaka-player.ui.js');
      
      shaka.default.polyfill.installAll();
      
      if (!shaka.default.Player.isBrowserSupported()) {
        throw new Error('This browser is not supported by Shaka Player');
      }
      
      if (shakaPlayerRef.current) {
        await shakaPlayerRef.current.destroy();
      }
      
      const player = new shaka.default.Player(video);
      shakaPlayerRef.current = player;
      
      player.configure({
        streaming: {
          bufferingGoal: 15,
          rebufferingGoal: 8,
          bufferBehind: 15,
          retryParameters: {
            timeout: 4000,
            maxAttempts: 2,
            baseDelay: 300,
            backoffFactor: 1.3,
            fuzzFactor: 0.2
          },
          useNativeHlsOnSafari: true
        },
        manifest: {
          retryParameters: {
            timeout: 4000,
            maxAttempts: 2,
            baseDelay: 300,
            backoffFactor: 1.3,
            fuzzFactor: 0.2
          }
        },
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 1500000
        }
      });
      
      if (drmInfo && drmInfo.scheme === 'clearkey' && drmInfo.license && drmInfo.license.includes(':')) {
        const [keyId, key] = drmInfo.license.split(':');
        player.configure({
          drm: {
            clearKeys: {
              [keyId]: key
            }
          }
        });
        console.log('DRM configured with ClearKey');
      }
      
      const onError = (event: any) => {
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        
        const errorCode = event.detail.code;
        let errorMessage = `Stream error (${errorCode})`;
        
        if (errorCode >= 6000 && errorCode < 7000) {
          errorMessage = 'Network error - please check your connection';
        } else if (errorCode >= 4000 && errorCode < 5000) {
          errorMessage = 'Media format not supported';
        } else if (errorCode >= 1000 && errorCode < 2000) {
          errorMessage = 'DRM error - content may be protected';
        }
        
        console.error('Shaka error:', event.detail);
        setError(errorMessage);
        setIsLoading(false);
        destroyPlayer();
      };
      
      player.addEventListener('error', onError);
      
      console.log('Loading Shaka stream:', url);
      await player.load(url);
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      video.muted = isMuted;
      video.play().catch(console.warn);
      setIsLoading(false);
      setError(null);
      setIsPlaying(true);
      console.log('Shaka stream loaded successfully');
      
      return () => player.removeEventListener('error', onError);
    } catch (error) {
      throw error;
    }
  }, [isMuted, destroyPlayer]);

  const initializePlayer = useCallback(async () => {
    if (!source || !videoRef.current) {
      setError('No stream URL provided');
      setIsLoading(false);
      return;
    }

    const video = videoRef.current;
    destroyPlayer();
    
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsLoading(false);
        setError("Stream took too long to load. Please try again.");
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      const { type, cleanUrl, drmInfo } = detectStreamType(source.src);
      console.log('Detected stream type:', type, 'URL:', cleanUrl);
      
      if (type === 'dash') {
        playerTypeRef.current = 'shaka';
        await initShakaPlayer(cleanUrl, video, drmInfo);
      } else if (type === 'hls') {
        playerTypeRef.current = 'hls';
        await initHlsPlayer(cleanUrl, video);
      } else {
        playerTypeRef.current = 'native';
        video.src = cleanUrl;
        
        const onLoadedMetadata = () => {
          if (!isMountedRef.current) return;
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          video.muted = isMuted;
          video.play().catch(console.warn);
          setIsLoading(false);
          setError(null);
          setIsPlaying(true);
        };
        
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      }
    } catch (error) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      console.error('Player initialization error:', error);
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'Failed to initialize player');
    }
  }, [source, isMuted, destroyPlayer, detectStreamType, initHlsPlayer, initShakaPlayer]);

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    
    return () => {
      isMountedRef.current = false;
      destroyPlayer();
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [source, initializePlayer, destroyPlayer]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value[0] / 100;
    setVolume(value);
    if (value[0] === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const handleSeek = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRetry = () => {
    initializePlayer();
  };

  if (error && !isLoading) {
    return (
      <div className={cn("w-full h-full bg-black flex items-center justify-center", className)}>
        <div className="text-center text-white p-6">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <div className="text-lg font-medium mb-2">Stream Error</div>
          <div className="text-sm text-gray-300 mb-4">{error}</div>
          <button
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full aspect-video bg-black rounded-lg overflow-hidden group",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        onClick={togglePlay}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      )}

      {!isPlaying && !isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Button
            size="lg"
            variant="ghost"
            className="w-20 h-20 rounded-full bg-primary/20 backdrop-blur-sm border-2 border-primary hover:bg-primary/30 hover:scale-110 transition-all"
            onClick={togglePlay}
          >
            <Play className="w-10 h-10 fill-current" />
          </Button>
        </div>
      )}

      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-6 transition-all duration-300",
          showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="mb-4">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="cursor-pointer"
          />
          <div className="flex justify-between text-xs text-foreground/70 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={togglePlay}
              className="hover:bg-primary/20"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleMute}
                className="hover:bg-primary/20"
              >
                {isMuted || volume[0] === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </Button>
              <div className="w-24">
                <Slider
                  value={volume}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="hover:bg-primary/20"
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleFullscreen}
              className="hover:bg-primary/20"
            >
              <Maximize className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamPlayer;
