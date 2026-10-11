import { wifiQrPayload } from '../../src/utils/wifi';
import { weatherCondition, geocodeCandidates } from '../../src/utils/weather';
import { productionConfigProblems } from '../../src/utils/production-check'; // 2026-10-09 08:15, #46
import { parseCoords, parseFix, distanceM, placeOf, formatDistance } from '../../src/utils/geo'; // 2026-10-10 10:40, #62
let pass = 0, fail = 0;
const eq = (name: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)}`); };
eq('wifi plain', wifiQrPayload('Home', 'pass123'), 'WIFI:T:WPA;S:Home;P:pass123;;');
eq('wifi escapes ; , : " \\ in ssid and password', wifiQrPayload('A;B,C:D"E\\F', 'p;w,d:"\\x'), 'WIFI:T:WPA;S:A\\;B\\,C\\:D\\"E\\\\F;P:p\\;w\\,d\\:\\"\\\\x;;');
eq('wifi open network', wifiQrPayload('Cafe', ''), 'WIFI:T:nopass;S:Cafe;;');
eq('wifi no ssid', wifiQrPayload('', 'x'), null);
for (const [code, want] of [[0,'clear'],[1,'clear'],[2,'partly'],[3,'cloudy'],[45,'fog'],[48,'fog'],[51,'rain'],[57,'rain'],[61,'rain'],[67,'rain'],[71,'snow'],[77,'snow'],[80,'rain'],[82,'rain'],[85,'snow'],[86,'snow'],[95,'storm'],[99,'storm'],[999,'cloudy']] as const) eq(`weather code ${code}`, weatherCondition(code), want);
eq('geocode candidates', geocodeCandidates('456 Ocean Drive, Beach City, CA 90210'), ['90210', 'Beach City', '456 Ocean Drive, Beach City, CA 90210']);
// 2026-10-09 08:15, #46: production startup check
const goodEnv = { JWT_SECRET: 'a'.repeat(64), DB_NAME: 'sg', DB_USER: 'sg', APP_BASE_URL: 'https://stayguide.app', OPS_SECRET_KEY: 'b'.repeat(64),
  STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', TRUST_PROXY: '1', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'mail', VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k', SUPPORT_EMAIL: 's@x' };
eq('prod config clean', productionConfigProblems(goodEnv, 'v20.9.0'), { errors: [], warnings: [] });
eq('prod config old node', productionConfigProblems(goodEnv, 'v20.8.1').errors.length, 1);
const bad = productionConfigProblems({ ...goodEnv, JWT_SECRET: 'your_strong_production_jwt_secret_key_here', MOCK_DATABASE: 'true', APP_BASE_URL: 'http://localhost:3000',
  OPS_SECRET_KEY: 'short', STRIPE_WEBHOOK_SECRET: '' }, 'v22.1.0');
eq('prod config bad errors', bad.errors.map(e => e.split(' ')[0]), ['JWT_SECRET', 'MOCK_DATABASE=true', 'APP_BASE_URL', 'OPS_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
eq('prod config warnings', productionConfigProblems({ ...goodEnv, STRIPE_SECRET_KEY: 'sk_test_x', TRUST_PROXY: '', EMAIL_PROVIDER: 'mock' }, 'v22.1.0').warnings.length, 3);
// 2026-10-10 10:40, #62 presence: coordinates, maps links, distance, place labels
eq('coords plain', parseCoords('39.7392, -104.9903'), { lat: 39.7392, lng: -104.9903 });
eq('coords google @', parseCoords('https://www.google.com/maps/place/X/@39.7392,-104.9903,17z/data=!3m1'), { lat: 39.7392, lng: -104.9903 });
eq('coords google !3d!4d wins over @', parseCoords('https://www.google.com/maps/place/X/@39.7,-104.9,17z/data=!4m5!3m4!8m2!3d39.7392!4d-104.9903'), { lat: 39.7392, lng: -104.9903 });
eq('coords apple ll', parseCoords('https://maps.apple.com/?ll=39.7392,-104.9903&q=Cabin'), { lat: 39.7392, lng: -104.9903 });
eq('coords ?q=', parseCoords('https://maps.google.com/?q=39.7392%2C-104.9903'), { lat: 39.7392, lng: -104.9903 });
eq('coords junk', parseCoords('my cabin'), null);
eq('coords out of range', parseCoords('95, 10'), null);
eq('coords 0,0 rejected', parseCoords('0, 0'), null);
eq('fix valid', parseFix({ lat: '39.73921234', lng: -104.99, accuracy: 12.6 }), { lat: 39.739212, lng: -104.99, accuracy: 13 });
eq('fix missing accuracy', parseFix({ lat: 1, lng: 1 }), null);
eq('fix not an object', parseFix('39,-104'), null);
eq('distance ~1.22 km per 0.011 deg lat', Math.round(distanceM({ lat: 39.7392, lng: -104.9903 }, { lat: 39.7502, lng: -104.9903 }) / 10), 122);
eq('place none', placeOf(null, null, null).state, 'none');
eq('place unset', placeOf(39.7, null, 10).state, 'unset');
eq('place at (accuracy slack)', placeOf(39.7, 200, 80).state, 'at');
eq('place away label', placeOf(39.7, 1223, 15).label, '1.2 km from the property');
eq('distance format m', formatDistance(437), '440 m');
console.log(`\n${pass}/${pass + fail} unit checks passed`); process.exit(fail ? 1 : 0);
