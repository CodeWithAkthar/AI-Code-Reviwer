import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import '../styles/appShell.css';

interface AppShellProps {
  user?: {
    username?: string;
    avatarUrl?: string;
    plan?: string;
  } | null;
  onLogout?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  children: ReactNode;
}

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/settings/repos', label: 'Repositories' },
  { to: '/dashboard', label: 'Reviews' },
  { to: '/billing', label: 'Billing' },
];

export function AppShell({
  user,
  onLogout,
  theme,
  onToggleTheme,
  children,
}: AppShellProps) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${isOpen ? 'is-open' : ''}`}>
        <div className="app-logo-wrap">
          <div className="app-logo-mark">AI</div>
          <div>
            <p className="app-logo-title">AI Code Reviewer</p>
            <span className="pill">PR Intelligence</span>
          </div>
        </div>

        <nav className="app-nav">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={`${item.label}-${item.to}`}
                to={item.to}
                className={`app-nav-link ${active ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar-bottom">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <div className="app-user-row">
            {user?.avatarUrl ? (
              <img className="app-avatar" src={user.avatarUrl} alt={user.username || 'User'} />
            ) : (
              <div className="app-avatar app-avatar-fallback">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="app-user-name">{user?.username || 'GitHub User'}</p>
              <p className="text-secondary">{user?.plan?.toUpperCase() || 'FREE'}</p>
            </div>
          </div>
          {onLogout && (
            <button type="button" className="btn btn-outline" onClick={onLogout}>
              Sign out
            </button>
          )}
        </div>
      </aside>

      <div className="app-main-wrap">
        <header className="app-mobile-header">
          <button type="button" className="btn btn-outline" onClick={() => setIsOpen((p) => !p)}>
            Menu
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </header>
        <main className="app-main-content">{children}</main>
      </div>
    </div>
  );
}

