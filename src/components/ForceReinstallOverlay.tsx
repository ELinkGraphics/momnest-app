import React, { useEffect, useState } from 'react';
import { Smartphone, Trash2, DownloadCloud } from 'lucide-react';

export const ForceReinstallOverlay = () => {
  const [isOldPwa, setIsOldPwa] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone);
    
    // Check if the URL has the new ?app=serkle parameter from the updated manifest start_url
    const searchParams = new URLSearchParams(window.location.search);
    const hasNewStartUrl = searchParams.get('app') === 'serkle';
    
    // If it's a PWA but doesn't have the new start_url, it's the old MomsNest PWA
    if (isStandalone && !hasNewStartUrl) {
      setIsOldPwa(true);
    }
  }, []);

  if (!isOldPwa) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary">
          <Smartphone size={48} />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Action Required</h1>
          <p className="text-muted-foreground text-lg">
            We've fully rebranded to <strong>Serkle</strong>! To get the new app icon and name on your home screen, you must reinstall the app.
          </p>
        </div>

        <div className="bg-card border rounded-2xl p-6 text-left space-y-4 shadow-sm">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Trash2 className="text-destructive size-5" /> 
            Step 1: Uninstall
          </h3>
          <p className="text-muted-foreground text-sm pl-7">
            Delete this app from your home screen (long press the app icon and select Remove/Uninstall).
          </p>
          
          <div className="h-px bg-border w-full my-4"></div>
          
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <DownloadCloud className="text-primary size-5" /> 
            Step 2: Reinstall
          </h3>
          <p className="text-muted-foreground text-sm pl-7">
            Open your browser (Chrome or Safari), visit our site again, and tap "Add to Home Screen".
          </p>
        </div>
        
        <p className="text-xs text-muted-foreground mt-8">
          This screen will disappear automatically once you've reinstalled the new Serkle app.
        </p>
      </div>
    </div>
  );
};
