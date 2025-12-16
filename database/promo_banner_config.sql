-- Promo Banner Configuration (Buy Stars Cheap)
-- Configurable banner between plans and FAQ on Premium page

-- Enable/disable the banner
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('promo.stars_banner.enabled', 'true', 'boolean', 'Show "Buy Stars Cheap" promo banner', 'promo', 'system', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Banner title
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('promo.stars_banner.title', '⭐ Купить Stars дешевле', 'string', 'Promo banner title', 'promo', 'system', 'Купить Stars дешевле')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Banner subtitle/description
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('promo.stars_banner.subtitle', 'Экономия до 40% через Fragment', 'string', 'Promo banner subtitle', 'promo', 'system', 'Экономия до 40%')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Button text
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('promo.stars_banner.button_text', 'Перейти →', 'string', 'Promo banner button text', 'promo', 'system', 'Перейти')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Partner/referral link
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('promo.stars_banner.url', 'https://fragment.com/stars', 'string', 'Promo banner URL (partner link)', 'promo', 'system', 'https://fragment.com/stars')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Discount percentage (for display)
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('promo.stars_banner.discount', '40', 'number', 'Discount percentage to display', 'promo', 'system', '30')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Background gradient colors (CSS)
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('promo.stars_banner.gradient', 'from-yellow-400 to-orange-500', 'string', 'Tailwind gradient classes', 'promo', 'system', 'from-yellow-400 to-orange-500')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
