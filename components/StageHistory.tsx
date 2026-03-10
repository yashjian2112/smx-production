'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { blobImgUrl } from '@/lib/blobUrl';

type Submission = {
  id: string;
  stage: string;
  startedAt: string;
  completedAt: string | null;
  buildTimeSec: number | null;
  imageUrl: string | null;
  analysisStatus: string;
  analysisResult: string | null;
  analysisSummary: string | null;
  employee: { id: string; name: string };
};

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Props = { unitId: string };

export function StageHistory({ unitId }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/units/${unitId}/work`)
      .then(r => r.json())
      .then(data => {
        setSubmissions(data.history ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [unitId]);

  if (loading) {
    return (
      <div className="py-6 text-center">
        <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="py-6 text-center text-zinc-600 text-sm">
        No work history yet for this stage.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((s) => {
        const pass = s.analysisResult === 'PASS';
        const statusColor =
          s.analysisStatus === 'PASSED' ? 'text-green-400' :
          s.analysisStatus === 'FAILED' ? 'text-red-400' :
          s.analysisStatus === 'ANALYZING' ? 'text-sky-400' : 'text-amber-400';

        return (
          <div key={s.id} className="card p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{s.employee.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{fmtDateTime(s.startedAt)}</p>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold uppercase ${statusColor}`}>
                  {s.analysisStatus.replace('_', ' ')}
                </span>
                {s.buildTimeSec && (
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    ⏱ {fmtDuration(s.buildTimeSec)}
                  </p>
                )}
              </div>
            </div>

            {/* Submitted image */}
            {s.imageUrl && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <Image
                  src={blobImgUrl(s.imageUrl)}
                  alt="Work photo"
                  width={400}
                  height={200}
                  className="w-full object-cover max-h-40"
                />
              </div>
            )}

            {/* AI summary */}
            {s.analysisSummary && (
              <div
                className="rounded-lg p-2.5 text-xs"
                style={{
                  background: pass ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${pass ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                  color: pass ? '#86efac' : '#fca5a5',
                }}
              >
                {s.analysisSummary}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
