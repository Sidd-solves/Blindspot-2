import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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
// ck: last click (x, y, seconds since)
uniform vec3 ck;
// dg: how far the scan has turned the landscape into the data world (0 to 1)
uniform float dg;
// wp: how far the iris has opened into the warp tunnel (0 to 1)
uniform float wp;
// Sine-free hash: stays stable at low precision (sin-based hashes streak on some phone GPUs).
float h(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+1.),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
vec3 pk(vec3 a,vec3 b,vec3 c,vec3 d,vec3 e,float x){
  x=mod(x,5.);
  float f=smoothstep(0.,1.,fract(x));
  return x<1.?mix(a,b,f):x<2.?mix(b,c,f):x<3.?mix(c,d,f):x<4.?mix(d,e,f):mix(e,a,f);}
void main(){
  vec2 p0=(gl_FragCoord.xy-.5*r)/r.y;
  // click shockwave: a ring that bends the scene as it travels out
  float age=ck.z, cd=length(p0-ck.xy), front=age*.95;
  float wave=(age<3.)?sin((cd-front)*42.)*exp(-abs(cd-front)*10.)*exp(-age*1.4):0.;
  vec2 p=p0+m*.035+(cd>0.?(p0-ck.xy)/cd:vec2(0.))*wave*.012;
  vec3 top=pk(vec3(.043,.024,.125),vec3(.008,.075,.145),vec3(.012,.082,.063),vec3(.10,.04,.07),vec3(.008,.012,.04),s);
  vec3 hor=pk(vec3(.23,.10,.35),vec3(.04,.29,.43),vec3(.05,.29,.21),vec3(.48,.18,.07),vec3(.08,.10,.23),s);
  vec3 aur=pk(vec3(.71,.42,1.),vec3(.13,.83,.93),vec3(.20,.83,.60),vec3(.98,.57,.24),vec3(.51,.55,.97),s);
  vec3 rdg=pk(vec3(.07,.04,.14),vec3(.016,.075,.12),vec3(.012,.067,.043),vec3(.086,.03,.024),vec3(.016,.02,.047),s);
  vec3 glw=pk(vec3(1.,.48,.85),vec3(.22,.74,.97),vec3(.64,.90,.21),vec3(.98,.75,.14),vec3(.88,.91,1.),s);
  vec3 col=mix(hor,top,smoothstep(-.25,.65,p.y+.1));
  // sun / moon
  float sm=mod(s,5.);
  vec2 sp=vec2(.38*sin(s*1.25+.6)+m.x*.06,-.03+.11*cos(s*.9)+.16*smoothstep(3.3,4.,sm)*(1.-smoothstep(4.2,4.9,sm))+m.y*.03);
  float d=length(p-sp);
  col+=glw*(exp(-d*3.2)*.55+smoothstep(.075,.065,d)*.6);
  // aurora ribbons
  for(int i=0;i<3;i++){float fi=float(i);
    float y0=.2+fi*.09;
    float w=p.y-y0-.14*fbm(vec2(p.x*1.4+t*.04*(fi+1.),fi*3.1+t*.025));
    float band=exp(-abs(w)*16.)*(.45+.55*fbm(vec2(p.x*3.5+t*.15,fi*5.)));
    col+=aur*band*(.42-fi*.08);}
  // stars, mostly at night
  float stars=.15+.85*smoothstep(3.,4.,sm)*(1.-smoothstep(4.3,5.,sm))+.4*(1.-smoothstep(0.,.8,sm));
  vec2 g=floor(gl_FragCoord.xy/2.);
  float tw=.6+.4*sin(mod(t*2.,6.2832)+h(g)*40.);
  col+=vec3(step(.9975,h(g))*stars*tw*smoothstep(-.1,.4,p.y));
  // hills, far to near, each sliding at its own speed as the page scrolls
  float edge=0.;
  for(int j=0;j<4;j++){float fj=float(j);
    float hy=-.06-.11*fj+.2*fbm(vec2(p.x*(1.1+fj*.55)+sc*(.25+fj*.45)+fj*7.3,fj*2.));
    float a=smoothstep(hy+.004,hy-.004,p.y);
    edge=max(edge,exp(-abs(p.y-hy)*140.));
    vec3 rc=mix(hor*.9,rdg,.3+.23*fj);
    rc+=aur*.06*(3.-fj)*exp(-abs(p.y-hy)*25.);
    col=mix(col,rc,a);}
  col=mix(col,hor,.08);
  vec2 q=gl_FragCoord.xy/r;
  // ---- the data world: the same scene rebuilt from the shop's numbers ----
  if(dg>.001){
    float hz=-.19;
    vec3 dc=vec3(.008,.01,.03)+aur*.12*smoothstep(-.1,.7,p.y);
    dc+=vec3(step(.996,h(g))*(.6+.4*tw))*smoothstep(hz,.3,p.y);
    // a striped "data sun" sitting on the horizon
    vec2 ds=vec2(.0,hz+.1);
    float dd=length(p-ds);
    float cut=max(step(0.,p.y-ds.y),step(.38,fract((p.y-ds.y)*24.+t*.35)));
    dc+=mix(glw,aur,clamp((ds.y+.11-p.y)*4.5,0.,1.))*smoothstep(.11,.105,dd)*cut*.75;
    dc+=glw*exp(-dd*4.)*.3;
    // a skyline made of bar charts, gently breathing
    float bi=floor(p.x*28.), bf=fract(p.x*28.);
    float bh=.02+.12*h(vec2(bi,7.))*(.72+.28*sin(t*.7+bi*1.7));
    float inBar=step(hz,p.y)*step(p.y,hz+bh)*step(.14,bf)*step(bf,.86);
    vec3 bc=mix(aur,glw,h(vec2(bi,2.)));
    dc=mix(dc,vec3(.015,.02,.045)+bc*.1,inBar);
    dc+=bc*inBar*(exp(-abs(p.y-(hz+bh))*140.)*1.6+.08+.25*smoothstep(.14,.2,bf)*(1.-smoothstep(.8,.86,bf))*exp(-(hz+bh-p.y)*14.));
    // a neon floor grid racing toward the viewer
    if(p.y<hz){
      float z=.32/(hz-p.y+.002);
      vec2 gp=vec2(p.x*z,z+t*.9+sc*3.5);
      vec2 gl2=abs(fract(gp)-.5);
      float line=smoothstep(.45,.5,max(gl2.x,gl2.y));
      float near=smoothstep(0.,.3,hz-p.y);
      dc=vec3(.006,.008,.02)+aur*line*(.18+1.1*near)+glw*.12*exp(-(hz-p.y)*14.);
    }
    // the scan: sweeps down from the top as dg rises, with a bright edge
    float yt=1.-q.y+.025*sin(q.x*36.+t*2.);
    float front=dg*1.32-.16;
    float k=smoothstep(front+.012,front-.012,yt);
    col=mix(col,dc,k);
    col+=aur*exp(-abs(yt-front)*95.)*step(dg,.995)*1.3;
  }
  // ---- warp: a tunnel of neon rings rushing toward you, opened by an iris from the centre ----
  if(wp>.001){
    vec2 c=p0-vec2(m.x*.09,m.y*.07);
    float rr=length(c)+.0001, an=atan(c.y,c.x);
    float z=.22/rr+t*.55+sc*1.6;
    float ring=smoothstep(.86,1.,fract(z*2.2));
    float spoke=smoothstep(.9,1.,abs(fract(an/6.2832*22.)-.5)*2.);
    vec3 tc=mix(aur,glw,.5+.5*sin(z*.8));
    vec3 wc=vec3(.004,.005,.018)+tc*(ring*1.6+spoke*.75)*smoothstep(.02,.5,rr)*(.45+.55*smoothstep(.0,.3,rr));
    // light-speed streaks
    float sid=floor(an/6.2832*180.);
    float lane=step(.93,h(vec2(sid,5.)));
    float sl=fract(z*.35+h(vec2(sid,4.)));
    wc+=vec3(.9,.95,1.)*lane*smoothstep(0.,.06,sl)*smoothstep(.3,.06,sl)*smoothstep(.04,.45,rr)*.9;
    // the light at the end of the tunnel
    wc+=glw*exp(-rr*7.5)*1.1+aur*exp(-rr*2.5)*.15;
    float front=wp*1.3;
    float kk=smoothstep(front+.012,front-.012,rr);
    col=mix(col,wc,kk);
    col+=tc*exp(-abs(rr-front)*70.)*step(wp,.995)*1.5;
  }
  // shockwave light
  col+=glw*.35*exp(-abs(cd-front)*28.)*exp(-age*1.6)*step(age,3.);
  // vignette, film grain
  col*=.55+.45*pow(16.*q.x*q.y*(1.-q.x)*(1.-q.y),.18);
  col+=(h(gl_FragCoord.xy+fract(t*.37)*97.)-.5)*.025;
  gl_FragColor=vec4(col,1.);
}`;

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

/** `start` picks the scene a page opens on (0 dusk, 1 ocean, 2 forest, 3 sunset, 4 night); scrolling travels on to night. */
export function Scene({
  start = 0,
  world = 'none',
}: {
  start?: number;
  /** The second world this page scrolls into: the data world (Home) or the warp tunnel (Features). */
  world?: 'none' | 'data' | 'warp';
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const from = useRef(start);
  from.current = start;
  const wld = useRef(world);
  wld.current = world;
  useEffect(() => {
    // While the scene is up, the site wrapper's solid background steps aside so the scene shows behind the content.
    document.documentElement.classList.add('scene-on');
    return () => document.documentElement.classList.remove('scene-on');
  }, []);
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
      usc = U('sc'),
      uck = U('ck'),
      udg = U('dg'),
      uwp = U('wp');

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0,
      hgt = 0;
    let lastCW = 0,
      lastCH = 0;
    const size = () => {
      // Render at reduced resolution: the scene is soft, and phones stay cool. Sized from what is actually shown.
      const cw = c.clientWidth || innerWidth,
        ch = c.clientHeight || innerHeight;
      const k = Math.min(1.25, devicePixelRatio) * (cw < 700 ? 0.5 : 0.65);
      w = Math.max(1, Math.round(cw * k));
      hgt = Math.max(1, Math.round(ch * k));
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
    // The click shockwave lives in the shader's own units: centred, 1 = screen height.
    const toP = (x: number, y: number) => [
      (x - innerWidth / 2) / innerHeight,
      (innerHeight / 2 - y) / innerHeight,
    ];
    let ckx = 0,
      cky = 0,
      ckAt = -1e9;
    const move = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = -((e.clientY / innerHeight) * 2 - 1);
    };
    const down = (e: PointerEvent) => {
      [ckx, cky] = toP(e.clientX, e.clientY);
      ckAt = performance.now();
      move(e);
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', down, { passive: true });
    let scene = from.current,
      dgv = 0,
      wpv = 0,
      raf = 0;
    const t0 = performance.now();
    const frame = () => {
      // Re-measure when the shown size changes (window resize, zoom, devtools, viewport emulation).
      if (c.clientWidth !== lastCW || c.clientHeight !== lastCH) {
        lastCW = c.clientWidth;
        lastCH = c.clientHeight;
        size();
      }
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const prog01 = Math.min(1, scrollY / max);
      const target = from.current + prog01 * 4; // wraps on: sunset → night → dusk → ocean → forest
      scene += (target - scene) * 0.06; // ease between scenes
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;
      gl.uniform2f(ur, w, hgt);
      gl.uniform1f(ut, still ? 0 : (performance.now() - t0) / 1000);
      gl.uniform1f(us, scene);
      gl.uniform2f(um, still ? 0 : mx, still ? 0 : my);
      gl.uniform1f(usc, scrollY / innerHeight);
      // Just past the hero the scan turns the landscape into the data world; near the end it turns back.
      const ss = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
      const dgT = wld.current === 'data' ? ss(0.05, 0.13, prog01) * (1 - ss(0.6, 0.68, prog01)) : 0;
      // The tunnel retreats as the section marked data-scene-exit scrolls in (on Features: the predictions).
      const exitEl = document.querySelector<HTMLElement>('[data-scene-exit]');
      const exitTop = exitEl ? exitEl.getBoundingClientRect().top + scrollY : Infinity;
      const leave = ss(exitTop - innerHeight * 0.85, exitTop - innerHeight * 0.1, scrollY);
      const wpT = wld.current === 'warp' ? ss(0.06, 0.16, prog01) * (1 - leave) : 0;
      dgv += (dgT - dgv) * 0.05;
      wpv += (wpT - wpv) * 0.07;
      gl.uniform1f(udg, dgv);
      gl.uniform1f(uwp, wpv);
      gl.uniform3f(uck, ckx, cky, still ? 99 : (performance.now() - ckAt) / 1000);
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
      removeEventListener('pointerdown', down);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  // Rendered straight into <body>: inside the animated page wrapper, "fixed" would follow the page instead of the screen.
  return createPortal(
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
    </div>,
    document.body,
  );
}
