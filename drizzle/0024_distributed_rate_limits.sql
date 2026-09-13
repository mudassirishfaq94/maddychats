CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "count" integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_window_idx"
  ON "rate_limit_buckets" USING btree ("window_started_at");
