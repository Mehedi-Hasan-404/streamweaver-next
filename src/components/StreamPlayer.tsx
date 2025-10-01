import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Loader2 } from "lucide-react";
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

export const StreamPlayer = ({ source, className }: StreamPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState([75]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    setIsLoading(true);
    setError(null);

    const loadStream = async () => {
      try {
        // Block mixed content
        if (window.location.protocol === "https:" && source.src.startsWith("http://")) {
          setError("HTTP streams are blocked on HTTPS pages");
          setIsLoading(false);
          return;
        }

        // Set CORS
        video.crossOrigin = "anonymous";

        // Detect stream type
        const isHLS = source.type === "hls" || source.src.includes(".m3u8");
        const isDASH = source.type === "dash" || source.src.includes(".mpd");

        if (isHLS || isDASH) {
          // Dynamically import Shaka Player
          const shaka = await import("shaka-player/dist/shaka-player.ui");
          
          // Install polyfills
          shaka.polyfill.installAll();

          if (!shaka.Player.isBrowserSupported()) {
            setError("Your browser doesn't support this stream format");
            setIsLoading(false);
            return;
          }

          // Clean up existing player
          if (playerRef.current) {
            await playerRef.current.destroy();
            playerRef.current = null;
          }

          // Create new player
          const player = new shaka.Player();
          playerRef.current = player;
          
          await player.attach(video);

          // Configure player for better compatibility
          player.configure({
            streaming: {
              retryParameters: {
                timeout: 30000,
                maxAttempts: 4,
                baseDelay: 1000,
                backoffFactor: 2,
                fuzzFactor: 0.5,
              },
              bufferingGoal: 30,
              rebufferingGoal: 2,
              ignoreTextStreamFailures: true,
            },
            manifest: {
              retryParameters: {
                timeout: 30000,
                maxAttempts: 4,
                baseDelay: 1000,
                backoffFactor: 2,
                fuzzFactor: 0.5,
              },
            },
          });

          // Parse DRM if present
          let streamUrl = source.src;
          const drmMatch = source.src.match(/[|%7C]drmScheme=clearkey&drmLicense=([a-f0-9]+):([a-f0-9]+)/i);

          if (drmMatch) {
            const kidHex = drmMatch[1];
            const keyHex = drmMatch[2];
            
            // Convert hex to base64
            const hexToBase64 = (hex: string) => {
              const bytes = hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [];
              const bin = String.fromCharCode(...bytes);
              return btoa(bin);
            };

            const kidB64 = hexToBase64(kidHex);
            const keyB64 = hexToBase64(keyHex);

            // Remove DRM parameters from URL
            streamUrl = source.src.split(/[?|%7C]drmScheme/i)[0];

            // Configure ClearKey DRM
            player.configure({
              drm: {
                clearKeys: {
                  [kidB64]: keyB64,
                },
              },
            });

            console.log("DRM configured with ClearKey");
          }

          // Error handling
          player.addEventListener("error", (event: any) => {
            console.error("Shaka error:", event.detail);
            const detail = event.detail;
            
            let errorMessage = "Failed to load stream";
            if (detail) {
              if (detail.code === 1001) errorMessage = "Network request failed";
              else if (detail.code === 6007) errorMessage = "DRM license request failed";
              else if (detail.category === 3) errorMessage = "Network error";
              else if (detail.category === 6) errorMessage = "DRM error";
              else if (detail.message) errorMessage = detail.message;
            }
            
            setError(errorMessage);
            setIsLoading(false);
          });

          // Load the stream
          try {
            console.log("Loading stream:", streamUrl);
            await player.load(streamUrl);
            console.log("Stream loaded successfully");
            setIsLoading(false);
          } catch (err: any) {
            console.error("Load error:", err);
            setError(err.message || "Failed to load stream");
            setIsLoading(false);
          }
        } else {
          // Regular MP4
          video.src = source.src;
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error("Stream error:", err);
        setError(err.message || "Failed to initialize player");
        setIsLoading(false);
      }
    };

    loadStream();

    // Cleanup
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy().catch((e: any) => console.error("Cleanup error:", e));
        playerRef.current = null;
      }
    };
  }, [source]);

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

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center px-4">
            <p className="text-destructive text-lg mb-2">{error}</p>
            <p className="text-muted-foreground text-sm">Check console for details</p>
          </div>
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
