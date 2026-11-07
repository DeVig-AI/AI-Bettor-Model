// share: opens iOS's share sheet with an image the site drew (see share() below).
// The bridge the DeVig site calls (window.Capacitor.nativePromise('DeVigLive', 'sync', {items})) with every tracked game
// and parlay that should be on the lock screen right now. It starts cards for new ones, updates the rest, ends finished
// ones (they stay visible 30 minutes) and ends any card no longer in the list. No push: a card only changes while
// DeVig is open, so each one is marked stale 15 minutes after its last update and says so.
import ActivityKit
import Capacitor
import Foundation
import UIKit

@objc(DeVigLivePlugin)
public class DeVigLivePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeVigLivePlugin"
    public let jsName = "DeVigLive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
    ]

    // share an image the site drew (a parlay or streak card): the web view can't download a file or reliably open
    // the share sheet with one, so the app opens iOS's own share sheet (Messages, Save Image, Instagram...)
    @objc func share(_ call: CAPPluginCall) {
        let b64 = (call.getString("image") ?? "").replacingOccurrences(of: "^data:image/[a-z]+;base64,", with: "", options: .regularExpression)
        guard let data = Data(base64Encoded: b64), let image = UIImage(data: data) else {
            call.reject("image must be a base64 PNG or JPEG")
            return
        }
        var items: [Any] = [image]
        if let text = call.getString("text"), !text.isEmpty { items.append(text) }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { call.reject("no screen to share from"); return }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let pop = sheet.popoverPresentationController { // iPad: anchor it mid-screen
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 1, height: 1)
                pop.permittedArrowDirections = []
            }
            sheet.completionWithItemsHandler = { _, done, _, _ in call.resolve(["shared": done]) }
            vc.present(sheet, animated: true)
        }
    }

    @objc func available(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["value": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["value": false])
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["shown": 0])
            return
        }
        let raw = call.options["items"] ?? []
        guard JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw),
              let items = try? JSONDecoder().decode([LiveItem].self, from: data) else {
            call.reject("items must be a list of lock-screen cards")
            return
        }
        Task {
            let shown = await LiveSync.apply(items)
            call.resolve(["shown": shown])
        }
    }
}

@available(iOS 16.1, *)
struct LiveItem: Decodable {
    let id: String
    let kind: String
    let sport: String
    let title: String
    let awayColor: String
    let homeColor: String
    let state: DeVigLiveAttributes.ContentState
}

@available(iOS 16.2, *)
enum LiveSync {
    static let maxCards = 5                       // iOS shows only a few per app; earliest starts first
    static let startedKey = "devig.live.started"  // ids that already had a card: never restarted (ended or swiped away)

    static func apply(_ items: [LiveItem]) async -> Int {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return 0 }
        var started = UserDefaults.standard.stringArray(forKey: startedKey) ?? []
        var active: [String: Activity<DeVigLiveAttributes>] = [:]
        for a in Activity<DeVigLiveAttributes>.activities where a.activityState == .active {
            active[a.attributes.id] = a
        }
        let wanted = Set(items.map(\.id))
        // untracked (or no longer due): forget it too, so tracking it again brings its card back
        started.removeAll { !wanted.contains($0) }
        for (id, a) in active where !wanted.contains(id) {
            await a.end(nil, dismissalPolicy: .immediate)
            active[id] = nil
        }
        for it in items {
            let final = it.state.phase == "post"
            let content = ActivityContent(state: it.state,
                                          staleDate: Date().addingTimeInterval(final ? 4 * 3600 : 15 * 60))
            if let a = active[it.id] {
                if final {
                    await a.end(content, dismissalPolicy: .after(Date().addingTimeInterval(30 * 60)))
                    active[it.id] = nil
                } else {
                    await a.update(content)
                }
            } else if !final, !started.contains(it.id), active.count < maxCards {
                let attrs = DeVigLiveAttributes(id: it.id, kind: it.kind, sport: it.sport, title: it.title,
                                                awayColor: it.awayColor, homeColor: it.homeColor)
                if let a = try? Activity.request(attributes: attrs, content: content, pushType: nil) {
                    active[it.id] = a
                    started.append(it.id)
                }
            }
        }
        UserDefaults.standard.set(Array(started.suffix(300)), forKey: startedKey)
        return active.count
    }
}
