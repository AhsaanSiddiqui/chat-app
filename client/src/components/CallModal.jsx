import React, { useContext, useEffect, useRef } from "react";
import { CallContext } from "../../context/CallContext";
import assets from "../assets/assets";
import { formatDuration } from "../lib/utils";

const CallModal = () => {
  const {
    callState,
    callType,
    remoteUser,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    callElapsedSec,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  } = useContext(CallContext);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState === "idle" || !remoteUser) return null;

  const isVideo = callType === "video";
  const title =
    callState === "ringing"
      ? "Incoming call"
      : callState === "calling"
        ? "Calling..."
        : isVideo
          ? "Video call"
          : "Voice call";

  const statusLine =
    callState === "connected"
      ? formatDuration(callElapsedSec)
      : callState === "ringing"
        ? "Ringing..."
        : callState === "calling"
          ? "Calling..."
          : callState;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#15151d] text-white shadow-2xl">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm text-violet-300">{title}</p>
          <h2 className="text-xl font-semibold truncate">
            {remoteUser.fullName || "User"}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {isVideo ? "Video" : "Audio"} · {statusLine}
          </p>
        </div>

        <div className="relative min-h-[280px] bg-black/40 flex items-center justify-center">
          {isVideo && callState === "connected" ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full max-h-[360px] w-full object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-3 right-3 h-28 w-20 rounded-xl object-cover border border-white/20 bg-black/50"
              />
              {isCameraOff && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-gray-300">
                  Camera off
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10">
              <img
                src={remoteUser.profilePic || assets.avatar_icon}
                alt=""
                className="h-24 w-24 rounded-full object-cover border border-white/10"
              />
              <p className="text-sm text-gray-300">
                {callState === "ringing"
                  ? "is calling you..."
                  : callState === "calling"
                    ? "Ringing..."
                    : "On call"}
              </p>
              {callState === "connected" && (
                <p className="text-lg tabular-nums text-violet-200">
                  {formatDuration(callElapsedSec)}
                </p>
              )}
            </div>
          )}

          {/* Always attach remote audio for voice + video */}
          <audio ref={remoteAudioRef} autoPlay playsInline />
        </div>

        <div className="flex items-center justify-center gap-3 px-5 py-5">
          {callState === "ringing" ? (
            <>
              <button
                type="button"
                onClick={rejectCall}
                className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium hover:bg-red-500"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={acceptCall}
                className="rounded-full bg-green-600 px-5 py-3 text-sm font-medium hover:bg-green-500"
              >
                Accept
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMute}
                className={`rounded-full px-4 py-3 text-sm ${
                  isMuted ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
                }`}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
              {isVideo && (
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`rounded-full px-4 py-3 text-sm ${
                    isCameraOff ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
                  }`}
                >
                  {isCameraOff ? "Cam on" : "Cam off"}
                </button>
              )}
              <button
                type="button"
                onClick={endCall}
                className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium hover:bg-red-500"
              >
                End
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallModal;
