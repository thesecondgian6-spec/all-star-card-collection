import './globals.css';
import { AuthProvider } from '../lib/AuthProvider';

export const metadata = {
  title: 'All Star Card Collection — Roll. Collect. Flex.',
  description: 'An anime-inspired card collecting idle game.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800;900&family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shooting-star" />
        <div className="shooting-star" />
        <div className="shooting-star" />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
