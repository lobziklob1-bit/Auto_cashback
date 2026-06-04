'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import styles from './dashboard.module.css';

export default function DashboardLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setProfile(snap.data());
        }
      } catch (err) {
        console.error('Error layout profile:', err);
      }
    };

    fetchProfile();
  }, [user]);

  if (loading || !user) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  const handleMakeAdmin = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        isAdmin: true,
        updatedAt: new Date().toISOString()
      });
      setProfile(prev => ({ ...prev, isAdmin: true }));
      alert('Успешно! Вам предоставлены права Администратора.');
    } catch (err) {
      console.error('Make admin error:', err);
      alert('Ошибка при получении прав.');
    }
  };

  const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Пользователь';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/auth/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className={styles.dashboardLayout}>
      <div className={styles.layoutWrapper}>
        {/* Top Sticky Header */}
        <header className={styles.topHeader}>
          <div className={styles.headerLeft}>
            <Link href="/dashboard" className={styles.logo} id="header-logo">
              <span className={styles.logoIcon}>💰</span>
              <span className={styles.logoText}>Авто Кешбэк</span>
            </Link>
            {pathname !== '/dashboard' && (
              <Link href="/dashboard" className={styles.backLink}>
                ← На главную
              </Link>
            )}
          </div>
          
          <div className={styles.headerRight}>
            <div className={styles.userInfo}>
              <div className={styles.userAvatar}>{avatarLetter}</div>
              <span className={styles.userName}>{displayName}</span>
            </div>
            


            {!profile?.isAdmin && (
              <button
                onClick={handleMakeAdmin}
                style={{
                  border: 'none',
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#3b82f6',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                id="header-make-admin"
              >
                🔑 Админ
              </button>
            )}

            <button
              className={styles.logoutHeaderBtn}
              onClick={handleLogout}
              id="header-logout"
            >
              🚪 Выйти
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className={styles.mainContentFull}>
          {children}
        </main>
      </div>
    </div>
  );
}
