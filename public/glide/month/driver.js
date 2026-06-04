window.addEventListener("message", function(event) {
  const { origin, data: { key, params } } = event;
  let result = "";
  
  try {
    const p1 = params[0];
    if (p1) {
      const data = JSON.parse(p1);
      result = data.month || "";
    }
  } catch (e) {
    result = "";
  }
  
  event.source.postMessage({ key, result }, "*");
});
