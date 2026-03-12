import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { setFilePickerActive } from './utils/cacheManager'
import { initTheme } from './hooks/useDarkMode'

// Apply saved theme before first render to prevent flash-of-light-mode
initTheme();


// Global guard: prevent PWA reload when system file picker is open
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file') {
    setFilePickerActive(true);
  }
}, true);

document.addEventListener('change', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file') {
    setFilePickerActive(false);
  }
}, true);

// Also guard programmatic .click() on file inputs
const origClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function () {
  if (this.type === 'file') {
    setFilePickerActive(true);
  }
  return origClick.call(this);
};

createRoot(document.getElementById("root")!).render(<App />);
