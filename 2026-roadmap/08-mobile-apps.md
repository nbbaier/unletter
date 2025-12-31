# Native Mobile Applications

**Category:** New Feature
**Quarter:** Q3-Q4
**T-shirt Size:** XL

## Why This Matters

Newsletter reading is increasingly mobile. People check newsletters on their commute, during lunch, or before bed. While Unletter's RSS feeds work with mobile RSS apps, this is a fragmented experience—users need our dashboard in a browser AND their RSS app.

Native apps provide a unified, purpose-built experience optimized for how people actually consume newsletters. They enable push notifications for important newsletters, offline reading for commutes, and deep OS integration (widgets, Siri shortcuts, share extensions). Mobile apps signal product maturity and open the path to subscription revenue through in-app purchases.

## Current State

- No mobile presence beyond responsive web
- Web view for newsletters exists but isn't optimized for mobile
- No push notification infrastructure
- No offline reading capability
- Users must use third-party RSS apps to consume feeds

## Proposed Future State

Native iOS and Android apps that make Unletter the best way to read newsletters on mobile:

**Core Reading Experience:**
- Beautiful reading view with typography optimized for mobile
- Swipe gestures for navigation (next/previous, mark read, save)
- Customizable reading settings (font size, line height, theme)
- Full-text search across all newsletters
- Bookmark/favorite important newsletters

**Mobile-First Features:**
- **Push Notifications**: Configurable alerts for new newsletters
- **Offline Mode**: Download newsletters for reading without connectivity
- **Widgets**: Today view widget showing unread count and latest items
- **Siri/Google Assistant**: "Hey Siri, read my newsletters"
- **Share Extension**: Save web articles to a dedicated feed
- **Watch App**: Glanceable newsletter summaries on Apple Watch

**Sync & Integration:**
- Real-time sync with web dashboard
- Background refresh for latest newsletters
- Handoff between devices
- Integration with system share sheets
- Export to other apps (Notes, Notion, etc.)

**Premium Mobile Features:**
- Audio playback with TTS
- AI summaries inline
- Custom notification rules

## Key Deliverables

- [ ] Choose development approach (native, React Native, Flutter)
- [ ] Design mobile UI/UX with mobile-first patterns
- [ ] Build iOS app with core reading experience
- [ ] Build Android app with core reading experience
- [ ] Implement push notification infrastructure (APNs, FCM)
- [ ] Build offline storage and sync system
- [ ] Create iOS widgets (small, medium, large)
- [ ] Create Android widgets
- [ ] Implement Siri Shortcuts integration
- [ ] Build Apple Watch companion app
- [ ] Implement background app refresh
- [ ] Add customizable notification rules
- [ ] Build TTS playback for newsletters
- [ ] Implement share extension for iOS/Android
- [ ] Set up App Store and Play Store accounts
- [ ] Design app icons, screenshots, and store listings
- [ ] Implement in-app purchase infrastructure
- [ ] Build analytics for mobile usage patterns
- [ ] Create mobile-specific API endpoints (optimized for bandwidth)

## Prerequisites

- **User Dashboard (Initiative 03)**: Auth flow and core features must exist
- **D1 Database (Initiative 04)**: Efficient sync requires proper database
- **Security Hardening (Initiative 02)**: Mobile apps need secure auth

## Risks & Open Questions

- Native vs. cross-platform: React Native for speed or native for quality?
- Two platforms doubles maintenance burden—is it worth it?
- App Store approval process can be unpredictable
- Push notification costs at scale (APNs is free, FCM is mostly free)
- Offline sync is complex—conflict resolution strategy?
- How much content to cache offline? (storage limits)
- Watch app: Worth the effort for limited screen real estate?
- Should free tier have mobile access or premium-only?
- How do we handle app updates and version compatibility?

## Notes

Development approach recommendation:
- **React Native with Expo** for faster iteration and shared codebase
- Consider native Swift/Kotlin for performance-critical views
- Or: Start with a progressive web app (PWA) to validate demand

Push notification backend options:
- Cloudflare Workers + D1 for push token storage
- OneSignal for managed push infrastructure
- Firebase Cloud Messaging (cross-platform)

The RSS feed experience on mobile is already decent through apps like Reeder, NetNewsWire, or Feedly. Our native app needs to be meaningfully better, not just "the same thing in our wrapper."
