export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    void window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('/service-worker.js');
      } catch (error) {
        console.error('Service worker registration failed', error);
      }
    });
  }
}
