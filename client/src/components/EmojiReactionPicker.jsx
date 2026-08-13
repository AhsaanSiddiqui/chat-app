import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EMOJI_CATEGORIES,
  QUICK_REACTIONS,
  getRecentReactions,
  pushRecentReaction,
} from "../lib/reactions";

const useIsTouchUi = () => {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(hover: none), (pointer: coarse)").matches ||
      window.innerWidth < 768
    );
  });

  useEffect(() => {
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => {
      setIsTouch(mq.matches || window.innerWidth < 768);
    };
    update();
    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return isTouch;
};

const EmojiReactionPicker = ({
  anchorEl,
  align = "left",
  showFullPicker = false,
  onToggleFullPicker,
  onSelect,
  onClose,
}) => {
  const isTouchUi = useIsTouchUi();
  const [activeCategory, setActiveCategory] = useState("recent");
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState(() => getRecentReactions());
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const panelRef = useRef(null);

  useEffect(() => {
    setRecent(getRecentReactions());
  }, [showFullPicker]);

  const categories = useMemo(
    () =>
      EMOJI_CATEGORIES.map((category) =>
        category.id === "recent"
          ? { ...category, emojis: recent.length ? recent : QUICK_REACTIONS }
          : category
      ),
    [recent]
  );

  const visibleEmojis = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query) {
      const matchedCategories = categories.filter(
        (category) =>
          category.id !== "recent" &&
          (category.label.toLowerCase().includes(query) ||
            category.id.includes(query))
      );

      if (matchedCategories.length) {
        return matchedCategories
          .flatMap((category) => category.emojis)
          .filter((emoji, index, arr) => arr.indexOf(emoji) === index)
          .slice(0, 160);
      }

      return (
        categories
          .find((category) => category.id === "smileys")
          ?.emojis.filter((emoji) => emoji.includes(query))
          .slice(0, 80) || []
      );
    }

    const category =
      categories.find((item) => item.id === activeCategory) || categories[0];
    return category?.emojis || [];
  }, [activeCategory, categories, search]);

  useLayoutEffect(() => {
    if (isTouchUi) return;

    const updatePosition = () => {
      const panel = panelRef.current;
      const panelWidth = panel?.offsetWidth || (showFullPicker ? 300 : 280);
      const panelHeight = panel?.offsetHeight || (showFullPicker ? 360 : 56);
      const gap = 10;
      const padding = 12;

      if (!anchorEl) {
        setCoords({
          top: Math.max(padding, window.innerHeight / 2 - panelHeight / 2),
          left: Math.max(padding, window.innerWidth / 2 - panelWidth / 2),
        });
        return;
      }

      const rect = anchorEl.getBoundingClientRect();

      let left =
        align === "right"
          ? rect.right - panelWidth
          : rect.left + rect.width / 2 - panelWidth / 2;

      left = Math.max(
        padding,
        Math.min(left, window.innerWidth - panelWidth - padding)
      );

      let top = rect.top - panelHeight - gap;
      if (top < padding) {
        top = Math.min(
          rect.bottom + gap,
          window.innerHeight - panelHeight - padding
        );
      }

      setCoords({ top, left });
    };

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorEl, align, showFullPicker, activeCategory, search, isTouchUi]);

  const handleSelect = (emoji) => {
    pushRecentReaction(emoji);
    setRecent(getRecentReactions());
    onSelect?.(emoji);
  };

  const quickBar = (
    <div
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-xl ${
        isTouchUi
          ? "w-full justify-between border-white/10 bg-[#1f1f24] px-3 py-2"
          : "border-gray-200 bg-white"
      }`}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => handleSelect(emoji)}
          className={`flex items-center justify-center rounded-full transition ${
            isTouchUi
              ? "h-11 w-11 text-2xl hover:bg-white/10"
              : "h-9 w-9 text-xl hover:bg-black/5"
          }`}
        >
          {emoji}
        </button>
      ))}
      {!isTouchUi && (
        <>
          <button
            type="button"
            title="More emojis"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFullPicker?.();
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold transition ${
              showFullPicker
                ? "bg-emerald-500 text-white"
                : "bg-black/5 text-gray-700 hover:bg-black/10"
            }`}
          >
            +
          </button>
          <button
            type="button"
            title="Close"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-black/5"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );

  const fullPicker = (showFullPicker || isTouchUi) && (
    <div
      className={`overflow-hidden border text-white shadow-2xl ${
        isTouchUi
          ? "mt-3 w-full rounded-2xl border-white/10 bg-[#17171f]"
          : "mb-2 w-[300px] rounded-2xl border-white/10 bg-[#1f1f24]"
      }`}
    >
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            title={category.label}
            onClick={() => {
              setActiveCategory(category.id);
              setSearch("");
            }}
            className={`flex flex-shrink-0 items-center justify-center rounded-full text-base transition ${
              isTouchUi ? "h-10 w-10" : "h-8 w-8"
            } ${
              activeCategory === category.id && !search
                ? "bg-emerald-500/20 ring-1 ring-emerald-400/50"
                : "hover:bg-white/10"
            }`}
          >
            {category.icon}
          </button>
        ))}
      </div>

      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-black/20 px-3 py-2.5">
          <span className="text-gray-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reaction"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
          />
        </div>
      </div>

      <div
        className={`overflow-y-auto px-2 py-3 ${
          isTouchUi ? "max-h-[42vh]" : "max-h-[250px]"
        }`}
      >
        {!search && (
          <p className="px-2 pb-2 text-[11px] uppercase tracking-wide text-gray-400">
            {categories.find((item) => item.id === activeCategory)?.label ||
              "Emojis"}
          </p>
        )}
        <div className={`grid gap-1 ${isTouchUi ? "grid-cols-7" : "grid-cols-8"}`}>
          {visibleEmojis.map((emoji) => (
            <button
              key={`${activeCategory}-${emoji}`}
              type="button"
              onClick={() => handleSelect(emoji)}
              className={`flex items-center justify-center rounded-lg hover:bg-white/10 ${
                isTouchUi ? "h-11 w-full text-2xl" : "h-9 w-9 text-xl"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {!visibleEmojis.length && (
          <p className="px-2 py-4 text-center text-xs text-gray-500">
            No emoji found
          </p>
        )}
      </div>
    </div>
  );

  const content = isTouchUi ? (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#121218] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-sm font-medium text-gray-200">React</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2.5 py-1 text-sm text-gray-400 hover:bg-white/10"
          >
            ✕
          </button>
        </div>
        {quickBar}
        {fullPicker}
      </div>
    </div>
  ) : (
    <div
      ref={panelRef}
      className="fixed z-[80]"
      style={{ top: coords.top, left: coords.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {fullPicker}
      {quickBar}
    </div>
  );

  return createPortal(content, document.body);
};

export default EmojiReactionPicker;
