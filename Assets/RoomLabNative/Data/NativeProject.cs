using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public enum ImportProfile { EditorAuto, CustomDdl13Preserve }
    public sealed class ImportOptions
    {
        public ImportProfile Profile = ImportProfile.EditorAuto;
        public string AssetRoot;
        public bool RequireAssets;
    }
    public sealed class NativeDataException : Exception { public NativeDataException(string message) : base(message) { } }
    public sealed class NativeProject
    {
        internal byte[] sourceBytes;
        public byte[] SourceBytes { get { return (byte[])sourceBytes.Clone(); } }
        public string SourceSha256 { get; internal set; }
        public string SourcePath { get; internal set; }
        public string SourceKind { get; internal set; }
        public ImportProfile Profile { get; internal set; }
        public JObject OriginalJson { get; internal set; }
        public JObject NormalizedJson { get; internal set; }
        public string Id, Name;
        public readonly List<NativeCourse> Courses = new List<NativeCourse>();
        public readonly List<NativeAsset> Assets = new List<NativeAsset>();
        public readonly Dictionary<string, double> Performance = new Dictionary<string, double>(StringComparer.Ordinal);
        public bool AssetsResolved { get; internal set; }
        public bool DataValid { get { return true; } }
        public bool GraphicsReady { get { return false; } }
        public int TileSize = 32;
        public NativeRoom FindRoom(string id) { foreach (var c in Courses) foreach (var r in c.Rooms) if (r.Id == id) return r; return null; }
        public int RoomCount { get { int n=0; foreach(var c in Courses)n+=c.Rooms.Count;return n; } }
        public int ObjectCount { get { int n=0; foreach(var c in Courses)foreach(var r in c.Rooms)n+=r.Objects.Count;return n; } }
        public int TileCount { get { int n=0; foreach(var c in Courses)foreach(var r in c.Rooms)n+=r.Tiles.Count;return n; } }
        public int ConnectionCount { get { int n=0; foreach(var c in Courses)n+=c.Connections.Count;return n; } }
    }
    public sealed class NativeCourse
    {
        public string Id, Name, Kind, AiId;
        public JObject Raw, ArtBindings;
        public readonly List<NativeRoom> Rooms=new List<NativeRoom>();
        public readonly List<NativeConnection> Connections=new List<NativeConnection>();
    }
    public sealed class NativeRoom
    {
        public string Id, Name, Environment, Phase, AiPolicy, AiId;
        public int Cols, Rows;
        public JObject Raw, ArtBindings;
        public string CameraMode; public double CameraCols, CameraRows;
        public readonly List<NativeTile> Tiles=new List<NativeTile>();
        public readonly List<NativeObject> Objects=new List<NativeObject>();
        public readonly List<NativeRegion> Entries=new List<NativeRegion>(), Exits=new List<NativeRegion>(), Zones=new List<NativeRegion>(), Movables=new List<NativeRegion>();
    }
    public sealed class NativeTile { public int X,Y; public bool Collision; public JObject Raw; }
    public class NativeRegion
    {
        public string Id, Name; public int X,Y,W=1,H=1; public JObject Raw;
    }
    public sealed class NativeObject : NativeRegion
    {
        public string Type, SourceType, ColliderShape, AiId, ResetPolicy;
        public bool Collision;
        public JObject Parameters, Trigger, AssetOverrides;
        public double Number(string key, double fallback=0) { JToken v=Parameters[key];return v==null?fallback:v.Value<double>(); }
        public bool Flag(string key, bool fallback=false) { JToken v=Parameters[key];return v==null?fallback:v.Value<bool>(); }
        public string Text(string key, string fallback="") { JToken v=Parameters[key];return v==null?fallback:v.Value<string>(); }
    }
    public sealed class NativeConnection
    {
        public string Id, FromRoomId, ExitId, ToRoomId, EntryId, Velocity; public JObject Raw;
    }
    public sealed class NativeAsset
    {
        public string Id, Path, Mime; public JObject Raw; public byte[] Bytes;
        public double Width,Height,FrameWidth,FrameHeight,Fps;
    }
    public sealed class NativeDataSession
    {
        public NativeProject Current { get; private set; }
        public NativeProject LoadFile(string path, ImportOptions options=null) { var candidate=NativeProjectLoader.LoadFile(path,options);Current=candidate;return candidate; }
        public NativeProject LoadBytes(byte[] bytes,string kind,ImportOptions options=null) { var candidate=NativeProjectLoader.LoadBytes(bytes,kind,options);Current=candidate;return candidate; }
    }
    public static class NativeCoordinates
    {
        public const double PixelsPerTile=32;
        public static double UnityX(double editorPixels) { return editorPixels/32; }
        public static double UnityY(double editorPixels,int roomRows) { return roomRows-editorPixels/32; }
        public static double EditorX(double unityX) { return unityX*32; }
        public static double EditorY(double unityY,int roomRows) { return (roomRows-unityY)*32; }
    }
}
