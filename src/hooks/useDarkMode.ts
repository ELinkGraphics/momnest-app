import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'momsnest-theme';

function applyTheme(dark: boolean) {
    if (dark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

export function useDarkMode() {
    const [isDark, setIsDark] = useState<boolean>(() => {
        // Read from localStorage, defaulting to dark
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) return stored === 'dark';
        // Default: dark mode on
        return true;
    });

    // Apply class on mount and whenever isDark changes
    useEffect(() => {
        applyTheme(isDark);
        localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    }, [isDark]);

    const toggle = useCallback(() => setIsDark(prev => !prev), []);

    return { isDark, toggle };
}

/** Call this once at app startup (before React renders) to prevent flash of light mode */
export function initTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    const dark = stored !== null ? stored === 'dark' : true; // default dark
    applyTheme(dark);
}
