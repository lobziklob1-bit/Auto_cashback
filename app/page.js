'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import styles from './page.module.css';

const features = [
  {
    icon: '📸',
    title: 'AI-анализ скриншотов',
    desc: 'Загрузите скриншоты категорий кешбэка — AI распознает и систематизирует все данные автоматически.',
  },
  {
    icon: '📊',
    title: 'Оптимальное распределение',
    desc: 'Алгоритм подберёт лучшую карту для каждой категории покупок, чтобы максимизировать ваш кешбэк.',
  },
  {
    icon: '💬',
    title: 'Умный помощник',
    desc: 'Чат с AI-ассистентом ответит на любые вопросы о ваших картах и поможет выбрать лучшую стратегию.',
  },
];

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading || !mounted) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  if (user) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  return (
    <div className={styles.landing}>
      {/* Animated background shapes */}
      <div className={styles.bgShapes}>
        <div className={`${styles.shape} ${styles.shape1}`} />
        <div className={`${styles.shape} ${styles.shape2}`} />
        <div className={`${styles.shape} ${styles.shape3}`} />
        <div className={`${styles.shape} ${styles.shape4}`} />
        <div className={`${styles.shape} ${styles.shape5}`} />
      </div>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.heroEmoji}>💰</span>
          <h1 className={styles.heroTitle}>Авто Кешбэк</h1>
          <p className={styles.heroSubtitle}>
            Оптимизируй кешбэк во всех банках с помощью AI.
            Загрузи скриншоты — получи идеальный план покупок.
          </p>
          <div className={styles.heroCta}>
            <Link href="/auth/login" className="btn btn-primary" id="cta-login">
              Войти
            </Link>
            <Link href="/auth/register" className="btn btn-secondary" id="cta-register">
              Зарегистрироваться
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features}>
        <h2 className={styles.featuresTitle}>Как это работает?</h2>
        <p className={styles.featuresSubtitle}>
          Три простых шага к максимальному кешбэку
        </p>
        <div className={styles.featuresGrid}>
          {features.map((feature, index) => (
            <div className={styles.featureCard} key={index}>
              <span className={styles.featureIcon}>{feature.icon}</span>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDesc}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>© 2025 Авто Кешбэк. Все права защищены.</p>
      </footer>
    </div>
  );
}
