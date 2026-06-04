'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AVAILABLE_BANKS } from '@/lib/constants';
import { addBank, removeBank, updateBankPriorities, getUserProfile, getBanksMccRef } from '@/lib/firestore';
import styles from './banks.module.css';

export default function BanksPage() {
  const { user } = useAuth();
  const [userBanks, setUserBanks] = useState([]);
  const [systemBanks, setSystemBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Загрузка банков пользователя и системного справочника
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      
      // Загружаем банки пользователя
      const res = await getUserProfile(user.uid);
      if (res.success && res.data) {
        const banksList = res.data.banks || [];
        // Сортируем по приоритету
        banksList.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        setUserBanks(banksList);
      }

      // Загружаем все доступные банки из системного справочника в Firestore
      const sysRes = await getBanksMccRef();
      if (sysRes.success && sysRes.data) {
        setSystemBanks(sysRes.data);
      } else {
        // Фоллбек на статические константы в случае сбоя Firestore
        setSystemBanks(AVAILABLE_BANKS);
      }

      setLoading(false);
    }
    loadData();
  }, [user]);

  // Добавление банка
  const handleAddBank = async (bankTemplate) => {
    setSaving(true);
    
    // Генерируем уникальный ID карты на основе исходного ID и таймстампа
    const cardId = `${bankTemplate.id}-${Date.now()}`;
    
    // Вычисляем порядковый номер карты этого банка у пользователя для названия по умолчанию
    const existingSameBanksCount = userBanks.filter(b => b.bankRefId === bankTemplate.id).length;
    const defaultCustomName = existingSameBanksCount > 0 ? `Карта ${existingSameBanksCount + 1}` : '';

    const newBankData = {
      id: cardId,
      bankRefId: bankTemplate.id,
      name: bankTemplate.name,
      customName: defaultCustomName,
      color: bankTemplate.color,
      logo: bankTemplate.logo,
      priority: userBanks.length,
      maxCategories: bankTemplate.maxCategories || 3,
      mccSourceUrl: bankTemplate.defaultMccUrl || ''
    };

    const res = await addBank(user.uid, newBankData);
    if (res.success) {
      setUserBanks([...userBanks, res.bank]);
      setShowAddModal(false);
    } else {
      alert('Ошибка добавления банка: ' + res.error);
    }
    setSaving(false);
  };

  // Удаление банка
  const handleRemoveBank = async (bankId) => {
    if (!confirm('Вы уверены, что хотите удалить этот банк? Все загруженные по нему данные будут стерты.')) {
      return;
    }

    setSaving(true);
    const res = await removeBank(user.uid, bankId);
    if (res.success) {
      const updated = userBanks.filter((b) => b.id !== bankId);
      // Перерасчитываем приоритеты после удаления
      const withNewPriorities = updated.map((b, idx) => ({ ...b, priority: idx }));
      setUserBanks(withNewPriorities);
      await updateBankPriorities(user.uid, withNewPriorities);
    } else {
      alert('Ошибка удаления банка: ' + res.error);
    }
    setSaving(false);
  };

  // Изменение приоритета (Вверх/Вниз)
  const moveBank = async (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= userBanks.length) return;

    const updated = [...userBanks];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;

    // Обновляем поля priority
    const withNewPriorities = updated.map((b, idx) => ({ ...b, priority: idx }));
    setUserBanks(withNewPriorities);
    
    await updateBankPriorities(user.uid, withNewPriorities);
  };

  // Изменение названия карты
  const handleCustomNameChange = async (bankId, newName) => {
    const updated = userBanks.map((b) => {
      if (b.id === bankId) {
        return { ...b, customName: newName };
      }
      return b;
    });
    setUserBanks(updated);
    await updateBankPriorities(user.uid, updated);
  };

  // Изменение лимита выбора категорий для карты
  const handleMaxCategoriesChange = async (bankId, newLimit) => {
    const limitNum = parseInt(newLimit, 10) || 3;
    const updated = userBanks.map((b) => {
      if (b.id === bankId) {
        return { ...b, maxCategories: limitNum };
      }
      return b;
    });
    setUserBanks(updated);
    await updateBankPriorities(user.uid, updated);
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
          <h1 className={styles.title}>Управление картами 💳</h1>
          <p className={styles.subtitle}>
            Добавьте карты банков, которыми вы пользуетесь, и расставьте их в приоритетном порядке.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
          disabled={saving}
          id="btn-add-bank"
        >
          ➕ Добавить карту
        </button>
      </div>

      {userBanks.length === 0 ? (
        <div className="card text-center" style={{ padding: '48px 24px', marginTop: '24px' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>💳</span>
          <h3>У вас пока нет добавленных карт</h3>
          <p style={{ margin: '8px 0 24px' }}>
            Добавьте карты, чтобы начать анализировать категории кешбэка и получать умные рекомендации.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            Добавить первую карту
          </button>
        </div>
      ) : (
        <div className={styles.content}>
          <div className="card">
            <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Список ваших карт</h3>
            
            <div className={styles.bankList}>
              {userBanks.map((bank, index) => (
                <div key={bank.id} className={styles.bankCard} style={{ borderLeftColor: bank.color }}>
                  <div className={styles.bankMain}>
                    <span className={styles.bankLogo}>{bank.logo}</span>
                    <div className={styles.bankInfo}>
                      <h4 className={styles.bankName}>
                        {bank.name} {bank.customName ? `(${bank.customName})` : ''}
                      </h4>
                      <div className={styles.priorityBadge}>
                        № {index + 1}
                      </div>
                    </div>
                  </div>

                  <div className={styles.bankFields}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Название (для отличия):</label>
                      <input
                        type="text"
                        className="input"
                        style={{ fontSize: '12px', padding: '6px 10px' }}
                        value={bank.customName || ''}
                        placeholder="Например: Зарплатная, Мир"
                        onChange={(e) => handleCustomNameChange(bank.id, e.target.value)}
                      />
                    </div>

                    <div className={styles.fieldGroup} style={{ flex: '0 0 100px' }}>
                      <label className={styles.fieldLabel}>Лимит категорий:</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        className="input"
                        style={{ fontSize: '12px', padding: '6px 10px' }}
                        value={bank.maxCategories || 3}
                        onChange={(e) => handleMaxCategoriesChange(bank.id, e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <div className={styles.arrows}>
                      <button
                        className="btn btn-secondary btn-sm btn-icon"
                        disabled={index === 0 || saving}
                        onClick={() => moveBank(index, 'up')}
                        title="Поднять приоритет"
                      >
                        ▲
                      </button>
                      <button
                        className="btn btn-secondary btn-sm btn-icon"
                        disabled={index === userBanks.length - 1 || saving}
                        onClick={() => moveBank(index, 'down')}
                        title="Опустить приоритет"
                      >
                        ▼
                      </button>
                    </div>
                    
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={saving}
                      onClick={() => handleRemoveBank(bank.id)}
                    >
                      🗑️ Удалить
                    </button>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      )}

      {/* Модалка добавления банка */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Добавить карту</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                Выберите банк из списка популярных, чтобы подключить его карту (вы можете добавить несколько карт одного банка):
              </p>
              {systemBanks.map((template) => (
                <button
                  key={template.id}
                  className={styles.modalBankItem}
                  onClick={() => handleAddBank({
                    id: template.id,
                    name: template.name,
                    logo: template.logo || '🏦',
                    color: template.color || '#3b82f6',
                    maxCategories: template.maxCategories || 3,
                    defaultMccUrl: template.mccUrl || ''
                  })}
                  disabled={saving}
                >
                  <span style={{ fontSize: '24px' }}>{template.logo || '🏦'}</span>
                  <span style={{ fontWeight: '500' }}>{template.name}</span>
                </button>
              ))}
              {systemBanks.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '16px' }}>
                  Нет доступных банков. Обратитесь к администратору.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
