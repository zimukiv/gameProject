using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
namespace RoomLab.Native
{
    // Marks decorative layers (world image, page backdrop) that legitimately sit under the UI.
    public sealed class NativeUiBackdrop:MonoBehaviour{}
    // Resolution independent uGUI primitives. Sizes are design pixels on a 640x360 baseline that
    // only grows along the narrower screen axis. Children are placed by layout groups, so two
    // stacked elements cannot overlap even when text length or window aspect changes.
    public static class NativeUiKit
    {
        public static Font Font;
        public static Action ClickSound;
        public static readonly Color Paper=new Color(.88f,.87f,.77f),Ink=new Color(.055f,.085f,.14f),Teal=new Color(.2f,.72f,.72f),Orange=new Color(.95f,.58f,.29f);
        public static readonly Color Slot=new Color(.16f,.25f,.32f),SlotIdle=new Color(.11f,.18f,.24f);
        static Transform Host(Transform parent){return parent;}
        public static RectTransform New(Transform parent,string name){var go=new GameObject(name,typeof(RectTransform));go.layer=parent.gameObject.layer;var t=(RectTransform)go.transform;t.SetParent(parent,false);t.anchorMin=Vector2.zero;t.anchorMax=Vector2.one;t.offsetMin=Vector2.zero;t.offsetMax=Vector2.zero;return t;}
        public static RectTransform Abs(Transform parent,string name,float x,float y,float w,float h){var t=New(parent,name);t.anchorMin=t.anchorMax=new Vector2(0,1);t.pivot=new Vector2(0,1);t.anchoredPosition=new Vector2(x,-y);t.sizeDelta=new Vector2(w,h);return t;}
        public static void Center(RectTransform t,float width){t.anchorMin=t.anchorMax=new Vector2(.5f,.5f);t.pivot=new Vector2(.5f,.5f);t.anchoredPosition=Vector2.zero;if(width>0)t.sizeDelta=new Vector2(width,t.sizeDelta.y);}
        public static void MarkBackdrop(GameObject go){if(go.GetComponent<NativeUiBackdrop>()==null)go.AddComponent<NativeUiBackdrop>();}
        public static Image Box(Transform parent,string name,Color color,bool raycast=false,bool backdrop=false){var t=New(parent,name);var img=t.gameObject.AddComponent<Image>();img.color=color;img.raycastTarget=raycast;if(backdrop)MarkBackdrop(t.gameObject);return img;}
        // Decorative art drawn at absolute offsets inside a fixed pixel panel (the phone mock).
        public static Image AbsImage(Transform parent,string name,float x,float y,float w,float h,Color color){var t=Abs(parent,name,x,y,w,h);var img=t.gameObject.AddComponent<Image>();img.color=color;img.raycastTarget=false;return img;}
        public static Text AbsLabel(Transform parent,float x,float y,float w,float h,string value,int size,Color color,TextAnchor align=TextAnchor.UpperLeft)
        {
            var t=Abs(parent,"Text",x,y,w,h);var text=t.gameObject.AddComponent<Text>();
            text.font=Font;text.fontSize=size;text.color=color;text.text=value;text.raycastTarget=false;text.supportRichText=false;
            text.horizontalOverflow=HorizontalWrapMode.Wrap;text.verticalOverflow=VerticalWrapMode.Overflow;text.alignment=align;text.lineSpacing=1f;
            return text;
        }
        public static Rect WorldRect(RectTransform t){var corners=new Vector3[4];t.GetWorldCorners(corners);return UnityEngine.Rect.MinMaxRect(corners[0].x,corners[0].y,corners[2].x,corners[2].y);}
        public static RectTransform Column(Transform parent,string name,int spacing=6,int padX=0,int padY=0,bool fit=true,TextAnchor align=TextAnchor.UpperCenter)
        {
            var t=New(parent,name);var g=t.gameObject.AddComponent<VerticalLayoutGroup>();
            g.spacing=spacing;g.padding=new RectOffset(padX,padX,padY,padY);g.childControlWidth=true;g.childControlHeight=true;g.childForceExpandWidth=true;g.childForceExpandHeight=false;g.childAlignment=align;
            if(fit){var f=t.gameObject.AddComponent<ContentSizeFitter>();f.horizontalFit=ContentSizeFitter.FitMode.Unconstrained;f.verticalFit=ContentSizeFitter.FitMode.PreferredSize;}
            return t;
        }
        public static RectTransform Row(Transform parent,string name,float height,int spacing=8,int padX=0)
        {
            var t=New(parent,name);var g=t.gameObject.AddComponent<HorizontalLayoutGroup>();
            g.spacing=spacing;g.padding=new RectOffset(padX,padX,0,0);g.childControlWidth=true;g.childControlHeight=true;g.childForceExpandWidth=true;g.childForceExpandHeight=true;g.childAlignment=TextAnchor.MiddleCenter;
            var e=t.gameObject.AddComponent<LayoutElement>();e.minHeight=height;e.preferredHeight=height;e.flexibleHeight=0;
            return t;
        }
        public static LayoutElement Size(Component c,float width=0,float height=0,float flexWidth=0,float flexHeight=0)
        {
            var e=c.gameObject.GetComponent<LayoutElement>();if(e==null)e=c.gameObject.AddComponent<LayoutElement>();
            if(width>0){e.minWidth=width;e.preferredWidth=width;e.flexibleWidth=flexWidth;}
            if(height>0){e.minHeight=height;e.preferredHeight=height;e.flexibleHeight=0;}
            if(width<=0&&flexWidth>0)e.flexibleWidth=flexWidth;
            if(height<=0&&flexHeight>0)e.flexibleHeight=flexHeight;
            return e;
        }
        public static Text Label(Transform parent,string value,int size,Color color,TextAnchor align=TextAnchor.UpperLeft)
        {
            var t=New(parent,"Text");var x=t.gameObject.AddComponent<Text>();
            x.font=Font;x.fontSize=size;x.color=color;x.text=value;x.raycastTarget=false;x.supportRichText=false;
            x.horizontalOverflow=HorizontalWrapMode.Wrap;x.verticalOverflow=VerticalWrapMode.Overflow;x.alignment=align;x.lineSpacing=1f;
            // Flexible so a long string wraps inside the column instead of pushing its siblings sideways.
            var e=t.gameObject.AddComponent<LayoutElement>();e.flexibleWidth=1;
            return x;
        }
        public static Button Button(Transform parent,string label,Action action,int size=12,float height=26,Color? bg=null,float width=0,float flexWidth=1)
        {
            var t=New(parent,"Button "+label);var img=t.gameObject.AddComponent<Image>();img.color=bg??Slot;
            var e=t.gameObject.AddComponent<LayoutElement>();e.minHeight=height;e.preferredHeight=height;e.flexibleHeight=0;
            if(width>0){e.minWidth=width;e.preferredWidth=width;e.flexibleWidth=0;}else e.flexibleWidth=flexWidth;
            var b=t.gameObject.AddComponent<Button>();var colors=b.colors;colors.highlightedColor=new Color(.72f,1,1);colors.pressedColor=new Color(.72f,.82f,.72f);b.colors=colors;
            var text=Label(t,label,size,Color.white,TextAnchor.MiddleCenter);text.gameObject.name="Caption";
            b.onClick.AddListener(()=>{ClickSound?.Invoke();action();});
            return b;
        }
        // Fits a fitted panel into the available design space by shrinking it uniformly; never clips.
        public static void Fit(RectTransform panel,float maxWidth,float maxHeight)
        {
            if(maxWidth>0)panel.sizeDelta=new Vector2(maxWidth,panel.sizeDelta.y);
            Canvas.ForceUpdateCanvases();LayoutRebuilder.ForceRebuildLayoutImmediate(panel);
            float scale=1f;
            if(maxHeight>0&&panel.rect.height>maxHeight)scale=Mathf.Max(.2f,maxHeight/panel.rect.height);
            if(maxWidth>0&&panel.rect.width*scale>maxWidth)scale=Mathf.Max(.2f,maxWidth/(panel.rect.width));
            panel.localScale=new Vector3(scale,scale,1);
        }
        // Invalidates the layout of a freshly built page so rects are final before inspection.
        public static void Relayout(Transform page){Canvas.ForceUpdateCanvases();for(int i=0;i<page.childCount;i++){var t=page.GetChild(i) as RectTransform;if(t!=null)LayoutRebuilder.ForceRebuildLayoutImmediate(t);}Canvas.ForceUpdateCanvases();}
        // Returns the number of inspected pairs. Solid = text or an interactive graphic; decorative
        // images are covered by their own text so they are not compared with it.
        public static int Validate(RectTransform root,List<string> problems,Rect bounds)
        {
            var nodes=new List<RectTransform>();Collect(root,nodes);
            int pairs=0;
            for(int i=0;i<nodes.Count;i++)
            {
                for(int j=i+1;j<nodes.Count;j++)
                {
                    var a=nodes[i];var b=nodes[j];if(IsAncestor(a,b)||IsAncestor(b,a))continue;if(!Solid(a)||!Solid(b))continue;
                    pairs++;var ra=WorldRect(a);var rb=WorldRect(b);
                    if(Overlaps(ra,rb,0.6f))problems.Add("overlap "+Name(a)+" "+Range(ra)+" <> "+Name(b)+" "+Range(rb));
                }
            }
            foreach(var n in nodes)
            {
                var text=n.GetComponent<Text>();var r=WorldRect(n);
                if(bounds.width>0&&!Contains(bounds,r,1.5f))problems.Add("outside "+Name(n)+" "+Range(r));
                if(text!=null&&text.preferredHeight>n.rect.height+1.5f)problems.Add("clipped "+Name(n)+" preferred="+text.preferredHeight.ToString("F1")+" box="+n.rect.height.ToString("F1"));
            }
            return pairs;
        }
        static void Collect(Transform parent,List<RectTransform> nodes)
        {
            for(int i=0;i<parent.childCount;i++)
            {
                var t=parent.GetChild(i) as RectTransform;if(t==null)continue;if(!t.gameObject.activeInHierarchy)continue;
                if(t.GetComponent<NativeUiBackdrop>()==null)nodes.Add(t);
                Collect(t,nodes);
            }
        }
        static bool Solid(RectTransform t)
        {
            if(t.GetComponent<Text>()!=null)return true;
            if(t.GetComponent<NativeUiBackdrop>()!=null)return false;
            var image=t.GetComponent<Image>();if(image!=null&&image.raycastTarget)return true;
            if(t.GetComponent<Slider>()!=null)return true;
            return false;
        }
        static bool IsAncestor(Transform ancestor,Transform child){for(var t=child;t!=null;t=t.parent)if(t==ancestor)return true;return false;}
        static bool Overlaps(Rect a,Rect b,float tolerance){float x=Mathf.Min(a.xMax,b.xMax)-Mathf.Max(a.xMin,b.xMin),y=Mathf.Min(a.yMax,b.yMax)-Mathf.Max(a.yMin,b.yMin);return x>tolerance&&y>tolerance;}
        static bool Contains(Rect outer,Rect inner,float tolerance){return inner.xMin>=outer.xMin-tolerance&&inner.yMin>=outer.yMin-tolerance&&inner.xMax<=outer.xMax+tolerance&&inner.yMax<=outer.yMax+tolerance;}
        static string Range(Rect r){return "["+r.xMin.ToString("F0")+","+r.yMin.ToString("F0")+"-"+r.xMax.ToString("F0")+","+r.yMax.ToString("F0")+"]";}
        static string Name(Transform t){var text=t.GetComponent<Text>();return t.name.Replace(" ","_")+(text!=null?"("+text.text.Replace("\n","/")+")":"");}
    }
}
