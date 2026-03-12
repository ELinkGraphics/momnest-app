import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAndroid } from '@/lib/capacitorUtils';

/**
 * Handles the Android hardware back button.
 * - Navigates back if history is available.
 * - Minimises (backgrounds) the app if at the root, to avoid accidental closure.
 */
export const useAndroidBackButton = () => {
    const navigate = useNavigate();

    useEffect(() => {
        if (!isAndroid()) return;

        let handle: { remove: () => void } | undefined;

        (async () => {
            const { App } = await import('@capacitor/app');

            handle = await App.addListener('backButton', ({ canGoBack }) => {
                if (canGoBack) {
                    navigate(-1);
                } else {
                    // Minimise the app instead of closing it
                    App.minimizeApp();
                }
            });
        })();

        return () => {
            if (handle) handle.remove();
        };
    }, [navigate]);
};
