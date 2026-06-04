window.addEventListener("message", function(event) {
  const { origin, data: { key, params } } = event;
  let result = "";
  
  try {
    const p1Raw = params && params[0];
    const p1 = (p1Raw && typeof p1Raw === 'object' && 'value' in p1Raw) ? p1Raw.value : p1Raw;
    
    if (p1) {
      const data = JSON.parse(p1);
      result = data.month || "";
    }
  } catch (e) {
    result = "";
  }
  
  event.source.postMessage({ key, result }, "*");
});
