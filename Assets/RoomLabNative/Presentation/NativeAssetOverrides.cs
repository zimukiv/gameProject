using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
namespace RoomLab.Native
{
    // Optional local, data-only overrides. Built-in assets remain the fallback.
    public static class NativeAssetOverrides
    {
        static readonly Dictionary<string,Texture2D> textures=new Dictionary<string,Texture2D>();
        static readonly Dictionary<string,AudioClip> clips=new Dictionary<string,AudioClip>();
        static JObject ui;
        public static string Root {get{var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"-nativeCustomAssetsPath");return i>=0&&i+1<args.Length?Path.GetFullPath(args[i+1]):Path.GetFullPath(Path.Combine(Application.dataPath,"../自定义资产"));}}
        static string FileFor(string category,string name,string extension){if(Path.GetFileName(name)!=name||name.IndexOfAny(Path.GetInvalidFileNameChars())>=0)throw new ArgumentException("Invalid asset key");return Path.Combine(Root,category,name+extension);}
        static void Warn(string name,Exception e){Debug.LogWarning("CUSTOM_ASSET_FALLBACK "+name+" : "+e.Message);}
        public static Texture2D Texture(string name,Texture2D fallback){
            if(textures.TryGetValue(name,out var result))return result??fallback;
            Texture2D texture=null;try{string path=FileFor("images",name,".png");if(!File.Exists(path)){textures[name]=null;return fallback;}
                var info=new FileInfo(path);if(info.Length>16*1024*1024)throw new Exception("PNG超过16MB");byte[] bytes=File.ReadAllBytes(path);
                if(bytes.Length<24||bytes[0]!=137||Encoding.ASCII.GetString(bytes,1,3)!="PNG")throw new Exception("需要PNG格式");
                int width=(bytes[16]<<24)|(bytes[17]<<16)|(bytes[18]<<8)|bytes[19],height=(bytes[20]<<24)|(bytes[21]<<16)|(bytes[22]<<8)|bytes[23];
                if(fallback==null||width!=fallback.width||height!=fallback.height)throw new Exception("尺寸须与资产目录一致："+(fallback==null?"未知":fallback.width+"x"+fallback.height));
                texture=new Texture2D(2,2,TextureFormat.RGBA32,false);if(!ImageConversion.LoadImage(texture,bytes,false))throw new Exception("PNG解码失败");texture.name="custom:"+name;texture.filterMode=FilterMode.Point;texture.wrapMode=TextureWrapMode.Clamp;texture.Apply(false,true);textures[name]=texture;Debug.Log("CUSTOM_IMAGE_LOADED "+name);return texture;
            }catch(Exception e){if(texture!=null)UnityEngine.Object.Destroy(texture);Warn(name,e);textures[name]=null;return fallback;}
        }
        public static AudioClip Audio(string name,AudioClip fallback){
            if(clips.TryGetValue(name,out var cached))return cached??fallback;
            try{string path=FileFor("audio",name,".wav");if(!File.Exists(path)){clips[name]=null;return fallback;}
                if(new FileInfo(path).Length>64*1024*1024)throw new Exception("WAV超过64MB");
                using(var stream=File.OpenRead(path))using(var r=new BinaryReader(stream)){
                    string Four()=>Encoding.ASCII.GetString(r.ReadBytes(4));
                    if(Four()!="RIFF")throw new Exception("需要RIFF WAV");r.ReadUInt32();if(Four()!="WAVE")throw new Exception("需要WAVE");
                    int format=0,channels=0,rate=0,bits=0;byte[] data=null;
                    while(stream.Position+8<=stream.Length){string type=Four();uint size=r.ReadUInt32();long end=stream.Position+size;if(end>stream.Length)throw new Exception("WAV块损坏");if(type=="fmt "){if(size<16)throw new Exception("WAV格式块损坏");format=r.ReadUInt16();channels=r.ReadUInt16();rate=r.ReadInt32();r.ReadInt32();r.ReadUInt16();bits=r.ReadUInt16();}else if(type=="data")data=r.ReadBytes(checked((int)size));stream.Position=end+(size%2);}
                    if(format!=1||bits!=16||(channels!=1&&channels!=2)||rate<8000||rate>48000||data==null||data.Length==0||data.Length%(channels*2)!=0)throw new Exception("需16-bit PCM、单/双声道、8–48kHz WAV");
                    int frames=data.Length/(2*channels);if(frames/(double)rate>180)throw new Exception("单文件最多180秒");var samples=new float[data.Length/2];for(int n=0;n<samples.Length;n++)samples[n]=(short)(data[n*2]|data[n*2+1]<<8)/32768f;
                    var clip=AudioClip.Create("custom:"+name,frames,channels,rate,false);clip.SetData(samples,0);clips[name]=clip;Debug.Log("CUSTOM_AUDIO_LOADED "+name);return clip;
                }
            }catch(Exception e){Warn(name,e);clips[name]=null;return fallback;}
        }
        static JObject UI {get{if(ui!=null)return ui;try{string path=Path.Combine(Root,"ui.json");ui=File.Exists(path)&&new FileInfo(path).Length<65536?JObject.Parse(File.ReadAllText(path)):new JObject();}catch(Exception e){Warn("ui.json",e);ui=new JObject();}return ui;}}
        public static string Title{get{var value=UI["title"];string title=value?.Type==JTokenType.String?(string)value:null;return !string.IsNullOrWhiteSpace(title)&&title.Length<=12&&!System.Array.Exists(title.ToCharArray(),char.IsControl)?title:"DDL · 截止之前";}}
        public static Color ColorSetting(string key,Color fallback){try{string text=(string)UI[key];return text!=null&&ColorUtility.TryParseHtmlString(text,out var color)?new Color(color.r,color.g,color.b,1):fallback;}catch{return fallback;}}
    }
}
