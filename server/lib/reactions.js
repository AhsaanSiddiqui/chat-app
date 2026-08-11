export const applyOneReactionPerUser = (message, userId, emoji) => {
  if (!Array.isArray(message.reactions)) {
    message.reactions = [];
  }

  const existingIndex = message.reactions.findIndex(
    (reaction) => String(reaction.userId) === String(userId)
  );

  if (existingIndex >= 0) {
    const existing = message.reactions[existingIndex];
    if (existing.emoji === emoji) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions[existingIndex].emoji = emoji;
    }
  } else {
    message.reactions.push({ emoji, userId });
  }

  message.markModified("reactions");
};
