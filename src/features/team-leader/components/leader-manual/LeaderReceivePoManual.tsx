import { Link } from 'react-router-dom';

import {
  BorderSection,
  ContentSection,
  InstructionBorder,
  TitleSection,
} from '@/features/inventory/warehouse-manual/components/ManualLayout';

type LeaderReceivePoManualProps = {
  embedded?: boolean;
};

export default function LeaderReceivePoManual({
  embedded = false,
}: LeaderReceivePoManualProps) {
  return (
    <BorderSection id="leader-receive-po" embedded={embedded}>
      {!embedded && <ContentSection>LEADER PO RECEIVING</ContentSection>}

      <InstructionBorder>
        <TitleSection>How Leader PO Receiving Works?</TitleSection>
        <p>
          Leader PO Receiving is used when a warehouse dispatches stock for a team leader purchase
          order and the leader needs to confirm what was actually received.
        </p>
        <p>
          This page helps you track assigned purchase orders, review delivery details, and confirm
          received quantities with photo proof and signature.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Where to Open It?</TitleSection>
        {embedded ? (
          <span>Use this page to review all purchase orders assigned to you for receiving.</span>
        ) : (
          <span>
            Open{' '}
            <Link to="/inventory/po-receive" className="text-blue-500">
              PO Receiving
            </Link>{' '}
            from the inventory menu.
          </span>
        )}
        <span>
          You must be a team leader and your company must already be linked to a warehouse hub
          before this page becomes available.
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>What the Statuses Mean?</TitleSection>
        <div className="flex flex-col gap-1">
          <span>
            <span className="font-semibold text-gray-700">Warehouse pending:</span> the purchase
            order is assigned but the warehouse has not finished dispatching it yet.
          </span>
          <span>
            <span className="font-semibold text-gray-700">Pending receive:</span> the warehouse
            has already dispatched the delivery and you can now confirm the receive.
          </span>
          <span>
            <span className="font-semibold text-gray-700">Fully received:</span> all dispatched
            quantities were successfully confirmed.
          </span>
          <span>
            <span className="font-semibold text-gray-700">
              Shortfall under investigation:
            </span>{' '}
            the received quantity is lower than dispatched and the warehouse still needs to resolve
            the shortage.
          </span>
        </div>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Receive a PO?</TitleSection>
        <span>1. Look for a row with the status <span className="text-blue-500">Pending receive</span>.</span>
        <span>2. Review the PO number, DR number, warehouse, item list, and dispatched quantities.</span>
        <span>
          3. Click <span className="text-blue-500">Receive</span> from the row action or card
          action.
        </span>
        <span>
          4. In the receive dialog, confirm the actual quantities you received for each item.
        </span>
        <span>
          5. Add any needed notes, capture the proof photo, and complete the signature when
          prompted.
        </span>
        <span>
          6. Submit the receive confirmation to update the PO history and receipt details.
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>What if There Is a Shortage?</TitleSection>
        <p>
          If the quantity you confirm is lower than what the warehouse dispatched, the PO may move
          into <span className="font-semibold text-amber-700">Shortfall under investigation</span>.
        </p>
        <p>
          This means the warehouse still needs to investigate or resolve the missing quantity. You
          can still open the receipt and review the proof that was submitted for the receive.
        </p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Review History and Receipt?</TitleSection>
        <span>
          Use <span className="text-blue-500">View history</span> in the action menu to review the
          purchase order timeline.
        </span>
        <span>
          Use <span className="text-blue-500">View receipt</span> on completed or shortage rows to
          open the receive summary, notes, proof photo, and signature.
        </span>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>Tips Before You Confirm</TitleSection>
        <ul className="ml-6 list-disc space-y-1">
          <li>Double-check the delivered items before confirming because receive history is important for audit tracking.</li>
          <li>Make sure the proof photo is clear and the signature is complete.</li>
          <li>Use notes when there are damaged items, missing quantities, or special delivery concerns.</li>
          <li>Refresh the page if you are waiting for a newly dispatched PO to appear as pending receive.</li>
        </ul>
      </InstructionBorder>
    </BorderSection>
  );
}