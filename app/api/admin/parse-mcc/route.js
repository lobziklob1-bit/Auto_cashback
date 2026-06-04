import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(req) {
  try {
    const { bankId } = await req.json();

    if (!bankId) {
      return NextResponse.json({ success: false, error: 'Идентификатор банка не передан' }, { status: 400 });
    }

    // Получаем ссылку банка из Firestore
    const bankDocRef = doc(db, 'banks_mcc_ref', bankId);
    const bankSnap = await getDoc(bankDocRef);

    if (!bankSnap.exists()) {
      return NextResponse.json({ success: false, error: 'Банк не найден в системе' }, { status: 404 });
    }

    const bankData = bankSnap.data();
    const { mccUrl, name } = bankData;

    if (!mccUrl) {
      return NextResponse.json({ success: false, error: 'У банка не указана ссылка на MCC-коды' }, { status: 400 });
    }

    let parsedCategories = null;

    try {
      console.log(`Starting parsing for ${name} from URL: ${mccUrl}`);

      // 1. Загружаем документ по ссылке
      const response = await fetch(mccUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        next: { revalidate: 0 } // Отключаем Next.js кэш
      });

      if (!response.ok) {
        throw new Error(`Не удалось загрузить документ с сайта банка (HTTP статус ${response.status})`);
      }

      // Определяем, PDF это или HTML
      const contentType = response.headers.get('content-type') || '';
      const isPdf = mccUrl.toLowerCase().split('?')[0].endsWith('.pdf') || contentType.includes('application/pdf');
      
      const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey || apiKey.includes('FakeKey')) {
        throw new Error('API ключ Gemini не настроен. Пожалуйста, добавьте GEMINI_API_KEY в файл .env.local');
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

      const systemPrompt = `
        Ты — профессиональный ИИ-парсер тарифов банков и правил начисления повышенного кешбэка. Перед тобой официальный документ банка (PDF или HTML-страница) со списком MCC-кодов и соответствующих им категорий повышенного кешбэка.
        
        Твоя задача — тщательно проанализировать весь документ и извлечь ВСЕ реально существующие в нем категории повышенного кешбэка (их может быть много, например, до 50 категорий) и точный список соответствующих им 4-значных MCC-кодов.
        
        Правила парсинга:
        1. Извлекай оригинальные названия категорий, как они указаны в документе банка (например: "Спортивные товары", "Супермаркеты", "Продукты", "Маркетплейсы", "Такси", "Дом и ремонт", "Медицинские услуги" и т.д.). Не пытайся сократить их или объединить в какой-то стандартный список! Сохраняй исходную полноту документа.
        2. Для каждой категории выдели СТРОГО те 4-значные MCC-коды, которые явно указаны для нее в документе.
        3. Будь предельно аккуратен и точен: не допускай перекрестного смешивания кодов! Например, MCC-коды спортивных товаров (5655, 5940, 5941) должны находиться ИСКЛЮЧИТЕЛЬНО в категории "Спортивные товары" (или "Активный отдых"), и ни в коем случае не должны дублироваться или попадать в категории "Супермаркеты" или "Продукты". Каждому коду — свое место по тексту документа.
        
        Верни результат СТРОГО в формате JSON, где ключами являются оригинальные названия категорий из документа, а значениями — массивы строковых 4-значных MCC-кодов.
        
        Пример структуры ответа:
        {
          "Спортивные товары": ["5655", "5940", "5941"],
          "Супермаркеты": ["5411", "5422"],
          "Маркетплейсы": ["5300"],
          "Такси": ["4121"]
        }
        
        Не выводи никаких объяснений, преамбул, Markdown разметки. Только валидный JSON.
      `;

      if (isPdf) {
        console.log(`Processing PDF document with Gemini native multimodal parsing...`);
        
        // Читаем бинарный буфер PDF
        const buffer = await response.arrayBuffer();
        
        // Кодируем PDF в Base64 для передачи inline в Gemini API
        const base64Pdf = Buffer.from(buffer).toString('base64');

        // Вызываем Gemini API, передавая PDF напрямую как inlineData
        const aiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: base64Pdf
                  }
                },
                { text: systemPrompt }
              ]
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        });

        if (!aiResponse.ok) {
          let googleErrorMsg = '';
          try {
            const errJson = await aiResponse.json();
            if (errJson?.error?.message) {
              googleErrorMsg = errJson.error.message;
            }
          } catch (_) {}

          if (aiResponse.status === 403) {
            throw new Error(`Ошибка авторизации Gemini API (HTTP 403). Убедитесь, что ключ активен и поддерживает Generative Language API. Детали: ${googleErrorMsg}`);
          }
          if (aiResponse.status === 429) {
            throw new Error(`Лимит запросов Gemini API исчерпан (HTTP 429). Баланс вашего аккаунта Google AI Studio исчерпан. Пожалуйста, пополните счет или используйте бесплатный тариф. Детали: ${googleErrorMsg}`);
          }
          throw new Error(`Gemini API вернул ошибку при анализе PDF-файла (HTTP ${aiResponse.status}). Детали: ${googleErrorMsg || 'Неизвестная ошибка'}`);
        }

        const aiData = await aiResponse.json();
        const rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        parsedCategories = JSON.parse(rawText.trim());

      } else {
        console.log(`Processing standard HTML webpage...`);
        const html = await response.text();

        // Очищаем HTML от скриптов, стилей и лишних блоков
        const cleanText = html
          .replace(/<(script|style|svg|noscript|header|footer|nav)[^>]*>([\s\S]*?)<\/\1>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 150000) // Ограничиваем размер контента до 150к символов
          .trim();

        if (!cleanText || cleanText.length < 50) {
          throw new Error('Получен пустой контент страницы. Не удалось извлечь текст для ИИ-парсинга.');
        }

        // Вызываем Gemini API для текстового HTML содержимого
        const aiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `Содержимое страницы тарифов:\n\n${cleanText}` },
                { text: systemPrompt }
              ]
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        });

        if (!aiResponse.ok) {
          let googleErrorMsg = '';
          try {
            const errJson = await aiResponse.json();
            if (errJson?.error?.message) {
              googleErrorMsg = errJson.error.message;
            }
          } catch (_) {}

          if (aiResponse.status === 403) {
            throw new Error(`Ошибка авторизации Gemini API (HTTP 403). Убедитесь, что ключ активен и поддерживает Generative Language API. Детали: ${googleErrorMsg}`);
          }
          if (aiResponse.status === 429) {
            throw new Error(`Лимит запросов Gemini API исчерпан (HTTP 429). Баланс вашего аккаунта Google AI Studio исчерпан. Пожалуйста, пополните счет или используйте бесплатный тариф. Детали: ${googleErrorMsg}`);
          }
          throw new Error(`Gemini API вернул ошибку при анализе HTML-текста (HTTP ${aiResponse.status}). Детали: ${googleErrorMsg || 'Неизвестная ошибка'}`);
        }

        const aiData = await aiResponse.json();
        const rawText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        parsedCategories = JSON.parse(rawText.trim());
      }

      // 2. Валидируем извлеченные категории
      if (!parsedCategories || Object.keys(parsedCategories).length === 0) {
        throw new Error('ИИ Gemini не смог извлечь структуру категорий кешбэка и MCC-кодов из предоставленного документа. Убедитесь, что в файле/на странице содержится текстовая таблица с MCC-кодами.');
      }

    } catch (parseErr) {
      console.error('API MCC Parsing failed:', parseErr.message);
      return NextResponse.json({ 
        success: false, 
        error: parseErr.message 
      }, { status: 400 });
    }

    // Очищаем извлеченные категории от дубликатов и невалидных MCC-кодов
    const cleanCategories = {};
    if (parsedCategories) {
      Object.entries(parsedCategories).forEach(([catName, codes]) => {
        if (Array.isArray(codes)) {
          // Оставляем только уникальные, корректные 4-значные MCC
          const uniqueCodes = Array.from(new Set(
            codes
              .map(c => String(c).trim())
              .filter(c => c.length === 4 && /^\d+$/.test(c))
          ));
          cleanCategories[catName] = uniqueCodes;
        } else {
          cleanCategories[catName] = [];
        }
      });
    }

    // 3. Сохраняем успешно распарсенные данные банка в Firestore
    await updateDoc(bankDocRef, {
      categories: cleanCategories,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      bankId,
      name,
      categories: cleanCategories,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Critical Admin Parse endpoint error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
