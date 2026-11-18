// DeVig on the iPhone share sheet (next to Messages): takes what Kalshi, Polymarket or a sportsbook shares (a link, often with
// some text and a picture of the slip) and opens the DeVig app on it (devig://open?text=..., read by DeVigViewController).
import UIKit
import UniformTypeIdentifiers
import WebKit

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
        openApp(url) { [weak self] ok in
            guard let self = self else { return }
            if ok { self.close() } else { self.showHere(q) }
        }
    }

    /// A share extension isn't allowed to call UIApplication.open, so send open(_:options:completionHandler:) by selector,
    /// first to the application up the responder chain, then to UIApplication.shared. Calls back false when iOS refused.
    private func openApp(_ url: URL, _ done: @escaping (Bool) -> Void) {
        let sel = NSSelectorFromString("openURL:options:completionHandler:")
        var targets: [NSObject] = []
        var r: UIResponder? = self
        while let cur = r {
            if let cls = NSClassFromString("UIApplication"), cur.isKind(of: cls) { targets.append(cur) }
            r = cur.next
        }
        if let cls = NSClassFromString("UIApplication") as? NSObject.Type,
           let shared = cls.perform(NSSelectorFromString("sharedApplication"))?.takeUnretainedValue() as? NSObject,
           !targets.contains(where: { $0 === shared }) { targets.append(shared) }
        guard let app = targets.first(where: { $0.responds(to: sel) }), let imp = app.method(for: sel) else { return done(false) }
        typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, (@convention(block) (Bool) -> Void)?) -> Void
        var answered = false
        let finish: @convention(block) (Bool) -> Void = { ok in
            DispatchQueue.main.async { if !answered { answered = true; done(ok) } }
        }
        unsafeBitCast(imp, to: Open.self)(app, sel, url as NSURL, NSDictionary(), finish)
        // iOS sometimes never answers: if the app hasn't come up in 1.5s, show the bet here instead
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { if !answered { answered = true; done(false) } }
    }

    /// iOS wouldn't open the app: show DeVig's read of the bet right here in the share sheet.
    private func showHere(_ q: String) {
        guard let page = URL(string: "https://devigai.pages.dev/v2/?text=" + q) else { return close() }
        view.backgroundColor = .systemBackground
        let bar = UIStackView(), note = UILabel(), done = UIButton(type: .system)
        note.text = "DeVig"
        note.font = .boldSystemFont(ofSize: 17)
        done.setTitle("Done", for: .normal)
        done.titleLabel?.font = .boldSystemFont(ofSize: 17)
        done.addAction(UIAction { [weak self] _ in self?.close() }, for: .touchUpInside)
        bar.addArrangedSubview(note); bar.addArrangedSubview(done)
        bar.distribution = .equalSpacing
        bar.layoutMargins = UIEdgeInsets(top: 12, left: 16, bottom: 8, right: 16)
        bar.isLayoutMarginsRelativeArrangement = true
        let web = WKWebView(frame: .zero)
        web.load(URLRequest(url: page))
        for v in [bar, web] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor), bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.topAnchor.constraint(equalTo: bar.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func close() { extensionContext?.completeRequest(returningItems: nil, completionHandler: nil) }
}
