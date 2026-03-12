import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CoinWallet {
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
}

export interface CoinTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  reference_id: string | null;
  description: string;
  balance_after: number;
  created_at: string;
}

export interface ChapaBank {
  id: number;
  swift: string;
  name: string;
  acct_length: number;
  country_id: number;
  created_at: string;
  updated_at: string;
}

async function callEdgeFunction(
  name: string,
  body: Record<string, unknown> | null,
  method: 'POST' | 'GET' = 'POST'
) {
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token;

  // Supabase REST endpoint format
  const url = `${(supabase as any).supabaseUrl}/functions/v1/${name}`;
  
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: (supabase as any).supabaseKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export function useCoinWallet(userId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: wallet, isLoading: isWalletLoading } = useQuery({
    queryKey: ['coin-wallet', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('coin_wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as CoinWallet | null;
    },
    enabled: !!userId,
  });

  const { data: transactions, isLoading: isTransactionsLoading } = useQuery({
    queryKey: ['coin-transactions', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('coin_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as CoinTransaction[];
    },
    enabled: !!userId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['coin-wallet', userId] });
    queryClient.invalidateQueries({ queryKey: ['coin-transactions', userId] });
  };

  // ─── TOP UP: Initiate Chapa checkout ─────────────────────────────────────
  const initiateTopUp = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      return callEdgeFunction('chapa-initialize', { amount });
    },
    onSuccess: (data) => {
      // Store txRef so we can verify after the user returns from Chapa
      localStorage.setItem('chapa_pending_txref', data.txRef);
      // Open Chapa checkout in a new tab
      window.open(data.checkoutUrl, '_blank');
    },
    onError: (err: any) => {
      toast({
        title: 'Could not initiate payment',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // ─── TOP UP: Verify after returning from Chapa ───────────────────────────
  const verifyTopUp = useMutation({
    mutationFn: async ({ txRef }: { txRef: string }) => {
      return callEdgeFunction('chapa-verify', { txRef });
    },
    onSuccess: (data) => {
      localStorage.removeItem('chapa_pending_txref');
      if (data.status === 'success') {
        invalidate();
        toast({
          title: '🎉 Top-up successful!',
          description: `${data.amount} coins have been added to your wallet.`,
        });
      } else if (data.status === 'already_credited') {
        toast({ title: 'Already processed', description: data.message });
      } else {
        toast({
          title: 'Payment not completed',
          description: 'Your payment did not go through. Please try again.',
          variant: 'destructive',
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: 'Verification failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Keep a simple direct topUp (demo/internal) for non-Chapa use
  const topUp = useMutation({
    mutationFn: async ({ amount, paymentMethod = 'demo' }: { amount: number; paymentMethod?: string }) => {
      const { data, error } = await supabase.rpc('topup_coins', {
        _user_id: userId!,
        _amount: amount,
        _payment_method: paymentMethod,
      });
      if (error) throw error;
      if (!data) throw new Error('Top-up failed');
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Top-up successful!', description: 'Coins have been added to your wallet.' });
    },
    onError: (err: any) => {
      toast({ title: 'Top-up failed', description: err.message, variant: 'destructive' });
    },
  });

  const transferCoins = useMutation({
    mutationFn: async ({
      receiverId,
      amount,
      typeSent,
      typeReceived,
      referenceId,
      description,
    }: {
      receiverId: string;
      amount: number;
      typeSent: string;
      typeReceived: string;
      referenceId?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase.rpc('transfer_coins', {
        _sender_id: userId!,
        _receiver_id: receiverId,
        _amount: amount,
        _type_sent: typeSent as any,
        _type_received: typeReceived as any,
        _reference_id: referenceId || null,
        _description: description || '',
      });
      if (error) throw error;
      if (!data) throw new Error('Insufficient coin balance');
      return data;
    },
    onSuccess: () => invalidate(),
    onError: (err: any) => {
      toast({ title: 'Transaction failed', description: err.message, variant: 'destructive' });
    },
  });

  const spendCoins = useMutation({
    mutationFn: async ({
      amount,
      type,
      referenceId,
      description,
    }: {
      amount: number;
      type: string;
      referenceId?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase.rpc('spend_coins', {
        _user_id: userId!,
        _amount: amount,
        _type: type as any,
        _reference_id: referenceId || null,
        _description: description || '',
      });
      if (error) throw error;
      if (!data) throw new Error('Insufficient coin balance');
      return data;
    },
    onSuccess: () => invalidate(),
    onError: (err: any) => {
      toast({ title: 'Payment failed', description: err.message, variant: 'destructive' });
    },
  });

  // ─── WITHDRAW: Via Chapa bank transfer ───────────────────────────────────
  const requestWithdrawal = useMutation({
    mutationFn: async ({
      amount,
      accountName,
      accountNumber,
      bankCode,
    }: {
      amount: number;
      accountName?: string;
      accountNumber?: string;
      bankCode?: number;
      payoutMethod?: string;
    }) => {
      // If bank details provided → real Chapa transfer
      if (accountName && accountNumber && bankCode) {
        return callEdgeFunction('chapa-transfer', {
          amount,
          accountName,
          accountNumber,
          bankCode,
        });
      }
      // Fallback: direct Supabase RPC (demo)
      const { data, error } = await supabase.rpc('request_withdrawal', {
        _user_id: userId!,
        _amount: amount,
        _payout_method: 'bank_transfer',
      });
      if (error) throw error;
      if (!data) throw new Error('Insufficient balance for withdrawal');
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: '✅ Withdrawal requested',
        description: 'Your request is being processed (3-5 business days).',
      });
    },
    onError: (err: any) => {
      toast({ title: 'Withdrawal failed', description: err.message, variant: 'destructive' });
    },
  });

  // ─── BANKS: Fetch available Chapa banks ──────────────────────────────────
  const { data: chapaBanks, isLoading: isBanksLoading } = useQuery({
    queryKey: ['chapa-banks'],
    queryFn: async (): Promise<ChapaBank[]> => {
      try {
        const data = await callEdgeFunction('chapa-transfer', null, 'GET');
        return data.banks ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  return {
    wallet,
    balance: wallet?.balance ?? 0,
    totalEarned: wallet?.total_earned ?? 0,
    totalSpent: wallet?.total_spent ?? 0,
    transactions: transactions ?? [],
    isWalletLoading,
    isTransactionsLoading,
    topUp,
    initiateTopUp,
    verifyTopUp,
    transferCoins,
    spendCoins,
    requestWithdrawal,
    chapaBanks: chapaBanks ?? [],
    isBanksLoading,
    invalidate,
  };
}
