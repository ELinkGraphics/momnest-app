import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCoinWallet } from "@/hooks/useCoinWallet";
import { useUser } from "@/contexts/UserContext";
import { CheckCircle2, Loader2, XCircle, Coins, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const VerifyTopUp = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { verifyTopUp, balance } = useCoinWallet(user?.id);
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const txRef = searchParams.get('tx_ref') || searchParams.get('verify_topup');

  useEffect(() => {
    if (!txRef || !user) return;

    const verify = async () => {
      try {
        const result = await verifyTopUp.mutateAsync({ txRef });
        if (result?.status === 'success' || result?.status === 'already_credited') {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMsg(result?.message || 'Verification failed.');
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Something went wrong during verification.');
      }
    };

    verify();
  }, [txRef, user]);

  const handleGoHome = () => {
    navigate('/?wallet=open');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-md bg-card border border-border/40 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/10 blur-[100px] rounded-full" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-secondary/10 blur-[100px] rounded-full" />

        <div className="relative z-10 flex flex-col items-center text-center">
          {status === 'verifying' && (
            <>
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 animate-pulse segment-shimmer">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Verifying Payment</h1>
              <p className="text-muted-foreground">
                Please wait while we confirm your transaction with Chapa.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-success/20 blur-3xl rounded-full" />
                <div className="relative w-24 h-24 rounded-full bg-success/10 flex items-center justify-center border-4 border-success animate-bounce-short">
                  <CheckCircle2 className="w-12 h-12 text-success" />
                </div>
              </div>
              <h1 className="text-3xl font-black text-foreground mb-3">Payment Successful!</h1>
              <p className="text-muted-foreground mb-8">
                Your coins have been added to your wallet. You're all set to explore MomNest!
              </p>
              
              <div className="w-full p-5 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-between mb-8">
                <div className="text-left">
                  <p className="text-sm text-muted-foreground font-medium">New Balance</p>
                  <p className="text-2xl font-bold text-primary flex items-center gap-2 mt-0.5">
                    <Coins className="w-6 h-6 text-yellow-500 fill-yellow-500/20" />
                    {balance.toLocaleString()}
                  </p>
                </div>
                <div className="bg-success/20 p-2 rounded-xl">
                  <div className="text-[10px] font-bold text-success uppercase tracking-wider">Verified</div>
                </div>
              </div>

              <Button 
                onClick={handleGoHome}
                className="w-full h-16 rounded-2xl text-lg font-bold bg-gradient-to-r from-primary to-primary/80 hover:scale-[1.02] transition-transform shadow-lg shadow-primary/25"
              >
                Go to My Wallet
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-destructive/20 blur-3xl rounded-full" />
                <div className="relative w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center border-4 border-destructive animate-in shake duration-500">
                  <XCircle className="w-12 h-12 text-destructive" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Oops! Something went wrong</h1>
              <p className="text-muted-foreground mb-8 max-w-[280px]">
                {errorMsg} If you have already paid, don't worry—our team will verify it soon.
              </p>
              
              <div className="w-full space-y-3">
                <Button 
                  onClick={() => window.location.reload()}
                  className="w-full h-14 rounded-2xl font-semibold shadow-md"
                >
                  Try Again
                </Button>
                <Button 
                  variant="ghost"
                  onClick={() => navigate('/')}
                  className="w-full h-14 rounded-2xl text-muted-foreground flex items-center justify-center gap-2 hover:bg-muted/50"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Home
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      
      <p className="mt-12 text-sm text-muted-foreground flex items-center gap-2">
        Protected by <span className="font-bold text-primary">Chapa</span>
      </p>
    </div>
  );
};

export default VerifyTopUp;
