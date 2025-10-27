import { NavLink, Route, Routes } from 'react-router-dom';
import IssuancePage from './pages/IssuancePage';
import VerificationPage from './pages/VerificationPage';

const navigation = [
  { label: 'Issuance', to: '/' },
  { label: 'Verification', to: '/verify' }
];

const App = () => (
  <div className="min-h-screen bg-slate-100">
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 md:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-base font-bold text-brand sm:h-10 sm:w-10 sm:rounded-xl sm:text-lg">
              KC
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-dark sm:text-sm sm:tracking-[0.3em]">Kube Credential</p>
              <p className="hidden text-xs text-slate-500 sm:block">Secure issuance & verification</p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-semibold text-slate-600 shadow-sm sm:gap-2 sm:p-1 sm:text-sm">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }: { isActive: boolean }) =>
                  `whitespace-nowrap rounded-full px-2 py-1.5 transition sm:px-4 sm:py-2 ${
                    isActive
                      ? 'bg-white text-brand shadow-sm ring-1 ring-brand/40'
                      : 'hover:text-brand-dark'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>

    <main className="pt-[68px] pb-16 sm:pt-24">
      <Routes>
        <Route path="/" element={<IssuancePage />} />
        <Route path="/verify" element={<VerificationPage />} />
        <Route path="*" element={<IssuancePage />} />
      </Routes>
    </main>
  </div>
);

export default App;
