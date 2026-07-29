import { Link } from 'react-router-dom';

import {
  BorderSection,
  ContentSection,
  InstructionBorder,
  TitleSection,
} from '@/features/inventory/warehouse-manual/components/ManualLayout';

type LeaderCreateOrderProps = {
  embedded?: boolean;
};

export default function LeaderCreateOrder({ embedded = false }: LeaderCreateOrderProps) {
  return (
    <BorderSection id="leader-create-order" embedded={embedded}>
      {!embedded && <ContentSection>CREATE CLIENT ORDER</ContentSection>}

      <InstructionBorder>
        <TitleSection>What Is My Orders?</TitleSection>
        <p>
          My Orders lets team leaders create and track client orders from their own inventory. After
          you submit an order, the system routes it based on how the client paid so finance,
          remittance, and deposit steps happen in the right order.
        </p>
        <p>
          Use <span className="font-semibold text-gray-700">Order Management</span> to review orders
          created by agents on your team. Use <span className="font-semibold text-gray-700">Cash
          Deposits</span> when cash or cheque collections need to be recorded before finance can
          approve.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Where to Open It?</TitleSection>
        {embedded ? (
          <span>Use this page to create orders for your assigned clients.</span>
        ) : (
          <span>
            Open{' '}
            <Link to="/my-orders" className="text-blue-500">
              My Orders
            </Link>{' '}
            from the sidebar, then click <span className="text-blue-500">New Order</span>.
          </span>
        )}
        <span>
          Related pages:{' '}
          <Link to="/leader-orders" className="text-blue-500">
            Order Management
          </Link>{' '}
          (team orders) and{' '}
          <Link to="/inventory/cash-deposits" className="text-blue-500">
            Cash Deposits
          </Link>{' '}
          (cash/cheque deposit recording).
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Create an Order?</TitleSection>
        <span>1. Click <span className="text-blue-500">New Order</span>.</span>
        <span>2. Select the client, brand, and product variants. Enter quantities for each line.</span>
        <span>
          3. Choose a pricing strategy if your company allows more than one (RSP, DSP, or special
          pricing).
        </span>
        <span>4. Add discount or notes if needed, then click <span className="text-blue-500">Create Order</span>.</span>
        <span>5. Capture the client signature in the signature dialog.</span>
        <span>
          6. If the order total is greater than zero, choose <span className="text-blue-500">Full
          Payment</span> or <span className="text-blue-500">Split Payment</span>, then complete
          payment details and upload proof for each method used.
        </span>
        <span>
          7. Review the confirmation summary and click{' '}
          <span className="text-blue-500">Confirm & Create Order</span>.
        </span>
        <span>
          Free of charge (FOC) orders with total ₱0 skip payment selection and go straight to
          confirmation after signature.
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Full Payment vs Split Payment</TitleSection>
        <div className="flex flex-col gap-1">
          <span>
            <span className="font-semibold text-gray-700">Full Payment:</span> one payment method
            covers the entire order total. You select the method, upload one proof image, and submit.
          </span>
          <span>
            <span className="font-semibold text-gray-700">Split Payment:</span> combine up to 3
            payment methods (for example bank transfer + cash). Each selected method needs an amount
            and its own proof image. Split amounts must add up exactly to the order total.
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Available methods depend on company payment settings: Bank Transfer, GCash, Cash, and
          Cheque may be enabled or disabled by finance.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Where Does Each Payment Method Go?</TitleSection>
        <p>
          After you create the order, the system sets the next step automatically. This is the same
          for team leaders and mobile sales agents.
        </p>
        <ul className="ml-6 list-disc space-y-2">
          <li>
            <span className="font-semibold text-gray-700">Bank Transfer or GCash (full payment):</span>{' '}
            goes to <span className="text-blue-500">Finance review</span> immediately. Finance
            approves or rejects using the uploaded transfer/GCash proof. No cash deposit step is
            required.
          </li>
          <li>
            <span className="font-semibold text-gray-700">Cash or Cheque (full payment):</span>{' '}
            stays in <span className="text-blue-500">Pending remittance / deposit</span> first. The
            cash or cheque must be recorded through the deposit workflow before finance can approve.
          </li>
          <li>
            <span className="font-semibold text-gray-700">Split payment with Bank Transfer or
            GCash:</span>{' '}
            goes to <span className="text-blue-500">Finance review</span> even if cash or cheque is
            also part of the split.
          </li>
          <li>
            <span className="font-semibold text-gray-700">Split payment with only Cash and/or
            Cheque:</span>{' '}
            stays in <span className="text-blue-500">Pending remittance / deposit</span> until the
            cash/cheque portion is deposited and recorded.
          </li>
          <li>
            <span className="font-semibold text-gray-700">Free of charge (₱0 total):</span>{' '}
            goes directly to <span className="text-blue-500">Finance review</span>. No payment proof
            or deposit is required.
          </li>
        </ul>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Team Leader Cash and Cheque Flow</TitleSection>
        <p>
          When an order includes cash or cheque (full or split), finance cannot approve until the
          physical collection is handled in the system.
        </p>
        <div className="flex flex-col gap-1">
          <span>
            1. Agent or leader creates the order with cash/cheque payment and proof of collection.
          </span>
          <span>
            2. The order waits for remittance/deposit. For team agents, cash is remitted to you as
            team leader first.
          </span>
          <span>
            3. Record the deposit in{' '}
            <Link to="/inventory/cash-deposits" className="text-blue-500">
              Cash Deposits
            </Link>{' '}
            (bank account, reference, and deposit slip image).
          </span>
          <span>
            4. Finance reviews the order in Order Management. Once deposit details are complete,
            finance can approve and verify the deposit together.
          </span>
        </div>
        <p>
          If you created the order yourself as team leader with cash/cheque, you still follow the
          same deposit recording step before finance approval.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Payment Proof Upload Tips</TitleSection>
        <ul className="ml-6 list-disc space-y-1">
          <li>
            <span className="font-semibold text-gray-700">Bank Transfer:</span> select the correct
            company bank account, then upload proof (screenshot or deposit slip). Proof is stored
            under the bank and order number folder.
          </li>
          <li>
            <span className="font-semibold text-gray-700">GCash:</span> upload the GCash payment
            screenshot showing amount and reference.
          </li>
          <li>
            <span className="font-semibold text-gray-700">Cash / Cheque:</span> upload proof of
            collection (photo of cash, cheque, or acknowledgement). These orders still need deposit
            recording later for finance approval.
          </li>
          <li>
            <span className="font-semibold text-gray-700">Split payments:</span> every selected
            method needs its own amount and proof. Totals must match the order exactly.
          </li>
        </ul>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>After the Order Is Created</TitleSection>
        <div className="flex flex-col gap-1">
          <span>
            A confirmation email is sent to the client when email delivery succeeds.
          </span>
          <span>
            Track your own orders on <span className="text-blue-500">My Orders</span> using status
            filters (pending, approved, rejected, needs revision).
          </span>
          <span>
            Monitor team orders on{' '}
            <Link to="/leader-orders" className="text-blue-500">
              Order Management
            </Link>
            . Finance pending orders show as waiting for finance review.
          </span>
          <span>
            Inventory is deducted from your stock when the order is successfully created.
          </span>
        </div>
      </InstructionBorder>
    </BorderSection>
  );
}
