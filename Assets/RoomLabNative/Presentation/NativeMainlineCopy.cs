using System;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace RoomLab.Native
{
    // 独立文案接口：文案不写进关卡数据，而是放在构建目录旁边的一份 JSON 里，
    // 任何人都能直接编辑、重启游戏即生效（不需要重新打包）。
    //   <游戏目录>/RoomLabPhysics_Data/StreamingAssets/RoomLabNative/DisplayCopy/mainline-copy.json
    // 索引方式：藏品=对象 ID、道具=对象类型、AI=课程 ID（或课程 kind）。
    public static class NativeMainlineCopy
    {
        public const string RelativePath = "RoomLabNative/DisplayCopy/mainline-copy.json";
        static JObject catalog;
        static string loadedFrom;

        public static bool Loaded { get { return catalog != null && catalog.Count > 0; } }
        public static string Path { get { return loadedFrom; } }
        public static double ChaseInterval {
            get { var v = (double?)catalog?["aiChaseIntervalSeconds"] ?? 10.0; return v <= 0 ? 10.0 : v; }
        }
        public static int DeclaredTotal { get { return (int?)catalog?["collectibleTotal"] ?? 0; } }

        public static void Load(string streamingAssets)
        {
            catalog = null; loadedFrom = null;
            try
            {
                loadedFrom = System.IO.Path.Combine(streamingAssets, RelativePath);
                if (Application.platform==RuntimePlatform.WebGLPlayer) { catalog=JObject.Parse(Resources.Load<TextAsset>("mainline-webgl-copy").text); return; }
                if (!File.Exists(loadedFrom)) { Debug.LogWarning("MAINLINE_COPY_MISSING " + loadedFrom); catalog = new JObject(); return; }
                catalog = JObject.Parse(File.ReadAllText(loadedFrom));
                Debug.Log("MAINLINE_COPY_LOADED collectibles=" + (catalog["collectibles"] as JObject)?.Count +
                          " items=" + (catalog["items"] as JObject)?.Count +
                          " ai=" + (catalog["ai"] as JObject)?.Count +
                          " chase=" + ChaseInterval);
            }
            catch (Exception error)
            {
                Debug.LogWarning("MAINLINE_COPY_FALLBACK " + error.Message);
                catalog = new JObject();
            }
        }

        static string Text(JObject entry, string key)
        {
            return entry?[key]?.Type == JTokenType.String ? (string)entry[key] : null;
        }

        public static JObject CollectiblesRaw { get { return catalog?["collectibles"] as JObject; } }
        public static bool Collectible(string id, out string name, out string line)
        {
            name = null; line = null;
            var entry = catalog?["collectibles"]?[id] as JObject;
            if (entry == null) return false;
            name = Text(entry, "name"); line = Text(entry, "line");
            return true;
        }

        public static bool Item(string type, out string name, out string line)
        {
            name = null; line = null;
            var entry = catalog?["items"]?[type] as JObject;
            if (entry == null) return false;
            name = Text(entry, "name"); line = Text(entry, "line");
            return true;
        }

        public static string Ai(string courseId, string kind, string which)
        {
            var ai = catalog?["ai"] as JObject;
            if (ai == null) return null;
            var entry = (courseId != null ? ai[courseId] as JObject : null);
            if (entry == null && kind != null)
                foreach (var property in ai.Properties())
                    if ((string)property.Value?["kind"] == kind) { entry = property.Value as JObject; break; }
            return Text(entry, which);
        }
    }
}
