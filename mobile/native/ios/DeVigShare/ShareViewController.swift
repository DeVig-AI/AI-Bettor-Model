// DeVig on the iPhone share sheet (next to Messages): takes what Kalshi, Polymarket or a sportsbook shares (a link, often with
// some text and a picture of the slip) and opens the DeVig app on it (devig://open?text=..., read by DeVigViewController).
import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    private var done = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !done else { return }
        done = true
        collect { [weak self] text in self?.hand(text) }
    }

    /// Every link and bit of text in the share, links first (a slip picture carries nothing DeVig can read here).
    private func collect(_ finish: @escaping (String) -> Void) {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        var links: [String] = [], texts: [String] = []
        let lock = NSLock(), group = DispatchGroup()
        for p in providers {
            if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                p.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    if let u = item as? URL, !u.isFileURL { lock.lock(); links.append(u.absoluteString); lock.unlock() }
                    group.leave()
                }
            } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                p.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                    let s = (item as? String) ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
                    if let s = s, !s.isEmpty { lock.lock(); texts.append(s); lock.unlock() }
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) { finish((links + texts).joined(separator: " ")) }
    }

    private func hand(_ text: String) {
        let q = text.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        guard !q.isEmpty, let url = URL(string: "devig://open?text=" + q) else { return close() }
        // a share extension can't open its app directly: walk up to the UIApplication and ask it
        var r: UIResponder? = self
        while let cur = r {
            if let app = cur as? UIApplication {
                app.open(url, options: [:]) { [weak self] _ in self?.close() }
                return
            }
            r = cur.next
        }
        close()
    }

    private func close() { extensionContext?.completeRequest(returningItems: nil, completionHandler: nil) }
}
