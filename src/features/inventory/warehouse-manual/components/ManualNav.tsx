import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MANUAL_SECTIONS = [
  { id: "getting-started", label: "Getting Started" },
  { id: "variant-types", label: "Variant Types" },
  { id: "brands-and-variants", label: "Brands and Variants" },
  { id: "payment-settings", label: "Payment Settings" },
  { id: "purchase-order", label: "Purchase Order" },
  { id: "subwarehouse", label: "Subwarehouse" },
  { id: "sub-stock-requests", label: "Sub Stock Requests" },
  { id: "main-inventory", label: "Main Inventory" },
  { id: "stock-request", label: "Stock Request" },
  { id: "stock-returns", label: "Stock Returns" },
  { id: "stock-adjustment", label: "Stock Adjustment" },
  { id: "batch-view", label: "Batch View" },
  { id: "physical-count", label: "Physical Count" },
  { id: "disposal-log", label: "Disposal Log" },
] as const;

export default function ManualNav() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const resetLockRef = useRef(false);

  useEffect(() => {
    const sectionElements = MANUAL_SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    );

    if (sectionElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (resetLockRef.current) return;

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        const nextId = visible[0]?.target.id;
        if (nextId) setActiveId(nextId);
      },
      {
        rootMargin: "-10% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    sectionElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleReset = () => {
    resetLockRef.current = true;
    setActiveId(null);
    document.getElementById("manual-top")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => {
      resetLockRef.current = false;
    }, 1000);
  };

  const handleNavClick = (id: string) => {
    resetLockRef.current = false;
    setActiveId(id);
  };

  return (
    <nav
      aria-label="Manual quick navigation"
      className="fixed bottom-4 right-4 z-50 flex w-[min(100vw-2rem,16rem)] max-h-[min(70vh,28rem)] flex-col overflow-hidden rounded-lg border border-gray-300 bg-white/95 shadow-lg backdrop-blur-sm lg:bottom-auto lg:right-6 lg:top-24 lg:w-52 lg:max-h-[calc(100vh-7rem)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <p className="text-sm font-semibold text-gray-700">Quick navigation</p>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          Reset
        </button>
      </div>
      <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
        {MANUAL_SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={activeId === id ? "location" : undefined}
            onClick={() => handleNavClick(id)}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100",
              activeId === id && "bg-gray-200 font-medium text-gray-900"
            )}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
