export function getPoCancellationReason(order: {
  status?: string | null;
  cancellation_reason?: string | null;
  notes?: string | null;
}): string | null {
  const dedicated = String(order.cancellation_reason || '').trim();
  if (dedicated) return dedicated;

  const notes = String(order.notes || '');
  const marker = '\n\nRejected: ';
  const idx = notes.lastIndexOf(marker);
  if (idx >= 0) {
    return notes.slice(idx + marker.length).trim() || null;
  }
  return null;
}

export function getPoCancelledByName(order: {
  cancelled_by_user?: { full_name?: string | null; email?: string | null } | null;
}): string {
  const name = order.cancelled_by_user?.full_name?.trim();
  if (name) return name;
  const email = order.cancelled_by_user?.email?.trim();
  if (email) return email;
  return 'Unknown';
}

export function getPoNotesWithoutCancellation(order: {
  cancellation_reason?: string | null;
  notes?: string | null;
}): string | null {
  const notes = String(order.notes || '').trim();
  if (!notes) return null;

  const dedicated = String(order.cancellation_reason || '').trim();
  const marker = '\n\nRejected: ';
  const idx = notes.lastIndexOf(marker);
  if (idx >= 0) {
    return notes.slice(0, idx).trim() || null;
  }
  if (dedicated && notes === dedicated) return null;
  return notes;
}
