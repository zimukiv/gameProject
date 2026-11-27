using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace RoomLab.Native
{
    // 内置解算版图：只读关卡的「拼接方式 + 相对位移」，不做房间内部绘制。
    //   · 相对位移：房间 graph.x/y + 它原本所属大关的偏移（layout.courseOffsets）
    //   · 房间尺寸：cols × rows × CELL_SIZE(10.5)，与编辑器 graph-layout 同一套换算
    //   · 已发现房间：实心 + 描边；未发现房间不参与取景或绘制
    //   · 当前房间：青色填充、菱形标记；共享边只描一次
    public sealed partial class NativePhysicsDemoPlayer
    {
        const float PlateCell = 10.5f;
        // 版图纹理缓存：只在「发现集合 / 当前房间 / 目标尺寸」变化时重建，避免每帧重算。
        Texture2D plateTexture; string plateKey;

        sealed class PlateRoom
        {
            public NativeRoom Room;
            public Rect Rect;
        }

        Vector2 PlateOrigin(NativeRoom room, JObject offsets)
        {
            var graph = room.Raw?["graph"] as JObject;
            float x = graph?["x"]?.Value<float>() ?? 0f, y = graph?["y"]?.Value<float>() ?? 0f;
            var entry = offsets?[(string)room.Raw?["nativeCourse"]] as JObject;
            return new Vector2(x + (entry?["x"]?.Value<float>() ?? 0f), y + (entry?["y"]?.Value<float>() ?? 0f));
        }

        static void PaintOwner(int[] owners, int width, int height, RectInt rect, int id)
        {
            for (int y = Mathf.Max(0, rect.yMin); y < Mathf.Min(height, rect.yMax); y++)
            for (int x = Mathf.Max(0, rect.xMin); x < Mathf.Min(width, rect.xMax); x++)
                owners[y * width + x] = id;
        }

        // The editor uses 10.5 map units per tile. A linked pair can have
        // a one-tile gutter where its sides overlap. Close only that interval.
        static Rect JoinStrip(Rect a, Rect b, bool horizontal)
        {
            float gap = horizontal ? b.xMin - a.xMax : b.yMin - a.yMax;
            float start = horizontal ? Mathf.Max(a.yMin, b.yMin) : Mathf.Max(a.xMin, b.xMin);
            float end = horizontal ? Mathf.Min(a.yMax, b.yMax) : Mathf.Min(a.xMax, b.xMax);
            if (gap <= 0 || gap > PlateCell + .001f || end - start < PlateCell) return default;
            return horizontal ? new Rect(a.xMax, start, gap, end - start)
                              : new Rect(start, a.yMax, end - start, gap);
        }

        // 解算 + 绘制成纹理；返回的纹理带 uvRect 翻转交给调用方（Unity 纹理原点在左下）。
        Texture2D BuildWorldPlate(int maxWidth, int maxHeight)
        {
            if (Game == null) return null;
            bool paper = !Game.OwnsPhone;
            string key = Game.Project.SourceSha256 + ":" + Game.Course.Id + ":" + paper + ":" + Game.Room.Id
                + ":" + maxWidth + "x" + maxHeight + ":" + string.Join(",", Game.Course.Rooms
                    .FindAll(room => discoveredRooms.Contains(room.Id)).ConvertAll(room => room.Id));
            if (plateTexture != null && plateKey == key) return plateTexture;
            var offsets = Game.Project.OriginalJson?["layout"]?["courseOffsets"] as JObject;
            var rooms = new List<PlateRoom>();
            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            foreach (var room in Game.Course.Rooms)
            {
                if (!discoveredRooms.Contains(room.Id) && room.Id != Game.Room.Id) continue;
                var origin = PlateOrigin(room, offsets);
                var rect = new Rect(origin.x, origin.y, Mathf.Max(1, room.Cols) * PlateCell, Mathf.Max(1, room.Rows) * PlateCell);
                rooms.Add(new PlateRoom { Room = room, Rect = rect });
                minX = Mathf.Min(minX, rect.x); minY = Mathf.Min(minY, rect.y);
                maxX = Mathf.Max(maxX, rect.xMax); maxY = Mathf.Max(maxY, rect.yMax);
            }
            if (rooms.Count == 0) return null;
            float spanX = Mathf.Max(1f, maxX - minX), spanY = Mathf.Max(1f, maxY - minY);
            float scale = Mathf.Min(maxWidth / spanX, maxHeight / spanY);
            int width = Mathf.Clamp(Mathf.RoundToInt(spanX * scale), 16, 2048);
            int height = Mathf.Clamp(Mathf.RoundToInt(spanY * scale), 16, 2048);

            var pixels = new Color32[width * height];
            var owners = new int[pixels.Length];
            var ids = new Dictionary<string, int>();
            Color32 fill = paper ? new Color32(219, 202, 156, 255) : new Color32(29, 66, 77, 255);
            Color32 border = paper ? new Color32(119, 104, 71, 255) : new Color32(88, 159, 166, 255);
            Color32 seam = paper ? new Color32(168, 148, 107, 255) : new Color32(58, 109, 118, 255);
            Color32 activeFill = paper ? new Color32(87, 132, 120, 255) : new Color32(36, 115, 120, 255);
            Color32 active = paper ? new Color32(237, 219, 164, 255) : new Color32(163, 248, 234, 255);

            RectInt Project(Rect rect)
            {
                int x = Mathf.RoundToInt((rect.xMin - minX) * scale);
                int y = Mathf.RoundToInt((rect.yMin - minY) * scale);
                int right = Mathf.RoundToInt((rect.xMax - minX) * scale);
                int bottom = Mathf.RoundToInt((rect.yMax - minY) * scale);
                return new RectInt(x, y, Mathf.Max(1, right - x), Mathf.Max(1, bottom - y));
            }

            int currentId = 0;
            for (int i = 0; i < rooms.Count; i++)
            {
                ids.Add(rooms[i].Room.Id, i + 1);
                if (rooms[i].Room.Id == Game.Room.Id) currentId = i + 1;
            }

            foreach (var edge in Game.Course.Connections)
            {
                if (!ids.TryGetValue(edge.FromRoomId, out int first) ||
                    !ids.TryGetValue(edge.ToRoomId, out int second) || first == second) continue;
                for (int axis = 0; axis < 2; axis++)
                {
                    bool horizontal = axis == 0;
                    Rect a = rooms[first - 1].Rect, b = rooms[second - 1].Rect;
                    int owner = first;
                    if (horizontal ? a.xMin > b.xMin : a.yMin > b.yMin)
                    {
                        (a, b) = (b, a);
                        owner = second;
                    }
                    Rect strip = JoinStrip(a, b, horizontal);
                    if (strip.width <= 0 || strip.height <= 0) continue;
                    if (rooms.Exists(room => room.Rect.Overlaps(strip))) continue;
                    PaintOwner(owners, width, height, Project(strip), owner);
                }
            }

            for (int i = 0; i < rooms.Count; i++)
                if (i + 1 != currentId) PaintOwner(owners, width, height, Project(rooms[i].Rect), i + 1);
            if (currentId > 0) PaintOwner(owners, width, height, Project(rooms[currentId - 1].Rect), currentId);

            for (int y = 0; y < height; y++)
            for (int x = 0; x < width; x++)
            {
                int index = y * width + x;
                int id = owners[index];
                if (id == 0) continue;
                int west = x > 0 ? owners[index - 1] : 0;
                int east = x + 1 < width ? owners[index + 1] : 0;
                int north = y > 0 ? owners[index - width] : 0;
                int south = y + 1 < height ? owners[index + width] : 0;
                bool exterior = west == 0 || east == 0 || north == 0 || south == 0;
                // Each shared seam belongs to its left/top pixel only.
                bool shared = east != id || south != id;
                pixels[index] = exterior ? border : shared ? seam : id == currentId ? activeFill : fill;
            }

            if (currentId > 0)
            {
                var rect = Project(rooms[currentId - 1].Rect);
                int cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
                for (int dy = -4; dy <= 4; dy++)
                for (int dx = -4; dx <= 4; dx++)
                {
                    int x = cx + dx, y = cy + dy;
                    if (x < 0 || x >= width || y < 0 || y >= height || Mathf.Abs(dx) + Mathf.Abs(dy) > 4) continue;
                    int index = y * width + x;
                    if (owners[index] == currentId) pixels[index] = active;
                }
            }

            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point };
            texture.SetPixels32(pixels);
            texture.Apply();
            if (plateTexture != null) Destroy(plateTexture);
            plateTexture = texture; plateKey = key;
            return texture;
        }

        bool BuildWorldPlatePage(Transform root, Rect opening)
        {
            if (Game == null) return false;
            var texture = BuildWorldPlate(Mathf.RoundToInt(opening.width * 2f), Mathf.RoundToInt(opening.height * 2f));
            if (texture == null) return false;
            bool paper = !Game.OwnsPhone;
            Color desk = paper ? new Color(.81f, .75f, .58f) : new Color(.045f, .082f, .12f);
            Color sheet = paper ? new Color(.96f, .91f, .77f) : new Color(.026f, .06f, .08f);
            NativeUiKit.MarkBackdrop(NativeUiKit.AbsImage(root, "Map binding", 0, opening.y - 8f,
                designWidth, opening.height + 16f, desk).gameObject);
            NativeUiKit.MarkBackdrop(NativeUiKit.AbsImage(root, "Map sheet", opening.x - 6f, opening.y - 6f,
                opening.width + 12f, opening.height + 12f, sheet).gameObject);
            int seenRooms = Game.Course.Rooms.FindAll(room => discoveredRooms.Contains(room.Id) || room.Id == Game.Room.Id).Count;
            NativeUiKit.MarkBackdrop(NativeUiKit.AbsLabel(root, 20f, opening.y - 4f, 220f, 16f, "", 11, paper ? Ink : Paper,
                TextAnchor.MiddleLeft).gameObject);
            var go = NativeUiKit.New(root, "World plate").gameObject;
            var raw = go.AddComponent<RawImage>();
            raw.texture = texture;
            raw.color = Color.white;
            raw.raycastTarget = false;
            // Unity 纹理原点在左下，关卡数据是左上原点，翻转 uv 让版图正立。
            raw.uvRect = new Rect(0f, 1f, 1f, -1f);
            opening = new Rect(opening.x + 4f, opening.y + 13f, opening.width - 8f, opening.height - 17f);
            float fit = Mathf.Min(opening.width / texture.width, opening.height / texture.height);
            var rect = (RectTransform)go.transform;
            rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
            rect.pivot = new Vector2(0, 1);
            rect.sizeDelta = new Vector2(texture.width * fit, texture.height * fit);
            rect.anchoredPosition = new Vector2(opening.x + (opening.width - texture.width * fit) / 2f,
                -(opening.y + (opening.height - texture.height * fit) / 2f));
            NativeUiKit.MarkBackdrop(go);
            return true;
        }
    }
}
