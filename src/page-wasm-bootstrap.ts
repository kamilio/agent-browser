// Shared guest implementation; the owning installer supplies an admitted bridge.
export const pageWasmBootstrapSource = `(() => {
 const api=__agentBrowserWasm;
 const apply=Reflect.apply, define=Object.defineProperty, defineProperties=Object.defineProperties, create=Object.create;
 const get=WeakMap.prototype.get,set=WeakMap.prototype.set,push=Array.prototype.push;
 const modules=new WeakMap(),instances=new WeakMap(),memories=new WeakMap(),memoryWrappers=new WeakMap();
 const NativeUint8Array=Uint8Array, NativeString=String, NativeBoolean=Boolean, NativeBigInt=BigInt;
 const slice=Uint8Array.prototype.slice, finite=Number.isFinite,truncate=Math.trunc;
 const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
 const typedProto=Object.getPrototypeOf(Uint8Array.prototype);
 const typedBuffer=Object.getOwnPropertyDescriptor(typedProto,'buffer').get;
 const typedOffset=Object.getOwnPropertyDescriptor(typedProto,'byteOffset').get;
 const typedLength=Object.getOwnPropertyDescriptor(typedProto,'byteLength').get;
 const viewBuffer=Object.getOwnPropertyDescriptor(DataView.prototype,'buffer').get;
 const viewOffset=Object.getOwnPropertyDescriptor(DataView.prototype,'byteOffset').get;
 const viewLength=Object.getOwnPropertyDescriptor(DataView.prototype,'byteLength').get;
 const isView=ArrayBuffer.isView;
 class CompileError extends Error {constructor(message=''){super(message);this.name='CompileError';}}
 class LinkError extends Error {constructor(message=''){super(message);this.name='LinkError';}}
 class RuntimeError extends Error {constructor(message=''){super(message);this.name='RuntimeError';}}
 function translate(error,Type) {
  if(error&&['resource-limit','closed','aborted','budget'].includes(error.code))throw error;
  if(error instanceof Type)throw error;
  throw new Type(error&&error.message!==undefined?NativeString(error.message):'WebAssembly operation failed');
 }
 function record(map,receiver,label) {const value=apply(get,map,[receiver]);if(value===undefined)throw new TypeError('Invalid WebAssembly.'+label+' receiver');return value;}
 function index(value) {if(typeof value==='bigint')throw new TypeError('Invalid WASM memory index');const number=+value;if(!finite(number)||number<0||number>4294967295)throw new TypeError('Invalid WASM memory index');return truncate(number);}
 function bytes(value) {
  let buffer,offset=0,length;
  try {length=apply(bufferLength,value,[]);buffer=value;} catch {}
  if(buffer===undefined&&isView(value)) {
   try{buffer=apply(typedBuffer,value,[]);offset=apply(typedOffset,value,[]);length=apply(typedLength,value,[]);}
   catch {buffer=apply(viewBuffer,value,[]);offset=apply(viewOffset,value,[]);length=apply(viewLength,value,[]);}
  }
  if(buffer===undefined)throw new TypeError('WebAssembly requires a BufferSource');
  if(length>1048576)throw new RangeError('WASM source byte limit exceeded');
  return apply(slice,new NativeUint8Array(buffer,offset,length),[]);
 }
 function wrapMemory(port) {let value=apply(get,memoryWrappers,[port]);if(value===undefined){value=create(Memory.prototype);apply(set,memories,[value,port]);apply(set,memoryWrappers,[port,value]);}return value;}
 class Memory {
  constructor(descriptor) {
   if(descriptor===null||(typeof descriptor!=='object'&&typeof descriptor!=='function'))throw new TypeError('Invalid WASM memory descriptor');
   const initial=descriptor.initial;if(initial===undefined)throw new TypeError('Missing WASM memory initial');
   const minimum=index(initial), maximumInput=descriptor.maximum, maximum=maximumInput===undefined?undefined:index(maximumInput);
   const shared=NativeBoolean(descriptor.shared),address=descriptor.address;
   if(shared||(address!==undefined&&NativeString(address)!=='i32'))throw new TypeError('Only unshared wasm32 memory is supported');
   const port=api.memory(minimum,maximum);apply(set,memories,[this,port]);apply(set,memoryWrappers,[port,this]);
  }
  get buffer(){return record(memories,this,'Memory').buffer;}
  grow(delta){return record(memories,this,'Memory').grow(index(delta));}
 }
 function wrapModule(port){const value=create(Module.prototype);apply(set,modules,[value,port]);return value;}
 class Module {
  constructor(source){const input=bytes(source);let port;try{port=api.compileSync(input);}catch(error){translate(error,CompileError);}apply(set,modules,[this,port]);}
  static imports(module){const result=[];for(const entry of record(modules,module,'Module').imports)apply(push,result,[{module:entry.module,name:entry.name,kind:entry.kind}]);return result;}
  static exports(module){const result=[];for(const entry of record(modules,module,'Module').exports)apply(push,result,[{name:entry.name,kind:entry.kind}]);return result;}
 }
 function imports(port,input) {
  const declarations=port.imports,result=[];
  if(declarations.length&& (input===null||(typeof input!=='object'&&typeof input!=='function')))throw new LinkError('Missing WASM imports');
  for(const entry of declarations){
   const namespace=input[entry.module];if(namespace===null||(typeof namespace!=='object'&&typeof namespace!=='function'))throw new LinkError('Invalid WASM import namespace');
   const value=namespace[entry.name];
   if(entry.kind==='memory'){const memory=apply(get,memories,[value]);if(memory===undefined)throw new LinkError('Invalid WASM memory import');apply(push,result,[memory]);}
   else {if(typeof value!=='function')throw new LinkError('Invalid WASM function import');apply(push,result,[value]);}
  }
  return result;
 }
 function exports(port) {
  const result=create(null);
  for(const entry of port.exports){
   let value;
   if(entry.kind==='memory')value=wrapMemory(port.memory(entry.name));
   else if(entry.kind==='function'){
    value=(...args)=>{
     const converted=[];const parameters=entry.signature.parameters;
     for(let index=0;index<parameters.length;index++){const argument=args[index];if(parameters[index]===126){if(typeof argument==='number')throw new TypeError('WASM i64 requires BigInt');apply(push,converted,[NativeBigInt(argument)]);}else apply(push,converted,[+argument]);}
     try{return api.call(port,entry.name,converted);}catch(error){if(error&&error.name==='RuntimeError')translate(error,RuntimeError);throw error;}
    };
    defineProperties(value,entry.functionMetadata);
   }else throw new LinkError('Unsupported WASM export kind');
   define(result,entry.name,{value,enumerable:true});
  }
  return Object.freeze(result);
 }
 function instantiate(module,input) {const port=record(modules,module,'Module');const values=imports(port,input);let owner;try{owner=api.instantiate(port,values);}catch(error){if(error&&error.name==='RuntimeError')translate(error,RuntimeError);translate(error,LinkError);}return {port:owner,exports:exports(owner)};}
 class Instance {
  constructor(module,input=undefined){apply(set,instances,[this,instantiate(module,input)]);}
  get exports(){return record(instances,this,'Instance').exports;}
 }
 async function compile(source){const input=bytes(source);try{return wrapModule(await api.compile(input));}catch(error){translate(error,CompileError);}}
 async function instantiateAsync(source,input=undefined){if(apply(get,modules,[source])!==undefined)return new Instance(source,input);const module=await compile(source);return {module,instance:new Instance(module,input)};}
 for(const [Type,name] of [[Memory,'Memory'],[Module,'Module'],[Instance,'Instance']])define(Type.prototype,Symbol.toStringTag,{value:'WebAssembly.'+name,configurable:true});
 const namespace={Memory,Module,Instance,CompileError,LinkError,RuntimeError,validate:source=>api.validate(bytes(source)),compile,instantiate:instantiateAsync};
 define(namespace,Symbol.toStringTag,{value:'WebAssembly',configurable:true});
 define(globalThis,'WebAssembly',{value:namespace,writable:true,configurable:true});
})();`;
