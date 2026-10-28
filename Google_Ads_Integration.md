# Route Guide - Google Ads Integration

## 1. Monetization Strategy

- **Free app** with optional ads (user can opt-out via Settings)
- **Route Guide Pro** (ad-free version) via one-time IAP or subscription
- **Aggregated analytics** (opt-in, anonymous, covered by Privacy Policy)

## 2. Ad Placement Opportunities

### Ad Type 1: Interstitial Ads (Full-Screen)
- **Placement A:** Between route playbacks (after viewing 3 routes)
- **Placement B:** When user opens Route History after 1 week gap
- **Placement C:** Share route confirmation screen
- **Frequency:** Max 1 per 10 minutes of app usage
- **eCPM:** $8-$15 (location/health niche)

### Ad Type 2: Banner Ads
- **Placement:** Top of Route History screen (optional, user toggleable)
- **Size:** 320x50 (mobile), 728x90 (tablet)
- **Behavior:** Auto-hide when user starts route tracking
- **Opt-in required:** Show banner ads for analytics toggle
- **eCPM:** $3-$8

### Ad Type 3: Rewarded Ads (Highest Engagement)
- **Offer:** Watch 30 seconds for detailed pollution analysis
- **Reward:** Unlock Deep Analytics for 24 hours
- **Placement:** Route Details screen, after score breakdown
- **User choice:** User explicitly opts-in to watch
- **eCPM:** $15-$25 (highest paying)
- **CTR expected:** 15-25%

### Ad Type 4: Native Ads (Sponsored Routes)
- **Format:** Suggested cleaner route of the day (subtle banner)
- **Content:** Routes through parks have 40% less pollution - supported by EcoRoute
- **Placement:** Main Dashboard, below route summary cards
- **Disclosure:** Sponsored label clearly marked
- **Revenue share:** 70/30 split with ad network partner

## 3. Ad Network Options

### Primary Network: Google AdMob
- **Easy integration** with existing Google Services
- **Fill rate:** 100% (Google's own network)
- **Payment:** Monthly, direct deposit/ Wire
- **Requirements:** App content policy, Privacy Policy link, Age rating (4+)

### Secondary Networks (Waterfall):
1. Meta Audience Network (Facebook Ads)
2. Unity Ads (if video integration added later)
3. AppLovin MAX (header bidding option)

## 4. Implementation Requirements

### AdMob Setup Steps:
1. Create AdMob account (linked to Google Play Console)
2. Create ad units:
   - Interstitial: route_guide_interstitial
   - Banner: route_guide_banner 
   - Rewarded: route_guide_rewarded
3. Add SDK:
   - iOS: pod 'Google-Mobile-Ads-SDK'
   - Android: implementation 'com.google.android.gms:play-services-ads:21.5.0'
   - React Native: react-native-google-mobile-ads
   - Flutter: google_mobile_ads
4. Add Ad IDs to Info.plist / AndroidManifest
5. Test ads: Use test ad IDs during development
6. Request consent (GDPR/CCPA if applicable)

### Sample Code Snippets:

#### iOS (Swift) - Interstitial:
```swift
import GoogleMobileAds

class AdManager: NSObject {
    var interstitial: GADInterstitialAd?

    func loadInterstitial() {
        let request = GADRequest()
        GADInterstitialAd.load(withAdUnitID: "ca-app-pub-xxx/route_guide_interstitial",
                               request: request) { ad, error in
            self.interstitial = ad
        }
    }

    func showInterstitial() {
        if let interstitial = interstitial {
            present(interstitial, animated: true)
        }
    }
}
```

#### Android (Kotlin) - Rewarded:
```kotlin
import com.google.android.gms.ads.rewarded.RewardedAd

class AdHandler(context: Context) {
    private var rewardedAd: RewardedAd = RewardedAd.load(
        context, 
        "ca-app-pub-xxx/route_guide_rewarded",
        AdRequest.Builder().build()
    )

    fun showRewarded(callback: () -> Unit) {
        if (rewardedAd.canShowAd()) {
            rewardedAd.fullScreenContentCallback = object : FullScreenContentCallback() {
                overrideOnAdFailedToShowFullScreenContent(error: AdError?) {
                    callback()
                }
            }
            rewardedAd.show(context) { adValue ->
                # User earned reward
                callback()
            }
        } else {
            callback()
        }
    }
}
```

## 5. User Privacy & consent

### GDPR/CCPA Compliance:
- Consent screen on first launch (optional ads tracking)
- Privacy Policy link in Settings → About
- Data collected for ads: Approximate location (city level)
- Not: Exact GPS history, personal identifiers
- Opt-out option: Settings → Disable personalized ads

### Ad Settings in App:
ads:
  enabled: true  # Default, can be toggled
  personalized: true  # Based on consent
  banner: true  # User toggleable
  interstitial: true  # User toggleable
  rewarded: true  # User toggleable

## 6. Revenue Projections (First Year)

### Assumptions:
- 1,000 monthly active users
- 30% accept ads (others choose Pro $4.99 one-time)
- 10% of ad users watch rewarded ads
- 0.5% click-through on banners

### Monthly Revenue Estimate:
| Ad Type | eCPM | Est. Impressions | Revenue |
|---------|------|------------------|---------|
| Interstitial | $10 | 3,000 | $30 |
| Banner | $5 | 5,000 | $25 |
| Rewarded | $20 | 1,500 | $30 |
| Total | | | ~$85/month |

### With 10,000 MAU:
- ~$850/month (mixed user base)
- Pro upgrades: ~200 users × $4.99 = $998/month (if subscription)
- Total potential: $1,000-$2,000/month

## 7. A/B Testing Plan

### Test Variants:
- A: No ads (Pro version only, $4.99 one-time)
- B: Opt-in ads only (users enable in Settings)
- C: Ads by default with opt-out option
- D: Rewarded ads only (no interstitial/banner)

### Metrics to Track:
- ARPDAU (Average Revenue Per Daily Active User)
- Churn rate (do ads drive users away?)
- Session length (do ads affect usage time?)
- Pro upgrade rate (do ads convert to paid?)

### Success Criteria:
- Churn increase: < 5% vs no-ads version
- ARPDAU: > $0.50 per active user
- User satisfaction: App Store rating > 4.0 stars

## 8. Ad Review & Quality Control

### Negative Categories (exclude):
- Gambling, alcohol, tobacco
- Apps promoting tracking/spyware
- Fast food (conflicts with clean air mission)

### Allow Categories:
- Health & fitness apps
- Environmental organizations
- Public transit apps
- Walking/cycling gear

### Monthly Ad Quality Review:
- Ensure ads align with app mission 'cleaner air, healthier routes'
- Remove underperforming ad units
- Test new ad formats quarterly
