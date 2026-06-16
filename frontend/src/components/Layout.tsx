import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  User,
  ShieldCheck,
  Crown,
  Users,
  Menu,
  X,
  ChevronDown,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

const NAV_LINKS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FileText, label: 'Documents' },
  { to: '/profile', icon: User, label: 'Profile' },
  { to: '/upgrade', icon: Crown, label: 'Upgrade', hideIfPremium: true },
];

const ADMIN_LINKS = [
  { to: '/admin', icon: Users, label: 'Admin' },
];

interface Props {
  children: React.ReactNode;
}

export default function Layout({ children }: Props) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  const navLinks = NAV_LINKS.filter((l) => !(l.hideIfPremium && user?.isPremium));

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-5">
        <ShieldCheck className="h-7 w-7 text-brand-600" />
        <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
          DocuVault
        </span>
      </div>

      {/* MFA warning */}
      {user && !user.mfaEnabled && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 p-2.5">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
              2FA not enabled
            </p>
            <NavLink
              to="/settings/mfa"
              className="text-xs text-yellow-700 dark:text-yellow-400 underline"
              onClick={() => setSidebarOpen(false)}
            >
              Enable now
            </NavLink>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-y-auto">
        {navLinks.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}

        {user?.role === 'ADMIN' && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Admin
              </p>
            </div>
            {ADMIN_LINKS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-semibold">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user?.username}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
            </div>
            <ChevronDown size={14} className="shrink-0 text-gray-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1 z-50">
              <NavLink
                to="/profile"
                onClick={() => { setDropdownOpen(false); setSidebarOpen(false); }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <User size={14} />
                Profile
              </NavLink>
              <NavLink
                to="/settings/mfa"
                onClick={() => { setDropdownOpen(false); setSidebarOpen(false); }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <ShieldCheck size={14} />
                Security
              </NavLink>
              <hr className="my-1 border-gray-100 dark:border-gray-700" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (mobile: slide-in, desktop: static) */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-60 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-transform duration-200',
          'flex lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar — mobile only */}
        <header className="flex h-14 items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-base font-semibold text-gray-900 dark:text-white">DocuVault</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
