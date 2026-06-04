export default function (p1) {
  try {
    if (!p1) return "";
    // Если Glide передает строку в кавычках или с экранированием, JSON.parse разберет её
    const data = JSON.parse(p1);
    return data.html || "";
  } catch (e) {
    return "";
  }
}
