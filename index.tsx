import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("[YOLO] Critical Boot Failure:", error);
  rootElement.innerHTML = `
    <div style="background: #000; color: #ef4444; padding: 40px; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
      <h1 style="font-size: 24px; font-weight: 900; margin-bottom: 10px;">BOOT_SEQUENCE_FAILED</h1>
      <p style="color: #666; font-size: 14px; max-width: 400px; line-height: 1.6;">${error instanceof Error ? error.message : 'Unknown fatal error'}</p>
      <button onclick="window.location.reload()" style="margin-top: 30px; padding: 12px 24px; background: #ef4444; color: white; border: none; border-radius: 12px; font-weight: bold; cursor: pointer;">Reset Protocol</button>
    </div>
  `;
}