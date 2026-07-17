import type { PhysicalCountLine } from '../types';

export function parseNonNegativeQty(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

export function computePhysicalQtyFromBoxes(boxCount: string, unitsPerBox: string): string | null {
  const boxes = parseNonNegativeQty(boxCount);
  const perBox = parseNonNegativeQty(unitsPerBox);
  if (boxes === null || perBox === null) return null;
  return String(boxes * perBox);
}

export function applyBoxInputsToLine(
  line: PhysicalCountLine,
  updates: { boxCount?: string; unitsPerBox?: string }
): PhysicalCountLine {
  const nextBoxCount = updates.boxCount ?? line.boxCount;
  const nextUnitsPerBox = updates.unitsPerBox ?? line.unitsPerBox;
  const computed = computePhysicalQtyFromBoxes(nextBoxCount, nextUnitsPerBox);

  return {
    ...line,
    boxCount: nextBoxCount,
    unitsPerBox: nextUnitsPerBox,
    physicalQty: computed ?? '',
  };
}

export function getBoxCountBreakdown(line: PhysicalCountLine): string | null {
  const boxes = parseNonNegativeQty(line.boxCount);
  const perBox = parseNonNegativeQty(line.unitsPerBox);
  if (boxes === null || perBox === null) return null;
  return `${boxes} × ${perBox}`;
}
