import { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart3, PenLine, Crown, User } from 'lucide-react';

// Components
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages
import HomePage from './pages/HomePage';
import NewEntryPage from './pages/NewEntryPage';
import StatsPage from './pages/StatsPage';
import PremiumPage from './pages/PremiumPage';
import EntryDetailPage from './pages/EntryDetailPage';
import ProfilePage from './pages/ProfilePage';
import EntriesPage from './pages/EntriesPage';

// Hooks
import { useTelegram } from './hooks/useTelegram';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { webApp } = useTelegram();

  // Initialize Telegram WebApp
  useEffect(() => {
    if (webApp) {
      webApp.ready();
      webApp.expand();
    }
  }, [webApp]);

  // Sync Dark Mode with Telegram colorScheme
  useEffect(() => {
    const applyTheme = () => {
      const colorScheme = window.Telegram?.WebApp?.colorScheme;
      if (colorScheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    // Apply on mount
    applyTheme();

    // Listen for theme changes (Telegram WebApp event)
    // Using type assertion since SDK types may not include on/off methods
    const tgApp = window.Telegram?.WebApp as { 
      on?: (event: string, callback: () => void) => void;
      off?: (event: string, callback: () => void) => void;
    } | undefined;
    
    tgApp?.on?.('themeChanged', applyTheme);

    return () => {
      tgApp?.off?.('themeChanged', applyTheme);
    };
  }, []);

  // Handle back button
  useEffect(() => {
    if (!webApp) return;

    const isMainPage = location.pathname === '/';
    
    if (isMainPage) {
      webApp.BackButton.hide();
    } else {
      webApp.BackButton.show();
      const handleBack = () => navigate(-1);
      webApp.BackButton.onClick(handleBack);
      return () => webApp.BackButton.offClick(handleBack);
    }
  }, [webApp, location, navigate]);

  // Determine active tab
  const activeTab = () => {
    if (location.pathname.startsWith('/stats')) return 'stats';
    if (location.pathname.startsWith('/premium')) return 'premium';
    if (location.pathname.startsWith('/profile')) return 'profile';
    if (location.pathname.startsWith('/new')) return 'new';
    return 'home';
  };

  // Hide tabbar on detail pages
  const showTabbar = !location.pathname.startsWith('/entry/');

  return (
    // Фон всего приложения
    <div className="min-h-screen bg-[#F1F3F5] dark:bg-[#1C1C1E] flex justify-center font-sans">
      {/* Мобильный контейнер - имитация экрана телефона */}
      <div className="w-full max-w-[450px] bg-[#F8F9FA] dark:bg-[#1C1C1E] min-h-screen relative shadow-2xl overflow-hidden">
        
        {/* Main content с отступом под floating dock */}
        <div className="min-h-screen pb-28">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/new" element={<NewEntryPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/entries" element={<EntriesPage />} />
              <Route path="/premium" element={<PremiumPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/entry/:id" element={<EntryDetailPage />} />
            </Routes>
          </ErrorBoundary>
        </div>

        {/* Floating Dock Navigation */}
        {showTabbar && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] z-50">
            <div className="flex justify-around items-center bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border border-white/40 dark:border-gray-700/40 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[28px] py-3 px-4">
              
              {/* Home */}
              <NavButton 
                icon={<Home size={22} strokeWidth={2} />} 
                label="Главная"
                active={activeTab() === 'home'} 
                onClick={() => navigate('/')}
              />
              
              {/* Stats */}
              <NavButton 
                icon={<BarChart3 size={22} strokeWidth={2} />} 
                label="Статистика"
                active={activeTab() === 'stats'} 
                onClick={() => navigate('/stats')}
              />
              
              {/* New Entry - Main button */}
              <NavButton 
                icon={<PenLine size={24} strokeWidth={2.5} />} 
                isMain 
                onClick={() => navigate('/new')}
              />
              
              {/* Premium */}
              <NavButton 
                icon={<Crown size={22} strokeWidth={2} />} 
                label="Premium"
                active={activeTab() === 'premium'} 
                onClick={() => navigate('/premium')}
              />
              
              {/* Profile */}
              <NavButton 
                icon={<User size={22} strokeWidth={2} />} 
                label="Профиль"
                active={activeTab() === 'profile'} 
                onClick={() => navigate('/profile')}
              />
              
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Floating Dock Button Component
function NavButton({ 
  icon, 
  label, 
  active, 
  isMain, 
  onClick 
}: { 
  icon: React.ReactNode; 
  label?: string;
  active?: boolean; 
  isMain?: boolean; 
  onClick: () => void;
}) {
  if (isMain) {
    return (
      <button 
        onClick={onClick}
        className="flex items-center justify-center w-14 h-14 -mt-8 
                   bg-gradient-to-br from-blue-500 to-indigo-600 
                   rounded-full shadow-lg shadow-blue-500/40 
                   text-white 
                   active:scale-95 transition-all duration-200
                   hover:shadow-xl hover:shadow-blue-500/50"
      >
        {icon}
      </button>
    );
  }

  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 
                  transition-all duration-200 min-w-[48px]
                  ${active 
                    ? 'text-blue-600 dark:text-blue-400 scale-105' 
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
    >
      <span className={`transition-transform ${active ? 'scale-110' : ''}`}>
        {icon}
      </span>
      {label && (
        <span className={`text-[10px] font-medium ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {label}
        </span>
      )}
    </button>
  );
}
