import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { AuthContext } from "./AuthContext";

export const CallContext = createContext();

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const makeCallId = () =>
  `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const CallProvider = ({ children }) => {
  const { socket, authUser, onlineUsers, axios } = useContext(AuthContext);

  const [callState, setCallState] = useState("idle"); // idle | ringing | calling | connected
  const [callType, setCallType] = useState("audio"); // audio | video
  const [remoteUser, setRemoteUser] = useState(null); // { _id, fullName, profilePic }
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callElapsedSec, setCallElapsedSec] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteUserIdRef = useRef(null);
  const makingOfferRef = useRef(false);
  const callTypeRef = useRef("audio");
  const callActiveRef = useRef(false);
  const callIdRef = useRef(null);
  const isCallerRef = useRef(false);
  const callerIdRef = useRef(null);
  const calleeIdRef = useRef(null);
  const connectedAtRef = useRef(null);
  const wasConnectedRef = useRef(false);
  const loggedCallIdRef = useRef(null);
  const endingRef = useRef(false);

  useEffect(() => {
    callActiveRef.current = callState !== "idle";
  }, [callState]);

  useEffect(() => {
    if (callState !== "connected" || !connectedAtRef.current) {
      setCallElapsedSec(0);
      return;
    }
    const tick = () => {
      setCallElapsedSec(
        Math.max(
          0,
          Math.floor((Date.now() - connectedAtRef.current) / 1000)
        )
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [callState]);

  const cleanupMedia = useCallback(() => {
    try {
      pcRef.current?.getSenders?.().forEach((sender) => {
        try {
          sender.track?.stop?.();
        } catch {
          // ignore
        }
      });
      pcRef.current?.close?.();
    } catch {
      // ignore
    }
    pcRef.current = null;

    localStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    makingOfferRef.current = false;
  }, []);

  const resetCallMeta = useCallback(() => {
    setCallState("idle");
    setRemoteUser(null);
    setCallElapsedSec(0);
    remoteUserIdRef.current = null;
    callIdRef.current = null;
    isCallerRef.current = false;
    callerIdRef.current = null;
    calleeIdRef.current = null;
    connectedAtRef.current = null;
    wasConnectedRef.current = false;
    endingRef.current = false;
  }, []);

  const cleanupCall = useCallback(() => {
    cleanupMedia();
    resetCallMeta();
  }, [cleanupMedia, resetCallMeta]);

  const markConnected = useCallback(() => {
    if (!connectedAtRef.current) {
      connectedAtRef.current = Date.now();
    }
    wasConnectedRef.current = true;
    setCallState("connected");
  }, []);

  const logCallActivity = useCallback(
    async (status, durationOverride) => {
      const callId = callIdRef.current;
      const callerId = callerIdRef.current;
      const calleeId = calleeIdRef.current;
      if (!callId || !callerId || !calleeId || !axios || !authUser) return;
      if (loggedCallIdRef.current === callId) return;
      loggedCallIdRef.current = callId;

      let duration = 0;
      if (status === "answered") {
        if (typeof durationOverride === "number") {
          duration = durationOverride;
        } else if (connectedAtRef.current) {
          duration = Math.max(
            0,
            Math.floor((Date.now() - connectedAtRef.current) / 1000)
          );
        }
      }

      try {
        await axios.post("/api/messages/call-log", {
          callerId,
          calleeId,
          callId,
          callType: callTypeRef.current || "audio",
          status,
          duration,
        });
      } catch (error) {
        console.error("call log failed", error);
        // Allow a retry if the request never reached the server
        if (loggedCallIdRef.current === callId) {
          loggedCallIdRef.current = null;
        }
      }
    },
    [axios, authUser]
  );

  const finishCall = useCallback(
    async ({ status, notifyPeer = false, event = "call:end", reason } = {}) => {
      if (endingRef.current) return;
      endingRef.current = true;

      const peerId = remoteUserIdRef.current;
      const connected = wasConnectedRef.current;
      const finalStatus =
        status ||
        (connected
          ? "answered"
          : isCallerRef.current
            ? "cancelled"
            : "missed");

      if (notifyPeer && peerId && socket) {
        socket.emit(event, {
          to: peerId,
          callId: callIdRef.current,
          reason,
          status: finalStatus,
        });
      }

      await logCallActivity(finalStatus);
      cleanupCall();
    },
    [socket, cleanupCall, logCallActivity]
  );

  const createPeerConnection = useCallback(
    (peerId) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && peerId) {
          socket.emit("call:ice-candidate", {
            to: peerId,
            callId: callIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        remoteStreamRef.current = stream;
        setRemoteStream(stream);
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          markConnected();
        }
        if (state === "failed" || state === "disconnected" || state === "closed") {
          if (endingRef.current) return;
          finishCall({
            status: wasConnectedRef.current ? "answered" : "cancelled",
            notifyPeer: true,
            event: "call:end",
          });
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [socket, markConnected, finishCall]
  );

  const getMedia = async (type) => {
    const wantsVideo = type === "video";
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantsVideo
        ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setIsCameraOff(!wantsVideo);
    return stream;
  };

  const endCall = useCallback(() => {
    finishCall({
      status: wasConnectedRef.current
        ? "answered"
        : isCallerRef.current
          ? "cancelled"
          : "missed",
      notifyPeer: true,
      event: "call:end",
    });
  }, [finishCall]);

  const rejectCall = useCallback(() => {
    finishCall({
      status: "declined",
      notifyPeer: true,
      event: "call:reject",
      reason: "declined",
    });
  }, [finishCall]);

  const startCall = async (user, type = "audio") => {
    if (!user?._id || !socket || !authUser) return;
    if (callState !== "idle") {
      toast.error("Already in a call");
      return;
    }
    if (!onlineUsers.includes(String(user._id))) {
      toast.error("User is offline");
      return;
    }

    try {
      const callId = makeCallId();
      callIdRef.current = callId;
      loggedCallIdRef.current = null;
      endingRef.current = false;
      isCallerRef.current = true;
      callerIdRef.current = String(authUser._id);
      calleeIdRef.current = String(user._id);
      connectedAtRef.current = null;
      wasConnectedRef.current = false;

      callTypeRef.current = type;
      setCallType(type);
      setRemoteUser(user);
      remoteUserIdRef.current = String(user._id);
      setCallState("calling");

      const stream = await getMedia(type);
      const pc = createPeerConnection(String(user._id));
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      socket.emit("call:invite", {
        to: user._id,
        callId,
        callType: type,
        fromUser: {
          _id: authUser._id,
          fullName: authUser.fullName,
          profilePic: authUser.profilePic || "",
        },
      });

      makingOfferRef.current = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      makingOfferRef.current = false;

      socket.emit("call:offer", {
        to: user._id,
        callId,
        sdp: pc.localDescription,
        callType: type,
      });
    } catch (error) {
      console.error(error);
      cleanupCall();
      toast.error(
        error?.name === "NotAllowedError"
          ? "Microphone/camera permission denied"
          : "Could not start call"
      );
    }
  };

  const acceptCall = async () => {
    if (!socket || !remoteUserIdRef.current) return;
    try {
      const type = callTypeRef.current || callType;
      const stream = await getMedia(type);
      let pc = pcRef.current;
      if (!pc) {
        pc = createPeerConnection(remoteUserIdRef.current);
      }
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      socket.emit("call:accept", {
        to: remoteUserIdRef.current,
        callId: callIdRef.current,
        callType: type,
      });

      // If offer already arrived, answer now; otherwise wait for call:offer
      if (pc.remoteDescription && !pc.localDescription) {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("call:answer", {
          to: remoteUserIdRef.current,
          callId: callIdRef.current,
          sdp: pc.localDescription,
        });
      }

      markConnected();
    } catch (error) {
      console.error(error);
      rejectCall();
      toast.error(
        error?.name === "NotAllowedError"
          ? "Microphone/camera permission denied"
          : "Could not accept call"
      );
    }
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  };

  const toggleCamera = async () => {
    if (callType !== "video") return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOff(!videoTrack.enabled);
    }
  };

  useEffect(() => {
    if (!socket) return;

    const onInvite = (payload) => {
      if (callActiveRef.current) {
        socket.emit("call:reject", {
          to: payload.from,
          callId: payload.callId,
          reason: "busy",
          status: "busy",
        });
        return;
      }

      const callId = payload.callId || makeCallId();
      callIdRef.current = callId;
      loggedCallIdRef.current = null;
      endingRef.current = false;
      isCallerRef.current = false;
      callerIdRef.current = String(payload.from);
      calleeIdRef.current = String(authUser?._id || "");
      connectedAtRef.current = null;
      wasConnectedRef.current = false;

      callTypeRef.current = payload.callType || "audio";
      setCallType(payload.callType || "audio");
      setRemoteUser(
        payload.fromUser || {
          _id: payload.from,
          fullName: "Incoming call",
          profilePic: "",
        }
      );
      remoteUserIdRef.current = String(payload.from);
      setCallState("ringing");
    };

    const onOffer = async (payload) => {
      try {
        if (payload.callId) callIdRef.current = payload.callId;
        remoteUserIdRef.current = String(payload.from);
        callTypeRef.current = payload.callType || callTypeRef.current;
        setCallType(payload.callType || callTypeRef.current);

        let pc = pcRef.current;
        if (!pc) {
          pc = createPeerConnection(String(payload.from));
        }
        await pc.setRemoteDescription(payload.sdp);

        // If already accepted (local stream ready), answer immediately
        if (localStreamRef.current && !pc.localDescription) {
          localStreamRef.current.getTracks().forEach((track) => {
            if (!pc.getSenders().some((s) => s.track === track)) {
              pc.addTrack(track, localStreamRef.current);
            }
          });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("call:answer", {
            to: payload.from,
            callId: callIdRef.current,
            sdp: pc.localDescription,
          });
          markConnected();
        }
      } catch (error) {
        console.error(error);
      }
    };

    const onAccept = () => {
      markConnected();
    };

    const onAnswer = async (payload) => {
      try {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(payload.sdp);
        markConnected();
      } catch (error) {
        console.error(error);
      }
    };

    const onIce = async (payload) => {
      try {
        const pc = pcRef.current;
        if (!pc || !payload.candidate) return;
        await pc.addIceCandidate(payload.candidate);
      } catch (error) {
        console.error(error);
      }
    };

    const onReject = (payload) => {
      const reason = payload?.reason;
      const status =
        reason === "busy" || payload?.status === "busy"
          ? "busy"
          : "declined";
      if (status === "declined") {
        toast.error("Call declined");
      } else {
        toast.error("User is busy");
      }
      finishCall({ status, notifyPeer: false });
    };

    const onEnd = () => {
      finishCall({
        status: wasConnectedRef.current ? "answered" : "missed",
        notifyPeer: false,
      });
    };

    const onUnavailable = () => {
      toast.error("User is unavailable");
      finishCall({ status: "unavailable", notifyPeer: false });
    };

    socket.on("call:invite", onInvite);
    socket.on("call:offer", onOffer);
    socket.on("call:accept", onAccept);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice-candidate", onIce);
    socket.on("call:reject", onReject);
    socket.on("call:end", onEnd);
    socket.on("call:unavailable", onUnavailable);

    return () => {
      socket.off("call:invite", onInvite);
      socket.off("call:offer", onOffer);
      socket.off("call:accept", onAccept);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice-candidate", onIce);
      socket.off("call:reject", onReject);
      socket.off("call:end", onEnd);
      socket.off("call:unavailable", onUnavailable);
    };
  }, [socket, createPeerConnection, finishCall, markConnected, authUser?._id]);

  useEffect(() => {
    return () => cleanupCall();
  }, [cleanupCall]);

  const value = {
    callState,
    callType,
    remoteUser,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    callElapsedSec,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
