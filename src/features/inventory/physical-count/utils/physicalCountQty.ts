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

/** Empty loose fields count as 0; partially filled is invalid. */
function parseOptionalLoosePair(
  looseBoxCount: string,
  looseQty: string
): { looseBoxes: number; loosePerBox: number } | null {
  const looseEmpty = looseBoxCount.trim() === '' && looseQty.trim() === '';
  if (looseEmpty) {
    return { looseBoxes: 0, loosePerBox: 0 };
  }

  const looseBoxes = parseNonNegativeQty(looseBoxCount);
  const loosePerBox = parseNonNegativeQty(looseQty);
  if (looseBoxes === null || loosePerBox === null) return null;
  return { looseBoxes, loosePerBox };
}

export function computePhysicalQtyFromBoxes(
  boxCount: string,
  unitsPerBox: string,
  looseBoxCount = '',
  looseQty = ''
): string | null {
  const boxes = parseNonNegativeQty(boxCount);
  const perBox = parseNonNegativeQty(unitsPerBox);
  const loose = parseOptionalLoosePair(looseBoxCount, looseQty);
  if (boxes === null || perBox === null || loose === null) return null;
  return String(boxes * perBox + loose.looseBoxes * loose.loosePerBox);
}

export function applyBoxInputsToLine(
  line: PhysicalCountLine,
  updates: {
    boxCount?: string;
    unitsPerBox?: string;
    looseBoxCount?: string;
    looseQty?: string;
  }
): PhysicalCountLine {
  const nextBoxCount = updates.boxCount ?? line.boxCount;
  const nextUnitsPerBox = updates.unitsPerBox ?? line.unitsPerBox;
  const nextLooseBoxCount = updates.looseBoxCount ?? line.looseBoxCount;
  const nextLooseQty = updates.looseQty ?? line.looseQty;
  const computed = computePhysicalQtyFromBoxes(
    nextBoxCount,
    nextUnitsPerBox,
    nextLooseBoxCount,
    nextLooseQty
  );

  return {
    ...line,
    boxCount: nextBoxCount,
    unitsPerBox: nextUnitsPerBox,
    looseBoxCount: nextLooseBoxCount,
    looseQty: nextLooseQty,
    physicalQty: computed ?? '',
  };
}

export function getBoxCountBreakdown(line: PhysicalCountLine): string | null {
  const boxes = parseNonNegativeQty(line.boxCount);
  const perBox = parseNonNegativeQty(line.unitsPerBox);
  const loose = parseOptionalLoosePair(line.looseBoxCount, line.looseQty);
  if (boxes === null || perBox === null || loose === null) return null;

  const boxed = `${boxes} × ${perBox}`;
  if (loose.looseBoxes === 0 && loose.loosePerBox === 0) {
    return boxed;
  }
  return `${boxed} + ${loose.looseBoxes} × ${loose.loosePerBox}`;
}
