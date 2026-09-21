/**
 * CloudFlare Worker - P3 Lending Auto-Failover
 * FREE TIER: 100k requests/day
 * Checks homelab health and automatically updates DNS
 */

// Configuration - Set these in CloudFlare Worker environment variables
const CONFIG = {
  HOMELAB_IP: '68.106.211.95',
  HOMELAB_URL: 'https://p3lending.space/health',
  BACKUP_URL: 'https://YOUR_BACKUP_URL/health', // Railway/Render/Fly.io URL
  ZONE_ID: 'YOUR_CLOUDFLARE_ZONE_ID',
  RECORD_NAME: 'p3lending.space',
  CHECK_TIMEOUT: 5000,
  CONSECUTIVE_FAILURES_THRESHOLD: 2,
  CONSECUTIVE_SUCCESSES_THRESHOLD: 3,
}

// Environment variables needed:
// - CF_API_TOKEN: CloudFlare API token with DNS edit permissions
// - ALERT_EMAIL: Your email for notifications
// - MAILGUN_API_KEY: Mailgun API key (optional, for email notifications)
// - MAILGUN_DOMAIN: Mailgun domain (optional)

export default {
  /**
   * Scheduled event (Cron Trigger: */2 * * * * = every 2 minutes)
   */
  async scheduled(event, env, ctx) {
    console.log('Health check triggered at:', new Date().toISOString())

    try {
      await checkHealthAndFailover(env)
    } catch (error) {
      console.error('Failover check error:', error)
      await sendAlert(env, `Failover check error: ${error.message}`)
    }
  },

  /**
   * HTTP endpoint for manual testing
   * Visit: https://your-worker.workers.dev/
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Manual trigger endpoint
    if (url.pathname === '/check') {
      const result = await checkHealthAndFailover(env)
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Status endpoint
    if (url.pathname === '/status') {
      const state = await getState(env)
      return new Response(JSON.stringify(state, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Health endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 })
    }

    // Default response
    return new Response(`
      <html>
        <head><title>P3 Lending Failover</title></head>
        <body>
          <h1>P3 Lending Auto-Failover Worker</h1>
          <p>Status: Running</p>
          <ul>
            <li><a href="/check">Trigger manual check</a></li>
            <li><a href="/status">View current status</a></li>
            <li><a href="/health">Health check</a></li>
          </ul>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    })
  }
}

/**
 * Main failover logic
 */
async function checkHealthAndFailover(env) {
  // Get current state from KV storage
  const state = await getState(env)

  // Check homelab health
  const homelabHealthy = await checkHealth(CONFIG.HOMELAB_URL, CONFIG.CHECK_TIMEOUT)

  console.log('Homelab health:', homelabHealthy)

  // Update consecutive counters
  if (homelabHealthy) {
    state.consecutive_failures = 0
    state.consecutive_successes = (state.consecutive_successes || 0) + 1
  } else {
    state.consecutive_successes = 0
    state.consecutive_failures = (state.consecutive_failures || 0) + 1
  }

  // Get current DNS configuration
  const currentMode = state.mode || 'homelab'
  let actionTaken = 'none'

  // Decision logic: Should we failover?
  if (currentMode === 'homelab' && state.consecutive_failures >= CONFIG.CONSECUTIVE_FAILURES_THRESHOLD) {
    console.log(`Homelab failed ${state.consecutive_failures} times, initiating failover`)

    // Failover to backup
    await updateDNS(env, 'backup')
    state.mode = 'backup'
    state.last_failover = new Date().toISOString()
    state.failover_count = (state.failover_count || 0) + 1
    actionTaken = 'failover'

    await sendAlert(env, `🚨 Homelab is DOWN. Failing over to backup. This is failover #${state.failover_count}`)
  }
  // Decision logic: Should we failback?
  else if (currentMode === 'backup' && state.consecutive_successes >= CONFIG.CONSECUTIVE_SUCCESSES_THRESHOLD) {
    console.log(`Homelab recovered with ${state.consecutive_successes} successful checks, initiating failback`)

    // Failback to homelab
    await updateDNS(env, 'homelab')
    state.mode = 'homelab'
    state.last_failback = new Date().toISOString()
    actionTaken = 'failback'

    await sendAlert(env, `✅ Homelab is RECOVERED. Failing back to homelab.`)
  }

  // Update state
  state.last_check = new Date().toISOString()
  state.homelab_healthy = homelabHealthy
  await saveState(env, state)

  return {
    action: actionTaken,
    mode: state.mode,
    homelab_healthy: homelabHealthy,
    consecutive_failures: state.consecutive_failures,
    consecutive_successes: state.consecutive_successes,
    last_check: state.last_check
  }
}

/**
 * Check health of a URL
 */
async function checkHealth(url, timeout) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'P3-Lending-Failover-Worker/1.0'
      }
    })

    clearTimeout(timeoutId)

    return response.ok && response.status === 200
  } catch (error) {
    console.error(`Health check failed for ${url}:`, error.message)
    return false
  }
}

/**
 * Update CloudFlare DNS record
 */
async function updateDNS(env, targetMode) {
  const CF_API_TOKEN = env.CF_API_TOKEN
  const ZONE_ID = CONFIG.ZONE_ID

  // Get current DNS record
  const listUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=${CONFIG.RECORD_NAME}&type=A`
  const listResponse = await fetch(listUrl, {
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  const listData = await listResponse.json()

  if (!listData.success || listData.result.length === 0) {
    throw new Error('Failed to get DNS record')
  }

  const recordId = listData.result[0].id

  // Determine target IP/CNAME
  let dnsUpdate

  if (targetMode === 'homelab') {
    // Point to homelab IP
    dnsUpdate = {
      type: 'A',
      name: CONFIG.RECORD_NAME,
      content: CONFIG.HOMELAB_IP,
      ttl: 60,
      proxied: true
    }
  } else {
    // Point to backup
    // Note: CloudFlare proxy doesn't support CNAME at root, so we need to resolve it to IP
    const backupIP = await resolveBackupIP()
    dnsUpdate = {
      type: 'A',
      name: CONFIG.RECORD_NAME,
      content: backupIP,
      ttl: 60,
      proxied: true
    }
  }

  // Update DNS record
  const updateUrl = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${recordId}`
  const updateResponse = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dnsUpdate)
  })

  const updateData = await updateResponse.json()

  if (!updateData.success) {
    throw new Error(`DNS update failed: ${JSON.stringify(updateData.errors)}`)
  }

  console.log(`DNS updated to ${targetMode}:`, dnsUpdate.content)
  return updateData
}

/**
 * Resolve backup hostname to IP
 */
async function resolveBackupIP() {
  // Extract hostname from backup URL
  const backupHostname = new URL(CONFIG.BACKUP_URL).hostname

  // Use Google DNS-over-HTTPS to resolve
  const dohUrl = `https://dns.google/resolve?name=${backupHostname}&type=A`
  const response = await fetch(dohUrl)
  const data = await response.json()

  if (data.Answer && data.Answer.length > 0) {
    return data.Answer[0].data
  }

  throw new Error(`Failed to resolve ${backupHostname}`)
}

/**
 * Send email alert
 */
async function sendAlert(env, message) {
  const ALERT_EMAIL = env.ALERT_EMAIL

  if (!ALERT_EMAIL) {
    console.log('No alert email configured, skipping notification')
    return
  }

  // Option 1: Mailgun (if configured)
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
    await sendMailgunEmail(env, ALERT_EMAIL, message)
  }
  // Option 2: SendGrid (if configured)
  else if (env.SENDGRID_API_KEY) {
    await sendSendGridEmail(env, ALERT_EMAIL, message)
  }
  // Option 3: Log only
  else {
    console.log(`ALERT: ${message}`)
  }
}

async function sendMailgunEmail(env, to, message) {
  const url = `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`

  const formData = new FormData()
  formData.append('from', `P3 Failover <failover@${env.MAILGUN_DOMAIN}>`)
  formData.append('to', to)
  formData.append('subject', 'P3 Lending Failover Alert')
  formData.append('text', `${message}\n\nTimestamp: ${new Date().toISOString()}`)

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`api:${env.MAILGUN_API_KEY}`)
    },
    body: formData
  })
}

async function sendSendGridEmail(env, to, message) {
  const url = 'https://api.sendgrid.com/v3/mail/send'

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'failover@p3lending.space', name: 'P3 Failover' },
      subject: 'P3 Lending Failover Alert',
      content: [{ type: 'text/plain', value: `${message}\n\nTimestamp: ${new Date().toISOString()}` }]
    })
  })
}

/**
 * Get state from KV storage
 */
async function getState(env) {
  if (!env.FAILOVER_STATE) {
    // No KV storage, use in-memory (will reset on every invocation)
    return {
      mode: 'homelab',
      consecutive_failures: 0,
      consecutive_successes: 0,
      failover_count: 0
    }
  }

  const stateJson = await env.FAILOVER_STATE.get('current')

  if (!stateJson) {
    return {
      mode: 'homelab',
      consecutive_failures: 0,
      consecutive_successes: 0,
      failover_count: 0
    }
  }

  return JSON.parse(stateJson)
}

/**
 * Save state to KV storage
 */
async function saveState(env, state) {
  if (!env.FAILOVER_STATE) {
    console.log('No KV storage configured, state not persisted')
    return
  }

  await env.FAILOVER_STATE.put('current', JSON.stringify(state))
}
