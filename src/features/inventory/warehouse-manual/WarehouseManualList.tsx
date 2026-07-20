import ManualNav from "./components/ManualNav";
import GettingStartedManual from "./components/GettingStartedManual";
import BatchViewManual from "./components/BatchViewManual";
import BrandsAndVariantsManual from "./components/BrandsAndVariantsManual";
import DisposalLogManual from "./components/DisposalLogManual";
import MainInventoryManual from "./components/MainInventoryManual";
import PaymentSettingsManual from "./components/PaymentSettingsManual";
import PhysicalCountManual from "./components/PhysicalCountManual";
import PurchaseOrderManual from "./components/PurchaseOrderManual";
import StockAdjustmentManual from "./components/StockAdjustmentManual";
import StockRequestManual from "./components/StockRequestManual";
import StockReturnsManual from "./components/StockReturnsManual";
import SubStockRequestsManual from "./components/SubStockRequestsManual";
import SubwarehouseManual from "./components/SubwarehouseManual";
import VariantTypesManual from "./components/VariantTypesManual";

export default function WarehouseManualList() {
  return (
    <div className="flex flex-col items-center p-4">
        <section id="manual-top" className="w-full max-w-2xl text-center scroll-mt-4">
          <h1 className="text-2xl font-bold text-gray-700">Warehouse Manual - How to use?</h1>
          <p>This is a guide to help you use the warehouse system.</p>
        </section>
        <br />

        <GettingStartedManual />
        <VariantTypesManual />
        <BrandsAndVariantsManual />
        <PaymentSettingsManual />
        <PurchaseOrderManual />
        <SubwarehouseManual />
        <SubStockRequestsManual />
        <MainInventoryManual />
        <StockRequestManual />
        <StockReturnsManual />
        <StockAdjustmentManual />
        <BatchViewManual />
        <PhysicalCountManual />
        <DisposalLogManual />
        <ManualNav />
    </div>
  )
}
