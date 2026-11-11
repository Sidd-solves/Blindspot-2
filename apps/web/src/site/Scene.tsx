import { useEffect, useRef } from 'react';

/**
 * A live landscape behind the landing page, drawn by one WebGL fragment shader: sky, aurora ribbons, a sun or moon,
 * stars and four layers of hills. As the page scrolls it travels through five scenes (dusk, ocean, forest, sunset,
 * night) and the hills slide past at different speeds; the mouse tilts the view and moves the light.
 * Reduced motion: the scene still changes with scroll, but nothing drifts on its own.
 */
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r; uniform float t; uniform float s; uniform vec2 m; uniform float sc;
// Sine-free hash: stays stable at low precision (sin-based hashes streak on some phone GPUs).
float h(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+1.),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
vec3 pk(vec3 a,vec3 b,vec3 c,vec3 d,vec3 e,float x){
  float f=smoothstep(0.,1.,fract(x));
  return x<1.?mix(a,b,f):x<2.?mix(b,c,f):x<3.?mix(c,d,f):x<4.?mix(d,e,f):e;}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*r)/r.y; p+=m*.035;
  vec3 top=pk(vec3(.043,.024,.125),vec3(.008,.075,.145),vec3(.012,.082,.063),vec3(.10,.04,.07),vec3(.008,.012,.04),s);
  vec3 hor=pk(vec3(.23,.10,.35),vec3(.04,.29,.43),vec3(.05,.29,.21),vec3(.48,.18,.07),vec3(.08,.10,.23),s);
  vec3 aur=pk(vec3(.71,.42,1.),vec3(.13,.83,.93),vec3(.20,.83,.60),vec3(.98,.57,.24),vec3(.51,.55,.97),s);
  vec3 rdg=pk(vec3(.07,.04,.14),vec3(.016,.075,.12),vec3(.012,.067,.043),vec3(.086,.03,.024),vec3(.016,.02,.047),s);
  vec3 glw=pk(vec3(1.,.48,.85),vec3(.22,.74,.97),vec3(.64,.90,.21),vec3(.98,.75,.14),vec3(.88,.91,1.),s);
  vec3 col=mix(hor,top,smoothstep(-.25,.65,p.y+.1));
  // sun / moon
  vec2 sp=vec2(.38*sin(s*1.25+.6)+m.x*.06,.06+.12*cos(s*.9)+m.y*.03);
  float d=length(p-sp);
  col+=glw*(exp(-d*3.2)*.55+smoothstep(.075,.065,d)*.6);
  // aurora ribbons
  for(int i=0;i<3;i++){float fi=float(i);
    float y0=.2+fi*.09;
    float w=p.y-y0-.14*fbm(vec2(p.x*1.4+t*.04*(fi+1.),fi*3.1+t*.025));
    float band=exp(-abs(w)*16.)*(.45+.55*fbm(vec2(p.x*3.5+t*.15,fi*5.)));
    col+=aur*band*(.42-fi*.08);}
  // stars, mostly at night
  float stars=.15+.85*smoothstep(3.,4.,s)+.4*(1.-smoothstep(0.,.8,s));
  vec2 g=floor(gl_FragCoord.xy/2.);
  float tw=.6+.4*sin(mod(t*2.,6.2832)+h(g)*40.);
  col+=vec3(step(.9975,h(g))*stars*tw*smoothstep(-.1,.4,p.y));
  // hills, far to near, each sliding at its own speed as the page scrolls
  for(int j=0;j<4;j++){float fj=float(j);
    float hy=-.06-.11*fj+.2*fbm(vec2(p.x*(1.1+fj*.55)+sc*(.25+fj*.45)+fj*7.3,fj*2.));
    float a=smoothstep(hy+.004,hy-.004,p.y);
    vec3 rc=mix(hor*.9,rdg,.3+.23*fj);
    rc+=aur*.06*(3.-fj)*exp(-abs(p.y-hy)*25.);
    col=mix(col,rc,a);}
  // depth haze, vignette, film grain
  col=mix(col,hor,.08);
  vec2 q=gl_FragCoord.xy/r;
  col*=.55+.45*pow(16.*q.x*q.y*(1.-q.x)*(1.-q.y),.18);
  col+=(h(gl_FragCoord.xy+fract(t*.37)*97.)-.5)*.025;
  gl_FragColor=vec4(col,1.);
}`;

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

export function Scene() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const gl = c.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return; // the CSS gradient underneath stays as the fallback
    const sh = (type: number, src: string) => {
      const x = gl.createShader(type)!;
      gl.shaderSource(x, src);
      gl.compileShader(x);
      return x;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (k: string) => gl.getUniformLocation(prog, k);
    const ur = U('r'),
      ut = U('t'),
      us = U('s'),
      um = U('m'),
      usc = U('sc');

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0,
      hgt = 0;
    const size = () => {
      // Render at reduced resolution: the scene is soft, and phones stay cool.
      const k = Math.min(1.25, devicePixelRatio) * (innerWidth < 700 ? 0.5 : 0.65);
      w = Math.round(innerWidth * k);
      hgt = Math.round(innerHeight * k);
      c.width = w;
      c.height = hgt;
      gl.viewport(0, 0, w, hgt);
    };
    size();
    addEventListener('resize', size);
    let mx = 0,
      my = 0,
      tx = 0,
      ty = 0;
    const move = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = -((e.clientY / innerHeight) * 2 - 1);
    };
    addEventListener('pointermove', move, { passive: true });
    let scene = 0,
      raf = 0;
    const t0 = performance.now();
    const frame = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const prog01 = Math.min(1, scrollY / max);
      scene += (prog01 * 4 - scene) * 0.06; // ease between scenes
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;
      gl.uniform2f(ur, w, hgt);
      gl.uniform1f(ut, still ? 0 : (performance.now() - t0) / 1000);
      gl.uniform1f(us, scene);
      gl.uniform2f(um, still ? 0 : mx, still ? 0 : my);
      gl.uniform1f(usc, scrollY / innerHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };
    const vis = () => {
      if (!document.hidden && !raf) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', vis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #0b0620, #23103a 60%, #120a24)' }}
      />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {/* keeps text readable over any scene */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 30%, transparent, rgba(4,4,12,.55))' }}
      />
    </div>
  );
}
