using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
namespace RoomLab.Native
{
    // Draggable sci-fi rectangle meter: framed strip with tick marks, a glowing fill and a cursor.
    // Pointer down or drag anywhere on the strip sets the value, so it needs no handle hit test.
    public sealed class NativeSciFiGauge:MonoBehaviour,IPointerDownHandler,IDragHandler,IPointerUpHandler
    {
        public float Minimum=.5f,Maximum=1f;
        public event Action<float> Changed;
        public event Action Released;
        RectTransform area,fill,cursor;Text label;float value;
        public float Value{get{return value;}}
        public static NativeSciFiGauge Create(RectTransform parent,float minimum,float maximum,float initial,Action<float> changed,Action released)
        {
            var root=NativeUiKit.New(parent,"SciFi gauge");NativeUiKit.Size(root,height:26,flexWidth:1);
            var background=root.gameObject.AddComponent<Image>();background.color=new Color(.04f,.075f,.11f,.94f);background.raycastTarget=true;
            var frame=new Color(.18f,.55f,.58f,.85f);
            Edge(root,"Frame top",new Vector2(0,1),new Vector2(1,1),new Vector2(.5f,1),new Vector2(0,1),frame);
            Edge(root,"Frame bottom",new Vector2(0,0),new Vector2(1,0),new Vector2(.5f,0),new Vector2(0,1),frame);
            Edge(root,"Frame left",new Vector2(0,0),new Vector2(0,1),new Vector2(0,.5f),new Vector2(1,0),frame);
            Edge(root,"Frame right",new Vector2(1,0),new Vector2(1,1),new Vector2(1,.5f),new Vector2(1,0),frame);
            Edge(root,"Cap left",new Vector2(0,.5f),new Vector2(0,.5f),new Vector2(0,.5f),new Vector2(3,14),new Color(.55f,.95f,1f,.9f));
            Edge(root,"Cap right",new Vector2(1,.5f),new Vector2(1,.5f),new Vector2(1,.5f),new Vector2(3,14),new Color(.55f,.95f,1f,.9f));
            for(int i=0;i<8;i++)
            {
                float t=i/7f;var tick=NativeUiKit.New(root,"Tick "+i);tick.anchorMin=tick.anchorMax=new Vector2(t,.5f);tick.pivot=new Vector2(.5f,.5f);tick.sizeDelta=new Vector2(1,10);tick.anchoredPosition=Vector2.zero;
                var image=tick.gameObject.AddComponent<Image>();image.color=new Color(.2f,.45f,.5f,.5f);image.raycastTarget=false;
            }
            var fillRect=NativeUiKit.New(root,"Fill");fillRect.anchorMin=new Vector2(0,0);fillRect.anchorMax=new Vector2(0,1);fillRect.offsetMin=new Vector2(3,3);fillRect.offsetMax=new Vector2(0,-3);
            var fillImage=fillRect.gameObject.AddComponent<Image>();fillImage.color=new Color(.2f,.72f,.72f,.22f);fillImage.raycastTarget=false;
            var cursorRect=NativeUiKit.New(root,"Cursor");cursorRect.anchorMin=cursorRect.anchorMax=new Vector2(0,.5f);cursorRect.pivot=new Vector2(.5f,.5f);cursorRect.sizeDelta=new Vector2(2,22);cursorRect.anchoredPosition=Vector2.zero;
            var cursorImage=cursorRect.gameObject.AddComponent<Image>();cursorImage.color=new Color(.65f,1f,1f);cursorImage.raycastTarget=false;
            var text=NativeUiKit.Label(root,"",10,new Color(.72f,.96f,1f),TextAnchor.MiddleRight);
            var textRect=text.rectTransform;textRect.anchorMin=Vector2.zero;textRect.anchorMax=Vector2.one;textRect.offsetMin=new Vector2(10,0);textRect.offsetMax=new Vector2(-16,0);
            var gauge=root.gameObject.AddComponent<NativeSciFiGauge>();
            gauge.Bind(root,fillRect,cursorRect,text,minimum,maximum,initial);
            if(changed!=null)gauge.Changed+=changed;
            if(released!=null)gauge.Released+=released;
            gauge.Refresh();
            return gauge;
        }
        void Bind(RectTransform rect,RectTransform fillRect,RectTransform cursorRect,Text text,float minimum,float maximum,float initial)
        {
            area=rect;fill=fillRect;cursor=cursorRect;label=text;Minimum=minimum;Maximum=maximum;value=Mathf.Clamp(initial,minimum,maximum);
        }
        void Refresh()
        {
            float t=Mathf.InverseLerp(Minimum,Maximum,value);
            fill.anchorMax=new Vector2(t,1);
            cursor.anchorMin=cursor.anchorMax=new Vector2(Mathf.Lerp(.02f,.98f,t),.5f);
            if(label!=null)label.text=Mathf.RoundToInt(value*100f)+"%";
        }
        void Pointer(PointerEventData eventData)
        {
            if(area==null)return;
            Vector2 local;
            if(!RectTransformUtility.ScreenPointToLocalPointInRectangle(area,eventData.position,eventData.pressEventCamera,out local))return;
            var rect=area.rect;
            float t=Mathf.Clamp01(Mathf.InverseLerp(rect.xMin,rect.xMax,local.x));
            float next=Mathf.Lerp(Minimum,Maximum,t);
            next=Mathf.Round(next*100f)/100f;
            if(Mathf.Approximately(next,value))return;
            value=next;Refresh();Changed?.Invoke(value);
        }
        public void OnPointerDown(PointerEventData eventData){Pointer(eventData);}
        public void OnDrag(PointerEventData eventData){Pointer(eventData);}
        public void OnPointerUp(PointerEventData eventData){Released?.Invoke();}
        static Image Edge(Transform parent,string name,Vector2 anchorMin,Vector2 anchorMax,Vector2 pivot,Vector2 size,Color color)
        {
            var t=NativeUiKit.New(parent,name);t.anchorMin=anchorMin;t.anchorMax=anchorMax;t.pivot=pivot;t.sizeDelta=size;t.anchoredPosition=Vector2.zero;
            var image=t.gameObject.AddComponent<Image>();image.color=color;image.raycastTarget=false;return image;
        }
    }
}
