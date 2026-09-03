ALTER TABLE "oauth_accounts"
ADD CONSTRAINT "oauth_accounts_user_provider_unique"
UNIQUE("user_id", "provider");
