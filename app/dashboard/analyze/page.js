'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getUserProfile, saveMonthlyReport, getBanksMccRef } from '@/lib/firestore';
import { analyzeScreenshot } from '@/lib/ai';
import { optimizeCashback } from '@/lib/analyzer';
import { MCC_CATEGORIES } from '@/lib/constants';
import styles from './analyze.module.css';

export default function AnalyzePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [userBanks, setUserBanks] = useState([]);
  const [banksMccRef, setBanksMccRef] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzingBankId, setAnalyzingBankId] = useState(null);
  
  // Хранит распознанные предложения по каждому банку: { bankId: [ { name, percent } ] }
  const [bankOffers, setBankOffers] = useState({});
  // Хранит ошибки или статусы загрузки
  const [uploadStatuses, setUploadStatuses] = useState({});
  const [saving, setSaving] = useState(false);

  // Получаем текущий месяц
  const getCurrentYearMonth = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  };

  const currentMonthName = new Date().toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

  // Загрузка банков пользователя и справочника MCC
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      
      // Загружаем профиль
      const res = await getUserProfile(user.uid);
      if (res.success && res.data) {
        const banksList = res.data.banks || [];
        banksList.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        setUserBanks(banksList);

        // Инициализируем пустые списки категорий для каждого банка
        const initialOffers = {};
        banksList.forEach(bank => {
          initialOffers[bank.id] = bank.categories || [];
        });
        setBankOffers(initialOffers);
      }

      // Загружаем динамический справочник MCC
      try {
        const refRes = await getBanksMccRef();
        if (refRes.success) {
          setBanksMccRef(refRes.data);
        }
      } catch (err) {
        console.error('Error loading MCC reference:', err);
      }

      setLoading(false);
    }
    loadData();
  }, [user]);


  // Обработка загрузки файла
  const handleFileUpload = async (bankId, file, event) => {
    if (!file) return;

    setAnalyzingBankId(bankId);
    setUploadStatuses(prev => ({ ...prev, [bankId]: { status: 'loading', message: 'ИИ распознает скриншот...' } }));

    const bank = userBanks.find(b => b.id === bankId);
    const bankName = bank ? bank.name : '';

    // Находим оригинальные категории банка из справочника
    const refBank = banksMccRef.find(b => b.id === (bank?.bankRefId || bankId));
    const bankCategoriesList = refBank?.categories ? Object.keys(refBank.categories) : [];

    const res = await analyzeScreenshot(file, bankName, bankCategoriesList);

    if (res.success && res.data) {
      // Добавляем новые категории к существующим без дублирования названий
      setBankOffers(prev => {
        const currentOffers = prev[bankId] || [];
        const newOffers = res.data.categories || [];
        const combined = [...currentOffers];
        
        newOffers.forEach(newCat => {
          const exists = combined.some(c => c.name.toLowerCase().trim() === newCat.name.toLowerCase().trim());
          if (!exists) {
            combined.push(newCat);
          }
        });
        return { ...prev, [bankId]: combined };
      });

      setUploadStatuses(prev => ({ 
        ...prev, 
        [bankId]: { 
          status: 'success', 
          message: 'Скриншот успешно распознан и добавлен в общий список!' 
        } 
      }));
    } else {
      setUploadStatuses(prev => ({ 
        ...prev, 
        [bankId]: { status: 'error', message: res.error || 'Не удалось распознать скриншот' } 
      }));
    }
    setAnalyzingBankId(null);
    if (event && event.target) {
      event.target.value = ''; // Сбрасываем значение инпута, чтобы повторная загрузка того же файла вызывала onChange
    }
  };

  // Ручное редактирование категории (процент)
  const handlePercentChange = (bankId, catIndex, newPercent) => {
    const percent = parseFloat(newPercent) || 0;
    setBankOffers(prev => {
      const updated = [...(prev[bankId] || [])];
      updated[catIndex] = { ...updated[catIndex], percent };
      return { ...prev, [bankId]: updated };
    });
  };

  // Удаление категории
  const handleRemoveCategory = (bankId, catIndex) => {
    setBankOffers(prev => {
      const updated = (prev[bankId] || []).filter((_, idx) => idx !== catIndex);
      return { ...prev, [bankId]: updated };
    });
  };

  // Добавление пустой категории вручную
  const handleAddManualCategory = (bankId) => {
    const bank = userBanks.find(b => b.id === bankId);
    const refBank = banksMccRef.find(b => b.id === (bank?.bankRefId || bankId));
    const bankCategories = refBank?.categories ? Object.keys(refBank.categories) : Object.keys(MCC_CATEGORIES);
    
    const defaultCategory = bankCategories[0] || 'На всё (все покупки)';
    const newCat = { name: defaultCategory, percent: 5 };
    
    setBankOffers(prev => {
      const current = prev[bankId] || [];
      if (current.some(c => c.name === defaultCategory)) {
        // Ищем первую не занятую категорию
        const freeCat = bankCategories.find(name => !current.some(c => c.name === name));
        if (freeCat) newCat.name = freeCat;
      }
      return { ...prev, [bankId]: [...current, newCat] };
    });
  };

  // Изменение названия категории вручную
  const handleCategoryNameChange = (bankId, catIndex, newName) => {
    setBankOffers(prev => {
      const updated = [...(prev[bankId] || [])];
      updated[catIndex] = { ...updated[catIndex], name: newName };
      return { ...prev, [bankId]: updated };
    });
  };

  // Изменение описания категории вручную
  const handleDescriptionChange = (bankId, catIndex, newDescription) => {
    setBankOffers(prev => {
      const updated = [...(prev[bankId] || [])];
      updated[catIndex] = { ...updated[catIndex], description: newDescription };
      return { ...prev, [bankId]: updated };
    });
  };

  // Запуск оптимизации и сохранение
  const handleCalculateRecommendations = async () => {
    // Проверяем, что хотя бы для одного банка добавлены категории
    const hasAnyCategories = Object.values(bankOffers).some(cats => cats.length > 0);
    if (!hasAnyCategories) {
      alert('Добавьте хотя бы одну категорию кешбэка в один из банков!');
      return;
    }

    setSaving(true);
    const yearMonth = getCurrentYearMonth();

    // Запускаем наш оптимизационный алгоритм с поддержкой ИИ-базы MCC
    const optimizationResult = optimizeCashback(userBanks, bankOffers, banksMccRef, []);


    const reportData = {
      month: yearMonth,
      monthName: currentMonthName,
      status: 'analyzed',
      availableCategories: bankOffers,
      recommendation: optimizationResult.recommendation,
      summary: optimizationResult.summary,
      userBanks: userBanks,
      userConfirmed: false
    };

    // Сохраняем в Firestore
    const res = await saveMonthlyReport(user.uid, yearMonth, reportData);

    if (res.success) {
      // Перенаправляем на страницу отчета
      router.push('/dashboard/report');
    } else {
      alert('Ошибка сохранения отчета: ' + res.error);
    }
    setSaving(false);
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
        <div>
          <h1 className={styles.title}>Помощник в выборе кешбэков 📸</h1>
          <p className={styles.subtitle}>
            Загрузите скриншоты предложений на <strong>{currentMonthName}</strong> или заполните категории вручную.
          </p>
        </div>
      </div>

      {userBanks.length === 0 ? (
        <div className="card text-center" style={{ padding: '48px 24px', marginTop: '24px' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🏦</span>
          <h3>У вас не настроены банки</h3>
          <p style={{ margin: '8px 0 24px' }}>
            Прежде чем анализировать кешбэк, добавьте хотя бы один банк в личном кабинете.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => router.push('/dashboard/banks')}
          >
            Перейти к настройке банков
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          <div className={styles.cardsSection}>
            {userBanks.map((bank) => {
              const offers = bankOffers[bank.id] || [];
              const status = uploadStatuses[bank.id];
              const refBank = banksMccRef.find(b => b.id === (bank.bankRefId || bank.id));
              const isRefBankEmpty = !refBank || !refBank.categories || Object.keys(refBank.categories).length === 0;

              return (
                <div key={bank.id} className="card" style={{ borderLeft: `6px solid ${bank.color}`, marginBottom: '24px' }}>
                  <div className={styles.bankHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '28px' }}>{bank.logo}</span>
                      <h3 style={{ margin: 0 }}>
                        {bank.name} {bank.customName ? `(${bank.customName})` : ''}
                      </h3>
                    </div>
                    <div className="badge badge-neutral">Приоритет {bank.priority + 1}</div>
                  </div>

                  {isRefBankEmpty ? (
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      padding: '32px 16px',
                      borderRadius: '12px',
                      backgroundColor: '#f8fafc',
                      border: '2px dashed #cbd5e1',
                      textAlign: 'center',
                      marginBottom: '16px'
                    }}>
                      <span style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</span>
                      <strong style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Банк ещё не добавлен в справочник</strong>
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '6px 0 0', maxWidth: '320px', lineHeight: '1.4' }}>
                        Администратор приложения ещё не заполнил MCC-справочник для <strong>{bank.name}</strong>. Анализ скриншотов и оптимизация временно недоступны.
                      </p>
                    </div>
                  ) : (
                    /* Drag & Drop зона для скриншота */
                    <div className={styles.uploadArea}>
                      <input
                        type="file"
                        id={`file-${bank.id}`}
                        accept="image/*"
                        className={styles.fileInput}
                        onChange={(e) => handleFileUpload(bank.id, e.target.files[0], e)}
                        disabled={analyzingBankId !== null}
                      />
                      <label htmlFor={`file-${bank.id}`} className={styles.uploadLabel}>
                        <span>📸</span>
                        <strong>Загрузить скриншот категорий</strong>
                        <span className={styles.uploadSub}>или перетащите файл сюда</span>
                      </label>
                    </div>
                  )}

                  {status && (
                    <div 
                      className={`badge ${
                        status.status === 'loading' ? 'badge-primary' : 
                        status.status === 'success' ? 'badge-success' : 'badge-error'
                      }`}
                      style={{ 
                        marginTop: '12px', 
                        width: '100%', 
                        padding: '10px 16px', 
                        justifyContent: 'center', 
                        borderRadius: '8px',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        textAlign: 'center',
                        lineHeight: '1.4'
                      }}
                    >
                      {status.status === 'loading' && <span className="spinner spinner-sm" style={{ marginRight: '8px' }}></span>}
                      {status.message}
                    </div>
                  )}

                  {/* Секция распознанных/редактируемых категорий */}
                  <div className={styles.categoriesSection}>
                    <div className={styles.categoriesHeader}>
                      <h4>Доступные предложения ({offers.length}):</h4>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {offers.length > 0 && (
                          <button 
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--color-error)' }}
                            onClick={() => {
                              setBankOffers(prev => ({ ...prev, [bank.id]: [] }));
                              setUploadStatuses(prev => ({ ...prev, [bank.id]: null }));
                            }}
                          >
                            🗑️ Очистить список
                          </button>
                        )}
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleAddManualCategory(bank.id)}
                          disabled={isRefBankEmpty}
                        >
                          ➕ Добавить вручную
                        </button>
                      </div>
                    </div>

                    {offers.length === 0 ? (
                      <p className={styles.emptyText}>Категории не загружены. Загрузите скриншот или введите вручную.</p>
                    ) : (
                      <div className={styles.categoryList}>
                        {offers.map((cat, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'var(--divider-color)', padding: '6px 10px', borderRadius: '12px', marginBottom: '4px' }}>
                            <div className={styles.categoryRow} style={{ margin: 0, padding: 0, background: 'transparent' }}>
                              <input
                                type="text"
                                className="input"
                                style={{ flex: 2, padding: '6px', fontSize: '12px' }}
                                value={cat.name}
                                placeholder="Название категории"
                                onChange={(e) => handleCategoryNameChange(bank.id, idx, e.target.value)}
                              />

                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                                <input
                                  type="number"
                                  className="input"
                                  style={{ padding: '6px', textAlign: 'center', fontSize: '12px' }}
                                  value={cat.percent}
                                  min="0.5"
                                  max="100"
                                  step="0.5"
                                  onChange={(e) => handlePercentChange(bank.id, idx, e.target.value)}
                                />
                                <span style={{ fontWeight: '600', fontSize: '12px' }}>%</span>
                              </div>

                              <button 
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--color-error)' }}
                                onClick={() => handleRemoveCategory(bank.id, idx)}
                              >
                                ✕
                              </button>
                            </div>
                            <input
                              type="text"
                              className="input"
                              style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--text-secondary)', width: '100%', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: '#ffffff' }}
                              value={cat.description || ''}
                              placeholder="Пояснение (например: только в приложении, на тарифы Комфорт)..."
                              onChange={(e) => handleDescriptionChange(bank.id, idx, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Панель управления и запуска расчета */}
          <div className={styles.sidebar}>
            <div className="card card-glass" style={{ position: 'sticky', top: '24px' }}>
              <h3>Запуск ИИ-оптимизации 🚀</h3>
              <p style={{ margin: '12px 0 20px', fontSize: '14px' }}>
                После того как вы загрузили скриншоты или ввели доступные предложения для ваших банков, ИИ мгновенно распределит категории для получения максимальной выгоды.
              </p>
              
              <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>✓</span> Сопоставит повторяющиеся категории
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>✓</span> Учтет покрытие по MCC кодам
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>✓</span> Сохранит ваши личные приоритеты банков
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '14px' }}
                onClick={handleCalculateRecommendations}
                disabled={saving || analyzingBankId !== null}
              >
                {saving ? 'Считаем оптимальный выбор...' : 'Рассчитать лучший выбор ✨'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
