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
        
        this.nodeName = this.el.parentEl.parentEl.className;
        if(this.data.size == 0) {
            this.data.size = 10;
        }
        this.size = this.parseNodeName(this.data.size);

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
        var nodes = this.el.parentEl.parentEl.parentEl.childNodes;
        for (let i=0; i < nodes.length; i++) {
            let node = nodes[i];
            if (node == this.el.parentEl.parentEl) {continue}

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
        if (this.data.size == 0) {this.data.size = 10;}
        if (this.data.size === this.size) return

        this.size = this.parseNodeName(this.data.size);
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

/**
 * Description
 * ===========
 * create a HTML object by rendering a script that creates and manages it
 *
 */

AFRAME.registerComponent('html-script', {
    schema: {
        // name must follow the pattern "*_componentName"
        name: { type: "string", default: ""}
    },
    init: function () {
        this.script = null;
        this.fullName = this.data.name;
        this.parseNodeName();
        this.createScript();
    },

    update: function () {
        if (this.data.name === "" || this.data.name === this.fullName) return

        this.fullName = this.data.name;
        this.parseNodeName();

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
            this.simpleContainer.object3D.add(this.script.webLayer3D);
            // this.script.webLayer3D._webLayer._hashingCanvas.width = 20
            // this.script.webLayer3D._webLayer._hashingCanvas.height = 20

            // lets figure out the scale, but scaling to fill the a 1x1m square, that has also
            // potentially been scaled by the parents parent node. If we scale the entity in spoke,
            // this is where the scale is set.  If we drop a node in and scale it, the scale is also
            // set there.
            // We used to have a fixed size passed back from the entity, but that's too restrictive:
            // const width = this.script.width
            // const height = this.script.height

            var parent2 = this.el.parentEl.parentEl.object3D;
            var width = parent2.scale.x;
            var height = parent2.scale.y;
            parent2.scale.x = 1;
            parent2.scale.y = 1;

            if (width && width > 0 && height && height > 0) {
              //  setTimeout(() => {
                    // need to delay this calculation

                    // var bbox = new THREE.Box3().setFromObject(this.script.webLayer3D);
                    // var wsize = bbox.max.x - bbox.min.x
                    // var hsize = bbox.max.y - bbox.min.y
                    const {width: wsize, height: hsize} = this.script.getSize();
                    var scale = Math.min(width / wsize, height / hsize);
                    this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
             //   }, 1)
            }

            // there will be one element already, the cube we created in blender
            // and attached this component to, so remove it if it is there.
            this.el.object3D.children.pop();

            // make sure "isStatic" is correct;  can't be static if either interactive or networked
            if (this.script.isStatic && (this.script.isInteractive || this.script.isNetworked)) {
                this.script.isStatic = false;
            }
            
            
            // add in our container
            this.el.appendChild(this.simpleContainer);

            // if (!this.script.isStatic) {
            //     setInterval(() => {
            //         // update on a regular basis
            //       //  this.script.webLayer3D.refresh(true)
            //         this.script.webLayer3D.update(true)
            //     }, 50)
            // }

            if (this.script.isInteractive) {
                // make the html object clickable
                this.simpleContainer.setAttribute('is-remote-hover-target','');
                this.simpleContainer.setAttribute('tags', {singleActionButton: true});
                this.simpleContainer.setAttribute('class', "interactable");

                // forward the 'interact' events to our object 
                this.clicked = this.clicked.bind(this);
                this.simpleContainer.object3D.addEventListener('interact', this.clicked);

                if (this.script.isDraggable) {
                    // we aren't going to really deal with this till we have a use case, but
                    // we can set it up for now
                    this.simpleContainer.setAttribute('tags', {singleActionButton: true, 
                        isHoldable: true,  holdableButton: true});
    
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

        // const obj = evt.object3D
        // this.raycaster.ray.set(obj.position, this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate())
        // const hit = this.script.webLayer3D.hitTest(this.raycaster.ray)
        // if (hit) {
        //   hit.target.click()
        //   hit.target.focus()
        //   console.log('hit', hit.target, hit.layer)
        // }   
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

        if (!this.script.isStatic) {
            this.script.webLayer3D.update(true);
        }
    },
  
  parseNodeName: function () {
        if (this.fullName === "") {
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
        var initScript = htmlComponents[this.componentName];
        if (!initScript) {
            console.warn("'html-script' component doesn't have script for " + this.componentName);
            this.script = null;
            return;
        }
        this.script = initScript();
        if (this.script){
            this.script.webLayer3D.refresh(true);
            this.script.webLayer3D.update(true);
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
AFRAME.GLTFModelPlus.registerComponent('region-hider', 'region-hider');

// do a simple monkey patch to see if it works

// var myisMineOrLocal = function (that) {
//     return !that.el.components.networked || (that.networkedEl && NAF.utils.isMine(that.networkedEl));
//  }

//  var videoComp = AFRAME.components["media-video"]
//  videoComp.Component.prototype.isMineOrLocal = myisMineOrLocal;

// add the region-hider to the scene
// const scene = document.querySelector("a-scene");
// scene.setAttribute("region-hider", {size: 100})rr
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1yb29tLmpzIiwic291cmNlcyI6WyIuLi9zcmMvc3lzdGVtcy9mYWRlci1wbHVzLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcHJveGltaXR5LWV2ZW50cy5qcyIsIi4uL3NyYy9zaGFkZXJzL3BvcnRhbC52ZXJ0LmpzIiwiLi4vc3JjL3NoYWRlcnMvcG9ydGFsLmZyYWcuanMiLCIuLi9zcmMvc2hhZGVycy9zbm9pc2UuanMiLCIuLi9zcmMvdXRpbHMvY29tcG9uZW50LXV0aWxzLmpzIiwiLi4vc3JjL3V0aWxzL3NjZW5lLWdyYXBoLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcmVnaW9uLWhpZGVyLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcG9ydGFsLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvaW1tZXJzaXZlLTM2MC5qcyIsIi4uL3NyYy9zaGFkZXJzL3BhcmFsbGF4LXNoYWRlci5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3BhcmFsbGF4LmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMiLCIuLi9zcmMvcm9vbXMvbWFpbi1yb29tLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG5BRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2ZhZGVyLXBsdXMnLCB7XG4gIHNjaGVtYToge1xuICAgIGRpcmVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ25vbmUnIH0sIC8vIFwiaW5cIiwgXCJvdXRcIiwgb3IgXCJub25lXCJcbiAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMjAwIH0sIC8vIFRyYW5zaXRpb24gZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogJ3doaXRlJyB9LFxuICB9LFxuXG4gIGluaXQoKSB7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KCksXG4gICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICBjb2xvcjogdGhpcy5kYXRhLmNvbG9yLFxuICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgb3BhY2l0eTogMCxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIGZvZzogZmFsc2UsXG4gICAgICB9KVxuICAgIClcbiAgICBtZXNoLnNjYWxlLnggPSBtZXNoLnNjYWxlLnkgPSAxXG4gICAgbWVzaC5zY2FsZS56ID0gMC4xNVxuICAgIG1lc2gubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgbWVzaC5yZW5kZXJPcmRlciA9IDEgLy8gcmVuZGVyIGFmdGVyIG90aGVyIHRyYW5zcGFyZW50IHN0dWZmXG4gICAgdGhpcy5lbC5jYW1lcmEuYWRkKG1lc2gpXG4gICAgdGhpcy5tZXNoID0gbWVzaFxuICB9LFxuXG4gIGZhZGVPdXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdvdXQnKVxuICB9LFxuXG4gIGZhZGVJbigpIHtcbiAgICByZXR1cm4gdGhpcy5iZWdpblRyYW5zaXRpb24oJ2luJylcbiAgfSxcblxuICBhc3luYyBiZWdpblRyYW5zaXRpb24oZGlyZWN0aW9uKSB7XG4gICAgaWYgKHRoaXMuX3Jlc29sdmVGaW5pc2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZhZGUgd2hpbGUgYSBmYWRlIGlzIGhhcHBlbmluZy4nKVxuICAgIH1cblxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdmYWRlci1wbHVzJywgeyBkaXJlY3Rpb24gfSlcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzKSA9PiB7XG4gICAgICBpZiAodGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPT09IChkaXJlY3Rpb24gPT0gJ2luJyA/IDAgOiAxKSkge1xuICAgICAgICByZXMoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IHJlc1xuICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgdGljayh0LCBkdCkge1xuICAgIGNvbnN0IG1hdCA9IHRoaXMubWVzaC5tYXRlcmlhbFxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gdGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcgfHwgbWF0Lm9wYWNpdHkgIT09IDBcbiAgICBpZiAoIXRoaXMubWVzaC52aXNpYmxlKSByZXR1cm5cblxuICAgIGlmICh0aGlzLmRhdGEuZGlyZWN0aW9uID09PSAnaW4nKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWF4KDAsIG1hdC5vcGFjaXR5IC0gKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcpIHtcbiAgICAgIG1hdC5vcGFjaXR5ID0gTWF0aC5taW4oMSwgbWF0Lm9wYWNpdHkgKyAoMS4wIC8gdGhpcy5kYXRhLmR1cmF0aW9uKSAqIE1hdGgubWluKGR0LCA1MCkpXG4gICAgfVxuXG4gICAgaWYgKG1hdC5vcGFjaXR5ID09PSAwIHx8IG1hdC5vcGFjaXR5ID09PSAxKSB7XG4gICAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiAhPT0gJ25vbmUnKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCgpXG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uOiAnbm9uZScgfSlcbiAgICB9XG4gIH0sXG59KVxuIiwiY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncHJveGltaXR5LWV2ZW50cycsIHtcbiAgc2NoZW1hOiB7XG4gICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH0sXG4gIH0sXG4gIGluaXQoKSB7XG4gICAgdGhpcy5pblpvbmUgPSBmYWxzZVxuICAgIHRoaXMuY2FtZXJhID0gdGhpcy5lbC5zY2VuZUVsLmNhbWVyYVxuICB9LFxuICB0aWNrKCkge1xuICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmEpXG4gICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkU2VsZilcbiAgICBjb25zdCB3YXNJbnpvbmUgPSB0aGlzLmluWm9uZVxuICAgIHRoaXMuaW5ab25lID0gd29ybGRDYW1lcmEuZGlzdGFuY2VUbyh3b3JsZFNlbGYpIDwgdGhpcy5kYXRhLnJhZGl1c1xuICAgIGlmICh0aGlzLmluWm9uZSAmJiAhd2FzSW56b25lKSB0aGlzLmVsLmVtaXQoJ3Byb3hpbWl0eWVudGVyJylcbiAgICBpZiAoIXRoaXMuaW5ab25lICYmIHdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHlsZWF2ZScpXG4gIH0sXG59KVxuIiwiY29uc3QgZ2xzbCA9IGBcbnZhcnlpbmcgdmVjMiB2VXY7XG52YXJ5aW5nIHZlYzMgdlJheTtcbnZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG52b2lkIG1haW4oKSB7XG4gIHZVdiA9IHV2O1xuICAvLyB2Tm9ybWFsID0gbm9ybWFsTWF0cml4ICogbm9ybWFsO1xuICB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxNYXRyaXgpICogdmVjNChjYW1lcmFQb3NpdGlvbiwgMS4wKSkueHl6O1xuICB2UmF5ID0gcG9zaXRpb24gLSBjYW1lcmFMb2NhbDtcbiAgdk5vcm1hbCA9IG5vcm1hbGl6ZSgtMS4gKiB2UmF5KTtcbiAgZmxvYXQgZGlzdCA9IGxlbmd0aChjYW1lcmFMb2NhbCk7XG4gIHZSYXkueiAqPSAxLjMgLyAoMS4gKyBwb3coZGlzdCwgMC41KSk7IC8vIENoYW5nZSBGT1YgYnkgc3F1YXNoaW5nIGxvY2FsIFogZGlyZWN0aW9uXG4gIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbk1hdHJpeCAqIG1vZGVsVmlld01hdHJpeCAqIHZlYzQocG9zaXRpb24sIDEuMCk7XG59XG5gXG5leHBvcnQgZGVmYXVsdCBnbHNsXG4iLCJjb25zdCBnbHNsID0gYFxudW5pZm9ybSBzYW1wbGVyQ3ViZSBjdWJlTWFwO1xudW5pZm9ybSBmbG9hdCB0aW1lO1xudW5pZm9ybSBmbG9hdCByYWRpdXM7XG51bmlmb3JtIHZlYzMgcmluZ0NvbG9yO1xuXG52YXJ5aW5nIHZlYzIgdlV2O1xudmFyeWluZyB2ZWMzIHZSYXk7XG52YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuI2RlZmluZSBSSU5HX1dJRFRIIDAuMVxuI2RlZmluZSBSSU5HX0hBUkRfT1VURVIgMC4wMVxuI2RlZmluZSBSSU5HX0hBUkRfSU5ORVIgMC4wOFxuI2RlZmluZSBmb3J3YXJkIHZlYzMoMC4wLCAwLjAsIDEuMClcblxudm9pZCBtYWluKCkge1xuICB2ZWMyIGNvb3JkID0gdlV2ICogMi4wIC0gMS4wO1xuICBmbG9hdCBub2lzZSA9IHNub2lzZSh2ZWMzKGNvb3JkICogMS4sIHRpbWUpKSAqIDAuNSArIDAuNTtcblxuICAvLyBQb2xhciBkaXN0YW5jZVxuICBmbG9hdCBkaXN0ID0gbGVuZ3RoKGNvb3JkKTtcbiAgZGlzdCArPSBub2lzZSAqIDAuMjtcblxuICBmbG9hdCBtYXNrT3V0ZXIgPSAxLjAgLSBzbW9vdGhzdGVwKHJhZGl1cyAtIFJJTkdfSEFSRF9PVVRFUiwgcmFkaXVzLCBkaXN0KTtcbiAgZmxvYXQgbWFza0lubmVyID0gMS4wIC0gc21vb3Roc3RlcChyYWRpdXMgLSBSSU5HX1dJRFRILCByYWRpdXMgLSBSSU5HX1dJRFRIICsgUklOR19IQVJEX0lOTkVSLCBkaXN0KTtcbiAgZmxvYXQgZGlzdG9ydGlvbiA9IHNtb290aHN0ZXAocmFkaXVzIC0gMC4yLCByYWRpdXMgKyAwLjIsIGRpc3QpO1xuICB2ZWMzIG5vcm1hbCA9IG5vcm1hbGl6ZSh2Tm9ybWFsKTtcbiAgZmxvYXQgZGlyZWN0VmlldyA9IHNtb290aHN0ZXAoMC4sIDAuOCwgZG90KG5vcm1hbCwgZm9yd2FyZCkpO1xuICB2ZWMzIHRhbmdlbnRPdXR3YXJkID0gdmVjMyhjb29yZCwgMC4wKTtcbiAgdmVjMyByYXkgPSBtaXgodlJheSwgdGFuZ2VudE91dHdhcmQsIGRpc3RvcnRpb24pO1xuICB2ZWM0IHRleGVsID0gdGV4dHVyZUN1YmUoY3ViZU1hcCwgcmF5KTtcbiAgdmVjMyBjZW50ZXJMYXllciA9IHRleGVsLnJnYiAqIG1hc2tJbm5lcjtcbiAgdmVjMyByaW5nTGF5ZXIgPSByaW5nQ29sb3IgKiAoMS4gLSBtYXNrSW5uZXIpO1xuICB2ZWMzIGNvbXBvc2l0ZSA9IGNlbnRlckxheWVyICsgcmluZ0xheWVyO1xuXG4gIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29tcG9zaXRlLCAobWFza091dGVyIC0gbWFza0lubmVyKSArIG1hc2tJbm5lciAqIGRpcmVjdFZpZXcpO1xufVxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiLypcbiAqIDNEIFNpbXBsZXggbm9pc2VcbiAqIFNJR05BVFVSRTogZmxvYXQgc25vaXNlKHZlYzMgdilcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9odWdoc2svZ2xzbC1ub2lzZVxuICovXG5cbmNvbnN0IGdsc2wgPSBgXG4vL1xuLy8gRGVzY3JpcHRpb24gOiBBcnJheSBhbmQgdGV4dHVyZWxlc3MgR0xTTCAyRC8zRC80RCBzaW1wbGV4XG4vLyAgICAgICAgICAgICAgIG5vaXNlIGZ1bmN0aW9ucy5cbi8vICAgICAgQXV0aG9yIDogSWFuIE1jRXdhbiwgQXNoaW1hIEFydHMuXG4vLyAgTWFpbnRhaW5lciA6IGlqbVxuLy8gICAgIExhc3Rtb2QgOiAyMDExMDgyMiAoaWptKVxuLy8gICAgIExpY2Vuc2UgOiBDb3B5cmlnaHQgKEMpIDIwMTEgQXNoaW1hIEFydHMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vLyAgICAgICAgICAgICAgIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZS5cbi8vICAgICAgICAgICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FzaGltYS93ZWJnbC1ub2lzZVxuLy9cblxudmVjMyBtb2QyODkodmVjMyB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgbW9kMjg5KHZlYzQgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IHBlcm11dGUodmVjNCB4KSB7XG4gICAgIHJldHVybiBtb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7XG59XG5cbnZlYzQgdGF5bG9ySW52U3FydCh2ZWM0IHIpXG57XG4gIHJldHVybiAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqIHI7XG59XG5cbmZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gIHtcbiAgY29uc3QgdmVjMiAgQyA9IHZlYzIoMS4wLzYuMCwgMS4wLzMuMCkgO1xuICBjb25zdCB2ZWM0ICBEID0gdmVjNCgwLjAsIDAuNSwgMS4wLCAyLjApO1xuXG4vLyBGaXJzdCBjb3JuZXJcbiAgdmVjMyBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eXkpICk7XG4gIHZlYzMgeDAgPSAgIHYgLSBpICsgZG90KGksIEMueHh4KSA7XG5cbi8vIE90aGVyIGNvcm5lcnNcbiAgdmVjMyBnID0gc3RlcCh4MC55engsIHgwLnh5eik7XG4gIHZlYzMgbCA9IDEuMCAtIGc7XG4gIHZlYzMgaTEgPSBtaW4oIGcueHl6LCBsLnp4eSApO1xuICB2ZWMzIGkyID0gbWF4KCBnLnh5eiwgbC56eHkgKTtcblxuICAvLyAgIHgwID0geDAgLSAwLjAgKyAwLjAgKiBDLnh4eDtcbiAgLy8gICB4MSA9IHgwIC0gaTEgICsgMS4wICogQy54eHg7XG4gIC8vICAgeDIgPSB4MCAtIGkyICArIDIuMCAqIEMueHh4O1xuICAvLyAgIHgzID0geDAgLSAxLjAgKyAzLjAgKiBDLnh4eDtcbiAgdmVjMyB4MSA9IHgwIC0gaTEgKyBDLnh4eDtcbiAgdmVjMyB4MiA9IHgwIC0gaTIgKyBDLnl5eTsgLy8gMi4wKkMueCA9IDEvMyA9IEMueVxuICB2ZWMzIHgzID0geDAgLSBELnl5eTsgICAgICAvLyAtMS4wKzMuMCpDLnggPSAtMC41ID0gLUQueVxuXG4vLyBQZXJtdXRhdGlvbnNcbiAgaSA9IG1vZDI4OShpKTtcbiAgdmVjNCBwID0gcGVybXV0ZSggcGVybXV0ZSggcGVybXV0ZShcbiAgICAgICAgICAgICBpLnogKyB2ZWM0KDAuMCwgaTEueiwgaTIueiwgMS4wICkpXG4gICAgICAgICAgICsgaS55ICsgdmVjNCgwLjAsIGkxLnksIGkyLnksIDEuMCApKVxuICAgICAgICAgICArIGkueCArIHZlYzQoMC4wLCBpMS54LCBpMi54LCAxLjAgKSk7XG5cbi8vIEdyYWRpZW50czogN3g3IHBvaW50cyBvdmVyIGEgc3F1YXJlLCBtYXBwZWQgb250byBhbiBvY3RhaGVkcm9uLlxuLy8gVGhlIHJpbmcgc2l6ZSAxNyoxNyA9IDI4OSBpcyBjbG9zZSB0byBhIG11bHRpcGxlIG9mIDQ5ICg0OSo2ID0gMjk0KVxuICBmbG9hdCBuXyA9IDAuMTQyODU3MTQyODU3OyAvLyAxLjAvNy4wXG4gIHZlYzMgIG5zID0gbl8gKiBELnd5eiAtIEQueHp4O1xuXG4gIHZlYzQgaiA9IHAgLSA0OS4wICogZmxvb3IocCAqIG5zLnogKiBucy56KTsgIC8vICBtb2QocCw3KjcpXG5cbiAgdmVjNCB4XyA9IGZsb29yKGogKiBucy56KTtcbiAgdmVjNCB5XyA9IGZsb29yKGogLSA3LjAgKiB4XyApOyAgICAvLyBtb2QoaixOKVxuXG4gIHZlYzQgeCA9IHhfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCB5ID0geV8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IGggPSAxLjAgLSBhYnMoeCkgLSBhYnMoeSk7XG5cbiAgdmVjNCBiMCA9IHZlYzQoIHgueHksIHkueHkgKTtcbiAgdmVjNCBiMSA9IHZlYzQoIHguencsIHkuencgKTtcblxuICAvL3ZlYzQgczAgPSB2ZWM0KGxlc3NUaGFuKGIwLDAuMCkpKjIuMCAtIDEuMDtcbiAgLy92ZWM0IHMxID0gdmVjNChsZXNzVGhhbihiMSwwLjApKSoyLjAgLSAxLjA7XG4gIHZlYzQgczAgPSBmbG9vcihiMCkqMi4wICsgMS4wO1xuICB2ZWM0IHMxID0gZmxvb3IoYjEpKjIuMCArIDEuMDtcbiAgdmVjNCBzaCA9IC1zdGVwKGgsIHZlYzQoMC4wKSk7XG5cbiAgdmVjNCBhMCA9IGIwLnh6eXcgKyBzMC54enl3KnNoLnh4eXkgO1xuICB2ZWM0IGExID0gYjEueHp5dyArIHMxLnh6eXcqc2guenp3dyA7XG5cbiAgdmVjMyBwMCA9IHZlYzMoYTAueHksaC54KTtcbiAgdmVjMyBwMSA9IHZlYzMoYTAuencsaC55KTtcbiAgdmVjMyBwMiA9IHZlYzMoYTEueHksaC56KTtcbiAgdmVjMyBwMyA9IHZlYzMoYTEuencsaC53KTtcblxuLy9Ob3JtYWxpc2UgZ3JhZGllbnRzXG4gIHZlYzQgbm9ybSA9IHRheWxvckludlNxcnQodmVjNChkb3QocDAscDApLCBkb3QocDEscDEpLCBkb3QocDIsIHAyKSwgZG90KHAzLHAzKSkpO1xuICBwMCAqPSBub3JtLng7XG4gIHAxICo9IG5vcm0ueTtcbiAgcDIgKj0gbm9ybS56O1xuICBwMyAqPSBub3JtLnc7XG5cbi8vIE1peCBmaW5hbCBub2lzZSB2YWx1ZVxuICB2ZWM0IG0gPSBtYXgoMC42IC0gdmVjNChkb3QoeDAseDApLCBkb3QoeDEseDEpLCBkb3QoeDIseDIpLCBkb3QoeDMseDMpKSwgMC4wKTtcbiAgbSA9IG0gKiBtO1xuICByZXR1cm4gNDIuMCAqIGRvdCggbSptLCB2ZWM0KCBkb3QocDAseDApLCBkb3QocDEseDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QocDIseDIpLCBkb3QocDMseDMpICkgKTtcbiAgfSAgXG5gXG5leHBvcnQgZGVmYXVsdCBnbHNsXG4iLCIvLyBQcm92aWRlcyBhIGdsb2JhbCByZWdpc3RyeSBvZiBydW5uaW5nIGNvbXBvbmVudHNcbi8vIGNvcGllZCBmcm9tIGh1YnMgc291cmNlXG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8IHt9O1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdIHx8IFtdO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0ucHVzaChjb21wb25lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIGlmICghd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSkgcmV0dXJuO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uc3BsaWNlKHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uaW5kZXhPZihjb21wb25lbnQpLCAxKTtcbn1cbiAgIiwiLy8gY29waWVkIGZyb20gaHVic1xuXG5leHBvcnQgZnVuY3Rpb24gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudChlbnRpdHksIGNvbXBvbmVudE5hbWUpIHtcbiAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5LmNvbXBvbmVudHMgJiYgZW50aXR5LmNvbXBvbmVudHNbY29tcG9uZW50TmFtZV0pKSB7XG4gICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gICAgcmV0dXJuIGVudGl0eTtcbiAgfVxuICBcbiAgZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21wb25lbnRzSW5OZWFyZXN0QW5jZXN0b3IoZW50aXR5LCBjb21wb25lbnROYW1lKSB7XG4gICAgY29uc3QgY29tcG9uZW50cyA9IFtdO1xuICAgIHdoaWxlIChlbnRpdHkpIHtcbiAgICAgIGlmIChlbnRpdHkuY29tcG9uZW50cykge1xuICAgICAgICBmb3IgKGNvbnN0IGMgaW4gZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHNbY10ubmFtZSA9PT0gY29tcG9uZW50TmFtZSkge1xuICAgICAgICAgICAgY29tcG9uZW50cy5wdXNoKGVudGl0eS5jb21wb25lbnRzW2NdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY29tcG9uZW50cztcbiAgICAgIH1cbiAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlO1xuICAgIH1cbiAgICByZXR1cm4gY29tcG9uZW50cztcbiAgfVxuICAiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogYnJlYWsgdGhlIHJvb20gaW50byBxdWFkcmFudHMgb2YgYSBjZXJ0YWluIHNpemUsIGFuZCBoaWRlIHRoZSBjb250ZW50cyBvZiBhcmVhcyB0aGF0IGhhdmVcbiAqIG5vYm9keSBpbiB0aGVtLiAgTWVkaWEgd2lsbCBiZSBwYXVzZWQgaW4gdGhvc2UgYXJlYXMgdG9vLlxuICogXG4gKiBJbmNsdWRlIGEgd2F5IGZvciB0aGUgcG9ydGFsIGNvbXBvbmVudCB0byB0dXJuIG9uIGVsZW1lbnRzIGluIHRoZSByZWdpb24gb2YgdGhlIHBvcnRhbCBiZWZvcmVcbiAqIGl0IGNhcHR1cmVzIGEgY3ViZW1hcFxuICovXG5cbmltcG9ydCB7IHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UsIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuLi91dGlscy9jb21wb25lbnQtdXRpbHNcIjtcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcblxuIC8vIGFyYml0cmFyaWx5IGNob29zZSAxMDAwMDAwIGFzIHRoZSBudW1iZXIgb2YgY29tcHV0ZWQgem9uZXMgaW4gIHggYW5kIHlcbmxldCBNQVhfWk9ORVMgPSAxMDAwMDAwXG5sZXQgcmVnaW9uVGFnID0gZnVuY3Rpb24oc2l6ZSwgb2JqM2QpIHtcbiAgICBsZXQgcG9zID0gb2JqM2QucG9zaXRpb25cbiAgICBsZXQgeHAgPSBNYXRoLmZsb29yKHBvcy54IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIGxldCB6cCA9IE1hdGguZmxvb3IocG9zLnogLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgcmV0dXJuIE1BWF9aT05FUyAqIHhwICsgenBcbn1cblxubGV0IHJlZ2lvbnNJblVzZSA9IFtdXG5cbi8qKlxuICogRmluZCB0aGUgY2xvc2VzdCBhbmNlc3RvciAoaW5jbHVkaW5nIHRoZSBwYXNzZWQgaW4gZW50aXR5KSB0aGF0IGhhcyBhbiBgb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcmAgY29tcG9uZW50LFxuICogYW5kIHJldHVybiB0aGF0IGNvbXBvbmVudFxuICovXG5mdW5jdGlvbiBnZXRSZWdpb25Gb2xsb3dlcihlbnRpdHkpIHtcbiAgICBsZXQgY3VyRW50aXR5ID0gZW50aXR5O1xuICBcbiAgICB3aGlsZShjdXJFbnRpdHkgJiYgY3VyRW50aXR5LmNvbXBvbmVudHMgJiYgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICBjdXJFbnRpdHkgPSBjdXJFbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gIFxuICAgIGlmICghY3VyRW50aXR5IHx8ICFjdXJFbnRpdHkuY29tcG9uZW50cyB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXVxufVxuICBcbmZ1bmN0aW9uIGFkZFRvUmVnaW9uKHJlZ2lvbikge1xuICAgIHJlZ2lvbnNJblVzZVtyZWdpb25dID8gcmVnaW9uc0luVXNlW3JlZ2lvbl0rKyA6IHJlZ2lvbnNJblVzZVtyZWdpb25dID0gMVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBpbiByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMSkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHRydWUpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJhbHJlYWR5IGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHN1YnRyYWN0RnJvbVJlZ2lvbihyZWdpb24pIHtcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0pIHtyZWdpb25zSW5Vc2VbcmVnaW9uXS0tIH1cbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgbGVmdCByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcblxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAwKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgZmFsc2UpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJzdGlsbCBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd1JlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcInNob3dpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgYWRkVG9SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGlkZXJSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJoaWRpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgc3VidHJhY3RGcm9tUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzKCkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKFwic2hvd2luZy9oaWRpbmcgYWxsIG9iamVjdHNcIilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2Vbb2JqLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgIGlmIChvYmouZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IGNvbnRpbnVlIH1cblxuICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCJoaWRpbmcgXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdmlzaWJsZSkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nXCIgOiBcImhpZGluZ1wiKSArIFwiIGFsbCBvYmplY3RzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgaWYgKG9iai5yZWdpb24gPT0gcmVnaW9uKSB7XG4gICAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiIGhpZGluZ1wiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG4gIFxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdhdmF0YXItcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXZhdGFyOiByZWdpb24gXCIsIHRoaXMucmVnaW9uKVxuICAgICAgICBhZGRUb1JlZ2lvbih0aGlzLnJlZ2lvbilcblxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbmV3UmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBpZiAobmV3UmVnaW9uICE9IHRoaXMucmVnaW9uKSB7XG4gICAgICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgICAgICAgICBhZGRUb1JlZ2lvbihuZXdSZWdpb24pXG4gICAgICAgICAgICB0aGlzLnJlZ2lvbiA9IG5ld1JlZ2lvblxuICAgICAgICB9XG4gICAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9LFxuICAgICAgICBkeW5hbWljOiB7IGRlZmF1bHQ6IHRydWUgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICB0aGlzLnNob3dIaWRlID0gdGhpcy5zaG93SGlkZS5iaW5kKHRoaXMpXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgIH1cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZG9uJ3QgbW92ZVxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5keW5hbWljKSB7IHJldHVybiB9XG5cbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2VbdGhpcy5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyByZXR1cm4gfVxuXG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLnNob3dIaWRlKHZpc2libGUpXG4gICAgfSxcblxuICAgIHNob3dIaWRlOiBmdW5jdGlvbiAodmlzaWJsZSkge1xuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdmlzaWJsZVxuXG4gICAgICAgIC8vLyBjaGVjayBmb3IgbWVkaWEtdmlkZW8gY29tcG9uZW50IG9uIHBhcmVudCB0byBzZWUgaWYgd2UncmUgYSB2aWRlby4gIEFsc28gc2FtZSBmb3IgYXVkaW9cbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICBpZiAodmlzaWJsZSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLndhc1BhdXNlZCAhPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICAgICAgICAgIGlmICghdGhpcy53YXNQYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncmVnaW9uLWhpZGVyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGFyZW50IHdpdGggXCJuYXYtbWVzaC1oZWxwZXJcIiwgdGhpcyBpcyBpbiB0aGUgc2NlbmUuICBcbiAgICAgICAgLy8gSWYgbm90LCBpdCdzIGluIGFuIG9iamVjdCB3ZSBkcm9wcGVkIG9uIHRoZSB3aW5kb3csIHdoaWNoIHdlIGRvbid0IHN1cHBvcnRcbiAgICAgICAgaWYgKCFmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwibmF2LW1lc2gtaGVscGVyXCIpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50IG11c3QgYmUgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGdsYi5cIilcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IDA7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMubm9kZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgICAgICBpZih0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG5cbiAgICAgICAgLy8gdGhpcy5uZXdTY2VuZSA9IHRoaXMubmV3U2NlbmUuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLm5ld1NjZW5lKVxuICAgICAgICAvLyBjb25zdCBlbnZpcm9ubWVudFNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNlbnZpcm9ubWVudC1zY2VuZVwiKTtcbiAgICAgICAgLy8gdGhpcy5hZGRTY2VuZUVsZW1lbnQgPSB0aGlzLmFkZFNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50ID0gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFNjZW5lRWxlbWVudClcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2Ugd2FudCB0byBub3RpY2Ugd2hlbiBuZXcgdGhpbmdzIGdldCBhZGRlZCB0byB0aGUgcm9vbS4gIFRoaXMgd2lsbCBoYXBwZW4gZm9yXG4gICAgICAgIC8vIG9iamVjdHMgZHJvcHBlZCBpbiB0aGUgcm9vbSwgb3IgZm9yIG5ldyByZW1vdGUgYXZhdGFycywgYXQgbGVhc3RcbiAgICAgICAgLy8gdGhpcy5hZGRSb290RWxlbWVudCA9IHRoaXMuYWRkUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVJvb3RFbGVtZW50ID0gdGhpcy5yZW1vdmVSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRSb290RWxlbWVudClcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVJvb3RFbGVtZW50KVxuXG4gICAgICAgIC8vIHdhbnQgdG8gc2VlIGlmIHRoZXJlIGFyZSBwaW5uZWQgb2JqZWN0cyB0aGF0IHdlcmUgbG9hZGVkIGZyb20gaHVic1xuICAgICAgICBsZXQgcm9vbU9iamVjdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFwiUm9vbU9iamVjdHNcIilcbiAgICAgICAgdGhpcy5yb29tT2JqZWN0cyA9IHJvb21PYmplY3RzLmxlbmd0aCA+IDAgPyByb29tT2JqZWN0c1swXSA6IG51bGxcblxuICAgICAgICAvLyBnZXQgYXZhdGFyc1xuICAgICAgICBjb25zdCBhdmF0YXJzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dXCIpO1xuICAgICAgICBhdmF0YXJzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayBvYmplY3RzIGluIHRoZSByb290ICh0aGluZ3MgdGhhdCBoYXZlIGJlZW4gZHJvcHBlZCBvbiB0aGUgc2NlbmUpXG4gICAgICAgIC8vIC0gZHJhd2luZ3MgaGF2ZSBjbGFzcz1cImRyYXdpbmdcIiwgbmV0d29ya2VkLWRyYXdpbmdcbiAgICAgICAgLy8gTm90IGdvaW5nIHRvIGRvIGRyYXdpbmdzIHJpZ2h0IG5vdy5cblxuICAgICAgICAvLyBwaW5uZWQgbWVkaWEgbGl2ZSB1bmRlciBhIG5vZGUgd2l0aCBjbGFzcz1cIlJvb21PYmplY3RzXCJcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuUm9vbU9iamVjdHMgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0gY2FtZXJhIGhhcyBjYW1lcmEtdG9vbCAgICAgICAgXG4gICAgICAgIC8vIC0gaW1hZ2UgZnJvbSBjYW1lcmEsIG9yIGRyb3BwZWQsIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLWltYWdlLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSBnbGIgaGFzIG1lZGlhLWxvYWRlciwgZ2x0Zi1tb2RlbC1wbHVzLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSB2aWRlbyBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS12aWRlbywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vXG4gICAgICAgIC8vICBzbywgZ2V0IGFsbCBjYW1lcmEtdG9vbHMsIGFuZCBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIHRoZSBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZS4gIE11c3Qgd2FpdCBmb3Igc2NlbmUgdG8gZmluaXNoIGxvYWRpbmdcbiAgICAgICAgdGhpcy5zY2VuZUxvYWRlZCA9IHRoaXMuc2NlbmVMb2FkZWQuYmluZCh0aGlzKVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcblxuICAgIH0sXG5cbiAgICAvLyBUaGluZ3Mgd2UgZG9uJ3Qgd2FudCB0byBoaWRlOlxuICAgIC8vIC0gW3dheXBvaW50XVxuICAgIC8vIC0gcGFyZW50IG9mIHNvbWV0aGluZyB3aXRoIFtuYXZtZXNoXSBhcyBhIGNoaWxkICh0aGlzIGlzIHRoZSBuYXZpZ2F0aW9uIHN0dWZmXG4gICAgLy8gLSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsXG4gICAgLy8gLSBbc2t5Ym94XVxuICAgIC8vIC0gW2RpcmVjdGlvbmFsLWxpZ2h0XVxuICAgIC8vIC0gW2FtYmllbnQtbGlnaHRdXG4gICAgLy8gLSBbaGVtaXNwaGVyZS1saWdodF1cbiAgICAvLyAtICNDb21iaW5lZE1lc2hcbiAgICAvLyAtICNzY2VuZS1wcmV2aWV3LWNhbWVyYSBvciBbc2NlbmUtcHJldmlldy1jYW1lcmFdXG4gICAgLy9cbiAgICAvLyB3ZSB3aWxsIGRvXG4gICAgLy8gLSBbbWVkaWEtbG9hZGVyXVxuICAgIC8vIC0gW3Nwb3QtbGlnaHRdXG4gICAgLy8gLSBbcG9pbnQtbGlnaHRdXG4gICAgc2NlbmVMb2FkZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5wYXJlbnRFbC5jaGlsZE5vZGVzO1xuICAgICAgICBmb3IgKGxldCBpPTA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG5vZGUgPSBub2Rlc1tpXVxuICAgICAgICAgICAgaWYgKG5vZGUgPT0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbCkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2wgPSBub2RlLmNsYXNzTmFtZVxuICAgICAgICAgICAgaWYgKGNsID09PSBcIkNvbWJpbmVkTWVzaFwiIHx8IGNsID09PSBcInNjZW5lLXByZXZpZXctY2FtZXJhXCIpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGMgPSBub2RlLmNvbXBvbmVudHNcbiAgICAgICAgICAgIGlmIChjW1wid2F5cG9pbnRcIl0gfHwgY1tcInNreWJveFwiXSB8fCBjW1wiZGlyZWN0aW9uYWwtbGlnaHRcIl0gfHwgY1tcImFtYmllbnQtbGlnaHRcIl0gfHwgY1tcImhlbWlzcGhlcmUtbGlnaHRcIl0pIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNoID0gbm9kZS5jaGlsZHJlblxuICAgICAgICAgICAgdmFyIG5hdm1lc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAobGV0IGo9MDsgaiA8IGNoLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoW2pdLmNvbXBvbmVudHNbXCJuYXZtZXNoXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIG5hdm1lc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmF2bWVzaCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUsIGR5bmFtaWM6IGZhbHNlIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBhbGwgb2JqZWN0cyBhbmQgYXZhdGFyIHNob3VsZCBiZSBzZXQgdXAsIHNvIGxldHMgbWFrZSBzdXJlIGFsbCBvYmplY3RzIGFyZSBjb3JyZWN0bHkgc2hvd25cbiAgICAgICAgc2hvd0hpZGVPYmplY3RzKClcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7dGhpcy5kYXRhLnNpemUgPSAxMH1cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09PSB0aGlzLnNpemUpIHJldHVyblxuXG4gICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmVsLnNjZW5lRWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy8gc2l6ZSA9PSAwIGlzIHVzZWQgdG8gc2lnbmFsIFwiZG8gbm90aGluZ1wiXG4gICAgICAgIGlmICh0aGlzLnNpemUgPT0gMCkge3JldHVybn1cblxuICAgICAgICAvLyBzZWUgaWYgdGhlcmUgYXJlIG5ldyBhdmF0YXJzXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXTpub3QoW2F2YXRhci1yZWdpb24tZm9sbG93ZXJdKVwiKVxuICAgICAgICBub2Rlcy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vICBzZWUgaWYgdGhlcmUgYXJlIG5ldyBjYW1lcmEtdG9vbHMgb3IgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSksIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuICAgIH0sXG4gIFxuICAgIC8vIG5ld1NjZW5lOiBmdW5jdGlvbihtb2RlbCkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudmlyb25tZW50IHNjZW5lIGxvYWRlZDogXCIsIG1vZGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LCAgXG4gICAgXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKHNpemUpIHtcbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBcbiAgICAgICAgLy8gIFwic2l6ZVwiIChhbiBpbnRlZ2VyIG51bWJlcilcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIHNldCB0aGUgaGlkZGVyIGNvbXBvbmVudCB0byBcbiAgICAgICAgLy8gdXNlIHRoYXQgc2l6ZSBpbiBtZXRlcnMgZm9yIHRoZSBxdWFkcmFudHNcbiAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5ub2RlTmFtZS5tYXRjaCgvXyhbMC05XSopJC8pXG5cbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDIsIGZpcnN0IG1hdGNoIGlzIHRoZSBkaXIsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgY29tcG9uZW50TmFtZSBuYW1lIG9yIG51bWJlclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLm5vZGVOYW1lKVxuICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBub2RlU2l6ZSA9IHBhcnNlSW50KHBhcmFtc1sxXSlcbiAgICAgICAgICAgIGlmICghbm9kZVNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbm9kZVNpemVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIEJpZGlyZWN0aW9uYWwgc2VlLXRocm91Z2ggcG9ydGFsLiBUd28gcG9ydGFscyBhcmUgcGFpcmVkIGJ5IGNvbG9yLlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBBZGQgdHdvIGluc3RhbmNlcyBvZiBgcG9ydGFsLmdsYmAgdG8gdGhlIFNwb2tlIHNjZW5lLlxuICogVGhlIG5hbWUgb2YgZWFjaCBpbnN0YW5jZSBzaG91bGQgbG9vayBsaWtlIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fY29sb3JcIlxuICogQW55IHZhbGlkIFRIUkVFLkNvbG9yIGFyZ3VtZW50IGlzIGEgdmFsaWQgY29sb3IgdmFsdWUuXG4gKiBTZWUgaGVyZSBmb3IgZXhhbXBsZSBjb2xvciBuYW1lcyBodHRwczovL3d3dy53M3NjaG9vbHMuY29tL2Nzc3JlZi9jc3NfY29sb3JzLmFzcFxuICpcbiAqIEZvciBleGFtcGxlLCB0byBtYWtlIGEgcGFpciBvZiBjb25uZWN0ZWQgYmx1ZSBwb3J0YWxzLFxuICogeW91IGNvdWxkIG5hbWUgdGhlbSBcInBvcnRhbC10b19fYmx1ZVwiIGFuZCBcInBvcnRhbC1mcm9tX19ibHVlXCJcbiAqL1xuXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcbmltcG9ydCB2ZXJ0ZXhTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwudmVydC5qcydcbmltcG9ydCBmcmFnbWVudFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC5mcmFnLmpzJ1xuaW1wb3J0IHNub2lzZSBmcm9tICcuLi9zaGFkZXJzL3Nub2lzZS5qcydcbmltcG9ydCB7IHNob3dSZWdpb25Gb3JPYmplY3QsIGhpZGVyUmVnaW9uRm9yT2JqZWN0IH0gZnJvbSAnLi9yZWdpb24taGlkZXIuanMnXG5cbmNvbnN0IHdvcmxkUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRDYW1lcmFQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZERpciA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkUXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKClcbmNvbnN0IG1hdDQgPSBuZXcgVEhSRUUuTWF0cml4NCgpXG5cbkFGUkFNRS5yZWdpc3RlclN5c3RlbSgncG9ydGFsJywge1xuICBkZXBlbmRlbmNpZXM6IFsnZmFkZXItcGx1cyddLFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyID0gdGhpcy5lbC5zeXN0ZW1zWydodWJzLXN5c3RlbXMnXS5jaGFyYWN0ZXJDb250cm9sbGVyXG4gICAgdGhpcy5mYWRlciA9IHRoaXMuZWwuc3lzdGVtc1snZmFkZXItcGx1cyddXG4gICAgdGhpcy5yb29tRGF0YSA9IG51bGxcbiAgICB0aGlzLndhaXRGb3JGZXRjaCA9IHRoaXMud2FpdEZvckZldGNoLmJpbmQodGhpcylcblxuICAgIC8vIGlmIHRoZSB1c2VyIGlzIGxvZ2dlZCBpbiwgd2Ugd2FudCB0byByZXRyaWV2ZSB0aGVpciB1c2VyRGF0YSBmcm9tIHRoZSB0b3AgbGV2ZWwgc2VydmVyXG4gICAgaWYgKHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMgJiYgd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbiAmJiAhd2luZG93LkFQUC51c2VyRGF0YSkge1xuICAgICAgICB0aGlzLmZldGNoUm9vbURhdGEoKVxuICAgIH1cbiAgfSxcbiAgZmV0Y2hSb29tRGF0YTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXJhbXMgPSB7dG9rZW46IHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMudG9rZW4sXG4gICAgICAgICAgICAgICAgICByb29tX2lkOiB3aW5kb3cuQVBQLmh1YkNoYW5uZWwuaHViSWR9XG5cbiAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgb3B0aW9ucy5oZWFkZXJzID0gbmV3IEhlYWRlcnMoKTtcbiAgICBvcHRpb25zLmhlYWRlcnMuc2V0KFwiQXV0aG9yaXphdGlvblwiLCBgQmVhcmVyICR7cGFyYW1zfWApO1xuICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuICAgIGF3YWl0IGZldGNoKFwiaHR0cHM6Ly9yZWFsaXR5bWVkaWEuZGlnaXRhbC91c2VyRGF0YVwiLCBvcHRpb25zKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4gICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdTdWNjZXNzOicsIGRhdGEpO1xuICAgICAgICAgIHRoaXMucm9vbURhdGEgPSBkYXRhO1xuICAgIH0pXG4gICAgdGhpcy5yb29tRGF0YS50ZXh0dXJlcyA9IFtdXG4gIH0sXG4gIGdldFJvb21VUkw6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgIHRoaXMud2FpdEZvckZldGNoKClcbiAgICAgIHJldHVybiB0aGlzLnJvb21EYXRhLnJvb21zLmxlbmd0aCA+IG51bWJlciA/IFwiaHR0cHM6Ly94ci5yZWFsaXR5bWVkaWEuZGlnaXRhbC9cIiArIHRoaXMucm9vbURhdGEucm9vbXNbbnVtYmVyXSA6IG51bGw7XG4gIH0sXG4gIGdldEN1YmVNYXA6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgIHRoaXMud2FpdEZvckZldGNoKClcbiAgICAgIHJldHVybiB0aGlzLnJvb21EYXRhLmN1YmVtYXBzLmxlbmd0aCA+IG51bWJlciA/IHRoaXMucm9vbURhdGEuY3ViZW1hcHNbbnVtYmVyXSA6IG51bGw7XG4gIH0sXG4gIHdhaXRGb3JGZXRjaDogZnVuY3Rpb24gKCkge1xuICAgICBpZiAodGhpcy5yb29tRGF0YSkgcmV0dXJuXG4gICAgIHNldFRpbWVvdXQodGhpcy53YWl0Rm9yRmV0Y2gsIDEwMCk7IC8vIHRyeSBhZ2FpbiBpbiAxMDAgbWlsbGlzZWNvbmRzXG4gIH0sXG4gIHRlbGVwb3J0VG86IGFzeW5jIGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gdHJ1ZVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZU91dCgpXG4gICAgLy8gU2NhbGUgc2NyZXdzIHVwIHRoZSB3YXlwb2ludCBsb2dpYywgc28ganVzdCBzZW5kIHBvc2l0aW9uIGFuZCBvcmllbnRhdGlvblxuICAgIG9iamVjdC5nZXRXb3JsZFF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG9iamVjdC5nZXRXb3JsZERpcmVjdGlvbih3b3JsZERpcilcbiAgICBvYmplY3QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICB3b3JsZFBvcy5hZGQod29ybGREaXIubXVsdGlwbHlTY2FsYXIoMS41KSkgLy8gVGVsZXBvcnQgaW4gZnJvbnQgb2YgdGhlIHBvcnRhbCB0byBhdm9pZCBpbmZpbml0ZSBsb29wXG4gICAgbWF0NC5tYWtlUm90YXRpb25Gcm9tUXVhdGVybmlvbih3b3JsZFF1YXQpXG4gICAgbWF0NC5zZXRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAvLyBVc2luZyB0aGUgY2hhcmFjdGVyQ29udHJvbGxlciBlbnN1cmVzIHdlIGRvbid0IHN0cmF5IGZyb20gdGhlIG5hdm1lc2hcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIudHJhdmVsQnlXYXlwb2ludChtYXQ0LCB0cnVlLCBmYWxzZSlcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVJbigpXG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gIH0sXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogbnVsbCB9LFxuICB9LFxuICBpbml0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5zeXN0ZW0gPSBBUFAuc2NlbmUuc3lzdGVtcy5wb3J0YWwgLy8gQS1GcmFtZSBpcyBzdXBwb3NlZCB0byBkbyB0aGlzIGJ5IGRlZmF1bHQgYnV0IGRvZXNuJ3Q/XG5cbiAgICAvLyBwYXJzZSB0aGUgbmFtZSB0byBnZXQgcG9ydGFsIHR5cGUsIHRhcmdldCwgYW5kIGNvbG9yXG4gICAgdGhpcy5wYXJzZU5vZGVOYW1lKClcblxuICAgIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgY3ViZU1hcDogeyB2YWx1ZTogbmV3IFRIUkVFLlRleHR1cmUoKSB9LFxuICAgICAgICB0aW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIHJhZGl1czogeyB2YWx1ZTogMCB9LFxuICAgICAgICByaW5nQ29sb3I6IHsgdmFsdWU6IHRoaXMuY29sb3IgfSxcbiAgICAgIH0sXG4gICAgICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICBmcmFnbWVudFNoYWRlcjogYFxuICAgICAgICAke3Nub2lzZX1cbiAgICAgICAgJHtmcmFnbWVudFNoYWRlcn1cbiAgICAgIGAsXG4gICAgfSlcblxuICAgIC8vIEFzc3VtZSB0aGF0IHRoZSBvYmplY3QgaGFzIGEgcGxhbmUgZ2VvbWV0cnlcbiAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5nZXRPckNyZWF0ZU9iamVjdDNEKCdtZXNoJylcbiAgICBtZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuXG4gICAgLy8gZ2V0IHRoZSBvdGhlciBiZWZvcmUgY29udGludWluZ1xuICAgIHRoaXMub3RoZXIgPSBhd2FpdCB0aGlzLmdldE90aGVyKClcblxuICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSkge1xuICAgICAgICB0aGlzLnN5c3RlbS5nZXRDdWJlTWFwKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKCB1cmxzID0+IHtcbiAgICAgICAgICAgIC8vY29uc3QgdXJscyA9IFtjdWJlTWFwUG9zWCwgY3ViZU1hcE5lZ1gsIGN1YmVNYXBQb3NZLCBjdWJlTWFwTmVnWSwgY3ViZU1hcFBvc1osIGN1YmVNYXBOZWdaXTtcbiAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgICAgICAgICBuZXcgVEhSRUUuQ3ViZVRleHR1cmVMb2FkZXIoKS5sb2FkKHVybHMsIHJlc29sdmUsIHVuZGVmaW5lZCwgcmVqZWN0KVxuICAgICAgICAgICAgKS50aGVuKHRleHR1cmUgPT4ge1xuICAgICAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRleHR1cmU7XG4gICAgICAgICAgICB9KS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZSkpICAgIFxuICAgICAgICB9KVxuICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHsgICAgXG4gICAgICAgIHRoaXMuY3ViZUNhbWVyYSA9IG5ldyBUSFJFRS5DdWJlQ2FtZXJhKDEsIDEwMDAwMCwgMTAyNClcbiAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnJvdGF0ZVkoTWF0aC5QSSkgLy8gRmFjZSBmb3J3YXJkc1xuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgIHRoaXMub3RoZXIuY29tcG9uZW50cy5wb3J0YWwubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgKCkgPT4ge1xuICAgICAgICAgICAgc2hvd1JlZ2lvbkZvck9iamVjdCh0aGlzLmVsKVxuICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnVwZGF0ZSh0aGlzLmVsLnNjZW5lRWwucmVuZGVyZXIsIHRoaXMuZWwuc2NlbmVFbC5vYmplY3QzRClcbiAgICAgICAgICAgIGhpZGVyUmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICBwcm9wZXJ0eTogJ2NvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZScsXG4gICAgICAgIGR1cjogNzAwLFxuICAgICAgICBlYXNpbmc6ICdlYXNlSW5PdXRDdWJpYycsXG4gICAgfSlcbiAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmJlZ2luJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHRydWUpKVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uY29tcGxldGVfX3BvcnRhbCcsICgpID0+ICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSAhdGhpcy5pc0Nsb3NlZCgpKSlcblxuICAgIC8vIGdvaW5nIHRvIHdhbnQgdG8gdHJ5IGFuZCBtYWtlIHRoZSBvYmplY3QgdGhpcyBwb3J0YWwgaXMgb24gY2xpY2thYmxlXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCd0YWdzJywge3NpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZX0pXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcbiAgICAvLyBvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBwb3J0YWwgbW92ZW1lbnQgXG4gICAgdGhpcy5mb2xsb3dQb3J0YWwgPSB0aGlzLmZvbGxvd1BvcnRhbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5lbC5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuZm9sbG93UG9ydGFsKVxuXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3Byb3hpbWl0eS1ldmVudHMnLCB7IHJhZGl1czogNSB9KVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5ZW50ZXInLCAoKSA9PiB0aGlzLm9wZW4oKSlcbiAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5jbG9zZSgpKVxuICB9LFxuXG4gIGZvbGxvd1BvcnRhbDogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgIH1cbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnRpbWUudmFsdWUgPSB0aW1lIC8gMTAwMFxuICAgICAgICBcbiAgICBpZiAodGhpcy5vdGhlciAmJiAhdGhpcy5zeXN0ZW0udGVsZXBvcnRpbmcpIHtcbiAgICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYVBvcylcbiAgICAgIGNvbnN0IGRpc3QgPSB3b3JsZENhbWVyYVBvcy5kaXN0YW5jZVRvKHdvcmxkUG9zKVxuXG4gICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEgJiYgZGlzdCA8IDAuNSkge1xuICAgICAgICAvL2NvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgLy93aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIgJiYgZGlzdCA8IDEpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgZ2V0T3RoZXI6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAwKSByZXNvbHZlKG51bGwpXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgID09IDEpIHtcbiAgICAgICAgICAgIC8vIHRoZSB0YXJnZXQgaXMgYW5vdGhlciByb29tLCByZXNvbHZlIHdpdGggdGhlIFVSTCB0byB0aGUgcm9vbVxuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Um9vbVVSTCh0aGlzLnBvcnRhbFRhcmdldCkudGhlbih1cmwgPT4geyByZXNvbHZlKHVybCkgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG5vdyBmaW5kIHRoZSBwb3J0YWwgd2l0aGluIHRoZSByb29tLiAgVGhlIHBvcnRhbHMgc2hvdWxkIGNvbWUgaW4gcGFpcnMgd2l0aCB0aGUgc2FtZSBwb3J0YWxUYXJnZXRcbiAgICAgICAgY29uc3QgcG9ydGFscyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW3BvcnRhbF1gKSlcbiAgICAgICAgY29uc3Qgb3RoZXIgPSBwb3J0YWxzLmZpbmQoKGVsKSA9PiBlbC5jb21wb25lbnRzLnBvcnRhbC5wb3J0YWxUeXBlID09IHRoaXMucG9ydGFsVHlwZSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFRhcmdldCA9PT0gdGhpcy5wb3J0YWxUYXJnZXQgJiYgZWwgIT09IHRoaXMuZWwpXG4gICAgICAgIGlmIChvdGhlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBDYXNlIDE6IFRoZSBvdGhlciBwb3J0YWwgYWxyZWFkeSBleGlzdHNcbiAgICAgICAgICAgIHJlc29sdmUob3RoZXIpXG4gICAgICAgICAgICBvdGhlci5lbWl0KCdwYWlyJywgeyBvdGhlcjogdGhpcy5lbCB9KSAvLyBMZXQgdGhlIG90aGVyIGtub3cgdGhhdCB3ZSdyZSByZWFkeVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2FzZSAyOiBXZSBjb3VsZG4ndCBmaW5kIHRoZSBvdGhlciBwb3J0YWwsIHdhaXQgZm9yIGl0IHRvIHNpZ25hbCB0aGF0IGl0J3MgcmVhZHlcbiAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncGFpcicsIChldmVudCkgPT4gcmVzb2x2ZShldmVudC5kZXRhaWwub3RoZXIpLCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggZWl0aGVyIFxuICAgIC8vIC0gXCJyb29tX25hbWVfY29sb3JcIlxuICAgIC8vIC0gXCJwb3J0YWxfTl9jb2xvclwiIFxuICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gTnVtYmVyZWQgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycy5cbiAgICBjb25zdCBwYXJhbXMgPSBub2RlTmFtZS5tYXRjaCgvKFtBLVphLXpdKilfKFtBLVphLXowLTldKilfKFtBLVphLXowLTldKikkLylcbiAgICBcbiAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgNCwgZmlyc3QgbWF0Y2ggaXMgdGhlIHBvcnRhbCB0eXBlLFxuICAgIC8vIHNlY29uZCBpcyB0aGUgbmFtZSBvciBudW1iZXIsIGFuZCBsYXN0IGlzIHRoZSBjb2xvclxuICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCA0KSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcInBvcnRhbCBub2RlIG5hbWUgbm90IGZvcm1lZCBjb3JyZWN0bHk6IFwiLCBub2RlTmFtZSlcbiAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgdGhpcy5jb2xvciA9IFwicmVkXCIgLy8gZGVmYXVsdCBzbyB0aGUgcG9ydGFsIGhhcyBhIGNvbG9yIHRvIHVzZVxuICAgICAgICByZXR1cm47XG4gICAgfSBcbiAgICBpZiAocGFyYW1zWzFdID09PSBcInJvb21cIikge1xuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAxO1xuICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBhcnNlSW50KHBhcmFtc1syXSlcbiAgICB9IGVsc2UgaWYgKHBhcmFtc1sxXSA9PT0gXCJwb3J0YWxcIikge1xuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAyO1xuICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBhcmFtc1syXVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDA7XG4gICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gbnVsbFxuICAgIH0gXG4gICAgdGhpcy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcihwYXJhbXNbM10pXG4gIH0sXG5cbiAgc2V0UmFkaXVzKHZhbCkge1xuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhbmltYXRpb25fX3BvcnRhbCcsIHtcbiAgICAgIGZyb206IHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlLFxuICAgICAgdG86IHZhbCxcbiAgICB9KVxuICB9LFxuICBvcGVuKCkge1xuICAgIHRoaXMuc2V0UmFkaXVzKDEpXG4gIH0sXG4gIGNsb3NlKCkge1xuICAgIHRoaXMuc2V0UmFkaXVzKDApXG4gIH0sXG4gIGlzQ2xvc2VkKCkge1xuICAgIHJldHVybiB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZSA9PT0gMFxuICB9LFxufSlcbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiAzNjAgaW1hZ2UgdGhhdCBmaWxscyB0aGUgdXNlcidzIHZpc2lvbiB3aGVuIGluIGEgY2xvc2UgcHJveGltaXR5LlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBHaXZlbiBhIDM2MCBpbWFnZSBhc3NldCB3aXRoIHRoZSBmb2xsb3dpbmcgVVJMIGluIFNwb2tlOlxuICogaHR0cHM6Ly9ndC1hZWwtYXEtYXNzZXRzLmFlbGF0Z3QtaW50ZXJuYWwubmV0L2ZpbGVzLzEyMzQ1YWJjLTY3ODlkZWYuanBnXG4gKlxuICogVGhlIG5hbWUgb2YgdGhlIGBpbW1lcnNpdmUtMzYwLmdsYmAgaW5zdGFuY2UgaW4gdGhlIHNjZW5lIHNob3VsZCBiZTpcbiAqIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fMTIzNDVhYmMtNjc4OWRlZl9qcGdcIiBPUiBcIjEyMzQ1YWJjLTY3ODlkZWZfanBnXCJcbiAqL1xuXG5jb25zdCB3b3JsZENhbWVyYSA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkU2VsZiA9IG5ldyBUSFJFRS5WZWN0b3IzKClcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywge1xuICBzY2hlbWE6IHtcbiAgICB1cmw6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IG51bGwgfSxcbiAgfSxcbiAgaW5pdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHVybCA9IHRoaXMuZGF0YS51cmwgPz8gdGhpcy5wYXJzZVNwb2tlTmFtZSgpXG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdXJsLm1hdGNoKC9eLipcXC4oLiopJC8pWzFdXG5cbiAgICAvLyBtZWRpYS1pbWFnZSB3aWxsIHNldCB1cCB0aGUgc3BoZXJlIGdlb21ldHJ5IGZvciB1c1xuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdtZWRpYS1pbWFnZScsIHtcbiAgICAgIHByb2plY3Rpb246ICczNjAtZXF1aXJlY3Rhbmd1bGFyJyxcbiAgICAgIGFscGhhTW9kZTogJ29wYXF1ZScsXG4gICAgICBzcmM6IHVybCxcbiAgICAgIHZlcnNpb246IDEsXG4gICAgICBiYXRjaDogZmFsc2UsXG4gICAgICBjb250ZW50VHlwZTogYGltYWdlLyR7ZXh0ZW5zaW9ufWAsXG4gICAgICBhbHBoYUN1dG9mZjogMCxcbiAgICB9KVxuICAgIC8vIGJ1dCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoaXMgdG8gaGFwcGVuXG4gICAgdGhpcy5tZXNoID0gYXdhaXQgdGhpcy5nZXRNZXNoKClcbiAgICB0aGlzLm1lc2guZ2VvbWV0cnkuc2NhbGUoMTAwLCAxMDAsIDEwMClcbiAgICB0aGlzLm1lc2gubWF0ZXJpYWwuc2V0VmFsdWVzKHtcbiAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgZGVwdGhUZXN0OiBmYWxzZSxcbiAgICB9KVxuICAgIHRoaXMubmVhciA9IDFcbiAgICB0aGlzLmZhciA9IDEuM1xuXG4gICAgLy8gUmVuZGVyIE9WRVIgdGhlIHNjZW5lIGJ1dCBVTkRFUiB0aGUgY3Vyc29yXG4gICAgdGhpcy5tZXNoLnJlbmRlck9yZGVyID0gQVBQLlJFTkRFUl9PUkRFUi5DVVJTT1IgLSAxXG4gIH0sXG4gIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5tZXNoKSB7XG4gICAgICAvLyBMaW5lYXJseSBtYXAgY2FtZXJhIGRpc3RhbmNlIHRvIG1hdGVyaWFsIG9wYWNpdHlcbiAgICAgIHRoaXMubWVzaC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkU2VsZilcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gd29ybGRTZWxmLmRpc3RhbmNlVG8od29ybGRDYW1lcmEpXG4gICAgICBjb25zdCBvcGFjaXR5ID0gMSAtIChkaXN0YW5jZSAtIHRoaXMubmVhcikgLyAodGhpcy5mYXIgLSB0aGlzLm5lYXIpXG4gICAgICB0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eSA9IG9wYWNpdHlcbiAgICB9XG4gIH0sXG4gIHBhcnNlU3Bva2VOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgLy8gQWNjZXB0ZWQgbmFtZXM6IFwibGFiZWxfX2ltYWdlLWhhc2hfZXh0XCIgT1IgXCJpbWFnZS1oYXNoX2V4dFwiXG4gICAgY29uc3Qgc3Bva2VOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICBjb25zdCBbLCBoYXNoLCBleHRlbnNpb25dID0gc3Bva2VOYW1lLm1hdGNoKC8oPzouKl9fKT8oLiopXyguKikvKVxuICAgIGNvbnN0IHVybCA9IGBodHRwczovL2d0LWFlbC1hcS1hc3NldHMuYWVsYXRndC1pbnRlcm5hbC5uZXQvZmlsZXMvJHtoYXNofS4ke2V4dGVuc2lvbn1gXG4gICAgcmV0dXJuIHVybFxuICB9LFxuICBnZXRNZXNoOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgICBpZiAobWVzaCkgcmVzb2x2ZShtZXNoKVxuICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAnaW1hZ2UtbG9hZGVkJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHJlc29sdmUodGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoKVxuICAgICAgICB9LFxuICAgICAgICB7IG9uY2U6IHRydWUgfVxuICAgICAgKVxuICAgIH0pXG4gIH0sXG59KVxuIiwiLy8gUGFyYWxsYXggT2NjbHVzaW9uIHNoYWRlcnMgZnJvbVxuLy8gICAgaHR0cDovL3N1bmFuZGJsYWNrY2F0LmNvbS90aXBGdWxsVmlldy5waHA/dG9waWNpZD0yOFxuLy8gTm8gdGFuZ2VudC1zcGFjZSB0cmFuc2Zvcm1zIGxvZ2ljIGJhc2VkIG9uXG4vLyAgIGh0dHA6Ly9tbWlra2Vsc2VuM2QuYmxvZ3Nwb3Quc2svMjAxMi8wMi9wYXJhbGxheHBvYy1tYXBwaW5nLWFuZC1uby10YW5nZW50Lmh0bWxcblxuLy8gSWRlbnRpdHkgZnVuY3Rpb24gZm9yIGdsc2wtbGl0ZXJhbCBoaWdobGlnaHRpbmcgaW4gVlMgQ29kZVxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgUGFyYWxsYXhTaGFkZXIgPSB7XG4gIC8vIE9yZGVyZWQgZnJvbSBmYXN0ZXN0IHRvIGJlc3QgcXVhbGl0eS5cbiAgbW9kZXM6IHtcbiAgICBub25lOiAnTk9fUEFSQUxMQVgnLFxuICAgIGJhc2ljOiAnVVNFX0JBU0lDX1BBUkFMTEFYJyxcbiAgICBzdGVlcDogJ1VTRV9TVEVFUF9QQVJBTExBWCcsXG4gICAgb2NjbHVzaW9uOiAnVVNFX09DTFVTSU9OX1BBUkFMTEFYJywgLy8gYS5rLmEuIFBPTVxuICAgIHJlbGllZjogJ1VTRV9SRUxJRUZfUEFSQUxMQVgnLFxuICB9LFxuXG4gIHVuaWZvcm1zOiB7XG4gICAgYnVtcE1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIG1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWF4TGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gIH0sXG5cbiAgdmVydGV4U2hhZGVyOiBnbHNsYFxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICB2VXYgPSB1djtcbiAgICAgIHZlYzQgbXZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoIHBvc2l0aW9uLCAxLjAgKTtcbiAgICAgIHZWaWV3UG9zaXRpb24gPSAtbXZQb3NpdGlvbi54eXo7XG4gICAgICB2Tm9ybWFsID0gbm9ybWFsaXplKCBub3JtYWxNYXRyaXggKiBub3JtYWwgKTtcbiAgICAgIFxuICAgICAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uTWF0cml4ICogbXZQb3NpdGlvbjtcbiAgICB9XG4gIGAsXG5cbiAgZnJhZ21lbnRTaGFkZXI6IGdsc2xgXG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgYnVtcE1hcDtcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBtYXA7XG5cbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4U2NhbGU7XG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheE1pbkxheWVycztcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWF4TGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgZmFkZTsgLy8gQ1VTVE9NXG5cbiAgICB2YXJ5aW5nIHZlYzIgdlV2O1xuICAgIHZhcnlpbmcgdmVjMyB2Vmlld1Bvc2l0aW9uO1xuICAgIHZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG4gICAgI2lmZGVmIFVTRV9CQVNJQ19QQVJBTExBWFxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIGZsb2F0IGluaXRpYWxIZWlnaHQgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgdlV2KS5yO1xuXG4gICAgICAvLyBObyBPZmZzZXQgTGltaXR0aW5nOiBtZXNzeSwgZmxvYXRpbmcgb3V0cHV0IGF0IGdyYXppbmcgYW5nbGVzLlxuICAgICAgLy9cInZlYzIgdGV4Q29vcmRPZmZzZXQgPSBwYXJhbGxheFNjYWxlICogVi54eSAvIFYueiAqIGluaXRpYWxIZWlnaHQ7XCIsXG5cbiAgICAgIC8vIE9mZnNldCBMaW1pdGluZ1xuICAgICAgdmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5ICogaW5pdGlhbEhlaWdodDtcbiAgICAgIHJldHVybiB2VXYgLSB0ZXhDb29yZE9mZnNldDtcbiAgICB9XG5cbiAgICAjZWxzZVxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIC8vIERldGVybWluZSBudW1iZXIgb2YgbGF5ZXJzIGZyb20gYW5nbGUgYmV0d2VlbiBWIGFuZCBOXG4gICAgICBmbG9hdCBudW1MYXllcnMgPSBtaXgocGFyYWxsYXhNYXhMYXllcnMsIHBhcmFsbGF4TWluTGF5ZXJzLCBhYnMoZG90KHZlYzMoMC4wLCAwLjAsIDEuMCksIFYpKSk7XG5cbiAgICAgIGZsb2F0IGxheWVySGVpZ2h0ID0gMS4wIC8gbnVtTGF5ZXJzO1xuICAgICAgZmxvYXQgY3VycmVudExheWVySGVpZ2h0ID0gMC4wO1xuICAgICAgLy8gU2hpZnQgb2YgdGV4dHVyZSBjb29yZGluYXRlcyBmb3IgZWFjaCBpdGVyYXRpb25cbiAgICAgIHZlYzIgZHRleCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56IC8gbnVtTGF5ZXJzO1xuXG4gICAgICB2ZWMyIGN1cnJlbnRUZXh0dXJlQ29vcmRzID0gdlV2O1xuXG4gICAgICBmbG9hdCBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcblxuICAgICAgLy8gd2hpbGUgKCBoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCApXG4gICAgICAvLyBJbmZpbml0ZSBsb29wcyBhcmUgbm90IHdlbGwgc3VwcG9ydGVkLiBEbyBhIFwibGFyZ2VcIiBmaW5pdGVcbiAgICAgIC8vIGxvb3AsIGJ1dCBub3QgdG9vIGxhcmdlLCBhcyBpdCBzbG93cyBkb3duIHNvbWUgY29tcGlsZXJzLlxuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAzMDsgaSArPSAxKSB7XG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA8PSBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gbGF5ZXJIZWlnaHQ7XG4gICAgICAgIC8vIFNoaWZ0IHRleHR1cmUgY29vcmRpbmF0ZXMgYWxvbmcgdmVjdG9yIFZcbiAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZHRleDtcbiAgICAgICAgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG4gICAgICB9XG5cbiAgICAgICNpZmRlZiBVU0VfU1RFRVBfUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIGN1cnJlbnRUZXh0dXJlQ29vcmRzO1xuXG4gICAgICAjZWxpZiBkZWZpbmVkKFVTRV9SRUxJRUZfUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgZGVsdGFUZXhDb29yZCA9IGR0ZXggLyAyLjA7XG4gICAgICBmbG9hdCBkZWx0YUhlaWdodCA9IGxheWVySGVpZ2h0IC8gMi4wO1xuXG4gICAgICAvLyBSZXR1cm4gdG8gdGhlIG1pZCBwb2ludCBvZiBwcmV2aW91cyBsYXllclxuICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgIGN1cnJlbnRMYXllckhlaWdodCAtPSBkZWx0YUhlaWdodDtcblxuICAgICAgLy8gQmluYXJ5IHNlYXJjaCB0byBpbmNyZWFzZSBwcmVjaXNpb24gb2YgU3RlZXAgUGFyYWxsYXggTWFwcGluZ1xuICAgICAgY29uc3QgaW50IG51bVNlYXJjaGVzID0gNTtcbiAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgbnVtU2VhcmNoZXM7IGkgKz0gMSkge1xuICAgICAgICBkZWx0YVRleENvb3JkIC89IDIuMDtcbiAgICAgICAgZGVsdGFIZWlnaHQgLz0gMi4wO1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgICAgLy8gU2hpZnQgYWxvbmcgb3IgYWdhaW5zdCB2ZWN0b3IgVlxuICAgICAgICBpZiAoaGVpZ2h0RnJvbVRleHR1cmUgPiBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICAvLyBCZWxvdyB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gYWJvdmUgdGhlIHN1cmZhY2VcblxuICAgICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzICs9IGRlbHRhVGV4Q29vcmQ7XG4gICAgICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX09DTFVTSU9OX1BBUkFMTEFYKVxuXG4gICAgICB2ZWMyIHByZXZUQ29vcmRzID0gY3VycmVudFRleHR1cmVDb29yZHMgKyBkdGV4O1xuXG4gICAgICAvLyBIZWlnaHRzIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgbmV4dEggPSBoZWlnaHRGcm9tVGV4dHVyZSAtIGN1cnJlbnRMYXllckhlaWdodDtcbiAgICAgIGZsb2F0IHByZXZIID0gdGV4dHVyZTJEKGJ1bXBNYXAsIHByZXZUQ29vcmRzKS5yIC0gY3VycmVudExheWVySGVpZ2h0ICsgbGF5ZXJIZWlnaHQ7XG5cbiAgICAgIC8vIFByb3BvcnRpb25zIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgd2VpZ2h0ID0gbmV4dEggLyAobmV4dEggLSBwcmV2SCk7XG5cbiAgICAgIC8vIEludGVycG9sYXRpb24gb2YgdGV4dHVyZSBjb29yZGluYXRlc1xuICAgICAgcmV0dXJuIHByZXZUQ29vcmRzICogd2VpZ2h0ICsgY3VycmVudFRleHR1cmVDb29yZHMgKiAoMS4wIC0gd2VpZ2h0KTtcblxuICAgICAgI2Vsc2UgLy8gTk9fUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIHZVdjtcblxuICAgICAgI2VuZGlmXG4gICAgfVxuICAgICNlbmRpZlxuXG4gICAgdmVjMiBwZXJ0dXJiVXYodmVjMyBzdXJmUG9zaXRpb24sIHZlYzMgc3VyZk5vcm1hbCwgdmVjMyB2aWV3UG9zaXRpb24pIHtcbiAgICAgIHZlYzIgdGV4RHggPSBkRmR4KHZVdik7XG4gICAgICB2ZWMyIHRleER5ID0gZEZkeSh2VXYpO1xuXG4gICAgICB2ZWMzIHZTaWdtYVggPSBkRmR4KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZTaWdtYVkgPSBkRmR5KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZSMSA9IGNyb3NzKHZTaWdtYVksIHN1cmZOb3JtYWwpO1xuICAgICAgdmVjMyB2UjIgPSBjcm9zcyhzdXJmTm9ybWFsLCB2U2lnbWFYKTtcbiAgICAgIGZsb2F0IGZEZXQgPSBkb3QodlNpZ21hWCwgdlIxKTtcblxuICAgICAgdmVjMiB2UHJvalZzY3IgPSAoMS4wIC8gZkRldCkgKiB2ZWMyKGRvdCh2UjEsIHZpZXdQb3NpdGlvbiksIGRvdCh2UjIsIHZpZXdQb3NpdGlvbikpO1xuICAgICAgdmVjMyB2UHJvalZ0ZXg7XG4gICAgICB2UHJvalZ0ZXgueHkgPSB0ZXhEeCAqIHZQcm9qVnNjci54ICsgdGV4RHkgKiB2UHJvalZzY3IueTtcbiAgICAgIHZQcm9qVnRleC56ID0gZG90KHN1cmZOb3JtYWwsIHZpZXdQb3NpdGlvbik7XG5cbiAgICAgIHJldHVybiBwYXJhbGxheE1hcCh2UHJvalZ0ZXgpO1xuICAgIH1cblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZlYzIgbWFwVXYgPSBwZXJ0dXJiVXYoLXZWaWV3UG9zaXRpb24sIG5vcm1hbGl6ZSh2Tm9ybWFsKSwgbm9ybWFsaXplKHZWaWV3UG9zaXRpb24pKTtcbiAgICAgIFxuICAgICAgLy8gQ1VTVE9NIFNUQVJUXG4gICAgICB2ZWM0IHRleGVsID0gdGV4dHVyZTJEKG1hcCwgbWFwVXYpO1xuICAgICAgdmVjMyBjb2xvciA9IG1peCh0ZXhlbC54eXosIHZlYzMoMCksIGZhZGUpO1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2xvciwgMS4wKTtcbiAgICAgIC8vIENVU1RPTSBFTkRcbiAgICB9XG5cbiAgYCxcbn1cblxuZXhwb3J0IHsgUGFyYWxsYXhTaGFkZXIgfVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIENyZWF0ZSB0aGUgaWxsdXNpb24gb2YgZGVwdGggaW4gYSBjb2xvciBpbWFnZSBmcm9tIGEgZGVwdGggbWFwXG4gKlxuICogVXNhZ2VcbiAqID09PT09XG4gKiBDcmVhdGUgYSBwbGFuZSBpbiBCbGVuZGVyIGFuZCBnaXZlIGl0IGEgbWF0ZXJpYWwgKGp1c3QgdGhlIGRlZmF1bHQgUHJpbmNpcGxlZCBCU0RGKS5cbiAqIEFzc2lnbiBjb2xvciBpbWFnZSB0byBcImNvbG9yXCIgY2hhbm5lbCBhbmQgZGVwdGggbWFwIHRvIFwiZW1pc3NpdmVcIiBjaGFubmVsLlxuICogWW91IG1heSB3YW50IHRvIHNldCBlbWlzc2l2ZSBzdHJlbmd0aCB0byB6ZXJvIHNvIHRoZSBwcmV2aWV3IGxvb2tzIGJldHRlci5cbiAqIEFkZCB0aGUgXCJwYXJhbGxheFwiIGNvbXBvbmVudCBmcm9tIHRoZSBIdWJzIGV4dGVuc2lvbiwgY29uZmlndXJlLCBhbmQgZXhwb3J0IGFzIC5nbGJcbiAqL1xuXG5pbXBvcnQgeyBQYXJhbGxheFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzJ1xuXG5jb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBmb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwYXJhbGxheCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgc3RyZW5ndGg6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuNSB9LFxuICAgIGN1dG9mZlRyYW5zaXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA4IH0sXG4gICAgY3V0b2ZmQW5nbGU6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA0IH0sXG4gIH0sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgY29uc3QgeyBtYXA6IGNvbG9yTWFwLCBlbWlzc2l2ZU1hcDogZGVwdGhNYXAgfSA9IG1lc2gubWF0ZXJpYWxcbiAgICBjb2xvck1hcC53cmFwUyA9IGNvbG9yTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZ1xuICAgIGRlcHRoTWFwLndyYXBTID0gZGVwdGhNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgY29uc3QgeyB2ZXJ0ZXhTaGFkZXIsIGZyYWdtZW50U2hhZGVyIH0gPSBQYXJhbGxheFNoYWRlclxuICAgIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgdmVydGV4U2hhZGVyLFxuICAgICAgZnJhZ21lbnRTaGFkZXIsXG4gICAgICBkZWZpbmVzOiB7IFVTRV9PQ0xVU0lPTl9QQVJBTExBWDogdHJ1ZSB9LFxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgbWFwOiB7IHZhbHVlOiBjb2xvck1hcCB9LFxuICAgICAgICBidW1wTWFwOiB7IHZhbHVlOiBkZXB0aE1hcCB9LFxuICAgICAgICBwYXJhbGxheFNjYWxlOiB7IHZhbHVlOiAtMSAqIHRoaXMuZGF0YS5zdHJlbmd0aCB9LFxuICAgICAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogMjAgfSxcbiAgICAgICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IDMwIH0sXG4gICAgICAgIGZhZGU6IHsgdmFsdWU6IDAgfSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICBtZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuICB9LFxuICB0aWNrKCkge1xuICAgIGlmICh0aGlzLmVsLnNjZW5lRWwuY2FtZXJhKSB7XG4gICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24odmVjKVxuICAgICAgdGhpcy5lbC5vYmplY3QzRC53b3JsZFRvTG9jYWwodmVjKVxuICAgICAgY29uc3QgYW5nbGUgPSB2ZWMuYW5nbGVUbyhmb3J3YXJkKVxuICAgICAgY29uc3QgZmFkZSA9IG1hcExpbmVhckNsYW1wZWQoXG4gICAgICAgIGFuZ2xlLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgLSB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgdGhpcy5kYXRhLmN1dG9mZkFuZ2xlICsgdGhpcy5kYXRhLmN1dG9mZlRyYW5zaXRpb24sXG4gICAgICAgIDAsIC8vIEluIHZpZXcgem9uZSwgbm8gZmFkZVxuICAgICAgICAxIC8vIE91dHNpZGUgdmlldyB6b25lLCBmdWxsIGZhZGVcbiAgICAgIClcbiAgICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuZmFkZS52YWx1ZSA9IGZhZGVcbiAgICB9XG4gIH0sXG59KVxuXG5mdW5jdGlvbiBjbGFtcCh2YWx1ZSwgbWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gYjEgKyAoKHggLSBhMSkgKiAoYjIgLSBiMSkpIC8gKGEyIC0gYTEpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhckNsYW1wZWQoeCwgYTEsIGEyLCBiMSwgYjIpIHtcbiAgcmV0dXJuIGNsYW1wKG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMiksIGIxLCBiMilcbn1cbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBjcmVhdGUgYSBIVE1MIG9iamVjdCBieSByZW5kZXJpbmcgYSBzY3JpcHQgdGhhdCBjcmVhdGVzIGFuZCBtYW5hZ2VzIGl0XG4gKlxuICovXG5cbi8vaW1wb3J0IHtXZWJMYXllcjNELCB0b0RPTSwgVEhSRUV9IGZyb20gJy9ub2RlX21vZHVsZXMvZXRoZXJlYWwvZGlzdC9ldGhlcmVhbC5lcy5qcydcblxuLy8gY29uc3QgZXJyb3JIVE1MID0gJzxkaXYgaWQ9XCJoZWxsb1wiIHhyLXdpZHRoPVwiMlwiIHN0eWxlPVwid2lkdGg6IDIwMHB4OyBoZWlnaHQ6IDMwcHg7IGJhY2tncm91bmQ6IHJnYmEoMSwgMCwgMCwgMC42KTsgcG9zaXRpb246YWJzb2x1dGVcIj5ObyBUZXh0IFByb3ZpZGVkPC9kaXY+J1xuXG5pbXBvcnQgKiBhcyBodG1sQ29tcG9uZW50cyBmcm9tIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gXCIqX2NvbXBvbmVudE5hbWVcIlxuICAgICAgICBuYW1lOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSA9PT0gXCJcIiB8fCB0aGlzLmRhdGEubmFtZSA9PT0gdGhpcy5mdWxsTmFtZSkgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveVNjcmlwdCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgY3JlYXRlU2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGVhY2ggdGltZSB3ZSBsb2FkIGEgc2NyaXB0IGNvbXBvbmVudCB3ZSB3aWxsIHBvc3NpYmx5IGNyZWF0ZVxuICAgICAgICAvLyBhIG5ldyBuZXR3b3JrZWQgY29tcG9uZW50LiAgVGhpcyBpcyBmaW5lLCBzaW5jZSB0aGUgbmV0d29ya2VkIElkIFxuICAgICAgICAvLyBpcyBiYXNlZCBvbiB0aGUgZnVsbCBuYW1lIHBhc3NlZCBhcyBhIHBhcmFtZXRlciwgb3IgYXNzaWduZWQgdG8gdGhlXG4gICAgICAgIC8vIGNvbXBvbmVudCBpbiBTcG9rZS4gIEl0IGRvZXMgbWVhbiB0aGF0IGlmIHdlIGhhdmVcbiAgICAgICAgLy8gbXVsdGlwbGUgb2JqZWN0cyBpbiB0aGUgc2NlbmUgd2hpY2ggaGF2ZSB0aGUgc2FtZSBuYW1lLCB0aGV5IHdpbGxcbiAgICAgICAgLy8gYmUgaW4gc3luYy4gIEl0IGFsc28gbWVhbnMgdGhhdCBpZiB5b3Ugd2FudCB0byBkcm9wIGEgY29tcG9uZW50IG9uXG4gICAgICAgIC8vIHRoZSBzY2VuZSB2aWEgYSAuZ2xiLCBpdCBtdXN0IGhhdmUgYSB2YWxpZCBuYW1lIHBhcmFtZXRlciBpbnNpZGUgaXQuXG4gICAgICAgIC8vIEEgLmdsYiBpbiBzcG9rZSB3aWxsIGZhbGwgYmFjayB0byB0aGUgc3Bva2UgbmFtZSBpZiB5b3UgdXNlIG9uZSB3aXRob3V0XG4gICAgICAgIC8vIGEgbmFtZSBpbnNpZGUgaXQuXG4gICAgICAgIHRoaXMubG9hZFNjcmlwdCgpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBhcmVudCBuZXR3b3JrZWQgZW50aXR5LCB3aGVuIGl0J3MgZmluaXNoZWQgaW5pdGlhbGl6aW5nLiAgXG4gICAgICAgICAgICAgICAgLy8gV2hlbiBjcmVhdGluZyB0aGlzIGFzIHBhcnQgb2YgYSBHTFRGIGxvYWQsIHRoZSBcbiAgICAgICAgICAgICAgICAvLyBwYXJlbnQgYSBmZXcgc3RlcHMgdXAgd2lsbCBiZSBuZXR3b3JrZWQuICBXZSdsbCBvbmx5IGRvIHRoaXNcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGUgSFRNTCBzY3JpcHQgd2FudHMgdG8gYmUgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBudWxsXG5cbiAgICAgICAgICAgICAgICAvLyBiaW5kIGNhbGxiYWNrc1xuICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5zZXROZXR3b3JrTWV0aG9kcyh0aGlzLnRha2VPd25lcnNoaXAsIHRoaXMuc2V0U2hhcmVkRGF0YSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0RWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IHNjcmlwdEVsXG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkKHRoaXMuc2NyaXB0LndlYkxheWVyM0QpXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELl93ZWJMYXllci5faGFzaGluZ0NhbnZhcy53aWR0aCA9IDIwXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELl93ZWJMYXllci5faGFzaGluZ0NhbnZhcy5oZWlnaHQgPSAyMFxuXG4gICAgICAgICAgICAvLyBsZXRzIGZpZ3VyZSBvdXQgdGhlIHNjYWxlLCBidXQgc2NhbGluZyB0byBmaWxsIHRoZSBhIDF4MW0gc3F1YXJlLCB0aGF0IGhhcyBhbHNvXG4gICAgICAgICAgICAvLyBwb3RlbnRpYWxseSBiZWVuIHNjYWxlZCBieSB0aGUgcGFyZW50cyBwYXJlbnQgbm9kZS4gSWYgd2Ugc2NhbGUgdGhlIGVudGl0eSBpbiBzcG9rZSxcbiAgICAgICAgICAgIC8vIHRoaXMgaXMgd2hlcmUgdGhlIHNjYWxlIGlzIHNldC4gIElmIHdlIGRyb3AgYSBub2RlIGluIGFuZCBzY2FsZSBpdCwgdGhlIHNjYWxlIGlzIGFsc29cbiAgICAgICAgICAgIC8vIHNldCB0aGVyZS5cbiAgICAgICAgICAgIC8vIFdlIHVzZWQgdG8gaGF2ZSBhIGZpeGVkIHNpemUgcGFzc2VkIGJhY2sgZnJvbSB0aGUgZW50aXR5LCBidXQgdGhhdCdzIHRvbyByZXN0cmljdGl2ZTpcbiAgICAgICAgICAgIC8vIGNvbnN0IHdpZHRoID0gdGhpcy5zY3JpcHQud2lkdGhcbiAgICAgICAgICAgIC8vIGNvbnN0IGhlaWdodCA9IHRoaXMuc2NyaXB0LmhlaWdodFxuXG4gICAgICAgICAgICB2YXIgcGFyZW50MiA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwub2JqZWN0M0RcbiAgICAgICAgICAgIHZhciB3aWR0aCA9IHBhcmVudDIuc2NhbGUueFxuICAgICAgICAgICAgdmFyIGhlaWdodCA9IHBhcmVudDIuc2NhbGUueVxuICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS54ID0gMVxuICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS55ID0gMVxuXG4gICAgICAgICAgICBpZiAod2lkdGggJiYgd2lkdGggPiAwICYmIGhlaWdodCAmJiBoZWlnaHQgPiAwKSB7XG4gICAgICAgICAgICAgIC8vICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gbmVlZCB0byBkZWxheSB0aGlzIGNhbGN1bGF0aW9uXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gdmFyIGJib3ggPSBuZXcgVEhSRUUuQm94MygpLnNldEZyb21PYmplY3QodGhpcy5zY3JpcHQud2ViTGF5ZXIzRCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHZhciB3c2l6ZSA9IGJib3gubWF4LnggLSBiYm94Lm1pbi54XG4gICAgICAgICAgICAgICAgICAgIC8vIHZhciBoc2l6ZSA9IGJib3gubWF4LnkgLSBiYm94Lm1pbi55XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHt3aWR0aDogd3NpemUsIGhlaWdodDogaHNpemV9ID0gdGhpcy5zY3JpcHQuZ2V0U2l6ZSgpXG4gICAgICAgICAgICAgICAgICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHdpZHRoIC8gd3NpemUsIGhlaWdodCAvIGhzaXplKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgICAgICAvLyAgIH0sIDEpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRoZXJlIHdpbGwgYmUgb25lIGVsZW1lbnQgYWxyZWFkeSwgdGhlIGN1YmUgd2UgY3JlYXRlZCBpbiBibGVuZGVyXG4gICAgICAgICAgICAvLyBhbmQgYXR0YWNoZWQgdGhpcyBjb21wb25lbnQgdG8sIHNvIHJlbW92ZSBpdCBpZiBpdCBpcyB0aGVyZS5cbiAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4ucG9wKClcblxuICAgICAgICAgICAgLy8gbWFrZSBzdXJlIFwiaXNTdGF0aWNcIiBpcyBjb3JyZWN0OyAgY2FuJ3QgYmUgc3RhdGljIGlmIGVpdGhlciBpbnRlcmFjdGl2ZSBvciBuZXR3b3JrZWRcbiAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc1N0YXRpYyAmJiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSB8fCB0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5pc1N0YXRpYyA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICB0aGlzLmVsLmFwcGVuZENoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuXG4gICAgICAgICAgICAvLyBpZiAoIXRoaXMuc2NyaXB0LmlzU3RhdGljKSB7XG4gICAgICAgICAgICAvLyAgICAgc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgICAgLy8gICAgICAgICAvLyB1cGRhdGUgb24gYSByZWd1bGFyIGJhc2lzXG4gICAgICAgICAgICAvLyAgICAgICAvLyAgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5yZWZyZXNoKHRydWUpXG4gICAgICAgICAgICAvLyAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudXBkYXRlKHRydWUpXG4gICAgICAgICAgICAvLyAgICAgfSwgNTApXG4gICAgICAgICAgICAvLyB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgLy8gbWFrZSB0aGUgaHRtbCBvYmplY3QgY2xpY2thYmxlXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywnJylcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlfSlcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcblxuICAgICAgICAgICAgICAgIC8vIGZvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBvYmplY3QgXG4gICAgICAgICAgICAgICAgdGhpcy5jbGlja2VkID0gdGhpcy5jbGlja2VkLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0RyYWdnYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhcmVuJ3QgZ29pbmcgdG8gcmVhbGx5IGRlYWwgd2l0aCB0aGlzIHRpbGwgd2UgaGF2ZSBhIHVzZSBjYXNlLCBidXRcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgY2FuIHNldCBpdCB1cCBmb3Igbm93XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsIFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNIb2xkYWJsZTogdHJ1ZSwgIGhvbGRhYmxlQnV0dG9uOiB0cnVlfSlcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLWRvd24nLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnU3RhcnQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tdXAnLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnRW5kKGV2dClcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL3RoaXMucmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5UiA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhbiBleGlzdGluZyBjb3B5IG9mIHRoZSBOZXR3b3JrZWQgRW50aXR5IChpZiB3ZSBhcmUgbm90IHRoZVxuICAgICAgICAgICAgICAgIC8vIGZpcnN0IGNsaWVudCBpbiB0aGUgcm9vbSBpdCB3aWxsIGV4aXN0IGluIG90aGVyIGNsaWVudHMgYW5kIGJlIGNyZWF0ZWQgYnkgTkFGKVxuICAgICAgICAgICAgICAgIC8vIG9yIGNyZWF0ZSBhbiBlbnRpdHkgaWYgd2UgYXJlIGZpcnN0LlxuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSBmdW5jdGlvbiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmV0SWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBiZSBwYXJ0IG9mIGEgTmV0d29ya2VkIEdMVEYgaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvciBwaW5uZWQgYW5kIGxvYWRlZCB3aGVuIHdlIGVudGVyIHRoZSByb29tLiAgVXNlIHRoZSBuZXR3b3JrZWQgcGFyZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHBsdXMgYSBkaXNhbWJpZ3VhdGluZyBiaXQgb2YgdGV4dCB0byBjcmVhdGUgYSB1bmlxdWUgSWQuXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IE5BRi51dGlscy5nZXROZXR3b3JrSWQobmV0d29ya2VkRWwpICsgXCItaHRtbC1zY3JpcHRcIjtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgbmVlZCB0byBjcmVhdGUgYW4gZW50aXR5LCB1c2UgdGhlIHNhbWUgcGVyc2lzdGVuY2UgYXMgb3VyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrIGVudGl0eSAodHJ1ZSBpZiBwaW5uZWQsIGZhbHNlIGlmIG5vdClcbiAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQgPSBlbnRpdHkuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5wZXJzaXN0ZW50O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBvbmx5IGhhcHBlbnMgaWYgdGhpcyBjb21wb25lbnQgaXMgb24gYSBzY2VuZSBmaWxlLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsZW1lbnRzIG9uIHRoZSBzY2VuZSBhcmVuJ3QgbmV0d29ya2VkLiAgU28gbGV0J3MgYXNzdW1lIGVhY2ggZW50aXR5IGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2NlbmUgd2lsbCBoYXZlIGEgdW5pcXVlIG5hbWUuICBBZGRpbmcgYSBiaXQgb2YgdGV4dCBzbyB3ZSBjYW4gZmluZCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIERPTSB3aGVuIGRlYnVnZ2luZy5cbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gdGhpcy5mdWxsTmFtZS5yZXBsYWNlQWxsKFwiX1wiLFwiLVwiKSArIFwiLWh0bWwtc2NyaXB0XCJcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBuZXR3b3JrZWQgZW50aXR5IHdlIGNyZWF0ZSBmb3IgdGhpcyBjb21wb25lbnQgYWxyZWFkeSBleGlzdHMuIFxuICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UsIGNyZWF0ZSBpdFxuICAgICAgICAgICAgICAgICAgICAvLyAtIE5PVEU6IGl0IGlzIGNyZWF0ZWQgb24gdGhlIHNjZW5lLCBub3QgYXMgYSBjaGlsZCBvZiB0aGlzIGVudGl0eSwgYmVjYXVzZVxuICAgICAgICAgICAgICAgICAgICAvLyAgIE5BRiBjcmVhdGVzIHJlbW90ZSBlbnRpdGllcyBpbiB0aGUgc2NlbmUuXG4gICAgICAgICAgICAgICAgICAgIHZhciBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChOQUYuZW50aXRpZXMuaGFzRW50aXR5KG5ldElkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gTkFGLmVudGl0aWVzLmdldEVudGl0eShuZXRJZCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZXRob2QgdG8gcmV0cmlldmUgdGhlIHNjcmlwdCBkYXRhIG9uIHRoaXMgZW50aXR5XG4gICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIFwibmV0d29ya2VkXCIgY29tcG9uZW50IHNob3VsZCBoYXZlIHBlcnNpc3RlbnQ9dHJ1ZSwgdGhlIHRlbXBsYXRlIGFuZCBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBzZXQsIG93bmVyIHNldCB0byBcInNjZW5lXCIgKHNvIHRoYXQgaXQgZG9lc24ndCB1cGRhdGUgdGhlIHJlc3Qgb2ZcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSB3b3JsZCB3aXRoIGl0J3MgaW5pdGlhbCBkYXRhLCBhbmQgc2hvdWxkIE5PVCBzZXQgY3JlYXRvciAodGhlIHN5c3RlbSB3aWxsIGRvIHRoYXQpXG4gICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuc2V0QXR0cmlidXRlKCduZXR3b3JrZWQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGU6IFwiI3NjcmlwdC1kYXRhLW1lZGlhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudDogcGVyc2lzdGVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvd25lcjogXCJzY2VuZVwiLCAgLy8gc28gdGhhdCBvdXIgaW5pdGlhbCB2YWx1ZSBkb2Vzbid0IG92ZXJ3cml0ZSBvdGhlcnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXR3b3JrSWQ6IG5ldElkXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hcHBlbmRDaGlsZChlbnRpdHkpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gc2F2ZSBhIHBvaW50ZXIgdG8gdGhlIG5ldHdvcmtlZCBlbnRpdHkgYW5kIHRoZW4gd2FpdCBmb3IgaXQgdG8gYmUgZnVsbHlcbiAgICAgICAgICAgICAgICAgICAgLy8gaW5pdGlhbGl6ZWQgYmVmb3JlIGdldHRpbmcgYSBwb2ludGVyIHRvIHRoZSBhY3R1YWwgbmV0d29ya2VkIGNvbXBvbmVudCBpbiBpdFxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLm5ldEVudGl0eSkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlU3luYyA9IG5ldHdvcmtlZEVsLmNvbXBvbmVudHNbXCJzY3JpcHQtZGF0YVwiXVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIGlzIHRoZSBmaXJzdCBuZXR3b3JrZWQgZW50aXR5LCBpdCdzIHNoYXJlZERhdGEgd2lsbCBkZWZhdWx0IHRvIHRoZSBlbXB0eSBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0cmluZywgYW5kIHdlIHNob3VsZCBpbml0aWFsaXplIGl0IHdpdGggdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5zaGFyZWREYXRhID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5ldHdvcmtlZCA9IG5ldHdvcmtlZEVsLmNvbXBvbmVudHNbXCJuZXR3b3JrZWRcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiAobmV0d29ya2VkLmRhdGEuY3JlYXRvciA9PSBOQUYuY2xpZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgdGhpcy5zdGF0ZVN5bmMuaW5pdFNoYXJlZERhdGEodGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLmVsKS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkobmV0d29ya2VkRWwpXG4gICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkoKVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkID0gdGhpcy5zZXR1cE5ldHdvcmtlZC5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAvLyBUaGlzIG1ldGhvZCBoYW5kbGVzIHRoZSBkaWZmZXJlbnQgc3RhcnR1cCBjYXNlczpcbiAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZSwgTkFGIHdpbGwgYmUgY29ubmVjdGVkIGFuZCB3ZSBjYW4gXG4gICAgICAgICAgICAgICAgLy8gICBpbW1lZGlhdGVseSBpbml0aWFsaXplXG4gICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiBpcyBpbiB0aGUgcm9vbSBzY2VuZSBvciBwaW5uZWQsIGl0IHdpbGwgbGlrZWx5IGJlIGNyZWF0ZWRcbiAgICAgICAgICAgICAgICAvLyAgIGJlZm9yZSBOQUYgaXMgc3RhcnRlZCBhbmQgY29ubmVjdGVkLCBzbyB3ZSB3YWl0IGZvciBhbiBldmVudCB0aGF0IGlzXG4gICAgICAgICAgICAgICAgLy8gICBmaXJlZCB3aGVuIEh1YnMgaGFzIHN0YXJ0ZWQgTkFGXG4gICAgICAgICAgICAgICAgaWYgKE5BRi5jb25uZWN0aW9uICYmIE5BRi5jb25uZWN0aW9uLmlzQ29ubmVjdGVkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdkaWRDb25uZWN0VG9OZXR3b3JrZWRTY2VuZScsIHRoaXMuc2V0dXBOZXR3b3JrZWQpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0sXG5cbiAgICBwbGF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQucGxheSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wYXVzZSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaGFuZGxlIFwiaW50ZXJhY3RcIiBldmVudHMgZm9yIGNsaWNrYWJsZSBlbnRpdGllc1xuICAgIGNsaWNrZWQ6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICB0aGlzLnNjcmlwdC5jbGlja2VkKGV2dClcblxuICAgICAgICAvLyBjb25zdCBvYmogPSBldnQub2JqZWN0M0RcbiAgICAgICAgLy8gdGhpcy5yYXljYXN0ZXIucmF5LnNldChvYmoucG9zaXRpb24sIHRoaXMuc2NyaXB0LndlYkxheWVyM0QuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkubmVnYXRlKCkpXG4gICAgICAgIC8vIGNvbnN0IGhpdCA9IHRoaXMuc2NyaXB0LndlYkxheWVyM0QuaGl0VGVzdCh0aGlzLnJheWNhc3Rlci5yYXkpXG4gICAgICAgIC8vIGlmIChoaXQpIHtcbiAgICAgICAgLy8gICBoaXQudGFyZ2V0LmNsaWNrKClcbiAgICAgICAgLy8gICBoaXQudGFyZ2V0LmZvY3VzKClcbiAgICAgICAgLy8gICBjb25zb2xlLmxvZygnaGl0JywgaGl0LnRhcmdldCwgaGl0LmxheWVyKVxuICAgICAgICAvLyB9ICAgXG4gICAgfSxcbiAgXG4gICAgLy8gbWV0aG9kcyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIHRoZSBodG1sIG9iamVjdCBzbyB0aGV5IGNhbiB1cGRhdGUgbmV0d29ya2VkIGRhdGFcbiAgICB0YWtlT3duZXJzaGlwOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMudGFrZU93bmVyc2hpcCgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIHN1cmUsIGdvIGFoZWFkIGFuZCBjaGFuZ2UgaXQgZm9yIG5vd1xuICAgICAgICB9XG4gICAgfSxcbiAgICBcbiAgICBzZXRTaGFyZWREYXRhOiBmdW5jdGlvbihkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnNldFNoYXJlZERhdGEoZGF0YU9iamVjdClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyB0aGlzIGlzIGNhbGxlZCBmcm9tIGJlbG93LCB0byBnZXQgdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICBnZXRTaGFyZWREYXRhOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICAgICAgLy8gc2hvdWxkbid0IGhhcHBlblxuICAgICAgICBjb25zb2xlLndhcm4oXCJzY3JpcHQtZGF0YSBjb21wb25lbnQgY2FsbGVkIHBhcmVudCBlbGVtZW50IGJ1dCB0aGVyZSBpcyBubyBzY3JpcHQgeWV0P1wiKVxuICAgICAgICByZXR1cm4gXCJ7fVwiXG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAvLyBtb3JlIG9yIGxlc3MgY29waWVkIGZyb20gXCJob3ZlcmFibGUtdmlzdWFscy5qc1wiIGluIGh1YnNcbiAgICAgICAgICAgIGNvbnN0IHRvZ2dsaW5nID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXNbXCJodWJzLXN5c3RlbXNcIl0uY3Vyc29yVG9nZ2xpbmdTeXN0ZW07XG4gICAgICAgICAgICB2YXIgcGFzc3RocnVJbnRlcmFjdG9yID0gW11cblxuICAgICAgICAgICAgbGV0IGludGVyYWN0b3JPbmUsIGludGVyYWN0b3JUd287XG4gICAgICAgICAgICBjb25zdCBpbnRlcmFjdGlvbiA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLmludGVyYWN0aW9uO1xuICAgICAgICAgICAgaWYgKCFpbnRlcmFjdGlvbi5yZWFkeSkgcmV0dXJuOyAvL0RPTUNvbnRlbnRSZWFkeSB3b3JrYXJvdW5kXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGxldCBob3ZlckVsID0gdGhpcy5zaW1wbGVDb250YWluZXJcbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRIYW5kLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgIXRvZ2dsaW5nLmxlZnRUb2dnbGVkT2ZmXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rvck9uZSkge1xuICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yT25lLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgbGV0IGRpciA9IHRoaXMuc2NyaXB0LndlYkxheWVyM0QuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkubmVnYXRlKClcbiAgICAgICAgICAgICAgICBwb3MuYWRkU2NhbGVkVmVjdG9yKGRpciwgLTAuMSlcbiAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TC5zZXQocG9zLCBkaXIpXG5cbiAgICAgICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaCh0aGlzLmhvdmVyUmF5TClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgICAhdG9nZ2xpbmcucmlnaHRUb2dnbGVkT2ZmXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3RvclR3bykge1xuICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yVHdvLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgbGV0IGRpciA9IHRoaXMuc2NyaXB0LndlYkxheWVyM0QuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkubmVnYXRlKClcbiAgICAgICAgICAgICAgICBwb3MuYWRkU2NhbGVkVmVjdG9yKGRpciwgLTAuMSlcbiAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5Ui5zZXQocG9zLCBkaXIpXG4gICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheVIpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QuaW50ZXJhY3Rpb25SYXlzID0gcGFzc3RocnVJbnRlcmFjdG9yXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmVuJ3QgZmluaXNoZWQgc2V0dGluZyB1cCB0aGUgbmV0d29ya2VkIGVudGl0eSBkb24ndCBkbyBhbnl0aGluZy5cbiAgICAgICAgICAgIGlmICghdGhpcy5uZXRFbnRpdHkgfHwgIXRoaXMuc3RhdGVTeW5jKSB7IHJldHVybiB9XG5cbiAgICAgICAgICAgIC8vIGlmIHRoZSBzdGF0ZSBoYXMgY2hhbmdlZCBpbiB0aGUgbmV0d29ya2VkIGRhdGEsIHVwZGF0ZSBvdXIgaHRtbCBvYmplY3RcbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCA9IGZhbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQudXBkYXRlU2hhcmVkRGF0YSh0aGlzLnN0YXRlU3luYy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLnNjcmlwdC5pc1N0YXRpYykge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC51cGRhdGUodHJ1ZSlcbiAgICAgICAgfVxuICAgIH0sXG4gIFxuICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmZ1bGxOYW1lID09PSBcIlwiKSB7XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggXG4gICAgICAgIC8vICBcImNvbXBvbmVudE5hbWVcIlxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuICBUaGlzIHdpbGwgZmV0Y2ggdGhlIGNvbXBvbmVudCBmcm9tIHRoZSByZXNvdXJjZVxuICAgICAgICAvLyBjb21wb25lbnROYW1lXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMuZnVsbE5hbWUubWF0Y2goL18oW0EtWmEtejAtOV0qKSQvKVxuXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiAzLCBmaXJzdCBtYXRjaCBpcyB0aGUgZGlyLFxuICAgICAgICAvLyBzZWNvbmQgaXMgdGhlIGNvbXBvbmVudE5hbWUgbmFtZSBvciBudW1iZXJcbiAgICAgICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcImh0bWwtc2NyaXB0IGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLmZ1bGxOYW1lKVxuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gbnVsbFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gcGFyYW1zWzFdXG4gICAgICAgIH1cbiAgfSxcblxuICBsb2FkU2NyaXB0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBpbml0U2NyaXB0ID0gaHRtbENvbXBvbmVudHNbdGhpcy5jb21wb25lbnROYW1lXVxuICAgICAgICBpZiAoIWluaXRTY3JpcHQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIidodG1sLXNjcmlwdCcgY29tcG9uZW50IGRvZXNuJ3QgaGF2ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbFxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2NyaXB0ID0gaW5pdFNjcmlwdCgpXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCl7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudXBkYXRlKHRydWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBmYWlsZWQgdG8gaW5pdGlhbGl6ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBkZXN0cm95U2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVsLnJlbW92ZUNoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IG51bGxcblxuICAgICAgICB0aGlzLnNjcmlwdC5kZXN0cm95KClcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgfVxufSlcblxuLy9cbi8vIENvbXBvbmVudCBmb3Igb3VyIG5ldHdvcmtlZCBzdGF0ZS4gIFRoaXMgY29tcG9uZW50IGRvZXMgbm90aGluZyBleGNlcHQgYWxsIHVzIHRvIFxuLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4vLyBzb21ldGhpbmcgaGFzIGNoYW5nZWQsIGluc3RlYWQgb2YgaGF2aW5nIHRoZSBjb21wb25lbnQgYWJvdmUgcG9sbCBlYWNoIGZyYW1lLlxuLy9cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzY3JpcHQtZGF0YScsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2NyaXB0ZGF0YToge3R5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwie31cIn0sXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB0aGlzLmVsLmdldFNoYXJlZERhdGEoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgdGhpcy5zaGFyZWREYXRhKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgZW5jb2RlIGluaXRpYWwgc2NyaXB0IGRhdGEgb2JqZWN0OiBcIiwgZSwgdGhpcy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9IGZhbHNlO1xuICAgIH0sXG5cbiAgICB1cGRhdGUoKSB7XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9ICEodGhpcy5zaGFyZWREYXRhID09PSB0aGlzLmRhdGEuc2NyaXB0ZGF0YSk7XG4gICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodGhpcy5kYXRhLnNjcmlwdGRhdGEpKVxuXG4gICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB0aGlzLmRhdGEuc2NyaXB0ZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY291bGRuJ3QgcGFyc2UgSlNPTiByZWNlaXZlZCBpbiBzY3JpcHQtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJcIlxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaXQgaXMgbGlrZWx5IHRoYXQgYXBwbHlQZXJzaXN0ZW50U3luYyBvbmx5IG5lZWRzIHRvIGJlIGNhbGxlZCBmb3IgcGVyc2lzdGVudFxuICAgIC8vIG5ldHdvcmtlZCBlbnRpdGllcywgc28gd2UgX3Byb2JhYmx5XyBkb24ndCBuZWVkIHRvIGRvIHRoaXMuICBCdXQgaWYgdGhlcmUgaXMgbm9cbiAgICAvLyBwZXJzaXN0ZW50IGRhdGEgc2F2ZWQgZnJvbSB0aGUgbmV0d29yayBmb3IgdGhpcyBlbnRpdHksIHRoaXMgY29tbWFuZCBkb2VzIG5vdGhpbmcuXG4gICAgcGxheSgpIHtcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgcmVhbGx5IG5lZWRlZCwgYnV0IGNhbid0IGh1cnRcbiAgICAgICAgICAgIGlmIChBUFAudXRpbHMpIHsgLy8gdGVtcG9yYXJ5IHRpbGwgd2Ugc2hpcCBuZXcgY2xpZW50XG4gICAgICAgICAgICAgICAgQVBQLnV0aWxzLmFwcGx5UGVyc2lzdGVudFN5bmModGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLm5ldHdvcmtJZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgdGFrZU93bmVyc2hpcCgpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG5cbiAgICAvLyBpbml0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgLy8gICAgIHRyeSB7XG4gICAgLy8gICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAvLyAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAvLyAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAvLyAgICAgICAgIHJldHVybiB0cnVlXG4gICAgLy8gICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAvLyAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAvLyAgICAgICAgIHJldHVybiBmYWxzZVxuICAgIC8vICAgICB9XG4gICAgLy8gfSxcblxuICAgIC8vIFRoZSBrZXkgcGFydCBpbiB0aGVzZSBtZXRob2RzICh3aGljaCBhcmUgY2FsbGVkIGZyb20gdGhlIGNvbXBvbmVudCBhYm92ZSkgaXMgdG9cbiAgICAvLyBjaGVjayBpZiB3ZSBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgdGhlIG5ldHdvcmtlZCBvYmplY3QuICBJZiB3ZSBvd24gaXQgKGlzTWluZSgpIGlzIHRydWUpXG4gICAgLy8gd2UgY2FuIGNoYW5nZSBpdC4gIElmIHdlIGRvbid0IG93biBpbiwgd2UgY2FuIHRyeSB0byBiZWNvbWUgdGhlIG93bmVyIHdpdGhcbiAgICAvLyB0YWtlT3duZXJzaGlwKCkuIElmIHRoaXMgc3VjY2VlZHMsIHdlIGNhbiBzZXQgdGhlIGRhdGEuICBcbiAgICAvL1xuICAgIC8vIE5PVEU6IHRha2VPd25lcnNoaXAgQVRURU1QVFMgdG8gYmVjb21lIHRoZSBvd25lciwgYnkgYXNzdW1pbmcgaXQgY2FuIGJlY29tZSB0aGVcbiAgICAvLyBvd25lciBhbmQgbm90aWZ5aW5nIHRoZSBuZXR3b3JrZWQgY29waWVzLiAgSWYgdHdvIG9yIG1vcmUgZW50aXRpZXMgdHJ5IHRvIGJlY29tZVxuICAgIC8vIG93bmVyLCAgb25seSBvbmUgKHRoZSBsYXN0IG9uZSB0byB0cnkpIGJlY29tZXMgdGhlIG93bmVyLiAgQW55IHN0YXRlIHVwZGF0ZXMgZG9uZVxuICAgIC8vIGJ5IHRoZSBcImZhaWxlZCBhdHRlbXB0ZWQgb3duZXJzXCIgd2lsbCBub3QgYmUgZGlzdHJpYnV0ZWQgdG8gdGhlIG90aGVyIGNsaWVudHMsXG4gICAgLy8gYW5kIHdpbGwgYmUgb3ZlcndyaXR0ZW4gKGV2ZW50dWFsbHkpIGJ5IHVwZGF0ZXMgZnJvbSB0aGUgb3RoZXIgY2xpZW50cy4gICBCeSBub3RcbiAgICAvLyBhdHRlbXB0aW5nIHRvIGd1YXJhbnRlZSBvd25lcnNoaXAsIHRoaXMgY2FsbCBpcyBmYXN0IGFuZCBzeW5jaHJvbm91cy4gIEFueSBcbiAgICAvLyBtZXRob2RzIGZvciBndWFyYW50ZWVpbmcgb3duZXJzaGlwIGNoYW5nZSB3b3VsZCB0YWtlIGEgbm9uLXRyaXZpYWwgYW1vdW50IG9mIHRpbWVcbiAgICAvLyBiZWNhdXNlIG9mIG5ldHdvcmsgbGF0ZW5jaWVzLlxuXG4gICAgc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdmFyIGh0bWxTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBodG1sU3RyaW5nXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCBodG1sU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSk7XG5cbi8vIEFkZCBvdXIgdGVtcGxhdGUgZm9yIG91ciBuZXR3b3JrZWQgb2JqZWN0IHRvIHRoZSBhLWZyYW1lIGFzc2V0cyBvYmplY3QsXG4vLyBhbmQgYSBzY2hlbWEgdG8gdGhlIE5BRi5zY2hlbWFzLiAgQm90aCBtdXN0IGJlIHRoZXJlIHRvIGhhdmUgY3VzdG9tIGNvbXBvbmVudHMgd29ya1xuXG5jb25zdCBhc3NldHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiYS1hc3NldHNcIik7XG5cbmFzc2V0cy5pbnNlcnRBZGphY2VudEhUTUwoXG4gICAgJ2JlZm9yZWVuZCcsXG4gICAgYFxuICAgIDx0ZW1wbGF0ZSBpZD1cInNjcmlwdC1kYXRhLW1lZGlhXCI+XG4gICAgICA8YS1lbnRpdHlcbiAgICAgICAgc2NyaXB0LWRhdGFcbiAgICAgID48L2EtZW50aXR5PlxuICAgIDwvdGVtcGxhdGU+XG4gIGBcbiAgKVxuXG5jb25zdCB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSA9IGVwc2lsb24gPT4ge1xuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRsZXQgcHJldiA9IG51bGw7XG5cdFx0XHRyZXR1cm4gY3VyciA9PiB7XG5cdFx0XHRcdGlmIChwcmV2ID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cHJldiA9IG5ldyBUSFJFRS5WZWN0b3IzKGN1cnIueCwgY3Vyci55LCBjdXJyLnopO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFOQUYudXRpbHMuYWxtb3N0RXF1YWxWZWMzKHByZXYsIGN1cnIsIGVwc2lsb24pKSB7XG5cdFx0XHRcdFx0cHJldi5jb3B5KGN1cnIpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH07XG5cdFx0fTtcblx0fTtcblxuTkFGLnNjaGVtYXMuYWRkKHtcbiAgXHR0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICBjb21wb25lbnRzOiBbXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwicm90YXRpb25cIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIC8vIHtcbiAgICAvLyAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgLy8gICAgIHByb3BlcnR5OiBcInNjYWxlXCIsXG4gICAgLy8gICAgIHJlcXVpcmVzTmV0d29ya1VwZGF0ZTogdmVjdG9yUmVxdWlyZXNVcGRhdGUoMC4wMDEpXG4gICAgLy8gfSxcbiAgICB7XG4gICAgICBcdGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgXHRwcm9wZXJ0eTogXCJzY3JpcHRkYXRhXCJcbiAgICB9XSxcbiAgICAgIG5vbkF1dGhvcml6ZWRDb21wb25lbnRzOiBbXG4gICAgICB7XG4gICAgICAgICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgICAgfVxuICAgIF0sXG5cbiAgfSk7XG5cbiIsImltcG9ydCAnLi4vc3lzdGVtcy9mYWRlci1wbHVzLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BvcnRhbC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BhcmFsbGF4LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcydcblxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCAnaW1tZXJzaXZlLTM2MCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywgJ3BvcnRhbCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncGFyYWxsYXgnLCAncGFyYWxsYXgnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2h0bWwtc2NyaXB0JywgJ2h0bWwtc2NyaXB0JylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCAncmVnaW9uLWhpZGVyJylcblxuLy8gZG8gYSBzaW1wbGUgbW9ua2V5IHBhdGNoIHRvIHNlZSBpZiBpdCB3b3Jrc1xuXG4vLyB2YXIgbXlpc01pbmVPckxvY2FsID0gZnVuY3Rpb24gKHRoYXQpIHtcbi8vICAgICByZXR1cm4gIXRoYXQuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQgfHwgKHRoYXQubmV0d29ya2VkRWwgJiYgTkFGLnV0aWxzLmlzTWluZSh0aGF0Lm5ldHdvcmtlZEVsKSk7XG4vLyAgfVxuXG4vLyAgdmFyIHZpZGVvQ29tcCA9IEFGUkFNRS5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl1cbi8vICB2aWRlb0NvbXAuQ29tcG9uZW50LnByb3RvdHlwZS5pc01pbmVPckxvY2FsID0gbXlpc01pbmVPckxvY2FsO1xuXG4vLyBhZGQgdGhlIHJlZ2lvbi1oaWRlciB0byB0aGUgc2NlbmVcbi8vIGNvbnN0IHNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImEtc2NlbmVcIik7XG4vLyBzY2VuZS5zZXRBdHRyaWJ1dGUoXCJyZWdpb24taGlkZXJcIiwge3NpemU6IDEwMH0pcnIiXSwibmFtZXMiOlsid29ybGRDYW1lcmEiLCJ3b3JsZFNlbGYiLCJnbHNsIiwidmVydGV4U2hhZGVyIiwic25vaXNlIiwiZnJhZ21lbnRTaGFkZXIiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFO0FBQ3BDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDbEQsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDOUMsR0FBRztBQUNIO0FBQ0EsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLElBQUk7QUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUU7QUFDN0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztBQUNsQyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUs7QUFDOUIsUUFBUSxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVE7QUFDNUIsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUNsQixRQUFRLFdBQVcsRUFBRSxJQUFJO0FBQ3pCLFFBQVEsR0FBRyxFQUFFLEtBQUs7QUFDbEIsT0FBTyxDQUFDO0FBQ1IsTUFBSztBQUNMLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtB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LENBQUMsZ0JBQWdCLEVBQUM7QUFDakUsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxTQUFTLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUM7QUFDakUsR0FBRztBQUNILENBQUM7O0FDbkJELE1BQU1DLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBLE1BQU1BLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLE1BQUksR0FBRyxDQUFDO0FBQ2Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0dBO0FBQ0E7QUFDQTtBQUNPLFNBQVMseUJBQXlCLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRTtBQUMzRCxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLENBQUM7QUFDdEUsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2xGLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDdkQsQ0FBQztBQUNEO0FBQ08sU0FBUywyQkFBMkIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFO0FBQzdELElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU87QUFDckYsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN4Rzs7QUNaQTtBQUNBO0FBQ08sU0FBUyx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsYUFBYSxFQUFFO0FBQ2pFLElBQUksT0FBTyxNQUFNLElBQUksRUFBRSxNQUFNLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRTtBQUMvRSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDO0FBQ2pDLEtBQUs7QUFDTCxJQUFJLE9BQU8sTUFBTSxDQUFDO0FBQ2xCOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUlBO0FBQ0E7QUFDQSxJQUFJLFNBQVMsR0FBRyxRQUFPO0FBQ3ZCLElBQUksU0FBUyxHQUFHLFNBQVMsSUFBSSxFQUFFLEtBQUssRUFBRTtBQUN0QyxJQUFJLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFRO0FBQzVCLElBQUksSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFDO0FBQ25ELElBQUksSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFDO0FBQ25ELElBQUksT0FBTyxTQUFTLEdBQUcsRUFBRSxHQUFHLEVBQUU7QUFDOUIsRUFBQztBQUNEO0FBQ0EsSUFBSSxZQUFZLEdBQUcsR0FBRTtBQUNyQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUU7QUFDbkMsSUFBSSxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUM7QUFDM0I7QUFDQSxJQUFJLE1BQU0sU0FBUyxJQUFJLFNBQVMsQ0FBQyxVQUFVLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDLEVBQUU7QUFDaEcsUUFBUSxTQUFTLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQztBQUN6QyxLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFO0FBQ2hHLFFBQVEsT0FBTztBQUNmLEtBQUs7QUFDTDtBQUNBLElBQUksT0FBTyxTQUFTLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDO0FBQ3pELENBQUM7QUFDRDtBQUNBLFNBQVMsV0FBVyxDQUFDLE1BQU0sRUFBRTtBQUM3QixJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBQztBQUM1RSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxHQUFHLElBQUksR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUM7QUFDNUUsSUFBSSxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDbkMsUUFBUSx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFDO0FBQzdDLEtBQUssTUFBTTtBQUNYLFFBQVEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrREFBa0QsRUFBQztBQUN2RSxLQUFLO0FBQ0wsQ0FBQztBQUNEO0FBQ0EsU0FBUyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUU7QUFDcEMsSUFBSSxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRSxFQUFFO0FBQ3ZELElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsR0FBRyxNQUFNLEdBQUcsSUFBSSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBQztBQUM5RTtBQUNBLElBQUksSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO0FBQ25DLFFBQVEsdUJBQXVCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBQztBQUM5QyxLQUFLLE1BQU07QUFDWCxRQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0RBQWdELEVBQUM7QUFDckUsS0FBSztBQUNMLENBQUM7QUFDRDtBQUNPLFNBQVMsbUJBQW1CLENBQUMsT0FBTyxFQUFFO0FBQzdDLElBQUksSUFBSSxRQUFRLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxFQUFDO0FBQzdDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRTtBQUM3QjtBQUNBLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBQztBQUNoRTtBQUNBLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUM7QUFDaEMsQ0FBQztBQUNEO0FBQ08sU0FBUyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUU7QUFDOUMsSUFBSSxJQUFJLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUM7QUFDN0MsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsTUFBTSxFQUFFO0FBQzdCO0FBQ0EsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFDO0FBQy9EO0FBQ0EsSUFBSSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFDO0FBQ3ZDLENBQUM7QUFDRDtBQUNBLFNBQVMsZUFBZSxHQUFHO0FBQzNCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQjtBQUNwRCxNQUFNLE9BQU8sSUFBSSxDQUFDO0FBQ2xCO0FBQ0EsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLDRCQUE0QixFQUFDO0FBQzlDLElBQUksTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNqRjtBQUNBLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDN0MsTUFBTSxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDN0I7QUFDQSxNQUFNLElBQUksT0FBTyxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxFQUFFLE1BQUs7QUFDMUQ7QUFDQSxNQUFNLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxJQUFJLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRTtBQUMxRDtBQUNBLE1BQU0sT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sR0FBRyxVQUFVLEdBQUcsU0FBUyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFDO0FBQ3pFLE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUM7QUFDM0IsS0FBSztBQUNMO0FBQ0EsSUFBSSxPQUFPLElBQUksQ0FBQztBQUNoQixDQUFDO0FBQ0Q7QUFDQSxTQUFTLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUU7QUFDbEQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCO0FBQ3BELE1BQU0sT0FBTyxJQUFJLENBQUM7QUFDbEI7QUFDQSxJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEdBQUcsU0FBUyxHQUFHLFFBQVEsSUFBSSx5QkFBeUIsR0FBRyxNQUFNLEVBQUM7QUFDdkYsSUFBSSxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2pGO0FBQ0EsSUFBSSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUM3QyxNQUFNLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3QjtBQUNBLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLE1BQU0sRUFBRTtBQUNoQyxRQUFRLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEdBQUcsVUFBVSxHQUFHLFNBQVMsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBQztBQUMzRSxRQUFRLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFDO0FBQzdCLE9BQU87QUFDUCxLQUFLO0FBQ0w7QUFDQSxJQUFJLE9BQU8sSUFBSSxDQUFDO0FBQ2hCLENBQUM7QUFDRDtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyx3QkFBd0IsRUFBRTtBQUNuRCxJQUFJLE1BQU0sRUFBRTtBQUNaLFFBQVEsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUM3QixLQUFLO0FBQ0wsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QixRQUFRLElBQUksQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFDO0FBQ2pFLFFBQVEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFDO0FBQ25ELFFBQVEsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUM7QUFDaEM7QUFDQSxRQUFRLHlCQUF5QixDQUFDLElBQUksRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0FBQ2xFLEtBQUs7QUFDTCxJQUFJLE1BQU0sRUFBRSxXQUFXO0FBQ3ZCLFFBQVEsMkJBQTJCLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDLENBQUM7QUFDcEUsUUFBUSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDO0FBQ3ZDLEtBQUs7QUFDTDtBQUNBLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLFNBQVMsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUM7QUFDbkUsUUFBUSxJQUFJLFNBQVMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO0FBQ3RDLFlBQVksa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBQztBQUMzQyxZQUFZLFdBQVcsQ0FBQyxTQUFTLEVBQUM7QUFDbEMsWUFBWSxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVM7QUFDbkMsU0FBUztBQUNULEtBQUs7QUFDTCxDQUFDLEVBQUM7QUFDRjtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyx3QkFBd0IsRUFBRTtBQUNuRCxJQUFJLE1BQU0sRUFBRTtBQUNaLFFBQVEsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtBQUM3QixRQUFRLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDbEMsS0FBSztBQUNMLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBQztBQUNqRTtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDaEQsUUFBUSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFO0FBQy9DLFlBQVksSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBVztBQUMvRSxTQUFTO0FBQ1QsUUFBUSx5QkFBeUIsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztBQUNsRSxLQUFLO0FBQ0w7QUFDQSxJQUFJLE1BQU0sRUFBRSxXQUFXO0FBQ3ZCLFFBQVEsMkJBQTJCLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDLENBQUM7QUFDcEUsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QjtBQUNBLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFO0FBQzFDO0FBQ0EsUUFBUSxJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBQztBQUNqRTtBQUNBLFFBQVEsSUFBSSxPQUFPLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLEVBQUUsTUFBSztBQUM3RDtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLElBQUksT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFO0FBQzNEO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFDO0FBQzlCLEtBQUs7QUFDTDtBQUNBLElBQUksUUFBUSxFQUFFLFVBQVUsT0FBTyxFQUFFO0FBQ2pDO0FBQ0EsUUFBUSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsUUFBTztBQUMxQztBQUNBO0FBQ0EsUUFBUSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFO0FBQy9DLFlBQVksSUFBSSxPQUFPLEVBQUU7QUFDekIsZ0JBQWdCLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQzFGLG9CQUFvQixJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUN0RSxpQkFBaUI7QUFDakIsYUFBYSxNQUFNO0FBQ25CLGdCQUFnQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFXO0FBQ25GLGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtBQUNyQyxvQkFBb0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7QUFDdEUsaUJBQWlCO0FBQ2pCLGFBQWE7QUFDYixTQUFTO0FBQ1QsS0FBSztBQUNMLENBQUMsRUFBQztBQUNGO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsRUFBRTtBQUN6QyxJQUFJLE1BQU0sRUFBRTtBQUNaO0FBQ0EsUUFBUSxJQUFJLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO0FBQzdCLEtBQUs7QUFDTCxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLGlCQUFpQixDQUFDLEVBQUU7QUFDcEUsWUFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLDhEQUE4RCxFQUFDO0FBQ3hGLFlBQVksSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7QUFDMUIsWUFBWSxPQUFPO0FBQ25CLFNBQVM7QUFDVDtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBUztBQUMzRCxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxFQUFFO0FBQ2hDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQ2hDLFNBQVM7QUFDVCxRQUFRLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3ZEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxhQUFhLEVBQUM7QUFDeEUsUUFBUSxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFJO0FBQ3pFO0FBQ0E7QUFDQSxRQUFRLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQzFFLFFBQVEsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sS0FBSztBQUNwQyxZQUFZLE1BQU0sQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzlFLFNBQVMsQ0FBQyxDQUFDO0FBQ1g7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQ3RGLFFBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksS0FBSztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzVFLFNBQVMsQ0FBQyxDQUFDO0FBQ1g7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO0FBQzVGLFFBQVEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksS0FBSztBQUNoQyxZQUFZLElBQUksQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFDO0FBQzVFLFNBQVMsQ0FBQyxDQUFDO0FBQ1g7QUFDQSxRQUFRLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUNsRSxRQUFRLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUs7QUFDaEMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBQztBQUM1RSxTQUFTLENBQUMsQ0FBQztBQUNYO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3RELFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ3ZGO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxXQUFXLEVBQUUsWUFBWTtBQUM3QixRQUFRLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO0FBQ2xFLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDN0MsWUFBWSxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFDO0FBQy9CLFlBQVksSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDO0FBQzdEO0FBQ0EsWUFBWSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsVUFBUztBQUNuQyxZQUFZLElBQUksRUFBRSxLQUFLLGNBQWMsSUFBSSxFQUFFLEtBQUssc0JBQXNCLEVBQUUsQ0FBQyxRQUFRLENBQUM7QUFDbEY7QUFDQSxZQUFZLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFVO0FBQ25DLFlBQVksSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQztBQUNqSTtBQUNBLFlBQVksSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVE7QUFDbEMsWUFBWSxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7QUFDaEMsWUFBWSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUM5QyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFO0FBQ2pELG9CQUFvQixPQUFPLEdBQUcsSUFBSSxDQUFDO0FBQ25DLG9CQUFvQixNQUFNO0FBQzFCLGlCQUFpQjtBQUNqQixhQUFhO0FBQ2IsWUFBWSxJQUFJLE9BQU8sRUFBRSxDQUFDLFFBQVEsQ0FBQztBQUNuQztBQUNBLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBQztBQUM1RixTQUFTO0FBQ1Q7QUFDQTtBQUNBLFFBQVEsZUFBZSxHQUFFO0FBQ3pCLEtBQUs7QUFDTDtBQUNBLElBQUksTUFBTSxFQUFFLFlBQVk7QUFDeEIsUUFBUSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUUsQ0FBQztBQUN0RCxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNO0FBQ2hEO0FBQ0EsUUFBUSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN2RCxLQUFLO0FBQ0w7QUFDQSxJQUFJLE1BQU0sRUFBRSxZQUFZO0FBQ3hCLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQzFGLEtBQUs7QUFDTDtBQUNBO0FBQ0EsSUFBSSxJQUFJLEVBQUUsVUFBVSxJQUFJLEVBQUU7QUFDMUI7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUM7QUFDcEM7QUFDQTtBQUNBLFFBQVEsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsNkNBQTZDLEVBQUM7QUFDbkcsUUFBUSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxLQUFLO0FBQ2xDLFlBQVksTUFBTSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUM7QUFDOUUsU0FBUyxDQUFDLENBQUM7QUFDWDtBQUNBO0FBQ0EsUUFBUSxLQUFLLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMscUdBQXFHLENBQUMsQ0FBQztBQUN4SixRQUFRLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUs7QUFDaEMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBQztBQUM1RSxTQUFTLENBQUMsQ0FBQztBQUNYLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLGFBQWEsRUFBRSxVQUFVLElBQUksRUFBRTtBQUNuQztBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFDO0FBQ3hEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUMxQyxZQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMsc0RBQXNELEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQztBQUMvRixZQUFZLE9BQU8sSUFBSTtBQUN2QixTQUFTLE1BQU07QUFDZixZQUFZLElBQUksUUFBUSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUM7QUFDOUMsWUFBWSxJQUFJLENBQUMsUUFBUSxFQUFFO0FBQzNCLGdCQUFnQixPQUFPLElBQUk7QUFDM0IsYUFBYSxNQUFNO0FBQ25CLGdCQUFnQixPQUFPLFFBQVE7QUFDL0IsYUFBYTtBQUNiLFNBQVM7QUFDVCxLQUFLO0FBQ0wsQ0FBQzs7QUN2WUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBT0E7QUFDQSxNQUFNLFFBQVEsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDcEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQzFDLE1BQU0sUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUNwQyxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUU7QUFDeEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQ2hDO0FBQ0EsTUFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUU7QUFDaEMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxZQUFZLENBQUM7QUFDOUIsRUFBRSxJQUFJLEVBQUUsWUFBWTtBQUNwQixJQUFJLElBQUksQ0FBQyxXQUFXLEdBQUcsTUFBSztBQUM1QixJQUFJLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxvQkFBbUI7QUFDbEYsSUFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBQztBQUM5QyxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSTtBQUN4QixJQUFJLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3BEO0FBQ0E7QUFDQSxJQUFJLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFO0FBQ2hILFFBQVEsSUFBSSxDQUFDLGFBQWEsR0FBRTtBQUM1QixLQUFLO0FBQ0wsR0FBRztBQUNILEVBQUUsYUFBYSxFQUFFLGtCQUFrQjtBQUNuQyxJQUFJLElBQUksTUFBTSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSztBQUNqRSxrQkFBa0IsT0FBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBQztBQUN2RDtBQUNBLElBQUksTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQ3ZCLElBQUksT0FBTyxDQUFDLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO0FBQ3BDLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3RCxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0FBQzVELElBQUksTUFBTSxLQUFLLENBQUMsdUNBQXVDLEVBQUUsT0FBTyxDQUFDO0FBQ2pFLFNBQVMsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDMUMsU0FBUyxJQUFJLENBQUMsSUFBSSxJQUFJO0FBQ3RCLFVBQVUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDeEMsVUFBVSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztBQUMvQixLQUFLLEVBQUM7QUFDTixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEdBQUU7QUFDL0IsR0FBRztBQUNILEVBQUUsVUFBVSxFQUFFLGdCQUFnQixNQUFNLEVBQUU7QUFDdEMsTUFBTSxJQUFJLENBQUMsWUFBWSxHQUFFO0FBQ3pCLE1BQU0sT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxHQUFHLGtDQUFrQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQztBQUMzSCxHQUFHO0FBQ0gsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLE1BQU0sRUFBRTtBQUN0QyxNQUFNLElBQUksQ0FBQyxZQUFZLEdBQUU7QUFDekIsTUFBTSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQzVGLEdBQUc7QUFDSCxFQUFFLFlBQVksRUFBRSxZQUFZO0FBQzVCLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLE1BQU07QUFDOUIsS0FBSyxVQUFVLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN4QyxHQUFHO0FBQ0gsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLE1BQU0sRUFBRTtBQUN0QyxJQUFJLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSTtBQUMzQixJQUFJLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDOUI7QUFDQSxJQUFJLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUM7QUFDeEMsSUFBSSxNQUFNLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFDO0FBQ3RDLElBQUksTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBQztBQUNyQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBQztBQUM5QyxJQUFJLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLEVBQUM7QUFDOUMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBQztBQUM5QjtBQUNBLElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFDO0FBQ2hFLElBQUksTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRTtBQUM3QixJQUFJLElBQUksQ0FBQyxXQUFXLEdBQUcsTUFBSztBQUM1QixHQUFHO0FBQ0gsQ0FBQyxFQUFDO0FBQ0Y7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFO0FBQ25DLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDM0MsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLGtCQUFrQjtBQUMxQixJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTTtBQUMxQztBQUNBO0FBQ0EsSUFBSSxJQUFJLENBQUMsYUFBYSxHQUFFO0FBQ3hCO0FBQ0EsSUFBSSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQztBQUM3QyxNQUFNLFdBQVcsRUFBRSxJQUFJO0FBQ3ZCLE1BQU0sSUFBSSxFQUFFLEtBQUssQ0FBQyxVQUFVO0FBQzVCLE1BQU0sUUFBUSxFQUFFO0FBQ2hCLFFBQVEsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxFQUFFO0FBQy9DLFFBQVEsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRTtBQUMxQixRQUFRLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUU7QUFDNUIsUUFBUSxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRTtBQUN4QyxPQUFPO0FBQ1Asb0JBQU1DLE1BQVk7QUFDbEIsTUFBTSxjQUFjLEVBQUUsQ0FBQztBQUN2QixRQUFRLEVBQUVDLE1BQU0sQ0FBQztBQUNqQixRQUFRLEVBQUVDLE1BQWMsQ0FBQztBQUN6QixNQUFNLENBQUM7QUFDUCxLQUFLLEVBQUM7QUFDTjtBQUNBO0FBQ0EsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sRUFBQztBQUNwRCxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVE7QUFDakM7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLEdBQUU7QUFDdEM7QUFDQSxJQUFJLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLEVBQUU7QUFDOUIsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksSUFBSTtBQUNoRTtBQUNBLFlBQTRCLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU07QUFDeEQsY0FBYyxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUM7QUFDbEYsYUFBYSxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUk7QUFDOUIsZ0JBQWdCLE9BQU8sQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztBQUNqRCxnQkFBZ0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7QUFDL0QsYUFBYSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFDO0FBQzNDLFNBQVMsRUFBQztBQUNWLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQ3JDLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUM7QUFDL0QsUUFBUSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFDO0FBQ3hDLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUM7QUFDN0MsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLFFBQU87QUFDM0csUUFBUSxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsTUFBTTtBQUMvRCxZQUFZLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUM7QUFDeEMsWUFBWSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFDO0FBQ3RGLFlBQVksb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBQztBQUN6QyxTQUFTLEVBQUM7QUFDVixLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO0FBQzlDLFFBQVEsUUFBUSxFQUFFLGtEQUFrRDtBQUNwRSxRQUFRLEdBQUcsRUFBRSxHQUFHO0FBQ2hCLFFBQVEsTUFBTSxFQUFFLGdCQUFnQjtBQUNoQyxLQUFLLEVBQUM7QUFDTixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLEVBQUM7QUFDdkYsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLDJCQUEyQixFQUFFLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUM7QUFDOUc7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFDO0FBQ3JELElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLEVBQUM7QUFDNUQsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsY0FBYyxFQUFDO0FBQ2pEO0FBQ0EsSUFBSSxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUNwRCxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFDO0FBQ3BFO0FBQ0EsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBQztBQUMzRCxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUM7QUFDakUsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixFQUFFLE1BQU0sSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFDO0FBQ2xFLEdBQUc7QUFDSDtBQUNBLEVBQUUsWUFBWSxFQUFFLFdBQVc7QUFDM0IsSUFBSSxJQUFJLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQzlCLFFBQVEsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFDO0FBQ2hFLFFBQVEsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQUs7QUFDekMsT0FBTyxNQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLEVBQUU7QUFDdkMsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBQztBQUNuRCxPQUFPO0FBQ1AsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxFQUFFO0FBQ3hCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLEdBQUcsS0FBSTtBQUNuRDtBQUNBLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7QUFDaEQsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUM7QUFDakQsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFDO0FBQzdELE1BQU0sTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUM7QUFDdEQ7QUFDQSxNQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUd2QyxNQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsRUFBRTtBQUNuRCxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFDO0FBQ25ELE9BQU87QUFDUCxLQUFLO0FBQ0wsR0FBRztBQUNILEVBQUUsUUFBUSxFQUFFLFlBQVk7QUFDeEIsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxLQUFLO0FBQ3BDLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFDO0FBQy9DLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLENBQUMsRUFBRTtBQUNuQztBQUNBLFlBQVksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxFQUFDLEVBQUUsRUFBQztBQUNuRixTQUFTO0FBQ1Q7QUFDQTtBQUNBLFFBQVEsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFDO0FBQ3pFLFFBQVEsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLFVBQVU7QUFDN0YsMkNBQTJDLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUMsWUFBWSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxFQUFDO0FBQ3JILFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFO0FBQ2pDO0FBQ0EsWUFBWSxPQUFPLENBQUMsS0FBSyxFQUFDO0FBQzFCLFlBQVksS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFDO0FBQ2xELFNBQVMsTUFBTTtBQUNmO0FBQ0EsWUFBWSxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLEtBQUssS0FBSyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBQztBQUNwRyxTQUFTO0FBQ1QsS0FBSyxDQUFDO0FBQ04sR0FBRztBQUNIO0FBQ0EsRUFBRSxhQUFhLEVBQUUsWUFBWTtBQUM3QixJQUFJLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFTO0FBQ3hEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsNENBQTRDLEVBQUM7QUFDL0U7QUFDQTtBQUNBO0FBQ0EsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQ3RDLFFBQVEsT0FBTyxDQUFDLElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxRQUFRLEVBQUM7QUFDekUsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUM7QUFDM0IsUUFBUSxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUk7QUFDaEMsUUFBUSxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQUs7QUFDMUIsUUFBUSxPQUFPO0FBQ2YsS0FBSztBQUNMLElBQUksSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssTUFBTSxFQUFFO0FBQzlCLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFDNUIsUUFBUSxJQUFJLENBQUMsWUFBWSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUM7QUFDL0MsS0FBSyxNQUFNLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsRUFBRTtBQUN2QyxRQUFRLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQzVCLFFBQVEsSUFBSSxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUMsQ0FBQyxFQUFDO0FBQ3JDLEtBQUssTUFBTTtBQUNYLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFDNUIsUUFBUSxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUk7QUFDaEMsS0FBSztBQUNMLElBQUksSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFDO0FBQzNDLEdBQUc7QUFDSDtBQUNBLEVBQUUsU0FBUyxDQUFDLEdBQUcsRUFBRTtBQUNqQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO0FBQzlDLE1BQU0sSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLO0FBQy9DLE1BQU0sRUFBRSxFQUFFLEdBQUc7QUFDYixLQUFLLEVBQUM7QUFDTixHQUFHO0FBQ0gsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDO0FBQ3JCLEdBQUc7QUFDSCxFQUFFLEtBQUssR0FBRztBQUNWLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUM7QUFDckIsR0FBRztBQUNILEVBQUUsUUFBUSxHQUFHO0FBQ2IsSUFBSSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEtBQUssQ0FBQztBQUNwRCxHQUFHO0FBQ0gsQ0FBQzs7QUNoUUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sV0FBVyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUN2QyxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDckM7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsZUFBZSxFQUFFO0FBQzFDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUU7QUFDMUMsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLGtCQUFrQjtBQUMxQixJQUFJLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxjQUFjLEdBQUU7QUFDdEQsSUFBSSxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBQztBQUNoRDtBQUNBO0FBQ0EsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUU7QUFDeEMsTUFBTSxVQUFVLEVBQUUscUJBQXFCO0FBQ3ZDLE1BQU0sU0FBUyxFQUFFLFFBQVE7QUFDekIsTUFBTSxHQUFHLEVBQUUsR0FBRztBQUNkLE1BQU0sT0FBTyxFQUFFLENBQUM7QUFDaEIsTUFBTSxLQUFLLEVBQUUsS0FBSztBQUNsQixNQUFNLFdBQVcsRUFBRSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztBQUN2QyxNQUFNLFdBQVcsRUFBRSxDQUFDO0FBQ3BCLEtBQUssRUFBQztBQUNOO0FBQ0EsSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sR0FBRTtBQUNwQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBQztBQUMzQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztBQUNqQyxNQUFNLFdBQVcsRUFBRSxJQUFJO0FBQ3ZCLE1BQU0sU0FBUyxFQUFFLEtBQUs7QUFDdEIsS0FBSyxFQUFDO0FBQ04sSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLEVBQUM7QUFDakIsSUFBSSxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUc7QUFDbEI7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsRUFBQztBQUN2RCxHQUFHO0FBQ0gsRUFBRSxJQUFJLEVBQUUsWUFBWTtBQUNwQixJQUFJLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtBQUNuQjtBQUNBLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUM7QUFDM0MsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFDO0FBQzFELE1BQU0sTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUM7QUFDeEQsTUFBTSxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDekUsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsUUFBTztBQUMxQyxLQUFLO0FBQ0wsR0FBRztBQUNILEVBQUUsY0FBYyxFQUFFLFlBQVk7QUFDOUI7QUFDQSxJQUFJLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFTO0FBQ3pELElBQUksTUFBTSxHQUFHLElBQUksRUFBRSxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLG9CQUFvQixFQUFDO0FBQ3JFLElBQUksTUFBTSxHQUFHLEdBQUcsQ0FBQyxvREFBb0QsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxFQUFDO0FBQzFGLElBQUksT0FBTyxHQUFHO0FBQ2QsR0FBRztBQUNILEVBQUUsT0FBTyxFQUFFLGtCQUFrQjtBQUM3QixJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEtBQUs7QUFDcEMsTUFBTSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFJO0FBQzNDLE1BQU0sSUFBSSxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBQztBQUM3QixNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCO0FBQzlCLFFBQVEsY0FBYztBQUN0QixRQUFRLE1BQU07QUFDZCxVQUFVLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUM7QUFDM0MsU0FBUztBQUNULFFBQVEsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQ3RCLFFBQU87QUFDUCxLQUFLLENBQUM7QUFDTixHQUFHO0FBQ0gsQ0FBQzs7QUM5RUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUc7QUFDdkI7QUFDQSxNQUFNLGNBQWMsR0FBRztBQUN2QjtBQUNBLEVBQUUsS0FBSyxFQUFFO0FBQ1QsSUFBSSxJQUFJLEVBQUUsYUFBYTtBQUN2QixJQUFJLEtBQUssRUFBRSxvQkFBb0I7QUFDL0IsSUFBSSxLQUFLLEVBQUUsb0JBQW9CO0FBQy9CLElBQUksU0FBUyxFQUFFLHVCQUF1QjtBQUN0QyxJQUFJLE1BQU0sRUFBRSxxQkFBcUI7QUFDakMsR0FBRztBQUNIO0FBQ0EsRUFBRSxRQUFRLEVBQUU7QUFDWixJQUFJLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDNUIsSUFBSSxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO0FBQ3hCLElBQUksYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUNsQyxJQUFJLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN0QyxJQUFJLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN0QyxHQUFHO0FBQ0g7QUFDQSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUM7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBRSxDQUFDO0FBQ0g7QUFDQSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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
