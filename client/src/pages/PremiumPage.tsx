import { useEffect, useState } from 'react';
import { Preloader } from 'konsta/react';
import { Gem, Star, Crown, Check, Zap, ExternalLink } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { DEFAULT_FEATURES, DEFAULT_PLANS } from '@/config/constants';

interface PromoBanner {
  enabled: boolean;
  title: string;
  subtitle: string;
  buttonText: string;
  url: string;
  discount: number;
  gradient: string;
}

interface Plans {
  basic: { stars: number; durationDays: number; name?: string; features?: string[] };
  premium: { stars: number; durationDays: number; name?: string; features?: string[] };
  promo?: PromoBanner | null;
}

interface CryptoPrices {
  enabled: boolean;
  basic: { usdt: number; durationDays: number };
  premium: { usdt: number; durationDays: number };
}

const PLAN_STYLES = {
  basic: {
    icon: Star,
    gradient: 'from-blue-500 to-cyan-500',
  },
  premium: {
    icon: Crown,
    gradient: 'from-purple-500 to-pink-500',
    popular: true,
  },
};

export default function PremiumPage() {
  const { haptic, openInvoice, showAlert, openLink, openTelegramLink } = useTelegram();
  const { user, fetchUser } = useAppStore();
  
  const [plans, setPlans] = useState<Plans | null>(null);
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
    fetchUser();
  }, [fetchUser]);

  const loadPlans = async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const [plansData, cryptoData] = await Promise.all([
        api.subscription.getPlans(),
        api.subscription.getCryptoPrices().catch(() => null),
      ]);
      setPlans(plansData);
      if (cryptoData) setCryptoPrices(cryptoData);
    } catch {
      // Use default plans as fallback
      setPlans(DEFAULT_PLANS);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (tier: 'basic' | 'premium') => {
    haptic.medium();
    setPurchasing(`${tier}-stars`);

    try {
      const { invoiceUrl } = await api.subscription.createInvoice(tier);
      const status = await openInvoice(invoiceUrl);
      
      if (status === 'paid') {
        haptic.success();
        showAlert('Подписка успешно оформлена! 🎉');
        fetchUser();
      } else if (status !== 'cancelled') {
        showAlert('Не удалось завершить оплату');
      }
    } catch (error) {
      haptic.error();
      showAlert(error instanceof Error ? error.message : 'Ошибка при оплате');
    } finally {
      setPurchasing(null);
    }
  };

  const handleCryptoPurchase = async (tier: 'basic' | 'premium') => {
    haptic.medium();
    setPurchasing(`${tier}-crypto`);

    try {
      const { invoiceUrl } = await api.subscription.createCryptoInvoice(tier);
      // Открываем CryptoBot нативно в Telegram
      openTelegramLink(invoiceUrl);
    } catch (error) {
      haptic.error();
      showAlert(error instanceof Error ? error.message : 'Ошибка при создании счёта');
    } finally {
      setPurchasing(null);
    }
  };

  const currentTier = user?.subscriptionTier || 'free';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Preloader />
      </div>
    );
  }

  return (
    <div className="fade-in min-h-screen">
      <div className="p-4 space-y-4 pt-6">
        
        {/* Fallback notice */}
        {loadError && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-3 text-center">
            <p className="text-amber-600 dark:text-amber-400 text-sm">
              Не удалось загрузить актуальные цены. Показаны базовые тарифы.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="text-center px-4">
          <div className="mb-3 flex justify-center">
            <Gem className="w-16 h-16 text-purple-500" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-800 dark:text-white">Premium</h1>
          <p className="text-gray-400 text-sm mt-2">
            Открой все возможности дневника
          </p>
        </div>

        {/* Current Plan Badge */}
        {currentTier !== 'free' && (
          <div className="bg-gradient-to-r from-green-400 to-emerald-500 rounded-2xl p-4 text-white text-center">
            <p className="text-sm opacity-80">Активный план</p>
            <p className="text-xl font-bold flex items-center justify-center gap-2">
              {currentTier === 'basic' ? (
                <><Star className="w-5 h-5" /> Basic</>
              ) : (
                <><Crown className="w-5 h-5" /> Premium</>
              )}
            </p>
            {user?.subscriptionExpiresAt && (
              <p className="text-sm opacity-80 mt-1">
                до {new Date(user.subscriptionExpiresAt).toLocaleDateString('ru')}
              </p>
            )}
          </div>
        )}

        {/* Plans */}
        <div className="space-y-4">
          {/* Premium Plan - Featured */}
          <div className="relative">
            {PLAN_STYLES.premium.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg z-10 flex items-center gap-1">
                <Star className="w-3 h-3 fill-current" /> Популярный
              </div>
            )}
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-lg border-2 border-purple-200 dark:border-purple-800 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${PLAN_STYLES.premium.gradient} flex items-center justify-center shadow-lg`}>
                  <Crown className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white">{plans?.premium.name || 'Premium'}</h3>
                  <p className="text-gray-400 text-sm">в месяц</p>
                </div>
                <div className="ml-auto text-right flex items-center gap-1">
                  <span className="text-3xl font-bold text-gray-800 dark:text-white">{plans?.premium.stars || 150}</span>
                  <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                </div>
              </div>
              
              <ul className="space-y-2 mb-5">
                {(plans?.premium.features || DEFAULT_FEATURES.premium).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => handlePurchase('premium')}
                disabled={currentTier === 'premium' || purchasing === 'premium-stars'}
                className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98]
                  ${currentTier === 'premium'
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-xl shadow-purple-500/30'
                  } disabled:opacity-60`}
              >
                {purchasing === 'premium-stars' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Preloader className="!w-5 !h-5" />
                    Оплата...
                  </span>
                ) : currentTier === 'premium' ? (
                  <span className="flex items-center justify-center gap-1"><Check className="w-5 h-5" /> Активен</span>
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    {plans?.premium.stars || 150} <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" /> Быстро
                  </span>
                )}
              </button>
              
              {/* Crypto payment button for Premium */}
              {cryptoPrices?.enabled && currentTier !== 'premium' && (
                <button
                  onClick={() => handleCryptoPurchase('premium')}
                  disabled={purchasing === 'premium-crypto'}
                  className="w-full mt-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                >
                  {purchasing === 'premium-crypto' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Preloader className="!w-4 !h-4" />
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <Zap className="w-4 h-4" /> ${cryptoPrices.premium.usdt} Crypto 
                      <span className="text-xs opacity-80 ml-1">(-30%)</span>
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Basic Plan */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${PLAN_STYLES.basic.gradient} flex items-center justify-center shadow-md`}>
                <Star className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{plans?.basic.name || 'Basic'}</h3>
                <p className="text-gray-400 text-xs">в месяц</p>
              </div>
              <div className="ml-auto text-right flex items-center gap-1">
                <span className="text-2xl font-bold text-gray-800 dark:text-white">{plans?.basic.stars || 50}</span>
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
            </div>
            
            <ul className="space-y-1.5 mb-4">
              {(plans?.basic.features || DEFAULT_FEATURES.basic).map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Check className="w-4 h-4 text-green-500" />
                  {f}
                </li>
              ))}
            </ul>
            
            <button
              onClick={() => handlePurchase('basic')}
              disabled={currentTier !== 'free' || purchasing === 'basic-stars'}
              className={`w-full py-3 rounded-xl font-semibold transition-all active:scale-[0.98]
                ${currentTier === 'basic'
                  ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                  : currentTier === 'premium'
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30'
                } disabled:opacity-60`}
            >
              {purchasing === 'basic-stars' ? (
                <span className="flex items-center justify-center gap-2">
                  <Preloader className="!w-5 !h-5" />
                </span>
              ) : currentTier === 'basic' ? (
                <span className="flex items-center justify-center gap-1"><Check className="w-5 h-5" /> Активен</span>
              ) : currentTier === 'premium' ? (
                'У вас Premium'
              ) : (
                <span className="flex items-center justify-center gap-1">
                  {plans?.basic.stars || 50} <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" /> Быстро
                </span>
              )}
            </button>
            
            {/* Crypto payment button for Basic */}
            {cryptoPrices?.enabled && currentTier === 'free' && (
              <button
                onClick={() => handleCryptoPurchase('basic')}
                disabled={purchasing === 'basic-crypto'}
                className="w-full mt-2 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20 disabled:opacity-60"
              >
                {purchasing === 'basic-crypto' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Preloader className="!w-4 !h-4" />
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <Zap className="w-4 h-4" /> ${cryptoPrices.basic.usdt} Crypto
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Promo Banner - Buy Stars Cheap */}
        {plans?.promo?.enabled && plans.promo.url && (
          <div 
            onClick={() => {
              haptic.light();
              openLink(plans.promo!.url);
            }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all border border-gray-100 dark:border-gray-700 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{plans.promo.title.replace(/^⭐\s*/, '')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{plans.promo.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-indigo-500 dark:text-indigo-400 text-sm font-medium">
                {plans.promo.buttonText}
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        )}

        {/* FAQ */}
        <div className="pt-4">
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-3 px-1">Вопросы</h2>
          <div className="space-y-3">
            <FaqItem 
              q="Как работает оплата?" 
              a="Stars — быстро через Telegram. Crypto — выгоднее через @CryptoBot." 
            />
            <FaqItem 
              q="Могу отменить?" 
              a="Подписка действует до конца периода. Автопродления нет." 
            />
            <FaqItem 
              q="Что с записями?" 
              a="Все записи сохраняются навсегда, меняются только лимиты." 
            />
            {cryptoPrices?.enabled && (
              <FaqItem 
                q="Почему Crypto дешевле?" 
                a="Telegram берёт комиссию за Stars. С криптой мы передаём экономию вам." 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
      onClick={() => setOpen(!open)}
    >
      <div className="p-4 flex justify-between items-center cursor-pointer">
        <span className="font-medium text-sm text-gray-700 dark:text-gray-200">{q}</span>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </div>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}
