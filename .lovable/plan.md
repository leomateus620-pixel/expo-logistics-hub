

# Fix: Vehicle Documents Publicly Readable

## Problem
The `vehicle-documents` storage bucket is public and the SELECT policy allows unauthenticated access with only a `bucket_id` check. Documents may contain RENAVAM and sensitive registration data.

## Solution

The file path convention is `{org_id}/{vehicle_id}/{timestamp}.{ext}`. We can restrict SELECT to authenticated org members by extracting the `org_id` from the object path.

### 1. SQL Migration — Replace storage policy

```sql
-- Drop the existing permissive policy
DROP POLICY IF EXISTS "vehicle_docs_select" ON storage.objects;

-- Create restricted policy: only authenticated org members can read
CREATE POLICY "vehicle_docs_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'vehicle-documents'
  AND is_org_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);
```

The `storage.foldername(name)` returns an array of path segments. The first segment is the `org_id`.

### 2. Code Change — Use authenticated URL instead of public URL

In `src/hooks/useVehicles.ts`, replace `getPublicUrl` with `createSignedUrl` so that document access goes through authenticated storage API:

```typescript
const { data, error: signError } = await supabase.storage
  .from('vehicle-documents')
  .createSignedUrl(path, 3600); // 1 hour expiry
if (signError) throw signError;
return data.signedUrl;
```

Also update any document viewing code in `VehiclesPage.tsx` to use signed URLs when displaying documents.

### 3. Verify existing upload/insert policies

Ensure INSERT policy on the bucket also requires authentication and org membership (same pattern).

## Files Changed

| File | Action |
|---|---|
| SQL migration | Drop old policy, create org-scoped SELECT policy |
| `src/hooks/useVehicles.ts` | Switch from `getPublicUrl` to `createSignedUrl` |
| `src/pages/VehiclesPage.tsx` | Update document display to handle signed URLs |

