using System;
using System.Collections.Generic;
using System.IO;
using RoomLab.Native;
using Newtonsoft.Json.Linq;

// Executable assertions for the demo rule profile (bugs 5-8). Runs without Unity against the same
// Core sources the player uses, so a passing run is real evidence for the new rules; the frozen
// Editor255Compat / LatestPhysics oracles are covered separately by GameplayChecks.
class Program
{
    static int checks;
    static void Check(bool value, string message) { checks++; if (!value) throw new Exception(message); }
    static readonly string[] Kinds = { "common.small", "common.coin", "common.collectible", "common.aiStart", "common.aiStartHollow" };

    static void Main(string[] args)
    {
        var root = Directory.GetCurrentDirectory();
        var project = NativeProjectLoader.LoadFile(Path.Combine(root, "Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json"), new ImportOptions { Profile = ImportProfile.CustomDdl13Preserve, RequireAssets = true });
        var course = project.Courses[0];
        Check(course.Rooms.Count == 11, "authored course must keep 11 rooms");

        // paid dash: cap 1, starts empty
        var compat = new NativeMotion(project, course.Id, course.Rooms[0].Id, NativeGameplayRules.Editor255Compat);
        Check(compat.PaidStockCap == 3 && compat.Charges == 3, "255 compat still starts 3/3");
        var latest = new NativeMotion(project, course.Id, course.Rooms[0].Id, NativeGameplayRules.LatestPhysics);
        Check(latest.PaidStockCap == 1 && latest.Charges == 1, "latest rule unchanged at cap1 full");
        var demo = new NativeMotion(project, course.Id, course.Rooms[0].Id, NativeGameplayRules.DemoPhysics);
        Check(demo.PaidStockCap == 1 && demo.Charges == 0, "demo paid dash starts empty with cap 1");

        // three small tokens charge once, and a full stock never banks extra recharge
        var smallRoom = FindRoom(course, r => Count(r, "common.small") >= 3) ?? throw new Exception("no room with three small tokens");
        var coins = new NativeMotion(project, course.Id, smallRoom.Id, NativeGameplayRules.DemoPhysics);
        int smallCollected = 0;
        foreach (var o in smallRoom.Objects)
        {
            if (o.Type != "common.small" || o.Text("unlockPadId") != "") continue;
            Step(coins, o); smallCollected++;
            if (smallCollected == 3) break;
        }
        Check(smallCollected == 3, "could not collect three small tokens");
        Check(coins.Charges == 1 && coins.Recharge == 0, "three small tokens must charge exactly once");
        Check(coins.Tokens == 3, "tokens still count individually");
        coins.Charges = 1;
        var extra = smallRoom.Objects.Find(o => o.Type == "common.small" && o.Text("unlockPadId") == "");
        if (extra != null && coins.Credited.Contains(coins.Room.Id + "/" + extra.Id) == false)
        {
            Step(coins, extra);
            Check(coins.Charges == 1 && coins.Recharge == 0, "full stock must not bank recharge");
        }

        // one big token is one full charge
        var bigRoom = FindRoom(course, r => Count(r, "common.coin") >= 1) ?? throw new Exception("no room with a big token");
        var big = new NativeMotion(project, course.Id, bigRoom.Id, NativeGameplayRules.DemoPhysics);
        var bigCoin = bigRoom.Objects.Find(o => o.Type == "common.coin" && o.Text("unlockPadId") == "");
        Step(big, bigCoin);
        Check(big.Charges == 1 && big.Recharge == 0, "one big token must charge once");
        Check(big.Tokens == 10 && big.Score == 1000, "big token still worth 10 tokens / 1000 score");

        // collectibles belong to the AI
        var collectRoom = FindRoom(course, r => Count(r, "common.collectible") >= 1) ?? throw new Exception("no room with a collectible");
        var pickup = new NativeMotion(project, course.Id, collectRoom.Id, NativeGameplayRules.DemoPhysics);
        var treasure = collectRoom.Objects.Find(o => o.Type == "common.collectible");
        int scoreBefore = pickup.Score;
        Step(pickup, treasure);
        Check(pickup.Score == scoreBefore, "player must not collect the collectible");
        Check(!pickup.Credited.Contains(pickup.Room.Id + "/" + treasure.Id), "collectible must stay uncredited for the player");
        pickup.AI.active = true;
        pickup.AI.x = treasure.X * 32 + 16; pickup.AI.y = treasure.Y * 32 + 16;
        pickup.Tick(0);
        Check(pickup.Score == scoreBefore + 10000, "AI must collect the collectible");
        Check(pickup.Credited.Contains(pickup.Room.Id + "/" + treasure.Id), "AI collection must credit once");

        // two AI catches: half the tokens, then death
        var hunt = new NativeMotion(project, course.Id, course.Rooms[0].Id, NativeGameplayRules.DemoPhysics);
        hunt.Tokens = 10; hunt.AiProcessing = 0; hunt.AiCooldown = 0; hunt.Player.invulnerable = 0;
        hunt.CatchPlayer();
        Check(hunt.Tokens == 5 && hunt.AiHits == 1 && hunt.Steals == 1, "first catch takes half the tokens");
        Check(hunt.Deaths == 0, "first catch must not kill");
        hunt.AiProcessing = 0; hunt.AiCooldown = 0; hunt.Player.invulnerable = 0;
        hunt.CatchPlayer();
        Check(hunt.Deaths == 1, "second catch must send the player back to the checkpoint");
        Check(hunt.AiHits == 0, "catch counter resets on death");
        var odd = new NativeMotion(project, course.Id, course.Rooms[0].Id, NativeGameplayRules.DemoPhysics);
        odd.Tokens = 7; odd.AiProcessing = 0; odd.AiCooldown = 0; odd.Player.invulnerable = 0;
        odd.CatchPlayer();
        Check(odd.Tokens == 4 && odd.AiHits == 1, "half of an odd token count rounds down");

        // the AI pad is an E interaction in the demo profile
        var aiRoom = FindRoom(course, r => Count(r, "common.aiStart") + Count(r, "common.aiStartHollow") >= 1) ?? throw new Exception("no room with an AI pad");
        var boot = new NativeMotion(project, course.Id, aiRoom.Id, NativeGameplayRules.DemoPhysics);
        var pad = aiRoom.Objects.Find(o => o.Type == "common.aiStart" || o.Type == "common.aiStartHollow");
        boot.Player.x = pad.X * 32; boot.Player.y = pad.Y * 32; boot.Player.grounded = false;
        Check(boot.NearbyInteraction == pad, "AI pad must be offered as an interaction");
        boot.Tokens = 12;
        boot.Tick(0);
        Check(!boot.CourseAIActive, "standing on the pad must not start the AI on its own");
        boot.Player.x = pad.X * 32; boot.Player.y = pad.Y * 32;
        boot.Tick(0, new MotionInput { interactPressed = true });
        Check(boot.CourseAIActive && boot.AI.active, "E must start the AI");
        Check(boot.Tokens == 0, "starting the AI spends every token");
        var compatBoot = new NativeMotion(project, course.Id, aiRoom.Id, NativeGameplayRules.Editor255Compat);
        Check(compatBoot.NearbyInteraction == null, "255 compat keeps its own pad trigger");

        // jets must not fire when the player merely jumps up through them from underneath
        var jetRoom = FindRoom(course, r => Count(r, "physics.jet") >= 1) ?? throw new Exception("no room with a jet pad");
        var jet = jetRoom.Objects.Find(o => o.Type == "physics.jet" && o.Collision) ?? jetRoom.Objects.Find(o => o.Type == "physics.jet");
        var under = new NativeMotion(project, course.Id, jetRoom.Id, NativeGameplayRules.DemoPhysics);
        under.Player.x = jet.X * 32 + 4; under.Player.y = jet.Y * 32 + 8;
        under.Player.vx = 0; under.Player.vy = -300; under.Player.grounded = false;
        under.Player.invulnerable = 99;
        under.Tick(0);
        Check(!HasEvent(under, "jet"), "rising through the jet pad must not fire it");
        var onTop = new NativeMotion(project, course.Id, jetRoom.Id, NativeGameplayRules.DemoPhysics);
        onTop.Player.x = jet.X * 32 + 4; onTop.Player.y = jet.Y * 32 - onTop.Player.h;
        onTop.Player.vx = 0; onTop.Player.vy = 60; onTop.Player.grounded = true;
        onTop.Player.invulnerable = 99;
        onTop.Tick(1.0 / 120.0);
        Check(HasEvent(onTop, "jet"), "landing on the jet pad must still fire it");

        // the demo profile still saves and reloads
        var save = new NativeMotion(project, course.Id, course.Rooms[0].Id, NativeGameplayRules.DemoPhysics);
        save.Charges = 0; save.Tokens = 5; save.Checkpoint.charges = 0; save.Checkpoint.tokens = 5;
        var reloaded = NativeMotion.FromContinuation(project, JObject.Parse(save.ExportContinuation().ToString()), NativeGameplayRules.DemoPhysics);
        Check(reloaded.Charges == 0 && reloaded.Tokens == 5 && reloaded.PaidStockCap == 1, "demo continuation keeps the empty stock");

        // Rebased built-in level identity and counts
        Check(project.SourceSha256 == "03b948a705210aafd718306a70947e90b41f7d1fa013a53a4087091d51809836", "built-in authored level must be the latest user bytes");
        int checkpoints = 0, objects = 0, tiles = 0;
        foreach (var r in course.Rooms) { objects += r.Objects.Count; tiles += r.Tiles.Count; foreach (var o in r.Objects) if (o.Type == "common.checkpoint") checkpoints++; }
        Check(course.Rooms.Count == 11 && objects == 669 && tiles == 1324 && checkpoints == 8, "rebased level counts: rooms=" + course.Rooms.Count + " objects=" + objects + " tiles=" + tiles + " checkpoints=" + checkpoints);

        // A bare JSON without its assets folder must still be playable through the fallback path
        string bareDir = Path.Combine(Path.GetTempPath(), "roomlab-bare-json");
        Directory.CreateDirectory(bareDir);
        string bare = Path.Combine(bareDir, "authored-physics.json");
        File.WriteAllBytes(bare, File.ReadAllBytes(Path.Combine(root, "Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json")));
        bool rejected = false;
        try { NativeProjectLoader.LoadFile(bare, new ImportOptions { Profile = ImportProfile.EditorAuto, RequireAssets = true }); }
        catch (NativeDataException e) { rejected = e.Message.StartsWith("缺少素材："); }
        Check(rejected, "bare JSON without assets must be rejected while assets are required");
        var relaxed = NativeProjectLoader.LoadFile(bare, new ImportOptions { Profile = ImportProfile.EditorAuto, RequireAssets = false });
        Check(relaxed.RoomCount == 11 && relaxed.Assets.Count == 9 && relaxed.Assets[0].Bytes == null, "bare JSON must import through the built-in art fallback (declarations kept, bytes unresolved)");

        Console.WriteLine("NATIVE_DEMO_RULES_PASS checks=" + checks + " rooms=" + course.Rooms.Count + " small=" + smallCollected + " checkpoints=" + checkpoints + " profile=" + NativeGameplayRules.DemoPhysics);
    }

static bool HasEvent(NativeMotion game, string type)
    {
        foreach (var e in game.Events) if ((string)e["type"] == type) return true;
        return false;
    }

    static void Step(NativeMotion game, NativeObject o)
    {
        game.Player.x = o.X * 32 + 4; game.Player.y = o.Y * 32 + 4;
        game.Player.vx = game.Player.vy = 0;
        game.Tick(0);
    }

    static int Count(NativeRoom room, string type)
    {
        int n = 0; foreach (var o in room.Objects) if (o.Type == type) n++;
        return n;
    }

    static NativeRoom FindRoom(NativeCourse course, Func<NativeRoom, bool> match)
    {
        foreach (var r in course.Rooms) if (match(r)) return r;
        return null;
    }
}
