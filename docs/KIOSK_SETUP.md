# Tablet Kiosk Setup (Fully Kiosk Browser)

<!-- 2026-10-03 12:00, Phase 4: provisioning guide for StayGuide-managed tablets -->

How to prepare an Android tablet so it boots straight into StayGuide, can't be used for anything else, and recovers on its own from power and Wi-Fi outages.

**Time per tablet:** about 20 minutes once you've done one.
**You need:** the tablet, a charger or wall mount with power, the property's Wi-Fi details, a **Fully Kiosk Browser PLUS** license for this device, and access to the StayGuide company dashboard.

> Fully Kiosk renames menus between versions. Setting names below are what to look for; use the **search box at the top of Fully's settings** to find each one quickly.

---

## 1. Server prerequisites (once, not per tablet)

- [ ] StayGuide is served over **HTTPS**. Offline mode (the service worker) only works on secure origins.
- [ ] `TRUST_PROXY=1` is set on Plesk, so pairing and report rate limits see real client IPs.
- [ ] Database migrations in `database/migrations/` have been applied (`devices` table, `main_image_url`).
- [ ] Your kiosk start URL is `https://<your-stayguide-host>/tablet`.

---

## 2. Prepare the tablet

1. **Factory reset** the device (Settings → System → Reset). Start clean for every property.
2. Walk through Android setup:
   - Connect to the property's Wi-Fi. If the property has a separate device network, use that, not the guest network.
   - Skip adding a personal Google account if possible. If Play Store needs one, use a company account (e.g. `devices@yourcompany.com`), never a personal one.
3. Update Android and Google Play services now, so updates don't reboot the tablet mid-stay later.
4. Set **Display → Screen timeout** to the maximum. Fully will manage the screen from here on.
5. Turn off **battery optimization** for Fully Kiosk after installing it (Settings → Apps → Fully Kiosk → Battery → Unrestricted).
6. Set the **time zone** to the property's location. Check-in/out times and the offline "saved at" banner use it.

---

## 3. Install Fully Kiosk Browser

- Install **Fully Kiosk Browser** from the Play Store (or the APK from fully-kiosk.com), and activate the **PLUS license** for this device. Kiosk mode, scheduling, and remote admin need PLUS.
- Open Fully Kiosk and grant the permissions it asks for (display over other apps, usage access, device admin). Kiosk mode depends on them.

---

## 4. Configure Fully Kiosk

| Setting (search for) | Value | Why |
|---|---|---|
| **Start URL** | `https://<host>/tablet` | Single StayGuide URL for every tablet |
| **Enable Kiosk Mode** | On | Locks the device to StayGuide |
| **Kiosk Exit PIN** | A company PIN (not 1234), stored in your password manager | Staff access; guests can't exit |
| **Launch on Boot** | On | Comes back after power cuts |
| **Keep Screen On** | On (while scheduled awake) | Always ready for guests |
| **Screen Off / Screen On schedule** | e.g. off 23:00, on 07:00 | Saves screen and power; avoids lighting up bedrooms |
| **Screen Brightness** | ~60% | Readable without glare at night |
| **Auto Reload on Network Reconnect** | On | Fresh content after Wi-Fi returns |
| **Auto Reload on Idle** | 30 minutes | Clears whatever the last guest left open |
| **Enable URL Whitelist** | On: `https://<host>/*`, `https://www.youtube-nocookie.com/*`, `https://player.vimeo.com/*` | Blocks browsing anywhere else |
| **Disable Status Bar / Navigation Bar** | On | No access to Android settings |
| **Disable Volume / Power Buttons** | Volume on, power **off** | Guests can adjust video volume; can't turn the tablet off |
| **Disable Camera / Microphone** | On (not used by StayGuide) | Privacy |
| **Remote Administration** (and/or **Fully Cloud**) | On, with a strong admin password | Remote reboot, screenshot, reload |

Leave **Clear Cache on Reload** and **Clear Web Storage** **off**. Clearing them would wipe the tablet's pairing token and offline copy, and the tablet would ask to be paired again.

---

## 5. Pair the tablet with the property

1. In the StayGuide company dashboard: **Properties → Edit (the property) → Tablets**.
2. Optionally type a name (e.g. *Living room*), then click **Pair new tablet**. A 6-digit code appears, valid for **15 minutes** and usable **once**.
3. On the tablet, the StayGuide pairing screen is showing. Enter the code and tap **Pair Tablet**.
4. The property page loads. In the dashboard, the tablet shows as *Last seen just now*.

If the code expires or is mistyped, generate a new one. After **10 wrong attempts** from the same network, pairing is blocked for 15 minutes.

---

## 6. Test before leaving the property

- [ ] Property name, Wi-Fi details, house rules and amenities are correct
- [ ] A how-to video opens and plays inside the page (not in YouTube)
- [ ] Submit a test report (category *Other*, title "Install test"), and confirm it appears for the property in StayGuide. Mark it closed.
- [ ] **Offline test:** turn Wi-Fi off on the tablet. The orange "You're offline" banner appears and the content stays. Turn Wi-Fi back on; the banner clears within a minute.
- [ ] **Reboot test:** hold power (use the exit PIN if needed) and restart. The tablet returns to the StayGuide page on its own.
- [ ] Try to leave: swipe from the edges, press home and back. You should stay in StayGuide.
- [ ] The screen schedule is set for the property's quiet hours

---

## 7. Mounting

- Use a **lockable enclosure or mount** with built-in charging. Tablets left loose disappear or end up dead in a drawer.
- Mount near the entry or living area at eye height, away from direct sunlight and steam (not by a kitchen stove or bathroom).
- Run power so the cable can't be unplugged casually. Tablets in kiosk mode should stay at 100% on the charger. If the model supports a charge limit (e.g. 85% "battery protection"), enable it to slow battery swelling.

---

## 8. Day-to-day operations

| Situation | What to do |
|---|---|
| Content changed in the dashboard | Nothing. Tablets refresh every 15 minutes and on reconnect. Remote-reload from Fully for an instant update. |
| Tablet lost, stolen, or replaced | Dashboard → Tablets → **Revoke**. It immediately loses access and deletes its cached property details on its next connection. |
| Moving a tablet to another property | Revoke it at the old property, then pair it at the new one (no reset needed). |
| Tablet shows the pairing screen unexpectedly | It was revoked, or its storage was cleared. Pair again with a new code. |
| Tablet shows "No internet connection" with no content | It has never loaded content on this Wi-Fi. Fix the network; it retries every 30 seconds. |
| "Last seen" is hours old in the dashboard | Check power and Wi-Fi; use Fully Remote Admin to reload or reboot. |

---

## 9. Security notes

- The tablet's pairing token is the only credential on the device. It can't access the dashboard or other properties, and **Revoke** cancels it instantly.
- Never sign in to the StayGuide dashboard on a guest tablet.
- Keep the Fully exit PIN and remote-admin password in the company password manager, and change them if staff leave.
- Don't install other apps on guest tablets.
