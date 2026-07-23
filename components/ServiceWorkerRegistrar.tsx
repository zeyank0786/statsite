'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker. Renders nothing — mounted once in the root
 * layout. `updateViaCache: 'none'` stops the browser serving a cached sw.js,
 * so worker updates actually reach devices.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((err) => console.error('Service worker registration failed:', err));
    };

    // Don't compete with the initial render for bandwidth
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
