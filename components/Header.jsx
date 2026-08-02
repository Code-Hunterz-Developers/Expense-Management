import { useState } from 'react';
import { IconDashboard, IconTransactions, IconAccounts, IconReports, IconBell, IconMenu, IconClose } from './Icons';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { id: 'transactions', label: 'Transactions', Icon: IconTransactions },
  { id: 'accounts', label: 'Upwork IDs', Icon: IconAccounts },
  { id: 'reports', label: 'Reports', Icon: IconReports },
];

export default function Header({ page, onNavigate, user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(id) {
    onNavigate(id);
    setMenuOpen(false);
  }

  return (
    <header className="top-header">
      <div className="header-inner">
        <div className="header-left">
          <button type="button" className="header-brand" onClick={() => navigate('dashboard')}>
            <span className="header-logo">
              <img src="/logo.png" alt="Code Hunterz" />
            </span>
            <span className="header-brand-text">Expense Manager</span>
          </button>

          <nav className={`header-nav ${menuOpen ? 'open' : ''}`}>
            {NAV.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`header-nav-item ${page === id ? 'active' : ''}`}
                onClick={() => navigate(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <button type="button" className="header-icon-btn" aria-label="Notifications">
            <IconBell size={18} />
          </button>

          <div className="header-user">
            <div className="header-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'A'}</div>
            <div className="header-user-info">
              <span className="header-user-name">{user?.name || 'Admin'}</span>
              <span className="header-user-role">{user?.role || 'admin'}</span>
            </div>
          </div>

          <button type="button" className="btn btn-secondary btn-sm header-logout" onClick={onLogout}>
            Logout
          </button>

          <button
            type="button"
            className="header-menu-toggle"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>
    </header>
  );
}
