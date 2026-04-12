import { useEffect, useRef, useCallback } from 'react';

const SESSION_TIMEOUT = 45 * 60 * 1000; // 45 minutes
const WARNING_BEFORE  =  5 * 60 * 1000; // show warning 5 min before logout

/**
 * Resets a 45-minute inactivity timer on every user interaction.
 * Dispatches 'session-warning' CustomEvent at the 40-minute mark.
 * Calls onLogout() at 45 minutes.
 *
 * @param onLogout  called when the session expires
 * @param active    set false to disable (e.g. when no user is logged in)
 */
export function useSessionTimeout(onLogout: () => void, active = true) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Warning fires 5 minutes before logout
    warningRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('session-warning'));
    }, SESSION_TIMEOUT - WARNING_BEFORE);

    // Auto-logout at 45 minutes
    timeoutRef.current = setTimeout(() => {
      onLogout();
    }, SESSION_TIMEOUT);
  }, [onLogout]);

  useEffect(() => {
    if (!active) return;

    const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;
    const handleActivity = () => resetTimer();

    EVENTS.forEach(e => document.addEventListener(e, handleActivity, { passive: true }));
    resetTimer();

    return () => {
      EVENTS.forEach(e => document.removeEventListener(e, handleActivity));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [resetTimer, active]);
}
