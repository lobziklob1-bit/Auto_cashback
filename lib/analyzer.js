/**
 * Алгоритм оптимизации распределения категорий кешбэка
 */

import { MCC_CATEGORIES } from './constants';

/**
 * Оптимизирует выбор категорий кешбэка для нескольких банков на основе приоритетов.
 * 
 * Приоритет выбора:
 * 1. Процент больше (самое важное)
 * 2. Больше mcc кодов (шире охват категории)
 * 3. Приоритетность банков (выбирается карта, которой чаще пользуются)
 * 
 * @param {Array} userBanks - Список банков пользователя с приоритетами [ { id, name, priority, maxCategories } ]
 * @param {Object} availableCategories - Предложения банков { bankId: [ { name, percent } ] }
 * @returns {Object} { recommendation: { bankId: { selected: [], reasoning: "" } }, summary: [...] }
 */
const CATEGORY_SYNONYMS = {
  "Супермаркеты": ["супермаркеты", "продукты", "маркетплейсы", "сервис маркет", "продуктовые магазины", "гипермаркеты"],
  "Аптеки": ["аптеки", "здоровье", "товары для здоровья", "медицинские услуги", "медицина"],
  "Автоуслуги": ["автоуслуги", "автозапчасти", "авто", "покупка авто", "автосервис", "аксессуары"],
  "АЗС": ["азс", "сервис заправки", "топливо"],
  "Рестораны": ["рестораны", "кафе и рестораны", "фастфуд, кафе и рестораны", "фастфуд", "кафе", "общественное питание"],
  "Транспорт": ["транспорт", "такси", "аренда авто", "жд билеты", "авиабилеты"],
  "Красота": ["красота", "салоны красоты", "косметика"],
  "Развлечения": ["развлечения", "культура и искусство", "культура", "искусство", "кино", "активный отдых", "хобби", "аксессуары"],
  "Одежда и обувь": ["одежда и обувь", "одежда", "обувь", "ювелирные изделия"],
  "Путешествия": ["путешествия", "сервис тревел", "отели", "туризм"],
  "Дом и ремонт": ["дом и ремонт", "дом", "ремонт", "мебель", "бытовая техника", "техника"],
  "Цветы": ["цветы", "цветочные магазины", "подарки"],
  "Зоотовары": ["зоотовары", "животные", "товары для животных"],
  "Книги": ["книги", "книжные магазины", "канцелярия"],
  "Спорттовары": ["спорттовары", "спортивные товары", "спорт", "активный отдых", "фитнес"]
};

export function getBankMccForCategory(refBank, standardCategoryName) {
  if (!refBank || !refBank.categories) return [];
  
  // Если у банка есть точное совпадение с этой категорией, возвращаем её MCC немедленно!
  if (refBank.categories[standardCategoryName]) {
    return refBank.categories[standardCategoryName];
  }
  
  const synonyms = CATEGORY_SYNONYMS[standardCategoryName] || [standardCategoryName.toLowerCase()];
  let mergedMcc = [];
  
  // Перебираем все категории банка в справочнике
  Object.entries(refBank.categories).forEach(([bankCatName, mccList]) => {
    const normalizedBankCat = bankCatName.toLowerCase().trim();
    
    // Если оригинальное название категории банка совпадает с каким-либо синонимом
    const isMatched = synonyms.some(synonym => {
      return normalizedBankCat === synonym || 
             normalizedBankCat.includes(synonym) || 
             synonym.includes(normalizedBankCat);
    });
    
    if (isMatched && Array.isArray(mccList)) {
      mergedMcc = [...mergedMcc, ...mccList];
    }
  });
  
  // Убираем дубликаты MCC
  return Array.from(new Set(mergedMcc));
}

export function getCategoryImportanceWeight(categoryName, userCategoryPriorities = []) {
  const nameLower = categoryName.toLowerCase().trim();
  
  // Частные брендовые предложения, которые ВСЕГДА идут в самый конец (минимальный приоритет)
  const isBrand = nameLower.includes('деливери') || 
                  nameLower.includes('delivery') || 
                  nameLower.includes('бургер') || 
                  nameLower.includes('burger') || 
                  nameLower.includes('додо') || 
                  nameLower.includes('dodo') || 
                  nameLower.includes('яндекс лавка') || 
                  nameLower.includes('яндекс еда') || 
                  nameLower.includes('яндекс заправки') || 
                  nameLower.includes('кинопоиск') || 
                  nameLower.includes('самокат') || 
                  nameLower.includes('лента') ||
                  nameLower.includes('вкусвилл') ||
                  nameLower.includes('магнит') ||
                  nameLower.includes('пятерочка');

  if (isBrand) {
    return 10; // Минимальный приоритет для брендов
  }

  // Если у пользователя есть настроенные приоритеты категорий в профиле
  if (userCategoryPriorities && userCategoryPriorities.length > 0) {
    // Ищем нечеткое совпадение названия с пользовательским списком приоритетов
    const matchedIdx = userCategoryPriorities.findIndex(userCat => {
      const userCatLower = userCat.toLowerCase().trim();
      return nameLower === userCatLower || 
             nameLower.includes(userCatLower) || 
             userCatLower.includes(nameLower);
    });

    if (matchedIdx !== -1) {
      // Чем ближе к началу списка (индекс 0), тем больше баллов даем (максимально 1000 баллов, шаг 50)
      return Math.max(100, 1000 - (matchedIdx * 50));
    }
  }

  // Встроенные стандартные приоритеты (фоллбек, если список пуст)
  if (nameLower.includes('все покупки') || nameLower.includes('на всё') || nameLower === '1% на всё') {
    return 1000;
  }
  if (nameLower.includes('супермаркет') || nameLower === 'продукты') {
    return 900;
  }
  if (nameLower.includes('аптек') || nameLower === 'лекарства' || nameLower === 'здоровье') {
    return 800;
  }
  if (nameLower.includes('транспорт') || nameLower === 'такси' || nameLower === 'общественный транспорт') {
    return 700;
  }
  if (nameLower.includes('кафе') || nameLower.includes('ресторан') || nameLower.includes('фастфуд') || nameLower === 'еда') {
    return 600;
  }
  if (nameLower.includes('азс') || nameLower.includes('заправк') || nameLower.includes('бензин') || nameLower === 'топливо') {
    return 500;
  }

  // Средний приоритет для широких стандартных категорий
  const standardCategories = ['красота', 'развлечения', 'одежда', 'обувь', 'дом', 'ремонт', 'книги', 'спорт', 'путешествия', 'цветы', 'зоотовары'];
  const isStandard = standardCategories.some(cat => nameLower.includes(cat));
  if (isStandard) {
    return 300;
  }

  return 100; // Прочие неопознанные категории
}

export function optimizeCashback(userBanks, availableCategories, banksMccRef = [], userCategoryPriorities = []) {
  // 1. Приведение приоритетов банков к числовому значению (чем меньше число, тем выше приоритет, 0 = самый высокий)
  const bankPrioritiesMap = {};
  userBanks.forEach((bank, index) => {
    bankPrioritiesMap[bank.id] = bank.priority !== undefined ? bank.priority : index;
  });
 
  const maxCategoriesMap = {};
  userBanks.forEach((bank) => {
    maxCategoriesMap[bank.id] = bank.maxCategories || 3;
  });
 
  // 2. Собираем все доступные предложения в плоский список
  // Каждое предложение оценивается по Score
  const flatOffers = [];
 
  Object.entries(availableCategories).forEach(([bankId, categories]) => {
    const bankObj = userBanks.find(b => b.id === bankId);
    const bankName = bankObj 
      ? (bankObj.customName ? `${bankObj.name} (${bankObj.customName})` : bankObj.name) 
      : bankId;
    const bankPriority = bankPrioritiesMap[bankId] !== undefined ? bankPrioritiesMap[bankId] : 99;
 
    // Находим банк в динамическом справочнике MCC по bankRefId
    const refBank = banksMccRef.find(b => b.id === (bankObj?.bankRefId || bankId));
 
    categories.forEach((cat) => {
      // Ищем предопределенные MCC коды для этой категории у конкретного банка с учетом синонимов
      const bankMccList = getBankMccForCategory(refBank, cat.name);
      const fallbackMccList = MCC_CATEGORIES[cat.name]?.mcc || [];
      const finalMccList = bankMccList.length > 0 ? bankMccList : fallbackMccList;
      const mccCount = cat.mccCount || finalMccList.length || 1;

      // Рассчитываем ценность предложения (Score)
      // Приоритеты: 
      // 1. Вес важности категории (до 1000 баллов, настраивается пользователем)
      // 2. Процент кэшбэка (умноженный на 100 для стандартных категорий)
      // Для брендов (вес 10) множитель процента равен 5, чтобы они принудительно уходили в самый конец и не вытесняли стандартные категории.
      const bankScoreBonus = Math.max(0, 10 - bankPriority);
      const categoryWeight = getCategoryImportanceWeight(cat.name, userCategoryPriorities);
      const isBrandCategory = categoryWeight === 10;
      
      const percentMultiplier = isBrandCategory ? 5 : 100;
      const score = (cat.percent * percentMultiplier) + categoryWeight + (mccCount * 10) + bankScoreBonus;

      flatOffers.push({
        bankId,
        bankName,
        categoryName: cat.name,
        percent: cat.percent,
        mccCount,
        score,
        originalCat: cat
      });
    });
  });


  // Сортируем все предложения по Score в порядке убывания
  flatOffers.sort((a, b) => b.score - a.score);

  // 3. Распределяем категории
  const selectedByBank = {};
  userBanks.forEach((bank) => {
    selectedByBank[bank.id] = [];
  });

  const selectedCategoriesGlobal = new Set(); // Чтобы не дублировать категории между банками без необходимости

  // Шаг А: Жадный выбор уникальных категорий с наивысшей ценностью
  flatOffers.forEach((offer) => {
    const currentSelected = selectedByBank[offer.bankId] || [];
    const maxAllowed = maxCategoriesMap[offer.bankId] || 3;

    // Если в этом банке еще есть лимит И эта категория еще не выбрана глобально в лучшем месте
    if (currentSelected.length < maxAllowed && !selectedCategoriesGlobal.has(offer.categoryName)) {
      currentSelected.push(offer);
      selectedByBank[offer.bankId] = currentSelected;
      selectedCategoriesGlobal.add(offer.categoryName);
    }
  });

  // Шаг Б: Если у банков остались свободные слоты, заполняем их лучшими оставшимися предложениями (даже если категория дублируется)
  flatOffers.forEach((offer) => {
    const currentSelected = selectedByBank[offer.bankId] || [];
    const maxAllowed = maxCategoriesMap[offer.bankId] || 3;

    // Если лимит не превышен и это конкретное предложение (банк + категория) еще не выбрано в этом банке
    const alreadySelectedInThisBank = currentSelected.some(o => o.categoryName === offer.categoryName);

    if (currentSelected.length < maxAllowed && !alreadySelectedInThisBank) {
      currentSelected.push(offer);
      selectedByBank[offer.bankId] = currentSelected;
    }
  });

  // 4. Формируем финальную рекомендацию и текстовое обоснование
  const recommendation = {};
  const summary = [];

  userBanks.forEach((bank) => {
    const selectedOffers = selectedByBank[bank.id] || [];
    const selectedNames = selectedOffers.map(o => o.categoryName);
    
    // Генерируем обоснование для каждого выбранного предложения
    const reasonings = selectedOffers.map((offer) => {
      // Ищем, предлагали ли другие банки эту категорию
      const competitors = flatOffers.filter(
        o => o.categoryName === offer.categoryName && o.bankId !== offer.bankId
      );

      if (competitors.length === 0) {
        return `«${offer.categoryName}» (${offer.percent}%) — уникальное предложение, доступное только в этом банке.`;
      }

      // Проверяем, почему выбрали именно здесь
      const betterPercentCompetitors = competitors.filter(c => c.percent > offer.percent);
      const equalPercentCompetitors = competitors.filter(c => c.percent === offer.percent);

      if (betterPercentCompetitors.length > 0) {
        // Такое бывает из-за лимита категорий в других банках или приоритетов
        return `«${offer.categoryName}» (${offer.percent}%) — выбрано здесь, так как слоты в других банках заняты более выгодными категориями.`;
      }

      if (equalPercentCompetitors.length > 0) {
        // Процент равен, смотрим на MCC и приоритет банка
        const competitorWithMoreMcc = equalPercentCompetitors.find(c => c.mccCount > offer.mccCount);
        if (competitorWithMoreMcc) {
          return `«${offer.categoryName}» (${offer.percent}%) — выбрано из-за приоритета банка ${offer.bankName}, хотя в ${competitorWithMoreMcc.bankName} больше MCC-кодов.`;
        }
        
        const competitorWithSameMcc = equalPercentCompetitors.filter(c => c.mccCount === offer.mccCount);
        if (competitorWithSameMcc.length > 0) {
          return `«${offer.categoryName}» (${offer.percent}%) — процент и покрытие MCC равны с другими банками (${competitorWithSameMcc.map(c => c.bankName).join(', ')}), выбрано в ${offer.bankName} из-за более высокого приоритета этого банка для вас.`;
        }
      }

      return `«${offer.categoryName}» (${offer.percent}%) — является наиболее эффективным выбором среди всех ваших банков.`;
    });

    recommendation[bank.id] = {
      selected: selectedNames,
      offers: selectedOffers.map(o => ({ name: o.categoryName, percent: o.percent })),
      reasoning: reasonings.join(' ') || 'Рекомендуется выбрать базовые категории кешбэка.'
    };

    selectedOffers.forEach(o => {
      summary.push({
        bankId: bank.id,
        bankName: bank.customName ? `${bank.name} (${bank.customName})` : bank.name,
        category: o.categoryName,
        percent: o.percent,
        color: bank.color
      });
    });
  });

  return {
    recommendation,
    summary
  };
}
