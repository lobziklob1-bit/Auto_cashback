import Providers from "./providers";
import "./globals.css";

export const metadata = {
  title: "Авто Кешбэк — Оптимизация кешбэка с AI",
  description: "Оптимизируй кешбэк во всех банках с помощью искусственного интеллекта. Анализ категорий, распределение карт, умный помощник.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
