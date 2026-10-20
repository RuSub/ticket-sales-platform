import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import '../styles/layout.css';

export function Layout() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="logo">
            🎫 Ticket Platform
          </Link>

          <nav className="nav-links">
            <Link to="/">События</Link>
            {isAuthenticated && <Link to="/cart">Корзина</Link>}
            {isAuthenticated && <Link to="/profile">Профиль</Link>}
          </nav>

          {isAuthenticated ? (
            <div className="header-user">
              <span className="user-badge">{user?.fullName || user?.email || 'Аккаунт'}</span>
              <button className="btn-logout" onClick={handleLogout}>
                Выйти
              </button>
            </div>
          ) : (
            <div className="header-user">
              <Link className="nav-link-button" to="/login">
                Войти
              </Link>
              <Link className="nav-link-button primary" to="/register">
                Регистрация
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <p>© 2026 Ticket Platform</p>
      </footer>
    </div>
  );
}
