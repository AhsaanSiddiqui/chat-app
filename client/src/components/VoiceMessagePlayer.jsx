import React, { useEffect, useRef, useState } from "react";
import { formatDuration } from "../lib/utils";

const VoiceMessagePlayer = ({
  src,
  pending = false,
  canRemove = false,
  onRemove,
}) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [src]);

  if (!src && !pending) return null;

  const togglePlay = async () => {
    if (pending || !audioRef.current) return;
    try {
      if (playing) {
        audioRef.current.pause();
        setPlaying(false);
      } else {
        await audioRef.current.play();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="relative min-w-[200px] max-w-[280px] px-3 py-2.5">
      {canRemove && (
        <button
          type="button"
          title="Remove this voice message"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 px-1.5 text-[10px] text-white hover:bg-red-500/80"
        >
          ✕
        </button>
      )}

      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={() => {
            const d = audioRef.current?.duration;
            if (d && Number.isFinite(d)) setDuration(d);
          }}
          onTimeUpdate={() => {
            setCurrent(audioRef.current?.currentTime || 0);
          }}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
        />
      )}

      <div className="flex items-center gap-2.5 pr-4">
        <button
          type="button"
          disabled={pending || !src}
          onClick={togglePlay}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/80 text-white hover:bg-violet-400 disabled:opacity-50"
          title={playing ? "Pause" : "Play"}
        >
          {pending ? "…" : playing ? "❚❚" : "▶"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-violet-300 transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/70">
            <span>{pending ? "Uploading..." : "Voice message"}</span>
            <span>
              {pending
                ? ""
                : `${formatDuration(current)} / ${formatDuration(duration || 0)}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
