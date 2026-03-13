'use client';

import { useState } from 'react';

type Settings = Record<string, string>;

const SECTIONS = [
  {
    title: 'LUT / Bond Details',
    description: 'Letter of Undertaking for export without IGST payment',
    fields: [
      { key: 'lut_number', label: 'LUT / Bond No.',      placeholder: 'AD240225011900P' },
      { key: 'lut_from',   label: 'Valid From',           placeholder: 'DD-MM-YYYY' },
      { key: 'lut_to',     label: 'Valid To',             placeholder: 'DD-MM-YYYY' },
    ],
  },
  {
    title: 'Company Details',
    description: 'Shown on all proforma invoices',
    fields: [
      { key: 'company_name',       label: 'Company Name',   placeholder: 'Three Shul Motors Pvt.Ltd.' },
      { key: 'company_address',    label: 'Address',        placeholder: 'Full address…', multiline: true },
      { key: 'company_gstin',      label: 'GSTIN / UIN',    placeholder: '24AALCT4109R1ZT' },
      { key: 'company_state',      label: 'State',          placeholder: 'Gujarat' },
      { key: 'company_state_code', label: 'State Code',     placeholder: '24' },
      { key: 'company_phone',      label: 'Phone',          placeholder: '9799505404' },
      { key: 'company_email',      label: 'Email',          placeholder: 'business@3shulmotors.in' },
    ],
  },
  {
    title: 'Bank Details',
    description: 'Shown on all proforma invoices',
    fields: [
      { key: 'bank_holder',  label: 'A/c Holder Name',  placeholder: 'Three Shul Motors Pvt.Ltd.' },
      { key: 'bank_name',    label: 'Bank Name',         placeholder: 'Axis Bank' },
      { key: 'bank_account', label: 'Account No.',       placeholder: '924020074662475' },
      { key: 'bank_branch',  label: 'Branch',            placeholder: 'Navarangpura' },
      { key: 'bank_ifsc',    label: 'IFS Code',          placeholder: 'UTIB0000003' },
      { key: 'bank_swift',   label: 'SWIFT Code',        placeholder: 'AXISINBB003' },
    ],
  },
];

const iCls = 'w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500';

export function SettingsForm({ settings: initial }: { settings: Settings }) {
  const [form,    setForm]    = useState<Settings>({ ...initial });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  function field(key: string, value: string) {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); setSaving(false); return; }
      setForm(data);
      setSaved(true);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 pb-8">
      {error && (
        <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}
      {saved && (
        <div className="p-3 rounded-lg text-sm text-green-400" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          Settings saved successfully ✓
        </div>
      )}

      {SECTIONS.map((section) => (
        <div key={section.title} className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <h3 className="text-sm font-semibold text-white">{section.title}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{section.description}</p>
          </div>
          <div className="p-4 space-y-3">
            {section.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-zinc-400 mb-1">{f.label}</label>
                {(f as any).multiline ? (
                  <textarea
                    rows={3}
                    value={form[f.key] ?? ''}
                    onChange={(e) => field(f.key, e.target.value)}
                    className={`${iCls} resize-none`}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <input
                    value={form[f.key] ?? ''}
                    onChange={(e) => field(f.key, e.target.value)}
                    className={iCls}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
      >
        {saving ? 'Saving…' : 'Save All Settings'}
      </button>
    </div>
  );
}
