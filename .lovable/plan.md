

# Fix: Remove Dead Inline Functions from TransportsPage.tsx

## Problem
Line 894 contains invalid Unicode box-drawing characters (`═══`) from a leftover comment. Lines 894-1396 contain duplicate `TransportCard` and detail view functions that were already extracted to `src/components/transport/TransportCard.tsx` and `src/components/transport/TransportDetailView.tsx`.

## Fix
**File**: `src/pages/TransportsPage.tsx`

**Action**: Delete lines 893-1396 entirely. The file should end at line 892 with the closing `}` of the main `TransportsPage` component.

The main component already imports and uses the extracted components:
- Line 30: `import TransportCard from '@/components/transport/TransportCard'`
- Line 31: `import TransportDetailView from '@/components/transport/TransportDetailView'`
- Line 32: `import TransportForm from '@/components/transport/TransportForm'`

No other changes needed — just remove ~500 lines of dead code.

