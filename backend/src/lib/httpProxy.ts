// Routes the backend's outbound `fetch()` calls (MUFG/MURC TTM scrape, live FX)
// through the corporate proxy. Node's built-in fetch ignores HTTP(S)_PROXY env
// vars, so we install an undici ProxyAgent as the global dispatcher.
//
// Imported for its side effect at the very top of main.ts, before any fetch runs.

import { setGlobalDispatcher, ProxyAgent, EnvHttpProxyAgent } from 'undici'

const proxy =
  process.env.HTTPS_PROXY || process.env.https_proxy ||
  process.env.HTTP_PROXY  || process.env.http_proxy || ''

if (proxy) {
  try {
    // EnvHttpProxyAgent honours NO_PROXY (so localhost/DB calls stay direct);
    // fall back to a plain ProxyAgent if it isn't available in this undici build.
    const agent = typeof EnvHttpProxyAgent === 'function'
      ? new EnvHttpProxyAgent()
      : new ProxyAgent(proxy)
    setGlobalDispatcher(agent)
    console.log(`🌐  Outbound fetch routed via proxy: ${proxy}`)
  } catch (e) {
    console.error('[httpProxy] failed to set proxy dispatcher:', e)
  }
}
