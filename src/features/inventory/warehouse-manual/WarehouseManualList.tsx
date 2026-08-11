import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ManualNav from "./components/ManualNav";
import GettingStartedManual from "./components/GettingStartedManual";
import DashboardManual from "./components/DashboardManual";
import RequestStockManual from "./components/RequestStockManual";
import BatchViewManual from "./components/BatchViewManual";
import BrandsAndVariantsManual from "./components/BrandsAndVariantsManual";
import ClientStockReturnsManual from "./components/ClientStockReturnsManual";
import DeliveryShortagesManual from "./components/DeliveryShortagesManual";
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

function scrollToHash(hash: string) {
  const sectionId = hash.replace(/^#/, "");
  if (!sectionId) return;
  // Wait a tick so sections are in the DOM after route mount.
  window.requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function WarehouseManualList() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      scrollToHash(location.hash);
    }
  }, [location.hash, location.key]);

  return (
    <div className="flex flex-col items-center p-4">
        <section id="manual-top" className="w-full max-w-2xl text-center scroll-mt-4">
          <h1 className="text-2xl font-bold text-gray-700">Warehouse Manual - How to use?</h1>
          <p>This is a guide to help you use the warehouse system.</p>
        </section>
        <br />

        <GettingStartedManual />
        <DashboardManual />
        <RequestStockManual />
        <VariantTypesManual />
        <BrandsAndVariantsManual />
        <PaymentSettingsManual />
        <PurchaseOrderManual />
        <SubwarehouseManual />
        <SubStockRequestsManual />
        <DeliveryShortagesManual />
        <MainInventoryManual />
        <StockRequestManual />
        <StockReturnsManual />
        <ClientStockReturnsManual />
        <StockAdjustmentManual />
        <BatchViewManual />
        <PhysicalCountManual />
        <DisposalLogManual />
        <ManualNav />
    </div>
  )
}
