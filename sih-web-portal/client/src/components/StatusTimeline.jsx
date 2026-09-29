const DOT = {
  submitted: 'bg-slate-400',
  pending: 'bg-yellow-500',
  'in-progress': 'bg-blue-500',
  resolved: 'bg-green-500',
}

const LABEL = {
  submitted: 'Issue Submitted',
  pending: 'Marked as Pending',
  'in-progress': 'Work Started',
  resolved: 'Issue Resolved',
}

export function StatusTimeline({ issue }) {
  const entries = [
    { status: 'submitted', changedAt: issue.createdAt, note: null },
    ...(issue.statusHistory || []),
  ]

  return (
    <div>
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${DOT[entry.status] || 'bg-slate-400'}`} />
            {i < entries.length - 1 && (
              <div className="w-px bg-border my-1" style={{ minHeight: 16, flex: 1 }} />
            )}
          </div>
          <div className={i < entries.length - 1 ? 'pb-4' : ''}>
            <p className="text-sm font-medium leading-tight">{LABEL[entry.status] || entry.status}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(entry.changedAt).toLocaleString('en-IN')}
            </p>
            {entry.note && (
              <p className="text-xs text-muted-foreground mt-0.5 italic">"{entry.note}"</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
