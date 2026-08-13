import React, { useEffect, useRef, useState } from "react";
import { formatDuration } from "../lib/utils";
import toast from "react-hot-toast";

const SPEED_OPTIONS = [1, 1.5, 2];

const VoiceMessagePlayer = ({
  src,
  pending = false,
  durationSec = 0,
  canRemove = false,
  onRemove,
  onPlayed,
}) => {
  const playedAckRef = useRef(false);
  const audioRef = useRef(null);
  const knownDuration = Number(durationSec) > 0 ? Number(durationSec) : 0;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(knownDuration);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(knownDuration);
    playedAckRef.current = false;
  }, [src, knownDuration]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const ackPlayed = () => {
    if (playedAckRef.current || pending || !src) return;
    playedAckRef.current = true;
    onPlayed?.();
  };

  if (!src && !pending) return null;

  const resolveDuration = () => {
    const mediaDuration = audioRef.current?.duration;
    if (mediaDuration && Number.isFinite(mediaDuration) && mediaDuration > 0) {
      setDuration(mediaDuration);
      return;
    }
    if (knownDuration > 0) {
      setDuration(knownDuration);
    }
  };

  const cycleSpeed = (e) => {
    e.stopPropagation();
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  };

  const togglePlay = async () => {
    if (pending || !audioRef.current || !src) return;
    try {
      if (playing) {
        audioRef.current.pause();
        setPlaying(false);
        return;
      }
      // Restart if finished
      if (
        audioRef.current.ended ||
        (duration > 0 && audioRef.current.currentTime >= duration - 0.05)
      ) {
        audioRef.current.currentTime = 0;
        setCurrent(0);
      }
      audioRef.current.playbackRate = speed;
      await audioRef.current.play();
      setPlaying(true);
      resolveDuration();
      ackPlayed();
    } catch (error) {
      setPlaying(false);
      toast.error("Could not play voice message");
      console.error("Voice play error:", error);
    }
  };

  const displayDuration = duration > 0 ? duration : knownDuration;
  const progress =
    displayDuration > 0
      ? Math.min(100, (current / displayDuration) * 100)
      : 0;

  const speedLabel = speed === 1 ? "1x" : `${speed}x`;

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
        // Cloudinary stores voice as "video" resource; <video> plays webm more reliably
        <video
          ref={audioRef}
          src={src}
          preload="auto"
          playsInline
          className="hidden"
          onLoadedMetadata={resolveDuration}
          onDurationChange={resolveDuration}
          onCanPlay={resolveDuration}
          onTimeUpdate={() => {
            const t = audioRef.current?.currentTime || 0;
            setCurrent(t);
            if (
              (!Number.isFinite(audioRef.current?.duration) ||
                audioRef.current.duration === Infinity) &&
              knownDuration > 0
            ) {
              setDuration(knownDuration);
            } else if (
              audioRef.current?.duration &&
              Number.isFinite(audioRef.current.duration)
            ) {
              setDuration(audioRef.current.duration);
            } else if (t > displayDuration) {
              setDuration(t);
            }
          }}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
            if (knownDuration > 0) setDuration(knownDuration);
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => {
            setPlaying(true);
            if (audioRef.current) audioRef.current.playbackRate = speed;
            ackPlayed();
          }}
          onError={() => {
            setPlaying(false);
          }}
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
          <div className="flex items-center justify-between gap-2 text-[10px] text-white/70">
            <span>{pending ? "Uploading..." : "Voice message"}</span>
            <span className="flex-shrink-0 tabular-nums">
              {pending
                ? ""
                : `${formatDuration(current)} / ${formatDuration(displayDuration)}`}
            </span>
          </div>
        </div>

        {!pending && src && (
          <button
            type="button"
            onClick={cycleSpeed}
            title="Playback speed"
            className="flex h-7 min-w-[2.25rem] flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/30 px-1.5 text-[10px] font-semibold text-white hover:bg-white/15"
          >
            {speedLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
