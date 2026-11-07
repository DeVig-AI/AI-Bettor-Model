// DeVig's lock-screen cards (Live Activities): a tracked game's score and clock with DeVig's pick, or a saved
// parlay's legs. Drawn from what the app sends; nothing is fetched here. Without push, a card only changes while
// DeVig is open, so a stale card says so instead of pretending to be live.
import ActivityKit
import SwiftUI
import WidgetKit

@main
struct DeVigLiveBundle: WidgetBundle {
    var body: some Widget {
        DeVigLiveWidget()
    }
}

private let ink = Color(red: 0.047, green: 0.059, blue: 0.078)       // #0c0f14, the app's background
private let mute = Color.white.opacity(0.62)
private let good = Color(red: 0.25, green: 0.73, blue: 0.31)
private let bad = Color(red: 0.97, green: 0.32, blue: 0.29)
private let amber = Color(red: 0.96, green: 0.78, blue: 0.48)

private func hex(_ s: String, _ fallback: Color = .white) -> Color {
    var h = s.trimmingCharacters(in: .whitespaces)
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return fallback }
    return Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
}

private func legColor(_ st: String) -> Color {
    switch st {
    case "won": return good
    case "lost": return bad
    case "live": return amber
    default: return Color.white.opacity(0.28)
    }
}

private func score(_ v: Int?) -> String { v.map(String.init) ?? "–" }

struct DeVigLiveWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DeVigLiveAttributes.self) { ctx in
            LockCard(attrs: ctx.attributes, st: ctx.state, stale: ctx.isStale)
                .activityBackgroundTint(ink)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { ctx in
            let a = ctx.attributes, s = ctx.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if a.kind == "game" {
                        TeamScore(code: s.away, value: s.awayScore, color: hex(a.awayColor))
                    } else {
                        Text("Parlay").font(.headline).foregroundStyle(.white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if a.kind == "game" {
                        TeamScore(code: s.home, value: s.homeScore, color: hex(a.homeColor))
                    } else {
                        LegDots(legs: s.legs)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.detail).font(.caption.weight(.semibold)).foregroundStyle(mute).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(ctx.isStale ? "Open DeVig to update" : s.note)
                        .font(.caption).foregroundStyle(mute).lineLimit(1)
                }
            } compactLeading: {
                if a.kind == "game" {
                    Text("\(s.away) \(score(s.awayScore))").font(.caption2.weight(.bold)).monospacedDigit()
                } else {
                    Text("\(s.legs.filter { $0 == "won" }.count)/\(s.legs.count)").font(.caption2.weight(.bold))
                }
            } compactTrailing: {
                if a.kind == "game" {
                    Text("\(s.home) \(score(s.homeScore))").font(.caption2.weight(.bold)).monospacedDigit()
                } else {
                    Circle().fill(s.legs.contains("lost") ? bad : s.legs.contains("live") ? amber : good)
                        .frame(width: 8, height: 8)
                }
            } minimal: {
                Text(a.kind == "game" ? "\(score(s.awayScore))-\(score(s.homeScore))" : "\(s.legs.filter { $0 == "won" }.count)/\(s.legs.count)")
                    .font(.caption2.weight(.bold)).monospacedDigit()
            }
            .keylineTint(hex(a.homeColor, good))
        }
    }
}

private struct TeamScore: View {
    let code: String
    let value: Int?
    let color: Color
    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 4, height: 22)
            Text(code).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
            Text(score(value)).font(.title2.weight(.heavy)).monospacedDigit().foregroundStyle(.white)
        }
    }
}

private struct LegDots: View {
    let legs: [String]
    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(legs.prefix(12).enumerated()), id: \.offset) { _, st in
                Capsule().fill(legColor(st)).frame(width: 14, height: 6)
            }
        }
        .accessibilityLabel("\(legs.filter { $0 == "won" }.count) of \(legs.count) legs hit")
    }
}

private struct LockCard: View {
    let attrs: DeVigLiveAttributes
    let st: DeVigLiveAttributes.ContentState
    let stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("DeVig · \(attrs.sport)").font(.caption.weight(.semibold)).foregroundStyle(mute)
                Spacer()
                Text(st.detail).font(.caption.weight(.semibold))
                    .foregroundStyle(st.phase == "in" ? amber : mute).lineLimit(1)
            }
            if attrs.kind == "game" {
                HStack {
                    TeamScore(code: st.away, value: st.awayScore, color: hex(attrs.awayColor))
                    Spacer()
                    TeamScore(code: st.home, value: st.homeScore, color: hex(attrs.homeColor))
                }
            } else {
                HStack(alignment: .center) {
                    Text(attrs.title).font(.headline).foregroundStyle(.white).lineLimit(1)
                    Spacer()
                    LegDots(legs: st.legs)
                }
            }
            Text(stale ? "Not live: open DeVig to update" : st.note)
                .font(.caption).foregroundStyle(stale ? amber : mute).lineLimit(1)
        }
        .padding(14)
    }
}
