// What one lock-screen card (Live Activity) shows: a tracked game or a saved parlay. Compiled into both the app
// (which starts and updates the cards) and the DeVigLive widget extension (which draws them).
import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct DeVigLiveAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var away: String          // team codes; empty for a parlay
        public var home: String
        public var awayScore: Int?
        public var homeScore: Int?
        public var phase: String         // pre | in | post
        public var detail: String        // the clock ("Q3 4:12"), "Starts 7:30 PM", "Final", or a parlay's status
        public var note: String          // DeVig's pick, or the parlay's live leg
        public var legs: [String]        // a parlay's legs: won | lost | push | live | pending (empty for a game)
    }

    public var id: String                // the game's track key, or "parlay:<id>"
    public var kind: String              // game | parlay
    public var sport: String
    public var title: String
    public var awayColor: String         // hex, may be empty
    public var homeColor: String
}
