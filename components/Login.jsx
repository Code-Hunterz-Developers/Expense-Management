import { useState } from 'react';
import { api } from '@/lib/client-api';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">
            <img src="/logo.png" alt="Code Hunterz" />
          </span>
          <div>
            <h1>Expense Manager</h1>
            <p>Upwork Sales Tracker</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="login-subtitle">Enter your credentials to access the dashboard</p>

          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@codehunterz.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading && <span className="btn-spinner" aria-hidden="true" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
