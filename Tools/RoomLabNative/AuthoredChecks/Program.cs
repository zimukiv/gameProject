using System;
using System.IO;
using System.Linq;
using RoomLab.Native;
class Program
{
    // Green control: the built-in authored level must be exactly the bytes the user selected.
    // Red control (--old-baseline): the previous built-in bytes must be detected as different.
    const string AuthoredSha="03b948a705210aafd718306a70947e90b41f7d1fa013a53a4087091d51809836";
    const string PreviousSha="8049354e56a9ddd841ce08b2aaa40930dc056744e2ce792e8179ad4c455aa776";
    static int count;static void Check(bool ok,string message){count++;if(!ok)throw new Exception(message);}
    static void Main(string[] args)
    {
        bool old=args.Contains("--old-baseline");
        string expected=null;
        foreach(var a in args)if(a.StartsWith("--expect-sha=",StringComparison.Ordinal))expected=a.Substring("--expect-sha=".Length);
        if(string.IsNullOrEmpty(expected))expected=old?PreviousSha:AuthoredSha;
        string file=old?"Assets/StreamingAssets/RoomLabNative/latest-physics.json":"Assets/StreamingAssets/RoomLabNative/AuthoredPhysics/authored-physics.json";
        var project=NativeProjectLoader.LoadFile(file,new ImportOptions{Profile=ImportProfile.EditorAuto,RequireAssets=true});
        Check(project.SourceSha256==expected,old?"AUTHORED_RED: old built-in bytes should differ from the rebased level":"AUTHORED_GREEN: built-in bytes differ from the user's selected file");
        int tests=NativeAuthoredIceChecks.Run(project);
        Console.WriteLine("AUTHORED_ICE_PASS checks="+(tests+count)+" source="+project.SourceSha256+" rooms="+project.RoomCount+" assets="+project.Assets.Count);
    }
}
