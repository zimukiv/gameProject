using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
namespace RoomLab.Native
{
    public sealed class NativeSaveSlot
    {
        public int Number;public bool Exists;public string Error;public JObject Data;
        public bool Readable=>Exists&&Error==null&&Data!=null;
    }
    public sealed class NativeSaveSlotFiles
    {
        public const int Count=6;const int MaxBytes=4*1024*1024;
        readonly string root,source;
        public NativeSaveSlotFiles(string baseDirectory,string sourceHash)
        {
            if(sourceHash==null||sourceHash.Length!=64||sourceHash.Any(c=>!Uri.IsHexDigit(c)))throw new ArgumentException("关卡标识无效");
            source=sourceHash;root=Path.Combine(baseDirectory,"manual-slots-v1",sourceHash);
        }
        public string FilePath(int number){if(number<1||number>Count)throw new ArgumentOutOfRangeException(nameof(number));return Path.Combine(root,"slot-"+number.ToString("00")+".json");}
        public NativeSaveSlot Read(int number)
        {
            var slot=new NativeSaveSlot{Number=number};string file=FilePath(number);slot.Exists=File.Exists(file);if(!slot.Exists)return slot;
            try{if(new FileInfo(file).Length>MaxBytes)throw new NativeDataException("文件太大");var data=JObject.Parse(File.ReadAllText(file));
                if((int?)data["version"]!=1||(int?)data["slot"]!=number||(string)data["source"]!=source||!(data["continuation"] is JObject cp)||(string)cp["source"]!=source)throw new NativeDataException("存档格式不匹配");
                if(!DateTimeOffset.TryParse((string)data["savedAt"],out _))throw new NativeDataException("存档时间无效");slot.Data=data;
            }catch(Exception e){slot.Error=e is NativeDataException?e.Message:"文件暂时读不了";}return slot;
        }
        public void Write(int number,JObject continuation,string chapter,string kind,string room,int collected)
        {
            string file=FilePath(number);if(continuation==null||(string)continuation["source"]!=source)throw new NativeDataException("关卡来源不匹配");
            var data=new JObject{{"version",1},{"slot",number},{"source",source},{"savedAt",DateTimeOffset.UtcNow.ToString("O")},{"chapter",chapter},{"kind",kind},{"room",room},{"collected",collected},{"continuation",continuation.DeepClone()}};
            string json=data.ToString();if(System.Text.Encoding.UTF8.GetByteCount(json)>MaxBytes)throw new NativeDataException("这一份存档太大了");
            Directory.CreateDirectory(root);string temporary=file+"."+Guid.NewGuid().ToString("N")+".tmp";
            try{File.WriteAllText(temporary,json);if(File.Exists(file))File.Replace(temporary,file,null);else File.Move(temporary,file);}
            finally{if(File.Exists(temporary))File.Delete(temporary);}
        }
    }
}
