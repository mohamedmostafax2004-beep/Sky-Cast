# SkyCast Fixes

This version includes the following fixes:

- Added a local JSON database fallback at `data/skycast-local-db.json`.
- The application now keeps authentication, saved locations, and map markers working even if MongoDB is not installed.
- Reduced MongoDB retry delay so the server starts faster during demos.
- Updated database status reporting to show `json` mode when fallback is active.
- Updated User, SavedLocation, and MapMarker models to support both MongoDB and local JSON fallback.
- Improved profile API output by hiding sensitive token fields.
- Updated `.env.example` and README notes for easier setup.

Recommended production setup: use MongoDB Atlas or a local MongoDB server. The JSON fallback is intended for local development and project demonstrations.

## 2026-06-15 verification route hotfix

Fixed `TypeError: user.save is not a function` on `/verify-email` and related auth flows by adding safe user persistence in `src/routes/auth.js` and `src/index.js`. The auth routes now work with both real Mongoose documents and local JSON database fallback objects.

## v3 - JSON fallback login fix
- Fixed local JSON User queries returning plain objects without `comparePassword()`.
- Signup and login now work normally when MongoDB is unavailable and the app is using `Database: connected (json)`.
- Tested signup + login with the same account through the web routes.


## v4 Account Dashboard Flow
- Added `/dashboard` protected page.
- Login now redirects to `/dashboard`.
- Signup now creates the account, signs the user in, and redirects to `/dashboard?created=1` when email verification is disabled.
- The dashboard shows the logged-in username, email, saved location count, marker count, and quick buttons to Weather Map, Profile Settings, and Logout.

## v5 UI and Login Fixes

- Login now accepts either username or email in the same field.
- Fixed the issue where users could create an account but could not sign in using their email address.
- After signup or login, the user is redirected to the account dashboard.
- The main map header now hides Login / Sign Up buttons for signed-in users.
- Signed-in users now see their profile name, Profile button, and Logout button in the header.
- The Logout link now signs the user out directly and returns to the home page.
- The dark/light mode toggle was moved into the Map Controls panel for a cleaner header layout.


## v6 Navbar session behavior
- Login and sign up now redirect to the main map dashboard `/` instead of the separate dashboard page.
- When a user is signed in, the top navigation hides Login / Sign Up and shows the username, Profile, and Logout.
- After logout, the session is destroyed and Login / Sign Up are shown again.
- Dynamic pages use no-cache headers to prevent stale navbar rendering after login/logout.
- The login field accepts either username or email.

## v7 Auth/Profile/Navbar fixes
- Added a robust `/api/session` endpoint so the navbar always knows whether the user is logged in.
- Login now accepts username or email with case-insensitive matching.
- Signup and login explicitly save the session before redirecting.
- Fixed profile/session stability in JSON fallback database mode.
- Navbar automatically hides Login/Sign Up after login and shows username, Profile, and Logout.
- Navbar automatically returns Login/Sign Up after logout.

## v8 auth/navbar cache fix
- Fixed stale navbar after login/profile by changing service worker to network-first and clearing localhost caches.
- Removed cached HTML behavior for `/`, `/login`, `/signup`, and `/profile`.
- Added no-cache meta tags and stronger session cookie settings.
- Back to Map now returns to `/?from=profile` so the map page is freshly loaded.
- Added `/clear-cache.html` helper. Open it once if Chrome still shows old Login / Sign Up buttons after signing in.
