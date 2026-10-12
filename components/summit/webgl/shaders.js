export const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const fluidFragment = `
precision highp float;
varying vec2 vUv;
uniform float uTime; uniform float uProgress; uniform float uIntensity; uniform vec2 uMouse; uniform float uPanel; uniform float uAspect; uniform float uPanelTop;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=noise(p)*a;p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}return s;}
void main(){
 vec2 p=vec2(vUv.x*1.1+vUv.y*.65,vUv.y*2.3);p+=(uMouse-.5)*.035;
 float t=uTime*.045; vec2 q=vec2(fbm(p+t),fbm(p+vec2(5.2,1.3)-t));
 float f=fbm(p+3.*q+vec2(t,-t*.4));
 float ridges=pow(1.-abs(f*2.-1.),6.);
 vec3 black=vec3(.027,.02,.02),burnt=vec3(.35,.063,.031),orange=vec3(.91,.27,.039),amber=vec3(.96,.66,.267);
 vec3 c=mix(black,burnt,smoothstep(.18,.5,f));c=mix(c,orange,smoothstep(.4,.74,f));c=mix(c,amber,pow(smoothstep(.55,.88,f),8.)*.35);
 c+=pow(max(0.,f-.75)*4.,4.)*vec3(.2,.15,.08);
 c+=(hash(gl_FragCoord.xy+uTime)-.5)*.012;
 float edge=uProgress*1.4-.2;float alpha=1.-smoothstep(edge-.07,edge+.045,vUv.y+(f-.5)*.12);
 if(uPanel>.5){
 c=mix(orange,c,.14);
 float top=uPanelTop*min(uProgress/1.2,1.);
 vec2 d=abs(vec2((vUv.x-.5)*uAspect,vUv.y-top*.5))-vec2(.5*uAspect,top*.5)+.05;
 float sdf=length(max(d,0.))+min(max(d.x,d.y),0.)-.05;
 alpha*=1.-smoothstep(-.002,.002,sdf);
 }
 gl_FragColor=vec4(c*uIntensity,alpha);
}`;
export const textFragment = `
precision highp float;
varying vec2 vUv;uniform sampler2D uTexture;uniform vec2 uMouse;uniform vec2 uTargetMouse;uniform float uTime;uniform float uRadius;uniform float uStrength;uniform float uVelocity;uniform float uAspect;
void main(){
 vec2 uv=vUv;vec2 d=(uv-uMouse)*vec2(uAspect,1.);float dist=length(d);float force=1.-smoothstep(0.,uRadius,dist);force*=force;
 vec2 dir=d/max(dist,.0001), tangent=vec2(-dir.y,dir.x);
 vec2 displacement=(dir*.026+tangent*(.024+uVelocity*.025))*force*uStrength;
 uv+=displacement/vec2(uAspect,1.);uv.x+=sin(uv.y*38.+uTime*1.5)*.006*force*uStrength;
 vec4 c=texture2D(uTexture,uv);gl_FragColor=c;
}`;
