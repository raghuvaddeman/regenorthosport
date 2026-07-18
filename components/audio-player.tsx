"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { Download, Loader2, Play, Pause, X, Volume2 } from "lucide-react";
import { buildRecordingFilename, downloadRecording } from "@/lib/download-recording";

type Call = {
  uuid: string;
  phone: string;
  recordingUrl: string;
  at: string;
};

type AudioContextType = {
  currentCall: Call | null;
  isPlaying: boolean;
  play: (call: Call) => void;
  pause: () => void;
  stop: () => void;
};

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentCall, setCurrentCall] = useState<Call | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => setIsPlaying(false);
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const play = (call: Call) => {
    if (!audioRef.current) return;
    if (currentCall?.uuid === call.uuid) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(console.error);
        setIsPlaying(true);
      }
    } else {
      audioRef.current.src = call.recordingUrl;
      audioRef.current.play().catch(console.error);
      setCurrentCall(call);
      setIsPlaying(true);
    }
  };

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const stop = () => {
    audioRef.current?.pause();
    setCurrentCall(null);
    setIsPlaying(false);
  };

  const handleDownload = async (call: Call) => {
    setDownloading(true);
    try {
      await downloadRecording(call.recordingUrl, buildRecordingFilename(call));
    } catch (err) {
      console.error("Failed to download recording:", err);
      alert("Couldn't download the recording. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AudioContext.Provider value={{ currentCall, isPlaying, play, pause, stop }}>
      {children}
      {currentCall && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-full border border-zinc-200 bg-white px-5 py-3 shadow-xl dark:border-zinc-600 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50">
          <Volume2 className="h-4 w-4 text-indigo-500 animate-pulse" />
          <div className="text-xs">
            <p className="font-medium">Playing Call Session</p>
            <p className="text-zinc-400 font-mono truncate max-w-[120px]">{currentCall.phone || "Unknown"}</p>
          </div>
          <button
            onClick={() => play(currentCall)}
            className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors"
          >
            {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
          </button>
          <button
            onClick={() => handleDownload(currentCall)}
            disabled={downloading}
            aria-label="Download recording"
            title="Download recording"
            className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500 transition-colors"
          >
            {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          </button>
          <button onClick={stop} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used within an AudioPlayerProvider");
  return context;
}
