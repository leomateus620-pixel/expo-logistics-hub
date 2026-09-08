import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { PUSH_ICON_PATH } from '../_shared/pushMessage.ts'

// Espelho do send-transactional-email para o canal push.
// Só aceita chamadas com service-role (workers internos).
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/firebase_messaging'

interface PushDeviceRow {
  id: string
  fcm_token: string
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 500)
  }

  const authToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!authToken || authToken !== serviceKey) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let userId: string
  let title: string
  let body: string
  let eventId: string | null = null
  let path: string | null = null
  try {
    const payload = await req.json()
    userId = String(payload.userId ?? '')
    title = String(payload.title ?? '').slice(0, 120)
    body = String(payload.body ?? '').slice(0, 300)
    eventId = payload.eventId ? String(payload.eventId) : null
    path = payload.path ? String(payload.path) : null
  } catch {
    return json({ error: 'Invalid JSON in request body' }, 400)
  }

  if (!userId || !title) {
    return json({ error: 'userId and title are required' }, 400)
  }
  if (path && !path.startsWith('/')) {
    return json({ error: 'path must be app-relative' }, 400)
  }

  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  const connectionApiKey = Deno.env.get('FIREBASE_MESSAGING_API_KEY')
  if (!lovableApiKey || !connectionApiKey) {
    console.error('Firebase Cloud Messaging connection is not configured')
    return json({ success: false, reason: 'push_not_configured' }, 200)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: devices, error: devicesError } = await supabase
    .from('push_devices')
    .select('id, fcm_token')
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (devicesError) {
    console.error('Failed to load push devices', { error: devicesError, userId })
    return json({ error: 'Failed to load devices' }, 500)
  }

  const deviceList = (devices ?? []) as PushDeviceRow[]
  if (!deviceList.length) {
    return json({ success: false, reason: 'no_active_device' }, 200)
  }

  let delivered = 0
  const failures: string[] = []

  for (const device of deviceList) {
    const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': connectionApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: device.fcm_token,
          notification: { title, body },
          data: {
            path: path ?? '/',
            eventId: eventId ?? '',
          },
          webpush: {
            fcm_options: { link: path ?? '/' },
            notification: { icon: '/favicon.ico' },
          },
        },
      }),
    })

    if (res.ok) {
      delivered += 1
      await supabase.from('push_send_log').insert({
        user_id: userId,
        event_id: eventId,
        device_id: device.id,
        title,
        status: 'sent',
      })
      continue
    }

    const errorBody = await res.text()
    console.error(`FCM send failed [${res.status}]: ${errorBody.slice(0, 300)}`)

    // Token inválido/expirado: revoga em vez de tentar de novo.
    const stale = res.status === 404 || (res.status === 400 && errorBody.includes('INVALID_ARGUMENT'))
    if (stale) {
      await supabase
        .from('push_devices')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', device.id)
    }
    await supabase.from('push_send_log').insert({
      user_id: userId,
      event_id: eventId,
      device_id: device.id,
      title,
      status: stale ? 'stale_token' : 'failed',
      error_message: `[${res.status}] ${errorBody.slice(0, 200)}`,
    })
    if (!stale) failures.push(String(res.status))
  }

  if (delivered > 0) {
    return json({ success: true, delivered })
  }
  if (failures.length) {
    return json({ error: 'Push delivery failed', details: failures.join(',') }, 502)
  }
  return json({ success: false, reason: 'no_valid_device' }, 200)
})
