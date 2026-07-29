import { useState, type FC } from 'react';
import { useAuth } from '../context/AuthContext';
import { CreditCard, Loader2, Check, AlertCircle, Zap, Sparkles } from 'lucide-react';
import { PLANS, type PremiumPlan } from '../utils/premium';

const XENDIT_INVOICE_API = import.meta.env.VITE_XENDIT_INVOICE_API || '';

interface PaymentScreenProps {
  onPaid: (plan: PremiumPlan) => void;
  onSkip: () => void;
  /** If true this is from the in-app upgrade button (user still on trial);
   *  if false the trial has expired and skip should be disallowed. */
  isUpgrade?: boolean;
}

export const PaymentScreen: FC<PaymentScreenProps> = ({ onPaid, onSkip, isUpgrade }) => {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<PremiumPlan>('yearly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const hasRealXendit = Boolean(XENDIT_INVOICE_API);

  const handlePay = async () => {
    if (hasRealXendit) {
      await handleXenditPay();
    } else {
      await handleDemoPay();
    }
  };

  const handleDemoPay = async () => {
    setBusy(true);
    setError('');
    await new Promise(r => setTimeout(r, 600));
    setBusy(false);
    onPaid(selectedPlan);
  };

  const handleXenditPay = async () => {
    setBusy(true);
    setError('');
    try {
      const plan = PLANS.find(p => p.id === selectedPlan)!;
      const token = await user?.getIdToken();
      const res = await fetch(XENDIT_INVOICE_API, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId: user?.uid,
          email: user?.email,
          amount: plan.price * 100, // cents/satoshi
          description: `Flashpoint Premium - ${plan.label}`,
          plan: plan.id,
        }),
      });
      if (!res.ok) throw new Error('Failed to create invoice');
      const data = await res.json();
      if (data.invoiceUrl) {
        window.open(data.invoiceUrl, '_blank');
        setSuccess(true);
        return;
      }
      throw new Error('No invoice URL returned');
    } catch {
      // Backend not available — fall through to demo
      setBusy(false);
      await handleDemoPay();
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0F1115] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="inline-flex p-3 bg-[#3FB950]/10 rounded-full text-[#3FB950]"><Check size={28} /></div>
          <h2 className="text-lg font-bold text-white font-mono uppercase tracking-widest">Invoice Created</h2>
          <p className="text-xs text-[#8B949E] font-mono leading-relaxed">
            Please complete payment in the Xendit checkout page that opened. Once paid, your access will be activated within a few minutes.
          </p>
          <button onClick={() => onPaid(selectedPlan)}
            className="w-full py-2 bg-[#E3B341] hover:bg-[#F0C24F] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer">
            I've Completed Payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1115] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-[#E3B341]/10 rounded-full text-[#E3B341]">
            <Sparkles size={24} />
          </div>
          <h1 className="text-lg font-bold text-white font-mono uppercase tracking-widest">
            {isUpgrade ? 'Upgrade to Premium' : 'Trial Expired'}
          </h1>
          <p className="text-xs text-[#8B949E] font-mono">
            {isUpgrade
              ? 'You\'re currently on a free trial. Pick a plan to unlock premium features permanently.'
              : 'Your 2-day free trial has ended. Choose a plan to continue using premium features.'}
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PLANS.map(plan => {
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative p-4 rounded border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#E3B341] bg-[#E3B341]/5 shadow-[0_0_0_1px_#E3B341]'
                    : 'border-[#30363D] bg-[#161B22] hover:border-[#8B949E]'
                }`}
              >
                {plan.badge && (
                  <span className={`absolute -top-2.5 right-2 px-1.5 py-0.5 rounded text-[7px] font-bold font-mono uppercase tracking-wider ${
                    plan.id === 'lifetime'
                      ? 'bg-[#E3B341] text-[#0F1115]'
                      : 'bg-[#3FB950]/20 text-[#3FB950]'
                  }`}>
                    {plan.badge}
                  </span>
                )}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">{plan.label}</p>
                  <p className="text-lg font-bold font-mono text-[#E3B341]">{plan.priceLabel}</p>
                  <p className="text-[8px] font-mono text-[#8B949E]">{plan.durationLabel}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Premium features list */}
        <div className="rounded border border-[#30363D] bg-[#161B22] p-3 text-xs font-mono text-[#8B949E] space-y-1">
          <p className="font-bold text-white uppercase tracking-wider text-[10px]">Premium includes:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>AI Flashcard Generator (unlimited)</li>
            <li>OCR Image Text Extraction</li>
            <li>AI Text Cleaning</li>
            <li>AI Flashcard Explanation</li>
            <li>All future AI features</li>
          </ul>
          <p className="text-[9px] text-[#484F58] pt-1 border-t border-[#30363D]/50 mt-1">
            {user?.email} · {selectedPlan === 'lifetime' ? 'One-time payment, no recurring charges' : 'Cancel anytime'}
          </p>
        </div>

        {error && (
          <div className="flex items-center space-x-1.5 text-[#F85149] text-xs bg-[#F85149]/10 p-2 rounded border border-[#F85149]/20">
            <AlertCircle size={12} /><span>{error}</span>
          </div>
        )}

        {/* Pay button */}
        <button onClick={handlePay} disabled={busy}
          className="w-full py-2.5 bg-[#E3B341] hover:bg-[#F0C24F] disabled:bg-[#2D333B] disabled:text-[#484F58] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed">
          {busy ? <Loader2 size={13} className="animate-spin" /> : hasRealXendit ? <CreditCard size={13} /> : <Zap size={13} />}
          <span>
            {busy
              ? 'Processing...'
              : hasRealXendit
                ? `Pay ${PLANS.find(p => p.id === selectedPlan)?.priceLabel} with Xendit`
                : `Complete ${PLANS.find(p => p.id === selectedPlan)?.label} Payment`
            }
          </span>
        </button>

        {isUpgrade && (
          <button onClick={onSkip}
            className="w-full py-2 text-[#8B949E] hover:text-white text-xs font-mono transition-colors cursor-pointer">
            Continue with free trial
          </button>
        )}
      </div>
    </div>
  );
};
