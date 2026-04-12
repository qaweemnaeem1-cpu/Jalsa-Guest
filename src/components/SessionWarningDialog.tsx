import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

/**
 * Listens for the 'session-warning' CustomEvent (fired by useSessionTimeout at
 * the 40-minute mark) and shows a countdown dialog.
 *
 * Any click or keydown on the document dismisses the dialog — and because those
 * same events reset the inactivity timer in useSessionTimeout, the session is
 * automatically extended when the user interacts.
 */
export function SessionWarningDialog() {
  const [show, setShow] = useState(false);
  const [countdown, setCountdown] = useState(300); // 5 min in seconds

  // Listen for the warning event
  useEffect(() => {
    const handleWarning = () => {
      setShow(true);
      setCountdown(300);
    };
    window.addEventListener('session-warning', handleWarning);
    return () => window.removeEventListener('session-warning', handleWarning);
  }, []);

  // Count down every second while visible
  useEffect(() => {
    if (!show) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [show]);

  // First click or keydown anywhere dismisses the dialog (the activity also
  // resets the inactivity timer via useSessionTimeout's event listeners)
  useEffect(() => {
    if (!show) return;
    const dismiss = () => setShow(false);
    document.addEventListener('mousedown', dismiss, { once: true });
    document.addEventListener('keydown',   dismiss, { once: true });
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown',   dismiss);
    };
  }, [show]);

  if (!show) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm mx-4 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 text-amber-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Session Expiring</h3>
        <p className="text-sm text-gray-600 mb-4">
          You'll be logged out in{' '}
          <span className="font-bold text-amber-600">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
          {' '}due to inactivity.
        </p>
        <button
          onClick={() => setShow(false)}
          className="w-full bg-[#2D5A45] text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-[#234a38] transition-colors"
        >
          I'm still here — keep me logged in
        </button>
      </div>
    </div>
  );
}
