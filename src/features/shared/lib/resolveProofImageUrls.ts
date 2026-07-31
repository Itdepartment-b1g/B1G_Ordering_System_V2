/** Prefer multi package URLs; fall back to legacy scalar proof URL. */
export function resolveProofImageUrls(input: {
  proofImageUrls?: string[] | null;
  proofImageUrl?: string | null;
  proofImageDataUrl?: string | null;
}): string[] {
  if (Array.isArray(input.proofImageUrls) && input.proofImageUrls.length > 0) {
    return input.proofImageUrls.filter((url) => !!url?.trim());
  }
  const single = input.proofImageUrl || input.proofImageDataUrl;
  return single?.trim() ? [single] : [];
}
