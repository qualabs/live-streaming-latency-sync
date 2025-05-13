/**
 * Parses a string resembling an RFC 8941 Dictionary into a JavaScript object,
 * applying specific parsing rules for values.
 *
 * - Key-value pairs are separated by commas (,).
 * - Key and value are separated by an equals sign (=).
 * - Values are parsed as numbers (integer or float) ONLY if the entire value string
 * represents a valid number according to JavaScript's Number() constructor
 * and converting the parsed number back to a string matches the original value string (trimmed).
 * - String values enclosed in double quotes (e.g., "value") will have the quotes removed.
 * - All other values (e.g., p, (211 212), abc, 123px) are kept as strings.
 * - Handles optional whitespace around commas, equals signs, keys, and values.
 *
 * Note: This is NOT a full RFC 8941 parser. It simplifies handling of types,
 * quoting, whitespace, and other features defined in the RFC. It specifically
 * implements the custom parsing logic requested.
 *
 * @param {string} inputString The dictionary-like string to parse.
 * @returns {object} An object containing the parsed data.
 * Returns an empty object for null, undefined, or non-string input.
 */
export default function parseCMCDQueryToJson(inputString) {
  // Initialize the result object
  const result = {};

  // Basic input validation
  if (inputString === null || inputString === undefined) {
        console.warn("Input is null or undefined. Returning empty object.");
        return result;
  }
    if (typeof inputString !== 'string') {
        console.warn("Input is not a string. Returning empty object.");
        return result;
  }
    // Treat empty string as valid input resulting in an empty object
    if (inputString.trim() === '') {
        return result;
  }

  // Split the input string into potential key-value pairs by commas
  const pairs = inputString.split(',');

  // Process each pair
  for (const pair of pairs) {
      const trimmedPair = pair.trim(); // Remove leading/trailing whitespace around the pair

      // Skip if the trimmed pair is empty (e.g., trailing comma)
      if (!trimmedPair) {
          continue;
      }

      // Split the pair into key and value by the FIRST equals sign
      const parts = trimmedPair.split('=', 2);
      const key = parts[0].trim(); // Key is always the first part (or the whole string if no '=')

      // Ensure the key is not empty
      if (!key) {
          console.warn(`Skipping pair with empty key (e.g., '=value' or just '='): "${trimmedPair}"`);
          continue;
      }

      if (parts.length === 1) {
          // If there's no '=', it's a boolean flag (key only)
          result[key] = true;
      } else if (parts.length === 2) {
          // If there is an '=', it's a key-value pair
          let rawValue = parts[1].trim(); // Value part

          // Attempt to parse the rawValue as a number
          const numValue = Number(rawValue);

          // Check if the parsing resulted in a valid number (not NaN),
          // AND if converting the number back to a string exactly matches the trimmed rawValue.
          // Also ensure rawValue wasn't just an empty string (which Number() parses as 0).
          if (!isNaN(numValue) && String(numValue) === rawValue && rawValue !== "") {
              // If it's a valid number according to the rules, store the number
              result[key] = numValue;
          } else {
              // If not a pure number, treat as string
              // Check if the raw string value starts and ends with double quotes
              if (rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')) {
                  // If yes, remove the surrounding quotes
                  rawValue = rawValue.slice(1, -1);
              }
              // Store the (potentially unquoted) raw value as a string
              result[key] = rawValue;
          }
      }
      // No 'else' needed here as split by '=' with limit 2 will always give 1 or 2 parts if trimmedPair is not empty.
      // If parts[0] was empty, it's caught by the 'if (!key)' check above.
  }
            
  // Return the resulting object
  return result;
}