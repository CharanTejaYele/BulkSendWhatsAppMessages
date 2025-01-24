function formatPhoneNumber(input) {
  // Remove all non-digit characters
  const digits = input.replace(/\D/g, "");

  // Check if the number starts with the country code "91"
  if (digits.startsWith("91") && digits.length === 12) {
    // Ensure it starts with "91"
    return `${digits}`;
  } else if (digits.length === 10) {
    // If it's a 10-digit number, prepend "+91"
    return `91${digits}`;
  } else if (digits.length > 10 && digits.startsWith("0")) {
    // Handle cases where the number starts with "0" (e.g., "0987654321")
    return `91${digits.slice(1)}`;
  } else {
    // If the number doesn't match any valid pattern
    return "Invalid phone number";
  }
}

module.exports = { formatPhoneNumber };
