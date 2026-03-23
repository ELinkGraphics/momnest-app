import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, X, ShieldCheck, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChapaPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutUrl: string;
}

const ChapaPaymentModal: React.FC<ChapaPaymentModalProps> = ({ isOpen, onClose, checkoutUrl }) => {
  const [isLoading, setIsLoading] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] animate-fade-in isolate flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Secure Payment</h1>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
              <ShieldCheck className="w-2.5 h-2.5 text-green-500" />
              Powered by Chapa
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-9 w-9">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Main Content (Iframe) */}
      <div className="relative flex-1 bg-muted/20 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Initializing secure connection...</p>
          </div>
        )}
        
        <iframe
          src={checkoutUrl}
          className={cn(
            "w-full h-full border-none transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setIsLoading(false)}
          title="Chapa Payment Checkout"
          allow="payment; publickey-credentials-get"
        />
      </div>

      {/* Footer / Instructions */}
      <div className="p-4 bg-background border-t border-border/30 text-center">
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Complete your payment in the secure window above. Once done, click the 
          <span className="font-semibold text-foreground mx-1">X</span> 
          to return to your wallet and verify your balance.
        </p>
      </div>
    </div>
  );
};

export default ChapaPaymentModal;
