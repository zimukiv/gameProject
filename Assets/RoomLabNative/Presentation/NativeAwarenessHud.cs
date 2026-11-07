using UnityEngine;
using UnityEngine.UI;

namespace RoomLab.Native
{
    public sealed partial class NativePhysicsDemoPlayer
    {
        NativeAwarenessGraphic awarenessHud;
        Text awarenessValue;

        void BuildAwarenessHud(Transform root)
        {
            awarenessHud = null;
            awarenessValue = null;
            if (Game == null || !Game.IsAwarenessResource) return;
            var panel = NativeUiKit.New(root, "Awareness resource");
            panel.anchorMin = panel.anchorMax = new Vector2(1, 1);
            panel.pivot = new Vector2(1, 1);
            panel.anchoredPosition = new Vector2(-54, -7);
            panel.sizeDelta = new Vector2(180, 26);
            var image = panel.gameObject.AddComponent<Image>();
            image.color = new Color(.04f, .07f, .11f, .98f);
            image.raycastTarget = false;
            NativeUiKit.MarkBackdrop(panel.gameObject);
            awarenessHud = NativeUiKit.New(panel, "Awareness marks").gameObject.AddComponent<NativeAwarenessGraphic>();
            awarenessHud.raycastTarget = false;
            NativeUiKit.MarkBackdrop(awarenessHud.gameObject);
            var label = NativeUiKit.AbsLabel(panel, 1, 5, 31, 18, "清醒度", 10, Paper, TextAnchor.MiddleLeft);
            if (NoteFont != null) label.font = NoteFont;
            awarenessValue = NativeUiKit.AbsLabel(panel, 153, 5, 26, 18, "", 11, Paper, TextAnchor.MiddleRight);
            TickAwarenessHud();
        }

        void TickAwarenessHud()
        {
            if (awarenessHud == null || Game == null) return;
            if (!Game.IsAwarenessResource)
            {
                awarenessHud.transform.parent.gameObject.SetActive(false);
                return;
            }
            awarenessHud.SetValue((float)Game.Awareness,
                Game.PendingAwareness.HasValue ? (float?)Game.PendingAwareness.Value : null);
            if (awarenessValue != null) awarenessValue.text = Mathf.FloorToInt((float)Game.Awareness).ToString();
        }
    }

    // The three marks live outside the bar. Shape and brightness identify the active band even
    // without colour perception; the hollow marker previews a queued, not-yet-applied change.
    public sealed class NativeAwarenessGraphic : MaskableGraphic
    {
        float value = -1;
        float? pending;
        static readonly Color Dream = new Color(.62f, .57f, .81f);
        static readonly Color Haze = new Color(.83f, .73f, .52f);
        static readonly Color Awake = new Color(.31f, .82f, .77f);
        static readonly Color White = new Color(.9f, .91f, .83f);
        const float Left = 37, Length = 112, Top = 18, BarHeight = 5;

        public void SetValue(float next, float? waiting)
        {
            next = Mathf.Clamp(next, 0, 100);
            if (waiting.HasValue) waiting = Mathf.Clamp(waiting.Value, 0, 100);
            if (Mathf.Approximately(value, next) && pending == waiting) return;
            value = next;
            pending = waiting;
            SetVerticesDirty();
        }

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            float current = Mathf.Clamp(value, 0, 100);
            Band(vh, 0, 35, Dream, current);
            Band(vh, 35, 65, Haze, current);
            Band(vh, 65, 100, Awake, current);
            foreach (float threshold in new[] { 0f, 35f, 65f, 100f })
            {
                float x = Left + Length * threshold / 100;
                Stroke(vh, new Vector2(x, Top - 1), new Vector2(x, Top + BarHeight + 1), .8f,
                    new Color(White.r, White.g, White.b, .5f));
            }

            int active = current < 35 ? 0 : current < 65 ? 1 : 2;
            for (int band = 0; band < 3; band++)
            {
                float fraction = band == 0 ? .175f : band == 1 ? .5f : .825f;
                Vector2 center = new Vector2(Left + Length * fraction, 8);
                Color color = band == 0 ? Dream : band == 1 ? Haze : Awake;
                color.a = band == active ? 1 : .27f;
                if (band == 0) Moon(vh, center, color);
                else Eye(vh, center, band == 1, color);
                if (band == active) Stroke(vh, center + new Vector2(-4, 7), center + new Vector2(4, 7), 1.2f, color);
            }

            float at = Left + Length * current / 100;
            Stroke(vh, new Vector2(at, Top - 1), new Vector2(at, Top + BarHeight + 1), 1.6f, White);
            if (pending.HasValue)
            {
                float ghost = Left + Length * pending.Value / 100;
                Color faint = new Color(White.r, White.g, White.b, .68f);
                Vector2 tip = new Vector2(ghost, Top + BarHeight + .5f);
                Stroke(vh, new Vector2(ghost, Top), tip, 1, faint);
                // A hollow diamond, rather than a second solid fill, distinguishes the preview.
                Vector2 center = new Vector2(ghost, Top - 3);
                Vector2[] diamond = { center + new Vector2(0, -2), center + new Vector2(2, 0),
                    center + new Vector2(0, 2), center + new Vector2(-2, 0) };
                for (int i = 0; i < 4; i++) Stroke(vh, diamond[i], diamond[(i + 1) % 4], .8f, faint);
            }
        }

        void Band(VertexHelper vh, float from, float to, Color color, float current)
        {
            float x = Left + Length * from / 100, width = Length * (to - from) / 100;
            Quad(vh, x, Top, width - .7f, BarHeight, new Color(color.r, color.g, color.b, .18f));
            float fill = Length * Mathf.Max(0, Mathf.Min(to, current) - from) / 100;
            if (fill > .7f) Quad(vh, x, Top, fill - .7f, BarHeight, color);
        }

        void Moon(VertexHelper vh, Vector2 center, Color color)
        {
            Vector2[] shape = { new Vector2(-1,-5), new Vector2(-4,-3), new Vector2(-5,0),
                new Vector2(-4,3),new Vector2(-1,5),new Vector2(2,4),new Vector2(4,2),
                new Vector2(1,2),new Vector2(-1,0),new Vector2(-1,-2),new Vector2(0,-4) };
            for (int i = 0; i < shape.Length; i++) Stroke(vh, center + shape[i], center + shape[(i + 1) % shape.Length], 1.15f, color);
        }

        void Eye(VertexHelper vh, Vector2 center, bool half, Color color)
        {
            Vector2 previousTop = center + new Vector2(-6, 0);
            Vector2 previousBottom = previousTop;
            for (int i = 1; i <= 14; i++)
            {
                float t = i / 14f;
                float x = Mathf.Lerp(-6, 6, t), y = Mathf.Sin(t * Mathf.PI) * (half ? 2 : 3.5f);
                Vector2 top = center + new Vector2(x, -y), bottom = center + new Vector2(x, half ? 0 : y);
                Stroke(vh, previousTop, top, 1.1f, color); Stroke(vh, previousBottom, bottom, 1.1f, color);
                previousTop = top; previousBottom = bottom;
            }
            if (half) Stroke(vh, center + new Vector2(0, -1.8f), center, 1.8f, color);
            else
            {
                for (int i = 0; i < 10; i++)
                {
                    float a = i * Mathf.PI * 2 / 10, b = (i + 1) * Mathf.PI * 2 / 10;
                    Stroke(vh, center + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * 1.5f,
                        center + new Vector2(Mathf.Cos(b), Mathf.Sin(b)) * 1.5f, 1.1f, color);
                }
            }
        }

        void Quad(VertexHelper vh, float x, float y, float width, float height, Color color)
        {
            if (width <= 0 || height <= 0) return;
            int start = vh.currentVertCount;
            Vertex(vh, new Vector2(x, y), color); Vertex(vh, new Vector2(x + width, y), color);
            Vertex(vh, new Vector2(x + width, y + height), color); Vertex(vh, new Vector2(x, y + height), color);
            vh.AddTriangle(start, start + 1, start + 2); vh.AddTriangle(start, start + 2, start + 3);
        }
        void Stroke(VertexHelper vh, Vector2 from, Vector2 to, float thickness, Color color)
        {
            Vector2 delta = to - from;
            if (delta.sqrMagnitude < .001f) return;
            Vector2 offset = new Vector2(-delta.y, delta.x).normalized * thickness * .5f;
            int start = vh.currentVertCount;
            Vertex(vh, from - offset, color); Vertex(vh, from + offset, color);
            Vertex(vh, to + offset, color); Vertex(vh, to - offset, color);
            vh.AddTriangle(start, start + 1, start + 2); vh.AddTriangle(start, start + 2, start + 3);
        }
        void Vertex(VertexHelper vh, Vector2 point, Color color)
        {
            Rect rect = rectTransform.rect;
            vh.AddVert(new Vector3(rect.xMin + point.x, rect.yMax - point.y), color, Vector2.zero);
        }
    }
}
