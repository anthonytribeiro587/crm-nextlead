export function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}


export function normalizeBrazilWhatsAppPhone(value: string) {
  let digits = onlyDigits(value || "");

  // Remove prefixos comuns digitados em formulários, ex: 005551...
  if (digits.startsWith("00")) digits = digits.slice(2);

  // BR com DDI: 55 + DDD + número com 8 ou 9 dígitos.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // BR sem DDI: DDD + número com 8 ou 9 dígitos.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}


export function brazilPhoneVariants(value: string) {
  const digits = onlyDigits(value || "");
  const normalized = normalizeBrazilWhatsAppPhone(value || "");
  const variants = new Set<string>();

  if (digits) variants.add(digits);
  if (normalized) variants.add(normalized);

  if (normalized.startsWith("55")) {
    const local = normalized.slice(2);
    if (local) variants.add(local);

    // Compatibilidade Brasil: alguns JIDs/contatos podem aparecer com ou sem o nono dígito.
    // 55 + DDD + 9 + 8 dígitos => também tenta 55 + DDD + 8 dígitos.
    if (normalized.length === 13 && normalized[4] === "9") {
      const withoutNinthDigit = `${normalized.slice(0, 4)}${normalized.slice(5)}`;
      variants.add(withoutNinthDigit);
      variants.add(withoutNinthDigit.slice(2));
    }

    // 55 + DDD + 8 dígitos => também tenta 55 + DDD + 9 + 8 dígitos.
    if (normalized.length === 12) {
      const withNinthDigit = `${normalized.slice(0, 4)}9${normalized.slice(4)}`;
      variants.add(withNinthDigit);
      variants.add(withNinthDigit.slice(2));
    }
  }

  return Array.from(variants).filter(Boolean);
}
