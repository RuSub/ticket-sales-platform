import { Outlet, Link, useNavigate } from 'react-router-dom';
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
            {isAuthenticated ? (
              <>
                <Link to="/">События</Link>
                <Link to="/cart">Корзина</Link>
                <Link to="/profile">Профиль</Link>
                <button className="btn-logout" onClick={handleLogout}>
                  Выйти
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Войти</Link>
                <Link to="/register">Регистрация</Link>
              </>
            )}
          </nav>

          {user && (
            <div className="user-badge">
              {user.fullName || user.email}
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
