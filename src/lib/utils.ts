import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format phone number to Philippine format: +63 917 555 0101
 * @param value - Raw phone number input
 * @returns Formatted phone number
 */
export function formatPhoneNumber(value: string): string {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // Handle different input scenarios
  let formatted = '';
  
  if (digits.length === 0) {
    return '';
  }
  
  // If starts with 63, assume it's already in international format
  if (digits.startsWith('63')) {
    const remaining = digits.slice(2);
    if (remaining.length <= 3) {
      formatted = `+63 ${remaining}`;
    } else if (remaining.length <= 6) {
      formatted = `+63 ${remaining.slice(0, 3)} ${remaining.slice(3)}`;
    } else {
      formatted = `+63 ${remaining.slice(0, 3)} ${remaining.slice(3, 6)} ${remaining.slice(6, 10)}`;
    }
  }
  // If starts with 0, assume local format (e.g., 0917)
  else if (digits.startsWith('0')) {
    const remaining = digits.slice(1);
    if (remaining.length <= 3) {
      formatted = `+63 ${remaining}`;
    } else if (remaining.length <= 6) {
      formatted = `+63 ${remaining.slice(0, 3)} ${remaining.slice(3)}`;
    } else {
      formatted = `+63 ${remaining.slice(0, 3)} ${remaining.slice(3, 6)} ${remaining.slice(6, 10)}`;
    }
  }
  // If starts with other digits, assume missing country code
  else {
    if (digits.length <= 3) {
      formatted = `+63 ${digits}`;
    } else if (digits.length <= 6) {
      formatted = `+63 ${digits.slice(0, 3)} ${digits.slice(3)}`;
    } else {
      formatted = `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
    }
  }
  
  return formatted;
}
