'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import styles from './login.module.css';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Пожалуйста, заполните все поля.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      const code = err?.code;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Неверный email или пароль.');
      } else if (code === 'auth/too-many-requests') {
        setError('Слишком много попыток. Попробуйте позже.');
      } else if (code === 'auth/invalid-email') {
        setError('Некорректный email адрес.');
      } else {
        setError('Ошибка входа. Попробуйте снова.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.authPage}>
        <div className={styles.authBg} />
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className={styles.authPage}>
      {/* Animated background */}
      <div className={styles.authBg}>
        <div className={`${styles.bgOrb} ${styles.bgOrb1}`} />
        <div className={`${styles.bgOrb} ${styles.bgOrb2}`} />
        <div className={`${styles.bgOrb} ${styles.bgOrb3}`} />
      </div>

      <Link href="/" className={styles.backLink} id="back-to-home">
        ← На главную
      </Link>

      <div className={styles.authCard}>
        <div className={styles.authHeader}>
          <span className={styles.authEmoji}>🔐</span>
          <h1 className={styles.authTitle}>Вход в аккаунт</h1>
          <p className={styles.authSubtitle}>
            Рады видеть вас снова
          </p>
        </div>

        <form className={styles.authForm} onSubmit={handleSubmit} noValidate>
          {error && (
            <div className={styles.errorMsg} role="alert" id="login-error">
              {error}
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={submitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="login-password">Пароль</label>
            <input
              id="login-password"
              type="password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={submitting}
            id="login-submit"
          >
            {submitting ? (
              <>
                <span className={styles.btnSpinner} />
                Вход...
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>

        <div className={styles.authFooter}>
          <p>
            Нет аккаунта?{' '}
            <Link href="/auth/register" id="goto-register">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
