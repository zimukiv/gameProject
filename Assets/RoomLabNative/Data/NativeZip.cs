using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace RoomLab.Native
{
    // ZipArchive supplies decompression; independently checked central/local metadata and CRC
    // prevent successful inflation from being mistaken for an intact RoomLab archive.
    internal static class NativeZip
    {
        sealed class Entry { public string Name;public uint Crc,Size,Compressed,Offset;public ushort Method,Flags; }
        static uint U32(byte[] b,int at){if(at<0||at>b.Length-4)throw Fail("ZIP元数据截断");return (uint)(b[at]|b[at+1]<<8|b[at+2]<<16|b[at+3]<<24);}
        static ushort U16(byte[] b,int at){if(at<0||at>b.Length-2)throw Fail("ZIP元数据截断");return (ushort)(b[at]|b[at+1]<<8);}
        static NativeDataException Fail(string message){return NativeProjectLoader.Bad(message);}
        static string Name(byte[] b,int at,int length){if(at<0||length<0||at>b.Length-length)throw Fail("ZIP文件名截断");try{return new UTF8Encoding(false,true).GetString(b,at,length);}catch(DecoderFallbackException){throw Fail("ZIP文件名不是UTF8");}}
        static void SafeName(string name)
        {
            if(string.IsNullOrEmpty(name)||name.StartsWith("/")||name.IndexOfAny(new[]{'\\',':','\0'})>=0)throw Fail("ZIP路径不安全");
            var clean=name.EndsWith("/")?name.Substring(0,name.Length-1):name;foreach(var segment in clean.Split('/'))if(segment==""||segment=="."||segment=="..")throw Fail("ZIP路径不安全");
        }
        public static Dictionary<string,byte[]> Read(byte[] bytes)
        {
            int end=-1;for(int i=bytes.Length-22;i>=Math.Max(0,bytes.Length-65557);i--)if(U32(bytes,i)==0x06054b50&&i+22+U16(bytes,i+20)==bytes.Length){end=i;break;}
            if(end<0)throw Fail("ZIP缺少完整中央目录");
            if(U16(bytes,end+4)!=0||U16(bytes,end+6)!=0||U16(bytes,end+8)!=U16(bytes,end+10))throw Fail("不支持分卷ZIP");
            int count=U16(bytes,end+10);uint directorySize=U32(bytes,end+12),directoryOffset=U32(bytes,end+16);
            if((long)directoryOffset+directorySize!=end)throw Fail("ZIP中央目录范围无效");
            var entries=new Dictionary<string,Entry>(StringComparer.Ordinal);var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long declared=0;int at=checked((int)directoryOffset);
            for(int i=0;i<count;i++) {
                if(at>end-46||U32(bytes,at)!=0x02014b50)throw Fail("ZIP中央目录损坏");
                var e=new Entry {Flags=U16(bytes,at+8),Method=U16(bytes,at+10),Crc=U32(bytes,at+16),Compressed=U32(bytes,at+20),Size=U32(bytes,at+24),Offset=U32(bytes,at+42)};
                int n=U16(bytes,at+28),extra=U16(bytes,at+30),comment=U16(bytes,at+32);e.Name=Name(bytes,at+46,n);SafeName(e.Name);
                if(!names.Add(e.Name))throw Fail("ZIP路径重复："+e.Name);if((e.Flags&1)!=0||e.Method!=0&&e.Method!=8)throw Fail("ZIP压缩方式不支持");
                declared+=e.Size;if(e.Size>NativeProjectLoader.EntryLimit||e.Compressed>NativeProjectLoader.EntryLimit||declared>NativeProjectLoader.TotalLimit)throw Fail("ZIP容量超过限制");
                if(e.Offset>int.MaxValue)throw Fail("ZIP条目偏移无效");int local=(int)e.Offset;
                if(local>directoryOffset-30||U32(bytes,local)!=0x04034b50)throw Fail("ZIP本地头无效");
                if(U16(bytes,local+6)!=e.Flags||U16(bytes,local+8)!=e.Method)throw Fail("ZIP本地头不一致");
                int localNameLength=U16(bytes,local+26),localExtra=U16(bytes,local+28);if(Name(bytes,local+30,localNameLength)!=e.Name)throw Fail("ZIP文件名不一致");
                if((e.Flags&8)==0&&(U32(bytes,local+14)!=e.Crc||U32(bytes,local+18)!=e.Compressed||U32(bytes,local+22)!=e.Size))throw Fail("ZIP本地CRC或尺寸不一致");
                long data=(long)local+30+localNameLength+localExtra;if(data+e.Compressed>directoryOffset)throw Fail("ZIP压缩内容截断");
                at=checked(at+46+n+extra+comment);if(at>end)throw Fail("ZIP目录条目越界");entries.Add(e.Name,e);
            }
            if(at!=end)throw Fail("ZIP目录尺寸不一致");
            var result=new Dictionary<string,byte[]>(StringComparer.Ordinal);long actualTotal=0;
            try {
                using(var memory=new MemoryStream(bytes,false))using(var archive=new ZipArchive(memory,ZipArchiveMode.Read,false,Encoding.UTF8)) {
                    if(archive.Entries.Count!=count)throw Fail("ZIP条目数量不一致");
                    foreach(var entry in archive.Entries) {
                        if(!entries.TryGetValue(entry.FullName,out var meta)||entry.Length!=meta.Size||entry.CompressedLength!=meta.Compressed)throw Fail("ZIP条目尺寸不一致");
                        // Read and validate every entry, including unreferenced data, within limits.
                        using(var input=entry.Open())using(var output=new MemoryStream()) {
                            var buffer=new byte[8192];int n;while((n=input.Read(buffer,0,buffer.Length))>0) {
                                actualTotal+=n;if(output.Length+n>meta.Size||output.Length+n>NativeProjectLoader.EntryLimit||actualTotal>NativeProjectLoader.TotalLimit)throw Fail("ZIP实际解压容量超过限制");output.Write(buffer,0,n);
                            }
                            var data=output.ToArray();if(data.Length!=meta.Size||Crc32(data)!=meta.Crc)throw Fail("ZIP条目长度或CRC校验失败："+entry.FullName);
                            if(entry.FullName=="project.json"||entry.FullName.StartsWith("assets/",StringComparison.Ordinal)&&!entry.FullName.EndsWith("/"))result.Add(entry.FullName,data);
                        }
                    }
                }
            } catch(NativeDataException){throw;}catch(Exception e) when(e is InvalidDataException||e is IOException||e is ArgumentException){throw Fail("ZIP解压失败："+e.Message);}
            return result;
        }
        internal static uint Crc32(byte[] bytes){uint crc=0xffffffff;foreach(byte b in bytes){crc^=b;for(int i=0;i<8;i++)crc=(crc&1)!=0?0xedb88320^(crc>>1):crc>>1;}return crc^0xffffffff;}
    }
}
