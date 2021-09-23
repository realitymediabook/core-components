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
        this.cubeCamera = new THREE.CubeCamera(1, 100000, new THREE.WebGLCubeRenderTarget(1024));
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

      if (this.portalType == 1 && dist < 0.5) {
        console.log("set window.location.href to " + this.other);
        window.location.href = this.other;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wcm94aW1pdHktZXZlbnRzLmpzIiwiLi4vc3JjL3NoYWRlcnMvcG9ydGFsLnZlcnQuanMiLCIuLi9zcmMvc2hhZGVycy9wb3J0YWwuZnJhZy5qcyIsIi4uL3NyYy9zaGFkZXJzL3Nub2lzZS5qcyIsIi4uL3NyYy91dGlscy9jb21wb25lbnQtdXRpbHMuanMiLCIuLi9zcmMvdXRpbHMvc2NlbmUtZ3JhcGguanMiLCIuLi9zcmMvY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wb3J0YWwuanMiLCIuLi9zcmMvY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzIiwiLi4vc3JjL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcGFyYWxsYXguanMiLCIuLi9zcmMvY29tcG9uZW50cy9odG1sLXNjcmlwdC5qcyIsIi4uL3NyYy9yb29tcy9pbmRleC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdmYWRlci1wbHVzJywge1xuICBzY2hlbWE6IHtcbiAgICBkaXJlY3Rpb246IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdub25lJyB9LCAvLyBcImluXCIsIFwib3V0XCIsIG9yIFwibm9uZVwiXG4gICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDIwMCB9LCAvLyBUcmFuc2l0aW9uIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kc1xuICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6ICd3aGl0ZScgfSxcbiAgfSxcblxuICBpbml0KCkge1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgpLFxuICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgY29sb3I6IHRoaXMuZGF0YS5jb2xvcixcbiAgICAgICAgc2lkZTogVEhSRUUuQmFja1NpZGUsXG4gICAgICAgIG9wYWNpdHk6IDAsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBmb2c6IGZhbHNlLFxuICAgICAgfSlcbiAgICApXG4gICAgbWVzaC5zY2FsZS54ID0gbWVzaC5zY2FsZS55ID0gMVxuICAgIG1lc2guc2NhbGUueiA9IDAuMTVcbiAgICBtZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgIG1lc2gucmVuZGVyT3JkZXIgPSAxIC8vIHJlbmRlciBhZnRlciBvdGhlciB0cmFuc3BhcmVudCBzdHVmZlxuICAgIHRoaXMuZWwuY2FtZXJhLmFkZChtZXNoKVxuICAgIHRoaXMubWVzaCA9IG1lc2hcbiAgfSxcblxuICBmYWRlT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmJlZ2luVHJhbnNpdGlvbignb3V0JylcbiAgfSxcblxuICBmYWRlSW4oKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdpbicpXG4gIH0sXG5cbiAgYXN5bmMgYmVnaW5UcmFuc2l0aW9uKGRpcmVjdGlvbikge1xuICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmYWRlIHdoaWxlIGEgZmFkZSBpcyBoYXBwZW5pbmcuJylcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uIH0pXG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcykgPT4ge1xuICAgICAgaWYgKHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID09PSAoZGlyZWN0aW9uID09ICdpbicgPyAwIDogMSkpIHtcbiAgICAgICAgcmVzKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSByZXNcbiAgICAgIH1cbiAgICB9KVxuICB9LFxuXG4gIHRpY2sodCwgZHQpIHtcbiAgICBjb25zdCBtYXQgPSB0aGlzLm1lc2gubWF0ZXJpYWxcbiAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnIHx8IG1hdC5vcGFjaXR5ICE9PSAwXG4gICAgaWYgKCF0aGlzLm1lc2gudmlzaWJsZSkgcmV0dXJuXG5cbiAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ2luJykge1xuICAgICAgbWF0Lm9wYWNpdHkgPSBNYXRoLm1heCgwLCBtYXQub3BhY2l0eSAtICgxLjAgLyB0aGlzLmRhdGEuZHVyYXRpb24pICogTWF0aC5taW4oZHQsIDUwKSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWluKDEsIG1hdC5vcGFjaXR5ICsgKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH1cblxuICAgIGlmIChtYXQub3BhY2l0eSA9PT0gMCB8fCBtYXQub3BhY2l0eSA9PT0gMSkge1xuICAgICAgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gIT09ICdub25lJykge1xuICAgICAgICBpZiAodGhpcy5fcmVzb2x2ZUZpbmlzaCkge1xuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2goKVxuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSBudWxsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2ZhZGVyLXBsdXMnLCB7IGRpcmVjdGlvbjogJ25vbmUnIH0pXG4gICAgfVxuICB9LFxufSlcbiIsImNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3Byb3hpbWl0eS1ldmVudHMnLCB7XG4gIHNjaGVtYToge1xuICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9LFxuICB9LFxuICBpbml0KCkge1xuICAgIHRoaXMuaW5ab25lID0gZmFsc2VcbiAgICB0aGlzLmNhbWVyYSA9IHRoaXMuZWwuc2NlbmVFbC5jYW1lcmFcbiAgfSxcbiAgdGljaygpIHtcbiAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgY29uc3Qgd2FzSW56b25lID0gdGhpcy5pblpvbmVcbiAgICB0aGlzLmluWm9uZSA9IHdvcmxkQ2FtZXJhLmRpc3RhbmNlVG8od29ybGRTZWxmKSA8IHRoaXMuZGF0YS5yYWRpdXNcbiAgICBpZiAodGhpcy5pblpvbmUgJiYgIXdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHllbnRlcicpXG4gICAgaWYgKCF0aGlzLmluWm9uZSAmJiB3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5bGVhdmUnKVxuICB9LFxufSlcbiIsImNvbnN0IGdsc2wgPSBgXG52YXJ5aW5nIHZlYzIgdlV2O1xudmFyeWluZyB2ZWMzIHZSYXk7XG52YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxudm9pZCBtYWluKCkge1xuICB2VXYgPSB1djtcbiAgLy8gdk5vcm1hbCA9IG5vcm1hbE1hdHJpeCAqIG5vcm1hbDtcbiAgdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlKG1vZGVsTWF0cml4KSAqIHZlYzQoY2FtZXJhUG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgdlJheSA9IHBvc2l0aW9uIC0gY2FtZXJhTG9jYWw7XG4gIHZOb3JtYWwgPSBub3JtYWxpemUoLTEuICogdlJheSk7XG4gIGZsb2F0IGRpc3QgPSBsZW5ndGgoY2FtZXJhTG9jYWwpO1xuICB2UmF5LnogKj0gMS4zIC8gKDEuICsgcG93KGRpc3QsIDAuNSkpOyAvLyBDaGFuZ2UgRk9WIGJ5IHNxdWFzaGluZyBsb2NhbCBaIGRpcmVjdGlvblxuICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KHBvc2l0aW9uLCAxLjApO1xufVxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiY29uc3QgZ2xzbCA9IGBcbnVuaWZvcm0gc2FtcGxlckN1YmUgY3ViZU1hcDtcbnVuaWZvcm0gZmxvYXQgdGltZTtcbnVuaWZvcm0gZmxvYXQgcmFkaXVzO1xudW5pZm9ybSB2ZWMzIHJpbmdDb2xvcjtcblxudmFyeWluZyB2ZWMyIHZVdjtcbnZhcnlpbmcgdmVjMyB2UmF5O1xudmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiNkZWZpbmUgUklOR19XSURUSCAwLjFcbiNkZWZpbmUgUklOR19IQVJEX09VVEVSIDAuMDFcbiNkZWZpbmUgUklOR19IQVJEX0lOTkVSIDAuMDhcbiNkZWZpbmUgZm9yd2FyZCB2ZWMzKDAuMCwgMC4wLCAxLjApXG5cbnZvaWQgbWFpbigpIHtcbiAgdmVjMiBjb29yZCA9IHZVdiAqIDIuMCAtIDEuMDtcbiAgZmxvYXQgbm9pc2UgPSBzbm9pc2UodmVjMyhjb29yZCAqIDEuLCB0aW1lKSkgKiAwLjUgKyAwLjU7XG5cbiAgLy8gUG9sYXIgZGlzdGFuY2VcbiAgZmxvYXQgZGlzdCA9IGxlbmd0aChjb29yZCk7XG4gIGRpc3QgKz0gbm9pc2UgKiAwLjI7XG5cbiAgZmxvYXQgbWFza091dGVyID0gMS4wIC0gc21vb3Roc3RlcChyYWRpdXMgLSBSSU5HX0hBUkRfT1VURVIsIHJhZGl1cywgZGlzdCk7XG4gIGZsb2F0IG1hc2tJbm5lciA9IDEuMCAtIHNtb290aHN0ZXAocmFkaXVzIC0gUklOR19XSURUSCwgcmFkaXVzIC0gUklOR19XSURUSCArIFJJTkdfSEFSRF9JTk5FUiwgZGlzdCk7XG4gIGZsb2F0IGRpc3RvcnRpb24gPSBzbW9vdGhzdGVwKHJhZGl1cyAtIDAuMiwgcmFkaXVzICsgMC4yLCBkaXN0KTtcbiAgdmVjMyBub3JtYWwgPSBub3JtYWxpemUodk5vcm1hbCk7XG4gIGZsb2F0IGRpcmVjdFZpZXcgPSBzbW9vdGhzdGVwKDAuLCAwLjgsIGRvdChub3JtYWwsIGZvcndhcmQpKTtcbiAgdmVjMyB0YW5nZW50T3V0d2FyZCA9IHZlYzMoY29vcmQsIDAuMCk7XG4gIHZlYzMgcmF5ID0gbWl4KHZSYXksIHRhbmdlbnRPdXR3YXJkLCBkaXN0b3J0aW9uKTtcbiAgdmVjNCB0ZXhlbCA9IHRleHR1cmVDdWJlKGN1YmVNYXAsIHJheSk7XG4gIHZlYzMgY2VudGVyTGF5ZXIgPSB0ZXhlbC5yZ2IgKiBtYXNrSW5uZXI7XG4gIHZlYzMgcmluZ0xheWVyID0gcmluZ0NvbG9yICogKDEuIC0gbWFza0lubmVyKTtcbiAgdmVjMyBjb21wb3NpdGUgPSBjZW50ZXJMYXllciArIHJpbmdMYXllcjtcblxuICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbXBvc2l0ZSwgKG1hc2tPdXRlciAtIG1hc2tJbm5lcikgKyBtYXNrSW5uZXIgKiBkaXJlY3RWaWV3KTtcbn1cbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsIi8qXG4gKiAzRCBTaW1wbGV4IG5vaXNlXG4gKiBTSUdOQVRVUkU6IGZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaHVnaHNrL2dsc2wtbm9pc2VcbiAqL1xuXG5jb25zdCBnbHNsID0gYFxuLy9cbi8vIERlc2NyaXB0aW9uIDogQXJyYXkgYW5kIHRleHR1cmVsZXNzIEdMU0wgMkQvM0QvNEQgc2ltcGxleFxuLy8gICAgICAgICAgICAgICBub2lzZSBmdW5jdGlvbnMuXG4vLyAgICAgIEF1dGhvciA6IElhbiBNY0V3YW4sIEFzaGltYSBBcnRzLlxuLy8gIE1haW50YWluZXIgOiBpam1cbi8vICAgICBMYXN0bW9kIDogMjAxMTA4MjIgKGlqbSlcbi8vICAgICBMaWNlbnNlIDogQ29weXJpZ2h0IChDKSAyMDExIEFzaGltYSBBcnRzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy8gICAgICAgICAgICAgICBEaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMSUNFTlNFIGZpbGUuXG4vLyAgICAgICAgICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hc2hpbWEvd2ViZ2wtbm9pc2Vcbi8vXG5cbnZlYzMgbW9kMjg5KHZlYzMgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IG1vZDI4OSh2ZWM0IHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBwZXJtdXRlKHZlYzQgeCkge1xuICAgICByZXR1cm4gbW9kMjg5KCgoeCozNC4wKSsxLjApKngpO1xufVxuXG52ZWM0IHRheWxvckludlNxcnQodmVjNCByKVxue1xuICByZXR1cm4gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiByO1xufVxuXG5mbG9hdCBzbm9pc2UodmVjMyB2KVxuICB7XG4gIGNvbnN0IHZlYzIgIEMgPSB2ZWMyKDEuMC82LjAsIDEuMC8zLjApIDtcbiAgY29uc3QgdmVjNCAgRCA9IHZlYzQoMC4wLCAwLjUsIDEuMCwgMi4wKTtcblxuLy8gRmlyc3QgY29ybmVyXG4gIHZlYzMgaSAgPSBmbG9vcih2ICsgZG90KHYsIEMueXl5KSApO1xuICB2ZWMzIHgwID0gICB2IC0gaSArIGRvdChpLCBDLnh4eCkgO1xuXG4vLyBPdGhlciBjb3JuZXJzXG4gIHZlYzMgZyA9IHN0ZXAoeDAueXp4LCB4MC54eXopO1xuICB2ZWMzIGwgPSAxLjAgLSBnO1xuICB2ZWMzIGkxID0gbWluKCBnLnh5eiwgbC56eHkgKTtcbiAgdmVjMyBpMiA9IG1heCggZy54eXosIGwuenh5ICk7XG5cbiAgLy8gICB4MCA9IHgwIC0gMC4wICsgMC4wICogQy54eHg7XG4gIC8vICAgeDEgPSB4MCAtIGkxICArIDEuMCAqIEMueHh4O1xuICAvLyAgIHgyID0geDAgLSBpMiAgKyAyLjAgKiBDLnh4eDtcbiAgLy8gICB4MyA9IHgwIC0gMS4wICsgMy4wICogQy54eHg7XG4gIHZlYzMgeDEgPSB4MCAtIGkxICsgQy54eHg7XG4gIHZlYzMgeDIgPSB4MCAtIGkyICsgQy55eXk7IC8vIDIuMCpDLnggPSAxLzMgPSBDLnlcbiAgdmVjMyB4MyA9IHgwIC0gRC55eXk7ICAgICAgLy8gLTEuMCszLjAqQy54ID0gLTAuNSA9IC1ELnlcblxuLy8gUGVybXV0YXRpb25zXG4gIGkgPSBtb2QyODkoaSk7XG4gIHZlYzQgcCA9IHBlcm11dGUoIHBlcm11dGUoIHBlcm11dGUoXG4gICAgICAgICAgICAgaS56ICsgdmVjNCgwLjAsIGkxLnosIGkyLnosIDEuMCApKVxuICAgICAgICAgICArIGkueSArIHZlYzQoMC4wLCBpMS55LCBpMi55LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnggKyB2ZWM0KDAuMCwgaTEueCwgaTIueCwgMS4wICkpO1xuXG4vLyBHcmFkaWVudHM6IDd4NyBwb2ludHMgb3ZlciBhIHNxdWFyZSwgbWFwcGVkIG9udG8gYW4gb2N0YWhlZHJvbi5cbi8vIFRoZSByaW5nIHNpemUgMTcqMTcgPSAyODkgaXMgY2xvc2UgdG8gYSBtdWx0aXBsZSBvZiA0OSAoNDkqNiA9IDI5NClcbiAgZmxvYXQgbl8gPSAwLjE0Mjg1NzE0Mjg1NzsgLy8gMS4wLzcuMFxuICB2ZWMzICBucyA9IG5fICogRC53eXogLSBELnh6eDtcblxuICB2ZWM0IGogPSBwIC0gNDkuMCAqIGZsb29yKHAgKiBucy56ICogbnMueik7ICAvLyAgbW9kKHAsNyo3KVxuXG4gIHZlYzQgeF8gPSBmbG9vcihqICogbnMueik7XG4gIHZlYzQgeV8gPSBmbG9vcihqIC0gNy4wICogeF8gKTsgICAgLy8gbW9kKGosTilcblxuICB2ZWM0IHggPSB4XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgeSA9IHlfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCBoID0gMS4wIC0gYWJzKHgpIC0gYWJzKHkpO1xuXG4gIHZlYzQgYjAgPSB2ZWM0KCB4Lnh5LCB5Lnh5ICk7XG4gIHZlYzQgYjEgPSB2ZWM0KCB4Lnp3LCB5Lnp3ICk7XG5cbiAgLy92ZWM0IHMwID0gdmVjNChsZXNzVGhhbihiMCwwLjApKSoyLjAgLSAxLjA7XG4gIC8vdmVjNCBzMSA9IHZlYzQobGVzc1RoYW4oYjEsMC4wKSkqMi4wIC0gMS4wO1xuICB2ZWM0IHMwID0gZmxvb3IoYjApKjIuMCArIDEuMDtcbiAgdmVjNCBzMSA9IGZsb29yKGIxKSoyLjAgKyAxLjA7XG4gIHZlYzQgc2ggPSAtc3RlcChoLCB2ZWM0KDAuMCkpO1xuXG4gIHZlYzQgYTAgPSBiMC54enl3ICsgczAueHp5dypzaC54eHl5IDtcbiAgdmVjNCBhMSA9IGIxLnh6eXcgKyBzMS54enl3KnNoLnp6d3cgO1xuXG4gIHZlYzMgcDAgPSB2ZWMzKGEwLnh5LGgueCk7XG4gIHZlYzMgcDEgPSB2ZWMzKGEwLnp3LGgueSk7XG4gIHZlYzMgcDIgPSB2ZWMzKGExLnh5LGgueik7XG4gIHZlYzMgcDMgPSB2ZWMzKGExLnp3LGgudyk7XG5cbi8vTm9ybWFsaXNlIGdyYWRpZW50c1xuICB2ZWM0IG5vcm0gPSB0YXlsb3JJbnZTcXJ0KHZlYzQoZG90KHAwLHAwKSwgZG90KHAxLHAxKSwgZG90KHAyLCBwMiksIGRvdChwMyxwMykpKTtcbiAgcDAgKj0gbm9ybS54O1xuICBwMSAqPSBub3JtLnk7XG4gIHAyICo9IG5vcm0uejtcbiAgcDMgKj0gbm9ybS53O1xuXG4vLyBNaXggZmluYWwgbm9pc2UgdmFsdWVcbiAgdmVjNCBtID0gbWF4KDAuNiAtIHZlYzQoZG90KHgwLHgwKSwgZG90KHgxLHgxKSwgZG90KHgyLHgyKSwgZG90KHgzLHgzKSksIDAuMCk7XG4gIG0gPSBtICogbTtcbiAgcmV0dXJuIDQyLjAgKiBkb3QoIG0qbSwgdmVjNCggZG90KHAwLHgwKSwgZG90KHAxLHgxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHAyLHgyKSwgZG90KHAzLHgzKSApICk7XG4gIH0gIFxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiLy8gUHJvdmlkZXMgYSBnbG9iYWwgcmVnaXN0cnkgb2YgcnVubmluZyBjb21wb25lbnRzXG4vLyBjb3BpZWQgZnJvbSBodWJzIHNvdXJjZVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZShjb21wb25lbnQsIG5hbWUpIHtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5ID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCB7fTtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSB8fCBbXTtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLnB1c2goY29tcG9uZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZShjb21wb25lbnQsIG5hbWUpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0pIHJldHVybjtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLnNwbGljZSh3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLmluZGV4T2YoY29tcG9uZW50KSwgMSk7XG59XG4gICIsIi8vIGNvcGllZCBmcm9tIGh1YnNcblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQoZW50aXR5LCBjb21wb25lbnROYW1lKSB7XG4gICAgd2hpbGUgKGVudGl0eSAmJiAhKGVudGl0eS5jb21wb25lbnRzICYmIGVudGl0eS5jb21wb25lbnRzW2NvbXBvbmVudE5hbWVdKSkge1xuICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGU7XG4gICAgfVxuICAgIHJldHVybiBlbnRpdHk7XG4gIH1cbiAgXG4gIGV4cG9ydCBmdW5jdGlvbiBmaW5kQ29tcG9uZW50c0luTmVhcmVzdEFuY2VzdG9yKGVudGl0eSwgY29tcG9uZW50TmFtZSkge1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBbXTtcbiAgICB3aGlsZSAoZW50aXR5KSB7XG4gICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgZm9yIChjb25zdCBjIGluIGVudGl0eS5jb21wb25lbnRzKSB7XG4gICAgICAgICAgaWYgKGVudGl0eS5jb21wb25lbnRzW2NdLm5hbWUgPT09IGNvbXBvbmVudE5hbWUpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudHMucHVzaChlbnRpdHkuY29tcG9uZW50c1tjXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gICAgICB9XG4gICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gIH1cbiAgIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGJyZWFrIHRoZSByb29tIGludG8gcXVhZHJhbnRzIG9mIGEgY2VydGFpbiBzaXplLCBhbmQgaGlkZSB0aGUgY29udGVudHMgb2YgYXJlYXMgdGhhdCBoYXZlXG4gKiBub2JvZHkgaW4gdGhlbS4gIE1lZGlhIHdpbGwgYmUgcGF1c2VkIGluIHRob3NlIGFyZWFzIHRvby5cbiAqIFxuICogSW5jbHVkZSBhIHdheSBmb3IgdGhlIHBvcnRhbCBjb21wb25lbnQgdG8gdHVybiBvbiBlbGVtZW50cyBpbiB0aGUgcmVnaW9uIG9mIHRoZSBwb3J0YWwgYmVmb3JlXG4gKiBpdCBjYXB0dXJlcyBhIGN1YmVtYXBcbiAqL1xuXG5pbXBvcnQgeyByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlLCBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UgfSBmcm9tIFwiLi4vdXRpbHMvY29tcG9uZW50LXV0aWxzXCI7XG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSBcIi4uL3V0aWxzL3NjZW5lLWdyYXBoXCI7XG5cbiAvLyBhcmJpdHJhcmlseSBjaG9vc2UgMTAwMDAwMCBhcyB0aGUgbnVtYmVyIG9mIGNvbXB1dGVkIHpvbmVzIGluICB4IGFuZCB5XG5sZXQgTUFYX1pPTkVTID0gMTAwMDAwMFxubGV0IHJlZ2lvblRhZyA9IGZ1bmN0aW9uKHNpemUsIG9iajNkKSB7XG4gICAgbGV0IHBvcyA9IG9iajNkLnBvc2l0aW9uXG4gICAgbGV0IHhwID0gTWF0aC5mbG9vcihwb3MueCAvIHNpemUpICsgTUFYX1pPTkVTLzJcbiAgICBsZXQgenAgPSBNYXRoLmZsb29yKHBvcy56IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIHJldHVybiBNQVhfWk9ORVMgKiB4cCArIHpwXG59XG5cbmxldCByZWdpb25zSW5Vc2UgPSBbXVxuXG4vKipcbiAqIEZpbmQgdGhlIGNsb3Nlc3QgYW5jZXN0b3IgKGluY2x1ZGluZyB0aGUgcGFzc2VkIGluIGVudGl0eSkgdGhhdCBoYXMgYW4gYG9iamVjdC1yZWdpb24tZm9sbG93ZXJgIGNvbXBvbmVudCxcbiAqIGFuZCByZXR1cm4gdGhhdCBjb21wb25lbnRcbiAqL1xuZnVuY3Rpb24gZ2V0UmVnaW9uRm9sbG93ZXIoZW50aXR5KSB7XG4gICAgbGV0IGN1ckVudGl0eSA9IGVudGl0eTtcbiAgXG4gICAgd2hpbGUoY3VyRW50aXR5ICYmIGN1ckVudGl0eS5jb21wb25lbnRzICYmICFjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0pIHtcbiAgICAgICAgY3VyRW50aXR5ID0gY3VyRW50aXR5LnBhcmVudE5vZGU7XG4gICAgfVxuICBcbiAgICBpZiAoIWN1ckVudGl0eSB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHMgfHwgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl1cbn1cbiAgXG5mdW5jdGlvbiBhZGRUb1JlZ2lvbihyZWdpb24pIHtcbiAgICByZWdpb25zSW5Vc2VbcmVnaW9uXSA/IHJlZ2lvbnNJblVzZVtyZWdpb25dKysgOiByZWdpb25zSW5Vc2VbcmVnaW9uXSA9IDFcbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgaW4gcmVnaW9uIFwiICsgcmVnaW9uICsgXCI6IFwiICsgcmVnaW9uc0luVXNlW3JlZ2lvbl0pXG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dID09IDEpIHtcbiAgICAgICAgc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCB0cnVlKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiYWxyZWFkeSBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBzdWJ0cmFjdEZyb21SZWdpb24ocmVnaW9uKSB7XG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dKSB7cmVnaW9uc0luVXNlW3JlZ2lvbl0tLSB9XG4gICAgY29uc29sZS5sb2coXCJBdmF0YXJzIGxlZnQgcmVnaW9uIFwiICsgcmVnaW9uICsgXCI6IFwiICsgcmVnaW9uc0luVXNlW3JlZ2lvbl0pXG5cbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMCkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIGZhbHNlKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwic3RpbGwgYW5vdGhlciBhdmF0YXIgaW4gdGhpcyByZWdpb24sIG5vIGNoYW5nZVwiKVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJzaG93aW5nIG9iamVjdHMgbmVhciBcIiArIGZvbGxvd2VyLmVsLmNsYXNzTmFtZSlcblxuICAgIGFkZFRvUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGVyUmVnaW9uRm9yT2JqZWN0KGVsZW1lbnQpIHtcbiAgICBsZXQgZm9sbG93ZXIgPSBnZXRSZWdpb25Gb2xsb3dlcihlbGVtZW50KVxuICAgIGlmICghZm9sbG93ZXIpIHsgcmV0dXJuIH1cblxuICAgIGNvbnNvbGUubG9nKFwiaGlkaW5nIG9iamVjdHMgbmVhciBcIiArIGZvbGxvd2VyLmVsLmNsYXNzTmFtZSlcblxuICAgIHN1YnRyYWN0RnJvbVJlZ2lvbihmb2xsb3dlci5yZWdpb24pXG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0cygpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGNvbnNvbGUubG9nIChcInNob3dpbmcvaGlkaW5nIGFsbCBvYmplY3RzXCIpXG4gICAgY29uc3Qgb2JqZWN0cyA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdIHx8IFtdO1xuICBcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9iamVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG9iaiA9IG9iamVjdHNbaV07XG4gICAgICBcbiAgICAgIGxldCB2aXNpYmxlID0gcmVnaW9uc0luVXNlW29iai5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICBpZiAob2JqLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyBjb250aW51ZSB9XG5cbiAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiaGlkaW5nIFwiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICBvYmouc2hvd0hpZGUodmlzaWJsZSlcbiAgICB9XG4gIFxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHZpc2libGUpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZ1wiIDogXCJoaWRpbmdcIikgKyBcIiBhbGwgb2JqZWN0cyBpbiByZWdpb24gXCIgKyByZWdpb24pXG4gICAgY29uc3Qgb2JqZWN0cyA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdIHx8IFtdO1xuICBcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9iamVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG9iaiA9IG9iamVjdHNbaV07XG4gICAgICBcbiAgICAgIGlmIChvYmoucmVnaW9uID09IHJlZ2lvbikge1xuICAgICAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmcgXCIgOiBcIiBoaWRpbmdcIikgKyBvYmouZWwuY2xhc3NOYW1lKVxuICAgICAgICBvYmouc2hvd0hpZGUodmlzaWJsZSlcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHJldHVybiBudWxsO1xufVxuICBcbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnYXZhdGFyLXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBjb25zb2xlLmxvZyhcIkF2YXRhcjogcmVnaW9uIFwiLCB0aGlzLnJlZ2lvbilcbiAgICAgICAgYWRkVG9SZWdpb24odGhpcy5yZWdpb24pXG5cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcbiAgICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IG5ld1JlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcbiAgICAgICAgaWYgKG5ld1JlZ2lvbiAhPSB0aGlzLnJlZ2lvbikge1xuICAgICAgICAgICAgc3VidHJhY3RGcm9tUmVnaW9uKHRoaXMucmVnaW9uKVxuICAgICAgICAgICAgYWRkVG9SZWdpb24obmV3UmVnaW9uKVxuICAgICAgICAgICAgdGhpcy5yZWdpb24gPSBuZXdSZWdpb25cbiAgICAgICAgfVxuICAgIH0sXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ29iamVjdC1yZWdpb24tZm9sbG93ZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfSxcbiAgICAgICAgZHluYW1pYzogeyBkZWZhdWx0OiB0cnVlIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgdGhpcy5zaG93SGlkZSA9IHRoaXMuc2hvd0hpZGUuYmluZCh0aGlzKVxuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0pIHtcbiAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICB9XG4gICAgICAgIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIG9iamVjdHMgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGRvbid0IG1vdmVcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEuZHluYW1pYykgeyByZXR1cm4gfVxuXG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuXG4gICAgICAgIGxldCB2aXNpYmxlID0gcmVnaW9uc0luVXNlW3RoaXMucmVnaW9uXSA/IHRydWU6IGZhbHNlXG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID09IHZpc2libGUpIHsgcmV0dXJuIH1cblxuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH0sXG5cbiAgICBzaG93SGlkZTogZnVuY3Rpb24gKHZpc2libGUpIHtcbiAgICAgICAgLy8gaGFuZGxlIHNob3cvaGlkaW5nIHRoZSBvYmplY3RzXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHZpc2libGVcblxuICAgICAgICAvLy8gY2hlY2sgZm9yIG1lZGlhLXZpZGVvIGNvbXBvbmVudCBvbiBwYXJlbnQgdG8gc2VlIGlmIHdlJ3JlIGEgdmlkZW8uICBBbHNvIHNhbWUgZm9yIGF1ZGlvXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgaWYgKHZpc2libGUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy53YXNQYXVzZWQgIT0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS50b2dnbGVQbGF5aW5nKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLndhc1BhdXNlZCA9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWRcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMud2FzUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3JlZ2lvbi1oaWRlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBcIipfY29tcG9uZW50TmFtZVwiXG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBJZiB0aGVyZSBpcyBhIHBhcmVudCB3aXRoIFwibmF2LW1lc2gtaGVscGVyXCIsIHRoaXMgaXMgaW4gdGhlIHNjZW5lLiAgXG4gICAgICAgIC8vIElmIG5vdCwgaXQncyBpbiBhbiBvYmplY3Qgd2UgZHJvcHBlZCBvbiB0aGUgd2luZG93LCB3aGljaCB3ZSBkb24ndCBzdXBwb3J0XG4gICAgICAgIGlmICghZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcIm5hdi1tZXNoLWhlbHBlclwiKSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudCBtdXN0IGJlIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZSBnbGIuXCIpXG4gICAgICAgICAgICB0aGlzLnNpemUgPSAwO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZih0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwO1xuICAgICAgICAgICAgdGhpcy5zaXplID0gdGhpcy5wYXJzZU5vZGVOYW1lKHRoaXMuZGF0YS5zaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRoaXMubmV3U2NlbmUgPSB0aGlzLm5ld1NjZW5lLmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5uZXdTY2VuZSlcbiAgICAgICAgLy8gY29uc3QgZW52aXJvbm1lbnRTY2VuZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZW52aXJvbm1lbnQtc2NlbmVcIik7XG4gICAgICAgIC8vIHRoaXMuYWRkU2NlbmVFbGVtZW50ID0gdGhpcy5hZGRTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudCA9IHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRTY2VuZUVsZW1lbnQpXG4gICAgICAgIC8vIGVudmlyb25tZW50U2NlbmUuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWRldGFjaGVkXCIsIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50KVxuXG4gICAgICAgIC8vIHdlIHdhbnQgdG8gbm90aWNlIHdoZW4gbmV3IHRoaW5ncyBnZXQgYWRkZWQgdG8gdGhlIHJvb20uICBUaGlzIHdpbGwgaGFwcGVuIGZvclxuICAgICAgICAvLyBvYmplY3RzIGRyb3BwZWQgaW4gdGhlIHJvb20sIG9yIGZvciBuZXcgcmVtb3RlIGF2YXRhcnMsIGF0IGxlYXN0XG4gICAgICAgIC8vIHRoaXMuYWRkUm9vdEVsZW1lbnQgPSB0aGlzLmFkZFJvb3RFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5yZW1vdmVSb290RWxlbWVudCA9IHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWF0dGFjaGVkXCIsIHRoaXMuYWRkUm9vdEVsZW1lbnQpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVSb290RWxlbWVudClcblxuICAgICAgICAvLyB3YW50IHRvIHNlZSBpZiB0aGVyZSBhcmUgcGlubmVkIG9iamVjdHMgdGhhdCB3ZXJlIGxvYWRlZCBmcm9tIGh1YnNcbiAgICAgICAgbGV0IHJvb21PYmplY3RzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShcIlJvb21PYmplY3RzXCIpXG4gICAgICAgIHRoaXMucm9vbU9iamVjdHMgPSByb29tT2JqZWN0cy5sZW5ndGggPiAwID8gcm9vbU9iamVjdHNbMF0gOiBudWxsXG5cbiAgICAgICAgLy8gZ2V0IGF2YXRhcnNcbiAgICAgICAgY29uc3QgYXZhdGFycyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXVwiKTtcbiAgICAgICAgYXZhdGFycy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHdhbGsgb2JqZWN0cyBpbiB0aGUgcm9vdCAodGhpbmdzIHRoYXQgaGF2ZSBiZWVuIGRyb3BwZWQgb24gdGhlIHNjZW5lKVxuICAgICAgICAvLyAtIGRyYXdpbmdzIGhhdmUgY2xhc3M9XCJkcmF3aW5nXCIsIG5ldHdvcmtlZC1kcmF3aW5nXG4gICAgICAgIC8vIE5vdCBnb2luZyB0byBkbyBkcmF3aW5ncyByaWdodCBub3cuXG5cbiAgICAgICAgLy8gcGlubmVkIG1lZGlhIGxpdmUgdW5kZXIgYSBub2RlIHdpdGggY2xhc3M9XCJSb29tT2JqZWN0c1wiXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiLlJvb21PYmplY3RzID4gW21lZGlhLWxvYWRlcl1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtIGNhbWVyYSBoYXMgY2FtZXJhLXRvb2wgICAgICAgIFxuICAgICAgICAvLyAtIGltYWdlIGZyb20gY2FtZXJhLCBvciBkcm9wcGVkLCBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS1pbWFnZSwgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vIC0gZ2xiIGhhcyBtZWRpYS1sb2FkZXIsIGdsdGYtbW9kZWwtcGx1cywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vIC0gdmlkZW8gaGFzIG1lZGlhLWxvYWRlciwgbWVkaWEtdmlkZW8sIGxpc3RlZC1tZWRpYVxuICAgICAgICAvL1xuICAgICAgICAvLyAgc28sIGdldCBhbGwgY2FtZXJhLXRvb2xzLCBhbmQgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF0sIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayB0aGUgb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUuICBNdXN0IHdhaXQgZm9yIHNjZW5lIHRvIGZpbmlzaCBsb2FkaW5nXG4gICAgICAgIHRoaXMuc2NlbmVMb2FkZWQgPSB0aGlzLnNjZW5lTG9hZGVkLmJpbmQodGhpcylcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5zY2VuZUxvYWRlZCk7XG5cbiAgICB9LFxuXG4gICAgaXNBbmNlc3RvcjogZnVuY3Rpb24gKHJvb3QsIGVudGl0eSkge1xuICAgICAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5ID09IHJvb3QpKSB7XG4gICAgICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChlbnRpdHkgPT0gcm9vdCk7XG4gICAgfSxcbiAgICBcbiAgICAvLyBUaGluZ3Mgd2UgZG9uJ3Qgd2FudCB0byBoaWRlOlxuICAgIC8vIC0gW3dheXBvaW50XVxuICAgIC8vIC0gcGFyZW50IG9mIHNvbWV0aGluZyB3aXRoIFtuYXZtZXNoXSBhcyBhIGNoaWxkICh0aGlzIGlzIHRoZSBuYXZpZ2F0aW9uIHN0dWZmXG4gICAgLy8gLSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsXG4gICAgLy8gLSBbc2t5Ym94XVxuICAgIC8vIC0gW2RpcmVjdGlvbmFsLWxpZ2h0XVxuICAgIC8vIC0gW2FtYmllbnQtbGlnaHRdXG4gICAgLy8gLSBbaGVtaXNwaGVyZS1saWdodF1cbiAgICAvLyAtICNDb21iaW5lZE1lc2hcbiAgICAvLyAtICNzY2VuZS1wcmV2aWV3LWNhbWVyYSBvciBbc2NlbmUtcHJldmlldy1jYW1lcmFdXG4gICAgLy9cbiAgICAvLyB3ZSB3aWxsIGRvXG4gICAgLy8gLSBbbWVkaWEtbG9hZGVyXVxuICAgIC8vIC0gW3Nwb3QtbGlnaHRdXG4gICAgLy8gLSBbcG9pbnQtbGlnaHRdXG4gICAgc2NlbmVMb2FkZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IG5vZGVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJlbnZpcm9ubWVudC1zY2VuZVwiKS5jaGlsZHJlblswXS5jaGlsZHJlblswXVxuICAgICAgICAvL3ZhciBub2RlcyA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwucGFyZW50RWwuY2hpbGROb2RlcztcbiAgICAgICAgZm9yIChsZXQgaT0wOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBub2RlID0gbm9kZXNbaV1cbiAgICAgICAgICAgIC8vaWYgKG5vZGUgPT0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBbmNlc3Rvcihub2RlLCB0aGlzLmVsKSkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2wgPSBub2RlLmNsYXNzTmFtZVxuICAgICAgICAgICAgaWYgKGNsID09PSBcIkNvbWJpbmVkTWVzaFwiIHx8IGNsID09PSBcInNjZW5lLXByZXZpZXctY2FtZXJhXCIpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGMgPSBub2RlLmNvbXBvbmVudHNcbiAgICAgICAgICAgIGlmIChjW1wid2F5cG9pbnRcIl0gfHwgY1tcInNreWJveFwiXSB8fCBjW1wiZGlyZWN0aW9uYWwtbGlnaHRcIl0gfHwgY1tcImFtYmllbnQtbGlnaHRcIl0gfHwgY1tcImhlbWlzcGhlcmUtbGlnaHRcIl0pIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNoID0gbm9kZS5jaGlsZHJlblxuICAgICAgICAgICAgdmFyIG5hdm1lc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAobGV0IGo9MDsgaiA8IGNoLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoW2pdLmNvbXBvbmVudHNbXCJuYXZtZXNoXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIG5hdm1lc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmF2bWVzaCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUsIGR5bmFtaWM6IGZhbHNlIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBhbGwgb2JqZWN0cyBhbmQgYXZhdGFyIHNob3VsZCBiZSBzZXQgdXAsIHNvIGxldHMgbWFrZSBzdXJlIGFsbCBvYmplY3RzIGFyZSBjb3JyZWN0bHkgc2hvd25cbiAgICAgICAgc2hvd0hpZGVPYmplY3RzKClcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PT0gdGhpcy5zaXplKSByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5kYXRhLnNpemUgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnNpemUgPSAxMFxuICAgICAgICAgICAgdGhpcy5zaXplID0gdGhpcy5wYXJzZU5vZGVOYW1lKHRoaXMuZGF0YS5zaXplKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5zY2VuZUxvYWRlZCk7XG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIC8vIHNpemUgPT0gMCBpcyB1c2VkIHRvIHNpZ25hbCBcImRvIG5vdGhpbmdcIlxuICAgICAgICBpZiAodGhpcy5zaXplID09IDApIHtyZXR1cm59XG5cbiAgICAgICAgLy8gc2VlIGlmIHRoZXJlIGFyZSBuZXcgYXZhdGFyc1xuICAgICAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltwbGF5ZXItaW5mb106bm90KFthdmF0YXItcmVnaW9uLWZvbGxvd2VyXSlcIilcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgoYXZhdGFyKSA9PiB7XG4gICAgICAgICAgICBhdmF0YXIuc2V0QXR0cmlidXRlKFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAgc2VlIGlmIHRoZXJlIGFyZSBuZXcgY2FtZXJhLXRvb2xzIG9yIG1lZGlhLWxvYWRlciBvYmplY3RzIGF0IHRoZSB0b3AgbGV2ZWwgb2YgdGhlIHNjZW5lXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdOm5vdChbb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcl0pLCBhLXNjZW5lID4gW21lZGlhLWxvYWRlcl06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSlcIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcbiAgICB9LFxuICBcbiAgICAvLyBuZXdTY2VuZTogZnVuY3Rpb24obW9kZWwpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnZpcm9ubWVudCBzY2VuZSBsb2FkZWQ6IFwiLCBtb2RlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gYWRkUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byByb290OiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIHJlbW92ZVJvb3RFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgcmVtb3ZlZCBmcm9tIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gYWRkU2NlbmVFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgYWRkZWQgdG8gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlU2NlbmVFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgcmVtb3ZlZCBmcm9tIGVudmlyb25tZW50IHNjZW5lOiBcIiwgZWwpXG4gICAgLy8gfSwgIFxuICAgIFxuICAgIHBhcnNlTm9kZU5hbWU6IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggXG4gICAgICAgIC8vICBcInNpemVcIiAoYW4gaW50ZWdlciBudW1iZXIpXG4gICAgICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gIFRoaXMgd2lsbCBzZXQgdGhlIGhpZGRlciBjb21wb25lbnQgdG8gXG4gICAgICAgIC8vIHVzZSB0aGF0IHNpemUgaW4gbWV0ZXJzIGZvciB0aGUgcXVhZHJhbnRzXG4gICAgICAgIHRoaXMubm9kZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMubm9kZU5hbWUubWF0Y2goL18oWzAtOV0qKSQvKVxuXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiAyLCBmaXJzdCBtYXRjaCBpcyB0aGUgZGlyLFxuICAgICAgICAvLyBzZWNvbmQgaXMgdGhlIGNvbXBvbmVudE5hbWUgbmFtZSBvciBudW1iZXJcbiAgICAgICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJlZ2lvbi1oaWRlciBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5ub2RlTmFtZSlcbiAgICAgICAgICAgIHJldHVybiBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgbm9kZVNpemUgPSBwYXJzZUludChwYXJhbXNbMV0pXG4gICAgICAgICAgICBpZiAoIW5vZGVTaXplKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vZGVTaXplXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59KSIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBCaWRpcmVjdGlvbmFsIHNlZS10aHJvdWdoIHBvcnRhbC4gVHdvIHBvcnRhbHMgYXJlIHBhaXJlZCBieSBjb2xvci5cbiAqXG4gKiBVc2FnZVxuICogPT09PT09PVxuICogQWRkIHR3byBpbnN0YW5jZXMgb2YgYHBvcnRhbC5nbGJgIHRvIHRoZSBTcG9rZSBzY2VuZS5cbiAqIFRoZSBuYW1lIG9mIGVhY2ggaW5zdGFuY2Ugc2hvdWxkIGxvb2sgbGlrZSBcInNvbWUtZGVzY3JpcHRpdmUtbGFiZWxfX2NvbG9yXCJcbiAqIEFueSB2YWxpZCBUSFJFRS5Db2xvciBhcmd1bWVudCBpcyBhIHZhbGlkIGNvbG9yIHZhbHVlLlxuICogU2VlIGhlcmUgZm9yIGV4YW1wbGUgY29sb3IgbmFtZXMgaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9jc3NyZWYvY3NzX2NvbG9ycy5hc3BcbiAqXG4gKiBGb3IgZXhhbXBsZSwgdG8gbWFrZSBhIHBhaXIgb2YgY29ubmVjdGVkIGJsdWUgcG9ydGFscyxcbiAqIHlvdSBjb3VsZCBuYW1lIHRoZW0gXCJwb3J0YWwtdG9fX2JsdWVcIiBhbmQgXCJwb3J0YWwtZnJvbV9fYmx1ZVwiXG4gKi9cblxuaW1wb3J0ICcuL3Byb3hpbWl0eS1ldmVudHMuanMnXG5pbXBvcnQgdmVydGV4U2hhZGVyIGZyb20gJy4uL3NoYWRlcnMvcG9ydGFsLnZlcnQuanMnXG5pbXBvcnQgZnJhZ21lbnRTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwuZnJhZy5qcydcbmltcG9ydCBzbm9pc2UgZnJvbSAnLi4vc2hhZGVycy9zbm9pc2UuanMnXG5pbXBvcnQgeyBzaG93UmVnaW9uRm9yT2JqZWN0LCBoaWRlclJlZ2lvbkZvck9iamVjdCB9IGZyb20gJy4vcmVnaW9uLWhpZGVyLmpzJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuXG5jb25zdCB3b3JsZFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkQ2FtZXJhUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGREaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFF1YXQgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpXG5jb25zdCBtYXQ0ID0gbmV3IFRIUkVFLk1hdHJpeDQoKVxuXG5mdW5jdGlvbiBtYXBNYXRlcmlhbHMob2JqZWN0M0QsIGZuKSB7XG4gICAgbGV0IG1lc2ggPSBvYmplY3QzRCBcbiAgICBpZiAoIW1lc2gubWF0ZXJpYWwpIHJldHVybjtcbiAgXG4gICAgaWYgKEFycmF5LmlzQXJyYXkobWVzaC5tYXRlcmlhbCkpIHtcbiAgICAgIHJldHVybiBtZXNoLm1hdGVyaWFsLm1hcChmbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmbihtZXNoLm1hdGVyaWFsKTtcbiAgICB9XG59XG4gIFxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdwb3J0YWwnLCB7XG4gIGRlcGVuZGVuY2llczogWydmYWRlci1wbHVzJ10sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIgPSB0aGlzLmVsLnN5c3RlbXNbJ2h1YnMtc3lzdGVtcyddLmNoYXJhY3RlckNvbnRyb2xsZXJcbiAgICB0aGlzLmZhZGVyID0gdGhpcy5lbC5zeXN0ZW1zWydmYWRlci1wbHVzJ11cbiAgICB0aGlzLnJvb21EYXRhID0gbnVsbFxuICAgIHRoaXMud2FpdEZvckZldGNoID0gdGhpcy53YWl0Rm9yRmV0Y2guYmluZCh0aGlzKVxuXG4gICAgLy8gaWYgdGhlIHVzZXIgaXMgbG9nZ2VkIGluLCB3ZSB3YW50IHRvIHJldHJpZXZlIHRoZWlyIHVzZXJEYXRhIGZyb20gdGhlIHRvcCBsZXZlbCBzZXJ2ZXJcbiAgICBpZiAod2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscyAmJiB3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzLnRva2VuICYmICF3aW5kb3cuQVBQLnVzZXJEYXRhKSB7XG4gICAgICAgIHRoaXMuZmV0Y2hSb29tRGF0YSgpXG4gICAgfVxuICB9LFxuICBmZXRjaFJvb21EYXRhOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBhcmFtcyA9IHt0b2tlbjogd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbixcbiAgICAgICAgICAgICAgICAgIHJvb21faWQ6IHdpbmRvdy5BUFAuaHViQ2hhbm5lbC5odWJJZH1cblxuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBvcHRpb25zLmhlYWRlcnMgPSBuZXcgSGVhZGVycygpO1xuICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJBdXRob3JpemF0aW9uXCIsIGBCZWFyZXIgJHtwYXJhbXN9YCk7XG4gICAgb3B0aW9ucy5oZWFkZXJzLnNldChcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gICAgYXdhaXQgZmV0Y2goXCJodHRwczovL3JlYWxpdHltZWRpYS5kaWdpdGFsL3VzZXJEYXRhXCIsIG9wdGlvbnMpXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1N1Y2Nlc3M6JywgZGF0YSk7XG4gICAgICAgICAgdGhpcy5yb29tRGF0YSA9IGRhdGE7XG4gICAgfSlcbiAgICB0aGlzLnJvb21EYXRhLnRleHR1cmVzID0gW11cbiAgfSxcbiAgZ2V0Um9vbVVSTDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgLy9yZXR1cm4gdGhpcy5yb29tRGF0YS5yb29tcy5sZW5ndGggPiBudW1iZXIgPyBcImh0dHBzOi8veHIucmVhbGl0eW1lZGlhLmRpZ2l0YWwvXCIgKyB0aGlzLnJvb21EYXRhLnJvb21zW251bWJlcl0gOiBudWxsO1xuICAgICAgbGV0IHVybCA9IHdpbmRvdy5TU08udXNlckluZm8ucm9vbXMubGVuZ3RoID4gbnVtYmVyID8gXCJodHRwczovL3hyLnJlYWxpdHltZWRpYS5kaWdpdGFsL1wiICsgd2luZG93LlNTTy51c2VySW5mby5yb29tc1tudW1iZXJdIDogbnVsbDtcbiAgICAgIHJldHVybiB1cmxcbiAgfSxcbiAgZ2V0Q3ViZU1hcDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgd2FpdEZvckZldGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgIGlmICh0aGlzLnJvb21EYXRhICYmIHdpbmRvdy5TU08udXNlckluZm8pIHJldHVyblxuICAgICBzZXRUaW1lb3V0KHRoaXMud2FpdEZvckZldGNoLCAxMDApOyAvLyB0cnkgYWdhaW4gaW4gMTAwIG1pbGxpc2Vjb25kc1xuICB9LFxuICB0ZWxlcG9ydFRvOiBhc3luYyBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IHRydWVcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVPdXQoKVxuICAgIC8vIFNjYWxlIHNjcmV3cyB1cCB0aGUgd2F5cG9pbnQgbG9naWMsIHNvIGp1c3Qgc2VuZCBwb3NpdGlvbiBhbmQgb3JpZW50YXRpb25cbiAgICBvYmplY3QuZ2V0V29ybGRRdWF0ZXJuaW9uKHdvcmxkUXVhdClcbiAgICBvYmplY3QuZ2V0V29ybGREaXJlY3Rpb24od29ybGREaXIpXG4gICAgb2JqZWN0LmdldFdvcmxkUG9zaXRpb24od29ybGRQb3MpXG4gICAgd29ybGRQb3MuYWRkKHdvcmxkRGlyLm11bHRpcGx5U2NhbGFyKDEuNSkpIC8vIFRlbGVwb3J0IGluIGZyb250IG9mIHRoZSBwb3J0YWwgdG8gYXZvaWQgaW5maW5pdGUgbG9vcFxuICAgIG1hdDQubWFrZVJvdGF0aW9uRnJvbVF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG1hdDQuc2V0UG9zaXRpb24od29ybGRQb3MpXG4gICAgLy8gVXNpbmcgdGhlIGNoYXJhY3RlckNvbnRyb2xsZXIgZW5zdXJlcyB3ZSBkb24ndCBzdHJheSBmcm9tIHRoZSBuYXZtZXNoXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyLnRyYXZlbEJ5V2F5cG9pbnQobWF0NCwgdHJ1ZSwgZmFsc2UpXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlSW4oKVxuICAgIHRoaXMudGVsZXBvcnRpbmcgPSBmYWxzZVxuICB9LFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCB7XG4gIHNjaGVtYToge1xuICAgIHBvcnRhbFR5cGU6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgIHBvcnRhbFRhcmdldDogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogbnVsbCB9LFxuICAgIG1hdGVyaWFsVGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH1cbiAgfSxcbiAgaW5pdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zLnBvcnRhbCAvLyBBLUZyYW1lIGlzIHN1cHBvc2VkIHRvIGRvIHRoaXMgYnkgZGVmYXVsdCBidXQgZG9lc24ndD9cblxuICAgIGlmICh0aGlzLmRhdGEucG9ydGFsVHlwZS5sZW5ndGggPiAwICkge1xuICAgICAgICB0aGlzLnNldFBvcnRhbEluZm8odGhpcy5kYXRhLnBvcnRhbFR5cGUsIHRoaXMuZGF0YS5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5jb2xvcilcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgfVxuXG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAwKSB7XG4gICAgICAgIC8vIHBhcnNlIHRoZSBuYW1lIHRvIGdldCBwb3J0YWwgdHlwZSwgdGFyZ2V0LCBhbmQgY29sb3JcbiAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKClcbiAgICB9XG4gICAgXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBjdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuVGV4dHVyZSgpIH0sXG4gICAgICAgIHRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgcmFkaXVzOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIHJpbmdDb2xvcjogeyB2YWx1ZTogdGhpcy5jb2xvciB9LFxuICAgICAgfSxcbiAgICAgIHZlcnRleFNoYWRlcixcbiAgICAgIGZyYWdtZW50U2hhZGVyOiBgXG4gICAgICAgICR7c25vaXNlfVxuICAgICAgICAke2ZyYWdtZW50U2hhZGVyfVxuICAgICAgYCxcbiAgICB9KVxuXG4gICAgLy8gQXNzdW1lIHRoYXQgdGhlIG9iamVjdCBoYXMgYSBwbGFuZSBnZW9tZXRyeVxuICAgIC8vY29uc3QgbWVzaCA9IHRoaXMuZWwuZ2V0T3JDcmVhdGVPYmplY3QzRCgnbWVzaCcpXG4gICAgLy9tZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuICAgIHRoaXMucmVwbGFjZU1hdGVyaWFsKHRoaXMubWF0ZXJpYWwpXG5cbiAgICAvLyBnZXQgdGhlIG90aGVyIGJlZm9yZSBjb250aW51aW5nXG4gICAgdGhpcy5vdGhlciA9IGF3YWl0IHRoaXMuZ2V0T3RoZXIoKVxuXG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtLmdldEN1YmVNYXAodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4oIHVybHMgPT4ge1xuICAgICAgICAgICAgLy9jb25zdCB1cmxzID0gW2N1YmVNYXBQb3NYLCBjdWJlTWFwTmVnWCwgY3ViZU1hcFBvc1ksIGN1YmVNYXBOZWdZLCBjdWJlTWFwUG9zWiwgY3ViZU1hcE5lZ1pdO1xuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgIG5ldyBUSFJFRS5DdWJlVGV4dHVyZUxvYWRlcigpLmxvYWQodXJscywgcmVzb2x2ZSwgdW5kZWZpbmVkLCByZWplY3QpXG4gICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGV4dHVyZTtcbiAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgIH0pXG4gICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikgeyAgICBcbiAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IFRIUkVFLkN1YmVDYW1lcmEoMSwgMTAwMDAwLCBuZXcgVEhSRUUuV2ViR0xDdWJlUmVuZGVyVGFyZ2V0KDEwMjQpKVxuICAgICAgICB0aGlzLmN1YmVDYW1lcmEucm90YXRlWShNYXRoLlBJKSAvLyBGYWNlIGZvcndhcmRzXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCAoKSA9PiB7XG4gICAgICAgICAgICBzaG93UmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEudXBkYXRlKHRoaXMuZWwuc2NlbmVFbC5yZW5kZXJlciwgdGhpcy5lbC5zY2VuZUVsLm9iamVjdDNEKVxuICAgICAgICAgICAgaGlkZXJSZWdpb25Gb3JPYmplY3QodGhpcy5lbClcbiAgICAgICAgfSlcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnYW5pbWF0aW9uX19wb3J0YWwnLCB7XG4gICAgICAgIHByb3BlcnR5OiAnY29tcG9uZW50cy5wb3J0YWwubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlJyxcbiAgICAgICAgZHVyOiA3MDAsXG4gICAgICAgIGVhc2luZzogJ2Vhc2VJbk91dEN1YmljJyxcbiAgICB9KVxuICAgIC8vIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uYmVnaW4nLCAoKSA9PiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdHJ1ZSkpXG4gICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25jb21wbGV0ZV9fcG9ydGFsJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9ICF0aGlzLmlzQ2xvc2VkKCkpKVxuXG4gICAgLy8gZ29pbmcgdG8gd2FudCB0byB0cnkgYW5kIG1ha2UgdGhlIG9iamVjdCB0aGlzIHBvcnRhbCBpcyBvbiBjbGlja2FibGVcbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlfSlcbiAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgLy8gb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgcG9ydGFsIG1vdmVtZW50IFxuICAgIC8vdGhpcy5mb2xsb3dQb3J0YWwgPSB0aGlzLmZvbGxvd1BvcnRhbC5iaW5kKHRoaXMpXG4gICAgLy90aGlzLmVsLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5mb2xsb3dQb3J0YWwpXG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiA1IH0pXG4gICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMub3BlbigpKVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5bGVhdmUnLCAoKSA9PiB0aGlzLmNsb3NlKCkpXG4gIH0sXG5cbiAgcmVwbGFjZU1hdGVyaWFsOiBmdW5jdGlvbiAobmV3TWF0ZXJpYWwpIHtcbiAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLm1hdGVyaWFsVGFyZ2V0XG4gICAgaWYgKHRhcmdldCAmJiB0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICBcbiAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0KSA9PiB7XG4gICAgICBsZXQgbWVzaCA9IG9iamVjdFxuICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbiAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsKSA9PiB7ICAgICAgICAgXG4gICAgICAgICAgICAgIGlmICghdGFyZ2V0IHx8IG1hdGVyaWFsLm5hbWUgPT09IHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01hdGVyaWFsXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgfVxuICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCByZXBsYWNlTWF0ZXJpYWxzID0gKCkgPT4ge1xuICAgIC8vIG1lc2ggd291bGQgY29udGFpbiB0aGUgb2JqZWN0IHRoYXQgaXMsIG9yIGNvbnRhaW5zLCB0aGUgbWVzaGVzXG4gICAgdmFyIG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBpZiAoIW1lc2gpIHtcbiAgICAgICAgLy8gaWYgbm8gbWVzaCwgd2UnbGwgc2VhcmNoIHRocm91Z2ggYWxsIG9mIHRoZSBjaGlsZHJlbi4gIFRoaXMgd291bGRcbiAgICAgICAgLy8gaGFwcGVuIGlmIHdlIGRyb3BwZWQgdGhlIGNvbXBvbmVudCBvbiBhIGdsYiBpbiBzcG9rZVxuICAgICAgICBtZXNoID0gdGhpcy5lbC5vYmplY3QzRFxuICAgIH1cbiAgICB0cmF2ZXJzZShtZXNoKTtcbiAgICB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuICAgIH1cblxuICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgIGxldCBpbml0aWFsaXplciA9ICgpID0+e1xuICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCByZXBsYWNlTWF0ZXJpYWxzKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXBsYWNlTWF0ZXJpYWxzKClcbiAgICAgIH1cbiAgICB9O1xuICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4gIH0sXG5cbiAgZm9sbG93UG9ydGFsOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhyZWYgdG8gXCIgKyB0aGlzLm90aGVyKVxuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuICAgICAgfVxuICB9LFxuICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMudGltZS52YWx1ZSA9IHRpbWUgLyAxMDAwXG4gICAgICAgIFxuICAgIGlmICh0aGlzLm90aGVyICYmICF0aGlzLnN5c3RlbS50ZWxlcG9ydGluZykge1xuICAgICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhUG9zKVxuICAgICAgY29uc3QgZGlzdCA9IHdvcmxkQ2FtZXJhUG9zLmRpc3RhbmNlVG8od29ybGRQb3MpXG5cbiAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSAmJiBkaXN0IDwgMC41KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyICYmIGRpc3QgPCAxKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgIH1cbiAgICB9XG4gIH0sXG4gIGdldE90aGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMCkgcmVzb2x2ZShudWxsKVxuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlICA9PSAxKSB7XG4gICAgICAgICAgICAvLyB0aGUgdGFyZ2V0IGlzIGFub3RoZXIgcm9vbSwgcmVzb2x2ZSB3aXRoIHRoZSBVUkwgdG8gdGhlIHJvb21cbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldFJvb21VUkwodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4odXJsID0+IHsgcmVzb2x2ZSh1cmwpIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBub3cgZmluZCB0aGUgcG9ydGFsIHdpdGhpbiB0aGUgcm9vbS4gIFRoZSBwb3J0YWxzIHNob3VsZCBjb21lIGluIHBhaXJzIHdpdGggdGhlIHNhbWUgcG9ydGFsVGFyZ2V0XG4gICAgICAgIGNvbnN0IHBvcnRhbHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtwb3J0YWxdYCkpXG4gICAgICAgIGNvbnN0IG90aGVyID0gcG9ydGFscy5maW5kKChlbCkgPT4gZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVHlwZSA9PSB0aGlzLnBvcnRhbFR5cGUgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVGFyZ2V0ID09PSB0aGlzLnBvcnRhbFRhcmdldCAmJiBlbCAhPT0gdGhpcy5lbClcbiAgICAgICAgaWYgKG90aGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIENhc2UgMTogVGhlIG90aGVyIHBvcnRhbCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgcmVzb2x2ZShvdGhlcik7XG4gICAgICAgICAgICBvdGhlci5lbWl0KCdwYWlyJywgeyBvdGhlcjogdGhpcy5lbCB9KSAvLyBMZXQgdGhlIG90aGVyIGtub3cgdGhhdCB3ZSdyZSByZWFkeVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2FzZSAyOiBXZSBjb3VsZG4ndCBmaW5kIHRoZSBvdGhlciBwb3J0YWwsIHdhaXQgZm9yIGl0IHRvIHNpZ25hbCB0aGF0IGl0J3MgcmVhZHlcbiAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncGFpcicsIChldmVudCkgPT4gcmVzb2x2ZShldmVudC5kZXRhaWwub3RoZXIpLCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnN0IG5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIGVpdGhlciBcbiAgICAgICAgLy8gLSBcInJvb21fbmFtZV9jb2xvclwiXG4gICAgICAgIC8vIC0gXCJwb3J0YWxfTl9jb2xvclwiIFxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuIE51bWJlcmVkIHBvcnRhbHMgc2hvdWxkIGNvbWUgaW4gcGFpcnMuXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IG5vZGVOYW1lLm1hdGNoKC8oW0EtWmEtel0qKV8oW0EtWmEtejAtOV0qKV8oW0EtWmEtejAtOV0qKSQvKVxuICAgICAgICBcbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDQsIGZpcnN0IG1hdGNoIGlzIHRoZSBwb3J0YWwgdHlwZSxcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBuYW1lIG9yIG51bWJlciwgYW5kIGxhc3QgaXMgdGhlIGNvbG9yXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCA0KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJwb3J0YWwgbm9kZSBuYW1lIG5vdCBmb3JtZWQgY29ycmVjdGx5OiBcIiwgbm9kZU5hbWUpXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgICAgIHRoaXMuY29sb3IgPSBcInJlZFwiIC8vIGRlZmF1bHQgc28gdGhlIHBvcnRhbCBoYXMgYSBjb2xvciB0byB1c2VcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBcbiAgICAgICAgdGhpcy5zZXRQb3J0YWxJbmZvKHBhcmFtc1sxXSwgcGFyYW1zWzJdLCBwYXJhbXNbM10pXG4gICAgfSxcblxuICAgIHNldFBvcnRhbEluZm86IGZ1bmN0aW9uKHBvcnRhbFR5cGUsIHBvcnRhbFRhcmdldCwgY29sb3IpIHtcbiAgICAgICAgaWYgKHBvcnRhbFR5cGUgPT09IFwicm9vbVwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAxO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwYXJzZUludChwb3J0YWxUYXJnZXQpXG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJwb3J0YWxcIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMjtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcG9ydGFsVGFyZ2V0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IoY29sb3IpXG4gICAgfSxcblxuICAgIHNldFJhZGl1cyh2YWwpIHtcbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAgIGZyb206IHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlLFxuICAgICAgICAgIHRvOiB2YWwsXG4gICAgICAgIH0pXG4gICAgfSxcbiAgICBvcGVuKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygxKVxuICAgIH0sXG4gICAgY2xvc2UoKSB7XG4gICAgICAgIHRoaXMuc2V0UmFkaXVzKDApXG4gICAgfSxcbiAgICBpc0Nsb3NlZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlID09PSAwXG4gICAgfSxcbn0pXG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogMzYwIGltYWdlIHRoYXQgZmlsbHMgdGhlIHVzZXIncyB2aXNpb24gd2hlbiBpbiBhIGNsb3NlIHByb3hpbWl0eS5cbiAqXG4gKiBVc2FnZVxuICogPT09PT09PVxuICogR2l2ZW4gYSAzNjAgaW1hZ2UgYXNzZXQgd2l0aCB0aGUgZm9sbG93aW5nIFVSTCBpbiBTcG9rZTpcbiAqIGh0dHBzOi8vZ3QtYWVsLWFxLWFzc2V0cy5hZWxhdGd0LWludGVybmFsLm5ldC9maWxlcy8xMjM0NWFiYy02Nzg5ZGVmLmpwZ1xuICpcbiAqIFRoZSBuYW1lIG9mIHRoZSBgaW1tZXJzaXZlLTM2MC5nbGJgIGluc3RhbmNlIGluIHRoZSBzY2VuZSBzaG91bGQgYmU6XG4gKiBcInNvbWUtZGVzY3JpcHRpdmUtbGFiZWxfXzEyMzQ1YWJjLTY3ODlkZWZfanBnXCIgT1IgXCIxMjM0NWFiYy02Nzg5ZGVmX2pwZ1wiXG4gKi9cblxuY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaW1tZXJzaXZlLTM2MCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgdXJsOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH0sXG4gIH0sXG4gIGluaXQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCB1cmwgPSB0aGlzLmRhdGEudXJsID8/IHRoaXMucGFyc2VTcG9rZU5hbWUoKVxuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHVybC5tYXRjaCgvXi4qXFwuKC4qKSQvKVsxXVxuXG4gICAgLy8gbWVkaWEtaW1hZ2Ugd2lsbCBzZXQgdXAgdGhlIHNwaGVyZSBnZW9tZXRyeSBmb3IgdXNcbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnbWVkaWEtaW1hZ2UnLCB7XG4gICAgICBwcm9qZWN0aW9uOiAnMzYwLWVxdWlyZWN0YW5ndWxhcicsXG4gICAgICBhbHBoYU1vZGU6ICdvcGFxdWUnLFxuICAgICAgc3JjOiB1cmwsXG4gICAgICB2ZXJzaW9uOiAxLFxuICAgICAgYmF0Y2g6IGZhbHNlLFxuICAgICAgY29udGVudFR5cGU6IGBpbWFnZS8ke2V4dGVuc2lvbn1gLFxuICAgICAgYWxwaGFDdXRvZmY6IDAsXG4gICAgfSlcbiAgICAvLyBidXQgd2UgbmVlZCB0byB3YWl0IGZvciB0aGlzIHRvIGhhcHBlblxuICAgIHRoaXMubWVzaCA9IGF3YWl0IHRoaXMuZ2V0TWVzaCgpXG4gICAgdGhpcy5tZXNoLmdlb21ldHJ5LnNjYWxlKDEwMCwgMTAwLCAxMDApXG4gICAgdGhpcy5tZXNoLm1hdGVyaWFsLnNldFZhbHVlcyh7XG4gICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgIGRlcHRoVGVzdDogZmFsc2UsXG4gICAgfSlcbiAgICB0aGlzLm5lYXIgPSAxXG4gICAgdGhpcy5mYXIgPSAxLjNcblxuICAgIC8vIFJlbmRlciBPVkVSIHRoZSBzY2VuZSBidXQgVU5ERVIgdGhlIGN1cnNvclxuICAgIHRoaXMubWVzaC5yZW5kZXJPcmRlciA9IEFQUC5SRU5ERVJfT1JERVIuQ1VSU09SIC0gMVxuICB9LFxuICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMubWVzaCkge1xuICAgICAgLy8gTGluZWFybHkgbWFwIGNhbWVyYSBkaXN0YW5jZSB0byBtYXRlcmlhbCBvcGFjaXR5XG4gICAgICB0aGlzLm1lc2guZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmEpXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IHdvcmxkU2VsZi5kaXN0YW5jZVRvKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3Qgb3BhY2l0eSA9IDEgLSAoZGlzdGFuY2UgLSB0aGlzLm5lYXIpIC8gKHRoaXMuZmFyIC0gdGhpcy5uZWFyKVxuICAgICAgdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPSBvcGFjaXR5XG4gICAgfVxuICB9LFxuICBwYXJzZVNwb2tlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgIC8vIEFjY2VwdGVkIG5hbWVzOiBcImxhYmVsX19pbWFnZS1oYXNoX2V4dFwiIE9SIFwiaW1hZ2UtaGFzaF9leHRcIlxuICAgIGNvbnN0IHNwb2tlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG4gICAgY29uc3QgWywgaGFzaCwgZXh0ZW5zaW9uXSA9IHNwb2tlTmFtZS5tYXRjaCgvKD86LipfXyk/KC4qKV8oLiopLylcbiAgICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9ndC1hZWwtYXEtYXNzZXRzLmFlbGF0Z3QtaW50ZXJuYWwubmV0L2ZpbGVzLyR7aGFzaH0uJHtleHRlbnNpb259YFxuICAgIHJldHVybiB1cmxcbiAgfSxcbiAgZ2V0TWVzaDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuICAgICAgaWYgKG1lc2gpIHJlc29sdmUobWVzaClcbiAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgJ2ltYWdlLWxvYWRlZCcsXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICByZXNvbHZlKHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaClcbiAgICAgICAgfSxcbiAgICAgICAgeyBvbmNlOiB0cnVlIH1cbiAgICAgIClcbiAgICB9KVxuICB9LFxufSlcbiIsIi8vIFBhcmFsbGF4IE9jY2x1c2lvbiBzaGFkZXJzIGZyb21cbi8vICAgIGh0dHA6Ly9zdW5hbmRibGFja2NhdC5jb20vdGlwRnVsbFZpZXcucGhwP3RvcGljaWQ9Mjhcbi8vIE5vIHRhbmdlbnQtc3BhY2UgdHJhbnNmb3JtcyBsb2dpYyBiYXNlZCBvblxuLy8gICBodHRwOi8vbW1pa2tlbHNlbjNkLmJsb2dzcG90LnNrLzIwMTIvMDIvcGFyYWxsYXhwb2MtbWFwcGluZy1hbmQtbm8tdGFuZ2VudC5odG1sXG5cbi8vIElkZW50aXR5IGZ1bmN0aW9uIGZvciBnbHNsLWxpdGVyYWwgaGlnaGxpZ2h0aW5nIGluIFZTIENvZGVcbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmNvbnN0IFBhcmFsbGF4U2hhZGVyID0ge1xuICAvLyBPcmRlcmVkIGZyb20gZmFzdGVzdCB0byBiZXN0IHF1YWxpdHkuXG4gIG1vZGVzOiB7XG4gICAgbm9uZTogJ05PX1BBUkFMTEFYJyxcbiAgICBiYXNpYzogJ1VTRV9CQVNJQ19QQVJBTExBWCcsXG4gICAgc3RlZXA6ICdVU0VfU1RFRVBfUEFSQUxMQVgnLFxuICAgIG9jY2x1c2lvbjogJ1VTRV9PQ0xVU0lPTl9QQVJBTExBWCcsIC8vIGEuay5hLiBQT01cbiAgICByZWxpZWY6ICdVU0VfUkVMSUVGX1BBUkFMTEFYJyxcbiAgfSxcblxuICB1bmlmb3Jtczoge1xuICAgIGJ1bXBNYXA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBtYXA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheFNjYWxlOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNaW5MYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogbnVsbCB9LFxuICB9LFxuXG4gIHZlcnRleFNoYWRlcjogZ2xzbGBcbiAgICB2YXJ5aW5nIHZlYzIgdlV2O1xuICAgIHZhcnlpbmcgdmVjMyB2Vmlld1Bvc2l0aW9uO1xuICAgIHZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdlV2ID0gdXY7XG4gICAgICB2ZWM0IG12UG9zaXRpb24gPSBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KCBwb3NpdGlvbiwgMS4wICk7XG4gICAgICB2Vmlld1Bvc2l0aW9uID0gLW12UG9zaXRpb24ueHl6O1xuICAgICAgdk5vcm1hbCA9IG5vcm1hbGl6ZSggbm9ybWFsTWF0cml4ICogbm9ybWFsICk7XG4gICAgICBcbiAgICAgIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbk1hdHJpeCAqIG12UG9zaXRpb247XG4gICAgfVxuICBgLFxuXG4gIGZyYWdtZW50U2hhZGVyOiBnbHNsYFxuICAgIHVuaWZvcm0gc2FtcGxlcjJEIGJ1bXBNYXA7XG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgbWFwO1xuXG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheFNjYWxlO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNaW5MYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheE1heExheWVycztcbiAgICB1bmlmb3JtIGZsb2F0IGZhZGU7IC8vIENVU1RPTVxuXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgICNpZmRlZiBVU0VfQkFTSUNfUEFSQUxMQVhcblxuICAgIHZlYzIgcGFyYWxsYXhNYXAoaW4gdmVjMyBWKSB7XG4gICAgICBmbG9hdCBpbml0aWFsSGVpZ2h0ID0gdGV4dHVyZTJEKGJ1bXBNYXAsIHZVdikucjtcblxuICAgICAgLy8gTm8gT2Zmc2V0IExpbWl0dGluZzogbWVzc3ksIGZsb2F0aW5nIG91dHB1dCBhdCBncmF6aW5nIGFuZ2xlcy5cbiAgICAgIC8vXCJ2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogKiBpbml0aWFsSGVpZ2h0O1wiLFxuXG4gICAgICAvLyBPZmZzZXQgTGltaXRpbmdcbiAgICAgIHZlYzIgdGV4Q29vcmRPZmZzZXQgPSBwYXJhbGxheFNjYWxlICogVi54eSAqIGluaXRpYWxIZWlnaHQ7XG4gICAgICByZXR1cm4gdlV2IC0gdGV4Q29vcmRPZmZzZXQ7XG4gICAgfVxuXG4gICAgI2Vsc2VcblxuICAgIHZlYzIgcGFyYWxsYXhNYXAoaW4gdmVjMyBWKSB7XG4gICAgICAvLyBEZXRlcm1pbmUgbnVtYmVyIG9mIGxheWVycyBmcm9tIGFuZ2xlIGJldHdlZW4gViBhbmQgTlxuICAgICAgZmxvYXQgbnVtTGF5ZXJzID0gbWl4KHBhcmFsbGF4TWF4TGF5ZXJzLCBwYXJhbGxheE1pbkxheWVycywgYWJzKGRvdCh2ZWMzKDAuMCwgMC4wLCAxLjApLCBWKSkpO1xuXG4gICAgICBmbG9hdCBsYXllckhlaWdodCA9IDEuMCAvIG51bUxheWVycztcbiAgICAgIGZsb2F0IGN1cnJlbnRMYXllckhlaWdodCA9IDAuMDtcbiAgICAgIC8vIFNoaWZ0IG9mIHRleHR1cmUgY29vcmRpbmF0ZXMgZm9yIGVhY2ggaXRlcmF0aW9uXG4gICAgICB2ZWMyIGR0ZXggPSBwYXJhbGxheFNjYWxlICogVi54eSAvIFYueiAvIG51bUxheWVycztcblxuICAgICAgdmVjMiBjdXJyZW50VGV4dHVyZUNvb3JkcyA9IHZVdjtcblxuICAgICAgZmxvYXQgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG5cbiAgICAgIC8vIHdoaWxlICggaGVpZ2h0RnJvbVRleHR1cmUgPiBjdXJyZW50TGF5ZXJIZWlnaHQgKVxuICAgICAgLy8gSW5maW5pdGUgbG9vcHMgYXJlIG5vdCB3ZWxsIHN1cHBvcnRlZC4gRG8gYSBcImxhcmdlXCIgZmluaXRlXG4gICAgICAvLyBsb29wLCBidXQgbm90IHRvbyBsYXJnZSwgYXMgaXQgc2xvd3MgZG93biBzb21lIGNvbXBpbGVycy5cbiAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMzA7IGkgKz0gMSkge1xuICAgICAgICBpZiAoaGVpZ2h0RnJvbVRleHR1cmUgPD0gY3VycmVudExheWVySGVpZ2h0KSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudExheWVySGVpZ2h0ICs9IGxheWVySGVpZ2h0O1xuICAgICAgICAvLyBTaGlmdCB0ZXh0dXJlIGNvb3JkaW5hdGVzIGFsb25nIHZlY3RvciBWXG4gICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzIC09IGR0ZXg7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgfVxuXG4gICAgICAjaWZkZWYgVVNFX1NURUVQX1BBUkFMTEFYXG5cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfUkVMSUVGX1BBUkFMTEFYKVxuXG4gICAgICB2ZWMyIGRlbHRhVGV4Q29vcmQgPSBkdGV4IC8gMi4wO1xuICAgICAgZmxvYXQgZGVsdGFIZWlnaHQgPSBsYXllckhlaWdodCAvIDIuMDtcblxuICAgICAgLy8gUmV0dXJuIHRvIHRoZSBtaWQgcG9pbnQgb2YgcHJldmlvdXMgbGF5ZXJcbiAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzICs9IGRlbHRhVGV4Q29vcmQ7XG4gICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG5cbiAgICAgIC8vIEJpbmFyeSBzZWFyY2ggdG8gaW5jcmVhc2UgcHJlY2lzaW9uIG9mIFN0ZWVwIFBhcmFsbGF4IE1hcHBpbmdcbiAgICAgIGNvbnN0IGludCBudW1TZWFyY2hlcyA9IDU7XG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IG51bVNlYXJjaGVzOyBpICs9IDEpIHtcbiAgICAgICAgZGVsdGFUZXhDb29yZCAvPSAyLjA7XG4gICAgICAgIGRlbHRhSGVpZ2h0IC89IDIuMDtcbiAgICAgICAgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG4gICAgICAgIC8vIFNoaWZ0IGFsb25nIG9yIGFnYWluc3QgdmVjdG9yIFZcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0KSB7XG4gICAgICAgICAgLy8gQmVsb3cgdGhlIHN1cmZhY2VcblxuICAgICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzIC09IGRlbHRhVGV4Q29vcmQ7XG4gICAgICAgICAgY3VycmVudExheWVySGVpZ2h0ICs9IGRlbHRhSGVpZ2h0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGFib3ZlIHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCAtPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGN1cnJlbnRUZXh0dXJlQ29vcmRzO1xuXG4gICAgICAjZWxpZiBkZWZpbmVkKFVTRV9PQ0xVU0lPTl9QQVJBTExBWClcblxuICAgICAgdmVjMiBwcmV2VENvb3JkcyA9IGN1cnJlbnRUZXh0dXJlQ29vcmRzICsgZHRleDtcblxuICAgICAgLy8gSGVpZ2h0cyBmb3IgbGluZWFyIGludGVycG9sYXRpb25cbiAgICAgIGZsb2F0IG5leHRIID0gaGVpZ2h0RnJvbVRleHR1cmUgLSBjdXJyZW50TGF5ZXJIZWlnaHQ7XG4gICAgICBmbG9hdCBwcmV2SCA9IHRleHR1cmUyRChidW1wTWFwLCBwcmV2VENvb3JkcykuciAtIGN1cnJlbnRMYXllckhlaWdodCArIGxheWVySGVpZ2h0O1xuXG4gICAgICAvLyBQcm9wb3J0aW9ucyBmb3IgbGluZWFyIGludGVycG9sYXRpb25cbiAgICAgIGZsb2F0IHdlaWdodCA9IG5leHRIIC8gKG5leHRIIC0gcHJldkgpO1xuXG4gICAgICAvLyBJbnRlcnBvbGF0aW9uIG9mIHRleHR1cmUgY29vcmRpbmF0ZXNcbiAgICAgIHJldHVybiBwcmV2VENvb3JkcyAqIHdlaWdodCArIGN1cnJlbnRUZXh0dXJlQ29vcmRzICogKDEuMCAtIHdlaWdodCk7XG5cbiAgICAgICNlbHNlIC8vIE5PX1BBUkFMTEFYXG5cbiAgICAgIHJldHVybiB2VXY7XG5cbiAgICAgICNlbmRpZlxuICAgIH1cbiAgICAjZW5kaWZcblxuICAgIHZlYzIgcGVydHVyYlV2KHZlYzMgc3VyZlBvc2l0aW9uLCB2ZWMzIHN1cmZOb3JtYWwsIHZlYzMgdmlld1Bvc2l0aW9uKSB7XG4gICAgICB2ZWMyIHRleER4ID0gZEZkeCh2VXYpO1xuICAgICAgdmVjMiB0ZXhEeSA9IGRGZHkodlV2KTtcblxuICAgICAgdmVjMyB2U2lnbWFYID0gZEZkeChzdXJmUG9zaXRpb24pO1xuICAgICAgdmVjMyB2U2lnbWFZID0gZEZkeShzdXJmUG9zaXRpb24pO1xuICAgICAgdmVjMyB2UjEgPSBjcm9zcyh2U2lnbWFZLCBzdXJmTm9ybWFsKTtcbiAgICAgIHZlYzMgdlIyID0gY3Jvc3Moc3VyZk5vcm1hbCwgdlNpZ21hWCk7XG4gICAgICBmbG9hdCBmRGV0ID0gZG90KHZTaWdtYVgsIHZSMSk7XG5cbiAgICAgIHZlYzIgdlByb2pWc2NyID0gKDEuMCAvIGZEZXQpICogdmVjMihkb3QodlIxLCB2aWV3UG9zaXRpb24pLCBkb3QodlIyLCB2aWV3UG9zaXRpb24pKTtcbiAgICAgIHZlYzMgdlByb2pWdGV4O1xuICAgICAgdlByb2pWdGV4Lnh5ID0gdGV4RHggKiB2UHJvalZzY3IueCArIHRleER5ICogdlByb2pWc2NyLnk7XG4gICAgICB2UHJvalZ0ZXgueiA9IGRvdChzdXJmTm9ybWFsLCB2aWV3UG9zaXRpb24pO1xuXG4gICAgICByZXR1cm4gcGFyYWxsYXhNYXAodlByb2pWdGV4KTtcbiAgICB9XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICB2ZWMyIG1hcFV2ID0gcGVydHVyYlV2KC12Vmlld1Bvc2l0aW9uLCBub3JtYWxpemUodk5vcm1hbCksIG5vcm1hbGl6ZSh2Vmlld1Bvc2l0aW9uKSk7XG4gICAgICBcbiAgICAgIC8vIENVU1RPTSBTVEFSVFxuICAgICAgdmVjNCB0ZXhlbCA9IHRleHR1cmUyRChtYXAsIG1hcFV2KTtcbiAgICAgIHZlYzMgY29sb3IgPSBtaXgodGV4ZWwueHl6LCB2ZWMzKDApLCBmYWRlKTtcbiAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuMCk7XG4gICAgICAvLyBDVVNUT00gRU5EXG4gICAgfVxuXG4gIGAsXG59XG5cbmV4cG9ydCB7IFBhcmFsbGF4U2hhZGVyIH1cbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBDcmVhdGUgdGhlIGlsbHVzaW9uIG9mIGRlcHRoIGluIGEgY29sb3IgaW1hZ2UgZnJvbSBhIGRlcHRoIG1hcFxuICpcbiAqIFVzYWdlXG4gKiA9PT09PVxuICogQ3JlYXRlIGEgcGxhbmUgaW4gQmxlbmRlciBhbmQgZ2l2ZSBpdCBhIG1hdGVyaWFsIChqdXN0IHRoZSBkZWZhdWx0IFByaW5jaXBsZWQgQlNERikuXG4gKiBBc3NpZ24gY29sb3IgaW1hZ2UgdG8gXCJjb2xvclwiIGNoYW5uZWwgYW5kIGRlcHRoIG1hcCB0byBcImVtaXNzaXZlXCIgY2hhbm5lbC5cbiAqIFlvdSBtYXkgd2FudCB0byBzZXQgZW1pc3NpdmUgc3RyZW5ndGggdG8gemVybyBzbyB0aGUgcHJldmlldyBsb29rcyBiZXR0ZXIuXG4gKiBBZGQgdGhlIFwicGFyYWxsYXhcIiBjb21wb25lbnQgZnJvbSB0aGUgSHVicyBleHRlbnNpb24sIGNvbmZpZ3VyZSwgYW5kIGV4cG9ydCBhcyAuZ2xiXG4gKi9cblxuaW1wb3J0IHsgUGFyYWxsYXhTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3BhcmFsbGF4LXNoYWRlci5qcydcblxuY29uc3QgdmVjID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3QgZm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncGFyYWxsYXgnLCB7XG4gIHNjaGVtYToge1xuICAgIHN0cmVuZ3RoOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwLjUgfSxcbiAgICBjdXRvZmZUcmFuc2l0aW9uOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiBNYXRoLlBJIC8gOCB9LFxuICAgIGN1dG9mZkFuZ2xlOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiBNYXRoLlBJIC8gNCB9LFxuICB9LFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuICAgIGNvbnN0IHsgbWFwOiBjb2xvck1hcCwgZW1pc3NpdmVNYXA6IGRlcHRoTWFwIH0gPSBtZXNoLm1hdGVyaWFsXG4gICAgY29sb3JNYXAud3JhcFMgPSBjb2xvck1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBkZXB0aE1hcC53cmFwUyA9IGRlcHRoTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZ1xuICAgIGNvbnN0IHsgdmVydGV4U2hhZGVyLCBmcmFnbWVudFNoYWRlciB9ID0gUGFyYWxsYXhTaGFkZXJcbiAgICB0aGlzLm1hdGVyaWFsID0gbmV3IFRIUkVFLlNoYWRlck1hdGVyaWFsKHtcbiAgICAgIHZlcnRleFNoYWRlcixcbiAgICAgIGZyYWdtZW50U2hhZGVyLFxuICAgICAgZGVmaW5lczogeyBVU0VfT0NMVVNJT05fUEFSQUxMQVg6IHRydWUgfSxcbiAgICAgIHVuaWZvcm1zOiB7XG4gICAgICAgIG1hcDogeyB2YWx1ZTogY29sb3JNYXAgfSxcbiAgICAgICAgYnVtcE1hcDogeyB2YWx1ZTogZGVwdGhNYXAgfSxcbiAgICAgICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogLTEgKiB0aGlzLmRhdGEuc3RyZW5ndGggfSxcbiAgICAgICAgcGFyYWxsYXhNaW5MYXllcnM6IHsgdmFsdWU6IDIwIH0sXG4gICAgICAgIHBhcmFsbGF4TWF4TGF5ZXJzOiB7IHZhbHVlOiAzMCB9LFxuICAgICAgICBmYWRlOiB7IHZhbHVlOiAwIH0sXG4gICAgICB9LFxuICAgIH0pXG4gICAgbWVzaC5tYXRlcmlhbCA9IHRoaXMubWF0ZXJpYWxcbiAgfSxcbiAgdGljaygpIHtcbiAgICBpZiAodGhpcy5lbC5zY2VuZUVsLmNhbWVyYSkge1xuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHZlYylcbiAgICAgIHRoaXMuZWwub2JqZWN0M0Qud29ybGRUb0xvY2FsKHZlYylcbiAgICAgIGNvbnN0IGFuZ2xlID0gdmVjLmFuZ2xlVG8oZm9yd2FyZClcbiAgICAgIGNvbnN0IGZhZGUgPSBtYXBMaW5lYXJDbGFtcGVkKFxuICAgICAgICBhbmdsZSxcbiAgICAgICAgdGhpcy5kYXRhLmN1dG9mZkFuZ2xlIC0gdGhpcy5kYXRhLmN1dG9mZlRyYW5zaXRpb24sXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSArIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICAwLCAvLyBJbiB2aWV3IHpvbmUsIG5vIGZhZGVcbiAgICAgICAgMSAvLyBPdXRzaWRlIHZpZXcgem9uZSwgZnVsbCBmYWRlXG4gICAgICApXG4gICAgICB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLmZhZGUudmFsdWUgPSBmYWRlXG4gICAgfVxuICB9LFxufSlcblxuZnVuY3Rpb24gY2xhbXAodmFsdWUsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKVxufVxuXG5mdW5jdGlvbiBtYXBMaW5lYXIoeCwgYTEsIGEyLCBiMSwgYjIpIHtcbiAgcmV0dXJuIGIxICsgKCh4IC0gYTEpICogKGIyIC0gYjEpKSAvIChhMiAtIGExKVxufVxuXG5mdW5jdGlvbiBtYXBMaW5lYXJDbGFtcGVkKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBjbGFtcChtYXBMaW5lYXIoeCwgYTEsIGEyLCBiMSwgYjIpLCBiMSwgYjIpXG59XG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogY3JlYXRlIGEgSFRNTCBvYmplY3QgYnkgcmVuZGVyaW5nIGEgc2NyaXB0IHRoYXQgY3JlYXRlcyBhbmQgbWFuYWdlcyBpdFxuICpcbiAqL1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuaW1wb3J0ICogYXMgaHRtbENvbXBvbmVudHMgZnJvbSBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiO1xuXG4vLyB2YXIgaHRtbENvbXBvbmVudHM7XG4vLyB2YXIgc2NyaXB0UHJvbWlzZTtcbi8vIGlmICh3aW5kb3cuX190ZXN0aW5nVnVlQXBwcykge1xuLy8gICAgIHNjcmlwdFByb21pc2UgPSBpbXBvcnQod2luZG93Ll9fdGVzdGluZ1Z1ZUFwcHMpICAgIFxuLy8gfSBlbHNlIHtcbi8vICAgICBzY3JpcHRQcm9taXNlID0gaW1wb3J0KFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCIpIFxuLy8gfVxuLy8gLy8gc2NyaXB0UHJvbWlzZSA9IHNjcmlwdFByb21pc2UudGhlbihtb2R1bGUgPT4ge1xuLy8gLy8gICAgIHJldHVybiBtb2R1bGVcbi8vIC8vIH0pO1xuLyoqXG4gKiBNb2RpZmllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL2h1YnMvYmxvYi9tYXN0ZXIvc3JjL2NvbXBvbmVudHMvZmFkZXIuanNcbiAqIHRvIGluY2x1ZGUgYWRqdXN0YWJsZSBkdXJhdGlvbiBhbmQgY29udmVydGVkIGZyb20gY29tcG9uZW50IHRvIHN5c3RlbVxuICovXG5cbiBBRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2h0bWwtc2NyaXB0JywgeyAgXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW1UaWNrID0gaHRtbENvbXBvbmVudHNbXCJzeXN0ZW1UaWNrXCJdO1xuICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCA9IGh0bWxDb21wb25lbnRzW1wiaW5pdGlhbGl6ZUV0aGVyZWFsXCJdXG4gICAgICAgIGlmICghdGhpcy5zeXN0ZW1UaWNrIHx8ICF0aGlzLmluaXRpYWxpemVFdGhlcmVhbCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImVycm9yIGluIGh0bWwtc2NyaXB0IHN5c3RlbTogaHRtbENvbXBvbmVudHMgaGFzIG5vIHN5c3RlbVRpY2sgYW5kL29yIGluaXRpYWxpemVFdGhlcmVhbCBtZXRob2RzXCIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCgpXG4gICAgICAgIH1cbiAgICB9LFxuICBcbiAgICB0aWNrKHQsIGR0KSB7XG4gICAgICAgIHRoaXMuc3lzdGVtVGljayh0LCBkdClcbiAgICB9LFxuICB9KVxuICBcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdodG1sLXNjcmlwdCcsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBcIipfY29tcG9uZW50TmFtZVwiXG4gICAgICAgIG5hbWU6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsO1xuICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5kYXRhLm5hbWU7XG5cbiAgICAgICAgaWYgKCF0aGlzLmZ1bGxOYW1lIHx8IHRoaXMuZnVsbE5hbWUubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRoaXMucGFyc2VOb2RlTmFtZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gdGhpcy5mdWxsTmFtZVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSA9PT0gXCJcIiB8fCB0aGlzLmRhdGEubmFtZSA9PT0gdGhpcy5mdWxsTmFtZSkgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICAvLyB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gdGhpcy5mdWxsTmFtZTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95U2NyaXB0KClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpO1xuICAgIH0sXG5cbiAgICBjcmVhdGVTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gZWFjaCB0aW1lIHdlIGxvYWQgYSBzY3JpcHQgY29tcG9uZW50IHdlIHdpbGwgcG9zc2libHkgY3JlYXRlXG4gICAgICAgIC8vIGEgbmV3IG5ldHdvcmtlZCBjb21wb25lbnQuICBUaGlzIGlzIGZpbmUsIHNpbmNlIHRoZSBuZXR3b3JrZWQgSWQgXG4gICAgICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBmdWxsIG5hbWUgcGFzc2VkIGFzIGEgcGFyYW1ldGVyLCBvciBhc3NpZ25lZCB0byB0aGVcbiAgICAgICAgLy8gY29tcG9uZW50IGluIFNwb2tlLiAgSXQgZG9lcyBtZWFuIHRoYXQgaWYgd2UgaGF2ZVxuICAgICAgICAvLyBtdWx0aXBsZSBvYmplY3RzIGluIHRoZSBzY2VuZSB3aGljaCBoYXZlIHRoZSBzYW1lIG5hbWUsIHRoZXkgd2lsbFxuICAgICAgICAvLyBiZSBpbiBzeW5jLiAgSXQgYWxzbyBtZWFucyB0aGF0IGlmIHlvdSB3YW50IHRvIGRyb3AgYSBjb21wb25lbnQgb25cbiAgICAgICAgLy8gdGhlIHNjZW5lIHZpYSBhIC5nbGIsIGl0IG11c3QgaGF2ZSBhIHZhbGlkIG5hbWUgcGFyYW1ldGVyIGluc2lkZSBpdC5cbiAgICAgICAgLy8gQSAuZ2xiIGluIHNwb2tlIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBzcG9rZSBuYW1lIGlmIHlvdSB1c2Ugb25lIHdpdGhvdXRcbiAgICAgICAgLy8gYSBuYW1lIGluc2lkZSBpdC5cbiAgICAgICAgbGV0IGxvYWRlciA9ICgpID0+IHtcblxuICAgICAgICAgICAgdGhpcy5sb2FkU2NyaXB0KCkudGhlbiggKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGdldCB0aGUgcGFyZW50IG5ldHdvcmtlZCBlbnRpdHksIHdoZW4gaXQncyBmaW5pc2hlZCBpbml0aWFsaXppbmcuICBcbiAgICAgICAgICAgICAgICAgICAgLy8gV2hlbiBjcmVhdGluZyB0aGlzIGFzIHBhcnQgb2YgYSBHTFRGIGxvYWQsIHRoZSBcbiAgICAgICAgICAgICAgICAgICAgLy8gcGFyZW50IGEgZmV3IHN0ZXBzIHVwIHdpbGwgYmUgbmV0d29ya2VkLiAgV2UnbGwgb25seSBkbyB0aGlzXG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBIVE1MIHNjcmlwdCB3YW50cyB0byBiZSBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBudWxsXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gYmluZCBjYWxsYmFja3NcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LnNldE5ldHdvcmtNZXRob2RzKHRoaXMudGFrZU93bmVyc2hpcCwgdGhpcy5zZXRTaGFyZWREYXRhKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHNldCB1cCB0aGUgbG9jYWwgY29udGVudCBhbmQgaG9vayBpdCB0byB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICBjb25zdCBzY3JpcHRFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IHNjcmlwdEVsXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRPYmplY3QzRChcIndlYmxheWVyM2RcIiwgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRClcblxuICAgICAgICAgICAgICAgIC8vIGxldHMgZmlndXJlIG91dCB0aGUgc2NhbGUsIGJ1dCBzY2FsaW5nIHRvIGZpbGwgdGhlIGEgMXgxbSBzcXVhcmUsIHRoYXQgaGFzIGFsc29cbiAgICAgICAgICAgICAgICAvLyBwb3RlbnRpYWxseSBiZWVuIHNjYWxlZCBieSB0aGUgcGFyZW50cyBwYXJlbnQgbm9kZS4gSWYgd2Ugc2NhbGUgdGhlIGVudGl0eSBpbiBzcG9rZSxcbiAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIHdoZXJlIHRoZSBzY2FsZSBpcyBzZXQuICBJZiB3ZSBkcm9wIGEgbm9kZSBpbiBhbmQgc2NhbGUgaXQsIHRoZSBzY2FsZSBpcyBhbHNvXG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZXJlLlxuICAgICAgICAgICAgICAgIC8vIFdlIHVzZWQgdG8gaGF2ZSBhIGZpeGVkIHNpemUgcGFzc2VkIGJhY2sgZnJvbSB0aGUgZW50aXR5LCBidXQgdGhhdCdzIHRvbyByZXN0cmljdGl2ZTpcbiAgICAgICAgICAgICAgICAvLyBjb25zdCB3aWR0aCA9IHRoaXMuc2NyaXB0LndpZHRoXG4gICAgICAgICAgICAgICAgLy8gY29uc3QgaGVpZ2h0ID0gdGhpcy5zY3JpcHQuaGVpZ2h0XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBuZWVkIHRvIGZpbmQgZW52aXJvbm1lbnQtc2NlbmUsIGdvIGRvd24gdHdvIGxldmVscyB0byB0aGUgZ3JvdXAgYWJvdmUgXG4gICAgICAgICAgICAgICAgLy8gdGhlIG5vZGVzIGluIHRoZSBzY2VuZS4gIFRoZW4gYWNjdW11bGF0ZSB0aGUgc2NhbGVzIHVwIGZyb20gdGhpcyBub2RlIHRvXG4gICAgICAgICAgICAgICAgLy8gdGhhdCBub2RlLiAgVGhpcyB3aWxsIGFjY291bnQgZm9yIGdyb3VwcywgYW5kIG5lc3RpbmcuXG5cbiAgICAgICAgICAgICAgICB2YXIgd2lkdGggPSAxLCBoZWlnaHQgPSAxO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1pbWFnZVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhdHRhY2hlZCB0byBhbiBpbWFnZSBpbiBzcG9rZSwgc28gdGhlIGltYWdlIG1lc2ggaXMgc2l6ZSAxIGFuZCBpcyBzY2FsZWQgZGlyZWN0bHlcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBzY2FsZU0ueSAqIHNjYWxlSS55XG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS54ID0gMVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnogPSAxXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGl0J3MgZW1iZWRkZWQgaW4gYSBzaW1wbGUgZ2x0ZiBtb2RlbDsgIG90aGVyIG1vZGVscyBtYXkgbm90IHdvcmtcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXNzdW1lIGl0J3MgYXQgdGhlIHRvcCBsZXZlbCBtZXNoLCBhbmQgdGhhdCB0aGUgbW9kZWwgaXRzZWxmIGlzIHNjYWxlZFxuICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdXG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYm94ID0gbWVzaC5nZW9tZXRyeS5ib3VuZGluZ0JveDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gKGJveC5tYXgueCAtIGJveC5taW4ueCkgKiBtZXNoLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IChib3gubWF4LnkgLSBib3gubWluLnkpICogbWVzaC5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaFNjYWxlID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBtZXNoU2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gbWVzaFNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IHRoZSByb290IGdsdGYgc2NhbGUuXG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJlbnQyID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5vYmplY3QzRFxuICAgICAgICAgICAgICAgICAgICB3aWR0aCAqPSBwYXJlbnQyLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ICo9IHBhcmVudDIuc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAod2lkdGggPiAwICYmIGhlaWdodCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qge3dpZHRoOiB3c2l6ZSwgaGVpZ2h0OiBoc2l6ZX0gPSB0aGlzLnNjcmlwdC5nZXRTaXplKClcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZShcInNjYWxlXCIsIHsgeDogc2NhbGUsIHk6IHNjYWxlLCB6OiBzY2FsZX0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHRoZXJlIHdpbGwgYmUgb25lIGVsZW1lbnQgYWxyZWFkeSwgdGhlIGN1YmUgd2UgY3JlYXRlZCBpbiBibGVuZGVyXG4gICAgICAgICAgICAgICAgLy8gYW5kIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50IHRvLCBzbyByZW1vdmUgaXQgaWYgaXQgaXMgdGhlcmUuXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5jaGlsZHJlbi5wb3AoKVxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgIGMudmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSBcImlzU3RhdGljXCIgaXMgY29ycmVjdDsgIGNhbid0IGJlIHN0YXRpYyBpZiBlaXRoZXIgaW50ZXJhY3RpdmUgb3IgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzU3RhdGljICYmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlIHx8IHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5pc1N0YXRpYyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBhZGQgaW4gb3VyIGNvbnRhaW5lclxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYXBwZW5kQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiAgd2UgYXJlIGdvaW5nIHRvIGhhdmUgdG8gbWFrZSBzdXJlIHRoaXMgd29ya3MgaWYgXG4gICAgICAgICAgICAgICAgLy8gdGhlIHNjcmlwdCBpcyBPTiBhbiBpbnRlcmFjdGFibGUgKGxpa2UgYW4gaW1hZ2UpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBtYWtlIHRoZSBodG1sIG9iamVjdCBjbGlja2FibGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywnJylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGZvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBvYmplY3QgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xpY2tlZCA9IHRoaXMuY2xpY2tlZC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0RyYWdnYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXJlbid0IGdvaW5nIHRvIHJlYWxseSBkZWFsIHdpdGggdGhpcyB0aWxsIHdlIGhhdmUgYSB1c2UgY2FzZSwgYnV0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjYW4gc2V0IGl0IHVwIGZvciBub3dcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzSG9sZGFibGU6IHRydWUsICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBob2xkYWJsZUJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tZG93bicsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnU3RhcnQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi11cCcsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnRW5kKGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvL3RoaXMucmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlSID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gbm8gaW50ZXJhY3Rpdml0eSwgcGxlYXNlXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIFNIT1VMRCB3b3JrIGJ1dCBtYWtlIHN1cmUgaXQgd29ya3MgaWYgdGhlIGVsIHdlIGFyZSBvblxuICAgICAgICAgICAgICAgIC8vIGlzIG5ldHdvcmtlZCwgc3VjaCBhcyB3aGVuIGF0dGFjaGVkIHRvIGFuIGltYWdlXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5oYXNBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhbiBleGlzdGluZyBjb3B5IG9mIHRoZSBOZXR3b3JrZWQgRW50aXR5IChpZiB3ZSBhcmUgbm90IHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBmaXJzdCBjbGllbnQgaW4gdGhlIHJvb20gaXQgd2lsbCBleGlzdCBpbiBvdGhlciBjbGllbnRzIGFuZCBiZSBjcmVhdGVkIGJ5IE5BRilcbiAgICAgICAgICAgICAgICAgICAgLy8gb3IgY3JlYXRlIGFuIGVudGl0eSBpZiB3ZSBhcmUgZmlyc3QuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSBmdW5jdGlvbiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwZXJzaXN0ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgYmUgcGFydCBvZiBhIE5ldHdvcmtlZCBHTFRGIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIHBpbm5lZCBhbmQgbG9hZGVkIHdoZW4gd2UgZW50ZXIgdGhlIHJvb20uICBVc2UgdGhlIG5ldHdvcmtlZCBwYXJlbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHBsdXMgYSBkaXNhbWJpZ3VhdGluZyBiaXQgb2YgdGV4dCB0byBjcmVhdGUgYSB1bmlxdWUgSWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSBOQUYudXRpbHMuZ2V0TmV0d29ya0lkKG5ldHdvcmtlZEVsKSArIFwiLWh0bWwtc2NyaXB0XCI7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBuZWVkIHRvIGNyZWF0ZSBhbiBlbnRpdHksIHVzZSB0aGUgc2FtZSBwZXJzaXN0ZW5jZSBhcyBvdXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrIGVudGl0eSAodHJ1ZSBpZiBwaW5uZWQsIGZhbHNlIGlmIG5vdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50ID0gZW50aXR5LmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEucGVyc2lzdGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBvbmx5IGhhcHBlbnMgaWYgdGhpcyBjb21wb25lbnQgaXMgb24gYSBzY2VuZSBmaWxlLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBlbGVtZW50cyBvbiB0aGUgc2NlbmUgYXJlbid0IG5ldHdvcmtlZC4gIFNvIGxldCdzIGFzc3VtZSBlYWNoIGVudGl0eSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzY2VuZSB3aWxsIGhhdmUgYSB1bmlxdWUgbmFtZS4gIEFkZGluZyBhIGJpdCBvZiB0ZXh0IHNvIHdlIGNhbiBmaW5kIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIERPTSB3aGVuIGRlYnVnZ2luZy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IHRoaXMuZnVsbE5hbWUucmVwbGFjZUFsbChcIl9cIixcIi1cIikgKyBcIi1odG1sLXNjcmlwdFwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBuZXR3b3JrZWQgZW50aXR5IHdlIGNyZWF0ZSBmb3IgdGhpcyBjb21wb25lbnQgYWxyZWFkeSBleGlzdHMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBjcmVhdGUgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gTk9URTogaXQgaXMgY3JlYXRlZCBvbiB0aGUgc2NlbmUsIG5vdCBhcyBhIGNoaWxkIG9mIHRoaXMgZW50aXR5LCBiZWNhdXNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIE5BRiBjcmVhdGVzIHJlbW90ZSBlbnRpdGllcyBpbiB0aGUgc2NlbmUuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5lbnRpdGllcy5oYXNFbnRpdHkobmV0SWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gTkFGLmVudGl0aWVzLmdldEVudGl0eShuZXRJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZXRob2QgdG8gcmV0cmlldmUgdGhlIHNjcmlwdCBkYXRhIG9uIHRoaXMgZW50aXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgXCJuZXR3b3JrZWRcIiBjb21wb25lbnQgc2hvdWxkIGhhdmUgcGVyc2lzdGVudD10cnVlLCB0aGUgdGVtcGxhdGUgYW5kIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBzZXQsIG93bmVyIHNldCB0byBcInNjZW5lXCIgKHNvIHRoYXQgaXQgZG9lc24ndCB1cGRhdGUgdGhlIHJlc3Qgb2ZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgd29ybGQgd2l0aCBpdCdzIGluaXRpYWwgZGF0YSwgYW5kIHNob3VsZCBOT1Qgc2V0IGNyZWF0b3IgKHRoZSBzeXN0ZW0gd2lsbCBkbyB0aGF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5zZXRBdHRyaWJ1dGUoJ25ldHdvcmtlZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGU6IFwiI3NjcmlwdC1kYXRhLW1lZGlhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQ6IHBlcnNpc3RlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG93bmVyOiBcInNjZW5lXCIsICAvLyBzbyB0aGF0IG91ciBpbml0aWFsIHZhbHVlIGRvZXNuJ3Qgb3ZlcndyaXRlIG90aGVyc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXR3b3JrSWQ6IG5ldElkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFwcGVuZENoaWxkKGVudGl0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNhdmUgYSBwb2ludGVyIHRvIHRoZSBuZXR3b3JrZWQgZW50aXR5IGFuZCB0aGVuIHdhaXQgZm9yIGl0IHRvIGJlIGZ1bGx5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCBiZWZvcmUgZ2V0dGluZyBhIHBvaW50ZXIgdG8gdGhlIGFjdHVhbCBuZXR3b3JrZWQgY29tcG9uZW50IGluIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5uZXRFbnRpdHkpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tcInNjcmlwdC1kYXRhXCJdXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIGlzIHRoZSBmaXJzdCBuZXR3b3JrZWQgZW50aXR5LCBpdCdzIHNoYXJlZERhdGEgd2lsbCBkZWZhdWx0IHRvIHRoZSBlbXB0eSBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcsIGFuZCB3ZSBzaG91bGQgaW5pdGlhbGl6ZSBpdCB3aXRoIHRoZSBpbml0aWFsIGRhdGEgZnJvbSB0aGUgc2NyaXB0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jLnNoYXJlZERhdGEgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5ldHdvcmtlZCA9IG5ldHdvcmtlZEVsLmNvbXBvbmVudHNbXCJuZXR3b3JrZWRcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgKG5ldHdvcmtlZC5kYXRhLmNyZWF0b3IgPT0gTkFGLmNsaWVudElkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICB0aGlzLnN0YXRlU3luYy5pbml0U2hhcmVkRGF0YSh0aGlzLnNjcmlwdC5nZXRTaGFyZWREYXRhKCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5LmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLmVsKS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KG5ldHdvcmtlZEVsKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkoKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkID0gdGhpcy5zZXR1cE5ldHdvcmtlZC5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZXRob2QgaGFuZGxlcyB0aGUgZGlmZmVyZW50IHN0YXJ0dXAgY2FzZXM6XG4gICAgICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lLCBOQUYgd2lsbCBiZSBjb25uZWN0ZWQgYW5kIHdlIGNhbiBcbiAgICAgICAgICAgICAgICAgICAgLy8gICBpbW1lZGlhdGVseSBpbml0aWFsaXplXG4gICAgICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgaXMgaW4gdGhlIHJvb20gc2NlbmUgb3IgcGlubmVkLCBpdCB3aWxsIGxpa2VseSBiZSBjcmVhdGVkXG4gICAgICAgICAgICAgICAgICAgIC8vICAgYmVmb3JlIE5BRiBpcyBzdGFydGVkIGFuZCBjb25uZWN0ZWQsIHNvIHdlIHdhaXQgZm9yIGFuIGV2ZW50IHRoYXQgaXNcbiAgICAgICAgICAgICAgICAgICAgLy8gICBmaXJlZCB3aGVuIEh1YnMgaGFzIHN0YXJ0ZWQgTkFGXG4gICAgICAgICAgICAgICAgICAgIGlmIChOQUYuY29ubmVjdGlvbiAmJiBOQUYuY29ubmVjdGlvbi5pc0Nvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkKCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignZGlkQ29ubmVjdFRvTmV0d29ya2VkU2NlbmUnLCB0aGlzLnNldHVwTmV0d29ya2VkKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiBhdHRhY2hlZCB0byBhIG5vZGUgd2l0aCBhIG1lZGlhLWxvYWRlciBjb21wb25lbnQsIHRoaXMgbWVhbnMgd2UgYXR0YWNoZWQgdGhpcyBjb21wb25lbnRcbiAgICAgICAgLy8gdG8gYSBtZWRpYSBvYmplY3QgaW4gU3Bva2UuICBXZSBzaG91bGQgd2FpdCB0aWxsIHRoZSBvYmplY3QgaXMgZnVsbHkgbG9hZGVkLiAgXG4gICAgICAgIC8vIE90aGVyd2lzZSwgaXQgd2FzIGF0dGFjaGVkIHRvIHNvbWV0aGluZyBpbnNpZGUgYSBHTFRGIChwcm9iYWJseSBpbiBibGVuZGVyKVxuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHBsYXk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wbGF5KClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwYXVzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LnBhdXNlKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBoYW5kbGUgXCJpbnRlcmFjdFwiIGV2ZW50cyBmb3IgY2xpY2thYmxlIGVudGl0aWVzXG4gICAgY2xpY2tlZDogZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgIHRoaXMuc2NyaXB0LmNsaWNrZWQoZXZ0KSBcbiAgICB9LFxuICBcbiAgICAvLyBtZXRob2RzIHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gdGhlIGh0bWwgb2JqZWN0IHNvIHRoZXkgY2FuIHVwZGF0ZSBuZXR3b3JrZWQgZGF0YVxuICAgIHRha2VPd25lcnNoaXA6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXRlU3luYy50YWtlT3duZXJzaGlwKClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlOyAgLy8gc3VyZSwgZ28gYWhlYWQgYW5kIGNoYW5nZSBpdCBmb3Igbm93XG4gICAgICAgIH1cbiAgICB9LFxuICAgIFxuICAgIHNldFNoYXJlZERhdGE6IGZ1bmN0aW9uKGRhdGFPYmplY3QpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMuc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfSxcblxuICAgIC8vIHRoaXMgaXMgY2FsbGVkIGZyb20gYmVsb3csIHRvIGdldCB0aGUgaW5pdGlhbCBkYXRhIGZyb20gdGhlIHNjcmlwdFxuICAgIGdldFNoYXJlZERhdGE6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjcmlwdC5nZXRTaGFyZWREYXRhKClcbiAgICAgICAgfVxuICAgICAgICAvLyBzaG91bGRuJ3QgaGFwcGVuXG4gICAgICAgIGNvbnNvbGUud2FybihcInNjcmlwdC1kYXRhIGNvbXBvbmVudCBjYWxsZWQgcGFyZW50IGVsZW1lbnQgYnV0IHRoZXJlIGlzIG5vIHNjcmlwdCB5ZXQ/XCIpXG4gICAgICAgIHJldHVybiBcInt9XCJcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNjcmlwdCkgcmV0dXJuXG5cbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgIC8vIG1vcmUgb3IgbGVzcyBjb3BpZWQgZnJvbSBcImhvdmVyYWJsZS12aXN1YWxzLmpzXCIgaW4gaHVic1xuICAgICAgICAgICAgY29uc3QgdG9nZ2xpbmcgPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtc1tcImh1YnMtc3lzdGVtc1wiXS5jdXJzb3JUb2dnbGluZ1N5c3RlbTtcbiAgICAgICAgICAgIHZhciBwYXNzdGhydUludGVyYWN0b3IgPSBbXVxuXG4gICAgICAgICAgICBsZXQgaW50ZXJhY3Rvck9uZSwgaW50ZXJhY3RvclR3bztcbiAgICAgICAgICAgIGNvbnN0IGludGVyYWN0aW9uID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMuaW50ZXJhY3Rpb247XG4gICAgICAgICAgICBpZiAoIWludGVyYWN0aW9uLnJlYWR5KSByZXR1cm47IC8vRE9NQ29udGVudFJlYWR5IHdvcmthcm91bmRcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbGV0IGhvdmVyRWwgPSB0aGlzLnNpbXBsZUNvbnRhaW5lclxuICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdEhhbmQuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgICAhdG9nZ2xpbmcubGVmdFRvZ2dsZWRPZmZcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yT25lKSB7XG4gICAgICAgICAgICAgICAgbGV0IHBvcyA9IGludGVyYWN0b3JPbmUucG9zaXRpb25cbiAgICAgICAgICAgICAgICBsZXQgZGlyID0gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5nZXRXb3JsZERpcmVjdGlvbihuZXcgVEhSRUUuVmVjdG9yMygpKS5uZWdhdGUoKVxuICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMLnNldChwb3MsIGRpcilcblxuICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlMKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICF0b2dnbGluZy5yaWdodFRvZ2dsZWRPZmZcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRIYW5kLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yVHdvKSB7XG4gICAgICAgICAgICAgICAgbGV0IHBvcyA9IGludGVyYWN0b3JUd28ucG9zaXRpb25cbiAgICAgICAgICAgICAgICBsZXQgZGlyID0gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5nZXRXb3JsZERpcmVjdGlvbihuZXcgVEhSRUUuVmVjdG9yMygpKS5uZWdhdGUoKVxuICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlSLnNldChwb3MsIGRpcilcbiAgICAgICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaCh0aGlzLmhvdmVyUmF5UilcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5pbnRlcmFjdGlvblJheXMgPSBwYXNzdGhydUludGVyYWN0b3JcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZW4ndCBmaW5pc2hlZCBzZXR0aW5nIHVwIHRoZSBuZXR3b3JrZWQgZW50aXR5IGRvbid0IGRvIGFueXRoaW5nLlxuICAgICAgICAgICAgaWYgKCF0aGlzLm5ldEVudGl0eSB8fCAhdGhpcy5zdGF0ZVN5bmMpIHsgcmV0dXJuIH1cblxuICAgICAgICAgICAgLy8gaWYgdGhlIHN0YXRlIGhhcyBjaGFuZ2VkIGluIHRoZSBuZXR3b3JrZWQgZGF0YSwgdXBkYXRlIG91ciBodG1sIG9iamVjdFxuICAgICAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlU3luYy5jaGFuZ2VkID0gZmFsc2VcbiAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC51cGRhdGVTaGFyZWREYXRhKHRoaXMuc3RhdGVTeW5jLmRhdGFPYmplY3QpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNjcmlwdC50aWNrKHRpbWUpXG4gICAgfSxcbiAgXG4gICAgLy8gVE9ETzogIHNob3VsZCBvbmx5IGJlIGNhbGxlZCBpZiB0aGVyZSBpcyBubyBwYXJhbWV0ZXIgc3BlY2lmeWluZyB0aGVcbiAgICAvLyBodG1sIHNjcmlwdCBuYW1lLlxuICAgIHBhcnNlTm9kZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZnVsbE5hbWUgPT09IFwiXCIpIHtcblxuICAgICAgICAgICAgLy8gVE9ETzogIHN3aXRjaCB0aGlzIHRvIGZpbmQgZW52aXJvbm1lbnQtcm9vdCBhbmQgZ28gZG93biB0byBcbiAgICAgICAgICAgIC8vIHRoZSBub2RlIGF0IHRoZSByb29tIG9mIHNjZW5lIChvbmUgYWJvdmUgdGhlIHZhcmlvdXMgbm9kZXMpLiAgXG4gICAgICAgICAgICAvLyB0aGVuIGdvIHVwIGZyb20gaGVyZSB0aWxsIHdlIGdldCB0byBhIG5vZGUgdGhhdCBoYXMgdGhhdCBub2RlXG4gICAgICAgICAgICAvLyBhcyBpdCdzIHBhcmVudFxuICAgICAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG4gICAgICAgIH0gXG5cbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBcbiAgICAgICAgLy8gIFwiY29tcG9uZW50TmFtZVwiXG4gICAgICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gIFRoaXMgd2lsbCBmZXRjaCB0aGUgY29tcG9uZW50IGZyb20gdGhlIHJlc291cmNlXG4gICAgICAgIC8vIGNvbXBvbmVudE5hbWVcbiAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5mdWxsTmFtZS5tYXRjaCgvXyhbQS1aYS16MC05XSopJC8pXG5cbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDMsIGZpcnN0IG1hdGNoIGlzIHRoZSBkaXIsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgY29tcG9uZW50TmFtZSBuYW1lIG9yIG51bWJlclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiaHRtbC1zY3JpcHQgY29tcG9uZW50TmFtZSBub3QgZm9ybWF0dGVkIGNvcnJlY3RseTogXCIsIHRoaXMuZnVsbE5hbWUpXG4gICAgICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSBudWxsXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSBwYXJhbXNbMV1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBsb2FkU2NyaXB0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGlmIChzY3JpcHRQcm9taXNlKSB7XG4gICAgICAgIC8vICAgICB0cnkge1xuICAgICAgICAvLyAgICAgICAgIGh0bWxDb21wb25lbnRzID0gYXdhaXQgc2NyaXB0UHJvbWlzZTtcbiAgICAgICAgLy8gICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAvLyAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgIC8vICAgICAgICAgcmV0dXJuXG4gICAgICAgIC8vICAgICB9XG4gICAgICAgIC8vICAgICBzY3JpcHRQcm9taXNlID0gbnVsbFxuICAgICAgICAvLyB9XG4gICAgICAgIHZhciBpbml0U2NyaXB0ID0gaHRtbENvbXBvbmVudHNbdGhpcy5jb21wb25lbnROYW1lXVxuICAgICAgICBpZiAoIWluaXRTY3JpcHQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIidodG1sLXNjcmlwdCcgY29tcG9uZW50IGRvZXNuJ3QgaGF2ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbFxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2NyaXB0ID0gaW5pdFNjcmlwdCgpXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCl7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QucmVmcmVzaCh0cnVlKVxuICAgICAgICAgICAgLy8gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC51cGRhdGUodHJ1ZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIidodG1sLXNjcmlwdCcgY29tcG9uZW50IGZhaWxlZCB0byBpbml0aWFsaXplIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGRlc3Ryb3lTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWwucmVtb3ZlQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG4gICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gbnVsbFxuXG4gICAgICAgIHRoaXMuc2NyaXB0LmRlc3Ryb3koKVxuICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICB9XG59KVxuXG4vL1xuLy8gQ29tcG9uZW50IGZvciBvdXIgbmV0d29ya2VkIHN0YXRlLiAgVGhpcyBjb21wb25lbnQgZG9lcyBub3RoaW5nIGV4Y2VwdCBhbGwgdXMgdG8gXG4vLyBjaGFuZ2UgdGhlIHN0YXRlIHdoZW4gYXBwcm9wcmlhdGUuIFdlIGNvdWxkIHNldCB0aGlzIHVwIHRvIHNpZ25hbCB0aGUgY29tcG9uZW50IGFib3ZlIHdoZW5cbi8vIHNvbWV0aGluZyBoYXMgY2hhbmdlZCwgaW5zdGVhZCBvZiBoYXZpbmcgdGhlIGNvbXBvbmVudCBhYm92ZSBwb2xsIGVhY2ggZnJhbWUuXG4vL1xuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3NjcmlwdC1kYXRhJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzY3JpcHRkYXRhOiB7dHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJ7fVwifSxcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy50YWtlT3duZXJzaGlwID0gdGhpcy50YWtlT3duZXJzaGlwLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHRoaXMuZWwuZ2V0U2hhcmVkRGF0YSgpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXMuZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCB0aGlzLnNoYXJlZERhdGEpO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDb3VsZG4ndCBlbmNvZGUgaW5pdGlhbCBzY3JpcHQgZGF0YSBvYmplY3Q6IFwiLCBlLCB0aGlzLmRhdGFPYmplY3QpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcInt9XCJcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGFuZ2VkID0gZmFsc2U7XG4gICAgfSxcblxuICAgIHVwZGF0ZSgpIHtcbiAgICAgICAgdGhpcy5jaGFuZ2VkID0gISh0aGlzLnNoYXJlZERhdGEgPT09IHRoaXMuZGF0YS5zY3JpcHRkYXRhKTtcbiAgICAgICAgaWYgKHRoaXMuY2hhbmdlZCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudCh0aGlzLmRhdGEuc2NyaXB0ZGF0YSkpXG5cbiAgICAgICAgICAgICAgICAvLyBkbyB0aGVzZSBhZnRlciB0aGUgSlNPTiBwYXJzZSB0byBtYWtlIHN1cmUgaXQgaGFzIHN1Y2NlZWRlZFxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IHRoaXMuZGF0YS5zY3JpcHRkYXRhO1xuICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlZCA9IHRydWVcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjb3VsZG4ndCBwYXJzZSBKU09OIHJlY2VpdmVkIGluIHNjcmlwdC1zeW5jOiBcIiwgZSlcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcIlwiXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBpdCBpcyBsaWtlbHkgdGhhdCBhcHBseVBlcnNpc3RlbnRTeW5jIG9ubHkgbmVlZHMgdG8gYmUgY2FsbGVkIGZvciBwZXJzaXN0ZW50XG4gICAgLy8gbmV0d29ya2VkIGVudGl0aWVzLCBzbyB3ZSBfcHJvYmFibHlfIGRvbid0IG5lZWQgdG8gZG8gdGhpcy4gIEJ1dCBpZiB0aGVyZSBpcyBub1xuICAgIC8vIHBlcnNpc3RlbnQgZGF0YSBzYXZlZCBmcm9tIHRoZSBuZXR3b3JrIGZvciB0aGlzIGVudGl0eSwgdGhpcyBjb21tYW5kIGRvZXMgbm90aGluZy5cbiAgICBwbGF5KCkge1xuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZCkge1xuICAgICAgICAgICAgLy8gbm90IHN1cmUgaWYgdGhpcyBpcyByZWFsbHkgbmVlZGVkLCBidXQgY2FuJ3QgaHVydFxuICAgICAgICAgICAgaWYgKEFQUC51dGlscykgeyAvLyB0ZW1wb3JhcnkgdGlsbCB3ZSBzaGlwIG5ldyBjbGllbnRcbiAgICAgICAgICAgICAgICBBUFAudXRpbHMuYXBwbHlQZXJzaXN0ZW50U3luYyh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEubmV0d29ya0lkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICB0YWtlT3duZXJzaGlwKCkge1xuICAgICAgICBpZiAoIU5BRi51dGlscy5pc01pbmUodGhpcy5lbCkgJiYgIU5BRi51dGlscy50YWtlT3duZXJzaGlwKHRoaXMuZWwpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcblxuICAgIC8vIGluaXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAvLyAgICAgdHJ5IHtcbiAgICAvLyAgICAgICAgIHZhciBodG1sU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgIC8vICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gaHRtbFN0cmluZ1xuICAgIC8vICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gZGF0YU9iamVjdFxuICAgIC8vICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAvLyAgICAgfSBjYXRjaCAoZSkge1xuICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgIC8vICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgLy8gICAgIH1cbiAgICAvLyB9LFxuXG4gICAgLy8gVGhlIGtleSBwYXJ0IGluIHRoZXNlIG1ldGhvZHMgKHdoaWNoIGFyZSBjYWxsZWQgZnJvbSB0aGUgY29tcG9uZW50IGFib3ZlKSBpcyB0b1xuICAgIC8vIGNoZWNrIGlmIHdlIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSB0aGUgbmV0d29ya2VkIG9iamVjdC4gIElmIHdlIG93biBpdCAoaXNNaW5lKCkgaXMgdHJ1ZSlcbiAgICAvLyB3ZSBjYW4gY2hhbmdlIGl0LiAgSWYgd2UgZG9uJ3Qgb3duIGluLCB3ZSBjYW4gdHJ5IHRvIGJlY29tZSB0aGUgb3duZXIgd2l0aFxuICAgIC8vIHRha2VPd25lcnNoaXAoKS4gSWYgdGhpcyBzdWNjZWVkcywgd2UgY2FuIHNldCB0aGUgZGF0YS4gIFxuICAgIC8vXG4gICAgLy8gTk9URTogdGFrZU93bmVyc2hpcCBBVFRFTVBUUyB0byBiZWNvbWUgdGhlIG93bmVyLCBieSBhc3N1bWluZyBpdCBjYW4gYmVjb21lIHRoZVxuICAgIC8vIG93bmVyIGFuZCBub3RpZnlpbmcgdGhlIG5ldHdvcmtlZCBjb3BpZXMuICBJZiB0d28gb3IgbW9yZSBlbnRpdGllcyB0cnkgdG8gYmVjb21lXG4gICAgLy8gb3duZXIsICBvbmx5IG9uZSAodGhlIGxhc3Qgb25lIHRvIHRyeSkgYmVjb21lcyB0aGUgb3duZXIuICBBbnkgc3RhdGUgdXBkYXRlcyBkb25lXG4gICAgLy8gYnkgdGhlIFwiZmFpbGVkIGF0dGVtcHRlZCBvd25lcnNcIiB3aWxsIG5vdCBiZSBkaXN0cmlidXRlZCB0byB0aGUgb3RoZXIgY2xpZW50cyxcbiAgICAvLyBhbmQgd2lsbCBiZSBvdmVyd3JpdHRlbiAoZXZlbnR1YWxseSkgYnkgdXBkYXRlcyBmcm9tIHRoZSBvdGhlciBjbGllbnRzLiAgIEJ5IG5vdFxuICAgIC8vIGF0dGVtcHRpbmcgdG8gZ3VhcmFudGVlIG93bmVyc2hpcCwgdGhpcyBjYWxsIGlzIGZhc3QgYW5kIHN5bmNocm9ub3VzLiAgQW55IFxuICAgIC8vIG1ldGhvZHMgZm9yIGd1YXJhbnRlZWluZyBvd25lcnNoaXAgY2hhbmdlIHdvdWxkIHRha2UgYSBub24tdHJpdmlhbCBhbW91bnQgb2YgdGltZVxuICAgIC8vIGJlY2F1c2Ugb2YgbmV0d29yayBsYXRlbmNpZXMuXG5cbiAgICBzZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKFwic2NyaXB0LWRhdGFcIiwgXCJzY3JpcHRkYXRhXCIsIGh0bWxTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuLy8gQWRkIG91ciB0ZW1wbGF0ZSBmb3Igb3VyIG5ldHdvcmtlZCBvYmplY3QgdG8gdGhlIGEtZnJhbWUgYXNzZXRzIG9iamVjdCxcbi8vIGFuZCBhIHNjaGVtYSB0byB0aGUgTkFGLnNjaGVtYXMuICBCb3RoIG11c3QgYmUgdGhlcmUgdG8gaGF2ZSBjdXN0b20gY29tcG9uZW50cyB3b3JrXG5cbmNvbnN0IGFzc2V0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJhLWFzc2V0c1wiKTtcblxuYXNzZXRzLmluc2VydEFkamFjZW50SFRNTChcbiAgICAnYmVmb3JlZW5kJyxcbiAgICBgXG4gICAgPHRlbXBsYXRlIGlkPVwic2NyaXB0LWRhdGEtbWVkaWFcIj5cbiAgICAgIDxhLWVudGl0eVxuICAgICAgICBzY3JpcHQtZGF0YVxuICAgICAgPjwvYS1lbnRpdHk+XG4gICAgPC90ZW1wbGF0ZT5cbiAgYFxuICApXG5cbmNvbnN0IHZlY3RvclJlcXVpcmVzVXBkYXRlID0gZXBzaWxvbiA9PiB7XG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdGxldCBwcmV2ID0gbnVsbDtcblx0XHRcdHJldHVybiBjdXJyID0+IHtcblx0XHRcdFx0aWYgKHByZXYgPT09IG51bGwpIHtcblx0XHRcdFx0XHRwcmV2ID0gbmV3IFRIUkVFLlZlY3RvcjMoY3Vyci54LCBjdXJyLnksIGN1cnIueik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIU5BRi51dGlscy5hbG1vc3RFcXVhbFZlYzMocHJldiwgY3VyciwgZXBzaWxvbikpIHtcblx0XHRcdFx0XHRwcmV2LmNvcHkoY3Vycik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9O1xuXG5OQUYuc2NoZW1hcy5hZGQoe1xuICBcdHRlbXBsYXRlOiBcIiNzY3JpcHQtZGF0YS1tZWRpYVwiLFxuICAgIGNvbXBvbmVudHM6IFtcbiAgICAvLyB7XG4gICAgLy8gICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgIC8vICAgICBwcm9wZXJ0eTogXCJyb3RhdGlvblwiLFxuICAgIC8vICAgICByZXF1aXJlc05ldHdvcmtVcGRhdGU6IHZlY3RvclJlcXVpcmVzVXBkYXRlKDAuMDAxKVxuICAgIC8vIH0sXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwic2NhbGVcIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIHtcbiAgICAgIFx0Y29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgICBcdHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgIH1dLFxuICAgICAgbm9uQXV0aG9yaXplZENvbXBvbmVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgICAgICAgcHJvcGVydHk6IFwic2NyaXB0ZGF0YVwiXG4gICAgICB9XG4gICAgXSxcblxuICB9KTtcblxuIiwiaW1wb3J0ICcuLi9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcG9ydGFsLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcGFyYWxsYXguanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMnXG5cbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywgJ2ltbWVyc2l2ZS0zNjAnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsICdwb3J0YWwnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4JywgJ3BhcmFsbGF4JylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdodG1sLXNjcmlwdCcsICdodG1sLXNjcmlwdCcpXG5cbi8vIGRvIGEgc2ltcGxlIG1vbmtleSBwYXRjaCB0byBzZWUgaWYgaXQgd29ya3NcblxuLy8gdmFyIG15aXNNaW5lT3JMb2NhbCA9IGZ1bmN0aW9uICh0aGF0KSB7XG4vLyAgICAgcmV0dXJuICF0aGF0LmVsLmNvbXBvbmVudHMubmV0d29ya2VkIHx8ICh0aGF0Lm5ldHdvcmtlZEVsICYmIE5BRi51dGlscy5pc01pbmUodGhhdC5uZXR3b3JrZWRFbCkpO1xuLy8gIH1cblxuLy8gIHZhciB2aWRlb0NvbXAgPSBBRlJBTUUuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4vLyAgdmlkZW9Db21wLkNvbXBvbmVudC5wcm90b3R5cGUuaXNNaW5lT3JMb2NhbCA9IG15aXNNaW5lT3JMb2NhbDsiXSwibmFtZXMiOlsid29ybGRDYW1lcmEiLCJ3b3JsZFNlbGYiLCJnbHNsIiwidmVydGV4U2hhZGVyIiwic25vaXNlIiwiZnJhZ21lbnRTaGFkZXIiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFO0FBQ3BDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDbEQsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDOUMsR0FBRztBQUNIO0FBQ0EsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLElBQUk7QUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUU7QUFDN0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztBQUNsQyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUs7QUFDOUIsUUFBUSxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVE7QUFDNUIsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUNsQixRQUFRLFdBQVcsRUFBRSxJQUFJO0FBQ3pCLFFBQVEsR0FBRyxFQUFFLEtBQUs7QUFDbEIsT0FBTyxDQUFDO0FBQ1IsTUFBSztBQUNMLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUNuQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEtBQUk7QUFDdkIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSTtBQUNqQyxJQUFJLElBQUksQ0FBQyxXQUFX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O0FDbkJELE1BQU1DLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBLE1BQU1BLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0dBO0FBQ0E7QUFDQTtBQUNPLFNBQVMseUJBQXlCLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRTtBQUMzRCxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLENBQUM7QUFDdEUsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2xGLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDdkQsQ0FBQztBQUNEO0FBQ08sU0FBUywyQkFBMkIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFO0FBQzdELElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU87QUFDckYsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN4Rzs7QUNaQTtBQUNBO0FBQ08sU0FBUyx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsYUFBYSxFQUFFO0FBQ2pFLElBQUksT0FBTyxNQUFNLElBQUksRUFBRSxNQUFNLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRTtBQUMvRSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDO0FBQ2pDLEtBQUs7QUFDTCxJQUFJLE9BQU8sTUFBTSxDQUFDO0FBQ2xCOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQ0E7QUFDQSxJQUFJLFNBQVMsR0FBRyxRQUFPO0FBQ3ZCLElBQUksU0FBUyxHQUFHLFNBQVMsSUFBSSxFQUFFLEtBQUssRUFBRTtBQUN0QyxJQUFJLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFRO0FBQzVCLElBQUksSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFDO0FBQ25ELElBQUksSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFDO0FBQ25ELElBQUksT0FBTyxTQUFTLEdBQUcsRUFBRSxHQUFHLEVBQUU7QUFDOUIsRUFBQztBQUNEO0FBQ0EsSUFBSSxZQUFZLEdBQUcsR0FBRTtBQUNyQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUU7QUFDbkMsSUFBSSxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUM7QUFDM0I7QUFDQSxJQUFJLE1BQU0sU0FBUyxJQUFJLFNBQVMsQ0FBQyxVQUFVLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDLEVBQUU7QUFDaEcsUUFBUSxTQUFTLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQztBQUN6QyxLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFO0FBQ2hHLFFBQVEsT0FBTztBQUNmLEtBQUs7QUFDTDtBQUNBLElBQUksT0FBTyxTQUFTLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDO0FBQ3pELENBQUM7QUFDRDtBQUNBLFNBQVMsV0FBVyxDQUFDLE1BQU0sRUFBRTtBQUM3QixJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBQztBQUM1RSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxHQUFHLElBQUksR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUM7QUFDNUUsSUFBSSxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDbkMsUUFBUSx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFDO0FBQzdDLEtBQUssTUFBTTtBQUNYLFFBQVEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrREFBa0QsRUFBQztBQUN2RSxLQUFLO0FBQ0wsQ0FBQztBQUNEO0FBQ0EsU0FBUyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUU7QUFDcEMsSUFBSSxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRSxFQUFFO0FBQ3ZELElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsR0FBRyxNQUFNLEdBQUcsSUFBSSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBQztBQUM5RTtBQUNBLElBQUksSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQ25DLFFBQVEsdUJBQXVCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBQztBQUM5QyxLQUFLLE1BQU07QUFDWCxRQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0RBQWdELEVBQUM7QUFDckUsS0FBSztBQUNMLENBQUM7QUFDRDtBQUNPLFNBQVMsbUJBQW1CLENBQUMsT0FBTyxFQUFFO0FBQzdDLElBQUksSUFBSSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxFQUFDO0FBQzdDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRTtBQUM3QjtBQUNBLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBQztBQUNoRTtBQUNBLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUM7QUFDaEMsQ0FBQztBQUNEO0FBQ08sU0FBUyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUU7QUFDOUMsSUFBSSxJQUFJLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUM7QUFDN0MsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsTUFBTSxFQUFFO0FBQzdCO0FBQ0EsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFDO0FBQy9EO0FBQ0EsSUFBSSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFDO0FBQ3ZDLENBQUM7QUFDRDtBQUNBLFNBQVMsZUFBZSxHQUFHO0FBQzNCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQjtBQUNwRCxNQUFNLE9BQU8sSUFBSSxDQUFDO0FBQ2xCO0FBQ0EsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLDRCQUE0QixFQUFDO0FBQzlDLElBQUksTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNqRjtBQUNBLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDN0MsTUFBTSxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0I7QUFDQSxNQUFNLElBQUksT0FBTyxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxFQUFFLE1BQUs7QUFDMUQ7QUFDQSxNQUFNLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxJQUFJLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRTtBQUMxRDtBQUNBLE1BQU0sT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sR0FBRyxVQUFVLEdBQUcsU0FBUyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFDO0FBQ3pFLE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUM7QUFDM0IsS0FBSztBQUNMO0FBQ0EsSUFBSSxPQUFPLElBQUksQ0FBQztBQUNoQixDQUFDO0FBQ0Q7QUFDQSxTQUFTLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUU7QUFDbEQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCO0FBQ3BELE1BQU0sT0FBTyxJQUFJLENBQUM7QUFDbEI7QUFDQSxJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEdBQUcsU0FBUyxHQUFHLFFBQVEsSUFBSSx5QkFBeUIsR0FBRyxNQUFNLEVBQUM7QUFDdkYsSUFBSSxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2pGO0FBQ0EsSUFBSSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUM3QyxNQUFNLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3QjtBQUNBLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLE1BQU0sRUFBRTtBQUNoQyxRQUFRLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEdBQUcsVUFBVSxHQUFHLFNBQVMsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBQztBQUMzRSxRQUFRLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFDO0FBQzdCLE9BQU87QUFDUCxLQUFLO0FBQ0w7QUFDQSxJQUFJLE9BQU8sSUFBSSxDQUFDO0FBQ2hCLENBQUM7QUFDRDtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyx3QkFBd0IsRUFBRTtBQUNuRCxJQUFJLE1BQU0sRUFBRTtBQUNaLFFBQVEsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUM3QixLQUFLO0FBQ0wsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QixRQUFRLElBQUksQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFDO0FBQ2pFLFFBQVEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFDO0FBQ25ELFFBQVEsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUM7QUFDaEM7QUFDQSxRQUFRLHlCQUF5QixDQUFDLElBQUksRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0FBQ2xFLEtBQUs7QUFDTCxJQUFJLE1BQU0sRUFBRSxXQUFXO0FBQ3ZCLFFBQVEsMkJBQTJCLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDLENBQUM7QUFDcEUsUUFBUSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDO0FBQ3ZDLEtBQUs7QUFDTDtBQUNBLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLFNBQVMsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUM7QUFDbkUsUUFBUSxJQUFJLFNBQVMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO0FBQ3RDLFlBQVksa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBQztBQUMzQyxZQUFZLFdBQVcsQ0FBQyxTQUFTLEVBQUM7QUFDbEMsWUFBWSxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVM7QUFDbkMsU0FBUztBQUNULEtBQUs7QUFDTCxDQUFDLEVBQUM7QUFDRjtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyx3QkFBd0IsRUFBRTtBQUNuRCxJQUFJLE1BQU0sRUFBRTtBQUNaLFFBQVEsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUM3QixRQUFRLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDbEMsS0FBSztBQUNMLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBQztBQUNqRTtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDaEQsUUFBUSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFO0FBQy9DLFlBQVksSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBVztBQUMvRSxTQUFTO0FBQ1QsUUFBUSx5QkFBeUIsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztBQUNsRSxLQUFLO0FBQ0w7QUFDQSxJQUFJLE1BQU0sRUFBRSxXQUFXO0FBQ3ZCLFFBQVEsMkJBQTJCLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDLENBQUM7QUFDcEUsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QjtBQUNBLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFO0FBQzFDO0FBQ0EsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBQztBQUNqRTtBQUNBLFFBQVEsSUFBSSxPQUFPLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLEVBQUUsTUFBSztBQUM3RDtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLElBQUksT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFO0FBQzNEO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFDO0FBQzlCLEtBQUs7QUFDTDtBQUNBLElBQUksUUFBUSxFQUFFLFVBQVUsT0FBTyxFQUFFO0FBQ2pDO0FBQ0EsUUFBUSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsUUFBTztBQUMxQztBQUNBO0FBQ0EsUUFBUSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFO0FBQy9DLFlBQVksSUFBSSxPQUFPLEVBQUU7QUFDekIsZ0JBQWdCLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQzFGLG9CQUFvQixJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUN0RSxpQkFBaUI7QUFDakIsYUFBYSxNQUFNO0FBQ25CLGdCQUFnQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFXO0FBQ25GLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtBQUNyQyxvQkFBb0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7QUFDdEUsaUJBQWlCO0FBQ2pCLGFBQWE7QUFDYixTQUFTO0FBQ1QsS0FBSztBQUNMLENBQUMsRUFBQztBQUNGO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsRUFBRTtBQUN6QyxJQUFJLE1BQU0sRUFBRTtBQUNaO0FBQ0EsUUFBUSxJQUFJLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO0FBQzdCLEtBQUs7QUFDTCxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLGlCQUFpQixDQUFDLEVBQUU7QUFDcEUsWUFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLDhEQUE4RCxFQUFDO0FBQ3hGLFlBQVksSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7QUFDMUIsWUFBWSxPQUFPO0FBQ25CLFNBQVM7QUFDVDtBQUNBLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUU7QUFDaEMsWUFBWSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUM7QUFDaEMsWUFBWSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMzRCxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxXQUFXLEdBQUcsUUFBUSxDQUFDLHNCQUFzQixDQUFDLGFBQWEsRUFBQztBQUN4RSxRQUFRLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUk7QUFDekU7QUFDQTtBQUNBLFFBQVEsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDMUUsUUFBUSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxLQUFLO0FBQ3BDLFlBQVksTUFBTSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUM7QUFDOUUsU0FBUyxDQUFDLENBQUM7QUFDWDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLCtCQUErQixDQUFDLENBQUM7QUFDdEYsUUFBUSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLO0FBQ2hDLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUM7QUFDNUUsU0FBUyxDQUFDLENBQUM7QUFDWDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLHlDQUF5QyxDQUFDLENBQUM7QUFDNUYsUUFBUSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLO0FBQ2hDLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUM7QUFDNUUsU0FBUyxDQUFDLENBQUM7QUFDWDtBQUNBLFFBQVEsS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ2xFLFFBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksS0FBSztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzVFLFNBQVMsQ0FBQyxDQUFDO0FBQ1g7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDdEQsUUFBUSxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDdkY7QUFDQSxLQUFLO0FBQ0w7QUFDQSxJQUFJLFVBQVUsRUFBRSxVQUFVLElBQUksRUFBRSxNQUFNLEVBQUU7QUFDeEMsUUFBUSxPQUFPLE1BQU0sSUFBSSxFQUFFLE1BQU0sSUFBSSxJQUFJLENBQUMsRUFBRTtBQUM1QyxVQUFVLE1BQU0sR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDO0FBQ3JDLFNBQVM7QUFDVCxRQUFRLFFBQVEsTUFBTSxJQUFJLElBQUksRUFBRTtBQUNoQyxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLFdBQVcsRUFBRSxZQUFZO0FBQzdCLFFBQVEsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFDO0FBQ3hGO0FBQ0EsUUFBUSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUM3QyxZQUFZLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUM7QUFDL0I7QUFDQSxZQUFZLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDO0FBQzFEO0FBQ0EsWUFBWSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsVUFBUztBQUNuQyxZQUFZLElBQUksRUFBRSxLQUFLLGNBQWMsSUFBSSxFQUFFLEtBQUssc0JBQXNCLEVBQUUsQ0FBQyxRQUFRLENBQUM7QUFDbEY7QUFDQSxZQUFZLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFVO0FBQ25DLFlBQVksSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQztBQUNqSTtBQUNBLFlBQVksSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVE7QUFDbEMsWUFBWSxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7QUFDaEMsWUFBWSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUM5QyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFO0FBQ2pELG9CQUFvQixPQUFPLEdBQUcsSUFBSSxDQUFDO0FBQ25DLG9CQUFvQixNQUFNO0FBQzFCLGlCQUFpQjtBQUNqQixhQUFhO0FBQ2IsWUFBWSxJQUFJLE9BQU8sRUFBRSxDQUFDLFFBQVEsQ0FBQztBQUNuQztBQUNBLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBQztBQUM1RixTQUFTO0FBQ1Q7QUFDQTtBQUNBLFFBQVEsZUFBZSxHQUFFO0FBQ3pCLEtBQUs7QUFDTDtBQUNBLElBQUksTUFBTSxFQUFFLFlBQVk7QUFDeEIsUUFBUSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTTtBQUNoRDtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUU7QUFDakMsWUFBWSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFFO0FBQy9CLFlBQVksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDM0QsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksTUFBTSxFQUFFLFlBQVk7QUFDeEIsUUFBUSxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQywwQkFBMEIsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDMUYsS0FBSztBQUNMO0FBQ0E7QUFDQSxJQUFJLElBQUksRUFBRSxVQUFVLElBQUksRUFBRTtBQUMxQjtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQztBQUNwQztBQUNBO0FBQ0EsUUFBUSxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyw2Q0FBNkMsRUFBQztBQUNuRyxRQUFRLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEtBQUs7QUFDbEMsWUFBWSxNQUFNLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBQztBQUM5RSxTQUFTLENBQUMsQ0FBQztBQUNYO0FBQ0E7QUFDQSxRQUFRLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxxR0FBcUcsQ0FBQyxDQUFDO0FBQ3hKLFFBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksS0FBSztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzVFLFNBQVMsQ0FBQyxDQUFDO0FBQ1gsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksYUFBYSxFQUFFLFVBQVUsSUFBSSxFQUFFO0FBQ25DO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFTO0FBQzNEO0FBQ0EsUUFBUSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUM7QUFDeEQ7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQzFDLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxzREFBc0QsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFDO0FBQy9GLFlBQVksT0FBTyxJQUFJO0FBQ3ZCLFNBQVMsTUFBTTtBQUNmLFlBQVksSUFBSSxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBQztBQUM5QyxZQUFZLElBQUksQ0FBQyxRQUFRLEVBQUU7QUFDM0IsZ0JBQWdCLE9BQU8sSUFBSTtBQUMzQixhQUFhLE1BQU07QUFDbkIsZ0JBQWdCLE9BQU8sUUFBUTtBQUMvQixhQUFhO0FBQ2IsU0FBUztBQUNULEtBQUs7QUFDTCxDQUFDOztBQ25aRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFRQTtBQUNBLE1BQU0sUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUNwQyxNQUFNLGNBQWMsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDMUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQ3BDLE1BQU0sU0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLFVBQVUsR0FBRTtBQUN4QyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDaEM7QUFDQSxTQUFTLFlBQVksQ0FBQyxRQUFRLEVBQUUsRUFBRSxFQUFFO0FBQ3BDLElBQUksSUFBSSxJQUFJLEdBQUcsU0FBUTtBQUN2QixJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLE9BQU87QUFDL0I7QUFDQSxJQUFJLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7QUFDdEMsTUFBTSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ25DLEtBQUssTUFBTTtBQUNYLE1BQU0sT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQy9CLEtBQUs7QUFDTCxDQUFDO0FBQ0Q7QUFDQSxNQUFNLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRTtBQUNoQyxFQUFFLFlBQVksRUFBRSxDQUFDLFlBQVksQ0FBQztBQUM5QixFQUFFLElBQUksRUFBRSxZQUFZO0FBQ3BCLElBQUksSUFBSSxDQUFDLFdBQVcsR0FBRyxNQUFLO0FBQzVCLElBQUksSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLG9CQUFtQjtBQUNsRixJQUFJLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFDO0FBQzlDLElBQUksSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFJO0FBQ3hCLElBQUksSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDcEQ7QUFDQTtBQUNBLElBQUksSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUU7QUFDaEgsUUFBUSxJQUFJLENBQUMsYUFBYSxHQUFFO0FBQzVCLEtBQUs7QUFDTCxHQUFHO0FBQ0gsRUFBRSxhQUFhLEVBQUUsa0JBQWtCO0FBQ25DLElBQUksSUFBSSxNQUFNLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLO0FBQ2pFLGtCQUFrQixPQUFPLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFDO0FBQ3ZEO0FBQ0EsSUFBSSxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUM7QUFDdkIsSUFBSSxPQUFPLENBQUMsT0FBTyxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7QUFDcEMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzdELElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUM7QUFDNUQsSUFBSSxNQUFNLEtBQUssQ0FBQyx1Q0FBdUMsRUFBRSxPQUFPLENBQUM7QUFDakUsU0FBUyxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUMxQyxTQUFTLElBQUksQ0FBQyxJQUFJLElBQUk7QUFDdEIsVUFBVSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN4QyxVQUFVLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO0FBQy9CLEtBQUssRUFBQztBQUNOLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsR0FBRTtBQUMvQixHQUFHO0FBQ0gsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLE1BQU0sRUFBRTtBQUN0QyxNQUFNLElBQUksQ0FBQyxZQUFZLEdBQUU7QUFDekI7QUFDQSxNQUFNLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxHQUFHLGtDQUFrQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUM7QUFDMUksTUFBTSxPQUFPLEdBQUc7QUFDaEIsR0FBRztBQUNILEVBQUUsVUFBVSxFQUFFLGdCQUFnQixNQUFNLEVBQUU7QUFDdEMsTUFBTSxJQUFJLENBQUMsWUFBWSxHQUFFO0FBQ3pCLE1BQU0sT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQztBQUM1RixHQUFHO0FBQ0gsRUFBRSxZQUFZLEVBQUUsWUFBWTtBQUM1QixLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxNQUFNO0FBQ3JELEtBQUssVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDeEMsR0FBRztBQUNILEVBQUUsVUFBVSxFQUFFLGdCQUFnQixNQUFNLEVBQUU7QUFDdEMsSUFBSSxJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUk7QUFDM0IsSUFBSSxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQzlCO0FBQ0EsSUFBSSxNQUFNLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFDO0FBQ3hDLElBQUksTUFBTSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBQztBQUN0QyxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUM7QUFDckMsSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUM7QUFDOUMsSUFBSSxJQUFJLENBQUMsMEJBQTBCLENBQUMsU0FBUyxFQUFDO0FBQzlDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUM7QUFDOUI7QUFDQSxJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBQztBQUNoRSxJQUFJLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUU7QUFDN0IsSUFBSSxJQUFJLENBQUMsV0FBVyxHQUFHLE1BQUs7QUFDNUIsR0FBRztBQUNILENBQUMsRUFBQztBQUNGO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRTtBQUNuQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksVUFBVSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUMvQixJQUFJLFlBQVksRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7QUFDakMsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDM0MsSUFBSSxjQUFjLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDckQsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLGtCQUFrQjtBQUMxQixJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU07QUFDakQ7QUFDQSxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsR0FBRztBQUMxQyxRQUFRLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUM7QUFDekYsS0FBSyxNQUFNO0FBQ1gsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUM7QUFDM0IsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQzlCO0FBQ0EsUUFBUSxJQUFJLENBQUMsYUFBYSxHQUFFO0FBQzVCLEtBQUs7QUFDTDtBQUNBLElBQUksSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUM7QUFDN0MsTUFBTSxXQUFXLEVBQUUsSUFBSTtBQUN2QixNQUFNLElBQUksRUFBRSxLQUFLLENBQUMsVUFBVTtBQUM1QixNQUFNLFFBQVEsRUFBRTtBQUNoQixRQUFRLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsRUFBRTtBQUMvQyxRQUFRLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUU7QUFDMUIsUUFBUSxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFO0FBQzVCLFFBQVEsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUU7QUFDeEMsT0FBTztBQUNQLG9CQUFNQyxNQUFZO0FBQ2xCLE1BQU0sY0FBYyxFQUFFLENBQUM7QUFDdkIsUUFBUSxFQUFFQyxNQUFNLENBQUM7QUFDakIsUUFBUSxFQUFFQyxNQUFjLENBQUM7QUFDekIsTUFBTSxDQUFDO0FBQ1AsS0FBSyxFQUFDO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBQztBQUN2QztBQUNBO0FBQ0EsSUFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsR0FBRTtBQUN0QztBQUNBLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsRUFBRTtBQUM5QixRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxJQUFJO0FBQ2hFO0FBQ0EsWUFBNEIsSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTTtBQUN4RCxjQUFjLElBQUksS0FBSyxDQUFDLGlCQUFpQixFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQztBQUNsRixhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSTtBQUM5QixnQkFBZ0IsT0FBTyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0FBQ2pELGdCQUFnQixJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQztBQUMvRCxhQUFhLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUM7QUFDM0MsU0FBUyxFQUFDO0FBQ1YsS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLEVBQUU7QUFDckMsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFDO0FBQ2hHLFFBQVEsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBQztBQUN4QyxRQUFRLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFDO0FBQzdDLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxRQUFPO0FBQzNHLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLE1BQU07QUFDL0QsWUFBWSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFDO0FBQ3hDLFlBQVksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBQztBQUN0RixZQUFZLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUM7QUFDekMsU0FBUyxFQUFDO0FBQ1YsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsRUFBRTtBQUM5QyxRQUFRLFFBQVEsRUFBRSxrREFBa0Q7QUFDcEUsUUFBUSxHQUFHLEVBQUUsR0FBRztBQUNoQixRQUFRLE1BQU0sRUFBRSxnQkFBZ0I7QUFDaEMsS0FBSyxFQUFDO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBQztBQUNyRCxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxFQUFDO0FBQzVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFDO0FBQzNELElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsRUFBRSxNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBQztBQUNqRSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUM7QUFDbEUsR0FBRztBQUNIO0FBQ0EsRUFBRSxlQUFlLEVBQUUsVUFBVSxXQUFXLEVBQUU7QUFDMUMsSUFBSSxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWM7QUFDekMsSUFBSSxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFJLENBQUM7QUFDbkQ7QUFDQSxJQUFJLElBQUksUUFBUSxHQUFHLENBQUMsTUFBTSxLQUFLO0FBQy9CLE1BQU0sSUFBSSxJQUFJLEdBQUcsT0FBTTtBQUN2QixNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUN6QixVQUFVLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxRQUFRLEtBQUs7QUFDM0MsY0FBYyxJQUFJLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFO0FBQ3ZELGtCQUFrQixJQUFJLENBQUMsUUFBUSxHQUFHLFlBQVc7QUFDN0MsZUFBZTtBQUNmLFdBQVcsRUFBQztBQUNaLE9BQU87QUFDUCxNQUFNLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDdkMsTUFBTSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUNoRCxVQUFVLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoQyxPQUFPO0FBQ1AsTUFBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLGdCQUFnQixHQUFHLE1BQU07QUFDakM7QUFDQSxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLEtBQUk7QUFDdkMsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFO0FBQ2Y7QUFDQTtBQUNBLFFBQVEsSUFBSSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUTtBQUMvQixLQUFLO0FBQ0wsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbkIsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLGNBQWMsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUM3RCxNQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksSUFBSSxHQUFHLHlCQUF5QixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLEVBQUM7QUFDcEUsSUFBSSxJQUFJLFdBQVcsR0FBRyxLQUFLO0FBQzNCLE1BQU0sSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRTtBQUM5QyxVQUFVLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLGdCQUFnQixFQUFDO0FBQ3BFLE9BQU8sTUFBTTtBQUNiLFVBQVUsZ0JBQWdCLEdBQUU7QUFDNUIsT0FBTztBQUNQLEtBQUssQ0FBQztBQUNOLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUN2RCxHQUFHO0FBQ0g7QUFDQSxFQUFFLFlBQVksRUFBRSxXQUFXO0FBQzNCLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsRUFBRTtBQUM5QixRQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBQztBQUNoRSxRQUFRLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFLO0FBQ3pDLE9BQU8sTUFBTSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQ3ZDLFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUM7QUFDbkQsT0FBTztBQUNQLEdBQUc7QUFDSCxFQUFFLElBQUksRUFBRSxVQUFVLElBQUksRUFBRTtBQUN4QixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxHQUFHLEtBQUk7QUFDbkQ7QUFDQSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFO0FBQ2hELE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFDO0FBQ2pELE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBQztBQUM3RCxNQUFNLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFDO0FBQ3REO0FBQ0EsTUFBTSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLElBQUksR0FBRyxHQUFHLEVBQUU7QUFDOUMsUUFBUSxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixHQUFHLElBQUksQ0FBQyxLQUFLLEVBQUM7QUFDaEUsUUFBUSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsTUFBSztBQUN6QyxPQUFPLE1BQU0sSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUFFO0FBQ25ELFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUM7QUFDbkQsT0FBTztBQUNQLEtBQUs7QUFDTCxHQUFHO0FBQ0gsRUFBRSxRQUFRLEVBQUUsWUFBWTtBQUN4QixJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEtBQUs7QUFDcEMsUUFBUSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUM7QUFDL0MsUUFBUSxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssQ0FBQyxFQUFFO0FBQ25DO0FBQ0EsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLEVBQUMsRUFBRSxFQUFDO0FBQ25GLFNBQVM7QUFDVDtBQUNBO0FBQ0EsUUFBUSxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUM7QUFDekUsUUFBUSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsVUFBVTtBQUM3Riw0Q0FBNEMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxZQUFZLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLEVBQUM7QUFDdEgsUUFBUSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUU7QUFDakM7QUFDQSxZQUFZLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUMzQixZQUFZLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBQztBQUNsRCxTQUFTLE1BQU07QUFDZjtBQUNBLFlBQVksSUFBSSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEtBQUssT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUM7QUFDcEcsU0FBUztBQUNULEtBQUssQ0FBQztBQUNOLEdBQUc7QUFDSDtBQUNBLElBQUksYUFBYSxFQUFFLFlBQVk7QUFDL0IsUUFBUSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBUztBQUM1RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxFQUFDO0FBQ25GO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUMxQyxZQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMseUNBQXlDLEVBQUUsUUFBUSxFQUFDO0FBQzdFLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFDO0FBQy9CLFlBQVksSUFBSSxDQUFDLFlBQVksR0FBRyxLQUFJO0FBQ3BDLFlBQVksSUFBSSxDQUFDLEtBQUssR0FBRyxNQUFLO0FBQzlCLFlBQVksT0FBTztBQUNuQixTQUFTO0FBQ1QsUUFBUSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFDO0FBQzNELEtBQUs7QUFDTDtBQUNBLElBQUksYUFBYSxFQUFFLFNBQVMsVUFBVSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUU7QUFDN0QsUUFBUSxJQUFJLFVBQVUsS0FBSyxNQUFNLEVBQUU7QUFDbkMsWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLEdBQUcsUUFBUSxDQUFDLFlBQVksRUFBQztBQUN0RCxTQUFTLE1BQU0sSUFBSSxVQUFVLEtBQUssUUFBUSxFQUFFO0FBQzVDLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFDaEMsWUFBWSxJQUFJLENBQUMsWUFBWSxHQUFHLGFBQVk7QUFDNUMsU0FBUyxNQUFNO0FBQ2YsWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSTtBQUNwQyxTQUFTO0FBQ1QsUUFBUSxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUM7QUFDM0MsS0FBSztBQUNMO0FBQ0EsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO0FBQ25CLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsbUJBQW1CLEVBQUU7QUFDbEQsVUFBVSxJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUs7QUFDbkQsVUFBVSxFQUFFLEVBQUUsR0FBRztBQUNqQixTQUFTLEVBQUM7QUFDVixLQUFLO0FBQ0wsSUFBSSxJQUFJLEdBQUc7QUFDWCxRQUFRLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDO0FBQ3pCLEtBQUs7QUFDTCxJQUFJLEtBQUssR0FBRztBQUNaLFFBQVEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUM7QUFDekIsS0FBSztBQUNMLElBQUksUUFBUSxHQUFHO0FBQ2YsUUFBUSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEtBQUssQ0FBQztBQUN4RCxLQUFLO0FBQ0wsQ0FBQzs7QUN4VUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sV0FBVyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUN2QyxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDckM7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsZUFBZSxFQUFFO0FBQzFDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDMUMsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLGtCQUFrQjtBQUMxQixJQUFJLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxjQUFjLEdBQUU7QUFDdEQsSUFBSSxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBQztBQUNoRDtBQUNBO0FBQ0EsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUU7QUFDeEMsTUFBTSxVQUFVLEVBQUUscUJBQXFCO0FBQ3ZDLE1BQU0sU0FBUyxFQUFFLFFBQVE7QUFDekIsTUFBTSxHQUFHLEVBQUUsR0FBRztBQUNkLE1BQU0sT0FBTyxFQUFFLENBQUM7QUFDaEIsTUFBTSxLQUFLLEVBQUUsS0FBSztBQUNsQixNQUFNLFdBQVcsRUFBRSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztBQUN2QyxNQUFNLFdBQVcsRUFBRSxDQUFDO0FBQ3BCLEtBQUssRUFBQztBQUNOO0FBQ0EsSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sR0FBRTtBQUNwQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBQztBQUMzQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztBQUNqQyxNQUFNLFdBQVcsRUFBRSxJQUFJO0FBQ3ZCLE1BQU0sU0FBUyxFQUFFLEtBQUs7QUFDdEIsS0FBSyxFQUFDO0FBQ04sSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUM7QUFDakIsSUFBSSxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUc7QUFDbEI7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsRUFBQztBQUN2RCxHQUFHO0FBQ0gsRUFBRSxJQUFJLEVBQUUsWUFBWTtBQUNwQixJQUFJLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtBQUNuQjtBQUNBLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUM7QUFDM0MsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFDO0FBQzFELE1BQU0sTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUM7QUFDeEQsTUFBTSxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDekUsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsUUFBTztBQUMxQyxLQUFLO0FBQ0wsR0FBRztBQUNILEVBQUUsY0FBYyxFQUFFLFlBQVk7QUFDOUI7QUFDQSxJQUFJLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFTO0FBQ3pELElBQUksTUFBTSxHQUFHLElBQUksRUFBRSxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLG9CQUFvQixFQUFDO0FBQ3JFLElBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQyxvREFBb0QsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxFQUFDO0FBQzFGLElBQUksT0FBTyxHQUFHO0FBQ2QsR0FBRztBQUNILEVBQUUsT0FBTyxFQUFFLGtCQUFrQjtBQUM3QixJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEtBQUs7QUFDcEMsTUFBTSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFJO0FBQzNDLE1BQU0sSUFBSSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBQztBQUM3QixNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCO0FBQzlCLFFBQVEsY0FBYztBQUN0QixRQUFRLE1BQU07QUFDZCxVQUFVLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUM7QUFDM0MsU0FBUztBQUNULFFBQVEsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQ3RCLFFBQU87QUFDUCxLQUFLLENBQUM7QUFDTixHQUFHO0FBQ0gsQ0FBQzs7QUM5RUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUc7QUFDdkI7QUFDQSxNQUFNLGNBQWMsR0FBRztBQUN2QjtBQUNBLEVBQUUsS0FBSyxFQUFFO0FBQ1QsSUFBSSxJQUFJLEVBQUUsYUFBYTtBQUN2QixJQUFJLEtBQUssRUFBRSxvQkFBb0I7QUFDL0IsSUFBSSxLQUFLLEVBQUUsb0JBQW9CO0FBQy9CLElBQUksU0FBUyxFQUFFLHVCQUF1QjtBQUN0QyxJQUFJLE1BQU0sRUFBRSxxQkFBcUI7QUFDakMsR0FBRztBQUNIO0FBQ0EsRUFBRSxRQUFRLEVBQUU7QUFDWixJQUFJLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDNUIsSUFBSSxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO0FBQ3hCLElBQUksYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUNsQyxJQUFJLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN0QyxJQUFJLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN0QyxHQUFHO0FBQ0g7QUFDQSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUM7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBRSxDQUFDO0FBQ0g7QUFDQSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEVBQUUsQ0FBQztBQUNIOztBQ3BMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBLE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUM7QUFDMUM7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsVUFBVSxFQUFFO0FBQ3JDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxnQkFBZ0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFO0FBQzlELElBQUksV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUU7QUFDekQsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLFlBQVk7QUFDcEIsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFJO0FBQ3pDLElBQUksTUFBTSxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFRO0FBQ2xFLElBQUksUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxvQkFBbUI7QUFDL0QsSUFBSSxRQUFRLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLG9CQUFtQjtBQUMvRCxJQUFJLE1BQU0sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLEdBQUcsZUFBYztBQUMzRCxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDO0FBQzdDLE1BQU0sWUFBWTtBQUNsQixNQUFNLGNBQWM7QUFDcEIsTUFBTSxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxJQUFJLEVBQUU7QUFDOUMsTUFBTSxRQUFRLEVBQUU7QUFDaEIsUUFBUSxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFO0FBQ2hDLFFBQVEsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRTtBQUNwQyxRQUFRLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUN6RCxRQUFRLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtBQUN4QyxRQUFRLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtBQUN4QyxRQUFRLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUU7QUFDMUIsT0FBTztBQUNQLEtBQUssRUFBQztBQUNOLElBQUksSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUTtBQUNqQyxHQUFHO0FBQ0gsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFO0FBQ2hDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBQztBQUNsRCxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUM7QUFDeEMsTUFBTSxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBQztBQUN4QyxNQUFNLE1BQU0sSUFBSSxHQUFHLGdCQUFnQjtBQUNuQyxRQUFRLEtBQUs7QUFDYixRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCO0FBQzFELFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0I7QUFDMUQsUUFBUSxDQUFDO0FBQ1QsUUFBUSxDQUFDO0FBQ1QsUUFBTztBQUNQLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFJO0FBQzlDLEtBQUs7QUFDTCxHQUFHO0FBQ0gsQ0FBQyxFQUFDO0FBQ0Y7QUFDQSxTQUFTLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRTtBQUNoQyxFQUFFLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDNUMsQ0FBQztBQUNEO0FBQ0EsU0FBUyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtBQUN0QyxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ2hELENBQUM7QUFDRDtBQUNBLFNBQVMsZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtBQUM3QyxFQUFFLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUNwRDs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFO0FBQ3RDLElBQUksSUFBSSxHQUFHO0FBQ1gsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN2RCxRQUFRLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxjQUFjLENBQUMsb0JBQW9CLEVBQUM7QUFDdEUsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRTtBQUMxRCxZQUFZLE9BQU8sQ0FBQyxLQUFLLENBQUMsaUdBQWlHLEVBQUM7QUFDNUgsU0FBUyxNQUFNO0FBQ2YsWUFBWSxJQUFJLENBQUMsa0JBQWtCLEdBQUU7QUFDckMsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUU7QUFDaEIsUUFBUSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUM7QUFDOUIsS0FBSztBQUNMLEdBQUcsRUFBQztBQUNKO0FBQ0E7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsYUFBYSxFQUFFO0FBQ3hDLElBQUksTUFBTSxFQUFFO0FBQ1o7QUFDQSxRQUFRLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztBQUM1QyxLQUFLO0FBQ0wsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QixRQUFRLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0FBQzNCLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztBQUN2QztBQUNBLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFO0FBQ3pELFlBQVksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0FBQ2pDLFNBQVMsTUFBTTtBQUNmLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUTtBQUM5QyxTQUFTO0FBQ1Q7QUFDQSxRQUFRLElBQUksSUFBSSxHQUFHLHlCQUF5QixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLEVBQUM7QUFDeEUsUUFBUSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLENBQUMsRUFBRSxLQUFLO0FBQ3RELFlBQVksSUFBSSxDQUFDLFlBQVksR0FBRTtBQUMvQixTQUFTLENBQUMsQ0FBQztBQUNYO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQSxJQUFJLE1BQU0sRUFBRSxZQUFZO0FBQ3hCLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxFQUFFLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNO0FBQzdFO0FBQ0EsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQ3ZDO0FBQ0EsUUFBUSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7QUFDM0M7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUN6QixZQUFZLElBQUksQ0FBQyxhQUFhLEdBQUU7QUFDaEMsU0FBUztBQUNULFFBQVEsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO0FBQzVCLEtBQUs7QUFDTDtBQUNBLElBQUksWUFBWSxFQUFFLFlBQVk7QUFDOUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLE1BQU0sR0FBRyxNQUFNO0FBQzNCO0FBQ0EsWUFBWSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU07QUFDMUMsZ0JBQWdCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU07QUFDeEM7QUFDQSxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRTtBQUM3QztBQUNBO0FBQ0E7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUk7QUFDekM7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3ZFLG9CQUFvQixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3ZFLG9CQUFvQixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUN0RTtBQUNBLG9CQUFvQixJQUFJLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBQztBQUN6RixpQkFBaUI7QUFDakI7QUFDQTtBQUNBLGdCQUFnQixNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBQztBQUNuRSxnQkFBZ0IsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFRO0FBQy9DLGdCQUFnQixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxLQUFJO0FBQ3JFLGdCQUFnQixJQUFJLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUM7QUFDdEY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDMUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUU7QUFDdkQ7QUFDQSxvQkFBb0IsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBSztBQUNsRSxvQkFBb0IsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBSztBQUN2RCxvQkFBb0IsS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUM7QUFDL0Msb0JBQW9CLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFDO0FBQ2hELG9CQUFvQixNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDaEMsb0JBQW9CLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUNoQyxvQkFBb0IsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ2hDLG9CQUFvQixJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7QUFDOUQsaUJBQWlCLE1BQU07QUFDdkI7QUFDQTtBQUNBLG9CQUFvQixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUM7QUFDMUQsb0JBQW9CLElBQUksSUFBSSxFQUFFO0FBQzlCLHdCQUF3QixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztBQUM1RCx3QkFBd0IsS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFDO0FBQ3RFLHdCQUF3QixNQUFNLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUM7QUFDdkUscUJBQXFCLE1BQU07QUFDM0Isd0JBQXdCLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLE1BQUs7QUFDOUQsd0JBQXdCLEtBQUssR0FBRyxTQUFTLENBQUMsRUFBQztBQUMzQyx3QkFBd0IsTUFBTSxHQUFHLFNBQVMsQ0FBQyxFQUFDO0FBQzVDLHdCQUF3QixTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDdkMsd0JBQXdCLFNBQVMsQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUN2Qyx3QkFBd0IsU0FBUyxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ3ZDLHdCQUF3QixJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7QUFDbEUscUJBQXFCO0FBQ3JCO0FBQ0Esb0JBQW9CLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFRO0FBQ3BFLG9CQUFvQixLQUFLLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFDO0FBQzVDLG9CQUFvQixNQUFNLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFDO0FBQzdDLG9CQUFvQixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ3ZDLG9CQUFvQixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ3ZDLG9CQUFvQixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ3ZDLG9CQUFvQixPQUFPLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDO0FBQ3JELGlCQUFpQjtBQUNqQjtBQUNBLGdCQUFnQixJQUFJLEtBQUssR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLENBQUMsRUFBRTtBQUM3QyxvQkFBb0IsTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFFO0FBQy9FLG9CQUFvQixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFLLEVBQUUsTUFBTSxHQUFHLEtBQUssRUFBQztBQUN2RSxvQkFBb0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ2hHLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQixLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRTtBQUMzRCxvQkFBb0IsQ0FBQyxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7QUFDdEMsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFO0FBQ3BHLG9CQUFvQixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7QUFDakQsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBQztBQUN6RDtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO0FBQy9DLG9CQUFvQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUUvQztBQUNyQjtBQUNBO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBQztBQUNsRixvQkFBb0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFO0FBQzlELHdCQUF3QixrQkFBa0IsRUFBRSxJQUFJO0FBQ2hELHdCQUF3QixXQUFXLEVBQUUsSUFBSTtBQUN6Qyx3QkFBd0IsUUFBUSxFQUFFLElBQUk7QUFDdEMsd0JBQXdCLHVCQUF1QixFQUFFLElBQUk7QUFDckQscUJBQXFCLEVBQUM7QUFDdEIsb0JBQW9CLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUM7QUFDOUU7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUMxRCxvQkFBb0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUM7QUFDNUY7QUFDQSxvQkFBb0IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRTtBQUNqRDtBQUNBO0FBQ0Esd0JBQXdCLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRTtBQUNsRSw0QkFBNEIsa0JBQWtCLEVBQUUsSUFBSTtBQUNwRCw0QkFBNEIsVUFBVSxFQUFFLElBQUk7QUFDNUMsNEJBQTRCLGNBQWMsRUFBRSxJQUFJO0FBQ2hELDRCQUE0QixXQUFXLEVBQUUsSUFBSTtBQUM3Qyw0QkFBNEIsUUFBUSxFQUFFLElBQUk7QUFDMUMsNEJBQTRCLHVCQUF1QixFQUFFLElBQUk7QUFDekQseUJBQXlCLEVBQUM7QUFDMUI7QUFDQSx3QkFBd0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxHQUFHLEtBQUs7QUFDeEcsNEJBQTRCLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBQztBQUN0RCx5QkFBeUIsRUFBQztBQUMxQix3QkFBd0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxHQUFHLEtBQUs7QUFDdEcsNEJBQTRCLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBQztBQUNwRCx5QkFBeUIsRUFBQztBQUMxQixxQkFBcUI7QUFDckI7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLEdBQUcsR0FBRTtBQUNwRCxvQkFBb0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLEdBQUU7QUFDcEQsaUJBQWlCLE1BQU07QUFDdkI7QUFDQSxvQkFBb0IsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUU7QUFDcEUsd0JBQXdCLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUM7QUFDaEUscUJBQXFCO0FBQ3JCLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxFQUFFO0FBQ3ZELG9CQUFvQixJQUFJLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUM7QUFDeEQsaUJBQWlCO0FBQ2pCO0FBQ0EsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7QUFDN0M7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxVQUFVLFdBQVcsRUFBRTtBQUN2RSx3QkFBd0IsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDO0FBQzlDLHdCQUF3QixJQUFJLEtBQUssQ0FBQztBQUNsQyx3QkFBd0IsSUFBSSxXQUFXLEVBQUU7QUFDekM7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsR0FBRyxjQUFjLENBQUM7QUFDekY7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLFVBQVUsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO0FBQ3JGLHlCQUF5QixNQUFNO0FBQy9CO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsZUFBYztBQUN0Rix5QkFBeUI7QUFDekI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixJQUFJLE1BQU0sQ0FBQztBQUNuQyx3QkFBd0IsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUMzRCw0QkFBNEIsTUFBTSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25FLHlCQUF5QixNQUFNO0FBQy9CLDRCQUE0QixNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUM7QUFDdkU7QUFDQTtBQUNBLDRCQUE0QixNQUFNLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7QUFDdEU7QUFDQTtBQUNBO0FBQ0E7QUFDQSw0QkFBNEIsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUU7QUFDN0QsZ0NBQWdDLFFBQVEsRUFBRSxvQkFBb0I7QUFDOUQsZ0NBQWdDLFVBQVUsRUFBRSxVQUFVO0FBQ3RELGdDQUFnQyxLQUFLLEVBQUUsT0FBTztBQUM5QyxnQ0FBZ0MsU0FBUyxFQUFFLEtBQUs7QUFDaEQsNkJBQTZCLENBQUMsQ0FBQztBQUMvQiw0QkFBNEIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2hFLHlCQUF5QjtBQUN6QjtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7QUFDaEQsd0JBQXdCLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUk7QUFDekYsNEJBQTRCLElBQUksQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUM7QUFDbEY7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEtBQUssQ0FBQyxFQUFFO0FBQ2pFLGdDQUFnRCxXQUFXLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBQztBQUNuRjtBQUNBO0FBQ0E7QUFDQSw2QkFBNkI7QUFDN0IseUJBQXlCLEVBQUM7QUFDMUIsc0JBQXFCO0FBQ3JCLG9CQUFvQixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDcEY7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxZQUFZO0FBQ3RELHdCQUF3QixHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJO0FBQ2xGLDRCQUE0QixJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxFQUFDO0FBQ2xFLHlCQUF5QixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU07QUFDdkMsNEJBQTRCLElBQUksQ0FBQyxvQkFBb0IsR0FBRTtBQUN2RCx5QkFBeUIsRUFBQztBQUMxQixzQkFBcUI7QUFDckIsb0JBQW9CLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3hFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksR0FBRyxDQUFDLFVBQVUsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxFQUFFO0FBQ3hFLHdCQUF3QixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7QUFDOUMscUJBQXFCLE1BQU07QUFDM0Isd0JBQXdCLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLDRCQUE0QixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUM7QUFDM0cscUJBQXFCO0FBQ3JCLGlCQUFpQjtBQUNqQixhQUFhLEVBQUM7QUFDZCxVQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFO0FBQ2hELFlBQVksSUFBSSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsTUFBTTtBQUMzRCxnQkFBZ0IsTUFBTSxHQUFFO0FBQ3hCLGFBQWE7QUFDYixZQUFZLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFDO0FBQzNCLFNBQVMsTUFBTTtBQUNmLFlBQVksTUFBTSxHQUFFO0FBQ3BCLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO0FBQ3pCLFlBQVksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUU7QUFDOUIsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksS0FBSyxFQUFFLFlBQVk7QUFDdkIsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDekIsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRTtBQUMvQixTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0E7QUFDQSxJQUFJLE9BQU8sRUFBRSxTQUFTLEdBQUcsRUFBRTtBQUMzQixRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBQztBQUNoQyxLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksYUFBYSxFQUFFLFdBQVc7QUFDOUIsUUFBUSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUU7QUFDNUIsWUFBWSxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFO0FBQ2pELFNBQVMsTUFBTTtBQUNmLFlBQVksT0FBTyxJQUFJLENBQUM7QUFDeEIsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksYUFBYSxFQUFFLFNBQVMsVUFBVSxFQUFFO0FBQ3hDLFFBQVEsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFO0FBQzVCLFlBQVksT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7QUFDM0QsU0FBUztBQUNULFFBQVEsT0FBTyxJQUFJO0FBQ25CLEtBQUs7QUFDTDtBQUNBO0FBQ0EsSUFBSSxhQUFhLEVBQUUsV0FBVztBQUM5QixRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUN6QixZQUFZLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUU7QUFDOUMsU0FBUztBQUNUO0FBQ0EsUUFBUSxPQUFPLENBQUMsSUFBSSxDQUFDLHlFQUF5RSxFQUFDO0FBQy9GLFFBQVEsT0FBTyxJQUFJO0FBQ25CLEtBQUs7QUFDTDtBQUNBO0FBQ0EsSUFBSSxJQUFJLEVBQUUsVUFBVSxJQUFJLEVBQUU7QUFDMUIsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNO0FBQ2hDO0FBQ0EsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO0FBQ3ZDO0FBQ0EsWUFBWSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsb0JBQW9CLENBQUM7QUFDMUYsWUFBWSxJQUFJLGtCQUFrQixHQUFHLEdBQUU7QUFDdkM7QUFDQSxZQUFZLElBQUksYUFBYSxFQUFFLGFBQWEsQ0FBQztBQUM3QyxZQUFZLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7QUFDcEUsWUFBWSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxPQUFPO0FBQzNDO0FBQ0EsWUFBWSxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsZ0JBQWU7QUFDOUMsWUFBWSxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sS0FBSyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUU7QUFDcEcsY0FBYyxhQUFhLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztBQUMzRSxhQUFhO0FBQ2IsWUFBWTtBQUNaLGNBQWMsV0FBVyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxLQUFLLE9BQU87QUFDOUQsY0FBYyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUk7QUFDaEQsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjO0FBQ3RDLGNBQWM7QUFDZCxjQUFjLGFBQWEsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO0FBQzdFLGFBQWE7QUFDYixZQUFZLElBQUksYUFBYSxFQUFFO0FBQy9CLGdCQUFnQixJQUFJLEdBQUcsR0FBRyxhQUFhLENBQUMsU0FBUTtBQUNoRCxnQkFBZ0IsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxNQUFNLEdBQUU7QUFDaEcsZ0JBQWdCLEdBQUcsQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFDO0FBQzlDLGdCQUFnQixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFDO0FBQzVDO0FBQ0EsZ0JBQWdCLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFDO0FBQ3ZELGFBQWE7QUFDYixZQUFZO0FBQ1osY0FBYyxXQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEtBQUssT0FBTztBQUMvRCxjQUFjLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSTtBQUNqRCxjQUFjLENBQUMsUUFBUSxDQUFDLGVBQWU7QUFDdkMsY0FBYztBQUNkLGNBQWMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDOUUsYUFBYTtBQUNiLFlBQVksSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEtBQUssT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFO0FBQ3RHLGdCQUFnQixhQUFhLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztBQUM5RSxhQUFhO0FBQ2IsWUFBWSxJQUFJLGFBQWEsRUFBRTtBQUMvQixnQkFBZ0IsSUFBSSxHQUFHLEdBQUcsYUFBYSxDQUFDLFNBQVE7QUFDaEQsZ0JBQWdCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsTUFBTSxHQUFFO0FBQ2hHLGdCQUFnQixHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBQztBQUM5QyxnQkFBZ0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBQztBQUM1QyxnQkFBZ0Isa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUM7QUFDdkQsYUFBYTtBQUNiO0FBQ0EsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxlQUFlLEdBQUcsbUJBQWtCO0FBQ3ZFLFNBQVM7QUFDVDtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRTtBQUNyQztBQUNBLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsTUFBTSxFQUFFO0FBQzlEO0FBQ0E7QUFDQSxZQUFZLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUU7QUFDeEMsZ0JBQWdCLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHLE1BQUs7QUFDOUMsZ0JBQWdCLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUM7QUFDdkUsYUFBYTtBQUNiLFNBQVM7QUFDVDtBQUNBLFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQzlCLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQSxJQUFJLGFBQWEsRUFBRSxZQUFZO0FBQy9CLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLEVBQUUsRUFBRTtBQUNsQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFTO0FBQy9ELFNBQVM7QUFDVDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBQztBQUM5RDtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDMUMsWUFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUM7QUFDOUYsWUFBWSxJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUk7QUFDckMsU0FBUyxNQUFNO0FBQ2YsWUFBWSxJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEVBQUM7QUFDMUMsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksVUFBVSxFQUFFLGtCQUFrQjtBQUNsQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksVUFBVSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFDO0FBQzNELFFBQVEsSUFBSSxDQUFDLFVBQVUsRUFBRTtBQUN6QixZQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMsa0RBQWtELEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ2xHLFlBQVksSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFJO0FBQzlCLFlBQVksT0FBTztBQUNuQixTQUFTO0FBQ1QsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVUsR0FBRTtBQUNsQyxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztBQUN4QixZQUFZLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxHQUFHLEtBQUk7QUFDMUM7QUFDQTtBQUNBLFNBQVMsTUFBTTtBQUNmLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQywwREFBMEQsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDMUcsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksYUFBYSxFQUFFLFlBQVk7QUFDL0IsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO0FBQ3ZDLFlBQVksSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUM7QUFDdkYsU0FBUztBQUNULFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBQztBQUNqRCxRQUFRLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSTtBQUNuQztBQUNBLFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEdBQUU7QUFDN0IsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUk7QUFDMUIsS0FBSztBQUNMLENBQUMsRUFBQztBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsRUFBRTtBQUN4QyxJQUFJLE1BQU0sRUFBRTtBQUNaLFFBQVEsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDO0FBQ25ELEtBQUs7QUFDTCxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCLFFBQVEsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMzRCxRQUFRLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDM0Q7QUFDQSxRQUFRLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUNsRCxRQUFRLElBQUk7QUFDWixZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUM7QUFDakYsWUFBWSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUMvRSxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUU7QUFDbkIsWUFBWSxPQUFPLENBQUMsS0FBSyxDQUFDLDhDQUE4QyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFDO0FBQzdGLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFJO0FBQ2xDLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFFO0FBQ2hDLFNBQVM7QUFDVCxRQUFRLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO0FBQzdCLEtBQUs7QUFDTDtBQUNBLElBQUksTUFBTSxHQUFHO0FBQ2IsUUFBUSxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsSUFBSSxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ25FLFFBQVEsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO0FBQzFCLFlBQVksSUFBSTtBQUNoQixnQkFBZ0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUM7QUFDdEY7QUFDQTtBQUNBLGdCQUFnQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO0FBQ3ZELGdCQUFnQixJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUk7QUFDbkMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxFQUFFO0FBQ3ZCLGdCQUFnQixPQUFPLENBQUMsS0FBSyxDQUFDLCtDQUErQyxFQUFFLENBQUMsRUFBQztBQUNqRixnQkFBZ0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFFO0FBQ3BDLGdCQUFnQixJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUU7QUFDcEMsYUFBYTtBQUNiLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLElBQUksR0FBRztBQUNYLFFBQVEsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUU7QUFDMUM7QUFDQSxZQUFZLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtBQUMzQixnQkFBZ0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzNGLGFBQWE7QUFDYixTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0EsSUFBSSxhQUFhLEdBQUc7QUFDcEIsUUFBUSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQzFGO0FBQ0EsUUFBUSxPQUFPLElBQUksQ0FBQztBQUNwQixLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxhQUFhLENBQUMsVUFBVSxFQUFFO0FBQzlCLFFBQVEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxPQUFPLEtBQUssQ0FBQztBQUMxRjtBQUNBLFFBQVEsSUFBSTtBQUNaLFlBQVksSUFBSSxVQUFVLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBQztBQUMzRSxZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsV0FBVTtBQUN4QyxZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsV0FBVTtBQUN4QyxZQUFZLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDMUUsWUFBWSxPQUFPLElBQUk7QUFDdkIsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFO0FBQ3BCLFlBQVksT0FBTyxDQUFDLEtBQUssQ0FBQyxrREFBa0QsRUFBQztBQUM3RSxZQUFZLE9BQU8sS0FBSztBQUN4QixTQUFTO0FBQ1QsS0FBSztBQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0g7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ2xEO0FBQ0EsTUFBTSxDQUFDLGtCQUFrQjtBQUN6QixJQUFJLFdBQVc7QUFDZixJQUFJLENBQUM7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBRSxDQUFDO0FBQ0gsSUFBRztBQWlCSDtBQUNBLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO0FBQ2hCLEdBQUcsUUFBUSxFQUFFLG9CQUFvQjtBQUNqQyxJQUFJLFVBQVUsRUFBRTtBQUNoQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUk7QUFDSixPQUFPLFNBQVMsRUFBRSxhQUFhO0FBQy9CLE9BQU8sUUFBUSxFQUFFLFlBQVk7QUFDN0IsS0FBSyxDQUFDO0FBQ04sTUFBTSx1QkFBdUIsRUFBRTtBQUMvQixNQUFNO0FBQ04sWUFBWSxTQUFTLEVBQUUsYUFBYTtBQUNwQyxZQUFZLFFBQVEsRUFBRSxZQUFZO0FBQ2xDLE9BQU87QUFDUCxLQUFLO0FBQ0w7QUFDQSxHQUFHLENBQUM7O0FDbnFCSixNQUFNLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUMsQ0FBQTtBQUN4RSxNQUFNLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQTtBQUMxRCxNQUFNLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQTtBQUM5RCxNQUFNLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQTtBQUVwRTtBQUVBO0FBQ0E7QUFDQTtBQUVBO0FBQ0EifQ==
