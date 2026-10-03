// 2026-10-03 17:00, "Join Wi-Fi" QR payload (ZXing format: WIFI:T:WPA;S:<ssid>;P:<password>;;). Scanning it on iOS/Android joins the network.
// Special characters \ ; , : " must be backslash-escaped in the SSID and password.
const escapeWifi = (value: string): string => value.replace(/([\\;,:"])/g, '\\$1');

export const wifiQrPayload = (ssid: string, password?: string | null): string | null => {
  if (!ssid) return null;
  return password
    ? `WIFI:T:WPA;S:${escapeWifi(ssid)};P:${escapeWifi(password)};;`
    : `WIFI:T:nopass;S:${escapeWifi(ssid)};;`;
};
