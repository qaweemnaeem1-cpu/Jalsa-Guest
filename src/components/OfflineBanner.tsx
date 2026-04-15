import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-[60] flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-md">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You're offline — some features may be unavailable</span>
    </div>
  );
}
