/**
 * Модуль интеграции с Gemini AI через Firebase AI Logic или стандартное API
 */


// Инициализация AI Logic (выполняется лениво только в браузере)
let aiInstance = null;
let aiModel = null;
let visionModel = null;
let isInitializing = false;

async function initAI() {
  if (typeof window === 'undefined') return null;
  if (aiModel && visionModel) return { aiModel, visionModel };
  
  // Если уже инициализируется, ждем немного
  if (isInitializing) {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (aiModel && visionModel) return { aiModel, visionModel };
    }
  }

  isInitializing = true;
  try {
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai');
    const { app } = await import('./firebase');

    if (app) {
      aiInstance = getAI(app, { backend: new GoogleAIBackend() });
      
      // Модель для текстовых задач и чата
      aiModel = getGenerativeModel(aiInstance, { 
        model: 'gemini-3.1-flash-lite',
        generationConfig: {
          temperature: 0.2
        }
      });

      // Модель для анализа скриншотов (мультимодальная)
      visionModel = getGenerativeModel(aiInstance, {
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });
    }
  } catch (e) {
    console.error('Ошибка ленивой инициализации Firebase AI:', e);
  } finally {
    isInitializing = false;
  }

  return { aiModel, visionModel };
}

/**
 * Вспомогательная функция для конвертации файла в base64 для передачи в Gemini
 */
export async function fileToGenerativePart(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type
        }
      });
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Анализирует скриншот кешбэка с помощью Gemini Vision.
 * 
 * @param {File} file - Файл скриншота
 * @param {string} bankName - Имя банка
 */
export async function analyzeScreenshot(file, bankName = '', allowedCategories = []) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bankName', bankName);
    formData.append('allowedCategories', JSON.stringify(allowedCategories));

    const response = await fetch('/api/analyze-screenshot', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let serverError = 'Ошибка на стороне сервера';
      try {
        const errJson = await response.json();
        if (errJson?.error) {
          serverError = errJson.error;
        }
      } catch (_) {}
      throw new Error(serverError);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Ошибка при обращении к API распознавания скриншотов:', error);
    return { success: false, error: error.message || 'Не удалось распознать скриншот' };
  }
}


/**
 * Отвечает на вопрос пользователя "какой картой платить" на основе активных категорий.
 */
export async function askWhichCardToUse(question, activeCategories, userBanks) {
  let categoriesContext = '';
  Object.entries(activeCategories || {}).forEach(([bankId, categories]) => {
    const bank = userBanks.find(b => b.id === bankId);
    const bankName = bank ? bank.name : bankId;
    
    categoriesContext += `Банк: ${bankName}\n`;
    if (categories && categories.length > 0) {
      categories.forEach(cat => {
        categoriesContext += `- Категория: "${cat.name}", Процент: ${cat.percent}%, MCC: ${cat.mccCodes && cat.mccCodes.length > 0 ? cat.mccCodes.join(', ') : 'стандартные'}\n`;
      });
    } else {
      categoriesContext += `- Нет выбранных категорий (базовый кешбэк)\n`;
    }
    categoriesContext += '\n';
  });

  const prompt = `
    Ты — умный финансовый ассистент приложения «Авто Кешбэк».
    Вот активные карты и категории кешбэка пользователя:
    ${categoriesContext}
    
    Пользователь спрашивает: "${question}"
    
    Определи подходящую категорию. Сравни проценты.
    Сформулируй краткий и четкий ответ (2-3 предложения) на русском с эмодзи.
    Выдели жирным шрифтом название рекомендуемой карты, например: **Альфа-Банк**.
  `;

  try {
    const models = await initAI();
    const currentAiModel = models?.aiModel;

    if (!currentAiModel) {
      throw new Error('AI модель недоступна через Firebase SDK. Пробуем прямой API-запрос.');
    }

    const result = await currentAiModel.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.warn('Ошибка при обращении к Firebase Vertex AI, пробуем резервный прямой API-запрос:', error.message || error);
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey || apiKey.startsWith('AIzaSyFakeKey')) {
        throw new Error('Нет валидного API ключа Gemini в .env.local');
      }

      // Используем модель gemini-2.5-flash напрямую через REST API Google AI Studio
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.2
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Ошибка прямого API: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text;
      }
    } catch (fallbackError) {
      console.warn('Резервный запрос к Gemini API также не удался:', fallbackError.message || fallbackError);
    }

    return '⚠️ **ИИ-ассистент временно недоступен.**\n\nДля работы чата требуется настроить доступ к Gemini API. Пожалуйста, убедитесь, что в файле `.env.local` указан валидный ключ `NEXT_PUBLIC_FIREBASE_API_KEY`, а в панели Firebase включена функция **Firebase AI Logic (Google AI Edge / Gemini API)**.';
  }
}



