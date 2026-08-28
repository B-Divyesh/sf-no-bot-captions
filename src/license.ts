export const LICENSE_KEY = 'sb_license:no-bot-captions';
const VERDICT_KEY = `${LICENSE_KEY}:verdict`;
const DAY = 86_400_000;
const API = 'https://api.sociobot.in/api/v1/products/no-bot-captions';

export type LicenseState = { unlocked: boolean; notice: string; token?: string };

type Verdict = { valid: boolean; checkedAt: number; token: string };

export function acceptLicenseFromUrl(url = new URL(window.location.href)): boolean {
  const token = url.searchParams.get('license')?.trim();
  if (!token) return false;
  localStorage.setItem(LICENSE_KEY, token);
  localStorage.removeItem(VERDICT_KEY);
  url.searchParams.delete('license');
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function saveLicense(token: string): void {
  const clean = token.trim();
  if (!clean || clean.length > 4096) throw new Error('Paste the complete license token.');
  localStorage.setItem(LICENSE_KEY, clean);
  localStorage.removeItem(VERDICT_KEY);
}

function cachedVerdict(token: string): Verdict | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(VERDICT_KEY) ?? '') as Verdict;
    return parsed.token === token && typeof parsed.valid === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}

export function localLicenseState(): LicenseState {
  const token = localStorage.getItem(LICENSE_KEY)?.trim();
  if (!token) return { unlocked: false, notice: '' };
  const verdict = cachedVerdict(token);
  return {
    unlocked: verdict?.valid === true,
    notice: verdict?.valid === false ? 'This license is no longer active.' : 'Checking your license…',
    token,
  };
}

export async function verifyLicense(force = false): Promise<LicenseState> {
  const token = localStorage.getItem(LICENSE_KEY)?.trim();
  if (!token) return { unlocked: false, notice: '' };
  const cached = cachedVerdict(token);
  if (!force && cached && Date.now() - cached.checkedAt < DAY) {
    return { unlocked: cached.valid, notice: cached.valid ? 'Supporter unlocked on this device.' : 'This license is no longer active.', token };
  }
  try {
    const response = await fetch(`${API}/verify?license=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error('verification unavailable');
    const body = await response.json() as { valid?: boolean };
    const valid = body.valid === true;
    localStorage.setItem(VERDICT_KEY, JSON.stringify({ valid, token, checkedAt: Date.now() } satisfies Verdict));
    return { unlocked: valid, notice: valid ? 'Supporter unlocked on this device.' : 'This license is no longer active.', token };
  } catch {
    return {
      unlocked: cached?.valid === true,
      notice: cached?.valid ? 'Offline — using the last valid license check.' : 'Could not verify this license. The free caption tool still works.',
      token,
    };
  }
}

export const checkoutUrl = `${API}/checkout`;
