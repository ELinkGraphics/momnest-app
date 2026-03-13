import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coins, X } from 'lucide-react';

interface PremiumSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  price: string;
  setPrice: (price: string) => void;
  onSave: () => void;
}

export const PremiumSettingsModal: React.FC<PremiumSettingsModalProps> = ({
  isOpen,
  onClose,
  price,
  setPrice,
  onSave,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-background/80 backdrop-blur-xl border-border/50 shadow-2xl rounded-3xl p-6 overflow-hidden">
        <DialogHeader className="mb-6">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
            <Coins className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold">Premium Content Settings</DialogTitle>
          <DialogDescription>
            Set the number of coins required to unlock this post.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="premium-price" className="text-sm font-semibold text-foreground/80 ml-1">Unlock Price (Coins)</Label>
            <div className="relative">
              <Input
                id="premium-price"
                type="number"
                min="1"
                max="10000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="50"
                className="bg-muted/10 border-border/50 rounded-xl pl-10 h-12 text-lg font-bold focus:ring-amber-500/20 focus:border-amber-500/30"
              />
              <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[10, 25, 50, 100, 500].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrice(String(p))}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all duration-200 ${
                  price === String(p)
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                    : 'bg-muted/10 border-border/50 hover:border-amber-500/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {p} 🪙
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border-border/50 font-semibold"
            >
              Cancel
            </Button>
            <Button 
              onClick={onSave}
              className="flex-1 h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-lg shadow-amber-500/20"
            >
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
