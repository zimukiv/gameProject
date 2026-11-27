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
        JToken lastJetEvent, jetEventTail, latestRoomJetEvent;
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
                jetEventTail = latestRoomJetEvent = null;
                burstAge = 0;
            }
            NativeObject activeJet = null, burstJet = null;
            var tail = g.Events.Count > 0 ? g.Events[g.Events.Count - 1] : null;
            if (!ReferenceEquals(tail, jetEventTail))
            {
                jetEventTail = tail;
                latestRoomJetEvent = null;
                for (int i = g.Events.Count - 1; i >= 0; i--)
                {
                    var item = g.Events[i];
                    if ((string)item["type"] != "jet" || (string)item["room"] != jetRoom) continue;
                    latestRoomJetEvent = item;
                    break;
                }
            }
            var latestJetEvent = latestRoomJetEvent;
            string latestJetId = (string)latestJetEvent?["id"];
            foreach (var nozzle in g.Room.Objects)
            {
                if (nozzle.Type != "physics.jet" || !g.LayerActive(nozzle.Raw)) continue;
                if (g.VisualState(nozzle) == "active")
                {
                    activeJet ??= nozzle;
                    if (nozzle.Id == latestJetId)
                        activeJet = nozzle;
                }
                if (nozzle.Id == latestJetId)
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
        public static Transform FormulaRoot;
        public static string masterPage;
        SpriteRenderer midBackdrop;
        Transform midGroundRoot;
        public bool OwnsMidGround(Transform child) => child == midGroundRoot;

        public void DisposeMidGround()
        {
            if (midBackdrop != null)
            {
                UnityEngine.Object.Destroy(midBackdrop.sprite.texture);
                UnityEngine.Object.Destroy(midBackdrop.sprite);
            }
            foreach (var curve in midCurves) if (curve != null) UnityEngine.Object.Destroy(curve.sprite);
            foreach (var formula in midFormulas) if (formula != null) UnityEngine.Object.Destroy(formula.sprite);
            if (midAtlas != null) UnityEngine.Object.Destroy(midAtlas);
        }
        readonly SpriteRenderer[] midCurves = new SpriteRenderer[3];
        readonly SpriteRenderer[] midFormulas = new SpriteRenderer[4];
        const int MidAtlasWidth = 512;
        const int MidAtlasHeight = 176;
        const int CurveStripHeight = 48;
        Texture2D midAtlas;
        Color32[] midAtlasPixels;
        string midRoom;
        float midTime;

        void TickMidGround(double dt)
        {
            var g = game();
            if (g == null) return;
            bool playing = g.Mode == "playing";
            bool inLevel = playing || g.Mode == "paused";
            if (inLevel && (midBackdrop == null || midRoom != g.Room.Id))
            {
                midRoom = g.Room.Id;
                BuildMidGround(g);
            }
            if (midBackdrop != null) midBackdrop.enabled = inLevel;
            foreach (var curve in midCurves) if (curve != null) curve.enabled = inLevel;
            foreach (var formula in midFormulas) if (formula != null) formula.enabled = playing;
            if (!playing) return;
            midTime += (float)dt;
            PositionMidGround(g.Room.Cols, g.Room.Rows);
        }

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
            {'B',new[]{"##.","#.#","##.","#.#","##."}}, {'J',new[]{"..#","..#","..#","#.#",".#."}},
            {'L',new[]{"#..","#..","#..","#..","###"}}, {'Q',new[]{".#.","#.#","#.#",".#.","..#"}},
            {'U',new[]{"#.#","#.#","#.#","#.#","###"}}, {'X',new[]{"#.#","#.#",".#.","#.#","#.#"}},
            {'Y',new[]{"#.#","#.#",".#.",".#.",".#."}}, {'Z',new[]{"###","..#",".#.","#..","###"}},
            {'*',new[]{"...", "#.#",".#.","#.#","..."}}, {'<',new[]{"..#",".#.","#..",".#.","..#"}},
            {'>',new[]{"#..",".#.","..#",".#.","#.."}}, {'[',new[]{"##.","#..","#..","#..","##."}},
            {']',new[]{".##","..#","..#","..#",".##"}}, {':',new[]{"...",".#.","...",".#.","..."}},
            {'!',new[]{".#.",".#.",".#.","...",".#."}}, {'_',new[]{"...","...","...","...","###"}},
            {'N',new[]{"#.#","###","###","#.#","#.#"}}, {'G',new[]{".##","#..","#.#","#.#",".##"}},
        };
        // 找字形（主表 + 补充表）
        static string[] Glyph(char ch)
        {
            if (Font3x5.TryGetValue(ch, out var g)) return g;
            if (FontExtra.TryGetValue(ch, out var e)) return e;
            if (FontExtra.TryGetValue(char.ToUpperInvariant(ch), out e)) return e;
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
            {'3',new[]{"##.","..#",".#.","..#","##."}}, {'4',new[]{"#.#","#.#","###","..#","..#"}},
            {'5',new[]{"###","#..","##.","..#","##."}}, {'6',new[]{".##","#..","###","#.#","###"}},
            {'7',new[]{"###","..#",".#.",".#.",".#."}}, {'8',new[]{"###","#.#","###","#.#","###"}},
            {'9',new[]{"###","#.#","###","..#","##."}}, {'-',new[]{"...","...","###","...","..."}},
            {'e',new[]{"...",".#.","###","#..",".##"}}, {'c',new[]{"...",".##","#..","#..",".##"}},
            {'o',new[]{"...",".#.","#.#","#.#",".#."}}, {'g',new[]{"...",".##","#.#",".##","..#"}},
            {'k',new[]{"#..","#..","#.#","##.","#.#"}}, {',',new[]{"...","...","...",".#.","#.."}},
            {'.',new[]{"...","...","...","...",".#."}}, {(char)39,new[]{".#.",".#.","...","...","..."}},
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
            if (midBackdrop == null) CreateMidBackdrop();
            midBackdrop.transform.position = new Vector3(g.Room.Cols * .5f, g.Room.Rows * .5f, 0f);
            midBackdrop.transform.localScale = new Vector3(g.Room.Cols * 32f / 640f, g.Room.Rows * 32f / 360f, 1f);
            midTime = 0f;
            PickRoomBackground();
            BakeMidAtlas();
            PositionMidGround(g.Room.Cols, g.Room.Rows);
        }

        void CreateMidBackdrop()
        {
            midGroundRoot = new GameObject("Math background").transform;
            midGroundRoot.SetParent(root, false);
            const int W = 640, H = 360;   // 2× 分辨率：网格/曲线/公式更精细
            var midTexture = new Texture2D(W, H, TextureFormat.RGBA32, false);
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
            midBackdrop = MakeMidRenderer("Mid backdrop", sprite, -8);
        }

        readonly System.Random backgroundRandom = new System.Random();
        readonly int[] roomCurves = new int[3];
        readonly string[] roomFormulas = new string[4];
        readonly float[] formulaWidths = new float[4];
        static readonly Color32[] CurveColors = {
            new Color32(42, 103, 109, 145), new Color32(137, 101, 44, 123), new Color32(146, 69, 56, 100)
        };
        static readonly float[] FormulaRows = { .20f, .38f, .57f, .76f };
        static readonly float[] FormulaStarts = { .12f, .53f, .30f, .68f };
        static readonly string[] FormulaPool = {
            "x->0: sin(x)/x->1", "e^(i*pi)+1=0", "d/dx Int f(t)dt=f(x)",
            "Int u dv=uv-Int v du", "Int dx/(1+x^2)=atan(x)+C", "Int 1/x dx=ln(abs(x))+C",
            "Int_-inf^inf e^(-x^2)dx=sqrt(pi)", "Int x e^x dx=(x-1)e^x+C", "Int cos(x)^2 dx=x/2+sin(2x)/4+C",
            "Int_0^1 x^x dx=Sum((-1)^n/(n+1)^(n+1))", "Sum 1/n^2=pi^2/6", "Sum 1/2^n=2",
            "Sum (-1)^n/(2n+1)=pi/4", "Sum x^n/n!=e^x", "sin(x)=x-x^3/3!+x^5/5!-...",
            "ln(1+x)=x-x^2/2+x^3/3-...", "(1+x)^a=Sum C(a,n)x^n", "lim (1+1/n)^n=e",
            "lim n^(1/n)=1", "lim (ln x)/x=0", "y''+y=0",
            "y'+py=q", "y'=ky(1-y/K)", "dy/dx=(dy/dt)/(dx/dt)",
            "fxy=fyx", "grad f=(fx,fy,fz)", "D_u f=grad f*u",
            "div curl F=0", "curl grad f=0", "grad f=L grad g",
            "Int div F dV=Int F*n dS", "Int curl F*dS=Int F*dr", "Int dx/sqrt(1-x^2)=asin(x)+C",
            "r=a(1-cos t)", "x=a(t-sin t)", "y=a(1-cos t)",
            "x^2/a^2+y^2/b^2=1", "x^2/a^2-y^2/b^2=1", "L=Int sqrt(1+y'^2)dx",
            "K=abs(y'')/(1+y'^2)^(3/2)", "dxdy=r drdt", "Int_0^1 ln(x)dx=-1",
            "F=dp/dt", "F=-grad U", "m x''+b x'+kx=0",
            "a=v^2/r", "L=r cross p", "dL/dt=T",
            "I=Int r^2 dm", "I=Ic+md^2", "W=Int F*dr",
            "F=-GMm/r^2", "T^2=4pi^2 a^3/(GM)", "v=sqrt(2GM/r)",
            "dU=TdS-pdV", "pV=nRT", "pV^g=const",
            "dS=dQrev/T", "eta=1-Tc/Th", "v=sqrt(gRT/M)",
            "E=mc^2", "E^2=(pc)^2+(mc^2)^2", "g=1/sqrt(1-v^2/c^2)",
            "t'=g(t-vx/c^2)", "x'=g(x-vt)", "lambda=h/p",
            "E=hf", "Kmax=hf-W", "dx dp>=hbar/2",
            "i hbar dY/dt=H Y", "En=-13.6/n^2 eV", "div E=rho/e0",
            "div B=0", "curl E=-dB/dt", "curl B=u0 J+u0 e0 dE/dt",
            "F=q(E+v cross B)", "C=eA/d", "U=CV^2/2",
            "I=I0 e^(-t/RC)", "F=-kx", "w=1/sqrt(LC)",
            "c=1/sqrt(u0 e0)", "n1 sin(t1)=n2 sin(t2)", "1/f=1/u+1/v",
            "d sin(t)=m lambda", "I=I0 cos(t)^2", "lambda'=lambda+h(1-cos t)/(mc)",
            "f'=f(v+vo)/(v-vs)", "Q=mc dT", "P=I^2 R",
            "W=c+v+m", "m'=m/v", "p'=m/(c+v)",
            "organic ratio=c/v", "M-C-M': M'>M", "C-M-C",
            "M'=M+dM", "v+m=new value", "necessary work+surplus work=workday",
            "I(v+m)=IIc",
        };

        void PickRoomBackground()
        {
            var curves = new HashSet<int>();
            var formulas = new HashSet<int>();
            for (int i = 0; i < roomCurves.Length; i++)
            {
                int index;
                do { index = backgroundRandom.Next(10); } while (!curves.Add(index));
                roomCurves[i] = index;
            }
            for (int i = 0; i < roomFormulas.Length; i++)
            {
                int index;
                do { index = backgroundRandom.Next(FormulaPool.Length); } while (!formulas.Add(index));
                roomFormulas[i] = FormulaPool[index];
            }
        }

        static float CurveValue(int curve, float u, float phase)
        {
            float x = 2f * u - 1f;
            switch (curve)
            {
                case 0: return Mathf.Sin(Mathf.PI * 2f * u + phase);
                case 1: return Mathf.Cos(Mathf.PI * 3f * u - phase);
                case 2: return 2f * x * x - 1f;
                case 3: return x * x * x;
                case 4: return (Mathf.Exp(2f * x) - 3f) / 4.4f;
                case 5: return Mathf.Log(1f + 7f * u) / Mathf.Log(8f) * 2f - 1f;
                case 6: return 2f / (1f + Mathf.Exp(-7f * x)) - 1f;
                case 7: return 2f * Mathf.Exp(-5f * x * x) - 1f;
                case 8: return 2f * Mathf.Sqrt(u) - 1f;
                default: return Mathf.Atan(5f * x) / 1.4f;
            }
        }
        void BakeMidAtlas()
        {
            if (midAtlas == null)
            {
                midAtlas = new Texture2D(MidAtlasWidth, MidAtlasHeight, TextureFormat.RGBA32, false) {
                    filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp
                };
                midAtlasPixels = new Color32[MidAtlasWidth * MidAtlasHeight];
            }
            Array.Clear(midAtlasPixels, 0, midAtlasPixels.Length);
            for (int i = 0; i < midCurves.Length; i++)
            {
                int bottom = i * CurveStripHeight;
                int previous = 0;
                for (int x = 0; x < MidAtlasWidth; x++)
                {
                    float u = x / (float)(MidAtlasWidth - 1);
                    int y = 24 + Mathf.RoundToInt(17f * CurveValue(roomCurves[i], u, 0f));
                    if (x == 0) previous = y;
                    for (int k = Mathf.Min(previous, y); k <= Mathf.Max(previous, y) + 1; k++)
                        midAtlasPixels[(bottom + k) * MidAtlasWidth + x] = CurveColors[i];
                    previous = y;
                }
                if (midCurves[i] == null)
                    midCurves[i] = MakeMidRenderer("Mid curves " + i,
                        MidSprite(new Rect(0, bottom, MidAtlasWidth, CurveStripHeight), new Vector2(.5f, .5f)), -7);
            }

            var tone = new Color32(49, 66, 87, 140);
            for (int i = 0; i < midFormulas.Length; i++)
            {
                int bottom = midCurves.Length * CurveStripHeight + i * 8;
                string formula = roomFormulas[i];
                PixelText(midAtlasPixels, MidAtlasWidth, MidAtlasHeight, formula, 0, bottom + 6, 1, tone);
                formulaWidths[i] = formula.Length * 4f / 32f;
                if (midFormulas[i] == null)
                    midFormulas[i] = MakeMidRenderer("Mid formula " + i,
                        MidSprite(new Rect(0, bottom, MidAtlasWidth, 8), new Vector2(0f, .5f)), -7);
            }
            midAtlas.SetPixels32(midAtlasPixels);
            midAtlas.Apply(false, false);
        }

        SpriteRenderer MakeMidRenderer(string name, Sprite sprite, int order)
        {
            var renderer = MakeSprite(name, sprite, order);
            renderer.transform.SetParent(midGroundRoot, false);
            return renderer;
        }

        Sprite MidSprite(Rect rect, Vector2 pivot)
        {
            return Sprite.Create(midAtlas, rect, pivot, 32f, 0, SpriteMeshType.FullRect);
        }

        void PositionMidGround(float cols, float rows)
        {
            for (int i = 0; i < midCurves.Length; i++)
            {
                float phase = midTime * (.85f + i * .14f) + i * 1.6f;
                var curve = midCurves[i].transform;
                curve.localPosition = new Vector3(cols * .5f, rows * (.60f - i * .20f + .026f * Mathf.Sin(phase)), 0f);
                curve.localScale = new Vector3(cols * 32f / MidAtlasWidth,
                    rows * 32f / CurveStripHeight * (.155f + .027f * Mathf.Cos(phase)), 1f);
            }
            for (int i = 0; i < midFormulas.Length; i++)
            {
                float scale = Mathf.Min(1.65f, cols * .42f / formulaWidths[i]);
                float width = formulaWidths[i] * scale;
                float travel = cols - width;
                float phase = midTime * (.19f + i * .035f) + FormulaStarts[i] * Mathf.PI * 2f;
                float x = travel * (.5f + .42f * Mathf.Sin(phase));
                var formula = midFormulas[i].transform;
                formula.localPosition = new Vector3(x, rows * (1f - FormulaRows[i]), 0f);
                formula.localScale = new Vector3(scale, scale, 1f);
            }
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
                bool chargeOnly = g.Credited.Contains(g.Room.Id + "/" + o.Id);   // 仅每帧少量喷射装置调用，暂不优化
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
