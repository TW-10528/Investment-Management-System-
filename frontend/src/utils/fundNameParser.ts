/**
 * Fund Name Parser — Extract and match fund families with exact Roman numeral/number detection.
 * Prevents "Dover Street XII" from matching "Dover Street XI" or vice versa.
 */

/**
 * Extract the fund family name and its sequence number from a fund name.
 * Examples:
 *   "Dover Street XII" → { family: "Dover Street", sequence: 12 }
 *   "Hamilton Lane VII" → { family: "Hamilton Lane", sequence: 7 }
 *   "Some Fund" → { family: "Some Fund", sequence: null }
 */
export function parseFundName(fundName: string): { family: string; sequence: number | null } {
  if (!fundName) {
    return { family: '', sequence: null };
  }

  const normalized = fundName.trim();

  // Match Roman numerals at the end
  const romanMatch = normalized.match(/^(.+?)\s+(X{1,3}(IX|IV|V?I{0,3})|CM|CD|C{1,3})\s*$/i);
  if (romanMatch) {
    const family = romanMatch[1].trim();
    const roman = romanMatch[2].toUpperCase();
    const sequence = romanToDecimal(roman);
    return { family, sequence };
  }

  // Match decimal numbers at the end
  const decimalMatch = normalized.match(/^(.+?)\s+(\d+)\s*$/);
  if (decimalMatch) {
    const family = decimalMatch[1].trim();
    const sequence = parseInt(decimalMatch[2], 10);
    return { family, sequence };
  }

  // No sequence found
  return { family: normalized, sequence: null };
}

/**
 * Convert Roman numeral string to decimal number.
 * Examples: "I" → 1, "IV" → 4, "XII" → 12, "XIII" → 13
 */
export function romanToDecimal(roman: string): number {
  const romanMap: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let total = 0;
  const upper = roman.toUpperCase();

  for (let i = 0; i < upper.length; i++) {
    const current = romanMap[upper[i]] || 0;
    const next = romanMap[upper[i + 1]] || 0;

    if (current < next) {
      // Subtractive case (e.g., IV = 4, IX = 9)
      total += next - current;
      i++; // Skip next character since we've processed it
    } else {
      total += current;
    }
  }

  return total;
}

/**
 * Convert decimal number to Roman numeral.
 * Examples: 1 → "I", 4 → "IV", 12 → "XII", 13 → "XIII"
 */
export function decimalToRoman(num: number): string {
  if (num <= 0) return '';

  const romanMap = [
    { value: 1000, numeral: 'M' },
    { value: 900, numeral: 'CM' },
    { value: 500, numeral: 'D' },
    { value: 400, numeral: 'CD' },
    { value: 100, numeral: 'C' },
    { value: 90, numeral: 'XC' },
    { value: 50, numeral: 'L' },
    { value: 40, numeral: 'XL' },
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' },
  ];

  let result = '';
  let remaining = num;

  for (const { value, numeral } of romanMap) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }

  return result;
}

/**
 * Check if two fund names match exactly, considering Roman numerals.
 * Examples:
 *   "Dover Street XII" matches "Dover Street XII" ✓
 *   "Dover Street XII" does NOT match "Dover Street XI" ✗
 *   "Dover Street" (no sequence) matches "Dover Street" ✓
 */
export function fundNamesMatchExact(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;

  const parsed1 = parseFundName(name1.toLowerCase().trim());
  const parsed2 = parseFundName(name2.toLowerCase().trim());

  // Both must have matching family names
  if (parsed1.family !== parsed2.family) {
    return false;
  }

  // Both must have matching sequences (both null or same number)
  if (parsed1.sequence !== parsed2.sequence) {
    return false;
  }

  return true;
}

/**
 * Check if a fund name is a new fund variant of a family.
 * Returns true if the fund name has a sequence number (Roman or decimal).
 * Examples:
 *   "Dover Street XII" → true (has sequence 12)
 *   "Dover Street" → false (no sequence)
 *   "Hamilton Lane VII" → true (has sequence 7)
 */
export function isNewFundVariant(fundName: string): boolean {
  const { sequence } = parseFundName(fundName);
  return sequence !== null;
}

/**
 * Get the fund family name without sequence.
 * Examples:
 *   "Dover Street XII" → "Dover Street"
 *   "Hamilton Lane VII" → "Hamilton Lane"
 *   "Some Fund" → "Some Fund"
 */
export function getFundFamilyName(fundName: string): string {
  const { family } = parseFundName(fundName);
  return family;
}
