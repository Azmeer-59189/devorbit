import type {Metadata} from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'IHHN DevDesk — Developer operations',
  description: 'The IHHN developers team workspace for websites, SEO, and tasks.',
  icons: {icon: '/logo.svg'},
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
