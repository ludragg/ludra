#include <windows.h>
#include <stdint.h>
#include <stdlib.h>
#include "nvEncodeAPI.h"

#define LUDRA_SLOTS 16
#define LUDRA_KEYFRAME_SECONDS 4
#define LUDRA_VBV_FRACTION 4

typedef NVENCSTATUS(NVENCAPI *ludra_create_instance)(NV_ENCODE_API_FUNCTION_LIST *);
typedef NVENCSTATUS(NVENCAPI *ludra_max_version)(uint32_t *);

typedef struct {
    NV_ENCODE_API_FUNCTION_LIST api;
    void *session;
    NV_ENC_INITIALIZE_PARAMS init;
    NV_ENC_CONFIG config;
    NV_ENC_OUTPUT_PTR bitstream;
    struct {
        void *texture;
        NV_ENC_REGISTERED_PTR handle;
    } slots[LUDRA_SLOTS];
    int used;
    NV_ENC_INPUT_PTR mapped;
    int locked;
} ludra_nvenc;

static void ludra_rate(NV_ENC_CONFIG *config, uint32_t bitrate)
{
    config->rcParams.rateControlMode = NV_ENC_PARAMS_RC_CBR;
    config->rcParams.averageBitRate = bitrate;
    config->rcParams.maxBitRate = bitrate;
    config->rcParams.vbvBufferSize = bitrate / LUDRA_VBV_FRACTION;
    config->rcParams.vbvInitialDelay = bitrate / LUDRA_VBV_FRACTION;
}

void ludra_nvenc_release(ludra_nvenc *encoder)
{
    if (encoder->locked) {
        encoder->api.nvEncUnlockBitstream(encoder->session, encoder->bitstream);
        encoder->locked = 0;
    }
    if (encoder->mapped) {
        encoder->api.nvEncUnmapInputResource(encoder->session, encoder->mapped);
        encoder->mapped = NULL;
    }
}

void ludra_nvenc_close(ludra_nvenc *encoder)
{
    if (!encoder) {
        return;
    }
    if (encoder->session) {
        ludra_nvenc_release(encoder);
        if (encoder->bitstream) {
            NV_ENC_PIC_PARAMS last = {0};
            last.version = NV_ENC_PIC_PARAMS_VER;
            last.encodePicFlags = NV_ENC_PIC_FLAG_EOS;
            encoder->api.nvEncEncodePicture(encoder->session, &last);
        }
        for (int index = 0; index < encoder->used; index++) {
            encoder->api.nvEncUnregisterResource(encoder->session, encoder->slots[index].handle);
        }
        if (encoder->bitstream) {
            encoder->api.nvEncDestroyBitstreamBuffer(encoder->session, encoder->bitstream);
        }
        encoder->api.nvEncDestroyEncoder(encoder->session);
    }
    free(encoder);
}

static GUID ludra_preset(uint32_t effort)
{
    if (effort == 0) {
        return NV_ENC_PRESET_P1_GUID;
    }
    return effort == 1 ? NV_ENC_PRESET_P3_GUID : NV_ENC_PRESET_P5_GUID;
}

static NVENCSTATUS ludra_configure(ludra_nvenc *encoder, uint32_t width, uint32_t height,
                                   uint32_t fps, uint32_t bitrate, uint32_t effort)
{
    GUID chosen = ludra_preset(effort);
    NV_ENC_PRESET_CONFIG preset = {0};
    preset.version = NV_ENC_PRESET_CONFIG_VER;
    preset.presetCfg.version = NV_ENC_CONFIG_VER;
    NVENCSTATUS status = encoder->api.nvEncGetEncodePresetConfigEx(
        encoder->session, NV_ENC_CODEC_H264_GUID, chosen,
        NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY, &preset);
    if (status != NV_ENC_SUCCESS) {
        return status;
    }

    uint32_t period = fps * LUDRA_KEYFRAME_SECONDS;
    encoder->config = preset.presetCfg;
    encoder->config.version = NV_ENC_CONFIG_VER;
    encoder->config.profileGUID = NV_ENC_H264_PROFILE_HIGH_GUID;
    encoder->config.gopLength = period;
    encoder->config.frameIntervalP = 1;
    encoder->config.rcParams.multiPass = NV_ENC_MULTI_PASS_DISABLED;
    encoder->config.rcParams.enableLookahead = 0;
    encoder->config.rcParams.zeroReorderDelay = 1;
    ludra_rate(&encoder->config, bitrate);

    NV_ENC_CONFIG_H264 *codec = &encoder->config.encodeCodecConfig.h264Config;
    codec->idrPeriod = period;
    codec->repeatSPSPPS = 1;
    codec->chromaFormatIDC = 1;
    codec->h264VUIParameters.videoSignalTypePresentFlag = 1;
    codec->h264VUIParameters.videoFormat = 5;
    codec->h264VUIParameters.videoFullRangeFlag = 0;
    codec->h264VUIParameters.colourDescriptionPresentFlag = 1;
    codec->h264VUIParameters.colourPrimaries = 1;
    codec->h264VUIParameters.transferCharacteristics = 1;
    codec->h264VUIParameters.colourMatrix = 1;

    encoder->init.version = NV_ENC_INITIALIZE_PARAMS_VER;
    encoder->init.encodeGUID = NV_ENC_CODEC_H264_GUID;
    encoder->init.presetGUID = chosen;
    encoder->init.tuningInfo = NV_ENC_TUNING_INFO_ULTRA_LOW_LATENCY;
    encoder->init.encodeWidth = width;
    encoder->init.encodeHeight = height;
    encoder->init.darWidth = width;
    encoder->init.darHeight = height;
    encoder->init.maxEncodeWidth = width;
    encoder->init.maxEncodeHeight = height;
    encoder->init.frameRateNum = fps;
    encoder->init.frameRateDen = 1;
    encoder->init.enablePTD = 1;
    encoder->init.enableEncodeAsync = 0;
    encoder->init.encodeConfig = &encoder->config;
    status = encoder->api.nvEncInitializeEncoder(encoder->session, &encoder->init);
    if (status != NV_ENC_SUCCESS) {
        return status;
    }

    NV_ENC_CREATE_BITSTREAM_BUFFER buffer = {0};
    buffer.version = NV_ENC_CREATE_BITSTREAM_BUFFER_VER;
    status = encoder->api.nvEncCreateBitstreamBuffer(encoder->session, &buffer);
    if (status == NV_ENC_SUCCESS) {
        encoder->bitstream = buffer.bitstreamBuffer;
    }
    return status;
}

int ludra_nvenc_open(void *create_instance, void *max_version, void *device, uint32_t width,
                     uint32_t height, uint32_t fps, uint32_t bitrate, uint32_t effort,
                     ludra_nvenc **result)
{
    *result = NULL;
    uint32_t supported = 0;
    NVENCSTATUS status = ((ludra_max_version)max_version)(&supported);
    if (status != NV_ENC_SUCCESS) {
        return status;
    }
    if (supported < ((NVENCAPI_MAJOR_VERSION << 4) | NVENCAPI_MINOR_VERSION)) {
        return NV_ENC_ERR_INVALID_VERSION;
    }

    ludra_nvenc *encoder = calloc(1, sizeof(ludra_nvenc));
    if (!encoder) {
        return NV_ENC_ERR_OUT_OF_MEMORY;
    }
    encoder->api.version = NV_ENCODE_API_FUNCTION_LIST_VER;
    status = ((ludra_create_instance)create_instance)(&encoder->api);
    if (status == NV_ENC_SUCCESS) {
        NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS session = {0};
        session.version = NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS_VER;
        session.deviceType = NV_ENC_DEVICE_TYPE_DIRECTX;
        session.device = device;
        session.apiVersion = NVENCAPI_VERSION;
        status = encoder->api.nvEncOpenEncodeSessionEx(&session, &encoder->session);
    }
    if (status == NV_ENC_SUCCESS) {
        status = ludra_configure(encoder, width, height, fps, bitrate, effort);
    }
    if (status != NV_ENC_SUCCESS) {
        ludra_nvenc_close(encoder);
        return status;
    }
    *result = encoder;
    return NV_ENC_SUCCESS;
}

static NVENCSTATUS ludra_register(ludra_nvenc *encoder, void *texture, NV_ENC_REGISTERED_PTR *handle)
{
    for (int index = 0; index < encoder->used; index++) {
        if (encoder->slots[index].texture == texture) {
            *handle = encoder->slots[index].handle;
            return NV_ENC_SUCCESS;
        }
    }
    if (encoder->used == LUDRA_SLOTS) {
        return NV_ENC_ERR_OUT_OF_MEMORY;
    }
    NV_ENC_REGISTER_RESOURCE resource = {0};
    resource.version = NV_ENC_REGISTER_RESOURCE_VER;
    resource.resourceType = NV_ENC_INPUT_RESOURCE_TYPE_DIRECTX;
    resource.width = encoder->init.encodeWidth;
    resource.height = encoder->init.encodeHeight;
    resource.resourceToRegister = texture;
    resource.bufferFormat = NV_ENC_BUFFER_FORMAT_NV12;
    resource.bufferUsage = NV_ENC_INPUT_IMAGE;
    NVENCSTATUS status = encoder->api.nvEncRegisterResource(encoder->session, &resource);
    if (status == NV_ENC_SUCCESS) {
        encoder->slots[encoder->used].texture = texture;
        encoder->slots[encoder->used].handle = resource.registeredResource;
        encoder->used++;
        *handle = resource.registeredResource;
    }
    return status;
}

int ludra_nvenc_encode(ludra_nvenc *encoder, void *texture, uint64_t timestamp, int keyframe,
                       const uint8_t **data, uint32_t *size)
{
    *data = NULL;
    *size = 0;
    ludra_nvenc_release(encoder);

    NV_ENC_REGISTERED_PTR handle = NULL;
    NVENCSTATUS status = ludra_register(encoder, texture, &handle);
    if (status != NV_ENC_SUCCESS) {
        return status;
    }
    NV_ENC_MAP_INPUT_RESOURCE mapping = {0};
    mapping.version = NV_ENC_MAP_INPUT_RESOURCE_VER;
    mapping.registeredResource = handle;
    status = encoder->api.nvEncMapInputResource(encoder->session, &mapping);
    if (status != NV_ENC_SUCCESS) {
        return status;
    }
    encoder->mapped = mapping.mappedResource;

    NV_ENC_PIC_PARAMS picture = {0};
    picture.version = NV_ENC_PIC_PARAMS_VER;
    picture.inputWidth = encoder->init.encodeWidth;
    picture.inputHeight = encoder->init.encodeHeight;
    picture.inputPitch = encoder->init.encodeWidth;
    picture.inputBuffer = mapping.mappedResource;
    picture.bufferFmt = mapping.mappedBufferFmt;
    picture.outputBitstream = encoder->bitstream;
    picture.pictureStruct = NV_ENC_PIC_STRUCT_FRAME;
    picture.inputTimeStamp = timestamp;
    if (keyframe) {
        picture.encodePicFlags = NV_ENC_PIC_FLAG_FORCEIDR | NV_ENC_PIC_FLAG_OUTPUT_SPSPPS;
    }
    status = encoder->api.nvEncEncodePicture(encoder->session, &picture);
    if (status == NV_ENC_ERR_NEED_MORE_INPUT) {
        ludra_nvenc_release(encoder);
        return NV_ENC_SUCCESS;
    }
    if (status == NV_ENC_SUCCESS) {
        NV_ENC_LOCK_BITSTREAM lock = {0};
        lock.version = NV_ENC_LOCK_BITSTREAM_VER;
        lock.outputBitstream = encoder->bitstream;
        status = encoder->api.nvEncLockBitstream(encoder->session, &lock);
        if (status == NV_ENC_SUCCESS) {
            encoder->locked = 1;
            *data = (const uint8_t *)lock.bitstreamBufferPtr;
            *size = lock.bitstreamSizeInBytes;
        }
    }
    if (status != NV_ENC_SUCCESS) {
        ludra_nvenc_release(encoder);
    }
    return status;
}

int ludra_nvenc_set_bitrate(ludra_nvenc *encoder, uint32_t bitrate)
{
    ludra_rate(&encoder->config, bitrate);
    NV_ENC_RECONFIGURE_PARAMS parameters = {0};
    parameters.version = NV_ENC_RECONFIGURE_PARAMS_VER;
    parameters.reInitEncodeParams = encoder->init;
    parameters.reInitEncodeParams.encodeConfig = &encoder->config;
    return encoder->api.nvEncReconfigureEncoder(encoder->session, &parameters);
}
