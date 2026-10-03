# StayGuide Integration Guide for Property Website Developers

**Audience:** developers who build or maintain a property owner's or manager's own website (direct-booking site, brand site, or guest portal).
**Version:** 0.2 (draft integration contract), 2026-10-03

> **Status:** StayGuide is in active development. Each section is labelled:
> - **Available**: needs nothing from StayGuide; do it now.
> - **Planned**: the API and webhooks are specified here but not built. Paths and payloads may change before v1. Build against these only after your StayGuide contact confirms they're live in your environment.

---

## 1. What StayGuide does, and where your website fits

StayGuide puts a locked-down tablet inside each rental. It shows guests Wi-Fi, house rules, how-to videos, local recommendations, and an issue-report button. It also prompts guests who are in the property to **book their next stay directly** and to **leave a review**.

Your website is where those guests land. A good integration does four things:

| Goal | What you do | Status |
|---|---|---|
| Turn current guests into direct bookings | Provide booking URLs; capture StayGuide tracking parameters | **Available** |
| Collect reviews | Provide a review URL (Google Business Profile or your site) | **Available** |
| Prove ROI to the owner | Report bookings that came from the tablet | **Planned** (Conversions API) |
| Keep the tablet in sync with stays | Send reservations (check-in/out) to StayGuide | **Planned** (Stays API) |
| React to guest issues | Receive guest-report webhooks | **Planned** (Webhooks) |

If the owner uses a property management system (Hostaway, Guesty, Hospitable, Lodgify, OwnerRez), StayGuide will read reservations **from the PMS** (planned). In that case **skip section 5** and do not send stays yourself; doing both causes duplicates.

---

## 2. Before you start

You'll need from the property manager (they find these in the StayGuide company dashboard):

- **Company slug**, e.g. `demo-rentals`
- **Property slugs** for each rental, e.g. `seaside-villa`
- For Planned APIs: a **company API key** (`sg_live_…` / `sg_test_…`) and a **webhook signing secret** (`whsec_…`)

Your site must:

- Be served over **HTTPS**. Tablet QR codes and links will not open plain HTTP.
- Have **mobile-friendly landing pages**. Guests scan QR codes with their phones.
- Load fast on mobile (aim for under 2.5s LCP). Guests on rental Wi-Fi are often on slow connections.

---

## 3. Links StayGuide shows on the tablet (Available)

The manager enters these per property in the StayGuide dashboard (**Edit property → Direct Booking & Reviews**). Your job is to give them stable, deep URLs.

**How guests reach your site:** the tablet runs in locked kiosk mode, so it doesn't open your site itself. It shows **QR codes** that guests scan with their own phone. Each QR code points to a StayGuide redirect (`https://<stayguide-host>/r/<property-id>/book`, `/review`, or `/showcase/<other-property-id>`). The redirect counts the scan and sends the guest to your URL with the tracking parameters in section 4. Guests land on your site **on a phone**.

- The **book direct** QR code shows on every paired tablet once `direct_booking_url` is set, with the `return_guest_offer` text under it.
- The **review** QR code shows only on the current guest's **checkout day**. The manager sets that date per property; a reservation sync will replace this later (section 5).
- **Other properties** (up to 3) are the company's other StayGuide properties that have a `direct_booking_url`.
- Only http(s) URLs are accepted. Clearing a field hides its QR code, and its redirect then returns 404.

| Field | What it should point to | Example |
|---|---|---|
| `direct_booking_url` | The booking page **for this specific property**, not your homepage | `https://seasiderentals.com/stay/seaside-villa` |
| `review_url` | A Google Business Profile review link or your own review page | `https://g.page/r/XXXX/review` |
| `return_guest_offer` | Text plus a code your checkout accepts | `10% off your next stay: code WELCOMEBACK10` |
| Other properties | The `direct_booking_url` of each of the manager's other StayGuide properties | `https://seasiderentals.com/stay/mountain-cabin` |

**Requirements**

1. **Deep link to the property with dates selectable.** Every extra click loses bookings.
2. **The offer code must work at checkout**, and be visible before the payment step. Hidden or surprise fees at checkout are the biggest cause of abandonment.
3. **Keep URLs stable.** If you must change them, redirect (301) the old ones. Printed and on-screen QR codes can't be updated instantly.
4. **Accept unknown query parameters.** Don't strip or reject `utm_*` or `sg_*` parameters (see section 4).

---

## 4. Tracking parameters (Available)

When the redirect sends a guest to your site, it adds these parameters. Any query parameters already in your URL are kept.

```
?utm_source=stayguide
&utm_medium=qr                # scanned from the tablet screen
&utm_campaign=return_guest    # or "showcase" / "review"
&utm_content=<property_slug>  # the property the guest is staying in
&sg_click=<click_id>          # opaque StayGuide click id (currently 16 hex chars; accept up to 64)
                              # not added to review links
```

**What your site should do**

1. **Analytics:** with Google Analytics 4, UTM parameters are picked up automatically. Create a segment for `source = stayguide` to report on tablet-driven traffic.
2. **Persist `sg_click`.** Store it in a first-party cookie or session for 30 days, and save it on the booking record when a booking completes. It is needed for the Conversions API (section 6).

Example (vanilla JS, place on every page):

```html
<script>
  (function () {
    var p = new URLSearchParams(location.search).get('sg_click');
    if (p && /^[A-Za-z0-9_-]{1,64}$/.test(p)) {
      document.cookie = 'sg_click=' + p + '; Max-Age=' + 60 * 60 * 24 * 30 +
                        '; Path=/; Secure; SameSite=Lax';
    }
  })();
</script>
```

Then read the `sg_click` cookie server-side when a booking is created, and store it with the booking.

---

## 5. Stays API: send reservations to StayGuide (Planned)

**Skip this section if the owner's PMS is connected to StayGuide.**

Stays let the tablet:
- greet guests ("Welcome, Maria")
- show the right check-out time
- prompt for a review on check-out day
- clear guest-specific data between stays

### Authentication

```
Authorization: Bearer sg_live_xxxxxxxxxxxxxxxx
Content-Type: application/json
```

API keys are per company. Keep them **server-side only**: never put them in browser JavaScript or mobile apps.

Base URL: `https://<your-stayguide-host>/api/v1`

### Create or update a stay (idempotent)

`PUT /properties/{propertySlug}/stays/{externalId}`

`externalId` is **your** reservation ID. Sending the same ID again updates the stay, so retries are safe.

```json
{
  "check_in": "2026-11-14T16:00:00-07:00",
  "check_out": "2026-11-18T11:00:00-07:00",
  "guest_first_name": "Maria",
  "guest_count": 4,
  "language": "en",
  "status": "confirmed"
}
```

| Field | Required | Notes |
|---|---|---|
| `check_in` / `check_out` | yes | ISO 8601 with offset (the property's local time) |
| `guest_first_name` | no | Used for the welcome screen only. **Do not send last name, email, or phone**; the tablet doesn't need them. |
| `guest_count` | no | Integer |
| `language` | no | BCP 47 code; defaults to `en` |
| `status` | yes | `confirmed` or `cancelled` |

**Responses**
- `200` updated
- `201` created
- `400` validation error
- `401` bad key
- `404` unknown property slug
- `409` overlaps another confirmed stay at the same property

### Cancel a stay

`DELETE /properties/{propertySlug}/stays/{externalId}` returns `204`.

### List properties (for mapping your IDs to StayGuide slugs)

`GET /properties` returns:

```json
{ "properties": [ { "slug": "seaside-villa", "name": "Seaside Villa", "status": "active" } ] }
```

### Example

```bash
curl -X PUT "https://<host>/api/v1/properties/seaside-villa/stays/RES-10482" \
  -H "Authorization: Bearer $STAYGUIDE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"check_in":"2026-11-14T16:00:00-07:00","check_out":"2026-11-18T11:00:00-07:00","guest_first_name":"Maria","status":"confirmed"}'
```

**When to call it:**
- on booking confirmation
- on any date change
- on cancellation

Run a nightly reconciliation that re-sends the next 90 days of stays. That covers any calls that failed.

---

## 6. Conversions API: report tablet-driven bookings (Planned)

When a booking is completed and you have a stored `sg_click` (section 4):

`POST /conversions`

```json
{
  "sg_click": "c_8f2a91d0",
  "external_booking_id": "RES-11307",
  "property_slug": "mountain-cabin",
  "amount": 1240.00,
  "currency": "USD",
  "booked_at": "2026-11-17T19:22:05Z"
}
```

- Idempotent on `external_booking_id`.
- `amount` is the booking subtotal before taxes. It is shown to the owner as revenue attributed to the tablet.
- Returns `202 Accepted`. An unknown or expired `sg_click` (older than 30 days) returns `422` and should not be retried.

---

## 7. Webhooks: guest reports and events (Planned)

StayGuide can POST events to a URL you register in the dashboard (HTTPS only).

### Events

| Event | When |
|---|---|
| `guest_report.created` | A guest submits an issue from the tablet |
| `guest_report.updated` | Status changes (`acknowledged`, `in_progress`, `resolved`, `closed`) |
| `device.offline` | A property's tablet hasn't checked in for 30 minutes |
| `device.online` | It's back |

### Payload

```json
{
  "id": "evt_01JBX…",
  "type": "guest_report.created",
  "created_at": "2026-11-15T21:04:11Z",
  "company_slug": "demo-rentals",
  "property_slug": "seaside-villa",
  "data": {
    "report_id": 512,
    "category": "maintenance",
    "priority": "urgent",
    "title": "Hot tub not heating",
    "description": "Water is cold since this afternoon",
    "amenity": { "id": 3, "name": "Hot Tub" },
    "status": "new"
  }
}
```

Guest reports contain no guest personal data by design.

### Verify the signature

Each request has the header:

```
X-StayGuide-Signature: t=1763240651,v1=5f1c…hex
```

`v1` is `HMAC-SHA256(secret, "<t>.<raw request body>")`. Reject the request if the signature doesn't match, or if `t` is more than 5 minutes old.

```js
// Node.js / Express — use the RAW body, not re-serialized JSON
import crypto from 'crypto';

app.post('/webhooks/stayguide', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('X-StayGuide-Signature') || '';
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
  const expected = crypto
    .createHmac('sha256', process.env.STAYGUIDE_WEBHOOK_SECRET)
    .update(`${parts.t}.${req.body}`)
    .digest('hex');

  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  const valid = parts.v1 && expected.length === parts.v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  if (!fresh || !valid) return res.status(400).end();

  const event = JSON.parse(req.body.toString());
  // Deduplicate on event.id: deliveries are at-least-once
  res.status(200).end(); // respond fast; do the work asynchronously
});
```

### Delivery rules
- Respond with `2xx` within 10 seconds.
- Failed deliveries are retried with backoff for 24 hours.
- Events may arrive more than once or out of order: deduplicate on `id` and use `created_at` for ordering.

---

## 8. Google Vacation Rentals and SEO alignment (Available)

If the owner lists on Google Vacation Rentals through their PMS or channel manager, keep things consistent:

- The **property name, address, phone, and website** on your site must exactly match the Google Business Profile and the PMS feed.
- Use the **same booking URL** in StayGuide (`direct_booking_url`) as in the GVR feed, so pricing and availability match everywhere.
- Add `LodgingBusiness` / `VacationRental` **schema.org** structured data to property pages.

StayGuide does not submit listings to Google. That stays with the owner's PMS or channel manager.

---

## 9. Security and privacy rules

- **Never expose the StayGuide API key in client-side code.** Call StayGuide from your server.
- **Send the minimum guest data.** First name only. No email, phone, payment, or ID data ever goes to StayGuide.
- **Don't publish property access details** (door codes, Wi-Fi passwords) on your public site. They're shown only on the paired in-home tablet.
- **Verify every webhook signature** (section 7).
- **Rotate keys** from the dashboard if a key is exposed. Old keys stop working immediately.

---

## 10. Launch checklist

- [ ] HTTPS on all pages that StayGuide links to
- [ ] `direct_booking_url` deep-links to each specific property, with dates selectable
- [ ] Return-guest offer code works at checkout and is shown before payment
- [ ] UTM parameters show up in analytics (test by scanning the tablet's QR code, or visit `https://<stayguide-host>/r/<property-id>/book`)
- [ ] `sg_click` is stored on completed bookings
- [ ] Review URL opens the correct Google review form on a phone
- [ ] *(Planned APIs)* Stays sync on create, change and cancel, plus the nightly reconciliation
- [ ] *(Planned APIs)* Conversions are reported, and duplicate calls are handled
- [ ] *(Planned APIs)* Webhook endpoint verifies signatures and deduplicates by event `id`
- [ ] Tested end to end: scan the tablet QR code → book with the offer code → booking shows as a StayGuide conversion in the dashboard

---

## 11. Support

Contact your StayGuide account manager for API keys, sandbox access (`sg_test_…` keys against a test company), and to confirm which **Planned** features are live.

**Changelog**
- 0.2 (2026-10-03): tablet QR links, scan redirect and tracking parameters are live (sections 3–4).
- 0.1 (2026-10-03): first draft; Stays, Conversions and Webhooks specified as planned.
