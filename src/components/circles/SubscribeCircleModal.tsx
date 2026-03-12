import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Check, Coins, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCoinWallet } from '@/hooks/useCoinWallet';
import { useUser } from '@/contexts/UserContext';

interface SubscribeCircleModalProps {
  isOpen: boolean;
  onClose: () => void;
  circleId: string;
  circleName: string;
  subscriptionPrice?: number;
  onSubscribed: () => void;
}

const FALLBACK_COST = 10;

export const SubscribeCircleModal: React.FC<SubscribeCircleModalProps> = ({
  isOpen,
  onClose,
  circleId,
  circleName,
  subscriptionPrice,
  onSubscribed,
}) => {
  const [isSubscribing, setIsSubscribing] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const SUBSCRIPTION_COST = subscriptionPrice ?? FALLBACK_COST;
  const { balance, spendCoins } = useCoinWallet(user?.id);
  const hasEnoughCoins = balance >= SUBSCRIPTION_COST;

  const handleSubscribe = async () => {
    if (!hasEnoughCoins) {
      toast({ title: 'Insufficient coins', description: `You need ${SUBSCRIPTION_COST} coins to subscribe.`, variant: 'destructive' });
      return;
    }

    setIsSubscribing(true);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Deduct coins first
      await spendCoins.mutateAsync({
        amount: SUBSCRIPTION_COST,
        type: 'subscription',
        referenceId: circleId,
        description: `Subscription to ${circleName}`,
      });

      const { error } = await supabase
        .from('circle_subscriptions')
        .insert({
          circle_id: circleId,
          user_id: authUser.id,
          status: 'active',
        });

      if (error) {
        if (error.code === '23505') {
          const { error: updateError } = await supabase
            .from('circle_subscriptions')
            .update({ status: 'active', expires_at: null })
            .eq('circle_id', circleId)
            .eq('user_id', authUser.id);
          if (updateError) throw updateError;
        } else {
          throw error;
        }
      }

      toast({
        title: "Subscribed successfully!",
        description: `${SUBSCRIPTION_COST} coins deducted. You now have access to premium content in ${circleName}`,
      });

      onSubscribed();
      onClose();
    } catch (error: any) {
      console.error('Error subscribing:', error);
      toast({ title: "Subscription failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            Subscribe to {circleName}
          </DialogTitle>
          <DialogDescription>
            Get access to premium content and exclusive posts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Benefits */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">What you'll get:</h4>
            <ul className="space-y-2">
              {[
                'Access to all premium posts',
                'Exclusive content from circle owner',
                'Early access to announcements',
                'Support the circle community',
              ].map((benefit, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Cost */}
          <div className="bg-accent/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Subscription cost</span>
              <div className="flex items-center gap-1">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="font-bold">{SUBSCRIPTION_COST} coins</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Your balance</span>
              <span>{balance.toLocaleString()} coins</span>
            </div>
          </div>

          {!hasEnoughCoins && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4" />
              Insufficient coins. Top up your wallet first.
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={isSubscribing}>
              Cancel
            </Button>
            <Button onClick={handleSubscribe} disabled={isSubscribing || !hasEnoughCoins} className="gap-2">
              <Coins className="w-4 h-4" />
              {isSubscribing ? 'Processing...' : `Subscribe (${SUBSCRIPTION_COST} coins)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
