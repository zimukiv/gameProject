using UnityEngine;

/// <summary>Runtime prototype signs, so existing hand-edited scenes need no rebuild.</summary>
public class MechanismGuideVisuals : MonoBehaviour
{
    private AirVentBlock vent;
    private RailgunBlock rail;
    private Material lineMaterial;
    private LineRenderer[] lines;
    private Transform sign;
    private const int GuideOrder = 5;
    private static Font guideFont;

    public static void AddAirVent(AirVentBlock owner)
    {
        var guide = owner.gameObject.AddComponent<MechanismGuideVisuals>();
        guide.vent = owner;
        guide.Build(3, new Color(.45f, .95f, 1f), owner.guideText, 2.6f);
    }

    public static void AddRailgun(RailgunBlock owner)
    {
        var guide = owner.gameObject.AddComponent<MechanismGuideVisuals>();
        guide.rail = owner;
        guide.Build(3, new Color(1f, .75f, .2f), "电磁弹射平台\n跳上平台，一起弹射 →\n空格 / W 跳离", 2.6f);
    }

    private void Build(int count, Color color, string label, float signHeight)
    {
        lineMaterial = new Material(Shader.Find("Sprites/Default"));
        lines = new LineRenderer[count];
        for (int i = 0; i < count; i++)
        {
            var child = new GameObject("Mechanism guide " + i);
            child.transform.SetParent(transform, false);
            var line = child.AddComponent<LineRenderer>();
            line.sharedMaterial = lineMaterial;
            line.useWorldSpace = true;
            line.startWidth = line.endWidth = .055f;
            line.startColor = line.endColor = color;
            line.sortingOrder = GuideOrder;
            lines[i] = line;
        }

        sign = CreateLabel(transform, label, transform.position + Vector3.up * signHeight, color).transform;
        Update();
    }

    public static TextMesh CreateLabel(Transform parent, string label, Vector3 position, Color color, float characterSize = .065f)
    {
        var signObject = new GameObject("Mechanism sign");
        var labelTransform = signObject.transform;
        labelTransform.SetParent(parent, false);
        // Parent blocks are scaled rectangles; keep lettering at a constant world size.
        Vector3 scale = parent.lossyScale;
        labelTransform.localScale = new Vector3(1f / scale.x, 1f / scale.y, 1f);
        labelTransform.position = position;
        var text = signObject.AddComponent<TextMesh>();
        text.text = label;
        if (guideFont == null)
            guideFont = Font.CreateDynamicFontFromOSFont(new[] {
                "Microsoft YaHei UI", "Microsoft YaHei", "SimHei", "PingFang SC",
                "Noto Sans CJK SC", "Source Han Sans SC", "Arial"
            }, 40);
        text.font = guideFont != null ? guideFont : Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        text.fontSize = 40;
        text.characterSize = characterSize;
        text.anchor = TextAnchor.MiddleCenter;
        text.alignment = TextAlignment.Center;
        text.color = color;
        var renderer = signObject.GetComponent<MeshRenderer>();
        renderer.sharedMaterial = text.font.material;
        renderer.sortingOrder = GuideOrder;
        return text;
    }

    private void Update()
    {
        if (lines == null) return;
        bool visible = vent != null ? vent.isActiveAndEnabled : rail != null && rail.isActiveAndEnabled;
        foreach (var line in lines) line.enabled = visible;
        sign.gameObject.SetActive(visible);
        if (!visible) return;

        if (vent != null)
        {
            Vector3 direction = ((Vector3)vent.ventDirection).normalized;
            if (direction.sqrMagnitude < .001f) direction = Vector3.up;
            Vector3 across = new Vector3(direction.y, -direction.x, 0f);
            for (int i = 0; i < lines.Length; i++)
            {
                float distance = .35f + Mathf.Repeat(Time.time * .9f + i * .55f, 1.65f);
                Arrow(lines[i], transform.position + direction * distance, direction, across, .18f);
            }
        }
        else
        {
            Vector3 start = rail.LaunchStartPosition;
            sign.position = start + Vector3.up * 2.6f;
            Vector3 end = rail.launchEndPoint != null ? rail.launchEndPoint.position
                : start + (Vector3)rail.launchDirection * 5f;
            Vector3 direction = (end - start).normalized;
            Vector3 across = new Vector3(-direction.y, direction.x, 0f);
            // Draw the actual route and a second rail, with a clear exit arrow.
            for (int i = 0; i < 2; i++)
            {
                Vector3 offset = across * (i == 0 ? .12f : -.12f);
                lines[i].positionCount = 2;
                lines[i].SetPosition(0, start + offset);
                lines[i].SetPosition(1, end + offset);
            }
            Vector3 exitDirection = ((Vector3)rail.launchDirection).normalized;
            Arrow(lines[2], end + exitDirection * .5f, exitDirection,
                new Vector3(-exitDirection.y, exitDirection.x, 0f), .28f);
        }
    }

    private static void Arrow(LineRenderer line, Vector3 tip, Vector3 direction, Vector3 across, float size)
    {
        line.positionCount = 3;
        line.SetPosition(0, tip - direction * size + across * size);
        line.SetPosition(1, tip);
        line.SetPosition(2, tip - direction * size - across * size);
    }

    private void OnDestroy()
    {
        if (lineMaterial != null) Destroy(lineMaterial);
    }
}
