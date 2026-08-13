import React from "react";

const ReactionPeopleModal = ({
  open,
  emoji,
  people = [],
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#15151d] text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reaction-people-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2
            id="reaction-people-title"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <span className="text-xl">{emoji}</span>
            <span>
              {people.length} {people.length === 1 ? "reaction" : "reactions"}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto px-4 py-2">
          {people.length === 0 ? (
            <p className="py-3 text-sm text-gray-500">No reactions yet</p>
          ) : (
            people.map((person) => (
              <div
                key={person.id}
                className="flex items-center gap-2.5 py-2 border-b border-white/5 last:border-b-0"
              >
                {person.avatar ? (
                  <img
                    src={person.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover border border-white/10"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs text-gray-300">
                    {(person.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <p className="truncate text-sm text-white">
                  {person.name}
                  {person.isMe ? (
                    <span className="ml-1 text-[11px] text-gray-400">(You)</span>
                  ) : null}
                </p>
              </div>
            ))
          )}
        </div>

        <p className="border-t border-white/10 px-4 py-2.5 text-[11px] text-gray-500">
          Use + to add, change, or remove your reaction
        </p>
      </div>
    </div>
  );
};

export default ReactionPeopleModal;
