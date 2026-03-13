import { prisma } from './prisma';

/** Default values for all settings — used if DB row doesn't exist yet. */
export const SETTING_DEFAULTS: Record<string, string> = {
  lut_number:   'AD240225011900P',
  lut_from:     '01-03-2025',
  lut_to:       '01-03-2026',
  company_name: 'Three Shul Motors Pvt.Ltd.',
  company_address: 'Plot no. 27/62 Panchratna Green Industrial Park 2, Pirana to Paldi Kanka Road\nAhmedabad, Gujarat 382415',
  company_gstin: '24AALCT4109R1ZT',
  company_state: 'Gujarat',
  company_state_code: '24',
  company_phone: '9799505404',
  company_email: 'business@3shulmotors.in',
  bank_name:    'Axis Bank',
  bank_account: '924020074662475',
  bank_ifsc:    'UTIB0000003',
  bank_branch:  'Navarangpura',
  bank_swift:   'AXISINBB003',
  bank_holder:  'Three Shul Motors Pvt.Ltd.',
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key] ?? '';
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    map[key]  = row?.value ?? SETTING_DEFAULTS[key] ?? '';
  }
  return map;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  return getSettings(Object.keys(SETTING_DEFAULTS));
}

export async function upsertSetting(key: string, value: string, userId?: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, updatedById: userId ?? null },
    update: { value, updatedById: userId ?? null },
  });
}
