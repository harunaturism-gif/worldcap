export const WLD_DECIMALS = 18;
export const WLD_SCALE = 10n ** BigInt(WLD_DECIMALS);

export function parseUnitString(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error('Invalid token unit string');
  return BigInt(value);
}

export function formatWldUnits(units: bigint, maximumFractionDigits = 2): string {
  if (units < 0n) throw new Error('Negative WLD units are not supported');
  const whole = units / WLD_SCALE;
  const remainder = units % WLD_SCALE;
  if (remainder === 0n || maximumFractionDigits === 0) return `${whole.toString()} WLD`;
  const fraction = remainder.toString().padStart(WLD_DECIMALS, '0').slice(0, maximumFractionDigits).replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction} WLD` : `${whole.toString()} WLD`;
}

export function allocateWld(totalUnits: bigint) {
  if (totalUnits <= 0n) throw new Error('Purchase total must be positive');
  const monthly = totalUnits * 60n / 100n;
  const annual = totalUnits * 10n / 100n;
  const platform = totalUnits * 20n / 100n;
  const commercial = totalUnits - monthly - annual - platform;
  return { monthly, annual, platform, commercial };
}

