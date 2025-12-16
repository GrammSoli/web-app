/**
 * CryptoPay API Service
 * Integration with @CryptoBot for cryptocurrency payments
 * 
 * API Docs: https://help.send.tg/en/articles/10279948-crypto-pay-api
 */

import { createHash, createHmac } from 'crypto';
import { configService } from './config.js';

// ============================================
// TYPES
// ============================================

export interface CryptoPayInvoice {
  invoice_id: number;
  hash: string;
  currency_type: 'crypto' | 'fiat';
  asset?: string;
  fiat?: string;
  amount: string;
  paid_asset?: string;
  paid_amount?: string;
  paid_fiat_rate?: string;
  accepted_assets?: string;
  fee_asset?: string;
  fee_amount?: number;
  bot_invoice_url: string;
  mini_app_invoice_url: string;
  web_app_invoice_url: string;
  description?: string;
  status: 'active' | 'paid' | 'expired';
  created_at: string;
  paid_usd_rate?: string;
  allow_comments: boolean;
  allow_anonymous: boolean;
  expiration_date?: string;
  paid_at?: string;
  paid_anonymously?: boolean;
  comment?: string;
  hidden_message?: string;
  payload?: string;
  paid_btn_name?: string;
  paid_btn_url?: string;
}

export interface CryptoPayWebhookUpdate {
  update_id: number;
  update_type: 'invoice_paid';
  request_date: string;
  payload: CryptoPayInvoice;
}

export interface CreateInvoiceParams {
  currency_type?: 'crypto' | 'fiat';
  asset?: string;
  fiat?: string;
  accepted_assets?: string;
  amount: string;
  description?: string;
  hidden_message?: string;
  paid_btn_name?: 'viewItem' | 'openChannel' | 'openBot' | 'callback';
  paid_btn_url?: string;
  payload?: string;
  allow_comments?: boolean;
  allow_anonymous?: boolean;
  expires_in?: number;
}

interface CryptoPayResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

// ============================================
// CONFIG
// ============================================

const CRYPTO_PAY_API_URL = 'https://pay.crypt.bot/api';
const CRYPTO_PAY_TESTNET_URL = 'https://testnet-pay.crypt.bot/api';

// ============================================
// API CLIENT
// ============================================

class CryptoPayService {
  private token: string | null = null;
  private isTestnet: boolean = false;

  private get apiUrl(): string {
    return this.isTestnet ? CRYPTO_PAY_TESTNET_URL : CRYPTO_PAY_API_URL;
  }

  /**
   * Initialize the service with API token
   */
  async init(): Promise<void> {
    this.token = await configService.getString('cryptopay.api_token', '');
    this.isTestnet = await configService.getBool('cryptopay.testnet', false);
    
    if (!this.token) {
      console.warn('[CryptoPay] API token not configured');
    }
  }

  /**
   * Check if CryptoPay is enabled
   */
  async isEnabled(): Promise<boolean> {
    const enabled = await configService.getBool('feature.crypto_enabled', false);
    const hasToken = !!(this.token || await configService.getString('cryptopay.api_token', ''));
    return enabled && hasToken;
  }

  /**
   * Make API request to CryptoPay
   */
  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.token) {
      await this.init();
    }
    
    if (!this.token) {
      throw new Error('CryptoPay API token not configured');
    }

    const url = `${this.apiUrl}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Crypto-Pay-API-Token': this.token,
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = await response.json() as CryptoPayResponse<T>;

    if (!data.ok) {
      throw new Error(`CryptoPay API error: ${data.error || 'Unknown error'}`);
    }

    return data.result!;
  }

  /**
   * Test API connection
   */
  async getMe(): Promise<{ app_id: number; name: string; payment_processing_bot_username: string }> {
    return this.request('getMe');
  }

  /**
   * Create a new invoice
   */
  async createInvoice(params: CreateInvoiceParams): Promise<CryptoPayInvoice> {
    return this.request('createInvoice', params as unknown as Record<string, unknown>);
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: number): Promise<CryptoPayInvoice | null> {
    const invoices = await this.request<CryptoPayInvoice[]>('getInvoices', {
      invoice_ids: String(invoiceId),
    });
    return invoices[0] || null;
  }

  /**
   * Delete invoice
   */
  async deleteInvoice(invoiceId: number): Promise<boolean> {
    return this.request('deleteInvoice', { invoice_id: invoiceId });
  }

  /**
   * Get exchange rates
   */
  async getExchangeRates(): Promise<Array<{
    is_valid: boolean;
    is_crypto: boolean;
    is_fiat: boolean;
    source: string;
    target: string;
    rate: string;
  }>> {
    return this.request('getExchangeRates');
  }

  /**
   * Get balance
   */
  async getBalance(): Promise<Array<{ currency_code: string; available: string; onhold: string }>> {
    return this.request('getBalance');
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!this.token) {
      return false;
    }

    const secret = createHash('sha256').update(this.token).digest();
    const hmac = createHmac('sha256', secret).update(body).digest('hex');
    
    return hmac === signature;
  }

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(body: string): CryptoPayWebhookUpdate {
    return JSON.parse(body) as CryptoPayWebhookUpdate;
  }
}

// ============================================
// SUBSCRIPTION HELPERS
// ============================================

export interface CryptoPricing {
  usdt: number;
  durationDays: number;
}

/**
 * Get crypto pricing for subscription tier
 */
export async function getCryptoPricing(tier: 'basic' | 'premium'): Promise<CryptoPricing> {
  const key = `subscription.${tier}.crypto_usdt`;
  const daysKey = `subscription.${tier}.duration_days`;
  
  const defaults: Record<string, CryptoPricing> = {
    basic: { usdt: 1.99, durationDays: 30 },
    premium: { usdt: 4.90, durationDays: 30 },
  };
  
  const usdt = await configService.getNumber(key, defaults[tier].usdt);
  const durationDays = await configService.getNumber(daysKey, defaults[tier].durationDays);
  
  return { usdt, durationDays };
}

/**
 * Create subscription invoice via CryptoPay
 */
export async function createSubscriptionInvoice(
  tier: 'basic' | 'premium',
  userId: string,
  telegramId: string
): Promise<{ invoiceUrl: string; invoiceId: number } | null> {
  const enabled = await cryptoPayService.isEnabled();
  if (!enabled) {
    return null;
  }

  const pricing = await getCryptoPricing(tier);
  const tierLabel = tier === 'basic' ? 'Basic' : 'Premium';
  
  // Bot URL for redirect after payment
  const botUsername = await configService.getString('telegram.bot_username', 'mindful_journal_bot');
  const successUrl = `https://t.me/${botUsername}?start=payment_success`;

  const invoice = await cryptoPayService.createInvoice({
    currency_type: 'fiat',
    fiat: 'USD',
    accepted_assets: 'USDT,TON,BTC,ETH,LTC',
    amount: pricing.usdt.toFixed(2),
    description: `Подписка ${tierLabel} на AI Mindful Journal (${pricing.durationDays} дней)`,
    hidden_message: `🎉 Спасибо за подписку ${tierLabel}! Ваша подписка активирована.`,
    paid_btn_name: 'openBot',
    paid_btn_url: successUrl,
    payload: JSON.stringify({
      type: 'subscription',
      tier,
      userId,
      telegramId,
      createdAt: new Date().toISOString(),
    }),
    allow_comments: false,
    allow_anonymous: false,
    expires_in: 3600, // 1 hour
  });

  return {
    invoiceUrl: invoice.bot_invoice_url,
    invoiceId: invoice.invoice_id,
  };
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const cryptoPayService = new CryptoPayService();
