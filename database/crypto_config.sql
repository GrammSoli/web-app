-- CryptoPay Configuration
-- Run this SQL on the server to add crypto payment config

-- Crypto feature flag
INSERT INTO app.app_config (key, value, value_type, description, category, is_public, updated_by) VALUES
('feature.crypto_enabled', 'true', 'boolean', 'Enable CryptoPay payments', 'feature_flags', false, 'system')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- CryptoPay API settings
INSERT INTO app.app_config (key, value, value_type, description, category, is_public, updated_by) VALUES
('cryptopay.api_token', '', 'string', 'CryptoPay API token from @CryptoBot', 'integrations', false, 'system'),
('cryptopay.testnet', 'false', 'boolean', 'Use CryptoPay testnet', 'integrations', false, 'system'),
('cryptopay.webhook_secret', '', 'string', 'Webhook verification secret', 'integrations', false, 'system')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Crypto pricing for subscriptions
INSERT INTO app.app_config (key, value, value_type, description, category, is_public, updated_by) VALUES
('subscription.basic.crypto_usdt', '1.99', 'number', 'Basic subscription price in USDT', 'subscriptions', true, 'system'),
('subscription.premium.crypto_usdt', '4.90', 'number', 'Premium subscription price in USDT', 'subscriptions', true, 'system')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Bot username for redirect
INSERT INTO app.app_config (key, value, value_type, description, category, is_public, updated_by) VALUES
('telegram.bot_username', 'mindful_journal_bot', 'string', 'Telegram bot username', 'telegram', false, 'system')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
