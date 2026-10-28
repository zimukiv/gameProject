using System;
using System.IO;
using RoomLab.Native;
class Program
{
    static void Main(string[] args)
    {
        foreach (var path in args)
        {
            if (path == "--ice") continue;
            Console.WriteLine("== " + path);
            NativeProject p = null;
            try
            {
                p = NativeProjectLoader.LoadFile(path, new ImportOptions { Profile = ImportProfile.EditorAuto, RequireAssets = true });
                Console.WriteLine("OK name=" + p.Name + " rooms=" + p.RoomCount + " assets=" + p.Assets.Count + " sha=" + p.SourceSha256);
                foreach (var c in p.Courses) foreach (var r in c.Rooms) if (!NativeMotion.SupportsRoom(r, out var reason)) Console.WriteLine("UNSUPPORTED " + reason);
            }
            catch (Exception e) { Console.WriteLine("FAIL " + e.GetType().Name + ": " + e.Message); continue; }
            if (Array.IndexOf(args, "--smoke") >= 0 && p != null) { try { int n = NativeGameplaySmokeChecks.Run(p); Console.WriteLine("SMOKE_PASS checks=" + n); } catch (Exception e) { Console.WriteLine("SMOKE_FAIL " + e.Message); } }
            if (Array.IndexOf(args, "--ice") >= 0 && p != null)
            {
                foreach (var rules in new[] { NativeGameplayRules.Editor255Compat, NativeGameplayRules.DemoPhysics })
                {
                    try { int n = NativeAuthoredIceChecks.Run(p); Console.WriteLine("ICE_RULES_PASS checks=" + n + " rules=" + rules); break; }
                    catch (Exception e) { Console.WriteLine("ICE_RULES_FAIL " + e.Message); }
                }
            }
        }
    }
}