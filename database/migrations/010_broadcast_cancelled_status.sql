-- Migration: Add 'cancelled' status to broadcast_status enum
-- Date: 2025-12-22
-- Description: Allows stopping broadcasts in progress

-- Add cancelled value to broadcast_status enum
ALTER TYPE app.broadcast_status ADD VALUE IF NOT EXISTS 'cancelled';
