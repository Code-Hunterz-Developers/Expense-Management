'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import Header from '@/components/Header';
import { auth } from '@/lib/firebase/client';
import { api } from '@/lib/client-api';

export default function AppLayout({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Admin',
          role: 'admin',
        });
      } else {
        setUser(null);
        router.replace('/login');
      }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  async function handleLogout() {
    await api.logout();
    router.replace('/login');
  }

  const page = pathname.split('/').filter(Boolean)[0] || 'dashboard';

  if (loading) {
    return (
      <div className="auth-loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="app-layout">
      <Header
        page={page}
        onNavigate={(id) => router.push(`/${id}`)}
        user={user}
        onLogout={handleLogout}
      />
      <main className="main-content">{children}</main>
    </div>
  );
}
