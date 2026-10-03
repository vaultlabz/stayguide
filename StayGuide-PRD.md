🛠️ Preliminary Product Requirements Document (PRD)
Project Name: StayGuide
 Platform: Android Tablets (Flutter App)
 Backend: Node.js (Admin + Content Management)
 Target Users:
Property owners (for setup/updates)


Guests staying at rental properties



🔍 1. Purpose
Create a customizable tablet-based app to enhance the guest experience at short-term rental properties. The app will serve as a digital welcome book, providing local recommendations, property-specific instructions, and real-time updates from property owners or managers.

📱 2. Core Features (MVP)
A. Splash / Welcome Screen
Property logo or image


Rotating welcome messages (customizable)


Optional weather widget or current time


B. Best Food in the Area
Curated list of restaurants with:


Name, image, rating, distance


Click to open in Google Maps


Option to categorize: Breakfast, Lunch, Dinner, Drinks


Admin can update via backend dashboard


C. Property Info
WiFi name and password


TV & streaming app codes (Roku, Netflix, etc.)


Check-in/check-out instructions


Trash, parking, AC usage, pet policy


D. "How-To" Videos Section
Embedded YouTube or Vimeo links


Examples:


“How to use the smart lock”


“How to use the jacuzzi”


“Where to park”


E. Local Area Info
Top attractions


Emergency numbers


Closest grocery/pharmacy


Transportation options (e.g., Uber, rental cars)


F. Notifications & Announcements
Display owner-pushed messages:


Example: “Trash pickup is delayed until tomorrow.”


Scheduled or real-time via admin backend


Optional push notification (if app ever goes native or is expanded beyond local-only)


G. View Other Properties
List of other rental properties by same owner or company


Each entry:


Property photo, name, location


Link to external booking platform or contact form



🧑‍💼 3. Admin Backend (Node.js Web App)
Secure login for property owners


Admin dashboard features:


Add/edit property-specific content (WiFi info, TV codes, welcome text)


Add food/restaurant listings


Upload video links


Send announcements/notifications


Manage “Other Properties” content


Analytics dashboard (basic: time opened, screen visits)



🔐 4. Security
PIN code or lock screen timeout for app access (optional)


Secure API connection between Flutter app and backend


Role-based access in backend (if multiple properties managed by one admin)



🖥️ 5. Tech Stack
Frontend (App)
Flutter


Android Tablet target


Responsive UI for 10–13” displays


Local cache (for offline fallback)


Backend (Admin Panel + API)
Node.js (Express)


MongoDB or MySQL (Content storage)


JWT Auth for session management


REST or GraphQL API


Optional: Admin UI using Next.js + Tailwind (hosted on same VPS)



⚙️ 6. Development Phases
✅ Phase 1: MVP
Flutter app with static content loaded from backend


Admin portal to manage content


Tablet-ready layout and local caching


🧪 Phase 2: Enhancements
Real-time push announcements


QR login for new guests


Guestbook (guest can leave comments/reviews)


More interactive local maps or reservation options



📦 7. Deployment
Flutter APK deployed manually to property tablets


Admin backend hosted on your VPS (can run behind Plesk or standalone)
