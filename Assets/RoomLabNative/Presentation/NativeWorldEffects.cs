using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    // Stage 3 of the art import: dust puffs, jet flame/burst and the full-screen cold/heat
    // overlays. Everything is decorative — no gameplay state is touched.
    internal sealed class NativeWorldEffects
    {
        const int DustSlots = 10;
        readonly Transform root;
        readonly Func<string, Sprite> sprite;
        readonly Func<NativeMotion> game;
        readonly SpriteRenderer[] dust = new SpriteRenderer[DustSlots];
        readonly double[] dustAge = new double[DustSlots];
        readonly int[] dustKind = new int[DustSlots];   // 1 = jump, 2 = land
        SpriteRenderer flame, burstFlash;
        Image overlay;
        double flameTime, burstAge, overlayFade;
        string overlayKind = "";
        float overlayShown;
        JToken lastDustEvent;
        string dustRoom;
        static readonly int[] DustFrames = { 3, 4 };

        readonly Transform worldRoot;
        Transform Deck{get{return NativeUiKit.PageRoot != null ? NativeUiKit.PageRoot : worldRoot;}}
        public NativeWorldEffects(Transform root, Func<string, Sprite> sprite, Func<NativeMotion> game)
        {
            this.root = root; this.worldRoot = root; this.sprite = sprite; this.game = game;
        }

        SpriteRenderer Make(string name, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sortingOrder = order;
            sr.enabled = false;
            return sr;
        }

        void SpawnDust(int kind, double x, double y)
        {
            int slot = -1;
            for (int i = 0; i < DustSlots; i++) if (dustAge[i] <= 0) { slot = i; break; }
            if (slot < 0) slot = 0;
            if (dust[slot] == null) dust[slot] = Make("Dust" + slot, 6);   // Unity 的 == null 才会认得已销毁对象
            dustKind[slot] = kind;
            dustAge[slot] = kind == 1 ? 0.25 : 0.33;
            dust[slot].enabled = true;
            dust[slot].transform.position = new Vector3((float)x / 32f, (float)y / 32f, 0);
            dust[slot].transform.localScale = Vector3.one;
        }

        void TickDust(double dt)
        {
            for (int i = 0; i < DustSlots; i++)
            {
                if (dustAge[i] <= 0) continue;
                double life = dustKind[i] == 1 ? 0.25 : 0.33;
                dustAge[i] = Math.Max(0, dustAge[i] - dt);
                var sr = dust[i];
                if (sr == null) continue;
                int count = DustFrames[dustKind[i] - 1];
                int frame = Math.Min(count - 1, (int)((life - dustAge[i]) * 12));
                string prefix = dustKind[i] == 1 ? "fx-jumpdust" : "fx-landdust";
                sr.sprite = sprite(prefix + frame.ToString("00"));
                sr.enabled = dustAge[i] > 0;
            }
        }

        const double JetBurstDuration = 4.0 / 12;
        JToken lastJetEvent;
        string jetRoom, activeJetId;

        void PlaceJetEffect(SpriteRenderer renderer, NativeMotion g, NativeObject nozzle, string frame)
        {
            renderer.sprite = sprite(frame);
            var rect = g.ObjectRect(nozzle);
            string direction = nozzle.Text("direction", "up");
            float angle = direction == "down" ? 180 : direction == "left" ? 90 : direction == "right" ? -90 : 0;
            var rotation = Quaternion.Euler(0, 0, angle);
            var center = new Vector3((float)(rect.x + rect.w / 2) / 32,
                g.Room.Rows - (float)(rect.y + rect.h / 2) / 32, 0);
            // Nozzle art rotates around its center. The effect attaches to the
            // outward edge, with the authored bottom-center aligned at that edge.
            float nozzleOffset = (float)rect.h / 64;
            float pivotHeight = renderer.sprite.pivot.y / renderer.sprite.pixelsPerUnit;
            renderer.transform.SetPositionAndRotation(center + rotation * Vector3.up * (nozzleOffset + pivotHeight), rotation);
            renderer.enabled = true;
        }

        void TickJet(double dt)
        {
            var g = game();
            if (jetRoom != g.Room.Id)
            {
                jetRoom = g.Room.Id;
                activeJetId = null;
                burstAge = 0;
            }
            NativeObject activeJet = null, burstJet = null;
            JToken latestJetEvent = null;
            for (int i = g.Events.Count - 1; i >= 0; i--)
            {
                var item = g.Events[i];
                if ((string)item["type"] != "jet" || (string)item["room"] != jetRoom) continue;
                latestJetEvent = item;
                break;
            }
            foreach (var nozzle in g.Room.Objects)
            {
                if (nozzle.Type != "physics.jet" || !g.LayerActive(nozzle.Raw)) continue;
                if (g.VisualState(nozzle) == "active")
                {
                    activeJet ??= nozzle;
                    if (latestJetEvent != null && nozzle.Id == (string)latestJetEvent["id"])
                        activeJet = nozzle;
                }
                if (latestJetEvent != null && nozzle.Id == (string)latestJetEvent["id"])
                    burstJet = nozzle;
            }
            if (activeJet != null)
            {
                if (flame == null) flame = Make("JetFlame", 7);
                flameTime = activeJet.Id != activeJetId ? 0 : flameTime + dt;
                activeJetId = activeJet.Id;
                PlaceJetEffect(flame, g, activeJet, "fx-jetflame" + ((int)(flameTime * 12) % 4).ToString("00"));
            }
            else
            {
                activeJetId = null;
                if (flame != null) flame.enabled = false;
            }

            if (latestJetEvent != null && !ReferenceEquals(latestJetEvent, lastJetEvent))
            {
                lastJetEvent = latestJetEvent;
                burstAge = JetBurstDuration;
            }
            else burstAge = Math.Max(0, burstAge - dt);

            if (burstAge > 0 && burstJet != null)
            {
                if (burstFlash == null) burstFlash = Make("JetBurst", 8);
                int frame = Math.Min(3, (int)((JetBurstDuration - burstAge) * 12));
                PlaceJetEffect(burstFlash, g, burstJet, "fx-jetburst" + frame.ToString("00"));
            }
            else if (burstFlash != null) burstFlash.enabled = false;
        }

        // 温区：房间里有热/冷机关激活时铺一层全屏特效（关卡层之上、UI 之下）。
        void TickThermal(double dt)
        {
            var g = game();
            if (g.Mode != "playing")
            {
                // 暂停/主菜单/结算：淡出并隐藏冷热特效
                overlayFade = Math.Max(0, overlayFade - dt * 3);
                if (overlay != null) { overlay.enabled = overlayFade > 0; overlay.color = new Color(1, 1, 1, (float)overlayFade * .5f); }
                overlayKind = "";
                return;
            }
            string kind = "";
            foreach (var o in g.Room.Objects)
            {
                if (o.Type != "physics.thermal") continue;
                string state = g.VisualState(o);
                if (state == "hot") { kind = "heat"; break; }
                if (state == "cold") kind = "cold";
            }
            if (overlay == null)
            {
                overlay = NativeUiKit.AbsImage(Deck, "ThermalOverlay", 0f, 0f, 640f, 360f, new Color(1, 1, 1, 0f));
                overlay.raycastTarget = false;
                overlay.transform.SetAsLastSibling();
            }
            if (kind != overlayKind) { overlayKind = kind; overlayFade = 0; overlayShown = 0f; }
            overlayFade = Math.Min(1, overlayFade + (kind == "" ? -dt * 3 : dt * 2));
            if (overlayFade <= 0 && kind == "") { overlay.enabled = false; return; }
            overlay.enabled = true;
            overlay.color = new Color(1, 1, 1, (float)overlayFade * 0.5f);
            string prefix = kind == "heat" ? "fx-heat" : "fx-cold";
            if (kind != "") { overlayShown += (float)dt; int frameIndex = overlayShown < 1f ? (int)(overlayShown * 8) % 3 : 1; overlay.sprite = sprite(prefix + frameIndex.ToString("00")); } else overlayShown = 0f;
        }

        // 被甩开 5 格并持续 1 秒 → 播一次 knockback，冷却 30 秒。
        double leftBehind, knockbackCooldown, knockbackUntil;
        public bool KnockbackPlaying{get{return game() != null && game().Elapsed < knockbackUntil;}}
        void TickKnockback(double dt)
        {
            var g = game();
            if (g == null || !g.AI.active) { leftBehind = 0; return; }
            if (knockbackCooldown > 0) knockbackCooldown = Math.Max(0, knockbackCooldown - dt);
            double px = g.Player.x + g.Player.w / 2.0, py = g.Player.y + g.Player.h / 2.0;
            double ax = g.AI.x, ay = g.AI.y;
            double tiles = Math.Sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay)) / 32.0;
            if (tiles >= 5) leftBehind += dt; else leftBehind = 0;
            if (leftBehind >= 1.0 && knockbackCooldown <= 0)
            {
                knockbackUntil = g.Elapsed + 0.5;
                knockbackCooldown = 30;
                leftBehind = 0;
            }
        }
        // ---- 中景：素材预览工具 web 版风格（只在关内、世界层最底部、更小更疏、按行错开不重叠）----
        sealed class MidFormula { public Image image; public float row, speed, offset; }
        readonly List<MidFormula> midFormulas = new List<MidFormula>();
        // 页面切换时直接开/关这一容器，避免暂停时世界刷新停止导致公式残留
        public static Transform FormulaRoot;
        public static string masterPage;   // 当前页面：play 以外公式隐藏
        SpriteRenderer midBackdrop;
        Texture2D midTexture;
        Texture2D midCurveTexture;
        Color32[] midCurveBuffer;
        SpriteRenderer midCurveSprite;
        string midRoom;
        float midTime;
        float midCurveStamp;
        // 5 个公式，各占一行（row 互不相同 → 漂移时永远不会叠在一起）
        // 照抄 web 版 MID_FORMULAS（start / y / speed）+ 字号：一个砖块高（32）× 0.8~1.2
        static readonly string[] MidTexts = { "sin x", "\u222bf(x)dx", "x\u00b2+1=0", "\u220fn", "\u03c0", "\u222b?", "d/dx", "lim x" };
        static readonly float[] MidStarts = { .04f, .62f, .26f, .78f, .12f, .54f, .38f, .88f };
        static readonly float[] MidYs = { .18f, .30f, .45f, .57f, .68f, .78f, .24f, .86f };
        static readonly float[] MidSpeeds = { 24f, 18f, 22f, 20f, 16f, 26f, 20f, 30f };
        static readonly float[] MidOffsets = { .04f, .62f, .26f, .78f, .12f, .54f, .38f, .88f };
        static readonly float[] MidSizes = { 32f, 27f, 35f, 29f, 38f, 26f, 34f, 30f };
        static readonly Color[] MidColors = {
            new Color(.88f,.92f,.94f,.78f), new Color(.30f,.66f,.68f,.70f), new Color(.92f,.92f,.86f,.74f),
            new Color(.88f,.94f,.92f,.72f), new Color(.66f,.56f,.34f,.68f), new Color(.86f,.92f,.94f,.70f),
            new Color(.90f,.92f,.88f,.72f), new Color(.86f,.90f,.94f,.68f),
        };

        void TickMidGround(double dt)
        {
            var g = game();
            if (g == null) return;
            bool inLevel = g.Mode == "playing" || g.Mode == "paused";   // 关内（含暂停）都显示网格背景；主菜单/结算隐藏
            if (midBackdrop != null) midBackdrop.enabled = inLevel;
            if (midCurveSprite != null) midCurveSprite.enabled = inLevel;
            bool formulasVisible = g.Mode == "playing";   // 公式只在游玩中显示，暂停/菜单隐藏
            for (int i = 0; i < midFormulas.Count; i++) if (midFormulas[i].image != null) midFormulas[i].image.enabled = formulasVisible;
            if (!inLevel) return;
            if (midRoom != g.Room.Id) { midRoom = g.Room.Id; BuildMidGround(g); }
            if (g.Mode == "playing") midTime += (float)dt;
            // Update the raster at a fixed visual rate, with no uploads while paused.
            if (g.Mode == "playing" && midCurveSprite != null && midTime - midCurveStamp >= 1f / 30f)
            {
                midCurveStamp = midTime;
                PaintCurves(g.Room.Cols, g.Room.Rows, midTime);
            }
            float rows = g.Room.Rows, cols = g.Room.Cols;
            for (int i = 0; i < midFormulas.Count; i++)
            {
                var f = midFormulas[i];
                if (f.image == null) continue;
                float span = cols + 6f;
                float x = (f.offset * span + midTime * f.speed / 32f) % span - 3f;
                f.image.rectTransform.anchoredPosition = new Vector2(x, -(f.row * rows));
            }
        }

        // 世界层最底部：一张房间大小的深色网格底（sortingOrder -40，比地形砖还低）
        // 公式已烘焙进背景贴图（见 PaintCurves），这里不再创建 UI 画布
        void BuildMidFormulas() { FormulaRoot = null; }


        // 背景教程提示（由玩家每帧写入）：显示在中景纹理上
        public static string BackgroundHint;
        public static bool BackgroundHintTopRight;
        // ---- 3×5 像素字模 ----
        static readonly System.Collections.Generic.Dictionary<char,string[]> FontExtra =
            new System.Collections.Generic.Dictionary<char,string[]>
        {
            {'W',new[]{"#.#","#.#","#.#","#.#","###"}}, {'A',new[]{".#.","#.#","###","#.#","#.#"}},
            {'S',new[]{".##","#..",".##","..#","##."}}, {'D',new[]{"##.","#.#","#.#","#.#","##."}},
            {'M',new[]{"#.#","###","#.#","#.#","#.#"}}, {'O',new[]{".#.","#.#","#.#","#.#",".#."}},
            {'V',new[]{"#.#","#.#","#.#","#.#",".#."}}, {'E',new[]{"###","#..","##.","#..","###"}},
            {'H',new[]{"#.#","#.#","###","#.#","#.#"}}, {'I',new[]{"###",".#.",".#.",".#.","###"}},
            {'F',new[]{"###","#..","##.","#..","#.."}}, {'T',new[]{"###",".#.",".#.",".#.",".#."}},
            {'P',new[]{"##.","#.#","##.","#..","#.."}}, {'R',new[]{"##.","#.#","##.","#.#","#.#"}},
            {'C',new[]{".##","#..","#..","#..",".##"}}, {'K',new[]{"#.#","#.#","##.","#.#","#.#"}},
            {'N',new[]{"#.#","###","###","#.#","#.#"}}, {'G',new[]{".##","#..","#.#","#.#",".##"}},
        };
        // 找字形（主表 + 补充表）
        static string[] Glyph(char ch)
        {
            if (Font3x5.TryGetValue(ch, out var g)) return g;
            if (FontExtra.TryGetValue(ch, out var e)) return e;
            return null;
        }
        static readonly System.Collections.Generic.Dictionary<char,string[]> Font3x5 =
            new System.Collections.Generic.Dictionary<char,string[]>
        {
            {'s',new[]{".##","#..",".##","..#","##."}}, {'i',new[]{".#.","...",".#.",".#.",".#."}},
            {'n',new[]{"...","...","##.","#.#","#.#"}}, {'x',new[]{"...","...","#.#",".#.","#.#"}},
            {'I',new[]{"###",".#.",".#.",".#.","###"}}, {'t',new[]{".#.","###",".#.",".#.",".##"}},
            {'f',new[]{".##",".#.","###",".#.",".#."}}, {'(',new[]{".#.","#..","#..","#..",".#."}},
            {')',new[]{".#.","..#","..#","..#",".#."}}, {'d',new[]{"..#","..#",".##","#.#",".##"}},
            {'^',new[]{".#.","#.#","...","...","..."}}, {'2',new[]{"##.","..#",".#.","#..","###"}},
            {'+',new[]{"...",".#.","###",".#.","..."}}, {'1',new[]{".#.","##.",".#.",".#.","###"}},
            {'=',new[]{"...","###","...","###","..."}}, {'0',new[]{".#.","#.#","#.#","#.#",".#."}},
            {'S',new[]{".##","#..",".##","..#","##."}}, {'u',new[]{"...","#.#","#.#","#.#",".##"}},
            {'m',new[]{"...","###","#.#","#.#","#.#"}}, {'p',new[]{"...","##.","#.#","##.","#.."}},
            {'?',new[]{"##.","..#",".#.","...",".#."}}, {'/',new[]{"..#","..#",".#.","#..","#.."}},
            {'l',new[]{"#..","#..","#..","#..","##."}}, {' ' ,new[]{"...","...","...","...","..."}},
        };
        void PixelText(Color32[] px,int W,int H,string text,int x0,int y0,int scale,Color32 color)
        {
            int x = x0;
            foreach (char ch in text)
            {
                var rows = Glyph(ch);
                if (rows != null)
                {
                    for (int r = 0; r < rows.Length; r++)
                        for (int c = 0; c < 3; c++)
                            if (rows[r][c] == '#')
                                for (int sy = 0; sy < scale; sy++)
                                    for (int sx = 0; sx < scale; sx++)
                                    {
                                        int px2 = x + c * scale + sx, py = y0 - r * scale - sy;   // 行序翻转：纹理是底朝上
                                        if (px2 >= 0 && px2 < W && py >= 0 && py < H) px[py * W + px2] = color;
                                    }
                }
                x += 4 * scale;
            }
        }

        // 房间背景模块：深色网格 + 坐标轴 + 实线边框（排序 -8；曲线/公式也在同一张纹理上）
        void BuildMidGround(NativeMotion g)
        {
            ClearStaleMid();
            const int W = 640, H = 360;   // 2× 分辨率：网格/曲线/公式更精细
            if (midTexture == null) midTexture = new Texture2D(W, H, TextureFormat.RGBA32, false);
            var px = new Color32[W * H];
            var deep = new Color32(0, 0, 0, 0);   // 不透明：房间内用本模块，房间外露出 GPT 的底层背景
            var grid = new Color32(86, 105, 119, 25);
            var axis = new Color32(54, 82, 97, 87);
            var line = new Color32(120, 128, 140, 190);
            for (int i = 0; i < px.Length; i++) px[i] = deep;
            for (int x = 0; x < W; x += 32) for (int y = 0; y < H; y++) px[y * W + x] = grid;
            for (int y = 0; y < H; y += 32) for (int x = 0; x < W; x++) px[y * W + x] = grid;
            int ax = (int)(W * .55f), ay = H - 1 - (int)(H * .18f);
            for (int y = 0; y < H; y++) px[y * W + ax] = axis;
            for (int x = 0; x < W; x++) px[ay * W + x] = axis;
            midTexture.filterMode = FilterMode.Point;
            midTexture.SetPixels32(px);
            midTexture.Apply(false, false);
            var sprite = Sprite.Create(midTexture, new Rect(0, 0, W, H), new Vector2(.5f, .5f), 32f);
            midBackdrop = MakeSprite("Mid backdrop", sprite, -8);
            midBackdrop.transform.position = new Vector3(g.Room.Cols * .5f, g.Room.Rows * .5f, 0f);
            midBackdrop.transform.localScale = new Vector3(g.Room.Cols * 32f / W, g.Room.Rows * 32f / H, 1f);

            midCurveStamp = midTime;
            PaintCurves(g.Room.Cols, g.Room.Rows, midTime);
        }

        static int midPaintTick;
        void PaintCurves(float cols, float rows, float time)
        {
            if ((midPaintTick++ % 3) != 0) return;
            float density = 640f / Mathf.Max(1, Mathf.Max(cols, rows));
            int W = Mathf.Max(1, Mathf.RoundToInt(cols * density));
            int H = Mathf.Max(1, Mathf.RoundToInt(rows * density));
            if (midCurveTexture == null || midCurveTexture.width != W || midCurveTexture.height != H)
            {
                if (midCurveTexture != null) UnityEngine.Object.Destroy(midCurveTexture);
                midCurveTexture = new Texture2D(W, H, TextureFormat.RGBA32, false);
                midCurveBuffer = new Color32[W * H];
            }
            var cpx = midCurveBuffer;
            Array.Clear(cpx, 0, cpx.Length);
            var colors = new[] { new Color32(42, 103, 109, 155), new Color32(137, 101, 44, 132), new Color32(146, 69, 56, 104) };
            float t = time * .35f;

            for (int c = 0; c < 3; c++)
            {
                int thickness = 3 - c, previousY = 0;
                for (int x = 0; x < W; x++)
                {
                    float u = x / (float)(W - 1);
                    float y;
                    if (c == 0) y = H * .62f - (float)Math.Sin(u * Math.PI * 2.0 + t) * H * .12f;
                    else if (c == 1) y = H * .40f - (float)Math.Cos(u * Math.PI * 1.6 + t * .8f) * H * .11f;
                    else y = H * .80f - (float)Math.Sin(u * Math.PI * 1.2 - t * .6f) * H * .08f;
                    int py = H - 1 - (int)y;
                    // 与前一列连线，避免陡坡处出现断点
                    if (x > 0)
                    {
                        int prev = previousY;
                        int from = Math.Min(prev, py), to = Math.Max(prev, py);
                        for (int q = from; q <= to; q++)
                            for (int k = 0; k < thickness; k++)
                            {
                                int qq = q + k;
                                if (qq >= 0 && qq < H) cpx[qq * W + x] = colors[c];
                            }
                    }
                    else
                    {
                        for (int k = 0; k < thickness; k++)
                        {
                            int q = py + k;
                            if (q >= 0 && q < H) cpx[q * W + x] = colors[c];
                        }
                    }
                    previousY = py;
                }
            }
            // ------- 公式：与曲线同一条纹理（同层、同淡度），只在游玩时绘制 -------
            if (cols > 0)
            {
                var texts = new[] { "sin x", "Int f(x)dx", "x^2+1=0", "Sum n", "pi", "Int?", "d/dx", "lim x" };
                var rowsY = new[] { .18f, .30f, .45f, .57f, .68f, .78f, .24f, .86f };
                var speeds = new[] { 24f, 18f, 22f, 20f, 16f, 26f, 20f, 30f };
                var starts = new[] { .04f, .62f, .26f, .78f, .12f, .54f, .38f, .88f };
                var tone = new Color32(49, 66, 87, 150);
                for (int i = 0; i < texts.Length; i++)
                {
                    int glyphScale = Mathf.Clamp(Mathf.RoundToInt(density * .14f), 1, 4);
                    float margin = texts[i].Length * 4f * glyphScale * cols * 32f / W + 8f;
                    float span = cols * 32f + margin * 2f;
                    float px = (starts[i] * span + time * speeds[i]) % span - margin;   // 设计像素
                    int x = (int)(px / (cols * 32f) * W);
                    int y = H - 1 - (int)(rowsY[i] * H);
                    PixelText(cpx, W, H, texts[i], x, y, glyphScale, tone);   // 字模 3×（配合 2× 纹理）
                }
            }
            // ------- 背景教程提示：人在下方→右上角；人在上方→左下角 -------
            if (false && !string.IsNullOrEmpty(BackgroundHint) && game() != null && game().Mode == "playing")
            {
                var hintTone = new Color32(232, 226, 200, 210);
                string[] lines = BackgroundHint.Split('|');
                int scale = 4, lineH = 5 * scale + 6;
                for (int i = 0; i < lines.Length; i++)
                {
                    int w = lines[i].Length * 4 * scale;
                    int x = BackgroundHintTopRight ? Math.Max(4, W - 8 - w) : 8;
                    int y = BackgroundHintTopRight ? H - 12 - i * lineH : 12 + (lines.Length - 1 - i) * lineH;
                    PixelText(cpx, W, H, lines[i], x, y, scale, hintTone);
                }
            }
            midCurveTexture.filterMode = FilterMode.Point;
            midCurveTexture.SetPixels32(cpx);
            midCurveTexture.Apply(false, false);
            if (midCurveSprite == null)
                midCurveSprite = MakeSprite("Mid curves", Sprite.Create(midCurveTexture, new Rect(0, 0, W, H), new Vector2(.5f, .5f), 32f, 0, SpriteMeshType.FullRect), -7);
            // 每次都按当前关卡尺寸重新缩放与居中（换房后尺寸不同也能正确贴合）
            midCurveSprite.transform.localScale = new Vector3(cols * 32f / W, rows * 32f / H, 1f);
            midCurveSprite.transform.position = new Vector3(cols * .5f, rows * .5f, 0f);
            midCurveSprite.enabled = true;
        }
        SpriteRenderer[] outerMask = new SpriteRenderer[4];
        void BuildOuterMask(float cols, float rows)
        {
            var dark = new Color(0f, 0f, 0f, 1f);
            float cx = cols * .5f, cy = rows * .5f;
            var rects = new[]
            {
                new[]{ -60f, cy, 120f, rows + 240f },   // 左
                new[]{ cols + 60f, cy, 120f, rows + 240f },   // 右
                new[]{ cx, rows + 60f, cols + 240f, 120f },   // 上
                new[]{ cx, -60f, cols + 240f, 120f },   // 下
            };
            for (int i = 0; i < 4; i++)
            {
                if (outerMask[i] == null)
                {
                    outerMask[i] = MakeSprite("Outer mask " + i, Pixel1x1(), -6);
                    outerMask[i].color = dark;
                }
                var sr = outerMask[i];
                sr.enabled = true;
                sr.transform.position = new Vector3(rects[i][0], rects[i][1], 0f);
                sr.transform.localScale = new Vector3(rects[i][2], rects[i][3], 1f);
            }
        }
        Sprite cachedPixel;
        Sprite Pixel1x1()
        {
            if (cachedPixel != null) return cachedPixel;
            var tex = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            tex.SetPixels32(new[] { new Color32(255, 255, 255, 255) });
            tex.Apply(false, false);
            cachedPixel = Sprite.Create(tex, new Rect(0, 0, 1, 1), new Vector2(.5f, .5f), 1f);
            return cachedPixel;
        }
        SpriteRenderer MakeSprite(string name, Sprite sprite, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.sortingOrder = order;
            return sr;
        }

        void ClearStaleMid()
        {
            // 前一个世界实例留在页面画布上的中景对象也要清掉（否则会出现多份重影）
            Sweep(Deck);
            Sweep(worldRoot);
            midFormulas.Clear(); midBackdrop = null; midCurveSprite = null;
        }
        static void Sweep(Transform parent)
        {
            if (parent == null) return;
            var doomed = new System.Collections.Generic.List<GameObject>();
            for (int i = 0; i < parent.childCount; i++)
            {
                var child = parent.GetChild(i).gameObject;
                if (child.name.StartsWith("Mid formula") || child.name.StartsWith("Mid curves") || child.name.StartsWith("Mid backdrop"))
                    doomed.Add(child);
            }
            foreach (var go in doomed) UnityEngine.Object.Destroy(go);
        }

        // 大 token：未拾取时脚下打一圈金色光影；已拾取过（5 秒后复活的回充 token）不带光。
        readonly System.Collections.Generic.Dictionary<string, SpriteRenderer> tokenGlows =
            new System.Collections.Generic.Dictionary<string, SpriteRenderer>();
        void TickTokenGlow(double dt)
        {
            var g = game();
            if (g == null) return;
            foreach (var o in g.Room.Objects)
            {
                if (o.Type != "common.coin") continue;
                SpriteRenderer glow;
                if (!tokenGlows.TryGetValue(o.Id, out glow) || glow == null)
                {
                    glow = Make("Token glow " + o.Id, 5);
                    tokenGlows[o.Id] = glow;
                }
                bool chargeOnly = g.Credited.Contains(g.Room.Id + "/" + o.Id);
                glow.sprite = sprite("fx-token-glow");
                glow.enabled = !chargeOnly;
                if (chargeOnly) continue;
                float pulse = .72f + .28f * (float)Math.Sin(g.Elapsed * 4.0);
                glow.color = new Color(1f, .96f, .78f, pulse * .85f);
                glow.transform.position = new Vector3((float)(o.X + o.W / 2.0), (float)(g.Room.Rows - o.Y - o.H / 2.0), 0);
                glow.transform.localScale = Vector3.one * (1.5f + .25f * pulse);
            }
        }
        public void Tick(double dt)
        {
            if (game() == null) return;
            TickKnockback(dt);
            TickTokenGlow(dt);
            TickMidGround(dt);
            TickDust(dt);
            TickJet(dt);
            TickThermal(dt);
        }

        // Jump and land events are definitive even when several simulation ticks
        // run in one render frame. Convert authored pixels to world units once.
        public void TrackPlayer()
        {
            var g=game();
            if(g==null)return;
            if(dustRoom!=g.Room.Id){
                dustRoom=g.Room.Id;
                for(int slot=0;slot<DustSlots;slot++){
                    dustAge[slot]=0;
                    if(dust[slot]!=null)dust[slot].enabled=false;
                }
            }
            if(g.Events.Count==0||ReferenceEquals(lastDustEvent,g.Events[g.Events.Count-1]))return;
            int start=lastDustEvent==null?0:g.Events.IndexOf((JObject)lastDustEvent)+1;
            for(int i=start;i<g.Events.Count;i++){
                var evt=g.Events[i];
                string kind=(string)evt["type"];
                if((kind!="jump"&&kind!="land")||(string)evt["room"]!=dustRoom)continue;
                double x=(double?)evt["feetX"]??(g.Player.x+g.Player.w/2);
                double y=(double?)evt["feetY"]??(g.Player.y+g.Player.h);
                SpawnDust(kind=="jump"?1:2,x,g.Room.Rows*32-y+8);
            }
            lastDustEvent=g.Events[g.Events.Count-1];
        }
    }
}
