-- Migration: Add card_payment and crypto_payment to transaction_type enum
-- Date: 2025-12-26

-- Add new transaction types for card and crypto payments
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'card_payment';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'crypto_payment';
