/**
 * Modified from https://github.com/mozilla/hubs/blob/master/src/components/fader.js
 * to include adjustable duration and converted from component to system
 */

AFRAME.registerSystem('fader-plus', {
  schema: {
    direction: { type: 'string', default: 'none' }, // "in", "out", or "none"
    duration: { type: 'number', default: 200 }, // Transition duration in milliseconds
    color: { type: 'color', default: 'white' },
  },

  init() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({
        color: this.data.color,
        side: THREE.BackSide,
        opacity: 0,
        transparent: true,
        fog: false,
      })
    );
    mesh.scale.x = mesh.scale.y = 1;
    mesh.scale.z = 0.15;
    mesh.matrixNeedsUpdate = true;
    mesh.renderOrder = 1; // render after other transparent stuff
    this.el.camera.add(mesh);
    this.mesh = mesh;
  },

  fadeOut() {
    return this.beginTransition('out')
  },

  fadeIn() {
    return this.beginTransition('in')
  },

  async beginTransition(direction) {
    if (this._resolveFinish) {
      throw new Error('Cannot fade while a fade is happening.')
    }

    this.el.setAttribute('fader-plus', { direction });

    return new Promise((res) => {
      if (this.mesh.material.opacity === (direction == 'in' ? 0 : 1)) {
        res();
      } else {
        this._resolveFinish = res;
      }
    })
  },

  tick(t, dt) {
    const mat = this.mesh.material;
    this.mesh.visible = this.data.direction === 'out' || mat.opacity !== 0;
    if (!this.mesh.visible) return

    if (this.data.direction === 'in') {
      mat.opacity = Math.max(0, mat.opacity - (1.0 / this.data.duration) * Math.min(dt, 50));
    } else if (this.data.direction === 'out') {
      mat.opacity = Math.min(1, mat.opacity + (1.0 / this.data.duration) * Math.min(dt, 50));
    }

    if (mat.opacity === 0 || mat.opacity === 1) {
      if (this.data.direction !== 'none') {
        if (this._resolveFinish) {
          this._resolveFinish();
          this._resolveFinish = null;
        }
      }

      this.el.setAttribute('fader-plus', { direction: 'none' });
    }
  },
});

const worldCamera$1 = new THREE.Vector3();
const worldSelf$1 = new THREE.Vector3();

AFRAME.registerComponent('proximity-events', {
  schema: {
    radius: { type: 'number', default: 1 },
  },
  init() {
    this.inZone = false;
    this.camera = this.el.sceneEl.camera;
  },
  tick() {
    this.camera.getWorldPosition(worldCamera$1);
    this.el.object3D.getWorldPosition(worldSelf$1);
    const wasInzone = this.inZone;
    this.inZone = worldCamera$1.distanceTo(worldSelf$1) < this.data.radius;
    if (this.inZone && !wasInzone) this.el.emit('proximityenter');
    if (!this.inZone && wasInzone) this.el.emit('proximityleave');
  },
});

const glsl$3 = `
varying vec2 vUv;
varying vec3 vRay;
varying vec3 vNormal;

void main() {
  vUv = uv;
  // vNormal = normalMatrix * normal;
  vec3 cameraLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vRay = position - cameraLocal;
  vNormal = normalize(-1. * vRay);
  float dist = length(cameraLocal);
  vRay.z *= 1.3 / (1. + pow(dist, 0.5)); // Change FOV by squashing local Z direction
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const glsl$2 = `
uniform samplerCube cubeMap;
uniform float time;
uniform float radius;
uniform vec3 ringColor;

varying vec2 vUv;
varying vec3 vRay;
varying vec3 vNormal;

#define RING_WIDTH 0.1
#define RING_HARD_OUTER 0.01
#define RING_HARD_INNER 0.08
#define forward vec3(0.0, 0.0, 1.0)

void main() {
  vec2 coord = vUv * 2.0 - 1.0;
  float noise = snoise(vec3(coord * 1., time)) * 0.5 + 0.5;

  // Polar distance
  float dist = length(coord);
  dist += noise * 0.2;

  float maskOuter = 1.0 - smoothstep(radius - RING_HARD_OUTER, radius, dist);
  float maskInner = 1.0 - smoothstep(radius - RING_WIDTH, radius - RING_WIDTH + RING_HARD_INNER, dist);
  float distortion = smoothstep(radius - 0.2, radius + 0.2, dist);
  vec3 normal = normalize(vNormal);
  float directView = smoothstep(0., 0.8, dot(normal, forward));
  vec3 tangentOutward = vec3(coord, 0.0);
  vec3 ray = mix(vRay, tangentOutward, distortion);
  vec4 texel = textureCube(cubeMap, ray);
  vec3 centerLayer = texel.rgb * maskInner;
  vec3 ringLayer = ringColor * (1. - maskInner);
  vec3 composite = centerLayer + ringLayer;

  gl_FragColor = vec4(composite, (maskOuter - maskInner) + maskInner * directView);
}
`;

/*
 * 3D Simplex noise
 * SIGNATURE: float snoise(vec3 v)
 * https://github.com/hughsk/glsl-noise
 */

const glsl$1 = `
//
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : ijm
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
  {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
  }  
`;

/**
 * Description
 * ===========
 * Bidirectional see-through portal. Two portals are paired by color.
 *
 * Usage
 * =======
 * Add two instances of `portal.glb` to the Spoke scene.
 * The name of each instance should look like "some-descriptive-label__color"
 * Any valid THREE.Color argument is a valid color value.
 * See here for example color names https://www.w3schools.com/cssref/css_colors.asp
 *
 * For example, to make a pair of connected blue portals,
 * you could name them "portal-to__blue" and "portal-from__blue"
 */

const worldPos = new THREE.Vector3();
const worldCameraPos = new THREE.Vector3();
const worldDir = new THREE.Vector3();
const worldQuat = new THREE.Quaternion();
const mat4 = new THREE.Matrix4();

AFRAME.registerSystem('portal', {
  dependencies: ['fader-plus'],
  init: function () {
    this.teleporting = false;
    this.characterController = this.el.systems['hubs-systems'].characterController;
    this.fader = this.el.systems['fader-plus'];
    this.roomData = null;
    this.waitForFetch = this.waitForFetch.bind(this);

    // if the user is logged in, we want to retrieve their userData from the top level server
    if (window.APP.store.state.credentials && window.APP.store.state.credentials.token && !window.APP.userData) {
        this.fetchRoomData();
    }
  },
  fetchRoomData: async function () {
    var params = {token: window.APP.store.state.credentials.token};

    const options = {};
    options.headers = new Headers();
    options.headers.set("Authorization", `Bearer ${params}`);
    options.headers.set("Content-Type", "application/json");
    await fetch("https://realitymedia.digital/userData", options)
        .then(response => response.json())
        .then(data => {
          console.log('Success:', data);
          this.roomData = data;
    });
    this.roomData.textures = [];
  },
  getRoomURL: async function (number) {
      this.waitForFetch();
      return this.roomData.rooms.length > number ? "https://xr.realitymedia.digital/" + this.roomData.rooms[number] : null;
  },
  getCubeMap: async function (number) {
      this.waitForFetch();
      return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  waitForFetch: function () {
     if (this.roomData) return
     setTimeout(this.waitForFetch, 100); // try again in 100 milliseconds
  },
  teleportTo: async function (object) {
    this.teleporting = true;
    await this.fader.fadeOut();
    // Scale screws up the waypoint logic, so just send position and orientation
    object.getWorldQuaternion(worldQuat);
    object.getWorldDirection(worldDir);
    object.getWorldPosition(worldPos);
    worldPos.add(worldDir.multiplyScalar(1.5)); // Teleport in front of the portal to avoid infinite loop
    mat4.makeRotationFromQuaternion(worldQuat);
    mat4.setPosition(worldPos);
    // Using the characterController ensures we don't stray from the navmesh
    this.characterController.travelByWaypoint(mat4, true, false);
    await this.fader.fadeIn();
    this.teleporting = false;
  },
});

AFRAME.registerComponent('portal', {
  schema: {
    color: { type: 'color', default: null },
  },
  init: async function () {
    this.system = APP.scene.systems.portal; // A-Frame is supposed to do this by default but doesn't?

    // parse the name to get portal type, target, and color
    this.parseNodeName();

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        cubeMap: { value: new THREE.Texture() },
        time: { value: 0 },
        radius: { value: 0 },
        ringColor: { value: this.color },
      },
      vertexShader: glsl$3,
      fragmentShader: `
        ${glsl$1}
        ${glsl$2}
      `,
    });

    // Assume that the object has a plane geometry
    const mesh = this.el.getOrCreateObject3D('mesh');
    mesh.material = this.material;

    // get the other before continuing
    this.other = await this.getOther();

    if (this.portalType == 1) {
        this.system.getCubeMap(this.portalTarget).then( urls => {
            //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
            new Promise((resolve, reject) =>
              new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
            ).then(texture => {
                texture.format = THREE.RGBFormat;
                this.material.uniforms.cubeMap.value = texture;
            }).catch(e => console.error(e));    
        });
    } else if (this.portalType == 2) {    
        this.cubeCamera = new THREE.CubeCamera(1, 100000, 1024);
        this.cubeCamera.rotateY(Math.PI); // Face forwards
        this.el.object3D.add(this.cubeCamera);
        this.other.components.portal.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture;
        this.el.sceneEl.addEventListener('model-loaded', () => {
          this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D);
        });
    }

    this.el.setAttribute('animation__portal', {
        property: 'components.portal.material.uniforms.radius.value',
        dur: 700,
        easing: 'easeInOutCubic',
    });
    this.el.addEventListener('animationbegin', () => (this.el.object3D.visible = true));
    this.el.addEventListener('animationcomplete__portal', () => (this.el.object3D.visible = !this.isClosed()));

    // going to want to try and make the object this portal is on clickable
    this.el.setAttribute('is-remote-hover-target','');
    this.el.setAttribute('tags', {singleActionButton: true});
    this.el.setAttribute('class', "interactable");
    // orward the 'interact' events to our portal movement 
    this.followPortal = this.followPortal.bind(this);
    this.el.object3D.addEventListener('interact', this.followPortal);

    this.el.setAttribute('proximity-events', { radius: 5 });
    this.el.addEventListener('proximityenter', () => this.open());
    this.el.addEventListener('proximityleave', () => this.close());
  },

  followPortal: function() {
    if (this.portalType == 1) {
        console.log("set window.location.href to " + this.other);
        window.location.href = this.other;
      } else if (this.portalType == 2) {
        this.system.teleportTo(this.other.object3D);
      }
  },
  tick: function (time) {
    this.material.uniforms.time.value = time / 1000;
        
    if (this.other && !this.system.teleporting) {
      this.el.object3D.getWorldPosition(worldPos);
      this.el.sceneEl.camera.getWorldPosition(worldCameraPos);
      const dist = worldCameraPos.distanceTo(worldPos);

      if (this.portalType == 1 && dist < 0.5) ; else if (this.portalType == 2 && dist < 1) {
        this.system.teleportTo(this.other.object3D);
      }
    }
  },
  getOther: function () {
    return new Promise((resolve) => {
        if (this.portalType == 0) resolve(null);
        if (this.portalType  == 1) {
            // the target is another room, resolve with the URL to the room
            this.system.getRoomURL(this.portalTarget).then(url => { resolve(url); });
        }

        // now find the portal within the room.  The portals should come in pairs with the same portalTarget
        const portals = Array.from(document.querySelectorAll(`[portal]`));
        const other = portals.find((el) => el.components.portal.portalType == this.portalType &&
                                           el.components.portal.portalTarget === this.portalTarget && el !== this.el);
        if (other !== undefined) {
            // Case 1: The other portal already exists
            resolve(other);
            other.emit('pair', { other: this.el }); // Let the other know that we're ready
        } else {
            // Case 2: We couldn't find the other portal, wait for it to signal that it's ready
            this.el.addEventListener('pair', (event) => resolve(event.detail.other), { once: true });
        }
    })
  },

  parseNodeName: function () {
    const nodeName = this.el.parentEl.parentEl.className;

    // nodes should be named anything at the beginning with either "roomN.color" or "portalN.color" 
    // at the very end
    const params = nodeName.match(/([A-Za-z]*)_([A-Za-z0-9]*)_([A-Za-z0-9]*)$/);
    
    // if pattern matches, we will have length of 4, first match is the portal type,
    // second is the name or number, and last is the color
    if (!params || params.length < 4) {
        console.warn("portal node name not formed correctly: ", nodeName);
        this.portalType = 0;
        this.portalTarget = null;
        this.color = "red"; // default so the portal has a color to use
        return;
    } 
    if (params[1] === "room") {
        this.portalType = 1;
        this.portalTarget = parseInt(params[2]);
    } else if (params[1] === "portal") {
        this.portalType = 2;
        this.portalTarget = params[2];
    } else {
        this.portalType = 0;
        this.portalTarget = null;
    } 
    this.color = new THREE.Color(params[3]);
  },

  setRadius(val) {
    this.el.setAttribute('animation__portal', {
      from: this.material.uniforms.radius.value,
      to: val,
    });
  },
  open() {
    this.setRadius(1);
  },
  close() {
    this.setRadius(0);
  },
  isClosed() {
    return this.material.uniforms.radius.value === 0
  },
});

/**
 * Description
 * ===========
 * 360 image that fills the user's vision when in a close proximity.
 *
 * Usage
 * =======
 * Given a 360 image asset with the following URL in Spoke:
 * https://gt-ael-aq-assets.aelatgt-internal.net/files/12345abc-6789def.jpg
 *
 * The name of the `immersive-360.glb` instance in the scene should be:
 * "some-descriptive-label__12345abc-6789def_jpg" OR "12345abc-6789def_jpg"
 */

const worldCamera = new THREE.Vector3();
const worldSelf = new THREE.Vector3();

AFRAME.registerComponent('immersive-360', {
  schema: {
    url: { type: 'string', default: null },
  },
  init: async function () {
    const url = this.data.url ?? this.parseSpokeName();
    const extension = url.match(/^.*\.(.*)$/)[1];

    // media-image will set up the sphere geometry for us
    this.el.setAttribute('media-image', {
      projection: '360-equirectangular',
      alphaMode: 'opaque',
      src: url,
      version: 1,
      batch: false,
      contentType: `image/${extension}`,
      alphaCutoff: 0,
    });
    // but we need to wait for this to happen
    this.mesh = await this.getMesh();
    this.mesh.geometry.scale(100, 100, 100);
    this.mesh.material.setValues({
      transparent: true,
      depthTest: false,
    });
    this.near = 1;
    this.far = 1.3;

    // Render OVER the scene but UNDER the cursor
    this.mesh.renderOrder = APP.RENDER_ORDER.CURSOR - 1;
  },
  tick: function () {
    if (this.mesh) {
      // Linearly map camera distance to material opacity
      this.mesh.getWorldPosition(worldSelf);
      this.el.sceneEl.camera.getWorldPosition(worldCamera);
      const distance = worldSelf.distanceTo(worldCamera);
      const opacity = 1 - (distance - this.near) / (this.far - this.near);
      this.mesh.material.opacity = opacity;
    }
  },
  parseSpokeName: function () {
    // Accepted names: "label__image-hash_ext" OR "image-hash_ext"
    const spokeName = this.el.parentEl.parentEl.className;
    const [, hash, extension] = spokeName.match(/(?:.*__)?(.*)_(.*)/);
    const url = `https://gt-ael-aq-assets.aelatgt-internal.net/files/${hash}.${extension}`;
    return url
  },
  getMesh: async function () {
    return new Promise((resolve) => {
      const mesh = this.el.object3DMap.mesh;
      if (mesh) resolve(mesh);
      this.el.addEventListener(
        'image-loaded',
        () => {
          resolve(this.el.object3DMap.mesh);
        },
        { once: true }
      );
    })
  },
});

// Parallax Occlusion shaders from
//    http://sunandblackcat.com/tipFullView.php?topicid=28
// No tangent-space transforms logic based on
//   http://mmikkelsen3d.blogspot.sk/2012/02/parallaxpoc-mapping-and-no-tangent.html

// Identity function for glsl-literal highlighting in VS Code
const glsl = String.raw;

const ParallaxShader = {
  // Ordered from fastest to best quality.
  modes: {
    none: 'NO_PARALLAX',
    basic: 'USE_BASIC_PARALLAX',
    steep: 'USE_STEEP_PARALLAX',
    occlusion: 'USE_OCLUSION_PARALLAX', // a.k.a. POM
    relief: 'USE_RELIEF_PARALLAX',
  },

  uniforms: {
    bumpMap: { value: null },
    map: { value: null },
    parallaxScale: { value: null },
    parallaxMinLayers: { value: null },
    parallaxMaxLayers: { value: null },
  },

  vertexShader: glsl`
    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      vViewPosition = -mvPosition.xyz;
      vNormal = normalize( normalMatrix * normal );
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: glsl`
    uniform sampler2D bumpMap;
    uniform sampler2D map;

    uniform float parallaxScale;
    uniform float parallaxMinLayers;
    uniform float parallaxMaxLayers;
    uniform float fade; // CUSTOM

    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    #ifdef USE_BASIC_PARALLAX

    vec2 parallaxMap(in vec3 V) {
      float initialHeight = texture2D(bumpMap, vUv).r;

      // No Offset Limitting: messy, floating output at grazing angles.
      //"vec2 texCoordOffset = parallaxScale * V.xy / V.z * initialHeight;",

      // Offset Limiting
      vec2 texCoordOffset = parallaxScale * V.xy * initialHeight;
      return vUv - texCoordOffset;
    }

    #else

    vec2 parallaxMap(in vec3 V) {
      // Determine number of layers from angle between V and N
      float numLayers = mix(parallaxMaxLayers, parallaxMinLayers, abs(dot(vec3(0.0, 0.0, 1.0), V)));

      float layerHeight = 1.0 / numLayers;
      float currentLayerHeight = 0.0;
      // Shift of texture coordinates for each iteration
      vec2 dtex = parallaxScale * V.xy / V.z / numLayers;

      vec2 currentTextureCoords = vUv;

      float heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;

      // while ( heightFromTexture > currentLayerHeight )
      // Infinite loops are not well supported. Do a "large" finite
      // loop, but not too large, as it slows down some compilers.
      for (int i = 0; i < 30; i += 1) {
        if (heightFromTexture <= currentLayerHeight) {
          break;
        }
        currentLayerHeight += layerHeight;
        // Shift texture coordinates along vector V
        currentTextureCoords -= dtex;
        heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;
      }

      #ifdef USE_STEEP_PARALLAX

      return currentTextureCoords;

      #elif defined(USE_RELIEF_PARALLAX)

      vec2 deltaTexCoord = dtex / 2.0;
      float deltaHeight = layerHeight / 2.0;

      // Return to the mid point of previous layer
      currentTextureCoords += deltaTexCoord;
      currentLayerHeight -= deltaHeight;

      // Binary search to increase precision of Steep Parallax Mapping
      const int numSearches = 5;
      for (int i = 0; i < numSearches; i += 1) {
        deltaTexCoord /= 2.0;
        deltaHeight /= 2.0;
        heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;
        // Shift along or against vector V
        if (heightFromTexture > currentLayerHeight) {
          // Below the surface

          currentTextureCoords -= deltaTexCoord;
          currentLayerHeight += deltaHeight;
        } else {
          // above the surface

          currentTextureCoords += deltaTexCoord;
          currentLayerHeight -= deltaHeight;
        }
      }
      return currentTextureCoords;

      #elif defined(USE_OCLUSION_PARALLAX)

      vec2 prevTCoords = currentTextureCoords + dtex;

      // Heights for linear interpolation
      float nextH = heightFromTexture - currentLayerHeight;
      float prevH = texture2D(bumpMap, prevTCoords).r - currentLayerHeight + layerHeight;

      // Proportions for linear interpolation
      float weight = nextH / (nextH - prevH);

      // Interpolation of texture coordinates
      return prevTCoords * weight + currentTextureCoords * (1.0 - weight);

      #else // NO_PARALLAX

      return vUv;

      #endif
    }
    #endif

    vec2 perturbUv(vec3 surfPosition, vec3 surfNormal, vec3 viewPosition) {
      vec2 texDx = dFdx(vUv);
      vec2 texDy = dFdy(vUv);

      vec3 vSigmaX = dFdx(surfPosition);
      vec3 vSigmaY = dFdy(surfPosition);
      vec3 vR1 = cross(vSigmaY, surfNormal);
      vec3 vR2 = cross(surfNormal, vSigmaX);
      float fDet = dot(vSigmaX, vR1);

      vec2 vProjVscr = (1.0 / fDet) * vec2(dot(vR1, viewPosition), dot(vR2, viewPosition));
      vec3 vProjVtex;
      vProjVtex.xy = texDx * vProjVscr.x + texDy * vProjVscr.y;
      vProjVtex.z = dot(surfNormal, viewPosition);

      return parallaxMap(vProjVtex);
    }

    void main() {
      vec2 mapUv = perturbUv(-vViewPosition, normalize(vNormal), normalize(vViewPosition));
      
      // CUSTOM START
      vec4 texel = texture2D(map, mapUv);
      vec3 color = mix(texel.xyz, vec3(0), fade);
      gl_FragColor = vec4(color, 1.0);
      // CUSTOM END
    }

  `,
};

/**
 * Description
 * ===========
 * Create the illusion of depth in a color image from a depth map
 *
 * Usage
 * =====
 * Create a plane in Blender and give it a material (just the default Principled BSDF).
 * Assign color image to "color" channel and depth map to "emissive" channel.
 * You may want to set emissive strength to zero so the preview looks better.
 * Add the "parallax" component from the Hubs extension, configure, and export as .glb
 */

const vec = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1);

AFRAME.registerComponent('parallax', {
  schema: {
    strength: { type: 'number', default: 0.5 },
    cutoffTransition: { type: 'number', default: Math.PI / 8 },
    cutoffAngle: { type: 'number', default: Math.PI / 4 },
  },
  init: function () {
    const mesh = this.el.object3DMap.mesh;
    const { map: colorMap, emissiveMap: depthMap } = mesh.material;
    colorMap.wrapS = colorMap.wrapT = THREE.ClampToEdgeWrapping;
    depthMap.wrapS = depthMap.wrapT = THREE.ClampToEdgeWrapping;
    const { vertexShader, fragmentShader } = ParallaxShader;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { USE_OCLUSION_PARALLAX: true },
      uniforms: {
        map: { value: colorMap },
        bumpMap: { value: depthMap },
        parallaxScale: { value: -1 * this.data.strength },
        parallaxMinLayers: { value: 20 },
        parallaxMaxLayers: { value: 30 },
        fade: { value: 0 },
      },
    });
    mesh.material = this.material;
  },
  tick() {
    if (this.el.sceneEl.camera) {
      this.el.sceneEl.camera.getWorldPosition(vec);
      this.el.object3D.worldToLocal(vec);
      const angle = vec.angleTo(forward);
      const fade = mapLinearClamped(
        angle,
        this.data.cutoffAngle - this.data.cutoffTransition,
        this.data.cutoffAngle + this.data.cutoffTransition,
        0, // In view zone, no fade
        1 // Outside view zone, full fade
      );
      this.material.uniforms.fade.value = fade;
    }
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mapLinear(x, a1, a2, b1, b2) {
  return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1)
}

function mapLinearClamped(x, a1, a2, b1, b2) {
  return clamp(mapLinear(x, a1, a2, b1, b2), b1, b2)
}

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360');
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal');
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax');
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5taW4uanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wcm94aW1pdHktZXZlbnRzLmpzIiwiLi4vc3JjL3NoYWRlcnMvcG9ydGFsLnZlcnQuanMiLCIuLi9zcmMvc2hhZGVycy9wb3J0YWwuZnJhZy5qcyIsIi4uL3NyYy9zaGFkZXJzL3Nub2lzZS5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3BvcnRhbC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMiLCIuLi9zcmMvc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wYXJhbGxheC5qcyIsIi4uL3NyYy9yb29tcy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdmYWRlci1wbHVzJywge1xuICBzY2hlbWE6IHtcbiAgICBkaXJlY3Rpb246IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdub25lJyB9LCAvLyBcImluXCIsIFwib3V0XCIsIG9yIFwibm9uZVwiXG4gICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDIwMCB9LCAvLyBUcmFuc2l0aW9uIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kc1xuICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6ICd3aGl0ZScgfSxcbiAgfSxcblxuICBpbml0KCkge1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgpLFxuICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgY29sb3I6IHRoaXMuZGF0YS5jb2xvcixcbiAgICAgICAgc2lkZTogVEhSRUUuQmFja1NpZGUsXG4gICAgICAgIG9wYWNpdHk6IDAsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBmb2c6IGZhbHNlLFxuICAgICAgfSlcbiAgICApXG4gICAgbWVzaC5zY2FsZS54ID0gbWVzaC5zY2FsZS55ID0gMVxuICAgIG1lc2guc2NhbGUueiA9IDAuMTVcbiAgICBtZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgIG1lc2gucmVuZGVyT3JkZXIgPSAxIC8vIHJlbmRlciBhZnRlciBvdGhlciB0cmFuc3BhcmVudCBzdHVmZlxuICAgIHRoaXMuZWwuY2FtZXJhLmFkZChtZXNoKVxuICAgIHRoaXMubWVzaCA9IG1lc2hcbiAgfSxcblxuICBmYWRlT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmJlZ2luVHJhbnNpdGlvbignb3V0JylcbiAgfSxcblxuICBmYWRlSW4oKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdpbicpXG4gIH0sXG5cbiAgYXN5bmMgYmVnaW5UcmFuc2l0aW9uKGRpcmVjdGlvbikge1xuICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmYWRlIHdoaWxlIGEgZmFkZSBpcyBoYXBwZW5pbmcuJylcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uIH0pXG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcykgPT4ge1xuICAgICAgaWYgKHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID09PSAoZGlyZWN0aW9uID09ICdpbicgPyAwIDogMSkpIHtcbiAgICAgICAgcmVzKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSByZXNcbiAgICAgIH1cbiAgICB9KVxuICB9LFxuXG4gIHRpY2sodCwgZHQpIHtcbiAgICBjb25zdCBtYXQgPSB0aGlzLm1lc2gubWF0ZXJpYWxcbiAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnIHx8IG1hdC5vcGFjaXR5ICE9PSAwXG4gICAgaWYgKCF0aGlzLm1lc2gudmlzaWJsZSkgcmV0dXJuXG5cbiAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ2luJykge1xuICAgICAgbWF0Lm9wYWNpdHkgPSBNYXRoLm1heCgwLCBtYXQub3BhY2l0eSAtICgxLjAgLyB0aGlzLmRhdGEuZHVyYXRpb24pICogTWF0aC5taW4oZHQsIDUwKSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWluKDEsIG1hdC5vcGFjaXR5ICsgKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH1cblxuICAgIGlmIChtYXQub3BhY2l0eSA9PT0gMCB8fCBtYXQub3BhY2l0eSA9PT0gMSkge1xuICAgICAgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gIT09ICdub25lJykge1xuICAgICAgICBpZiAodGhpcy5fcmVzb2x2ZUZpbmlzaCkge1xuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2goKVxuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSBudWxsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2ZhZGVyLXBsdXMnLCB7IGRpcmVjdGlvbjogJ25vbmUnIH0pXG4gICAgfVxuICB9LFxufSlcbiIsImNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3Byb3hpbWl0eS1ldmVudHMnLCB7XG4gIHNjaGVtYToge1xuICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9LFxuICB9LFxuICBpbml0KCkge1xuICAgIHRoaXMuaW5ab25lID0gZmFsc2VcbiAgICB0aGlzLmNhbWVyYSA9IHRoaXMuZWwuc2NlbmVFbC5jYW1lcmFcbiAgfSxcbiAgdGljaygpIHtcbiAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgY29uc3Qgd2FzSW56b25lID0gdGhpcy5pblpvbmVcbiAgICB0aGlzLmluWm9uZSA9IHdvcmxkQ2FtZXJhLmRpc3RhbmNlVG8od29ybGRTZWxmKSA8IHRoaXMuZGF0YS5yYWRpdXNcbiAgICBpZiAodGhpcy5pblpvbmUgJiYgIXdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHllbnRlcicpXG4gICAgaWYgKCF0aGlzLmluWm9uZSAmJiB3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5bGVhdmUnKVxuICB9LFxufSlcbiIsImNvbnN0IGdsc2wgPSBgXG52YXJ5aW5nIHZlYzIgdlV2O1xudmFyeWluZyB2ZWMzIHZSYXk7XG52YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxudm9pZCBtYWluKCkge1xuICB2VXYgPSB1djtcbiAgLy8gdk5vcm1hbCA9IG5vcm1hbE1hdHJpeCAqIG5vcm1hbDtcbiAgdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlKG1vZGVsTWF0cml4KSAqIHZlYzQoY2FtZXJhUG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgdlJheSA9IHBvc2l0aW9uIC0gY2FtZXJhTG9jYWw7XG4gIHZOb3JtYWwgPSBub3JtYWxpemUoLTEuICogdlJheSk7XG4gIGZsb2F0IGRpc3QgPSBsZW5ndGgoY2FtZXJhTG9jYWwpO1xuICB2UmF5LnogKj0gMS4zIC8gKDEuICsgcG93KGRpc3QsIDAuNSkpOyAvLyBDaGFuZ2UgRk9WIGJ5IHNxdWFzaGluZyBsb2NhbCBaIGRpcmVjdGlvblxuICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KHBvc2l0aW9uLCAxLjApO1xufVxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiY29uc3QgZ2xzbCA9IGBcbnVuaWZvcm0gc2FtcGxlckN1YmUgY3ViZU1hcDtcbnVuaWZvcm0gZmxvYXQgdGltZTtcbnVuaWZvcm0gZmxvYXQgcmFkaXVzO1xudW5pZm9ybSB2ZWMzIHJpbmdDb2xvcjtcblxudmFyeWluZyB2ZWMyIHZVdjtcbnZhcnlpbmcgdmVjMyB2UmF5O1xudmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiNkZWZpbmUgUklOR19XSURUSCAwLjFcbiNkZWZpbmUgUklOR19IQVJEX09VVEVSIDAuMDFcbiNkZWZpbmUgUklOR19IQVJEX0lOTkVSIDAuMDhcbiNkZWZpbmUgZm9yd2FyZCB2ZWMzKDAuMCwgMC4wLCAxLjApXG5cbnZvaWQgbWFpbigpIHtcbiAgdmVjMiBjb29yZCA9IHZVdiAqIDIuMCAtIDEuMDtcbiAgZmxvYXQgbm9pc2UgPSBzbm9pc2UodmVjMyhjb29yZCAqIDEuLCB0aW1lKSkgKiAwLjUgKyAwLjU7XG5cbiAgLy8gUG9sYXIgZGlzdGFuY2VcbiAgZmxvYXQgZGlzdCA9IGxlbmd0aChjb29yZCk7XG4gIGRpc3QgKz0gbm9pc2UgKiAwLjI7XG5cbiAgZmxvYXQgbWFza091dGVyID0gMS4wIC0gc21vb3Roc3RlcChyYWRpdXMgLSBSSU5HX0hBUkRfT1VURVIsIHJhZGl1cywgZGlzdCk7XG4gIGZsb2F0IG1hc2tJbm5lciA9IDEuMCAtIHNtb290aHN0ZXAocmFkaXVzIC0gUklOR19XSURUSCwgcmFkaXVzIC0gUklOR19XSURUSCArIFJJTkdfSEFSRF9JTk5FUiwgZGlzdCk7XG4gIGZsb2F0IGRpc3RvcnRpb24gPSBzbW9vdGhzdGVwKHJhZGl1cyAtIDAuMiwgcmFkaXVzICsgMC4yLCBkaXN0KTtcbiAgdmVjMyBub3JtYWwgPSBub3JtYWxpemUodk5vcm1hbCk7XG4gIGZsb2F0IGRpcmVjdFZpZXcgPSBzbW9vdGhzdGVwKDAuLCAwLjgsIGRvdChub3JtYWwsIGZvcndhcmQpKTtcbiAgdmVjMyB0YW5nZW50T3V0d2FyZCA9IHZlYzMoY29vcmQsIDAuMCk7XG4gIHZlYzMgcmF5ID0gbWl4KHZSYXksIHRhbmdlbnRPdXR3YXJkLCBkaXN0b3J0aW9uKTtcbiAgdmVjNCB0ZXhlbCA9IHRleHR1cmVDdWJlKGN1YmVNYXAsIHJheSk7XG4gIHZlYzMgY2VudGVyTGF5ZXIgPSB0ZXhlbC5yZ2IgKiBtYXNrSW5uZXI7XG4gIHZlYzMgcmluZ0xheWVyID0gcmluZ0NvbG9yICogKDEuIC0gbWFza0lubmVyKTtcbiAgdmVjMyBjb21wb3NpdGUgPSBjZW50ZXJMYXllciArIHJpbmdMYXllcjtcblxuICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbXBvc2l0ZSwgKG1hc2tPdXRlciAtIG1hc2tJbm5lcikgKyBtYXNrSW5uZXIgKiBkaXJlY3RWaWV3KTtcbn1cbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsIi8qXG4gKiAzRCBTaW1wbGV4IG5vaXNlXG4gKiBTSUdOQVRVUkU6IGZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaHVnaHNrL2dsc2wtbm9pc2VcbiAqL1xuXG5jb25zdCBnbHNsID0gYFxuLy9cbi8vIERlc2NyaXB0aW9uIDogQXJyYXkgYW5kIHRleHR1cmVsZXNzIEdMU0wgMkQvM0QvNEQgc2ltcGxleFxuLy8gICAgICAgICAgICAgICBub2lzZSBmdW5jdGlvbnMuXG4vLyAgICAgIEF1dGhvciA6IElhbiBNY0V3YW4sIEFzaGltYSBBcnRzLlxuLy8gIE1haW50YWluZXIgOiBpam1cbi8vICAgICBMYXN0bW9kIDogMjAxMTA4MjIgKGlqbSlcbi8vICAgICBMaWNlbnNlIDogQ29weXJpZ2h0IChDKSAyMDExIEFzaGltYSBBcnRzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy8gICAgICAgICAgICAgICBEaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMSUNFTlNFIGZpbGUuXG4vLyAgICAgICAgICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hc2hpbWEvd2ViZ2wtbm9pc2Vcbi8vXG5cbnZlYzMgbW9kMjg5KHZlYzMgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IG1vZDI4OSh2ZWM0IHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBwZXJtdXRlKHZlYzQgeCkge1xuICAgICByZXR1cm4gbW9kMjg5KCgoeCozNC4wKSsxLjApKngpO1xufVxuXG52ZWM0IHRheWxvckludlNxcnQodmVjNCByKVxue1xuICByZXR1cm4gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiByO1xufVxuXG5mbG9hdCBzbm9pc2UodmVjMyB2KVxuICB7XG4gIGNvbnN0IHZlYzIgIEMgPSB2ZWMyKDEuMC82LjAsIDEuMC8zLjApIDtcbiAgY29uc3QgdmVjNCAgRCA9IHZlYzQoMC4wLCAwLjUsIDEuMCwgMi4wKTtcblxuLy8gRmlyc3QgY29ybmVyXG4gIHZlYzMgaSAgPSBmbG9vcih2ICsgZG90KHYsIEMueXl5KSApO1xuICB2ZWMzIHgwID0gICB2IC0gaSArIGRvdChpLCBDLnh4eCkgO1xuXG4vLyBPdGhlciBjb3JuZXJzXG4gIHZlYzMgZyA9IHN0ZXAoeDAueXp4LCB4MC54eXopO1xuICB2ZWMzIGwgPSAxLjAgLSBnO1xuICB2ZWMzIGkxID0gbWluKCBnLnh5eiwgbC56eHkgKTtcbiAgdmVjMyBpMiA9IG1heCggZy54eXosIGwuenh5ICk7XG5cbiAgLy8gICB4MCA9IHgwIC0gMC4wICsgMC4wICogQy54eHg7XG4gIC8vICAgeDEgPSB4MCAtIGkxICArIDEuMCAqIEMueHh4O1xuICAvLyAgIHgyID0geDAgLSBpMiAgKyAyLjAgKiBDLnh4eDtcbiAgLy8gICB4MyA9IHgwIC0gMS4wICsgMy4wICogQy54eHg7XG4gIHZlYzMgeDEgPSB4MCAtIGkxICsgQy54eHg7XG4gIHZlYzMgeDIgPSB4MCAtIGkyICsgQy55eXk7IC8vIDIuMCpDLnggPSAxLzMgPSBDLnlcbiAgdmVjMyB4MyA9IHgwIC0gRC55eXk7ICAgICAgLy8gLTEuMCszLjAqQy54ID0gLTAuNSA9IC1ELnlcblxuLy8gUGVybXV0YXRpb25zXG4gIGkgPSBtb2QyODkoaSk7XG4gIHZlYzQgcCA9IHBlcm11dGUoIHBlcm11dGUoIHBlcm11dGUoXG4gICAgICAgICAgICAgaS56ICsgdmVjNCgwLjAsIGkxLnosIGkyLnosIDEuMCApKVxuICAgICAgICAgICArIGkueSArIHZlYzQoMC4wLCBpMS55LCBpMi55LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnggKyB2ZWM0KDAuMCwgaTEueCwgaTIueCwgMS4wICkpO1xuXG4vLyBHcmFkaWVudHM6IDd4NyBwb2ludHMgb3ZlciBhIHNxdWFyZSwgbWFwcGVkIG9udG8gYW4gb2N0YWhlZHJvbi5cbi8vIFRoZSByaW5nIHNpemUgMTcqMTcgPSAyODkgaXMgY2xvc2UgdG8gYSBtdWx0aXBsZSBvZiA0OSAoNDkqNiA9IDI5NClcbiAgZmxvYXQgbl8gPSAwLjE0Mjg1NzE0Mjg1NzsgLy8gMS4wLzcuMFxuICB2ZWMzICBucyA9IG5fICogRC53eXogLSBELnh6eDtcblxuICB2ZWM0IGogPSBwIC0gNDkuMCAqIGZsb29yKHAgKiBucy56ICogbnMueik7ICAvLyAgbW9kKHAsNyo3KVxuXG4gIHZlYzQgeF8gPSBmbG9vcihqICogbnMueik7XG4gIHZlYzQgeV8gPSBmbG9vcihqIC0gNy4wICogeF8gKTsgICAgLy8gbW9kKGosTilcblxuICB2ZWM0IHggPSB4XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgeSA9IHlfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCBoID0gMS4wIC0gYWJzKHgpIC0gYWJzKHkpO1xuXG4gIHZlYzQgYjAgPSB2ZWM0KCB4Lnh5LCB5Lnh5ICk7XG4gIHZlYzQgYjEgPSB2ZWM0KCB4Lnp3LCB5Lnp3ICk7XG5cbiAgLy92ZWM0IHMwID0gdmVjNChsZXNzVGhhbihiMCwwLjApKSoyLjAgLSAxLjA7XG4gIC8vdmVjNCBzMSA9IHZlYzQobGVzc1RoYW4oYjEsMC4wKSkqMi4wIC0gMS4wO1xuICB2ZWM0IHMwID0gZmxvb3IoYjApKjIuMCArIDEuMDtcbiAgdmVjNCBzMSA9IGZsb29yKGIxKSoyLjAgKyAxLjA7XG4gIHZlYzQgc2ggPSAtc3RlcChoLCB2ZWM0KDAuMCkpO1xuXG4gIHZlYzQgYTAgPSBiMC54enl3ICsgczAueHp5dypzaC54eHl5IDtcbiAgdmVjNCBhMSA9IGIxLnh6eXcgKyBzMS54enl3KnNoLnp6d3cgO1xuXG4gIHZlYzMgcDAgPSB2ZWMzKGEwLnh5LGgueCk7XG4gIHZlYzMgcDEgPSB2ZWMzKGEwLnp3LGgueSk7XG4gIHZlYzMgcDIgPSB2ZWMzKGExLnh5LGgueik7XG4gIHZlYzMgcDMgPSB2ZWMzKGExLnp3LGgudyk7XG5cbi8vTm9ybWFsaXNlIGdyYWRpZW50c1xuICB2ZWM0IG5vcm0gPSB0YXlsb3JJbnZTcXJ0KHZlYzQoZG90KHAwLHAwKSwgZG90KHAxLHAxKSwgZG90KHAyLCBwMiksIGRvdChwMyxwMykpKTtcbiAgcDAgKj0gbm9ybS54O1xuICBwMSAqPSBub3JtLnk7XG4gIHAyICo9IG5vcm0uejtcbiAgcDMgKj0gbm9ybS53O1xuXG4vLyBNaXggZmluYWwgbm9pc2UgdmFsdWVcbiAgdmVjNCBtID0gbWF4KDAuNiAtIHZlYzQoZG90KHgwLHgwKSwgZG90KHgxLHgxKSwgZG90KHgyLHgyKSwgZG90KHgzLHgzKSksIDAuMCk7XG4gIG0gPSBtICogbTtcbiAgcmV0dXJuIDQyLjAgKiBkb3QoIG0qbSwgdmVjNCggZG90KHAwLHgwKSwgZG90KHAxLHgxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHAyLHgyKSwgZG90KHAzLHgzKSApICk7XG4gIH0gIFxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIEJpZGlyZWN0aW9uYWwgc2VlLXRocm91Z2ggcG9ydGFsLiBUd28gcG9ydGFscyBhcmUgcGFpcmVkIGJ5IGNvbG9yLlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBBZGQgdHdvIGluc3RhbmNlcyBvZiBgcG9ydGFsLmdsYmAgdG8gdGhlIFNwb2tlIHNjZW5lLlxuICogVGhlIG5hbWUgb2YgZWFjaCBpbnN0YW5jZSBzaG91bGQgbG9vayBsaWtlIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fY29sb3JcIlxuICogQW55IHZhbGlkIFRIUkVFLkNvbG9yIGFyZ3VtZW50IGlzIGEgdmFsaWQgY29sb3IgdmFsdWUuXG4gKiBTZWUgaGVyZSBmb3IgZXhhbXBsZSBjb2xvciBuYW1lcyBodHRwczovL3d3dy53M3NjaG9vbHMuY29tL2Nzc3JlZi9jc3NfY29sb3JzLmFzcFxuICpcbiAqIEZvciBleGFtcGxlLCB0byBtYWtlIGEgcGFpciBvZiBjb25uZWN0ZWQgYmx1ZSBwb3J0YWxzLFxuICogeW91IGNvdWxkIG5hbWUgdGhlbSBcInBvcnRhbC10b19fYmx1ZVwiIGFuZCBcInBvcnRhbC1mcm9tX19ibHVlXCJcbiAqL1xuXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcbmltcG9ydCB2ZXJ0ZXhTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwudmVydC5qcydcbmltcG9ydCBmcmFnbWVudFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC5mcmFnLmpzJ1xuaW1wb3J0IHNub2lzZSBmcm9tICcuLi9zaGFkZXJzL3Nub2lzZS5qcydcblxuY29uc3Qgd29ybGRQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZENhbWVyYVBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkRGlyID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRRdWF0ID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKVxuY29uc3QgbWF0NCA9IG5ldyBUSFJFRS5NYXRyaXg0KClcblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdwb3J0YWwnLCB7XG4gIGRlcGVuZGVuY2llczogWydmYWRlci1wbHVzJ10sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIgPSB0aGlzLmVsLnN5c3RlbXNbJ2h1YnMtc3lzdGVtcyddLmNoYXJhY3RlckNvbnRyb2xsZXJcbiAgICB0aGlzLmZhZGVyID0gdGhpcy5lbC5zeXN0ZW1zWydmYWRlci1wbHVzJ11cbiAgICB0aGlzLnJvb21EYXRhID0gbnVsbFxuICAgIHRoaXMud2FpdEZvckZldGNoID0gdGhpcy53YWl0Rm9yRmV0Y2guYmluZCh0aGlzKVxuXG4gICAgLy8gaWYgdGhlIHVzZXIgaXMgbG9nZ2VkIGluLCB3ZSB3YW50IHRvIHJldHJpZXZlIHRoZWlyIHVzZXJEYXRhIGZyb20gdGhlIHRvcCBsZXZlbCBzZXJ2ZXJcbiAgICBpZiAod2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscyAmJiB3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzLnRva2VuICYmICF3aW5kb3cuQVBQLnVzZXJEYXRhKSB7XG4gICAgICAgIHRoaXMuZmV0Y2hSb29tRGF0YSgpXG4gICAgfVxuICB9LFxuICBmZXRjaFJvb21EYXRhOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBhcmFtcyA9IHt0b2tlbjogd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbn1cblxuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBvcHRpb25zLmhlYWRlcnMgPSBuZXcgSGVhZGVycygpO1xuICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJBdXRob3JpemF0aW9uXCIsIGBCZWFyZXIgJHtwYXJhbXN9YCk7XG4gICAgb3B0aW9ucy5oZWFkZXJzLnNldChcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gICAgYXdhaXQgZmV0Y2goXCJodHRwczovL3JlYWxpdHltZWRpYS5kaWdpdGFsL3VzZXJEYXRhXCIsIG9wdGlvbnMpXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1N1Y2Nlc3M6JywgZGF0YSk7XG4gICAgICAgICAgdGhpcy5yb29tRGF0YSA9IGRhdGE7XG4gICAgfSlcbiAgICB0aGlzLnJvb21EYXRhLnRleHR1cmVzID0gW11cbiAgfSxcbiAgZ2V0Um9vbVVSTDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgcmV0dXJuIHRoaXMucm9vbURhdGEucm9vbXMubGVuZ3RoID4gbnVtYmVyID8gXCJodHRwczovL3hyLnJlYWxpdHltZWRpYS5kaWdpdGFsL1wiICsgdGhpcy5yb29tRGF0YS5yb29tc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgZ2V0Q3ViZU1hcDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgd2FpdEZvckZldGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgIGlmICh0aGlzLnJvb21EYXRhKSByZXR1cm5cbiAgICAgc2V0VGltZW91dCh0aGlzLndhaXRGb3JGZXRjaCwgMTAwKTsgLy8gdHJ5IGFnYWluIGluIDEwMCBtaWxsaXNlY29uZHNcbiAgfSxcbiAgdGVsZXBvcnRUbzogYXN5bmMgZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIHRoaXMudGVsZXBvcnRpbmcgPSB0cnVlXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlT3V0KClcbiAgICAvLyBTY2FsZSBzY3Jld3MgdXAgdGhlIHdheXBvaW50IGxvZ2ljLCBzbyBqdXN0IHNlbmQgcG9zaXRpb24gYW5kIG9yaWVudGF0aW9uXG4gICAgb2JqZWN0LmdldFdvcmxkUXVhdGVybmlvbih3b3JsZFF1YXQpXG4gICAgb2JqZWN0LmdldFdvcmxkRGlyZWN0aW9uKHdvcmxkRGlyKVxuICAgIG9iamVjdC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgIHdvcmxkUG9zLmFkZCh3b3JsZERpci5tdWx0aXBseVNjYWxhcigxLjUpKSAvLyBUZWxlcG9ydCBpbiBmcm9udCBvZiB0aGUgcG9ydGFsIHRvIGF2b2lkIGluZmluaXRlIGxvb3BcbiAgICBtYXQ0Lm1ha2VSb3RhdGlvbkZyb21RdWF0ZXJuaW9uKHdvcmxkUXVhdClcbiAgICBtYXQ0LnNldFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgIC8vIFVzaW5nIHRoZSBjaGFyYWN0ZXJDb250cm9sbGVyIGVuc3VyZXMgd2UgZG9uJ3Qgc3RyYXkgZnJvbSB0aGUgbmF2bWVzaFxuICAgIHRoaXMuY2hhcmFjdGVyQ29udHJvbGxlci50cmF2ZWxCeVdheXBvaW50KG1hdDQsIHRydWUsIGZhbHNlKVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZUluKClcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywge1xuICBzY2hlbWE6IHtcbiAgICBjb2xvcjogeyB0eXBlOiAnY29sb3InLCBkZWZhdWx0OiBudWxsIH0sXG4gIH0sXG4gIGluaXQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnN5c3RlbSA9IEFQUC5zY2VuZS5zeXN0ZW1zLnBvcnRhbCAvLyBBLUZyYW1lIGlzIHN1cHBvc2VkIHRvIGRvIHRoaXMgYnkgZGVmYXVsdCBidXQgZG9lc24ndD9cblxuICAgIC8vIHBhcnNlIHRoZSBuYW1lIHRvIGdldCBwb3J0YWwgdHlwZSwgdGFyZ2V0LCBhbmQgY29sb3JcbiAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKVxuXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBjdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuVGV4dHVyZSgpIH0sXG4gICAgICAgIHRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgcmFkaXVzOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIHJpbmdDb2xvcjogeyB2YWx1ZTogdGhpcy5jb2xvciB9LFxuICAgICAgfSxcbiAgICAgIHZlcnRleFNoYWRlcixcbiAgICAgIGZyYWdtZW50U2hhZGVyOiBgXG4gICAgICAgICR7c25vaXNlfVxuICAgICAgICAke2ZyYWdtZW50U2hhZGVyfVxuICAgICAgYCxcbiAgICB9KVxuXG4gICAgLy8gQXNzdW1lIHRoYXQgdGhlIG9iamVjdCBoYXMgYSBwbGFuZSBnZW9tZXRyeVxuICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLmdldE9yQ3JlYXRlT2JqZWN0M0QoJ21lc2gnKVxuICAgIG1lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG5cbiAgICAvLyBnZXQgdGhlIG90aGVyIGJlZm9yZSBjb250aW51aW5nXG4gICAgdGhpcy5vdGhlciA9IGF3YWl0IHRoaXMuZ2V0T3RoZXIoKVxuXG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtLmdldEN1YmVNYXAodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4oIHVybHMgPT4ge1xuICAgICAgICAgICAgLy9jb25zdCB1cmxzID0gW2N1YmVNYXBQb3NYLCBjdWJlTWFwTmVnWCwgY3ViZU1hcFBvc1ksIGN1YmVNYXBOZWdZLCBjdWJlTWFwUG9zWiwgY3ViZU1hcE5lZ1pdO1xuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgIG5ldyBUSFJFRS5DdWJlVGV4dHVyZUxvYWRlcigpLmxvYWQodXJscywgcmVzb2x2ZSwgdW5kZWZpbmVkLCByZWplY3QpXG4gICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGV4dHVyZTtcbiAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgIH0pXG4gICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikgeyAgICBcbiAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IFRIUkVFLkN1YmVDYW1lcmEoMSwgMTAwMDAwLCAxMDI0KVxuICAgICAgICB0aGlzLmN1YmVDYW1lcmEucm90YXRlWShNYXRoLlBJKSAvLyBGYWNlIGZvcndhcmRzXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnVwZGF0ZSh0aGlzLmVsLnNjZW5lRWwucmVuZGVyZXIsIHRoaXMuZWwuc2NlbmVFbC5vYmplY3QzRClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnYW5pbWF0aW9uX19wb3J0YWwnLCB7XG4gICAgICAgIHByb3BlcnR5OiAnY29tcG9uZW50cy5wb3J0YWwubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlJyxcbiAgICAgICAgZHVyOiA3MDAsXG4gICAgICAgIGVhc2luZzogJ2Vhc2VJbk91dEN1YmljJyxcbiAgICB9KVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uYmVnaW4nLCAoKSA9PiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdHJ1ZSkpXG4gICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25jb21wbGV0ZV9fcG9ydGFsJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9ICF0aGlzLmlzQ2xvc2VkKCkpKVxuXG4gICAgLy8gZ29pbmcgdG8gd2FudCB0byB0cnkgYW5kIG1ha2UgdGhlIG9iamVjdCB0aGlzIHBvcnRhbCBpcyBvbiBjbGlja2FibGVcbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlfSlcbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuICAgIC8vIG9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIHBvcnRhbCBtb3ZlbWVudCBcbiAgICB0aGlzLmZvbGxvd1BvcnRhbCA9IHRoaXMuZm9sbG93UG9ydGFsLmJpbmQodGhpcylcbiAgICB0aGlzLmVsLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5mb2xsb3dQb3J0YWwpXG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiA1IH0pXG4gICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMub3BlbigpKVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5bGVhdmUnLCAoKSA9PiB0aGlzLmNsb3NlKCkpXG4gIH0sXG5cbiAgZm9sbG93UG9ydGFsOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhyZWYgdG8gXCIgKyB0aGlzLm90aGVyKVxuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuICAgICAgfVxuICB9LFxuICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMudGltZS52YWx1ZSA9IHRpbWUgLyAxMDAwXG4gICAgICAgIFxuICAgIGlmICh0aGlzLm90aGVyICYmICF0aGlzLnN5c3RlbS50ZWxlcG9ydGluZykge1xuICAgICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhUG9zKVxuICAgICAgY29uc3QgZGlzdCA9IHdvcmxkQ2FtZXJhUG9zLmRpc3RhbmNlVG8od29ybGRQb3MpXG5cbiAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSAmJiBkaXN0IDwgMC41KSB7XG4gICAgICAgIC8vY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhyZWYgdG8gXCIgKyB0aGlzLm90aGVyKVxuICAgICAgICAvL3dpbmRvdy5sb2NhdGlvbi5ocmVmID0gdGhpcy5vdGhlclxuICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiAmJiBkaXN0IDwgMSkge1xuICAgICAgICB0aGlzLnN5c3RlbS50ZWxlcG9ydFRvKHRoaXMub3RoZXIub2JqZWN0M0QpXG4gICAgICB9XG4gICAgfVxuICB9LFxuICBnZXRPdGhlcjogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHJlc29sdmUobnVsbClcbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSAgPT0gMSkge1xuICAgICAgICAgICAgLy8gdGhlIHRhcmdldCBpcyBhbm90aGVyIHJvb20sIHJlc29sdmUgd2l0aCB0aGUgVVJMIHRvIHRoZSByb29tXG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRSb29tVVJMKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKHVybCA9PiB7IHJlc29sdmUodXJsKSB9KVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gbm93IGZpbmQgdGhlIHBvcnRhbCB3aXRoaW4gdGhlIHJvb20uICBUaGUgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycyB3aXRoIHRoZSBzYW1lIHBvcnRhbFRhcmdldFxuICAgICAgICBjb25zdCBwb3J0YWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbcG9ydGFsXWApKVxuICAgICAgICBjb25zdCBvdGhlciA9IHBvcnRhbHMuZmluZCgoZWwpID0+IGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFR5cGUgPT0gdGhpcy5wb3J0YWxUeXBlICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVGFyZ2V0ID09PSB0aGlzLnBvcnRhbFRhcmdldCAmJiBlbCAhPT0gdGhpcy5lbClcbiAgICAgICAgaWYgKG90aGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIENhc2UgMTogVGhlIG90aGVyIHBvcnRhbCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgcmVzb2x2ZShvdGhlcilcbiAgICAgICAgICAgIG90aGVyLmVtaXQoJ3BhaXInLCB7IG90aGVyOiB0aGlzLmVsIH0pIC8vIExldCB0aGUgb3RoZXIga25vdyB0aGF0IHdlJ3JlIHJlYWR5XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBDYXNlIDI6IFdlIGNvdWxkbid0IGZpbmQgdGhlIG90aGVyIHBvcnRhbCwgd2FpdCBmb3IgaXQgdG8gc2lnbmFsIHRoYXQgaXQncyByZWFkeVxuICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwYWlyJywgKGV2ZW50KSA9PiByZXNvbHZlKGV2ZW50LmRldGFpbC5vdGhlciksIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICB9XG4gICAgfSlcbiAgfSxcblxuICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgbm9kZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuXG4gICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBlaXRoZXIgXCJyb29tTi5jb2xvclwiIG9yIFwicG9ydGFsTi5jb2xvclwiIFxuICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZFxuICAgIGNvbnN0IHBhcmFtcyA9IG5vZGVOYW1lLm1hdGNoKC8oW0EtWmEtel0qKV8oW0EtWmEtejAtOV0qKV8oW0EtWmEtejAtOV0qKSQvKVxuICAgIFxuICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiA0LCBmaXJzdCBtYXRjaCBpcyB0aGUgcG9ydGFsIHR5cGUsXG4gICAgLy8gc2Vjb25kIGlzIHRoZSBuYW1lIG9yIG51bWJlciwgYW5kIGxhc3QgaXMgdGhlIGNvbG9yXG4gICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDQpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwicG9ydGFsIG5vZGUgbmFtZSBub3QgZm9ybWVkIGNvcnJlY3RseTogXCIsIG5vZGVOYW1lKVxuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gbnVsbFxuICAgICAgICB0aGlzLmNvbG9yID0gXCJyZWRcIiAvLyBkZWZhdWx0IHNvIHRoZSBwb3J0YWwgaGFzIGEgY29sb3IgdG8gdXNlXG4gICAgICAgIHJldHVybjtcbiAgICB9IFxuICAgIGlmIChwYXJhbXNbMV0gPT09IFwicm9vbVwiKSB7XG4gICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDE7XG4gICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcGFyc2VJbnQocGFyYW1zWzJdKVxuICAgIH0gZWxzZSBpZiAocGFyYW1zWzFdID09PSBcInBvcnRhbFwiKSB7XG4gICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDI7XG4gICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcGFyYW1zWzJdXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMDtcbiAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgfSBcbiAgICB0aGlzLmNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKHBhcmFtc1szXSlcbiAgfSxcblxuICBzZXRSYWRpdXModmFsKSB7XG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgZnJvbTogdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5yYWRpdXMudmFsdWUsXG4gICAgICB0bzogdmFsLFxuICAgIH0pXG4gIH0sXG4gIG9wZW4oKSB7XG4gICAgdGhpcy5zZXRSYWRpdXMoMSlcbiAgfSxcbiAgY2xvc2UoKSB7XG4gICAgdGhpcy5zZXRSYWRpdXMoMClcbiAgfSxcbiAgaXNDbG9zZWQoKSB7XG4gICAgcmV0dXJuIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlID09PSAwXG4gIH0sXG59KVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIDM2MCBpbWFnZSB0aGF0IGZpbGxzIHRoZSB1c2VyJ3MgdmlzaW9uIHdoZW4gaW4gYSBjbG9zZSBwcm94aW1pdHkuXG4gKlxuICogVXNhZ2VcbiAqID09PT09PT1cbiAqIEdpdmVuIGEgMzYwIGltYWdlIGFzc2V0IHdpdGggdGhlIGZvbGxvd2luZyBVUkwgaW4gU3Bva2U6XG4gKiBodHRwczovL2d0LWFlbC1hcS1hc3NldHMuYWVsYXRndC1pbnRlcm5hbC5uZXQvZmlsZXMvMTIzNDVhYmMtNjc4OWRlZi5qcGdcbiAqXG4gKiBUaGUgbmFtZSBvZiB0aGUgYGltbWVyc2l2ZS0zNjAuZ2xiYCBpbnN0YW5jZSBpbiB0aGUgc2NlbmUgc2hvdWxkIGJlOlxuICogXCJzb21lLWRlc2NyaXB0aXZlLWxhYmVsX18xMjM0NWFiYy02Nzg5ZGVmX2pwZ1wiIE9SIFwiMTIzNDVhYmMtNjc4OWRlZl9qcGdcIlxuICovXG5cbmNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCB7XG4gIHNjaGVtYToge1xuICAgIHVybDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbCB9LFxuICB9LFxuICBpbml0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgdXJsID0gdGhpcy5kYXRhLnVybCA/PyB0aGlzLnBhcnNlU3Bva2VOYW1lKClcbiAgICBjb25zdCBleHRlbnNpb24gPSB1cmwubWF0Y2goL14uKlxcLiguKikkLylbMV1cblxuICAgIC8vIG1lZGlhLWltYWdlIHdpbGwgc2V0IHVwIHRoZSBzcGhlcmUgZ2VvbWV0cnkgZm9yIHVzXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ21lZGlhLWltYWdlJywge1xuICAgICAgcHJvamVjdGlvbjogJzM2MC1lcXVpcmVjdGFuZ3VsYXInLFxuICAgICAgYWxwaGFNb2RlOiAnb3BhcXVlJyxcbiAgICAgIHNyYzogdXJsLFxuICAgICAgdmVyc2lvbjogMSxcbiAgICAgIGJhdGNoOiBmYWxzZSxcbiAgICAgIGNvbnRlbnRUeXBlOiBgaW1hZ2UvJHtleHRlbnNpb259YCxcbiAgICAgIGFscGhhQ3V0b2ZmOiAwLFxuICAgIH0pXG4gICAgLy8gYnV0IHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhpcyB0byBoYXBwZW5cbiAgICB0aGlzLm1lc2ggPSBhd2FpdCB0aGlzLmdldE1lc2goKVxuICAgIHRoaXMubWVzaC5nZW9tZXRyeS5zY2FsZSgxMDAsIDEwMCwgMTAwKVxuICAgIHRoaXMubWVzaC5tYXRlcmlhbC5zZXRWYWx1ZXMoe1xuICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICBkZXB0aFRlc3Q6IGZhbHNlLFxuICAgIH0pXG4gICAgdGhpcy5uZWFyID0gMVxuICAgIHRoaXMuZmFyID0gMS4zXG5cbiAgICAvLyBSZW5kZXIgT1ZFUiB0aGUgc2NlbmUgYnV0IFVOREVSIHRoZSBjdXJzb3JcbiAgICB0aGlzLm1lc2gucmVuZGVyT3JkZXIgPSBBUFAuUkVOREVSX09SREVSLkNVUlNPUiAtIDFcbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLm1lc2gpIHtcbiAgICAgIC8vIExpbmVhcmx5IG1hcCBjYW1lcmEgZGlzdGFuY2UgdG8gbWF0ZXJpYWwgb3BhY2l0eVxuICAgICAgdGhpcy5tZXNoLmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSB3b3JsZFNlbGYuZGlzdGFuY2VUbyh3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IG9wYWNpdHkgPSAxIC0gKGRpc3RhbmNlIC0gdGhpcy5uZWFyKSAvICh0aGlzLmZhciAtIHRoaXMubmVhcilcbiAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gb3BhY2l0eVxuICAgIH1cbiAgfSxcbiAgcGFyc2VTcG9rZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBBY2NlcHRlZCBuYW1lczogXCJsYWJlbF9faW1hZ2UtaGFzaF9leHRcIiBPUiBcImltYWdlLWhhc2hfZXh0XCJcbiAgICBjb25zdCBzcG9rZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgIGNvbnN0IFssIGhhc2gsIGV4dGVuc2lvbl0gPSBzcG9rZU5hbWUubWF0Y2goLyg/Oi4qX18pPyguKilfKC4qKS8pXG4gICAgY29uc3QgdXJsID0gYGh0dHBzOi8vZ3QtYWVsLWFxLWFzc2V0cy5hZWxhdGd0LWludGVybmFsLm5ldC9maWxlcy8ke2hhc2h9LiR7ZXh0ZW5zaW9ufWBcbiAgICByZXR1cm4gdXJsXG4gIH0sXG4gIGdldE1lc2g6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICAgIGlmIChtZXNoKSByZXNvbHZlKG1lc2gpXG4gICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdpbWFnZS1sb2FkZWQnLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgcmVzb2x2ZSh0aGlzLmVsLm9iamVjdDNETWFwLm1lc2gpXG4gICAgICAgIH0sXG4gICAgICAgIHsgb25jZTogdHJ1ZSB9XG4gICAgICApXG4gICAgfSlcbiAgfSxcbn0pXG4iLCIvLyBQYXJhbGxheCBPY2NsdXNpb24gc2hhZGVycyBmcm9tXG4vLyAgICBodHRwOi8vc3VuYW5kYmxhY2tjYXQuY29tL3RpcEZ1bGxWaWV3LnBocD90b3BpY2lkPTI4XG4vLyBObyB0YW5nZW50LXNwYWNlIHRyYW5zZm9ybXMgbG9naWMgYmFzZWQgb25cbi8vICAgaHR0cDovL21taWtrZWxzZW4zZC5ibG9nc3BvdC5zay8yMDEyLzAyL3BhcmFsbGF4cG9jLW1hcHBpbmctYW5kLW5vLXRhbmdlbnQuaHRtbFxuXG4vLyBJZGVudGl0eSBmdW5jdGlvbiBmb3IgZ2xzbC1saXRlcmFsIGhpZ2hsaWdodGluZyBpbiBWUyBDb2RlXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCBQYXJhbGxheFNoYWRlciA9IHtcbiAgLy8gT3JkZXJlZCBmcm9tIGZhc3Rlc3QgdG8gYmVzdCBxdWFsaXR5LlxuICBtb2Rlczoge1xuICAgIG5vbmU6ICdOT19QQVJBTExBWCcsXG4gICAgYmFzaWM6ICdVU0VfQkFTSUNfUEFSQUxMQVgnLFxuICAgIHN0ZWVwOiAnVVNFX1NURUVQX1BBUkFMTEFYJyxcbiAgICBvY2NsdXNpb246ICdVU0VfT0NMVVNJT05fUEFSQUxMQVgnLCAvLyBhLmsuYS4gUE9NXG4gICAgcmVsaWVmOiAnVVNFX1JFTElFRl9QQVJBTExBWCcsXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBidW1wTWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgbWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgfSxcblxuICB2ZXJ0ZXhTaGFkZXI6IGdsc2xgXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZVdiA9IHV2O1xuICAgICAgdmVjNCBtdlBvc2l0aW9uID0gbW9kZWxWaWV3TWF0cml4ICogdmVjNCggcG9zaXRpb24sIDEuMCApO1xuICAgICAgdlZpZXdQb3NpdGlvbiA9IC1tdlBvc2l0aW9uLnh5ejtcbiAgICAgIHZOb3JtYWwgPSBub3JtYWxpemUoIG5vcm1hbE1hdHJpeCAqIG5vcm1hbCApO1xuICAgICAgXG4gICAgICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtdlBvc2l0aW9uO1xuICAgIH1cbiAgYCxcblxuICBmcmFnbWVudFNoYWRlcjogZ2xzbGBcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBidW1wTWFwO1xuICAgIHVuaWZvcm0gc2FtcGxlcjJEIG1hcDtcblxuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhTY2FsZTtcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWluTGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNYXhMYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBmYWRlOyAvLyBDVVNUT01cblxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICAjaWZkZWYgVVNFX0JBU0lDX1BBUkFMTEFYXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgZmxvYXQgaW5pdGlhbEhlaWdodCA9IHRleHR1cmUyRChidW1wTWFwLCB2VXYpLnI7XG5cbiAgICAgIC8vIE5vIE9mZnNldCBMaW1pdHRpbmc6IG1lc3N5LCBmbG9hdGluZyBvdXRwdXQgYXQgZ3JhemluZyBhbmdsZXMuXG4gICAgICAvL1widmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56ICogaW5pdGlhbEhlaWdodDtcIixcblxuICAgICAgLy8gT2Zmc2V0IExpbWl0aW5nXG4gICAgICB2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgKiBpbml0aWFsSGVpZ2h0O1xuICAgICAgcmV0dXJuIHZVdiAtIHRleENvb3JkT2Zmc2V0O1xuICAgIH1cblxuICAgICNlbHNlXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgLy8gRGV0ZXJtaW5lIG51bWJlciBvZiBsYXllcnMgZnJvbSBhbmdsZSBiZXR3ZWVuIFYgYW5kIE5cbiAgICAgIGZsb2F0IG51bUxheWVycyA9IG1peChwYXJhbGxheE1heExheWVycywgcGFyYWxsYXhNaW5MYXllcnMsIGFicyhkb3QodmVjMygwLjAsIDAuMCwgMS4wKSwgVikpKTtcblxuICAgICAgZmxvYXQgbGF5ZXJIZWlnaHQgPSAxLjAgLyBudW1MYXllcnM7XG4gICAgICBmbG9hdCBjdXJyZW50TGF5ZXJIZWlnaHQgPSAwLjA7XG4gICAgICAvLyBTaGlmdCBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzIGZvciBlYWNoIGl0ZXJhdGlvblxuICAgICAgdmVjMiBkdGV4ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogLyBudW1MYXllcnM7XG5cbiAgICAgIHZlYzIgY3VycmVudFRleHR1cmVDb29yZHMgPSB2VXY7XG5cbiAgICAgIGZsb2F0IGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuXG4gICAgICAvLyB3aGlsZSAoIGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0IClcbiAgICAgIC8vIEluZmluaXRlIGxvb3BzIGFyZSBub3Qgd2VsbCBzdXBwb3J0ZWQuIERvIGEgXCJsYXJnZVwiIGZpbml0ZVxuICAgICAgLy8gbG9vcCwgYnV0IG5vdCB0b28gbGFyZ2UsIGFzIGl0IHNsb3dzIGRvd24gc29tZSBjb21waWxlcnMuXG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IDMwOyBpICs9IDEpIHtcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlIDw9IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBsYXllckhlaWdodDtcbiAgICAgICAgLy8gU2hpZnQgdGV4dHVyZSBjb29yZGluYXRlcyBhbG9uZyB2ZWN0b3IgVlxuICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkdGV4O1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgIH1cblxuICAgICAgI2lmZGVmIFVTRV9TVEVFUF9QQVJBTExBWFxuXG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX1JFTElFRl9QQVJBTExBWClcblxuICAgICAgdmVjMiBkZWx0YVRleENvb3JkID0gZHRleCAvIDIuMDtcbiAgICAgIGZsb2F0IGRlbHRhSGVpZ2h0ID0gbGF5ZXJIZWlnaHQgLyAyLjA7XG5cbiAgICAgIC8vIFJldHVybiB0byB0aGUgbWlkIHBvaW50IG9mIHByZXZpb3VzIGxheWVyXG4gICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuXG4gICAgICAvLyBCaW5hcnkgc2VhcmNoIHRvIGluY3JlYXNlIHByZWNpc2lvbiBvZiBTdGVlcCBQYXJhbGxheCBNYXBwaW5nXG4gICAgICBjb25zdCBpbnQgbnVtU2VhcmNoZXMgPSA1O1xuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBudW1TZWFyY2hlczsgaSArPSAxKSB7XG4gICAgICAgIGRlbHRhVGV4Q29vcmQgLz0gMi4wO1xuICAgICAgICBkZWx0YUhlaWdodCAvPSAyLjA7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgICAvLyBTaGlmdCBhbG9uZyBvciBhZ2FpbnN0IHZlY3RvciBWXG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIC8vIEJlbG93IHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBhYm92ZSB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfT0NMVVNJT05fUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgcHJldlRDb29yZHMgPSBjdXJyZW50VGV4dHVyZUNvb3JkcyArIGR0ZXg7XG5cbiAgICAgIC8vIEhlaWdodHMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCBuZXh0SCA9IGhlaWdodEZyb21UZXh0dXJlIC0gY3VycmVudExheWVySGVpZ2h0O1xuICAgICAgZmxvYXQgcHJldkggPSB0ZXh0dXJlMkQoYnVtcE1hcCwgcHJldlRDb29yZHMpLnIgLSBjdXJyZW50TGF5ZXJIZWlnaHQgKyBsYXllckhlaWdodDtcblxuICAgICAgLy8gUHJvcG9ydGlvbnMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCB3ZWlnaHQgPSBuZXh0SCAvIChuZXh0SCAtIHByZXZIKTtcblxuICAgICAgLy8gSW50ZXJwb2xhdGlvbiBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzXG4gICAgICByZXR1cm4gcHJldlRDb29yZHMgKiB3ZWlnaHQgKyBjdXJyZW50VGV4dHVyZUNvb3JkcyAqICgxLjAgLSB3ZWlnaHQpO1xuXG4gICAgICAjZWxzZSAvLyBOT19QQVJBTExBWFxuXG4gICAgICByZXR1cm4gdlV2O1xuXG4gICAgICAjZW5kaWZcbiAgICB9XG4gICAgI2VuZGlmXG5cbiAgICB2ZWMyIHBlcnR1cmJVdih2ZWMzIHN1cmZQb3NpdGlvbiwgdmVjMyBzdXJmTm9ybWFsLCB2ZWMzIHZpZXdQb3NpdGlvbikge1xuICAgICAgdmVjMiB0ZXhEeCA9IGRGZHgodlV2KTtcbiAgICAgIHZlYzIgdGV4RHkgPSBkRmR5KHZVdik7XG5cbiAgICAgIHZlYzMgdlNpZ21hWCA9IGRGZHgoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlNpZ21hWSA9IGRGZHkoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlIxID0gY3Jvc3ModlNpZ21hWSwgc3VyZk5vcm1hbCk7XG4gICAgICB2ZWMzIHZSMiA9IGNyb3NzKHN1cmZOb3JtYWwsIHZTaWdtYVgpO1xuICAgICAgZmxvYXQgZkRldCA9IGRvdCh2U2lnbWFYLCB2UjEpO1xuXG4gICAgICB2ZWMyIHZQcm9qVnNjciA9ICgxLjAgLyBmRGV0KSAqIHZlYzIoZG90KHZSMSwgdmlld1Bvc2l0aW9uKSwgZG90KHZSMiwgdmlld1Bvc2l0aW9uKSk7XG4gICAgICB2ZWMzIHZQcm9qVnRleDtcbiAgICAgIHZQcm9qVnRleC54eSA9IHRleER4ICogdlByb2pWc2NyLnggKyB0ZXhEeSAqIHZQcm9qVnNjci55O1xuICAgICAgdlByb2pWdGV4LnogPSBkb3Qoc3VyZk5vcm1hbCwgdmlld1Bvc2l0aW9uKTtcblxuICAgICAgcmV0dXJuIHBhcmFsbGF4TWFwKHZQcm9qVnRleCk7XG4gICAgfVxuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdmVjMiBtYXBVdiA9IHBlcnR1cmJVdigtdlZpZXdQb3NpdGlvbiwgbm9ybWFsaXplKHZOb3JtYWwpLCBub3JtYWxpemUodlZpZXdQb3NpdGlvbikpO1xuICAgICAgXG4gICAgICAvLyBDVVNUT00gU1RBUlRcbiAgICAgIHZlYzQgdGV4ZWwgPSB0ZXh0dXJlMkQobWFwLCBtYXBVdik7XG4gICAgICB2ZWMzIGNvbG9yID0gbWl4KHRleGVsLnh5eiwgdmVjMygwKSwgZmFkZSk7XG4gICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgLy8gQ1VTVE9NIEVORFxuICAgIH1cblxuICBgLFxufVxuXG5leHBvcnQgeyBQYXJhbGxheFNoYWRlciB9XG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQ3JlYXRlIHRoZSBpbGx1c2lvbiBvZiBkZXB0aCBpbiBhIGNvbG9yIGltYWdlIGZyb20gYSBkZXB0aCBtYXBcbiAqXG4gKiBVc2FnZVxuICogPT09PT1cbiAqIENyZWF0ZSBhIHBsYW5lIGluIEJsZW5kZXIgYW5kIGdpdmUgaXQgYSBtYXRlcmlhbCAoanVzdCB0aGUgZGVmYXVsdCBQcmluY2lwbGVkIEJTREYpLlxuICogQXNzaWduIGNvbG9yIGltYWdlIHRvIFwiY29sb3JcIiBjaGFubmVsIGFuZCBkZXB0aCBtYXAgdG8gXCJlbWlzc2l2ZVwiIGNoYW5uZWwuXG4gKiBZb3UgbWF5IHdhbnQgdG8gc2V0IGVtaXNzaXZlIHN0cmVuZ3RoIHRvIHplcm8gc28gdGhlIHByZXZpZXcgbG9va3MgYmV0dGVyLlxuICogQWRkIHRoZSBcInBhcmFsbGF4XCIgY29tcG9uZW50IGZyb20gdGhlIEh1YnMgZXh0ZW5zaW9uLCBjb25maWd1cmUsIGFuZCBleHBvcnQgYXMgLmdsYlxuICovXG5cbmltcG9ydCB7IFBhcmFsbGF4U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMnXG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4Jywge1xuICBzY2hlbWE6IHtcbiAgICBzdHJlbmd0aDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC41IH0sXG4gICAgY3V0b2ZmVHJhbnNpdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDggfSxcbiAgICBjdXRvZmZBbmdsZTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDQgfSxcbiAgfSxcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBjb25zdCB7IG1hcDogY29sb3JNYXAsIGVtaXNzaXZlTWFwOiBkZXB0aE1hcCB9ID0gbWVzaC5tYXRlcmlhbFxuICAgIGNvbG9yTWFwLndyYXBTID0gY29sb3JNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgZGVwdGhNYXAud3JhcFMgPSBkZXB0aE1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBjb25zdCB7IHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIgfSA9IFBhcmFsbGF4U2hhZGVyXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICBmcmFnbWVudFNoYWRlcixcbiAgICAgIGRlZmluZXM6IHsgVVNFX09DTFVTSU9OX1BBUkFMTEFYOiB0cnVlIH0sXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBtYXA6IHsgdmFsdWU6IGNvbG9yTWFwIH0sXG4gICAgICAgIGJ1bXBNYXA6IHsgdmFsdWU6IGRlcHRoTWFwIH0sXG4gICAgICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IC0xICogdGhpcy5kYXRhLnN0cmVuZ3RoIH0sXG4gICAgICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiAyMCB9LFxuICAgICAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogMzAgfSxcbiAgICAgICAgZmFkZTogeyB2YWx1ZTogMCB9LFxuICAgICAgfSxcbiAgICB9KVxuICAgIG1lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgaWYgKHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEpIHtcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih2ZWMpXG4gICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh2ZWMpXG4gICAgICBjb25zdCBhbmdsZSA9IHZlYy5hbmdsZVRvKGZvcndhcmQpXG4gICAgICBjb25zdCBmYWRlID0gbWFwTGluZWFyQ2xhbXBlZChcbiAgICAgICAgYW5nbGUsXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSAtIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgKyB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgMCwgLy8gSW4gdmlldyB6b25lLCBubyBmYWRlXG4gICAgICAgIDEgLy8gT3V0c2lkZSB2aWV3IHpvbmUsIGZ1bGwgZmFkZVxuICAgICAgKVxuICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5mYWRlLnZhbHVlID0gZmFkZVxuICAgIH1cbiAgfSxcbn0pXG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBiMSArICgoeCAtIGExKSAqIChiMiAtIGIxKSkgLyAoYTIgLSBhMSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyQ2xhbXBlZCh4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gY2xhbXAobWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSwgYjEsIGIyKVxufVxuIiwiaW1wb3J0ICcuLi9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcG9ydGFsLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcGFyYWxsYXguanMnXG5cbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywgJ2ltbWVyc2l2ZS0zNjAnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsICdwb3J0YWwnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4JywgJ3BhcmFsbGF4JylcbiJdLCJuYW1lcyI6WyJ3b3JsZENhbWVyYSIsIndvcmxkU2VsZiIsImdsc2wiLCJ2ZXJ0ZXhTaGFkZXIiLCJzbm9pc2UiLCJmcmFnbWVudFNoYWRlciJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFO0FBQ3BDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDbEQsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDOUMsR0FBRztBQUNIO0FBQ0EsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLElBQUk7QUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUU7QUFDN0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztBQUNsQyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUs7QUFDOUIsUUFBUSxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVE7QUFDNUIsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUNsQixRQUFRLFdBQVcsRUFBRSxJQUFJO0FBQ3pCLFFBQVEsR0FBRyxFQUFFLEtBQUs7QUFDbEIsT0FBTyxDQUFDO0FBQ1IsTUFBSztBQUNMLElBQUksSUFBSSxDQUFDLEtBQUssQ0FB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SUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUM7QUFDakUsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxTQUFTLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUM7QUFDakUsR0FBRztBQUNILENBQUM7O0FDbkJELE1BQU1DLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBLE1BQU1BLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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
