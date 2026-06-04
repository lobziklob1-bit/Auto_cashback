'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getMonthlyReport, saveActiveCategories, saveMonthlyReport, deleteMonthlyReport, getBanksMccRef, getUserProfile } from '@/lib/firestore';
import { getBankMccForCategory, optimizeCashback } from '@/lib/analyzer';
import { MCC_CATEGORIES, findCategoryByQuery } from '@/lib/constants';
import styles from './report.module.css';

export default function ReportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [banksMccRef, setBanksMccRef] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Вкладка просмотра ('banks' | 'categories') и строка поиска
  const [viewMode, setViewMode] = useState('banks');
  const [searchQuery, setSearchQuery] = useState('');

  // Состояние ручного изменения выбора категорий
  const [selectedOverrides, setSelectedOverrides] = useState({});

  // Состояние всплывающего уведомления
  const [toast, setToast] = useState({ message: '', type: '', visible: false });

  // Показ красивого уведомления (тоста) вместо стандартного alert
  const showNotification = (message, type = 'error') => {
    setToast({ message, type, visible: true });
    if (window.toastTimeout) {
      clearTimeout(window.toastTimeout);
    }
    window.toastTimeout = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 4000);
  };

  // Семантическая нормализация названий категорий для поиска скрытых дубликатов
  const getNormalizedCategoryKey = (catName) => {
    if (!catName) return '';
    const cleanName = catName.replace(/^\d+(?:[.,]\d+)?\s*%\s*/, '').trim();
    const clean = cleanName.toLowerCase().trim();
    const semanticGroup = findCategoryByQuery(clean);
    return semanticGroup ? semanticGroup : cleanName;
  };

  const getSemanticCategoryGroup = (catName) => {
    if (!catName) return 'Другое';
    const cleanName = catName.replace(/^\d+(?:[.,]\d+)?\s*%\s*/, '').trim();
    const clean = cleanName.toLowerCase().trim();
    const groupName = findCategoryByQuery(clean);
    return groupName || cleanName;
  };

  const isBrandCategory = (name) => {
    if (!name) return false;
    const cleanName = name.replace(/^\d+(?:[.,]\d+)?\s*%\s*/, '').trim();
    const clean = cleanName.toLowerCase().trim();
    
    // Не считаем уникальными Яндекс Заправки, Топливо в городе и Яндекс Такси
    if (clean.includes('заправки') || clean.includes('топливо') || clean.includes('такси')) {
      return false;
    }
    
    const generalCategories = [
      'развлечения',
      'супермаркеты',
      'продуктовые магазины',
      'продукты',
      'аптеки',
      'фармацевтика',
      'транспорт',
      'такси',
      'общественный транспорт',
      'красота',
      'салоны красоты',
      'парикмахерские',
      'одежда и обувь',
      'одежда',
      'обувь',
      'дом и ремонт',
      'мебель',
      'товары для дома',
      'товары для ремонта',
      'домашние товары',
      'спорттовары',
      'спорт',
      'путешествия',
      'авиабилеты',
      'жд билеты',
      'отели',
      'книги',
      'цветы',
      'зоотовары',
      'азс',
      'топливо',
      'рестораны',
      'кафе',
      'бары',
      'фастфуд',
      'рестораны и кафе',
      'кафе и рестораны',
      'кафе, бары и рестораны',
      'автоуслуги',
      'автосервис',
      'образование',
      'курсы',
      'обучение',
      'школа',
      'лекции',
      'репетиторы',
      'аренда авто',
      'прокат авто',
      'все остальные покупки',
      'остальные покупки',
      'на всё (все покупки)',
      'все покупки',
      'за все покупки',
      'на все покупки',
      'все покупки на кассе',
      'на всё',
      'на все'
    ];
    return !generalCategories.includes(clean);
  };

  const getCurrentYearMonth = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  };

  // Возвращает описание MCC-кода из справочника
  const getMccDescription = (mccCode) => {
    for (const [catName, catData] of Object.entries(MCC_CATEGORIES)) {
      if (catData.mcc.includes(mccCode)) {
        return `${mccCode}: ${catName} (${catData.description})`;
      }
    }
    return `${mccCode}: Код MCC`;
  };

  useEffect(() => {
    async function loadReport() {
      if (!user) return;
      setLoading(true);
      
      // Считываем параметр month из URL (проверяем на стороне клиента)
      let yearMonth = getCurrentYearMonth();
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlMonth = params.get('month');
        if (urlMonth && /^\d{4}-\d{2}$/.test(urlMonth)) {
          yearMonth = urlMonth;
        }
      }

      const res = await getMonthlyReport(user.uid, yearMonth);
      if (res.success && res.data) {
        setReport(res.data);
        
        // Заполняем оверрайды сохраненным выбором пользователя (если он есть), иначе базовыми рекомендациями
        const initialOverrides = {};
        const sourceOverrides = res.data.userOverrides || {};
        
        Object.keys(res.data.availableCategories || {}).forEach(bankId => {
          if (sourceOverrides[bankId] !== undefined) {
            initialOverrides[bankId] = sourceOverrides[bankId];
          } else {
            initialOverrides[bankId] = res.data.recommendation?.[bankId]?.selected || [];
          }
        });
        setSelectedOverrides(initialOverrides);
      } else {
        setReport(null);
      }

      // Загружаем справочник MCC
      try {
        const refRes = await getBanksMccRef();
        if (refRes.success) {
          setBanksMccRef(refRes.data);
        }
      } catch (err) {
        console.error('Error loading MCC reference in report:', err);
      }
      setLoading(false);
    }
    loadReport();
  }, [user]);

  // Общая функция сохранения текущего выбора в Firestore в реальном времени
  const saveCurrentSelection = async (newOverrides) => {
    if (!user || !report) return;
    try {
      const activeCategoriesData = {
        month: report.month, // используем month из отчета
        monthName: report.monthName,
        categories: {}
      };

      // Сопоставляем оверрайды с MCC кодами с поддержкой динамического справочника
      Object.entries(newOverrides).forEach(([bankId, catNames]) => {
        const userBank = report.userBanks?.find(b => b.id === bankId);
        const refBankId = userBank?.bankRefId || bankId;
        const refBank = banksMccRef.find(b => b.id === refBankId);

        activeCategoriesData.categories[bankId] = catNames.map(name => {
          const bankMccList = getBankMccForCategory(refBank, name);
          const fallbackMccList = MCC_CATEGORIES[name]?.mcc || [];
          const matchedMccList = bankMccList.length > 0 ? bankMccList : fallbackMccList;
          
          const originalList = report.availableCategories[bankId] || [];
          const orig = originalList.find(c => c.name === name);
          const percent = orig ? orig.percent : 1;

          return {
            name,
            percent,
            mccCodes: matchedMccList
          };
        });
      });

      // 1. Сохраняем активные категории для чата
      await saveActiveCategories(user.uid, activeCategoriesData);

      // 2. Обновляем статус отчета на confirmed и сохраняем оверрайды в Firestore
      const updatedReport = {
        ...report,
        status: 'confirmed',
        userConfirmed: true,
        userOverrides: newOverrides
      };
      
      await saveMonthlyReport(user.uid, report.month, updatedReport);
      setReport(updatedReport);
    } catch (e) {
      console.error('Ошибка при автоматическом сохранении выбора:', e);
    }
  };

  // Подтверждение выбора (принудительное сохранение с конфетти)
  const handleConfirmSelection = async () => {
    setSaving(true);
    try {
      await saveCurrentSelection(selectedOverrides);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      showNotification('Ваш выбор успешно сохранен и активирован! 🎉', 'success');
    } catch (e) {
      showNotification('Произошла ошибка при сохранении: ' + e.message, 'error');
    }
    setSaving(false);
  };

  // Перерасчет рекомендаций на основе новых приоритетов
  const handleRecalculateReport = async () => {
    if (!user || !report) return;
    setSaving(true);
    
    try {
      // 1. Получаем свежий профиль пользователя для загрузки актуальных приоритетов банков
      const profileRes = await getUserProfile(user.uid);
      if (!profileRes.success || !profileRes.data) {
        showNotification('Не удалось загрузить ваш профиль: ' + profileRes.error, 'error');
        setSaving(false);
        return;
      }
      
      const freshBanks = profileRes.data.banks || [];
      freshBanks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
      
      // 2. Выполняем оптимизацию на основе старых предложений
      const optimizationResult = optimizeCashback(
        freshBanks, 
        report.availableCategories, 
        banksMccRef, 
        [] // приоритеты категорий удалены
      );
      
      const yearMonth = report.month;
      
      const updatedReport = {
        ...report,
        status: 'analyzed',
        userConfirmed: false,
        recommendation: optimizationResult.recommendation,
        summary: optimizationResult.summary,
        userBanks: freshBanks,
        userOverrides: null // Сбрасываем ручные оверрайды
      };
      
      // 3. Сохраняем обновленный отчет в Firestore
      const saveRes = await saveMonthlyReport(user.uid, yearMonth, updatedReport);
      
      if (saveRes.success) {
        setReport(updatedReport);
        
        // Обновляем состояние оверрайдов
        const newOverrides = {};
        Object.entries(optimizationResult.recommendation || {}).forEach(([bankId, rec]) => {
          newOverrides[bankId] = rec.selected || [];
        });
        setSelectedOverrides(newOverrides);
        
        showNotification('Рекомендации успешно пересчитаны! 🔄', 'success');
      } else {
        showNotification('Ошибка при сохранении пересчитанного отчета: ' + saveRes.error, 'error');
      }
    } catch (err) {
      showNotification('Произошла ошибка при перерасчете: ' + err.message, 'error');
    }
    
    setSaving(false);
  };

  // Сброс всего выбора категорий в текущем месяце
  const handleResetSelection = async () => {
    if (!report) return;
    if (confirm('Вы уверены, что хотите сбросить все выбранные категории?')) {
      setSaving(true);
      const emptySelection = {};
      Object.keys(report.availableCategories || {}).forEach(bankId => {
        emptySelection[bankId] = [];
      });
      setSelectedOverrides(emptySelection);
      await saveCurrentSelection(emptySelection);
      setSaving(false);
      showNotification('Выбор категорий успешно сброшен и сохранен! 🧹', 'success');
    }
  };

  // Удаление отчета
  const handleDeleteReport = async () => {
    if (!report) return;
    if (confirm(`Вы уверены, что хотите полностью удалить отчёт за ${report.monthName}? Все загруженные предложения и сохраненные выборы будут безвозвратно стёрты.`)) {
      setSaving(true);
      try {
        const res = await deleteMonthlyReport(user.uid, report.month);
        if (res.success) {
          showNotification('Отчёт успешно удален! 🗑️', 'success');
          setReport(null);
          router.push('/dashboard/history');
        } else {
          showNotification('Ошибка при удалении отчета: ' + res.error, 'error');
        }
      } catch (err) {
        showNotification('Произошла ошибка при удалении: ' + err.message, 'error');
      }
      setSaving(false);
    }
  };

  // Переключение выбора категории при редактировании
  const toggleCategorySelection = (bankId, catName) => {
    setSelectedOverrides(prev => {
      const current = prev[bankId] || [];
      let updated;
      if (current.includes(catName)) {
        updated = current.filter(name => name !== catName);
      } else {
        // Находим карту в отчете, чтобы узнать её лимит
        const userBank = report.userBanks?.find(b => b.id === bankId);
        const limit = userBank?.maxCategories || 3;
        
        if (current.length >= limit) {
          showNotification(`Вы можете выбрать не более ${limit} категорий в этом банке!`, 'error');
          return prev;
        }
        updated = [...current, catName];
      }
      
      const newSelection = { ...prev, [bankId]: updated };
      
      // Автоматическое сохранение изменений в Firestore
      saveCurrentSelection(newSelection);
      
      return newSelection;
    });
  };



  if (loading) {
    return (
      <div className="spinner-overlay">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="card text-center" style={{ padding: '48px 24px', margin: '48px auto', maxWidth: '600px' }}>
        <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>📋</span>
        <h3>Отчёт за выбранный период ещё не сформирован</h3>
        <p style={{ margin: '8px 0 24px' }}>
          Загрузите скриншоты категорий кешбэка ваших банков в разделе «Анализ», чтобы получить умный отчёт.
        </p>
        <button className="btn btn-primary" onClick={() => router.push('/dashboard/analyze')}>
          Перейти к анализу
        </button>
      </div>
    );
  }

  const isConfirmed = report.status === 'confirmed';

  // 1. Расчет количества вхождений каждой категории для выявления УНИКАЛЬНЫХ
  const categoryBankCounts = {};
  Object.values(report.availableCategories || {}).forEach((offers) => {
    offers.forEach((offer) => {
      const normalized = getNormalizedCategoryKey(offer.name);
      categoryBankCounts[normalized] = (categoryBankCounts[normalized] || 0) + 1;
    });
  });

  // 2. Расчет словаря выбранных категорий по банкам для выявления КОНФЛИКТОВ
  const selectedCategoryBankMap = {};
  Object.entries(selectedOverrides).forEach(([bankId, selectedCats]) => {
    selectedCats.forEach((catName) => {
      const normalized = getNormalizedCategoryKey(catName);
      if (!selectedCategoryBankMap[normalized]) {
        selectedCategoryBankMap[normalized] = [];
      }
      selectedCategoryBankMap[normalized].push(bankId);
    });
  });

  // Группировка карт по системным банкам (bankRefId)
  const groupedRecommendations = {};
  Object.entries(report.recommendation || {}).forEach(([bankId, rec]) => {
    const userBank = report.userBanks?.find(b => b.id === bankId);
    const bankRefId = userBank?.bankRefId || bankId;
    
    if (!groupedRecommendations[bankRefId]) {
      groupedRecommendations[bankRefId] = {
        bankName: userBank?.name || bankId,
        color: userBank?.color || 'var(--color-primary)',
        logo: userBank?.logo || '🏦',
        cards: []
      };
    }
    
    groupedRecommendations[bankRefId].cards.push({
      bankId,
      userBank,
      rec,
      originalOffers: report.availableCategories[bankId] || [],
      selectedCats: selectedOverrides[bankId] || []
    });
  });

  // Группировка по категориям со всех банков
  const categoriesGrouped = {};
  Object.entries(report.availableCategories || {}).forEach(([bankId, offers]) => {
    const userBank = report.userBanks?.find(b => b.id === bankId);
    const refBankId = userBank?.bankRefId || bankId;
    const refBank = banksMccRef.find(b => b.id === refBankId);

    offers.forEach((offer) => {
      const normalizedName = getNormalizedCategoryKey(offer.name);
      const isUnique = isBrandCategory(normalizedName);

      // Если категория уникальная, группируем её под специальным именем
      const groupName = isUnique ? 'Уникальные категории' : getSemanticCategoryGroup(offer.name);
      
      const bankMccList = getBankMccForCategory(refBank, offer.name);
      const fallbackGroupName = isUnique ? getSemanticCategoryGroup(offer.name) : groupName;
      const fallbackMccList = MCC_CATEGORIES[fallbackGroupName]?.mcc || [];
      const matchedMccList = bankMccList.length > 0 ? bankMccList : fallbackMccList;

      if (!categoriesGrouped[groupName]) {
        categoriesGrouped[groupName] = [];
      }

      categoriesGrouped[groupName].push({
        bankId,
        userBank,
        offer,
        mccCodes: matchedMccList,
        isSelected: selectedOverrides[bankId]?.includes(offer.name) || false,
      });
    });
  });

  // Фильтрация сгруппированных категорий при поиске
  const filteredCategoriesGrouped = {};
  const query = searchQuery.toLowerCase().trim();

  Object.entries(categoriesGrouped).forEach(([groupName, items]) => {
    const filteredItems = items.filter(item => {
      if (!query) return true;
      
      const matchGroupName = groupName.toLowerCase().includes(query);
      const matchOfferName = item.offer.name.toLowerCase().includes(query);
      const matchBankName = (item.userBank?.name || '').toLowerCase().includes(query) || (item.userBank?.customName || '').toLowerCase().includes(query);
      const matchMcc = item.mccCodes.some(mcc => mcc.includes(query));

      return matchGroupName || matchOfferName || matchBankName || matchMcc;
    });

    if (filteredItems.length > 0) {
      filteredCategoriesGrouped[groupName] = filteredItems;
    }
  });

  return (
    <div className={styles.container}>
      {showConfetti && (
        <div className={styles.confettiContainer}>
          {[...Array(50)].map((_, i) => (
            <div 
              key={i} 
              className={styles.confetti} 
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'][Math.floor(Math.random() * 5)]
              }}
            />
          ))}
        </div>
      )}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Ваш умный выбор кешбэка 📊</h1>
          <p className={styles.subtitle}>
            Отчёт по оптимизации категорий на <strong>{report.monthName}</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary"
            onClick={handleRecalculateReport}
            disabled={saving}
            title="Пересчитать рекомендации на основе ваших текущих приоритетов банков"
          >
            🔄 Пересчитать
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={handleResetSelection}
            disabled={saving}
            title="Сбросить все выбранные категории этого месяца"
          >
            🧹 Сбросить выбор
          </button>
          
          <button 
            className="btn btn-danger"
            onClick={handleDeleteReport}
            disabled={saving}
            title="Полностью удалить отчёт за этот месяц"
          >
            🗑️ Удалить отчёт
          </button>

          <button 
            className="btn btn-success" 
            onClick={handleConfirmSelection}
            disabled={saving}
          >
            {saving ? 'Сохранение...' : '✅ Подтвердить и активировать'}
          </button>
        </div>
      </div>

      {isConfirmed && (
        <div className="badge badge-success" style={{ width: '100%', padding: '12px', justifyContent: 'center', borderRadius: '12px', marginBottom: '24px', fontSize: '14px' }}>
          🎉 Категории успешно активированы! ИИ теперь учитывает этот выбор при ответах в чате.
        </div>
      )}

      {/* Переключатель вкладок просмотра */}
      <div className={styles.tabsContainer}>
        <button 
          className={`${styles.tabButton} ${viewMode === 'banks' ? styles.tabButtonActive : ''}`}
          onClick={() => { setViewMode('banks'); setSearchQuery(''); }}
        >
          🏦 По банкам
        </button>
        <button 
          className={`${styles.tabButton} ${viewMode === 'categories' ? styles.tabButtonActive : ''}`}
          onClick={() => { setViewMode('categories'); setSearchQuery(''); }}
        >
          🗂️ По категориям
        </button>
      </div>

      {viewMode === 'categories' && (
        <div className={styles.searchContainer}>
          <input
            type="text"
            className="input"
            placeholder="🔍 Поиск по названию категории, банка или MCC-кода (например: 5411)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', marginBottom: '16px', padding: '8px 12px', fontSize: '13px' }}
          />
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.recommendationsList}>
          {viewMode === 'banks' ? (
            /* Группировка по банкам */
            Object.entries(groupedRecommendations).map(([bankRefId, group]) => {
              return (
                <div key={bankRefId} className="card" style={{ borderLeft: `6px solid ${group.color}`, marginBottom: '20px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', borderBottom: '1px solid var(--divider-color)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '24px', display: 'flex', alignItems: 'center' }}>{group.logo}</span>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>{group.bankName}</h3>
                  </div>
                  
                  {/* Список карт банка с горизонтальным расположением в строку */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                    {group.cards.map((card) => {
                      const cardName = card.userBank?.customName ? card.userBank.customName : `Основная карта`;
                      
                      return (
                        <div key={card.bankId} style={{ backgroundColor: 'var(--bg-primary)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                                💳 {cardName}
                              </h4>
                              <div className="badge badge-primary" style={{ backgroundColor: group.color, color: '#fff', border: 'none', fontSize: '10px', padding: '1px 5px' }}>
                                Выбрано: {card.selectedCats.length}/{card.userBank?.maxCategories || 3}
                              </div>
                            </div>
                            
                            <h5 style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>Предложения по карте:</h5>
                            <div className={styles.categoriesSelector} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px', marginTop: '4px' }}>
                              {card.originalOffers.map((offer) => {
                                const isSelected = card.selectedCats.includes(offer.name);
                                const normalizedName = getNormalizedCategoryKey(offer.name);
                                
                                // Уникальная категория
                                const isUnique = isBrandCategory(normalizedName);
                                
                                // Конфликтная категория
                                const isConflict = isSelected && (selectedCategoryBankMap[normalizedName]?.length > 1);
                                
                                const conflictBankNames = [];
                                if (isConflict) {
                                  const otherBankIds = selectedCategoryBankMap[normalizedName]?.filter(id => id !== card.bankId) || [];
                                  otherBankIds.forEach(id => {
                                    const ub = report.userBanks?.find(b => b.id === id);
                                    const name = ub ? (ub.customName ? ub.customName : ub.name) : id;
                                    conflictBankNames.push(name);
                                  });
                                }

                                let borderColor = 'var(--border-color)';
                                let backgroundColor = 'var(--bg-card)';
                                let badgeColor = group.color;

                                if (isConflict) {
                                  borderColor = 'var(--color-error)';
                                  backgroundColor = 'rgba(239, 68, 68, 0.08)';
                                  badgeColor = 'var(--color-error)';
                                } else if (isSelected) {
                                  borderColor = group.color;
                                  backgroundColor = `${group.color}15`;
                                }

                                return (
                                  <button
                                    key={offer.name}
                                    className={`${styles.categoryCard} ${isSelected ? styles.categoryCardSelected : ''}`}
                                    onClick={() => toggleCategorySelection(card.bankId, offer.name)}
                                    style={{
                                      borderColor: borderColor,
                                      backgroundColor: backgroundColor,
                                      padding: '6px 8px',
                                      borderRadius: '6px',
                                      boxShadow: 'none',
                                      borderWidth: isSelected ? '2px' : '1px'
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: '4px' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'flex-start' }}>
                                        <span style={{ fontWeight: '600', fontSize: '10px', textAlign: 'left', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.2' }} title={offer.name}>
                                          {offer.name}
                                        </span>
                                        {offer.description && (
                                          <span style={{ fontSize: '8px', color: 'var(--text-secondary)', textAlign: 'left', marginTop: '2px', lineHeight: '1.1' }} title={offer.description}>
                                            {offer.description}
                                          </span>
                                        )}
                                        {isUnique && !isSelected && (
                                          <span style={{ fontSize: '8px', color: '#14b8a6', fontWeight: '700', textTransform: 'lowercase', marginTop: '2px' }}>
                                            уникально
                                          </span>
                                        )}
                                        {isConflict && (
                                          <span style={{ fontSize: '8px', color: 'var(--color-error)', fontWeight: '600', marginTop: '2px', textAlign: 'left', lineHeight: '1.2' }}>
                                            ⚠️ Выбрано в: {conflictBankNames.join(', ')}
                                          </span>
                                        )}
                                      </div>
                                      <span className="badge badge-primary" style={{ backgroundColor: badgeColor, color: '#fff', fontSize: '9px', padding: '1px 4px', marginLeft: '4px', minWidth: '24px', textAlign: 'center', border: 'none' }}>
                                        {offer.percent}%
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            /* Группировка по глобальным категориям */
            Object.entries(filteredCategoriesGrouped).map(([groupName, items]) => {
              const emojiMap = {
                'Уникальные категории': '✨',
                'Аптеки': '💊',
                'Автоуслуги': '🚗',
                'Топливо': '⛽',
                'Супермаркеты': '🛒',
                'Рестораны': '🍕',
                'Транспорт': '🚌',
                'Такси': '🚖',
                'Красота': '💅',
                'Развлечения': '🎬',
                'Одежда и обувь': '👕',
                'Путешествия': '✈️',
                'Дом и ремонт': '🔨',
                'Цветы': '💐',
                'Зоотовары': '🐱',
                'Книги': '📚',
                'Спорттовары': '⚽',
                'Образование': '🎓',
                'На всё (все покупки)': '💳'
              };
              const groupEmoji = emojiMap[groupName] || '🗂️';

              return (
                <div 
                  key={groupName} 
                  id={`group-${groupName.replace(/\s+/g, '-').toLowerCase()}`} 
                  className={styles.categoryGroupCard}
                >
                  <h4 className={styles.categoryGroupTitle}>{groupEmoji} {groupName}</h4>
                  <div className={styles.categoryGroupOffers}>
                    {items.map(({ bankId, userBank, offer, mccCodes, isSelected }) => {
                      const normalizedName = getNormalizedCategoryKey(offer.name);
                      const isUnique = isBrandCategory(normalizedName);
                      const isConflict = isSelected && (selectedCategoryBankMap[normalizedName]?.length > 1);

                      const conflictBankNames = [];
                      if (isConflict) {
                        const otherBankIds = selectedCategoryBankMap[normalizedName]?.filter(id => id !== bankId) || [];
                        otherBankIds.forEach(id => {
                          const ub = report.userBanks?.find(b => b.id === id);
                          const name = ub ? (ub.customName ? ub.customName : ub.name) : id;
                          conflictBankNames.push(name);
                        });
                      }

                      const bankColor = userBank?.color || 'var(--color-primary)';
                      const bankLogo = userBank?.logo || '🏦';
                      const bankName = userBank?.customName ? `${userBank.name} (${userBank.customName})` : (userBank?.name || bankId);

                      let borderColor = 'var(--border-color)';
                      let backgroundColor = 'var(--bg-card)';
                      let badgeColor = bankColor;

                      if (isConflict) {
                        borderColor = 'var(--color-error)';
                        backgroundColor = 'rgba(239, 68, 68, 0.08)';
                        badgeColor = 'var(--color-error)';
                      } else if (isSelected) {
                        borderColor = bankColor;
                        backgroundColor = `${bankColor}15`;
                      }

                      return (
                        <div 
                          key={`${bankId}-${offer.name}`}
                          className={styles.offerRow}
                          style={{
                            borderColor: borderColor,
                            backgroundColor: backgroundColor,
                            borderWidth: isSelected ? '2px' : '1px'
                          }}
                          onClick={() => toggleCategorySelection(bankId, offer.name)}
                        >
                          <div className={styles.offerMain}>
                            <span className={styles.bankLogoSmall}>{bankLogo}</span>
                            <div className={styles.offerInfo}>
                              <span className={styles.offerName}>{offer.name}</span>
                              {offer.description && (
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px', fontStyle: 'italic', fontWeight: '500' }}>
                                  {offer.description}
                                </span>
                              )}
                              <span className={styles.offerBankName}>{bankName}</span>
                              {isUnique && !isSelected && (
                                <span className={styles.uniqueBadge}>уникально</span>
                              )}
                              {isConflict && (
                                <span className={styles.conflictText}>⚠️ Выбрано в: {conflictBankNames.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          
                          <div className={styles.offerRight} onClick={(e) => e.stopPropagation()}>
                            {/* Тултип со списком MCC */}
                            <div className={styles.mccTooltipContainer}>
                              <span className={styles.mccCountBadge}>
                                {mccCodes.length} MCC
                              </span>
                              <div className={styles.mccTooltip}>
                                <div className={styles.mccTooltipHeader}>Коды MCC для {offer.name}:</div>
                                {mccCodes.map(code => (
                                  <div key={code} className={styles.mccTooltipItem}>
                                    {getMccDescription(code)}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <span className={styles.percentBadge} style={{ backgroundColor: badgeColor }} onClick={() => toggleCategorySelection(bankId, offer.name)}>
                              {offer.percent}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.sidebar}>
          <div className="card" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Сводная аналитика 📈</h3>
            
            {/* Индикаторы лимитов по каждой карте */}
            <div style={{ marginBottom: '16px', borderBottom: '1px solid var(--divider-color)', paddingBottom: '12px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>Лимиты по картам:</h4>
              {report.userBanks?.map((bank) => {
                const selectedCount = selectedOverrides[bank.id]?.length || 0;
                const limit = bank.maxCategories || 3;
                const isOver = selectedCount > limit;
                return (
                  <div key={bank.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: bank.color }}>●</span>
                      {bank.customName ? `${bank.name} (${bank.customName})` : bank.name}
                    </span>
                    <span style={{ fontWeight: '700', color: isOver ? 'var(--color-error)' : 'var(--text-primary)' }}>
                      {selectedCount} из {limit}
                    </span>
                  </div>
                );
              })}
            </div>

            <p style={{ margin: '8px 0 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Выбранные категории кешбэка на этот месяц:
            </p>

            <div className={styles.summaryList}>
              {report.summary && report.summary.map((item, idx) => {
                const isSelected = selectedOverrides[item.bankId]?.includes(item.category);
                if (!isSelected) return null; // Показываем только выбранные категории
                
                return (
                  <div key={idx} className={styles.summaryItem}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                      <span style={{ color: item.color }}>●</span>
                      <strong>{item.category}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{item.bankName}</span>
                      <strong style={{ color: 'var(--color-primary)' }}>{item.percent}%</strong>
                    </div>
                  </div>
                );
              })}
            </div>

            {viewMode === 'categories' && Object.keys(filteredCategoriesGrouped).length > 0 && (
              <div style={{ borderTop: '1px solid var(--divider-color)', paddingTop: '12px', marginTop: '12px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>
                  Быстрый переход:
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                  {Object.keys(filteredCategoriesGrouped).map((groupName) => {
                    const emojiMap = {
                      'Уникальные категории': '✨',
                      'Аптеки': '💊',
                      'Автоуслуги': '🚗',
                      'Топливо': '⛽',
                      'Супермаркеты': '🛒',
                      'Рестораны': '🍕',
                      'Транспорт': '🚌',
                      'Такси': '🚖',
                      'Красота': '💅',
                      'Развлечения': '🎬',
                      'Одежда и обувь': '👕',
                      'Путешествия': '✈️',
                      'Дом и ремонт': '🔨',
                      'Цветы': '💐',
                      'Зоотовары': '🐱',
                      'Книги': '📚',
                      'Спорттовары': '⚽',
                      'Образование': '🎓',
                      'На всё (все покупки)': '💳'
                    };
                    const emoji = emojiMap[groupName] || '🗂️';
                    const targetId = `group-${groupName.replace(/\s+/g, '-').toLowerCase()}`;

                    return (
                      <button
                        key={groupName}
                        onClick={() => {
                          const element = document.getElementById(targetId);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Добавим временный эффект подсветки
                            const origBorder = element.style.borderColor;
                            const origShadow = element.style.boxShadow;
                            const origTransform = element.style.transform;
                            
                            element.style.transition = 'all 0.4s ease';
                            element.style.borderColor = 'var(--color-primary)';
                            element.style.boxShadow = '0 0 16px rgba(59, 130, 246, 0.4)';
                            element.style.transform = 'scale(1.01)';
                            
                            setTimeout(() => {
                              element.style.borderColor = origBorder;
                              element.style.boxShadow = origShadow;
                              element.style.transform = origTransform;
                            }, 1200);
                          }
                        }}
                        className={styles.quickNavButton}
                      >
                        {emoji} {groupName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--divider-color)', paddingTop: '12px', marginTop: '12px' }}>
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', fontSize: '12px', padding: '8px' }}
                onClick={() => router.push('/dashboard/chat')}
              >
                💬 Задать вопрос чату ИИ
              </button>
            </div>
          </div>
        </div>
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
