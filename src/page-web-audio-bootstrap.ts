export const pageWebAudioBootstrapSource = `(() => {
 const api = __agentBrowserWebAudioBootstrap();
 const contexts = new WeakMap(), nodes = new WeakMap(), params = new WeakMap();
 const get = WeakMap.prototype.get, set = WeakMap.prototype.set, apply = Reflect.apply;
 const NativeStream = MediaStream, toNumber = Number, token = {};
 function port(map, receiver) { const value = apply(get,map,[receiver]); if (!value) throw new TypeError("Invalid audio receiver"); return value; }
 function numeric(value) { if (typeof value === "bigint" || typeof value === "symbol") throw new TypeError("Invalid audio number"); return toNumber(value); }
 class AudioParam {
  constructor(key, value, initial) { if(key!==token) throw new TypeError("Illegal AudioParam constructor"); apply(set,params,[this,{value,initial}]); }
  get value() { return port(params,this).value.value; }
  set value(value) { port(params,this).value.value=numeric(value); }
  get defaultValue() { return port(params,this).initial; }
  get minValue() { return port(params,this).value.minValue; }
  get maxValue() { return port(params,this).value.maxValue; }
  setValueAtTime(value,time) { port(params,this).value.set(numeric(value),numeric(time)); return this; }
 }
 class AudioNode {
  constructor(key,value,context,kind) { if(key!==token) throw new TypeError("Illegal AudioNode constructor"); apply(set,nodes,[this,{value,context,kind}]); }
  get context() { return port(nodes,this).context; }
  get numberOfInputs() { return port(nodes,this).kind==="oscillator"?0:1; }
  get numberOfOutputs() { return port(nodes,this).kind==="destination"?0:1; }
  connect(destination,output=0,input=0) { const source=port(nodes,this),target=port(nodes,destination); source.value.connect(target.value.id,numeric(input),numeric(output)); return destination; }
  disconnect(destination=undefined) { const source=port(nodes,this); source.value.disconnect(destination===undefined?undefined:port(nodes,destination).value.id); }
 }
 class OscillatorNode extends AudioNode {
  constructor(key,value,context) { super(key,value,context,"oscillator"); port(nodes,this).frequency=new AudioParam(token,value.parameter,440); }
  get frequency() { return port(nodes,this).frequency; }
  get type() { port(nodes,this); return "sine"; }
  set type(value) { port(nodes,this); if(value!=="sine") throw new TypeError("Only sine oscillators are supported"); }
  start(when=0) { port(nodes,this).value.start(numeric(when)); }
  stop(when=0) { port(nodes,this).value.stop(numeric(when)); }
 }
 class GainNode extends AudioNode {
  constructor(key,value,context) { super(key,value,context,"gain"); port(nodes,this).gain=new AudioParam(token,value.parameter,1); }
  get gain() { return port(nodes,this).gain; }
 }
 class MediaStreamAudioDestinationNode extends AudioNode {
  constructor(key,value,context,stream) { super(key,value,context,"destination"); port(nodes,this).stream=stream; }
  get stream() { return port(nodes,this).stream; }
 }
 class AudioContext {
  constructor(options={}) { const sampleRate=options.sampleRate; apply(set,contexts,[this,api.create(sampleRate===undefined?undefined:numeric(sampleRate))]); }
  get sampleRate() { return port(contexts,this).sampleRate; }
  get currentTime() { return port(contexts,this).currentTime; }
  get state() { return port(contexts,this).state; }
  createOscillator() { return new OscillatorNode(token,port(contexts,this).oscillator(),this); }
  createGain() { return new GainNode(token,port(contexts,this).gain(),this); }
  createMediaStreamDestination() { const context=port(contexts,this),stream=new NativeStream(); return new MediaStreamAudioDestinationNode(token,context.destination(stream.id),this,stream); }
  resume() { return port(contexts,this).resume(); }
  suspend() { return port(contexts,this).suspend(); }
  close() { return port(contexts,this).close(); }
 }
 for(const constructor of [AudioContext,AudioNode,AudioParam,OscillatorNode,GainNode,MediaStreamAudioDestinationNode]) {
  Object.defineProperty(constructor.prototype,Symbol.toStringTag,{value:constructor.name,configurable:true});
  Object.defineProperty(globalThis,constructor.name,{value:constructor,writable:true,configurable:true});
 }
 api.publish(AudioContext,AudioNode,AudioParam,OscillatorNode,GainNode,MediaStreamAudioDestinationNode);
})();`;
