'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getReportHistory, deleteMonthlyReport } from '@/lib/firestore';
import styles from './history.module.css';

export default function HistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const [expandedReports, setExpandedReports] = useState({});

  const toggleReport = (reportId) => {
    setExpandedReports(prev => ({
      ...prev,
      [reportId]: !prev[reportId]
    }));
  };

  const showNotification = (message, type = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  useEffect(() => {
    async function loadHistory() {
      if (!user) return;
      setLoading(true);
      const res = await getReportHistory(user.uid);
      if (res.success && res.data) {
        setReports(res.data);
      }
      setLoading(false);
    }
    loadHistory();
  }, [user]);

  const handleDeleteHistoryReport = async (reportId, monthName) => {
    if (confirm(`Вы уверены, что хотите полностью удалить отчёт за ${monthName}? Это действие нельзя отменить.`)) {
      setLoading(true);
      try {
        const res = await deleteMonthlyReport(user.uid, reportId);
        if (res.success) {
          setReports(prev => prev.filter(r => r.id !== reportId));
        } else {
          alert('Ошибка при удалении отчёта: ' + res.error);
        }
      } catch (err) {
        alert('Произошла ошибка при удалении: ' + err.message);
      }
      setLoading(false);
    }
  };

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
          ? card.categories.map(cat => `<div style="margin: 4px 0;"><span style="background: #eff6ff; color: #1d4ed8; padding: 2px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; display: inline-block;">${cat.percent}% ${cat.name}</span></div>`).join('')
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

  // Кодирование UTF-8 строки в безопасный Base64 для URL
  const encodeBase64Url = (str) => {
    const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        i++;
        code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    let result = '';
    let i = 0;
    while (i < bytes.length) {
      const b1 = bytes[i++];
      const b2 = i < bytes.length ? bytes[i++] : NaN;
      const b3 = i < bytes.length ? bytes[i++] : NaN;
      const c1 = b1 >> 2;
      const c2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
      const c3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
      const c4 = isNaN(b3) ? 64 : b3 & 63;
      result += b64chars.charAt(c1) + b64chars.charAt(c2) +
                (c3 === 64 ? '' : b64chars.charAt(c3)) +
                (c4 === 64 ? '' : b64chars.charAt(c4));
    }
    return result;
  };

  const handleImportToGlide = (report) => {
    if (!report) return;
    const html = generateReportHtml(report);
    navigator.clipboard.writeText(html)
      .then(() => {
        showNotification('HTML-отчет скопирован в буфер обмена! 📋', 'success');
      })
      .catch(err => {
        showNotification('Ошибка копирования: ' + err.message, 'error');
      });
  };

  const handleCopyBase64ForGlide = (report) => {
    if (!report) return;

    // Сжимаем данные
    const groups = getGroups(report);
    const compressedGroups = {};
    Object.entries(groups).forEach(([bankName, cards]) => {
      compressedGroups[bankName] = cards.map(card => ({
        n: card.customName || "Основная карта",
        l: card.logo || "🏦",
        c: (card.categories || []).map(cat => ({
          p: cat.percent,
          n: cat.name
        }))
      }));
    });

    // Формируем компактный JSON-пакет данных
    const reportData = {
      m: report.monthName || "Отчет",
      g: compressedGroups
    };

    // Кодируем JSON в Base64 URL-safe
    const encodedData = encodeBase64Url(JSON.stringify(reportData));

    // Копируем сжатый код отчета в буфер обмена
    navigator.clipboard.writeText(encodedData)
      .then(() => {
        showNotification('Код для поиска скопирован! 📋 Вставьте его в Glide в поле ввода.', 'success');
      })
      .catch(err => {
        showNotification('Ошибка копирования: ' + err.message, 'error');
      });
  };

  if (loading) {
    return (
      <div className="spinner-overlay">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className={styles.title}>История 📜</h1>
            <p className={styles.subtitle}>
              Список всех ваших прошлых ежемесячных отчётов и сохраненных выборов.
            </p>
          </div>
          {reports.length > 0 && (
            <input
              type="text"
              className="input"
              placeholder="🔍 Быстрый поиск по банкам, картам или категориям..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: '400px', width: '100%', padding: '8px 12px', fontSize: '13px' }}
            />
          )}
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="card text-center" style={{ padding: '48px 24px', marginTop: '24px' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>📂</span>
          <h3>У вас пока нет сохраненных отчётов</h3>
          <p style={{ margin: '8px 0 24px' }}>
            Пройдите ИИ-анализ на странице «Анализ», чтобы получить первую рекомендацию и сохранить её в историю.
          </p>
          <button 
            className="btn btn-primary"
            onClick={() => router.push('/dashboard/analyze')}
          >
            Начать анализ кешбэков
          </button>
        </div>
      ) : (
        <div className={styles.historyList}>
          {reports.map((report) => (
            <div key={report.id} className="card" style={{ marginBottom: '20px' }}>
              <div 
                className={styles.reportHeader} 
                onClick={() => toggleReport(report.id)}
                style={{ 
                  cursor: 'pointer', 
                  userSelect: 'none',
                  borderBottom: expandedReports[report.id] ? '1px solid var(--divider-color)' : 'none',
                  paddingBottom: expandedReports[report.id] ? 'var(--space-3)' : '0',
                  marginBottom: expandedReports[report.id] ? 'var(--space-4)' : '0',
                  transition: 'all 0.2s'
                }}
              >
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      fontSize: '10px', 
                      color: 'var(--text-muted)', 
                      transition: 'transform 0.2s', 
                      display: 'inline-block', 
                      transform: expandedReports[report.id] ? 'rotate(90deg)' : 'rotate(0deg)' 
                    }}>▶</span>
                    <span>📊 Отчёт за {report.monthName}</span>
                  </h3>
                  <span className={styles.date}>Создан: {new Date(report.createdAt).toLocaleDateString('ru-RU')}</span>
                </div>
                <div className={`badge ${report.status === 'confirmed' ? 'badge-success' : 'badge-warning'}`}>
                  {report.status === 'confirmed' ? '✓ Выбор активирован' : 'Анализ завершен'}
                </div>
              </div>

              {expandedReports[report.id] && (
                <>
                  {(() => {
                    const groups = getGroups(report);
                    
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
                      <div style={{ overflowX: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
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

                  <div className={styles.footer} style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start', alignItems: 'center', width: '100%' }}>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => router.push(`/dashboard/report?month=${report.id}`)}
                    >
                      🔍 Посмотреть детали
                    </button>
                    <button 
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteHistoryReport(report.id, report.monthName)}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      🗑️ Удалить
                    </button>
                     <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => handleImportToGlide(report)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
                      title="Скопировать HTML-код отчета для вставки в Rich Text компонент Glide"
                    >
                      📋 Копировать для Glide
                    </button>
                    <button 
                      className="btn btn-sm"
                      onClick={() => handleCopyBase64ForGlide(report)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#10b981', borderColor: '#10b981', color: '#ffffff' }}
                      title="Скопировать сжатый код отчета для работы поиска по категориям в Glide"
                    >
                      🔍 Копировать код поиска (Glide)
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
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
