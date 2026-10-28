# Route Guide - Key Features & Capabilities

## 1. Core Tracking Features

### 1.1 Continuous Location Tracking
- App runs in background and continuously records user location
- Battery-efficient tracking using significant location changes
- Automatic pause/resume based on user activity detection
- GPS + network-based location fusion for best accuracy

### 1.2 Transport Mode Recognition
- Auto-detection: Walking, Cycling, Driving, Bus/Tram, Motorcycle
- Uses accelerometer, gyroscope, and GPS speed data
- Machine learning model (TensorFlow Lite) for mode classification
- Manual mode override option in timeline view
- 90%+ accuracy in testing across different environments

### 1.3 Frequent Locations
- Automatic detection of Home and Work locations
- Labeling based on visit frequency and time patterns
- User can edit/rename detected locations

## 2. Route History Features

### 2.1 Three Route Views (Matching Your References)

#### view1bad - Bad Route Visualization
- Shows routes with high pollution/noise exposure
- Dark/red color scheme
- Highlights poor air quality areas (PM2.5 hotspots)
- Shows heavy traffic zones and industrial areas
- User action: Avoid this pattern next time

#### view2 - Map View
- Standard map interface showing recorded route
- Interactive timeline scrubber to play back the route
- Start/end markers with date labels
- Transport mode icons along the route path
- Distance/time summary at top
- View details tap target

#### view3good - Good Route Visualization
- Optimized routes avoiding pollution
- Green/blue color scheme indicating clean air
- Scenic walking paths prioritized (parks, residential streets)
- Minimal traffic exposure highlighted
- This route is 20% cleaner than your average badge

### 2.2 Route Summary & Stats
- Total distance traveled (daily/weekly/monthly/yearly)
- Total time active
- Transport modes used (pie chart breakdown)
- Air quality index average along routes
- Noise level exposure average (dB)
- Calories burned (if Google Fit/HealthKit integrated)

### 2.3 Daily/Weekly Comparisons
- This week vs last week: 15% cleaner routes
- Your cleanest route this month: 2.3km through the park
- Most used transport: Car (52%)
- Streak badges: 30-day walking streak, 50km this month

## 3. Route Optimization Features

### 3.1 Scoring Algorithm
- Weighted Factors: Air Quality 30%, Noise 25%, Distance 20%, Exercise 15%, Traffic 10%

### 3.2 5-Minute Walking Bonus
- If route adds 5 min but reduces pollution 20% -> SELECT
- Scenario A: Route A = 10 min, high pollution vs Route B = 15 min, low pollution -> Route B selected
- Scenario B: Route A = 8 min, moderate pollution vs Route B = 12 min, clean air -> Route B selected (within bonus)
- Scenario C: Route A = 5 min, very clean vs Route B = 20 min, very clean -> Route A selected (time penalty)

### 3.3 Route Filtering & Search
- Quick filters: Clean routes only / All routes / Walking only / All modes
- Date range: Today / This week / This month / All time
- Transport mode: Filter by walking/car/transit only
- Location-based: Routes near downtown / Routes through the park

## 4. Smart Features

### 4.1 Frequent Locations Detection
- Automatic detection of Home and Work based on visit frequency
- User can edit location names and boundaries
- Weather-aware: Walk home when air quality is good

### 4.2 Air Quality Integration
- Real-time PM2.5, NO2, O3 data from OpenWeather API
- Color-coded routes: Green (clean) to Red (polluted)
- Historical air quality trends along routes
- Breathe easier notifications when route improves

---)