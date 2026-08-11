import React, { useEffect, useMemo, useState } from "react";
import {
  EMOJI_CATEGORIES,
  QUICK_REACTIONS,
  getRecentReactions,
  pushRecentReaction,
} from "../lib/reactions";

const EmojiReactionPicker = ({
  align = "left",
  showFullPicker = false,
  onToggleFullPicker,
  onSelect,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState("recent");
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState(() => getRecentReactions());

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

      return categories
        .find((category) => category.id === "smileys")
        ?.emojis.filter((emoji) => emoji.includes(query))
        .slice(0, 80) || [];
    }

    const category =
      categories.find((item) => item.id === activeCategory) || categories[0];
    return category?.emojis || [];
  }, [activeCategory, categories, search]);

  const handleSelect = (emoji) => {
    pushRecentReaction(emoji);
    setRecent(getRecentReactions());
    onSelect?.(emoji);
  };

  return (
    <div
      className={`absolute z-30 ${
        align === "right" ? "right-0" : "left-0"
      } bottom-full mb-2`}
      onClick={(e) => e.stopPropagation()}
    >
      {showFullPicker && (
        <div className="mb-2 w-[300px] rounded-2xl border border-white/10 bg-[#1f1f24] text-white shadow-2xl overflow-hidden">
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
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base transition ${
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
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-black/20 px-3 py-2">
              <span className="text-gray-400 text-sm">🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reaction"
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="max-h-[250px] overflow-y-auto px-2 py-3">
            {!search && (
              <p className="px-2 pb-2 text-[11px] uppercase tracking-wide text-gray-400">
                {categories.find((item) => item.id === activeCategory)?.label ||
                  "Emojis"}
              </p>
            )}
            <div className="grid grid-cols-8 gap-1">
              {visibleEmojis.map((emoji) => (
                <button
                  key={`${activeCategory}-${emoji}`}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-white/10"
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
      )}

      <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white px-2 py-1.5 shadow-xl">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleSelect(emoji)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-black/5"
          >
            {emoji}
          </button>
        ))}
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
      </div>
    </div>
  );
};

export default EmojiReactionPicker;
