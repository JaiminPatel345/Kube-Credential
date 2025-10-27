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
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-lg font-bold text-brand">
            KC
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-dark">Kube Credential</p>
            <p className="text-xs text-slate-500">Secure issuance & verification</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-sm font-semibold text-slate-600 shadow-sm">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }: { isActive: boolean }) =>
                `rounded-full px-4 py-2 transition ${
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
    </nav>

    <main className="pt-24 pb-16">
      <Routes>
        <Route path="/" element={<IssuancePage />} />
        <Route path="/verify" element={<VerificationPage />} />
        <Route path="*" element={<IssuancePage />} />
      </Routes>
    </main>
  </div>
);

export default App;
