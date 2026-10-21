import type { Metadata } from "next";
import "./theme.css";
import "./sidebar.css";
import "./surface.css";

export const metadata: Metadata = {
  title: "PrintHub · Панель драйверов",
  description: "Панель драйверов и управление пользователями",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
