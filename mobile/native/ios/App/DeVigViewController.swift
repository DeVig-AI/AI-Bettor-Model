// Capacitor's web view, plus DeVig's own native plugin (lock-screen cards). Main.storyboard points here (set by the
// iPhone build in .github/workflows/devig_apps.yml).
import Capacitor
import UIKit

class DeVigViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DeVigLivePlugin())
    }
}
