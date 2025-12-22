-- Migration: Add deepseek-chat to service_type enum
-- Date: 2025-12-22
-- Description: Adds deepseek-chat as new service type for AI usage logs

ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'deepseek-chat';
