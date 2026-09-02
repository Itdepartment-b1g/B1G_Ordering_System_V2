import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const KEY_ACCOUNT_PO_CREATE_STEPS = [
  { id: 0, label: 'Select Client' },
  { id: 1, label: 'Warehouse & Items' },
  { id: 2, label: 'Payment' },
  { id: 3, label: 'Review' },
] as const;

const LAST_STEP = KEY_ACCOUNT_PO_CREATE_STEPS.length - 1;

interface KeyAccountPoCreateStepperProps {
  currentStep: number;
  /** True when that step’s required fields are filled. */
  completedSteps: boolean[];
  onStepClick?: (step: number) => void;
}

function stepStatus(index: number, currentStep: number): 'completed' | 'current' | 'upcoming' {
  if (index === currentStep) return 'current';
  if (index < currentStep) return 'completed';
  return 'upcoming';
}

export function KeyAccountPoCreateStepper({
  currentStep,
  completedSteps,
  onStepClick,
}: KeyAccountPoCreateStepperProps) {
  return (
    <ol className="flex w-full max-w-xl mx-auto items-start" aria-label="Purchase order progress">
      {KEY_ACCOUNT_PO_CREATE_STEPS.map((step, index) => {
        const status = stepStatus(index, currentStep);
        const canClick =
          index === currentStep ||
          index < currentStep ||
          completedSteps.slice(0, index).every(Boolean);
        const isLast = index === LAST_STEP;

        return (
          <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-1/2 top-3 z-0 h-px w-full bg-primary"
              />
            ) : null}

            <button
              type="button"
              disabled={!canClick}
              onClick={() => {
                if (canClick) onStepClick?.(index);
              }}
              aria-current={status === 'current' ? 'step' : undefined}
              aria-label={`${step.label}${status === 'completed' ? ', completed' : status === 'current' ? ', current' : ''}`}
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-shadow',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                status === 'completed' && 'bg-primary text-primary-foreground',
                status === 'current' &&
                  'bg-primary text-primary-foreground ring-1 ring-primary ring-offset-1 ring-offset-background',
                status === 'upcoming' && 'border border-primary bg-background text-primary',
                canClick ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              {status === 'completed' ? (
                <Check className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                index + 1
              )}
            </button>

            <span
              className={cn(
                'mt-1.5 max-w-[5.5rem] text-center text-[10px] leading-tight sm:max-w-none',
                status === 'current'
                  ? 'font-semibold text-primary'
                  : 'font-medium text-primary/50'
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
