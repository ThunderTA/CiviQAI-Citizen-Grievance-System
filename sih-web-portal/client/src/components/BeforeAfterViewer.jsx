import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, Image as ImageIcon, ArrowRight } from 'lucide-react'

export function BeforeAfterViewer({ beforeImage, afterImage, verification }) {
  const [activeTab, setActiveTab] = useState('side-by-side') // 'side-by-side' | 'before' | 'after'

  if (!beforeImage && !afterImage) return null

  const verdict = verification?.verdict || (verification?.isVerified ? 'verified' : 'unverified')
  const score = verification?.completionScore || 0
  const explanation = verification?.aiExplanation

  const getVerdictBadge = () => {
    switch (verdict) {
      case 'verified':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 gap-1 text-xs py-1 px-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            AI Verified Resolution ({score}%)
          </Badge>
        )
      case 'inconclusive':
        return (
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 gap-1 text-xs py-1 px-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Inconclusive AI Inspection ({score}%)
          </Badge>
        )
      case 'mismatch':
        return (
          <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 gap-1 text-xs py-1 px-2.5">
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
            Discrepancy Detected ({score}%)
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="gap-1 text-xs py-1 px-2.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Resolution Photo Submitted
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Resolution Proof & AI Inspection</h4>
        </div>
        <div>{getVerdictBadge()}</div>
      </div>

      {/* View Selector Tabs */}
      <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg w-fit text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('side-by-side')}
          className={`px-3 py-1 rounded-md transition-colors ${
            activeTab === 'side-by-side' ? 'bg-background shadow-xs font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Side by Side
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('before')}
          className={`px-3 py-1 rounded-md transition-colors ${
            activeTab === 'before' ? 'bg-background shadow-xs font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Before Photo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('after')}
          className={`px-3 py-1 rounded-md transition-colors ${
            activeTab === 'after' ? 'bg-background shadow-xs font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          After Photo
        </button>
      </div>

      {/* Image Display */}
      {activeTab === 'side-by-side' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Before */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                ● BEFORE (Reported)
              </span>
            </div>
            <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted/20 flex items-center justify-center">
              {beforeImage ? (
                <img src={beforeImage} alt="Before Issue" className="w-full h-full object-cover" />
              ) : (
                <div className="text-xs text-muted-foreground flex flex-col items-center gap-1">
                  <ImageIcon className="h-5 w-5 opacity-40" />
                  <span>No original photo</span>
                </div>
              )}
            </div>
          </div>

          {/* After */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                ● AFTER (Resolved)
              </span>
            </div>
            <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted/20 flex items-center justify-center">
              {afterImage ? (
                <img src={afterImage} alt="After Resolution" className="w-full h-full object-cover" />
              ) : (
                <div className="text-xs text-muted-foreground flex flex-col items-center gap-1">
                  <ImageIcon className="h-5 w-5 opacity-40" />
                  <span>No resolution photo</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'before' && (
        <div className="relative max-h-72 aspect-video rounded-lg overflow-hidden border bg-muted/20 mx-auto">
          {beforeImage ? (
            <img src={beforeImage} alt="Before Issue" className="w-full h-full object-contain" />
          ) : (
            <div className="text-xs text-muted-foreground flex items-center justify-center h-full">No original photo</div>
          )}
        </div>
      )}

      {activeTab === 'after' && (
        <div className="relative max-h-72 aspect-video rounded-lg overflow-hidden border bg-muted/20 mx-auto">
          {afterImage ? (
            <img src={afterImage} alt="After Resolution" className="w-full h-full object-contain" />
          ) : (
            <div className="text-xs text-muted-foreground flex items-center justify-center h-full">No resolution photo</div>
          )}
        </div>
      )}

      {/* AI Explanation Callout */}
      {explanation && (
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-xs leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold text-foreground mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Inspector Summary
          </div>
          <p className="text-muted-foreground">{explanation}</p>
        </div>
      )}
    </div>
  )
}
