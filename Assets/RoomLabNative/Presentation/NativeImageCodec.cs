using System;
using System.Runtime.InteropServices;
using System.Text;
using System.IO;
namespace RoomLab.Native
{
    // Official libwebp 1.6.0 + Windows WIC GIF, versioned memory-only C ABI.
    internal sealed class NativeImageCodec:IDisposable
    {
        [StructLayout(LayoutKind.Sequential)]internal struct Info{public uint width,height,frames,plays,format;}
        [DllImport("roomlab_images",CallingConvention=CallingConvention.Cdecl)]static extern uint RlImageAbi();
        [DllImport("roomlab_images",CallingConvention=CallingConvention.Cdecl)]static extern int RlImageDecode(byte[] input,UIntPtr length,out IntPtr image,StringBuilder error,UIntPtr capacity);
        [DllImport("roomlab_images",CallingConvention=CallingConvention.Cdecl)]static extern int RlImageGetInfo(IntPtr image,out Info info);
        [DllImport("roomlab_images",CallingConvention=CallingConvention.Cdecl)]static extern int RlImageGetFrame(IntPtr image,uint index,out IntPtr rgba,out UIntPtr length,out uint duration);
        [DllImport("roomlab_images",CallingConvention=CallingConvention.Cdecl)]static extern void RlImageFree(IntPtr image);
        IntPtr handle;internal Info Metadata{get;private set;}
        internal NativeImageCodec(byte[] bytes){RejectUnsupportedMetadata(bytes);if(RlImageAbi()!=1)throw new InvalidDataException("原生图像解码器版本不匹配");var error=new StringBuilder(256);if(RlImageDecode(bytes,new UIntPtr((uint)bytes.Length),out handle,error,new UIntPtr(256))!=0)throw new NativeDataException("原生图像解码失败："+error);try{if(RlImageGetInfo(handle,out var info)!=0)throw new InvalidDataException("原生图像信息无效");Metadata=info;}catch{Dispose();throw;}}
        static void RejectUnsupportedMetadata(byte[] b){if(b==null)throw new NativeDataException("图像为空");if(b.Length>=12&&Encoding.ASCII.GetString(b,0,4)=="RIFF"&&Encoding.ASCII.GetString(b,8,4)=="WEBP"){long at=12;while(at+8<=b.Length){string type=Encoding.ASCII.GetString(b,(int)at,4);uint size=BitConverter.ToUInt32(b,(int)at+4);if(type=="ICCP"||type=="EXIF")throw new NativeDataException("WebP色彩配置/EXIF方向转换尚不支持，候选保留未导入");at+=8L+size+(size&1);}}else if(b.Length>=13&&b[0]=='G'&&b[1]=='I'&&b[2]=='F'){int at=13+((b[10]&128)!=0?3*(1<<((b[10]&7)+1)):0);bool Skip(){while(at<b.Length){int n=b[at++];if(n==0)return true;at+=n;}return false;}while(at<b.Length){int tag=b[at++];if(tag==0x3b)break;if(tag==0x21){if(at>=b.Length)break;int label=b[at++];if(label==1)throw new NativeDataException("GIF文本扩展绘制尚不支持，候选保留未导入");if(!Skip())break;}else if(tag==0x2c){if(at+9>b.Length)break;int packed=b[at+8];at+=9+((packed&128)!=0?3*(1<<((packed&7)+1)):0);if(at>=b.Length)break;at++;if(!Skip())break;}else break;}}}
        internal uint Read(uint index,byte[] destination){if(handle==IntPtr.Zero||RlImageGetFrame(handle,index,out var data,out var length,out uint ms)!=0||length.ToUInt64()!=(ulong)destination.Length)throw new InvalidDataException("原生图像帧无效");Marshal.Copy(data,destination,0,destination.Length);return ms;}
        public void Dispose(){if(handle!=IntPtr.Zero){RlImageFree(handle);handle=IntPtr.Zero;}}
    }
}
