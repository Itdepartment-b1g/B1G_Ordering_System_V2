import { Link } from 'react-router-dom';

import {
  BorderSection,
  ContentSection,
  InstructionBorder,
  TitleSection,
} from '@/features/inventory/warehouse-manual/components/ManualLayout';

type LeaderCashDepositManualProps = {
  embedded?: boolean;
};

export default function LeaderCashDepositManual({
  embedded = false,
}: LeaderCashDepositManualProps) {
  return (
    <BorderSection id="leader-cash-deposits" embedded={embedded}>
      {!embedded && <ContentSection>TEAM CASH DEPOSITS</ContentSection>}

      <InstructionBorder>
        <TitleSection>What Is Team Cash Deposits?</TitleSection>
        <p>
          Team Cash Deposits is where team leaders record bank deposits for cash and cheque
          collections from their team remittances. Finance cannot approve those client orders until
          the deposit details and deposit slip are recorded here.
        </p>
        <p>
          This page only covers the cash and cheque portions of orders. Bank Transfer and GCash
          payments do not appear here because they go straight to finance review.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Where to Open It?</TitleSection>
        {embedded ? (
          <span>Use this page to record cash and cheque deposits for your team.</span>
        ) : (
          <span>
            Open{' '}
            <Link to="/inventory/cash-deposits" className="text-blue-500">
              Cash Deposits
            </Link>{' '}
            under Inventory in the sidebar.
          </span>
        )}
        <span>
          Related pages:{' '}
          <Link to="/inventory/team-remittances" className="text-blue-500">
            Team Remittances
          </Link>{' '}
          (cash/cheque remitted to you) and{' '}
          <Link to="/leader-orders" className="text-blue-500">
            Order Management
          </Link>{' '}
          (orders waiting for finance after deposit).
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Page Sections</TitleSection>
        <div className="flex flex-col gap-1">
          <span>
            <span className="font-semibold text-gray-700">Daily Cash Collections:</span> cash and
            cheque remittance orders grouped by date and agent. This is where you select orders and
            record deposits.
          </span>
          <span>
            <span className="font-semibold text-gray-700">Verified Deposit History:</span> deposits
            already confirmed by finance. Search by agent, bank, reference number, or notes.
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Use the date filter above Daily Cash Collections to narrow both the day list and history
          view. You can also print the filtered day summary.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>What the Statuses Mean?</TitleSection>
        <div className="flex flex-col gap-1">
          <span>
            <span className="font-semibold text-amber-700">Pending Deposit:</span> cash/cheque has
            been remitted, but bank details and deposit slip are not recorded yet. You need to take
            action.
          </span>
          <span>
            <span className="font-semibold text-blue-700">Awaiting Finance:</span> you already
            recorded the deposit. Finance still needs to verify it when approving the related
            orders.
          </span>
          <span>
            <span className="font-semibold text-emerald-700">Finance Verified:</span> finance
            confirmed the deposit. The slip can no longer be edited by the team leader.
          </span>
        </div>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Record a Deposit?</TitleSection>
        <span>1. Expand a date under <span className="text-blue-500">Daily Cash Collections</span>.</span>
        <span>
          2. Optionally expand each agent to review the cash/cheque order lines and remitted amounts.
        </span>
        <span>
          3. Select the orders you deposited. Use agent checkboxes, Select All, or Clear. Orders that
          share one remittance deposit are selected together and must be deposited together.
        </span>
        <span>
          4. Click <span className="text-blue-500">Record Deposit</span>. If deposit type is not
          already set, choose Cash Deposit or Cheque Deposit first.
        </span>
        <span>
          5. In the deposit form, review the remittance summary and amount to deposit.
        </span>
        <span>
          6. Select the <span className="text-blue-500">Bank Account</span>, or choose{' '}
          <span className="text-blue-500">Direct to Office</span> when applicable.
        </span>
        <span>
          7. Enter the cash and/or cheque reference numbers when required (not needed for Direct to
          Office).
        </span>
        <span>
          8. Upload or capture a clear photo of the deposit slip, add notes if needed, then submit.
        </span>
        <span>
          9. Status moves to <span className="font-semibold text-blue-700">Awaiting Finance</span>.
          Finance/admin roles are notified that a deposit is ready for verification.
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>What You Must Provide When Depositing</TitleSection>
        <ul className="ml-6 list-disc space-y-1">
          <li>
            <span className="font-semibold text-gray-700">Bank account</span> (or Direct to Office)
          </li>
          <li>
            <span className="font-semibold text-gray-700">Deposit slip photo</span> (upload or camera
            capture)
          </li>
          <li>
            <span className="font-semibold text-gray-700">Cash reference number</span> when the
            selection includes cash and bank deposit is used
          </li>
          <li>
            <span className="font-semibold text-gray-700">Cheque reference number</span> when the
            selection includes cheque and bank deposit is used
          </li>
          <li>
            <span className="font-semibold text-gray-700">Notes</span> (optional) for special deposit
            remarks
          </li>
        </ul>
        <p>
          If both cash and cheque portions are included, enter both references. The system stores
          them together for finance review.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>After You Record the Deposit</TitleSection>
        <div className="flex flex-col gap-1">
          <span>
            The day/group status becomes <span className="font-semibold text-blue-700">Awaiting
            Finance</span>.
          </span>
          <span>
            Related cash/cheque orders become eligible for finance approval only after deposit
            details are complete.
          </span>
          <span>
            Use <span className="text-blue-500">View Deposit</span> or{' '}
            <span className="text-blue-500">View deposit details</span> to reopen the slip, bank,
            reference numbers, and linked orders.
          </span>
          <span>
            Once finance verifies the deposit, it appears under{' '}
            <span className="font-semibold text-gray-700">Verified Deposit History</span>.
          </span>
        </div>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Editing a Deposit Slip</TitleSection>
        <p>
          Team leaders can replace a deposit slip only while the deposit is not yet finance-verified.
          Each deposit slip can be edited up to 2 times.
        </p>
        <div className="flex flex-col gap-1">
          <span>
            1. Open the deposit trail / deposit details for that day.
          </span>
          <span>
            2. Choose <span className="text-blue-500">Replace Deposit Slip</span> (or Edit).
          </span>
          <span>
            3. Upload or capture the corrected slip photo and save.
          </span>
        </div>
        <p>
          After finance verifies the deposit, the slip is locked for team leaders and can no longer
          be changed from this page.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Tips Before You Submit</TitleSection>
        <ul className="ml-6 list-disc space-y-1">
          <li>Deposit only the cash/cheque remitted amount shown — bank transfer and GCash portions are excluded.</li>
          <li>Make sure the deposit slip photo is clear and shows bank, amount, and reference details.</li>
          <li>Select sibling remittance orders together so one physical bank deposit is not split incorrectly.</li>
          <li>Double-check bank account and reference numbers before submitting — finance uses these to verify.</li>
          <li>Refresh the page if a newly remitted cash/cheque order has not appeared yet under Daily Cash Collections.</li>
        </ul>
      </InstructionBorder>
    </BorderSection>
  );
}
