-- ============================================
-- Add RUB subscription prices for card payments
-- ============================================

SET search_path TO app;

-- Фиксированные цены в рублях (не зависят от курса USD)
INSERT INTO app_config (key, value, value_type, category, description, default_value)
VALUES (
  'subscription.basic.rub',
  '150',
  'number',
  'subscription',
  'Цена Basic подписки в рублях для оплаты картой/СБП',
  '150'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, value_type, category, description, default_value)
VALUES (
  'subscription.premium.rub',
  '399',
  'number',
  'subscription',
  'Цена Premium подписки в рублях для оплаты картой/СБП',
  '399'
)
ON CONFLICT (key) DO NOTHING;
