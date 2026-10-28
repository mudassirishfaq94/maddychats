export default function ChatsIndexPage() {
  // The section layout authorizes the session. The shared provider refreshes
  // /api/conversations while local rows paint; do not repeat its unread scan
  // in a second server-rendered conversation-list query.
  return null;
}
