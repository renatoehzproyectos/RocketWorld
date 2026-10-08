// Suelo procedural en shader (calles, aceras, costa y mar por posición de mundo): cero geometría que streamear.
// + cielo y cordillera lejana que siguen a la cámara.
export function createTerrain(scene) {
  const fog = scene.fog;
  const uni = { uOM: { value: new THREE.Vector2() }, uO: { value: new THREE.Vector2() }, uT: { value: 0 },
    fogC: { value: fog.color }, fogN: { value: fog.near }, fogF: { value: fog.far } };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: 'varying vec3 vW;void main(){vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);}',
    fragmentShader: `varying vec3 vW;uniform vec2 uOM,uO;uniform float uT,fogN,fogF;uniform vec3 fogC;
    void main(){
      vec2 p=vW.xz+uOM; float ax=vW.x+uO.x;
      vec2 d=abs(mod(p+22.,44.)-22.); float dm=min(d.x,d.y);
      float coast=smoothstep(840.,872.,ax);
      float road=step(dm,6.)*(1.-coast), lip=(step(dm,6.7)-step(dm,6.))*(1.-coast);
      float dash=d.x<d.y?step(mod(p.y,6.),3.):step(mod(p.x,6.),3.);
      float line=step(dm,.2)*road*dash;
      vec3 sand=vec3(.85,.77,.60), asph=vec3(.23,.24,.26);
      vec3 c=mix(sand,asph,road); c=mix(c,vec3(.93,.9,.8),lip*.8); c=mix(c,vec3(.92,.88,.72),line);
      float foam=smoothstep(868.,874.,ax)*(1.-smoothstep(874.,884.,ax));
      vec3 water=vec3(.11,.56,.72)+.05*sin(ax*.25+vW.z*.2+uT*1.5);
      c=mix(c,mix(water,vec3(1.),foam*.6),smoothstep(870.,876.,ax));
      float dist=length(vW-cameraPosition);
      c=mix(c,mix(sand,asph,.18),smoothstep(140.,420.,dist)*(1.-coast));   // anti-aliasing lejano
      c=mix(c,fogC,smoothstep(fogN,fogF,dist));
      gl_FragColor=linearToOutputTexel(vec4(c,1.));
    }`,
  }));
  ground.rotation.x = -Math.PI / 2; ground.frustumCulled = false; ground.renderOrder = -3; scene.add(ground);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2a6fc4) }, hor: { value: fog.color } },
    vertexShader: 'varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top,hor;varying float h;void main(){gl_FragColor=vec4(mix(hor,top,pow(clamp(h,0.,1.),.55)),1.);}',
  }));
  sky.renderOrder = -5; sky.frustumCulled = false; scene.add(sky);
  const cyl = new THREE.CylinderGeometry(880, 880, 160, 72, 1, true), pa = cyl.attributes.position;
  for (let k = 0; k < pa.count; k++) if (pa.getY(k) > 0) { const a = Math.atan2(pa.getZ(k), pa.getX(k)); pa.setY(k, 30 + 55 * (Math.sin(a * 5) * .5 + .5) + 35 * Math.abs(Math.sin(a * 13 + 1)) + 20 * Math.sin(a * 31)); } else pa.setY(k, -5);
  const mount = new THREE.Mesh(cyl, new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { hz: { value: fog.color } },
    vertexShader: 'varying float y;void main(){y=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 hz;varying float y;void main(){gl_FragColor=vec4(mix(hz,vec3(.55,.62,.72),smoothstep(0.,90.,y)*.8),1.);}',
  }));
  mount.renderOrder = -4; mount.frustumCulled = false; scene.add(mount);
  return {
    setGroundVisible(v) { ground.visible = v; mount.visible = v; },
    update(camera, ox, oz, t, oy = 0) {
      ground.position.set(camera.position.x, -oy, camera.position.z); sky.position.copy(camera.position); mount.position.set(camera.position.x, -oy, camera.position.z);
      uni.uOM.value.set(((ox % 44) + 44) % 44, ((oz % 44) + 44) % 44); uni.uO.value.set(ox, oz); uni.uT.value = t;
    },
  };
}
