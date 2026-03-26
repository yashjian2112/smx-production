'use client';

import { useState, useEffect, useRef } from 'react';

type Note = {
  id: string;
  content: string;
  role: string;
  createdAt: string;
  author: { name: string };
};

const ROLE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  SALES:              { bg: 'rgba(56,189,248,0.1)',   color: '#38bdf8', label: 'Sales'      },
  ADMIN:              { bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24', label: 'Admin'      },
  ACCOUNTS:           { bg: 'rgba(52,211,153,0.1)',   color: '#34d399', label: 'Accounts'   },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function OrderNotes({
  orderId,
  currentRole,
  initialNotes,
}: {
  orderId: string;
  currentRole: string;
  initialNotes: Note[];
}) {
  const [notes, setNotes]     = useState<Note[]>(initialNotes);
  const [input, setInput]     = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError]     = useState('');
  const bottomRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes]);

  const canPost = ['ADMIN', 'SALES', 'ACCOUNTS'].includes(currentRole);

  async function postNote() {
    if (!input.trim() || posting) return;
    setPosting(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim() }),
      });
      if (!res.ok) { setError('Failed to post note'); return; }
      const note = await res.json() as Note;
      setNotes((prev) => [...prev, note]);
      setInput('');
    } catch {
      setError('Network error');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div id="notes" className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Notes</span>
        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <span className="text-[10px] text-zinc-600">{notes.length} message{notes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Thread */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {notes.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="text-zinc-600 text-xs">No notes yet. Leave a message below.</p>
          </div>
        ) : (
          notes.map((n) => {
            const st = ROLE_STYLE[n.role] ?? ROLE_STYLE.ADMIN;
            const isOwn = false; // server-side check not available in client; always left-align
            return (
              <div key={n.id} className="card p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">{n.author.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                  <span className="text-[10px] text-zinc-600 ml-auto">{fmtDateTime(n.createdAt)}</span>
                </div>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{n.content}</p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {canPost && (
        <div className="space-y-2">
          <textarea
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
            placeholder="Add a note… (SALES can ask questions, Production can update status)"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postNote();
            }}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-600">⌘+Enter to send</span>
            <button
              type="button"
              onClick={postNote}
              disabled={posting || !input.trim()}
              className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}
            >
              {posting ? 'Posting…' : 'Post Note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
