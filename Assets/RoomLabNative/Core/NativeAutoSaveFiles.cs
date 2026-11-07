using System;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;

namespace RoomLab.Native
{
    public sealed class NativeAutoSaveHistory
    {
        public bool Exists;public string Error;public long Generation;public JArray Entries=new JArray();
        public bool Readable=>Exists&&Error==null;
    }
    public sealed class NativeAutoSaveFiles
    {
        public const int Count=3;
        const int MaxBytes=12*1024*1024;
        readonly string source;
        public string HistoryPath {get;}
        public NativeAutoSaveFiles(string baseDirectory,string sourceHash)
        {
            if(sourceHash==null||sourceHash.Length!=64||sourceHash.Any(c=>!Uri.IsHexDigit(c)))throw new ArgumentException("关卡标识无效");
            source=sourceHash;HistoryPath=Path.Combine(baseDirectory,"auto-history-v1",sourceHash,"history.json");
        }
        public NativeAutoSaveHistory Read()
        {
            var result=new NativeAutoSaveHistory{Exists=File.Exists(HistoryPath)};if(!result.Exists)return result;
            try
            {
                if(new FileInfo(HistoryPath).Length>MaxBytes)throw new NativeDataException("自动存档文件太大");
                var data=JObject.Parse(File.ReadAllText(HistoryPath));
                if(data["version"]?.Type!=JTokenType.Integer||(int)data["version"]!=1||(string)data["source"]!=source||data["generation"]?.Type!=JTokenType.Integer||!(data["entries"] is JArray entries)||entries.Count<1||entries.Count>Count)throw new NativeDataException("自动存档格式不匹配");
                long generation=(long)data["generation"];if(generation<1)throw new NativeDataException("自动存档代次无效");
                foreach(var entry in entries)
                    if(!(entry is JObject)||!(entry["continuation"] is JObject cp)||(string)entry["source"]!=source||(string)cp["source"]!=source||!DateTimeOffset.TryParse((string)entry["savedAt"],out _))throw new NativeDataException("自动存档条目无效");
                result.Generation=generation;result.Entries=(JArray)entries.DeepClone();
            }
            catch(Exception e){result.Error=e is NativeDataException?e.Message:"自动存档暂时读不了";}
            return result;
        }
        public void Write(NativeAutoSaveRequest request)
        {if(request==null)throw new ArgumentNullException(nameof(request));Write(request.Continuation,request.Chapter,request.Kind,request.Room,request.Collected,request.Reason);}
        public void Write(JObject continuation,string chapter,string kind,string room,int collected,string reason)
        {
            if(continuation==null||(string)continuation["source"]!=source)throw new NativeDataException("关卡来源不匹配");
            var before=Read();if(before.Exists&&!before.Readable)throw new NativeDataException(before.Error);
            if(before.Generation==long.MaxValue)throw new NativeDataException("自动存档代次已满");
            var entries=new JArray(new JObject{{"source",source},{"savedAt",DateTimeOffset.UtcNow.ToString("O")},{"chapter",chapter},{"kind",kind},{"room",room},{"collected",collected},{"reason",reason},{"continuation",continuation.DeepClone()}});
            foreach(var prior in before.Entries.Take(Count-1))entries.Add(prior.DeepClone());
            var data=new JObject{{"version",1},{"source",source},{"generation",before.Generation+1},{"entries",entries}};
            string json=data.ToString();if(Encoding.UTF8.GetByteCount(json)>MaxBytes)throw new NativeDataException("自动存档文件太大");
            Directory.CreateDirectory(Path.GetDirectoryName(HistoryPath));string temporary=HistoryPath+"."+Guid.NewGuid().ToString("N")+".tmp";
            try{File.WriteAllText(temporary,json);if(File.Exists(HistoryPath))File.Replace(temporary,HistoryPath,null);else File.Move(temporary,HistoryPath);}
            finally{if(File.Exists(temporary))File.Delete(temporary);}
        }
    }
}
