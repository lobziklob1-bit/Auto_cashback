'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { 
  getDoc, 
  doc, 
  collection, 
  getDocs, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  getBanksMccRef, 
  updateBankMccRef, 
  initDefaultBanksMccRef 
} from '@/lib/firestore';
import styles from './admin.module.css';

export default function AdminPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parsingId, setParsingId] = useState(null);
  const [selectedBank, setSelectedBank] = useState(null);
  
  // State для нового банка
  const [newBankName, setNewBankName] = useState('');
  const [newBankInn, setNewBankInn] = useState('');
  const [newBankUrl, setNewBankUrl] = useState('');
  const [newBankLogo, setNewBankLogo] = useState('🏦');
  const [newBankMaxCategories, setNewBankMaxCategories] = useState(4);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Состояния для inline-редактирования (сохранение изменений)
  const [editingValues, setEditingValues] = useState({});

  // 1. Получить профиль пользователя
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setProfile(snap.data());
        }
      } catch (err) {
        console.error('Error loading admin profile:', err);
      }
    };
    fetchProfile();
  }, [user]);

  // 2. Получить справочник банков из Firestore
  const loadBanks = async () => {
    setLoading(true);
    try {
      // Инициализируем дефолтные банки, если коллекция пуста
      await initDefaultBanksMccRef();
      
      const result = await getBanksMccRef();
      if (result.success) {
        setBanks(result.data);
        
        // Заполняем временные поля редактирования
        const initialEdits = {};
        result.data.forEach(bank => {
          initialEdits[bank.id] = {
            inn: bank.inn || '',
            mccUrl: bank.mccUrl || '',
            logo: bank.logo || '🏦',
            maxCategories: bank.maxCategories || 3
          };
        });
        setEditingValues(initialEdits);
      }
    } catch (err) {
      console.error('Error loading banks directory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.isAdmin) {
      loadBanks();
    }
  }, [profile]);

  if (!user || (!profile?.isAdmin && profile !== null)) {
    return (
      <div className={styles.unauthorized}>
        <span className={styles.unauthorizedIcon}>🚫</span>
        <h1 className={styles.unauthorizedTitle}>Доступ ограничен</h1>
        <p className={styles.unauthorizedDesc}>
          Эта страница доступна только пользователям с правами Администратора.<br/>
          Вы можете получить права администратора, нажав на кнопку <b>«🔑 Получить права админа»</b> в левом меню профиля.
        </p>
      </div>
    );
  }

  if (loading && banks.length === 0) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  // Изменение локальных инпутов редактирования
  const handleInputChange = (bankId, field, value) => {
    setEditingValues(prev => ({
      ...prev,
      [bankId]: {
        ...prev[bankId],
        [field]: value
      }
    }));
  };

  // Сохранить ИНН, Ссылку, Логотип и Лимит
  const handleSaveBankInfo = async (bankId) => {
    const values = editingValues[bankId];
    if (!values) return;

    const updateTime = new Date().toISOString();

    try {
      await updateBankMccRef(bankId, {
        inn: values.inn.trim(),
        mccUrl: values.mccUrl.trim(),
        logo: values.logo || '🏦',
        maxCategories: Number(values.maxCategories) || 3,
        updatedAt: updateTime
      });
      
      // Обновляем локальный стейт банков
      setBanks(prev => prev.map(b => b.id === bankId ? {
        ...b,
        inn: values.inn.trim(),
        mccUrl: values.mccUrl.trim(),
        logo: values.logo || '🏦',
        maxCategories: Number(values.maxCategories) || 3,
        updatedAt: updateTime
      } : b));

      // Если выбран этот же банк, обновляем детали
      if (selectedBank?.id === bankId) {
        setSelectedBank(prev => ({
          ...prev,
          inn: values.inn.trim(),
          mccUrl: values.mccUrl.trim(),
          logo: values.logo || '🏦',
          maxCategories: Number(values.maxCategories) || 3,
          updatedAt: updateTime
        }));
      }

      alert('Параметры банка успешно сохранены.');
    } catch (err) {
      console.error('Save bank info error:', err);
      alert('Ошибка при сохранении данных банка.');
    }
  };


  // Запуск ИИ-парсинга через серверный эндпоинт
  const handleRunAiParser = async (bankId, e) => {
    e.stopPropagation(); // Предотвращаем клик по строке
    setParsingId(bankId);
    
    try {
      const response = await fetch('/api/admin/parse-mcc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bankId })
      });

      const result = await response.json();

      if (result.success) {
        // Обновляем список банков
        setBanks(prev => prev.map(b => b.id === bankId ? {
          ...b,
          categories: result.categories,
          updatedAt: result.updatedAt
        } : b));

        // Если выбран этот же банк, обновляем детали
        if (selectedBank?.id === bankId) {
          setSelectedBank(prev => ({
            ...prev,
            categories: result.categories,
            updatedAt: result.updatedAt
          }));
        }

        const msg = result.isMockFallback 
          ? 'Анализ завершен в режиме эмуляции тарифов.'
          : 'Справочник успешно обновлен с использованием искусственного интеллекта Gemini!';
        alert(`Успех!\n${msg}`);
      } else {
        alert(`Ошибка парсинга: ${result.error}`);
      }
    } catch (err) {
      console.error('AI Parser calling error:', err);
      alert('Произошла ошибка при вызове ИИ-парсера.');
    } finally {
      setParsingId(null);
    }
  };

  // Добавление нового банка
  const handleAddBank = async (e) => {
    e.preventDefault();
    if (!newBankName.trim() || !newBankInn.trim() || !newBankUrl.trim()) {
      alert('Пожалуйста, заполните все поля формы добавления банка.');
      return;
    }

    setFormSubmitting(true);
    const generatedId = newBankName.trim().toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `bank-${Date.now()}`;

    try {
      const bankData = {
        name: newBankName.trim(),
        inn: newBankInn.trim(),
        mccUrl: newBankUrl.trim(),
        logo: newBankLogo,
        maxCategories: Number(newBankMaxCategories) || 4,
        categories: {},
        updatedAt: new Date().toISOString()
      };

      await updateBankMccRef(generatedId, bankData);
      
      // Обновляем локальные стейты
      setBanks(prev => [...prev, { id: generatedId, ...bankData }]);
      setEditingValues(prev => ({
        ...prev,
        [generatedId]: {
          inn: newBankInn.trim(),
          mccUrl: newBankUrl.trim(),
          logo: newBankLogo || '🏦',
          maxCategories: Number(newBankMaxCategories) || 4
        }
      }));

      // Очищаем форму
      setNewBankName('');
      setNewBankInn('');
      setNewBankUrl('');
      setNewBankLogo('🏦');
      setNewBankMaxCategories(4);

      alert(`Банк «${bankData.name}» успешно добавлен в систему.`);
      setShowAddModal(false);
    } catch (err) {
      console.error('Add bank error:', err);
      alert('Ошибка добавления нового банка.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const totalCategoriesCount = banks.reduce((sum, bank) => {
    return sum + (bank.categories ? Object.keys(bank.categories).length : 0);
  }, 0);

  return (
    <div className={styles.adminPage}>
      {/* Header */}
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className={styles.title}>⚙️ Справочник банков и MCC</h1>
          <p className={styles.subtitle}>
            Управление базами банков, ИНН, тарифами и запуск интеллектуального ИИ-парсинга правил кешбэка
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
          id="btn-admin-add-bank"
        >
          ➕ Добавить банк
        </button>
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🏦</span>
          <div>
            <div className={styles.statValue}>{banks.length}</div>
            <div className={styles.statLabel}>Добавлено банков</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🏷️</span>
          <div>
            <div className={styles.statValue}>{totalCategoriesCount}</div>
            <div className={styles.statLabel}>Категорий кешбэка в БД</div>
          </div>
        </div>
      </div>

      {/* Main Panel Content Grid */}
      <div className={styles.contentGrid}>
        
        {/* Left Side: Banks List Table */}
        <div className={styles.mainCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Зарегистрированные банки</h2>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Банк</th>
                  <th>MCC-link</th>
                  <th>Лимит</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {banks.map((bank) => {
                   const currentEdits = editingValues[bank.id] || { inn: '', mccUrl: '', logo: '🏦', maxCategories: 3 };
                   const editLogo = currentEdits.logo || bank.logo || '🏦';
                   const editInn = currentEdits.inn || bank.inn || '';
                   const editUrl = currentEdits.mccUrl || bank.mccUrl || '';
                   const editMaxCategories = Number(currentEdits.maxCategories) || Number(bank.maxCategories) || 3;
                   const isParsing = parsingId === bank.id;
 
                   const isModified = 
                     editInn !== (bank.inn || '') || 
                     editUrl !== (bank.mccUrl || '') ||
                     editLogo !== (bank.logo || '🏦') ||
                     editMaxCategories !== (Number(bank.maxCategories) || 3);

                  return (
                    <tr 
                      key={bank.id} 
                      className={styles.bankRow}
                      onClick={() => setSelectedBank(bank)}
                      style={{
                        background: selectedBank?.id === bank.id ? 'var(--primary-light)' : 'transparent'
                      }}
                    >
                      <td className={styles.bankNameCell} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                          <select
                            value={currentEdits.logo || bank.logo || '🏦'}
                            onChange={(e) => handleInputChange(bank.id, 'logo', e.target.value)}
                            className={styles.logoSelect}
                            title="Сменить эмодзи-логотип банка"
                          >
                            <option value="🏦">🏦</option>
                            <option value="🔴">🔴</option>
                            <option value="🔵">🔵</option>
                            <option value="🟡">🟡</option>
                            <option value="🟢">🟢</option>
                            <option value="⚫">⚫</option>
                            <option value="🔷">🔷</option>
                          </select>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                            <span 
                              style={{ fontWeight: '600', cursor: 'pointer', color: 'var(--text-primary)' }}
                              onClick={() => setSelectedBank(bank)}
                              title="Посмотреть категории банка"
                            >
                              {bank.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ИНН:</span>
                              <input
                                type="text"
                                className={styles.innInput}
                                style={{ width: '105px', fontSize: '11px', padding: '2px 6px', height: '22px' }}
                                value={currentEdits.inn}
                                onChange={(e) => handleInputChange(bank.id, 'inn', e.target.value)}
                                placeholder="ИНН"
                                maxLength={12}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          className={styles.urlInput}
                          value={currentEdits.mccUrl}
                          onChange={(e) => handleInputChange(bank.id, 'mccUrl', e.target.value)}
                          placeholder="https://..."
                        />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          className={styles.innInput}
                          style={{ width: '60px', padding: '6px', textAlign: 'center' }}
                          value={currentEdits.maxCategories || bank.maxCategories || 3}
                          onChange={(e) => handleInputChange(bank.id, 'maxCategories', e.target.value)}
                          min={1}
                          max={10}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isModified && (
                            <button
                              onClick={() => handleSaveBankInfo(bank.id)}
                              className={styles.saveBtn}
                              title="Сохранить изменения"
                            >
                              💾
                            </button>
                          )}
                          <button
                            onClick={(e) => handleRunAiParser(bank.id, e)}
                            className={styles.updateBtn}
                            disabled={isParsing || parsingId !== null}
                            title="Извлечь категории и MCC с помощью ИИ"
                          >
                            {isParsing ? (
                              <>
                                <span className={styles.btnSpinner} />
                                Анализ...
                              </>
                            ) : (
                              'Обновить'
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Details & Add Form */}
        <div className={styles.sidebarCard}>
          
          {/* Detailed categories view */}
          {selectedBank ? (
            <div className={styles.detailsCard}>
              <div className={styles.detailsHeader}>
                <h3 className={styles.detailsTitle}>
                  <span>{selectedBank.logo || '🏦'}</span>
                  <span>{selectedBank.name}</span>
                </h3>
                <button 
                  className={styles.closeDetails}
                  onClick={() => setSelectedBank(null)}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                <b>ИНН:</b> {selectedBank.inn || 'Не указан'}<br/>
                <b>Обновлено:</b> {selectedBank.updatedAt ? new Date(selectedBank.updatedAt).toLocaleString('ru-RU') : 'Никогда'}
              </p>

              <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text)' }}>
                Распознанные категории и MCC-коды:
              </h4>

              <div className={styles.categoriesList}>
                {selectedBank.categories && Object.keys(selectedBank.categories).length > 0 ? (
                  Object.entries(selectedBank.categories).map(([catName, mccCodes]) => (
                    <div className={styles.categoryItem} key={catName}>
                      <div className={styles.categoryName}>{catName}</div>
                      <div className={styles.mccChips}>
                        {Array.isArray(mccCodes) && Array.from(new Set(mccCodes)).map((code, index) => (
                          <span className={styles.mccChip} key={`${code}-${index}`}>{code}</span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.noCategories}>
                    <p>Нет проанализированных данных.</p>
                    <p style={{ fontSize: '12px', marginTop: '6px' }}>
                      Нажмите кнопку <b>«🤖 ИИ Обновить»</b>, чтобы автоматически извлечь MCC-коды с сайта банка.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.detailsCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', height: '100%', borderStyle: 'dashed', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>👈</span>
                <span>Выберите банк в таблице для просмотра его базы категорий и MCC-кодов</span>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Модальное окно добавления банка */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">➕ Добавить новый банк</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddBank}>
                <div className={styles.formGroup}>
                  <label htmlFor="modal-bank-name">Название банка</label>
                  <input
                    id="modal-bank-name"
                    type="text"
                    className={styles.formInput}
                    placeholder="Например, Райффайзен"
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    disabled={formSubmitting}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="modal-bank-inn">ИНН банка</label>
                  <input
                    id="modal-bank-inn"
                    type="text"
                    className={styles.formInput}
                    placeholder="10-12 цифр"
                    value={newBankInn}
                    onChange={(e) => setNewBankInn(e.target.value)}
                    maxLength={12}
                    disabled={formSubmitting}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="modal-bank-url">Ссылка на правила MCC</label>
                  <input
                    id="modal-bank-url"
                    type="url"
                    className={styles.formInput}
                    placeholder="https://..."
                    value={newBankUrl}
                    onChange={(e) => setNewBankUrl(e.target.value)}
                    disabled={formSubmitting}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="modal-bank-logo">Эмодзи-логотип</label>
                  <select
                    id="modal-bank-logo"
                    className={styles.formInput}
                    value={newBankLogo}
                    onChange={(e) => setNewBankLogo(e.target.value)}
                    disabled={formSubmitting}
                  >
                    <option value="🏦">🏦 Банк</option>
                    <option value="🔴">🔴 Красный круг</option>
                    <option value="🔵">🔵 Синий круг</option>
                    <option value="🟡">🟡 Желтый круг</option>
                    <option value="🟢">🟢 Зеленый круг</option>
                    <option value="⚫">⚫ Черный круг</option>
                    <option value="🔷">🔷 Синий ромб</option>
                  </select>
                </div>
   
                <div className={styles.formGroup}>
                  <label htmlFor="modal-bank-limit">Лимит выбора категорий</label>
                  <input
                    id="modal-bank-limit"
                    type="number"
                    className={styles.formInput}
                    placeholder="Обычно 3 или 4"
                    value={newBankMaxCategories}
                    onChange={(e) => setNewBankMaxCategories(e.target.value)}
                    min={1}
                    max={10}
                    disabled={formSubmitting}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={formSubmitting}
                  style={{ marginTop: '16px' }}
                >
                  {formSubmitting ? 'Добавление...' : 'Добавить банк в систему'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
