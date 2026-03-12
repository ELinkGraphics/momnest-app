import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Coins, ArrowUpCircle, ArrowDownCircle, History, Wallet,
  TrendingUp, TrendingDown, Loader2, ArrowLeft, ExternalLink,
  CheckCircle2, Building2, ChevronDown,
} from 'lucide-react';
import { useCoinWallet, ChapaBank } from '@/hooks/useCoinWallet';
import { useUser } from '@/contexts/UserContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOPUP_PRESETS = [10, 25, 50, 100, 250, 500];

const transactionTypeLabels: Record<string, { label: string; color: string }> = {
  topup: { label: 'Top Up', color: 'text-green-600' },
  tip_sent: { label: 'Tip Sent', color: 'text-orange-600' },
  tip_received: { label: 'Tip Received', color: 'text-green-600' },
  purchase: { label: 'Purchase', color: 'text-red-600' },
  sale: { label: 'Sale', color: 'text-green-600' },
  event_payment: { label: 'Event', color: 'text-blue-600' },
  event_earned: { label: 'Event Earned', color: 'text-green-600' },
  service_payment: { label: 'Service', color: 'text-purple-600' },
  service_earned: { label: 'Service Earned', color: 'text-green-600' },
  subscription: { label: 'Subscription', color: 'text-indigo-600' },
  withdrawal: { label: 'Withdrawal', color: 'text-red-600' },
  refund: { label: 'Refund', color: 'text-green-600' },
  premium_unlock: { label: 'Premium Unlock', color: 'text-purple-600' },
  premium_earning: { label: 'Premium Earned', color: 'text-green-600' },
};

const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const { user } = useUser();
  const {
    balance,
    totalEarned,
    totalSpent,
    transactions,
    isWalletLoading,
    initiateTopUp,
    verifyTopUp,
    requestWithdrawal,
    chapaBanks,
    isBanksLoading,
  } = useCoinWallet(user?.id);

  // ── Top-Up state ──────────────────────────────────────────────────────────
  const [topUpAmount, setTopUpAmount] = useState<number | null>(null);
  const [customTopUp, setCustomTopUp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [topUpDone, setTopUpDone] = useState(false);
  const finalTopUp = topUpAmount || parseInt(customTopUp) || 0;

  // ── Withdraw state ────────────────────────────────────────────────────────
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedBank, setSelectedBank] = useState<ChapaBank | null>(null);
  const [bankSearch, setBankSearch] = useState('');
  const [showBankList, setShowBankList] = useState(false);

  const filteredBanks = chapaBanks.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  // ── Auto-verify when user returns from Chapa checkout tab ─────────────────
  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    const pendingRef = localStorage.getItem('chapa_pending_txref');
    if (!pendingRef || isVerifying) return;

    setIsVerifying(true);
    try {
      const result = await verifyTopUp.mutateAsync({ txRef: pendingRef });
      if (result?.status === 'success') {
        setTopUpDone(true);
        setTopUpAmount(null);
        setCustomTopUp('');
      }
    } catch {
      // Verification errors are shown via toast inside the hook
    } finally {
      setIsVerifying(false);
    }
  }, [verifyTopUp, isVerifying]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleVisibilityChange]);

  // Reset topUpDone when tab changes
  useEffect(() => {
    setTopUpDone(false);
  }, [topUpAmount, customTopUp]);

  const handleTopUp = () => {
    if (finalTopUp < 10) return;
    initiateTopUp.mutate({ amount: finalTopUp });
  };

  const handleWithdraw = () => {
    const amount = parseInt(withdrawAmount);
    if (!amount || amount < 10 || amount > balance) return;
    if (!accountName.trim() || !accountNumber.trim() || !selectedBank) return;
    requestWithdrawal.mutate({
      amount,
      accountName: accountName.trim(),
      accountNumber: accountNumber.trim(),
      bankCode: selectedBank.id,
    });
    setWithdrawAmount('');
    setAccountName('');
    setAccountNumber('');
    setSelectedBank(null);
    setBankSearch('');
  };

  if (!isOpen) return null;

  const withdrawAmount_num = parseInt(withdrawAmount) || 0;
  const withdrawValid =
    withdrawAmount_num >= 10 &&
    withdrawAmount_num <= balance &&
    accountName.trim().length > 0 &&
    accountNumber.trim().length > 0 &&
    !!selectedBank;

  return (
    <div className="fixed inset-0 z-[100] animate-fade-in isolate">
      {/* Solid background */}
      <div className="absolute inset-0 bg-background" />
      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/15 via-transparent to-primary/15" />

      <div className="relative h-full w-full overflow-y-auto pb-20">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-background/30 backdrop-blur-lg border-b border-border/30">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            My Wallet
          </h1>
          <div className="w-10" />
        </div>

        {/* Balance hero */}
        <div className="flex flex-col items-center text-center px-6 pt-8 pb-4 space-y-4">
          <div className="relative">
            <div className="rounded-full p-1 bg-gradient-to-br from-yellow-400/40 to-orange-400/40 backdrop-blur-sm">
              <div className="w-20 h-20 rounded-full bg-card/60 backdrop-blur-sm border-2 border-background/60 flex items-center justify-center">
                <Coins className="w-10 h-10 text-yellow-500" />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Coin Balance</p>
            <p className="text-4xl font-bold text-foreground">
              {isWalletLoading ? '...' : balance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">≈ {balance.toLocaleString()} ETB</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center px-5 py-3 rounded-xl bg-card/50 backdrop-blur-sm border border-border/30">
              <TrendingUp className="w-4 h-4 text-green-500 mb-1" />
              <span className="text-sm font-semibold text-foreground">{totalEarned.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground">Earned</span>
            </div>
            <div className="flex flex-col items-center px-5 py-3 rounded-xl bg-card/50 backdrop-blur-sm border border-border/30">
              <TrendingDown className="w-4 h-4 text-red-500 mb-1" />
              <span className="text-sm font-semibold text-foreground">{totalSpent.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground">Spent</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-8">
          <Tabs defaultValue="transactions" className="w-full">
            <TabsList className="w-full grid grid-cols-3 bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl">
              <TabsTrigger value="transactions" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                <History className="w-3.5 h-3.5" /> History
              </TabsTrigger>
              <TabsTrigger value="topup" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                <ArrowUpCircle className="w-3.5 h-3.5" /> Top Up
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                <ArrowDownCircle className="w-3.5 h-3.5" /> Withdraw
              </TabsTrigger>
            </TabsList>

            {/* ── HISTORY TAB ──────────────────────────────────────── */}
            <TabsContent value="transactions" className="mt-3 space-y-2">
              {transactions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No transactions yet
                </div>
              ) : (
                transactions.map((tx) => {
                  const meta = transactionTypeLabels[tx.type] || { label: tx.type, color: 'text-foreground' };
                  const isPositive = tx.amount > 0;
                  return (
                    <div key={tx.id} className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-3.5 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 bg-card/30 border-border/40', meta.color)}>
                          {meta.label}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{tx.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <span className={cn('text-sm font-bold', isPositive ? 'text-green-500' : 'text-red-500')}>
                          {isPositive ? '+' : ''}{tx.amount}
                        </span>
                        <p className="text-[10px] text-muted-foreground">bal: {tx.balance_after}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* ── TOP UP TAB ───────────────────────────────────────── */}
            <TabsContent value="topup" className="mt-3 space-y-4">
              {/* Amount presets */}
              <div className="grid grid-cols-3 gap-2">
                {TOPUP_PRESETS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => { setTopUpAmount(amount); setCustomTopUp(''); setTopUpDone(false); }}
                    className={cn(
                      'rounded-xl py-3 text-sm font-medium backdrop-blur-sm border transition-all flex items-center justify-center gap-1.5',
                      topUpAmount === amount
                        ? 'bg-primary/20 border-primary/40 text-primary'
                        : 'bg-card/40 border-border/30 text-foreground hover:bg-card/60'
                    )}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    {amount} ETB
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom amount</p>
                <Input
                  type="number"
                  placeholder="Enter ETB amount (min. 10)"
                  value={customTopUp}
                  onChange={(e) => { setCustomTopUp(e.target.value); setTopUpAmount(null); setTopUpDone(false); }}
                  min="10"
                  max="50000"
                  className="rounded-xl bg-card/40 backdrop-blur-sm border-border/30"
                />
              </div>

              {/* Summary */}
              {finalTopUp >= 10 && (
                <div className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-3.5 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-semibold text-foreground">{finalTopUp} ETB</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Coins you receive</span>
                    <span className="text-green-600 font-medium">+{finalTopUp} coins</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Payment via</span>
                    <span>Chapa (Telebirr, CBEBirr, Bank)</span>
                  </div>
                </div>
              )}

              {/* Chapa pay button */}
              <Button
                onClick={handleTopUp}
                disabled={finalTopUp < 10 || initiateTopUp.isPending || isVerifying}
                className="w-full rounded-xl gap-2 bg-gradient-to-r from-primary to-primary/80"
                size="lg"
              >
                {isVerifying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying payment…</>
                ) : initiateTopUp.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Opening Chapa…</>
                ) : topUpDone ? (
                  <><CheckCircle2 className="w-4 h-4 text-green-400" /> Payment verified!</>
                ) : (
                  <><ExternalLink className="w-4 h-4" /> Pay {finalTopUp || 0} ETB via Chapa</>
                )}
              </Button>

              {initiateTopUp.isSuccess && !isVerifying && !topUpDone && (
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                  A Chapa payment page has opened in a new tab.
                  Complete your payment there — your coins will be added automatically when you return.
                </p>
              )}

              <div className="rounded-xl bg-card/30 border border-border/20 p-3 flex items-start gap-2.5">
                <Coins className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Payments are processed securely via Chapa. Supports Telebirr, CBE Birr, Amhara Bank, and major Ethiopian banks. 1 ETB = 1 coin.
                </p>
              </div>
            </TabsContent>

            {/* ── WITHDRAW TAB ─────────────────────────────────────── */}
            <TabsContent value="withdraw" className="mt-3 space-y-4">
              {/* Available balance */}
              <div className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-4 text-center space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Available to withdraw</p>
                <p className="text-2xl font-bold text-foreground">
                  {balance.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">ETB</span>
                </p>
              </div>

              {/* Withdrawal amount */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Withdrawal amount (ETB)</p>
                <Input
                  type="number"
                  placeholder="Min. 10 ETB"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="10"
                  max={balance}
                  className="rounded-xl bg-card/40 backdrop-blur-sm border-border/30"
                />
              </div>

              {/* Account name */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account holder name</p>
                <Input
                  placeholder="Full name as registered at bank"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="rounded-xl bg-card/40 backdrop-blur-sm border-border/30"
                />
              </div>

              {/* Bank picker */}
              <div className="space-y-1.5 relative">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bank / Mobile Wallet</p>
                <button
                  type="button"
                  onClick={() => setShowBankList((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 px-3 py-2.5 text-sm text-left"
                >
                  <span className={selectedBank ? 'text-foreground flex items-center gap-2' : 'text-muted-foreground'}>
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    {selectedBank ? selectedBank.name : (isBanksLoading ? 'Loading banks…' : 'Select bank / wallet')}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', showBankList && 'rotate-180')} />
                </button>

                {showBankList && (
                  <div className="absolute z-50 w-full rounded-xl bg-card border border-border/40 shadow-xl overflow-hidden mt-1">
                    <div className="p-2 border-b border-border/30">
                      <Input
                        placeholder="Search bank…"
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                        className="rounded-lg bg-card/70 border-border/20 text-sm h-8"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {filteredBanks.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No banks found</p>
                      ) : (
                        filteredBanks.map((bank) => (
                          <button
                            key={bank.id}
                            onClick={() => { setSelectedBank(bank); setShowBankList(false); setBankSearch(''); }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 transition-colors flex items-center gap-2"
                          >
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {bank.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Account number */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Account / Wallet number
                  {selectedBank && <span className="ml-1 normal-case text-muted-foreground/60">({selectedBank.acct_length} digits)</span>}
                </p>
                <Input
                  placeholder={selectedBank ? `${selectedBank.acct_length}-digit account number` : 'Account number'}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  maxLength={selectedBank?.acct_length ?? 20}
                  className="rounded-xl bg-card/40 backdrop-blur-sm border-border/30"
                />
              </div>

              {/* Summary */}
              {withdrawAmount_num >= 10 && selectedBank && (
                <div className="rounded-xl bg-card/40 backdrop-blur-sm border border-border/30 p-3.5 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">You withdraw</span>
                    <span className="font-semibold text-foreground">{withdrawAmount_num} ETB</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>To</span>
                    <span>{selectedBank.name}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>New balance</span>
                    <span>{(balance - withdrawAmount_num).toLocaleString()} coins</span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleWithdraw}
                disabled={!withdrawValid || requestWithdrawal.isPending}
                variant="outline"
                className="w-full rounded-xl gap-2 border-border/40 backdrop-blur-sm"
                size="lg"
              >
                {requestWithdrawal.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                ) : (
                  <><ArrowDownCircle className="w-4 h-4" /> Request Withdrawal</>
                )}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Withdrawals are processed via Chapa within 3-5 business days.
                Coins are debited immediately upon request.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default WalletModal;
