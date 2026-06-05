'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getReportHistory, getBanksMccRef } from '@/lib/firestore';
import styles from './overview.module.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [currentMonth, setCurrentMonth] = useState('...');
  const [latestReport, setLatestReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const [systemBanksCount, setSystemBanksCount] = useState(0);

  const showNotification = (message, type = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  useEffect(() => {
    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
    ];
    setCurrentMonth(monthNames[new Date().getMonth()]);
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchProfileAndReport = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setProfile(snap.data());
        } else {
          setProfile({});
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setProfile({});
      }

      setLoadingReport(true);
      try {
        const historyRes = await getReportHistory(user.uid);
        if (historyRes.success && historyRes.data && historyRes.data.length > 0) {
          setLatestReport(historyRes.data[0]);
        }
      } catch (err) {
        console.error('Error fetching report history on dashboard:', err);
      }
      setLoadingReport(false);

      // Загрузка количества системных банков
      try {
        const sysRes = await getBanksMccRef();
        if (sysRes.success && sysRes.data) {
          setSystemBanksCount(sysRes.data.length);
        }
      } catch (err) {
        console.error('Error fetching system banks count:', err);
      }
    };

    fetchProfileAndReport();
  }, [user]);

  const getGroups = (report) => {
    if (!report) return {};
    const userBanks = report.userBanks || [];
    const recommendation = report.recommendation || {};
    const groups = {};
    
    userBanks.forEach(card => {
      const bankKey = card.name;
      if (!groups[bankKey]) {
        groups[bankKey] = [];
      }
      
      const cardRec = recommendation[card.id] || {};
      let selectedCategories = [];
      
      const activeSelection = report.userOverrides?.[card.id] || [];
      if (activeSelection.length > 0) {
        selectedCategories = activeSelection.map(name => {
          const available = (report.availableCategories || {})[card.id] || [];
          const found = available.find(a => a.name === name);
          return { name, percent: found ? found.percent : 1 };
        });
      } else if (cardRec.offers && cardRec.offers.length > 0) {
        selectedCategories = cardRec.offers;
      } else if (cardRec.selected && cardRec.selected.length > 0) {
        selectedCategories = cardRec.selected.map(name => {
          const available = (report.availableCategories || {})[card.id] || [];
          const found = available.find(a => a.name === name);
          return { name, percent: found ? found.percent : 1 };
        });
      }
      
      groups[bankKey].push({
        cardId: card.id,
        customName: card.customName || card.name,
        logo: card.logo || '🏦',
        color: card.color || '#3b82f6',
        categories: selectedCategories
      });
    });
    return groups;
  };


  const generateReportHtml = (report) => {
    const groups = getGroups(report);
    let html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 12px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 480px; margin: 0 auto;">`;
    html += `<h3 style="margin: 0 0 12px 0; font-size: 15px; color: #1e293b; text-align: center; font-weight: 700;">Отчет по кешбэку за ${report.monthName}</h3>`;
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 12px;">`;
    html += `<thead><tr style="border-bottom: 2px solid #e2e8f0; color: #64748b;"><th style="padding: 6px 4px; text-align: left; font-weight: 600;">Банк</th><th style="padding: 6px 4px; text-align: left; font-weight: 600;">Карта и Категории</th></tr></thead><tbody>`;
    
    Object.entries(groups).forEach(([bankName, cards]) => {
      cards.forEach((card, idx) => {
        const cardName = card.customName || "Основная карта";
        const categoriesText = card.categories && card.categories.length > 0 
          ? card.categories.map(cat => `<span style="background: #eff6ff; color: #1d4ed8; padding: 2px 5px; border-radius: 4px; font-size: 10.5px; font-weight: 600; display: inline-block; margin: 2px 1px;">${cat.percent}% ${cat.name}</span>`).join(' ')
          : `<span style="color: #94a3b8; font-size: 10.5px;">Нет категорий</span>`;
        
        html += `<tr style="border-bottom: 1px solid #f1f5f9;">`;
        if (idx === 0) {
          html += `<td rowspan="${cards.length}" style="padding: 8px 4px; font-weight: 700; color: #0f172a; vertical-align: top; width: 35%;">${card.logo} ${bankName}</td>`;
        }
        html += `<td style="padding: 8px 4px;"><div style="font-weight: 600; color: #334155; margin-bottom: 3px; font-size: 11.5px;">💳 ${cardName}</div><div>${categoriesText}</div></td>`;
        html += `</tr>`;
      });
    });
    
    html += `</tbody></table></div>`;
    return html;
  };

  const handleImportToGlide = (report) => {
    if (!report) return;

    const html = generateReportHtml(report);

    // Копируем готовый HTML-код в буфер обмена
    navigator.clipboard.writeText(html)
      .then(() => {
        showNotification('HTML-код отчета скопирован! 📋 Вставьте его в Rich Text в Glide.', 'success');
      })
      .catch(err => {
        showNotification('Ошибка копирования: ' + err.message, 'error');
      });
  };

  if (!user || !profile) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
      </div>
    );
  }

  const displayName =
    profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Пользователь';

  const banksCount = profile?.banks?.length || 0;

  return (
    <div className={styles.overview}>


      {/* Stats */}
      <div className={profile?.isAdmin ? styles.statsGridAdmin : styles.statsGrid}>
        {/* Статус */}
        <div className={styles.statCard}>
          <span className={styles.statIcon}>✅</span>
          <div className={styles.statValue}>{banksCount > 0 ? 'Активен' : 'Ожидание'}</div>
          <div className={styles.statLabel}>Статус выбора</div>
        </div>

        {/* Карты */}
        <Link href="/dashboard/banks" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <span className={styles.statIcon}>💳</span>
          <div className={styles.statValue}>{banksCount}</div>
          <div className={styles.statLabel}>Количество карт</div>
        </Link>

        {/* Количество банков (Админка) */}
        {profile?.isAdmin && (
          <Link href="/dashboard/admin" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
            <span className={styles.statIcon}>🏦</span>
            <div className={styles.statValue}>{systemBanksCount}</div>
            <div className={styles.statLabel}>Количество банков</div>
          </Link>
        )}

        {/* Отчет */}
        <Link href="/dashboard/report" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <span className={styles.statIcon}>📅</span>
          <div className={styles.statValue}>{currentMonth}</div>
          <div className={styles.statLabel}>Посмотреть отчёт</div>
        </Link>

        {/* История */}
        <Link href="/dashboard/history" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <span className={styles.statIcon}>📜</span>
          <div className={styles.statValue} style={{ fontSize: '1.5rem', marginBottom: '4px' }}>История</div>
          <div className={styles.statLabel}>Предыдущие отчеты</div>
        </Link>
      </div>

      {/* Quick Actions */}
      <h2 className={styles.sectionTitle}>Быстрые действия</h2>
      <div className={styles.quickActions}>
        <Link
          href="/dashboard/analyze"
          className={styles.actionCard}
          id="quick-action-analyze"
        >
          <span className={styles.actionIcon}>📸</span>
          <div className={styles.actionContent}>
            <div className={styles.actionTitle}>Загрузить скриншоты</div>
            <div className={styles.actionDesc}>
              Сфотографируйте категории кешбэка в приложении банка — AI всё распознает
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/chat"
          className={styles.actionCard}
          id="quick-action-chat"
        >
          <span className={styles.actionIcon}>💬</span>
          <div className={styles.actionContent}>
            <div className={styles.actionTitle}>Открыть чат</div>
            <div className={styles.actionDesc}>
              Задайте вопрос AI-ассистенту о ваших картах и кешбэке
            </div>
          </div>
        </Link>
      </div>

      {/* Monthly Summary */}
      <div className={styles.summaryCard}>
        {loadingReport ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
            <div className="spinner"></div>
          </div>
        ) : latestReport ? (
          <div>
            <div className={styles.summaryHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 className={styles.summaryTitle} style={{ margin: 0 }}>📋 Отчёт за {latestReport.monthName}</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Создан: {new Date(latestReport.createdAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleImportToGlide(latestReport)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    title="Скопировать HTML-код отчета для вставки в Rich Text компонент Glide"
                  >
                    📋 Копировать для Glide
                  </button>
                <input
                  type="text"
                  className="input"
                  placeholder="🔍 Поиск по банкам, картам или категориям..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ maxWidth: '300px', width: '100%', padding: '6px 10px', fontSize: '12px' }}
                />
              </div>
            </div>

            {(() => {
              const groups = getGroups(latestReport);
              const query = searchQuery.toLowerCase().trim();
              const filteredGroups = {};
              
              Object.entries(groups).forEach(([bankName, cards]) => {
                const matchBank = bankName.toLowerCase().includes(query);
                const matchCardOrCategory = cards.some(card => {
                  const matchCardName = card.customName.toLowerCase().includes(query);
                  const matchCategory = card.categories.some(cat => cat.name.toLowerCase().includes(query));
                  return matchCardName || matchCategory;
                });
                
                if (!query || matchBank || matchCardOrCategory) {
                  filteredGroups[bankName] = cards;
                }
              });

              const maxCardsCount = Math.max(...Object.values(groups).map(g => g.length), 1);

              return (
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '12px' }}>
                  <table className={styles.reportTable}>
                    <tbody>
                      {Object.entries(filteredGroups).map(([bankName, cards], rowIdx) => (
                        <tr key={rowIdx}>
                          <td style={{ verticalAlign: 'middle', background: 'var(--bg-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                              <span style={{ fontSize: '20px' }}>{cards[0]?.logo}</span>
                              <span>{bankName}</span>
                            </div>
                          </td>
                          {Array.from({ length: maxCardsCount }).map((_, colIdx) => {
                            const card = cards[colIdx];
                            if (!card) {
                              return <td key={colIdx} style={{ background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle' }}>—</td>;
                            }
                            return (
                              <td key={colIdx} style={{ verticalAlign: 'top', borderLeft: `4px solid ${card.color}` }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)', fontSize: '13px' }}>
                                  {card.customName}
                                </div>
                                {card.categories && card.categories.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {card.categories.map((cat, catIdx) => (
                                      <div key={catIdx} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', gap: '16px', borderBottom: '1px dashed var(--divider-color)', paddingBottom: '2px' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{cat.name}</span>
                                        <strong style={{ color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{cat.percent}%</strong>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Нет выбранных категорий</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {Object.keys(filteredGroups).length === 0 && (
                        <tr>
                          <td colSpan={maxCardsCount + 1} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                            Ничего не найдено по вашему запросу.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        ) : (
          <div>
            <div className={styles.summaryHeader}>
              <h3 className={styles.summaryTitle}>📋 Сводка за {currentMonth}</h3>
              {banksCount > 0 && (
                <span className={styles.summaryBadge}>
                  {banksCount} {banksCount === 1 ? 'банк' : banksCount < 5 ? 'банка' : 'банков'}
                </span>
              )}
            </div>
            <div className={styles.summaryEmpty}>
              <span className={styles.summaryEmptyIcon}>📭</span>
              <p>
                Пока нет данных. Добавьте банки и загрузите скриншоты
                категорий, чтобы увидеть сводку.
              </p>
            </div>
          </div>
        )}
      </div>
      {toast.visible && (
        <div 
          className={`toast toast-${toast.type}`} 
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 20px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderLeft: toast.type === 'error' ? '4px solid #ef4444' : toast.type === 'success' ? '4px solid #10b981' : '4px solid #3b82f6',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            zIndex: 9999,
            animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            maxWidth: '90%',
            width: 'max-content'
          }}
        >
          {toast.type === 'error' && <span style={{ fontSize: '16px' }}>⚠️</span>}
          {toast.type === 'success' && <span style={{ fontSize: '16px' }}>✅</span>}
          <span style={{ 
            color: '#1e293b', 
            fontSize: '13px', 
            fontWeight: '600',
            whiteSpace: 'normal',
            lineHeight: '1.4'
          }}>
            {toast.message}
          </span>
        </div>
      )}
    </div>
  );
}
