const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const API_KEY_RE = /^(sk|rk|pk|api)[_-][A-Za-z0-9]{16,}$/i;
const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,19}\b/;
const CVV_RE = /^\d{3,4}$/;
const PRIVATE_KEY_RE = /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/;

const PASSWORD_NAME_RE = /password|passwd|passphrase|secret|api[_-]?key|access[_-]?token|auth[_-]?token|cvv|cvc|card[_-]?number|credit/i;

export function isPasswordField(hints: {
  type?: string | null;
  name?: string | null;
  autocomplete?: string | null;
  ariaLabel?: string | null;
}): boolean {
  const type = (hints.type ?? "").toLowerCase();
  if (type === "password") return true;
  const auto = (hints.autocomplete ?? "").toLowerCase();
  if (auto.includes("password") || auto === "cc-csc" || auto === "cc-number") return true;
  const name = `${hints.name ?? ""} ${hints.ariaLabel ?? ""}`;
  return PASSWORD_NAME_RE.test(name);
}

export function looksLikeSecret(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (JWT_RE.test(v)) return true;
  if (API_KEY_RE.test(v)) return true;
  if (PRIVATE_KEY_RE.test(v)) return true;
  if (CREDIT_CARD_RE.test(v.replace(/[-\s]/g, "")) && v.replace(/\D/g, "").length >= 13) {
    return true;
  }
  if (CVV_RE.test(v) && v.length <= 4) {
    // only with context; alone too noisy — callers should combine with field hints
    return false;
  }
  return false;
}

export function redactSensitiveValue(
  value: string | null | undefined,
  hints?: {
    type?: string | null;
    name?: string | null;
    autocomplete?: string | null;
    ariaLabel?: string | null;
  },
): { value: string | null; redacted: boolean; isSensitive: boolean } {
  if (value == null || value === "") {
    return { value: null, redacted: false, isSensitive: false };
  }

  if (hints && isPasswordField(hints)) {
    return { value: null, redacted: true, isSensitive: true };
  }

  if (looksLikeSecret(value)) {
    return { value: null, redacted: true, isSensitive: true };
  }

  return { value, redacted: false, isSensitive: false };
}

export function sanitizeElementForStorage(element: Record<string, unknown>): Record<string, unknown> {
  const type = typeof element.type === "string" ? element.type : null;
  const name = typeof element.name === "string" ? element.name : null;
  const ariaLabel = typeof element.ariaLabel === "string" ? element.ariaLabel : null;
  const autocomplete =
    typeof element.autocomplete === "string" ? element.autocomplete : null;

  const rawValue =
    typeof element.value === "string"
      ? element.value
      : typeof element.text === "string"
        ? null
        : null;

  const valueField = typeof element.value === "string" ? element.value : undefined;
  const redacted = redactSensitiveValue(valueField, { type, name, autocomplete, ariaLabel });

  const out: Record<string, unknown> = { ...element };
  delete out.value;
  if (redacted.isSensitive) {
    out.isPassword = isPasswordField({ type, name, autocomplete, ariaLabel });
    out.isSensitive = true;
    out.valueRedacted = true;
  } else if (valueField !== undefined) {
    // Prefer not persisting raw input values by default
    out.valueRedacted = true;
    out.hasValue = valueField.length > 0;
    out.valueLength = valueField.length;
  }

  void rawValue;
  return out;
}
