

# Multi-Guest Selection in Transport Form

## Current Behavior
The transport form has a single `guest_id` select dropdown. One transport = one guest.

## Proposed Approach
In the **Create** dialog, allow selecting multiple guests. For each selected guest, display their hotel (from `guests.hotel_nome`) as the destination, editable per guest. On submit, create **one transport record per guest**, each with the guest's hotel as destination.

In the **Edit** dialog, keep single guest (transport already exists as individual record).

## Implementation Details

### `src/pages/TransportsPage.tsx`

1. **Form state**: Replace `guest_id: string` with `guest_ids: string[]` and `guest_destinations: Record<string, string>` (maps guest_id to their destination) in the create form only.

2. **Multi-select UI**: Replace the single guest `<Select>` in the create form with a checkbox-based list of guests. When a guest is checked:
   - Add them to `guest_ids[]`
   - Auto-fill `guest_destinations[guestId]` with their `hotel_nome` from the guests table
   - Show an editable destination input next to/below each selected guest

3. **Submit logic** (`handleAdd`): Loop over `guest_ids`, call `create.mutateAsync()` once per guest, using `guest_destinations[guestId]` as `destino` and `guest_id` as the guest link.

4. **Edit dialog**: Unchanged -- keeps single `guest_id` select since each transport is already linked to one guest.

5. **Display/cards/PDF**: No changes needed -- each transport already shows its single linked guest.

### Files Changed
- `src/pages/TransportsPage.tsx` (form state, create form UI, handleAdd logic)

