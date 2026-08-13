import React from "react";
import { formatMessageTime } from "../lib/utils";

const Section = ({ title, children, emptyText }) => (
  <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
      {title}
    </h3>
    {children || (
      <p className="text-sm text-gray-500">{emptyText || "None yet"}</p>
    )}
  </div>
);

const PersonRow = ({ name, avatar, timeLabel }) => (
  <div className="flex items-center gap-2.5 py-1.5">
    {avatar ? (
      <img
        src={avatar}
        alt=""
        className="h-8 w-8 rounded-full object-cover border border-white/10"
      />
    ) : (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs text-gray-300">
        {(name || "?").slice(0, 1).toUpperCase()}
      </div>
    )}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm text-white">{name}</p>
      {timeLabel ? (
        <p className="text-[11px] text-gray-400">{timeLabel}</p>
      ) : null}
    </div>
  </div>
);

const MessageInfoModal = ({
  open,
  message,
  isGroup,
  isVoice,
  peerName,
  resolveUser,
  onClose,
}) => {
  if (!open || !message) return null;

  const senderId =
    typeof message.senderId === "object"
      ? String(message.senderId._id)
      : String(message.senderId || "");

  const idList = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((id) => (typeof id === "object" ? String(id._id) : String(id)))
      .filter((id) => id && id !== senderId);

  const deliveredIds = isGroup
    ? idList(message.deliveredTo)
    : message.delivered
      ? ["peer"]
      : [];
  const seenIds = isGroup
    ? idList(message.seenBy)
    : message.seen
      ? ["peer"]
      : [];
  const playedIds = isGroup
    ? idList(message.playedBy)
    : message.played
      ? ["peer"]
      : [];

  const renderPeople = (ids, timeForPeer) => {
    if (!ids.length) return null;
    return (
      <div className="max-h-40 overflow-y-auto">
        {ids.map((id) => {
          if (id === "peer") {
            return (
              <PersonRow
                key="peer"
                name={peerName || "User"}
                timeLabel={timeForPeer}
              />
            );
          }
          const user = resolveUser?.(id);
          return (
            <PersonRow
              key={id}
              name={user?.fullName || "Member"}
              avatar={user?.profilePic}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#15151d] text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-info-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="message-info-title" className="text-lg font-semibold">
            Message info
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl bg-white/5 px-3 py-2 text-sm text-gray-300">
            <p>
              Sent · {formatMessageTime(message.createdAt) || "—"}
            </p>
            {isVoice ? (
              <p className="mt-1 text-[11px] text-gray-500">Voice message</p>
            ) : null}
          </div>

          <Section
            title={
              isGroup
                ? `Delivered (${deliveredIds.length})`
                : "Delivered"
            }
            emptyText="Not delivered yet"
          >
            {renderPeople(
              deliveredIds,
              message.deliveredAt
                ? formatMessageTime(message.deliveredAt)
                : undefined
            )}
          </Section>

          <Section
            title={isGroup ? `Seen (${seenIds.length})` : "Seen"}
            emptyText="Not seen yet"
          >
            {renderPeople(
              seenIds,
              message.seenAt ? formatMessageTime(message.seenAt) : undefined
            )}
          </Section>

          {isVoice && (
            <Section
              title={isGroup ? `Played (${playedIds.length})` : "Played"}
              emptyText="Not played yet"
            >
              {renderPeople(
                playedIds,
                message.playedAt
                  ? formatMessageTime(message.playedAt)
                  : undefined
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageInfoModal;
