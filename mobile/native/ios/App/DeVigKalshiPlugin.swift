// Builds a parlay as one Kalshi combo, signed with a Kalshi API key that lives only on this iPhone.
//
// How the key stays safe:
//   - The phone makes the key pair itself (Ed25519). The secret half is saved in the iPhone Keychain, this device only:
//     never synced to iCloud, never moved to a new phone, never shown on screen, never handed to the DeVig site.
//   - Using it needs Face ID (or the passcode) every time; the Keychain itself asks, so nothing can use it silently.
//   - You register only the PUBLIC half on Kalshi (Profile, API Keys, "use your own public key"). Nothing secret is
//     ever copied, pasted, typed or sent anywhere.
//   - This plugin signs exactly one kind of request: "build this combo" on Kalshi's own server. It can't place an
//     order, read your account, or move money, whatever the web page asks. You still buy the combo yourself on Kalshi.
//   - Remove deletes it from the Keychain; delete the key on Kalshi too and it's dead everywhere.
import Capacitor
import CryptoKit
import Foundation
import Security

@objc(DeVigKalshiPlugin)
public class DeVigKalshiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeVigKalshiPlugin"
    public let jsName = "DeVigKalshi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "makeKey", returnType: CAPPluginReturnPromise),
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

    @objc func status(_ call: CAPPluginCall) {
        let d = UserDefaults.standard
        call.resolve([
            "hasKey": d.string(forKey: Self.pubKey) != nil,
            "publicKey": d.string(forKey: Self.pubKey) ?? "",
            "keyId": d.string(forKey: Self.idKey) ?? "",
        ])
    }

    // a new key pair: the secret half straight into the Keychain, the public half back to show and copy
    @objc func makeKey(_ call: CAPPluginCall) {
        Self.deleteSecret()
        let key = Curve25519.Signing.PrivateKey()
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, nil) else {
            call.reject("This iPhone needs a passcode to keep a key safe")
            return
        }
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
            kSecAttrSynchronizable as String: false,
            kSecAttrAccessControl as String: access,
            kSecValueData as String: key.rawRepresentation,
        ]
        let st = SecItemAdd(add as CFDictionary, nil)
        guard st == errSecSuccess else {
            call.reject(st == errSecNotAvailable || st == errSecAuthFailed ? "Set an iPhone passcode first, then try again" : "Couldn't save the key (\(st))")
            return
        }
        let pem = Self.publicPem(key.publicKey)
        UserDefaults.standard.set(pem, forKey: Self.pubKey)
        UserDefaults.standard.removeObject(forKey: Self.idKey)
        call.resolve(["publicKey": pem])
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
            guard let key = Self.readSecret() else {
                call.reject("Face ID was cancelled, or the key is gone. Set it up again in Profile.")
                return
            }
            let ts = String(Int64(Date().timeIntervalSince1970 * 1000))
            guard let sig = try? key.signature(for: Data((ts + "POST" + path).utf8)),
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

    static func readSecret() -> Curve25519.Signing.PrivateKey? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecUseOperationPrompt as String: "Build this parlay as a Kalshi combo",
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return try? Curve25519.Signing.PrivateKey(rawRepresentation: d)
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
