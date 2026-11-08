// Builds a parlay as one Kalshi combo, signed with a Kalshi API key that lives only on this iPhone.
//
// How the key stays safe:
//   - Either the phone makes the key pair itself (Ed25519), or (the usual case: Kalshi's website makes keys for regular
//     accounts) you copy the private key Kalshi made and the app reads it from the clipboard itself, natively, then
//     wipes the clipboard; the web page never sees it. Either way the secret is saved in the iPhone Keychain, this
//     device only: never synced to iCloud, never moved to a new phone, never shown on screen, never handed to the site.
//   - Using it needs Face ID (or the passcode) every time; the Keychain itself asks, so nothing can use it silently.
//   - A key made here: you register only the PUBLIC half on Kalshi (its own-public-key route).
//   - This plugin signs exactly one kind of request: "build this combo" on Kalshi's own server. It can't place an
//     order, read your account, or move money, whatever the web page asks. You still buy the combo yourself on Kalshi.
//   - Remove deletes it from the Keychain; delete the key on Kalshi too and it's dead everywhere.
import Capacitor
import CryptoKit
import Foundation
import Security
import UIKit

@objc(DeVigKalshiPlugin)
public class DeVigKalshiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeVigKalshiPlugin"
    public let jsName = "DeVigKalshi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "makeKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setKeyId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "buildCombo", returnType: CAPPluginReturnPromise),
    ]

    static let host = "https://api.elections.kalshi.com"
    static let service = "dev.pages.devigai.kalshi"
    static let account = "combo-key"
    // public, not secret: kept in app settings so status() never touches the Keychain
    static let pubKey = "devig.kalshi.publicKey"
    static let idKey = "devig.kalshi.keyId"
    static let srcKey = "devig.kalshi.source"   // "made" (on this iPhone) or "kalshi" (pasted from Kalshi)

    @objc func status(_ call: CAPPluginCall) {
        let d = UserDefaults.standard
        call.resolve([
            "hasKey": d.string(forKey: Self.pubKey) != nil,
            "publicKey": d.string(forKey: Self.pubKey) ?? "",
            "keyId": d.string(forKey: Self.idKey) ?? "",
            "source": d.string(forKey: Self.srcKey) ?? "made",
        ])
    }

    // a new key pair: the secret half straight into the Keychain, the public half back to show and copy
    @objc func makeKey(_ call: CAPPluginCall) {
        let key = Curve25519.Signing.PrivateKey()
        if let why = Self.saveSecret(key.rawRepresentation) {
            call.reject(why)
            return
        }
        let pem = Self.publicPem(key.publicKey)
        UserDefaults.standard.set(pem, forKey: Self.pubKey)
        UserDefaults.standard.set("made", forKey: Self.srcKey)
        UserDefaults.standard.removeObject(forKey: Self.idKey)
        call.resolve(["publicKey": pem])
    }

    // the private key Kalshi made, read straight off the clipboard here (never through the web page), then the
    // clipboard is wiped. Takes Kalshi's Ed25519 (PKCS#8) or RSA (PKCS#1 or PKCS#8) PEM.
    @objc func importKey(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let board = UIPasteboard.general
            guard let text = board.string, !text.isEmpty else {
                call.reject("The clipboard is empty. Copy the whole private key from Kalshi first.")
                return
            }
            guard let secret = Self.parsePrivate(text) else {
                call.reject("That isn't a private key. Copy all of it, from -----BEGIN to the last -----END line.")
                return
            }
            board.items = []   // the key leaves the clipboard right away
            if let why = Self.saveSecret(secret) {
                call.reject(why)
                return
            }
            let pub = secret.count == 32 ? (try? Curve25519.Signing.PrivateKey(rawRepresentation: secret)).map { Self.publicPem($0.publicKey) } : nil
            UserDefaults.standard.set(pub ?? "RSA key from Kalshi", forKey: Self.pubKey)
            UserDefaults.standard.set("kalshi", forKey: Self.srcKey)
            call.resolve(["ok": true])
        }
    }

    // the secret into the Keychain: this iPhone only, never synced, Face ID or passcode to read. nil = saved.
    static func saveSecret(_ secret: Data) -> String? {
        deleteSecret()
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, nil) else {
            return "This iPhone needs a passcode to keep a key safe"
        }
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
            kSecAttrSynchronizable as String: false,
            kSecAttrAccessControl as String: access,
            kSecValueData as String: secret,
        ]
        let st = SecItemAdd(add as CFDictionary, nil)
        guard st == errSecSuccess else {
            return st == errSecNotAvailable || st == errSecAuthFailed ? "Set an iPhone passcode first, then try again" : "Couldn't save the key (\(st))"
        }
        return nil
    }

    // PEM text -> what the Keychain keeps: 32 bytes for Ed25519, PKCS#1 DER for RSA
    static func parsePrivate(_ text: String) -> Data? {
        let body = text.components(separatedBy: .newlines).filter { !$0.hasPrefix("-----") }.joined()
            .filter { !$0.isWhitespace }
        guard let der = Data(base64Encoded: body), der.count > 40 else { return nil }
        let ed = Data([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])
        if der.count == 48, der.prefix(16) == ed { return der.suffix(32) }
        // RSA in PKCS#8: the PKCS#1 key is the OCTET STRING after the rsaEncryption algorithm id
        let rsaOid = Data([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])
        var pkcs1 = der
        if let r = der.range(of: rsaOid) {
            var i = r.upperBound
            if i + 1 < der.count, der[i] == 0x05, der[i + 1] == 0x00 { i += 2 }
            guard i < der.count, der[i] == 0x04, let (len, start) = derLength(der, i + 1), start + len <= der.count else { return nil }
            pkcs1 = der.subdata(in: start ..< start + len)
        }
        let attrs: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA, kSecAttrKeyClass as String: kSecAttrKeyClassPrivate]
        return SecKeyCreateWithData(pkcs1 as CFData, attrs as CFDictionary, nil) != nil ? pkcs1 : nil
    }

    static func derLength(_ d: Data, _ at: Int) -> (Int, Int)? {
        guard at < d.count else { return nil }
        let b = Int(d[d.startIndex + at])
        if b < 0x80 { return (b, at + 1) }
        let n = b & 0x7f
        guard n >= 1, n <= 4, at + n < d.count else { return nil }
        var len = 0
        for k in 1...n { len = len << 8 | Int(d[d.startIndex + at + k]) }
        return (len, at + 1 + n)
    }

    // Ed25519 signs the bytes as they are; RSA uses RSA-PSS with SHA-256 (salt = digest length), as Kalshi asks
    static func sign(_ secret: Data, _ msg: Data) -> Data? {
        if secret.count == 32 {
            return (try? Curve25519.Signing.PrivateKey(rawRepresentation: secret)).flatMap { try? $0.signature(for: msg) }
        }
        let attrs: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA, kSecAttrKeyClass as String: kSecAttrKeyClassPrivate]
        guard let k = SecKeyCreateWithData(secret as CFData, attrs as CFDictionary, nil) else { return nil }
        return SecKeyCreateSignature(k, .rsaSignatureMessagePSSSHA256, msg as CFData, nil) as Data?
    }

    @objc func setKeyId(_ call: CAPPluginCall) {
        let id = (call.getString("keyId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard id.range(of: "^[A-Za-z0-9-]{8,64}$", options: .regularExpression) != nil else {
            call.reject("That doesn't look like a Kalshi Key ID")
            return
        }
        UserDefaults.standard.set(id, forKey: Self.idKey)
        call.resolve(["keyId": id])
    }

    @objc func remove(_ call: CAPPluginCall) {
        Self.deleteSecret()
        UserDefaults.standard.removeObject(forKey: Self.pubKey)
        UserDefaults.standard.removeObject(forKey: Self.idKey)
        UserDefaults.standard.removeObject(forKey: Self.srcKey)
        call.resolve()
    }

    // the only signed request: create (or find) the combo for these legs. Face ID unlocks the key for this one call.
    @objc func buildCombo(_ call: CAPPluginCall) {
        guard let keyId = UserDefaults.standard.string(forKey: Self.idKey) else {
            call.reject("Set up your Kalshi key in Profile first")
            return
        }
        let legs = call.getArray("legs", JSObject.self) ?? []
        let ticker = "^[A-Z0-9][A-Z0-9.-]{2,120}$"
        guard (2...12).contains(legs.count) else {
            call.reject("A combo needs 2 to 12 legs")
            return
        }
        var picked: [[String: String]] = []
        for l in legs {
            guard let m = l["market_ticker"] as? String, let e = l["event_ticker"] as? String, let s = l["side"] as? String,
                  m.range(of: ticker, options: .regularExpression) != nil, e.range(of: ticker, options: .regularExpression) != nil,
                  s == "yes" || s == "no" else {
                call.reject("One of the legs isn't a Kalshi market")
                return
            }
            picked.append(["market_ticker": m, "event_ticker": e, "side": s])
        }
        DispatchQueue.global(qos: .userInitiated).async {
            // which of Kalshi's combo groups takes all these games (public list, no key needed)
            guard let collection = Self.findCollection(Set(picked.map { $0["event_ticker"]! })) else {
                call.reject("Kalshi doesn't offer these legs together as a combo")
                return
            }
            let path = "/trade-api/v2/multivariate_event_collections/\(collection)"
            // reading the key is what asks for Face ID
            guard let secret = Self.readSecret() else {
                call.reject("Face ID was cancelled, or the key is gone. Set it up again in Profile.")
                return
            }
            let ts = String(Int64(Date().timeIntervalSince1970 * 1000))
            guard let sig = Self.sign(secret, Data((ts + "POST" + path).utf8)),
                  let body = try? JSONSerialization.data(withJSONObject: ["selected_markets": picked]),
                  let url = URL(string: Self.host + path) else {
                call.reject("Couldn't sign the request")
                return
            }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.httpBody = body
            req.timeoutInterval = 20
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue(keyId, forHTTPHeaderField: "KALSHI-ACCESS-KEY")
            req.setValue(ts, forHTTPHeaderField: "KALSHI-ACCESS-TIMESTAMP")
            req.setValue(sig.base64EncodedString(), forHTTPHeaderField: "KALSHI-ACCESS-SIGNATURE")
            URLSession.shared.dataTask(with: req) { data, resp, err in
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                let json = (data.flatMap { try? JSONSerialization.jsonObject(with: $0) }) as? [String: Any]
                if let m = json?["market_ticker"] as? String, (200..<300).contains(code) {
                    call.resolve(["market_ticker": m, "event_ticker": json?["event_ticker"] as? String ?? ""])
                    return
                }
                let msg = ((json?["error"] as? [String: Any])?["message"] as? String) ?? err?.localizedDescription ?? "no answer"
                if code == 401 {
                    call.reject("Kalshi didn't accept the key (401). The Key ID has to belong to the same key that's on this iPhone. In Profile, remove the key, then paste the private key Kalshi made and its Key ID.")
                    return
                }
                call.reject("Kalshi said: \(msg) (\(code))")
            }.resume()
        }
    }

    // Kalshi's open combo groups; the first one whose games include every leg's game (the cross-category one the Kalshi
    // app's combos use comes first when it fits)
    static func findCollection(_ events: Set<String>) -> String? {
        var found: [String] = []
        var cursor = ""
        for _ in 0..<5 {
            var c = URLComponents(string: host + "/trade-api/v2/multivariate_event_collections")!
            c.queryItems = [URLQueryItem(name: "status", value: "open"), URLQueryItem(name: "limit", value: "200")]
                + (cursor.isEmpty ? [] : [URLQueryItem(name: "cursor", value: cursor)])
            guard let url = c.url, let data = syncGet(url),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { break }
            for m in json["multivariate_contracts"] as? [[String: Any]] ?? [] {
                let have = Set((m["associated_events"] as? [[String: Any]] ?? []).compactMap { $0["ticker"] as? String })
                if let t = m["collection_ticker"] as? String, events.isSubset(of: have) { found.append(t) }
            }
            cursor = json["cursor"] as? String ?? ""
            if cursor.isEmpty { break }
        }
        return found.first { $0.hasPrefix("KXMVECROSSCATEGORY") } ?? found.first
    }

    static func syncGet(_ url: URL) -> Data? {
        var out: Data?
        let done = DispatchSemaphore(value: 0)
        var req = URLRequest(url: url)
        req.timeoutInterval = 15
        URLSession.shared.dataTask(with: req) { d, r, _ in
            if (r as? HTTPURLResponse)?.statusCode == 200 { out = d }
            done.signal()
        }.resume()
        done.wait()
        return out
    }

    static func readSecret() -> Data? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecUseOperationPrompt as String: "Build this parlay as a Kalshi combo",
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return d
    }

    static func deleteSecret() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] as CFDictionary)
    }

    // Ed25519 public key as PEM (SubjectPublicKeyInfo), the shape Kalshi's "your own public key" field takes
    static func publicPem(_ k: Curve25519.Signing.PublicKey) -> String {
        let der = Data([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]) + k.rawRepresentation
        return "-----BEGIN PUBLIC KEY-----\n\(der.base64EncodedString())\n-----END PUBLIC KEY-----"
    }
}
