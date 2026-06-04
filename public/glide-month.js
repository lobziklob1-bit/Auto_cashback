export default function (p1) {
  try {
    if (!p1) return "";
    const data = JSON.parse(p1);
    return data.month || "";
  } catch (e) {
    return "";
  }
}
