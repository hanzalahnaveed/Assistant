export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

const actions = {
  MARK_READ: { removeLabelIds: ["UNREAD"] },
  MARK_UNREAD: { addLabelIds: ["UNREAD"] },
  STAR: { addLabelIds: ["STARRED"] },
  UNSTAR: { removeLabelIds: ["STARRED"] },
  ARCHIVE: { removeLabelIds: ["INBOX"] },
  MOVE_TO_INBOX: { addLabelIds: ["INBOX"], removeLabelIds: ["TRASH"] },
};

export function getGmailModifyPayload(action) {
  const payload = actions[action];
  if (!payload) throw new Error("Unsupported Gmail mailbox action.");
  return {
    ...(payload.addLabelIds ? { addLabelIds: [...payload.addLabelIds] } : {}),
    ...(payload.removeLabelIds ? { removeLabelIds: [...payload.removeLabelIds] } : {}),
  };
}
