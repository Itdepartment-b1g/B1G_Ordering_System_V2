import { Link } from "react-router-dom";

function BorderSection({ children }: { children: React.ReactNode }){
  return (
    <>
    <div className="border border-gray-300 rounded-md p-4 flex flex-col gap-1 max-w-2xl ">
      {children}
    </div>
    <br />
    </>
  )
}

function InstructionBorder({ children }: { children: React.ReactNode }){
  return(
    <div className="border border-gray-300 bg-gray-100 rounded-md p-4 flex flex-col gap-1 max-w-2xl p-4">
      {children}
    </div>
  )
}

function TitleSection({ children }: { children: React.ReactNode }){
  return (
    <div className="text-xl font-bold text-gray-700">
      {children}
    </div>
  )
}

function ContentSection({ children }: { children: React.ReactNode }){
  return (

    <> <div className="text-2xl font-bold text-gray-700 text-center">
    {children}
  </div>
  <br />
  </>
   
  )
}
export default function WarehouseManualList() {
  return (
    <div className="p-4 ">
        <section>
          <h1 className="text-2xl font-bold text-gray-700">Warehouse Manual - How to use?</h1>
          <p>This is a guide to help you use the warehouse system.</p>
        </section>
        <br />

        {/* VARIANT TYPES MANUAL */}
        <BorderSection>
          <ContentSection>VARIANT TYPES</ContentSection>
        <InstructionBorder>
        <TitleSection>How to create a Variant Types?</TitleSection>
        <span>1. Go to <Link to="/variant-types" className="text-blue-500">Variant Types</Link></span>
        <span>2. Click on <span className="text-blue-500">Create Type</span></span>
        <span>3. Enter the details of variant type <span className="text-gray-700">(eg. Flavor, Battery, FOC etc.)</span> and click on <span className="text-blue-500">Create Type</span></span>
        <span>4. The variant type will be created and you can see it in the list.</span>
        </InstructionBorder>

        <InstructionBorder>
        <TitleSection>How to edit a Variant Type?</TitleSection>
        <span>5. You can edit the variant type by clicking on <span className="text-blue-500">Edit Icon</span></span>
        </InstructionBorder>

        <InstructionBorder>
        <TitleSection>How to delete a Variant Type?</TitleSection>
        <span>6. You can delete the variant type by clicking on <span className="text-blue-500">Delete Icon</span></span>
        <span>7. You will be asked to confirm the deletion. Click on <span className="text-blue-500">Delete</span> to confirm.</span>
        <span>8. The variant type will be deleted and you can see it in the list.</span>
        </InstructionBorder>

        </BorderSection>

        {/* BRANDS AND VARIANTS MANUAL */}
        <BorderSection>
          <ContentSection>BRANDS AND VARIANTS</ContentSection>
          <InstructionBorder>
          <TitleSection>How to create a Brand and Variants?</TitleSection>
          <span>1. Go to <Link to="/brands" className="text-blue-500">Brands & Variants</Link></span>
          <span>2. Click on <span className="text-blue-500">Create Brand</span></span>
          <span>3. Enter the details of brand and click on <span className="text-blue-500">Create Brand</span></span>
          <span>4. The brand will be created and you can see it in the list.</span>
          </InstructionBorder>
          <InstructionBorder>
          <TitleSection>How to edit a Brand?</TitleSection>
          <span>5. You can edit the brand by clicking on <span className="text-blue-500">Edit Icon</span></span>
          </InstructionBorder>
          <InstructionBorder>
          <TitleSection>How to delete a Brand?</TitleSection>
          <span>6. You can delete the brand by clicking on <span className="text-blue-500">Delete Icon</span></span>
          <span>7. You will be asked to confirm the deletion. Click on <span className="text-blue-500">Delete</span> to confirm.</span>
          <span>8. The brand will be deleted and you can see it in the list.</span>
          </InstructionBorder>
          <InstructionBorder>
          <TitleSection>How to create a Variant?</TitleSection>
          <span>9. You can create a variant by clicking on <span className="text-blue-500">Create Variant</span></span>
          <span>10. Enter the details of variant and click on <span className="text-blue-500">Create Variant</span></span>
          <span>11. The variant will be created and you can see it in the list.</span>
          </InstructionBorder>
          <InstructionBorder>
          <TitleSection>How to edit a Variant?</TitleSection>
          <span>12. You can edit the variant by clicking on <span className="text-blue-500">Edit Icon</span></span>
          </InstructionBorder>
          <InstructionBorder>
          <TitleSection>How to delete a Variant?</TitleSection>
          <span>13. You can delete the variant by clicking on <span className="text-blue-500">Delete Icon</span></span>
          <span>14. You will be asked to confirm the deletion. Click on <span className="text-blue-500">Delete</span> to confirm.</span>
          <span>15. The variant will be deleted and you can see it in the list.</span>
          </InstructionBorder>
        </BorderSection>

        {/* PAYMENT SETTINGS MANUAL */}
        <BorderSection>
          <ContentSection>PAYMENT SETTINGS</ContentSection>
          <InstructionBorder>
            <TitleSection>How to create a Bank Accounts?</TitleSection>
            <span>1. Go to <Link to="/bank-accounts" className="text-blue-500">Payment Settings</Link></span>
            <span>2. Click on <span className="text-blue-500">Add Bank</span></span>
            <span>3. Enter the details of bank and click on <span className="text-blue-500">Add Bank</span></span>
            <span>4. The bank will be created and you can see it in the list.</span>
          </InstructionBorder>
          <InstructionBorder>
            <TitleSection>How to edit a Bank?</TitleSection>
            <span>5. You can edit the bank by clicking on <span className="text-blue-500">Edit Icon</span></span>
          </InstructionBorder>
          <InstructionBorder>
            <TitleSection>How to delete a Bank?</TitleSection>
            <span>6. You can delete the bank by clicking on <span className="text-blue-500">Delete Icon</span></span>
          </InstructionBorder>
        </BorderSection>

        {/* PURCHASE ORDER MANUAL */}
        <BorderSection>
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


    </div>
  )
}