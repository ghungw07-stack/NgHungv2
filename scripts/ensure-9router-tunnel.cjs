const api = require("/usr/lib/node_modules/9router/src/cli/api/client.js");

let checking = false;

async function ensureTunnel() {
  if (checking) return;
  checking = true;
  try {
    const status = await api.getTunnelStatus();
    if (status.success && status.data?.tunnel?.running) return;

    const result = await api.enableTunnel();
    if (!result.success || !result.data?.success) {
      console.error(`[9router-tunnel] ${result.error || "Không thể bật tunnel"}`);
    }
  } catch (error) {
    console.error(`[9router-tunnel] ${error.message}`);
  } finally {
    checking = false;
  }
}

void ensureTunnel();
setInterval(ensureTunnel, 30_000);
