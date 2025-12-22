-- Migration: Add DeepSeek AI configuration
-- Date: 2025-12-21
-- Description: Adds DeepSeek as alternative AI provider for text analysis

-- DeepSeek pricing (per 1M tokens, in USD)
INSERT INTO app_config (key, value, default_value, description, category, value_type)
VALUES 
  ('deepseek.chat.input', '0.14', '0.14', 'DeepSeek Chat input price per 1M tokens (USD)', 'pricing', 'number'),
  ('deepseek.chat.output', '0.28', '0.28', 'DeepSeek Chat output price per 1M tokens (USD)', 'pricing', 'number'),
  ('deepseek.reasoner.input', '0.55', '0.55', 'DeepSeek Reasoner input price per 1M tokens (USD)', 'pricing', 'number'),
  ('deepseek.reasoner.output', '2.19', '2.19', 'DeepSeek Reasoner output price per 1M tokens (USD)', 'pricing', 'number')
ON CONFLICT (key) DO UPDATE SET 
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  value_type = EXCLUDED.value_type;

-- Update default AI model to DeepSeek if key exists
-- (uncomment to switch default model)
-- UPDATE app_config SET value = 'deepseek-chat' WHERE key = 'ai.default_model';
