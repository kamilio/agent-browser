import { pageBlobBootstrapSource } from "./page-blob-bootstrap.js";
import { pageUrlBootstrapSource } from "./page-url-bootstrap.js";

// Shared guest event/message machinery runs inside each owning SafeJS realm.
export const pageWorkerSupportSource = `
const apply = Reflect.apply, push = Array.prototype.push, slice = Array.prototype.slice;
const pop = Array.prototype.pop, NativeWeakSet = WeakSet;
const has = WeakSet.prototype.has, add = WeakSet.prototype.add;
const indexOf = Array.prototype.indexOf, splice = Array.prototype.splice;
const clone = structuredClone, keys = Object.keys;
const NativeString = String, define = Object.defineProperty;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const typedBuffer = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'buffer').get;
const viewBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer').get;
const regexpSource = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source').get;
const isView = ArrayBuffer.isView;
const mapEntries = Map.prototype.entries, setValues = Set.prototype.values;
const mapSize = Object.getOwnPropertyDescriptor(Map.prototype, 'size').get;
const setSize = Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
const binaryMessages = api.binaryMessages === true;
const binaryLimit = binaryMessages ? 1048576 : 65536;
function text(value) {
 if (typeof value === 'symbol') throw new TypeError('Invalid Worker string');
 const result = NativeString(value);
 if (result.length > 4096) throw new RangeError('Worker input limit exceeded');
 return result;
}
function copied(value, options) {
 let transfers;
 if (options != null) {
  if (typeof options !== 'object' && typeof options !== 'function') throw new TypeError('Invalid Worker message options');
  const transfer = Array.isArray(options) ? options : options.transfer;
  if (transfer !== undefined) {
   if (transfer === null || (typeof transfer !== 'object' && typeof transfer !== 'function')) throw new TypeError('Invalid Worker transfer list');
   transfers=[]; let bytes=0;
   for (const entry of transfer) {
    if (transfers.length >= 64) throw new RangeError('Worker transfer list limit exceeded');
    let length; try {length=apply(bufferLength,entry,[]);} catch {}
    if (length !== undefined) {bytes+=length; if(bytes>binaryLimit) throw new RangeError('Worker transfer byte limit exceeded');}
    apply(push,transfers,[entry]);
   }
  }
 }
 const result = transfers === undefined ? clone(value) : clone(value,{transfer:transfers});
 // Bound the first traversal before exporting a native graph. No guest getter
 // runs here: structuredClone already converted own enumerable accessors.
 const pending = [[result, 0]], seen = new NativeWeakSet(); let units = 0, binaryBytes = 0;
 while (pending.length) {
  const item = apply(pop,pending,[]), data = item[0], depth = item[1];
  if (depth > 128) throw new RangeError('Worker message depth limit exceeded');
  if (typeof data === 'string') units += data.length;
  else if (data !== null && typeof data === 'object' && !apply(has,seen,[data])) {
   apply(add,seen,[data]); units++;
   let length;
   try { length = apply(bufferLength, data, []); } catch {}
   if (length !== undefined) {if(binaryMessages) binaryBytes += length; else units += length;}
   else if (isView(data)) {
    let buffer; try {buffer=apply(typedBuffer,data,[]);} catch {buffer=apply(viewBuffer,data,[]);}
    apply(push,pending,[[buffer,depth+1]]);
   }
   else {
    let map = false, set = false;
    try { apply(mapSize, data, []); map = true; } catch {}
    if (!map) {try { apply(setSize, data, []); set = true; } catch {}}
    if (map) for (const pair of apply(mapEntries, data, [])) {apply(push,pending,[[pair[0],depth+1],[pair[1],depth+1]]); units+=2; if(units>65536) throw new RangeError('Worker message limit exceeded');}
    else if (set) for (const entry of apply(setValues, data, [])) {apply(push,pending,[[entry,depth+1]]); units++; if(units>65536) throw new RangeError('Worker message limit exceeded');}
    else {
     let source; try {source=apply(regexpSource,data,[]);} catch {}
     if(source!==undefined) units+=source.length+8;
     else for (const key of keys(data)) {units += key.length + 1; if(units>65536) throw new RangeError('Worker message limit exceeded'); apply(push,pending,[[data[key],depth+1]]);}
    }
   }
  } else units++;
  if (units > 65536 || binaryBytes > binaryLimit) throw new RangeError('Worker message limit exceeded');
 }
 return result;
}
function events(target, report) {
 const listeners = [], handlers = {message:null,error:null,messageerror:null};
 const names = new Set(['message','error','messageerror']);
 function add(type, callback, options) {
  type = text(type); if (callback == null) return;
  if (typeof callback !== 'function' && typeof callback !== 'object') throw new TypeError('Invalid Worker listener');
  const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
  const once = Boolean(options && typeof options === 'object' && options.once);
  if (options && typeof options === 'object' && options.signal !== undefined) throw new TypeError('Worker listener signals are not yet supported');
  for (const item of listeners) if(item.type === type && item.callback === callback && item.capture === capture) return;
  if (listeners.length >= 128) throw new RangeError('Worker listener limit exceeded');
  apply(push,listeners,[{type,callback,capture,once}]);
 }
 function remove(type, callback, options) {
  type = text(type); const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
  for (let i=0;i<listeners.length;i++) {const item=listeners[i]; if(item.type===type && item.callback===callback && item.capture===capture) {apply(splice,listeners,[i,1]); return;}}
 }
 function dispatch(packet) {
  let stopped = false;
  const event = {type:packet.type, data:packet.data, message:packet.message || '', target, currentTarget:target,
   origin:'', lastEventId:'', ports:[], source:null, bubbles:false, cancelable:packet.type==='error', composed:false,
   defaultPrevented:false, eventPhase:2, isTrusted:true,
   preventDefault() {if(this.cancelable) this.defaultPrevented=true;}, stopPropagation() {}, stopImmediatePropagation() {stopped=true;}};
  function invoke(callback) {
   try { if(typeof callback === 'function') apply(callback,target,[event]); else if(callback && typeof callback.handleEvent === 'function') apply(callback.handleEvent,callback,[event]); }
   catch { report('Worker event listener failed'); }
  }
  const snapshot = apply(slice,listeners,[]);
  for (const item of snapshot) {
   if(stopped) break;
   if(item.type!==packet.type || apply(indexOf,listeners,[item])<0) continue;
   if(item.once) apply(splice,listeners,[apply(indexOf,listeners,[item]),1]);
   invoke(item.callback);
  }
  if(!stopped && names.has(packet.type)) invoke(handlers[packet.type]);
  event.currentTarget=null; event.eventPhase=0;
 }
 for (const name of names) define(target,'on'+name,{enumerable:true,configurable:true,get:()=>handlers[name],set:value=>{handlers[name]=typeof value==='function'?value:null;}});
 return {add,remove,dispatch};
}
`;

export const pageWorkerBootstrapSource = `(() => {
 const api = __agentBrowserWindowGlobal.workers;
 if (api === undefined) return;
 ${pageWorkerSupportSource}
 const NativeURL = URL;
 const ports = new WeakMap(), targets = new WeakMap();
 const get = WeakMap.prototype.get, set = WeakMap.prototype.set;
 function port(receiver) {const value=apply(get,ports,[receiver]); if(!value) throw new TypeError('Invalid Worker receiver'); return value;}
 class Worker {
  constructor(url, options=undefined) {
   if(arguments.length===0) throw new TypeError('Missing Worker URL');
   const resolved = new NativeURL(text(url), api.baseUrl).href;
   if(options != null && typeof options!=='object' && typeof options!=='function') throw new TypeError('Invalid Worker options');
   const rawCredentials = options == null ? undefined : options.credentials;
   const credentials = rawCredentials === undefined ? 'same-origin' : text(rawCredentials);
   if(!['omit','same-origin','include'].includes(credentials)) throw new TypeError('Invalid Worker credentials');
   const rawName = options == null ? undefined : options.name;
   const name = rawName === undefined ? '' : text(rawName);
   const rawType = options == null ? undefined : options.type;
   const type = rawType === undefined ? 'classic' : text(rawType);
   if(type !== 'classic') throw new TypeError('Module workers are not yet supported');
   const target = events(this, message => api.report(message));
   apply(set,targets,[this,target]);
   apply(set,ports,[this,api.create(resolved,name,packet=>target.dispatch(packet))]);
  }
  postMessage(data, options=undefined) {if(arguments.length===0) throw new TypeError('Missing Worker message'); const owner=port(this); if(owner.accepting) owner.post(copied(data,options));}
  terminate() {port(this).terminate();}
  addEventListener(type, callback, options=undefined) {port(this); apply(get,targets,[this]).add(type,callback,options);}
  removeEventListener(type, callback, options=undefined) {port(this); apply(get,targets,[this]).remove(type,callback,options);}
 }
 define(Worker.prototype,Symbol.toStringTag,{value:'Worker',configurable:true});
 define(globalThis,'Worker',{value:Worker,writable:true,configurable:true});
})();`;

export const workerGlobalBootstrapSource = `(() => {
 const api = __agentBrowserWorker;
 ${pageWorkerSupportSource}
 class WorkerGlobalScope {constructor() {throw new TypeError('Illegal WorkerGlobalScope constructor');}}
 class DedicatedWorkerGlobalScope extends WorkerGlobalScope {}
 define(DedicatedWorkerGlobalScope.prototype,Symbol.toStringTag,{value:'DedicatedWorkerGlobalScope',configurable:true});
 Object.setPrototypeOf(globalThis,DedicatedWorkerGlobalScope.prototype);
 define(globalThis,'WorkerGlobalScope',{value:WorkerGlobalScope,writable:true,configurable:true});
 define(globalThis,'DedicatedWorkerGlobalScope',{value:DedicatedWorkerGlobalScope,writable:true,configurable:true});
 define(globalThis,'self',{value:globalThis,writable:true,configurable:true});
 const target = events(globalThis, message => api.report(message));
 api.bind(packet=>target.dispatch(packet));
 api.bindSelf(globalThis);
 define(globalThis,'name',{value:api.name,writable:true,configurable:true});
 const location = api.location;
 define(location,'toString',{value:()=>location.href});
 define(globalThis,'location',{value:Object.freeze(location),configurable:true});
 const identity = api.navigator;
 const navigator = {userAgent:identity.userAgent,language:identity.language,languages:Object.freeze(identity.languages)};
 define(navigator,Symbol.toStringTag,{value:'WorkerNavigator',configurable:true});
 define(globalThis,'navigator',{value:Object.freeze(navigator),configurable:true});
 define(globalThis,'performance',{value:api.performance,writable:true,configurable:true});
 define(globalThis,'importScripts',{value:function importScripts(...urls) {if(urls.length>32) throw new RangeError('Worker import argument limit exceeded'); const converted=[]; for(const url of urls) apply(push,converted,[text(url)]); return api.importScripts(converted);},writable:true,configurable:true});
 define(globalThis,'postMessage',{value:function postMessage(data,options=undefined) {if(arguments.length===0) throw new TypeError('Missing Worker message'); if(api.accepting) api.post(copied(data,options));},writable:true,configurable:true});
 define(globalThis,'close',{value:()=>api.close(),writable:true,configurable:true});
 define(globalThis,'addEventListener',{value:target.add,writable:true,configurable:true});
 define(globalThis,'removeEventListener',{value:target.remove,writable:true,configurable:true});
 for (const name of ['setTimeout','setInterval']) define(globalThis,name,{value:function(callback,delay=0,...args) {if(typeof callback!=='function') throw new TypeError('Worker timers require functions'); return api[name](callback,+delay,...args);},writable:true,configurable:true});
 for (const name of ['clearTimeout','clearInterval']) define(globalThis,name,{value:(id)=>api[name](id === undefined ? undefined : +id),writable:true,configurable:true});
})();
${pageUrlBootstrapSource.replace("__agentBrowserWindowGlobal.urls", "__agentBrowserWorker.urls")}
${pageBlobBootstrapSource.replace("__agentBrowserWindowGlobal.blobs", "__agentBrowserWorker.blobs")}`;
