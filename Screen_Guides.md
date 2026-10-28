# Route Guide - Screen Guide (Экраны приложения)

## 1. Welcome/Splash Screen
- **Purpose:** First launch experience, brand introduction
- **Elements:**
  - App logo animation (2-3 seconds)
  - "Route Guide" text subtitle
  - Onboarding buttons: "Allow Location" / "Continue as Guest"
  - Quick feature highlights (3 bullet points)
- **Permissions:** Requests "Always" location permission on first launch

## 2. Main Dashboard (Home Screen)
- **Purpose:** Central hub for all app functions
- **Elements:**
  - **Current location map** (center): Shows user's current position with blue dot
  - **Timeline scrollbar** (top): Date-based navigation through recorded routes
  - **Route summary cards** (bottom 3 cards):
    - "Today's walk" - distance, time, air quality
    - "This week" - total stats, average route quality
    - "Quick route" - quick access to start new tracking
  - **Transport mode icon** (top-left): Auto-detected or manually selected
  - **Quick actions** (bottom bar):
    1. Start/Stop Tracking
    2. Route History
    3. Settings

## 3. Route History Screen
- **Purpose:** View and analyze recorded routes
- **Tabs/Views (matching your reference images):**
  - **View 1: Route List** - List view of all recorded routes with dates, distances, quality scores
  - **View 2: Map View** - Full screen map with the route path, color-coded (red=bad, green=good)
    - Timeline scrubber to play back the route
    - Transport mode icons along the path
    - Pollution/noise hotspots marked
  - **View 3: Good Route** - Optimized route suggestions based on history
    - "Recommended for tomorrow" 
    - Comparison with previous routes
    - "Walk this way for better air quality" banner

## 4. Route Details Screen
- **Purpose:** Deep dive into a specific recorded route
- **Elements:**
  - **Route map** (full width): Color-coded path with start/end markers
  - **Bottom info panel:** 
    - Duration, distance, average speed
    - Transport modes used (pie chart)
    - Air quality index along route
    - Noise level exposure
  - **Score breakdown** bar chart:
    - Air quality contribution
    - Noise level contribution
    - Distance/efficiency contribution
  - **Actions:**
    - "Suggest similar route"
    - "Share route"
    - "Delete route"

## 5. Route Optimization Screen
- **Purpose:** Generate and compare different route options
- **Elements:**
  - **Route selector** (top): Quick filters (Fastest, Cleanest, Shortest, Healthiest)
  - **Comparison cards** (main area):
    - Option A: 10 min, high pollution (red)
    - Option B: 14 min, low pollution (green) ← *recommended*
    - Option C: 12 min, moderate (yellow)
  - **Why this route?** explanation text
  - **Set as default** toggle
  - **Start navigation** button

## 6. Settings Screen
- **Purpose:** App configuration and preferences
- **Sections:**
  - **Tracking Settings:**
    - Location update frequency (High/Medium/Power Saving)
    - Background tracking options
    - Transport mode: Auto/Manual
  - **Route Preferences:**
    - Default optimization priority (Health vs Distance vs Time)
    - Minimum quality threshold
    - 5-minute walking bonus enable/disable
  - **Privacy & Data:**
    - Cloud sync status
    - Delete all history
    - Data export option
  - **Account:**
    - Google Sign In/Out
    - Feedback & Reviews
    - Share app

## 7. Onboarding Screens (3 screens)
- **Screen 1:** "Track everywhere you go" - Background location tracking explanation
- **Screen 2:** "Smart route optimization" - How the app suggests better routes
- **Screen 3:** "Breathe cleaner air" - Air quality and noise reduction features
- **CTA:** "Get Started" button at bottom

## 8. Advertisement Placement Screens
- **Interstitial Ad:** Between route playback or after viewing 3 routes
- **Banner Ad:** Top of Route History screen (optional, user opt-in)
- **Rewarded Ad:** "Watch 30s for route analytics boost" - unlock detailed pollution data

## 9. Error/No States
- **No routes recorded:** Empty state with "Start your first walk" CTA
- **Poor GPS signal:** "Move to open area" message + accuracy indicator
- **No route optimization:** "Try different preferences" suggestion

---

**Note:** Screen designs reference your images:
- view1bad.jpg = red/dark color scheme, high pollution highlight
- view2.jpeg = standard map view with route path
- view3good.jpg = green/blue color scheme, clean air focus