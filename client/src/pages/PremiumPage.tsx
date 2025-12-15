import { useEffect, useState } from 'react';
import { Preloader } from 'konsta/react';
import { Gem, Star, Crown, Check } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';

interface Plans {
  basic: { stars: number; durationDays: number };
  premium: { stars: number; durationDays: number };
}

const PLANS = {
  basic: {
    name: 'Basic',
    icon: Star,
    gradient: 'from-blue-500 to-cyan-500',
    features: [
      '20 записей в день',
      '5 голосовых в день',
      'Расширенный анализ',
      'Теги и рекомендации',
    ],
  },
  premium: {
    name: 'Premium',
    icon: Crown,
    gradient: 'from-purple-500 to-pink-500',
    features: [
      'Безлимитные записи',
      'Безлимитные голосовые',
      'Глубокий анализ с ИИ',
      'Персональные инсайты',
      'Приоритетная поддержка',
    ],
    popular: true,
  },
};

export default function PremiumPage() {
  const { haptic, openInvoice, showAlert } = useTelegram();
  const { user, fetchUser } = useAppStore();
  
  const [plans, setPlans] = useState<Plans | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
    fetchUser();
  }, [fetchUser]);

  const loadPlans = async () => {
    try {
      const data = await api.subscription.getPlans();
      setPlans(data);
    } catch {
      // Plans will use default values from PLANS constant
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (tier: 'basic' | 'premium') => {
    haptic.medium();
    setPurchasing(tier);

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
        
        {/* Header */}
        <div className="text-center px-4">
          <div className="mb-3 flex justify-center">
            <Gem className="w-16 h-16 text-purple-500" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-800">Premium</h1>
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
            {PLANS.premium.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg z-10 flex items-center gap-1">
                <Star className="w-3 h-3 fill-current" /> Популярный
              </div>
            )}
            <div className="bg-white rounded-3xl p-5 shadow-lg border-2 border-purple-200 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${PLANS.premium.gradient} flex items-center justify-center shadow-lg`}>
                  <Crown className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">{PLANS.premium.name}</h3>
                  <p className="text-gray-400 text-sm">в месяц</p>
                </div>
                <div className="ml-auto text-right flex items-center gap-1">
                  <span className="text-3xl font-bold text-gray-800">{plans?.premium.stars || 150}</span>
                  <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                </div>
              </div>
              
              <ul className="space-y-2 mb-5">
                {PLANS.premium.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => handlePurchase('premium')}
                disabled={currentTier === 'premium' || purchasing === 'premium'}
                className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98]
                  ${currentTier === 'premium'
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-xl shadow-purple-500/30'
                  } disabled:opacity-60`}
              >
                {purchasing === 'premium' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Preloader className="!w-5 !h-5" />
                    Оплата...
                  </span>
                ) : currentTier === 'premium' ? (
                  <span className="flex items-center justify-center gap-1"><Check className="w-5 h-5" /> Активен</span>
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    Оформить за {plans?.premium.stars || 150} <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Basic Plan */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${PLANS.basic.gradient} flex items-center justify-center shadow-md`}>
                <Star className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">{PLANS.basic.name}</h3>
                <p className="text-gray-400 text-xs">в месяц</p>
              </div>
              <div className="ml-auto text-right flex items-center gap-1">
                <span className="text-2xl font-bold text-gray-800">{plans?.basic.stars || 50}</span>
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
            </div>
            
            <ul className="space-y-1.5 mb-4">
              {PLANS.basic.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-500">
                  <Check className="w-4 h-4 text-green-500" />
                  {f}
                </li>
              ))}
            </ul>
            
            <button
              onClick={() => handlePurchase('basic')}
              disabled={currentTier !== 'free' || purchasing === 'basic'}
              className={`w-full py-3 rounded-xl font-semibold transition-all active:scale-[0.98]
                ${currentTier === 'basic'
                  ? 'bg-green-100 text-green-600'
                  : currentTier === 'premium'
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30'
                } disabled:opacity-60`}
            >
              {purchasing === 'basic' ? (
                <span className="flex items-center justify-center gap-2">
                  <Preloader className="!w-5 !h-5" />
                </span>
              ) : currentTier === 'basic' ? (
                <span className="flex items-center justify-center gap-1"><Check className="w-5 h-5" /> Активен</span>
              ) : currentTier === 'premium' ? (
                'У вас Premium'
              ) : (
                <span className="flex items-center justify-center gap-1">
                  Оформить за {plans?.basic.stars || 50} <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                </span>
              )}
            </button>
          </div>
        </div>

        {/* FAQ */}
        <div className="pt-4">
          <h2 className="text-lg font-bold text-gray-700 mb-3 px-1">Вопросы</h2>
          <div className="space-y-3">
            <FaqItem 
              q="Как работает оплата?" 
              a="Через Telegram Stars — внутреннюю валюту Telegram." 
            />
            <FaqItem 
              q="Могу отменить?" 
              a="Подписка действует до конца периода. Автопродления нет." 
            />
            <FaqItem 
              q="Что с записями?" 
              a="Все записи сохраняются навсегда, меняются только лимиты." 
            />
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
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      onClick={() => setOpen(!open)}
    >
      <div className="p-4 flex justify-between items-center cursor-pointer">
        <span className="font-medium text-sm text-gray-700">{q}</span>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </div>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-500 border-t border-gray-100 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}
