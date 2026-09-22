// Guest-only wrapper shared by the forthcoming page and Worker WASM installers.
// The bridge must be admitted and owned by the enclosing SafeJS extension.
export const pageWasmMemoryBootstrapSource = `(() => {
 const api=__agentBrowserWasmMemories;
 const apply=Reflect.apply, get=WeakMap.prototype.get, set=WeakMap.prototype.set;
 const records=new WeakMap(), define=Object.defineProperty;
 const truncate=Math.trunc, finite=Number.isFinite, NativeBoolean=Boolean, NativeString=String;
 function index(value) {
  if(typeof value==='bigint')throw new TypeError('Invalid WASM memory index');
  const number=+value;
  if(!finite(number)||number<0||number>4294967295)throw new TypeError('Invalid WASM memory index');
  return truncate(number);
 }
 function record(receiver) {
  const result=apply(get,records,[receiver]);
  if(result===undefined)throw new TypeError('Invalid WebAssembly.Memory receiver');
  return result;
 }
 class Memory {
  constructor(descriptor) {
   if(descriptor===null||(typeof descriptor!=='object'&&typeof descriptor!=='function'))throw new TypeError('Invalid WASM memory descriptor');
   const initial=descriptor.initial;
   if(initial===undefined)throw new TypeError('Missing WASM memory initial');
   const minimum=index(initial), maximumInput=descriptor.maximum;
   const maximum=maximumInput===undefined?undefined:index(maximumInput);
   const shared=NativeBoolean(descriptor.shared), address=descriptor.address;
   if(shared|| (address!==undefined&&NativeString(address)!=='i32'))throw new TypeError('Only unshared wasm32 memory is supported');
   apply(set,records,[this,api.create(minimum,maximum)]);
  }
  get buffer(){return record(this).buffer;}
  grow(delta){return record(this).grow(index(delta));}
 }
 define(Memory.prototype,Symbol.toStringTag,{value:'WebAssembly.Memory',configurable:true});
 const namespace={Memory};
 define(namespace,Symbol.toStringTag,{value:'WebAssembly',configurable:true});
 define(globalThis,'WebAssembly',{value:namespace,writable:true,configurable:true});
})();`;
