import { Link } from "react-router-dom";
import { BorderSection, ContentSection, InstructionBorder, TitleSection } from "./ManualLayout";

export default function PurchaseOrderManual() {
  return (
    <BorderSection id="purchase-order">
      <ContentSection>PURCHASE ORDER</ContentSection>
      <InstructionBorder>
        <TitleSection>How Purchase Order Works?</TitleSection>
        <p>Purchase Order is a document that is used to approve the order of products from Moto Sales and Key Accounts</p>

        <TitleSection>How to Approve a Purchase Order?</TitleSection>
        <span>1. Go to <Link to="/purchase-orders" className="text-blue-500">Purchase Orders</Link></span>

        <div className="flex flex-col gap-1">
          <span>2. Click on <span className="text-blue-500">Approve</span></span>
          <ul className="list-disc list-outside ml-6 space-y-1">
            <li>Before you approve review the details first of the purchase order by clicking the eye icon for viewing details or clicking 'Approve PO' in row to view the details of the purchase order.</li>
            <li>Once you have reviewed the details, you can approve the purchase order by clicking the 'Approve PO' button. A message will be displayed to confirm the approval.</li>
            <li>The purchase order will be approved and you can see it in the list.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-1">
        <span>3. After approval you need to 'Fullfill' the purchase order</span>
        <ul className="list-disc list-outside ml-6 space-y-1">
          <li>Once you click the 'Fullfill' button, you need to input the 'Rider name', 'Plate number', 'Rider Photo', and a warehouse e-signature</li>
          <li>Once you complete the inputs and click 'Deliver' button in dialog, the status of that Purchase Order will be updated as 'Fullfilled'</li>
        </ul>
        </div>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How Partially Fullfilled Purchase Order Works?</TitleSection>
        <span>If theres a partially fullfilled in purchase order status, it means that the purchase order has been partially fullfilled and the remaining approval is still in the other warehouse.</span>
        <br/>
        <p><span className="font-bold">For example: </span>Moto sales (Standard) or Key accounts Purchase Order to a different warehouses (other than the warehouse you are in), other warehouse needs to approve that before the purchase order can be fullfilled.</p>
      </InstructionBorder>

      <InstructionBorder>
        <TitleSection>How to Reject a Purchase Order?</TitleSection>
        <span>1. Click the 'Reject' button in the purchase order row to reject the purchase order.</span>
        <span>2. A dialog will be displayed to confirm the rejection. Click on <span className="text-blue-500">Reject</span> to confirm.</span>
        <span>3. Before you reject the purchase order, please think twice if you really want to reject the purchase order. This action cannot be undone.</span>
      </InstructionBorder>
    </BorderSection>
  );
}
