#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincodec.h>
#include <shlwapi.h>
#include <wrl/client.h>
#include <vector>
#include <stdexcept>
#include <cstring>
#include <memory>
#include <algorithm>
#include "roomlab_images.h"
#include "webp/demux.h"
using Microsoft::WRL::ComPtr;
namespace {
constexpr size_t EncodedLimit=25u*1024*1024,DecodedLimit=128u*1024*1024;
constexpr uint32_t SideLimit=4096,FrameLimit=1024;
struct Frame { std::vector<uint8_t> rgba;uint32_t duration; };
void require(bool v,const char* message){if(!v)throw std::runtime_error(message);}
void hr(HRESULT result,const char* message){require(SUCCEEDED(result),message);}
size_t canvasBytes(uint32_t w,uint32_t h,uint32_t count){
    require(w&&h&&w<=SideLimit&&h<=SideLimit,"Dimensions exceed 1..4096");
    require(count&&count<=FrameLimit,"Frame count exceeds 1..1024");
    const size_t n=size_t(w)*h*4;
    require(n<=DecodedLimit/(size_t(count)+3),"RGBA frames plus composition buffers exceed 128 MiB");return n;
}
struct Apartment {HRESULT result=CoInitializeEx(nullptr,COINIT_MULTITHREADED);Apartment(){require(SUCCEEDED(result)||result==RPC_E_CHANGED_MODE,"COM initialization failed");}~Apartment(){if(SUCCEEDED(result))CoUninitialize();}};
void validateGifBlocks(const uint8_t* b,size_t n){
    require(n>=14,"Truncated GIF header");size_t at=13;
    auto take=[&](size_t count){require(count<=n-at,"Truncated GIF block");at+=count;};
    if(b[10]&0x80)take(size_t(3)<<(1+(b[10]&7)));
    auto blocks=[&](){for(;;){require(at<n,"Truncated GIF sub-block");size_t count=b[at++];if(!count)break;take(count);}};
    uint32_t frames=0;for(;;){require(at<n,"Missing GIF trailer");uint8_t kind=b[at++];if(kind==0x3b){require(at==n&&frames,"Unexpected GIF trailing bytes");return;}
        if(kind==0x21){require(at<n,"Truncated GIF extension");at++;blocks();}
        else if(kind==0x2c){require(++frames<=FrameLimit,"Frame count exceeds 1..1024");require(n-at>=9,"Truncated GIF descriptor");uint8_t packed=b[at+8];take(9);if(packed&0x80)take(size_t(3)<<(1+(packed&7)));require(at<n&&b[at]>=2&&b[at]<=8,"Invalid GIF LZW code size");at++;blocks();}
        else throw std::runtime_error("Invalid GIF block marker");
    }
}
struct Property {PROPVARIANT v;Property(){PropVariantInit(&v);}~Property(){PropVariantClear(&v);}};
uint32_t number(IWICMetadataQueryReader* reader,const wchar_t* key,uint32_t fallback){Property p;if(!reader||FAILED(reader->GetMetadataByName(key,&p.v)))return fallback;switch(p.v.vt){case VT_UI1:return p.v.bVal;case VT_UI2:return p.v.uiVal;case VT_UI4:return p.v.ulVal;case VT_BOOL:return p.v.boolVal?1:0;default:return fallback;}}
}
struct RlImage {RlImageInfo info{};std::vector<Frame> frames;};
namespace {
std::unique_ptr<RlImage> decodeWebp(const uint8_t* bytes,size_t length){
    WebPData data{bytes,length};WebPAnimDecoderOptions options;
    // Inspect canvas/count before AnimDecoderNew allocates decoder pixel buffers.
    std::unique_ptr<WebPDemuxer,decltype(&WebPDemuxDelete)> demux(WebPDemux(&data),WebPDemuxDelete);
    require(bool(demux),"Invalid WebP container");canvasBytes(WebPDemuxGetI(demux.get(),WEBP_FF_CANVAS_WIDTH),WebPDemuxGetI(demux.get(),WEBP_FF_CANVAS_HEIGHT),WebPDemuxGetI(demux.get(),WEBP_FF_FRAME_COUNT));
    require(WebPAnimDecoderOptionsInit(&options)!=0,"WebP ABI mismatch");options.color_mode=MODE_RGBA;options.use_threads=0;
    std::unique_ptr<WebPAnimDecoder,decltype(&WebPAnimDecoderDelete)> decoder(WebPAnimDecoderNew(&data,&options),WebPAnimDecoderDelete);
    require(bool(decoder),"Invalid WebP");WebPAnimInfo info{};require(WebPAnimDecoderGetInfo(decoder.get(),&info)!=0,"Invalid WebP info");
    const size_t n=canvasBytes(info.canvas_width,info.canvas_height,info.frame_count);
    auto image=std::make_unique<RlImage>();image->info={info.canvas_width,info.canvas_height,info.frame_count,info.loop_count,2};image->frames.reserve(info.frame_count);
    int previous=0;while(WebPAnimDecoderHasMoreFrames(decoder.get())){uint8_t* rgba=nullptr;int timestamp=0;require(image->frames.size()<info.frame_count,"Unexpected WebP frame count");require(WebPAnimDecoderGetNext(decoder.get(),&rgba,&timestamp)!=0&&rgba&&timestamp>=previous,"Invalid WebP frame");
        Frame f;f.duration=uint32_t(timestamp-previous);f.rgba.assign(rgba,rgba+n);image->frames.push_back(std::move(f));previous=timestamp;}
    require(image->frames.size()==info.frame_count,"Incomplete WebP frames");return image;
}
// WIC supplies raw subframes. Composition below follows Microsoft's WicAnimatedGif
// state ordering: dispose prior frame, save canvas for disposal 3, overlay current.
std::unique_ptr<RlImage> decodeGif(const uint8_t* bytes,size_t length){
    validateGifBlocks(bytes,length);
    Apartment apartment;ComPtr<IWICImagingFactory> factory;hr(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)),"WIC unavailable");
    ComPtr<IStream> stream;stream.Attach(SHCreateMemStream(bytes,UINT(length)));require(bool(stream),"GIF stream allocation failed");
    ComPtr<IWICBitmapDecoder> decoder;hr(factory->CreateDecoderFromStream(stream.Get(),nullptr,WICDecodeMetadataCacheOnLoad,&decoder),"Invalid GIF");
    GUID format{};hr(decoder->GetContainerFormat(&format),"GIF format unavailable");require(format==GUID_ContainerFormatGif,"Not GIF");
    ComPtr<IWICMetadataQueryReader> global;hr(decoder->GetMetadataQueryReader(&global),"GIF screen metadata unavailable");
    uint32_t width=number(global.Get(),L"/logscrdesc/Width",0),height=number(global.Get(),L"/logscrdesc/Height",0);UINT count=0;hr(decoder->GetFrameCount(&count),"GIF frame count unavailable");const size_t n=canvasBytes(width,height,count);
    auto image=std::make_unique<RlImage>();image->info={width,height,count,1,1};image->frames.reserve(count);
    Property app,loops;
    if(SUCCEEDED(global->GetMetadataByName(L"/appext/application",&app.v))&&app.v.vt==(VT_VECTOR|VT_UI1)&&app.v.caub.cElems==11&&
       (std::memcmp(app.v.caub.pElems,"NETSCAPE2.0",11)==0||std::memcmp(app.v.caub.pElems,"ANIMEXTS1.0",11)==0)&&
       SUCCEEDED(global->GetMetadataByName(L"/appext/data",&loops.v))&&loops.v.vt==(VT_VECTOR|VT_UI1)&&loops.v.caub.cElems>=4&&loops.v.caub.pElems[0]==3&&loops.v.caub.pElems[1]==1){uint32_t repeats=loops.v.caub.pElems[2]|uint32_t(loops.v.caub.pElems[3])<<8;image->info.play_count=repeats?repeats+1:0;}
    uint8_t background[4]={0,0,0,0};ComPtr<IWICPalette> palette;hr(factory->CreatePalette(&palette),"GIF palette unavailable");
    if(number(global.Get(),L"/logscrdesc/GlobalColorTableFlag",0)&&SUCCEEDED(decoder->CopyPalette(palette.Get()))){WICColor colors[256];UINT actual=0;if(SUCCEEDED(palette->GetColors(256,colors,&actual))){uint32_t index=number(global.Get(),L"/logscrdesc/BackgroundColorIndex",0);if(index<actual){auto c=colors[index];background[0]=uint8_t(c>>16);background[1]=uint8_t(c>>8);background[2]=uint8_t(c);background[3]=255;}}}
    std::vector<uint8_t> canvas(n,0),saved;uint32_t previousDisposal=0,px=0,py=0,pw=0,ph=0;bool previousTransparent=false;
    for(UINT i=0;i<count;i++){
        if(previousDisposal==2){for(uint32_t y=py;y<py+ph;y++)for(uint32_t x=px;x<px+pw;x++){auto d=&canvas[(size_t(y)*width+x)*4];if(previousTransparent)std::memset(d,0,4);else std::memcpy(d,background,4);}}
        else if(previousDisposal==3){require(saved.size()==n,"GIF restore canvas missing");canvas=saved;}
        ComPtr<IWICBitmapFrameDecode> frame;hr(decoder->GetFrame(i,&frame),"Invalid GIF frame");ComPtr<IWICMetadataQueryReader> metadata;hr(frame->GetMetadataQueryReader(&metadata),"GIF frame metadata unavailable");
        UINT fw=0,fh=0;hr(frame->GetSize(&fw,&fh),"GIF frame size unavailable");uint32_t x=number(metadata.Get(),L"/imgdesc/Left",0),y=number(metadata.Get(),L"/imgdesc/Top",0),disposal=number(metadata.Get(),L"/grctlext/Disposal",0);
        require(fw&&fh&&x<=width&&y<=height&&fw<=width-x&&fh<=height-y,"GIF frame outside canvas");require(disposal<=3,"Unsupported GIF disposal");
        bool transparent=number(metadata.Get(),L"/grctlext/TransparencyFlag",0)!=0;
        if(i==0&&!transparent)for(size_t k=0;k<n;k+=4)std::memcpy(canvas.data()+k,background,4);
        if(disposal==3)saved=canvas;else saved.clear();
        ComPtr<IWICFormatConverter> converter;hr(factory->CreateFormatConverter(&converter),"WIC converter unavailable");hr(converter->Initialize(frame.Get(),GUID_WICPixelFormat32bppRGBA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom),"GIF RGBA conversion failed");
        std::vector<uint8_t> pixels(size_t(fw)*fh*4);hr(converter->CopyPixels(nullptr,fw*4,UINT(pixels.size()),pixels.data()),"GIF frame decode failed");
        for(uint32_t cy=0;cy<fh;cy++)for(uint32_t cx=0;cx<fw;cx++){const uint8_t* s=&pixels[(size_t(cy)*fw+cx)*4];uint8_t* d=&canvas[(size_t(y+cy)*width+x+cx)*4];if(s[3])std::memcpy(d,s,4);}
        image->frames.push_back(Frame{canvas,number(metadata.Get(),L"/grctlext/Delay",0)*10});previousDisposal=disposal;previousTransparent=transparent;px=x;py=y;pw=fw;ph=fh;
    }
    return image;
}
}
uint32_t __cdecl RlImageAbi(void){return 1;}
int __cdecl RlImageDecode(const uint8_t* bytes,size_t length,RlImage** output,char* error,size_t capacity){
    if(output)*output=nullptr;if(error&&capacity)error[0]=0;
    try{require(output&&bytes&&length&&length<=EncodedLimit,"Input must be 1..25 MiB");std::unique_ptr<RlImage> result;
        if(length>=6&&(!std::memcmp(bytes,"GIF89a",6)||!std::memcmp(bytes,"GIF87a",6)))result=decodeGif(bytes,length);
        else if(length>=12&&!std::memcmp(bytes,"RIFF",4)&&!std::memcmp(bytes+8,"WEBP",4))result=decodeWebp(bytes,length);
        else throw std::runtime_error("Only GIF and WebP are supported");*output=result.release();return 0;
    }catch(const std::exception& e){if(error&&capacity){strncpy_s(error,capacity,e.what(),_TRUNCATE);}return 1;}catch(...){if(error&&capacity)strncpy_s(error,capacity,"Unexpected native decoder error",_TRUNCATE);return 2;}
}
int __cdecl RlImageGetInfo(const RlImage* image,RlImageInfo* info){if(!image||!info)return 1;*info=image->info;return 0;}
int __cdecl RlImageGetFrame(const RlImage* image,uint32_t index,const uint8_t** rgba,size_t* length,uint32_t* duration){if(!image||index>=image->frames.size()||!rgba||!length||!duration)return 1;auto& f=image->frames[index];*rgba=f.rgba.data();*length=f.rgba.size();*duration=f.duration;return 0;}
void __cdecl RlImageFree(RlImage* image){delete image;}
