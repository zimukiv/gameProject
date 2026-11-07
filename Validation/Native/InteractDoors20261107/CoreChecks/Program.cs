using System;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using RoomLab.Native;

// Independent acceptance: source is compiled directly; no production methods are replaced.
// All flag contacts and item use below use Tick/input; LoadRoom is used only for state travel setup.
class AutoChecks
{
    static readonly string Output = "Validation/Native/InteractDoors20261107/CoreChecks";
    static readonly JObject Source = JObject.Parse(File.ReadAllText("Assets/StreamingAssets/RoomLabNative/Campaign/deadline-guided.json"));
    static readonly JArray Results = new JArray();
    static int checks, failures;
    static string diskRoot;
    static void Check(bool ok, string name, object details = null)
    {
        checks++; if (!ok) failures++;
        Results.Add(new JObject { { "name", name }, { "pass", ok }, { "details", details == null ? null : JToken.FromObject(details) } });
        Console.WriteLine((ok ? "PASS " : "FAIL ") + name + (details == null ? "" : " " + JToken.FromObject(details).ToString(Newtonsoft.Json.Formatting.None)));
    }
    static void Run(string name, Action action)
    {
        try { action(); }
        catch (Exception e) { failures++; Results.Add(new JObject { { "name", name }, { "pass", false }, { "exception", e.ToString() } }); Console.WriteLine("EXCEPTION " + name + " " + e); }
    }
    static bool Throws(Action action) { try { action(); return false; } catch { return true; } }
    static bool Same(object a, object b) => JToken.DeepEquals(JToken.FromObject(a), JToken.FromObject(b));
    static JObject Item(string id, string type, int x, double? delta = null) => new JObject {
        {"id",id},{"type",type},{"x",x},{"y",13},{"w",1},{"h",1},{"collision",false},
        {"params",new JObject()},{"trigger",new JObject{{"mode","region"},{"once",delta.HasValue},{"requiresAI",false},{"distance",2},{"cooldown",1}}},
        {"resetPolicy","checkpoint"},{"rework",delta.HasValue?new JObject{{"clarityDelta",delta.Value}}:new JObject()}
    };
    static JObject Fixture(string kind = "slacker")
    {
        var p = (JObject)Source.DeepClone();
        var c = (JObject)((JArray)p["courses"]).First(t => (string)t["kind"] == kind).DeepClone();
        p["nativeCampaign"]["saveMode"]="contact-auto-v1";p["nativeCampaign"]["authoredCourses"]=new JArray("physics");p["nativeCampaign"]["guided"] = true; p["nativeCampaign"]["network"] = true;
        c["id"] = kind == "physics" ? "physics" : "save-audit-" + kind;
        c["nativeCampaign"] = new JObject { { "signals", new JArray() }, { "resourceAwareness", kind == "slacker" } };
        var template = (JObject)c["rooms"][0]; var rooms = new JArray();
        foreach (var name in new[] { "a", "b", "c" })
        {
            var r = (JObject)template.DeepClone();
            r["id"] = name; r["name"] = "Save audit " + name; r["cols"] = 32; r["rows"] = 18; r["phase"] = "slow"; r["aiPolicy"] = "off";
            r["nativeCampaign"] = new JObject { { "awareness", 50 }, { "switches", new JArray() }, { "platforms", new JArray() }, { "patrols", new JArray() }, { "pulseBudget", 0 } };
            r["entries"] = new JArray(new JObject { { "id", name + "-left" }, { "x", 2 }, { "y", 13 }, { "face", 1 } }, new JObject { { "id", name + "-right" }, { "x", 28 }, { "y", 13 }, { "face", -1 } });
            r["exits"] = new JArray(new JObject { { "id", name + "-back" }, { "x", 0 }, { "y", 12 }, { "w", 2 }, { "h", 2 } }, new JObject { { "id", name + "-next" }, { "x", 29 }, { "y", 12 }, { "w", 2 }, { "h", 2 } });
            r["tiles"] = new JArray(Enumerable.Range(0, 32).Select(x => new JObject { { "x", x }, { "y", 14 }, { "collision", true } }));
            var objects = new JArray(Item(name + "-save", "common.checkpoint", 8));
            if (kind == "slacker") { objects.Add(Item(name + "-coffee", "slacker.awake", 7, 25)); objects.Add(Item(name + "-notes", "slacker.awake", 12, -40)); }
            r["objects"] = objects; r["movables"] = new JArray(); r["zones"] = new JArray(); r["playTraces"] = new JArray(); rooms.Add(r);
        }
        c["rooms"] = rooms;
        var edges = new JArray();
        void Edge(string id, string from, string exit, string to, string entry) => edges.Add(new JObject { { "id", id }, { "from", new JObject { { "roomId", from }, { "exitId", from + "-" + exit } } }, { "to", new JObject { { "roomId", to }, { "entryId", to + "-" + entry } } }, { "velocity", "reset" } });
        Edge("ab", "a", "next", "b", "left"); Edge("ba", "b", "back", "a", "right"); Edge("bc", "b", "next", "c", "left"); Edge("cb", "c", "back", "b", "right");
        c["connections"] = edges; p["courses"] = new JArray(c); return p;
    }
    static NativeMotion Load(JObject raw = null) => new NativeMotion(NativeProjectLoader.LoadBytes(Encoding.UTF8.GetBytes((raw ?? Fixture()).ToString()), "json", new ImportOptions { Profile = ImportProfile.CustomDdl13Preserve }), rules: NativeGameplayRules.DemoPhysics);
    static void Tick(NativeMotion g, double seconds) { for (int f = 0; f < Math.Ceiling(seconds / NativeMotion.Step); f++) g.Tick(NativeMotion.Step); }
    static void Walk(NativeMotion g, double tile, bool stopAtPrompt = false, bool cancelOnWay = false)
    {
        for (int f = 0; f < 1600; f++)
        {
            if (g.AwaitingSaveChoice) { if (stopAtPrompt) return; if (cancelOnWay) g.ResolveCheckpointChoice(false); else throw new Exception("unexpected flag prompt while walking to " + tile); }
            double dx = (tile + .5) * 32 - (g.Player.x + g.Player.w / 2);
            if (Math.Abs(dx) < 2) return;
            g.Tick(NativeMotion.Step, new MotionInput { right = dx > 0, left = dx < 0 });
        }
        throw new Exception("walk timed out: " + g.Room.Id + ", mode=" + g.Mode + ", x=" + g.Player.x / 32 + ", target=" + tile);
    }
    static void Contact(NativeMotion g) { Walk(g, 8, stopAtPrompt: true); if (!g.AwaitingSaveChoice) throw new Exception("normal input did not contact flag"); }
    static void Use(NativeMotion g, bool coffee)
    {
        Walk(g, coffee ? 6.9 : 12, cancelOnWay: true);
        var id = g.Room.Id + (coffee ? "-coffee" : "-notes");
        if (g.NearbyInteraction?.Id != id) throw new Exception("item not advertised for E: " + id + " got " + g.NearbyInteraction?.Id);
        g.Tick(NativeMotion.Step, new MotionInput { interactPressed = true });
        if (!g.ObjectStates[id].used) throw new Exception("normal E did not spend " + id);
    }
    static NativeSaveSlotFiles Slots(NativeMotion g, string sub = "main") => new NativeSaveSlotFiles(Path.Combine(diskRoot, sub), g.Project.SourceSha256);
    static JObject Commit(NativeMotion g, NativeSaveSlotFiles files, int number)
    {
        var candidate = g.PrepareCheckpointSave();
        files.Write(number, candidate, g.Course.Name, g.Course.Kind, g.Room.Name, g.CampaignCollected);
        g.ResolveCheckpointChoice(true); return candidate;
    }
    static int EventCount(NativeMotion g, string type) => g.Events.Count(e => (string)e["type"] == type);
    static NativeAutoSaveRequest[] Drain(NativeMotion g){var list=new System.Collections.Generic.List<NativeAutoSaveRequest>();while(g.TryDequeueAutoSave(out var q))list.Add(q);return list.ToArray();}
    static void Cross(NativeMotion g,bool right=true){string room=g.Room.Id;for(int i=0;i<1800&&g.Room.Id==room&&!g.Completed;i++)g.Tick(NativeMotion.Step,new MotionInput{right=right,left=!right});if(g.Room.Id==room&&!g.Completed)throw new Exception("door did not cross "+room);}
    static NativeMotion Restore(NativeMotion source,JObject saved){var g=NativeMotion.FromContinuation(source.Project,saved,NativeGameplayRules.DemoPhysics);g.TogglePause();Tick(g,1.1);return g;}
    static void Main()
    {
        diskRoot=Path.Combine(Output,"disk",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"));Directory.CreateDirectory(diskRoot);
        foreach(string kind in new[]{"physics","calculus","slacker"})Run(kind+" interaction doors",()=>{
            var raw=Fixture(kind);raw["courses"][0]["rooms"][1]["entries"][0]["x"]=0;
            var g=Load(raw);Check(g.IsContactAutosave&&(!g.IsAuthoredPhysics||!g.IsRework&&!g.IsCampaign),kind+" correct isolated profile");
            Walk(g,8);Check(g.Checkpoint.id=="a-save"&&!g.AwaitingSaveChoice&&g.Mode=="playing"&&Drain(g).Single().Reason=="checkpoint",kind+" flag contact still saves silently");
            g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(g.AwaitingSaveChoice,kind+" E at flag still opens six-slot choice");
            var cp=g.PrepareCheckpointSave();var slots=Slots(g,kind);for(int n=1;n<=6;n++)slots.Write(n,cp,g.Course.Name,kind,g.Room.Name,0);
            g.ResolveCheckpointChoice(false);Check(Enumerable.Range(1,6).All(n=>slots.Read(n).Readable)&&g.Checkpoint.id=="a-save"&&g.Mode=="playing",kind+" six manual slots and cancel preserve automatic anchor");
            Walk(g,29.5);Tick(g,1);Check(g.Room.Id=="a"&&g.PendingAutoSaveCount==0&&g.NearbyExit?.Id=="a-next",kind+" touching or standing in door stays put and exposes nearby door");
            g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(g.Room.Id=="b"&&!g.AwaitingSaveChoice&&g.Mode=="playing",kind+" normal E inside door enters without save UI");
            var request=Drain(g).Single();Check(request.Reason=="room-entry"&&(string)request.Continuation["room"]=="b"&&g.SafePosition((double)request.Continuation["checkpoint"]["x"],(double)request.Continuation["checkpoint"]["y"]),kind+" E transition captures safe target-room autosave");
            Tick(g,1.2);Check(g.Room.Id=="b"&&g.PendingAutoSaveCount==0,kind+" releasing E at overlapping return door never bounces");
            var loaded=Restore(g,request.Continuation);Check(loaded.Room.Id=="b"&&loaded.PendingAutoSaveCount==0,kind+" loaded doorway stays silent without E");
            g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(g.Room.Id=="a",kind+" deliberate second E returns without walking 2.5 tiles away");
            loaded.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(loaded.Room.Id=="a",kind+" loaded doorway also accepts deliberate E immediately after cooldown");
        });
        foreach(string kind in new[]{"physics","calculus","slacker"})Run(kind+" airborne rectangle E",()=>{
            var raw=Fixture(kind);raw["courses"][0]["rooms"][0]["exits"][1]["x"]=7;raw["courses"][0]["rooms"][0]["objects"]=new JArray();
            var g=Load(raw);Walk(g,5.5);g.Tick(NativeMotion.Step,new MotionInput{right=true,jumpPressed=true});
            var door=g.Room.Exits.Single(e=>e.Id=="a-next");int frames=0;
            while(!MotionRect.Overlap(g.Player.Rect,new MotionRect(null,door.X*32,door.Y*32,door.W*32,door.H*32))&&frames++<90)g.Tick(NativeMotion.Step,new MotionInput{right=true});
            Check(g.Room.Id=="a"&&!g.Player.grounded,kind+" airborne rectangle overlap alone never enters");
            g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(g.Room.Id=="b"&&Drain(g).Single().Reason=="room-entry",kind+" airborne E enters using original rectangle contact");
        });
        Run("resource anchor and terminal save unchanged",()=>{
            var g=Load();Use(g,true);Walk(g,29.5);Drain(g);g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});var door=Drain(g).Single();
            Check(g.Room.Id=="b"&&g.ResourceAnchorRoom=="b"&&(string)door.Continuation["resourceAnchor"]["room"]=="b","E door commits water resources to target entry");
            Use(g,false);g.Retry();Check(g.Room.Id=="b"&&g.Awareness==75&&!g.ObjectStates["b-notes"].used,"door retry restores resource value and one-use item state");
            g.LoadRoom("c");Walk(g,29.5);Drain(g);Tick(g,1);Check(!g.Completed,"last door also waits for E");
            g.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});var finish=Drain(g).Single();Check(g.Completed&&finish.Reason=="completion","last E preserves pre-completion safe snapshot");
            var resume=Restore(g,finish.Continuation);Check(!resume.Completed&&resume.PendingAutoSaveCount==0,"terminal restore does not complete or save without E");
            resume.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(resume.Completed,"deliberate terminal E can complete again without leaving door");
        });
        Run("legacy profiles unchanged",()=>{
            var raw=Fixture("calculus");((JObject)raw["nativeCampaign"]).Remove("saveMode");raw["courses"][0]["rooms"][0]["objects"]=new JArray();var network=Load(raw);
            Walk(network,29.5);Check(network.Room.Id=="a"&&!network.IsContactAutosave,"legacy network still waits for interaction");network.Tick(NativeMotion.Step,new MotionInput{interactPressed=true});Check(network.Room.Id=="b"&&network.PendingAutoSaveCount==0,"legacy network E still crosses without new auto history");
            var oldPhysics=Fixture("physics");((JObject)oldPhysics["nativeCampaign"]).Remove("saveMode");oldPhysics["courses"][0]["rooms"][0]["objects"]=new JArray();var original=Load(oldPhysics);Cross(original);
            Check(original.Room.Id=="b"&&original.PendingAutoSaveCount==0,"legacy physics retains original contact transition");
        });
        Run("automatic history retention unchanged",()=>{
            var g=Load();Walk(g,8);var q=Drain(g).Single();var files=new NativeAutoSaveFiles(diskRoot,g.Project.SourceSha256);for(int n=0;n<5;n++)files.Write(q);
            var h=files.Read();Check(h.Readable&&h.Generation==5&&h.Entries.Count==3,"latest three automatic records remain atomic history");
            byte[] bytes=File.ReadAllBytes(files.HistoryPath);bool rejected;using(var hold=new FileStream(files.HistoryPath,FileMode.Open,FileAccess.Read,FileShare.Read))rejected=Throws(()=>files.Write(q));
            Check(rejected&&bytes.SequenceEqual(File.ReadAllBytes(files.HistoryPath)),"failed atomic history replacement leaves all previous records intact");
        });
        File.WriteAllText(Path.Combine(Output,"results.json"),new JObject{{"checks",checks},{"failures",failures},{"results",Results}}.ToString());
        Console.WriteLine("INTERACT_DOORS_CORE checks="+checks+" failures="+failures);Environment.ExitCode=failures==0?0:1;
    }
}
