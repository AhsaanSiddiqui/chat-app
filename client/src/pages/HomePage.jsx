import React, { useCallback, useContext, useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import ChatContainer from "../components/ChatContainer";
import RightSidebar from "../components/RightSidebar";
import ResizeHandle from "../components/ResizeHandle";
import { ChatContext } from "../../context/ChatContext";
import { ensureNotificationPermission } from "../lib/notifications";

const LEFT_KEY = "quickchat_left_sidebar_width";
const RIGHT_KEY = "quickchat_right_sidebar_width";
const LEFT_DEFAULT = 280;
const RIGHT_DEFAULT = 300;
const LEFT_MIN = 220;
const LEFT_MAX = 420;
const RIGHT_MIN = 260;
const RIGHT_MAX = 480;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const readWidth = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const HomePage = () => {
  const { selectedUser, selectedGroup, profilePanelOpen } =
    useContext(ChatContext);
  const hasOpenChat = !!(selectedUser || selectedGroup);
  const showProfilePanel = hasOpenChat && profilePanelOpen;

  const [leftWidth, setLeftWidth] = useState(() =>
    readWidth(LEFT_KEY, LEFT_DEFAULT)
  );
  const [rightWidth, setRightWidth] = useState(() =>
    readWidth(RIGHT_KEY, RIGHT_DEFAULT)
  );
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_KEY, String(leftWidth));
    } catch {
      // ignore
    }
  }, [leftWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_KEY, String(rightWidth));
    } catch {
      // ignore
    }
  }, [rightWidth]);

  const resizeLeft = useCallback((delta) => {
    setLeftWidth((w) => clamp(w + delta, LEFT_MIN, LEFT_MAX));
  }, []);

  const resizeRight = useCallback((delta) => {
    // Dragging handle left widens the right panel
    setRightWidth((w) => clamp(w - delta, RIGHT_MIN, RIGHT_MAX));
  }, []);

  return (
    <div className="w-full h-screen">
      <div className="backdrop-blur-xl overflow-hidden h-full flex">
        <div
          className={`h-full shrink-0 ${hasOpenChat ? "max-md:hidden" : ""}`}
          style={isDesktop ? { width: leftWidth } : { width: "100%" }}
        >
          <Sidebar />
        </div>

        {isDesktop && (
          <ResizeHandle onDrag={resizeLeft} className="max-md:hidden" />
        )}

        <div className="flex-1 min-w-[180px] h-full min-h-0">
          <ChatContainer />
        </div>

        {showProfilePanel && (
          <>
            {isDesktop && (
              <ResizeHandle onDrag={resizeRight} className="max-md:hidden" />
            )}
            <div
              className="h-full max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full md:shrink-0"
              style={isDesktop ? { width: rightWidth } : undefined}
            >
              <RightSidebar />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
