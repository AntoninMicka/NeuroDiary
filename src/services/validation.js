const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSingleLine(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isValidTime(value) {
  return TIME_PATTERN.test(String(value ?? ""));
}

export function isValidDateKey(value) {
  const dateKey = String(value ?? "");
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    return false;
  }

  const parsed = new Date(`${dateKey}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateKey;
}

export function validateMedicationInput(payload = {}) {
  const value = {
    name: normalizeSingleLine(payload.name),
    dose: normalizeSingleLine(payload.dose),
    time: String(payload.time ?? "").trim(),
  };
  const errors = {};

  if (!value.name) {
    errors.name = "Zadejte název léku.";
  } else if (value.name.length > 100) {
    errors.name = "Název léku může mít nejvýše 100 znaků.";
  }

  if (!value.dose) {
    errors.dose = "Zadejte dávku.";
  } else if (value.dose.length > 50) {
    errors.dose = "Dávka může mít nejvýše 50 znaků.";
  }

  if (!isValidTime(value.time)) {
    errors.time = "Zadejte platny cas od 00:00 do 23:59.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    value,
    errors,
  };
}

export function validateBirthYear(value, currentYear = new Date().getFullYear()) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) {
    return { isValid: true, value: "", message: "" };
  }
  if (!/^\d{4}$/.test(normalizedValue)) {
    return { isValid: false, value: normalizedValue, message: "Rok narození musí mít čtyři číslice." };
  }

  const year = Number(normalizedValue);
  if (year < 1900 || year > currentYear) {
    return {
      isValid: false,
      value: normalizedValue,
      message: `Rok narozeni musi byt mezi 1900 a ${currentYear}.`,
    };
  }

  return { isValid: true, value: normalizedValue, message: "" };
}

export function buildMedicationDuplicateKey(payload = {}) {
  return [
    String(payload.time ?? "").trim(),
    normalizeSingleLine(payload.name).toLocaleLowerCase("cs-CZ"),
    normalizeSingleLine(payload.dose).toLocaleLowerCase("cs-CZ"),
  ].join("|");
}
