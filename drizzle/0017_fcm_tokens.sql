-- FCM device tokens for Android native push notifications.
-- Capacitor PushNotifications plugin registers an FCM token per device;
-- the server stores it and uses the Firebase Admin SDK to deliver
-- notifications through the OS tray when the app is backgrounded.

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'android',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fcm_tokens_user_idx ON fcm_tokens(user_id);
