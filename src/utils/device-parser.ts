export function parseDeviceName(userAgent?: string | null): string {
  if (!userAgent || typeof userAgent !== 'string') return 'Unknown Device';

  const ua = userAgent.toLowerCase();
  let os = 'Unknown OS';
  let browser = 'Browser';

  // Operating System detection
  if (ua.includes('windows nt 10.0') || ua.includes('windows')) os = 'Windows';
  else if (ua.includes('iphone')) os = 'iPhone';
  else if (ua.includes('ipad')) os = 'iPad';
  else if (ua.includes('macintosh') || ua.includes('mac os x')) os = 'macOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('cros')) os = 'ChromeOS';

  // Browser engine & application detection
  if (ua.includes('edg/') || ua.includes('edge/')) browser = 'Edge';
  else if (ua.includes('opr/') || ua.includes('opera/')) browser = 'Opera';
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome';
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
  else if (ua.includes('firefox/')) browser = 'Firefox';

  return `${browser} on ${os}`;
}

export function maskIp(ip?: string | null): string {
  if (!ip || typeof ip !== 'string') return 'Unknown IP';
  if (ip === '::1' || ip === '127.0.0.1' || ip.includes('localhost')) {
    return '127.0.*.* (Localhost)';
  }

  // IPv4 standard masking
  const ipv4Match = ip.match(/(\d+\.\d+)\.\d+\.\d+/);
  if (ipv4Match) {
    return `${ipv4Match[1]}.*.*`;
  }

  // IPv6 masking
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 2).join(':')}:****:****`;
  }

  return ip;
}
