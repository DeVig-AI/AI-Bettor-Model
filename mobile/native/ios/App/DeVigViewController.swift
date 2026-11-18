// Capacitor's web view, plus DeVig's own native plugin (lock-screen cards, Kalshi combos). Main.storyboard points here (set by the
// iPhone build in .github/workflows/devig_apps.yml).
import Capacitor
import UIKit

class DeVigViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DeVigLivePlugin())
        bridge?.registerPluginInstance(DeVigKalshiPlugin()) // parlays as Kalshi combos, key kept in the Keychain
        // devig://open?text=... (the iPhone Shortcut on the share sheet): read that bet in the app, not in Safari
        NotificationCenter.default.addObserver(forName: .capacitorOpenURL, object: nil, queue: .main) { [weak self] n in
            if let url = (n.object as? [String: Any])?["url"] as? URL { self?.openShared(url) }
        }
    }

    // opened cold from the Shortcut: Capacitor loads its home page in super.viewDidLoad, so the shared bet goes after it
    override open func viewDidLoad() {
        super.viewDidLoad()
        if let url = ApplicationDelegateProxy.shared.lastURL { openShared(url) }
    }

    private func openShared(_ url: URL) {
        guard url.scheme == "devig", let q = url.query, !q.isEmpty,
              let page = URL(string: "https://devigai.pages.dev/v2/?" + q) else { return }
        webView?.load(URLRequest(url: page))
    }
}
