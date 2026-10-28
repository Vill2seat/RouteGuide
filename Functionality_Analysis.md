# Route Guide - Functionality & Capabilities Analysis
## (Based on Google Timeline Feature Analysis)

## 1. Continuous Location Tracking (Like Google Timeline)

- **Always-on tracking:** App records location even when closed/locked
- **Battery optimization:** Smart sampling - frequent when moving, sparse when stationary
- **Location history timeline:** Chronological view of all places visited
- **Frequent locations:** Home and Work detection with labels
- **Daily summaries:** You walked 3.4km today, visited 5 locations

## 2. Transport Mode Recognition

### Auto-Detection Modes:
- **Walking:** Arm swing pattern + ~5 km/h speed
- **Cycling:** Higher speed + specific accelerometer pattern
- **Automobile:** >20 km/h, turns, engine vibration pattern
- **Bus/Public Transit:** Stops pattern, fixed routes, lower speed between stops
- **Motorcycle:** Similar to car but higher acceleration, different cornering pattern
- **Train:** Very regular stop pattern, higher speed, linear path

### Implementation:
- TensorFlow Lite model on device (privacy-first)
- Updates every 5-10 minutes
- Manual override in timeline view
- 90%+ accuracy in testing

## 3. Route History & Timeline

### View Types (Matching Your References):

#### view1bad - "Bad Route" Visualization
- **What it shows:** Routes with high pollution/noise exposure
- **Visuals:** Red/dark color scheme
- **Indicators:**
  - Industrial zones passed through
  - Traffic light congestion points
  - High PM2.5 areas
  - Noise hotspots (major roads)
- **User action:** Avoid this pattern next time

#### view2 - Map View
- **What it shows:** Raw recorded route on map
- **Features:**
  - Interactive timeline scrubber (play/pause route playback)
  - Transport mode icons along path (Walking, Cycling, Car, Bus)
  - Start (green) and end (red) markers
  - Distance/time summary at top
  - View details tap target

#### view3good - "Good Route" Visualization
- **What it shows:** Optimized routes avoiding pollution
- **Visuals:** Green/blue color scheme
- **Highlights:**
  - Park areas traversed
  - Residential streets (low traffic)
  - Bike lanes prioritized
  - Clean air badges along route
- **Comparison:** This route is 20% cleaner than your average

## 4. Route Optimization Engine

### Scoring Algorithm (Weighted Factors):

| Factor | Weight | Description |
|--------|--------|-------------|
| Air Quality | 30% | Real-time PM2.5, NO2, O3 data integration |
| Noise Level | 25% | Road density, traffic volume, time-of-day |
| Distance | 20% | Euclidean + walking path distance |
| Exercise Benefit | 15% | Walkable streets, parks, scenic routes |
| Traffic Exposure | 10% | Congestion, stop-and-go areas |

### Optimization Logic:
- **5-minute bonus:** If route adds 5 min but reduces pollution 20% -> SELECT
- **Priority order:** Clean air > Short distance > Fastest time
- **User preferences:** Toggle to weight distance vs health differently

### Example Scenarios:
- **Scenario A:** Route A = 10 min, high pollution vs Route B = 15 min, low pollution -> Route B selected (health priority)
- **Scenario B:** Route A = 8 min, moderate pollution vs Route B = 12 min, clean air -> Route B selected (within 5-min bonus)
- **Scenario C:** Route A = 5 min, very clean vs Route B = 20 min, very clean -> Route A selected (time penalty applied)

## 5. Daily/Weekly Analytics

### Dashboard Metrics:
- **Total distance** (week/month/year)
- **Total time** active
- **Transport mode breakdown** (pie chart): 40% walk, 30% car, 20% transit, 10% bicycle
- **Air quality score** average (0-500 scale, lower better, app inverts for display)
- **Noise exposure** average (dB, weighted by time)
- **Calories burned** (if Google Fit/HealthKit integrated)
- **Streaks:** 30-day walking streak badge

### Comparisons:
- This week vs last week: 15% cleaner routes
- Your cleanest route this month: 2.3km through the park
- Most used transport: Car (52%)
