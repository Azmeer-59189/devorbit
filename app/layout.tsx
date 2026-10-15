import type {Metadata} from 'next';
import './globals.css';
import './theme.css';
export const metadata: Metadata = {
  title: 'DevOrbit — Developer operations',
  description: 'Your team, websites, and work. In one orbit.',
  icons: {icon: '/logo.svg'},
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
