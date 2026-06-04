import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const bankName = formData.get('bankName') || '';
    const allowedCategoriesStr = formData.get('allowedCategories') || '[]';
    const allowedCategories = JSON.parse(allowedCategoriesStr);

    if (!file) {
      return NextResponse.json({ success: false, error: 'Файл не передан' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey || apiKey.includes('FakeKey')) {
      return NextResponse.json({ 
        success: false, 
        error: 'API ключ Gemini не настроен. Пожалуйста, добавьте GEMINI_API_KEY в файл .env.local' 
      }, { status: 500 });
    }

    // Для анализа картинок используем gemini-3.1-flash-lite напрямую через API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

    // Считываем бинарный буфер файла
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');

    const prompt = `
      Ты — финансовый ассистент, специалист по кешбэкам в банках. 
      Проанализируй этот скриншот из мобильного приложения банка ${bankName}.
      Твоя задача — извлечь ВСЕ категории повышенного кешбэка, их точные проценты и пояснения (описания, условия) под ними, которые предложены на изображении.
      
      КРИТИЧЕСКИ ВАЖНОЕ ПРАВИЛО:
      Записывай названия категорий так, как они написаны на скриншоте, но СТРОГО очищай их от префиксов и суффиксов процентов или скидок (например, вместо "5% Одежда и обувь" запиши "Одежда и обувь", вместо "-100% Еда и Деливери" запиши "Еда и Деливери", вместо "Все покупки 2%" запиши "Все покупки").
      В названии должна остаться только чистая текстовая категория (например: "Все покупки на кассе", "Кафе, бары и рестораны", "Яндекс Такси", "Яндекс Лавка", "Яндекс Заправки", "Кинопоиск", "Аптеки", "Книги", "Еда и Деливери").
      Ни в коем случае НЕ обобщай, НЕ переименовывай и НЕ сокращай содержательную текстовую часть названий категорий до стандартных вариантов.
      
      ОПИСАНИЯ ПОД КАТЕГОРИЯМИ:
      Обрати особое внимание на мелкий серый шрифт под названиями категорий (например: "Кешбэк за поездки в тарифах Комфорт, Комфорт+ и Ultima", "Скидка на доставку", "Билеты в приложении или на сайте"). 
      Если под категорией есть такое пояснение, уточнение или описание условий, обязательно извлеки его и запиши в поле "description". Если пояснения нет, запиши null.
      
      Если на скриншоте перед категорией указан знак минус (например, "-100% Еда и Деливери"), запиши процент как положительное число (например, 100).
      
      Верни ответ СТРОГО в формате JSON:
      {
        "bankName": "${bankName}",
        "categories": [
          {
            "name": "Точное оригинальное название категории со скриншота",
            "percent": Число процентов без знака %,
            "description": "Текст мелкого пояснения под категорией, если он есть, иначе null"
          }
        ]
      }
    `;

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
                mimeType: file.type,
                data: base64Data
              }
            },
            { text: prompt }
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
      throw new Error(`Gemini API error (HTTP ${aiResponse.status}): ${googleErrorMsg || 'Unknown error'}`);
    }

    const resJson = await aiResponse.json();
    const responseText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('Пустой ответ от модели ИИ');
    }

    const parsedData = JSON.parse(responseText.trim());
    return NextResponse.json({ success: true, data: parsedData });

  } catch (error) {
    console.error('Ошибка в API роуте analyze-screenshot:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Ошибка сервера при анализе скриншота' 
    }, { status: 500 });
  }
}
