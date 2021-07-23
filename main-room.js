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

const glsl$c = `
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

const glsl$b = `
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

const glsl$a = `
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
      vertexShader: glsl$c,
      fragmentShader: `
        ${glsl$a}
        ${glsl$b}
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
const glsl$9 = String.raw;

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

  vertexShader: glsl$9`
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

  fragmentShader: glsl$9`
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

let DefaultHooks = {
    vertexHooks: {
        uniforms: 'insertbefore:#include <common>\n',
        functions: 'insertafter:#include <clipping_planes_pars_vertex>\n',
        preTransform: 'insertafter:#include <begin_vertex>\n',
        postTransform: 'insertafter:#include <project_vertex>\n',
        preNormal: 'insertafter:#include <beginnormal_vertex>\n'
    },
    fragmentHooks: {
        uniforms: 'insertbefore:#include <common>\n',
        functions: 'insertafter:#include <clipping_planes_pars_fragment>\n',
        preFragColor: 'insertbefore:gl_FragColor = vec4( outgoingLight, diffuseColor.a );\n',
        postFragColor: 'insertafter:gl_FragColor = vec4( outgoingLight, diffuseColor.a );\n',
        postMap: 'insertafter:#include <map_fragment>\n',
        replaceMap: 'replace:#include <map_fragment>\n'
    }
};

// based on https://github.com/jamieowen/three-material-modifier
const modifySource = (source, hookDefs, hooks) => {
    let match;
    for (let key in hookDefs) {
        if (hooks[key]) {
            match = /insert(before):(.*)|insert(after):(.*)|(replace):(.*)/.exec(hookDefs[key]);
            if (match) {
                if (match[1]) { // before
                    source = source.replace(match[2], hooks[key] + '\n' + match[2]);
                }
                else if (match[3]) { // after
                    source = source.replace(match[4], match[4] + '\n' + hooks[key]);
                }
                else if (match[5]) { // replace
                    source = source.replace(match[6], hooks[key]);
                }
            }
        }
    }
    return source;
};
// copied from three.renderers.shaders.UniformUtils.js
function cloneUniforms(src) {
    var dst = {};
    for (var u in src) {
        dst[u] = {};
        for (var p in src[u]) {
            var property = src[u][p];
            if (property && (property.isColor ||
                property.isMatrix3 || property.isMatrix4 ||
                property.isVector2 || property.isVector3 || property.isVector4 ||
                property.isTexture)) {
                dst[u][p] = property.clone();
            }
            else if (Array.isArray(property)) {
                dst[u][p] = property.slice();
            }
            else {
                dst[u][p] = property;
            }
        }
    }
    return dst;
}
let classMap = {
    MeshStandardMaterial: "standard",
    MeshBasicMaterial: "basic",
    MeshLambertMaterial: "lambert",
    MeshPhongMaterial: "phong",
    MeshDepthMaterial: "depth",
    standard: "standard",
    basic: "basic",
    lambert: "lambert",
    phong: "phong",
    depth: "depth"
};
let shaderMap;
const getShaderDef = (classOrString) => {
    if (!shaderMap) {
        let classes = {
            standard: THREE.MeshStandardMaterial,
            basic: THREE.MeshBasicMaterial,
            lambert: THREE.MeshLambertMaterial,
            phong: THREE.MeshPhongMaterial,
            depth: THREE.MeshDepthMaterial
        };
        shaderMap = {};
        for (let key in classes) {
            shaderMap[key] = {
                ShaderClass: classes[key],
                ShaderLib: THREE.ShaderLib[key],
                Key: key,
                Count: 0,
                ModifiedName: function () {
                    return `ModifiedMesh${this.Key[0].toUpperCase() + this.Key.slice(1)}Material_${++this.Count}`;
                },
                TypeCheck: `isMesh${key[0].toUpperCase() + key.slice(1)}Material`
            };
        }
    }
    let shaderDef;
    if (typeof classOrString === 'function') {
        for (let key in shaderMap) {
            if (shaderMap[key].ShaderClass === classOrString) {
                shaderDef = shaderMap[key];
                break;
            }
        }
    }
    else if (typeof classOrString === 'string') {
        let mappedClassOrString = classMap[classOrString];
        shaderDef = shaderMap[mappedClassOrString || classOrString];
    }
    if (!shaderDef) {
        throw new Error('No Shader found to modify...');
    }
    return shaderDef;
};
/**
 * The main Material Modofier
 */
class MaterialModifier {
    _vertexHooks;
    _fragmentHooks;
    constructor(vertexHookDefs, fragmentHookDefs) {
        this._vertexHooks = {};
        this._fragmentHooks = {};
        if (vertexHookDefs) {
            this.defineVertexHooks(vertexHookDefs);
        }
        if (fragmentHookDefs) {
            this.defineFragmentHooks(fragmentHookDefs);
        }
    }
    modify(shader, opts) {
        let def = getShaderDef(shader);
        let vertexShader = modifySource(def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {});
        let fragmentShader = modifySource(def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {});
        let uniforms = Object.assign({}, def.ShaderLib.uniforms, opts.uniforms || {});
        return { vertexShader, fragmentShader, uniforms };
    }
    extend(shader, opts) {
        let def = getShaderDef(shader); // ADJUST THIS SHADER DEF - ONLY DEFINE ONCE - AND STORE A USE COUNT ON EXTENDED VERSIONS.
        let vertexShader = modifySource(def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {});
        let fragmentShader = modifySource(def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {});
        let uniforms = Object.assign({}, def.ShaderLib.uniforms, opts.uniforms || {});
        let ClassName = opts.className || def.ModifiedName();
        let extendMaterial = new Function('BaseClass', 'uniforms', 'vertexShader', 'fragmentShader', 'cloneUniforms', `

            var cls = function ${ClassName}( params ){

                BaseClass.call( this, params );

                this.uniforms = cloneUniforms( uniforms );

                this.vertexShader = vertexShader;
                this.fragmentShader = fragmentShader;
                this.type = '${ClassName}';

                this.setValues( params );

            }

            cls.prototype = Object.create( BaseClass.prototype );
            cls.prototype.constructor = cls;
            cls.prototype.${def.TypeCheck} = true;

            cls.prototype.copy = function( source ){

                BaseClass.prototype.copy.call( this, source );

                this.uniforms = Object.assign( {}, source.uniforms );
                this.vertexShader = vertexShader;
                this.fragmentShader = fragmentShader;
                this.type = '${ClassName}';

                return this;

            }

            return cls;

        `);
        if (opts.postModifyVertexShader) {
            vertexShader = opts.postModifyVertexShader(vertexShader);
        }
        if (opts.postModifyFragmentShader) {
            fragmentShader = opts.postModifyFragmentShader(fragmentShader);
        }
        return extendMaterial(def.ShaderClass, uniforms, vertexShader, fragmentShader, cloneUniforms);
    }
    defineVertexHooks(defs) {
        for (let key in defs) {
            this._vertexHooks[key] = defs[key];
        }
    }
    defineFragmentHooks(defs) {
        for (let key in defs) {
            this._fragmentHooks[key] = defs[key];
        }
    }
}
let defaultMaterialModifier = new MaterialModifier(DefaultHooks.vertexHooks, DefaultHooks.fragmentHooks);

var shaderToyMain = /* glsl */ `
        // above here, the texture lookup will be done, which we
        // can disable by removing the map from the material
        // but if we leave it, we can also choose the blend the texture
        // with our shader created color, or use it in the shader or
        // whatever
        //
        // vec4 texelColor = texture2D( map, vUv );
        // texelColor = mapTexelToLinear( texelColor );
        
        vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

        if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
        if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
        if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
        uv.x = clamp(uv.x, 0.0, 1.0);
        uv.y = clamp(uv.y, 0.0, 1.0);
        
        vec4 shaderColor;
        mainImage(shaderColor, uv.xy * iResolution.xy);
        shaderColor = mapTexelToLinear( shaderColor );

        diffuseColor *= shaderColor;
`;

var shaderToyUniformObj = {
    iTime: { value: 0.0 },
    iResolution: { value: new THREE.Vector3(512, 512, 1) },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 }
};

var shaderToyUniform_paras = /* glsl */ `
uniform vec3 iResolution;
uniform float iTime;
uniform vec2 texRepeat;
uniform vec2 texOffset;
uniform int texFlipY; 
  `;

var bayerImage = "https://resources.realitymedia.digital/core-components/a448e34b8136fae5.png";

// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
const glsl$8 = String.raw;
const uniforms$4 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$4 = new THREE.TextureLoader();
var bayerTex;
loader$4.load(bayerImage, (bayer) => {
    bayer.minFilter = THREE.NearestFilter;
    bayer.magFilter = THREE.NearestFilter;
    bayer.wrapS = THREE.RepeatWrapping;
    bayer.wrapT = THREE.RepeatWrapping;
    bayerTex = bayer;
});
let BleepyBlocksShader = {
    uniforms: uniforms$4,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$8 `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$8 `
      // By Daedelus: https://www.shadertoy.com/user/Daedelus
      // license: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
      #define TIMESCALE 0.25 
      #define TILES 8
      #define COLOR 0.7, 1.6, 2.8

      void mainImage( out vec4 fragColor, in vec2 fragCoord )
      {
        vec2 uv = fragCoord.xy / iResolution.xy;
        uv.x *= iResolution.x / iResolution.y;
        
        vec4 noise = texture2D(iChannel0, floor(uv * float(TILES)) / float(TILES));
        float p = 1.0 - mod(noise.r + noise.g + noise.b + iTime * float(TIMESCALE), 1.0);
        p = min(max(p * 3.0 - 1.8, 0.1), 2.0);
        
        vec2 r = mod(uv * float(TILES), 1.0);
        r = vec2(pow(r.x - 0.5, 2.0), pow(r.y - 0.5, 2.0));
        p *= 1.0 - pow(min(1.0, 12.0 * dot(r, r)), 2.0);
        
        fragColor = vec4(COLOR, 1.0) * p;
      }
      `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = bayerTex;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = time * 0.001;
        material.uniforms.iChannel0.value = bayerTex;
    }
};

// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
const glsl$7 = String.raw;
let NoiseShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$7 `
        #define nPI 3.1415926535897932

        mat2 n_rotate2d(float angle){
                return mat2(cos(angle),-sin(angle),
                            sin(angle), cos(angle));
        }
        
        float n_stripe(float number) {
                float mod = mod(number, 2.0);
                //return step(0.5, mod)*step(1.5, mod);
                //return mod-1.0;
                return min(1.0, (smoothstep(0.0, 0.5, mod) - smoothstep(0.5, 1.0, mod))*1.0);
        }
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
                vec2 u_resolution = iResolution.xy;
                float u_time = iTime;
                vec3 color;
                vec2 st = fragCoord.xy;
                st += 2000.0 + 998000.0*step(1.75, 1.0-sin(u_time/8.0));
                st += u_time/2000.0;
                float m = (1.0+9.0*step(1.0, 1.0-sin(u_time/8.0)))/(1.0+9.0*step(1.0, 1.0-sin(u_time/16.0)));
                vec2 st1 = st * (400.0 + 1200.0*step(1.75, 1.0+sin(u_time)) - 300.0*step(1.5, 1.0+sin(u_time/3.0)));
                st = n_rotate2d(sin(st1.x)*sin(st1.y)/(m*100.0+u_time/100.0)) * st;
                vec2 st2 = st * (100.0 + 1900.0*step(1.75, 1.0-sin(u_time/2.0)));
                st = n_rotate2d(cos(st2.x)*cos(st2.y)/(m*100.0+u_time/100.0)) * st;
                st = n_rotate2d(0.5*nPI+(nPI*0.5*step( 1.0,1.0+ sin(u_time/1.0)))
                              +(nPI*0.1*step( 1.0,1.0+ cos(u_time/2.0)))+u_time*0.0001) * st;
                st *= 10.0;
                st /= u_resolution;
                color = vec3(n_stripe(st.x*u_resolution.x/10.0+u_time/10.0));
                fragColor = vec4(color, 1.0);
        }
            `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = time * 0.001;
    }
};

// from https://www.shadertoy.com/view/XdsBDB
const glsl$6 = String.raw;
let LiquidMarbleShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$6 `
      //// COLORS ////

      const vec3 ORANGE = vec3(1.0, 0.6, 0.2);
      const vec3 PINK   = vec3(0.7, 0.1, 0.4); 
      const vec3 BLUE   = vec3(0.0, 0.2, 0.9); 
      const vec3 BLACK  = vec3(0.0, 0.0, 0.2);
      
      ///// NOISE /////
      
      float hash( float n ) {
          //return fract(sin(n)*43758.5453123);   
          return fract(sin(n)*75728.5453123); 
      }
      
      
      float noise( in vec2 x ) {
          vec2 p = floor(x);
          vec2 f = fract(x);
          f = f*f*(3.0-2.0*f);
          float n = p.x + p.y*57.0;
          return mix(mix( hash(n + 0.0), hash(n + 1.0), f.x), mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y);
      }
      
      ////// FBM ////// 
      
      mat2 m = mat2( 0.6, 0.6, -0.6, 0.8);
      float fbm(vec2 p){
       
          float f = 0.0;
          f += 0.5000 * noise(p); p *= m * 2.02;
          f += 0.2500 * noise(p); p *= m * 2.03;
          f += 0.1250 * noise(p); p *= m * 2.01;
          f += 0.0625 * noise(p); p *= m * 2.04;
          f /= 0.9375;
          return f;
      }
      
      
      void mainImage(out vec4 fragColor, in vec2 fragCoord){
          
          // pixel ratio
          
          vec2 uv = fragCoord.xy / iResolution.xy ;  
          vec2 p = - 1. + 2. * uv;
          p.x *= iResolution.x / iResolution.y;
           
          // domains
          
          float r = sqrt(dot(p,p)); 
          float a = cos(p.y * p.x);  
                 
          // distortion
          
          float f = fbm( 5.0 * p);
          a += fbm(vec2(1.9 - p.x, 0.9 * iTime + p.y));
          a += fbm(0.4 * p);
          r += fbm(2.9 * p);
             
          // colorize
          
          vec3 col = BLUE;
          
          float ff = 1.0 - smoothstep(-0.4, 1.1, noise(vec2(0.5 * a, 3.3 * a)) );        
          col =  mix( col, ORANGE, ff);
             
          ff = 1.0 - smoothstep(.0, 2.8, r );
          col +=  mix( col, BLACK,  ff);
          
          ff -= 1.0 - smoothstep(0.3, 0.5, fbm(vec2(1.0, 40.0 * a)) ); 
          col =  mix( col, PINK,  ff);  
            
          ff = 1.0 - smoothstep(2., 2.9, a * 1.5 ); 
          col =  mix( col, BLACK,  ff);  
                                                 
          fragColor = vec4(col, 1.);
      }
      `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: new THREE.Vector2(mat.map.offset.x + Math.random(), mat.map.offset.x + Math.random()) };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
    }
};

var smallNoise$1 = "https://resources.realitymedia.digital/core-components/cecefb50e408d105.png";

// simple shader taken from https://www.shadertoy.com/view/MslGWN
const glsl$5 = String.raw;
const uniforms$3 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$3 = new THREE.TextureLoader();
var noiseTex$3;
loader$3.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$3 = noise;
});
let GalaxyShader = {
    uniforms: uniforms$3,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$5 `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$5 `
        //CBS
        //Parallax scrolling fractal galaxy.
        //Inspired by JoshP's Simplicity shader: https://www.shadertoy.com/view/lslGWr
        
        // http://www.fractalforums.com/new-theories-and-research/very-simple-formula-for-fractal-patterns/
        float field(in vec3 p,float s) {
            float strength = 7. + .03 * log(1.e-6 + fract(sin(iTime) * 4373.11));
            float accum = s/4.;
            float prev = 0.;
            float tw = 0.;
            for (int i = 0; i < 26; ++i) {
                float mag = dot(p, p);
                p = abs(p) / mag + vec3(-.5, -.4, -1.5);
                float w = exp(-float(i) / 7.);
                accum += w * exp(-strength * pow(abs(mag - prev), 2.2));
                tw += w;
                prev = mag;
            }
            return max(0., 5. * accum / tw - .7);
        }
        
        // Less iterations for second layer
        float field2(in vec3 p, float s) {
            float strength = 7. + .03 * log(1.e-6 + fract(sin(iTime) * 4373.11));
            float accum = s/4.;
            float prev = 0.;
            float tw = 0.;
            for (int i = 0; i < 18; ++i) {
                float mag = dot(p, p);
                p = abs(p) / mag + vec3(-.5, -.4, -1.5);
                float w = exp(-float(i) / 7.);
                accum += w * exp(-strength * pow(abs(mag - prev), 2.2));
                tw += w;
                prev = mag;
            }
            return max(0., 5. * accum / tw - .7);
        }
        
        vec3 nrand3( vec2 co )
        {
            vec3 a = fract( cos( co.x*8.3e-3 + co.y )*vec3(1.3e5, 4.7e5, 2.9e5) );
            vec3 b = fract( sin( co.x*0.3e-3 + co.y )*vec3(8.1e5, 1.0e5, 0.1e5) );
            vec3 c = mix(a, b, 0.5);
            return c;
        }
        
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
            vec2 uv = 2. * fragCoord.xy / iResolution.xy - 1.;
            vec2 uvs = uv * iResolution.xy / max(iResolution.x, iResolution.y);
            vec3 p = vec3(uvs / 4., 0) + vec3(1., -1.3, 0.);
            p += .2 * vec3(sin(iTime / 16.), sin(iTime / 12.),  sin(iTime / 128.));
            
            float freqs[4];
            //Sound
            freqs[0] = texture( iChannel0, vec2( 0.01, 0.25 ) ).x;
            freqs[1] = texture( iChannel0, vec2( 0.07, 0.25 ) ).x;
            freqs[2] = texture( iChannel0, vec2( 0.15, 0.25 ) ).x;
            freqs[3] = texture( iChannel0, vec2( 0.30, 0.25 ) ).x;
        
            float t = field(p,freqs[2]);
            float v = (1. - exp((abs(uv.x) - 1.) * 6.)) * (1. - exp((abs(uv.y) - 1.) * 6.));
            
            //Second Layer
            vec3 p2 = vec3(uvs / (4.+sin(iTime*0.11)*0.2+0.2+sin(iTime*0.15)*0.3+0.4), 1.5) + vec3(2., -1.3, -1.);
            p2 += 0.25 * vec3(sin(iTime / 16.), sin(iTime / 12.),  sin(iTime / 128.));
            float t2 = field2(p2,freqs[3]);
            vec4 c2 = mix(.4, 1., v) * vec4(1.3 * t2 * t2 * t2 ,1.8  * t2 * t2 , t2* freqs[0], t2);
            
            
            //Let's add some stars
            //Thanks to http://glsl.heroku.com/e#6904.0
            vec2 seed = p.xy * 2.0;	
            seed = floor(seed * iResolution.x);
            vec3 rnd = nrand3( seed );
            vec4 starcolor = vec4(pow(rnd.y,40.0));
            
            //Second Layer
            vec2 seed2 = p2.xy * 2.0;
            seed2 = floor(seed2 * iResolution.x);
            vec3 rnd2 = nrand3( seed2 );
            starcolor += vec4(pow(rnd2.y,40.0));
            
            fragColor = mix(freqs[3]-.3, 1., v) * vec4(1.5*freqs[2] * t * t* t , 1.2*freqs[1] * t * t, freqs[3]*t, 1.0)+c2+starcolor;
        }
       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$3;
        material.userData.timeOffset = (Math.random() + 0.5) * 100000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$3;
    }
};

// simple shader taken from https://www.shadertoy.com/view/4sGSzc
const glsl$4 = String.raw;
const uniforms$2 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$2 = new THREE.TextureLoader();
var noiseTex$2;
loader$2.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$2 = noise;
});
let LaceTunnelShader = {
    uniforms: uniforms$2,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$4 `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$4 `
        // Created by Stephane Cuillerdier - Aiekick/2015 (twitter:@aiekick)
        // License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
        // Tuned via XShade (http://www.funparadigm.com/xshade/)
        
        vec2 lt_mo = vec2(0);
        
        float lt_pn( in vec3 x ) // iq noise
        {
            vec3 p = floor(x);
            vec3 f = fract(x);
            f = f*f*(3.0-2.0*f);
            vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
            vec2 rg = texture(iChannel0, (uv+ 0.5)/256.0, -100.0 ).yx;
            return -1.0+2.4*mix( rg.x, rg.y, f.z );
        }
        
        vec2 lt_path(float t)
        {
            return vec2(cos(t*0.2), sin(t*0.2)) * 2.;
        }
        
        const mat3 lt_mx = mat3(1,0,0,0,7,0,0,0,7);
        const mat3 lt_my = mat3(7,0,0,0,1,0,0,0,7);
        const mat3 lt_mz = mat3(7,0,0,0,7,0,0,0,1);
        
        // base on shane tech in shader : One Tweet Cellular Pattern
        float lt_func(vec3 p)
        {
            p = fract(p/68.6) - .5;
            return min(min(abs(p.x), abs(p.y)), abs(p.z)) + 0.1;
        }
        
        vec3 lt_effect(vec3 p)
        {
            p *= lt_mz * lt_mx * lt_my * sin(p.zxy); // sin(p.zxy) is based on iq tech from shader (Sculpture III)
            return vec3(min(min(lt_func(p*lt_mx), lt_func(p*lt_my)), lt_func(p*lt_mz))/.6);
        }
        //
        
        vec4 lt_displacement(vec3 p)
        {
            vec3 col = 1.-lt_effect(p*0.8);
               col = clamp(col, -.5, 1.);
            float dist = dot(col,vec3(0.023));
            col = step(col, vec3(0.82));// black line on shape
            return vec4(dist,col);
        }
        
        vec4 lt_map(vec3 p)
        {
            p.xy -= lt_path(p.z);
            vec4 disp = lt_displacement(sin(p.zxy*2.)*0.8);
            p += sin(p.zxy*.5)*1.5;
            float l = length(p.xy) - 4.;
            return vec4(max(-l + 0.09, l) - disp.x, disp.yzw);
        }
        
        vec3 lt_nor( in vec3 pos, float prec )
        {
            vec3 eps = vec3( prec, 0., 0. );
            vec3 lt_nor = vec3(
                lt_map(pos+eps.xyy).x - lt_map(pos-eps.xyy).x,
                lt_map(pos+eps.yxy).x - lt_map(pos-eps.yxy).x,
                lt_map(pos+eps.yyx).x - lt_map(pos-eps.yyx).x );
            return normalize(lt_nor);
        }
        
        
        vec4 lt_light(vec3 ro, vec3 rd, float d, vec3 lightpos, vec3 lc)
        {
            vec3 p = ro + rd * d;
            
            // original normale
            vec3 n = lt_nor(p, 0.1);
            
            vec3 lightdir = lightpos - p;
            float lightlen = length(lightpos - p);
            lightdir /= lightlen;
            
            float amb = 0.6;
            float diff = clamp( dot( n, lightdir ), 0.0, 1.0 );
                
            vec3 brdf = vec3(0);
            brdf += amb * vec3(0.2,0.5,0.3); // color mat
            brdf += diff * 0.6;
            
            brdf = mix(brdf, lt_map(p).yzw, 0.5);// merge light and black line pattern
                
            return vec4(brdf, lightlen);
        }
        
        vec3 lt_stars(vec2 uv, vec3 rd, float d, vec2 s, vec2 g)
        {
            uv *= 800. * s.x/s.y;
            float k = fract( cos(uv.y * 0.0001 + uv.x) * 90000.);
            float var = sin(lt_pn(d*0.6+rd*182.14))*0.5+0.5;// thank to klems for the variation in my shader subluminic
            vec3 col = vec3(mix(0., 1., var*pow(k, 200.)));// come from CBS Shader "Simplicity" : https://www.shadertoy.com/view/MslGWN
            return col;
        }
        
        ////////MAIN///////////////////////////////
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 s = iResolution.xy;
            vec2 g = fragCoord;
            
           
            float time = iTime*1.0;
            float cam_a = time; // angle z
            
            float cam_e = 3.2; // elevation
            float cam_d = 4.; // distance to origin axis
            
            float maxd = 40.; // ray marching distance max
            
            vec2 uv = (g*2.-s)/s.y;
            
            vec3 col = vec3(0.);
        
            vec3 ro = vec3(lt_path(time)+lt_mo,time);
              vec3 cv = vec3(lt_path(time+0.1)+lt_mo,time+0.1);
            
            vec3 cu=vec3(0,1,0);
              vec3 rov = normalize(cv-ro);
            vec3 u = normalize(cross(cu,rov));
              vec3 v = cross(rov,u);
              vec3 rd = normalize(rov + uv.x*u + uv.y*v);
            
            vec3 curve0 = vec3(0);
            vec3 curve1 = vec3(0);
            vec3 curve2 = vec3(0);
            float outStep = 0.;
            
            float ao = 0.; // ao low cost :)
            
            float st = 0.;
            float d = 0.;
            for(int i=0;i<250;i++)
            {      
                if (st<0.025*log(d*d/st/1e5)||d>maxd) break;// special break condition for low thickness object
                st = lt_map(ro+rd*d).x;
                d += st * 0.6; // the 0.6 is selected according to the 1e5 and the 0.025 of the break condition for good result
                ao++;
            }

            if (d < maxd)
            {
                vec4 li = lt_light(ro, rd, d, ro, vec3(0));// point light on the cam
                col = li.xyz/(li.w*0.2);// cheap light attenuation
                
                   col = mix(vec3(1.-ao/100.), col, 0.5);// low cost ao :)
                fragColor.rgb = mix( col, vec3(0), 1.0-exp( -0.003*d*d ) );
            }
            else
            {
                  fragColor.rgb = lt_stars(uv, rd, d, s, fragCoord);// stars bg
            }

            // vignette
            vec2 q = fragCoord/s;
            fragColor.rgb *= 0.5 + 0.5*pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.25 ); // iq vignette
                
        }
       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$2;
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$2;
    }
};

var smallNoise = "https://resources.realitymedia.digital/core-components/f27e0104605f0cd7.png";

// simple shader taken from https://www.shadertoy.com/view/MdfGRX
const glsl$3 = String.raw;
const uniforms$1 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannelResolution: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] }
});
const loader$1 = new THREE.TextureLoader();
var noiseTex$1;
loader$1.load(smallNoise, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$1 = noise;
    console.log("noise texture size: ", noise.image.width, noise.image.height);
});
let FireTunnelShader = {
    uniforms: uniforms$1,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$3 `
      uniform sampler2D iChannel0;
      uniform vec3 iChannelResolution[4];
        `,
        functions: glsl$3 `
        // Created by inigo quilez - iq/2013
// I share this piece (art and code) here in Shadertoy and through its Public API, only for educational purposes. 
// You cannot use, sell, share or host this piece or modifications of it as part of your own commercial or non-commercial product, website or project.
// You can share a link to it or an unmodified screenshot of it provided you attribute "by Inigo Quilez, @iquilezles and iquilezles.org". 
// If you are a techer, lecturer, educator or similar and these conditions are too restrictive for your needs, please contact me and we'll work it out.

float fire_noise( in vec3 x )
{
    vec3 p = floor(x);
    vec3 f = fract(x);
	f = f*f*(3.0-2.0*f);
	
	vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
	vec2 rg = textureLod( iChannel0, (uv+ 0.5)/256.0, 0.0 ).yx;
	return mix( rg.x, rg.y, f.z );
}

vec4 fire_map( vec3 p )
{
	float den = 0.2 - p.y;

    // invert space	
	p = -7.0*p/dot(p,p);

    // twist space	
	float co = cos(den - 0.25*iTime);
	float si = sin(den - 0.25*iTime);
	p.xz = mat2(co,-si,si,co)*p.xz;

    // smoke	
	float f;
	vec3 q = p                          - vec3(0.0,1.0,0.0)*iTime;;
    f  = 0.50000*fire_noise( q ); q = q*2.02 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.25000*fire_noise( q ); q = q*2.03 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.12500*fire_noise( q ); q = q*2.01 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.06250*fire_noise( q ); q = q*2.02 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.03125*fire_noise( q );

	den = clamp( den + 4.0*f, 0.0, 1.0 );
	
	vec3 col = mix( vec3(1.0,0.9,0.8), vec3(0.4,0.15,0.1), den ) + 0.05*sin(p);
	
	return vec4( col, den );
}

vec3 raymarch( in vec3 ro, in vec3 rd, in vec2 pixel )
{
	vec4 sum = vec4( 0.0 );

	float t = 0.0;

    // dithering	
	t += 0.05*textureLod( iChannel0, pixel.xy/iChannelResolution[0].x, 0.0 ).x;
	
	for( int i=0; i<100; i++ )
	{
		if( sum.a > 0.99 ) break;
		
		vec3 pos = ro + t*rd;
		vec4 col = fire_map( pos );
		
		col.xyz *= mix( 3.1*vec3(1.0,0.5,0.05), vec3(0.48,0.53,0.5), clamp( (pos.y-0.2)/2.0, 0.0, 1.0 ) );
		
		col.a *= 0.6;
		col.rgb *= col.a;

		sum = sum + col*(1.0 - sum.a);	

		t += 0.05;
	}

	return clamp( sum.xyz, 0.0, 1.0 );
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 q = fragCoord.xy / iResolution.xy;
    vec2 p = -1.0 + 2.0*q;
    p.x *= iResolution.x/ iResolution.y;
	
    vec2 mo = vec2(0.5,0.5); //iMouse.xy / iResolution.xy;
    //if( iMouse.w<=0.00001 ) mo=vec2(0.0);
	
    // camera
    vec3 ro = 4.0*normalize(vec3(cos(3.0*mo.x), 1.4 - 1.0*(mo.y-.1), sin(3.0*mo.x)));
	vec3 ta = vec3(0.0, 1.0, 0.0);
	float cr = 0.5*cos(0.7*iTime);
	
    // shake		
	ro += 0.1*(-1.0+2.0*textureLod( iChannel0, iTime*vec2(0.010,0.014), 0.0 ).xyz);
	ta += 0.1*(-1.0+2.0*textureLod( iChannel0, iTime*vec2(0.013,0.008), 0.0 ).xyz);
	
	// build ray
    vec3 ww = normalize( ta - ro);
    vec3 uu = normalize(cross( vec3(sin(cr),cos(cr),0.0), ww ));
    vec3 vv = normalize(cross(ww,uu));
    vec3 rd = normalize( p.x*uu + p.y*vv + 2.0*ww );
	
    // raymarch	
	vec3 col = raymarch( ro, rd, fragCoord );
	
	// contrast and vignetting	
	col = col*0.5 + 0.5*col*col*(3.0-2.0*col);
	col *= 0.25 + 0.75*pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.1 );
	
    fragColor = vec4( col, 1.0 );
}

       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$1;
        material.userData.timeOffset = (Math.random() + 0.5) * 100000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$1;
        material.uniforms.iChannelResolution.value[0].x = noiseTex$1.image.width;
        material.uniforms.iChannelResolution.value[0].y = noiseTex$1.image.height;
    }
};

// simple shader taken from https://www.shadertoy.com/view/7lfXRB
const glsl$2 = String.raw;
let MistShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$2 `

        float mrand(vec2 coords)
        {
            return fract(sin(dot(coords, vec2(56.3456,78.3456)) * 5.0) * 10000.0);
        }
        
        float mnoise(vec2 coords)
        {
            vec2 i = floor(coords);
            vec2 f = fract(coords);
        
            float a = mrand(i);
            float b = mrand(i + vec2(1.0, 0.0));
            float c = mrand(i + vec2(0.0, 1.0));
            float d = mrand(i + vec2(1.0, 1.0));
        
            vec2 cubic = f * f * (3.0 - 2.0 * f);
        
            return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
        }
        
        float fbm(vec2 coords)
        {
            float value = 0.0;
            float scale = 0.5;
        
            for (int i = 0; i < 10; i++)
            {
                value += mnoise(coords) * scale;
                coords *= 4.0;
                scale *= 0.5;
            }
        
            return value;
        }
        
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.y * 2.0;
         
            float final = 0.0;
            
            for (int i =1; i < 6; i++)
            {
                vec2 motion = vec2(fbm(uv + vec2(0.0,iTime) * 0.05 + vec2(i, 0.0)));
        
                final += fbm(uv + motion);
        
            }
            
            final /= 5.0;
            fragColor = vec4(mix(vec3(-0.3), vec3(0.45, 0.4, 0.6) + vec3(0.6), final), 1);
        }
    `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.0012) + material.userData.timeOffset;
    }
};

const glsl$1 = String.raw;
const state = {
    animate: false,
    noiseMode: 'scale',
    invert: false,
    sharpen: true,
    scaleByPrev: false,
    gain: 0.54,
    lacunarity: 2.0,
    octaves: 5,
    scale1: 3.0,
    scale2: 3.0,
    timeScaleX: 0.4,
    timeScaleY: 0.3,
    color1: [0, 0, 0],
    color2: [130, 129, 129],
    color3: [110, 110, 110],
    color4: [82, 51, 13],
    offsetAX: 0,
    offsetAY: 0,
    offsetBX: 3.7,
    offsetBY: 0.9,
    offsetCX: 2.1,
    offsetCY: 3.2,
    offsetDX: 4.3,
    offsetDY: 2.8,
    offsetX: 0,
    offsetY: 0,
};
let Marble1Shader = {
    uniforms: {
        mb_animate: { value: state.animate },
        mb_color1: { value: state.color1.map(c => c / 255) },
        mb_color2: { value: state.color2.map(c => c / 255) },
        mb_color3: { value: state.color3.map(c => c / 255) },
        mb_color4: { value: state.color4.map(c => c / 255) },
        mb_gain: { value: state.gain },
        mb_invert: { value: state.invert },
        mb_lacunarity: { value: state.lacunarity },
        mb_noiseMode: { value: 0  },
        mb_octaves: { value: state.octaves },
        mb_offset: { value: [state.offsetX, state.offsetY] },
        mb_offsetA: { value: [state.offsetAX, state.offsetAY] },
        mb_offsetB: { value: [state.offsetBX, state.offsetBY] },
        mb_offsetC: { value: [state.offsetCX, state.offsetCY] },
        mb_offsetD: { value: [state.offsetDX, state.offsetDY] },
        mb_scale1: { value: state.scale1 },
        mb_scale2: { value: state.scale2 },
        mb_scaleByPrev: { value: state.scaleByPrev },
        mb_sharpen: { value: state.sharpen },
        mb_time: { value: 0 },
        mb_timeScale: { value: [state.timeScaleX, state.timeScaleY] },
        texRepeat: { value: new THREE.Vector2(1, 1) },
        texOffset: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: {},
    fragmentShader: {
        uniforms: glsl$1 `
            uniform bool mb_animate;
            uniform vec3 mb_color1;
            uniform vec3 mb_color2;
            uniform vec3 mb_color3;
            uniform vec3 mb_color4;
            uniform float mb_gain;
            uniform bool mb_invert;
            uniform float mb_lacunarity;
            uniform int mb_noiseMode;
            uniform int mb_octaves;
            uniform vec2 mb_offset;
            uniform vec2 mb_offsetA;
            uniform vec2 mb_offsetB;
            uniform vec2 mb_offsetC;
            uniform vec2 mb_offsetD;
            uniform float mb_scale1;
            uniform float mb_scale2;
            uniform bool mb_scaleByPrev;
            uniform bool mb_sharpen;
            uniform float mb_time;
            uniform vec2 mb_timeScale;
            uniform vec2 texRepeat;
            uniform vec2 texOffset;
                    `,
        functions: glsl$1 `
        // Some useful functions
        vec3 mb_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mb_mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 mb_permute(vec3 x) { return mb_mod289(((x*34.0)+1.0)*x); }
        
        //
        // Description : GLSL 2D simplex noise function
        //      Author : Ian McEwan, Ashima Arts
        //  Maintainer : ijm
        //     Lastmod : 20110822 (ijm)
        //     License :
        //  Copyright (C) 2011 Ashima Arts. All rights reserved.
        //  Distributed under the MIT License. See LICENSE file.
        //  https://github.com/ashima/webgl-noise
        //
        float mb_snoise(vec2 v) {
            // Precompute values for skewed triangular grid
            const vec4 C = vec4(0.211324865405187,
                                // (3.0-sqrt(3.0))/6.0
                                0.366025403784439,
                                // 0.5*(sqrt(3.0)-1.0)
                                -0.577350269189626,
                                // -1.0 + 2.0 * C.x
                                0.024390243902439);
                                // 1.0 / 41.0
        
            // First corner (x0)
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
        
            // Other two corners (x1, x2)
            vec2 i1 = vec2(0.0);
            i1 = (x0.x > x0.y)? vec2(1.0, 0.0):vec2(0.0, 1.0);
            vec2 x1 = x0.xy + C.xx - i1;
            vec2 x2 = x0.xy + C.zz;
        
            // Do some permutations to avoid
            // truncation effects in permutation
            i = mb_mod289(i);
            vec3 p = mb_permute(
                    mb_permute( i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0 ));
        
            vec3 m = max(0.5 - vec3(
                                dot(x0,x0),
                                dot(x1,x1),
                                dot(x2,x2)
                                ), 0.0);
        
            m = m*m;
            m = m*m;
        
            // Gradients:
            //  41 pts uniformly over a line, mapped onto a diamond
            //  The ring size 17*17 = 289 is close to a multiple
            //      of 41 (41*7 = 287)
        
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
        
            // Normalise gradients implicitly by scaling m
            // Approximation of: m *= inversesqrt(a0*a0 + h*h);
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0+h*h);
        
            // Compute final noise value at P
            vec3 g = vec3(0.0);
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * vec2(x1.x,x2.x) + h.yz * vec2(x1.y,x2.y);
            return 130.0 * dot(m, g);
        }
        
        float mb_getNoiseVal(vec2 p) {
            float raw = mb_snoise(p);
        
            if (mb_noiseMode == 1) {
                return abs(raw);
            }
        
            return raw * 0.5 + 0.5;
        }
        
        float mb_fbm(vec2 p) {
            float sum = 0.0;
            float freq = 1.0;
            float amp = 0.5;
            float prev = 1.0;
        
            for (int i = 0; i < mb_octaves; i++) {
                float n = mb_getNoiseVal(p * freq);
        
                if (mb_invert) {
                    n = 1.0 - n;
                }
        
                if (mb_sharpen) {
                    n = n * n;
                }
        
                sum += n * amp;
        
                if (mb_scaleByPrev) {
                    sum += n * amp * prev;
                }
        
                prev = n;
                freq *= mb_lacunarity;
                amp *= mb_gain;
            }
        
            return sum;
        }
        
        float mb_pattern(in vec2 p, out vec2 q, out vec2 r) {
            p *= mb_scale1;
            p += mb_offset;
        
            float t = 0.0;
            if (mb_animate) {
                t = mb_time * 0.1;
            }
        
            q = vec2(mb_fbm(p + mb_offsetA + t * mb_timeScale.x), mb_fbm(p + mb_offsetB - t * mb_timeScale.y));
            r = vec2(mb_fbm(p + mb_scale2 * q + mb_offsetC), mb_fbm(p + mb_scale2 * q + mb_offsetD));
        
            return mb_fbm(p + mb_scale2 * r);
        }
    `,
        replaceMap: glsl$1 `
        vec3 marbleColor = vec3(0.0);

        vec2 q;
        vec2 r;

        vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); 
        if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
        if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
        uv.x = clamp(uv.x, 0.0, 1.0);
        uv.y = clamp(uv.y, 0.0, 1.0);

        float f = mb_pattern(uv, q, r);
        
        marbleColor = mix(mb_color1, mb_color2, f);
        marbleColor = mix(marbleColor, mb_color3, length(q) / 2.0);
        marbleColor = mix(marbleColor, mb_color4, r.y / 2.0);

        vec4 marbleColor4 = mapTexelToLinear( vec4(marbleColor,1.0) );

        diffuseColor *= marbleColor4;
    `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.mb_invert = { value: mat.map.flipY ? state.invert : !state.invert };
        material.uniforms.mb_offsetA = { value: new THREE.Vector2(state.offsetAX + Math.random(), state.offsetAY + Math.random()) };
        material.uniforms.mb_offsetB = { value: new THREE.Vector2(state.offsetBX + Math.random(), state.offsetBY + Math.random()) };
    },
    updateUniforms: function (time, material) {
        material.uniforms.mb_time.value = time * 0.001;
    }
};

var notFound = "https://resources.realitymedia.digital/core-components/1ec965c5d6df577c.jpg";

// simple shader taken from https://www.shadertoy.com/view/4t33z8
const glsl = String.raw;
const uniforms = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannel1: { value: null }
});
const loader = new THREE.TextureLoader();
var noiseTex;
loader.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex = noise;
});
var notFoundTex;
loader.load(notFound, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    notFoundTex = noise;
});
let NotFoundShader = {
    uniforms: uniforms,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl `
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        `,
        functions: glsl `
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.xy;
            vec2 warpUV = 2. * uv;
        
            float d = length( warpUV );
            vec2 st = warpUV*0.1 + 0.2*vec2(cos(0.071*iTime*2.+d),
                                        sin(0.073*iTime*2.-d));
        
            vec3 warpedCol = texture( iChannel0, st ).xyz * 2.0;
            float w = max( warpedCol.r, 0.85);
            
            vec2 offset = 0.01 * cos( warpedCol.rg * 3.14159 );
            vec3 col = texture( iChannel1, uv + offset ).rgb * vec3(0.8, 0.8, 1.5) ;
            col *= w*1.2;
            
            fragColor = vec4( mix(col, texture( iChannel1, uv + offset ).rgb, 0.5),  1.0);
        }
        `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex;
        material.uniforms.iChannel1.value = notFoundTex;
        material.userData.timeOffset = (Math.random() + 0.5) * 10000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex;
        material.uniforms.iChannel1.value = notFoundTex;
    }
};

/**
 * Various simple shaders
 */
new THREE.Vector3();
new THREE.Vector3(0, 0, 1);
AFRAME.registerComponent('shader', {
    material: {},
    shaderDef: {},
    schema: {
        name: { type: 'string', default: "noise" } // if nothing passed, just create some noise
    },
    init: function () {
        // if we don't set up a shader, we'll just return the original material
        var oldMaterial = this.el.object3DMap.mesh.material;
        if (!(oldMaterial instanceof THREE.Material)) {
            return;
        }
        var shaderDef;
        switch (this.data.name) {
            case "noise":
                shaderDef = NoiseShader;
                break;
            case "liquidmarble":
                shaderDef = LiquidMarbleShader;
                break;
            case "bleepyblocks":
                shaderDef = BleepyBlocksShader;
                break;
            case "galaxy":
                shaderDef = GalaxyShader;
                break;
            case "lacetunnel":
                shaderDef = LaceTunnelShader;
                break;
            case "firetunnel":
                shaderDef = FireTunnelShader;
                break;
            case "mist":
                shaderDef = MistShader;
                break;
            case "marble1":
                shaderDef = Marble1Shader;
                break;
            default:
                // an unknown name was passed in
                console.warn("unknown name '" + this.data.name + "' passed to shader component");
                shaderDef = NotFoundShader;
                break;
        }
        if (oldMaterial.type != "MeshStandardMaterial") {
            console.warn("Shader Component: don't know how to handle Shaders of type '" + oldMaterial.type + "', only MeshStandardMaterial at this time.");
            return;
        }
        //const material = oldMaterial.clone();
        var CustomMaterial;
        try {
            CustomMaterial = defaultMaterialModifier.extend(oldMaterial.type, {
                uniforms: shaderDef.uniforms,
                vertexShader: shaderDef.vertexShader,
                fragmentShader: shaderDef.fragmentShader
            });
        }
        catch (e) {
            return;
        }
        // create a new material, initializing the base part with the old material here
        let material = new CustomMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(material, oldMaterial);
        material.needsUpdate = true;
        shaderDef.init(material);
        this.el.object3DMap.mesh.material = material;
        this.material = material;
        //     this.shader = true
        this.shaderDef = shaderDef;
    },
    tick: function (time) {
        if (this.shaderDef == null) {
            return;
        }
        this.shaderDef.updateUniforms(time, this.material);
        switch (this.data.name) {
                    }
        // if (this.shader) {
        //     console.log("fragment shader:", this.material.fragmentShader)
        //     this.shader = null
        // }
    },
});

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
            this.simpleContainer.setObject3D("weblayer3d", this.script.webLayer3D);

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
            parent2.scale.z = 1;

            if (width && width > 0 && height && height > 0) {
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
AFRAME.GLTFModelPlus.registerComponent('shader', 'shader');
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1yb29tLmpzIiwic291cmNlcyI6WyIuLi9zcmMvc3lzdGVtcy9mYWRlci1wbHVzLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcHJveGltaXR5LWV2ZW50cy5qcyIsIi4uL3NyYy9zaGFkZXJzL3BvcnRhbC52ZXJ0LmpzIiwiLi4vc3JjL3NoYWRlcnMvcG9ydGFsLmZyYWcuanMiLCIuLi9zcmMvc2hhZGVycy9zbm9pc2UuanMiLCIuLi9zcmMvdXRpbHMvY29tcG9uZW50LXV0aWxzLmpzIiwiLi4vc3JjL3V0aWxzL3NjZW5lLWdyYXBoLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcmVnaW9uLWhpZGVyLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcG9ydGFsLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvaW1tZXJzaXZlLTM2MC5qcyIsIi4uL3NyYy9zaGFkZXJzL3BhcmFsbGF4LXNoYWRlci5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3BhcmFsbGF4LmpzIiwiLi4vc3JjL3V0aWxzL2RlZmF1bHRIb29rcy50cyIsIi4uL3NyYy91dGlscy9NYXRlcmlhbE1vZGlmaWVyLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95TWFpbi50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveVVuaWZvcm1PYmoudHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzLnRzIiwiLi4vc3JjL2Fzc2V0cy9iYXllci5wbmciLCIuLi9zcmMvc2hhZGVycy9ibGVlcHktYmxvY2tzLXNoYWRlci50cyIsIi4uL3NyYy9zaGFkZXJzL25vaXNlLnRzIiwiLi4vc3JjL3NoYWRlcnMvbGlxdWlkLW1hcmJsZS50cyIsIi4uL3NyYy9hc3NldHMvc21hbGwtbm9pc2UucG5nIiwiLi4vc3JjL3NoYWRlcnMvZ2FsYXh5LnRzIiwiLi4vc3JjL3NoYWRlcnMvbGFjZS10dW5uZWwudHMiLCIuLi9zcmMvYXNzZXRzL25vaXNlLTI1Ni5wbmciLCIuLi9zcmMvc2hhZGVycy9maXJlLXR1bm5lbC50cyIsIi4uL3NyYy9zaGFkZXJzL21pc3QudHMiLCIuLi9zcmMvc2hhZGVycy9tYXJibGUxLnRzIiwiLi4vc3JjL2Fzc2V0cy9iYWRTaGFkZXIuanBnIiwiLi4vc3JjL3NoYWRlcnMvbm90LWZvdW5kLnRzIiwiLi4vc3JjL2NvbXBvbmVudHMvc2hhZGVyLnRzIiwiLi4vc3JjL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMiLCIuLi9zcmMvcm9vbXMvbWFpbi1yb29tLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG5BRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2ZhZGVyLXBsdXMnLCB7XG4gIHNjaGVtYToge1xuICAgIGRpcmVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ25vbmUnIH0sIC8vIFwiaW5cIiwgXCJvdXRcIiwgb3IgXCJub25lXCJcbiAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMjAwIH0sIC8vIFRyYW5zaXRpb24gZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogJ3doaXRlJyB9LFxuICB9LFxuXG4gIGluaXQoKSB7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KCksXG4gICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICBjb2xvcjogdGhpcy5kYXRhLmNvbG9yLFxuICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgb3BhY2l0eTogMCxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIGZvZzogZmFsc2UsXG4gICAgICB9KVxuICAgIClcbiAgICBtZXNoLnNjYWxlLnggPSBtZXNoLnNjYWxlLnkgPSAxXG4gICAgbWVzaC5zY2FsZS56ID0gMC4xNVxuICAgIG1lc2gubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgbWVzaC5yZW5kZXJPcmRlciA9IDEgLy8gcmVuZGVyIGFmdGVyIG90aGVyIHRyYW5zcGFyZW50IHN0dWZmXG4gICAgdGhpcy5lbC5jYW1lcmEuYWRkKG1lc2gpXG4gICAgdGhpcy5tZXNoID0gbWVzaFxuICB9LFxuXG4gIGZhZGVPdXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdvdXQnKVxuICB9LFxuXG4gIGZhZGVJbigpIHtcbiAgICByZXR1cm4gdGhpcy5iZWdpblRyYW5zaXRpb24oJ2luJylcbiAgfSxcblxuICBhc3luYyBiZWdpblRyYW5zaXRpb24oZGlyZWN0aW9uKSB7XG4gICAgaWYgKHRoaXMuX3Jlc29sdmVGaW5pc2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZhZGUgd2hpbGUgYSBmYWRlIGlzIGhhcHBlbmluZy4nKVxuICAgIH1cblxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdmYWRlci1wbHVzJywgeyBkaXJlY3Rpb24gfSlcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzKSA9PiB7XG4gICAgICBpZiAodGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPT09IChkaXJlY3Rpb24gPT0gJ2luJyA/IDAgOiAxKSkge1xuICAgICAgICByZXMoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IHJlc1xuICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgdGljayh0LCBkdCkge1xuICAgIGNvbnN0IG1hdCA9IHRoaXMubWVzaC5tYXRlcmlhbFxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gdGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcgfHwgbWF0Lm9wYWNpdHkgIT09IDBcbiAgICBpZiAoIXRoaXMubWVzaC52aXNpYmxlKSByZXR1cm5cblxuICAgIGlmICh0aGlzLmRhdGEuZGlyZWN0aW9uID09PSAnaW4nKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWF4KDAsIG1hdC5vcGFjaXR5IC0gKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcpIHtcbiAgICAgIG1hdC5vcGFjaXR5ID0gTWF0aC5taW4oMSwgbWF0Lm9wYWNpdHkgKyAoMS4wIC8gdGhpcy5kYXRhLmR1cmF0aW9uKSAqIE1hdGgubWluKGR0LCA1MCkpXG4gICAgfVxuXG4gICAgaWYgKG1hdC5vcGFjaXR5ID09PSAwIHx8IG1hdC5vcGFjaXR5ID09PSAxKSB7XG4gICAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiAhPT0gJ25vbmUnKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCgpXG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uOiAnbm9uZScgfSlcbiAgICB9XG4gIH0sXG59KVxuIiwiY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncHJveGltaXR5LWV2ZW50cycsIHtcbiAgc2NoZW1hOiB7XG4gICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH0sXG4gIH0sXG4gIGluaXQoKSB7XG4gICAgdGhpcy5pblpvbmUgPSBmYWxzZVxuICAgIHRoaXMuY2FtZXJhID0gdGhpcy5lbC5zY2VuZUVsLmNhbWVyYVxuICB9LFxuICB0aWNrKCkge1xuICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmEpXG4gICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkU2VsZilcbiAgICBjb25zdCB3YXNJbnpvbmUgPSB0aGlzLmluWm9uZVxuICAgIHRoaXMuaW5ab25lID0gd29ybGRDYW1lcmEuZGlzdGFuY2VUbyh3b3JsZFNlbGYpIDwgdGhpcy5kYXRhLnJhZGl1c1xuICAgIGlmICh0aGlzLmluWm9uZSAmJiAhd2FzSW56b25lKSB0aGlzLmVsLmVtaXQoJ3Byb3hpbWl0eWVudGVyJylcbiAgICBpZiAoIXRoaXMuaW5ab25lICYmIHdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHlsZWF2ZScpXG4gIH0sXG59KVxuIiwiY29uc3QgZ2xzbCA9IGBcbnZhcnlpbmcgdmVjMiB2VXY7XG52YXJ5aW5nIHZlYzMgdlJheTtcbnZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG52b2lkIG1haW4oKSB7XG4gIHZVdiA9IHV2O1xuICAvLyB2Tm9ybWFsID0gbm9ybWFsTWF0cml4ICogbm9ybWFsO1xuICB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxNYXRyaXgpICogdmVjNChjYW1lcmFQb3NpdGlvbiwgMS4wKSkueHl6O1xuICB2UmF5ID0gcG9zaXRpb24gLSBjYW1lcmFMb2NhbDtcbiAgdk5vcm1hbCA9IG5vcm1hbGl6ZSgtMS4gKiB2UmF5KTtcbiAgZmxvYXQgZGlzdCA9IGxlbmd0aChjYW1lcmFMb2NhbCk7XG4gIHZSYXkueiAqPSAxLjMgLyAoMS4gKyBwb3coZGlzdCwgMC41KSk7IC8vIENoYW5nZSBGT1YgYnkgc3F1YXNoaW5nIGxvY2FsIFogZGlyZWN0aW9uXG4gIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbk1hdHJpeCAqIG1vZGVsVmlld01hdHJpeCAqIHZlYzQocG9zaXRpb24sIDEuMCk7XG59XG5gXG5leHBvcnQgZGVmYXVsdCBnbHNsXG4iLCJjb25zdCBnbHNsID0gYFxudW5pZm9ybSBzYW1wbGVyQ3ViZSBjdWJlTWFwO1xudW5pZm9ybSBmbG9hdCB0aW1lO1xudW5pZm9ybSBmbG9hdCByYWRpdXM7XG51bmlmb3JtIHZlYzMgcmluZ0NvbG9yO1xuXG52YXJ5aW5nIHZlYzIgdlV2O1xudmFyeWluZyB2ZWMzIHZSYXk7XG52YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuI2RlZmluZSBSSU5HX1dJRFRIIDAuMVxuI2RlZmluZSBSSU5HX0hBUkRfT1VURVIgMC4wMVxuI2RlZmluZSBSSU5HX0hBUkRfSU5ORVIgMC4wOFxuI2RlZmluZSBmb3J3YXJkIHZlYzMoMC4wLCAwLjAsIDEuMClcblxudm9pZCBtYWluKCkge1xuICB2ZWMyIGNvb3JkID0gdlV2ICogMi4wIC0gMS4wO1xuICBmbG9hdCBub2lzZSA9IHNub2lzZSh2ZWMzKGNvb3JkICogMS4sIHRpbWUpKSAqIDAuNSArIDAuNTtcblxuICAvLyBQb2xhciBkaXN0YW5jZVxuICBmbG9hdCBkaXN0ID0gbGVuZ3RoKGNvb3JkKTtcbiAgZGlzdCArPSBub2lzZSAqIDAuMjtcblxuICBmbG9hdCBtYXNrT3V0ZXIgPSAxLjAgLSBzbW9vdGhzdGVwKHJhZGl1cyAtIFJJTkdfSEFSRF9PVVRFUiwgcmFkaXVzLCBkaXN0KTtcbiAgZmxvYXQgbWFza0lubmVyID0gMS4wIC0gc21vb3Roc3RlcChyYWRpdXMgLSBSSU5HX1dJRFRILCByYWRpdXMgLSBSSU5HX1dJRFRIICsgUklOR19IQVJEX0lOTkVSLCBkaXN0KTtcbiAgZmxvYXQgZGlzdG9ydGlvbiA9IHNtb290aHN0ZXAocmFkaXVzIC0gMC4yLCByYWRpdXMgKyAwLjIsIGRpc3QpO1xuICB2ZWMzIG5vcm1hbCA9IG5vcm1hbGl6ZSh2Tm9ybWFsKTtcbiAgZmxvYXQgZGlyZWN0VmlldyA9IHNtb290aHN0ZXAoMC4sIDAuOCwgZG90KG5vcm1hbCwgZm9yd2FyZCkpO1xuICB2ZWMzIHRhbmdlbnRPdXR3YXJkID0gdmVjMyhjb29yZCwgMC4wKTtcbiAgdmVjMyByYXkgPSBtaXgodlJheSwgdGFuZ2VudE91dHdhcmQsIGRpc3RvcnRpb24pO1xuICB2ZWM0IHRleGVsID0gdGV4dHVyZUN1YmUoY3ViZU1hcCwgcmF5KTtcbiAgdmVjMyBjZW50ZXJMYXllciA9IHRleGVsLnJnYiAqIG1hc2tJbm5lcjtcbiAgdmVjMyByaW5nTGF5ZXIgPSByaW5nQ29sb3IgKiAoMS4gLSBtYXNrSW5uZXIpO1xuICB2ZWMzIGNvbXBvc2l0ZSA9IGNlbnRlckxheWVyICsgcmluZ0xheWVyO1xuXG4gIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29tcG9zaXRlLCAobWFza091dGVyIC0gbWFza0lubmVyKSArIG1hc2tJbm5lciAqIGRpcmVjdFZpZXcpO1xufVxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiLypcbiAqIDNEIFNpbXBsZXggbm9pc2VcbiAqIFNJR05BVFVSRTogZmxvYXQgc25vaXNlKHZlYzMgdilcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9odWdoc2svZ2xzbC1ub2lzZVxuICovXG5cbmNvbnN0IGdsc2wgPSBgXG4vL1xuLy8gRGVzY3JpcHRpb24gOiBBcnJheSBhbmQgdGV4dHVyZWxlc3MgR0xTTCAyRC8zRC80RCBzaW1wbGV4XG4vLyAgICAgICAgICAgICAgIG5vaXNlIGZ1bmN0aW9ucy5cbi8vICAgICAgQXV0aG9yIDogSWFuIE1jRXdhbiwgQXNoaW1hIEFydHMuXG4vLyAgTWFpbnRhaW5lciA6IGlqbVxuLy8gICAgIExhc3Rtb2QgOiAyMDExMDgyMiAoaWptKVxuLy8gICAgIExpY2Vuc2UgOiBDb3B5cmlnaHQgKEMpIDIwMTEgQXNoaW1hIEFydHMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vLyAgICAgICAgICAgICAgIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZS5cbi8vICAgICAgICAgICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FzaGltYS93ZWJnbC1ub2lzZVxuLy9cblxudmVjMyBtb2QyODkodmVjMyB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgbW9kMjg5KHZlYzQgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IHBlcm11dGUodmVjNCB4KSB7XG4gICAgIHJldHVybiBtb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7XG59XG5cbnZlYzQgdGF5bG9ySW52U3FydCh2ZWM0IHIpXG57XG4gIHJldHVybiAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqIHI7XG59XG5cbmZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gIHtcbiAgY29uc3QgdmVjMiAgQyA9IHZlYzIoMS4wLzYuMCwgMS4wLzMuMCkgO1xuICBjb25zdCB2ZWM0ICBEID0gdmVjNCgwLjAsIDAuNSwgMS4wLCAyLjApO1xuXG4vLyBGaXJzdCBjb3JuZXJcbiAgdmVjMyBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eXkpICk7XG4gIHZlYzMgeDAgPSAgIHYgLSBpICsgZG90KGksIEMueHh4KSA7XG5cbi8vIE90aGVyIGNvcm5lcnNcbiAgdmVjMyBnID0gc3RlcCh4MC55engsIHgwLnh5eik7XG4gIHZlYzMgbCA9IDEuMCAtIGc7XG4gIHZlYzMgaTEgPSBtaW4oIGcueHl6LCBsLnp4eSApO1xuICB2ZWMzIGkyID0gbWF4KCBnLnh5eiwgbC56eHkgKTtcblxuICAvLyAgIHgwID0geDAgLSAwLjAgKyAwLjAgKiBDLnh4eDtcbiAgLy8gICB4MSA9IHgwIC0gaTEgICsgMS4wICogQy54eHg7XG4gIC8vICAgeDIgPSB4MCAtIGkyICArIDIuMCAqIEMueHh4O1xuICAvLyAgIHgzID0geDAgLSAxLjAgKyAzLjAgKiBDLnh4eDtcbiAgdmVjMyB4MSA9IHgwIC0gaTEgKyBDLnh4eDtcbiAgdmVjMyB4MiA9IHgwIC0gaTIgKyBDLnl5eTsgLy8gMi4wKkMueCA9IDEvMyA9IEMueVxuICB2ZWMzIHgzID0geDAgLSBELnl5eTsgICAgICAvLyAtMS4wKzMuMCpDLnggPSAtMC41ID0gLUQueVxuXG4vLyBQZXJtdXRhdGlvbnNcbiAgaSA9IG1vZDI4OShpKTtcbiAgdmVjNCBwID0gcGVybXV0ZSggcGVybXV0ZSggcGVybXV0ZShcbiAgICAgICAgICAgICBpLnogKyB2ZWM0KDAuMCwgaTEueiwgaTIueiwgMS4wICkpXG4gICAgICAgICAgICsgaS55ICsgdmVjNCgwLjAsIGkxLnksIGkyLnksIDEuMCApKVxuICAgICAgICAgICArIGkueCArIHZlYzQoMC4wLCBpMS54LCBpMi54LCAxLjAgKSk7XG5cbi8vIEdyYWRpZW50czogN3g3IHBvaW50cyBvdmVyIGEgc3F1YXJlLCBtYXBwZWQgb250byBhbiBvY3RhaGVkcm9uLlxuLy8gVGhlIHJpbmcgc2l6ZSAxNyoxNyA9IDI4OSBpcyBjbG9zZSB0byBhIG11bHRpcGxlIG9mIDQ5ICg0OSo2ID0gMjk0KVxuICBmbG9hdCBuXyA9IDAuMTQyODU3MTQyODU3OyAvLyAxLjAvNy4wXG4gIHZlYzMgIG5zID0gbl8gKiBELnd5eiAtIEQueHp4O1xuXG4gIHZlYzQgaiA9IHAgLSA0OS4wICogZmxvb3IocCAqIG5zLnogKiBucy56KTsgIC8vICBtb2QocCw3KjcpXG5cbiAgdmVjNCB4XyA9IGZsb29yKGogKiBucy56KTtcbiAgdmVjNCB5XyA9IGZsb29yKGogLSA3LjAgKiB4XyApOyAgICAvLyBtb2QoaixOKVxuXG4gIHZlYzQgeCA9IHhfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCB5ID0geV8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IGggPSAxLjAgLSBhYnMoeCkgLSBhYnMoeSk7XG5cbiAgdmVjNCBiMCA9IHZlYzQoIHgueHksIHkueHkgKTtcbiAgdmVjNCBiMSA9IHZlYzQoIHguencsIHkuencgKTtcblxuICAvL3ZlYzQgczAgPSB2ZWM0KGxlc3NUaGFuKGIwLDAuMCkpKjIuMCAtIDEuMDtcbiAgLy92ZWM0IHMxID0gdmVjNChsZXNzVGhhbihiMSwwLjApKSoyLjAgLSAxLjA7XG4gIHZlYzQgczAgPSBmbG9vcihiMCkqMi4wICsgMS4wO1xuICB2ZWM0IHMxID0gZmxvb3IoYjEpKjIuMCArIDEuMDtcbiAgdmVjNCBzaCA9IC1zdGVwKGgsIHZlYzQoMC4wKSk7XG5cbiAgdmVjNCBhMCA9IGIwLnh6eXcgKyBzMC54enl3KnNoLnh4eXkgO1xuICB2ZWM0IGExID0gYjEueHp5dyArIHMxLnh6eXcqc2guenp3dyA7XG5cbiAgdmVjMyBwMCA9IHZlYzMoYTAueHksaC54KTtcbiAgdmVjMyBwMSA9IHZlYzMoYTAuencsaC55KTtcbiAgdmVjMyBwMiA9IHZlYzMoYTEueHksaC56KTtcbiAgdmVjMyBwMyA9IHZlYzMoYTEuencsaC53KTtcblxuLy9Ob3JtYWxpc2UgZ3JhZGllbnRzXG4gIHZlYzQgbm9ybSA9IHRheWxvckludlNxcnQodmVjNChkb3QocDAscDApLCBkb3QocDEscDEpLCBkb3QocDIsIHAyKSwgZG90KHAzLHAzKSkpO1xuICBwMCAqPSBub3JtLng7XG4gIHAxICo9IG5vcm0ueTtcbiAgcDIgKj0gbm9ybS56O1xuICBwMyAqPSBub3JtLnc7XG5cbi8vIE1peCBmaW5hbCBub2lzZSB2YWx1ZVxuICB2ZWM0IG0gPSBtYXgoMC42IC0gdmVjNChkb3QoeDAseDApLCBkb3QoeDEseDEpLCBkb3QoeDIseDIpLCBkb3QoeDMseDMpKSwgMC4wKTtcbiAgbSA9IG0gKiBtO1xuICByZXR1cm4gNDIuMCAqIGRvdCggbSptLCB2ZWM0KCBkb3QocDAseDApLCBkb3QocDEseDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QocDIseDIpLCBkb3QocDMseDMpICkgKTtcbiAgfSAgXG5gXG5leHBvcnQgZGVmYXVsdCBnbHNsXG4iLCIvLyBQcm92aWRlcyBhIGdsb2JhbCByZWdpc3RyeSBvZiBydW5uaW5nIGNvbXBvbmVudHNcbi8vIGNvcGllZCBmcm9tIGh1YnMgc291cmNlXG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8IHt9O1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdIHx8IFtdO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0ucHVzaChjb21wb25lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIGlmICghd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSkgcmV0dXJuO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uc3BsaWNlKHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uaW5kZXhPZihjb21wb25lbnQpLCAxKTtcbn1cbiAgIiwiLy8gY29waWVkIGZyb20gaHVic1xuXG5leHBvcnQgZnVuY3Rpb24gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudChlbnRpdHksIGNvbXBvbmVudE5hbWUpIHtcbiAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5LmNvbXBvbmVudHMgJiYgZW50aXR5LmNvbXBvbmVudHNbY29tcG9uZW50TmFtZV0pKSB7XG4gICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gICAgcmV0dXJuIGVudGl0eTtcbiAgfVxuICBcbiAgZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21wb25lbnRzSW5OZWFyZXN0QW5jZXN0b3IoZW50aXR5LCBjb21wb25lbnROYW1lKSB7XG4gICAgY29uc3QgY29tcG9uZW50cyA9IFtdO1xuICAgIHdoaWxlIChlbnRpdHkpIHtcbiAgICAgIGlmIChlbnRpdHkuY29tcG9uZW50cykge1xuICAgICAgICBmb3IgKGNvbnN0IGMgaW4gZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHNbY10ubmFtZSA9PT0gY29tcG9uZW50TmFtZSkge1xuICAgICAgICAgICAgY29tcG9uZW50cy5wdXNoKGVudGl0eS5jb21wb25lbnRzW2NdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY29tcG9uZW50cztcbiAgICAgIH1cbiAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlO1xuICAgIH1cbiAgICByZXR1cm4gY29tcG9uZW50cztcbiAgfVxuICAiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogYnJlYWsgdGhlIHJvb20gaW50byBxdWFkcmFudHMgb2YgYSBjZXJ0YWluIHNpemUsIGFuZCBoaWRlIHRoZSBjb250ZW50cyBvZiBhcmVhcyB0aGF0IGhhdmVcbiAqIG5vYm9keSBpbiB0aGVtLiAgTWVkaWEgd2lsbCBiZSBwYXVzZWQgaW4gdGhvc2UgYXJlYXMgdG9vLlxuICogXG4gKiBJbmNsdWRlIGEgd2F5IGZvciB0aGUgcG9ydGFsIGNvbXBvbmVudCB0byB0dXJuIG9uIGVsZW1lbnRzIGluIHRoZSByZWdpb24gb2YgdGhlIHBvcnRhbCBiZWZvcmVcbiAqIGl0IGNhcHR1cmVzIGEgY3ViZW1hcFxuICovXG5cbmltcG9ydCB7IHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UsIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuLi91dGlscy9jb21wb25lbnQtdXRpbHNcIjtcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcblxuIC8vIGFyYml0cmFyaWx5IGNob29zZSAxMDAwMDAwIGFzIHRoZSBudW1iZXIgb2YgY29tcHV0ZWQgem9uZXMgaW4gIHggYW5kIHlcbmxldCBNQVhfWk9ORVMgPSAxMDAwMDAwXG5sZXQgcmVnaW9uVGFnID0gZnVuY3Rpb24oc2l6ZSwgb2JqM2QpIHtcbiAgICBsZXQgcG9zID0gb2JqM2QucG9zaXRpb25cbiAgICBsZXQgeHAgPSBNYXRoLmZsb29yKHBvcy54IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIGxldCB6cCA9IE1hdGguZmxvb3IocG9zLnogLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgcmV0dXJuIE1BWF9aT05FUyAqIHhwICsgenBcbn1cblxubGV0IHJlZ2lvbnNJblVzZSA9IFtdXG5cbi8qKlxuICogRmluZCB0aGUgY2xvc2VzdCBhbmNlc3RvciAoaW5jbHVkaW5nIHRoZSBwYXNzZWQgaW4gZW50aXR5KSB0aGF0IGhhcyBhbiBgb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcmAgY29tcG9uZW50LFxuICogYW5kIHJldHVybiB0aGF0IGNvbXBvbmVudFxuICovXG5mdW5jdGlvbiBnZXRSZWdpb25Gb2xsb3dlcihlbnRpdHkpIHtcbiAgICBsZXQgY3VyRW50aXR5ID0gZW50aXR5O1xuICBcbiAgICB3aGlsZShjdXJFbnRpdHkgJiYgY3VyRW50aXR5LmNvbXBvbmVudHMgJiYgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICBjdXJFbnRpdHkgPSBjdXJFbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gIFxuICAgIGlmICghY3VyRW50aXR5IHx8ICFjdXJFbnRpdHkuY29tcG9uZW50cyB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXVxufVxuICBcbmZ1bmN0aW9uIGFkZFRvUmVnaW9uKHJlZ2lvbikge1xuICAgIHJlZ2lvbnNJblVzZVtyZWdpb25dID8gcmVnaW9uc0luVXNlW3JlZ2lvbl0rKyA6IHJlZ2lvbnNJblVzZVtyZWdpb25dID0gMVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBpbiByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMSkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHRydWUpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJhbHJlYWR5IGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHN1YnRyYWN0RnJvbVJlZ2lvbihyZWdpb24pIHtcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0pIHtyZWdpb25zSW5Vc2VbcmVnaW9uXS0tIH1cbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgbGVmdCByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcblxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAwKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgZmFsc2UpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJzdGlsbCBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd1JlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcInNob3dpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgYWRkVG9SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGlkZXJSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJoaWRpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgc3VidHJhY3RGcm9tUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzKCkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKFwic2hvd2luZy9oaWRpbmcgYWxsIG9iamVjdHNcIilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2Vbb2JqLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgIGlmIChvYmouZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IGNvbnRpbnVlIH1cblxuICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCJoaWRpbmcgXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdmlzaWJsZSkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nXCIgOiBcImhpZGluZ1wiKSArIFwiIGFsbCBvYmplY3RzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgaWYgKG9iai5yZWdpb24gPT0gcmVnaW9uKSB7XG4gICAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiIGhpZGluZ1wiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG4gIFxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdhdmF0YXItcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXZhdGFyOiByZWdpb24gXCIsIHRoaXMucmVnaW9uKVxuICAgICAgICBhZGRUb1JlZ2lvbih0aGlzLnJlZ2lvbilcblxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbmV3UmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBpZiAobmV3UmVnaW9uICE9IHRoaXMucmVnaW9uKSB7XG4gICAgICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgICAgICAgICBhZGRUb1JlZ2lvbihuZXdSZWdpb24pXG4gICAgICAgICAgICB0aGlzLnJlZ2lvbiA9IG5ld1JlZ2lvblxuICAgICAgICB9XG4gICAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9LFxuICAgICAgICBkeW5hbWljOiB7IGRlZmF1bHQ6IHRydWUgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICB0aGlzLnNob3dIaWRlID0gdGhpcy5zaG93SGlkZS5iaW5kKHRoaXMpXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgIH1cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZG9uJ3QgbW92ZVxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5keW5hbWljKSB7IHJldHVybiB9XG5cbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2VbdGhpcy5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyByZXR1cm4gfVxuXG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLnNob3dIaWRlKHZpc2libGUpXG4gICAgfSxcblxuICAgIHNob3dIaWRlOiBmdW5jdGlvbiAodmlzaWJsZSkge1xuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdmlzaWJsZVxuXG4gICAgICAgIC8vLyBjaGVjayBmb3IgbWVkaWEtdmlkZW8gY29tcG9uZW50IG9uIHBhcmVudCB0byBzZWUgaWYgd2UncmUgYSB2aWRlby4gIEFsc28gc2FtZSBmb3IgYXVkaW9cbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICBpZiAodmlzaWJsZSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLndhc1BhdXNlZCAhPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICAgICAgICAgIGlmICghdGhpcy53YXNQYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncmVnaW9uLWhpZGVyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGFyZW50IHdpdGggXCJuYXYtbWVzaC1oZWxwZXJcIiwgdGhpcyBpcyBpbiB0aGUgc2NlbmUuICBcbiAgICAgICAgLy8gSWYgbm90LCBpdCdzIGluIGFuIG9iamVjdCB3ZSBkcm9wcGVkIG9uIHRoZSB3aW5kb3csIHdoaWNoIHdlIGRvbid0IHN1cHBvcnRcbiAgICAgICAgaWYgKCFmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwibmF2LW1lc2gtaGVscGVyXCIpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50IG11c3QgYmUgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGdsYi5cIilcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IDA7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMubm9kZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgICAgICBpZih0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG5cbiAgICAgICAgLy8gdGhpcy5uZXdTY2VuZSA9IHRoaXMubmV3U2NlbmUuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLm5ld1NjZW5lKVxuICAgICAgICAvLyBjb25zdCBlbnZpcm9ubWVudFNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNlbnZpcm9ubWVudC1zY2VuZVwiKTtcbiAgICAgICAgLy8gdGhpcy5hZGRTY2VuZUVsZW1lbnQgPSB0aGlzLmFkZFNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50ID0gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFNjZW5lRWxlbWVudClcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2Ugd2FudCB0byBub3RpY2Ugd2hlbiBuZXcgdGhpbmdzIGdldCBhZGRlZCB0byB0aGUgcm9vbS4gIFRoaXMgd2lsbCBoYXBwZW4gZm9yXG4gICAgICAgIC8vIG9iamVjdHMgZHJvcHBlZCBpbiB0aGUgcm9vbSwgb3IgZm9yIG5ldyByZW1vdGUgYXZhdGFycywgYXQgbGVhc3RcbiAgICAgICAgLy8gdGhpcy5hZGRSb290RWxlbWVudCA9IHRoaXMuYWRkUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVJvb3RFbGVtZW50ID0gdGhpcy5yZW1vdmVSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRSb290RWxlbWVudClcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVJvb3RFbGVtZW50KVxuXG4gICAgICAgIC8vIHdhbnQgdG8gc2VlIGlmIHRoZXJlIGFyZSBwaW5uZWQgb2JqZWN0cyB0aGF0IHdlcmUgbG9hZGVkIGZyb20gaHVic1xuICAgICAgICBsZXQgcm9vbU9iamVjdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFwiUm9vbU9iamVjdHNcIilcbiAgICAgICAgdGhpcy5yb29tT2JqZWN0cyA9IHJvb21PYmplY3RzLmxlbmd0aCA+IDAgPyByb29tT2JqZWN0c1swXSA6IG51bGxcblxuICAgICAgICAvLyBnZXQgYXZhdGFyc1xuICAgICAgICBjb25zdCBhdmF0YXJzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dXCIpO1xuICAgICAgICBhdmF0YXJzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayBvYmplY3RzIGluIHRoZSByb290ICh0aGluZ3MgdGhhdCBoYXZlIGJlZW4gZHJvcHBlZCBvbiB0aGUgc2NlbmUpXG4gICAgICAgIC8vIC0gZHJhd2luZ3MgaGF2ZSBjbGFzcz1cImRyYXdpbmdcIiwgbmV0d29ya2VkLWRyYXdpbmdcbiAgICAgICAgLy8gTm90IGdvaW5nIHRvIGRvIGRyYXdpbmdzIHJpZ2h0IG5vdy5cblxuICAgICAgICAvLyBwaW5uZWQgbWVkaWEgbGl2ZSB1bmRlciBhIG5vZGUgd2l0aCBjbGFzcz1cIlJvb21PYmplY3RzXCJcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuUm9vbU9iamVjdHMgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0gY2FtZXJhIGhhcyBjYW1lcmEtdG9vbCAgICAgICAgXG4gICAgICAgIC8vIC0gaW1hZ2UgZnJvbSBjYW1lcmEsIG9yIGRyb3BwZWQsIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLWltYWdlLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSBnbGIgaGFzIG1lZGlhLWxvYWRlciwgZ2x0Zi1tb2RlbC1wbHVzLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSB2aWRlbyBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS12aWRlbywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vXG4gICAgICAgIC8vICBzbywgZ2V0IGFsbCBjYW1lcmEtdG9vbHMsIGFuZCBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIHRoZSBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZS4gIE11c3Qgd2FpdCBmb3Igc2NlbmUgdG8gZmluaXNoIGxvYWRpbmdcbiAgICAgICAgdGhpcy5zY2VuZUxvYWRlZCA9IHRoaXMuc2NlbmVMb2FkZWQuYmluZCh0aGlzKVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcblxuICAgIH0sXG5cbiAgICAvLyBUaGluZ3Mgd2UgZG9uJ3Qgd2FudCB0byBoaWRlOlxuICAgIC8vIC0gW3dheXBvaW50XVxuICAgIC8vIC0gcGFyZW50IG9mIHNvbWV0aGluZyB3aXRoIFtuYXZtZXNoXSBhcyBhIGNoaWxkICh0aGlzIGlzIHRoZSBuYXZpZ2F0aW9uIHN0dWZmXG4gICAgLy8gLSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsXG4gICAgLy8gLSBbc2t5Ym94XVxuICAgIC8vIC0gW2RpcmVjdGlvbmFsLWxpZ2h0XVxuICAgIC8vIC0gW2FtYmllbnQtbGlnaHRdXG4gICAgLy8gLSBbaGVtaXNwaGVyZS1saWdodF1cbiAgICAvLyAtICNDb21iaW5lZE1lc2hcbiAgICAvLyAtICNzY2VuZS1wcmV2aWV3LWNhbWVyYSBvciBbc2NlbmUtcHJldmlldy1jYW1lcmFdXG4gICAgLy9cbiAgICAvLyB3ZSB3aWxsIGRvXG4gICAgLy8gLSBbbWVkaWEtbG9hZGVyXVxuICAgIC8vIC0gW3Nwb3QtbGlnaHRdXG4gICAgLy8gLSBbcG9pbnQtbGlnaHRdXG4gICAgc2NlbmVMb2FkZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5wYXJlbnRFbC5jaGlsZE5vZGVzO1xuICAgICAgICBmb3IgKGxldCBpPTA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG5vZGUgPSBub2Rlc1tpXVxuICAgICAgICAgICAgaWYgKG5vZGUgPT0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbCkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2wgPSBub2RlLmNsYXNzTmFtZVxuICAgICAgICAgICAgaWYgKGNsID09PSBcIkNvbWJpbmVkTWVzaFwiIHx8IGNsID09PSBcInNjZW5lLXByZXZpZXctY2FtZXJhXCIpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGMgPSBub2RlLmNvbXBvbmVudHNcbiAgICAgICAgICAgIGlmIChjW1wid2F5cG9pbnRcIl0gfHwgY1tcInNreWJveFwiXSB8fCBjW1wiZGlyZWN0aW9uYWwtbGlnaHRcIl0gfHwgY1tcImFtYmllbnQtbGlnaHRcIl0gfHwgY1tcImhlbWlzcGhlcmUtbGlnaHRcIl0pIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNoID0gbm9kZS5jaGlsZHJlblxuICAgICAgICAgICAgdmFyIG5hdm1lc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAobGV0IGo9MDsgaiA8IGNoLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoW2pdLmNvbXBvbmVudHNbXCJuYXZtZXNoXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIG5hdm1lc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmF2bWVzaCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUsIGR5bmFtaWM6IGZhbHNlIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBhbGwgb2JqZWN0cyBhbmQgYXZhdGFyIHNob3VsZCBiZSBzZXQgdXAsIHNvIGxldHMgbWFrZSBzdXJlIGFsbCBvYmplY3RzIGFyZSBjb3JyZWN0bHkgc2hvd25cbiAgICAgICAgc2hvd0hpZGVPYmplY3RzKClcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7dGhpcy5kYXRhLnNpemUgPSAxMH1cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09PSB0aGlzLnNpemUpIHJldHVyblxuXG4gICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmVsLnNjZW5lRWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy8gc2l6ZSA9PSAwIGlzIHVzZWQgdG8gc2lnbmFsIFwiZG8gbm90aGluZ1wiXG4gICAgICAgIGlmICh0aGlzLnNpemUgPT0gMCkge3JldHVybn1cblxuICAgICAgICAvLyBzZWUgaWYgdGhlcmUgYXJlIG5ldyBhdmF0YXJzXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXTpub3QoW2F2YXRhci1yZWdpb24tZm9sbG93ZXJdKVwiKVxuICAgICAgICBub2Rlcy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vICBzZWUgaWYgdGhlcmUgYXJlIG5ldyBjYW1lcmEtdG9vbHMgb3IgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSksIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuICAgIH0sXG4gIFxuICAgIC8vIG5ld1NjZW5lOiBmdW5jdGlvbihtb2RlbCkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudmlyb25tZW50IHNjZW5lIGxvYWRlZDogXCIsIG1vZGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LCAgXG4gICAgXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKHNpemUpIHtcbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBcbiAgICAgICAgLy8gIFwic2l6ZVwiIChhbiBpbnRlZ2VyIG51bWJlcilcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIHNldCB0aGUgaGlkZGVyIGNvbXBvbmVudCB0byBcbiAgICAgICAgLy8gdXNlIHRoYXQgc2l6ZSBpbiBtZXRlcnMgZm9yIHRoZSBxdWFkcmFudHNcbiAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5ub2RlTmFtZS5tYXRjaCgvXyhbMC05XSopJC8pXG5cbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDIsIGZpcnN0IG1hdGNoIGlzIHRoZSBkaXIsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgY29tcG9uZW50TmFtZSBuYW1lIG9yIG51bWJlclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLm5vZGVOYW1lKVxuICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBub2RlU2l6ZSA9IHBhcnNlSW50KHBhcmFtc1sxXSlcbiAgICAgICAgICAgIGlmICghbm9kZVNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbm9kZVNpemVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIEJpZGlyZWN0aW9uYWwgc2VlLXRocm91Z2ggcG9ydGFsLiBUd28gcG9ydGFscyBhcmUgcGFpcmVkIGJ5IGNvbG9yLlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBBZGQgdHdvIGluc3RhbmNlcyBvZiBgcG9ydGFsLmdsYmAgdG8gdGhlIFNwb2tlIHNjZW5lLlxuICogVGhlIG5hbWUgb2YgZWFjaCBpbnN0YW5jZSBzaG91bGQgbG9vayBsaWtlIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fY29sb3JcIlxuICogQW55IHZhbGlkIFRIUkVFLkNvbG9yIGFyZ3VtZW50IGlzIGEgdmFsaWQgY29sb3IgdmFsdWUuXG4gKiBTZWUgaGVyZSBmb3IgZXhhbXBsZSBjb2xvciBuYW1lcyBodHRwczovL3d3dy53M3NjaG9vbHMuY29tL2Nzc3JlZi9jc3NfY29sb3JzLmFzcFxuICpcbiAqIEZvciBleGFtcGxlLCB0byBtYWtlIGEgcGFpciBvZiBjb25uZWN0ZWQgYmx1ZSBwb3J0YWxzLFxuICogeW91IGNvdWxkIG5hbWUgdGhlbSBcInBvcnRhbC10b19fYmx1ZVwiIGFuZCBcInBvcnRhbC1mcm9tX19ibHVlXCJcbiAqL1xuXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcbmltcG9ydCB2ZXJ0ZXhTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwudmVydC5qcydcbmltcG9ydCBmcmFnbWVudFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC5mcmFnLmpzJ1xuaW1wb3J0IHNub2lzZSBmcm9tICcuLi9zaGFkZXJzL3Nub2lzZS5qcydcbmltcG9ydCB7IHNob3dSZWdpb25Gb3JPYmplY3QsIGhpZGVyUmVnaW9uRm9yT2JqZWN0IH0gZnJvbSAnLi9yZWdpb24taGlkZXIuanMnXG5cbmNvbnN0IHdvcmxkUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRDYW1lcmFQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZERpciA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkUXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKClcbmNvbnN0IG1hdDQgPSBuZXcgVEhSRUUuTWF0cml4NCgpXG5cbkFGUkFNRS5yZWdpc3RlclN5c3RlbSgncG9ydGFsJywge1xuICBkZXBlbmRlbmNpZXM6IFsnZmFkZXItcGx1cyddLFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyID0gdGhpcy5lbC5zeXN0ZW1zWydodWJzLXN5c3RlbXMnXS5jaGFyYWN0ZXJDb250cm9sbGVyXG4gICAgdGhpcy5mYWRlciA9IHRoaXMuZWwuc3lzdGVtc1snZmFkZXItcGx1cyddXG4gICAgdGhpcy5yb29tRGF0YSA9IG51bGxcbiAgICB0aGlzLndhaXRGb3JGZXRjaCA9IHRoaXMud2FpdEZvckZldGNoLmJpbmQodGhpcylcblxuICAgIC8vIGlmIHRoZSB1c2VyIGlzIGxvZ2dlZCBpbiwgd2Ugd2FudCB0byByZXRyaWV2ZSB0aGVpciB1c2VyRGF0YSBmcm9tIHRoZSB0b3AgbGV2ZWwgc2VydmVyXG4gICAgaWYgKHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMgJiYgd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbiAmJiAhd2luZG93LkFQUC51c2VyRGF0YSkge1xuICAgICAgICB0aGlzLmZldGNoUm9vbURhdGEoKVxuICAgIH1cbiAgfSxcbiAgZmV0Y2hSb29tRGF0YTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXJhbXMgPSB7dG9rZW46IHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMudG9rZW4sXG4gICAgICAgICAgICAgICAgICByb29tX2lkOiB3aW5kb3cuQVBQLmh1YkNoYW5uZWwuaHViSWR9XG5cbiAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgb3B0aW9ucy5oZWFkZXJzID0gbmV3IEhlYWRlcnMoKTtcbiAgICBvcHRpb25zLmhlYWRlcnMuc2V0KFwiQXV0aG9yaXphdGlvblwiLCBgQmVhcmVyICR7cGFyYW1zfWApO1xuICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuICAgIGF3YWl0IGZldGNoKFwiaHR0cHM6Ly9yZWFsaXR5bWVkaWEuZGlnaXRhbC91c2VyRGF0YVwiLCBvcHRpb25zKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4gICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdTdWNjZXNzOicsIGRhdGEpO1xuICAgICAgICAgIHRoaXMucm9vbURhdGEgPSBkYXRhO1xuICAgIH0pXG4gICAgdGhpcy5yb29tRGF0YS50ZXh0dXJlcyA9IFtdXG4gIH0sXG4gIGdldFJvb21VUkw6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgIHRoaXMud2FpdEZvckZldGNoKClcbiAgICAgIHJldHVybiB0aGlzLnJvb21EYXRhLnJvb21zLmxlbmd0aCA+IG51bWJlciA/IFwiaHR0cHM6Ly94ci5yZWFsaXR5bWVkaWEuZGlnaXRhbC9cIiArIHRoaXMucm9vbURhdGEucm9vbXNbbnVtYmVyXSA6IG51bGw7XG4gIH0sXG4gIGdldEN1YmVNYXA6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgIHRoaXMud2FpdEZvckZldGNoKClcbiAgICAgIHJldHVybiB0aGlzLnJvb21EYXRhLmN1YmVtYXBzLmxlbmd0aCA+IG51bWJlciA/IHRoaXMucm9vbURhdGEuY3ViZW1hcHNbbnVtYmVyXSA6IG51bGw7XG4gIH0sXG4gIHdhaXRGb3JGZXRjaDogZnVuY3Rpb24gKCkge1xuICAgICBpZiAodGhpcy5yb29tRGF0YSkgcmV0dXJuXG4gICAgIHNldFRpbWVvdXQodGhpcy53YWl0Rm9yRmV0Y2gsIDEwMCk7IC8vIHRyeSBhZ2FpbiBpbiAxMDAgbWlsbGlzZWNvbmRzXG4gIH0sXG4gIHRlbGVwb3J0VG86IGFzeW5jIGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gdHJ1ZVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZU91dCgpXG4gICAgLy8gU2NhbGUgc2NyZXdzIHVwIHRoZSB3YXlwb2ludCBsb2dpYywgc28ganVzdCBzZW5kIHBvc2l0aW9uIGFuZCBvcmllbnRhdGlvblxuICAgIG9iamVjdC5nZXRXb3JsZFF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG9iamVjdC5nZXRXb3JsZERpcmVjdGlvbih3b3JsZERpcilcbiAgICBvYmplY3QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICB3b3JsZFBvcy5hZGQod29ybGREaXIubXVsdGlwbHlTY2FsYXIoMS41KSkgLy8gVGVsZXBvcnQgaW4gZnJvbnQgb2YgdGhlIHBvcnRhbCB0byBhdm9pZCBpbmZpbml0ZSBsb29wXG4gICAgbWF0NC5tYWtlUm90YXRpb25Gcm9tUXVhdGVybmlvbih3b3JsZFF1YXQpXG4gICAgbWF0NC5zZXRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAvLyBVc2luZyB0aGUgY2hhcmFjdGVyQ29udHJvbGxlciBlbnN1cmVzIHdlIGRvbid0IHN0cmF5IGZyb20gdGhlIG5hdm1lc2hcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIudHJhdmVsQnlXYXlwb2ludChtYXQ0LCB0cnVlLCBmYWxzZSlcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVJbigpXG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gIH0sXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogbnVsbCB9LFxuICB9LFxuICBpbml0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5zeXN0ZW0gPSBBUFAuc2NlbmUuc3lzdGVtcy5wb3J0YWwgLy8gQS1GcmFtZSBpcyBzdXBwb3NlZCB0byBkbyB0aGlzIGJ5IGRlZmF1bHQgYnV0IGRvZXNuJ3Q/XG5cbiAgICAvLyBwYXJzZSB0aGUgbmFtZSB0byBnZXQgcG9ydGFsIHR5cGUsIHRhcmdldCwgYW5kIGNvbG9yXG4gICAgdGhpcy5wYXJzZU5vZGVOYW1lKClcblxuICAgIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgY3ViZU1hcDogeyB2YWx1ZTogbmV3IFRIUkVFLlRleHR1cmUoKSB9LFxuICAgICAgICB0aW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIHJhZGl1czogeyB2YWx1ZTogMCB9LFxuICAgICAgICByaW5nQ29sb3I6IHsgdmFsdWU6IHRoaXMuY29sb3IgfSxcbiAgICAgIH0sXG4gICAgICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICBmcmFnbWVudFNoYWRlcjogYFxuICAgICAgICAke3Nub2lzZX1cbiAgICAgICAgJHtmcmFnbWVudFNoYWRlcn1cbiAgICAgIGAsXG4gICAgfSlcblxuICAgIC8vIEFzc3VtZSB0aGF0IHRoZSBvYmplY3QgaGFzIGEgcGxhbmUgZ2VvbWV0cnlcbiAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5nZXRPckNyZWF0ZU9iamVjdDNEKCdtZXNoJylcbiAgICBtZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuXG4gICAgLy8gZ2V0IHRoZSBvdGhlciBiZWZvcmUgY29udGludWluZ1xuICAgIHRoaXMub3RoZXIgPSBhd2FpdCB0aGlzLmdldE90aGVyKClcblxuICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSkge1xuICAgICAgICB0aGlzLnN5c3RlbS5nZXRDdWJlTWFwKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKCB1cmxzID0+IHtcbiAgICAgICAgICAgIC8vY29uc3QgdXJscyA9IFtjdWJlTWFwUG9zWCwgY3ViZU1hcE5lZ1gsIGN1YmVNYXBQb3NZLCBjdWJlTWFwTmVnWSwgY3ViZU1hcFBvc1osIGN1YmVNYXBOZWdaXTtcbiAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgICAgICAgICBuZXcgVEhSRUUuQ3ViZVRleHR1cmVMb2FkZXIoKS5sb2FkKHVybHMsIHJlc29sdmUsIHVuZGVmaW5lZCwgcmVqZWN0KVxuICAgICAgICAgICAgKS50aGVuKHRleHR1cmUgPT4ge1xuICAgICAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRleHR1cmU7XG4gICAgICAgICAgICB9KS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZSkpICAgIFxuICAgICAgICB9KVxuICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHsgICAgXG4gICAgICAgIHRoaXMuY3ViZUNhbWVyYSA9IG5ldyBUSFJFRS5DdWJlQ2FtZXJhKDEsIDEwMDAwMCwgMTAyNClcbiAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnJvdGF0ZVkoTWF0aC5QSSkgLy8gRmFjZSBmb3J3YXJkc1xuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgIHRoaXMub3RoZXIuY29tcG9uZW50cy5wb3J0YWwubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgKCkgPT4ge1xuICAgICAgICAgICAgc2hvd1JlZ2lvbkZvck9iamVjdCh0aGlzLmVsKVxuICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnVwZGF0ZSh0aGlzLmVsLnNjZW5lRWwucmVuZGVyZXIsIHRoaXMuZWwuc2NlbmVFbC5vYmplY3QzRClcbiAgICAgICAgICAgIGhpZGVyUmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgIH0pXG4gICAgfVxuXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICBwcm9wZXJ0eTogJ2NvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZScsXG4gICAgICAgIGR1cjogNzAwLFxuICAgICAgICBlYXNpbmc6ICdlYXNlSW5PdXRDdWJpYycsXG4gICAgfSlcbiAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmJlZ2luJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHRydWUpKVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uY29tcGxldGVfX3BvcnRhbCcsICgpID0+ICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSAhdGhpcy5pc0Nsb3NlZCgpKSlcblxuICAgIC8vIGdvaW5nIHRvIHdhbnQgdG8gdHJ5IGFuZCBtYWtlIHRoZSBvYmplY3QgdGhpcyBwb3J0YWwgaXMgb24gY2xpY2thYmxlXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCd0YWdzJywge3NpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZX0pXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcbiAgICAvLyBvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBwb3J0YWwgbW92ZW1lbnQgXG4gICAgdGhpcy5mb2xsb3dQb3J0YWwgPSB0aGlzLmZvbGxvd1BvcnRhbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5lbC5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuZm9sbG93UG9ydGFsKVxuXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3Byb3hpbWl0eS1ldmVudHMnLCB7IHJhZGl1czogNSB9KVxuICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5ZW50ZXInLCAoKSA9PiB0aGlzLm9wZW4oKSlcbiAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5jbG9zZSgpKVxuICB9LFxuXG4gIGZvbGxvd1BvcnRhbDogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgIH1cbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnRpbWUudmFsdWUgPSB0aW1lIC8gMTAwMFxuICAgICAgICBcbiAgICBpZiAodGhpcy5vdGhlciAmJiAhdGhpcy5zeXN0ZW0udGVsZXBvcnRpbmcpIHtcbiAgICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYVBvcylcbiAgICAgIGNvbnN0IGRpc3QgPSB3b3JsZENhbWVyYVBvcy5kaXN0YW5jZVRvKHdvcmxkUG9zKVxuXG4gICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEgJiYgZGlzdCA8IDAuNSkge1xuICAgICAgICAvL2NvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgLy93aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIgJiYgZGlzdCA8IDEpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgZ2V0T3RoZXI6IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAwKSByZXNvbHZlKG51bGwpXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgID09IDEpIHtcbiAgICAgICAgICAgIC8vIHRoZSB0YXJnZXQgaXMgYW5vdGhlciByb29tLCByZXNvbHZlIHdpdGggdGhlIFVSTCB0byB0aGUgcm9vbVxuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Um9vbVVSTCh0aGlzLnBvcnRhbFRhcmdldCkudGhlbih1cmwgPT4geyByZXNvbHZlKHVybCkgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG5vdyBmaW5kIHRoZSBwb3J0YWwgd2l0aGluIHRoZSByb29tLiAgVGhlIHBvcnRhbHMgc2hvdWxkIGNvbWUgaW4gcGFpcnMgd2l0aCB0aGUgc2FtZSBwb3J0YWxUYXJnZXRcbiAgICAgICAgY29uc3QgcG9ydGFscyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW3BvcnRhbF1gKSlcbiAgICAgICAgY29uc3Qgb3RoZXIgPSBwb3J0YWxzLmZpbmQoKGVsKSA9PiBlbC5jb21wb25lbnRzLnBvcnRhbC5wb3J0YWxUeXBlID09IHRoaXMucG9ydGFsVHlwZSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFRhcmdldCA9PT0gdGhpcy5wb3J0YWxUYXJnZXQgJiYgZWwgIT09IHRoaXMuZWwpXG4gICAgICAgIGlmIChvdGhlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBDYXNlIDE6IFRoZSBvdGhlciBwb3J0YWwgYWxyZWFkeSBleGlzdHNcbiAgICAgICAgICAgIHJlc29sdmUob3RoZXIpXG4gICAgICAgICAgICBvdGhlci5lbWl0KCdwYWlyJywgeyBvdGhlcjogdGhpcy5lbCB9KSAvLyBMZXQgdGhlIG90aGVyIGtub3cgdGhhdCB3ZSdyZSByZWFkeVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2FzZSAyOiBXZSBjb3VsZG4ndCBmaW5kIHRoZSBvdGhlciBwb3J0YWwsIHdhaXQgZm9yIGl0IHRvIHNpZ25hbCB0aGF0IGl0J3MgcmVhZHlcbiAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncGFpcicsIChldmVudCkgPT4gcmVzb2x2ZShldmVudC5kZXRhaWwub3RoZXIpLCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggZWl0aGVyIFxuICAgIC8vIC0gXCJyb29tX25hbWVfY29sb3JcIlxuICAgIC8vIC0gXCJwb3J0YWxfTl9jb2xvclwiIFxuICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gTnVtYmVyZWQgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycy5cbiAgICBjb25zdCBwYXJhbXMgPSBub2RlTmFtZS5tYXRjaCgvKFtBLVphLXpdKilfKFtBLVphLXowLTldKilfKFtBLVphLXowLTldKikkLylcbiAgICBcbiAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgNCwgZmlyc3QgbWF0Y2ggaXMgdGhlIHBvcnRhbCB0eXBlLFxuICAgIC8vIHNlY29uZCBpcyB0aGUgbmFtZSBvciBudW1iZXIsIGFuZCBsYXN0IGlzIHRoZSBjb2xvclxuICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCA0KSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcInBvcnRhbCBub2RlIG5hbWUgbm90IGZvcm1lZCBjb3JyZWN0bHk6IFwiLCBub2RlTmFtZSlcbiAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgdGhpcy5jb2xvciA9IFwicmVkXCIgLy8gZGVmYXVsdCBzbyB0aGUgcG9ydGFsIGhhcyBhIGNvbG9yIHRvIHVzZVxuICAgICAgICByZXR1cm47XG4gICAgfSBcbiAgICBpZiAocGFyYW1zWzFdID09PSBcInJvb21cIikge1xuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAxO1xuICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBhcnNlSW50KHBhcmFtc1syXSlcbiAgICB9IGVsc2UgaWYgKHBhcmFtc1sxXSA9PT0gXCJwb3J0YWxcIikge1xuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAyO1xuICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBhcmFtc1syXVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDA7XG4gICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gbnVsbFxuICAgIH0gXG4gICAgdGhpcy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcihwYXJhbXNbM10pXG4gIH0sXG5cbiAgc2V0UmFkaXVzKHZhbCkge1xuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhbmltYXRpb25fX3BvcnRhbCcsIHtcbiAgICAgIGZyb206IHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlLFxuICAgICAgdG86IHZhbCxcbiAgICB9KVxuICB9LFxuICBvcGVuKCkge1xuICAgIHRoaXMuc2V0UmFkaXVzKDEpXG4gIH0sXG4gIGNsb3NlKCkge1xuICAgIHRoaXMuc2V0UmFkaXVzKDApXG4gIH0sXG4gIGlzQ2xvc2VkKCkge1xuICAgIHJldHVybiB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZSA9PT0gMFxuICB9LFxufSlcbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiAzNjAgaW1hZ2UgdGhhdCBmaWxscyB0aGUgdXNlcidzIHZpc2lvbiB3aGVuIGluIGEgY2xvc2UgcHJveGltaXR5LlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBHaXZlbiBhIDM2MCBpbWFnZSBhc3NldCB3aXRoIHRoZSBmb2xsb3dpbmcgVVJMIGluIFNwb2tlOlxuICogaHR0cHM6Ly9ndC1hZWwtYXEtYXNzZXRzLmFlbGF0Z3QtaW50ZXJuYWwubmV0L2ZpbGVzLzEyMzQ1YWJjLTY3ODlkZWYuanBnXG4gKlxuICogVGhlIG5hbWUgb2YgdGhlIGBpbW1lcnNpdmUtMzYwLmdsYmAgaW5zdGFuY2UgaW4gdGhlIHNjZW5lIHNob3VsZCBiZTpcbiAqIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fMTIzNDVhYmMtNjc4OWRlZl9qcGdcIiBPUiBcIjEyMzQ1YWJjLTY3ODlkZWZfanBnXCJcbiAqL1xuXG5jb25zdCB3b3JsZENhbWVyYSA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkU2VsZiA9IG5ldyBUSFJFRS5WZWN0b3IzKClcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywge1xuICBzY2hlbWE6IHtcbiAgICB1cmw6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IG51bGwgfSxcbiAgfSxcbiAgaW5pdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHVybCA9IHRoaXMuZGF0YS51cmwgPz8gdGhpcy5wYXJzZVNwb2tlTmFtZSgpXG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdXJsLm1hdGNoKC9eLipcXC4oLiopJC8pWzFdXG5cbiAgICAvLyBtZWRpYS1pbWFnZSB3aWxsIHNldCB1cCB0aGUgc3BoZXJlIGdlb21ldHJ5IGZvciB1c1xuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdtZWRpYS1pbWFnZScsIHtcbiAgICAgIHByb2plY3Rpb246ICczNjAtZXF1aXJlY3Rhbmd1bGFyJyxcbiAgICAgIGFscGhhTW9kZTogJ29wYXF1ZScsXG4gICAgICBzcmM6IHVybCxcbiAgICAgIHZlcnNpb246IDEsXG4gICAgICBiYXRjaDogZmFsc2UsXG4gICAgICBjb250ZW50VHlwZTogYGltYWdlLyR7ZXh0ZW5zaW9ufWAsXG4gICAgICBhbHBoYUN1dG9mZjogMCxcbiAgICB9KVxuICAgIC8vIGJ1dCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoaXMgdG8gaGFwcGVuXG4gICAgdGhpcy5tZXNoID0gYXdhaXQgdGhpcy5nZXRNZXNoKClcbiAgICB0aGlzLm1lc2guZ2VvbWV0cnkuc2NhbGUoMTAwLCAxMDAsIDEwMClcbiAgICB0aGlzLm1lc2gubWF0ZXJpYWwuc2V0VmFsdWVzKHtcbiAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgZGVwdGhUZXN0OiBmYWxzZSxcbiAgICB9KVxuICAgIHRoaXMubmVhciA9IDFcbiAgICB0aGlzLmZhciA9IDEuM1xuXG4gICAgLy8gUmVuZGVyIE9WRVIgdGhlIHNjZW5lIGJ1dCBVTkRFUiB0aGUgY3Vyc29yXG4gICAgdGhpcy5tZXNoLnJlbmRlck9yZGVyID0gQVBQLlJFTkRFUl9PUkRFUi5DVVJTT1IgLSAxXG4gIH0sXG4gIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5tZXNoKSB7XG4gICAgICAvLyBMaW5lYXJseSBtYXAgY2FtZXJhIGRpc3RhbmNlIHRvIG1hdGVyaWFsIG9wYWNpdHlcbiAgICAgIHRoaXMubWVzaC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkU2VsZilcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gd29ybGRTZWxmLmRpc3RhbmNlVG8od29ybGRDYW1lcmEpXG4gICAgICBjb25zdCBvcGFjaXR5ID0gMSAtIChkaXN0YW5jZSAtIHRoaXMubmVhcikgLyAodGhpcy5mYXIgLSB0aGlzLm5lYXIpXG4gICAgICB0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eSA9IG9wYWNpdHlcbiAgICB9XG4gIH0sXG4gIHBhcnNlU3Bva2VOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgLy8gQWNjZXB0ZWQgbmFtZXM6IFwibGFiZWxfX2ltYWdlLWhhc2hfZXh0XCIgT1IgXCJpbWFnZS1oYXNoX2V4dFwiXG4gICAgY29uc3Qgc3Bva2VOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICBjb25zdCBbLCBoYXNoLCBleHRlbnNpb25dID0gc3Bva2VOYW1lLm1hdGNoKC8oPzouKl9fKT8oLiopXyguKikvKVxuICAgIGNvbnN0IHVybCA9IGBodHRwczovL2d0LWFlbC1hcS1hc3NldHMuYWVsYXRndC1pbnRlcm5hbC5uZXQvZmlsZXMvJHtoYXNofS4ke2V4dGVuc2lvbn1gXG4gICAgcmV0dXJuIHVybFxuICB9LFxuICBnZXRNZXNoOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgICBpZiAobWVzaCkgcmVzb2x2ZShtZXNoKVxuICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAnaW1hZ2UtbG9hZGVkJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHJlc29sdmUodGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoKVxuICAgICAgICB9LFxuICAgICAgICB7IG9uY2U6IHRydWUgfVxuICAgICAgKVxuICAgIH0pXG4gIH0sXG59KVxuIiwiLy8gUGFyYWxsYXggT2NjbHVzaW9uIHNoYWRlcnMgZnJvbVxuLy8gICAgaHR0cDovL3N1bmFuZGJsYWNrY2F0LmNvbS90aXBGdWxsVmlldy5waHA/dG9waWNpZD0yOFxuLy8gTm8gdGFuZ2VudC1zcGFjZSB0cmFuc2Zvcm1zIGxvZ2ljIGJhc2VkIG9uXG4vLyAgIGh0dHA6Ly9tbWlra2Vsc2VuM2QuYmxvZ3Nwb3Quc2svMjAxMi8wMi9wYXJhbGxheHBvYy1tYXBwaW5nLWFuZC1uby10YW5nZW50Lmh0bWxcblxuLy8gSWRlbnRpdHkgZnVuY3Rpb24gZm9yIGdsc2wtbGl0ZXJhbCBoaWdobGlnaHRpbmcgaW4gVlMgQ29kZVxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgUGFyYWxsYXhTaGFkZXIgPSB7XG4gIC8vIE9yZGVyZWQgZnJvbSBmYXN0ZXN0IHRvIGJlc3QgcXVhbGl0eS5cbiAgbW9kZXM6IHtcbiAgICBub25lOiAnTk9fUEFSQUxMQVgnLFxuICAgIGJhc2ljOiAnVVNFX0JBU0lDX1BBUkFMTEFYJyxcbiAgICBzdGVlcDogJ1VTRV9TVEVFUF9QQVJBTExBWCcsXG4gICAgb2NjbHVzaW9uOiAnVVNFX09DTFVTSU9OX1BBUkFMTEFYJywgLy8gYS5rLmEuIFBPTVxuICAgIHJlbGllZjogJ1VTRV9SRUxJRUZfUEFSQUxMQVgnLFxuICB9LFxuXG4gIHVuaWZvcm1zOiB7XG4gICAgYnVtcE1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIG1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWF4TGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gIH0sXG5cbiAgdmVydGV4U2hhZGVyOiBnbHNsYFxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICB2VXYgPSB1djtcbiAgICAgIHZlYzQgbXZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoIHBvc2l0aW9uLCAxLjAgKTtcbiAgICAgIHZWaWV3UG9zaXRpb24gPSAtbXZQb3NpdGlvbi54eXo7XG4gICAgICB2Tm9ybWFsID0gbm9ybWFsaXplKCBub3JtYWxNYXRyaXggKiBub3JtYWwgKTtcbiAgICAgIFxuICAgICAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uTWF0cml4ICogbXZQb3NpdGlvbjtcbiAgICB9XG4gIGAsXG5cbiAgZnJhZ21lbnRTaGFkZXI6IGdsc2xgXG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgYnVtcE1hcDtcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBtYXA7XG5cbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4U2NhbGU7XG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheE1pbkxheWVycztcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWF4TGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgZmFkZTsgLy8gQ1VTVE9NXG5cbiAgICB2YXJ5aW5nIHZlYzIgdlV2O1xuICAgIHZhcnlpbmcgdmVjMyB2Vmlld1Bvc2l0aW9uO1xuICAgIHZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG4gICAgI2lmZGVmIFVTRV9CQVNJQ19QQVJBTExBWFxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIGZsb2F0IGluaXRpYWxIZWlnaHQgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgdlV2KS5yO1xuXG4gICAgICAvLyBObyBPZmZzZXQgTGltaXR0aW5nOiBtZXNzeSwgZmxvYXRpbmcgb3V0cHV0IGF0IGdyYXppbmcgYW5nbGVzLlxuICAgICAgLy9cInZlYzIgdGV4Q29vcmRPZmZzZXQgPSBwYXJhbGxheFNjYWxlICogVi54eSAvIFYueiAqIGluaXRpYWxIZWlnaHQ7XCIsXG5cbiAgICAgIC8vIE9mZnNldCBMaW1pdGluZ1xuICAgICAgdmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5ICogaW5pdGlhbEhlaWdodDtcbiAgICAgIHJldHVybiB2VXYgLSB0ZXhDb29yZE9mZnNldDtcbiAgICB9XG5cbiAgICAjZWxzZVxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIC8vIERldGVybWluZSBudW1iZXIgb2YgbGF5ZXJzIGZyb20gYW5nbGUgYmV0d2VlbiBWIGFuZCBOXG4gICAgICBmbG9hdCBudW1MYXllcnMgPSBtaXgocGFyYWxsYXhNYXhMYXllcnMsIHBhcmFsbGF4TWluTGF5ZXJzLCBhYnMoZG90KHZlYzMoMC4wLCAwLjAsIDEuMCksIFYpKSk7XG5cbiAgICAgIGZsb2F0IGxheWVySGVpZ2h0ID0gMS4wIC8gbnVtTGF5ZXJzO1xuICAgICAgZmxvYXQgY3VycmVudExheWVySGVpZ2h0ID0gMC4wO1xuICAgICAgLy8gU2hpZnQgb2YgdGV4dHVyZSBjb29yZGluYXRlcyBmb3IgZWFjaCBpdGVyYXRpb25cbiAgICAgIHZlYzIgZHRleCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56IC8gbnVtTGF5ZXJzO1xuXG4gICAgICB2ZWMyIGN1cnJlbnRUZXh0dXJlQ29vcmRzID0gdlV2O1xuXG4gICAgICBmbG9hdCBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcblxuICAgICAgLy8gd2hpbGUgKCBoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCApXG4gICAgICAvLyBJbmZpbml0ZSBsb29wcyBhcmUgbm90IHdlbGwgc3VwcG9ydGVkLiBEbyBhIFwibGFyZ2VcIiBmaW5pdGVcbiAgICAgIC8vIGxvb3AsIGJ1dCBub3QgdG9vIGxhcmdlLCBhcyBpdCBzbG93cyBkb3duIHNvbWUgY29tcGlsZXJzLlxuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAzMDsgaSArPSAxKSB7XG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA8PSBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gbGF5ZXJIZWlnaHQ7XG4gICAgICAgIC8vIFNoaWZ0IHRleHR1cmUgY29vcmRpbmF0ZXMgYWxvbmcgdmVjdG9yIFZcbiAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZHRleDtcbiAgICAgICAgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG4gICAgICB9XG5cbiAgICAgICNpZmRlZiBVU0VfU1RFRVBfUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIGN1cnJlbnRUZXh0dXJlQ29vcmRzO1xuXG4gICAgICAjZWxpZiBkZWZpbmVkKFVTRV9SRUxJRUZfUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgZGVsdGFUZXhDb29yZCA9IGR0ZXggLyAyLjA7XG4gICAgICBmbG9hdCBkZWx0YUhlaWdodCA9IGxheWVySGVpZ2h0IC8gMi4wO1xuXG4gICAgICAvLyBSZXR1cm4gdG8gdGhlIG1pZCBwb2ludCBvZiBwcmV2aW91cyBsYXllclxuICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgIGN1cnJlbnRMYXllckhlaWdodCAtPSBkZWx0YUhlaWdodDtcblxuICAgICAgLy8gQmluYXJ5IHNlYXJjaCB0byBpbmNyZWFzZSBwcmVjaXNpb24gb2YgU3RlZXAgUGFyYWxsYXggTWFwcGluZ1xuICAgICAgY29uc3QgaW50IG51bVNlYXJjaGVzID0gNTtcbiAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgbnVtU2VhcmNoZXM7IGkgKz0gMSkge1xuICAgICAgICBkZWx0YVRleENvb3JkIC89IDIuMDtcbiAgICAgICAgZGVsdGFIZWlnaHQgLz0gMi4wO1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgICAgLy8gU2hpZnQgYWxvbmcgb3IgYWdhaW5zdCB2ZWN0b3IgVlxuICAgICAgICBpZiAoaGVpZ2h0RnJvbVRleHR1cmUgPiBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICAvLyBCZWxvdyB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gYWJvdmUgdGhlIHN1cmZhY2VcblxuICAgICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzICs9IGRlbHRhVGV4Q29vcmQ7XG4gICAgICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX09DTFVTSU9OX1BBUkFMTEFYKVxuXG4gICAgICB2ZWMyIHByZXZUQ29vcmRzID0gY3VycmVudFRleHR1cmVDb29yZHMgKyBkdGV4O1xuXG4gICAgICAvLyBIZWlnaHRzIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgbmV4dEggPSBoZWlnaHRGcm9tVGV4dHVyZSAtIGN1cnJlbnRMYXllckhlaWdodDtcbiAgICAgIGZsb2F0IHByZXZIID0gdGV4dHVyZTJEKGJ1bXBNYXAsIHByZXZUQ29vcmRzKS5yIC0gY3VycmVudExheWVySGVpZ2h0ICsgbGF5ZXJIZWlnaHQ7XG5cbiAgICAgIC8vIFByb3BvcnRpb25zIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgd2VpZ2h0ID0gbmV4dEggLyAobmV4dEggLSBwcmV2SCk7XG5cbiAgICAgIC8vIEludGVycG9sYXRpb24gb2YgdGV4dHVyZSBjb29yZGluYXRlc1xuICAgICAgcmV0dXJuIHByZXZUQ29vcmRzICogd2VpZ2h0ICsgY3VycmVudFRleHR1cmVDb29yZHMgKiAoMS4wIC0gd2VpZ2h0KTtcblxuICAgICAgI2Vsc2UgLy8gTk9fUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIHZVdjtcblxuICAgICAgI2VuZGlmXG4gICAgfVxuICAgICNlbmRpZlxuXG4gICAgdmVjMiBwZXJ0dXJiVXYodmVjMyBzdXJmUG9zaXRpb24sIHZlYzMgc3VyZk5vcm1hbCwgdmVjMyB2aWV3UG9zaXRpb24pIHtcbiAgICAgIHZlYzIgdGV4RHggPSBkRmR4KHZVdik7XG4gICAgICB2ZWMyIHRleER5ID0gZEZkeSh2VXYpO1xuXG4gICAgICB2ZWMzIHZTaWdtYVggPSBkRmR4KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZTaWdtYVkgPSBkRmR5KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZSMSA9IGNyb3NzKHZTaWdtYVksIHN1cmZOb3JtYWwpO1xuICAgICAgdmVjMyB2UjIgPSBjcm9zcyhzdXJmTm9ybWFsLCB2U2lnbWFYKTtcbiAgICAgIGZsb2F0IGZEZXQgPSBkb3QodlNpZ21hWCwgdlIxKTtcblxuICAgICAgdmVjMiB2UHJvalZzY3IgPSAoMS4wIC8gZkRldCkgKiB2ZWMyKGRvdCh2UjEsIHZpZXdQb3NpdGlvbiksIGRvdCh2UjIsIHZpZXdQb3NpdGlvbikpO1xuICAgICAgdmVjMyB2UHJvalZ0ZXg7XG4gICAgICB2UHJvalZ0ZXgueHkgPSB0ZXhEeCAqIHZQcm9qVnNjci54ICsgdGV4RHkgKiB2UHJvalZzY3IueTtcbiAgICAgIHZQcm9qVnRleC56ID0gZG90KHN1cmZOb3JtYWwsIHZpZXdQb3NpdGlvbik7XG5cbiAgICAgIHJldHVybiBwYXJhbGxheE1hcCh2UHJvalZ0ZXgpO1xuICAgIH1cblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZlYzIgbWFwVXYgPSBwZXJ0dXJiVXYoLXZWaWV3UG9zaXRpb24sIG5vcm1hbGl6ZSh2Tm9ybWFsKSwgbm9ybWFsaXplKHZWaWV3UG9zaXRpb24pKTtcbiAgICAgIFxuICAgICAgLy8gQ1VTVE9NIFNUQVJUXG4gICAgICB2ZWM0IHRleGVsID0gdGV4dHVyZTJEKG1hcCwgbWFwVXYpO1xuICAgICAgdmVjMyBjb2xvciA9IG1peCh0ZXhlbC54eXosIHZlYzMoMCksIGZhZGUpO1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2xvciwgMS4wKTtcbiAgICAgIC8vIENVU1RPTSBFTkRcbiAgICB9XG5cbiAgYCxcbn1cblxuZXhwb3J0IHsgUGFyYWxsYXhTaGFkZXIgfVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIENyZWF0ZSB0aGUgaWxsdXNpb24gb2YgZGVwdGggaW4gYSBjb2xvciBpbWFnZSBmcm9tIGEgZGVwdGggbWFwXG4gKlxuICogVXNhZ2VcbiAqID09PT09XG4gKiBDcmVhdGUgYSBwbGFuZSBpbiBCbGVuZGVyIGFuZCBnaXZlIGl0IGEgbWF0ZXJpYWwgKGp1c3QgdGhlIGRlZmF1bHQgUHJpbmNpcGxlZCBCU0RGKS5cbiAqIEFzc2lnbiBjb2xvciBpbWFnZSB0byBcImNvbG9yXCIgY2hhbm5lbCBhbmQgZGVwdGggbWFwIHRvIFwiZW1pc3NpdmVcIiBjaGFubmVsLlxuICogWW91IG1heSB3YW50IHRvIHNldCBlbWlzc2l2ZSBzdHJlbmd0aCB0byB6ZXJvIHNvIHRoZSBwcmV2aWV3IGxvb2tzIGJldHRlci5cbiAqIEFkZCB0aGUgXCJwYXJhbGxheFwiIGNvbXBvbmVudCBmcm9tIHRoZSBIdWJzIGV4dGVuc2lvbiwgY29uZmlndXJlLCBhbmQgZXhwb3J0IGFzIC5nbGJcbiAqL1xuXG5pbXBvcnQgeyBQYXJhbGxheFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzJ1xuXG5jb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBmb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwYXJhbGxheCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgc3RyZW5ndGg6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuNSB9LFxuICAgIGN1dG9mZlRyYW5zaXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA4IH0sXG4gICAgY3V0b2ZmQW5nbGU6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA0IH0sXG4gIH0sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgY29uc3QgeyBtYXA6IGNvbG9yTWFwLCBlbWlzc2l2ZU1hcDogZGVwdGhNYXAgfSA9IG1lc2gubWF0ZXJpYWxcbiAgICBjb2xvck1hcC53cmFwUyA9IGNvbG9yTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZ1xuICAgIGRlcHRoTWFwLndyYXBTID0gZGVwdGhNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgY29uc3QgeyB2ZXJ0ZXhTaGFkZXIsIGZyYWdtZW50U2hhZGVyIH0gPSBQYXJhbGxheFNoYWRlclxuICAgIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgdmVydGV4U2hhZGVyLFxuICAgICAgZnJhZ21lbnRTaGFkZXIsXG4gICAgICBkZWZpbmVzOiB7IFVTRV9PQ0xVU0lPTl9QQVJBTExBWDogdHJ1ZSB9LFxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgbWFwOiB7IHZhbHVlOiBjb2xvck1hcCB9LFxuICAgICAgICBidW1wTWFwOiB7IHZhbHVlOiBkZXB0aE1hcCB9LFxuICAgICAgICBwYXJhbGxheFNjYWxlOiB7IHZhbHVlOiAtMSAqIHRoaXMuZGF0YS5zdHJlbmd0aCB9LFxuICAgICAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogMjAgfSxcbiAgICAgICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IDMwIH0sXG4gICAgICAgIGZhZGU6IHsgdmFsdWU6IDAgfSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICBtZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuICB9LFxuICB0aWNrKCkge1xuICAgIGlmICh0aGlzLmVsLnNjZW5lRWwuY2FtZXJhKSB7XG4gICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24odmVjKVxuICAgICAgdGhpcy5lbC5vYmplY3QzRC53b3JsZFRvTG9jYWwodmVjKVxuICAgICAgY29uc3QgYW5nbGUgPSB2ZWMuYW5nbGVUbyhmb3J3YXJkKVxuICAgICAgY29uc3QgZmFkZSA9IG1hcExpbmVhckNsYW1wZWQoXG4gICAgICAgIGFuZ2xlLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgLSB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgdGhpcy5kYXRhLmN1dG9mZkFuZ2xlICsgdGhpcy5kYXRhLmN1dG9mZlRyYW5zaXRpb24sXG4gICAgICAgIDAsIC8vIEluIHZpZXcgem9uZSwgbm8gZmFkZVxuICAgICAgICAxIC8vIE91dHNpZGUgdmlldyB6b25lLCBmdWxsIGZhZGVcbiAgICAgIClcbiAgICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuZmFkZS52YWx1ZSA9IGZhZGVcbiAgICB9XG4gIH0sXG59KVxuXG5mdW5jdGlvbiBjbGFtcCh2YWx1ZSwgbWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gYjEgKyAoKHggLSBhMSkgKiAoYjIgLSBiMSkpIC8gKGEyIC0gYTEpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhckNsYW1wZWQoeCwgYTEsIGEyLCBiMSwgYjIpIHtcbiAgcmV0dXJuIGNsYW1wKG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMiksIGIxLCBiMilcbn1cbiIsImxldCBEZWZhdWx0SG9va3MgPSB7XG4gICAgdmVydGV4SG9va3M6IHtcbiAgICAgICAgdW5pZm9ybXM6ICdpbnNlcnRiZWZvcmU6I2luY2x1ZGUgPGNvbW1vbj5cXG4nLFxuICAgICAgICBmdW5jdGlvbnM6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8Y2xpcHBpbmdfcGxhbmVzX3BhcnNfdmVydGV4PlxcbicsXG4gICAgICAgIHByZVRyYW5zZm9ybTogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcG9zdFRyYW5zZm9ybTogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxwcm9qZWN0X3ZlcnRleD5cXG4nLFxuICAgICAgICBwcmVOb3JtYWw6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8YmVnaW5ub3JtYWxfdmVydGV4PlxcbidcbiAgICB9LFxuICAgIGZyYWdtZW50SG9va3M6IHtcbiAgICAgICAgdW5pZm9ybXM6ICdpbnNlcnRiZWZvcmU6I2luY2x1ZGUgPGNvbW1vbj5cXG4nLFxuICAgICAgICBmdW5jdGlvbnM6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8Y2xpcHBpbmdfcGxhbmVzX3BhcnNfZnJhZ21lbnQ+XFxuJyxcbiAgICAgICAgcHJlRnJhZ0NvbG9yOiAnaW5zZXJ0YmVmb3JlOmdsX0ZyYWdDb2xvciA9IHZlYzQoIG91dGdvaW5nTGlnaHQsIGRpZmZ1c2VDb2xvci5hICk7XFxuJyxcbiAgICAgICAgcG9zdEZyYWdDb2xvcjogJ2luc2VydGFmdGVyOmdsX0ZyYWdDb2xvciA9IHZlYzQoIG91dGdvaW5nTGlnaHQsIGRpZmZ1c2VDb2xvci5hICk7XFxuJyxcbiAgICAgICAgcG9zdE1hcDogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxtYXBfZnJhZ21lbnQ+XFxuJyxcbiAgICAgICAgcmVwbGFjZU1hcDogJ3JlcGxhY2U6I2luY2x1ZGUgPG1hcF9mcmFnbWVudD5cXG4nXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBEZWZhdWx0SG9va3MiLCIvLyBiYXNlZCBvbiBodHRwczovL2dpdGh1Yi5jb20vamFtaWVvd2VuL3RocmVlLW1hdGVyaWFsLW1vZGlmaWVyXG5cbmltcG9ydCBkZWZhdWx0SG9va3MgZnJvbSAnLi9kZWZhdWx0SG9va3MnO1xuXG5pbnRlcmZhY2UgRXh0ZW5kZWRNYXRlcmlhbCB7XG4gICAgdW5pZm9ybXM6IFVuaWZvcm1zO1xuICAgIHZlcnRleFNoYWRlcjogc3RyaW5nO1xuICAgIGZyYWdtZW50U2hhZGVyOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTaGFkZXJFeHRlbnNpb25PcHRzIHtcbiAgICB1bmlmb3JtczogeyBbdW5pZm9ybTogc3RyaW5nXTogYW55IH07XG4gICAgdmVydGV4U2hhZGVyOiB7IFtwYXR0ZXJuOiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgICBmcmFnbWVudFNoYWRlcjogeyBbcGF0dGVybjogc3RyaW5nXTogc3RyaW5nIH07XG4gICAgY2xhc3NOYW1lPzogc3RyaW5nO1xuICAgIHBvc3RNb2RpZnlWZXJ0ZXhTaGFkZXI/OiAoc2hhZGVyOiBzdHJpbmcpID0+IHN0cmluZztcbiAgICBwb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXI/OiAoc2hhZGVyOiBzdHJpbmcpID0+IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNoYWRlckV4dGVuc2lvbiBleHRlbmRzIFNoYWRlckV4dGVuc2lvbk9wdHMge1xuICAgIGluaXQobWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCk6IHZvaWQ7XG4gICAgdXBkYXRlVW5pZm9ybXModGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKTogdm9pZFxufVxuXG5jb25zdCBtb2RpZnlTb3VyY2UgPSAoIHNvdXJjZTogc3RyaW5nLCBob29rRGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9LCBob29rczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICk9PntcbiAgICBsZXQgbWF0Y2g7XG4gICAgZm9yKCBsZXQga2V5IGluIGhvb2tEZWZzICl7XG4gICAgICAgIGlmKCBob29rc1trZXldICl7XG4gICAgICAgICAgICBtYXRjaCA9IC9pbnNlcnQoYmVmb3JlKTooLiopfGluc2VydChhZnRlcik6KC4qKXwocmVwbGFjZSk6KC4qKS8uZXhlYyggaG9va0RlZnNba2V5XSApO1xuXG4gICAgICAgICAgICBpZiggbWF0Y2ggKXtcbiAgICAgICAgICAgICAgICBpZiggbWF0Y2hbMV0gKXsgLy8gYmVmb3JlXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFsyXSwgaG9va3Nba2V5XSArICdcXG4nICsgbWF0Y2hbMl0gKTtcbiAgICAgICAgICAgICAgICB9ZWxzZVxuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFszXSApeyAvLyBhZnRlclxuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSggbWF0Y2hbNF0sIG1hdGNoWzRdICsgJ1xcbicgKyBob29rc1trZXldICk7XG4gICAgICAgICAgICAgICAgfWVsc2VcbiAgICAgICAgICAgICAgICBpZiggbWF0Y2hbNV0gKXsgLy8gcmVwbGFjZVxuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSggbWF0Y2hbNl0sIGhvb2tzW2tleV0gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gc291cmNlO1xufVxuXG50eXBlIFVuaWZvcm1zID0ge1xuICAgIFtrZXk6IHN0cmluZ106IGFueTtcbn1cblxuLy8gY29waWVkIGZyb20gdGhyZWUucmVuZGVyZXJzLnNoYWRlcnMuVW5pZm9ybVV0aWxzLmpzXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVVbmlmb3Jtcyggc3JjOiBVbmlmb3JtcyApOiBVbmlmb3JtcyB7XG5cdHZhciBkc3Q6IFVuaWZvcm1zID0ge307XG5cblx0Zm9yICggdmFyIHUgaW4gc3JjICkge1xuXHRcdGRzdFsgdSBdID0ge30gO1xuXHRcdGZvciAoIHZhciBwIGluIHNyY1sgdSBdICkge1xuXHRcdFx0dmFyIHByb3BlcnR5ID0gc3JjWyB1IF1bIHAgXTtcblx0XHRcdGlmICggcHJvcGVydHkgJiYgKCBwcm9wZXJ0eS5pc0NvbG9yIHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzTWF0cml4MyB8fCBwcm9wZXJ0eS5pc01hdHJpeDQgfHxcblx0XHRcdFx0cHJvcGVydHkuaXNWZWN0b3IyIHx8IHByb3BlcnR5LmlzVmVjdG9yMyB8fCBwcm9wZXJ0eS5pc1ZlY3RvcjQgfHxcblx0XHRcdFx0cHJvcGVydHkuaXNUZXh0dXJlICkgKSB7XG5cdFx0XHRcdCAgICBkc3RbIHUgXVsgcCBdID0gcHJvcGVydHkuY2xvbmUoKTtcblx0XHRcdH0gZWxzZSBpZiAoIEFycmF5LmlzQXJyYXkoIHByb3BlcnR5ICkgKSB7XG5cdFx0XHRcdGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eS5zbGljZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gZHN0O1xufVxuXG50eXBlIFN1cGVyQ2xhc3NUeXBlcyA9IHR5cGVvZiBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hEZXB0aE1hdGVyaWFsXG5cbnR5cGUgU3VwZXJDbGFzc2VzID0gVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwgfCBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCB8IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwgfCBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCB8IFRIUkVFLk1lc2hEZXB0aE1hdGVyaWFsXG5cbmludGVyZmFjZSBFeHRlbnNpb25EYXRhIHtcbiAgICBTaGFkZXJDbGFzczogU3VwZXJDbGFzc1R5cGVzO1xuICAgIFNoYWRlckxpYjogVEhSRUUuU2hhZGVyO1xuICAgIEtleTogc3RyaW5nLFxuICAgIENvdW50OiBudW1iZXIsXG4gICAgTW9kaWZpZWROYW1lKCk6IHN0cmluZyxcbiAgICBUeXBlQ2hlY2s6IHN0cmluZ1xufVxuXG5sZXQgY2xhc3NNYXA6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nO30gPSB7XG4gICAgTWVzaFN0YW5kYXJkTWF0ZXJpYWw6IFwic3RhbmRhcmRcIixcbiAgICBNZXNoQmFzaWNNYXRlcmlhbDogXCJiYXNpY1wiLFxuICAgIE1lc2hMYW1iZXJ0TWF0ZXJpYWw6IFwibGFtYmVydFwiLFxuICAgIE1lc2hQaG9uZ01hdGVyaWFsOiBcInBob25nXCIsXG4gICAgTWVzaERlcHRoTWF0ZXJpYWw6IFwiZGVwdGhcIixcbiAgICBzdGFuZGFyZDogXCJzdGFuZGFyZFwiLFxuICAgIGJhc2ljOiBcImJhc2ljXCIsXG4gICAgbGFtYmVydDogXCJsYW1iZXJ0XCIsXG4gICAgcGhvbmc6IFwicGhvbmdcIixcbiAgICBkZXB0aDogXCJkZXB0aFwiXG59XG5cbmxldCBzaGFkZXJNYXA6IHtbbmFtZTogc3RyaW5nXTogRXh0ZW5zaW9uRGF0YTt9XG5cbmNvbnN0IGdldFNoYWRlckRlZiA9ICggY2xhc3NPclN0cmluZzogU3VwZXJDbGFzc2VzIHwgc3RyaW5nICk9PntcblxuICAgIGlmKCAhc2hhZGVyTWFwICl7XG5cbiAgICAgICAgbGV0IGNsYXNzZXM6IHtbbmFtZTogc3RyaW5nXTogU3VwZXJDbGFzc1R5cGVzO30gPSB7XG4gICAgICAgICAgICBzdGFuZGFyZDogVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwsXG4gICAgICAgICAgICBiYXNpYzogVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwsXG4gICAgICAgICAgICBsYW1iZXJ0OiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsLFxuICAgICAgICAgICAgcGhvbmc6IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsLFxuICAgICAgICAgICAgZGVwdGg6IFRIUkVFLk1lc2hEZXB0aE1hdGVyaWFsXG4gICAgICAgIH1cblxuICAgICAgICBzaGFkZXJNYXAgPSB7fTtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gY2xhc3NlcyApe1xuICAgICAgICAgICAgc2hhZGVyTWFwWyBrZXkgXSA9IHtcbiAgICAgICAgICAgICAgICBTaGFkZXJDbGFzczogY2xhc3Nlc1sga2V5IF0sXG4gICAgICAgICAgICAgICAgU2hhZGVyTGliOiBUSFJFRS5TaGFkZXJMaWJbIGtleSBdLFxuICAgICAgICAgICAgICAgIEtleToga2V5LFxuICAgICAgICAgICAgICAgIENvdW50OiAwLFxuICAgICAgICAgICAgICAgIE1vZGlmaWVkTmFtZTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBNb2RpZmllZE1lc2gkeyB0aGlzLktleVswXS50b1VwcGVyQ2FzZSgpICsgdGhpcy5LZXkuc2xpY2UoMSkgfU1hdGVyaWFsXyR7ICsrdGhpcy5Db3VudCB9YDtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFR5cGVDaGVjazogYGlzTWVzaCR7IGtleVswXS50b1VwcGVyQ2FzZSgpICsga2V5LnNsaWNlKDEpIH1NYXRlcmlhbGBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxldCBzaGFkZXJEZWY6IEV4dGVuc2lvbkRhdGEgfCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoIHR5cGVvZiBjbGFzc09yU3RyaW5nID09PSAnZnVuY3Rpb24nICl7XG4gICAgICAgIGZvciggbGV0IGtleSBpbiBzaGFkZXJNYXAgKXtcbiAgICAgICAgICAgIGlmKCBzaGFkZXJNYXBbIGtleSBdLlNoYWRlckNsYXNzID09PSBjbGFzc09yU3RyaW5nICl7XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gc2hhZGVyTWFwWyBrZXkgXTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsYXNzT3JTdHJpbmcgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGxldCBtYXBwZWRDbGFzc09yU3RyaW5nID0gY2xhc3NNYXBbIGNsYXNzT3JTdHJpbmcgXVxuICAgICAgICBzaGFkZXJEZWYgPSBzaGFkZXJNYXBbIG1hcHBlZENsYXNzT3JTdHJpbmcgfHwgY2xhc3NPclN0cmluZyBdO1xuICAgIH1cblxuICAgIGlmKCAhc2hhZGVyRGVmICl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvciggJ05vIFNoYWRlciBmb3VuZCB0byBtb2RpZnkuLi4nICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlckRlZjtcbn1cblxuLyoqXG4gKiBUaGUgbWFpbiBNYXRlcmlhbCBNb2RvZmllclxuICovXG5jbGFzcyBNYXRlcmlhbE1vZGlmaWVyIHtcbiAgICBfdmVydGV4SG9va3M6IHtbdmVydGV4aG9vazogc3RyaW5nXTogc3RyaW5nfVxuICAgIF9mcmFnbWVudEhvb2tzOiB7W2ZyYWdlbWVudGhvb2s6IHN0cmluZ106IHN0cmluZ31cblxuICAgIGNvbnN0cnVjdG9yKCB2ZXJ0ZXhIb29rRGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9LCBmcmFnbWVudEhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKXtcblxuICAgICAgICB0aGlzLl92ZXJ0ZXhIb29rcyA9IHt9O1xuICAgICAgICB0aGlzLl9mcmFnbWVudEhvb2tzID0ge307XG5cbiAgICAgICAgaWYoIHZlcnRleEhvb2tEZWZzICl7XG4gICAgICAgICAgICB0aGlzLmRlZmluZVZlcnRleEhvb2tzKCB2ZXJ0ZXhIb29rRGVmcyApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIGZyYWdtZW50SG9va0RlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuZGVmaW5lRnJhZ21lbnRIb29rcyggZnJhZ21lbnRIb29rRGVmcyApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBtb2RpZnkoIHNoYWRlcjogU3VwZXJDbGFzc2VzIHwgc3RyaW5nLCBvcHRzOiBTaGFkZXJFeHRlbnNpb25PcHRzICk6IEV4dGVuZGVkTWF0ZXJpYWwge1xuXG4gICAgICAgIGxldCBkZWYgPSBnZXRTaGFkZXJEZWYoIHNoYWRlciApO1xuXG4gICAgICAgIGxldCB2ZXJ0ZXhTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIudmVydGV4U2hhZGVyLCB0aGlzLl92ZXJ0ZXhIb29rcywgb3B0cy52ZXJ0ZXhTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IGZyYWdtZW50U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLmZyYWdtZW50U2hhZGVyLCB0aGlzLl9mcmFnbWVudEhvb2tzLCBvcHRzLmZyYWdtZW50U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBkZWYuU2hhZGVyTGliLnVuaWZvcm1zLCBvcHRzLnVuaWZvcm1zIHx8IHt9ICk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmVydGV4U2hhZGVyLGZyYWdtZW50U2hhZGVyLHVuaWZvcm1zIH07XG5cbiAgICB9XG5cbiAgICBleHRlbmQoIHNoYWRlcjogU3VwZXJDbGFzc2VzIHwgc3RyaW5nLCBvcHRzOiBTaGFkZXJFeHRlbnNpb25PcHRzICk6IHsgbmV3KCk6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCB9IHtcblxuICAgICAgICBsZXQgZGVmID0gZ2V0U2hhZGVyRGVmKCBzaGFkZXIgKTsgLy8gQURKVVNUIFRISVMgU0hBREVSIERFRiAtIE9OTFkgREVGSU5FIE9OQ0UgLSBBTkQgU1RPUkUgQSBVU0UgQ09VTlQgT04gRVhURU5ERUQgVkVSU0lPTlMuXG5cbiAgICAgICAgbGV0IHZlcnRleFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi52ZXJ0ZXhTaGFkZXIsIHRoaXMuX3ZlcnRleEhvb2tzLCBvcHRzLnZlcnRleFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgZnJhZ21lbnRTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIuZnJhZ21lbnRTaGFkZXIsIHRoaXMuX2ZyYWdtZW50SG9va3MsIG9wdHMuZnJhZ21lbnRTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIGRlZi5TaGFkZXJMaWIudW5pZm9ybXMsIG9wdHMudW5pZm9ybXMgfHwge30gKTtcblxuICAgICAgICBsZXQgQ2xhc3NOYW1lID0gb3B0cy5jbGFzc05hbWUgfHwgZGVmLk1vZGlmaWVkTmFtZSgpO1xuXG4gICAgICAgIGxldCBleHRlbmRNYXRlcmlhbCA9IG5ldyBGdW5jdGlvbiggJ0Jhc2VDbGFzcycsICd1bmlmb3JtcycsICd2ZXJ0ZXhTaGFkZXInLCAnZnJhZ21lbnRTaGFkZXInLCAnY2xvbmVVbmlmb3JtcycsYFxuXG4gICAgICAgICAgICB2YXIgY2xzID0gZnVuY3Rpb24gJHtDbGFzc05hbWV9KCBwYXJhbXMgKXtcblxuICAgICAgICAgICAgICAgIEJhc2VDbGFzcy5jYWxsKCB0aGlzLCBwYXJhbXMgKTtcblxuICAgICAgICAgICAgICAgIHRoaXMudW5pZm9ybXMgPSBjbG9uZVVuaWZvcm1zKCB1bmlmb3JtcyApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5mcmFnbWVudFNoYWRlciA9IGZyYWdtZW50U2hhZGVyO1xuICAgICAgICAgICAgICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRWYWx1ZXMoIHBhcmFtcyApO1xuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNscy5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKCBCYXNlQ2xhc3MucHJvdG90eXBlICk7XG4gICAgICAgICAgICBjbHMucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY2xzO1xuICAgICAgICAgICAgY2xzLnByb3RvdHlwZS4keyBkZWYuVHlwZUNoZWNrIH0gPSB0cnVlO1xuXG4gICAgICAgICAgICBjbHMucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiggc291cmNlICl7XG5cbiAgICAgICAgICAgICAgICBCYXNlQ2xhc3MucHJvdG90eXBlLmNvcHkuY2FsbCggdGhpcywgc291cmNlICk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIHNvdXJjZS51bmlmb3JtcyApO1xuICAgICAgICAgICAgICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBjbHM7XG5cbiAgICAgICAgYCk7XG5cbiAgICAgICAgaWYoIG9wdHMucG9zdE1vZGlmeVZlcnRleFNoYWRlciApe1xuICAgICAgICAgICAgdmVydGV4U2hhZGVyID0gb3B0cy5wb3N0TW9kaWZ5VmVydGV4U2hhZGVyKCB2ZXJ0ZXhTaGFkZXIgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiggb3B0cy5wb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXIgKXtcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyID0gb3B0cy5wb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXIoIGZyYWdtZW50U2hhZGVyICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXh0ZW5kTWF0ZXJpYWwoIGRlZi5TaGFkZXJDbGFzcywgdW5pZm9ybXMsIHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIsIGNsb25lVW5pZm9ybXMgKTtcblxuICAgIH1cblxuICAgIGRlZmluZVZlcnRleEhvb2tzKCBkZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKXtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gZGVmcyApe1xuICAgICAgICAgICAgdGhpcy5fdmVydGV4SG9va3NbIGtleSBdID0gZGVmc1trZXldO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBkZWZpbmVGcmFnbWVudEhvb2tzKCBkZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZyB9ICkge1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBkZWZzICl7XG4gICAgICAgICAgICB0aGlzLl9mcmFnbWVudEhvb2tzWyBrZXkgXSA9IGRlZnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG59XG5cbmxldCBkZWZhdWx0TWF0ZXJpYWxNb2RpZmllciA9IG5ldyBNYXRlcmlhbE1vZGlmaWVyKCBkZWZhdWx0SG9va3MudmVydGV4SG9va3MsIGRlZmF1bHRIb29rcy5mcmFnbWVudEhvb2tzICk7XG5cbmV4cG9ydCB7IEV4dGVuZGVkTWF0ZXJpYWwsIE1hdGVyaWFsTW9kaWZpZXIsIFNoYWRlckV4dGVuc2lvbiwgU2hhZGVyRXh0ZW5zaW9uT3B0cywgZGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgIGFzIERlZmF1bHRNYXRlcmlhbE1vZGlmaWVyfSIsImV4cG9ydCBkZWZhdWx0IC8qIGdsc2wgKi9gXG4gICAgICAgIC8vIGFib3ZlIGhlcmUsIHRoZSB0ZXh0dXJlIGxvb2t1cCB3aWxsIGJlIGRvbmUsIHdoaWNoIHdlXG4gICAgICAgIC8vIGNhbiBkaXNhYmxlIGJ5IHJlbW92aW5nIHRoZSBtYXAgZnJvbSB0aGUgbWF0ZXJpYWxcbiAgICAgICAgLy8gYnV0IGlmIHdlIGxlYXZlIGl0LCB3ZSBjYW4gYWxzbyBjaG9vc2UgdGhlIGJsZW5kIHRoZSB0ZXh0dXJlXG4gICAgICAgIC8vIHdpdGggb3VyIHNoYWRlciBjcmVhdGVkIGNvbG9yLCBvciB1c2UgaXQgaW4gdGhlIHNoYWRlciBvclxuICAgICAgICAvLyB3aGF0ZXZlclxuICAgICAgICAvL1xuICAgICAgICAvLyB2ZWM0IHRleGVsQ29sb3IgPSB0ZXh0dXJlMkQoIG1hcCwgdlV2ICk7XG4gICAgICAgIC8vIHRleGVsQ29sb3IgPSBtYXBUZXhlbFRvTGluZWFyKCB0ZXhlbENvbG9yICk7XG4gICAgICAgIFxuICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuICAgICAgICBcbiAgICAgICAgdmVjNCBzaGFkZXJDb2xvcjtcbiAgICAgICAgbWFpbkltYWdlKHNoYWRlckNvbG9yLCB1di54eSAqIGlSZXNvbHV0aW9uLnh5KTtcbiAgICAgICAgc2hhZGVyQ29sb3IgPSBtYXBUZXhlbFRvTGluZWFyKCBzaGFkZXJDb2xvciApO1xuXG4gICAgICAgIGRpZmZ1c2VDb2xvciAqPSBzaGFkZXJDb2xvcjtcbmA7XG4iLCJleHBvcnQgZGVmYXVsdCB7XG4gICAgaVRpbWU6IHsgdmFsdWU6IDAuMCB9LFxuICAgIGlSZXNvbHV0aW9uOiAgeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjMoNTEyLCA1MTIsIDEpIH0sXG4gICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0sXG4gICAgdGV4RmxpcFk6IHsgdmFsdWU6IDAgfVxufTsiLCJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxudW5pZm9ybSB2ZWMzIGlSZXNvbHV0aW9uO1xudW5pZm9ybSBmbG9hdCBpVGltZTtcbnVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG51bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xudW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuICBgO1xuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvYTQ0OGUzNGI4MTM2ZmFlNS5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IGJheWVySW1hZ2UgZnJvbSAnLi4vYXNzZXRzL2JheWVyLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBiYXllclRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKGJheWVySW1hZ2UsIChiYXllcikgPT4ge1xuICAgIGJheWVyLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmF5ZXIubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYXllci53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJheWVyLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmF5ZXJUZXggPSBiYXllclxufSlcblxubGV0IEJsZWVweUJsb2Nrc1NoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICB1bmlmb3JtczogdW5pZm9ybXMsXG5cbiAgdmVydGV4U2hhZGVyOiB7fSxcblxuICBmcmFnbWVudFNoYWRlcjogeyBcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAvLyBCeSBEYWVkZWx1czogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS91c2VyL0RhZWRlbHVzXG4gICAgICAvLyBsaWNlbnNlOiBDcmVhdGl2ZSBDb21tb25zIEF0dHJpYnV0aW9uLU5vbkNvbW1lcmNpYWwtU2hhcmVBbGlrZSAzLjAgVW5wb3J0ZWQgTGljZW5zZS5cbiAgICAgICNkZWZpbmUgVElNRVNDQUxFIDAuMjUgXG4gICAgICAjZGVmaW5lIFRJTEVTIDhcbiAgICAgICNkZWZpbmUgQ09MT1IgMC43LCAxLjYsIDIuOFxuXG4gICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICB7XG4gICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgdXYueCAqPSBpUmVzb2x1dGlvbi54IC8gaVJlc29sdXRpb24ueTtcbiAgICAgICAgXG4gICAgICAgIHZlYzQgbm9pc2UgPSB0ZXh0dXJlMkQoaUNoYW5uZWwwLCBmbG9vcih1diAqIGZsb2F0KFRJTEVTKSkgLyBmbG9hdChUSUxFUykpO1xuICAgICAgICBmbG9hdCBwID0gMS4wIC0gbW9kKG5vaXNlLnIgKyBub2lzZS5nICsgbm9pc2UuYiArIGlUaW1lICogZmxvYXQoVElNRVNDQUxFKSwgMS4wKTtcbiAgICAgICAgcCA9IG1pbihtYXgocCAqIDMuMCAtIDEuOCwgMC4xKSwgMi4wKTtcbiAgICAgICAgXG4gICAgICAgIHZlYzIgciA9IG1vZCh1diAqIGZsb2F0KFRJTEVTKSwgMS4wKTtcbiAgICAgICAgciA9IHZlYzIocG93KHIueCAtIDAuNSwgMi4wKSwgcG93KHIueSAtIDAuNSwgMi4wKSk7XG4gICAgICAgIHAgKj0gMS4wIC0gcG93KG1pbigxLjAsIDEyLjAgKiBkb3QociwgcikpLCAyLjApO1xuICAgICAgICBcbiAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChDT0xPUiwgMS4wKSAqIHA7XG4gICAgICB9XG4gICAgICBgLFxuICAgICAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBiYXllclRleFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBiYXllclRleFxuICAgIH1cblxufVxuZXhwb3J0IHsgQmxlZXB5QmxvY2tzU2hhZGVyIH1cbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5sZXQgTm9pc2VTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiksXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgICNkZWZpbmUgblBJIDMuMTQxNTkyNjUzNTg5NzkzMlxuXG4gICAgICAgIG1hdDIgbl9yb3RhdGUyZChmbG9hdCBhbmdsZSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1hdDIoY29zKGFuZ2xlKSwtc2luKGFuZ2xlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW4oYW5nbGUpLCBjb3MoYW5nbGUpKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbl9zdHJpcGUoZmxvYXQgbnVtYmVyKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbW9kID0gbW9kKG51bWJlciwgMi4wKTtcbiAgICAgICAgICAgICAgICAvL3JldHVybiBzdGVwKDAuNSwgbW9kKSpzdGVwKDEuNSwgbW9kKTtcbiAgICAgICAgICAgICAgICAvL3JldHVybiBtb2QtMS4wO1xuICAgICAgICAgICAgICAgIHJldHVybiBtaW4oMS4wLCAoc21vb3Roc3RlcCgwLjAsIDAuNSwgbW9kKSAtIHNtb290aHN0ZXAoMC41LCAxLjAsIG1vZCkpKjEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkICkge1xuICAgICAgICAgICAgICAgIHZlYzIgdV9yZXNvbHV0aW9uID0gaVJlc29sdXRpb24ueHk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdV90aW1lID0gaVRpbWU7XG4gICAgICAgICAgICAgICAgdmVjMyBjb2xvcjtcbiAgICAgICAgICAgICAgICB2ZWMyIHN0ID0gZnJhZ0Nvb3JkLnh5O1xuICAgICAgICAgICAgICAgIHN0ICs9IDIwMDAuMCArIDk5ODAwMC4wKnN0ZXAoMS43NSwgMS4wLXNpbih1X3RpbWUvOC4wKSk7XG4gICAgICAgICAgICAgICAgc3QgKz0gdV90aW1lLzIwMDAuMDtcbiAgICAgICAgICAgICAgICBmbG9hdCBtID0gKDEuMCs5LjAqc3RlcCgxLjAsIDEuMC1zaW4odV90aW1lLzguMCkpKS8oMS4wKzkuMCpzdGVwKDEuMCwgMS4wLXNpbih1X3RpbWUvMTYuMCkpKTtcbiAgICAgICAgICAgICAgICB2ZWMyIHN0MSA9IHN0ICogKDQwMC4wICsgMTIwMC4wKnN0ZXAoMS43NSwgMS4wK3Npbih1X3RpbWUpKSAtIDMwMC4wKnN0ZXAoMS41LCAxLjArc2luKHVfdGltZS8zLjApKSk7XG4gICAgICAgICAgICAgICAgc3QgPSBuX3JvdGF0ZTJkKHNpbihzdDEueCkqc2luKHN0MS55KS8obSoxMDAuMCt1X3RpbWUvMTAwLjApKSAqIHN0O1xuICAgICAgICAgICAgICAgIHZlYzIgc3QyID0gc3QgKiAoMTAwLjAgKyAxOTAwLjAqc3RlcCgxLjc1LCAxLjAtc2luKHVfdGltZS8yLjApKSk7XG4gICAgICAgICAgICAgICAgc3QgPSBuX3JvdGF0ZTJkKGNvcyhzdDIueCkqY29zKHN0Mi55KS8obSoxMDAuMCt1X3RpbWUvMTAwLjApKSAqIHN0O1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZCgwLjUqblBJKyhuUEkqMC41KnN0ZXAoIDEuMCwxLjArIHNpbih1X3RpbWUvMS4wKSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICArKG5QSSowLjEqc3RlcCggMS4wLDEuMCsgY29zKHVfdGltZS8yLjApKSkrdV90aW1lKjAuMDAwMSkgKiBzdDtcbiAgICAgICAgICAgICAgICBzdCAqPSAxMC4wO1xuICAgICAgICAgICAgICAgIHN0IC89IHVfcmVzb2x1dGlvbjtcbiAgICAgICAgICAgICAgICBjb2xvciA9IHZlYzMobl9zdHJpcGUoc3QueCp1X3Jlc29sdXRpb24ueC8xMC4wK3VfdGltZS8xMC4wKSk7XG4gICAgICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChjb2xvciwgMS4wKTtcbiAgICAgICAgfVxuICAgICAgICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxXG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IE5vaXNlU2hhZGVyIH1cbiIsIi8vIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L1hkc0JEQlxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5sZXQgTGlxdWlkTWFyYmxlU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgLy8vLyBDT0xPUlMgLy8vL1xuXG4gICAgICBjb25zdCB2ZWMzIE9SQU5HRSA9IHZlYzMoMS4wLCAwLjYsIDAuMik7XG4gICAgICBjb25zdCB2ZWMzIFBJTksgICA9IHZlYzMoMC43LCAwLjEsIDAuNCk7IFxuICAgICAgY29uc3QgdmVjMyBCTFVFICAgPSB2ZWMzKDAuMCwgMC4yLCAwLjkpOyBcbiAgICAgIGNvbnN0IHZlYzMgQkxBQ0sgID0gdmVjMygwLjAsIDAuMCwgMC4yKTtcbiAgICAgIFxuICAgICAgLy8vLy8gTk9JU0UgLy8vLy9cbiAgICAgIFxuICAgICAgZmxvYXQgaGFzaCggZmxvYXQgbiApIHtcbiAgICAgICAgICAvL3JldHVybiBmcmFjdChzaW4obikqNDM3NTguNTQ1MzEyMyk7ICAgXG4gICAgICAgICAgcmV0dXJuIGZyYWN0KHNpbihuKSo3NTcyOC41NDUzMTIzKTsgXG4gICAgICB9XG4gICAgICBcbiAgICAgIFxuICAgICAgZmxvYXQgbm9pc2UoIGluIHZlYzIgeCApIHtcbiAgICAgICAgICB2ZWMyIHAgPSBmbG9vcih4KTtcbiAgICAgICAgICB2ZWMyIGYgPSBmcmFjdCh4KTtcbiAgICAgICAgICBmID0gZipmKigzLjAtMi4wKmYpO1xuICAgICAgICAgIGZsb2F0IG4gPSBwLnggKyBwLnkqNTcuMDtcbiAgICAgICAgICByZXR1cm4gbWl4KG1peCggaGFzaChuICsgMC4wKSwgaGFzaChuICsgMS4wKSwgZi54KSwgbWl4KGhhc2gobiArIDU3LjApLCBoYXNoKG4gKyA1OC4wKSwgZi54KSwgZi55KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8vLy8vIEZCTSAvLy8vLy8gXG4gICAgICBcbiAgICAgIG1hdDIgbSA9IG1hdDIoIDAuNiwgMC42LCAtMC42LCAwLjgpO1xuICAgICAgZmxvYXQgZmJtKHZlYzIgcCl7XG4gICAgICAgXG4gICAgICAgICAgZmxvYXQgZiA9IDAuMDtcbiAgICAgICAgICBmICs9IDAuNTAwMCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAyO1xuICAgICAgICAgIGYgKz0gMC4yNTAwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDM7XG4gICAgICAgICAgZiArPSAwLjEyNTAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMTtcbiAgICAgICAgICBmICs9IDAuMDYyNSAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjA0O1xuICAgICAgICAgIGYgLz0gMC45Mzc1O1xuICAgICAgICAgIHJldHVybiBmO1xuICAgICAgfVxuICAgICAgXG4gICAgICBcbiAgICAgIHZvaWQgbWFpbkltYWdlKG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQpe1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIHBpeGVsIHJhdGlvXG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5IDsgIFxuICAgICAgICAgIHZlYzIgcCA9IC0gMS4gKyAyLiAqIHV2O1xuICAgICAgICAgIHAueCAqPSBpUmVzb2x1dGlvbi54IC8gaVJlc29sdXRpb24ueTtcbiAgICAgICAgICAgXG4gICAgICAgICAgLy8gZG9tYWluc1xuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IHIgPSBzcXJ0KGRvdChwLHApKTsgXG4gICAgICAgICAgZmxvYXQgYSA9IGNvcyhwLnkgKiBwLngpOyAgXG4gICAgICAgICAgICAgICAgIFxuICAgICAgICAgIC8vIGRpc3RvcnRpb25cbiAgICAgICAgICBcbiAgICAgICAgICBmbG9hdCBmID0gZmJtKCA1LjAgKiBwKTtcbiAgICAgICAgICBhICs9IGZibSh2ZWMyKDEuOSAtIHAueCwgMC45ICogaVRpbWUgKyBwLnkpKTtcbiAgICAgICAgICBhICs9IGZibSgwLjQgKiBwKTtcbiAgICAgICAgICByICs9IGZibSgyLjkgKiBwKTtcbiAgICAgICAgICAgICBcbiAgICAgICAgICAvLyBjb2xvcml6ZVxuICAgICAgICAgIFxuICAgICAgICAgIHZlYzMgY29sID0gQkxVRTtcbiAgICAgICAgICBcbiAgICAgICAgICBmbG9hdCBmZiA9IDEuMCAtIHNtb290aHN0ZXAoLTAuNCwgMS4xLCBub2lzZSh2ZWMyKDAuNSAqIGEsIDMuMyAqIGEpKSApOyAgICAgICAgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBPUkFOR0UsIGZmKTtcbiAgICAgICAgICAgICBcbiAgICAgICAgICBmZiA9IDEuMCAtIHNtb290aHN0ZXAoLjAsIDIuOCwgciApO1xuICAgICAgICAgIGNvbCArPSAgbWl4KCBjb2wsIEJMQUNLLCAgZmYpO1xuICAgICAgICAgIFxuICAgICAgICAgIGZmIC09IDEuMCAtIHNtb290aHN0ZXAoMC4zLCAwLjUsIGZibSh2ZWMyKDEuMCwgNDAuMCAqIGEpKSApOyBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIFBJTkssICBmZik7ICBcbiAgICAgICAgICAgIFxuICAgICAgICAgIGZmID0gMS4wIC0gc21vb3Roc3RlcCgyLiwgMi45LCBhICogMS41ICk7IFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgQkxBQ0ssICBmZik7ICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KGNvbCwgMS4pO1xuICAgICAgfVxuICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMihtYXQubWFwLm9mZnNldC54KyBNYXRoLnJhbmRvbSgpLCBtYXQubWFwLm9mZnNldC54KyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgIH1cbn1cblxuZXhwb3J0IHsgTGlxdWlkTWFyYmxlU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2NlY2VmYjUwZTQwOGQxMDUucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zbEdXTlxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcblxubGV0IEdhbGF4eVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vQ0JTXG4gICAgICAgIC8vUGFyYWxsYXggc2Nyb2xsaW5nIGZyYWN0YWwgZ2FsYXh5LlxuICAgICAgICAvL0luc3BpcmVkIGJ5IEpvc2hQJ3MgU2ltcGxpY2l0eSBzaGFkZXI6IGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9sc2xHV3JcbiAgICAgICAgXG4gICAgICAgIC8vIGh0dHA6Ly93d3cuZnJhY3RhbGZvcnVtcy5jb20vbmV3LXRoZW9yaWVzLWFuZC1yZXNlYXJjaC92ZXJ5LXNpbXBsZS1mb3JtdWxhLWZvci1mcmFjdGFsLXBhdHRlcm5zL1xuICAgICAgICBmbG9hdCBmaWVsZChpbiB2ZWMzIHAsZmxvYXQgcykge1xuICAgICAgICAgICAgZmxvYXQgc3RyZW5ndGggPSA3LiArIC4wMyAqIGxvZygxLmUtNiArIGZyYWN0KHNpbihpVGltZSkgKiA0MzczLjExKSk7XG4gICAgICAgICAgICBmbG9hdCBhY2N1bSA9IHMvNC47XG4gICAgICAgICAgICBmbG9hdCBwcmV2ID0gMC47XG4gICAgICAgICAgICBmbG9hdCB0dyA9IDAuO1xuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAyNjsgKytpKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbWFnID0gZG90KHAsIHApO1xuICAgICAgICAgICAgICAgIHAgPSBhYnMocCkgLyBtYWcgKyB2ZWMzKC0uNSwgLS40LCAtMS41KTtcbiAgICAgICAgICAgICAgICBmbG9hdCB3ID0gZXhwKC1mbG9hdChpKSAvIDcuKTtcbiAgICAgICAgICAgICAgICBhY2N1bSArPSB3ICogZXhwKC1zdHJlbmd0aCAqIHBvdyhhYnMobWFnIC0gcHJldiksIDIuMikpO1xuICAgICAgICAgICAgICAgIHR3ICs9IHc7XG4gICAgICAgICAgICAgICAgcHJldiA9IG1hZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXgoMC4sIDUuICogYWNjdW0gLyB0dyAtIC43KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gTGVzcyBpdGVyYXRpb25zIGZvciBzZWNvbmQgbGF5ZXJcbiAgICAgICAgZmxvYXQgZmllbGQyKGluIHZlYzMgcCwgZmxvYXQgcykge1xuICAgICAgICAgICAgZmxvYXQgc3RyZW5ndGggPSA3LiArIC4wMyAqIGxvZygxLmUtNiArIGZyYWN0KHNpbihpVGltZSkgKiA0MzczLjExKSk7XG4gICAgICAgICAgICBmbG9hdCBhY2N1bSA9IHMvNC47XG4gICAgICAgICAgICBmbG9hdCBwcmV2ID0gMC47XG4gICAgICAgICAgICBmbG9hdCB0dyA9IDAuO1xuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAxODsgKytpKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbWFnID0gZG90KHAsIHApO1xuICAgICAgICAgICAgICAgIHAgPSBhYnMocCkgLyBtYWcgKyB2ZWMzKC0uNSwgLS40LCAtMS41KTtcbiAgICAgICAgICAgICAgICBmbG9hdCB3ID0gZXhwKC1mbG9hdChpKSAvIDcuKTtcbiAgICAgICAgICAgICAgICBhY2N1bSArPSB3ICogZXhwKC1zdHJlbmd0aCAqIHBvdyhhYnMobWFnIC0gcHJldiksIDIuMikpO1xuICAgICAgICAgICAgICAgIHR3ICs9IHc7XG4gICAgICAgICAgICAgICAgcHJldiA9IG1hZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXgoMC4sIDUuICogYWNjdW0gLyB0dyAtIC43KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBucmFuZDMoIHZlYzIgY28gKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGEgPSBmcmFjdCggY29zKCBjby54KjguM2UtMyArIGNvLnkgKSp2ZWMzKDEuM2U1LCA0LjdlNSwgMi45ZTUpICk7XG4gICAgICAgICAgICB2ZWMzIGIgPSBmcmFjdCggc2luKCBjby54KjAuM2UtMyArIGNvLnkgKSp2ZWMzKDguMWU1LCAxLjBlNSwgMC4xZTUpICk7XG4gICAgICAgICAgICB2ZWMzIGMgPSBtaXgoYSwgYiwgMC41KTtcbiAgICAgICAgICAgIHJldHVybiBjO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKSB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gMi4gKiBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eSAtIDEuO1xuICAgICAgICAgICAgdmVjMiB1dnMgPSB1diAqIGlSZXNvbHV0aW9uLnh5IC8gbWF4KGlSZXNvbHV0aW9uLngsIGlSZXNvbHV0aW9uLnkpO1xuICAgICAgICAgICAgdmVjMyBwID0gdmVjMyh1dnMgLyA0LiwgMCkgKyB2ZWMzKDEuLCAtMS4zLCAwLik7XG4gICAgICAgICAgICBwICs9IC4yICogdmVjMyhzaW4oaVRpbWUgLyAxNi4pLCBzaW4oaVRpbWUgLyAxMi4pLCAgc2luKGlUaW1lIC8gMTI4LikpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBmcmVxc1s0XTtcbiAgICAgICAgICAgIC8vU291bmRcbiAgICAgICAgICAgIGZyZXFzWzBdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjAxLCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbMV0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMDcsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1syXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4xNSwgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzNdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjMwLCAwLjI1ICkgKS54O1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHQgPSBmaWVsZChwLGZyZXFzWzJdKTtcbiAgICAgICAgICAgIGZsb2F0IHYgPSAoMS4gLSBleHAoKGFicyh1di54KSAtIDEuKSAqIDYuKSkgKiAoMS4gLSBleHAoKGFicyh1di55KSAtIDEuKSAqIDYuKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vU2Vjb25kIExheWVyXG4gICAgICAgICAgICB2ZWMzIHAyID0gdmVjMyh1dnMgLyAoNC4rc2luKGlUaW1lKjAuMTEpKjAuMiswLjIrc2luKGlUaW1lKjAuMTUpKjAuMyswLjQpLCAxLjUpICsgdmVjMygyLiwgLTEuMywgLTEuKTtcbiAgICAgICAgICAgIHAyICs9IDAuMjUgKiB2ZWMzKHNpbihpVGltZSAvIDE2LiksIHNpbihpVGltZSAvIDEyLiksICBzaW4oaVRpbWUgLyAxMjguKSk7XG4gICAgICAgICAgICBmbG9hdCB0MiA9IGZpZWxkMihwMixmcmVxc1szXSk7XG4gICAgICAgICAgICB2ZWM0IGMyID0gbWl4KC40LCAxLiwgdikgKiB2ZWM0KDEuMyAqIHQyICogdDIgKiB0MiAsMS44ICAqIHQyICogdDIgLCB0MiogZnJlcXNbMF0sIHQyKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL0xldCdzIGFkZCBzb21lIHN0YXJzXG4gICAgICAgICAgICAvL1RoYW5rcyB0byBodHRwOi8vZ2xzbC5oZXJva3UuY29tL2UjNjkwNC4wXG4gICAgICAgICAgICB2ZWMyIHNlZWQgPSBwLnh5ICogMi4wO1x0XG4gICAgICAgICAgICBzZWVkID0gZmxvb3Ioc2VlZCAqIGlSZXNvbHV0aW9uLngpO1xuICAgICAgICAgICAgdmVjMyBybmQgPSBucmFuZDMoIHNlZWQgKTtcbiAgICAgICAgICAgIHZlYzQgc3RhcmNvbG9yID0gdmVjNChwb3cocm5kLnksNDAuMCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1NlY29uZCBMYXllclxuICAgICAgICAgICAgdmVjMiBzZWVkMiA9IHAyLnh5ICogMi4wO1xuICAgICAgICAgICAgc2VlZDIgPSBmbG9vcihzZWVkMiAqIGlSZXNvbHV0aW9uLngpO1xuICAgICAgICAgICAgdmVjMyBybmQyID0gbnJhbmQzKCBzZWVkMiApO1xuICAgICAgICAgICAgc3RhcmNvbG9yICs9IHZlYzQocG93KHJuZDIueSw0MC4wKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZyYWdDb2xvciA9IG1peChmcmVxc1szXS0uMywgMS4sIHYpICogdmVjNCgxLjUqZnJlcXNbMl0gKiB0ICogdCogdCAsIDEuMipmcmVxc1sxXSAqIHQgKiB0LCBmcmVxc1szXSp0LCAxLjApK2MyK3N0YXJjb2xvcjtcbiAgICAgICAgfVxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgIH1cbn1cblxuZXhwb3J0IHsgR2FsYXh5U2hhZGVyIH1cbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvNHNHU3pjXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvc21hbGwtbm9pc2UucG5nJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG59KVxuXG5sZXQgTGFjZVR1bm5lbFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIENyZWF0ZWQgYnkgU3RlcGhhbmUgQ3VpbGxlcmRpZXIgLSBBaWVraWNrLzIwMTUgKHR3aXR0ZXI6QGFpZWtpY2spXG4gICAgICAgIC8vIExpY2Vuc2UgQ3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbi1Ob25Db21tZXJjaWFsLVNoYXJlQWxpa2UgMy4wIFVucG9ydGVkIExpY2Vuc2UuXG4gICAgICAgIC8vIFR1bmVkIHZpYSBYU2hhZGUgKGh0dHA6Ly93d3cuZnVucGFyYWRpZ20uY29tL3hzaGFkZS8pXG4gICAgICAgIFxuICAgICAgICB2ZWMyIGx0X21vID0gdmVjMigwKTtcbiAgICAgICAgXG4gICAgICAgIGZsb2F0IGx0X3BuKCBpbiB2ZWMzIHggKSAvLyBpcSBub2lzZVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIHAgPSBmbG9vcih4KTtcbiAgICAgICAgICAgIHZlYzMgZiA9IGZyYWN0KHgpO1xuICAgICAgICAgICAgZiA9IGYqZiooMy4wLTIuMCpmKTtcbiAgICAgICAgICAgIHZlYzIgdXYgPSAocC54eSt2ZWMyKDM3LjAsMTcuMCkqcC56KSArIGYueHk7XG4gICAgICAgICAgICB2ZWMyIHJnID0gdGV4dHVyZShpQ2hhbm5lbDAsICh1disgMC41KS8yNTYuMCwgLTEwMC4wICkueXg7XG4gICAgICAgICAgICByZXR1cm4gLTEuMCsyLjQqbWl4KCByZy54LCByZy55LCBmLnogKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMiBsdF9wYXRoKGZsb2F0IHQpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJldHVybiB2ZWMyKGNvcyh0KjAuMiksIHNpbih0KjAuMikpICogMi47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXggPSBtYXQzKDEsMCwwLDAsNywwLDAsMCw3KTtcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teSA9IG1hdDMoNywwLDAsMCwxLDAsMCwwLDcpO1xuICAgICAgICBjb25zdCBtYXQzIGx0X216ID0gbWF0Myg3LDAsMCwwLDcsMCwwLDAsMSk7XG4gICAgICAgIFxuICAgICAgICAvLyBiYXNlIG9uIHNoYW5lIHRlY2ggaW4gc2hhZGVyIDogT25lIFR3ZWV0IENlbGx1bGFyIFBhdHRlcm5cbiAgICAgICAgZmxvYXQgbHRfZnVuYyh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAgPSBmcmFjdChwLzY4LjYpIC0gLjU7XG4gICAgICAgICAgICByZXR1cm4gbWluKG1pbihhYnMocC54KSwgYWJzKHAueSkpLCBhYnMocC56KSkgKyAwLjE7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfZWZmZWN0KHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgcCAqPSBsdF9teiAqIGx0X214ICogbHRfbXkgKiBzaW4ocC56eHkpOyAvLyBzaW4ocC56eHkpIGlzIGJhc2VkIG9uIGlxIHRlY2ggZnJvbSBzaGFkZXIgKFNjdWxwdHVyZSBJSUkpXG4gICAgICAgICAgICByZXR1cm4gdmVjMyhtaW4obWluKGx0X2Z1bmMocCpsdF9teCksIGx0X2Z1bmMocCpsdF9teSkpLCBsdF9mdW5jKHAqbHRfbXopKS8uNik7XG4gICAgICAgIH1cbiAgICAgICAgLy9cbiAgICAgICAgXG4gICAgICAgIHZlYzQgbHRfZGlzcGxhY2VtZW50KHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBjb2wgPSAxLi1sdF9lZmZlY3QocCowLjgpO1xuICAgICAgICAgICAgICAgY29sID0gY2xhbXAoY29sLCAtLjUsIDEuKTtcbiAgICAgICAgICAgIGZsb2F0IGRpc3QgPSBkb3QoY29sLHZlYzMoMC4wMjMpKTtcbiAgICAgICAgICAgIGNvbCA9IHN0ZXAoY29sLCB2ZWMzKDAuODIpKTsvLyBibGFjayBsaW5lIG9uIHNoYXBlXG4gICAgICAgICAgICByZXR1cm4gdmVjNChkaXN0LGNvbCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzQgbHRfbWFwKHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgcC54eSAtPSBsdF9wYXRoKHAueik7XG4gICAgICAgICAgICB2ZWM0IGRpc3AgPSBsdF9kaXNwbGFjZW1lbnQoc2luKHAuenh5KjIuKSowLjgpO1xuICAgICAgICAgICAgcCArPSBzaW4ocC56eHkqLjUpKjEuNTtcbiAgICAgICAgICAgIGZsb2F0IGwgPSBsZW5ndGgocC54eSkgLSA0LjtcbiAgICAgICAgICAgIHJldHVybiB2ZWM0KG1heCgtbCArIDAuMDksIGwpIC0gZGlzcC54LCBkaXNwLnl6dyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfbm9yKCBpbiB2ZWMzIHBvcywgZmxvYXQgcHJlYyApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgZXBzID0gdmVjMyggcHJlYywgMC4sIDAuICk7XG4gICAgICAgICAgICB2ZWMzIGx0X25vciA9IHZlYzMoXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueHl5KS54IC0gbHRfbWFwKHBvcy1lcHMueHl5KS54LFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnl4eSkueCAtIGx0X21hcChwb3MtZXBzLnl4eSkueCxcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy55eXgpLnggLSBsdF9tYXAocG9zLWVwcy55eXgpLnggKTtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemUobHRfbm9yKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZlYzQgbHRfbGlnaHQodmVjMyBybywgdmVjMyByZCwgZmxvYXQgZCwgdmVjMyBsaWdodHBvcywgdmVjMyBsYylcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBwID0gcm8gKyByZCAqIGQ7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIG9yaWdpbmFsIG5vcm1hbGVcbiAgICAgICAgICAgIHZlYzMgbiA9IGx0X25vcihwLCAwLjEpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGxpZ2h0ZGlyID0gbGlnaHRwb3MgLSBwO1xuICAgICAgICAgICAgZmxvYXQgbGlnaHRsZW4gPSBsZW5ndGgobGlnaHRwb3MgLSBwKTtcbiAgICAgICAgICAgIGxpZ2h0ZGlyIC89IGxpZ2h0bGVuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBhbWIgPSAwLjY7XG4gICAgICAgICAgICBmbG9hdCBkaWZmID0gY2xhbXAoIGRvdCggbiwgbGlnaHRkaXIgKSwgMC4wLCAxLjAgKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgYnJkZiA9IHZlYzMoMCk7XG4gICAgICAgICAgICBicmRmICs9IGFtYiAqIHZlYzMoMC4yLDAuNSwwLjMpOyAvLyBjb2xvciBtYXRcbiAgICAgICAgICAgIGJyZGYgKz0gZGlmZiAqIDAuNjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJkZiA9IG1peChicmRmLCBsdF9tYXAocCkueXp3LCAwLjUpOy8vIG1lcmdlIGxpZ2h0IGFuZCBibGFjayBsaW5lIHBhdHRlcm5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB2ZWM0KGJyZGYsIGxpZ2h0bGVuKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBsdF9zdGFycyh2ZWMyIHV2LCB2ZWMzIHJkLCBmbG9hdCBkLCB2ZWMyIHMsIHZlYzIgZylcbiAgICAgICAge1xuICAgICAgICAgICAgdXYgKj0gODAwLiAqIHMueC9zLnk7XG4gICAgICAgICAgICBmbG9hdCBrID0gZnJhY3QoIGNvcyh1di55ICogMC4wMDAxICsgdXYueCkgKiA5MDAwMC4pO1xuICAgICAgICAgICAgZmxvYXQgdmFyID0gc2luKGx0X3BuKGQqMC42K3JkKjE4Mi4xNCkpKjAuNSswLjU7Ly8gdGhhbmsgdG8ga2xlbXMgZm9yIHRoZSB2YXJpYXRpb24gaW4gbXkgc2hhZGVyIHN1Ymx1bWluaWNcbiAgICAgICAgICAgIHZlYzMgY29sID0gdmVjMyhtaXgoMC4sIDEuLCB2YXIqcG93KGssIDIwMC4pKSk7Ly8gY29tZSBmcm9tIENCUyBTaGFkZXIgXCJTaW1wbGljaXR5XCIgOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNsR1dOXG4gICAgICAgICAgICByZXR1cm4gY29sO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLy8vLy8vL01BSU4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiBzID0gaVJlc29sdXRpb24ueHk7XG4gICAgICAgICAgICB2ZWMyIGcgPSBmcmFnQ29vcmQ7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0aW1lID0gaVRpbWUqMS4wO1xuICAgICAgICAgICAgZmxvYXQgY2FtX2EgPSB0aW1lOyAvLyBhbmdsZSB6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGNhbV9lID0gMy4yOyAvLyBlbGV2YXRpb25cbiAgICAgICAgICAgIGZsb2F0IGNhbV9kID0gNC47IC8vIGRpc3RhbmNlIHRvIG9yaWdpbiBheGlzXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IG1heGQgPSA0MC47IC8vIHJheSBtYXJjaGluZyBkaXN0YW5jZSBtYXhcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMiB1diA9IChnKjIuLXMpL3MueTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBjb2wgPSB2ZWMzKDAuKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIHJvID0gdmVjMyhsdF9wYXRoKHRpbWUpK2x0X21vLHRpbWUpO1xuICAgICAgICAgICAgICB2ZWMzIGN2ID0gdmVjMyhsdF9wYXRoKHRpbWUrMC4xKStsdF9tbyx0aW1lKzAuMSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY3U9dmVjMygwLDEsMCk7XG4gICAgICAgICAgICAgIHZlYzMgcm92ID0gbm9ybWFsaXplKGN2LXJvKTtcbiAgICAgICAgICAgIHZlYzMgdSA9IG5vcm1hbGl6ZShjcm9zcyhjdSxyb3YpKTtcbiAgICAgICAgICAgICAgdmVjMyB2ID0gY3Jvc3Mocm92LHUpO1xuICAgICAgICAgICAgICB2ZWMzIHJkID0gbm9ybWFsaXplKHJvdiArIHV2LngqdSArIHV2Lnkqdik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY3VydmUwID0gdmVjMygwKTtcbiAgICAgICAgICAgIHZlYzMgY3VydmUxID0gdmVjMygwKTtcbiAgICAgICAgICAgIHZlYzMgY3VydmUyID0gdmVjMygwKTtcbiAgICAgICAgICAgIGZsb2F0IG91dFN0ZXAgPSAwLjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYW8gPSAwLjsgLy8gYW8gbG93IGNvc3QgOilcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgc3QgPSAwLjtcbiAgICAgICAgICAgIGZsb2F0IGQgPSAwLjtcbiAgICAgICAgICAgIGZvcihpbnQgaT0wO2k8MjUwO2krKylcbiAgICAgICAgICAgIHsgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoc3Q8MC4wMjUqbG9nKGQqZC9zdC8xZTUpfHxkPm1heGQpIGJyZWFrOy8vIHNwZWNpYWwgYnJlYWsgY29uZGl0aW9uIGZvciBsb3cgdGhpY2tuZXNzIG9iamVjdFxuICAgICAgICAgICAgICAgIHN0ID0gbHRfbWFwKHJvK3JkKmQpLng7XG4gICAgICAgICAgICAgICAgZCArPSBzdCAqIDAuNjsgLy8gdGhlIDAuNiBpcyBzZWxlY3RlZCBhY2NvcmRpbmcgdG8gdGhlIDFlNSBhbmQgdGhlIDAuMDI1IG9mIHRoZSBicmVhayBjb25kaXRpb24gZm9yIGdvb2QgcmVzdWx0XG4gICAgICAgICAgICAgICAgYW8rKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGQgPCBtYXhkKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZlYzQgbGkgPSBsdF9saWdodChybywgcmQsIGQsIHJvLCB2ZWMzKDApKTsvLyBwb2ludCBsaWdodCBvbiB0aGUgY2FtXG4gICAgICAgICAgICAgICAgY29sID0gbGkueHl6LyhsaS53KjAuMik7Ly8gY2hlYXAgbGlnaHQgYXR0ZW51YXRpb25cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICBjb2wgPSBtaXgodmVjMygxLi1hby8xMDAuKSwgY29sLCAwLjUpOy8vIGxvdyBjb3N0IGFvIDopXG4gICAgICAgICAgICAgICAgZnJhZ0NvbG9yLnJnYiA9IG1peCggY29sLCB2ZWMzKDApLCAxLjAtZXhwKCAtMC4wMDMqZCpkICkgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgPSBsdF9zdGFycyh1diwgcmQsIGQsIHMsIGZyYWdDb29yZCk7Ly8gc3RhcnMgYmdcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdmlnbmV0dGVcbiAgICAgICAgICAgIHZlYzIgcSA9IGZyYWdDb29yZC9zO1xuICAgICAgICAgICAgZnJhZ0NvbG9yLnJnYiAqPSAwLjUgKyAwLjUqcG93KCAxNi4wKnEueCpxLnkqKDEuMC1xLngpKigxLjAtcS55KSwgMC4yNSApOyAvLyBpcSB2aWduZXR0ZVxuICAgICAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IExhY2VUdW5uZWxTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvZjI3ZTAxMDQ2MDVmMGNkNy5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTWRmR1JYXG5cbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvbm9pc2UtMjU2LnBuZydcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIGlDaGFubmVsUmVzb2x1dGlvbjogeyB2YWx1ZTogWyBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSldIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxuICAgIGNvbnNvbGUubG9nKCBcIm5vaXNlIHRleHR1cmUgc2l6ZTogXCIsIG5vaXNlLmltYWdlLndpZHRoLG5vaXNlLmltYWdlLmhlaWdodCApO1xufSlcblxubGV0IEZpcmVUdW5uZWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgIHVuaWZvcm0gdmVjMyBpQ2hhbm5lbFJlc29sdXRpb25bNF07XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gQ3JlYXRlZCBieSBpbmlnbyBxdWlsZXogLSBpcS8yMDEzXG4vLyBJIHNoYXJlIHRoaXMgcGllY2UgKGFydCBhbmQgY29kZSkgaGVyZSBpbiBTaGFkZXJ0b3kgYW5kIHRocm91Z2ggaXRzIFB1YmxpYyBBUEksIG9ubHkgZm9yIGVkdWNhdGlvbmFsIHB1cnBvc2VzLiBcbi8vIFlvdSBjYW5ub3QgdXNlLCBzZWxsLCBzaGFyZSBvciBob3N0IHRoaXMgcGllY2Ugb3IgbW9kaWZpY2F0aW9ucyBvZiBpdCBhcyBwYXJ0IG9mIHlvdXIgb3duIGNvbW1lcmNpYWwgb3Igbm9uLWNvbW1lcmNpYWwgcHJvZHVjdCwgd2Vic2l0ZSBvciBwcm9qZWN0LlxuLy8gWW91IGNhbiBzaGFyZSBhIGxpbmsgdG8gaXQgb3IgYW4gdW5tb2RpZmllZCBzY3JlZW5zaG90IG9mIGl0IHByb3ZpZGVkIHlvdSBhdHRyaWJ1dGUgXCJieSBJbmlnbyBRdWlsZXosIEBpcXVpbGV6bGVzIGFuZCBpcXVpbGV6bGVzLm9yZ1wiLiBcbi8vIElmIHlvdSBhcmUgYSB0ZWNoZXIsIGxlY3R1cmVyLCBlZHVjYXRvciBvciBzaW1pbGFyIGFuZCB0aGVzZSBjb25kaXRpb25zIGFyZSB0b28gcmVzdHJpY3RpdmUgZm9yIHlvdXIgbmVlZHMsIHBsZWFzZSBjb250YWN0IG1lIGFuZCB3ZSdsbCB3b3JrIGl0IG91dC5cblxuZmxvYXQgZmlyZV9ub2lzZSggaW4gdmVjMyB4IClcbntcbiAgICB2ZWMzIHAgPSBmbG9vcih4KTtcbiAgICB2ZWMzIGYgPSBmcmFjdCh4KTtcblx0ZiA9IGYqZiooMy4wLTIuMCpmKTtcblx0XG5cdHZlYzIgdXYgPSAocC54eSt2ZWMyKDM3LjAsMTcuMCkqcC56KSArIGYueHk7XG5cdHZlYzIgcmcgPSB0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsICh1disgMC41KS8yNTYuMCwgMC4wICkueXg7XG5cdHJldHVybiBtaXgoIHJnLngsIHJnLnksIGYueiApO1xufVxuXG52ZWM0IGZpcmVfbWFwKCB2ZWMzIHAgKVxue1xuXHRmbG9hdCBkZW4gPSAwLjIgLSBwLnk7XG5cbiAgICAvLyBpbnZlcnQgc3BhY2VcdFxuXHRwID0gLTcuMCpwL2RvdChwLHApO1xuXG4gICAgLy8gdHdpc3Qgc3BhY2VcdFxuXHRmbG9hdCBjbyA9IGNvcyhkZW4gLSAwLjI1KmlUaW1lKTtcblx0ZmxvYXQgc2kgPSBzaW4oZGVuIC0gMC4yNSppVGltZSk7XG5cdHAueHogPSBtYXQyKGNvLC1zaSxzaSxjbykqcC54ejtcblxuICAgIC8vIHNtb2tlXHRcblx0ZmxvYXQgZjtcblx0dmVjMyBxID0gcCAgICAgICAgICAgICAgICAgICAgICAgICAgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTs7XG4gICAgZiAgPSAwLjUwMDAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMiAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4yNTAwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDMgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMTI1MDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAxIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjA2MjUwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMiAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4wMzEyNSpmaXJlX25vaXNlKCBxICk7XG5cblx0ZGVuID0gY2xhbXAoIGRlbiArIDQuMCpmLCAwLjAsIDEuMCApO1xuXHRcblx0dmVjMyBjb2wgPSBtaXgoIHZlYzMoMS4wLDAuOSwwLjgpLCB2ZWMzKDAuNCwwLjE1LDAuMSksIGRlbiApICsgMC4wNSpzaW4ocCk7XG5cdFxuXHRyZXR1cm4gdmVjNCggY29sLCBkZW4gKTtcbn1cblxudmVjMyByYXltYXJjaCggaW4gdmVjMyBybywgaW4gdmVjMyByZCwgaW4gdmVjMiBwaXhlbCApXG57XG5cdHZlYzQgc3VtID0gdmVjNCggMC4wICk7XG5cblx0ZmxvYXQgdCA9IDAuMDtcblxuICAgIC8vIGRpdGhlcmluZ1x0XG5cdHQgKz0gMC4wNSp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIHBpeGVsLnh5L2lDaGFubmVsUmVzb2x1dGlvblswXS54LCAwLjAgKS54O1xuXHRcblx0Zm9yKCBpbnQgaT0wOyBpPDEwMDsgaSsrIClcblx0e1xuXHRcdGlmKCBzdW0uYSA+IDAuOTkgKSBicmVhaztcblx0XHRcblx0XHR2ZWMzIHBvcyA9IHJvICsgdCpyZDtcblx0XHR2ZWM0IGNvbCA9IGZpcmVfbWFwKCBwb3MgKTtcblx0XHRcblx0XHRjb2wueHl6ICo9IG1peCggMy4xKnZlYzMoMS4wLDAuNSwwLjA1KSwgdmVjMygwLjQ4LDAuNTMsMC41KSwgY2xhbXAoIChwb3MueS0wLjIpLzIuMCwgMC4wLCAxLjAgKSApO1xuXHRcdFxuXHRcdGNvbC5hICo9IDAuNjtcblx0XHRjb2wucmdiICo9IGNvbC5hO1xuXG5cdFx0c3VtID0gc3VtICsgY29sKigxLjAgLSBzdW0uYSk7XHRcblxuXHRcdHQgKz0gMC4wNTtcblx0fVxuXG5cdHJldHVybiBjbGFtcCggc3VtLnh5eiwgMC4wLCAxLjAgKTtcbn1cblxudm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxue1xuXHR2ZWMyIHEgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICB2ZWMyIHAgPSAtMS4wICsgMi4wKnE7XG4gICAgcC54ICo9IGlSZXNvbHV0aW9uLngvIGlSZXNvbHV0aW9uLnk7XG5cdFxuICAgIHZlYzIgbW8gPSB2ZWMyKDAuNSwwLjUpOyAvL2lNb3VzZS54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgIC8vaWYoIGlNb3VzZS53PD0wLjAwMDAxICkgbW89dmVjMigwLjApO1xuXHRcbiAgICAvLyBjYW1lcmFcbiAgICB2ZWMzIHJvID0gNC4wKm5vcm1hbGl6ZSh2ZWMzKGNvcygzLjAqbW8ueCksIDEuNCAtIDEuMCoobW8ueS0uMSksIHNpbigzLjAqbW8ueCkpKTtcblx0dmVjMyB0YSA9IHZlYzMoMC4wLCAxLjAsIDAuMCk7XG5cdGZsb2F0IGNyID0gMC41KmNvcygwLjcqaVRpbWUpO1xuXHRcbiAgICAvLyBzaGFrZVx0XHRcblx0cm8gKz0gMC4xKigtMS4wKzIuMCp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIGlUaW1lKnZlYzIoMC4wMTAsMC4wMTQpLCAwLjAgKS54eXopO1xuXHR0YSArPSAwLjEqKC0xLjArMi4wKnRleHR1cmVMb2QoIGlDaGFubmVsMCwgaVRpbWUqdmVjMigwLjAxMywwLjAwOCksIDAuMCApLnh5eik7XG5cdFxuXHQvLyBidWlsZCByYXlcbiAgICB2ZWMzIHd3ID0gbm9ybWFsaXplKCB0YSAtIHJvKTtcbiAgICB2ZWMzIHV1ID0gbm9ybWFsaXplKGNyb3NzKCB2ZWMzKHNpbihjciksY29zKGNyKSwwLjApLCB3dyApKTtcbiAgICB2ZWMzIHZ2ID0gbm9ybWFsaXplKGNyb3NzKHd3LHV1KSk7XG4gICAgdmVjMyByZCA9IG5vcm1hbGl6ZSggcC54KnV1ICsgcC55KnZ2ICsgMi4wKnd3ICk7XG5cdFxuICAgIC8vIHJheW1hcmNoXHRcblx0dmVjMyBjb2wgPSByYXltYXJjaCggcm8sIHJkLCBmcmFnQ29vcmQgKTtcblx0XG5cdC8vIGNvbnRyYXN0IGFuZCB2aWduZXR0aW5nXHRcblx0Y29sID0gY29sKjAuNSArIDAuNSpjb2wqY29sKigzLjAtMi4wKmNvbCk7XG5cdGNvbCAqPSAwLjI1ICsgMC43NSpwb3coIDE2LjAqcS54KnEueSooMS4wLXEueCkqKDEuMC1xLnkpLCAwLjEgKTtcblx0XG4gICAgZnJhZ0NvbG9yID0gdmVjNCggY29sLCAxLjAgKTtcbn1cblxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbFJlc29sdXRpb24udmFsdWVbMF0ueCA9IG5vaXNlVGV4LmltYWdlLndpZHRoXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsUmVzb2x1dGlvbi52YWx1ZVswXS55ID0gbm9pc2VUZXguaW1hZ2UuaGVpZ2h0XG4gICAgfVxufVxuXG5leHBvcnQgeyBGaXJlVHVubmVsU2hhZGVyIH1cbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvN2xmWFJCXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBNaXN0U2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuXG4gICAgICAgIGZsb2F0IG1yYW5kKHZlYzIgY29vcmRzKVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gZnJhY3Qoc2luKGRvdChjb29yZHMsIHZlYzIoNTYuMzQ1Niw3OC4zNDU2KSkgKiA1LjApICogMTAwMDAuMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1ub2lzZSh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiBpID0gZmxvb3IoY29vcmRzKTtcbiAgICAgICAgICAgIHZlYzIgZiA9IGZyYWN0KGNvb3Jkcyk7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYSA9IG1yYW5kKGkpO1xuICAgICAgICAgICAgZmxvYXQgYiA9IG1yYW5kKGkgKyB2ZWMyKDEuMCwgMC4wKSk7XG4gICAgICAgICAgICBmbG9hdCBjID0gbXJhbmQoaSArIHZlYzIoMC4wLCAxLjApKTtcbiAgICAgICAgICAgIGZsb2F0IGQgPSBtcmFuZChpICsgdmVjMigxLjAsIDEuMCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgY3ViaWMgPSBmICogZiAqICgzLjAgLSAyLjAgKiBmKTtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gbWl4KGEsIGIsIGN1YmljLngpICsgKGMgLSBhKSAqIGN1YmljLnkgKiAoMS4wIC0gY3ViaWMueCkgKyAoZCAtIGIpICogY3ViaWMueCAqIGN1YmljLnk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IGZibSh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgZmxvYXQgdmFsdWUgPSAwLjA7XG4gICAgICAgICAgICBmbG9hdCBzY2FsZSA9IDAuNTtcbiAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IDEwOyBpKyspXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gbW5vaXNlKGNvb3JkcykgKiBzY2FsZTtcbiAgICAgICAgICAgICAgICBjb29yZHMgKj0gNC4wO1xuICAgICAgICAgICAgICAgIHNjYWxlICo9IDAuNTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi55ICogMi4wO1xuICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBmaW5hbCA9IDAuMDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9MTsgaSA8IDY7IGkrKylcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2ZWMyIG1vdGlvbiA9IHZlYzIoZmJtKHV2ICsgdmVjMigwLjAsaVRpbWUpICogMC4wNSArIHZlYzIoaSwgMC4wKSkpO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBmaW5hbCArPSBmYm0odXYgKyBtb3Rpb24pO1xuICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmluYWwgLz0gNS4wO1xuICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChtaXgodmVjMygtMC4zKSwgdmVjMygwLjQ1LCAwLjQsIDAuNikgKyB2ZWMzKDAuNiksIGZpbmFsKSwgMSk7XG4gICAgICAgIH1cbiAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSswLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxMikgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IE1pc3RTaGFkZXIgfVxuIiwiLy8gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvWGRzQkRCXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHN0YXRlID0ge1xuICAgIGFuaW1hdGU6IGZhbHNlLFxuICAgIG5vaXNlTW9kZTogJ3NjYWxlJyxcbiAgICBpbnZlcnQ6IGZhbHNlLFxuICAgIHNoYXJwZW46IHRydWUsXG4gICAgc2NhbGVCeVByZXY6IGZhbHNlLFxuICAgIGdhaW46IDAuNTQsXG4gICAgbGFjdW5hcml0eTogMi4wLFxuICAgIG9jdGF2ZXM6IDUsXG4gICAgc2NhbGUxOiAzLjAsXG4gICAgc2NhbGUyOiAzLjAsXG4gICAgdGltZVNjYWxlWDogMC40LFxuICAgIHRpbWVTY2FsZVk6IDAuMyxcbiAgICBjb2xvcjE6IFswLCAwLCAwXSxcbiAgICBjb2xvcjI6IFsxMzAsIDEyOSwxMjldLFxuICAgIGNvbG9yMzogWzExMCwgMTEwLCAxMTBdLFxuICAgIGNvbG9yNDogWzgyLCA1MSwgMTNdLFxuICAgIG9mZnNldEFYOiAwLFxuICAgIG9mZnNldEFZOiAwLFxuICAgIG9mZnNldEJYOiAzLjcsXG4gICAgb2Zmc2V0Qlk6IDAuOSxcbiAgICBvZmZzZXRDWDogMi4xLFxuICAgIG9mZnNldENZOiAzLjIsXG4gICAgb2Zmc2V0RFg6IDQuMyxcbiAgICBvZmZzZXREWTogMi44LFxuICAgIG9mZnNldFg6IDAsXG4gICAgb2Zmc2V0WTogMCxcbn07XG5cbmxldCBNYXJibGUxU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHtcbiAgICAgICAgbWJfYW5pbWF0ZTogeyB2YWx1ZTogc3RhdGUuYW5pbWF0ZSB9LFxuICAgICAgICBtYl9jb2xvcjE6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMS5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjI6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMi5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjM6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMy5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjQ6IHsgdmFsdWU6IHN0YXRlLmNvbG9yNC5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9nYWluOiB7IHZhbHVlOiBzdGF0ZS5nYWluIH0sXG4gICAgICAgIG1iX2ludmVydDogeyB2YWx1ZTogc3RhdGUuaW52ZXJ0IH0sXG4gICAgICAgIG1iX2xhY3VuYXJpdHk6IHsgdmFsdWU6IHN0YXRlLmxhY3VuYXJpdHkgfSxcbiAgICAgICAgbWJfbm9pc2VNb2RlOiB7IHZhbHVlOiBzdGF0ZS5ub2lzZU1vZGUgPT09ICdzY2FsZScgPyAwIDogMSB9LFxuICAgICAgICBtYl9vY3RhdmVzOiB7IHZhbHVlOiBzdGF0ZS5vY3RhdmVzIH0sXG4gICAgICAgIG1iX29mZnNldDogeyB2YWx1ZTogW3N0YXRlLm9mZnNldFgsIHN0YXRlLm9mZnNldFldIH0sXG4gICAgICAgIG1iX29mZnNldEE6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRBWCwgc3RhdGUub2Zmc2V0QVldIH0sXG4gICAgICAgIG1iX29mZnNldEI6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRCWCwgc3RhdGUub2Zmc2V0QlldIH0sXG4gICAgICAgIG1iX29mZnNldEM6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRDWCwgc3RhdGUub2Zmc2V0Q1ldIH0sXG4gICAgICAgIG1iX29mZnNldEQ6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXREWCwgc3RhdGUub2Zmc2V0RFldIH0sXG4gICAgICAgIG1iX3NjYWxlMTogeyB2YWx1ZTogc3RhdGUuc2NhbGUxIH0sXG4gICAgICAgIG1iX3NjYWxlMjogeyB2YWx1ZTogc3RhdGUuc2NhbGUyIH0sXG4gICAgICAgIG1iX3NjYWxlQnlQcmV2OiB7IHZhbHVlOiBzdGF0ZS5zY2FsZUJ5UHJldiB9LFxuICAgICAgICBtYl9zaGFycGVuOiB7IHZhbHVlOiBzdGF0ZS5zaGFycGVuIH0sXG4gICAgICAgIG1iX3RpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgbWJfdGltZVNjYWxlOiB7IHZhbHVlOiBbc3RhdGUudGltZVNjYWxlWCwgc3RhdGUudGltZVNjYWxlWV0gfSxcbiAgICAgICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9ICAgIFxuICAgIH0sXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX2FuaW1hdGU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IxO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMjtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3I0O1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9nYWluO1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX2ludmVydDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfbGFjdW5hcml0eTtcbiAgICAgICAgICAgIHVuaWZvcm0gaW50IG1iX25vaXNlTW9kZTtcbiAgICAgICAgICAgIHVuaWZvcm0gaW50IG1iX29jdGF2ZXM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0O1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEE7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QjtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRDO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3NjYWxlMTtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfc2NhbGUyO1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX3NjYWxlQnlQcmV2O1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX3NoYXJwZW47XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3RpbWU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfdGltZVNjYWxlO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG4gICAgICAgICAgICAgICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gU29tZSB1c2VmdWwgZnVuY3Rpb25zXG4gICAgICAgIHZlYzMgbWJfbW9kMjg5KHZlYzMgeCkgeyByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wOyB9XG4gICAgICAgIHZlYzIgbWJfbW9kMjg5KHZlYzIgeCkgeyByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wOyB9XG4gICAgICAgIHZlYzMgbWJfcGVybXV0ZSh2ZWMzIHgpIHsgcmV0dXJuIG1iX21vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTsgfVxuICAgICAgICBcbiAgICAgICAgLy9cbiAgICAgICAgLy8gRGVzY3JpcHRpb24gOiBHTFNMIDJEIHNpbXBsZXggbm9pc2UgZnVuY3Rpb25cbiAgICAgICAgLy8gICAgICBBdXRob3IgOiBJYW4gTWNFd2FuLCBBc2hpbWEgQXJ0c1xuICAgICAgICAvLyAgTWFpbnRhaW5lciA6IGlqbVxuICAgICAgICAvLyAgICAgTGFzdG1vZCA6IDIwMTEwODIyIChpam0pXG4gICAgICAgIC8vICAgICBMaWNlbnNlIDpcbiAgICAgICAgLy8gIENvcHlyaWdodCAoQykgMjAxMSBBc2hpbWEgQXJ0cy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAgICAgICAgLy8gIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZS5cbiAgICAgICAgLy8gIGh0dHBzOi8vZ2l0aHViLmNvbS9hc2hpbWEvd2ViZ2wtbm9pc2VcbiAgICAgICAgLy9cbiAgICAgICAgZmxvYXQgbWJfc25vaXNlKHZlYzIgdikge1xuICAgICAgICAgICAgLy8gUHJlY29tcHV0ZSB2YWx1ZXMgZm9yIHNrZXdlZCB0cmlhbmd1bGFyIGdyaWRcbiAgICAgICAgICAgIGNvbnN0IHZlYzQgQyA9IHZlYzQoMC4yMTEzMjQ4NjU0MDUxODcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICgzLjAtc3FydCgzLjApKS82LjBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC4zNjYwMjU0MDM3ODQ0MzksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAuNSooc3FydCgzLjApLTEuMClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLTAuNTc3MzUwMjY5MTg5NjI2LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAtMS4wICsgMi4wICogQy54XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuMDI0MzkwMjQzOTAyNDM5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMS4wIC8gNDEuMFxuICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpcnN0IGNvcm5lciAoeDApXG4gICAgICAgICAgICB2ZWMyIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5KSk7XG4gICAgICAgICAgICB2ZWMyIHgwID0gdiAtIGkgKyBkb3QoaSwgQy54eCk7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gT3RoZXIgdHdvIGNvcm5lcnMgKHgxLCB4MilcbiAgICAgICAgICAgIHZlYzIgaTEgPSB2ZWMyKDAuMCk7XG4gICAgICAgICAgICBpMSA9ICh4MC54ID4geDAueSk/IHZlYzIoMS4wLCAwLjApOnZlYzIoMC4wLCAxLjApO1xuICAgICAgICAgICAgdmVjMiB4MSA9IHgwLnh5ICsgQy54eCAtIGkxO1xuICAgICAgICAgICAgdmVjMiB4MiA9IHgwLnh5ICsgQy56ejtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBEbyBzb21lIHBlcm11dGF0aW9ucyB0byBhdm9pZFxuICAgICAgICAgICAgLy8gdHJ1bmNhdGlvbiBlZmZlY3RzIGluIHBlcm11dGF0aW9uXG4gICAgICAgICAgICBpID0gbWJfbW9kMjg5KGkpO1xuICAgICAgICAgICAgdmVjMyBwID0gbWJfcGVybXV0ZShcbiAgICAgICAgICAgICAgICAgICAgbWJfcGVybXV0ZSggaS55ICsgdmVjMygwLjAsIGkxLnksIDEuMCkpXG4gICAgICAgICAgICAgICAgICAgICAgICArIGkueCArIHZlYzMoMC4wLCBpMS54LCAxLjAgKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyBtID0gbWF4KDAuNSAtIHZlYzMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4MCx4MCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4MSx4MSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4Mix4MilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSwgMC4wKTtcbiAgICAgICAgXG4gICAgICAgICAgICBtID0gbSptO1xuICAgICAgICAgICAgbSA9IG0qbTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBHcmFkaWVudHM6XG4gICAgICAgICAgICAvLyAgNDEgcHRzIHVuaWZvcm1seSBvdmVyIGEgbGluZSwgbWFwcGVkIG9udG8gYSBkaWFtb25kXG4gICAgICAgICAgICAvLyAgVGhlIHJpbmcgc2l6ZSAxNyoxNyA9IDI4OSBpcyBjbG9zZSB0byBhIG11bHRpcGxlXG4gICAgICAgICAgICAvLyAgICAgIG9mIDQxICg0MSo3ID0gMjg3KVxuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgeCA9IDIuMCAqIGZyYWN0KHAgKiBDLnd3dykgLSAxLjA7XG4gICAgICAgICAgICB2ZWMzIGggPSBhYnMoeCkgLSAwLjU7XG4gICAgICAgICAgICB2ZWMzIG94ID0gZmxvb3IoeCArIDAuNSk7XG4gICAgICAgICAgICB2ZWMzIGEwID0geCAtIG94O1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIE5vcm1hbGlzZSBncmFkaWVudHMgaW1wbGljaXRseSBieSBzY2FsaW5nIG1cbiAgICAgICAgICAgIC8vIEFwcHJveGltYXRpb24gb2Y6IG0gKj0gaW52ZXJzZXNxcnQoYTAqYTAgKyBoKmgpO1xuICAgICAgICAgICAgbSAqPSAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqIChhMCphMCtoKmgpO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIENvbXB1dGUgZmluYWwgbm9pc2UgdmFsdWUgYXQgUFxuICAgICAgICAgICAgdmVjMyBnID0gdmVjMygwLjApO1xuICAgICAgICAgICAgZy54ICA9IGEwLnggICogeDAueCAgKyBoLnggICogeDAueTtcbiAgICAgICAgICAgIGcueXogPSBhMC55eiAqIHZlYzIoeDEueCx4Mi54KSArIGgueXogKiB2ZWMyKHgxLnkseDIueSk7XG4gICAgICAgICAgICByZXR1cm4gMTMwLjAgKiBkb3QobSwgZyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1iX2dldE5vaXNlVmFsKHZlYzIgcCkge1xuICAgICAgICAgICAgZmxvYXQgcmF3ID0gbWJfc25vaXNlKHApO1xuICAgICAgICBcbiAgICAgICAgICAgIGlmIChtYl9ub2lzZU1vZGUgPT0gMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhYnMocmF3KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gcmF3ICogMC41ICsgMC41O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9mYm0odmVjMiBwKSB7XG4gICAgICAgICAgICBmbG9hdCBzdW0gPSAwLjA7XG4gICAgICAgICAgICBmbG9hdCBmcmVxID0gMS4wO1xuICAgICAgICAgICAgZmxvYXQgYW1wID0gMC41O1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDEuMDtcbiAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IG1iX29jdGF2ZXM7IGkrKykge1xuICAgICAgICAgICAgICAgIGZsb2F0IG4gPSBtYl9nZXROb2lzZVZhbChwICogZnJlcSk7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9pbnZlcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IDEuMCAtIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfc2hhcnBlbikge1xuICAgICAgICAgICAgICAgICAgICBuID0gbiAqIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBzdW0gKz0gbiAqIGFtcDtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX3NjYWxlQnlQcmV2KSB7XG4gICAgICAgICAgICAgICAgICAgIHN1bSArPSBuICogYW1wICogcHJldjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIHByZXYgPSBuO1xuICAgICAgICAgICAgICAgIGZyZXEgKj0gbWJfbGFjdW5hcml0eTtcbiAgICAgICAgICAgICAgICBhbXAgKj0gbWJfZ2FpbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gc3VtO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9wYXR0ZXJuKGluIHZlYzIgcCwgb3V0IHZlYzIgcSwgb3V0IHZlYzIgcikge1xuICAgICAgICAgICAgcCAqPSBtYl9zY2FsZTE7XG4gICAgICAgICAgICBwICs9IG1iX29mZnNldDtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0ID0gMC4wO1xuICAgICAgICAgICAgaWYgKG1iX2FuaW1hdGUpIHtcbiAgICAgICAgICAgICAgICB0ID0gbWJfdGltZSAqIDAuMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICBxID0gdmVjMihtYl9mYm0ocCArIG1iX29mZnNldEEgKyB0ICogbWJfdGltZVNjYWxlLngpLCBtYl9mYm0ocCArIG1iX29mZnNldEIgLSB0ICogbWJfdGltZVNjYWxlLnkpKTtcbiAgICAgICAgICAgIHIgPSB2ZWMyKG1iX2ZibShwICsgbWJfc2NhbGUyICogcSArIG1iX29mZnNldEMpLCBtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHEgKyBtYl9vZmZzZXREKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG1iX2ZibShwICsgbWJfc2NhbGUyICogcik7XG4gICAgICAgIH1cbiAgICBgLFxuICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgIHZlYzMgbWFyYmxlQ29sb3IgPSB2ZWMzKDAuMCk7XG5cbiAgICAgICAgdmVjMiBxO1xuICAgICAgICB2ZWMyIHI7XG5cbiAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyBcbiAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG5cbiAgICAgICAgZmxvYXQgZiA9IG1iX3BhdHRlcm4odXYsIHEsIHIpO1xuICAgICAgICBcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWJfY29sb3IxLCBtYl9jb2xvcjIsIGYpO1xuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYXJibGVDb2xvciwgbWJfY29sb3IzLCBsZW5ndGgocSkgLyAyLjApO1xuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYXJibGVDb2xvciwgbWJfY29sb3I0LCByLnkgLyAyLjApO1xuXG4gICAgICAgIHZlYzQgbWFyYmxlQ29sb3I0ID0gbWFwVGV4ZWxUb0xpbmVhciggdmVjNChtYXJibGVDb2xvciwxLjApICk7XG5cbiAgICAgICAgZGlmZnVzZUNvbG9yICo9IG1hcmJsZUNvbG9yNDtcbiAgICBgXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuXG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9pbnZlcnQgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gc3RhdGUuaW52ZXJ0IDogIXN0YXRlLmludmVydCB9XG5cbiAgICAgICAgLy8gbGV0cyBhZGQgYSBiaXQgb2YgcmFuZG9tbmVzcyB0byB0aGUgaW5wdXQgc28gbXVsdGlwbGUgaW5zdGFuY2VzIGFyZSBkaWZmZXJlbnRcbiAgICAgICAgbGV0IHJ4ID0gTWF0aC5yYW5kb20oKVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9vZmZzZXRBID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoIHN0YXRlLm9mZnNldEFYICsgTWF0aC5yYW5kb20oKSwgc3RhdGUub2Zmc2V0QVkgKyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX29mZnNldEIgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMiggc3RhdGUub2Zmc2V0QlggKyBNYXRoLnJhbmRvbSgpLCBzdGF0ZS5vZmZzZXRCWSArIE1hdGgucmFuZG9tKCkpIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfdGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgIH1cbn1cblxuZXhwb3J0IHsgTWFyYmxlMVNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy8xZWM5NjVjNWQ2ZGY1NzdjLmpwZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy80dDMzejhcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgbm90Rm91bmQgZnJvbSAnLi4vYXNzZXRzL2JhZFNoYWRlci5qcGcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIGlDaGFubmVsMTogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcbnZhciBub3RGb3VuZFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQobm90Rm91bmQsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm90Rm91bmRUZXggPSBub2lzZVxufSlcblxubGV0IE5vdEZvdW5kU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwxO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgdmVjMiB3YXJwVVYgPSAyLiAqIHV2O1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGQgPSBsZW5ndGgoIHdhcnBVViApO1xuICAgICAgICAgICAgdmVjMiBzdCA9IHdhcnBVViowLjEgKyAwLjIqdmVjMihjb3MoMC4wNzEqaVRpbWUqMi4rZCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luKDAuMDczKmlUaW1lKjIuLWQpKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIHdhcnBlZENvbCA9IHRleHR1cmUoIGlDaGFubmVsMCwgc3QgKS54eXogKiAyLjA7XG4gICAgICAgICAgICBmbG9hdCB3ID0gbWF4KCB3YXJwZWRDb2wuciwgMC44NSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgb2Zmc2V0ID0gMC4wMSAqIGNvcyggd2FycGVkQ29sLnJnICogMy4xNDE1OSApO1xuICAgICAgICAgICAgdmVjMyBjb2wgPSB0ZXh0dXJlKCBpQ2hhbm5lbDEsIHV2ICsgb2Zmc2V0ICkucmdiICogdmVjMygwLjgsIDAuOCwgMS41KSA7XG4gICAgICAgICAgICBjb2wgKj0gdyoxLjI7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoIG1peChjb2wsIHRleHR1cmUoIGlDaGFubmVsMSwgdXYgKyBvZmZzZXQgKS5yZ2IsIDAuNSksICAxLjApO1xuICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwxLnZhbHVlID0gbm90Rm91bmRUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwMDAwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMS52YWx1ZSA9IG5vdEZvdW5kVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBOb3RGb3VuZFNoYWRlciB9XG4iLCIvKipcbiAqIFZhcmlvdXMgc2ltcGxlIHNoYWRlcnNcbiAqL1xuXG4vLyBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNOiAgQmxlZXB5IEJsb2Nrc1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsLCBEZWZhdWx0TWF0ZXJpYWxNb2RpZmllciBhcyBNYXRlcmlhbE1vZGlmaWVyIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcidcblxuaW1wb3J0IHsgQmxlZXB5QmxvY2tzU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ibGVlcHktYmxvY2tzLXNoYWRlcidcbmltcG9ydCB7IE5vaXNlU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ub2lzZSdcbmltcG9ydCB7IExpcXVpZE1hcmJsZVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGlxdWlkLW1hcmJsZSdcbmltcG9ydCB7IEdhbGF4eVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvZ2FsYXh5J1xuaW1wb3J0IHsgTGFjZVR1bm5lbFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGFjZS10dW5uZWwnXG5pbXBvcnQgeyBGaXJlVHVubmVsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9maXJlLXR1bm5lbCdcbmltcG9ydCB7IE1pc3RTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21pc3QnXG5pbXBvcnQgeyBNYXJibGUxU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9tYXJibGUxJ1xuaW1wb3J0IHsgTm90Rm91bmRTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL25vdC1mb3VuZCdcblxuY29uc3QgdmVjID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3QgZm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnc2hhZGVyJywge1xuICBtYXRlcmlhbDoge30gYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsLCAgXG4gIHNoYWRlckRlZjoge30gYXMgU2hhZGVyRXh0ZW5zaW9uLFxuXG4gIHNjaGVtYToge1xuICAgICAgbmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJub2lzZVwiIH0gIC8vIGlmIG5vdGhpbmcgcGFzc2VkLCBqdXN0IGNyZWF0ZSBzb21lIG5vaXNlXG4gIH0sXG5cbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgLy8gaWYgd2UgZG9uJ3Qgc2V0IHVwIGEgc2hhZGVyLCB3ZSdsbCBqdXN0IHJldHVybiB0aGUgb3JpZ2luYWwgbWF0ZXJpYWxcbiAgICAgIHZhciBvbGRNYXRlcmlhbCA9ICh0aGlzLmVsLm9iamVjdDNETWFwLm1lc2ggYXMgVEhSRUUuTWVzaCkubWF0ZXJpYWxcbiAgICAgIGlmICghKG9sZE1hdGVyaWFsIGluc3RhbmNlb2YgVEhSRUUuTWF0ZXJpYWwpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBzaGFkZXJEZWY6IFNoYWRlckV4dGVuc2lvbjtcblxuICAgICAgc3dpdGNoICh0aGlzLmRhdGEubmFtZSkge1xuICAgICAgICBjYXNlIFwibm9pc2VcIjpcbiAgICAgICAgICAgIHNoYWRlckRlZiA9IE5vaXNlU2hhZGVyXG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlIFwibGlxdWlkbWFyYmxlXCI6XG4gICAgICAgICAgICBzaGFkZXJEZWYgPSBMaXF1aWRNYXJibGVTaGFkZXJcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIFxuICAgICAgICBjYXNlIFwiYmxlZXB5YmxvY2tzXCI6XG4gICAgICAgICAgICBzaGFkZXJEZWYgPSBCbGVlcHlCbG9ja3NTaGFkZXJcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgXCJnYWxheHlcIjpcbiAgICAgICAgICAgIHNoYWRlckRlZiA9IEdhbGF4eVNoYWRlclxuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSBcImxhY2V0dW5uZWxcIjpcbiAgICAgICAgICAgIHNoYWRlckRlZiA9IExhY2VUdW5uZWxTaGFkZXJcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgXCJmaXJldHVubmVsXCI6XG4gICAgICAgICAgICBzaGFkZXJEZWYgPSBGaXJlVHVubmVsU2hhZGVyXG4gICAgICAgICAgICBicmVhaztcbiAgICBcbiAgICAgICAgY2FzZSBcIm1pc3RcIjpcbiAgICAgICAgICAgIHNoYWRlckRlZiA9IE1pc3RTaGFkZXJcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgXCJtYXJibGUxXCI6XG4gICAgICAgICAgICBzaGFkZXJEZWYgPSBNYXJibGUxU2hhZGVyXG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gYW4gdW5rbm93biBuYW1lIHdhcyBwYXNzZWQgaW5cbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInVua25vd24gbmFtZSAnXCIgKyB0aGlzLmRhdGEubmFtZSArIFwiJyBwYXNzZWQgdG8gc2hhZGVyIGNvbXBvbmVudFwiKVxuICAgICAgICAgICAgc2hhZGVyRGVmID0gTm90Rm91bmRTaGFkZXJcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBpZiAob2xkTWF0ZXJpYWwudHlwZSAhPSBcIk1lc2hTdGFuZGFyZE1hdGVyaWFsXCIpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXCJTaGFkZXIgQ29tcG9uZW50OiBkb24ndCBrbm93IGhvdyB0byBoYW5kbGUgU2hhZGVycyBvZiB0eXBlICdcIiArIG9sZE1hdGVyaWFsLnR5cGUgKyBcIicsIG9ubHkgTWVzaFN0YW5kYXJkTWF0ZXJpYWwgYXQgdGhpcyB0aW1lLlwiKVxuICAgICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy9jb25zdCBtYXRlcmlhbCA9IG9sZE1hdGVyaWFsLmNsb25lKCk7XG4gICAgICB2YXIgQ3VzdG9tTWF0ZXJpYWxcbiAgICAgIHRyeSB7XG4gICAgICAgICAgQ3VzdG9tTWF0ZXJpYWwgPSBNYXRlcmlhbE1vZGlmaWVyLmV4dGVuZCAob2xkTWF0ZXJpYWwudHlwZSwge1xuICAgICAgICAgICAgdW5pZm9ybXM6IHNoYWRlckRlZi51bmlmb3JtcyxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogc2hhZGVyRGVmLnZlcnRleFNoYWRlcixcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyOiBzaGFkZXJEZWYuZnJhZ21lbnRTaGFkZXJcbiAgICAgICAgICB9KVxuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBjcmVhdGUgYSBuZXcgbWF0ZXJpYWwsIGluaXRpYWxpemluZyB0aGUgYmFzZSBwYXJ0IHdpdGggdGhlIG9sZCBtYXRlcmlhbCBoZXJlXG4gICAgICBsZXQgbWF0ZXJpYWwgPSBuZXcgQ3VzdG9tTWF0ZXJpYWwoKVxuICAgICAgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICBtYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XG5cbiAgICAgIHNoYWRlckRlZi5pbml0KG1hdGVyaWFsKTtcbiAgICAgIFxuICAgICAgKHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaCBhcyBUSFJFRS5NZXNoKS5tYXRlcmlhbCA9IG1hdGVyaWFsXG4gICAgICB0aGlzLm1hdGVyaWFsID0gbWF0ZXJpYWwgXG4gLy8gICAgIHRoaXMuc2hhZGVyID0gdHJ1ZVxuICAgICAgdGhpcy5zaGFkZXJEZWYgPSBzaGFkZXJEZWZcbiAgfSxcblxuICB0aWNrOiBmdW5jdGlvbih0aW1lKSB7XG4gICAgaWYgKHRoaXMuc2hhZGVyRGVmID09IG51bGwpIHsgcmV0dXJuIH1cblxuICAgIHRoaXMuc2hhZGVyRGVmLnVwZGF0ZVVuaWZvcm1zKHRpbWUsIHRoaXMubWF0ZXJpYWwpXG4gICAgc3dpdGNoICh0aGlzLmRhdGEubmFtZSkge1xuICAgICAgICBjYXNlIFwibm9pc2VcIjpcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYmxlZXB5YmxvY2tzXCI6XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIGlmICh0aGlzLnNoYWRlcikge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImZyYWdtZW50IHNoYWRlcjpcIiwgdGhpcy5tYXRlcmlhbC5mcmFnbWVudFNoYWRlcilcbiAgICAvLyAgICAgdGhpcy5zaGFkZXIgPSBudWxsXG4gICAgLy8gfVxuICB9LFxufSlcbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBjcmVhdGUgYSBIVE1MIG9iamVjdCBieSByZW5kZXJpbmcgYSBzY3JpcHQgdGhhdCBjcmVhdGVzIGFuZCBtYW5hZ2VzIGl0XG4gKlxuICovXG5cbmltcG9ydCAqIGFzIGh0bWxDb21wb25lbnRzIGZyb20gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIjtcblxuLy8gdmFyIGh0bWxDb21wb25lbnRzO1xuLy8gdmFyIHNjcmlwdFByb21pc2U7XG4vLyBpZiAod2luZG93Ll9fdGVzdGluZ1Z1ZUFwcHMpIHtcbi8vICAgICBzY3JpcHRQcm9taXNlID0gaW1wb3J0KHdpbmRvdy5fX3Rlc3RpbmdWdWVBcHBzKSAgICBcbi8vIH0gZWxzZSB7XG4vLyAgICAgc2NyaXB0UHJvbWlzZSA9IGltcG9ydChcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiKSBcbi8vIH1cbi8vIC8vIHNjcmlwdFByb21pc2UgPSBzY3JpcHRQcm9taXNlLnRoZW4obW9kdWxlID0+IHtcbi8vIC8vICAgICByZXR1cm4gbW9kdWxlXG4vLyAvLyB9KTtcbi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG4gQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdodG1sLXNjcmlwdCcsIHsgIFxuICAgIGluaXQoKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtVGljayA9IGh0bWxDb21wb25lbnRzW1wic3lzdGVtVGlja1wiXTtcbiAgICAgICAgdGhpcy5pbml0aWFsaXplRXRoZXJlYWwgPSBodG1sQ29tcG9uZW50c1tcImluaXRpYWxpemVFdGhlcmVhbFwiXVxuICAgICAgICBpZiAoIXRoaXMuc3lzdGVtVGljayB8fCAhdGhpcy5pbml0aWFsaXplRXRoZXJlYWwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJlcnJvciBpbiBodG1sLXNjcmlwdCBzeXN0ZW06IGh0bWxDb21wb25lbnRzIGhhcyBubyBzeXN0ZW1UaWNrIGFuZC9vciBpbml0aWFsaXplRXRoZXJlYWwgbWV0aG9kc1wiKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplRXRoZXJlYWwoKVxuICAgICAgICB9XG4gICAgfSxcbiAgXG4gICAgdGljayh0LCBkdCkge1xuICAgICAgICB0aGlzLnN5c3RlbVRpY2sodCwgZHQpXG4gICAgfSxcbiAgfSlcbiAgXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gXCIqX2NvbXBvbmVudE5hbWVcIlxuICAgICAgICBuYW1lOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSA9PT0gXCJcIiB8fCB0aGlzLmRhdGEubmFtZSA9PT0gdGhpcy5mdWxsTmFtZSkgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveVNjcmlwdCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgY3JlYXRlU2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGVhY2ggdGltZSB3ZSBsb2FkIGEgc2NyaXB0IGNvbXBvbmVudCB3ZSB3aWxsIHBvc3NpYmx5IGNyZWF0ZVxuICAgICAgICAvLyBhIG5ldyBuZXR3b3JrZWQgY29tcG9uZW50LiAgVGhpcyBpcyBmaW5lLCBzaW5jZSB0aGUgbmV0d29ya2VkIElkIFxuICAgICAgICAvLyBpcyBiYXNlZCBvbiB0aGUgZnVsbCBuYW1lIHBhc3NlZCBhcyBhIHBhcmFtZXRlciwgb3IgYXNzaWduZWQgdG8gdGhlXG4gICAgICAgIC8vIGNvbXBvbmVudCBpbiBTcG9rZS4gIEl0IGRvZXMgbWVhbiB0aGF0IGlmIHdlIGhhdmVcbiAgICAgICAgLy8gbXVsdGlwbGUgb2JqZWN0cyBpbiB0aGUgc2NlbmUgd2hpY2ggaGF2ZSB0aGUgc2FtZSBuYW1lLCB0aGV5IHdpbGxcbiAgICAgICAgLy8gYmUgaW4gc3luYy4gIEl0IGFsc28gbWVhbnMgdGhhdCBpZiB5b3Ugd2FudCB0byBkcm9wIGEgY29tcG9uZW50IG9uXG4gICAgICAgIC8vIHRoZSBzY2VuZSB2aWEgYSAuZ2xiLCBpdCBtdXN0IGhhdmUgYSB2YWxpZCBuYW1lIHBhcmFtZXRlciBpbnNpZGUgaXQuXG4gICAgICAgIC8vIEEgLmdsYiBpbiBzcG9rZSB3aWxsIGZhbGwgYmFjayB0byB0aGUgc3Bva2UgbmFtZSBpZiB5b3UgdXNlIG9uZSB3aXRob3V0XG4gICAgICAgIC8vIGEgbmFtZSBpbnNpZGUgaXQuXG4gICAgICAgIHRoaXMubG9hZFNjcmlwdCgpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBhcmVudCBuZXR3b3JrZWQgZW50aXR5LCB3aGVuIGl0J3MgZmluaXNoZWQgaW5pdGlhbGl6aW5nLiAgXG4gICAgICAgICAgICAgICAgLy8gV2hlbiBjcmVhdGluZyB0aGlzIGFzIHBhcnQgb2YgYSBHTFRGIGxvYWQsIHRoZSBcbiAgICAgICAgICAgICAgICAvLyBwYXJlbnQgYSBmZXcgc3RlcHMgdXAgd2lsbCBiZSBuZXR3b3JrZWQuICBXZSdsbCBvbmx5IGRvIHRoaXNcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGUgSFRNTCBzY3JpcHQgd2FudHMgdG8gYmUgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBudWxsXG5cbiAgICAgICAgICAgICAgICAvLyBiaW5kIGNhbGxiYWNrc1xuICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5zZXROZXR3b3JrTWV0aG9kcyh0aGlzLnRha2VPd25lcnNoaXAsIHRoaXMuc2V0U2hhcmVkRGF0YSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0RWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IHNjcmlwdEVsXG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0T2JqZWN0M0QoXCJ3ZWJsYXllcjNkXCIsIHRoaXMuc2NyaXB0LndlYkxheWVyM0QpXG5cbiAgICAgICAgICAgIC8vIGxldHMgZmlndXJlIG91dCB0aGUgc2NhbGUsIGJ1dCBzY2FsaW5nIHRvIGZpbGwgdGhlIGEgMXgxbSBzcXVhcmUsIHRoYXQgaGFzIGFsc29cbiAgICAgICAgICAgIC8vIHBvdGVudGlhbGx5IGJlZW4gc2NhbGVkIGJ5IHRoZSBwYXJlbnRzIHBhcmVudCBub2RlLiBJZiB3ZSBzY2FsZSB0aGUgZW50aXR5IGluIHNwb2tlLFxuICAgICAgICAgICAgLy8gdGhpcyBpcyB3aGVyZSB0aGUgc2NhbGUgaXMgc2V0LiAgSWYgd2UgZHJvcCBhIG5vZGUgaW4gYW5kIHNjYWxlIGl0LCB0aGUgc2NhbGUgaXMgYWxzb1xuICAgICAgICAgICAgLy8gc2V0IHRoZXJlLlxuICAgICAgICAgICAgLy8gV2UgdXNlZCB0byBoYXZlIGEgZml4ZWQgc2l6ZSBwYXNzZWQgYmFjayBmcm9tIHRoZSBlbnRpdHksIGJ1dCB0aGF0J3MgdG9vIHJlc3RyaWN0aXZlOlxuICAgICAgICAgICAgLy8gY29uc3Qgd2lkdGggPSB0aGlzLnNjcmlwdC53aWR0aFxuICAgICAgICAgICAgLy8gY29uc3QgaGVpZ2h0ID0gdGhpcy5zY3JpcHQuaGVpZ2h0XG5cbiAgICAgICAgICAgIHZhciBwYXJlbnQyID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5vYmplY3QzRFxuICAgICAgICAgICAgdmFyIHdpZHRoID0gcGFyZW50Mi5zY2FsZS54XG4gICAgICAgICAgICB2YXIgaGVpZ2h0ID0gcGFyZW50Mi5zY2FsZS55XG4gICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnggPSAxXG4gICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnkgPSAxXG4gICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnogPSAxXG5cbiAgICAgICAgICAgIGlmICh3aWR0aCAmJiB3aWR0aCA+IDAgJiYgaGVpZ2h0ICYmIGhlaWdodCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAgICAgICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHdpZHRoIC8gd3NpemUsIGhlaWdodCAvIGhzaXplKVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZShcInNjYWxlXCIsIHsgeDogc2NhbGUsIHk6IHNjYWxlLCB6OiBzY2FsZX0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB0aGVyZSB3aWxsIGJlIG9uZSBlbGVtZW50IGFscmVhZHksIHRoZSBjdWJlIHdlIGNyZWF0ZWQgaW4gYmxlbmRlclxuICAgICAgICAgICAgLy8gYW5kIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50IHRvLCBzbyByZW1vdmUgaXQgaWYgaXQgaXMgdGhlcmUuXG4gICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuLnBvcCgpXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5lbC5vYmplY3QzRC5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgIGMudmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBtYWtlIHN1cmUgXCJpc1N0YXRpY1wiIGlzIGNvcnJlY3Q7ICBjYW4ndCBiZSBzdGF0aWMgaWYgZWl0aGVyIGludGVyYWN0aXZlIG9yIG5ldHdvcmtlZFxuICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzU3RhdGljICYmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlIHx8IHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICB0aGlzLmVsLmFwcGVuZENoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuXG4gICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIC8vIG1ha2UgdGhlIGh0bWwgb2JqZWN0IGNsaWNrYWJsZVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge3NpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZX0pXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG5cbiAgICAgICAgICAgICAgICAvLyBmb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgb2JqZWN0IFxuICAgICAgICAgICAgICAgIHRoaXMuY2xpY2tlZCA9IHRoaXMuY2xpY2tlZC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNEcmFnZ2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXJlbid0IGdvaW5nIHRvIHJlYWxseSBkZWFsIHdpdGggdGhpcyB0aWxsIHdlIGhhdmUgYSB1c2UgY2FzZSwgYnV0XG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGNhbiBzZXQgaXQgdXAgZm9yIG5vd1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLCBcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzSG9sZGFibGU6IHRydWUsICBob2xkYWJsZUJ1dHRvbjogdHJ1ZX0pXG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi1kb3duJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ1N0YXJ0KGV2dClcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLXVwJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ0VuZChldnQpXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy90aGlzLnJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIoKVxuICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gZmluZHMgYW4gZXhpc3RpbmcgY29weSBvZiB0aGUgTmV0d29ya2VkIEVudGl0eSAoaWYgd2UgYXJlIG5vdCB0aGVcbiAgICAgICAgICAgICAgICAvLyBmaXJzdCBjbGllbnQgaW4gdGhlIHJvb20gaXQgd2lsbCBleGlzdCBpbiBvdGhlciBjbGllbnRzIGFuZCBiZSBjcmVhdGVkIGJ5IE5BRilcbiAgICAgICAgICAgICAgICAvLyBvciBjcmVhdGUgYW4gZW50aXR5IGlmIHdlIGFyZSBmaXJzdC5cbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gZnVuY3Rpb24gKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwZXJzaXN0ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5ldElkO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgYmUgcGFydCBvZiBhIE5ldHdvcmtlZCBHTFRGIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgcGlubmVkIGFuZCBsb2FkZWQgd2hlbiB3ZSBlbnRlciB0aGUgcm9vbS4gIFVzZSB0aGUgbmV0d29ya2VkIHBhcmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBwbHVzIGEgZGlzYW1iaWd1YXRpbmcgYml0IG9mIHRleHQgdG8gY3JlYXRlIGEgdW5pcXVlIElkLlxuICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSBOQUYudXRpbHMuZ2V0TmV0d29ya0lkKG5ldHdvcmtlZEVsKSArIFwiLWh0bWwtc2NyaXB0XCI7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIG5lZWQgdG8gY3JlYXRlIGFuIGVudGl0eSwgdXNlIHRoZSBzYW1lIHBlcnNpc3RlbmNlIGFzIG91clxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29yayBlbnRpdHkgKHRydWUgaWYgcGlubmVkLCBmYWxzZSBpZiBub3QpXG4gICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50ID0gZW50aXR5LmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEucGVyc2lzdGVudDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgb25seSBoYXBwZW5zIGlmIHRoaXMgY29tcG9uZW50IGlzIG9uIGEgc2NlbmUgZmlsZSwgc2luY2UgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBlbGVtZW50cyBvbiB0aGUgc2NlbmUgYXJlbid0IG5ldHdvcmtlZC4gIFNvIGxldCdzIGFzc3VtZSBlYWNoIGVudGl0eSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNjZW5lIHdpbGwgaGF2ZSBhIHVuaXF1ZSBuYW1lLiAgQWRkaW5nIGEgYml0IG9mIHRleHQgc28gd2UgY2FuIGZpbmQgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluIHRoZSBET00gd2hlbiBkZWJ1Z2dpbmcuXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IHRoaXMuZnVsbE5hbWUucmVwbGFjZUFsbChcIl9cIixcIi1cIikgKyBcIi1odG1sLXNjcmlwdFwiXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgbmV0d29ya2VkIGVudGl0eSB3ZSBjcmVhdGUgZm9yIHRoaXMgY29tcG9uZW50IGFscmVhZHkgZXhpc3RzLiBcbiAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBjcmVhdGUgaXRcbiAgICAgICAgICAgICAgICAgICAgLy8gLSBOT1RFOiBpdCBpcyBjcmVhdGVkIG9uIHRoZSBzY2VuZSwgbm90IGFzIGEgY2hpbGQgb2YgdGhpcyBlbnRpdHksIGJlY2F1c2VcbiAgICAgICAgICAgICAgICAgICAgLy8gICBOQUYgY3JlYXRlcyByZW1vdGUgZW50aXRpZXMgaW4gdGhlIHNjZW5lLlxuICAgICAgICAgICAgICAgICAgICB2YXIgZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmVudGl0aWVzLmhhc0VudGl0eShuZXRJZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IE5BRi5lbnRpdGllcy5nZXRFbnRpdHkobmV0SWQpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWV0aG9kIHRvIHJldHJpZXZlIHRoZSBzY3JpcHQgZGF0YSBvbiB0aGlzIGVudGl0eVxuICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBcIm5ldHdvcmtlZFwiIGNvbXBvbmVudCBzaG91bGQgaGF2ZSBwZXJzaXN0ZW50PXRydWUsIHRoZSB0ZW1wbGF0ZSBhbmQgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgc2V0LCBvd25lciBzZXQgdG8gXCJzY2VuZVwiIChzbyB0aGF0IGl0IGRvZXNuJ3QgdXBkYXRlIHRoZSByZXN0IG9mXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgd29ybGQgd2l0aCBpdCdzIGluaXRpYWwgZGF0YSwgYW5kIHNob3VsZCBOT1Qgc2V0IGNyZWF0b3IgKHRoZSBzeXN0ZW0gd2lsbCBkbyB0aGF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LnNldEF0dHJpYnV0ZSgnbmV0d29ya2VkJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlOiBcIiNzY3JpcHQtZGF0YS1tZWRpYVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQ6IHBlcnNpc3RlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3duZXI6IFwic2NlbmVcIiwgIC8vIHNvIHRoYXQgb3VyIGluaXRpYWwgdmFsdWUgZG9lc24ndCBvdmVyd3JpdGUgb3RoZXJzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya0lkOiBuZXRJZFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYXBwZW5kQ2hpbGQoZW50aXR5KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHNhdmUgYSBwb2ludGVyIHRvIHRoZSBuZXR3b3JrZWQgZW50aXR5IGFuZCB0aGVuIHdhaXQgZm9yIGl0IHRvIGJlIGZ1bGx5XG4gICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIGJlZm9yZSBnZXR0aW5nIGEgcG9pbnRlciB0byB0aGUgYWN0dWFsIG5ldHdvcmtlZCBjb21wb25lbnQgaW4gaXRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5uZXRFbnRpdHkpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wic2NyaXB0LWRhdGFcIl1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyB0aGUgZmlyc3QgbmV0d29ya2VkIGVudGl0eSwgaXQncyBzaGFyZWREYXRhIHdpbGwgZGVmYXVsdCB0byB0aGUgZW1wdHkgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcsIGFuZCB3ZSBzaG91bGQgaW5pdGlhbGl6ZSBpdCB3aXRoIHRoZSBpbml0aWFsIGRhdGEgZnJvbSB0aGUgc2NyaXB0XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuc2hhcmVkRGF0YSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBuZXR3b3JrZWQgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wibmV0d29ya2VkXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgKG5ldHdvcmtlZC5kYXRhLmNyZWF0b3IgPT0gTkFGLmNsaWVudElkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIHRoaXMuc3RhdGVTeW5jLmluaXRTaGFyZWREYXRhKHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5LmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5lbCkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KG5ldHdvcmtlZEVsKVxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KClcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IHRoaXMuc2V0dXBOZXR3b3JrZWQuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBtZXRob2QgaGFuZGxlcyB0aGUgZGlmZmVyZW50IHN0YXJ0dXAgY2FzZXM6XG4gICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmUsIE5BRiB3aWxsIGJlIGNvbm5lY3RlZCBhbmQgd2UgY2FuIFxuICAgICAgICAgICAgICAgIC8vICAgaW1tZWRpYXRlbHkgaW5pdGlhbGl6ZVxuICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgaXMgaW4gdGhlIHJvb20gc2NlbmUgb3IgcGlubmVkLCBpdCB3aWxsIGxpa2VseSBiZSBjcmVhdGVkXG4gICAgICAgICAgICAgICAgLy8gICBiZWZvcmUgTkFGIGlzIHN0YXJ0ZWQgYW5kIGNvbm5lY3RlZCwgc28gd2Ugd2FpdCBmb3IgYW4gZXZlbnQgdGhhdCBpc1xuICAgICAgICAgICAgICAgIC8vICAgZmlyZWQgd2hlbiBIdWJzIGhhcyBzdGFydGVkIE5BRlxuICAgICAgICAgICAgICAgIGlmIChOQUYuY29ubmVjdGlvbiAmJiBOQUYuY29ubmVjdGlvbi5pc0Nvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignZGlkQ29ubmVjdFRvTmV0d29ya2VkU2NlbmUnLCB0aGlzLnNldHVwTmV0d29ya2VkKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9LFxuXG4gICAgcGxheTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LnBsYXkoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHBhdXNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQucGF1c2UoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIGhhbmRsZSBcImludGVyYWN0XCIgZXZlbnRzIGZvciBjbGlja2FibGUgZW50aXRpZXNcbiAgICBjbGlja2VkOiBmdW5jdGlvbihldnQpIHtcbiAgICAgICAgdGhpcy5zY3JpcHQuY2xpY2tlZChldnQpIFxuICAgIH0sXG4gIFxuICAgIC8vIG1ldGhvZHMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgaHRtbCBvYmplY3Qgc28gdGhleSBjYW4gdXBkYXRlIG5ldHdvcmtlZCBkYXRhXG4gICAgdGFrZU93bmVyc2hpcDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnRha2VPd25lcnNoaXAoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBzdXJlLCBnbyBhaGVhZCBhbmQgY2hhbmdlIGl0IGZvciBub3dcbiAgICAgICAgfVxuICAgIH0sXG4gICAgXG4gICAgc2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oZGF0YU9iamVjdCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXRlU3luYy5zZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9LFxuXG4gICAgLy8gdGhpcyBpcyBjYWxsZWQgZnJvbSBiZWxvdywgdG8gZ2V0IHRoZSBpbml0aWFsIGRhdGEgZnJvbSB0aGUgc2NyaXB0XG4gICAgZ2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKVxuICAgICAgICB9XG4gICAgICAgIC8vIHNob3VsZG4ndCBoYXBwZW5cbiAgICAgICAgY29uc29sZS53YXJuKFwic2NyaXB0LWRhdGEgY29tcG9uZW50IGNhbGxlZCBwYXJlbnQgZWxlbWVudCBidXQgdGhlcmUgaXMgbm8gc2NyaXB0IHlldD9cIilcbiAgICAgICAgcmV0dXJuIFwie31cIlxuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICBpZiAoIXRoaXMuc2NyaXB0KSByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgLy8gbW9yZSBvciBsZXNzIGNvcGllZCBmcm9tIFwiaG92ZXJhYmxlLXZpc3VhbHMuanNcIiBpbiBodWJzXG4gICAgICAgICAgICBjb25zdCB0b2dnbGluZyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zW1wiaHVicy1zeXN0ZW1zXCJdLmN1cnNvclRvZ2dsaW5nU3lzdGVtO1xuICAgICAgICAgICAgdmFyIHBhc3N0aHJ1SW50ZXJhY3RvciA9IFtdXG5cbiAgICAgICAgICAgIGxldCBpbnRlcmFjdG9yT25lLCBpbnRlcmFjdG9yVHdvO1xuICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcbiAgICAgICAgICAgIGlmICghaW50ZXJhY3Rpb24ucmVhZHkpIHJldHVybjsgLy9ET01Db250ZW50UmVhZHkgd29ya2Fyb3VuZFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBsZXQgaG92ZXJFbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICF0b2dnbGluZy5sZWZ0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JPbmUpIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3Rvck9uZS5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwuc2V0KHBvcywgZGlyKVxuXG4gICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheUwpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgIXRvZ2dsaW5nLnJpZ2h0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodEhhbmQuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JUd28pIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3RvclR3by5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIuc2V0KHBvcywgZGlyKVxuICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlSKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmludGVyYWN0aW9uUmF5cyA9IHBhc3N0aHJ1SW50ZXJhY3RvclxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlbid0IGZpbmlzaGVkIHNldHRpbmcgdXAgdGhlIG5ldHdvcmtlZCBlbnRpdHkgZG9uJ3QgZG8gYW55dGhpbmcuXG4gICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykgeyByZXR1cm4gfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgc3RhdGUgaGFzIGNoYW5nZWQgaW4gdGhlIG5ldHdvcmtlZCBkYXRhLCB1cGRhdGUgb3VyIGh0bWwgb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LnVwZGF0ZVNoYXJlZERhdGEodGhpcy5zdGF0ZVN5bmMuZGF0YU9iamVjdClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2NyaXB0LnRpY2sodGltZSlcbiAgICB9LFxuICBcbiAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5mdWxsTmFtZSA9PT0gXCJcIikge1xuICAgICAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG4gICAgICAgIH1cblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJjb21wb25lbnROYW1lXCJcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIGZldGNoIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgcmVzb3VyY2VcbiAgICAgICAgLy8gY29tcG9uZW50TmFtZVxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmZ1bGxOYW1lLm1hdGNoKC9fKFtBLVphLXowLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMywgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJodG1sLXNjcmlwdCBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5mdWxsTmFtZSlcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IG51bGxcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHBhcmFtc1sxXVxuICAgICAgICB9XG4gIH0sXG5cbiAgbG9hZFNjcmlwdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBpZiAoc2NyaXB0UHJvbWlzZSkge1xuICAgICAgICAvLyAgICAgdHJ5IHtcbiAgICAgICAgLy8gICAgICAgICBodG1sQ29tcG9uZW50cyA9IGF3YWl0IHNjcmlwdFByb21pc2U7XG4gICAgICAgIC8vICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgLy8gICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAvLyAgICAgICAgIHJldHVyblxuICAgICAgICAvLyAgICAgfVxuICAgICAgICAvLyAgICAgc2NyaXB0UHJvbWlzZSA9IG51bGxcbiAgICAgICAgLy8gfVxuICAgICAgICB2YXIgaW5pdFNjcmlwdCA9IGh0bWxDb21wb25lbnRzW3RoaXMuY29tcG9uZW50TmFtZV1cbiAgICAgICAgaWYgKCFpbml0U2NyaXB0KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBkb2Vzbid0IGhhdmUgc2NyaXB0IGZvciBcIiArIHRoaXMuY29tcG9uZW50TmFtZSk7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcmlwdCA9IGluaXRTY3JpcHQoKVxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpe1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudXBkYXRlKHRydWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBmYWlsZWQgdG8gaW5pdGlhbGl6ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBkZXN0cm95U2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVsLnJlbW92ZUNoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IG51bGxcblxuICAgICAgICB0aGlzLnNjcmlwdC5kZXN0cm95KClcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgfVxufSlcblxuLy9cbi8vIENvbXBvbmVudCBmb3Igb3VyIG5ldHdvcmtlZCBzdGF0ZS4gIFRoaXMgY29tcG9uZW50IGRvZXMgbm90aGluZyBleGNlcHQgYWxsIHVzIHRvIFxuLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4vLyBzb21ldGhpbmcgaGFzIGNoYW5nZWQsIGluc3RlYWQgb2YgaGF2aW5nIHRoZSBjb21wb25lbnQgYWJvdmUgcG9sbCBlYWNoIGZyYW1lLlxuLy9cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzY3JpcHQtZGF0YScsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2NyaXB0ZGF0YToge3R5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwie31cIn0sXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB0aGlzLmVsLmdldFNoYXJlZERhdGEoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgdGhpcy5zaGFyZWREYXRhKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgZW5jb2RlIGluaXRpYWwgc2NyaXB0IGRhdGEgb2JqZWN0OiBcIiwgZSwgdGhpcy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9IGZhbHNlO1xuICAgIH0sXG5cbiAgICB1cGRhdGUoKSB7XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9ICEodGhpcy5zaGFyZWREYXRhID09PSB0aGlzLmRhdGEuc2NyaXB0ZGF0YSk7XG4gICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodGhpcy5kYXRhLnNjcmlwdGRhdGEpKVxuXG4gICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB0aGlzLmRhdGEuc2NyaXB0ZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY291bGRuJ3QgcGFyc2UgSlNPTiByZWNlaXZlZCBpbiBzY3JpcHQtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJcIlxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaXQgaXMgbGlrZWx5IHRoYXQgYXBwbHlQZXJzaXN0ZW50U3luYyBvbmx5IG5lZWRzIHRvIGJlIGNhbGxlZCBmb3IgcGVyc2lzdGVudFxuICAgIC8vIG5ldHdvcmtlZCBlbnRpdGllcywgc28gd2UgX3Byb2JhYmx5XyBkb24ndCBuZWVkIHRvIGRvIHRoaXMuICBCdXQgaWYgdGhlcmUgaXMgbm9cbiAgICAvLyBwZXJzaXN0ZW50IGRhdGEgc2F2ZWQgZnJvbSB0aGUgbmV0d29yayBmb3IgdGhpcyBlbnRpdHksIHRoaXMgY29tbWFuZCBkb2VzIG5vdGhpbmcuXG4gICAgcGxheSgpIHtcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgcmVhbGx5IG5lZWRlZCwgYnV0IGNhbid0IGh1cnRcbiAgICAgICAgICAgIGlmIChBUFAudXRpbHMpIHsgLy8gdGVtcG9yYXJ5IHRpbGwgd2Ugc2hpcCBuZXcgY2xpZW50XG4gICAgICAgICAgICAgICAgQVBQLnV0aWxzLmFwcGx5UGVyc2lzdGVudFN5bmModGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLm5ldHdvcmtJZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgdGFrZU93bmVyc2hpcCgpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG5cbiAgICAvLyBpbml0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgLy8gICAgIHRyeSB7XG4gICAgLy8gICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAvLyAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAvLyAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAvLyAgICAgICAgIHJldHVybiB0cnVlXG4gICAgLy8gICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAvLyAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAvLyAgICAgICAgIHJldHVybiBmYWxzZVxuICAgIC8vICAgICB9XG4gICAgLy8gfSxcblxuICAgIC8vIFRoZSBrZXkgcGFydCBpbiB0aGVzZSBtZXRob2RzICh3aGljaCBhcmUgY2FsbGVkIGZyb20gdGhlIGNvbXBvbmVudCBhYm92ZSkgaXMgdG9cbiAgICAvLyBjaGVjayBpZiB3ZSBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgdGhlIG5ldHdvcmtlZCBvYmplY3QuICBJZiB3ZSBvd24gaXQgKGlzTWluZSgpIGlzIHRydWUpXG4gICAgLy8gd2UgY2FuIGNoYW5nZSBpdC4gIElmIHdlIGRvbid0IG93biBpbiwgd2UgY2FuIHRyeSB0byBiZWNvbWUgdGhlIG93bmVyIHdpdGhcbiAgICAvLyB0YWtlT3duZXJzaGlwKCkuIElmIHRoaXMgc3VjY2VlZHMsIHdlIGNhbiBzZXQgdGhlIGRhdGEuICBcbiAgICAvL1xuICAgIC8vIE5PVEU6IHRha2VPd25lcnNoaXAgQVRURU1QVFMgdG8gYmVjb21lIHRoZSBvd25lciwgYnkgYXNzdW1pbmcgaXQgY2FuIGJlY29tZSB0aGVcbiAgICAvLyBvd25lciBhbmQgbm90aWZ5aW5nIHRoZSBuZXR3b3JrZWQgY29waWVzLiAgSWYgdHdvIG9yIG1vcmUgZW50aXRpZXMgdHJ5IHRvIGJlY29tZVxuICAgIC8vIG93bmVyLCAgb25seSBvbmUgKHRoZSBsYXN0IG9uZSB0byB0cnkpIGJlY29tZXMgdGhlIG93bmVyLiAgQW55IHN0YXRlIHVwZGF0ZXMgZG9uZVxuICAgIC8vIGJ5IHRoZSBcImZhaWxlZCBhdHRlbXB0ZWQgb3duZXJzXCIgd2lsbCBub3QgYmUgZGlzdHJpYnV0ZWQgdG8gdGhlIG90aGVyIGNsaWVudHMsXG4gICAgLy8gYW5kIHdpbGwgYmUgb3ZlcndyaXR0ZW4gKGV2ZW50dWFsbHkpIGJ5IHVwZGF0ZXMgZnJvbSB0aGUgb3RoZXIgY2xpZW50cy4gICBCeSBub3RcbiAgICAvLyBhdHRlbXB0aW5nIHRvIGd1YXJhbnRlZSBvd25lcnNoaXAsIHRoaXMgY2FsbCBpcyBmYXN0IGFuZCBzeW5jaHJvbm91cy4gIEFueSBcbiAgICAvLyBtZXRob2RzIGZvciBndWFyYW50ZWVpbmcgb3duZXJzaGlwIGNoYW5nZSB3b3VsZCB0YWtlIGEgbm9uLXRyaXZpYWwgYW1vdW50IG9mIHRpbWVcbiAgICAvLyBiZWNhdXNlIG9mIG5ldHdvcmsgbGF0ZW5jaWVzLlxuXG4gICAgc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdmFyIGh0bWxTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBodG1sU3RyaW5nXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCBodG1sU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSk7XG5cbi8vIEFkZCBvdXIgdGVtcGxhdGUgZm9yIG91ciBuZXR3b3JrZWQgb2JqZWN0IHRvIHRoZSBhLWZyYW1lIGFzc2V0cyBvYmplY3QsXG4vLyBhbmQgYSBzY2hlbWEgdG8gdGhlIE5BRi5zY2hlbWFzLiAgQm90aCBtdXN0IGJlIHRoZXJlIHRvIGhhdmUgY3VzdG9tIGNvbXBvbmVudHMgd29ya1xuXG5jb25zdCBhc3NldHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiYS1hc3NldHNcIik7XG5cbmFzc2V0cy5pbnNlcnRBZGphY2VudEhUTUwoXG4gICAgJ2JlZm9yZWVuZCcsXG4gICAgYFxuICAgIDx0ZW1wbGF0ZSBpZD1cInNjcmlwdC1kYXRhLW1lZGlhXCI+XG4gICAgICA8YS1lbnRpdHlcbiAgICAgICAgc2NyaXB0LWRhdGFcbiAgICAgID48L2EtZW50aXR5PlxuICAgIDwvdGVtcGxhdGU+XG4gIGBcbiAgKVxuXG5jb25zdCB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSA9IGVwc2lsb24gPT4ge1xuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRsZXQgcHJldiA9IG51bGw7XG5cdFx0XHRyZXR1cm4gY3VyciA9PiB7XG5cdFx0XHRcdGlmIChwcmV2ID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cHJldiA9IG5ldyBUSFJFRS5WZWN0b3IzKGN1cnIueCwgY3Vyci55LCBjdXJyLnopO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFOQUYudXRpbHMuYWxtb3N0RXF1YWxWZWMzKHByZXYsIGN1cnIsIGVwc2lsb24pKSB7XG5cdFx0XHRcdFx0cHJldi5jb3B5KGN1cnIpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH07XG5cdFx0fTtcblx0fTtcblxuTkFGLnNjaGVtYXMuYWRkKHtcbiAgXHR0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICBjb21wb25lbnRzOiBbXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwicm90YXRpb25cIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIC8vIHtcbiAgICAvLyAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgLy8gICAgIHByb3BlcnR5OiBcInNjYWxlXCIsXG4gICAgLy8gICAgIHJlcXVpcmVzTmV0d29ya1VwZGF0ZTogdmVjdG9yUmVxdWlyZXNVcGRhdGUoMC4wMDEpXG4gICAgLy8gfSxcbiAgICB7XG4gICAgICBcdGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgXHRwcm9wZXJ0eTogXCJzY3JpcHRkYXRhXCJcbiAgICB9XSxcbiAgICAgIG5vbkF1dGhvcml6ZWRDb21wb25lbnRzOiBbXG4gICAgICB7XG4gICAgICAgICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgICAgfVxuICAgIF0sXG5cbiAgfSk7XG5cbiIsImltcG9ydCAnLi4vc3lzdGVtcy9mYWRlci1wbHVzLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BvcnRhbC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BhcmFsbGF4LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3NoYWRlci50cydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9odG1sLXNjcmlwdC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMnXG5cbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywgJ2ltbWVyc2l2ZS0zNjAnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsICdwb3J0YWwnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3NoYWRlcicsICdzaGFkZXInKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4JywgJ3BhcmFsbGF4JylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdodG1sLXNjcmlwdCcsICdodG1sLXNjcmlwdCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncmVnaW9uLWhpZGVyJywgJ3JlZ2lvbi1oaWRlcicpXG5cbi8vIGRvIGEgc2ltcGxlIG1vbmtleSBwYXRjaCB0byBzZWUgaWYgaXQgd29ya3NcblxuLy8gdmFyIG15aXNNaW5lT3JMb2NhbCA9IGZ1bmN0aW9uICh0aGF0KSB7XG4vLyAgICAgcmV0dXJuICF0aGF0LmVsLmNvbXBvbmVudHMubmV0d29ya2VkIHx8ICh0aGF0Lm5ldHdvcmtlZEVsICYmIE5BRi51dGlscy5pc01pbmUodGhhdC5uZXR3b3JrZWRFbCkpO1xuLy8gIH1cblxuLy8gIHZhciB2aWRlb0NvbXAgPSBBRlJBTUUuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4vLyAgdmlkZW9Db21wLkNvbXBvbmVudC5wcm90b3R5cGUuaXNNaW5lT3JMb2NhbCA9IG15aXNNaW5lT3JMb2NhbDtcblxuLy8gYWRkIHRoZSByZWdpb24taGlkZXIgdG8gdGhlIHNjZW5lXG4vLyBjb25zdCBzY2VuZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJhLXNjZW5lXCIpO1xuLy8gc2NlbmUuc2V0QXR0cmlidXRlKFwicmVnaW9uLWhpZGVyXCIsIHtzaXplOiAxMDB9KXJyIl0sIm5hbWVzIjpbIndvcmxkQ2FtZXJhIiwid29ybGRTZWxmIiwiZ2xzbCIsInZlcnRleFNoYWRlciIsInNub2lzZSIsImZyYWdtZW50U2hhZGVyIiwiZGVmYXVsdEhvb2tzIiwidW5pZm9ybXMiLCJsb2FkZXIiLCJub2lzZVRleCIsInNtYWxsTm9pc2UiLCJNYXRlcmlhbE1vZGlmaWVyIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRTtBQUNwQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFO0FBQ2xELElBQUksUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO0FBQzlDLElBQUksS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFO0FBQzlDLEdBQUc7QUFDSDtBQUNBLEVBQUUsSUFBSSxHQUFHO0FBQ1QsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJO0FBQy9CLE1BQU0sSUFBSSxLQUFLLENBQUMsV0FBVyxFQUFFO0FBQzdCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUM7QUFDbEMsUUFBUSxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLO0FBQzlCLFFBQVEsSUFBSSxFQUFFLEtBQUssQ0FBQyxRQUFRO0FBQzVCLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFDbEIsUUFBUSxXQUFXLEVBQUUsSUFBSTtBQUN6QixRQUFRLEdBQUcsRUFBRSxLQUFLO0FBQ2xCLE9BQU8sQ0FBQztBQUNSLE1BQUs7QUFDTCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDbkMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxLQUFJO0FBQ3ZCLElBQUksSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUk7QUFDakMsSUFBSSxJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUM7QUFDeEIsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFDO0FBQzVCLElBQUksSUFBSSxDQUFDLElBQUksR0FBRyxLQUFJO0FBQ3BCLEdBQUc7QUFDSDtBQUNBLEVBQUUsT0FBTyxHQUFHO0FBQ1osSUFBSSxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDO0FBQ3RDLEdBQUc7QUFDSDtBQUNBLEVBQUUsTUFBTSxHQUFHO0FBQ1gsSUFBSSxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO0FBQ3JDLEdBQUc7QUFDSDtBQUNBLEVBQUUsTUFBTSxlQUFlLENBQUMsU0FBUyxFQUFFO0FBQ25DLElBQUksSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFO0FBQzdCLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQztBQUMvRCxLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFDO0FBQ3JEO0FBQ0EsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsR0FBRyxLQUFLO0FBQ2hDLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLE1BQU0sU0FBUyxJQUFJLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7QUFDdEUsUUFBUSxHQUFHLEdBQUU7QUFDYixPQUFPLE1BQU07QUFDYixRQUFRLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBRztBQUNqQyxPQUFPO0FBQ1AsS0FBSyxDQUFDO0FBQ04sR0FBRztBQUNIO0FBQ0EsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRTtBQUNkLElBQUksTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFRO0FBQ2xDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEtBQUssS0FBSyxJQUFJLEdBQUcsQ0FBQyxPQUFPLEtBQUssRUFBQztBQUMxRSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNO0FBQ2xDO0FBQ0EsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxLQUFLLElBQUksRUFBRTtBQUN0QyxNQUFNLEdBQUcsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLE9BQU8sR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBQztBQUM1RixLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsS0FBSyxLQUFLLEVBQUU7QUFDOUMsTUFBTSxHQUFHLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUM7QUFDNUYsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLEdBQUcsQ0FBQyxPQUFPLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQ2hELE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsS0FBSyxNQUFNLEVBQUU7QUFDMUMsUUFBUSxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUU7QUFDakMsVUFBVSxJQUFJLENBQUMsY0FBYyxHQUFFO0FBQy9CLFVBQVUsSUFBSSxDQUFDLGNBQWMsR0FBRyxLQUFJO0FBQ3BDLFNBQVM7QUFDVCxPQUFPO0FBQ1A7QUFDQSxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsRUFBQztBQUMvRCxLQUFLO0FBQ0wsR0FBRztBQUNILENBQUM7O0FDN0VELE1BQU1BLGFBQVcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDdkMsTUFBTUMsV0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUNyQztBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsRUFBRTtBQUM3QyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO0FBQzFDLEdBQUc7QUFDSCxFQUFFLElBQUksR0FBRztBQUNULElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFLO0FBQ3ZCLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFNO0FBQ3hDLEdBQUc7QUFDSCxFQUFFLElBQUksR0FBRztBQUNULElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQ0QsYUFBVyxFQUFDO0FBQzdDLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUNDLFdBQVMsRUFBQztBQUNoRCxJQUFJLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFNO0FBQ2pDLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBR0QsYUFBVyxDQUFDLFVBQVUsQ0FBQ0MsV0FBUyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFNO0FBQ3RFLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFDO0FBQ2pFLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFDO0FBQ2pFLEdBQUc7QUFDSCxDQUFDOztBQ25CRCxNQUFNQyxNQUFJLEdBQUcsQ0FBQztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQSxNQUFNQSxNQUFJLEdBQUcsQ0FBQztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxNQUFJLEdBQUcsQ0FBQztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdHQTtBQUNBO0FBQ0E7QUFDTyxTQUFTLHlCQUF5QixDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUU7QUFDM0QsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksRUFBRSxDQUFDO0FBQ3RFLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNsRixJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZELENBQUM7QUFDRDtBQUNPLFNBQVMsMkJBQTJCLENBQUMsU0FBUyxFQUFF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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxFQUFFLENBQUM7QUFDSDs7QUNwTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQSxNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFDO0FBQzFDO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRTtBQUNyQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFO0FBQzlDLElBQUksZ0JBQWdCLEVBQUUsRUFBRSxJQUFJLEVBQUUs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QUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUU7UUFDOUIsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUU7UUFDbEMsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxVQUFVLEVBQUU7UUFDMUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFnQyxDQUFDLENBQUksRUFBRTtRQUM1RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRTtRQUNwQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNwRCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RCxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRTtRQUNsQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFB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
