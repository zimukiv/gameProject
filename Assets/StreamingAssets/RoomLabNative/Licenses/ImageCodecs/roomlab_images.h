#pragma once
#include <stdint.h>
#include <stddef.h>
#ifdef _WIN32
#define RL_API __declspec(dllexport)
#else
#define RL_API
#endif
#ifdef __cplusplus
extern "C" {
#endif
typedef struct RlImage RlImage;
typedef struct RlImageInfo { uint32_t width,height,frame_count,play_count,format; } RlImageInfo;
// ABI 1. format: GIF=1, WebP=2. play_count: 0=infinite, otherwise total plays.
// RGBA is straight alpha, top row first. Durations are unmodified milliseconds.
// Returns 0 on success, nonzero on failure; output remains NULL on failure.
RL_API uint32_t __cdecl RlImageAbi(void);
RL_API int __cdecl RlImageDecode(const uint8_t* bytes,size_t length,RlImage** output,char* error,size_t error_capacity);
RL_API int __cdecl RlImageGetInfo(const RlImage* image,RlImageInfo* info);
// Pointer remains owned by image, valid until RlImageFree; caller must not modify it.
RL_API int __cdecl RlImageGetFrame(const RlImage* image,uint32_t index,const uint8_t** rgba,size_t* length,uint32_t* duration_ms);
RL_API void __cdecl RlImageFree(RlImage* image);
#ifdef __cplusplus
}
#endif
