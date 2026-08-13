import React, { useEffect, useMemo, useRef, useState } from "react";

const ReactionPeopleModal = ({
  open,
  summary = [],
  initialEmoji = null,
  resolvePerson,
  onAddReaction,
  onRemoveOwn,
  onClose,
}) => {
  const [activeEmoji, setActiveEmoji] = useState(null);
  const addBtnRef = useRef(null);

  const totalCount = useMemo(
    () => summary.reduce((sum, item) => sum + (item.count || 0), 0),
    [summary]
  );

  useEffect(() => {
    if (!open) return;
    const preferred =
      initialEmoji && summary.some((s) => s.emoji === initialEmoji)
        ? initialEmoji
        : summary[0]?.emoji || null;
    setActiveEmoji(preferred);
  }, [open, initialEmoji, summary]);

  useEffect(() => {
    if (open && summary.length === 0) {
      onClose?.();
    }
  }, [open, summary.length, onClose]);

  if (!open) return null;

  const active =
    summary.find((s) => s.emoji === activeEmoji) || summary[0] || null;

  const people = (active?.userIds || []).map((id) => {
    const person = resolvePerson?.(id) || {
      id: String(id),
      name: "Someone",
      avatar: "",
      isMe: false,
    };
    return { ...person, emoji: active.emoji };
  });

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(78vh,520px)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1b1b24] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reaction-people-title"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2
            id="reaction-people-title"
            className="text-[15px] font-medium text-gray-300"
          >
            {totalCount} {totalCount === 1 ? "reaction" : "reactions"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 px-3 pb-3">
          <button
            ref={addBtnRef}
            type="button"
            title="Add reaction"
            onClick={() => onAddReaction?.(addBtnRef.current)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-base hover:bg-white/10"
          >
            <span aria-hidden>😊</span>
          </button>
          {summary.map((item) => {
            const selected = item.emoji === active?.emoji;
            return (
              <button
                key={item.emoji}
                type="button"
                onClick={() => setActiveEmoji(item.emoji)}
                className={`flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition ${
                  selected
                    ? "border-violet-400/50 bg-violet-500/25 text-white"
                    : "border-white/10 bg-transparent text-gray-300 hover:bg-white/5"
                }`}
              >
                <span className="text-base leading-none">{item.emoji}</span>
                <span className="text-xs tabular-nums">{item.count}</span>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1">
          {people.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              No reactions yet
            </p>
          ) : (
            people.map((person) => {
              const clickable = person.isMe;
              const RowTag = clickable ? "button" : "div";
              return (
                <RowTag
                  key={`${person.id}-${person.emoji}`}
                  type={clickable ? "button" : undefined}
                  onClick={
                    clickable
                      ? () => onRemoveOwn?.(person.emoji)
                      : undefined
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                    clickable ? "hover:bg-white/5" : ""
                  }`}
                >
                  {person.avatar ? (
                    <img
                      src={person.avatar}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover border border-white/10"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/30 text-sm font-semibold text-white">
                      {(person.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {person.isMe ? "You" : person.name}
                    </p>
                    {person.isMe ? (
                      <p className="text-[11px] text-gray-400">
                        Click to remove
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xl leading-none">{person.emoji}</span>
                </RowTag>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ReactionPeopleModal;
