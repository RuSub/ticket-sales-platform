import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (!accessToken || !refreshToken) {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;
    setSession(accessToken, refreshToken)
      .then(() => {
        if (!cancelled) {
          navigate('/', { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Не удалось завершить вход через Google');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams, setSession]);

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return <div className="loading">Завершаем вход...</div>;
}
