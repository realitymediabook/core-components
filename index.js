import * as htmlComponents from 'https://resources.realitymedia.digital/vue-apps/dist/hubs.js';

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

// Provides a global registry of running components
// copied from hubs source

function registerComponentInstance(component, name) {
    window.APP.componentRegistry = window.APP.componentRegistry || {};
    window.APP.componentRegistry[name] = window.APP.componentRegistry[name] || [];
    window.APP.componentRegistry[name].push(component);
}

function deregisterComponentInstance(component, name) {
    if (!window.APP.componentRegistry || !window.APP.componentRegistry[name]) return;
    window.APP.componentRegistry[name].splice(window.APP.componentRegistry[name].indexOf(component), 1);
}

// copied from hubs

function findAncestorWithComponent(entity, componentName) {
    while (entity && !(entity.components && entity.components[componentName])) {
      entity = entity.parentNode;
    }
    return entity;
  }

/**
 * Description
 * ===========
 * break the room into quadrants of a certain size, and hide the contents of areas that have
 * nobody in them.  Media will be paused in those areas too.
 * 
 * Include a way for the portal component to turn on elements in the region of the portal before
 * it captures a cubemap
 */

 // arbitrarily choose 1000000 as the number of computed zones in  x and y
let MAX_ZONES = 1000000;
let regionTag = function(size, obj3d) {
    let pos = obj3d.position;
    let xp = Math.floor(pos.x / size) + MAX_ZONES/2;
    let zp = Math.floor(pos.z / size) + MAX_ZONES/2;
    return MAX_ZONES * xp + zp
};

let regionsInUse = [];

/**
 * Find the closest ancestor (including the passed in entity) that has an `object-region-follower` component,
 * and return that component
 */
function getRegionFollower(entity) {
    let curEntity = entity;
  
    while(curEntity && curEntity.components && !curEntity.components["object-region-follower"]) {
        curEntity = curEntity.parentNode;
    }
  
    if (!curEntity || !curEntity.components || !curEntity.components["object-region-follower"]) {
        return;
    }
    
    return curEntity.components["object-region-follower"]
}
  
function addToRegion(region) {
    regionsInUse[region] ? regionsInUse[region]++ : regionsInUse[region] = 1;
    console.log("Avatars in region " + region + ": " + regionsInUse[region]);
    if (regionsInUse[region] == 1) {
        showHideObjectsInRegion(region, true);
    } else {
        console.log("already another avatar in this region, no change");
    }
}

function subtractFromRegion(region) {
    if (regionsInUse[region]) {regionsInUse[region]--; }
    console.log("Avatars left region " + region + ": " + regionsInUse[region]);

    if (regionsInUse[region] == 0) {
        showHideObjectsInRegion(region, false);
    } else {
        console.log("still another avatar in this region, no change");
    }
}

function showRegionForObject(element) {
    let follower = getRegionFollower(element);
    if (!follower) { return }

    console.log("showing objects near " + follower.el.className);

    addToRegion(follower.region);
}

function hiderRegionForObject(element) {
    let follower = getRegionFollower(element);
    if (!follower) { return }

    console.log("hiding objects near " + follower.el.className);

    subtractFromRegion(follower.region);
}

function showHideObjects() {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ("showing/hiding all objects");
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      let visible = regionsInUse[obj.region] ? true: false;
        
      if (obj.el.object3D.visible == visible) { continue }

      console.log ((visible ? "showing " : "hiding ") + obj.el.className);
      obj.showHide(visible);
    }
  
    return null;
}

function showHideObjectsInRegion(region, visible) {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ((visible ? "showing" : "hiding") + " all objects in region " + region);
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      if (obj.region == region) {
        console.log ((visible ? "showing " : " hiding") + obj.el.className);
        obj.showHide(visible);
      }
    }
  
    return null;
}
  
AFRAME.registerComponent('avatar-region-follower', {
    schema: {
        size: { default: 10 }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D);
        console.log("Avatar: region ", this.region);
        addToRegion(this.region);

        registerComponentInstance(this, "avatar-region-follower");
    },
    remove: function() {
        deregisterComponentInstance(this, "avatar-region-follower");
        subtractFromRegion(this.region);
    },

    tick: function () {
        let newRegion = regionTag(this.data.size, this.el.object3D);
        if (newRegion != this.region) {
            subtractFromRegion(this.region);
            addToRegion(newRegion);
            this.region = newRegion;
        }
    },
});

AFRAME.registerComponent('object-region-follower', {
    schema: {
        size: { default: 10 },
        dynamic: { default: true }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D);

        this.showHide = this.showHide.bind(this);
        if (this.el.components["media-video"]) {
            this.wasPaused = this.el.components["media-video"].data.videoPaused;
        }
        registerComponentInstance(this, "object-region-follower");
    },

    remove: function() {
        deregisterComponentInstance(this, "object-region-follower");
    },

    tick: function () {
        // objects in the environment scene don't move
        if (!this.data.dynamic) { return }

        this.region = regionTag(this.data.size, this.el.object3D);

        let visible = regionsInUse[this.region] ? true: false;
        
        if (this.el.object3D.visible == visible) { return }

        // handle show/hiding the objects
        this.showHide(visible);
    },

    showHide: function (visible) {
        // handle show/hiding the objects
        this.el.object3D.visible = visible;

        /// check for media-video component on parent to see if we're a video.  Also same for audio
        if (this.el.components["media-video"]) {
            if (visible) {
                if (this.wasPaused != this.el.components["media-video"].data.videoPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            } else {
                this.wasPaused = this.el.components["media-video"].data.videoPaused;
                if (!this.wasPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            }
        }
    }
});

AFRAME.registerComponent('region-hider', {
    schema: {
        // name must follow the pattern "*_componentName"
        size: { default: 10 }
    },
    init: function () {
        // If there is a parent with "nav-mesh-helper", this is in the scene.  
        // If not, it's in an object we dropped on the window, which we don't support
        if (!findAncestorWithComponent(this.el, "nav-mesh-helper")) {
            console.warn("region-hider component must be in the environment scene glb.");
            this.size = 0;
            return;
        }
        
        if(this.data.size == 0) {
            this.data.size = 10;
            this.size = this.parseNodeName(this.data.size);
        }

        // this.newScene = this.newScene.bind(this)
        // this.el.sceneEl.addEventListener("environment-scene-loaded", this.newScene)
        // const environmentScene = document.querySelector("#environment-scene");
        // this.addSceneElement = this.addSceneElement.bind(this)
        // this.removeSceneElement = this.removeSceneElement.bind(this)
        // environmentScene.addEventListener("child-attached", this.addSceneElement)
        // environmentScene.addEventListener("child-detached", this.removeSceneElement)

        // we want to notice when new things get added to the room.  This will happen for
        // objects dropped in the room, or for new remote avatars, at least
        // this.addRootElement = this.addRootElement.bind(this)
        // this.removeRootElement = this.removeRootElement.bind(this)
        // this.el.sceneEl.addEventListener("child-attached", this.addRootElement)
        // this.el.sceneEl.addEventListener("child-detached", this.removeRootElement)

        // want to see if there are pinned objects that were loaded from hubs
        let roomObjects = document.getElementsByClassName("RoomObjects");
        this.roomObjects = roomObjects.length > 0 ? roomObjects[0] : null;

        // get avatars
        const avatars = this.el.sceneEl.querySelectorAll("[player-info]");
        avatars.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size });
        });

        // walk objects in the root (things that have been dropped on the scene)
        // - drawings have class="drawing", networked-drawing
        // Not going to do drawings right now.

        // pinned media live under a node with class="RoomObjects"
        var nodes = this.el.sceneEl.querySelectorAll(".RoomObjects > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        // - camera has camera-tool        
        // - image from camera, or dropped, has media-loader, media-image, listed-media
        // - glb has media-loader, gltf-model-plus, listed-media
        // - video has media-loader, media-video, listed-media
        //
        //  so, get all camera-tools, and media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool], a-scene > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        // walk the objects in the environment scene.  Must wait for scene to finish loading
        this.sceneLoaded = this.sceneLoaded.bind(this);
        this.el.sceneEl.addEventListener("environment-scene-loaded", this.sceneLoaded);

    },

    isAncestor: function (root, entity) {
        while (entity && !(entity == root)) {
          entity = entity.parentNode;
        }
        return (entity == root);
    },
    
    // Things we don't want to hide:
    // - [waypoint]
    // - parent of something with [navmesh] as a child (this is the navigation stuff
    // - this.el.parentEl.parentEl
    // - [skybox]
    // - [directional-light]
    // - [ambient-light]
    // - [hemisphere-light]
    // - #CombinedMesh
    // - #scene-preview-camera or [scene-preview-camera]
    //
    // we will do
    // - [media-loader]
    // - [spot-light]
    // - [point-light]
    sceneLoaded: function () {
        let nodes = document.getElementById("environment-scene").children[0].children[0];
        //var nodes = this.el.parentEl.parentEl.parentEl.childNodes;
        for (let i=0; i < nodes.length; i++) {
            let node = nodes[i];
            //if (node == this.el.parentEl.parentEl) {continue}
            if (this.isAncestor(node, this.el)) {continue}

            let cl = node.className;
            if (cl === "CombinedMesh" || cl === "scene-preview-camera") {continue}

            let c = node.components;
            if (c["waypoint"] || c["skybox"] || c["directional-light"] || c["ambient-light"] || c["hemisphere-light"]) {continue}

            let ch = node.children;
            var navmesh = false;
            for (let j=0; j < ch.length; j++) {
                if (ch[j].components["navmesh"]) {
                    navmesh = true;
                    break;
                }
            }
            if (navmesh) {continue}
            
            node.setAttribute("object-region-follower", { size: this.size, dynamic: false });
        }

        // all objects and avatar should be set up, so lets make sure all objects are correctly shown
        showHideObjects();
    },

    update: function () {
        if (this.data.size === this.size) return

        if (this.data.size == 0) {
            this.data.size = 10;
            this.size = this.parseNodeName(this.data.size);
        }
    },

    remove: function () {
        this.el.sceneEl.removeEventListener("environment-scene-loaded", this.sceneLoaded);
    },

    // per frame stuff
    tick: function (time) {
        // size == 0 is used to signal "do nothing"
        if (this.size == 0) {return}

        // see if there are new avatars
        var nodes = this.el.sceneEl.querySelectorAll("[player-info]:not([avatar-region-follower])");
        nodes.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size });
        });

        //  see if there are new camera-tools or media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]:not([object-region-follower]), a-scene > [media-loader]:not([object-region-follower])");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });
    },
  
    // newScene: function(model) {
    //     console.log("environment scene loaded: ", model)
    // },

    // addRootElement: function({ detail: { el } }) {
    //     console.log("entity added to root: ", el)
    // },

    // removeRootElement: function({ detail: { el } }) {
    //     console.log("entity removed from root: ", el)
    // },

    // addSceneElement: function({ detail: { el } }) {
    //     console.log("entity added to environment scene: ", el)
    // },

    // removeSceneElement: function({ detail: { el } }) {
    //     console.log("entity removed from environment scene: ", el)
    // },  
    
    parseNodeName: function (size) {
        // nodes should be named anything at the beginning with 
        //  "size" (an integer number)
        // at the very end.  This will set the hidder component to 
        // use that size in meters for the quadrants
        this.nodeName = this.el.parentEl.parentEl.className;

        const params = this.nodeName.match(/_([0-9]*)$/);

        // if pattern matches, we will have length of 2, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("region-hider componentName not formatted correctly: ", this.nodeName);
            return size
        } else {
            let nodeSize = parseInt(params[1]);
            if (!nodeSize) {
                return size
            } else {
                return nodeSize
            }
        }
    }
});

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

function mapMaterials(object3D, fn) {
    let mesh = object3D; 
    if (!mesh.material) return;
  
    if (Array.isArray(mesh.material)) {
      return mesh.material.map(fn);
    } else {
      return fn(mesh.material);
    }
}
  
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
    var params = {token: window.APP.store.state.credentials.token,
                  room_id: window.APP.hubChannel.hubId};

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
      //return this.roomData.rooms.length > number ? "https://xr.realitymedia.digital/" + this.roomData.rooms[number] : null;
      let url = window.SSO.userInfo.rooms.length > number ? "https://xr.realitymedia.digital/" + window.SSO.userInfo.rooms[number] : null;
      return url
  },
  getCubeMap: async function (number) {
      this.waitForFetch();
      return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  waitForFetch: function () {
     if (this.roomData && window.SSO.userInfo) return
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
    portalType: { default: "" },
    portalTarget: { default: "" },
    color: { type: 'color', default: null },
    materialTarget: { type: 'string', default: null }
  },
  init: async function () {
    this.system = window.APP.scene.systems.portal; // A-Frame is supposed to do this by default but doesn't?

    if (this.data.portalType.length > 0 ) {
        this.setPortalInfo(this.data.portalType, this.data.portalTarget, this.data.color);
    } else {
        this.portalType = 0;
    }

    if (this.portalType == 0) {
        // parse the name to get portal type, target, and color
        this.parseNodeName();
    }
    
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
    //const mesh = this.el.getOrCreateObject3D('mesh')
    //mesh.material = this.material
    this.replaceMaterial(this.material);

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
            showRegionForObject(this.el);
            this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D);
            hiderRegionForObject(this.el);
        });
    }

    this.el.setAttribute('animation__portal', {
        property: 'components.portal.material.uniforms.radius.value',
        dur: 700,
        easing: 'easeInOutCubic',
    });
    // this.el.addEventListener('animationbegin', () => (this.el.object3D.visible = true))
    // this.el.addEventListener('animationcomplete__portal', () => (this.el.object3D.visible = !this.isClosed()))

    // going to want to try and make the object this portal is on clickable
    this.el.setAttribute('is-remote-hover-target','');
    this.el.setAttribute('tags', {singleActionButton: true});
    //this.el.setAttribute('class', "interactable")
    // orward the 'interact' events to our portal movement 
    //this.followPortal = this.followPortal.bind(this)
    //this.el.object3D.addEventListener('interact', this.followPortal)

    this.el.setAttribute('proximity-events', { radius: 5 });
    this.el.addEventListener('proximityenter', () => this.open());
    this.el.addEventListener('proximityleave', () => this.close());
  },

  replaceMaterial: function (newMaterial) {
    let target = this.data.materialTarget;
    if (target && target.length == 0) {target=null;}
    
    let traverse = (object) => {
      let mesh = object;
      if (mesh.material) {
          mapMaterials(mesh, (material) => {         
              if (!target || material.name === target) {
                  mesh.material = newMaterial;
              }
          });
      }
      const children = object.children;
      for (let i = 0; i < children.length; i++) {
          traverse(children[i]);
      }
    };

    let replaceMaterials = () => {
    // mesh would contain the object that is, or contains, the meshes
    var mesh = this.el.object3DMap.mesh;
    if (!mesh) {
        // if no mesh, we'll search through all of the children.  This would
        // happen if we dropped the component on a glb in spoke
        mesh = this.el.object3D;
    }
    traverse(mesh);
    this.el.removeEventListener("model-loaded", initializer);
    };

    let root = findAncestorWithComponent(this.el, "gltf-model-plus");
    let initializer = () =>{
      if (this.el.components["media-loader"]) {
          this.el.addEventListener("media-loaded", replaceMaterials);
      } else {
          replaceMaterials();
      }
    };
    root.addEventListener("model-loaded", initializer);
  },

//   followPortal: function() {
//     if (this.portalType == 1) {
//         console.log("set window.location.href to " + this.other)
//         window.location.href = this.other
//       } else if (this.portalType == 2) {
//         this.system.teleportTo(this.other.object3D)
//       }
//   },
  tick: function (time) {
    this.material.uniforms.time.value = time / 1000;
        
    if (this.other && !this.system.teleporting) {
      this.el.object3D.getWorldPosition(worldPos);
      this.el.sceneEl.camera.getWorldPosition(worldCameraPos);
      const dist = worldCameraPos.distanceTo(worldPos);

      if (this.portalType == 1 && dist < 1) {
          if (!this.locationhref) {
            console.log("set window.location.href to " + this.other);
            this.locationhref = this.other;
            window.location.href = this.other;
          }
      } else if (this.portalType == 2 && dist < 1) {
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

        // nodes should be named anything at the beginning with either 
        // - "room_name_color"
        // - "portal_N_color" 
        // at the very end. Numbered portals should come in pairs.
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
        this.setPortalInfo(params[1], params[2], params[3]);
    },

    setPortalInfo: function(portalType, portalTarget, color) {
        if (portalType === "room") {
            this.portalType = 1;
            this.portalTarget = parseInt(portalTarget);
        } else if (portalType === "portal") {
            this.portalType = 2;
            this.portalTarget = portalTarget;
        } else {
            this.portalType = 0;
            this.portalTarget = null;
        } 
        this.color = new THREE.Color(color);
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

/**
 * Description
 * ===========
 * create a HTML object by rendering a script that creates and manages it
 *
 */

// var htmlComponents;
// var scriptPromise;
// if (window.__testingVueApps) {
//     scriptPromise = import(window.__testingVueApps)    
// } else {
//     scriptPromise = import("https://resources.realitymedia.digital/vue-apps/dist/hubs.js") 
// }
// // scriptPromise = scriptPromise.then(module => {
// //     return module
// // });
/**
 * Modified from https://github.com/mozilla/hubs/blob/master/src/components/fader.js
 * to include adjustable duration and converted from component to system
 */

 AFRAME.registerSystem('html-script', {  
    init() {
        this.systemTick = htmlComponents["systemTick"];
        this.initializeEthereal = htmlComponents["initializeEthereal"];
        if (!this.systemTick || !this.initializeEthereal) {
            console.error("error in html-script system: htmlComponents has no systemTick and/or initializeEthereal methods");
        } else {
            this.initializeEthereal();
        }
    },
  
    tick(t, dt) {
        this.systemTick(t, dt);
    },
  });
  

AFRAME.registerComponent('html-script', {
    schema: {
        // name must follow the pattern "*_componentName"
        name: { type: "string", default: ""}
    },
    init: function () {
        this.script = null;
        this.fullName = this.data.name;

        if (!this.fullName || this.fullName.length == 0) {
            this.parseNodeName();
        } else {
            this.componentName = this.fullName;
        }

        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root.addEventListener("model-loaded", (ev) => { 
            this.createScript();
        });

        //this.createScript();
    },

    update: function () {
        if (this.data.name === "" || this.data.name === this.fullName) return

        this.fullName = this.data.name;
        // this.parseNodeName();
        this.componentName = this.fullName;
        
        if (this.script) {
            this.destroyScript();
        }
        this.createScript();
    },

    createScript: function () {
        // each time we load a script component we will possibly create
        // a new networked component.  This is fine, since the networked Id 
        // is based on the full name passed as a parameter, or assigned to the
        // component in Spoke.  It does mean that if we have
        // multiple objects in the scene which have the same name, they will
        // be in sync.  It also means that if you want to drop a component on
        // the scene via a .glb, it must have a valid name parameter inside it.
        // A .glb in spoke will fall back to the spoke name if you use one without
        // a name inside it.
        let loader = () => {

            this.loadScript().then( () => {
                if (!this.script) return

                if (this.script.isNetworked) {
                    // get the parent networked entity, when it's finished initializing.  
                    // When creating this as part of a GLTF load, the 
                    // parent a few steps up will be networked.  We'll only do this
                    // if the HTML script wants to be networked
                    this.netEntity = null;

                    // bind callbacks
                    this.getSharedData = this.getSharedData.bind(this);
                    this.takeOwnership = this.takeOwnership.bind(this);
                    this.setSharedData = this.setSharedData.bind(this);

                    this.script.setNetworkMethods(this.takeOwnership, this.setSharedData);
                }

                // set up the local content and hook it to the scene
                const scriptEl = document.createElement('a-entity');
                this.simpleContainer = scriptEl;
                this.simpleContainer.object3D.matrixAutoUpdate = true;
                this.simpleContainer.setObject3D("weblayer3d", this.script.webLayer3D);

                // lets figure out the scale, but scaling to fill the a 1x1m square, that has also
                // potentially been scaled by the parents parent node. If we scale the entity in spoke,
                // this is where the scale is set.  If we drop a node in and scale it, the scale is also
                // set there.
                // We used to have a fixed size passed back from the entity, but that's too restrictive:
                // const width = this.script.width
                // const height = this.script.height

                // TODO: need to find environment-scene, go down two levels to the group above 
                // the nodes in the scene.  Then accumulate the scales up from this node to
                // that node.  This will account for groups, and nesting.

                var width = 1, height = 1;
                if (this.el.components["media-image"]) {
                    // attached to an image in spoke, so the image mesh is size 1 and is scaled directly
                    let scaleM = this.el.object3DMap["mesh"].scale;
                    let scaleI = this.el.object3D.scale;
                    width = scaleM.x * scaleI.x;
                    height = scaleM.y * scaleI.y;
                    scaleI.x = 1;
                    scaleI.y = 1;
                    scaleI.z = 1;
                    this.el.object3D.matrixNeedsUpdate = true;
                } else {
                    // it's embedded in a simple gltf model;  other models may not work
                    // we assume it's at the top level mesh, and that the model itself is scaled
                    let mesh = this.el.object3DMap["mesh"];
                    if (mesh) {
                        let box = mesh.geometry.boundingBox;
                        width = (box.max.x - box.min.x) * mesh.scale.x;
                        height = (box.max.y - box.min.y) * mesh.scale.y;
                    } else {
                        let meshScale = this.el.object3D.scale;
                        width = meshScale.x;
                        height = meshScale.y;
                        meshScale.x = 1;
                        meshScale.y = 1;
                        meshScale.z = 1;
                        this.el.object3D.matrixNeedsUpdate = true;
                    }
                    // apply the root gltf scale.
                    var parent2 = this.el.parentEl.parentEl.object3D;
                    width *= parent2.scale.x;
                    height *= parent2.scale.y;
                    parent2.scale.x = 1;
                    parent2.scale.y = 1;
                    parent2.scale.z = 1;
                    parent2.matrixNeedsUpdate = true;
                }

                if (width > 0 && height > 0) {
                    const {width: wsize, height: hsize} = this.script.getSize();
                    var scale = Math.min(width / wsize, height / hsize);
                    this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
                }

                // there will be one element already, the cube we created in blender
                // and attached this component to, so remove it if it is there.
                // this.el.object3D.children.pop()
                for (const c of this.el.object3D.children) {
                    c.visible = false;
                }

                // make sure "isStatic" is correct;  can't be static if either interactive or networked
                if (this.script.isStatic && (this.script.isInteractive || this.script.isNetworked)) {
                    this.script.isStatic = false;
                }
                            
                // add in our container
                this.el.appendChild(this.simpleContainer);

                // TODO:  we are going to have to make sure this works if 
                // the script is ON an interactable (like an image)
                
                if (this.script.isInteractive) {
                    if (this.el.classList.contains("interactable")) ;

                    // make the html object clickable
                    this.simpleContainer.setAttribute('is-remote-hover-target','');
                    this.simpleContainer.setAttribute('tags', {
                        singleActionButton: true,
                        inspectable: true,
                        isStatic: true,
                        togglesHoveredActionSet: true
                    });
                    this.simpleContainer.setAttribute('class', "interactable");

                    // forward the 'interact' events to our object 
                    this.clicked = this.clicked.bind(this);
                    this.simpleContainer.object3D.addEventListener('interact', this.clicked);

                    if (this.script.isDraggable) {
                        // we aren't going to really deal with this till we have a use case, but
                        // we can set it up for now
                        this.simpleContainer.setAttribute('tags', {
                            singleActionButton: true, 
                            isHoldable: true,  
                            holdableButton: true,
                            inspectable: true,
                            isStatic: true,
                            togglesHoveredActionSet: true
                        });
        
                        this.simpleContainer.object3D.addEventListener('holdable-button-down', (evt) => {
                            this.script.dragStart(evt);
                        });
                        this.simpleContainer.object3D.addEventListener('holdable-button-up', (evt) => {
                            this.script.dragEnd(evt);
                        });
                    }

                    //this.raycaster = new THREE.Raycaster()
                    this.hoverRayL = new THREE.Ray();
                    this.hoverRayR = new THREE.Ray();
                } else {
                    // no interactivity, please
                    if (this.el.classList.contains("interactable")) {
                        this.el.classList.remove("interactable");
                    }
                }

                // TODO: this SHOULD work but make sure it works if the el we are on
                // is networked, such as when attached to an image

                if (this.el.hasAttribute("networked")) {
                    this.el.removeAttribute("networked");
                }

                if (this.script.isNetworked) {
                    // This function finds an existing copy of the Networked Entity (if we are not the
                    // first client in the room it will exist in other clients and be created by NAF)
                    // or create an entity if we are first.
                    this.setupNetworkedEntity = function (networkedEl) {
                        var persistent = true;
                        var netId;
                        if (networkedEl) {
                            // We will be part of a Networked GLTF if the GLTF was dropped on the scene
                            // or pinned and loaded when we enter the room.  Use the networked parents
                            // networkId plus a disambiguating bit of text to create a unique Id.
                            netId = NAF.utils.getNetworkId(networkedEl) + "-html-script";

                            // if we need to create an entity, use the same persistence as our
                            // network entity (true if pinned, false if not)
                            persistent = entity.components.networked.data.persistent;
                        } else {
                            // this only happens if this component is on a scene file, since the
                            // elements on the scene aren't networked.  So let's assume each entity in the
                            // scene will have a unique name.  Adding a bit of text so we can find it
                            // in the DOM when debugging.
                            netId = this.fullName.replaceAll("_","-") + "-html-script";
                        }

                        // check if the networked entity we create for this component already exists. 
                        // otherwise, create it
                        // - NOTE: it is created on the scene, not as a child of this entity, because
                        //   NAF creates remote entities in the scene.
                        var entity;
                        if (NAF.entities.hasEntity(netId)) {
                            entity = NAF.entities.getEntity(netId);
                        } else {
                            entity = document.createElement('a-entity');

                            // store the method to retrieve the script data on this entity
                            entity.getSharedData = this.getSharedData;

                            // the "networked" component should have persistent=true, the template and 
                            // networkId set, owner set to "scene" (so that it doesn't update the rest of
                            // the world with it's initial data, and should NOT set creator (the system will do that)
                            entity.setAttribute('networked', {
                                template: "#script-data-media",
                                persistent: persistent,
                                owner: "scene",  // so that our initial value doesn't overwrite others
                                networkId: netId
                            });
                            this.el.sceneEl.appendChild(entity);
                        }

                        // save a pointer to the networked entity and then wait for it to be fully
                        // initialized before getting a pointer to the actual networked component in it
                        this.netEntity = entity;
                        NAF.utils.getNetworkedEntity(this.netEntity).then(networkedEl => {
                            this.stateSync = networkedEl.components["script-data"];

                            // if this is the first networked entity, it's sharedData will default to the empty 
                            // string, and we should initialize it with the initial data from the script
                            if (this.stateSync.sharedData === 0) {
                                networkedEl.components["networked"];
                                // if (networked.data.creator == NAF.clientId) {
                                //     this.stateSync.initSharedData(this.script.getSharedData())
                                // }
                            }
                        });
                    };
                    this.setupNetworkedEntity = this.setupNetworkedEntity.bind(this);

                    this.setupNetworked = function () {
                        NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
                            this.setupNetworkedEntity(networkedEl);
                        }).catch(() => {
                            this.setupNetworkedEntity();
                        });
                    };
                    this.setupNetworked = this.setupNetworked.bind(this);

                    // This method handles the different startup cases:
                    // - if the GLTF was dropped on the scene, NAF will be connected and we can 
                    //   immediately initialize
                    // - if the GLTF is in the room scene or pinned, it will likely be created
                    //   before NAF is started and connected, so we wait for an event that is
                    //   fired when Hubs has started NAF
                    if (NAF.connection && NAF.connection.isConnected()) {
                        this.setupNetworked();
                    } else {
                        this.el.sceneEl.addEventListener('didConnectToNetworkedScene', this.setupNetworked);
                    }
                }
            });
        };
        // if attached to a node with a media-loader component, this means we attached this component
        // to a media object in Spoke.  We should wait till the object is fully loaded.  
        // Otherwise, it was attached to something inside a GLTF (probably in blender)
        if (this.el.components["media-loader"]) {
            this.el.addEventListener("media-loaded", () => {
                loader();
            },
            { once: true });
        } else {
            loader();
        }
    },

    play: function () {
        if (this.script) {
            this.script.play();
        }
    },

    pause: function () {
        if (this.script) {
            this.script.pause();
        }
    },

    // handle "interact" events for clickable entities
    clicked: function(evt) {
        this.script.clicked(evt); 
    },
  
    // methods that will be passed to the html object so they can update networked data
    takeOwnership: function() {
        if (this.stateSync) {
            return this.stateSync.takeOwnership()
        } else {
            return true;  // sure, go ahead and change it for now
        }
    },
    
    setSharedData: function(dataObject) {
        if (this.stateSync) {
            return this.stateSync.setSharedData(dataObject)
        }
        return true
    },

    // this is called from below, to get the initial data from the script
    getSharedData: function() {
        if (this.script) {
            return this.script.getSharedData()
        }
        // shouldn't happen
        console.warn("script-data component called parent element but there is no script yet?");
        return "{}"
    },

    // per frame stuff
    tick: function (time) {
        if (!this.script) return

        if (this.script.isInteractive) {
            // more or less copied from "hoverable-visuals.js" in hubs
            const toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;
            var passthruInteractor = [];

            let interactorOne, interactorTwo;
            const interaction = this.el.sceneEl.systems.interaction;
            if (!interaction.ready) return; //DOMContentReady workaround
            
            let hoverEl = this.simpleContainer;
            if (interaction.state.leftHand.hovered === hoverEl && !interaction.state.leftHand.held) {
              interactorOne = interaction.options.leftHand.entity.object3D;
            }
            if (
              interaction.state.leftRemote.hovered === hoverEl &&
              !interaction.state.leftRemote.held &&
              !toggling.leftToggledOff
            ) {
              interactorOne = interaction.options.leftRemote.entity.object3D;
            }
            if (interactorOne) {
                let pos = interactorOne.position;
                let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate();
                pos.addScaledVector(dir, -0.1);
                this.hoverRayL.set(pos, dir);

                passthruInteractor.push(this.hoverRayL);
            }
            if (
              interaction.state.rightRemote.hovered === hoverEl &&
              !interaction.state.rightRemote.held &&
              !toggling.rightToggledOff
            ) {
              interactorTwo = interaction.options.rightRemote.entity.object3D;
            }
            if (interaction.state.rightHand.hovered === hoverEl && !interaction.state.rightHand.held) {
                interactorTwo = interaction.options.rightHand.entity.object3D;
            }
            if (interactorTwo) {
                let pos = interactorTwo.position;
                let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate();
                pos.addScaledVector(dir, -0.1);
                this.hoverRayR.set(pos, dir);
                passthruInteractor.push(this.hoverRayR);
            }

            this.script.webLayer3D.interactionRays = passthruInteractor;
        }

        if (this.script.isNetworked) {
            // if we haven't finished setting up the networked entity don't do anything.
            if (!this.netEntity || !this.stateSync) { return }

            // if the state has changed in the networked data, update our html object
            if (this.stateSync.changed) {
                this.stateSync.changed = false;
                this.script.updateSharedData(this.stateSync.dataObject);
            }
        }

        this.script.tick(time);
    },
  
    // TODO:  should only be called if there is no parameter specifying the
    // html script name.
    parseNodeName: function () {
        if (this.fullName === "") {

            // TODO:  switch this to find environment-root and go down to 
            // the node at the room of scene (one above the various nodes).  
            // then go up from here till we get to a node that has that node
            // as it's parent
            this.fullName = this.el.parentEl.parentEl.className;
        } 

        // nodes should be named anything at the beginning with 
        //  "componentName"
        // at the very end.  This will fetch the component from the resource
        // componentName
        const params = this.fullName.match(/_([A-Za-z0-9]*)$/);

        // if pattern matches, we will have length of 3, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("html-script componentName not formatted correctly: ", this.fullName);
            this.componentName = null;
        } else {
            this.componentName = params[1];
        }
    },

    loadScript: async function () {
        // if (scriptPromise) {
        //     try {
        //         htmlComponents = await scriptPromise;
        //     } catch(e) {
        //         console.error(e);
        //         return
        //     }
        //     scriptPromise = null
        // }
        var initScript = htmlComponents[this.componentName];
        if (!initScript) {
            console.warn("'html-script' component doesn't have script for " + this.componentName);
            this.script = null;
            return;
        }
        this.script = initScript();
        if (this.script){
            this.script.needsUpdate = true;
            // this.script.webLayer3D.refresh(true)
            // this.script.webLayer3D.update(true)
        } else {
            console.warn("'html-script' component failed to initialize script for " + this.componentName);
        }
    },

    destroyScript: function () {
        if (this.script.isInteractive) {
            this.simpleContainer.object3D.removeEventListener('interact', this.clicked);
        }
        this.el.removeChild(this.simpleContainer);
        this.simpleContainer = null;

        this.script.destroy();
        this.script = null;
    }
});

//
// Component for our networked state.  This component does nothing except all us to 
// change the state when appropriate. We could set this up to signal the component above when
// something has changed, instead of having the component above poll each frame.
//

AFRAME.registerComponent('script-data', {
    schema: {
        scriptdata: {type: "string", default: "{}"},
    },
    init: function () {
        this.takeOwnership = this.takeOwnership.bind(this);
        this.setSharedData = this.setSharedData.bind(this);

        this.dataObject = this.el.getSharedData();
        try {
            this.sharedData = encodeURIComponent(JSON.stringify(this.dataObject));
            this.el.setAttribute("script-data", "scriptdata", this.sharedData);
        } catch(e) {
            console.error("Couldn't encode initial script data object: ", e, this.dataObject);
            this.sharedData = "{}";
            this.dataObject = {};
        }
        this.changed = false;
    },

    update() {
        this.changed = !(this.sharedData === this.data.scriptdata);
        if (this.changed) {
            try {
                this.dataObject = JSON.parse(decodeURIComponent(this.data.scriptdata));

                // do these after the JSON parse to make sure it has succeeded
                this.sharedData = this.data.scriptdata;
                this.changed = true;
            } catch(e) {
                console.error("couldn't parse JSON received in script-sync: ", e);
                this.sharedData = "";
                this.dataObject = {};
            }
        }
    },

    // it is likely that applyPersistentSync only needs to be called for persistent
    // networked entities, so we _probably_ don't need to do this.  But if there is no
    // persistent data saved from the network for this entity, this command does nothing.
    play() {
        if (this.el.components.networked) {
            // not sure if this is really needed, but can't hurt
            if (APP.utils) { // temporary till we ship new client
                APP.utils.applyPersistentSync(this.el.components.networked.data.networkId);
            }
        }
    },

    takeOwnership() {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        return true;
    },

    // initSharedData(dataObject) {
    //     try {
    //         var htmlString = encodeURIComponent(JSON.stringify(dataObject))
    //         this.sharedData = htmlString
    //         this.dataObject = dataObject
    //         return true
    //     } catch (e) {
    //         console.error("can't stringify the object passed to script-sync")
    //         return false
    //     }
    // },

    // The key part in these methods (which are called from the component above) is to
    // check if we are allowed to change the networked object.  If we own it (isMine() is true)
    // we can change it.  If we don't own in, we can try to become the owner with
    // takeOwnership(). If this succeeds, we can set the data.  
    //
    // NOTE: takeOwnership ATTEMPTS to become the owner, by assuming it can become the
    // owner and notifying the networked copies.  If two or more entities try to become
    // owner,  only one (the last one to try) becomes the owner.  Any state updates done
    // by the "failed attempted owners" will not be distributed to the other clients,
    // and will be overwritten (eventually) by updates from the other clients.   By not
    // attempting to guarantee ownership, this call is fast and synchronous.  Any 
    // methods for guaranteeing ownership change would take a non-trivial amount of time
    // because of network latencies.

    setSharedData(dataObject) {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        try {
            var htmlString = encodeURIComponent(JSON.stringify(dataObject));
            this.sharedData = htmlString;
            this.dataObject = dataObject;
            this.el.setAttribute("script-data", "scriptdata", htmlString);
            return true
        } catch (e) {
            console.error("can't stringify the object passed to script-sync");
            return false
        }
    }
});

// Add our template for our networked object to the a-frame assets object,
// and a schema to the NAF.schemas.  Both must be there to have custom components work

const assets = document.querySelector("a-assets");

assets.insertAdjacentHTML(
    'beforeend',
    `
    <template id="script-data-media">
      <a-entity
        script-data
      ></a-entity>
    </template>
  `
  );

NAF.schemas.add({
  	template: "#script-data-media",
    components: [
    // {
    //     component: "script-data",
    //     property: "rotation",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    // {
    //     component: "script-data",
    //     property: "scale",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    {
      	component: "script-data",
      	property: "scriptdata"
    }],
      nonAuthorizedComponents: [
      {
            component: "script-data",
            property: "scriptdata"
      }
    ],

  });

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360');
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal');
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax');
AFRAME.GLTFModelPlus.registerComponent('html-script', 'html-script');
// do a simple monkey patch to see if it works
// var myisMineOrLocal = function (that) {
//     return !that.el.components.networked || (that.networkedEl && NAF.utils.isMine(that.networkedEl));
//  }
//  var videoComp = AFRAME.components["media-video"]
//  videoComp.Component.prototype.isMineOrLocal = myisMineOrLocal;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wcm94aW1pdHktZXZlbnRzLmpzIiwiLi4vc3JjL3NoYWRlcnMvcG9ydGFsLnZlcnQuanMiLCIuLi9zcmMvc2hhZGVycy9wb3J0YWwuZnJhZy5qcyIsIi4uL3NyYy9zaGFkZXJzL3Nub2lzZS5qcyIsIi4uL3NyYy91dGlscy9jb21wb25lbnQtdXRpbHMuanMiLCIuLi9zcmMvdXRpbHMvc2NlbmUtZ3JhcGguanMiLCIuLi9zcmMvY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wb3J0YWwuanMiLCIuLi9zcmMvY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzIiwiLi4vc3JjL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcGFyYWxsYXguanMiLCIuLi9zcmMvY29tcG9uZW50cy9odG1sLXNjcmlwdC5qcyIsIi4uL3NyYy9yb29tcy9pbmRleC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdmYWRlci1wbHVzJywge1xuICBzY2hlbWE6IHtcbiAgICBkaXJlY3Rpb246IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdub25lJyB9LCAvLyBcImluXCIsIFwib3V0XCIsIG9yIFwibm9uZVwiXG4gICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDIwMCB9LCAvLyBUcmFuc2l0aW9uIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kc1xuICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6ICd3aGl0ZScgfSxcbiAgfSxcblxuICBpbml0KCkge1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgpLFxuICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgY29sb3I6IHRoaXMuZGF0YS5jb2xvcixcbiAgICAgICAgc2lkZTogVEhSRUUuQmFja1NpZGUsXG4gICAgICAgIG9wYWNpdHk6IDAsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBmb2c6IGZhbHNlLFxuICAgICAgfSlcbiAgICApXG4gICAgbWVzaC5zY2FsZS54ID0gbWVzaC5zY2FsZS55ID0gMVxuICAgIG1lc2guc2NhbGUueiA9IDAuMTVcbiAgICBtZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgIG1lc2gucmVuZGVyT3JkZXIgPSAxIC8vIHJlbmRlciBhZnRlciBvdGhlciB0cmFuc3BhcmVudCBzdHVmZlxuICAgIHRoaXMuZWwuY2FtZXJhLmFkZChtZXNoKVxuICAgIHRoaXMubWVzaCA9IG1lc2hcbiAgfSxcblxuICBmYWRlT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmJlZ2luVHJhbnNpdGlvbignb3V0JylcbiAgfSxcblxuICBmYWRlSW4oKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdpbicpXG4gIH0sXG5cbiAgYXN5bmMgYmVnaW5UcmFuc2l0aW9uKGRpcmVjdGlvbikge1xuICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmYWRlIHdoaWxlIGEgZmFkZSBpcyBoYXBwZW5pbmcuJylcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uIH0pXG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcykgPT4ge1xuICAgICAgaWYgKHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID09PSAoZGlyZWN0aW9uID09ICdpbicgPyAwIDogMSkpIHtcbiAgICAgICAgcmVzKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSByZXNcbiAgICAgIH1cbiAgICB9KVxuICB9LFxuXG4gIHRpY2sodCwgZHQpIHtcbiAgICBjb25zdCBtYXQgPSB0aGlzLm1lc2gubWF0ZXJpYWxcbiAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnIHx8IG1hdC5vcGFjaXR5ICE9PSAwXG4gICAgaWYgKCF0aGlzLm1lc2gudmlzaWJsZSkgcmV0dXJuXG5cbiAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ2luJykge1xuICAgICAgbWF0Lm9wYWNpdHkgPSBNYXRoLm1heCgwLCBtYXQub3BhY2l0eSAtICgxLjAgLyB0aGlzLmRhdGEuZHVyYXRpb24pICogTWF0aC5taW4oZHQsIDUwKSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWluKDEsIG1hdC5vcGFjaXR5ICsgKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH1cblxuICAgIGlmIChtYXQub3BhY2l0eSA9PT0gMCB8fCBtYXQub3BhY2l0eSA9PT0gMSkge1xuICAgICAgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gIT09ICdub25lJykge1xuICAgICAgICBpZiAodGhpcy5fcmVzb2x2ZUZpbmlzaCkge1xuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2goKVxuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSBudWxsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2ZhZGVyLXBsdXMnLCB7IGRpcmVjdGlvbjogJ25vbmUnIH0pXG4gICAgfVxuICB9LFxufSlcbiIsImNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3Byb3hpbWl0eS1ldmVudHMnLCB7XG4gIHNjaGVtYToge1xuICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9LFxuICB9LFxuICBpbml0KCkge1xuICAgIHRoaXMuaW5ab25lID0gZmFsc2VcbiAgICB0aGlzLmNhbWVyYSA9IHRoaXMuZWwuc2NlbmVFbC5jYW1lcmFcbiAgfSxcbiAgdGljaygpIHtcbiAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgY29uc3Qgd2FzSW56b25lID0gdGhpcy5pblpvbmVcbiAgICB0aGlzLmluWm9uZSA9IHdvcmxkQ2FtZXJhLmRpc3RhbmNlVG8od29ybGRTZWxmKSA8IHRoaXMuZGF0YS5yYWRpdXNcbiAgICBpZiAodGhpcy5pblpvbmUgJiYgIXdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHllbnRlcicpXG4gICAgaWYgKCF0aGlzLmluWm9uZSAmJiB3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5bGVhdmUnKVxuICB9LFxufSlcbiIsImNvbnN0IGdsc2wgPSBgXG52YXJ5aW5nIHZlYzIgdlV2O1xudmFyeWluZyB2ZWMzIHZSYXk7XG52YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxudm9pZCBtYWluKCkge1xuICB2VXYgPSB1djtcbiAgLy8gdk5vcm1hbCA9IG5vcm1hbE1hdHJpeCAqIG5vcm1hbDtcbiAgdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlKG1vZGVsTWF0cml4KSAqIHZlYzQoY2FtZXJhUG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgdlJheSA9IHBvc2l0aW9uIC0gY2FtZXJhTG9jYWw7XG4gIHZOb3JtYWwgPSBub3JtYWxpemUoLTEuICogdlJheSk7XG4gIGZsb2F0IGRpc3QgPSBsZW5ndGgoY2FtZXJhTG9jYWwpO1xuICB2UmF5LnogKj0gMS4zIC8gKDEuICsgcG93KGRpc3QsIDAuNSkpOyAvLyBDaGFuZ2UgRk9WIGJ5IHNxdWFzaGluZyBsb2NhbCBaIGRpcmVjdGlvblxuICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KHBvc2l0aW9uLCAxLjApO1xufVxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiY29uc3QgZ2xzbCA9IGBcbnVuaWZvcm0gc2FtcGxlckN1YmUgY3ViZU1hcDtcbnVuaWZvcm0gZmxvYXQgdGltZTtcbnVuaWZvcm0gZmxvYXQgcmFkaXVzO1xudW5pZm9ybSB2ZWMzIHJpbmdDb2xvcjtcblxudmFyeWluZyB2ZWMyIHZVdjtcbnZhcnlpbmcgdmVjMyB2UmF5O1xudmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiNkZWZpbmUgUklOR19XSURUSCAwLjFcbiNkZWZpbmUgUklOR19IQVJEX09VVEVSIDAuMDFcbiNkZWZpbmUgUklOR19IQVJEX0lOTkVSIDAuMDhcbiNkZWZpbmUgZm9yd2FyZCB2ZWMzKDAuMCwgMC4wLCAxLjApXG5cbnZvaWQgbWFpbigpIHtcbiAgdmVjMiBjb29yZCA9IHZVdiAqIDIuMCAtIDEuMDtcbiAgZmxvYXQgbm9pc2UgPSBzbm9pc2UodmVjMyhjb29yZCAqIDEuLCB0aW1lKSkgKiAwLjUgKyAwLjU7XG5cbiAgLy8gUG9sYXIgZGlzdGFuY2VcbiAgZmxvYXQgZGlzdCA9IGxlbmd0aChjb29yZCk7XG4gIGRpc3QgKz0gbm9pc2UgKiAwLjI7XG5cbiAgZmxvYXQgbWFza091dGVyID0gMS4wIC0gc21vb3Roc3RlcChyYWRpdXMgLSBSSU5HX0hBUkRfT1VURVIsIHJhZGl1cywgZGlzdCk7XG4gIGZsb2F0IG1hc2tJbm5lciA9IDEuMCAtIHNtb290aHN0ZXAocmFkaXVzIC0gUklOR19XSURUSCwgcmFkaXVzIC0gUklOR19XSURUSCArIFJJTkdfSEFSRF9JTk5FUiwgZGlzdCk7XG4gIGZsb2F0IGRpc3RvcnRpb24gPSBzbW9vdGhzdGVwKHJhZGl1cyAtIDAuMiwgcmFkaXVzICsgMC4yLCBkaXN0KTtcbiAgdmVjMyBub3JtYWwgPSBub3JtYWxpemUodk5vcm1hbCk7XG4gIGZsb2F0IGRpcmVjdFZpZXcgPSBzbW9vdGhzdGVwKDAuLCAwLjgsIGRvdChub3JtYWwsIGZvcndhcmQpKTtcbiAgdmVjMyB0YW5nZW50T3V0d2FyZCA9IHZlYzMoY29vcmQsIDAuMCk7XG4gIHZlYzMgcmF5ID0gbWl4KHZSYXksIHRhbmdlbnRPdXR3YXJkLCBkaXN0b3J0aW9uKTtcbiAgdmVjNCB0ZXhlbCA9IHRleHR1cmVDdWJlKGN1YmVNYXAsIHJheSk7XG4gIHZlYzMgY2VudGVyTGF5ZXIgPSB0ZXhlbC5yZ2IgKiBtYXNrSW5uZXI7XG4gIHZlYzMgcmluZ0xheWVyID0gcmluZ0NvbG9yICogKDEuIC0gbWFza0lubmVyKTtcbiAgdmVjMyBjb21wb3NpdGUgPSBjZW50ZXJMYXllciArIHJpbmdMYXllcjtcblxuICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbXBvc2l0ZSwgKG1hc2tPdXRlciAtIG1hc2tJbm5lcikgKyBtYXNrSW5uZXIgKiBkaXJlY3RWaWV3KTtcbn1cbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsIi8qXG4gKiAzRCBTaW1wbGV4IG5vaXNlXG4gKiBTSUdOQVRVUkU6IGZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaHVnaHNrL2dsc2wtbm9pc2VcbiAqL1xuXG5jb25zdCBnbHNsID0gYFxuLy9cbi8vIERlc2NyaXB0aW9uIDogQXJyYXkgYW5kIHRleHR1cmVsZXNzIEdMU0wgMkQvM0QvNEQgc2ltcGxleFxuLy8gICAgICAgICAgICAgICBub2lzZSBmdW5jdGlvbnMuXG4vLyAgICAgIEF1dGhvciA6IElhbiBNY0V3YW4sIEFzaGltYSBBcnRzLlxuLy8gIE1haW50YWluZXIgOiBpam1cbi8vICAgICBMYXN0bW9kIDogMjAxMTA4MjIgKGlqbSlcbi8vICAgICBMaWNlbnNlIDogQ29weXJpZ2h0IChDKSAyMDExIEFzaGltYSBBcnRzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy8gICAgICAgICAgICAgICBEaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMSUNFTlNFIGZpbGUuXG4vLyAgICAgICAgICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hc2hpbWEvd2ViZ2wtbm9pc2Vcbi8vXG5cbnZlYzMgbW9kMjg5KHZlYzMgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IG1vZDI4OSh2ZWM0IHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBwZXJtdXRlKHZlYzQgeCkge1xuICAgICByZXR1cm4gbW9kMjg5KCgoeCozNC4wKSsxLjApKngpO1xufVxuXG52ZWM0IHRheWxvckludlNxcnQodmVjNCByKVxue1xuICByZXR1cm4gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiByO1xufVxuXG5mbG9hdCBzbm9pc2UodmVjMyB2KVxuICB7XG4gIGNvbnN0IHZlYzIgIEMgPSB2ZWMyKDEuMC82LjAsIDEuMC8zLjApIDtcbiAgY29uc3QgdmVjNCAgRCA9IHZlYzQoMC4wLCAwLjUsIDEuMCwgMi4wKTtcblxuLy8gRmlyc3QgY29ybmVyXG4gIHZlYzMgaSAgPSBmbG9vcih2ICsgZG90KHYsIEMueXl5KSApO1xuICB2ZWMzIHgwID0gICB2IC0gaSArIGRvdChpLCBDLnh4eCkgO1xuXG4vLyBPdGhlciBjb3JuZXJzXG4gIHZlYzMgZyA9IHN0ZXAoeDAueXp4LCB4MC54eXopO1xuICB2ZWMzIGwgPSAxLjAgLSBnO1xuICB2ZWMzIGkxID0gbWluKCBnLnh5eiwgbC56eHkgKTtcbiAgdmVjMyBpMiA9IG1heCggZy54eXosIGwuenh5ICk7XG5cbiAgLy8gICB4MCA9IHgwIC0gMC4wICsgMC4wICogQy54eHg7XG4gIC8vICAgeDEgPSB4MCAtIGkxICArIDEuMCAqIEMueHh4O1xuICAvLyAgIHgyID0geDAgLSBpMiAgKyAyLjAgKiBDLnh4eDtcbiAgLy8gICB4MyA9IHgwIC0gMS4wICsgMy4wICogQy54eHg7XG4gIHZlYzMgeDEgPSB4MCAtIGkxICsgQy54eHg7XG4gIHZlYzMgeDIgPSB4MCAtIGkyICsgQy55eXk7IC8vIDIuMCpDLnggPSAxLzMgPSBDLnlcbiAgdmVjMyB4MyA9IHgwIC0gRC55eXk7ICAgICAgLy8gLTEuMCszLjAqQy54ID0gLTAuNSA9IC1ELnlcblxuLy8gUGVybXV0YXRpb25zXG4gIGkgPSBtb2QyODkoaSk7XG4gIHZlYzQgcCA9IHBlcm11dGUoIHBlcm11dGUoIHBlcm11dGUoXG4gICAgICAgICAgICAgaS56ICsgdmVjNCgwLjAsIGkxLnosIGkyLnosIDEuMCApKVxuICAgICAgICAgICArIGkueSArIHZlYzQoMC4wLCBpMS55LCBpMi55LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnggKyB2ZWM0KDAuMCwgaTEueCwgaTIueCwgMS4wICkpO1xuXG4vLyBHcmFkaWVudHM6IDd4NyBwb2ludHMgb3ZlciBhIHNxdWFyZSwgbWFwcGVkIG9udG8gYW4gb2N0YWhlZHJvbi5cbi8vIFRoZSByaW5nIHNpemUgMTcqMTcgPSAyODkgaXMgY2xvc2UgdG8gYSBtdWx0aXBsZSBvZiA0OSAoNDkqNiA9IDI5NClcbiAgZmxvYXQgbl8gPSAwLjE0Mjg1NzE0Mjg1NzsgLy8gMS4wLzcuMFxuICB2ZWMzICBucyA9IG5fICogRC53eXogLSBELnh6eDtcblxuICB2ZWM0IGogPSBwIC0gNDkuMCAqIGZsb29yKHAgKiBucy56ICogbnMueik7ICAvLyAgbW9kKHAsNyo3KVxuXG4gIHZlYzQgeF8gPSBmbG9vcihqICogbnMueik7XG4gIHZlYzQgeV8gPSBmbG9vcihqIC0gNy4wICogeF8gKTsgICAgLy8gbW9kKGosTilcblxuICB2ZWM0IHggPSB4XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgeSA9IHlfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCBoID0gMS4wIC0gYWJzKHgpIC0gYWJzKHkpO1xuXG4gIHZlYzQgYjAgPSB2ZWM0KCB4Lnh5LCB5Lnh5ICk7XG4gIHZlYzQgYjEgPSB2ZWM0KCB4Lnp3LCB5Lnp3ICk7XG5cbiAgLy92ZWM0IHMwID0gdmVjNChsZXNzVGhhbihiMCwwLjApKSoyLjAgLSAxLjA7XG4gIC8vdmVjNCBzMSA9IHZlYzQobGVzc1RoYW4oYjEsMC4wKSkqMi4wIC0gMS4wO1xuICB2ZWM0IHMwID0gZmxvb3IoYjApKjIuMCArIDEuMDtcbiAgdmVjNCBzMSA9IGZsb29yKGIxKSoyLjAgKyAxLjA7XG4gIHZlYzQgc2ggPSAtc3RlcChoLCB2ZWM0KDAuMCkpO1xuXG4gIHZlYzQgYTAgPSBiMC54enl3ICsgczAueHp5dypzaC54eHl5IDtcbiAgdmVjNCBhMSA9IGIxLnh6eXcgKyBzMS54enl3KnNoLnp6d3cgO1xuXG4gIHZlYzMgcDAgPSB2ZWMzKGEwLnh5LGgueCk7XG4gIHZlYzMgcDEgPSB2ZWMzKGEwLnp3LGgueSk7XG4gIHZlYzMgcDIgPSB2ZWMzKGExLnh5LGgueik7XG4gIHZlYzMgcDMgPSB2ZWMzKGExLnp3LGgudyk7XG5cbi8vTm9ybWFsaXNlIGdyYWRpZW50c1xuICB2ZWM0IG5vcm0gPSB0YXlsb3JJbnZTcXJ0KHZlYzQoZG90KHAwLHAwKSwgZG90KHAxLHAxKSwgZG90KHAyLCBwMiksIGRvdChwMyxwMykpKTtcbiAgcDAgKj0gbm9ybS54O1xuICBwMSAqPSBub3JtLnk7XG4gIHAyICo9IG5vcm0uejtcbiAgcDMgKj0gbm9ybS53O1xuXG4vLyBNaXggZmluYWwgbm9pc2UgdmFsdWVcbiAgdmVjNCBtID0gbWF4KDAuNiAtIHZlYzQoZG90KHgwLHgwKSwgZG90KHgxLHgxKSwgZG90KHgyLHgyKSwgZG90KHgzLHgzKSksIDAuMCk7XG4gIG0gPSBtICogbTtcbiAgcmV0dXJuIDQyLjAgKiBkb3QoIG0qbSwgdmVjNCggZG90KHAwLHgwKSwgZG90KHAxLHgxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHAyLHgyKSwgZG90KHAzLHgzKSApICk7XG4gIH0gIFxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiLy8gUHJvdmlkZXMgYSBnbG9iYWwgcmVnaXN0cnkgb2YgcnVubmluZyBjb21wb25lbnRzXG4vLyBjb3BpZWQgZnJvbSBodWJzIHNvdXJjZVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZShjb21wb25lbnQsIG5hbWUpIHtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5ID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCB7fTtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSB8fCBbXTtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLnB1c2goY29tcG9uZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZShjb21wb25lbnQsIG5hbWUpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0pIHJldHVybjtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLnNwbGljZSh3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLmluZGV4T2YoY29tcG9uZW50KSwgMSk7XG59XG4gICIsIi8vIGNvcGllZCBmcm9tIGh1YnNcblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQoZW50aXR5LCBjb21wb25lbnROYW1lKSB7XG4gICAgd2hpbGUgKGVudGl0eSAmJiAhKGVudGl0eS5jb21wb25lbnRzICYmIGVudGl0eS5jb21wb25lbnRzW2NvbXBvbmVudE5hbWVdKSkge1xuICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGU7XG4gICAgfVxuICAgIHJldHVybiBlbnRpdHk7XG4gIH1cbiAgXG4gIGV4cG9ydCBmdW5jdGlvbiBmaW5kQ29tcG9uZW50c0luTmVhcmVzdEFuY2VzdG9yKGVudGl0eSwgY29tcG9uZW50TmFtZSkge1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBbXTtcbiAgICB3aGlsZSAoZW50aXR5KSB7XG4gICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgZm9yIChjb25zdCBjIGluIGVudGl0eS5jb21wb25lbnRzKSB7XG4gICAgICAgICAgaWYgKGVudGl0eS5jb21wb25lbnRzW2NdLm5hbWUgPT09IGNvbXBvbmVudE5hbWUpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudHMucHVzaChlbnRpdHkuY29tcG9uZW50c1tjXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gICAgICB9XG4gICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gIH1cbiAgIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGJyZWFrIHRoZSByb29tIGludG8gcXVhZHJhbnRzIG9mIGEgY2VydGFpbiBzaXplLCBhbmQgaGlkZSB0aGUgY29udGVudHMgb2YgYXJlYXMgdGhhdCBoYXZlXG4gKiBub2JvZHkgaW4gdGhlbS4gIE1lZGlhIHdpbGwgYmUgcGF1c2VkIGluIHRob3NlIGFyZWFzIHRvby5cbiAqIFxuICogSW5jbHVkZSBhIHdheSBmb3IgdGhlIHBvcnRhbCBjb21wb25lbnQgdG8gdHVybiBvbiBlbGVtZW50cyBpbiB0aGUgcmVnaW9uIG9mIHRoZSBwb3J0YWwgYmVmb3JlXG4gKiBpdCBjYXB0dXJlcyBhIGN1YmVtYXBcbiAqL1xuXG5pbXBvcnQgeyByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlLCBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UgfSBmcm9tIFwiLi4vdXRpbHMvY29tcG9uZW50LXV0aWxzXCI7XG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSBcIi4uL3V0aWxzL3NjZW5lLWdyYXBoXCI7XG5cbiAvLyBhcmJpdHJhcmlseSBjaG9vc2UgMTAwMDAwMCBhcyB0aGUgbnVtYmVyIG9mIGNvbXB1dGVkIHpvbmVzIGluICB4IGFuZCB5XG5sZXQgTUFYX1pPTkVTID0gMTAwMDAwMFxubGV0IHJlZ2lvblRhZyA9IGZ1bmN0aW9uKHNpemUsIG9iajNkKSB7XG4gICAgbGV0IHBvcyA9IG9iajNkLnBvc2l0aW9uXG4gICAgbGV0IHhwID0gTWF0aC5mbG9vcihwb3MueCAvIHNpemUpICsgTUFYX1pPTkVTLzJcbiAgICBsZXQgenAgPSBNYXRoLmZsb29yKHBvcy56IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIHJldHVybiBNQVhfWk9ORVMgKiB4cCArIHpwXG59XG5cbmxldCByZWdpb25zSW5Vc2UgPSBbXVxuXG4vKipcbiAqIEZpbmQgdGhlIGNsb3Nlc3QgYW5jZXN0b3IgKGluY2x1ZGluZyB0aGUgcGFzc2VkIGluIGVudGl0eSkgdGhhdCBoYXMgYW4gYG9iamVjdC1yZWdpb24tZm9sbG93ZXJgIGNvbXBvbmVudCxcbiAqIGFuZCByZXR1cm4gdGhhdCBjb21wb25lbnRcbiAqL1xuZnVuY3Rpb24gZ2V0UmVnaW9uRm9sbG93ZXIoZW50aXR5KSB7XG4gICAgbGV0IGN1ckVudGl0eSA9IGVudGl0eTtcbiAgXG4gICAgd2hpbGUoY3VyRW50aXR5ICYmIGN1ckVudGl0eS5jb21wb25lbnRzICYmICFjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0pIHtcbiAgICAgICAgY3VyRW50aXR5ID0gY3VyRW50aXR5LnBhcmVudE5vZGU7XG4gICAgfVxuICBcbiAgICBpZiAoIWN1ckVudGl0eSB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHMgfHwgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl1cbn1cbiAgXG5mdW5jdGlvbiBhZGRUb1JlZ2lvbihyZWdpb24pIHtcbiAgICByZWdpb25zSW5Vc2VbcmVnaW9uXSA/IHJlZ2lvbnNJblVzZVtyZWdpb25dKysgOiByZWdpb25zSW5Vc2VbcmVnaW9uXSA9IDFcbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgaW4gcmVnaW9uIFwiICsgcmVnaW9uICsgXCI6IFwiICsgcmVnaW9uc0luVXNlW3JlZ2lvbl0pXG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dID09IDEpIHtcbiAgICAgICAgc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCB0cnVlKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiYWxyZWFkeSBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBzdWJ0cmFjdEZyb21SZWdpb24ocmVnaW9uKSB7XG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dKSB7cmVnaW9uc0luVXNlW3JlZ2lvbl0tLSB9XG4gICAgY29uc29sZS5sb2coXCJBdmF0YXJzIGxlZnQgcmVnaW9uIFwiICsgcmVnaW9uICsgXCI6IFwiICsgcmVnaW9uc0luVXNlW3JlZ2lvbl0pXG5cbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMCkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIGZhbHNlKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwic3RpbGwgYW5vdGhlciBhdmF0YXIgaW4gdGhpcyByZWdpb24sIG5vIGNoYW5nZVwiKVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJzaG93aW5nIG9iamVjdHMgbmVhciBcIiArIGZvbGxvd2VyLmVsLmNsYXNzTmFtZSlcblxuICAgIGFkZFRvUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGVyUmVnaW9uRm9yT2JqZWN0KGVsZW1lbnQpIHtcbiAgICBsZXQgZm9sbG93ZXIgPSBnZXRSZWdpb25Gb2xsb3dlcihlbGVtZW50KVxuICAgIGlmICghZm9sbG93ZXIpIHsgcmV0dXJuIH1cblxuICAgIGNvbnNvbGUubG9nKFwiaGlkaW5nIG9iamVjdHMgbmVhciBcIiArIGZvbGxvd2VyLmVsLmNsYXNzTmFtZSlcblxuICAgIHN1YnRyYWN0RnJvbVJlZ2lvbihmb2xsb3dlci5yZWdpb24pXG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0cygpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGNvbnNvbGUubG9nIChcInNob3dpbmcvaGlkaW5nIGFsbCBvYmplY3RzXCIpXG4gICAgY29uc3Qgb2JqZWN0cyA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdIHx8IFtdO1xuICBcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9iamVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG9iaiA9IG9iamVjdHNbaV07XG4gICAgICBcbiAgICAgIGxldCB2aXNpYmxlID0gcmVnaW9uc0luVXNlW29iai5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICBpZiAob2JqLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyBjb250aW51ZSB9XG5cbiAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiaGlkaW5nIFwiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICBvYmouc2hvd0hpZGUodmlzaWJsZSlcbiAgICB9XG4gIFxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHZpc2libGUpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZ1wiIDogXCJoaWRpbmdcIikgKyBcIiBhbGwgb2JqZWN0cyBpbiByZWdpb24gXCIgKyByZWdpb24pXG4gICAgY29uc3Qgb2JqZWN0cyA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdIHx8IFtdO1xuICBcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9iamVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG9iaiA9IG9iamVjdHNbaV07XG4gICAgICBcbiAgICAgIGlmIChvYmoucmVnaW9uID09IHJlZ2lvbikge1xuICAgICAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmcgXCIgOiBcIiBoaWRpbmdcIikgKyBvYmouZWwuY2xhc3NOYW1lKVxuICAgICAgICBvYmouc2hvd0hpZGUodmlzaWJsZSlcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHJldHVybiBudWxsO1xufVxuICBcbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnYXZhdGFyLXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBjb25zb2xlLmxvZyhcIkF2YXRhcjogcmVnaW9uIFwiLCB0aGlzLnJlZ2lvbilcbiAgICAgICAgYWRkVG9SZWdpb24odGhpcy5yZWdpb24pXG5cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcbiAgICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IG5ld1JlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcbiAgICAgICAgaWYgKG5ld1JlZ2lvbiAhPSB0aGlzLnJlZ2lvbikge1xuICAgICAgICAgICAgc3VidHJhY3RGcm9tUmVnaW9uKHRoaXMucmVnaW9uKVxuICAgICAgICAgICAgYWRkVG9SZWdpb24obmV3UmVnaW9uKVxuICAgICAgICAgICAgdGhpcy5yZWdpb24gPSBuZXdSZWdpb25cbiAgICAgICAgfVxuICAgIH0sXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ29iamVjdC1yZWdpb24tZm9sbG93ZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfSxcbiAgICAgICAgZHluYW1pYzogeyBkZWZhdWx0OiB0cnVlIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgdGhpcy5zaG93SGlkZSA9IHRoaXMuc2hvd0hpZGUuYmluZCh0aGlzKVxuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0pIHtcbiAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICB9XG4gICAgICAgIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIG9iamVjdHMgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGRvbid0IG1vdmVcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEuZHluYW1pYykgeyByZXR1cm4gfVxuXG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuXG4gICAgICAgIGxldCB2aXNpYmxlID0gcmVnaW9uc0luVXNlW3RoaXMucmVnaW9uXSA/IHRydWU6IGZhbHNlXG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID09IHZpc2libGUpIHsgcmV0dXJuIH1cblxuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH0sXG5cbiAgICBzaG93SGlkZTogZnVuY3Rpb24gKHZpc2libGUpIHtcbiAgICAgICAgLy8gaGFuZGxlIHNob3cvaGlkaW5nIHRoZSBvYmplY3RzXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHZpc2libGVcblxuICAgICAgICAvLy8gY2hlY2sgZm9yIG1lZGlhLXZpZGVvIGNvbXBvbmVudCBvbiBwYXJlbnQgdG8gc2VlIGlmIHdlJ3JlIGEgdmlkZW8uICBBbHNvIHNhbWUgZm9yIGF1ZGlvXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgaWYgKHZpc2libGUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy53YXNQYXVzZWQgIT0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS50b2dnbGVQbGF5aW5nKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLndhc1BhdXNlZCA9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWRcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMud2FzUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3JlZ2lvbi1oaWRlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBcIipfY29tcG9uZW50TmFtZVwiXG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBJZiB0aGVyZSBpcyBhIHBhcmVudCB3aXRoIFwibmF2LW1lc2gtaGVscGVyXCIsIHRoaXMgaXMgaW4gdGhlIHNjZW5lLiAgXG4gICAgICAgIC8vIElmIG5vdCwgaXQncyBpbiBhbiBvYmplY3Qgd2UgZHJvcHBlZCBvbiB0aGUgd2luZG93LCB3aGljaCB3ZSBkb24ndCBzdXBwb3J0XG4gICAgICAgIGlmICghZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcIm5hdi1tZXNoLWhlbHBlclwiKSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudCBtdXN0IGJlIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZSBnbGIuXCIpXG4gICAgICAgICAgICB0aGlzLnNpemUgPSAwO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZih0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwO1xuICAgICAgICAgICAgdGhpcy5zaXplID0gdGhpcy5wYXJzZU5vZGVOYW1lKHRoaXMuZGF0YS5zaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRoaXMubmV3U2NlbmUgPSB0aGlzLm5ld1NjZW5lLmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5uZXdTY2VuZSlcbiAgICAgICAgLy8gY29uc3QgZW52aXJvbm1lbnRTY2VuZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZW52aXJvbm1lbnQtc2NlbmVcIik7XG4gICAgICAgIC8vIHRoaXMuYWRkU2NlbmVFbGVtZW50ID0gdGhpcy5hZGRTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudCA9IHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRTY2VuZUVsZW1lbnQpXG4gICAgICAgIC8vIGVudmlyb25tZW50U2NlbmUuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWRldGFjaGVkXCIsIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50KVxuXG4gICAgICAgIC8vIHdlIHdhbnQgdG8gbm90aWNlIHdoZW4gbmV3IHRoaW5ncyBnZXQgYWRkZWQgdG8gdGhlIHJvb20uICBUaGlzIHdpbGwgaGFwcGVuIGZvclxuICAgICAgICAvLyBvYmplY3RzIGRyb3BwZWQgaW4gdGhlIHJvb20sIG9yIGZvciBuZXcgcmVtb3RlIGF2YXRhcnMsIGF0IGxlYXN0XG4gICAgICAgIC8vIHRoaXMuYWRkUm9vdEVsZW1lbnQgPSB0aGlzLmFkZFJvb3RFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5yZW1vdmVSb290RWxlbWVudCA9IHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWF0dGFjaGVkXCIsIHRoaXMuYWRkUm9vdEVsZW1lbnQpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVSb290RWxlbWVudClcblxuICAgICAgICAvLyB3YW50IHRvIHNlZSBpZiB0aGVyZSBhcmUgcGlubmVkIG9iamVjdHMgdGhhdCB3ZXJlIGxvYWRlZCBmcm9tIGh1YnNcbiAgICAgICAgbGV0IHJvb21PYmplY3RzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShcIlJvb21PYmplY3RzXCIpXG4gICAgICAgIHRoaXMucm9vbU9iamVjdHMgPSByb29tT2JqZWN0cy5sZW5ndGggPiAwID8gcm9vbU9iamVjdHNbMF0gOiBudWxsXG5cbiAgICAgICAgLy8gZ2V0IGF2YXRhcnNcbiAgICAgICAgY29uc3QgYXZhdGFycyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXVwiKTtcbiAgICAgICAgYXZhdGFycy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHdhbGsgb2JqZWN0cyBpbiB0aGUgcm9vdCAodGhpbmdzIHRoYXQgaGF2ZSBiZWVuIGRyb3BwZWQgb24gdGhlIHNjZW5lKVxuICAgICAgICAvLyAtIGRyYXdpbmdzIGhhdmUgY2xhc3M9XCJkcmF3aW5nXCIsIG5ldHdvcmtlZC1kcmF3aW5nXG4gICAgICAgIC8vIE5vdCBnb2luZyB0byBkbyBkcmF3aW5ncyByaWdodCBub3cuXG5cbiAgICAgICAgLy8gcGlubmVkIG1lZGlhIGxpdmUgdW5kZXIgYSBub2RlIHdpdGggY2xhc3M9XCJSb29tT2JqZWN0c1wiXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiLlJvb21PYmplY3RzID4gW21lZGlhLWxvYWRlcl1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtIGNhbWVyYSBoYXMgY2FtZXJhLXRvb2wgICAgICAgIFxuICAgICAgICAvLyAtIGltYWdlIGZyb20gY2FtZXJhLCBvciBkcm9wcGVkLCBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS1pbWFnZSwgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vIC0gZ2xiIGhhcyBtZWRpYS1sb2FkZXIsIGdsdGYtbW9kZWwtcGx1cywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vIC0gdmlkZW8gaGFzIG1lZGlhLWxvYWRlciwgbWVkaWEtdmlkZW8sIGxpc3RlZC1tZWRpYVxuICAgICAgICAvL1xuICAgICAgICAvLyAgc28sIGdldCBhbGwgY2FtZXJhLXRvb2xzLCBhbmQgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF0sIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayB0aGUgb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUuICBNdXN0IHdhaXQgZm9yIHNjZW5lIHRvIGZpbmlzaCBsb2FkaW5nXG4gICAgICAgIHRoaXMuc2NlbmVMb2FkZWQgPSB0aGlzLnNjZW5lTG9hZGVkLmJpbmQodGhpcylcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5zY2VuZUxvYWRlZCk7XG5cbiAgICB9LFxuXG4gICAgaXNBbmNlc3RvcjogZnVuY3Rpb24gKHJvb3QsIGVudGl0eSkge1xuICAgICAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5ID09IHJvb3QpKSB7XG4gICAgICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChlbnRpdHkgPT0gcm9vdCk7XG4gICAgfSxcbiAgICBcbiAgICAvLyBUaGluZ3Mgd2UgZG9uJ3Qgd2FudCB0byBoaWRlOlxuICAgIC8vIC0gW3dheXBvaW50XVxuICAgIC8vIC0gcGFyZW50IG9mIHNvbWV0aGluZyB3aXRoIFtuYXZtZXNoXSBhcyBhIGNoaWxkICh0aGlzIGlzIHRoZSBuYXZpZ2F0aW9uIHN0dWZmXG4gICAgLy8gLSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsXG4gICAgLy8gLSBbc2t5Ym94XVxuICAgIC8vIC0gW2RpcmVjdGlvbmFsLWxpZ2h0XVxuICAgIC8vIC0gW2FtYmllbnQtbGlnaHRdXG4gICAgLy8gLSBbaGVtaXNwaGVyZS1saWdodF1cbiAgICAvLyAtICNDb21iaW5lZE1lc2hcbiAgICAvLyAtICNzY2VuZS1wcmV2aWV3LWNhbWVyYSBvciBbc2NlbmUtcHJldmlldy1jYW1lcmFdXG4gICAgLy9cbiAgICAvLyB3ZSB3aWxsIGRvXG4gICAgLy8gLSBbbWVkaWEtbG9hZGVyXVxuICAgIC8vIC0gW3Nwb3QtbGlnaHRdXG4gICAgLy8gLSBbcG9pbnQtbGlnaHRdXG4gICAgc2NlbmVMb2FkZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IG5vZGVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJlbnZpcm9ubWVudC1zY2VuZVwiKS5jaGlsZHJlblswXS5jaGlsZHJlblswXVxuICAgICAgICAvL3ZhciBub2RlcyA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwucGFyZW50RWwuY2hpbGROb2RlcztcbiAgICAgICAgZm9yIChsZXQgaT0wOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBub2RlID0gbm9kZXNbaV1cbiAgICAgICAgICAgIC8vaWYgKG5vZGUgPT0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBbmNlc3Rvcihub2RlLCB0aGlzLmVsKSkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2wgPSBub2RlLmNsYXNzTmFtZVxuICAgICAgICAgICAgaWYgKGNsID09PSBcIkNvbWJpbmVkTWVzaFwiIHx8IGNsID09PSBcInNjZW5lLXByZXZpZXctY2FtZXJhXCIpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGMgPSBub2RlLmNvbXBvbmVudHNcbiAgICAgICAgICAgIGlmIChjW1wid2F5cG9pbnRcIl0gfHwgY1tcInNreWJveFwiXSB8fCBjW1wiZGlyZWN0aW9uYWwtbGlnaHRcIl0gfHwgY1tcImFtYmllbnQtbGlnaHRcIl0gfHwgY1tcImhlbWlzcGhlcmUtbGlnaHRcIl0pIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNoID0gbm9kZS5jaGlsZHJlblxuICAgICAgICAgICAgdmFyIG5hdm1lc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAobGV0IGo9MDsgaiA8IGNoLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoW2pdLmNvbXBvbmVudHNbXCJuYXZtZXNoXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIG5hdm1lc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmF2bWVzaCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUsIGR5bmFtaWM6IGZhbHNlIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBhbGwgb2JqZWN0cyBhbmQgYXZhdGFyIHNob3VsZCBiZSBzZXQgdXAsIHNvIGxldHMgbWFrZSBzdXJlIGFsbCBvYmplY3RzIGFyZSBjb3JyZWN0bHkgc2hvd25cbiAgICAgICAgc2hvd0hpZGVPYmplY3RzKClcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PT0gdGhpcy5zaXplKSByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5kYXRhLnNpemUgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnNpemUgPSAxMFxuICAgICAgICAgICAgdGhpcy5zaXplID0gdGhpcy5wYXJzZU5vZGVOYW1lKHRoaXMuZGF0YS5zaXplKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5zY2VuZUxvYWRlZCk7XG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIC8vIHNpemUgPT0gMCBpcyB1c2VkIHRvIHNpZ25hbCBcImRvIG5vdGhpbmdcIlxuICAgICAgICBpZiAodGhpcy5zaXplID09IDApIHtyZXR1cm59XG5cbiAgICAgICAgLy8gc2VlIGlmIHRoZXJlIGFyZSBuZXcgYXZhdGFyc1xuICAgICAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltwbGF5ZXItaW5mb106bm90KFthdmF0YXItcmVnaW9uLWZvbGxvd2VyXSlcIilcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgoYXZhdGFyKSA9PiB7XG4gICAgICAgICAgICBhdmF0YXIuc2V0QXR0cmlidXRlKFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAgc2VlIGlmIHRoZXJlIGFyZSBuZXcgY2FtZXJhLXRvb2xzIG9yIG1lZGlhLWxvYWRlciBvYmplY3RzIGF0IHRoZSB0b3AgbGV2ZWwgb2YgdGhlIHNjZW5lXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdOm5vdChbb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcl0pLCBhLXNjZW5lID4gW21lZGlhLWxvYWRlcl06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSlcIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcbiAgICB9LFxuICBcbiAgICAvLyBuZXdTY2VuZTogZnVuY3Rpb24obW9kZWwpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnZpcm9ubWVudCBzY2VuZSBsb2FkZWQ6IFwiLCBtb2RlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gYWRkUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byByb290OiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIHJlbW92ZVJvb3RFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgcmVtb3ZlZCBmcm9tIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gYWRkU2NlbmVFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgYWRkZWQgdG8gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlU2NlbmVFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgcmVtb3ZlZCBmcm9tIGVudmlyb25tZW50IHNjZW5lOiBcIiwgZWwpXG4gICAgLy8gfSwgIFxuICAgIFxuICAgIHBhcnNlTm9kZU5hbWU6IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggXG4gICAgICAgIC8vICBcInNpemVcIiAoYW4gaW50ZWdlciBudW1iZXIpXG4gICAgICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gIFRoaXMgd2lsbCBzZXQgdGhlIGhpZGRlciBjb21wb25lbnQgdG8gXG4gICAgICAgIC8vIHVzZSB0aGF0IHNpemUgaW4gbWV0ZXJzIGZvciB0aGUgcXVhZHJhbnRzXG4gICAgICAgIHRoaXMubm9kZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMubm9kZU5hbWUubWF0Y2goL18oWzAtOV0qKSQvKVxuXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiAyLCBmaXJzdCBtYXRjaCBpcyB0aGUgZGlyLFxuICAgICAgICAvLyBzZWNvbmQgaXMgdGhlIGNvbXBvbmVudE5hbWUgbmFtZSBvciBudW1iZXJcbiAgICAgICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJlZ2lvbi1oaWRlciBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5ub2RlTmFtZSlcbiAgICAgICAgICAgIHJldHVybiBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgbm9kZVNpemUgPSBwYXJzZUludChwYXJhbXNbMV0pXG4gICAgICAgICAgICBpZiAoIW5vZGVTaXplKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vZGVTaXplXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59KSIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBCaWRpcmVjdGlvbmFsIHNlZS10aHJvdWdoIHBvcnRhbC4gVHdvIHBvcnRhbHMgYXJlIHBhaXJlZCBieSBjb2xvci5cbiAqXG4gKiBVc2FnZVxuICogPT09PT09PVxuICogQWRkIHR3byBpbnN0YW5jZXMgb2YgYHBvcnRhbC5nbGJgIHRvIHRoZSBTcG9rZSBzY2VuZS5cbiAqIFRoZSBuYW1lIG9mIGVhY2ggaW5zdGFuY2Ugc2hvdWxkIGxvb2sgbGlrZSBcInNvbWUtZGVzY3JpcHRpdmUtbGFiZWxfX2NvbG9yXCJcbiAqIEFueSB2YWxpZCBUSFJFRS5Db2xvciBhcmd1bWVudCBpcyBhIHZhbGlkIGNvbG9yIHZhbHVlLlxuICogU2VlIGhlcmUgZm9yIGV4YW1wbGUgY29sb3IgbmFtZXMgaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9jc3NyZWYvY3NzX2NvbG9ycy5hc3BcbiAqXG4gKiBGb3IgZXhhbXBsZSwgdG8gbWFrZSBhIHBhaXIgb2YgY29ubmVjdGVkIGJsdWUgcG9ydGFscyxcbiAqIHlvdSBjb3VsZCBuYW1lIHRoZW0gXCJwb3J0YWwtdG9fX2JsdWVcIiBhbmQgXCJwb3J0YWwtZnJvbV9fYmx1ZVwiXG4gKi9cblxuaW1wb3J0ICcuL3Byb3hpbWl0eS1ldmVudHMuanMnXG5pbXBvcnQgdmVydGV4U2hhZGVyIGZyb20gJy4uL3NoYWRlcnMvcG9ydGFsLnZlcnQuanMnXG5pbXBvcnQgZnJhZ21lbnRTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwuZnJhZy5qcydcbmltcG9ydCBzbm9pc2UgZnJvbSAnLi4vc2hhZGVycy9zbm9pc2UuanMnXG5pbXBvcnQgeyBzaG93UmVnaW9uRm9yT2JqZWN0LCBoaWRlclJlZ2lvbkZvck9iamVjdCB9IGZyb20gJy4vcmVnaW9uLWhpZGVyLmpzJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuXG5jb25zdCB3b3JsZFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkQ2FtZXJhUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGREaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFF1YXQgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpXG5jb25zdCBtYXQ0ID0gbmV3IFRIUkVFLk1hdHJpeDQoKVxuXG5mdW5jdGlvbiBtYXBNYXRlcmlhbHMob2JqZWN0M0QsIGZuKSB7XG4gICAgbGV0IG1lc2ggPSBvYmplY3QzRCBcbiAgICBpZiAoIW1lc2gubWF0ZXJpYWwpIHJldHVybjtcbiAgXG4gICAgaWYgKEFycmF5LmlzQXJyYXkobWVzaC5tYXRlcmlhbCkpIHtcbiAgICAgIHJldHVybiBtZXNoLm1hdGVyaWFsLm1hcChmbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmbihtZXNoLm1hdGVyaWFsKTtcbiAgICB9XG59XG4gIFxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdwb3J0YWwnLCB7XG4gIGRlcGVuZGVuY2llczogWydmYWRlci1wbHVzJ10sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIgPSB0aGlzLmVsLnN5c3RlbXNbJ2h1YnMtc3lzdGVtcyddLmNoYXJhY3RlckNvbnRyb2xsZXJcbiAgICB0aGlzLmZhZGVyID0gdGhpcy5lbC5zeXN0ZW1zWydmYWRlci1wbHVzJ11cbiAgICB0aGlzLnJvb21EYXRhID0gbnVsbFxuICAgIHRoaXMud2FpdEZvckZldGNoID0gdGhpcy53YWl0Rm9yRmV0Y2guYmluZCh0aGlzKVxuXG4gICAgLy8gaWYgdGhlIHVzZXIgaXMgbG9nZ2VkIGluLCB3ZSB3YW50IHRvIHJldHJpZXZlIHRoZWlyIHVzZXJEYXRhIGZyb20gdGhlIHRvcCBsZXZlbCBzZXJ2ZXJcbiAgICBpZiAod2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscyAmJiB3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzLnRva2VuICYmICF3aW5kb3cuQVBQLnVzZXJEYXRhKSB7XG4gICAgICAgIHRoaXMuZmV0Y2hSb29tRGF0YSgpXG4gICAgfVxuICB9LFxuICBmZXRjaFJvb21EYXRhOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBhcmFtcyA9IHt0b2tlbjogd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbixcbiAgICAgICAgICAgICAgICAgIHJvb21faWQ6IHdpbmRvdy5BUFAuaHViQ2hhbm5lbC5odWJJZH1cblxuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBvcHRpb25zLmhlYWRlcnMgPSBuZXcgSGVhZGVycygpO1xuICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJBdXRob3JpemF0aW9uXCIsIGBCZWFyZXIgJHtwYXJhbXN9YCk7XG4gICAgb3B0aW9ucy5oZWFkZXJzLnNldChcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gICAgYXdhaXQgZmV0Y2goXCJodHRwczovL3JlYWxpdHltZWRpYS5kaWdpdGFsL3VzZXJEYXRhXCIsIG9wdGlvbnMpXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1N1Y2Nlc3M6JywgZGF0YSk7XG4gICAgICAgICAgdGhpcy5yb29tRGF0YSA9IGRhdGE7XG4gICAgfSlcbiAgICB0aGlzLnJvb21EYXRhLnRleHR1cmVzID0gW11cbiAgfSxcbiAgZ2V0Um9vbVVSTDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgLy9yZXR1cm4gdGhpcy5yb29tRGF0YS5yb29tcy5sZW5ndGggPiBudW1iZXIgPyBcImh0dHBzOi8veHIucmVhbGl0eW1lZGlhLmRpZ2l0YWwvXCIgKyB0aGlzLnJvb21EYXRhLnJvb21zW251bWJlcl0gOiBudWxsO1xuICAgICAgbGV0IHVybCA9IHdpbmRvdy5TU08udXNlckluZm8ucm9vbXMubGVuZ3RoID4gbnVtYmVyID8gXCJodHRwczovL3hyLnJlYWxpdHltZWRpYS5kaWdpdGFsL1wiICsgd2luZG93LlNTTy51c2VySW5mby5yb29tc1tudW1iZXJdIDogbnVsbDtcbiAgICAgIHJldHVybiB1cmxcbiAgfSxcbiAgZ2V0Q3ViZU1hcDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgd2FpdEZvckZldGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgIGlmICh0aGlzLnJvb21EYXRhICYmIHdpbmRvdy5TU08udXNlckluZm8pIHJldHVyblxuICAgICBzZXRUaW1lb3V0KHRoaXMud2FpdEZvckZldGNoLCAxMDApOyAvLyB0cnkgYWdhaW4gaW4gMTAwIG1pbGxpc2Vjb25kc1xuICB9LFxuICB0ZWxlcG9ydFRvOiBhc3luYyBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IHRydWVcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVPdXQoKVxuICAgIC8vIFNjYWxlIHNjcmV3cyB1cCB0aGUgd2F5cG9pbnQgbG9naWMsIHNvIGp1c3Qgc2VuZCBwb3NpdGlvbiBhbmQgb3JpZW50YXRpb25cbiAgICBvYmplY3QuZ2V0V29ybGRRdWF0ZXJuaW9uKHdvcmxkUXVhdClcbiAgICBvYmplY3QuZ2V0V29ybGREaXJlY3Rpb24od29ybGREaXIpXG4gICAgb2JqZWN0LmdldFdvcmxkUG9zaXRpb24od29ybGRQb3MpXG4gICAgd29ybGRQb3MuYWRkKHdvcmxkRGlyLm11bHRpcGx5U2NhbGFyKDEuNSkpIC8vIFRlbGVwb3J0IGluIGZyb250IG9mIHRoZSBwb3J0YWwgdG8gYXZvaWQgaW5maW5pdGUgbG9vcFxuICAgIG1hdDQubWFrZVJvdGF0aW9uRnJvbVF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG1hdDQuc2V0UG9zaXRpb24od29ybGRQb3MpXG4gICAgLy8gVXNpbmcgdGhlIGNoYXJhY3RlckNvbnRyb2xsZXIgZW5zdXJlcyB3ZSBkb24ndCBzdHJheSBmcm9tIHRoZSBuYXZtZXNoXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyLnRyYXZlbEJ5V2F5cG9pbnQobWF0NCwgdHJ1ZSwgZmFsc2UpXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlSW4oKVxuICAgIHRoaXMudGVsZXBvcnRpbmcgPSBmYWxzZVxuICB9LFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCB7XG4gIHNjaGVtYToge1xuICAgIHBvcnRhbFR5cGU6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgIHBvcnRhbFRhcmdldDogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogbnVsbCB9LFxuICAgIG1hdGVyaWFsVGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH1cbiAgfSxcbiAgaW5pdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zLnBvcnRhbCAvLyBBLUZyYW1lIGlzIHN1cHBvc2VkIHRvIGRvIHRoaXMgYnkgZGVmYXVsdCBidXQgZG9lc24ndD9cblxuICAgIGlmICh0aGlzLmRhdGEucG9ydGFsVHlwZS5sZW5ndGggPiAwICkge1xuICAgICAgICB0aGlzLnNldFBvcnRhbEluZm8odGhpcy5kYXRhLnBvcnRhbFR5cGUsIHRoaXMuZGF0YS5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5jb2xvcilcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgfVxuXG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAwKSB7XG4gICAgICAgIC8vIHBhcnNlIHRoZSBuYW1lIHRvIGdldCBwb3J0YWwgdHlwZSwgdGFyZ2V0LCBhbmQgY29sb3JcbiAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKClcbiAgICB9XG4gICAgXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBjdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuVGV4dHVyZSgpIH0sXG4gICAgICAgIHRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgcmFkaXVzOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIHJpbmdDb2xvcjogeyB2YWx1ZTogdGhpcy5jb2xvciB9LFxuICAgICAgfSxcbiAgICAgIHZlcnRleFNoYWRlcixcbiAgICAgIGZyYWdtZW50U2hhZGVyOiBgXG4gICAgICAgICR7c25vaXNlfVxuICAgICAgICAke2ZyYWdtZW50U2hhZGVyfVxuICAgICAgYCxcbiAgICB9KVxuXG4gICAgLy8gQXNzdW1lIHRoYXQgdGhlIG9iamVjdCBoYXMgYSBwbGFuZSBnZW9tZXRyeVxuICAgIC8vY29uc3QgbWVzaCA9IHRoaXMuZWwuZ2V0T3JDcmVhdGVPYmplY3QzRCgnbWVzaCcpXG4gICAgLy9tZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuICAgIHRoaXMucmVwbGFjZU1hdGVyaWFsKHRoaXMubWF0ZXJpYWwpXG5cbiAgICAvLyBnZXQgdGhlIG90aGVyIGJlZm9yZSBjb250aW51aW5nXG4gICAgdGhpcy5vdGhlciA9IGF3YWl0IHRoaXMuZ2V0T3RoZXIoKVxuXG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtLmdldEN1YmVNYXAodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4oIHVybHMgPT4ge1xuICAgICAgICAgICAgLy9jb25zdCB1cmxzID0gW2N1YmVNYXBQb3NYLCBjdWJlTWFwTmVnWCwgY3ViZU1hcFBvc1ksIGN1YmVNYXBOZWdZLCBjdWJlTWFwUG9zWiwgY3ViZU1hcE5lZ1pdO1xuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgIG5ldyBUSFJFRS5DdWJlVGV4dHVyZUxvYWRlcigpLmxvYWQodXJscywgcmVzb2x2ZSwgdW5kZWZpbmVkLCByZWplY3QpXG4gICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGV4dHVyZTtcbiAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgIH0pXG4gICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikgeyAgICBcbiAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IFRIUkVFLkN1YmVDYW1lcmEoMSwgMTAwMDAwLCAxMDI0KVxuICAgICAgICB0aGlzLmN1YmVDYW1lcmEucm90YXRlWShNYXRoLlBJKSAvLyBGYWNlIGZvcndhcmRzXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCAoKSA9PiB7XG4gICAgICAgICAgICBzaG93UmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEudXBkYXRlKHRoaXMuZWwuc2NlbmVFbC5yZW5kZXJlciwgdGhpcy5lbC5zY2VuZUVsLm9iamVjdDNEKVxuICAgICAgICAgICAgaGlkZXJSZWdpb25Gb3JPYmplY3QodGhpcy5lbClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnYW5pbWF0aW9uX19wb3J0YWwnLCB7XG4gICAgICAgIHByb3BlcnR5OiAnY29tcG9uZW50cy5wb3J0YWwubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlJyxcbiAgICAgICAgZHVyOiA3MDAsXG4gICAgICAgIGVhc2luZzogJ2Vhc2VJbk91dEN1YmljJyxcbiAgICB9KVxuICAgIC8vIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uYmVnaW4nLCAoKSA9PiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdHJ1ZSkpXG4gICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25jb21wbGV0ZV9fcG9ydGFsJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9ICF0aGlzLmlzQ2xvc2VkKCkpKVxuXG4gICAgLy8gZ29pbmcgdG8gd2FudCB0byB0cnkgYW5kIG1ha2UgdGhlIG9iamVjdCB0aGlzIHBvcnRhbCBpcyBvbiBjbGlja2FibGVcbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlfSlcbiAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgLy8gb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgcG9ydGFsIG1vdmVtZW50IFxuICAgIC8vdGhpcy5mb2xsb3dQb3J0YWwgPSB0aGlzLmZvbGxvd1BvcnRhbC5iaW5kKHRoaXMpXG4gICAgLy90aGlzLmVsLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5mb2xsb3dQb3J0YWwpXG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiA1IH0pXG4gICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMub3BlbigpKVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5bGVhdmUnLCAoKSA9PiB0aGlzLmNsb3NlKCkpXG4gIH0sXG5cbiAgcmVwbGFjZU1hdGVyaWFsOiBmdW5jdGlvbiAobmV3TWF0ZXJpYWwpIHtcbiAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLm1hdGVyaWFsVGFyZ2V0XG4gICAgaWYgKHRhcmdldCAmJiB0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICBcbiAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0KSA9PiB7XG4gICAgICBsZXQgbWVzaCA9IG9iamVjdFxuICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbiAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsKSA9PiB7ICAgICAgICAgXG4gICAgICAgICAgICAgIGlmICghdGFyZ2V0IHx8IG1hdGVyaWFsLm5hbWUgPT09IHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01hdGVyaWFsXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgfVxuICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCByZXBsYWNlTWF0ZXJpYWxzID0gKCkgPT4ge1xuICAgIC8vIG1lc2ggd291bGQgY29udGFpbiB0aGUgb2JqZWN0IHRoYXQgaXMsIG9yIGNvbnRhaW5zLCB0aGUgbWVzaGVzXG4gICAgdmFyIG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBpZiAoIW1lc2gpIHtcbiAgICAgICAgLy8gaWYgbm8gbWVzaCwgd2UnbGwgc2VhcmNoIHRocm91Z2ggYWxsIG9mIHRoZSBjaGlsZHJlbi4gIFRoaXMgd291bGRcbiAgICAgICAgLy8gaGFwcGVuIGlmIHdlIGRyb3BwZWQgdGhlIGNvbXBvbmVudCBvbiBhIGdsYiBpbiBzcG9rZVxuICAgICAgICBtZXNoID0gdGhpcy5lbC5vYmplY3QzRFxuICAgIH1cbiAgICB0cmF2ZXJzZShtZXNoKTtcbiAgICB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuICAgIH1cblxuICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgIGxldCBpbml0aWFsaXplciA9ICgpID0+e1xuICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCByZXBsYWNlTWF0ZXJpYWxzKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXBsYWNlTWF0ZXJpYWxzKClcbiAgICAgIH1cbiAgICB9O1xuICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4gIH0sXG5cbi8vICAgZm9sbG93UG9ydGFsOiBmdW5jdGlvbigpIHtcbi8vICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEpIHtcbi8vICAgICAgICAgY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhyZWYgdG8gXCIgKyB0aGlzLm90aGVyKVxuLy8gICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbi8vICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbi8vICAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuLy8gICAgICAgfVxuLy8gICB9LFxuICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMudGltZS52YWx1ZSA9IHRpbWUgLyAxMDAwXG4gICAgICAgIFxuICAgIGlmICh0aGlzLm90aGVyICYmICF0aGlzLnN5c3RlbS50ZWxlcG9ydGluZykge1xuICAgICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhUG9zKVxuICAgICAgY29uc3QgZGlzdCA9IHdvcmxkQ2FtZXJhUG9zLmRpc3RhbmNlVG8od29ybGRQb3MpXG5cbiAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSAmJiBkaXN0IDwgMSkge1xuICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiAmJiBkaXN0IDwgMSkge1xuICAgICAgICB0aGlzLnN5c3RlbS50ZWxlcG9ydFRvKHRoaXMub3RoZXIub2JqZWN0M0QpXG4gICAgICB9XG4gICAgfVxuICB9LFxuICBnZXRPdGhlcjogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHJlc29sdmUobnVsbClcbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSAgPT0gMSkge1xuICAgICAgICAgICAgLy8gdGhlIHRhcmdldCBpcyBhbm90aGVyIHJvb20sIHJlc29sdmUgd2l0aCB0aGUgVVJMIHRvIHRoZSByb29tXG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRSb29tVVJMKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKHVybCA9PiB7IHJlc29sdmUodXJsKSB9KVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gbm93IGZpbmQgdGhlIHBvcnRhbCB3aXRoaW4gdGhlIHJvb20uICBUaGUgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycyB3aXRoIHRoZSBzYW1lIHBvcnRhbFRhcmdldFxuICAgICAgICBjb25zdCBwb3J0YWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbcG9ydGFsXWApKVxuICAgICAgICBjb25zdCBvdGhlciA9IHBvcnRhbHMuZmluZCgoZWwpID0+IGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFR5cGUgPT0gdGhpcy5wb3J0YWxUeXBlICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFRhcmdldCA9PT0gdGhpcy5wb3J0YWxUYXJnZXQgJiYgZWwgIT09IHRoaXMuZWwpXG4gICAgICAgIGlmIChvdGhlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBDYXNlIDE6IFRoZSBvdGhlciBwb3J0YWwgYWxyZWFkeSBleGlzdHNcbiAgICAgICAgICAgIHJlc29sdmUob3RoZXIpO1xuICAgICAgICAgICAgb3RoZXIuZW1pdCgncGFpcicsIHsgb3RoZXI6IHRoaXMuZWwgfSkgLy8gTGV0IHRoZSBvdGhlciBrbm93IHRoYXQgd2UncmUgcmVhZHlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIENhc2UgMjogV2UgY291bGRuJ3QgZmluZCB0aGUgb3RoZXIgcG9ydGFsLCB3YWl0IGZvciBpdCB0byBzaWduYWwgdGhhdCBpdCdzIHJlYWR5XG4gICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3BhaXInLCAoZXZlbnQpID0+IHJlc29sdmUoZXZlbnQuZGV0YWlsLm90aGVyKSwgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgIH1cbiAgICB9KVxuICB9LFxuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBub2RlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG5cbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBlaXRoZXIgXG4gICAgICAgIC8vIC0gXCJyb29tX25hbWVfY29sb3JcIlxuICAgICAgICAvLyAtIFwicG9ydGFsX05fY29sb3JcIiBcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiBOdW1iZXJlZCBwb3J0YWxzIHNob3VsZCBjb21lIGluIHBhaXJzLlxuICAgICAgICBjb25zdCBwYXJhbXMgPSBub2RlTmFtZS5tYXRjaCgvKFtBLVphLXpdKilfKFtBLVphLXowLTldKilfKFtBLVphLXowLTldKikkLylcbiAgICAgICAgXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiA0LCBmaXJzdCBtYXRjaCBpcyB0aGUgcG9ydGFsIHR5cGUsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgbmFtZSBvciBudW1iZXIsIGFuZCBsYXN0IGlzIHRoZSBjb2xvclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicG9ydGFsIG5vZGUgbmFtZSBub3QgZm9ybWVkIGNvcnJlY3RseTogXCIsIG5vZGVOYW1lKVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgICAgICB0aGlzLmNvbG9yID0gXCJyZWRcIiAvLyBkZWZhdWx0IHNvIHRoZSBwb3J0YWwgaGFzIGEgY29sb3IgdG8gdXNlXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuc2V0UG9ydGFsSW5mbyhwYXJhbXNbMV0sIHBhcmFtc1syXSwgcGFyYW1zWzNdKVxuICAgIH0sXG5cbiAgICBzZXRQb3J0YWxJbmZvOiBmdW5jdGlvbihwb3J0YWxUeXBlLCBwb3J0YWxUYXJnZXQsIGNvbG9yKSB7XG4gICAgICAgIGlmIChwb3J0YWxUeXBlID09PSBcInJvb21cIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMTtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcGFyc2VJbnQocG9ydGFsVGFyZ2V0KVxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwicG9ydGFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDI7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBvcnRhbFRhcmdldFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMDtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gbnVsbFxuICAgICAgICB9IFxuICAgICAgICB0aGlzLmNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKGNvbG9yKVxuICAgIH0sXG5cbiAgICBzZXRSYWRpdXModmFsKSB7XG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhbmltYXRpb25fX3BvcnRhbCcsIHtcbiAgICAgICAgICBmcm9tOiB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZSxcbiAgICAgICAgICB0bzogdmFsLFxuICAgICAgICB9KVxuICAgIH0sXG4gICAgb3BlbigpIHtcbiAgICAgICAgdGhpcy5zZXRSYWRpdXMoMSlcbiAgICB9LFxuICAgIGNsb3NlKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygwKVxuICAgIH0sXG4gICAgaXNDbG9zZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZSA9PT0gMFxuICAgIH0sXG59KVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIDM2MCBpbWFnZSB0aGF0IGZpbGxzIHRoZSB1c2VyJ3MgdmlzaW9uIHdoZW4gaW4gYSBjbG9zZSBwcm94aW1pdHkuXG4gKlxuICogVXNhZ2VcbiAqID09PT09PT1cbiAqIEdpdmVuIGEgMzYwIGltYWdlIGFzc2V0IHdpdGggdGhlIGZvbGxvd2luZyBVUkwgaW4gU3Bva2U6XG4gKiBodHRwczovL2d0LWFlbC1hcS1hc3NldHMuYWVsYXRndC1pbnRlcm5hbC5uZXQvZmlsZXMvMTIzNDVhYmMtNjc4OWRlZi5qcGdcbiAqXG4gKiBUaGUgbmFtZSBvZiB0aGUgYGltbWVyc2l2ZS0zNjAuZ2xiYCBpbnN0YW5jZSBpbiB0aGUgc2NlbmUgc2hvdWxkIGJlOlxuICogXCJzb21lLWRlc2NyaXB0aXZlLWxhYmVsX18xMjM0NWFiYy02Nzg5ZGVmX2pwZ1wiIE9SIFwiMTIzNDVhYmMtNjc4OWRlZl9qcGdcIlxuICovXG5cbmNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCB7XG4gIHNjaGVtYToge1xuICAgIHVybDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbCB9LFxuICB9LFxuICBpbml0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgdXJsID0gdGhpcy5kYXRhLnVybCA/PyB0aGlzLnBhcnNlU3Bva2VOYW1lKClcbiAgICBjb25zdCBleHRlbnNpb24gPSB1cmwubWF0Y2goL14uKlxcLiguKikkLylbMV1cblxuICAgIC8vIG1lZGlhLWltYWdlIHdpbGwgc2V0IHVwIHRoZSBzcGhlcmUgZ2VvbWV0cnkgZm9yIHVzXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ21lZGlhLWltYWdlJywge1xuICAgICAgcHJvamVjdGlvbjogJzM2MC1lcXVpcmVjdGFuZ3VsYXInLFxuICAgICAgYWxwaGFNb2RlOiAnb3BhcXVlJyxcbiAgICAgIHNyYzogdXJsLFxuICAgICAgdmVyc2lvbjogMSxcbiAgICAgIGJhdGNoOiBmYWxzZSxcbiAgICAgIGNvbnRlbnRUeXBlOiBgaW1hZ2UvJHtleHRlbnNpb259YCxcbiAgICAgIGFscGhhQ3V0b2ZmOiAwLFxuICAgIH0pXG4gICAgLy8gYnV0IHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhpcyB0byBoYXBwZW5cbiAgICB0aGlzLm1lc2ggPSBhd2FpdCB0aGlzLmdldE1lc2goKVxuICAgIHRoaXMubWVzaC5nZW9tZXRyeS5zY2FsZSgxMDAsIDEwMCwgMTAwKVxuICAgIHRoaXMubWVzaC5tYXRlcmlhbC5zZXRWYWx1ZXMoe1xuICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICBkZXB0aFRlc3Q6IGZhbHNlLFxuICAgIH0pXG4gICAgdGhpcy5uZWFyID0gMVxuICAgIHRoaXMuZmFyID0gMS4zXG5cbiAgICAvLyBSZW5kZXIgT1ZFUiB0aGUgc2NlbmUgYnV0IFVOREVSIHRoZSBjdXJzb3JcbiAgICB0aGlzLm1lc2gucmVuZGVyT3JkZXIgPSBBUFAuUkVOREVSX09SREVSLkNVUlNPUiAtIDFcbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLm1lc2gpIHtcbiAgICAgIC8vIExpbmVhcmx5IG1hcCBjYW1lcmEgZGlzdGFuY2UgdG8gbWF0ZXJpYWwgb3BhY2l0eVxuICAgICAgdGhpcy5tZXNoLmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSB3b3JsZFNlbGYuZGlzdGFuY2VUbyh3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IG9wYWNpdHkgPSAxIC0gKGRpc3RhbmNlIC0gdGhpcy5uZWFyKSAvICh0aGlzLmZhciAtIHRoaXMubmVhcilcbiAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gb3BhY2l0eVxuICAgIH1cbiAgfSxcbiAgcGFyc2VTcG9rZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBBY2NlcHRlZCBuYW1lczogXCJsYWJlbF9faW1hZ2UtaGFzaF9leHRcIiBPUiBcImltYWdlLWhhc2hfZXh0XCJcbiAgICBjb25zdCBzcG9rZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgIGNvbnN0IFssIGhhc2gsIGV4dGVuc2lvbl0gPSBzcG9rZU5hbWUubWF0Y2goLyg/Oi4qX18pPyguKilfKC4qKS8pXG4gICAgY29uc3QgdXJsID0gYGh0dHBzOi8vZ3QtYWVsLWFxLWFzc2V0cy5hZWxhdGd0LWludGVybmFsLm5ldC9maWxlcy8ke2hhc2h9LiR7ZXh0ZW5zaW9ufWBcbiAgICByZXR1cm4gdXJsXG4gIH0sXG4gIGdldE1lc2g6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICAgIGlmIChtZXNoKSByZXNvbHZlKG1lc2gpXG4gICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdpbWFnZS1sb2FkZWQnLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgcmVzb2x2ZSh0aGlzLmVsLm9iamVjdDNETWFwLm1lc2gpXG4gICAgICAgIH0sXG4gICAgICAgIHsgb25jZTogdHJ1ZSB9XG4gICAgICApXG4gICAgfSlcbiAgfSxcbn0pXG4iLCIvLyBQYXJhbGxheCBPY2NsdXNpb24gc2hhZGVycyBmcm9tXG4vLyAgICBodHRwOi8vc3VuYW5kYmxhY2tjYXQuY29tL3RpcEZ1bGxWaWV3LnBocD90b3BpY2lkPTI4XG4vLyBObyB0YW5nZW50LXNwYWNlIHRyYW5zZm9ybXMgbG9naWMgYmFzZWQgb25cbi8vICAgaHR0cDovL21taWtrZWxzZW4zZC5ibG9nc3BvdC5zay8yMDEyLzAyL3BhcmFsbGF4cG9jLW1hcHBpbmctYW5kLW5vLXRhbmdlbnQuaHRtbFxuXG4vLyBJZGVudGl0eSBmdW5jdGlvbiBmb3IgZ2xzbC1saXRlcmFsIGhpZ2hsaWdodGluZyBpbiBWUyBDb2RlXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCBQYXJhbGxheFNoYWRlciA9IHtcbiAgLy8gT3JkZXJlZCBmcm9tIGZhc3Rlc3QgdG8gYmVzdCBxdWFsaXR5LlxuICBtb2Rlczoge1xuICAgIG5vbmU6ICdOT19QQVJBTExBWCcsXG4gICAgYmFzaWM6ICdVU0VfQkFTSUNfUEFSQUxMQVgnLFxuICAgIHN0ZWVwOiAnVVNFX1NURUVQX1BBUkFMTEFYJyxcbiAgICBvY2NsdXNpb246ICdVU0VfT0NMVVNJT05fUEFSQUxMQVgnLCAvLyBhLmsuYS4gUE9NXG4gICAgcmVsaWVmOiAnVVNFX1JFTElFRl9QQVJBTExBWCcsXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBidW1wTWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgbWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgfSxcblxuICB2ZXJ0ZXhTaGFkZXI6IGdsc2xgXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZVdiA9IHV2O1xuICAgICAgdmVjNCBtdlBvc2l0aW9uID0gbW9kZWxWaWV3TWF0cml4ICogdmVjNCggcG9zaXRpb24sIDEuMCApO1xuICAgICAgdlZpZXdQb3NpdGlvbiA9IC1tdlBvc2l0aW9uLnh5ejtcbiAgICAgIHZOb3JtYWwgPSBub3JtYWxpemUoIG5vcm1hbE1hdHJpeCAqIG5vcm1hbCApO1xuICAgICAgXG4gICAgICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtdlBvc2l0aW9uO1xuICAgIH1cbiAgYCxcblxuICBmcmFnbWVudFNoYWRlcjogZ2xzbGBcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBidW1wTWFwO1xuICAgIHVuaWZvcm0gc2FtcGxlcjJEIG1hcDtcblxuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhTY2FsZTtcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWluTGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNYXhMYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBmYWRlOyAvLyBDVVNUT01cblxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICAjaWZkZWYgVVNFX0JBU0lDX1BBUkFMTEFYXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgZmxvYXQgaW5pdGlhbEhlaWdodCA9IHRleHR1cmUyRChidW1wTWFwLCB2VXYpLnI7XG5cbiAgICAgIC8vIE5vIE9mZnNldCBMaW1pdHRpbmc6IG1lc3N5LCBmbG9hdGluZyBvdXRwdXQgYXQgZ3JhemluZyBhbmdsZXMuXG4gICAgICAvL1widmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56ICogaW5pdGlhbEhlaWdodDtcIixcblxuICAgICAgLy8gT2Zmc2V0IExpbWl0aW5nXG4gICAgICB2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgKiBpbml0aWFsSGVpZ2h0O1xuICAgICAgcmV0dXJuIHZVdiAtIHRleENvb3JkT2Zmc2V0O1xuICAgIH1cblxuICAgICNlbHNlXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgLy8gRGV0ZXJtaW5lIG51bWJlciBvZiBsYXllcnMgZnJvbSBhbmdsZSBiZXR3ZWVuIFYgYW5kIE5cbiAgICAgIGZsb2F0IG51bUxheWVycyA9IG1peChwYXJhbGxheE1heExheWVycywgcGFyYWxsYXhNaW5MYXllcnMsIGFicyhkb3QodmVjMygwLjAsIDAuMCwgMS4wKSwgVikpKTtcblxuICAgICAgZmxvYXQgbGF5ZXJIZWlnaHQgPSAxLjAgLyBudW1MYXllcnM7XG4gICAgICBmbG9hdCBjdXJyZW50TGF5ZXJIZWlnaHQgPSAwLjA7XG4gICAgICAvLyBTaGlmdCBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzIGZvciBlYWNoIGl0ZXJhdGlvblxuICAgICAgdmVjMiBkdGV4ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogLyBudW1MYXllcnM7XG5cbiAgICAgIHZlYzIgY3VycmVudFRleHR1cmVDb29yZHMgPSB2VXY7XG5cbiAgICAgIGZsb2F0IGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuXG4gICAgICAvLyB3aGlsZSAoIGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0IClcbiAgICAgIC8vIEluZmluaXRlIGxvb3BzIGFyZSBub3Qgd2VsbCBzdXBwb3J0ZWQuIERvIGEgXCJsYXJnZVwiIGZpbml0ZVxuICAgICAgLy8gbG9vcCwgYnV0IG5vdCB0b28gbGFyZ2UsIGFzIGl0IHNsb3dzIGRvd24gc29tZSBjb21waWxlcnMuXG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IDMwOyBpICs9IDEpIHtcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlIDw9IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBsYXllckhlaWdodDtcbiAgICAgICAgLy8gU2hpZnQgdGV4dHVyZSBjb29yZGluYXRlcyBhbG9uZyB2ZWN0b3IgVlxuICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkdGV4O1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgIH1cblxuICAgICAgI2lmZGVmIFVTRV9TVEVFUF9QQVJBTExBWFxuXG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX1JFTElFRl9QQVJBTExBWClcblxuICAgICAgdmVjMiBkZWx0YVRleENvb3JkID0gZHRleCAvIDIuMDtcbiAgICAgIGZsb2F0IGRlbHRhSGVpZ2h0ID0gbGF5ZXJIZWlnaHQgLyAyLjA7XG5cbiAgICAgIC8vIFJldHVybiB0byB0aGUgbWlkIHBvaW50IG9mIHByZXZpb3VzIGxheWVyXG4gICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuXG4gICAgICAvLyBCaW5hcnkgc2VhcmNoIHRvIGluY3JlYXNlIHByZWNpc2lvbiBvZiBTdGVlcCBQYXJhbGxheCBNYXBwaW5nXG4gICAgICBjb25zdCBpbnQgbnVtU2VhcmNoZXMgPSA1O1xuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBudW1TZWFyY2hlczsgaSArPSAxKSB7XG4gICAgICAgIGRlbHRhVGV4Q29vcmQgLz0gMi4wO1xuICAgICAgICBkZWx0YUhlaWdodCAvPSAyLjA7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgICAvLyBTaGlmdCBhbG9uZyBvciBhZ2FpbnN0IHZlY3RvciBWXG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIC8vIEJlbG93IHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBhYm92ZSB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfT0NMVVNJT05fUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgcHJldlRDb29yZHMgPSBjdXJyZW50VGV4dHVyZUNvb3JkcyArIGR0ZXg7XG5cbiAgICAgIC8vIEhlaWdodHMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCBuZXh0SCA9IGhlaWdodEZyb21UZXh0dXJlIC0gY3VycmVudExheWVySGVpZ2h0O1xuICAgICAgZmxvYXQgcHJldkggPSB0ZXh0dXJlMkQoYnVtcE1hcCwgcHJldlRDb29yZHMpLnIgLSBjdXJyZW50TGF5ZXJIZWlnaHQgKyBsYXllckhlaWdodDtcblxuICAgICAgLy8gUHJvcG9ydGlvbnMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCB3ZWlnaHQgPSBuZXh0SCAvIChuZXh0SCAtIHByZXZIKTtcblxuICAgICAgLy8gSW50ZXJwb2xhdGlvbiBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzXG4gICAgICByZXR1cm4gcHJldlRDb29yZHMgKiB3ZWlnaHQgKyBjdXJyZW50VGV4dHVyZUNvb3JkcyAqICgxLjAgLSB3ZWlnaHQpO1xuXG4gICAgICAjZWxzZSAvLyBOT19QQVJBTExBWFxuXG4gICAgICByZXR1cm4gdlV2O1xuXG4gICAgICAjZW5kaWZcbiAgICB9XG4gICAgI2VuZGlmXG5cbiAgICB2ZWMyIHBlcnR1cmJVdih2ZWMzIHN1cmZQb3NpdGlvbiwgdmVjMyBzdXJmTm9ybWFsLCB2ZWMzIHZpZXdQb3NpdGlvbikge1xuICAgICAgdmVjMiB0ZXhEeCA9IGRGZHgodlV2KTtcbiAgICAgIHZlYzIgdGV4RHkgPSBkRmR5KHZVdik7XG5cbiAgICAgIHZlYzMgdlNpZ21hWCA9IGRGZHgoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlNpZ21hWSA9IGRGZHkoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlIxID0gY3Jvc3ModlNpZ21hWSwgc3VyZk5vcm1hbCk7XG4gICAgICB2ZWMzIHZSMiA9IGNyb3NzKHN1cmZOb3JtYWwsIHZTaWdtYVgpO1xuICAgICAgZmxvYXQgZkRldCA9IGRvdCh2U2lnbWFYLCB2UjEpO1xuXG4gICAgICB2ZWMyIHZQcm9qVnNjciA9ICgxLjAgLyBmRGV0KSAqIHZlYzIoZG90KHZSMSwgdmlld1Bvc2l0aW9uKSwgZG90KHZSMiwgdmlld1Bvc2l0aW9uKSk7XG4gICAgICB2ZWMzIHZQcm9qVnRleDtcbiAgICAgIHZQcm9qVnRleC54eSA9IHRleER4ICogdlByb2pWc2NyLnggKyB0ZXhEeSAqIHZQcm9qVnNjci55O1xuICAgICAgdlByb2pWdGV4LnogPSBkb3Qoc3VyZk5vcm1hbCwgdmlld1Bvc2l0aW9uKTtcblxuICAgICAgcmV0dXJuIHBhcmFsbGF4TWFwKHZQcm9qVnRleCk7XG4gICAgfVxuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdmVjMiBtYXBVdiA9IHBlcnR1cmJVdigtdlZpZXdQb3NpdGlvbiwgbm9ybWFsaXplKHZOb3JtYWwpLCBub3JtYWxpemUodlZpZXdQb3NpdGlvbikpO1xuICAgICAgXG4gICAgICAvLyBDVVNUT00gU1RBUlRcbiAgICAgIHZlYzQgdGV4ZWwgPSB0ZXh0dXJlMkQobWFwLCBtYXBVdik7XG4gICAgICB2ZWMzIGNvbG9yID0gbWl4KHRleGVsLnh5eiwgdmVjMygwKSwgZmFkZSk7XG4gICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgLy8gQ1VTVE9NIEVORFxuICAgIH1cblxuICBgLFxufVxuXG5leHBvcnQgeyBQYXJhbGxheFNoYWRlciB9XG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQ3JlYXRlIHRoZSBpbGx1c2lvbiBvZiBkZXB0aCBpbiBhIGNvbG9yIGltYWdlIGZyb20gYSBkZXB0aCBtYXBcbiAqXG4gKiBVc2FnZVxuICogPT09PT1cbiAqIENyZWF0ZSBhIHBsYW5lIGluIEJsZW5kZXIgYW5kIGdpdmUgaXQgYSBtYXRlcmlhbCAoanVzdCB0aGUgZGVmYXVsdCBQcmluY2lwbGVkIEJTREYpLlxuICogQXNzaWduIGNvbG9yIGltYWdlIHRvIFwiY29sb3JcIiBjaGFubmVsIGFuZCBkZXB0aCBtYXAgdG8gXCJlbWlzc2l2ZVwiIGNoYW5uZWwuXG4gKiBZb3UgbWF5IHdhbnQgdG8gc2V0IGVtaXNzaXZlIHN0cmVuZ3RoIHRvIHplcm8gc28gdGhlIHByZXZpZXcgbG9va3MgYmV0dGVyLlxuICogQWRkIHRoZSBcInBhcmFsbGF4XCIgY29tcG9uZW50IGZyb20gdGhlIEh1YnMgZXh0ZW5zaW9uLCBjb25maWd1cmUsIGFuZCBleHBvcnQgYXMgLmdsYlxuICovXG5cbmltcG9ydCB7IFBhcmFsbGF4U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMnXG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4Jywge1xuICBzY2hlbWE6IHtcbiAgICBzdHJlbmd0aDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC41IH0sXG4gICAgY3V0b2ZmVHJhbnNpdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDggfSxcbiAgICBjdXRvZmZBbmdsZTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDQgfSxcbiAgfSxcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBjb25zdCB7IG1hcDogY29sb3JNYXAsIGVtaXNzaXZlTWFwOiBkZXB0aE1hcCB9ID0gbWVzaC5tYXRlcmlhbFxuICAgIGNvbG9yTWFwLndyYXBTID0gY29sb3JNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgZGVwdGhNYXAud3JhcFMgPSBkZXB0aE1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBjb25zdCB7IHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIgfSA9IFBhcmFsbGF4U2hhZGVyXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICBmcmFnbWVudFNoYWRlcixcbiAgICAgIGRlZmluZXM6IHsgVVNFX09DTFVTSU9OX1BBUkFMTEFYOiB0cnVlIH0sXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBtYXA6IHsgdmFsdWU6IGNvbG9yTWFwIH0sXG4gICAgICAgIGJ1bXBNYXA6IHsgdmFsdWU6IGRlcHRoTWFwIH0sXG4gICAgICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IC0xICogdGhpcy5kYXRhLnN0cmVuZ3RoIH0sXG4gICAgICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiAyMCB9LFxuICAgICAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogMzAgfSxcbiAgICAgICAgZmFkZTogeyB2YWx1ZTogMCB9LFxuICAgICAgfSxcbiAgICB9KVxuICAgIG1lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgaWYgKHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEpIHtcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih2ZWMpXG4gICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh2ZWMpXG4gICAgICBjb25zdCBhbmdsZSA9IHZlYy5hbmdsZVRvKGZvcndhcmQpXG4gICAgICBjb25zdCBmYWRlID0gbWFwTGluZWFyQ2xhbXBlZChcbiAgICAgICAgYW5nbGUsXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSAtIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgKyB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgMCwgLy8gSW4gdmlldyB6b25lLCBubyBmYWRlXG4gICAgICAgIDEgLy8gT3V0c2lkZSB2aWV3IHpvbmUsIGZ1bGwgZmFkZVxuICAgICAgKVxuICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5mYWRlLnZhbHVlID0gZmFkZVxuICAgIH1cbiAgfSxcbn0pXG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBiMSArICgoeCAtIGExKSAqIChiMiAtIGIxKSkgLyAoYTIgLSBhMSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyQ2xhbXBlZCh4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gY2xhbXAobWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSwgYjEsIGIyKVxufVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGNyZWF0ZSBhIEhUTUwgb2JqZWN0IGJ5IHJlbmRlcmluZyBhIHNjcmlwdCB0aGF0IGNyZWF0ZXMgYW5kIG1hbmFnZXMgaXRcbiAqXG4gKi9cbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcbmltcG9ydCAqIGFzIGh0bWxDb21wb25lbnRzIGZyb20gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIjtcblxuLy8gdmFyIGh0bWxDb21wb25lbnRzO1xuLy8gdmFyIHNjcmlwdFByb21pc2U7XG4vLyBpZiAod2luZG93Ll9fdGVzdGluZ1Z1ZUFwcHMpIHtcbi8vICAgICBzY3JpcHRQcm9taXNlID0gaW1wb3J0KHdpbmRvdy5fX3Rlc3RpbmdWdWVBcHBzKSAgICBcbi8vIH0gZWxzZSB7XG4vLyAgICAgc2NyaXB0UHJvbWlzZSA9IGltcG9ydChcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiKSBcbi8vIH1cbi8vIC8vIHNjcmlwdFByb21pc2UgPSBzY3JpcHRQcm9taXNlLnRoZW4obW9kdWxlID0+IHtcbi8vIC8vICAgICByZXR1cm4gbW9kdWxlXG4vLyAvLyB9KTtcbi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG4gQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdodG1sLXNjcmlwdCcsIHsgIFxuICAgIGluaXQoKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtVGljayA9IGh0bWxDb21wb25lbnRzW1wic3lzdGVtVGlja1wiXTtcbiAgICAgICAgdGhpcy5pbml0aWFsaXplRXRoZXJlYWwgPSBodG1sQ29tcG9uZW50c1tcImluaXRpYWxpemVFdGhlcmVhbFwiXVxuICAgICAgICBpZiAoIXRoaXMuc3lzdGVtVGljayB8fCAhdGhpcy5pbml0aWFsaXplRXRoZXJlYWwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJlcnJvciBpbiBodG1sLXNjcmlwdCBzeXN0ZW06IGh0bWxDb21wb25lbnRzIGhhcyBubyBzeXN0ZW1UaWNrIGFuZC9vciBpbml0aWFsaXplRXRoZXJlYWwgbWV0aG9kc1wiKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplRXRoZXJlYWwoKVxuICAgICAgICB9XG4gICAgfSxcbiAgXG4gICAgdGljayh0LCBkdCkge1xuICAgICAgICB0aGlzLnN5c3RlbVRpY2sodCwgZHQpXG4gICAgfSxcbiAgfSlcbiAgXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gXCIqX2NvbXBvbmVudE5hbWVcIlxuICAgICAgICBuYW1lOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuXG4gICAgICAgIGlmICghdGhpcy5mdWxsTmFtZSB8fCB0aGlzLmZ1bGxOYW1lLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHRoaXMuZnVsbE5hbWVcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKGV2KSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKVxuICAgICAgICB9KTtcblxuICAgICAgICAvL3RoaXMuY3JlYXRlU2NyaXB0KCk7XG4gICAgfSxcblxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLm5hbWUgPT09IFwiXCIgfHwgdGhpcy5kYXRhLm5hbWUgPT09IHRoaXMuZnVsbE5hbWUpIHJldHVyblxuXG4gICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcbiAgICAgICAgLy8gdGhpcy5wYXJzZU5vZGVOYW1lKCk7XG4gICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHRoaXMuZnVsbE5hbWU7XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveVNjcmlwdCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgY3JlYXRlU2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGVhY2ggdGltZSB3ZSBsb2FkIGEgc2NyaXB0IGNvbXBvbmVudCB3ZSB3aWxsIHBvc3NpYmx5IGNyZWF0ZVxuICAgICAgICAvLyBhIG5ldyBuZXR3b3JrZWQgY29tcG9uZW50LiAgVGhpcyBpcyBmaW5lLCBzaW5jZSB0aGUgbmV0d29ya2VkIElkIFxuICAgICAgICAvLyBpcyBiYXNlZCBvbiB0aGUgZnVsbCBuYW1lIHBhc3NlZCBhcyBhIHBhcmFtZXRlciwgb3IgYXNzaWduZWQgdG8gdGhlXG4gICAgICAgIC8vIGNvbXBvbmVudCBpbiBTcG9rZS4gIEl0IGRvZXMgbWVhbiB0aGF0IGlmIHdlIGhhdmVcbiAgICAgICAgLy8gbXVsdGlwbGUgb2JqZWN0cyBpbiB0aGUgc2NlbmUgd2hpY2ggaGF2ZSB0aGUgc2FtZSBuYW1lLCB0aGV5IHdpbGxcbiAgICAgICAgLy8gYmUgaW4gc3luYy4gIEl0IGFsc28gbWVhbnMgdGhhdCBpZiB5b3Ugd2FudCB0byBkcm9wIGEgY29tcG9uZW50IG9uXG4gICAgICAgIC8vIHRoZSBzY2VuZSB2aWEgYSAuZ2xiLCBpdCBtdXN0IGhhdmUgYSB2YWxpZCBuYW1lIHBhcmFtZXRlciBpbnNpZGUgaXQuXG4gICAgICAgIC8vIEEgLmdsYiBpbiBzcG9rZSB3aWxsIGZhbGwgYmFjayB0byB0aGUgc3Bva2UgbmFtZSBpZiB5b3UgdXNlIG9uZSB3aXRob3V0XG4gICAgICAgIC8vIGEgbmFtZSBpbnNpZGUgaXQuXG4gICAgICAgIGxldCBsb2FkZXIgPSAoKSA9PiB7XG5cbiAgICAgICAgICAgIHRoaXMubG9hZFNjcmlwdCgpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc2NyaXB0KSByZXR1cm5cblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBhcmVudCBuZXR3b3JrZWQgZW50aXR5LCB3aGVuIGl0J3MgZmluaXNoZWQgaW5pdGlhbGl6aW5nLiAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gY3JlYXRpbmcgdGhpcyBhcyBwYXJ0IG9mIGEgR0xURiBsb2FkLCB0aGUgXG4gICAgICAgICAgICAgICAgICAgIC8vIHBhcmVudCBhIGZldyBzdGVwcyB1cCB3aWxsIGJlIG5ldHdvcmtlZC4gIFdlJ2xsIG9ubHkgZG8gdGhpc1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgSFRNTCBzY3JpcHQgd2FudHMgdG8gYmUgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gbnVsbFxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGJpbmQgY2FsbGJhY2tzXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRha2VPd25lcnNoaXAgPSB0aGlzLnRha2VPd25lcnNoaXAuYmluZCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhID0gdGhpcy5zZXRTaGFyZWREYXRhLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5zZXROZXR3b3JrTWV0aG9kcyh0aGlzLnRha2VPd25lcnNoaXAsIHRoaXMuc2V0U2hhcmVkRGF0YSlcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBzZXQgdXAgdGhlIGxvY2FsIGNvbnRlbnQgYW5kIGhvb2sgaXQgdG8gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgY29uc3Qgc2NyaXB0RWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBzY3JpcHRFbFxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0T2JqZWN0M0QoXCJ3ZWJsYXllcjNkXCIsIHRoaXMuc2NyaXB0LndlYkxheWVyM0QpXG5cbiAgICAgICAgICAgICAgICAvLyBsZXRzIGZpZ3VyZSBvdXQgdGhlIHNjYWxlLCBidXQgc2NhbGluZyB0byBmaWxsIHRoZSBhIDF4MW0gc3F1YXJlLCB0aGF0IGhhcyBhbHNvXG4gICAgICAgICAgICAgICAgLy8gcG90ZW50aWFsbHkgYmVlbiBzY2FsZWQgYnkgdGhlIHBhcmVudHMgcGFyZW50IG5vZGUuIElmIHdlIHNjYWxlIHRoZSBlbnRpdHkgaW4gc3Bva2UsXG4gICAgICAgICAgICAgICAgLy8gdGhpcyBpcyB3aGVyZSB0aGUgc2NhbGUgaXMgc2V0LiAgSWYgd2UgZHJvcCBhIG5vZGUgaW4gYW5kIHNjYWxlIGl0LCB0aGUgc2NhbGUgaXMgYWxzb1xuICAgICAgICAgICAgICAgIC8vIHNldCB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyBXZSB1c2VkIHRvIGhhdmUgYSBmaXhlZCBzaXplIHBhc3NlZCBiYWNrIGZyb20gdGhlIGVudGl0eSwgYnV0IHRoYXQncyB0b28gcmVzdHJpY3RpdmU6XG4gICAgICAgICAgICAgICAgLy8gY29uc3Qgd2lkdGggPSB0aGlzLnNjcmlwdC53aWR0aFxuICAgICAgICAgICAgICAgIC8vIGNvbnN0IGhlaWdodCA9IHRoaXMuc2NyaXB0LmhlaWdodFxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogbmVlZCB0byBmaW5kIGVudmlyb25tZW50LXNjZW5lLCBnbyBkb3duIHR3byBsZXZlbHMgdG8gdGhlIGdyb3VwIGFib3ZlIFxuICAgICAgICAgICAgICAgIC8vIHRoZSBub2RlcyBpbiB0aGUgc2NlbmUuICBUaGVuIGFjY3VtdWxhdGUgdGhlIHNjYWxlcyB1cCBmcm9tIHRoaXMgbm9kZSB0b1xuICAgICAgICAgICAgICAgIC8vIHRoYXQgbm9kZS4gIFRoaXMgd2lsbCBhY2NvdW50IGZvciBncm91cHMsIGFuZCBuZXN0aW5nLlxuXG4gICAgICAgICAgICAgICAgdmFyIHdpZHRoID0gMSwgaGVpZ2h0ID0gMTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtaW1hZ2VcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXR0YWNoZWQgdG8gYW4gaW1hZ2UgaW4gc3Bva2UsIHNvIHRoZSBpbWFnZSBtZXNoIGlzIHNpemUgMSBhbmQgaXMgc2NhbGVkIGRpcmVjdGx5XG4gICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVJID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS56ID0gMVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBpdCdzIGVtYmVkZGVkIGluIGEgc2ltcGxlIGdsdGYgbW9kZWw7ICBvdGhlciBtb2RlbHMgbWF5IG5vdCB3b3JrXG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGFzc3VtZSBpdCdzIGF0IHRoZSB0b3AgbGV2ZWwgbWVzaCwgYW5kIHRoYXQgdGhlIG1vZGVsIGl0c2VsZiBpcyBzY2FsZWRcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXVxuICAgICAgICAgICAgICAgICAgICBpZiAobWVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGJveCA9IG1lc2guZ2VvbWV0cnkuYm91bmRpbmdCb3g7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IChib3gubWF4LnggLSBib3gubWluLngpICogbWVzaC5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSAoYm94Lm1heC55IC0gYm94Lm1pbi55KSAqIG1lc2guc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2hTY2FsZSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gbWVzaFNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IG1lc2hTY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSB0aGUgcm9vdCBnbHRmIHNjYWxlLlxuICAgICAgICAgICAgICAgICAgICB2YXIgcGFyZW50MiA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwub2JqZWN0M0RcbiAgICAgICAgICAgICAgICAgICAgd2lkdGggKj0gcGFyZW50Mi5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCAqPSBwYXJlbnQyLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHdpZHRoID4gMCAmJiBoZWlnaHQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHt3aWR0aDogd3NpemUsIGhlaWdodDogaHNpemV9ID0gdGhpcy5zY3JpcHQuZ2V0U2l6ZSgpXG4gICAgICAgICAgICAgICAgICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHdpZHRoIC8gd3NpemUsIGhlaWdodCAvIGhzaXplKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyB0aGVyZSB3aWxsIGJlIG9uZSBlbGVtZW50IGFscmVhZHksIHRoZSBjdWJlIHdlIGNyZWF0ZWQgaW4gYmxlbmRlclxuICAgICAgICAgICAgICAgIC8vIGFuZCBhdHRhY2hlZCB0aGlzIGNvbXBvbmVudCB0bywgc28gcmVtb3ZlIGl0IGlmIGl0IGlzIHRoZXJlLlxuICAgICAgICAgICAgICAgIC8vIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4ucG9wKClcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5lbC5vYmplY3QzRC5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICBjLnZpc2libGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBtYWtlIHN1cmUgXCJpc1N0YXRpY1wiIGlzIGNvcnJlY3Q7ICBjYW4ndCBiZSBzdGF0aWMgaWYgZWl0aGVyIGludGVyYWN0aXZlIG9yIG5ldHdvcmtlZFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc1N0YXRpYyAmJiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSB8fCB0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuaXNTdGF0aWMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gYWRkIGluIG91ciBjb250YWluZXJcbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFwcGVuZENoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogIHdlIGFyZSBnb2luZyB0byBoYXZlIHRvIG1ha2Ugc3VyZSB0aGlzIHdvcmtzIGlmIFxuICAgICAgICAgICAgICAgIC8vIHRoZSBzY3JpcHQgaXMgT04gYW4gaW50ZXJhY3RhYmxlIChsaWtlIGFuIGltYWdlKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gbWFrZSB0aGUgaHRtbCBvYmplY3QgY2xpY2thYmxlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcblxuICAgICAgICAgICAgICAgICAgICAvLyBmb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgb2JqZWN0IFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsaWNrZWQgPSB0aGlzLmNsaWNrZWQuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNEcmFnZ2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGFyZW4ndCBnb2luZyB0byByZWFsbHkgZGVhbCB3aXRoIHRoaXMgdGlsbCB3ZSBoYXZlIGEgdXNlIGNhc2UsIGJ1dFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgY2FuIHNldCBpdCB1cCBmb3Igbm93XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0hvbGRhYmxlOiB0cnVlLCAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaG9sZGFibGVCdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLWRvd24nLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ1N0YXJ0KGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tdXAnLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ0VuZChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLnJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TCA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5UiA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG5vIGludGVyYWN0aXZpdHksIHBsZWFzZVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBTSE9VTEQgd29yayBidXQgbWFrZSBzdXJlIGl0IHdvcmtzIGlmIHRoZSBlbCB3ZSBhcmUgb25cbiAgICAgICAgICAgICAgICAvLyBpcyBuZXR3b3JrZWQsIHN1Y2ggYXMgd2hlbiBhdHRhY2hlZCB0byBhbiBpbWFnZVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuaGFzQXR0cmlidXRlKFwibmV0d29ya2VkXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwibmV0d29ya2VkXCIpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gZmluZHMgYW4gZXhpc3RpbmcgY29weSBvZiB0aGUgTmV0d29ya2VkIEVudGl0eSAoaWYgd2UgYXJlIG5vdCB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gZmlyc3QgY2xpZW50IGluIHRoZSByb29tIGl0IHdpbGwgZXhpc3QgaW4gb3RoZXIgY2xpZW50cyBhbmQgYmUgY3JlYXRlZCBieSBOQUYpXG4gICAgICAgICAgICAgICAgICAgIC8vIG9yIGNyZWF0ZSBhbiBlbnRpdHkgaWYgd2UgYXJlIGZpcnN0LlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gZnVuY3Rpb24gKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGVyc2lzdGVudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV0SWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIGJlIHBhcnQgb2YgYSBOZXR3b3JrZWQgR0xURiBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvciBwaW5uZWQgYW5kIGxvYWRlZCB3aGVuIHdlIGVudGVyIHRoZSByb29tLiAgVXNlIHRoZSBuZXR3b3JrZWQgcGFyZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBwbHVzIGEgZGlzYW1iaWd1YXRpbmcgYml0IG9mIHRleHQgdG8gY3JlYXRlIGEgdW5pcXVlIElkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gTkFGLnV0aWxzLmdldE5ldHdvcmtJZChuZXR3b3JrZWRFbCkgKyBcIi1odG1sLXNjcmlwdFwiO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgbmVlZCB0byBjcmVhdGUgYW4gZW50aXR5LCB1c2UgdGhlIHNhbWUgcGVyc2lzdGVuY2UgYXMgb3VyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29yayBlbnRpdHkgKHRydWUgaWYgcGlubmVkLCBmYWxzZSBpZiBub3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudCA9IGVudGl0eS5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLnBlcnNpc3RlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgb25seSBoYXBwZW5zIGlmIHRoaXMgY29tcG9uZW50IGlzIG9uIGEgc2NlbmUgZmlsZSwgc2luY2UgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZWxlbWVudHMgb24gdGhlIHNjZW5lIGFyZW4ndCBuZXR3b3JrZWQuICBTbyBsZXQncyBhc3N1bWUgZWFjaCBlbnRpdHkgaW4gdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2NlbmUgd2lsbCBoYXZlIGEgdW5pcXVlIG5hbWUuICBBZGRpbmcgYSBiaXQgb2YgdGV4dCBzbyB3ZSBjYW4gZmluZCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluIHRoZSBET00gd2hlbiBkZWJ1Z2dpbmcuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSB0aGlzLmZ1bGxOYW1lLnJlcGxhY2VBbGwoXCJfXCIsXCItXCIpICsgXCItaHRtbC1zY3JpcHRcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgbmV0d29ya2VkIGVudGl0eSB3ZSBjcmVhdGUgZm9yIHRoaXMgY29tcG9uZW50IGFscmVhZHkgZXhpc3RzLiBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgY3JlYXRlIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAtIE5PVEU6IGl0IGlzIGNyZWF0ZWQgb24gdGhlIHNjZW5lLCBub3QgYXMgYSBjaGlsZCBvZiB0aGlzIGVudGl0eSwgYmVjYXVzZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBOQUYgY3JlYXRlcyByZW1vdGUgZW50aXRpZXMgaW4gdGhlIHNjZW5lLlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChOQUYuZW50aXRpZXMuaGFzRW50aXR5KG5ldElkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IE5BRi5lbnRpdGllcy5nZXRFbnRpdHkobmV0SWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWV0aG9kIHRvIHJldHJpZXZlIHRoZSBzY3JpcHQgZGF0YSBvbiB0aGlzIGVudGl0eVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIFwibmV0d29ya2VkXCIgY29tcG9uZW50IHNob3VsZCBoYXZlIHBlcnNpc3RlbnQ9dHJ1ZSwgdGhlIHRlbXBsYXRlIGFuZCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgc2V0LCBvd25lciBzZXQgdG8gXCJzY2VuZVwiIChzbyB0aGF0IGl0IGRvZXNuJ3QgdXBkYXRlIHRoZSByZXN0IG9mXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHdvcmxkIHdpdGggaXQncyBpbml0aWFsIGRhdGEsIGFuZCBzaG91bGQgTk9UIHNldCBjcmVhdG9yICh0aGUgc3lzdGVtIHdpbGwgZG8gdGhhdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuc2V0QXR0cmlidXRlKCduZXR3b3JrZWQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlOiBcIiNzY3JpcHQtZGF0YS1tZWRpYVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50OiBwZXJzaXN0ZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvd25lcjogXCJzY2VuZVwiLCAgLy8gc28gdGhhdCBvdXIgaW5pdGlhbCB2YWx1ZSBkb2Vzbid0IG92ZXJ3cml0ZSBvdGhlcnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya0lkOiBuZXRJZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hcHBlbmRDaGlsZChlbnRpdHkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzYXZlIGEgcG9pbnRlciB0byB0aGUgbmV0d29ya2VkIGVudGl0eSBhbmQgdGhlbiB3YWl0IGZvciBpdCB0byBiZSBmdWxseVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW5pdGlhbGl6ZWQgYmVmb3JlIGdldHRpbmcgYSBwb2ludGVyIHRvIHRoZSBhY3R1YWwgbmV0d29ya2VkIGNvbXBvbmVudCBpbiBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMubmV0RW50aXR5KS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlU3luYyA9IG5ldHdvcmtlZEVsLmNvbXBvbmVudHNbXCJzY3JpcHQtZGF0YVwiXVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyB0aGUgZmlyc3QgbmV0d29ya2VkIGVudGl0eSwgaXQncyBzaGFyZWREYXRhIHdpbGwgZGVmYXVsdCB0byB0aGUgZW1wdHkgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RyaW5nLCBhbmQgd2Ugc2hvdWxkIGluaXRpYWxpemUgaXQgd2l0aCB0aGUgaW5pdGlhbCBkYXRhIGZyb20gdGhlIHNjcmlwdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5zaGFyZWREYXRhID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBuZXR3b3JrZWQgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wibmV0d29ya2VkXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIChuZXR3b3JrZWQuZGF0YS5jcmVhdG9yID09IE5BRi5jbGllbnRJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgdGhpcy5zdGF0ZVN5bmMuaW5pdFNoYXJlZERhdGEodGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5lbCkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eShuZXR3b3JrZWRFbClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IHRoaXMuc2V0dXBOZXR3b3JrZWQuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWV0aG9kIGhhbmRsZXMgdGhlIGRpZmZlcmVudCBzdGFydHVwIGNhc2VzOlxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZSwgTkFGIHdpbGwgYmUgY29ubmVjdGVkIGFuZCB3ZSBjYW4gXG4gICAgICAgICAgICAgICAgICAgIC8vICAgaW1tZWRpYXRlbHkgaW5pdGlhbGl6ZVxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIGlzIGluIHRoZSByb29tIHNjZW5lIG9yIHBpbm5lZCwgaXQgd2lsbCBsaWtlbHkgYmUgY3JlYXRlZFxuICAgICAgICAgICAgICAgICAgICAvLyAgIGJlZm9yZSBOQUYgaXMgc3RhcnRlZCBhbmQgY29ubmVjdGVkLCBzbyB3ZSB3YWl0IGZvciBhbiBldmVudCB0aGF0IGlzXG4gICAgICAgICAgICAgICAgICAgIC8vICAgZmlyZWQgd2hlbiBIdWJzIGhhcyBzdGFydGVkIE5BRlxuICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmNvbm5lY3Rpb24gJiYgTkFGLmNvbm5lY3Rpb24uaXNDb25uZWN0ZWQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2RpZENvbm5lY3RUb05ldHdvcmtlZFNjZW5lJywgdGhpcy5zZXR1cE5ldHdvcmtlZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgYXR0YWNoZWQgdG8gYSBub2RlIHdpdGggYSBtZWRpYS1sb2FkZXIgY29tcG9uZW50LCB0aGlzIG1lYW5zIHdlIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50XG4gICAgICAgIC8vIHRvIGEgbWVkaWEgb2JqZWN0IGluIFNwb2tlLiAgV2Ugc2hvdWxkIHdhaXQgdGlsbCB0aGUgb2JqZWN0IGlzIGZ1bGx5IGxvYWRlZC4gIFxuICAgICAgICAvLyBPdGhlcndpc2UsIGl0IHdhcyBhdHRhY2hlZCB0byBzb21ldGhpbmcgaW5zaWRlIGEgR0xURiAocHJvYmFibHkgaW4gYmxlbmRlcilcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQucGxheSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wYXVzZSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaGFuZGxlIFwiaW50ZXJhY3RcIiBldmVudHMgZm9yIGNsaWNrYWJsZSBlbnRpdGllc1xuICAgIGNsaWNrZWQ6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICB0aGlzLnNjcmlwdC5jbGlja2VkKGV2dCkgXG4gICAgfSxcbiAgXG4gICAgLy8gbWV0aG9kcyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIHRoZSBodG1sIG9iamVjdCBzbyB0aGV5IGNhbiB1cGRhdGUgbmV0d29ya2VkIGRhdGFcbiAgICB0YWtlT3duZXJzaGlwOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMudGFrZU93bmVyc2hpcCgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIHN1cmUsIGdvIGFoZWFkIGFuZCBjaGFuZ2UgaXQgZm9yIG5vd1xuICAgICAgICB9XG4gICAgfSxcbiAgICBcbiAgICBzZXRTaGFyZWREYXRhOiBmdW5jdGlvbihkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnNldFNoYXJlZERhdGEoZGF0YU9iamVjdClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyB0aGlzIGlzIGNhbGxlZCBmcm9tIGJlbG93LCB0byBnZXQgdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICBnZXRTaGFyZWREYXRhOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICAgICAgLy8gc2hvdWxkbid0IGhhcHBlblxuICAgICAgICBjb25zb2xlLndhcm4oXCJzY3JpcHQtZGF0YSBjb21wb25lbnQgY2FsbGVkIHBhcmVudCBlbGVtZW50IGJ1dCB0aGVyZSBpcyBubyBzY3JpcHQgeWV0P1wiKVxuICAgICAgICByZXR1cm4gXCJ7fVwiXG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAvLyBtb3JlIG9yIGxlc3MgY29waWVkIGZyb20gXCJob3ZlcmFibGUtdmlzdWFscy5qc1wiIGluIGh1YnNcbiAgICAgICAgICAgIGNvbnN0IHRvZ2dsaW5nID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXNbXCJodWJzLXN5c3RlbXNcIl0uY3Vyc29yVG9nZ2xpbmdTeXN0ZW07XG4gICAgICAgICAgICB2YXIgcGFzc3RocnVJbnRlcmFjdG9yID0gW11cblxuICAgICAgICAgICAgbGV0IGludGVyYWN0b3JPbmUsIGludGVyYWN0b3JUd287XG4gICAgICAgICAgICBjb25zdCBpbnRlcmFjdGlvbiA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLmludGVyYWN0aW9uO1xuICAgICAgICAgICAgaWYgKCFpbnRlcmFjdGlvbi5yZWFkeSkgcmV0dXJuOyAvL0RPTUNvbnRlbnRSZWFkeSB3b3JrYXJvdW5kXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGxldCBob3ZlckVsID0gdGhpcy5zaW1wbGVDb250YWluZXJcbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRIYW5kLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgIXRvZ2dsaW5nLmxlZnRUb2dnbGVkT2ZmXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rvck9uZSkge1xuICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yT25lLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgbGV0IGRpciA9IHRoaXMuc2NyaXB0LndlYkxheWVyM0QuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkubmVnYXRlKClcbiAgICAgICAgICAgICAgICBwb3MuYWRkU2NhbGVkVmVjdG9yKGRpciwgLTAuMSlcbiAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TC5zZXQocG9zLCBkaXIpXG5cbiAgICAgICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaCh0aGlzLmhvdmVyUmF5TClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgICAhdG9nZ2xpbmcucmlnaHRUb2dnbGVkT2ZmXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3RvclR3bykge1xuICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yVHdvLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgbGV0IGRpciA9IHRoaXMuc2NyaXB0LndlYkxheWVyM0QuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkubmVnYXRlKClcbiAgICAgICAgICAgICAgICBwb3MuYWRkU2NhbGVkVmVjdG9yKGRpciwgLTAuMSlcbiAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5Ui5zZXQocG9zLCBkaXIpXG4gICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheVIpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QuaW50ZXJhY3Rpb25SYXlzID0gcGFzc3RocnVJbnRlcmFjdG9yXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmVuJ3QgZmluaXNoZWQgc2V0dGluZyB1cCB0aGUgbmV0d29ya2VkIGVudGl0eSBkb24ndCBkbyBhbnl0aGluZy5cbiAgICAgICAgICAgIGlmICghdGhpcy5uZXRFbnRpdHkgfHwgIXRoaXMuc3RhdGVTeW5jKSB7IHJldHVybiB9XG5cbiAgICAgICAgICAgIC8vIGlmIHRoZSBzdGF0ZSBoYXMgY2hhbmdlZCBpbiB0aGUgbmV0d29ya2VkIGRhdGEsIHVwZGF0ZSBvdXIgaHRtbCBvYmplY3RcbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCA9IGZhbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQudXBkYXRlU2hhcmVkRGF0YSh0aGlzLnN0YXRlU3luYy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zY3JpcHQudGljayh0aW1lKVxuICAgIH0sXG4gIFxuICAgIC8vIFRPRE86ICBzaG91bGQgb25seSBiZSBjYWxsZWQgaWYgdGhlcmUgaXMgbm8gcGFyYW1ldGVyIHNwZWNpZnlpbmcgdGhlXG4gICAgLy8gaHRtbCBzY3JpcHQgbmFtZS5cbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmZ1bGxOYW1lID09PSBcIlwiKSB7XG5cbiAgICAgICAgICAgIC8vIFRPRE86ICBzd2l0Y2ggdGhpcyB0byBmaW5kIGVudmlyb25tZW50LXJvb3QgYW5kIGdvIGRvd24gdG8gXG4gICAgICAgICAgICAvLyB0aGUgbm9kZSBhdCB0aGUgcm9vbSBvZiBzY2VuZSAob25lIGFib3ZlIHRoZSB2YXJpb3VzIG5vZGVzKS4gIFxuICAgICAgICAgICAgLy8gdGhlbiBnbyB1cCBmcm9tIGhlcmUgdGlsbCB3ZSBnZXQgdG8gYSBub2RlIHRoYXQgaGFzIHRoYXQgbm9kZVxuICAgICAgICAgICAgLy8gYXMgaXQncyBwYXJlbnRcbiAgICAgICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgICAgICB9IFxuXG4gICAgICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggXG4gICAgICAgIC8vICBcImNvbXBvbmVudE5hbWVcIlxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuICBUaGlzIHdpbGwgZmV0Y2ggdGhlIGNvbXBvbmVudCBmcm9tIHRoZSByZXNvdXJjZVxuICAgICAgICAvLyBjb21wb25lbnROYW1lXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMuZnVsbE5hbWUubWF0Y2goL18oW0EtWmEtejAtOV0qKSQvKVxuXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiAzLCBmaXJzdCBtYXRjaCBpcyB0aGUgZGlyLFxuICAgICAgICAvLyBzZWNvbmQgaXMgdGhlIGNvbXBvbmVudE5hbWUgbmFtZSBvciBudW1iZXJcbiAgICAgICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcImh0bWwtc2NyaXB0IGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLmZ1bGxOYW1lKVxuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gbnVsbFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gcGFyYW1zWzFdXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgbG9hZFNjcmlwdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBpZiAoc2NyaXB0UHJvbWlzZSkge1xuICAgICAgICAvLyAgICAgdHJ5IHtcbiAgICAgICAgLy8gICAgICAgICBodG1sQ29tcG9uZW50cyA9IGF3YWl0IHNjcmlwdFByb21pc2U7XG4gICAgICAgIC8vICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgLy8gICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAvLyAgICAgICAgIHJldHVyblxuICAgICAgICAvLyAgICAgfVxuICAgICAgICAvLyAgICAgc2NyaXB0UHJvbWlzZSA9IG51bGxcbiAgICAgICAgLy8gfVxuICAgICAgICB2YXIgaW5pdFNjcmlwdCA9IGh0bWxDb21wb25lbnRzW3RoaXMuY29tcG9uZW50TmFtZV1cbiAgICAgICAgaWYgKCFpbml0U2NyaXB0KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBkb2Vzbid0IGhhdmUgc2NyaXB0IGZvciBcIiArIHRoaXMuY29tcG9uZW50TmFtZSk7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcmlwdCA9IGluaXRTY3JpcHQoKVxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpe1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudXBkYXRlKHRydWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBmYWlsZWQgdG8gaW5pdGlhbGl6ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBkZXN0cm95U2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVsLnJlbW92ZUNoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IG51bGxcblxuICAgICAgICB0aGlzLnNjcmlwdC5kZXN0cm95KClcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgfVxufSlcblxuLy9cbi8vIENvbXBvbmVudCBmb3Igb3VyIG5ldHdvcmtlZCBzdGF0ZS4gIFRoaXMgY29tcG9uZW50IGRvZXMgbm90aGluZyBleGNlcHQgYWxsIHVzIHRvIFxuLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4vLyBzb21ldGhpbmcgaGFzIGNoYW5nZWQsIGluc3RlYWQgb2YgaGF2aW5nIHRoZSBjb21wb25lbnQgYWJvdmUgcG9sbCBlYWNoIGZyYW1lLlxuLy9cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzY3JpcHQtZGF0YScsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2NyaXB0ZGF0YToge3R5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwie31cIn0sXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB0aGlzLmVsLmdldFNoYXJlZERhdGEoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgdGhpcy5zaGFyZWREYXRhKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgZW5jb2RlIGluaXRpYWwgc2NyaXB0IGRhdGEgb2JqZWN0OiBcIiwgZSwgdGhpcy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9IGZhbHNlO1xuICAgIH0sXG5cbiAgICB1cGRhdGUoKSB7XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9ICEodGhpcy5zaGFyZWREYXRhID09PSB0aGlzLmRhdGEuc2NyaXB0ZGF0YSk7XG4gICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodGhpcy5kYXRhLnNjcmlwdGRhdGEpKVxuXG4gICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB0aGlzLmRhdGEuc2NyaXB0ZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY291bGRuJ3QgcGFyc2UgSlNPTiByZWNlaXZlZCBpbiBzY3JpcHQtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJcIlxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaXQgaXMgbGlrZWx5IHRoYXQgYXBwbHlQZXJzaXN0ZW50U3luYyBvbmx5IG5lZWRzIHRvIGJlIGNhbGxlZCBmb3IgcGVyc2lzdGVudFxuICAgIC8vIG5ldHdvcmtlZCBlbnRpdGllcywgc28gd2UgX3Byb2JhYmx5XyBkb24ndCBuZWVkIHRvIGRvIHRoaXMuICBCdXQgaWYgdGhlcmUgaXMgbm9cbiAgICAvLyBwZXJzaXN0ZW50IGRhdGEgc2F2ZWQgZnJvbSB0aGUgbmV0d29yayBmb3IgdGhpcyBlbnRpdHksIHRoaXMgY29tbWFuZCBkb2VzIG5vdGhpbmcuXG4gICAgcGxheSgpIHtcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgcmVhbGx5IG5lZWRlZCwgYnV0IGNhbid0IGh1cnRcbiAgICAgICAgICAgIGlmIChBUFAudXRpbHMpIHsgLy8gdGVtcG9yYXJ5IHRpbGwgd2Ugc2hpcCBuZXcgY2xpZW50XG4gICAgICAgICAgICAgICAgQVBQLnV0aWxzLmFwcGx5UGVyc2lzdGVudFN5bmModGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLm5ldHdvcmtJZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgdGFrZU93bmVyc2hpcCgpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG5cbiAgICAvLyBpbml0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgLy8gICAgIHRyeSB7XG4gICAgLy8gICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAvLyAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAvLyAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAvLyAgICAgICAgIHJldHVybiB0cnVlXG4gICAgLy8gICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAvLyAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAvLyAgICAgICAgIHJldHVybiBmYWxzZVxuICAgIC8vICAgICB9XG4gICAgLy8gfSxcblxuICAgIC8vIFRoZSBrZXkgcGFydCBpbiB0aGVzZSBtZXRob2RzICh3aGljaCBhcmUgY2FsbGVkIGZyb20gdGhlIGNvbXBvbmVudCBhYm92ZSkgaXMgdG9cbiAgICAvLyBjaGVjayBpZiB3ZSBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgdGhlIG5ldHdvcmtlZCBvYmplY3QuICBJZiB3ZSBvd24gaXQgKGlzTWluZSgpIGlzIHRydWUpXG4gICAgLy8gd2UgY2FuIGNoYW5nZSBpdC4gIElmIHdlIGRvbid0IG93biBpbiwgd2UgY2FuIHRyeSB0byBiZWNvbWUgdGhlIG93bmVyIHdpdGhcbiAgICAvLyB0YWtlT3duZXJzaGlwKCkuIElmIHRoaXMgc3VjY2VlZHMsIHdlIGNhbiBzZXQgdGhlIGRhdGEuICBcbiAgICAvL1xuICAgIC8vIE5PVEU6IHRha2VPd25lcnNoaXAgQVRURU1QVFMgdG8gYmVjb21lIHRoZSBvd25lciwgYnkgYXNzdW1pbmcgaXQgY2FuIGJlY29tZSB0aGVcbiAgICAvLyBvd25lciBhbmQgbm90aWZ5aW5nIHRoZSBuZXR3b3JrZWQgY29waWVzLiAgSWYgdHdvIG9yIG1vcmUgZW50aXRpZXMgdHJ5IHRvIGJlY29tZVxuICAgIC8vIG93bmVyLCAgb25seSBvbmUgKHRoZSBsYXN0IG9uZSB0byB0cnkpIGJlY29tZXMgdGhlIG93bmVyLiAgQW55IHN0YXRlIHVwZGF0ZXMgZG9uZVxuICAgIC8vIGJ5IHRoZSBcImZhaWxlZCBhdHRlbXB0ZWQgb3duZXJzXCIgd2lsbCBub3QgYmUgZGlzdHJpYnV0ZWQgdG8gdGhlIG90aGVyIGNsaWVudHMsXG4gICAgLy8gYW5kIHdpbGwgYmUgb3ZlcndyaXR0ZW4gKGV2ZW50dWFsbHkpIGJ5IHVwZGF0ZXMgZnJvbSB0aGUgb3RoZXIgY2xpZW50cy4gICBCeSBub3RcbiAgICAvLyBhdHRlbXB0aW5nIHRvIGd1YXJhbnRlZSBvd25lcnNoaXAsIHRoaXMgY2FsbCBpcyBmYXN0IGFuZCBzeW5jaHJvbm91cy4gIEFueSBcbiAgICAvLyBtZXRob2RzIGZvciBndWFyYW50ZWVpbmcgb3duZXJzaGlwIGNoYW5nZSB3b3VsZCB0YWtlIGEgbm9uLXRyaXZpYWwgYW1vdW50IG9mIHRpbWVcbiAgICAvLyBiZWNhdXNlIG9mIG5ldHdvcmsgbGF0ZW5jaWVzLlxuXG4gICAgc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdmFyIGh0bWxTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBodG1sU3RyaW5nXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCBodG1sU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSk7XG5cbi8vIEFkZCBvdXIgdGVtcGxhdGUgZm9yIG91ciBuZXR3b3JrZWQgb2JqZWN0IHRvIHRoZSBhLWZyYW1lIGFzc2V0cyBvYmplY3QsXG4vLyBhbmQgYSBzY2hlbWEgdG8gdGhlIE5BRi5zY2hlbWFzLiAgQm90aCBtdXN0IGJlIHRoZXJlIHRvIGhhdmUgY3VzdG9tIGNvbXBvbmVudHMgd29ya1xuXG5jb25zdCBhc3NldHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiYS1hc3NldHNcIik7XG5cbmFzc2V0cy5pbnNlcnRBZGphY2VudEhUTUwoXG4gICAgJ2JlZm9yZWVuZCcsXG4gICAgYFxuICAgIDx0ZW1wbGF0ZSBpZD1cInNjcmlwdC1kYXRhLW1lZGlhXCI+XG4gICAgICA8YS1lbnRpdHlcbiAgICAgICAgc2NyaXB0LWRhdGFcbiAgICAgID48L2EtZW50aXR5PlxuICAgIDwvdGVtcGxhdGU+XG4gIGBcbiAgKVxuXG5jb25zdCB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSA9IGVwc2lsb24gPT4ge1xuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRsZXQgcHJldiA9IG51bGw7XG5cdFx0XHRyZXR1cm4gY3VyciA9PiB7XG5cdFx0XHRcdGlmIChwcmV2ID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cHJldiA9IG5ldyBUSFJFRS5WZWN0b3IzKGN1cnIueCwgY3Vyci55LCBjdXJyLnopO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFOQUYudXRpbHMuYWxtb3N0RXF1YWxWZWMzKHByZXYsIGN1cnIsIGVwc2lsb24pKSB7XG5cdFx0XHRcdFx0cHJldi5jb3B5KGN1cnIpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH07XG5cdFx0fTtcblx0fTtcblxuTkFGLnNjaGVtYXMuYWRkKHtcbiAgXHR0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICBjb21wb25lbnRzOiBbXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwicm90YXRpb25cIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIC8vIHtcbiAgICAvLyAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgLy8gICAgIHByb3BlcnR5OiBcInNjYWxlXCIsXG4gICAgLy8gICAgIHJlcXVpcmVzTmV0d29ya1VwZGF0ZTogdmVjdG9yUmVxdWlyZXNVcGRhdGUoMC4wMDEpXG4gICAgLy8gfSxcbiAgICB7XG4gICAgICBcdGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgXHRwcm9wZXJ0eTogXCJzY3JpcHRkYXRhXCJcbiAgICB9XSxcbiAgICAgIG5vbkF1dGhvcml6ZWRDb21wb25lbnRzOiBbXG4gICAgICB7XG4gICAgICAgICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgICAgfVxuICAgIF0sXG5cbiAgfSk7XG5cbiIsImltcG9ydCAnLi4vc3lzdGVtcy9mYWRlci1wbHVzLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BvcnRhbC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BhcmFsbGF4LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzJ1xuXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnaW1tZXJzaXZlLTM2MCcsICdpbW1lcnNpdmUtMzYwJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCAncG9ydGFsJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdwYXJhbGxheCcsICdwYXJhbGxheCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCAnaHRtbC1zY3JpcHQnKVxuXG4vLyBkbyBhIHNpbXBsZSBtb25rZXkgcGF0Y2ggdG8gc2VlIGlmIGl0IHdvcmtzXG5cbi8vIHZhciBteWlzTWluZU9yTG9jYWwgPSBmdW5jdGlvbiAodGhhdCkge1xuLy8gICAgIHJldHVybiAhdGhhdC5lbC5jb21wb25lbnRzLm5ldHdvcmtlZCB8fCAodGhhdC5uZXR3b3JrZWRFbCAmJiBOQUYudXRpbHMuaXNNaW5lKHRoYXQubmV0d29ya2VkRWwpKTtcbi8vICB9XG5cbi8vICB2YXIgdmlkZW9Db21wID0gQUZSQU1FLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXVxuLy8gIHZpZGVvQ29tcC5Db21wb25lbnQucHJvdG90eXBlLmlzTWluZU9yTG9jYWwgPSBteWlzTWluZU9yTG9jYWw7Il0sIm5hbWVzIjpbIndvcmxkQ2FtZXJhIiwid29ybGRTZWxmIiwiZ2xzbCIsInZlcnRleFNoYWRlciIsInNub2lzZSIsImZyYWdtZW50U2hhZGVyIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRTtBQUNwQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFO0FBQ2xELElBQUksUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO0FBQzlDLElBQUksS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFO0FBQzlDLEdBQUc7QUFDSDtBQUNBLEVBQUUsSUFBSSxHQUFHO0FBQ1QsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJO0FBQy9CLE1BQU0sSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFO0FBQzdCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUM7QUFDbEMsUUFBUSxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLO0FBQzlCLFFBQVEsSUFBSSxFQUFFLEtBQUssQ0FBQyxRQUFRO0FBQzVCLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFDbEIsUUFBUSxXQUFXLEVBQUUsSUFBSTtBQUN6QixRQUFRLEdBQUcsRUFBRSxLQUFLO0FBQ2xCLE9BQU8sQ0FBQztBQUNSLE1BQUs7QUFDTCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDbkMsSUFBSSxJQUFJLENB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QUksQ0FBQyxNQUFNLElBQUksU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFDO0FBQ2pFLEdBQUc7QUFDSCxDQUFDOztBQ25CRCxNQUFNQyxNQUFJLEdBQUcsQ0FBQztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQSxNQUFNQSxNQUFJLEdBQUcsQ0FBQztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxNQUFJLEdBQUcsQ0FBQztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdHQTtBQUNBO0FBQ0E7QUFDTyxTQUFTLHlCQUF5QixDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUU7QUFDM0QsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksRUFBRSxDQUFDO0FBQ3RFLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNsRixJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZELENBQUM7QUFDRDtBQUNPLFNBQVMsMkJBQTJCLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRTtBQUM3RCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPO0FBQ3JGLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDeEc7O0FDWkE7QUFDQTtBQUNPLFNBQVMseUJBQXlCLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRTtBQUNqRSxJQUFJLE9BQU8sTUFBTSxJQUFJLEVBQUUsTUFBTSxDQUFDLFVBQVUsSUFBSSxNQUFNLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUU7QUFDL0UsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztBQUNqQyxLQUFLO0FBQ0wsSUFBSSxPQUFPLE1BQU0sQ0FBQztBQUNsQjs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUNBO0FBQ0EsSUFBSSxTQUFTLEdBQUcsUUFBTztBQUN2QixJQUFJLFNBQVMsR0FBRyxTQUFTLElBQUksRUFBRSxLQUFLLEVBQUU7QUFDdEMsSUFBSSxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsU0FBUTtBQUM1QixJQUFJLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxTQUFTLENBQUMsRUFBQztBQUNuRCxJQUFJLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxTQUFTLENBQUMsRUFBQztBQUNuRCxJQUFJLE9BQU8sU0FBUyxHQUFHLEVBQUUsR0FBRyxFQUFFO0FBQzlCLEVBQUM7QUFDRDtBQUNBLElBQUksWUFBWSxHQUFHLEdBQUU7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVMsaUJBQWlCLENBQUMsTUFBTSxFQUFFO0FBQ25DLElBQUksSUFBSSxTQUFTLEdBQUcsTUFBTSxDQUFDO0FBQzNCO0FBQ0EsSUFBSSxNQUFNLFNBQVMsSUFBSSxTQUFTLENBQUMsVUFBVSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFO0FBQ2hHLFFBQVEsU0FBUyxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7QUFDekMsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsd0JBQXdCLENBQUMsRUFBRTtBQUNoRyxRQUFRLE9BQU87QUFDZixLQUFLO0FBQ0w7QUFDQSxJQUFJLE9BQU8sU0FBUyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQztBQUN6RCxDQUFDO0FBQ0Q7QUFDQSxTQUFTLFdBQVcsQ0FBQyxNQUFNLEVBQUU7QUFDN0IsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUM7QUFDNUUsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLE1BQU0sR0FBRyxJQUFJLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFDO0FBQzVFLElBQUksSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQ25DLFFBQVEsdUJBQXVCLENBQUMsTUFBTSxFQUFFLElBQUksRUFBQztBQUM3QyxLQUFLLE1BQU07QUFDWCxRQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0RBQWtELEVBQUM7QUFDdkUsS0FBSztBQUNMLENBQUM7QUFDRDtBQUNBLFNBQVMsa0JBQWtCLENBQUMsTUFBTSxFQUFFO0FBQ3BDLElBQUksSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEdBQUUsRUFBRTtBQUN2RCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLEdBQUcsTUFBTSxHQUFHLElBQUksR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUM7QUFDOUU7QUFDQSxJQUFJLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUNuQyxRQUFRLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUM7QUFDOUMsS0FBSyxNQUFNO0FBQ1gsUUFBUSxPQUFPLENBQUMsR0FBRyxDQUFDLGdEQUFnRCxFQUFDO0FBQ3JFLEtBQUs7QUFDTCxDQUFDO0FBQ0Q7QUFDTyxTQUFTLG1CQUFtQixDQUFDLE9BQU8sRUFBRTtBQUM3QyxJQUFJLElBQUksUUFBUSxHQUFHLGlCQUFpQixDQUFDLE9BQU8sRUFBQztBQUM3QyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxNQUFNLEVBQUU7QUFDN0I7QUFDQSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUM7QUFDaEU7QUFDQSxJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFDO0FBQ2hDLENBQUM7QUFDRDtBQUNPLFNBQVMsb0JBQW9CLENBQUMsT0FBTyxFQUFFO0FBQzlDLElBQUksSUFBSSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxFQUFDO0FBQzdDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRTtBQUM3QjtBQUNBLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBQztBQUMvRDtBQUNBLElBQUksa0JBQWtCLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBQztBQUN2QyxDQUFDO0FBQ0Q7QUFDQSxTQUFTLGVBQWUsR0FBRztBQUMzQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUI7QUFDcEQsTUFBTSxPQUFPLElBQUksQ0FBQztBQUNsQjtBQUNBLElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRSw0QkFBNEIsRUFBQztBQUM5QyxJQUFJLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDakY7QUFDQSxJQUFJLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQzdDLE1BQU0sTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzdCO0FBQ0EsTUFBTSxJQUFJLE9BQU8sR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksRUFBRSxNQUFLO0FBQzFEO0FBQ0EsTUFBTSxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sSUFBSSxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUU7QUFDMUQ7QUFDQSxNQUFNLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEdBQUcsVUFBVSxHQUFHLFNBQVMsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBQztBQUN6RSxNQUFNLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFDO0FBQzNCLEtBQUs7QUFDTDtBQUNBLElBQUksT0FBTyxJQUFJLENBQUM7QUFDaEIsQ0FBQztBQUNEO0FBQ0EsU0FBUyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFO0FBQ2xELElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQjtBQUNwRCxNQUFNLE9BQU8sSUFBSSxDQUFDO0FBQ2xCO0FBQ0EsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxHQUFHLFNBQVMsR0FBRyxRQUFRLElBQUkseUJBQXlCLEdBQUcsTUFBTSxFQUFDO0FBQ3ZGLElBQUksTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNqRjtBQUNBLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDN0MsTUFBTSxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0I7QUFDQSxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sSUFBSSxNQUFNLEVBQUU7QUFDaEMsUUFBUSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxHQUFHLFVBQVUsR0FBRyxTQUFTLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUM7QUFDM0UsUUFBUSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBQztBQUM3QixPQUFPO0FBQ1AsS0FBSztBQUNMO0FBQ0EsSUFBSSxPQUFPLElBQUksQ0FBQztBQUNoQixDQUFDO0FBQ0Q7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsd0JBQXdCLEVBQUU7QUFDbkQsSUFBSSxNQUFNLEVBQUU7QUFDWixRQUFRLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7QUFDN0IsS0FBSztBQUNMLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBQztBQUNqRSxRQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBQztBQUNuRCxRQUFRLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDO0FBQ2hDO0FBQ0EsUUFBUSx5QkFBeUIsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztBQUNsRSxLQUFLO0FBQ0wsSUFBSSxNQUFNLEVBQUUsV0FBVztBQUN2QixRQUFRLDJCQUEyQixDQUFDLElBQUksRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3BFLFFBQVEsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBQztBQUN2QyxLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCLFFBQVEsSUFBSSxTQUFTLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFDO0FBQ25FLFFBQVEsSUFBSSxTQUFTLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUN0QyxZQUFZLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUM7QUFDM0MsWUFBWSxXQUFXLENBQUMsU0FBUyxFQUFDO0FBQ2xDLFlBQVksSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFTO0FBQ25DLFNBQVM7QUFDVCxLQUFLO0FBQ0wsQ0FBQyxFQUFDO0FBQ0Y7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsd0JBQXdCLEVBQUU7QUFDbkQsSUFBSSxNQUFNLEVBQUU7QUFDWixRQUFRLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7QUFDN0IsUUFBUSxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFO0FBQ2xDLEtBQUs7QUFDTCxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCLFFBQVEsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUM7QUFDakU7QUFDQSxRQUFRLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ2hELFFBQVEsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRTtBQUMvQyxZQUFZLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVc7QUFDL0UsU0FBUztBQUNULFFBQVEseUJBQXlCLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDLENBQUM7QUFDbEUsS0FBSztBQUNMO0FBQ0EsSUFBSSxNQUFNLEVBQUUsV0FBVztBQUN2QixRQUFRLDJCQUEyQixDQUFDLElBQUksRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3BFLEtBQUs7QUFDTDtBQUNBLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEI7QUFDQSxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRTtBQUMxQztBQUNBLFFBQVEsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUM7QUFDakU7QUFDQSxRQUFRLElBQUksT0FBTyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxFQUFFLE1BQUs7QUFDN0Q7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxJQUFJLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRTtBQUMzRDtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBQztBQUM5QixLQUFLO0FBQ0w7QUFDQSxJQUFJLFFBQVEsRUFBRSxVQUFVLE9BQU8sRUFBRTtBQUNqQztBQUNBLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxHQUFHLFFBQU87QUFDMUM7QUFDQTtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRTtBQUMvQyxZQUFZLElBQUksT0FBTyxFQUFFO0FBQ3pCLGdCQUFnQixJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRTtBQUMxRixvQkFBb0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7QUFDdEUsaUJBQWlCO0FBQ2pCLGFBQWEsTUFBTTtBQUNuQixnQkFBZ0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBVztBQUNuRixnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUU7QUFDckMsb0JBQW9CLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO0FBQ3RFLGlCQUFpQjtBQUNqQixhQUFhO0FBQ2IsU0FBUztBQUNULEtBQUs7QUFDTCxDQUFDLEVBQUM7QUFDRjtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUU7QUFDekMsSUFBSSxNQUFNLEVBQUU7QUFDWjtBQUNBLFFBQVEsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUM3QixLQUFLO0FBQ0wsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QjtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxFQUFFO0FBQ3BFLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQyw4REFBOEQsRUFBQztBQUN4RixZQUFZLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQzFCLFlBQVksT0FBTztBQUNuQixTQUFTO0FBQ1Q7QUFDQSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxFQUFFO0FBQ2hDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ2hDLFlBQVksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDM0QsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxhQUFhLEVBQUM7QUFDeEUsUUFBUSxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFJO0FBQ3pFO0FBQ0E7QUFDQSxRQUFRLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQzFFLFFBQVEsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sS0FBSztBQUNwQyxZQUFZLE1BQU0sQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzlFLFNBQVMsQ0FBQyxDQUFDO0FBQ1g7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQ3RGLFFBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksS0FBSztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzVFLFNBQVMsQ0FBQyxDQUFDO0FBQ1g7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO0FBQzVGLFFBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksS0FBSztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzVFLFNBQVMsQ0FBQyxDQUFDO0FBQ1g7QUFDQSxRQUFRLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUNsRSxRQUFRLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUs7QUFDaEMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBQztBQUM1RSxTQUFTLENBQUMsQ0FBQztBQUNYO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3RELFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ3ZGO0FBQ0EsS0FBSztBQUNMO0FBQ0EsSUFBSSxVQUFVLEVBQUUsVUFBVSxJQUFJLEVBQUUsTUFBTSxFQUFFO0FBQ3hDLFFBQVEsT0FBTyxNQUFNLElBQUksRUFBRSxNQUFNLElBQUksSUFBSSxDQUFDLEVBQUU7QUFDNUMsVUFBVSxNQUFNLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztBQUNyQyxTQUFTO0FBQ1QsUUFBUSxRQUFRLE1BQU0sSUFBSSxJQUFJLEVBQUU7QUFDaEMsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxXQUFXLEVBQUUsWUFBWTtBQUM3QixRQUFRLElBQUksS0FBSyxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBQztBQUN4RjtBQUNBLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDN0MsWUFBWSxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFDO0FBQy9CO0FBQ0EsWUFBWSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQztBQUMxRDtBQUNBLFlBQVksSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLFVBQVM7QUFDbkMsWUFBWSxJQUFJLEVBQUUsS0FBSyxjQUFjLElBQUksRUFBRSxLQUFLLHNCQUFzQixFQUFFLENBQUMsUUFBUSxDQUFDO0FBQ2xGO0FBQ0EsWUFBWSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVTtBQUNuQyxZQUFZLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUM7QUFDakk7QUFDQSxZQUFZLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFRO0FBQ2xDLFlBQVksSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO0FBQ2hDLFlBQVksS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDOUMsZ0JBQWdCLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRTtBQUNqRCxvQkFBb0IsT0FBTyxHQUFHLElBQUksQ0FBQztBQUNuQyxvQkFBb0IsTUFBTTtBQUMxQixpQkFBaUI7QUFDakIsYUFBYTtBQUNiLFlBQVksSUFBSSxPQUFPLEVBQUUsQ0FBQyxRQUFRLENBQUM7QUFDbkM7QUFDQSxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUM7QUFDNUYsU0FBUztBQUNUO0FBQ0E7QUFDQSxRQUFRLGVBQWUsR0FBRTtBQUN6QixLQUFLO0FBQ0w7QUFDQSxJQUFJLE1BQU0sRUFBRSxZQUFZO0FBQ3hCLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsSUFBSSxFQUFFLE1BQU07QUFDaEQ7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxFQUFFO0FBQ2pDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsR0FBRTtBQUMvQixZQUFZLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNELFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLE1BQU0sRUFBRSxZQUFZO0FBQ3hCLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQzFGLEtBQUs7QUFDTDtBQUNBO0FBQ0EsSUFBSSxJQUFJLEVBQUUsVUFBVSxJQUFJLEVBQUU7QUFDMUI7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUM7QUFDcEM7QUFDQTtBQUNBLFFBQVEsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsNkNBQTZDLEVBQUM7QUFDbkcsUUFBUSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxLQUFLO0FBQ2xDLFlBQVksTUFBTSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUM7QUFDOUUsU0FBUyxDQUFDLENBQUM7QUFDWDtBQUNBO0FBQ0EsUUFBUSxLQUFLLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMscUdBQXFHLENBQUMsQ0FBQztBQUN4SixRQUFRLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUs7QUFDaEMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBQztBQUM1RSxTQUFTLENBQUMsQ0FBQztBQUNYLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLGFBQWEsRUFBRSxVQUFVLElBQUksRUFBRTtBQUNuQztBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBUztBQUMzRDtBQUNBLFFBQVEsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFDO0FBQ3hEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUMxQyxZQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMsc0RBQXNELEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQztBQUMvRixZQUFZLE9BQU8sSUFBSTtBQUN2QixTQUFTLE1BQU07QUFDZixZQUFZLElBQUksUUFBUSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUM7QUFDOUMsWUFBWSxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQzNCLGdCQUFnQixPQUFPLElBQUk7QUFDM0IsYUFBYSxNQUFNO0FBQ25CLGdCQUFnQixPQUFPLFFBQVE7QUFDL0IsYUFBYTtBQUNiLFNBQVM7QUFDVCxLQUFLO0FBQ0wsQ0FBQzs7QUNuWkQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBUUE7QUFDQSxNQUFNLFFBQVEsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDcEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQzFDLE1BQU0sUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUNwQyxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUU7QUFDeEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQ2hDO0FBQ0EsU0FBUyxZQUFZLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRTtBQUNwQyxJQUFJLElBQUksSUFBSSxHQUFHLFNBQVE7QUFDdkIsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPO0FBQy9CO0FBQ0EsSUFBSSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFO0FBQ3RDLE1BQU0sT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNuQyxLQUFLLE1BQU07QUFDWCxNQUFNLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUMvQixLQUFLO0FBQ0wsQ0FBQztBQUNEO0FBQ0EsTUFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUU7QUFDaEMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxZQUFZLENBQUM7QUFDOUIsRUFBRSxJQUFJLEVBQUUsWUFBWTtBQUNwQixJQUFJLElBQUksQ0FBQyxXQUFXLEdBQUcsTUFBSztBQUM1QixJQUFJLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxvQkFBbUI7QUFDbEYsSUFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBQztBQUM5QyxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSTtBQUN4QixJQUFJLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3BEO0FBQ0E7QUFDQSxJQUFJLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFO0FBQ2hILFFBQVEsSUFBSSxDQUFDLGFBQWEsR0FBRTtBQUM1QixLQUFLO0FBQ0wsR0FBRztBQUNILEVBQUUsYUFBYSxFQUFFLGtCQUFrQjtBQUNuQyxJQUFJLElBQUksTUFBTSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSztBQUNqRSxrQkFBa0IsT0FBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBQztBQUN2RDtBQUNBLElBQUksTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQ3ZCLElBQUksT0FBTyxDQUFDLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO0FBQ3BDLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3RCxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0FBQzVELElBQUksTUFBTSxLQUFLLENBQUMsdUNBQXVDLEVBQUUsT0FBTyxDQUFDO0FBQ2pFLFNBQVMsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDMUMsU0FBUyxJQUFJLENBQUMsSUFBSSxJQUFJO0FBQ3RCLFVBQVUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDeEMsVUFBVSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztBQUMvQixLQUFLLEVBQUM7QUFDTixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEdBQUU7QUFDL0IsR0FBRztBQUNILEVBQUUsVUFBVSxFQUFFLGdCQUFnQixNQUFNLEVBQUU7QUFDdEMsTUFBTSxJQUFJLENBQUMsWUFBWSxHQUFFO0FBQ3pCO0FBQ0EsTUFBTSxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLE1BQU0sR0FBRyxrQ0FBa0MsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQzFJLE1BQU0sT0FBTyxHQUFHO0FBQ2hCLEdBQUc7QUFDSCxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsTUFBTSxFQUFFO0FBQ3RDLE1BQU0sSUFBSSxDQUFDLFlBQVksR0FBRTtBQUN6QixNQUFNLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUM7QUFDNUYsR0FBRztBQUNILEVBQUUsWUFBWSxFQUFFLFlBQVk7QUFDNUIsS0FBSyxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsTUFBTTtBQUNyRCxLQUFLLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ3hDLEdBQUc7QUFDSCxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsTUFBTSxFQUFFO0FBQ3RDLElBQUksSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFJO0FBQzNCLElBQUksTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUM5QjtBQUNBLElBQUksTUFBTSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBQztBQUN4QyxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUM7QUFDdEMsSUFBSSxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFDO0FBQ3JDLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUFDO0FBQzlDLElBQUksSUFBSSxDQUFDLDBCQUEwQixDQUFDLFNBQVMsRUFBQztBQUM5QyxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFDO0FBQzlCO0FBQ0EsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUM7QUFDaEUsSUFBSSxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFFO0FBQzdCLElBQUksSUFBSSxDQUFDLFdBQVcsR0FBRyxNQUFLO0FBQzVCLEdBQUc7QUFDSCxDQUFDLEVBQUM7QUFDRjtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUU7QUFDbkMsRUFBRSxNQUFNLEVBQUU7QUFDVixJQUFJLFVBQVUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7QUFDL0IsSUFBSSxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO0FBQ2pDLElBQUksS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFO0FBQzNDLElBQUksY0FBYyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFO0FBQ3JELEdBQUc7QUFDSCxFQUFFLElBQUksRUFBRSxrQkFBa0I7QUFDMUIsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFNO0FBQ2pEO0FBQ0EsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUc7QUFDMUMsUUFBUSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFDO0FBQ3pGLEtBQUssTUFBTTtBQUNYLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFDO0FBQzNCLEtBQUs7QUFDTDtBQUNBLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsRUFBRTtBQUM5QjtBQUNBLFFBQVEsSUFBSSxDQUFDLGFBQWEsR0FBRTtBQUM1QixLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDO0FBQzdDLE1BQU0sV0FBVyxFQUFFLElBQUk7QUFDdkIsTUFBTSxJQUFJLEVBQUUsS0FBSyxDQUFDLFVBQVU7QUFDNUIsTUFBTSxRQUFRLEVBQUU7QUFDaEIsUUFBUSxPQUFPLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLEVBQUU7QUFDL0MsUUFBUSxJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFO0FBQzFCLFFBQVEsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRTtBQUM1QixRQUFRLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFO0FBQ3hDLE9BQU87QUFDUCxvQkFBTUMsTUFBWTtBQUNsQixNQUFNLGNBQWMsRUFBRSxDQUFDO0FBQ3ZCLFFBQVEsRUFBRUMsTUFBTSxDQUFDO0FBQ2pCLFFBQVEsRUFBRUMsTUFBYyxDQUFDO0FBQ3pCLE1BQU0sQ0FBQztBQUNQLEtBQUssRUFBQztBQUNOO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUM7QUFDdkM7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLEdBQUU7QUFDdEM7QUFDQSxJQUFJLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLEVBQUU7QUFDOUIsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksSUFBSTtBQUNoRTtBQUNBLFlBQTRCLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU07QUFDeEQsY0FBYyxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUM7QUFDbEYsYUFBYSxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUk7QUFDOUIsZ0JBQWdCLE9BQU8sQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztBQUNqRCxnQkFBZ0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7QUFDL0QsYUFBYSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFDO0FBQzNDLFNBQVMsRUFBQztBQUNWLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQ3JDLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUM7QUFDL0QsUUFBUSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFDO0FBQ3hDLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUM7QUFDN0MsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLFFBQU87QUFDM0csUUFBUSxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsTUFBTTtBQUMvRCxZQUFZLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUM7QUFDeEMsWUFBWSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFDO0FBQ3RGLFlBQVksb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBQztBQUN6QyxTQUFTLEVBQUM7QUFDVixLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO0FBQzlDLFFBQVEsUUFBUSxFQUFFLGtEQUFrRDtBQUNwRSxRQUFRLEdBQUcsRUFBRSxHQUFHO0FBQ2hCLFFBQVEsTUFBTSxFQUFFLGdCQUFnQjtBQUNoQyxLQUFLLEVBQUM7QUFDTjtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFDO0FBQ3JELElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLEVBQUM7QUFDNUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUM7QUFDM0QsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixFQUFFLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQ2pFLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsRUFBRSxNQUFNLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBQztBQUNsRSxHQUFHO0FBQ0g7QUFDQSxFQUFFLGVBQWUsRUFBRSxVQUFVLFdBQVcsRUFBRTtBQUMxQyxJQUFJLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBYztBQUN6QyxJQUFJLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUksQ0FBQztBQUNuRDtBQUNBLElBQUksSUFBSSxRQUFRLEdBQUcsQ0FBQyxNQUFNLEtBQUs7QUFDL0IsTUFBTSxJQUFJLElBQUksR0FBRyxPQUFNO0FBQ3ZCLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQ3pCLFVBQVUsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDLFFBQVEsS0FBSztBQUMzQyxjQUFjLElBQUksQ0FBQyxNQUFNLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7QUFDdkQsa0JBQWtCLElBQUksQ0FBQyxRQUFRLEdBQUcsWUFBVztBQUM3QyxlQUFlO0FBQ2YsV0FBVyxFQUFDO0FBQ1osT0FBTztBQUNQLE1BQU0sTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztBQUN2QyxNQUFNLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ2hELFVBQVUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hDLE9BQU87QUFDUCxNQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksZ0JBQWdCLEdBQUcsTUFBTTtBQUNqQztBQUNBLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsS0FBSTtBQUN2QyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7QUFDZjtBQUNBO0FBQ0EsUUFBUSxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFRO0FBQy9CLEtBQUs7QUFDTCxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNuQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQzdELE1BQUs7QUFDTDtBQUNBLElBQUksSUFBSSxJQUFJLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxpQkFBaUIsRUFBQztBQUNwRSxJQUFJLElBQUksV0FBVyxHQUFHLEtBQUs7QUFDM0IsTUFBTSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFO0FBQzlDLFVBQVUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsZ0JBQWdCLEVBQUM7QUFDcEUsT0FBTyxNQUFNO0FBQ2IsVUFBVSxnQkFBZ0IsR0FBRTtBQUM1QixPQUFPO0FBQ1AsS0FBSyxDQUFDO0FBQ04sSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ3ZELEdBQUc7QUFDSDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxFQUFFLElBQUksRUFBRSxVQUFVLElBQUksRUFBRTtBQUN4QixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxHQUFHLEtBQUk7QUFDbkQ7QUFDQSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFO0FBQ2hELE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFDO0FBQ2pELE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBQztBQUM3RCxNQUFNLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFDO0FBQ3REO0FBQ0EsTUFBTSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQUU7QUFDNUMsVUFBVSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTtBQUNsQyxZQUFZLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBQztBQUNwRSxZQUFZLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQUs7QUFDMUMsWUFBWSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsTUFBSztBQUM3QyxXQUFXO0FBQ1gsT0FBTyxNQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsRUFBRTtBQUNuRCxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFDO0FBQ25ELE9BQU87QUFDUCxLQUFLO0FBQ0wsR0FBRztBQUNILEVBQUUsUUFBUSxFQUFFLFlBQVk7QUFDeEIsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxLQUFLO0FBQ3BDLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFDO0FBQy9DLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLENBQUMsRUFBRTtBQUNuQztBQUNBLFlBQVksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxFQUFDLEVBQUUsRUFBQztBQUNuRixTQUFTO0FBQ1Q7QUFDQTtBQUNBLFFBQVEsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFDO0FBQ3pFLFFBQVEsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLFVBQVU7QUFDN0YsNENBQTRDLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUMsWUFBWSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxFQUFDO0FBQ3RILFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFO0FBQ2pDO0FBQ0EsWUFBWSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDM0IsWUFBWSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUM7QUFDbEQsU0FBUyxNQUFNO0FBQ2Y7QUFDQSxZQUFZLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxLQUFLLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFDO0FBQ3BHLFNBQVM7QUFDVCxLQUFLLENBQUM7QUFDTixHQUFHO0FBQ0g7QUFDQSxJQUFJLGFBQWEsRUFBRSxZQUFZO0FBQy9CLFFBQVEsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVM7QUFDNUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsRUFBQztBQUNuRjtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDMUMsWUFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLFFBQVEsRUFBQztBQUM3RSxZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBQztBQUMvQixZQUFZLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSTtBQUNwQyxZQUFZLElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBSztBQUM5QixZQUFZLE9BQU87QUFDbkIsU0FBUztBQUNULFFBQVEsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBQztBQUMzRCxLQUFLO0FBQ0w7QUFDQSxJQUFJLGFBQWEsRUFBRSxTQUFTLFVBQVUsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFO0FBQzdELFFBQVEsSUFBSSxVQUFVLEtBQUssTUFBTSxFQUFFO0FBQ25DLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFDaEMsWUFBWSxJQUFJLENBQUMsWUFBWSxHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUM7QUFDdEQsU0FBUyxNQUFNLElBQUksVUFBVSxLQUFLLFFBQVEsRUFBRTtBQUM1QyxZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQ2hDLFlBQVksSUFBSSxDQUFDLFlBQVksR0FBRyxhQUFZO0FBQzVDLFNBQVMsTUFBTTtBQUNmLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFDaEMsWUFBWSxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUk7QUFDcEMsU0FBUztBQUNULFFBQVEsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFDO0FBQzNDLEtBQUs7QUFDTDtBQUNBLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRTtBQUNuQixRQUFRLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO0FBQ2xELFVBQVUsSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLO0FBQ25ELFVBQVUsRUFBRSxFQUFFLEdBQUc7QUFDakIsU0FBUyxFQUFDO0FBQ1YsS0FBSztBQUNMLElBQUksSUFBSSxHQUFHO0FBQ1gsUUFBUSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBQztBQUN6QixLQUFLO0FBQ0wsSUFBSSxLQUFLLEdBQUc7QUFDWixRQUFRLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDO0FBQ3pCLEtBQUs7QUFDTCxJQUFJLFFBQVEsR0FBRztBQUNmLFFBQVEsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxLQUFLLENBQUM7QUFDeEQsS0FBSztBQUNMLENBQUM7O0FDM1VEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLFdBQVcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDdkMsTUFBTSxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQ3JDO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRTtBQUMxQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFO0FBQzFDLEdBQUc7QUFDSCxFQUFFLElBQUksRUFBRSxrQkFBa0I7QUFDMUIsSUFBSSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsY0FBYyxHQUFFO0FBQ3RELElBQUksTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUM7QUFDaEQ7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFO0FBQ3hDLE1BQU0sVUFBVSxFQUFFLHFCQUFxQjtBQUN2QyxNQUFNLFNBQVMsRUFBRSxRQUFRO0FBQ3pCLE1BQU0sR0FBRyxFQUFFLEdBQUc7QUFDZCxNQUFNLE9BQU8sRUFBRSxDQUFDO0FBQ2hCLE1BQU0sS0FBSyxFQUFFLEtBQUs7QUFDbEIsTUFBTSxXQUFXLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDdkMsTUFBTSxXQUFXLEVBQUUsQ0FBQztBQUNwQixLQUFLLEVBQUM7QUFDTjtBQUNBLElBQUksSUFBSSxDQUFDLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLEdBQUU7QUFDcEMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUM7QUFDM0MsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7QUFDakMsTUFBTSxXQUFXLEVBQUUsSUFBSTtBQUN2QixNQUFNLFNBQVMsRUFBRSxLQUFLO0FBQ3RCLEtBQUssRUFBQztBQUNOLElBQUksSUFBSSxDQUFDLElBQUksR0FBRyxFQUFDO0FBQ2pCLElBQUksSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFHO0FBQ2xCO0FBQ0E7QUFDQSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLEdBQUcsQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLEVBQUM7QUFDdkQsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLFlBQVk7QUFDcEIsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7QUFDbkI7QUFDQSxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFDO0FBQzNDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBQztBQUMxRCxNQUFNLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFDO0FBQ3hELE1BQU0sTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3pFLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxHQUFHLFFBQU87QUFDMUMsS0FBSztBQUNMLEdBQUc7QUFDSCxFQUFFLGNBQWMsRUFBRSxZQUFZO0FBQzlCO0FBQ0EsSUFBSSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBUztBQUN6RCxJQUFJLE1BQU0sR0FBRyxJQUFJLEVBQUUsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBQztBQUNyRSxJQUFJLE1BQU0sR0FBRyxHQUFHLENBQUMsb0RBQW9ELEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsRUFBQztBQUMxRixJQUFJLE9BQU8sR0FBRztBQUNkLEdBQUc7QUFDSCxFQUFFLE9BQU8sRUFBRSxrQkFBa0I7QUFDN0IsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxLQUFLO0FBQ3BDLE1BQU0sTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsS0FBSTtBQUMzQyxNQUFNLElBQUksSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUM7QUFDN0IsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQjtBQUM5QixRQUFRLGNBQWM7QUFDdEIsUUFBUSxNQUFNO0FBQ2QsVUFBVSxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFDO0FBQzNDLFNBQVM7QUFDVCxRQUFRLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtBQUN0QixRQUFPO0FBQ1AsS0FBSyxDQUFDO0FBQ04sR0FBRztBQUNILENBQUM7O0FDOUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFHO0FBQ3ZCO0FBQ0EsTUFBTSxjQUFjLEdBQUc7QUFDdkI7QUFDQSxFQUFFLEtBQUssRUFBRTtBQUNULElBQUksSUFBSSxFQUFFLGFBQWE7QUFDdkIsSUFBSSxLQUFLLEVBQUUsb0JBQW9CO0FBQy9CLElBQUksS0FBSyxFQUFFLG9CQUFvQjtBQUMvQixJQUFJLFNBQVMsRUFBRSx1QkFBdUI7QUFDdEMsSUFBSSxNQUFNLEVBQUUscUJBQXFCO0FBQ2pDLEdBQUc7QUFDSDtBQUNBLEVBQUUsUUFBUSxFQUFFO0FBQ1osSUFBSSxPQUFPLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO0FBQzVCLElBQUksR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN4QixJQUFJLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDbEMsSUFBSSxpQkFBaUIsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDdEMsSUFBSSxpQkFBaUIsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDdEMsR0FBRztBQUNIO0FBQ0EsRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDO0FBQ3JCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEVBQUUsQ0FBQztBQUNIO0FBQ0EsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxFQUFFLENBQUM7QUFDSDs7QUNwTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQSxNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFDO0FBQzFDO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRTtBQUNyQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO0FBQzlDLElBQUksZ0JBQWdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtBQUM5RCxJQUFJLFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFO0FBQ3pELEdBQUc7QUFDSCxFQUFFLElBQUksRUFBRSxZQUFZO0FBQ3BCLElBQUksTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsS0FBSTtBQUN6QyxJQUFJLE1BQU0sRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUTtBQUNsRSxJQUFJLFFBQVEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsb0JBQW1CO0FBQy9ELElBQUksUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxvQkFBbUI7QUFDL0QsSUFBSSxNQUFNLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxHQUFHLGVBQWM7QUFDM0QsSUFBSSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQztBQUM3QyxNQUFNLFlBQVk7QUFDbEIsTUFBTSxjQUFjO0FBQ3BCLE1BQU0sT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxFQUFFO0FBQzlDLE1BQU0sUUFBUSxFQUFFO0FBQ2hCLFFBQVEsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRTtBQUNoQyxRQUFRLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUU7QUFDcEMsUUFBUSxhQUFhLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUU7QUFDekQsUUFBUSxpQkFBaUIsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUU7QUFDeEMsUUFBUSxpQkFBaUIsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUU7QUFDeEMsUUFBUSxJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFO0FBQzFCLE9BQU87QUFDUCxLQUFLLEVBQUM7QUFDTixJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVE7QUFDakMsR0FBRztBQUNILEVBQUUsSUFBSSxHQUFHO0FBQ1QsSUFBSSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRTtBQUNoQyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUM7QUFDbEQsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFDO0FBQ3hDLE1BQU0sTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUM7QUFDeEMsTUFBTSxNQUFNLElBQUksR0FBRyxnQkFBZ0I7QUFDbkMsUUFBUSxLQUFLO0FBQ2IsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQjtBQUMxRCxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCO0FBQzFELFFBQVEsQ0FBQztBQUNULFFBQVEsQ0FBQztBQUNULFFBQU87QUFDUCxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSTtBQUM5QyxLQUFLO0FBQ0wsR0FBRztBQUNILENBQUMsRUFBQztBQUNGO0FBQ0EsU0FBUyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUU7QUFDaEMsRUFBRSxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQzVDLENBQUM7QUFDRDtBQUNBLFNBQVMsU0FBUyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7QUFDdEMsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUNoRCxDQUFDO0FBQ0Q7QUFDQSxTQUFTLGdCQUFnQixDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7QUFDN0MsRUFBRSxPQUFPLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7QUFDcEQ7O0FDeEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLGFBQWEsRUFBRTtBQUN0QyxJQUFJLElBQUksR0FBRztBQUNYLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDdkQsUUFBUSxJQUFJLENBQUMsa0JBQWtCLEdBQUcsY0FBYyxDQUFDLG9CQUFvQixFQUFDO0FBQ3RFLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUU7QUFDMUQsWUFBWSxPQUFPLENBQUMsS0FBSyxDQUFDLGlHQUFpRyxFQUFDO0FBQzVILFNBQVMsTUFBTTtBQUNmLFlBQVksSUFBSSxDQUFDLGtCQUFrQixHQUFFO0FBQ3JDLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFO0FBQ2hCLFFBQVEsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFDO0FBQzlCLEtBQUs7QUFDTCxHQUFHLEVBQUM7QUFDSjtBQUNBO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsRUFBRTtBQUN4QyxJQUFJLE1BQU0sRUFBRTtBQUNaO0FBQ0EsUUFBUSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUM7QUFDNUMsS0FBSztBQUNMLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztBQUMzQixRQUFRLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDdkM7QUFDQSxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTtBQUN6RCxZQUFZLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUNqQyxTQUFTLE1BQU07QUFDZixZQUFZLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVE7QUFDOUMsU0FBUztBQUNUO0FBQ0EsUUFBUSxJQUFJLElBQUksR0FBRyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFDO0FBQ3hFLFFBQVEsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxDQUFDLEVBQUUsS0FBSztBQUN0RCxZQUFZLElBQUksQ0FBQyxZQUFZLEdBQUU7QUFDL0IsU0FBUyxDQUFDLENBQUM7QUFDWDtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0EsSUFBSSxNQUFNLEVBQUUsWUFBWTtBQUN4QixRQUFRLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTTtBQUM3RTtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztBQUN2QztBQUNBLFFBQVEsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0FBQzNDO0FBQ0EsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDekIsWUFBWSxJQUFJLENBQUMsYUFBYSxHQUFFO0FBQ2hDLFNBQVM7QUFDVCxRQUFRLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUM1QixLQUFLO0FBQ0w7QUFDQSxJQUFJLFlBQVksRUFBRSxZQUFZO0FBQzlCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxNQUFNLEdBQUcsTUFBTTtBQUMzQjtBQUNBLFlBQVksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxNQUFNO0FBQzFDLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNO0FBQ3hDO0FBQ0EsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7QUFDN0M7QUFDQTtBQUNBO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFJO0FBQ3pDO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN2RSxvQkFBb0IsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN2RSxvQkFBb0IsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDdEU7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUM7QUFDekYsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQSxnQkFBZ0IsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUM7QUFDbkUsZ0JBQWdCLElBQUksQ0FBQyxlQUFlLEdBQUcsU0FBUTtBQUMvQyxnQkFBZ0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEdBQUcsS0FBSTtBQUNyRSxnQkFBZ0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFDO0FBQ3RGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGdCQUFnQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFO0FBQ3ZEO0FBQ0Esb0JBQW9CLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQUs7QUFDbEUsb0JBQW9CLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQUs7QUFDdkQsb0JBQW9CLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFDO0FBQy9DLG9CQUFvQixNQUFNLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsRUFBQztBQUNoRCxvQkFBb0IsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ2hDLG9CQUFvQixNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDaEMsb0JBQW9CLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUNoQyxvQkFBb0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO0FBQzlELGlCQUFpQixNQUFNO0FBQ3ZCO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFDO0FBQzFELG9CQUFvQixJQUFJLElBQUksRUFBRTtBQUM5Qix3QkFBd0IsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7QUFDNUQsd0JBQXdCLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBQztBQUN0RSx3QkFBd0IsTUFBTSxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFDO0FBQ3ZFLHFCQUFxQixNQUFNO0FBQzNCLHdCQUF3QixJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFLO0FBQzlELHdCQUF3QixLQUFLLEdBQUcsU0FBUyxDQUFDLEVBQUM7QUFDM0Msd0JBQXdCLE1BQU0sR0FBRyxTQUFTLENBQUMsRUFBQztBQUM1Qyx3QkFBd0IsU0FBUyxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ3ZDLHdCQUF3QixTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDdkMsd0JBQXdCLFNBQVMsQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUN2Qyx3QkFBd0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO0FBQ2xFLHFCQUFxQjtBQUNyQjtBQUNBLG9CQUFvQixJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUTtBQUNwRSxvQkFBb0IsS0FBSyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBQztBQUM1QyxvQkFBb0IsTUFBTSxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBQztBQUM3QyxvQkFBb0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUN2QyxvQkFBb0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUN2QyxvQkFBb0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUN2QyxvQkFBb0IsT0FBTyxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztBQUNyRCxpQkFBaUI7QUFDakI7QUFDQSxnQkFBZ0IsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDN0Msb0JBQW9CLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sR0FBRTtBQUMvRSxvQkFBb0IsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxFQUFFLE1BQU0sR0FBRyxLQUFLLEVBQUM7QUFDdkUsb0JBQW9CLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNoRyxpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxnQkFBZ0IsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUU7QUFDM0Qsb0JBQW9CLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO0FBQ3RDLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0EsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRTtBQUNwRyxvQkFBb0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO0FBQ2pELGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0EsZ0JBQWdCLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUM7QUFDekQ7QUFDQTtBQUNBO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtBQUMvQyxvQkFBb0IsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FFL0M7QUFDckI7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUM7QUFDbEYsb0JBQW9CLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRTtBQUM5RCx3QkFBd0Isa0JBQWtCLEVBQUUsSUFBSTtBQUNoRCx3QkFBd0IsV0FBVyxFQUFFLElBQUk7QUFDekMsd0JBQXdCLFFBQVEsRUFBRSxJQUFJO0FBQ3RDLHdCQUF3Qix1QkFBdUIsRUFBRSxJQUFJO0FBQ3JELHFCQUFxQixFQUFDO0FBQ3RCLG9CQUFvQixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFDO0FBQzlFO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDMUQsb0JBQW9CLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFDO0FBQzVGO0FBQ0Esb0JBQW9CLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7QUFDakQ7QUFDQTtBQUNBLHdCQUF3QixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUU7QUFDbEUsNEJBQTRCLGtCQUFrQixFQUFFLElBQUk7QUFDcEQsNEJBQTRCLFVBQVUsRUFBRSxJQUFJO0FBQzVDLDRCQUE0QixjQUFjLEVBQUUsSUFBSTtBQUNoRCw0QkFBNEIsV0FBVyxFQUFFLElBQUk7QUFDN0MsNEJBQTRCLFFBQVEsRUFBRSxJQUFJO0FBQzFDLDRCQUE0Qix1QkFBdUIsRUFBRSxJQUFJO0FBQ3pELHlCQUF5QixFQUFDO0FBQzFCO0FBQ0Esd0JBQXdCLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixFQUFFLENBQUMsR0FBRyxLQUFLO0FBQ3hHLDRCQUE0QixJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUM7QUFDdEQseUJBQXlCLEVBQUM7QUFDMUIsd0JBQXdCLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLG9CQUFvQixFQUFFLENBQUMsR0FBRyxLQUFLO0FBQ3RHLDRCQUE0QixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUM7QUFDcEQseUJBQXlCLEVBQUM7QUFDMUIscUJBQXFCO0FBQ3JCO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLEdBQUU7QUFDcEQsb0JBQW9CLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFFO0FBQ3BELGlCQUFpQixNQUFNO0FBQ3ZCO0FBQ0Esb0JBQW9CLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFO0FBQ3BFLHdCQUF3QixJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFDO0FBQ2hFLHFCQUFxQjtBQUNyQixpQkFBaUI7QUFDakI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsRUFBRTtBQUN2RCxvQkFBb0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFDO0FBQ3hELGlCQUFpQjtBQUNqQjtBQUNBLGdCQUFnQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFO0FBQzdDO0FBQ0E7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsb0JBQW9CLEdBQUcsVUFBVSxXQUFXLEVBQUU7QUFDdkUsd0JBQXdCLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQztBQUM5Qyx3QkFBd0IsSUFBSSxLQUFLLENBQUM7QUFDbEMsd0JBQXdCLElBQUksV0FBVyxFQUFFO0FBQ3pDO0FBQ0E7QUFDQTtBQUNBLDRCQUE0QixLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLEdBQUcsY0FBYyxDQUFDO0FBQ3pGO0FBQ0E7QUFDQTtBQUNBLDRCQUE0QixVQUFVLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztBQUNyRix5QkFBeUIsTUFBTTtBQUMvQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLDRCQUE0QixLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLGVBQWM7QUFDdEYseUJBQXlCO0FBQ3pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSSxNQUFNLENBQUM7QUFDbkMsd0JBQXdCLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEVBQUU7QUFDM0QsNEJBQTRCLE1BQU0sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNuRSx5QkFBeUIsTUFBTTtBQUMvQiw0QkFBNEIsTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFDO0FBQ3ZFO0FBQ0E7QUFDQSw0QkFBNEIsTUFBTSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO0FBQ3RFO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLE1BQU0sQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFO0FBQzdELGdDQUFnQyxRQUFRLEVBQUUsb0JBQW9CO0FBQzlELGdDQUFnQyxVQUFVLEVBQUUsVUFBVTtBQUN0RCxnQ0FBZ0MsS0FBSyxFQUFFLE9BQU87QUFDOUMsZ0NBQWdDLFNBQVMsRUFBRSxLQUFLO0FBQ2hELDZCQUE2QixDQUFDLENBQUM7QUFDL0IsNEJBQTRCLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNoRSx5QkFBeUI7QUFDekI7QUFDQTtBQUNBO0FBQ0Esd0JBQXdCLElBQUksQ0FBQyxTQUFTLEdBQUcsTUFBTSxDQUFDO0FBQ2hELHdCQUF3QixHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJO0FBQ3pGLDRCQUE0QixJQUFJLENBQUMsU0FBUyxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsYUFBYSxFQUFDO0FBQ2xGO0FBQ0E7QUFDQTtBQUNBLDRCQUE0QixJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxLQUFLLENBQUMsRUFBRTtBQUNqRSxnQ0FBZ0QsV0FBVyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUM7QUFDbkY7QUFDQTtBQUNBO0FBQ0EsNkJBQTZCO0FBQzdCLHlCQUF5QixFQUFDO0FBQzFCLHNCQUFxQjtBQUNyQixvQkFBb0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3BGO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxjQUFjLEdBQUcsWUFBWTtBQUN0RCx3QkFBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSTtBQUNsRiw0QkFBNEIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsRUFBQztBQUNsRSx5QkFBeUIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNO0FBQ3ZDLDRCQUE0QixJQUFJLENBQUMsb0JBQW9CLEdBQUU7QUFDdkQseUJBQXlCLEVBQUM7QUFDMUIsc0JBQXFCO0FBQ3JCLG9CQUFvQixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUN4RTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG9CQUFvQixJQUFJLEdBQUcsQ0FBQyxVQUFVLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsRUFBRTtBQUN4RSx3QkFBd0IsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQzlDLHFCQUFxQixNQUFNO0FBQzNCLHdCQUF3QixJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFDO0FBQzNHLHFCQUFxQjtBQUNyQixpQkFBaUI7QUFDakIsYUFBYSxFQUFDO0FBQ2QsVUFBUztBQUNUO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRTtBQUNoRCxZQUFZLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLE1BQU07QUFDM0QsZ0JBQWdCLE1BQU0sR0FBRTtBQUN4QixhQUFhO0FBQ2IsWUFBWSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBQztBQUMzQixTQUFTLE1BQU07QUFDZixZQUFZLE1BQU0sR0FBRTtBQUNwQixTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QixRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUN6QixZQUFZLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFFO0FBQzlCLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLEtBQUssRUFBRSxZQUFZO0FBQ3ZCLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO0FBQ3pCLFlBQVksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUU7QUFDL0IsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBO0FBQ0EsSUFBSSxPQUFPLEVBQUUsU0FBUyxHQUFHLEVBQUU7QUFDM0IsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUM7QUFDaEMsS0FBSztBQUNMO0FBQ0E7QUFDQSxJQUFJLGFBQWEsRUFBRSxXQUFXO0FBQzlCLFFBQVEsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFO0FBQzVCLFlBQVksT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRTtBQUNqRCxTQUFTLE1BQU07QUFDZixZQUFZLE9BQU8sSUFBSSxDQUFDO0FBQ3hCLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLGFBQWEsRUFBRSxTQUFTLFVBQVUsRUFBRTtBQUN4QyxRQUFRLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRTtBQUM1QixZQUFZLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDO0FBQzNELFNBQVM7QUFDVCxRQUFRLE9BQU8sSUFBSTtBQUNuQixLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksYUFBYSxFQUFFLFdBQVc7QUFDOUIsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDekIsWUFBWSxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO0FBQzlDLFNBQVM7QUFDVDtBQUNBLFFBQVEsT0FBTyxDQUFDLElBQUksQ0FBQyx5RUFBeUUsRUFBQztBQUMvRixRQUFRLE9BQU8sSUFBSTtBQUNuQixLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksSUFBSSxFQUFFLFVBQVUsSUFBSSxFQUFFO0FBQzFCLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTTtBQUNoQztBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtBQUN2QztBQUNBLFlBQVksTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO0FBQzFGLFlBQVksSUFBSSxrQkFBa0IsR0FBRyxHQUFFO0FBQ3ZDO0FBQ0EsWUFBWSxJQUFJLGFBQWEsRUFBRSxhQUFhLENBQUM7QUFDN0MsWUFBWSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ3BFLFlBQVksSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsT0FBTztBQUMzQztBQUNBLFlBQVksSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLGdCQUFlO0FBQzlDLFlBQVksSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEtBQUssT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFO0FBQ3BHLGNBQWMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDM0UsYUFBYTtBQUNiLFlBQVk7QUFDWixjQUFjLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sS0FBSyxPQUFPO0FBQzlELGNBQWMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJO0FBQ2hELGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYztBQUN0QyxjQUFjO0FBQ2QsY0FBYyxhQUFhLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztBQUM3RSxhQUFhO0FBQ2IsWUFBWSxJQUFJLGFBQWEsRUFBRTtBQUMvQixnQkFBZ0IsSUFBSSxHQUFHLEdBQUcsYUFBYSxDQUFDLFNBQVE7QUFDaEQsZ0JBQWdCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsTUFBTSxHQUFFO0FBQ2hHLGdCQUFnQixHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBQztBQUM5QyxnQkFBZ0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBQztBQUM1QztBQUNBLGdCQUFnQixrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBQztBQUN2RCxhQUFhO0FBQ2IsWUFBWTtBQUNaLGNBQWMsV0FBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxLQUFLLE9BQU87QUFDL0QsY0FBYyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUk7QUFDakQsY0FBYyxDQUFDLFFBQVEsQ0FBQyxlQUFlO0FBQ3ZDLGNBQWM7QUFDZCxjQUFjLGFBQWEsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO0FBQzlFLGFBQWE7QUFDYixZQUFZLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsT0FBTyxLQUFLLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRTtBQUN0RyxnQkFBZ0IsYUFBYSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDOUUsYUFBYTtBQUNiLFlBQVksSUFBSSxhQUFhLEVBQUU7QUFDL0IsZ0JBQWdCLElBQUksR0FBRyxHQUFHLGFBQWEsQ0FBQyxTQUFRO0FBQ2hELGdCQUFnQixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRTtBQUNoRyxnQkFBZ0IsR0FBRyxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUM7QUFDOUMsZ0JBQWdCLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUM7QUFDNUMsZ0JBQWdCLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFDO0FBQ3ZELGFBQWE7QUFDYjtBQUNBLFlBQVksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsZUFBZSxHQUFHLG1CQUFrQjtBQUN2RSxTQUFTO0FBQ1Q7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7QUFDckM7QUFDQSxZQUFZLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRTtBQUM5RDtBQUNBO0FBQ0EsWUFBWSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFO0FBQ3hDLGdCQUFnQixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxNQUFLO0FBQzlDLGdCQUFnQixJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFDO0FBQ3ZFLGFBQWE7QUFDYixTQUFTO0FBQ1Q7QUFDQSxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUM5QixLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsSUFBSSxhQUFhLEVBQUUsWUFBWTtBQUMvQixRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxFQUFFLEVBQUU7QUFDbEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQVksSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBUztBQUMvRCxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEVBQUM7QUFDOUQ7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQzFDLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxxREFBcUQsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFDO0FBQzlGLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFJO0FBQ3JDLFNBQVMsTUFBTTtBQUNmLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUMsQ0FBQyxFQUFDO0FBQzFDLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLFVBQVUsRUFBRSxrQkFBa0I7QUFDbEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLFVBQVUsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBQztBQUMzRCxRQUFRLElBQUksQ0FBQyxVQUFVLEVBQUU7QUFDekIsWUFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLGtEQUFrRCxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUNsRyxZQUFZLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSTtBQUM5QixZQUFZLE9BQU87QUFDbkIsU0FBUztBQUNULFFBQVEsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLEdBQUU7QUFDbEMsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUM7QUFDeEIsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBRyxLQUFJO0FBQzFDO0FBQ0E7QUFDQSxTQUFTLE1BQU07QUFDZixZQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMsMERBQTBELEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQzFHLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLGFBQWEsRUFBRSxZQUFZO0FBQy9CLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtBQUN2QyxZQUFZLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFDO0FBQ3ZGLFNBQVM7QUFDVCxRQUFRLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUM7QUFDakQsUUFBUSxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUk7QUFDbkM7QUFDQSxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFFO0FBQzdCLFFBQVEsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFJO0FBQzFCLEtBQUs7QUFDTCxDQUFDLEVBQUM7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLEVBQUU7QUFDeEMsSUFBSSxNQUFNLEVBQUU7QUFDWixRQUFRLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQztBQUNuRCxLQUFLO0FBQ0wsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QixRQUFRLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDM0QsUUFBUSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNEO0FBQ0EsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUM7QUFDbEQsUUFBUSxJQUFJO0FBQ1osWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFDO0FBQ2pGLFlBQVksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDL0UsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFO0FBQ25CLFlBQVksT0FBTyxDQUFDLEtBQUssQ0FBQyw4Q0FBOEMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBQztBQUM3RixZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSTtBQUNsQyxZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRTtBQUNoQyxTQUFTO0FBQ1QsUUFBUSxJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztBQUM3QixLQUFLO0FBQ0w7QUFDQSxJQUFJLE1BQU0sR0FBRztBQUNiLFFBQVEsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLElBQUksQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUNuRSxRQUFRLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtBQUMxQixZQUFZLElBQUk7QUFDaEIsZ0JBQWdCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFDO0FBQ3RGO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztBQUN2RCxnQkFBZ0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFJO0FBQ25DLGFBQWEsQ0FBQyxNQUFNLENBQUMsRUFBRTtBQUN2QixnQkFBZ0IsT0FBTyxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsRUFBRSxDQUFDLEVBQUM7QUFDakYsZ0JBQWdCLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRTtBQUNwQyxnQkFBZ0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFFO0FBQ3BDLGFBQWE7QUFDYixTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxJQUFJLEdBQUc7QUFDWCxRQUFRLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFO0FBQzFDO0FBQ0EsWUFBWSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7QUFDM0IsZ0JBQWdCLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUMzRixhQUFhO0FBQ2IsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksYUFBYSxHQUFHO0FBQ3BCLFFBQVEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxPQUFPLEtBQUssQ0FBQztBQUMxRjtBQUNBLFFBQVEsT0FBTyxJQUFJLENBQUM7QUFDcEIsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksYUFBYSxDQUFDLFVBQVUsRUFBRTtBQUM5QixRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFDMUY7QUFDQSxRQUFRLElBQUk7QUFDWixZQUFZLElBQUksVUFBVSxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUM7QUFDM0UsWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLFdBQVU7QUFDeEMsWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLFdBQVU7QUFDeEMsWUFBWSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQzFFLFlBQVksT0FBTyxJQUFJO0FBQ3ZCLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRTtBQUNwQixZQUFZLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0RBQWtELEVBQUM7QUFDN0UsWUFBWSxPQUFPLEtBQUs7QUFDeEIsU0FBUztBQUNULEtBQUs7QUFDTCxDQUFDLENBQUMsQ0FBQztBQUNIO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUNsRDtBQUNBLE1BQU0sQ0FBQyxrQkFBa0I7QUFDekIsSUFBSSxXQUFXO0FBQ2YsSUFBSSxDQUFDO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEVBQUUsQ0FBQztBQUNILElBQUc7QUFpQkg7QUFDQSxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztBQUNoQixHQUFHLFFBQVEsRUFBRSxvQkFBb0I7QUFDakMsSUFBSSxVQUFVLEVBQUU7QUFDaEI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJO0FBQ0osT0FBTyxTQUFTLEVBQUUsYUFBYTtBQUMvQixPQUFPLFFBQVEsRUFBRSxZQUFZO0FBQzdCLEtBQUssQ0FBQztBQUNOLE1BQU0sdUJBQXVCLEVBQUU7QUFDL0IsTUFBTTtBQUNOLFlBQVksU0FBUyxFQUFFLGFBQWE7QUFDcEMsWUFBWSxRQUFRLEVBQUUsWUFBWTtBQUNsQyxPQUFPO0FBQ1AsS0FBSztBQUNMO0FBQ0EsR0FBRyxDQUFDOztBQ25xQkosTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDLENBQUE7QUFDeEUsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUE7QUFDMUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUE7QUFDOUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUE7QUFFcEU7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQUNBIn0=
