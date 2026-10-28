using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml;
using UnityEngine;
using Unity.VectorGraphics;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed class NativeDemoAssets:IDisposable
    {
        public readonly Dictionary<string,Sprite[]> Frames=new Dictionary<string,Sprite[]>();
        public sealed class Timing{public uint Plays;public readonly List<uint> Milliseconds=new List<uint>();}
        public readonly Dictionary<string,Timing> Timings=new Dictionary<string,Timing>();
        readonly List<UnityEngine.Object> owned=new List<UnityEngine.Object>();long decodedBytes;
        public Sprite Get(string id,double time,double fps=6){if(string.IsNullOrEmpty(id))return null;if(!Frames.TryGetValue(id,out var frames))throw new NativeDataException("素材映射未解码："+id);if(Timings.TryGetValue(id,out var timing)){double total=0;foreach(var ms in timing.Milliseconds)total+=ms;double at=Math.Max(0,time)*1000;if(total<=0||timing.Plays>0&&at>=total*timing.Plays)return frames[frames.Length-1];at%=total;double end=0;for(int i=0;i<frames.Length;i++){end+=timing.Milliseconds[i];if(at<end)return frames[i];}return frames[frames.Length-1];}return frames[(int)Math.Floor(Math.Max(0,time)*(fps>0?fps:6))%frames.Length];}
        public static NativeDemoAssets Decode(NativeProject data){return Decode(data,false);}
        // allowUnresolved: used only when the player imports a package without its assets folder, so the
        // declared-but-unread assets are skipped and the renderer falls back to the built-in pixel art.
        public static NativeDemoAssets Decode(NativeProject data,bool allowUnresolved)
        {
            var result=new NativeDemoAssets();try{ValidateReferences(data);foreach(var a in data.Assets){if(a.Bytes==null&&allowUnresolved)continue;result.Add(a);}return result;}catch{result.Dispose();throw;}
        }
        public bool Has(string id){return !string.IsNullOrEmpty(id)&&Frames.ContainsKey(id);}
        static void ValidateReferences(NativeProject data){var ids=new HashSet<string>(data.Assets.Select(a=>a.Id));void Bindings(JToken node){if(node==null||node.Type==JTokenType.Null)return;if(node is JObject o){foreach(var p in o.Properties())Bindings(p.Value);return;}if(node.Type!=JTokenType.String)throw new NativeDataException("素材绑定必须为素材ID");string id=(string)node;if(!string.IsNullOrEmpty(id)&&!ids.Contains(id))throw new NativeDataException("素材绑定引用缺失："+id);}if(data.NormalizedJson?["blockDefaults"] is JObject defaults)foreach(var type in defaults.Properties())Bindings(type.Value["assets"]);foreach(var c in data.Courses){Bindings(c.ArtBindings);foreach(var r in c.Rooms){Bindings(r.ArtBindings);foreach(var o in r.Objects)Bindings(o.AssetOverrides);}}}
        void Add(NativeAsset asset)
        {
            if(asset.Bytes==null)throw new NativeDataException("素材缺失："+asset.Path);var bytes=asset.Bytes;Texture2D tex=null;
            string ext=Path.GetExtension(asset.Path).ToLowerInvariant();
            if(ext==".gif"||ext==".webp"){AddNativeAnimation(asset);return;}
            if(ext==".svg"){
                string xml=System.Text.Encoding.UTF8.GetString(bytes);var doc=new XmlDocument{XmlResolver=null};using(var r=XmlReader.Create(new StringReader(xml),new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null}))doc.Load(r);
                var allowed=new HashSet<string>{"svg","g","defs","rect","circle","ellipse","path","polygon","polyline","line","clipPath"};
                foreach(XmlNode node in doc.SelectNodes("//*")){if(!allowed.Contains(node.LocalName))throw new NativeDataException("不支持SVG元素："+node.LocalName+" / "+asset.Path);foreach(XmlAttribute attr in node.Attributes)if(attr.LocalName.StartsWith("on")||attr.LocalName=="href"||attr.LocalName=="filter"||attr.LocalName=="style"||attr.LocalName=="class"||attr.LocalName=="mask"||attr.Value.Contains("http:")&&attr.LocalName!="xmlns"||attr.Value.Contains("https:"))throw new NativeDataException("不支持SVG外部引用或效果："+asset.Path);}
                var info=SVGParser.ImportSVG(new StringReader(xml));var options=new VectorUtils.TessellationOptions{StepDistance=1,MaxCordDeviation=.25f,MaxTanAngleDeviation=.1f,SamplingStepSize=.01f};var geoms=VectorUtils.TessellateScene(info.Scene,options,info.NodeOpacity);if(geoms.Count==0)throw new NativeDataException("SVG没有可显示内容："+asset.Path);
                var sprite=VectorUtils.BuildSprite(geoms,info.SceneViewport,1,VectorUtils.Alignment.Center,Vector2.zero,128,true);owned.Add(sprite);
                int w=(int)Math.Max(1,asset.Width>0?asset.Width:Math.Ceiling(info.SceneViewport.width)),h=(int)Math.Max(1,asset.Height>0?asset.Height:Math.Ceiling(info.SceneViewport.height));Budget(w,h);
                var material=new Material(Shader.Find("Sprites/Default"));try{tex=VectorUtils.RenderSpriteToTexture2D(sprite,w,h,material,1,false);}finally{UnityEngine.Object.Destroy(material);}
            }else if(ext==".png"||ext==".jpg"||ext==".jpeg"){
                // Reject dimensions before allocating decoded pixels; JPEG is bounded after decoder too.
                if(ext==".png"&&bytes.Length>=24){int w=(bytes[16]<<24)|(bytes[17]<<16)|(bytes[18]<<8)|bytes[19],h=(bytes[20]<<24)|(bytes[21]<<16)|(bytes[22]<<8)|bytes[23];Budget(w,h);}
                if(ext!=".png"){var size=JpegSize(bytes);Budget(size.Item1,size.Item2);}tex=new Texture2D(2,2,TextureFormat.RGBA32,false);if(!ImageConversion.LoadImage(tex,bytes)){UnityEngine.Object.Destroy(tex);throw new NativeDataException("图像解码失败："+asset.Path);}
            }else throw new NativeDataException("尚不支持原生解码 "+ext+"："+asset.Path+"；请在编辑器改用PNG/JPEG或受支持SVG后重新导出");
            if(tex==null)throw new NativeDataException("图像未生成："+asset.Path);owned.Add(tex);tex.filterMode=FilterMode.Point;tex.wrapMode=TextureWrapMode.Clamp;
            if(ext==".svg"){int visible=0;var colors=new HashSet<uint>();foreach(var c in tex.GetPixels32())if(c.a>0){visible++;colors.Add((uint)c.r<<16|(uint)c.g<<8|c.b);}if(visible<1)throw new NativeDataException("SVG实际栅格化为空或单色："+asset.Path);Debug.Log("NATIVE_SVG_PIXELS_PASS "+asset.Id+" visible="+visible+" colors="+colors.Count);}
            if(asset.FrameWidth<0||asset.FrameHeight<0||asset.FrameWidth!=Math.Floor(asset.FrameWidth)||asset.FrameHeight!=Math.Floor(asset.FrameHeight))throw new NativeDataException("仅支持非负整数动画帧尺寸："+asset.Path);bool sheet=asset.FrameWidth>0&&asset.FrameHeight>0;var frames=new List<Sprite>();int fw=sheet?(int)asset.FrameWidth:tex.width,fh=sheet?(int)asset.FrameHeight:tex.height;if(fw<1||fh<1||fw>tex.width||fh>tex.height||asset.Fps<0||asset.Fps>240)throw new NativeDataException("动画帧设置不受支持："+asset.Path);
            for(int y=0;y<tex.height/fh;y++)for(int x=0;x<tex.width/fw;x++){var s=Sprite.Create(tex,new Rect(x*fw,tex.height-(y+1)*fh,fw,fh),new Vector2(.5f,.5f),32);owned.Add(s);frames.Add(s);}
            Frames.Add(asset.Id,frames.ToArray());
        }
        void AddNativeAnimation(NativeAsset asset){using(var decoded=new NativeImageCodec(asset.Bytes)){var info=decoded.Metadata;if(info.frames>1&&(asset.FrameWidth>0||asset.FrameHeight>0))throw new NativeDataException("动画容器与精灵表切帧组合暂不支持："+asset.Path);var timing=new Timing{Plays=info.plays};var sprites=new List<Sprite>();byte[] rgba=new byte[checked((int)(info.width*info.height*4))],row=new byte[checked((int)info.width*4)];
                // Upload one borrowed native frame at a time; do not retain a second managed animation.
                for(uint frame=0;frame<info.frames;frame++){Budget((int)info.width,(int)info.height);uint delay=decoded.Read(frame,rgba);int stride=(int)info.width*4;for(int y=0;y<(int)info.height/2;y++){int opposite=(int)info.height-1-y;Buffer.BlockCopy(rgba,y*stride,row,0,stride);Buffer.BlockCopy(rgba,opposite*stride,rgba,y*stride,stride);Buffer.BlockCopy(row,0,rgba,opposite*stride,stride);}var tex=new Texture2D((int)info.width,(int)info.height,TextureFormat.RGBA32,false){filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};owned.Add(tex);tex.LoadRawTextureData(rgba);tex.Apply(false,false);
                    int fw=(int)info.width,fh=(int)info.height;if(info.frames==1&&asset.FrameWidth>0&&asset.FrameHeight>0){if(asset.FrameWidth!=Math.Floor(asset.FrameWidth)||asset.FrameHeight!=Math.Floor(asset.FrameHeight))throw new NativeDataException("动画帧尺寸必须为整数");fw=(int)asset.FrameWidth;fh=(int)asset.FrameHeight;}if(fw<1||fh<1||fw>tex.width||fh>tex.height||asset.FrameWidth<0||asset.FrameHeight<0||asset.Fps<0||asset.Fps>240)throw new NativeDataException("动画帧尺寸或FPS无效："+asset.Path);
                    for(int y=0;y<tex.height/fh;y++)for(int x=0;x<tex.width/fw;x++){var sprite=Sprite.Create(tex,new Rect(x*fw,tex.height-(y+1)*fh,fw,fh),new Vector2(.5f,.5f),32);owned.Add(sprite);sprites.Add(sprite);timing.Milliseconds.Add(delay);}}
                Frames.Add(asset.Id,sprites.ToArray());if(info.frames>1)Timings.Add(asset.Id,timing);}}
        static Tuple<int,int> JpegSize(byte[] bytes){if(bytes.Length<4||bytes[0]!=255||bytes[1]!=216)throw new NativeDataException("JPEG文件头无效");int at=2;while(at+3<bytes.Length){if(bytes[at++]!=255)continue;while(at<bytes.Length&&bytes[at]==255)at++;if(at>=bytes.Length)break;int marker=bytes[at++];if(marker==217||marker==218)break;if(marker==1||marker>=208&&marker<=215)continue;if(at+1>=bytes.Length)break;int length=bytes[at]*256+bytes[at+1];if(length<2||at+length>bytes.Length)break;if(marker>=192&&marker<=207&&marker!=196&&marker!=200&&marker!=204&&length>=7)return Tuple.Create(bytes[at+5]*256+bytes[at+6],bytes[at+3]*256+bytes[at+4]);at+=length;}throw new NativeDataException("JPEG尺寸无效");}
        void Budget(int w,int h){if(w<1||h<1||w>8192||h>8192||decodedBytes+(long)w*h*4>128L*1024*1024)throw new NativeDataException("解码图像超过8192边长或128MiB预算");decodedBytes+=(long)w*h*4;}
        public static string Binding(NativeProject p,NativeCourse c,NativeRoom r,string type,string slot,NativeObject o=null)
        {
            string own=(string)o?.AssetOverrides?[slot];if(!string.IsNullOrEmpty(own))return own;
            var binding=r.ArtBindings?.Property(type)!=null?r.ArtBindings[type]:c.ArtBindings?[type];string selected=(string)binding?[slot];if(!string.IsNullOrEmpty(selected))return selected;
            return (string)p.NormalizedJson["blockDefaults"]?[type]?["assets"]?[slot];
        }
        internal static void Release(UnityEngine.Object obj){if(obj==null)return;if(obj is GameObject go)go.SetActive(false);if(Application.isPlaying)UnityEngine.Object.Destroy(obj);else UnityEngine.Object.DestroyImmediate(obj);}
        public void Dispose(){foreach(var o in owned)Release(o);owned.Clear();Frames.Clear();Timings.Clear();}
    }
}
