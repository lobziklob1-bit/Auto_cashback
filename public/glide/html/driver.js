window.addEventListener("message", function(event) {
  // Проверяем, что в сообщении есть нужная структура данных
  const { origin, data: { key, params } } = event;
  let result = "";
  
  try {
    const p1 = params[0];
    if (p1) {
      // Пытаемся распарсить JSON, который передан из URL-параметра report_data
      const data = JSON.parse(p1);
      result = data.html || "";
    }
  } catch (e) {
    result = "";
  }
  
  // Возвращаем результат обратно в Glide
  event.source.postMessage({ key, result }, "*");
});
