// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var sdk_pb = require('./sdk_pb.js');
var google_protobuf_empty_pb = require('google-protobuf/google/protobuf/empty_pb.js');
var google_protobuf_descriptor_pb = require('google-protobuf/google/protobuf/descriptor_pb.js');

function serialize_cafesdk_Data(arg) {
  if (!(arg instanceof sdk_pb.Data)) {
    throw new Error('Expected argument of type cafesdk.Data');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_cafesdk_Data(buffer_arg) {
  return sdk_pb.Data.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_cafesdk_InputJSONStringResponse(arg) {
  if (!(arg instanceof sdk_pb.InputJSONStringResponse)) {
    throw new Error('Expected argument of type cafesdk.InputJSONStringResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_cafesdk_InputJSONStringResponse(buffer_arg) {
  return sdk_pb.InputJSONStringResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_cafesdk_LogBody(arg) {
  if (!(arg instanceof sdk_pb.LogBody)) {
    throw new Error('Expected argument of type cafesdk.LogBody');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_cafesdk_LogBody(buffer_arg) {
  return sdk_pb.LogBody.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_cafesdk_Response(arg) {
  if (!(arg instanceof sdk_pb.Response)) {
    throw new Error('Expected argument of type cafesdk.Response');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_cafesdk_Response(buffer_arg) {
  return sdk_pb.Response.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_cafesdk_TableHeader(arg) {
  if (!(arg instanceof sdk_pb.TableHeader)) {
    throw new Error('Expected argument of type cafesdk.TableHeader');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_cafesdk_TableHeader(buffer_arg) {
  return sdk_pb.TableHeader.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_google_protobuf_Empty(arg) {
  if (!(arg instanceof google_protobuf_empty_pb.Empty)) {
    throw new Error('Expected argument of type google.protobuf.Empty');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_google_protobuf_Empty(buffer_arg) {
  return google_protobuf_empty_pb.Empty.deserializeBinary(new Uint8Array(buffer_arg));
}


var ParameterService = exports.ParameterService = {
  getInputJSONString: {
    path: '/cafesdk.Parameter/GetInputJSONString',
    requestStream: false,
    responseStream: false,
    requestType: google_protobuf_empty_pb.Empty,
    responseType: sdk_pb.InputJSONStringResponse,
    requestSerialize: serialize_google_protobuf_Empty,
    requestDeserialize: deserialize_google_protobuf_Empty,
    responseSerialize: serialize_cafesdk_InputJSONStringResponse,
    responseDeserialize: deserialize_cafesdk_InputJSONStringResponse,
  },
};

exports.ParameterClient = grpc.makeGenericClientConstructor(ParameterService, 'Parameter');
var ResultService = exports.ResultService = {
  setTableHeader: {
    path: '/cafesdk.Result/SetTableHeader',
    requestStream: false,
    responseStream: false,
    requestType: sdk_pb.TableHeader,
    responseType: sdk_pb.Response,
    requestSerialize: serialize_cafesdk_TableHeader,
    requestDeserialize: deserialize_cafesdk_TableHeader,
    responseSerialize: serialize_cafesdk_Response,
    responseDeserialize: deserialize_cafesdk_Response,
  },
  pushData: {
    path: '/cafesdk.Result/PushData',
    requestStream: false,
    responseStream: false,
    requestType: sdk_pb.Data,
    responseType: sdk_pb.Response,
    requestSerialize: serialize_cafesdk_Data,
    requestDeserialize: deserialize_cafesdk_Data,
    responseSerialize: serialize_cafesdk_Response,
    responseDeserialize: deserialize_cafesdk_Response,
  },
};

exports.ResultClient = grpc.makeGenericClientConstructor(ResultService, 'Result');
var LogService = exports.LogService = {
  debug: {
    path: '/cafesdk.Log/Debug',
    requestStream: false,
    responseStream: false,
    requestType: sdk_pb.LogBody,
    responseType: sdk_pb.Response,
    requestSerialize: serialize_cafesdk_LogBody,
    requestDeserialize: deserialize_cafesdk_LogBody,
    responseSerialize: serialize_cafesdk_Response,
    responseDeserialize: deserialize_cafesdk_Response,
  },
  info: {
    path: '/cafesdk.Log/Info',
    requestStream: false,
    responseStream: false,
    requestType: sdk_pb.LogBody,
    responseType: sdk_pb.Response,
    requestSerialize: serialize_cafesdk_LogBody,
    requestDeserialize: deserialize_cafesdk_LogBody,
    responseSerialize: serialize_cafesdk_Response,
    responseDeserialize: deserialize_cafesdk_Response,
  },
  warn: {
    path: '/cafesdk.Log/Warn',
    requestStream: false,
    responseStream: false,
    requestType: sdk_pb.LogBody,
    responseType: sdk_pb.Response,
    requestSerialize: serialize_cafesdk_LogBody,
    requestDeserialize: deserialize_cafesdk_LogBody,
    responseSerialize: serialize_cafesdk_Response,
    responseDeserialize: deserialize_cafesdk_Response,
  },
  error: {
    path: '/cafesdk.Log/Error',
    requestStream: false,
    responseStream: false,
    requestType: sdk_pb.LogBody,
    responseType: sdk_pb.Response,
    requestSerialize: serialize_cafesdk_LogBody,
    requestDeserialize: deserialize_cafesdk_LogBody,
    responseSerialize: serialize_cafesdk_Response,
    responseDeserialize: deserialize_cafesdk_Response,
  },
};

exports.LogClient = grpc.makeGenericClientConstructor(LogService, 'Log');
