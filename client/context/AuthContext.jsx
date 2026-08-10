import axios from "axios";
import { createContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

axios.defaults.baseURL = backendUrl;

export const AuthContext = createContext();

const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return false;
    // small buffer so we don't race the exact second
    return payload.exp * 1000 <= Date.now() + 1000;
  } catch {
    return true;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [authUser, setAuthUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const authUserRef = useRef(null);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  const clearSession = (showToast = false) => {
    localStorage.removeItem("token");
    setToken(null);
    setAuthUser(null);
    setOnlineUsers([]);
    delete axios.defaults.headers.common["token"];
    socketRef.current?.disconnect();
    setSocket(null);
    if (showToast) {
      toast.error("Session expired. Please login again.");
    }
  };

  const checkAuth = async () => {
    try {
      const currentToken = localStorage.getItem("token");
      if (!currentToken || isTokenExpired(currentToken)) {
        clearSession(!!currentToken);
        return;
      }

      const { data } = await axios.get("/api/auth/check");

      if (data.success) {
        setAuthUser(data.user);
        connectSocket(data.user);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        clearSession(true);
      } else {
        console.log(error);
      }
    }
  };

  const login = async (state, credentials) => {
    try {
      const { data } = await axios.post(`/api/auth/${state}`, credentials);

      if (data.success) {
        setAuthUser(data.userData);

        setToken(data.token);
        localStorage.setItem("token", data.token);

        axios.defaults.headers.common["token"] = data.token;

        connectSocket(data.userData);

        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
    }
  };

  const logout = () => {
    clearSession(false);
    toast.success("Logged out successfully");
  };

  const updateProfile = async (body) => {
    try {
      const { data } = await axios.put("/api/auth/update-profile", body);

      if (data.success) {
        setAuthUser(data.user);
        toast.success("Profile updated successfully");
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        clearSession(true);
        return;
      }
      toast.error(error.response?.data?.message || error.message);
    }
  };

  const connectSocket = (userData) => {
    if (!userData || !userData._id) return;

    setSocket((prev) => {
      if (prev?.connected) return prev;

      if (prev) prev.disconnect();

      const newSocket = io(backendUrl, {
        query: {
          userId: userData._id,
        },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
      });

      newSocket.on("connect", () => {
        console.log("Socket Connected");
      });

      newSocket.on("getOnlineUsers", (userIds) => {
        setOnlineUsers(userIds);
      });

      return newSocket;
    });
  };

  const ensureSocketConnected = () => {
    const user = authUserRef.current;
    const current = socketRef.current;

    if (!user) return;

    if (!current) {
      connectSocket(user);
      return;
    }

    if (!current.connected) {
      current.connect();
    }
  };

  useEffect(() => {
    if (token) {
      if (isTokenExpired(token)) {
        clearSession(true);
        return;
      }
      axios.defaults.headers.common["token"] = token;
      checkAuth();
    }
  }, [token]);

  // Expire session + reconnect when user comes back to the tab
  useEffect(() => {
    const onAppActive = () => {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }

      const currentToken = localStorage.getItem("token");
      if (!currentToken) return;

      if (isTokenExpired(currentToken)) {
        clearSession(true);
        return;
      }

      ensureSocketConnected();
    };

    document.addEventListener("visibilitychange", onAppActive);
    window.addEventListener("focus", onAppActive);

    return () => {
      document.removeEventListener("visibilitychange", onAppActive);
      window.removeEventListener("focus", onAppActive);
    };
  }, []);

  const value = {
    axios,
    authUser,
    onlineUsers,
    socket,
    login,
    logout,
    updateProfile,
    checkAuth,
    ensureSocketConnected,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};
