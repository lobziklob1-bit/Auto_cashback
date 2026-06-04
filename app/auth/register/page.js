'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import styles from './register.module.css';

function getPasswordStrength(password) {
  if (!password) return { level: 0, label: '' };

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: 'Слабый', cls: 'Weak' };
  if (score === 2) return { level: 2, label: 'Средний', cls: 'Medium' };
  if (score === 3) return { level: 3, label: 'Хороший', cls: 'Good' };
  return { level: 4, label: 'Надёжный', cls: 'Strong' };
}

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Пожалуйста, заполните все поля.');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await register(email.trim(), password);
      
      if (!result.success) {
        setError(result.error || 'Ошибка регистрации. Попробуйте снова.');
        setSubmitting(false);
        return;
      }

      const uid = result.user.uid;

      // Create user profile in Firestore
      await setDoc(doc(db, 'users', uid), {
        displayName: displayName.trim(),
        email: email.trim(),
        createdAt: serverTimestamp(),
        banks: [],
        settings: {
          notifications: true,
        },
      });

      router.replace('/dashboard');
    } catch (err) {
      console.error('Registration processing error:', err);
      setError('Ошибка сохранения профиля пользователя. Попробуйте снова.');
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
          <span className={styles.authEmoji}>🚀</span>
          <h1 className={styles.authTitle}>Создать аккаунт</h1>
          <p className={styles.authSubtitle}>
            Начните оптимизировать кешбэк уже сегодня
          </p>
        </div>

        <form className={styles.authForm} onSubmit={handleSubmit} noValidate>
          {error && (
            <div className={styles.errorMsg} role="alert" id="register-error">
              {error}
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="register-name">Имя</label>
            <input
              id="register-name"
              type="text"
              placeholder="Ваше имя"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              disabled={submitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={submitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="register-password">Пароль</label>
            <input
              id="register-password"
              type="password"
              placeholder="Минимум 6 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
            />
            {password && (
              <>
                <div
                  className={`${styles.strengthBar} ${
                    strength.cls ? styles[`strength${strength.cls}`] : ''
                  }`}
                >
                  {[1, 2, 3, 4].map((seg) => (
                    <div
                      key={seg}
                      className={`${styles.strengthSegment} ${
                        seg <= strength.level ? styles.active : ''
                      }`}
                    />
                  ))}
                </div>
                <span
                  className={`${styles.strengthLabel} ${
                    strength.cls
                      ? styles[`strengthLabel${strength.cls}`]
                      : ''
                  }`}
                >
                  {strength.label}
                </span>
              </>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="register-confirm-password">Подтвердите пароль</label>
            <input
              id="register-confirm-password"
              type="password"
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={submitting}
            id="register-submit"
          >
            {submitting ? (
              <>
                <span className={styles.btnSpinner} />
                Регистрация...
              </>
            ) : (
              'Создать аккаунт'
            )}
          </button>
        </form>

        <div className={styles.authFooter}>
          <p>
            Уже есть аккаунт?{' '}
            <Link href="/auth/login" id="goto-login">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
