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

export const CallProvider = ({ children }) => {
  const { socket, authUser, onlineUsers } = useContext(AuthContext);

  const [callState, setCallState] = useState("idle"); // idle | ringing | calling | connected
  const [callType, setCallType] = useState("audio"); // audio | video
  const [remoteUser, setRemoteUser] = useState(null); // { _id, fullName, profilePic }
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteUserIdRef = useRef(null);
  const makingOfferRef = useRef(false);
  const callTypeRef = useRef("audio");
  const callActiveRef = useRef(false);

  useEffect(() => {
    callActiveRef.current = callState !== "idle";
  }, [callState]);

  const cleanupCall = useCallback(() => {
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
    setCallState("idle");
    setRemoteUser(null);
    setIsMuted(false);
    setIsCameraOff(false);
    remoteUserIdRef.current = null;
    makingOfferRef.current = false;
  }, []);

  const createPeerConnection = useCallback(
    (peerId) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && peerId) {
          socket.emit("call:ice-candidate", {
            to: peerId,
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
          setCallState("connected");
        }
        if (state === "failed" || state === "disconnected" || state === "closed") {
          if (remoteUserIdRef.current) {
            socket?.emit("call:end", { to: remoteUserIdRef.current });
          }
          cleanupCall();
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [socket, cleanupCall]
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
    const peerId = remoteUserIdRef.current;
    if (peerId && socket) {
      socket.emit("call:end", { to: peerId });
    }
    cleanupCall();
  }, [socket, cleanupCall]);

  const rejectCall = useCallback(() => {
    const peerId = remoteUserIdRef.current;
    if (peerId && socket) {
      socket.emit("call:reject", { to: peerId });
    }
    cleanupCall();
  }, [socket, cleanupCall]);

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
        callType: type,
      });

      // If offer already arrived, answer now; otherwise wait for call:offer
      if (pc.remoteDescription && !pc.localDescription) {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("call:answer", {
          to: remoteUserIdRef.current,
          sdp: pc.localDescription,
        });
      }

      setCallState("connected");
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
        socket.emit("call:reject", { to: payload.from, reason: "busy" });
        return;
      }
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
            sdp: pc.localDescription,
          });
          setCallState("connected");
        }
      } catch (error) {
        console.error(error);
      }
    };

    const onAccept = () => {
      setCallState("connected");
    };

    const onAnswer = async (payload) => {
      try {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(payload.sdp);
        setCallState("connected");
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

    const onReject = () => {
      toast.error("Call declined");
      cleanupCall();
    };

    const onEnd = () => {
      cleanupCall();
    };

    const onUnavailable = () => {
      toast.error("User is unavailable");
      cleanupCall();
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
  }, [socket, createPeerConnection, cleanupCall]);

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
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
