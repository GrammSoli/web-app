/**
 * Platega Payment Service
 * Integration with Platega for card payments (СБП, Cards)
 * 
 * API Docs: https://docs.platega.io/
 */

import { apiLogger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface PlatogaPaymentDetails {
  amount: number;
  currency: string;
  description: string;
  return: string;
  failedUrl: string;
  payload?: string;
}

export interface PlatogaCreatePaymentRequest {
  paymentMethod: number;
  paymentDetails: PlatogaPaymentDetails;
}

export interface PlatogaCreatePaymentResponse {
  paymentMethod: string;
  transactionId: string;
  redirect: string;
  return: string;
  paymentDetails: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'CHARGEBACKED';
  expiresIn: string;
  merchantId: string;
  usdtRate?: number;
}

export interface PlatogaTransactionStatus {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'CHARGEBACKED';
  paymentDetails: {
    amount: number;
    currency: string;
  };
  paymentMethod: string;
  expiresIn?: string;
  payload?: string;
}

export interface PlatogaWebhookPayload {
  id: string;
  amount: number;
  currency: string;
  status: 'CONFIRMED' | 'CANCELED';
  paymentMethod: number;
  payload?: string;
}

// Payment methods
export const PLATOGA_METHODS = {
  SBP_QR: 2,
  CARDS_RUB: 10,
  CARD_ACQUIRING: 11,
  INTERNATIONAL: 12,
  CRYPTO: 13,
} as const;

// ============================================
// CONFIG
// ============================================

const PLATOGA_API_URL = 'https://app.platega.io';

// ============================================
// API CLIENT
// ============================================

class PlategaService {
  private merchantId: string;
  private apiSecret: string;
  private isEnabled: boolean = false;

  constructor() {
    // Credentials from environment or hardcoded for now
    this.merchantId = process.env.PLATEGA_MERCHANT_ID || '3bab1f3c-34ff-4915-8f37-214ef81c8b9e';
    this.apiSecret = process.env.PLATEGA_API_SECRET || 'gnbYUfcyQCEjjMMVj5nx4HS91ISCX8Ni4a79YB6EnAdb8XAFe50xYwtlzlDMpDEJSD50KUKPqx8zdwK7NG5TlsGYjavQcq8nB8yl';
    this.isEnabled = !!(this.merchantId && this.apiSecret);
  }

  /**
   * Check if Platega is enabled
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Check if Platega is configured (alias for isAvailable)
   */
  isConfigured(): boolean {
    return this.isEnabled;
  }

  /**
   * Make API request to Platega
   */
  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `${PLATOGA_API_URL}${endpoint}`;
    
    apiLogger.info({ method, endpoint, body }, 'Platega API request');
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-MerchantId': this.merchantId,
        'X-Secret': this.apiSecret,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await response.json() as T;
    
    apiLogger.info({ status: response.status, data }, 'Platega API response');
    
    if (!response.ok) {
      throw new Error(`Platega API error: ${JSON.stringify(data)}`);
    }
    
    return data;
  }

  /**
   * Create payment link
   */
  async createPayment(params: {
    amount: number;
    currency?: string;
    description: string;
    successUrl: string;
    failUrl: string;
    payload?: string;
    paymentMethod?: number;
  }): Promise<PlatogaCreatePaymentResponse> {
    const request: PlatogaCreatePaymentRequest = {
      paymentMethod: params.paymentMethod || PLATOGA_METHODS.SBP_QR,
      paymentDetails: {
        amount: params.amount,
        currency: params.currency || 'RUB',
        description: params.description,
        return: params.successUrl,
        failedUrl: params.failUrl,
        payload: params.payload,
      },
    };
    
    return this.request<PlatogaCreatePaymentResponse>('POST', '/transaction/process', request);
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<PlatogaTransactionStatus> {
    return this.request<PlatogaTransactionStatus>('GET', `/transaction/${transactionId}`);
  }

  /**
   * Verify webhook signature
   * Platega sends X-MerchantId and X-Secret in headers
   */
  verifyWebhook(merchantId: string, secret: string): boolean {
    return merchantId === this.merchantId && secret === this.apiSecret;
  }

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(body: string): PlatogaWebhookPayload {
    return JSON.parse(body) as PlatogaWebhookPayload;
  }

  /**
   * Get credentials for verification
   */
  getCredentials(): { merchantId: string; apiSecret: string } {
    return { merchantId: this.merchantId, apiSecret: this.apiSecret };
  }
}

// Singleton instance
export const plategaService = new PlategaService();
