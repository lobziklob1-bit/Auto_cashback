import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/* ============================================
   User Profiles
   ============================================ */

/**
 * Создать профиль пользователя.
 */
export async function createUserProfile(userId, data) {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    console.error('Ошибка создания профиля:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Получить профиль пользователя.
 */
export async function getUserProfile(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      return { success: false, error: 'Профиль не найден' };
    }

    return { success: true, data: { id: snapshot.id, ...snapshot.data() } };
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Обновить профиль пользователя.
 */
export async function updateUserProfile(userId, data) {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    console.error('Ошибка обновления профиля:', error);
    return { success: false, error: error.message };
  }
}

/* ============================================
   Banks Management
   ============================================ */

/**
 * Добавить банк в профиль пользователя.
 * @param {string} userId
 * @param {object} bankData - { id, name, color, categories: [...] }
 */
export async function addBank(userId, bankData) {
  try {
    const userRef = doc(db, 'users', userId);
    const bank = {
      ...bankData,
      id: bankData.id || crypto.randomUUID(),
      addedAt: new Date().toISOString(),
    };
    await updateDoc(userRef, {
      banks: arrayUnion(bank),
      updatedAt: new Date().toISOString(),
    });
    return { success: true, bank };
  } catch (error) {
    console.error('Ошибка добавления банка:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Удалить банк из профиля пользователя.
 * Считывает текущий массив, фильтрует и обновляет.
 */
export async function removeBank(userId, bankId) {
  try {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      return { success: false, error: 'Профиль не найден' };
    }

    const userData = snapshot.data();
    const updatedBanks = (userData.banks || []).filter(
      (bank) => bank.id !== bankId
    );

    await updateDoc(userRef, {
      banks: updatedBanks,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error('Ошибка удаления банка:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Обновить приоритеты (порядок) банков.
 * @param {string} userId
 * @param {Array} banks - полный массив банков с обновлённым порядком
 */
export async function updateBankPriorities(userId, banks) {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      banks,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    console.error('Ошибка обновления приоритетов:', error);
    return { success: false, error: error.message };
  }
}

/* ============================================
   Monthly Reports
   ============================================ */

/**
 * Сохранить месячный отчёт.
 * @param {string} userId
 * @param {string} yearMonth - формат "2025-01"
 * @param {object} data - данные отчёта
 */
export async function saveMonthlyReport(userId, yearMonth, data) {
  try {
    const reportRef = doc(db, 'users', userId, 'reports', yearMonth);
    await setDoc(reportRef, {
      ...data,
      yearMonth,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    console.error('Ошибка сохранения отчёта:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Удалить месячный отчёт.
 */
export async function deleteMonthlyReport(userId, yearMonth) {
  try {
    const reportRef = doc(db, 'users', userId, 'reports', yearMonth);
    await deleteDoc(reportRef);
    return { success: true };
  } catch (error) {
    console.error('Ошибка удаления отчёта:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Получить месячный отчёт.
 */
export async function getMonthlyReport(userId, yearMonth) {
  try {
    const reportRef = doc(db, 'users', userId, 'reports', yearMonth);
    const snapshot = await getDoc(reportRef);

    if (!snapshot.exists()) {
      return { success: false, error: 'Отчёт не найден' };
    }

    return { success: true, data: { id: snapshot.id, ...snapshot.data() } };
  } catch (error) {
    console.error('Ошибка получения отчёта:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Получить историю отчётов (все отчёты, отсортированные по дате).
 */
export async function getReportHistory(userId) {
  try {
    const reportsRef = collection(db, 'users', userId, 'reports');
    const q = query(reportsRef, orderBy('yearMonth', 'desc'));
    const snapshot = await getDocs(q);

    const reports = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    return { success: true, data: reports };
  } catch (error) {
    console.error('Ошибка получения истории отчётов:', error);
    return { success: false, error: error.message };
  }
}

/* ============================================
   Active Categories
   ============================================ */

/**
 * Сохранить текущие активные категории кешбэка.
 */
export async function saveActiveCategories(userId, data) {
  try {
    const categoriesRef = doc(
      db,
      'users',
      userId,
      'settings',
      'activeCategories'
    );
    await setDoc(categoriesRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    console.error('Ошибка сохранения категорий:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Получить текущие активные категории кешбэка.
 */
export async function getActiveCategories(userId) {
  try {
    const categoriesRef = doc(
      db,
      'users',
      userId,
      'settings',
      'activeCategories'
    );
    const snapshot = await getDoc(categoriesRef);

    if (!snapshot.exists()) {
      return { success: true, data: null };
    }

    return { success: true, data: snapshot.data() };
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    return { success: false, error: error.message };
  }
}

/* ============================================
   Dynamic Banks MCC Reference (Admin Collection)
   ============================================ */

/**
 * Получить список всех банков со справочником MCC из коллекции `banks_mcc_ref`.
 */
export async function getBanksMccRef() {
  try {
    const ref = collection(db, 'banks_mcc_ref');
    const snapshot = await getDocs(ref);
    const banks = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    return { success: true, data: banks };
  } catch (error) {
    console.error('Ошибка получения справочника банков:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Обновить или создать справочник банка в `banks_mcc_ref`.
 */
export async function updateBankMccRef(bankId, data) {
  try {
    const docRef = doc(db, 'banks_mcc_ref', bankId);
    await setDoc(docRef, {
      ...data,
      id: bankId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('Ошибка обновления справочника банка:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Инициализировать дефолтные банки в `banks_mcc_ref`, если коллекция пуста.
 */
export async function initDefaultBanksMccRef() {
  try {
    const ref = collection(db, 'banks_mcc_ref');
    const snapshot = await getDocs(ref);
    
    if (!snapshot.empty) {
      return { success: true, initialized: false };
    }

    const defaultBanks = [
      {
        id: 'alfa',
        name: 'Альфа-Банк',
        inn: '7728168971',
        maxCategories: 4,
        mccUrl: 'https://alfabank.ru/everyday/cashback/',
        categories: {
          'Аптеки': ['5912', '5122', '5292'],
          'Автоуслуги': ['5511', '5521', '5531', '5532', '5533', '7531', '7534', '7535', '7538'],
          'Топливо': ['5541', '5542', '5983'],
          'Супермаркеты': ['5411', '5422', '5451', '5462', '5499'],
          'Рестораны': ['5812', '5813', '5814'],
          'Транспорт': ['4111', '4112', '4131', '4789'],
          'Такси': ['4121'],
          'Красота': ['7230', '7297', '7298', '5977'],
          'Развлечения': ['7832', '7922', '7929', '7991', '7996', '7998'],
          'Одежда и обувь': ['5611', '5621', '5631', '5651', '5661', '5691', '5699'],
          'Путешествия': ['3000', '4511', '4722', '7011'],
          'Дом и ремонт': ['5200', '5211', '5231', '5251', '5712', '5713', '5719', '5722'],
          'Цветы': ['5992', '5193'],
          'Зоотовары': ['5995', '0742'],
          'Книги': ['5942', '2741', '5192'],
          'Спорттовары': ['5940', '5941', '3751'],
          'Образование': ['8211', '8220', '8241', '8244', '8249', '8299']
        }
      },
      {
        id: 'vtb',
        name: 'ВТБ',
        inn: '7702070139',
        maxCategories: 3,
        mccUrl: 'https://www.vtb.ru/personal/karty/debetovye/cashback/',
        categories: {
          'Аптеки': ['5912', '5122'],
          'Автоуслуги': ['5511', '5521', '5531', '7538'],
          'Супермаркеты': ['5411', '5422', '5451'],
          'Транспорт': ['4111', '4112'],
          'Такси': ['4121'],
          'Развлечения': ['7832', '7922', '7996'],
          'Образование': ['8299']
        }
      },
      {
        id: 'tinkoff',
        name: 'Т-Банк (Тинькофф)',
        inn: '7710140679',
        maxCategories: 4,
        mccUrl: 'https://www.tbank.ru/cards/debit-cards/tinkoff-black/cashback/',
        categories: {
          'Топливо': ['5541', '5542'],
          'Супермаркеты': ['5411', '5499'],
          'Транспорт': ['4111'],
          'Такси': ['4121'],
          'Красота': ['7230', '7298', '5977'],
          'Рестораны': ['5812', '5814'],
          'Образование': ['8211', '8220', '8299']
        }
      },
      {
        id: 'sber',
        name: 'СберБанк',
        inn: '7707083893',
        maxCategories: 3,
        mccUrl: 'https://www.sberbank.ru/ru/person/spasibo',
        categories: {
          'Супермаркеты': ['5411'],
          'Транспорт': ['4111'],
          'Такси': ['4121'],
          'Аптеки': ['5912'],
          'Образование': ['8211', '8299']
        }
      }
    ];

    for (const bank of defaultBanks) {
      const docRef = doc(db, 'banks_mcc_ref', bank.id);
      await setDoc(docRef, {
        ...bank,
        updatedAt: new Date().toISOString()
      });
    }

    return { success: true, initialized: true };
  } catch (error) {
    console.error('Ошибка инициализации справочника банков:', error);
    return { success: false, error: error.message };
  }
}

