-- Migration: Fix segment filter rules to use real User fields
-- Date: 2025-12-22
-- Description: Update filter_rules to match actual database columns

-- Update voice_users to use total_voice_count > 0
UPDATE user_segments 
SET filter_rules = '{"total_voice_count": {"gt": 0}}'
WHERE slug = 'voice_users';

-- Update active_writers to use total_entries_count >= 10
UPDATE user_segments 
SET filter_rules = '{"total_entries_count": {"gte": 10}}'
WHERE slug = 'active_writers';

-- Inactive segments need date_updated (last activity)
-- since we don't have last_entry_at field
UPDATE user_segments 
SET filter_rules = '{"date_updated": {"lt": "-7 days"}}'
WHERE slug = 'inactive_7d';

UPDATE user_segments 
SET filter_rules = '{"date_updated": {"lt": "-30 days"}}'
WHERE slug = 'inactive_30d';

-- Fix subscription_tier format (should be "in" operator)
UPDATE user_segments 
SET filter_rules = '{"subscription_tier": {"in": ["basic", "premium"]}}'
WHERE slug = 'premium';

UPDATE user_segments 
SET filter_rules = '{"subscription_tier": {"in": ["free", null]}}'
WHERE slug = 'free';

-- All users - just status active
UPDATE user_segments 
SET filter_rules = '{"status": {"eq": "active"}}'
WHERE slug = 'all';
