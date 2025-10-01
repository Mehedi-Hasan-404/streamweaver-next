import { useState } from "react";
import { StreamPlayer } from "@/components/StreamPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Play, Radio, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface StreamSource {
  name: string;
  src: string;
  type: "hls" | "dash" | "mp4";
  description: string;
}

const DEMO_STREAMS: StreamSource[] = [
  {
    name: "Big Buck Bunny (MP4)",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    type: "mp4",
    description: "Sample MP4 video stream"
  },
  {
    name: "Sintel (HLS)",
    src: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    type: "hls",
    description: "Adaptive HLS streaming"
  },
  {
    name: "Test Stream (HLS)",
    src: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    type: "hls",
    description: "Multi-quality HLS test stream"
  }
];

const Index = () => {
  const [currentStream, setCurrentStream] = useState<StreamSource>(DEMO_STREAMS[0]);
  const [customUrl, setCustomUrl] = useState("");

  const handleLoadCustomStream = () => {
    if (!customUrl.trim()) {
      toast.error("Please enter a stream URL");
      return;
    }

    let type: "hls" | "dash" | "mp4" = "mp4";
    if (customUrl.includes(".m3u8")) {
      type = "hls";
    } else if (customUrl.includes(".mpd")) {
      type = "dash";
    }

    setCurrentStream({
      name: "Custom Stream",
      src: customUrl,
      type: type,
      description: "Custom stream URL"
    });

    toast.success("Stream loaded successfully!");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary via-purple-400 to-blue-400 bg-clip-text text-transparent">
                  StreamPlay
                </h1>
                <p className="text-xs text-muted-foreground">Modern Live Streaming</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm text-muted-foreground hidden sm:inline">
                HLS • DASH • MP4
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Current Stream */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Play className="w-6 h-6 text-primary fill-current" />
              Now Playing
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-lg text-foreground">{currentStream.name}</span>
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                {currentStream.type.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{currentStream.description}</p>
          </div>

          <StreamPlayer source={currentStream} />
        </div>

        {/* Custom Stream Input */}
        <Card className="p-6 mb-8 bg-card/50 backdrop-blur-sm border-border/50">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            Load Custom Stream
          </h3>
          <div className="flex gap-3">
            <Input
              placeholder="Enter HLS (.m3u8), DASH (.mpd), or MP4 stream URL"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadCustomStream()}
              className="flex-1 bg-background/50"
            />
            <Button onClick={handleLoadCustomStream} className="bg-primary hover:bg-primary/90">
              <Play className="w-4 h-4 mr-2 fill-current" />
              Load Stream
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Supports HLS (HTTP Live Streaming), DASH (Dynamic Adaptive Streaming), and direct MP4 URLs
          </p>
        </Card>

        {/* Demo Streams */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Demo Streams</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DEMO_STREAMS.map((stream, index) => (
              <Card
                key={index}
                className={`p-4 cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 bg-card/50 backdrop-blur-sm ${
                  currentStream.src === stream.src ? "border-primary shadow-lg shadow-primary/20" : ""
                }`}
                onClick={() => {
                  setCurrentStream(stream);
                  toast.success(`Now playing: ${stream.name}`);
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-foreground">{stream.name}</h4>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                    {stream.type.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{stream.description}</p>
                <Button
                  size="sm"
                  variant={currentStream.src === stream.src ? "default" : "outline"}
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentStream(stream);
                    toast.success(`Now playing: ${stream.name}`);
                  }}
                >
                  <Play className="w-3 h-3 mr-2 fill-current" />
                  {currentStream.src === stream.src ? "Now Playing" : "Play Stream"}
                </Button>
              </Card>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/30 backdrop-blur-sm border-border/50">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
              <Radio className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Adaptive Streaming</h3>
            <p className="text-sm text-muted-foreground">
              Automatic quality switching based on network conditions for optimal playback
            </p>
          </Card>

          <Card className="p-6 bg-card/30 backdrop-blur-sm border-border/50">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-4">
              <Play className="w-6 h-6 text-blue-400 fill-current" />
            </div>
            <h3 className="font-semibold mb-2">Multiple Formats</h3>
            <p className="text-sm text-muted-foreground">
              Support for HLS, DASH, and MP4 formats with seamless playback
            </p>
          </Card>

          <Card className="p-6 bg-card/30 backdrop-blur-sm border-border/50">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="font-semibold mb-2">Modern UI</h3>
            <p className="text-sm text-muted-foreground">
              Beautiful, responsive player with custom controls and fullscreen support
            </p>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-border/50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Built with React, NSPlayer, HLS.js, and Dash.js</p>
          <p className="mt-2">Supporting modern streaming protocols for the web</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
