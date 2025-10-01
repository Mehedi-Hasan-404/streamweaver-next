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
        if (source.type === "hls" || source.src.includes(".m3u8")) {
          // Load HLS
          const Hls = (await import("hls.js")).default;
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              xhrSetup: (xhr: XMLHttpRequest, url: string) => {
                // Enable CORS for cross-origin requests
                xhr.withCredentials = false;
              },
            });
            hls.loadSource(source.src);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setIsLoading(false);
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
              console.error("HLS Error:", data);
              if (data.fatal) {
                setError(`Failed to load HLS stream: ${data.type}`);
                setIsLoading(false);
              }
            });
            return () => hls.destroy();
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            // Native HLS support (Safari)
            video.src = source.src;
            setIsLoading(false);
          }
        } else if (source.type === "dash" || source.src.includes(".mpd")) {
          // Load DASH
          const dashjs = await import("dashjs");
          const player = dashjs.MediaPlayer().create();
          
          // Parse DRM parameters from URL if present
          const urlObj = new URL(source.src, window.location.href);
          const fullUrl = urlObj.href;
          
          // Check for clearkey DRM parameters (format: |drmScheme=clearkey&drmLicense=KID:KEY)
          const drmMatch = fullUrl.match(/[|%7C]drmScheme=clearkey&drmLicense=([a-f0-9]+):([a-f0-9]+)/i);
          
          if (drmMatch) {
            const kid = drmMatch[1];
            const key = drmMatch[2];
            
            // Remove DRM parameters from URL
            const cleanUrl = fullUrl.split(/[|%7C]drmScheme/)[0];
            
            // Configure clearkey DRM
            const protData = {
              "org.w3.clearkey": {
                clearkeys: {
                  [kid]: key
                }
              }
            };
            
            console.log("Configuring DASH with clearkey DRM");
            player.initialize(video, cleanUrl, false);
            player.setProtectionData(protData);
          } else {
            player.initialize(video, source.src, false);
          }
          
          player.on("streamInitialized", () => {
            setIsLoading(false);
          });
          player.on("error", (e) => {
            console.error("DASH Error:", e);
            setError(`Failed to load DASH stream: ${e.error || 'Unknown error'}`);
            setIsLoading(false);
          });
          return () => player.destroy();
        } else {
          // Regular MP4 or direct stream
          video.src = source.src;
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Error loading stream:", err);
        setError("Failed to load stream");
        setIsLoading(false);
      }
    };

    loadStream();
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

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center">
            <p className="text-destructive text-lg mb-2">{error}</p>
            <p className="text-muted-foreground text-sm">Please check the stream URL</p>
          </div>
        </div>
      )}

      {/* Center Play Button */}
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

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-6 transition-all duration-300",
          showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Progress Bar */}
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

        {/* Control Buttons */}
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
