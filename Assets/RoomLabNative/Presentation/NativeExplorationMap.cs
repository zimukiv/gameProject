using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        // Stored with the other display preferences by NativePhysicsDemoPlayer.
        bool courseMapPreferred = true;

        void OpenExplorationMap()
        {
            if (Game == null) return;
            map = !courseMapPreferred || !Game.IsNetwork;
            Show("exploration-map");
        }

        void CloseExplorationMap(bool resume)
        {
            map = false;
            Show(resume && !Game.Completed ? "play" : Game.Completed ? "won" : "pause");
        }

        void MapSettings(Transform parent)
        {
            var row = NativeUiKit.Row(parent, "Map preference", 26, 8);
            NativeUiKit.Size(NativeUiKit.Label(row, "地图", 12, Paper, TextAnchor.MiddleLeft), 58, 26);
            NativeUiKit.Button(row, "当前全景", () => SetMapPreference(false, false), 12, 26,
                courseMapPreferred ? NativeUiKit.SlotIdle : Teal);
            NativeUiKit.Button(row, "沿途总图", () => SetMapPreference(true, false), 12, 26,
                courseMapPreferred ? Teal : NativeUiKit.SlotIdle);
        }

        void SetMapPreference(bool course, bool inMap)
        {
            courseMapPreferred = course;
            SaveSettings();
            if (inMap) OpenExplorationMap();
            else Show("settings");
        }

        void BuildExplorationMap(Transform root)
        {
            if (Game == null) return;
            bool explored = courseMapPreferred && Game.IsNetwork;
            bool paper = Game.Course.Kind == "calculus";
            map = !explored;
            float width = designWidth, height = designHeight;
            Color bar = new Color(Ink.r, Ink.g, Ink.b, .97f);

            // Deliberately leave the central panorama transparent. The page camera component
            // fits the complete room inside this opening after the world's normal refresh.
            NativeUiKit.MarkBackdrop(NativeUiKit.AbsImage(root, "Map header", 0, 0, width, 74, bar).gameObject);
            NativeUiKit.MarkBackdrop(NativeUiKit.AbsImage(root, "Map footer", 0, height - 43, width, 43, bar).gameObject);
            var title = NativeUiKit.AbsLabel(root, 18, 12, width - 248, 23,
                explored ? paper ? "纸上来路" : Game.Course.Kind == "slacker" ? "课后留影" : "沿途记录" : MapRoomName(Game.Room),
                17, Paper, TextAnchor.MiddleLeft);
            if (NoteFont != null) title.font = NoteFont;
            title.text = MapCaption(title.text, title, width - 250);
            MapButton(root, width - 222, 11, 98, 28, "当前全景", () => SetMapPreference(false, true), !explored);
            var total = MapButton(root, width - 116, 11, 98, 28, "沿途总图", () => SetMapPreference(true, true), explored);
            total.interactable = Game.IsNetwork;
            var location = NativeUiKit.AbsLabel(root, 18, 45, width - 36, 18,
                Game.IsGuided && Game.IsAwarenessResource
                    ? MapRoomName(Game.Room) + "    本房剩余：" + MapResourceCount(Game.Room.Id)
                    : explored ? MapRoomName(Game.Room) : "当前场景", 11, Teal, TextAnchor.MiddleLeft);
            location.text = MapCaption(location.text, location, width - 38);

            Rect opening = new Rect(16, 82, width - 32, height - 133);
            if (explored) BuildCourseMap(root, opening, paper);
            else
            {
                var frame = root.gameObject.AddComponent<NativeMapPanoramaFrame>();
                frame.Configure(view, Game.Room.Cols, Game.Room.Rows,
                    width, height - HudBand, opening, height);
            }

            NativeUiKit.AbsLabel(root, 18, height - 34, width - 252, 22,
                Game.IsGuided ? Game.Course.Kind == "slacker" ? "数量为剩余道具 · 小旗是存档点" : "亮框是你的位置 · 小旗是存档点"
                    : explored ? "亮框 · 此处    旗记 · 存档" : "暂驻片刻", 11, Paper, TextAnchor.MiddleLeft);
            MapButton(root, width - 222, height - 35, 98, 27, "返回暂停", () => CloseExplorationMap(false), false);
            MapButton(root, width - 116, height - 35, 98, 27,
                Game.Completed ? "返回结算" : "继续游戏", () => CloseExplorationMap(true), true);
        }

        Button MapButton(Transform root, float x, float y, float width, float height,
            string caption, Action action, bool selected)
        {
            var button = NativeUiKit.Button(root, caption, action, 12, height,
                selected ? Teal : NativeUiKit.SlotIdle, width, 0);
            var rect = (RectTransform)button.transform;
            rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
            rect.pivot = new Vector2(0, 1);
            rect.anchoredPosition = new Vector2(x, -y);
            rect.sizeDelta = new Vector2(width, height);
            return button;
        }

        void BuildCourseMap(Transform root, Rect opening, bool paper)
        {
            Color background = paper ? new Color(.84f, .83f, .74f) : new Color(.045f, .075f, .105f);
            Color line = paper ? new Color(.20f, .34f, .35f) : new Color(.35f, .66f, .66f);
            Color textColor = paper ? Ink : Paper;
            var panel = NativeUiKit.Abs(root, "Explored course map", opening.x, opening.y, opening.width, opening.height);
            NativeUiKit.Box(panel, "Map surface", background, false, true);
            var graphic = NativeUiKit.New(panel, "Trace strokes").gameObject.AddComponent<NativeCourseGraphGraphic>();
            graphic.raycastTarget = false;
            NativeUiKit.MarkBackdrop(graphic.gameObject);
            bool resourceCounts = Game.IsGuided && Game.IsAwarenessResource;
            var points = MapRoomPoints(Game.Course, opening.width, opening.height, resourceCounts);
            var visible = new Dictionary<string, NativeMapNode>();
            var nodes = new List<NativeMapNode>();
            for (int i = 0; i < Game.Course.Rooms.Count; i++)
            {
                var room = Game.Course.Rooms[i];
                if (!Game.VisitedRooms.Contains(room.Id) && room.Id != Game.Room.Id) continue;
                var node = new NativeMapNode
                {
                    Point = points[i], Current = room.Id == Game.Room.Id,
                    Checkpoint = room.Id == Game.ResourceAnchorRoom,
                    Index = i, HasResourceCaption = resourceCounts
                };
                nodes.Add(node);
                visible[room.Id] = node;
            }
            var edges = new List<NativeMapEdge>();
            var pairs = new Dictionary<string, NativeMapEdge>();
            foreach (var edge in Game.Course.Connections)
            {
                if (!Game.TraversedConnections.Contains(edge.Id)) continue;
                NativeMapNode from, to;
                if (!visible.TryGetValue(edge.FromRoomId, out from) || !visible.TryGetValue(edge.ToRoomId, out to)) continue;
                if ((from.Point - to.Point).sqrMagnitude < 1) continue;
                // Only observed directions contribute arrows. A known return journey adds the
                // opposite arrow to the same stroke rather than drawing a second parallel edge.
                bool forward = from.Index < to.Index;
                int first = Mathf.Min(from.Index, to.Index), second = Mathf.Max(from.Index, to.Index);
                string pair = first + "/" + second;
                NativeMapEdge trace;
                if (!pairs.TryGetValue(pair, out trace))
                {
                    trace = new NativeMapEdge { From = forward ? from.Point : to.Point, To = forward ? to.Point : from.Point };
                    pairs.Add(pair, trace);
                    edges.Add(trace);
                }
                if (forward) trace.ArrowAtTo = true;
                else trace.ArrowAtFrom = true;
            }
            graphic.Configure(nodes, edges, Game.Course.Kind, line, paper ? Ink : Teal, Orange);

            // Reserve label space using the entire authored graph, not just discovered nodes.
            // This keeps both geometry and captions stable as exploration grows.
            for (int i = 0; i < Game.Course.Rooms.Count; i++)
            {
                var room = Game.Course.Rooms[i];
                NativeMapNode node;
                if (!visible.TryGetValue(room.Id, out node)) continue;
                float labelWidth = resourceCounts ? 102 : 88;
                for (int j = 0; j < points.Count; j++)
                {
                    if (i == j || Mathf.Abs(points[i].y - points[j].y) >= (resourceCounts ? 52 : 36)) continue;
                    labelWidth = Mathf.Min(labelWidth, Mathf.Abs(points[i].x - points[j].x) - 8);
                }
                labelWidth = Mathf.Clamp(labelWidth, resourceCounts ? 70 : 30, resourceCounts ? 102 : 88);
                // A small theme-coloured backing keeps curved routes from cutting through names.
                float captionX=Mathf.Clamp(node.Point.x-labelWidth/2,2,opening.width-labelWidth-2);
                var captionBacking=NativeUiKit.AbsImage(panel,"Map caption paper",captionX-2,node.Point.y+13,labelWidth+4,resourceCounts?38:18,background);
                NativeUiKit.MarkBackdrop(captionBacking.gameObject);captionBacking.raycastTarget=false;
                var label = NativeUiKit.AbsLabel(panel,
                    captionX,
                    node.Point.y + 13, labelWidth, 18, "", 10, textColor, TextAnchor.UpperCenter);
                if (NoteFont != null) label.font = NoteFont;
                label.horizontalOverflow = HorizontalWrapMode.Overflow;
                label.verticalOverflow = VerticalWrapMode.Truncate;
                label.text = MapCaption(MapRoomName(room), label, labelWidth - 2);
                if (resourceCounts)
                {
                    // Counts are created only after the visited-room filter above. Reading a
                    // cached room never instantiates it and never refreshes its consumables.
                    int coffee = Game.RemainingAwarenessItems(room.Id, true);
                    int notes = Game.RemainingAwarenessItems(room.Id, false);
                    Color stockColor = coffee + notes > 0 ? new Color(.61f,.83f,.76f) : new Color(.43f,.52f,.54f);
                    // The room name occupies y+13 through y+31. Keep a three-pixel
                    // gap before the independent resource line, including its text rect.
                    var stock = NativeUiKit.AbsLabel(panel, captionX, node.Point.y + 34,
                        labelWidth, 17, "咖啡 " + coffee + " · 讲义 " + notes, 9, stockColor, TextAnchor.UpperCenter);
                    stock.gameObject.name = "Remaining supplies " + room.Id;
                    if (NoteFont != null) stock.font = NoteFont;
                    stock.horizontalOverflow = HorizontalWrapMode.Overflow;
                    stock.verticalOverflow = VerticalWrapMode.Truncate;
                }
            }
        }

        string MapResourceCount(string roomId)
        {
            return "咖啡 " + Game.RemainingAwarenessItems(roomId, true) + " · 讲义 " + Game.RemainingAwarenessItems(roomId, false);
        }

        static string MapRoomName(NativeRoom room)
        {
            string name = room.Name ?? "未命名房间";
            int divider = name.IndexOf('·');
            return divider < 0 ? name.Trim() : name.Substring(divider + 1).Trim();
        }

        static string MapCaption(string name, Text label, float maxWidth)
        {
            label.text = name;
            if (label.preferredWidth <= maxWidth) return name;
            while (name.Length > 1)
            {
                name = name.Substring(0, name.Length - 1);
                label.text = name + "…";
                if (label.preferredWidth <= maxWidth) return label.text;
            }
            return name;
        }

        static List<Vector2> MapRoomPoints(NativeCourse course, float width, float height, bool resourceCaptions = false)
        {
            var raw = new List<Vector2>();
            int columns = Mathf.Max(1, Mathf.CeilToInt(Mathf.Sqrt(course.Rooms.Count * 2f)));
            bool fallback = false;
            var occupied = new HashSet<Vector2>();
            for (int i = 0; i < course.Rooms.Count; i++)
            {
                var graph = course.Rooms[i].Raw?["graph"] as JObject;
                float x, y;
                if (!MapCoordinate(graph?["x"], out x) || !MapCoordinate(graph?["y"], out y))
                { fallback = true; break; }
                var point = new Vector2(x, y);
                if (!occupied.Add(point)) { fallback = true; break; }
                raw.Add(point);
            }
            // Legacy imports without usable graph metadata still get a deterministic atlas.
            if (fallback)
            {
                raw.Clear();
                for (int i = 0; i < course.Rooms.Count; i++) raw.Add(new Vector2(i % columns, i / columns));
            }
            if (raw.Count == 0) return raw;
            float minX = raw[0].x, maxX = minX, minY = raw[0].y, maxY = minY;
            foreach (var p in raw)
            {
                minX = Mathf.Min(minX, p.x); maxX = Mathf.Max(maxX, p.x);
                minY = Mathf.Min(minY, p.y); maxY = Mathf.Max(maxY, p.y);
            }
            float insetX = Mathf.Min(resourceCaptions ? 61 : 55, width * .15f), top = 30, bottom = resourceCaptions ? 62 : 44;
            var result = new List<Vector2>();
            foreach (var p in raw)
                result.Add(new Vector2(maxX == minX ? width / 2 : Mathf.Lerp(insetX, width - insetX, (p.x - minX) / (maxX - minX)),
                    maxY == minY ? (height - bottom + top) / 2 : Mathf.Lerp(top, height - bottom, (p.y - minY) / (maxY - minY))));
            return result;
        }

        static bool MapCoordinate(JToken token, out float coordinate)
        {
            coordinate = 0;
            if (token == null || token.Type != JTokenType.Integer && token.Type != JTokenType.Float) return false;
            double value;
            try { value = token.Value<double>(); }
            catch { return false; }
            if (double.IsNaN(value) || double.IsInfinity(value) || Math.Abs(value) > 100000000) return false;
            coordinate = (float)value;
            return true;
        }
    }

    // Presentation-only camera fit; destroyed with the map page. The world refresh restores the
    // ordinary camera on the next game frame. No player position, simulation state or zoom setting
    // is changed, and repeated LateUpdate calls calculate a fresh fit rather than multiplying it.
    public sealed class NativeMapPanoramaFrame : MonoBehaviour
    {
        Camera cameraView;
        float cols, rows, worldWidth, worldHeight, pageHeight;
        Rect opening;
        public void Configure(Camera camera, float roomCols, float roomRows,
            float width, float height, Rect viewport, float fullHeight)
        {
            cameraView = camera; cols = roomCols; rows = roomRows;
            worldWidth = width; worldHeight = height; opening = viewport; pageHeight = fullHeight;
            LateUpdate();
        }
        void LateUpdate()
        {
            if (cameraView == null || opening.width <= 0 || opening.height <= 0) return;
            float aspect = Mathf.Max(.25f, cameraView.aspect);
            float halfHeight = Mathf.Max(rows * worldHeight / opening.height, cols * worldWidth / opening.width / aspect) * .52f;
            cameraView.orthographicSize = halfHeight;
            float centerX = opening.center.x / worldWidth - .5f;
            float centerY = (pageHeight - opening.center.y) / worldHeight - .5f;
            cameraView.transform.position = new Vector3(cols / 2 - centerX * halfHeight * aspect * 2,
                rows / 2 - centerY * halfHeight * 2, -10);
        }
    }

    public sealed class NativeMapNode
    {
        public Vector2 Point;
        public bool Current, Checkpoint, HasResourceCaption;
        public int Index;
    }
    public sealed class NativeMapEdge
    {
        public Vector2 From, To;
        public bool ArrowAtFrom, ArrowAtTo;
    }

    // Geometry is generated from the visible model only: no undiscovered room or edge is kept in
    // this component, including disabled objects or hidden captions that could expose the route.
    public sealed class NativeCourseGraphGraphic : MaskableGraphic
    {
        readonly List<NativeMapNode> nodes = new List<NativeMapNode>();
        readonly List<NativeMapEdge> edges = new List<NativeMapEdge>();
        string theme;
        Color path, mark, current;
        public void Configure(List<NativeMapNode> visibleNodes, List<NativeMapEdge> travelledEdges,
            string kind, Color pathColor, Color markerColor, Color currentColor)
        {
            nodes.Clear(); nodes.AddRange(visibleNodes);
            edges.Clear(); edges.AddRange(travelledEdges);
            theme = kind; path = pathColor; mark = markerColor; current = currentColor;
            SetVerticesDirty();
        }
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            float w = rectTransform.rect.width, h = rectTransform.rect.height;
            Color grid = new Color(path.r, path.g, path.b, .10f);
            if (theme == "calculus")
            {
                for (float x = 16; x < w; x += 24) Stroke(vh, new Vector2(x, 7), new Vector2(x, h - 7), .6f, grid);
                for (float y = 12; y < h; y += 24) Stroke(vh, new Vector2(7, y), new Vector2(w - 7, y), .6f, grid);
            }
            else
            {
                for (float y = 13; y < h; y += 18) Stroke(vh, new Vector2(8, y), new Vector2(w - 8, y), .55f, grid);
            }
            foreach (var edge in edges) DrawEdge(vh, edge);
            foreach (var node in nodes) DrawNode(vh, node);
        }

        void DrawEdge(VertexHelper vh, NativeMapEdge edge)
        {
            Vector2 delta = edge.To - edge.From, direction = delta.normalized;
            Vector2 side = new Vector2(-direction.y, direction.x);
            Vector2 start = edge.From + direction * 13, end = edge.To - direction * 13;
            List<Vector2> points;
            if (TryNodeDetour(edge, out points))
            {
                if (theme == "slacker") points = RoundDetour(points);
            }
            else if (theme == "slacker")
            {
                points = new List<Vector2> { start };
                Vector2 control = (start + end) / 2 + side * Mathf.Min(24, delta.magnitude * .13f);
                for (int i = 1; i <= 20; i++)
                {
                    float t = i / 20f, u = 1 - t;
                    points.Add(u * u * start + 2 * u * t * control + t * t * end);
                }
            }
            else
            {
                points = new List<Vector2> { start };
                if (Mathf.Abs(delta.x) > 22 && Mathf.Abs(delta.y) > 22)
                {
                    float bendX = Mathf.Lerp(start.x, end.x, .5f);
                    points.Add(new Vector2(bendX, start.y));
                    points.Add(new Vector2(bendX, end.y));
                }
                points.Add(end);
            }
            for (int i = 1; i < points.Count; i++) Stroke(vh, points[i - 1], points[i], 1.35f, path);
            if (edge.ArrowAtTo) Arrow(vh, points[points.Count - 1], points[points.Count - 2]);
            if (edge.ArrowAtFrom) Arrow(vh, points[0], points[1]);
        }

        void Arrow(VertexHelper vh, Vector2 tip, Vector2 previous)
        {
            Vector2 heading = (tip - previous).normalized;
            Vector2 wing = new Vector2(-heading.y, heading.x) * 2.8f;
            Triangle(vh, tip, tip - heading * 6 + wing, tip - heading * 6 - wing, path);
        }

        bool TryNodeDetour(NativeMapEdge edge, out List<Vector2> route)
        {
            route = null;
            Vector2 delta = edge.To - edge.From;
            bool vertical = Mathf.Abs(delta.x) < 6, horizontal = Mathf.Abs(delta.y) < 6;
            if (!vertical && !horizontal) return false;
            bool obstructed = false;
            foreach (var node in nodes)
            {
                if (node.Point == edge.From || node.Point == edge.To) continue;
                if (vertical && node.Point.y > Mathf.Min(edge.From.y, edge.To.y) + 14 &&
                    node.Point.y < Mathf.Max(edge.From.y, edge.To.y) - 14 && Mathf.Abs(node.Point.x - edge.From.x) < 48 ||
                    horizontal && node.Point.x > Mathf.Min(edge.From.x, edge.To.x) + 14 &&
                    node.Point.x < Mathf.Max(edge.From.x, edge.To.x) - 14 && Mathf.Abs(node.Point.y - edge.From.y) < 16)
                    obstructed = true;
            }
            if (!obstructed) return false;

            // Bypass the obstructing column's full caption width, or the row's icon/caption
            // height, with about 50 design pixels of extra space. If that lane meets another
            // visited node, try farther lanes and the opposite side within the map surface.
            float best = float.PositiveInfinity;
            for (int side = -1; side <= 1; side += 2)
            for (int step = 0; step < 5; step++)
            {
                var candidate = new List<Vector2>();
                if (vertical)
                {
                    float lane = Mathf.Clamp(edge.From.x + side * (98 + step * 18), 8, rectTransform.rect.width - 8);
                    candidate.Add(edge.From + new Vector2(side * 13, 0));
                    candidate.Add(new Vector2(lane, edge.From.y));
                    candidate.Add(new Vector2(lane, edge.To.y));
                    candidate.Add(edge.To + new Vector2(side * 13, 0));
                }
                else
                {
                    float sign = Mathf.Sign(delta.x), lead = Mathf.Min(56, Mathf.Abs(delta.x) * .22f);
                    float lane = Mathf.Clamp(edge.From.y + side * ((side < 0 ? 65 : 85) + step * 18), 8, rectTransform.rect.height - 8);
                    candidate.Add(edge.From + new Vector2(sign * 13, 0));
                    candidate.Add(edge.From + new Vector2(sign * lead, 0));
                    candidate.Add(new Vector2(edge.From.x + sign * lead, lane));
                    candidate.Add(new Vector2(edge.To.x - sign * lead, lane));
                    candidate.Add(edge.To - new Vector2(sign * lead, 0));
                    candidate.Add(edge.To - new Vector2(sign * 13, 0));
                }
                float score = RouteScore(candidate, edge);
                if (score < best) { best = score; route = candidate; }
            }
            return route != null;
        }

        float RouteScore(List<Vector2> points, NativeMapEdge edge)
        {
            float score = 0;
            for (int i = 1; i < points.Count; i++)
            {
                Vector2 a = points[i - 1], b = points[i];
                score += Vector2.Distance(a, b);
                foreach (var node in nodes)
                {
                    if (node.Point == edge.From || node.Point == edge.To) continue;
                    // Covers both the small icon and its short caption, with a little padding.
                    Rect block = new Rect(node.Point.x - (node.HasResourceCaption ? 55 : 48), node.Point.y - 15,
                        node.HasResourceCaption ? 110 : 96, node.HasResourceCaption ? 70 : 50);
                    bool meets = Mathf.Abs(a.x - b.x) < .1f ?
                        a.x >= block.xMin && a.x <= block.xMax && Mathf.Max(a.y, b.y) >= block.yMin && Mathf.Min(a.y, b.y) <= block.yMax :
                        a.y >= block.yMin && a.y <= block.yMax && Mathf.Max(a.x, b.x) >= block.xMin && Mathf.Min(a.x, b.x) <= block.xMax;
                    if (meets) score += 10000;
                }
            }
            return score;
        }

        static List<Vector2> RoundDetour(List<Vector2> corners)
        {
            var rounded = new List<Vector2> { corners[0] };
            for (int i = 1; i < corners.Count - 1; i++)
            {
                Vector2 corner = corners[i];
                float radius = Mathf.Min(7, Mathf.Min(Vector2.Distance(corners[i - 1], corner), Vector2.Distance(corner, corners[i + 1])) / 3);
                Vector2 before = corner + (corners[i - 1] - corner).normalized * radius;
                Vector2 after = corner + (corners[i + 1] - corner).normalized * radius;
                rounded.Add(before);
                for (int step = 1; step <= 5; step++)
                {
                    float t = step / 5f, u = 1 - t;
                    rounded.Add(u * u * before + 2 * u * t * corner + t * t * after);
                }
            }
            rounded.Add(corners[corners.Count - 1]);
            return rounded;
        }

        void DrawNode(VertexHelper vh, NativeMapNode node)
        {
            Vector2 p = node.Point;
            Color ink = node.Current ? current : mark;
            if (node.Current)
            {
                Vector2[] diamond = { p + new Vector2(0, -12), p + new Vector2(12, 0), p + new Vector2(0, 12), p + new Vector2(-12, 0) };
                for (int i = 0; i < 4; i++) Stroke(vh, diamond[i], diamond[(i + 1) % 4], 1.4f, current);
            }
            if (theme == "calculus")
            {
                Vector2 a = p + new Vector2(-6, -7), b = p + new Vector2(3, -7), c = p + new Vector2(7, -3), d = p + new Vector2(7, 7), e = p + new Vector2(-6, 7);
                Stroke(vh, a, b, 1.4f, ink); Stroke(vh, b, c, 1.4f, ink); Stroke(vh, c, d, 1.4f, ink);
                Stroke(vh, d, e, 1.4f, ink); Stroke(vh, e, a, 1.4f, ink);
                Stroke(vh, b, p + new Vector2(3, -3), 1, ink); Stroke(vh, p + new Vector2(3, -3), c, 1, ink);
                Stroke(vh, p + new Vector2(-3, 1), p + new Vector2(3, 1), 1, ink);
                Stroke(vh, p + new Vector2(-3, 4), p + new Vector2(1, 4), 1, ink);
            }
            else if (theme == "slacker")
            {
                BoxStroke(vh, p + new Vector2(-7, -5), 14, 10, 1.4f, ink);
                Stroke(vh, p + new Vector2(0, 5), p + new Vector2(0, 9), 1.1f, ink);
                Stroke(vh, p + new Vector2(-4, 9), p + new Vector2(4, 9), 1.1f, ink);
                Stroke(vh, p + new Vector2(-4, -2), p + new Vector2(2, -2), 1, ink);
                Stroke(vh, p + new Vector2(-4, 1), p + new Vector2(4, 1), 1, ink);
            }
            else
            {
                BoxStroke(vh, p + new Vector2(-6, -6), 12, 12, 1.4f, ink);
                Stroke(vh, p + new Vector2(-3, 0), p + new Vector2(3, 0), 1.2f, ink);
                Stroke(vh, p + new Vector2(0, -3), p + new Vector2(0, 3), 1.2f, ink);
            }
            if (node.Checkpoint)
            {
                Vector2 flag = p + new Vector2(13, -13);
                Stroke(vh, flag, flag + new Vector2(0, 10), 1.5f, ink);
                Triangle(vh, flag, flag + new Vector2(7, 2), flag + new Vector2(0, 5), ink);
            }
        }

        void BoxStroke(VertexHelper vh, Vector2 corner, float width, float height, float thickness, Color color)
        {
            Vector2 b = corner + new Vector2(width, 0), c = corner + new Vector2(width, height), d = corner + new Vector2(0, height);
            Stroke(vh, corner, b, thickness, color); Stroke(vh, b, c, thickness, color);
            Stroke(vh, c, d, thickness, color); Stroke(vh, d, corner, thickness, color);
        }
        void Stroke(VertexHelper vh, Vector2 from, Vector2 to, float thickness, Color color)
        {
            Vector2 d = to - from;
            if (d.sqrMagnitude < .001f) return;
            Vector2 n = new Vector2(-d.y, d.x).normalized * thickness * .5f;
            int start = vh.currentVertCount;
            Vertex(vh, from - n, color); Vertex(vh, from + n, color);
            Vertex(vh, to + n, color); Vertex(vh, to - n, color);
            vh.AddTriangle(start, start + 1, start + 2); vh.AddTriangle(start, start + 2, start + 3);
        }
        void Triangle(VertexHelper vh, Vector2 a, Vector2 b, Vector2 c, Color color)
        {
            int start = vh.currentVertCount;
            Vertex(vh, a, color); Vertex(vh, b, color); Vertex(vh, c, color);
            vh.AddTriangle(start, start + 1, start + 2);
        }
        void Vertex(VertexHelper vh, Vector2 point, Color color)
        {
            Rect r = rectTransform.rect;
            vh.AddVert(new Vector3(r.xMin + point.x, r.yMax - point.y), color, Vector2.zero);
        }
    }
}
