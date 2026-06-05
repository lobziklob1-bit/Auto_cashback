window.addEventListener("message", function(event) {
  const { origin, data: { key, params } } = event;
  let result = "";
  
  try {
    const p1Raw = params && params[0];
    const p1 = (p1Raw && typeof p1Raw === 'object' && 'value' in p1Raw) ? p1Raw.value : p1Raw;
    
    if (p1) {
      const data = JSON.parse(p1);
      const month = data.m || "Отчет";
      const groups = data.g || {};
      
      let html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 12px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 480px; margin: 0 auto;">`;
      html += `<h3 style="margin: 0 0 12px 0; font-size: 15px; color: #1e293b; text-align: center; font-weight: 700;">Отчет по кешбэку за ${month}</h3>`;
      html += `<table style="width: 100%; border-collapse: collapse; font-size: 12px;">`;
      html += `<thead><tr style="border-bottom: 2px solid #e2e8f0; color: #64748b;"><th style="padding: 6px 4px; text-align: left; font-weight: 600;">Банк</th><th style="padding: 6px 4px; text-align: left; font-weight: 600;">Карта и Категории</th></tr></thead><tbody>`;
      
      Object.entries(groups).forEach(([bankName, cards]) => {
        cards.forEach((card, idx) => {
          const cardName = card.n || "Основная карта";
          const logo = card.l || "🏦";
          const categoriesText = card.c && card.c.length > 0 
            ? card.c.map(cat => `<span style="background: #eff6ff; color: #1d4ed8; padding: 2px 5px; border-radius: 4px; font-size: 10.5px; font-weight: 600; display: inline-block; margin: 2px 1px;">${cat.p}% ${cat.n}</span>`).join(' ')
            : `<span style="color: #94a3b8; font-size: 10.5px;">Нет категорий</span>`;
          
          html += `<tr style="border-bottom: 1px solid #f1f5f9;">`;
          if (idx === 0) {
            html += `<td rowspan="${cards.length}" style="padding: 8px 4px; font-weight: 700; color: #0f172a; vertical-align: top; width: 35%;">${logo} ${bankName}</td>`;
          }
          html += `<td style="padding: 8px 4px;"><div style="font-weight: 600; color: #334155; margin-bottom: 3px; font-size: 11.5px;">💳 ${cardName}</div><div>${categoriesText}</div></td>`;
          html += `</tr>`;
        });
      });
      
      html += `</tbody></table></div>`;
      result = html;
    }
  } catch (e) {
    result = "";
  }
  
  event.source.postMessage({ key, result }, "*");
});
