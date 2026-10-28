# Route Guide Application - Technical Requirements Document (ТЗ)

## 1. Overview

**Project Name:** Route Guide  
**Purpose:** GPS-based location tracking application similar to Google Timeline with enhanced route optimization focusing on air quality, noise reduction, and health benefits.

**Target Platform:** iOS (Swift) / Android (Kotlin) or Cross-platform (React Native/Flutter)  
**Primary Location:** `/Users/eugene/Documents/RouteGuide`

## 2. Core Features

### 2.1 Continuous Location Tracking
- App runs in background and continuously records user location
- Battery-efficient tracking using significant location changes
- Automatic pause/resume based on user activity detection

### 2.2 Transport Mode Recognition
- **Supported modes:** Walking, Cycling, Driving, Public Transit (Bus/Tram), Motorcycle
- Uses device accelerometer, gyroscope, and GPS speed data
- Machine learning model for mode classification (TensorFlow Lite or CoreML)
- Manual mode override option

### 2.3 Route History Interface

#### 2.3.1 Route History View (view1bad - "Bad Route")
- Shows routes with high pollution/noise exposure
- Visual indicators: dark/red color scheme
- Highlights areas with poor air quality
- Shows heavy traffic zones

#### 2.3.2 Route History View (view2 - Map View)
- Standard map interface showing recorded route
- Interactive timeline scrubber
- Marker for start/end points
- Transport mode icons along the route

#### 2.3.3 Route History View (view3good - "Good Route")
- Optimized routes avoiding pollution
- Green/blue color scheme indicating clean air
- Scenic walking paths prioritized
- Minimal traffic exposure

#### 2.3.4 Route History Summary
- Total distance traveled
- Total time
- Transport modes used
- Air quality index along the route
- Noise level exposure

### 2.4 Route Optimization Engine

#### 2.4.1 Scoring Algorithm
Routes are scored based on multiple factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Air Quality** | 30% | Lower pollution = higher score |
| **Noise Level** | 25% | Quieter streets = higher score |
| **Distance** | 20% | Shorter routes preferred (up to a point) |
| **Exercise Benefit** | 15% | Walking/cycling routes favored |
| **Traffic Exposure** | 10% | Less congested = higher score |

#### 2.4.2 Optimization Logic
- **Priority:** Health-beneficial routes over shortest distance
- **5-minute walking bonus:** Routes that add ≤5 minutes but reduce pollution exposure by ≥20% are preferred
- **Noise filtering:** Avoids major roads, highways, industrial zones
- **Air quality routing:** Prefers parks, residential streets, bike paths

#### 2.4.3 Example Scenarios
- **Scenario A:** Route A = 10 min, high pollution vs Route B = 15 min, low pollution → **Route B selected**
- **Scenario B:** Route A = 8 min, moderate pollution vs Route B = 12 min, clean air → **Route B selected** (within 5-min bonus)
- **Scenario C:** Route A = 5 min, very clean vs Route B = 20 min, very clean → **Route A selected** (time penalty)

## 3. Technical Architecture

### 3.1 System Requirements

| Component | Technology | Notes |
|-----------|------------|-------|
| **Location Services** | CoreLocation (iOS) / FusedLocationProvider (Android) | High accuracy for urban canyons |
| **Transport Detection** | Custom ML model / Google Activity Recognition | Periodic inference every 5-10 min |
| **Data Storage** | SQLite / Realm / CoreData | Local database for route history |
| **Backend (Optional)** | Firebase / Supabase | Sync across devices, backup |
| **Map Library** | MapKit / Google Maps SDK / Mapbox | Offline maps recommended |

### 3.2 Data Model

```swift
// Core Data Entity (iOS Example)
struct RoutePoint {
    let timestamp: Date
    let latitude: Double
    let longitude: Double
    let altitude: Double
    let transportMode: TransportMode
    let airQualityIndex: Double?  // Optional, from backend
    let noiseLevel: Double?       // Optional, from backend
}

enum TransportMode: String {
    case walking
    case cycling
    case automobile
    case bus
    case motorcycle
    case train
}
```

### 3.3 Background Processing

- **iOS:** Background Modes: Location updates, Background Fetch
- **Android:** Foreground Services, WorkManager
- **Battery optimization:** Location sampling every 1-5 minutes when stationary, continuous during movement

## 4. API Integrations (Required Connections)

### 4.1 Google Services (Recommended)

| Service | Purpose | Connection Required |
|---------|---------|---------------------|
| **Google Maps API** | Map visualization, geocoding, places search | ✅ Yes |
| **Google Places API** | POI (Points of Interest) along routes | ✅ Yes |
| **Google Cloud Vision** | Optional: Additional transport mode classification | ✅ Optional |
| **Google Fit** | Health data integration (steps, calories) | ✅ Optional |

### 4.2 Environmental Data APIs

| Service | Purpose | Connection Required |
|---------|---------|---------------------|
| **OpenWeather Air Pollution API** | Real-time air quality data | ✅ Yes (for route scoring) |
| **NoiseTube / OpenStreetMap noise** | Noise level mapping | ✅ Yes |
| **Weather API** | Weather conditions affecting route quality | ✅ Optional |

## 5. User Interface Design

### 5.1 Screens (Based on Reference Images)

#### 5.1.1 Route History Screen
- **Left/Center:** Map showing the recorded route
- **Top:** Timeline with date/filters
- **Bottom:** Transport mode summary chips
- **Indicators:** Color-coded route (green=good, red=bad)

#### 5.1.2 Route Comparison
- Split view: view1bad (left) vs view3good (right)
- Side-by-side scoring breakdown
- "Why this route was better" explanations

#### 5.1.3 Route Suggestions
- Daily/weekly recommendations
- "Walk this route tomorrow for best health benefit"
- Customizable preferences (time, distance, cleanliness)

### 5.2 Icon Set (Required)

| Icon | Usage |
|------|-------|
| 🚶‍♂️ | Walking mode |
| 🚲 | Cycling |
| 🚗 | Driving/Automobile |
| 🚌 | Bus/ Public Transit |
| 🏍️ | Motorcycle |
| 🌲 | Park/Green route |
| 🏭 | Industrial/Poor quality area |
| 📊 | Route score/rating |
| 🕒 | Time bonus indicator |
| 📍 | Location marker |

## 6. Data Privacy & Security

- **Local-first:** All tracking data stored device-side by default
- **Optional cloud sync:** User consent required for backup/sync
- **Data minimization:** Only collect location, transport mode, optionally air quality
- **Transparent permissions:** Clear explanation of "always location" requirement

## 7. Performance Requirements

| Metric | Target |
|--------|--------|
| **Battery impact** | < 5% per day with normal use |
| **Location accuracy** | < 10m (urban), < 5m (open sky) |
| **Transport detection latency** | < 5 min for mode change |
| **Route optimization time** | < 2 seconds |
| **Background tracking** | Works when app closed/locked |

## 8. Future Enhancements

- **Social features:** Share clean routes with friends
- **Community maps:** User-contributed noise/pollution data
- **Eco-points:** Rewards for choosing clean routes
- **Integration:** Smart home devices (open windows when air quality good)
- **Voice assistant:** "Suggest a clean walk home"

## 10. Project Structure

```
/Users/eugene/Documents/RouteGuide
├── RouteGuide_TZ.md              ← This document
├── docs/
│   └── design/
│       ├── references/
│       │   ├── route history.jpeg      ← Route history layout reference
│       │   ├── view1bad.jpg            ← Bad route visualization
│       │   ├── view2.jpeg              ← Map view reference
│       │   └── view3good.jpg           ← Good route visualization
│       └── references/                 ← Additional design files
├── src/                            ← Source code (to be created)
│   ├── ios/                        ← Swift/Xcode project
│   ├── android/                    ← Kotlin/Android Studio project
│   └── cross-platform/             ← React Native/Flutter
├── assets/                         ← Icons, images, fonts
└── config/                         ← API keys, settings (gitignored)
```

---

**Document Version:** 1.0  
**Created:** 2026-10-28  
**Author:** AI Assistant  
**Next Review:** After Phase 1 completion