import { vueComponents } from 'https://resources.realitymedia.digital/vue-apps/dist/hubs.js';

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
    fuzz: { type: 'number', default: 0.1 },
    Yoffset: { type: 'number', default: 0 },
  },
  init() {
    this.inZone = false;
    this.camera = this.el.sceneEl.camera;
  },
  tick() {
    this.camera.getWorldPosition(worldCamera$1);
    this.el.object3D.getWorldPosition(worldSelf$1);
    const wasInzone = this.inZone;

    worldCamera$1.y -= this.data.Yoffset;
    var dist = worldCamera$1.distanceTo(worldSelf$1);
    var threshold = this.data.radius + (this.inZone ? this.data.fuzz  : 0);
    this.inZone = dist < threshold;
    if (this.inZone && !wasInzone) this.el.emit('proximityenter');
    if (!this.inZone && wasInzone) this.el.emit('proximityleave');
  },
});

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

            let cls = class ${ClassName} extends BaseClass {
                constructor( params ){
                    super(params)
    
                    this.uniforms = cloneUniforms( uniforms );
    
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    this.setValues( params );
                }
    
                copy( source ){
    
                    super.copy(source );
    
                    this.uniforms = Object.assign( {}, source.uniforms );
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    return this;
    
                }
    
            }
            // var cls = function ${ClassName}( params ){

            //     //BaseClass.prototype.constructor.call( this, params );

            //     this.uniforms = cloneUniforms( uniforms );

            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     this.setValues( params );

            // }

            // cls.prototype = Object.create( BaseClass.prototype );
            // cls.prototype.constructor = cls;
            // cls.prototype.${def.TypeCheck} = true;

            // cls.prototype.copy = function( source ){

            //     BaseClass.prototype.copy.call( this, source );

            //     this.uniforms = Object.assign( {}, source.uniforms );
            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     return this;

            // }

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
const glsl$e = String.raw;
const uniforms$6 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$8 = new THREE.TextureLoader();
var bayerTex;
loader$8.load(bayerImage, (bayer) => {
    bayer.minFilter = THREE.NearestFilter;
    bayer.magFilter = THREE.NearestFilter;
    bayer.wrapS = THREE.RepeatWrapping;
    bayer.wrapT = THREE.RepeatWrapping;
    bayerTex = bayer;
});
let BleepyBlocksShader = {
    uniforms: uniforms$6,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$e `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$e `
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
const glsl$d = String.raw;
let NoiseShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$d `
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
const glsl$c = String.raw;
let LiquidMarbleShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$c `
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
const glsl$b = String.raw;
const uniforms$5 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$7 = new THREE.TextureLoader();
var noiseTex$3;
loader$7.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$3 = noise;
});
let GalaxyShader = {
    uniforms: uniforms$5,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$b `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$b `
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
const glsl$a = String.raw;
const uniforms$4 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$6 = new THREE.TextureLoader();
var noiseTex$2;
loader$6.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$2 = noise;
});
let LaceTunnelShader = {
    uniforms: uniforms$4,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$a `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$a `
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
const glsl$9 = String.raw;
const uniforms$3 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannelResolution: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] }
});
const loader$5 = new THREE.TextureLoader();
var noiseTex$1;
loader$5.load(smallNoise, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$1 = noise;
    console.log("noise texture size: ", noise.image.width, noise.image.height);
});
let FireTunnelShader = {
    uniforms: uniforms$3,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$9 `
      uniform sampler2D iChannel0;
      uniform vec3 iChannelResolution[4];
        `,
        functions: glsl$9 `
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
const glsl$8 = String.raw;
let MistShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$8 `

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

const glsl$7 = String.raw;
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
        uniforms: glsl$7 `
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
        functions: glsl$7 `
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
        replaceMap: glsl$7 `
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
const glsl$6 = String.raw;
const uniforms$2 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannel1: { value: null }
});
const loader$4 = new THREE.TextureLoader();
var noiseTex;
loader$4.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex = noise;
});
var notFoundTex;
loader$4.load(notFound, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    notFoundTex = noise;
});
let NotFoundShader = {
    uniforms: uniforms$2,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$6 `
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        `,
        functions: glsl$6 `
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

var warpfx = "https://resources.realitymedia.digital/core-components/481a92b44e56dad4.png";

const glsl$5 = String.raw;
const uniforms$1 = {
    warpTime: { value: 0 },
    warpTex: { value: null },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 }
};
const loader$3 = new THREE.TextureLoader();
var warpTex$1;
loader$3.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestFilter;
    warp.magFilter = THREE.NearestFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex$1 = warp;
});
let WarpShader = {
    uniforms: uniforms$1,
    vertexShader: {},
    fragmentShader: {
        uniforms: glsl$5 `
        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 
                `,
        replaceMap: glsl$5 `
          float t = warpTime;

          vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

          if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
          if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
          if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
          uv.x = clamp(uv.x, 0.0, 1.0);
          uv.y = clamp(uv.y, 0.0, 1.0);
  
          vec2 scaledUV = uv * 2.0 - 1.0;
          vec2 puv = vec2(length(scaledUV.xy), atan(scaledUV.x, scaledUV.y));
          vec4 col = texture2D(warpTex, vec2(log(puv.x) + t / 5.0, puv.y / 3.1415926 ));
          float glow = (1.0 - puv.x) * (0.5 + (sin(t) + 2.0 ) / 4.0);
          // blue glow
          col += vec4(118.0/255.0, 144.0/255.0, 219.0/255.0, 1.0) * (0.4 + glow * 1.0);
          // white glow
          col += vec4(0.2) * smoothstep(0.0, 2.0, glow * glow);
          
          col = mapTexelToLinear( col );
          diffuseColor *= col;
        `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
        material.uniforms.warpTex.value = warpTex$1;
        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.warpTex.value = warpTex$1;
    }
};

/*
 * 3D Simplex noise
 * SIGNATURE: float snoise(vec3 v)
 * https://github.com/hughsk/glsl-noise
 */
const glsl$4 = `
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

const glsl$3 = String.raw;
const uniforms = {
    warpTime: { value: 0 },
    warpTex: { value: null },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 },
    portalCubeMap: { value: new THREE.CubeTexture() },
    portalTime: { value: 0 },
    portalRadius: { value: 0.5 },
    portalRingColor: { value: new THREE.Color("red") },
    invertWarpColor: { value: 0 },
    texInvSize: { value: new THREE.Vector2(1, 1) }
};
let cubeMap = new THREE.CubeTexture();
const loader$2 = new THREE.TextureLoader();
var warpTex;
loader$2.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestMipmapNearestFilter;
    warp.magFilter = THREE.NearestMipmapNearestFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex = warp;
    cubeMap.images = [warp.image, warp.image, warp.image, warp.image, warp.image, warp.image];
    cubeMap.needsUpdate = true;
});
let WarpPortalShader = {
    uniforms: uniforms,
    vertexShader: {
        uniforms: glsl$3 `
        varying vec3 vRay;
        varying vec3 portalNormal;
        //varying vec3 cameraLocal;
        `,
        postTransform: glsl$3 `
        // vec3 cameraLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vec3 cameraLocal = (inverse(modelViewMatrix) * vec4(0.0,0.0,0.0, 1.0)).xyz;
        vRay = position - cameraLocal;
        if (vRay.z < 0.0) {
            vRay.z = -vRay.z;
            vRay.x = -vRay.x;
        }
        //vRay = vec3(mvPosition.x, mvPosition.y, mvPosition.z);
        portalNormal = normalize(-1. * vRay);
        //float portal_dist = length(cameraLocal);
        float portal_dist = length(vRay);
        vRay.z *= 1.1 / (1. + pow(portal_dist, 0.5)); // Change FOV by squashing local Z direction
      `
    },
    fragmentShader: {
        functions: glsl$4,
        uniforms: glsl$3 `
        uniform samplerCube portalCubeMap;
        uniform float portalRadius;
        uniform vec3 portalRingColor;
        uniform float portalTime;
        uniform int invertWarpColor;

        uniform vec2 texInvSize;

        varying vec3 vRay;
        varying vec3 portalNormal;
       // varying vec3 cameraLocal;

        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 

        #define RING_WIDTH 0.1
        #define RING_HARD_OUTER 0.01
        #define RING_HARD_INNER 0.08
        `,
        replaceMap: glsl$3 `
          float t = warpTime;

          vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

          if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
          if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
          if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
          uv.x = clamp(uv.x, 0.0, 1.0);
          uv.y = clamp(uv.y, 0.0, 1.0);
  
          vec2 scaledUV = uv * 2.0 - 1.0;
          vec2 puv = vec2(length(scaledUV.xy), atan(scaledUV.x, scaledUV.y));
          vec4 col = texture2D(warpTex, vec2(log(puv.x) + t / 5.0, puv.y / 3.1415926 ));

          float glow = (1.0 - puv.x) * (0.5 + (sin(t) + 2.0 ) / 4.0);
          // blue glow
          col += vec4(118.0/255.0, 144.0/255.0, 219.0/255.0, 1.0) * (0.4 + glow * 1.0);
          // white glow
          col += vec4(0.2) * smoothstep(0.0, 2.0, glow * glow);
          col = mapTexelToLinear( col );
         
          if (invertWarpColor > 0) {
              col = vec4(col.b, col.g, col.r, col.a);
          }

          /// portal shader effect
          vec2 portal_coord = vUv * 2.0 - 1.0;
          float portal_noise = snoise(vec3(portal_coord * 1., portalTime)) * 0.5 + 0.5;
        
          // Polar distance
          float portal_dist = length(portal_coord);
          portal_dist += portal_noise * 0.2;
        
          float maskOuter = 1.0 - smoothstep(portalRadius - RING_HARD_OUTER, portalRadius, portal_dist);
          float maskInner = 1.0 - smoothstep(portalRadius - RING_WIDTH, portalRadius - RING_WIDTH + RING_HARD_INNER, portal_dist);
          float portal_distortion = smoothstep(portalRadius - 0.2, portalRadius + 0.2, portal_dist);
          
          vec3 portalnormal = normalize(portalNormal);
          vec3 forwardPortal = vec3(0.0, 0.0, -1.0);

          float portal_directView = smoothstep(0.0, 0.8, dot(portalnormal, forwardPortal));
          vec3 portal_tangentOutward = normalize(vec3(portal_coord, 0.0));
          vec3 portal_ray = mix(vRay, portal_tangentOutward, portal_distortion);

          vec4 myCubeTexel = textureCube(portalCubeMap, portal_ray);

        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x - texInvSize.s, portal_ray.yz))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x - texInvSize.s, portal_ray.yz))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x, portal_ray.y - texInvSize.t, portal_ray.z))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x, portal_ray.y - texInvSize.t, portal_ray.z))) / 8.0;        

          myCubeTexel = mapTexelToLinear( myCubeTexel );

        //   vec4 posCol = vec4(smoothstep(-6.0, 6.0, cameraLocal), 1.0); //normalize((cameraLocal / 6.0));
        //   myCubeTexel = posCol; // vec4(posCol.x, posCol.y, posCol.y, 1.0);
          vec3 centerLayer = myCubeTexel.rgb * maskInner;
          vec3 ringLayer = portalRingColor * (1. - maskInner);
          vec3 portal_composite = centerLayer + ringLayer;
        
          //gl_FragColor 
          vec4 portalCol = vec4(portal_composite, (maskOuter - maskInner) + maskInner * portal_directView);
        
          // blend the two
          portalCol.rgb *= portalCol.a; //premultiply source 
          col.rgb *= (1.0 - portalCol.a);
          col.rgb += portalCol.rgb;

          diffuseColor *= col;
        `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map && mat.map.repeat ? mat.map.repeat : new THREE.Vector2(1, 1) };
        material.uniforms.texOffset = { value: mat.map && mat.map.offset ? mat.map.offset : new THREE.Vector2(0, 0) };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map && mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
        material.uniforms.warpTex.value = warpTex;
        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 };
        material.uniforms.portalTime = { value: 0 };
        material.uniforms.invertWarpColor = { value: mat.userData.invertWarpColor ? mat.userData.invertWarpColor : false };
        material.uniforms.portalRingColor = { value: mat.userData.ringColor ? mat.userData.ringColor : new THREE.Color("red") };
        material.uniforms.portalCubeMap = { value: mat.userData.cubeMap ? mat.userData.cubeMap : cubeMap };
        material.uniforms.portalRadius = { value: mat.userData.radius ? mat.userData.radius : 0.5 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.portalTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.warpTex.value = warpTex;
        material.uniforms.portalCubeMap.value = material.userData.cubeMap ? material.userData.cubeMap : cubeMap;
        material.uniforms.portalRadius.value = material.userData.radius ? material.userData.radius : 0.5;
        if (material.userData.cubeMap && Array.isArray(material.userData.cubeMap.images) && material.userData.cubeMap.images[0]) {
            let height = material.userData.cubeMap.images[0].height;
            let width = material.userData.cubeMap.images[0].width;
            material.uniforms.texInvSize.value = new THREE.Vector2(width, height);
        }
    }
};

/**
 * Various simple shaders
 */
function mapMaterials(object3D, fn) {
    let mesh = object3D;
    if (!mesh.material)
        return;
    if (Array.isArray(mesh.material)) {
        return mesh.material.map(fn);
    }
    else {
        return fn(mesh.material);
    }
}
// TODO:  key a record of new materials, indexed by the original
// material UUID, so we can just return it if replace is called on
// the same material more than once
function replaceMaterial(oldMaterial, shader, userData) {
    //   if (oldMaterial.type != "MeshStandardMaterial") {
    //       console.warn("Shader Component: don't know how to handle Shaders of type '" + oldMaterial.type + "', only MeshStandardMaterial at this time.")
    //       return;
    //   }
    //const material = oldMaterial.clone();
    var CustomMaterial;
    try {
        CustomMaterial = defaultMaterialModifier.extend(oldMaterial.type, {
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
        });
    }
    catch (e) {
        return null;
    }
    // create a new material, initializing the base part with the old material here
    let material = new CustomMaterial();
    switch (oldMaterial.type) {
        case "MeshStandardMaterial":
            THREE.MeshStandardMaterial.prototype.copy.call(material, oldMaterial);
            break;
        case "MeshPhongMaterial":
            THREE.MeshPhongMaterial.prototype.copy.call(material, oldMaterial);
            break;
        case "MeshBasicMaterial":
            THREE.MeshBasicMaterial.prototype.copy.call(material, oldMaterial);
            break;
    }
    material.userData = userData;
    material.needsUpdate = true;
    shader.init(material);
    return material;
}
function updateWithShader(shaderDef, el, target, userData = {}) {
    // mesh would contain the object that is, or contains, the meshes
    var mesh = el.object3DMap.mesh;
    if (!mesh) {
        // if no mesh, we'll search through all of the children.  This would
        // happen if we dropped the component on a glb in spoke
        mesh = el.object3D;
    }
    let materials = [];
    let traverse = (object) => {
        let mesh = object;
        if (mesh.material) {
            mapMaterials(mesh, (material) => {
                if (!target || material.name === target) {
                    let newM = replaceMaterial(material, shaderDef, userData);
                    if (newM) {
                        mesh.material = newM;
                        materials.push(newM);
                    }
                }
            });
        }
        const children = object.children;
        for (let i = 0; i < children.length; i++) {
            traverse(children[i]);
        }
    };
    traverse(mesh);
    return materials;
}
new THREE.Vector3();
new THREE.Vector3(0, 0, 1);
const once$2 = {
    once: true
};
AFRAME.registerComponent('shader', {
    materials: null,
    shaderDef: null,
    schema: {
        name: { type: 'string', default: "noise" },
        target: { type: 'string', default: "" } // if nothing passed, just create some noise
    },
    init: function () {
        var shaderDef;
        switch (this.data.name) {
            case "noise":
                shaderDef = NoiseShader;
                break;
            case "warp":
                shaderDef = WarpShader;
                break;
            case "warp-portal":
                shaderDef = WarpPortalShader;
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
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        let updateMaterials = () => {
            let target = this.data.target;
            if (target.length == 0) {
                target = null;
            }
            this.materials = updateWithShader(shaderDef, this.el, target);
        };
        let initializer = () => {
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    updateMaterials();
                    this.el.removeEventListener("model-loaded", fn);
                };
                this.el.addEventListener("media-loaded", fn);
            }
            else {
                updateMaterials();
            }
        };
        root && root.addEventListener("model-loaded", initializer, once$2);
        this.shaderDef = shaderDef;
    },
    tick: function (time) {
        if (this.shaderDef == null || this.materials == null) {
            return;
        }
        let shaderDef = this.shaderDef;
        this.materials.map((mat) => { shaderDef.updateUniforms(time, mat); });
        // switch (this.data.name) {
        //     case "noise":
        //         break;
        //     case "bleepyblocks":
        //         break;
        //     default:
        //         break;
        // }
        // if (this.shader) {
        //     console.log("fragment shader:", this.material.fragmentShader)
        //     this.shader = null
        // }
    },
});

var goldcolor = "https://resources.realitymedia.digital/core-components/2aeb00b64ae9568f.jpg";

var goldDisplacement = "https://resources.realitymedia.digital/core-components/50a1b6d338cb246e.jpg";

var goldgloss = "https://resources.realitymedia.digital/core-components/aeab2091e4a53e9d.png";

var goldnorm = "https://resources.realitymedia.digital/core-components/0ce46c422f945a96.jpg";

var goldao = "https://resources.realitymedia.digital/core-components/6a3e8b4332d47ce2.jpg";

let SIZE = 1024;
let TARGETWIDTH = SIZE;
let TARGETHEIGHT = SIZE;

window.APP.writeWayPointTextures = function(names) {
    if ( !Array.isArray( names ) ) {
        names = [ names ];
    }

    for ( let k = 0; k < names.length; k++ ) {
        let waypoints = document.getElementsByClassName(names[k]);
        for (let i = 0; i < waypoints.length; i++) {
            if (waypoints[i].components.waypoint) {
                let cubecam = null;
                // 
                // for (let j = 0; j < waypoints[i].object3D.children.length; j++) {
                //     if (waypoints[i].object3D.children[j] instanceof CubeCameraWriter) {
                //         console.log("found waypoint with cubeCamera '" + names[k] + "'")
                //         cubecam = waypoints[i].object3D.children[j]
                //         break;
                //     }
                // }
                // if (!cubecam) {
                    console.log("didn't find waypoint with cubeCamera '" + names[k] + "', creating one.");                    // create a cube map camera and render the view!
                    if (THREE.REVISION < 125) {   
                        cubecam = new CubeCameraWriter(0.1, 1000, SIZE);
                    } else {
                        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( SIZE, { encoding: THREE.sRGBEncoding, generateMipmaps: true } );
                        cubecam = new CubeCameraWriter(1, 100000, cubeRenderTarget);
                    }
        
                    cubecam.position.y = 1.6;
                    cubecam.needsUpdate = true;
                    waypoints[i].object3D.add(cubecam);
                    cubecam.update(window.APP.scene.renderer, 
                                   window.APP.scene.object3D);
                // }                

                cubecam.saveCubeMapSides(names[k]);
                waypoints[i].object3D.remove(cubecam);
                break;
            }
        }
    }
};

class CubeCameraWriter extends THREE.CubeCamera {

    constructor(...args) {
        super(...args);

        this.canvas = document.createElement('canvas');
        this.canvas.width = TARGETWIDTH;
        this.canvas.height = TARGETHEIGHT;
        this.ctx = this.canvas.getContext('2d');
        // this.renderTarget.texture.generateMipmaps = true;
        // this.renderTarget.texture.minFilter = THREE.LinearMipMapLinearFilter;
        // this.renderTarget.texture.magFilter = THREE.LinearFilter;

        // this.update = function( renderer, scene ) {

        //     let [ cameraPX, cameraNX, cameraPY, cameraNY, cameraPZ, cameraNZ ] = this.children;

    	// 	if ( this.parent === null ) this.updateMatrixWorld();

    	// 	if ( this.parent === null ) this.updateMatrixWorld();

    	// 	var currentRenderTarget = renderer.getRenderTarget();

    	// 	var renderTarget = this.renderTarget;
    	// 	//var generateMipmaps = renderTarget.texture.generateMipmaps;

    	// 	//renderTarget.texture.generateMipmaps = false;

    	// 	renderer.setRenderTarget( renderTarget, 0 );
    	// 	renderer.render( scene, cameraPX );

    	// 	renderer.setRenderTarget( renderTarget, 1 );
    	// 	renderer.render( scene, cameraNX );

    	// 	renderer.setRenderTarget( renderTarget, 2 );
    	// 	renderer.render( scene, cameraPY );

    	// 	renderer.setRenderTarget( renderTarget, 3 );
    	// 	renderer.render( scene, cameraNY );

    	// 	renderer.setRenderTarget( renderTarget, 4 );
    	// 	renderer.render( scene, cameraPZ );

    	// 	//renderTarget.texture.generateMipmaps = generateMipmaps;

    	// 	renderer.setRenderTarget( renderTarget, 5 );
    	// 	renderer.render( scene, cameraNZ );

    	// 	renderer.setRenderTarget( currentRenderTarget );
        // };
	}

    saveCubeMapSides(slug) {
        for (let i = 0; i < 6; i++) {
            this.capture(slug, i);
        }
    }
    
    capture (slug, side) {
        //var isVREnabled = window.APP.scene.renderer.xr.enabled;
        window.APP.scene.renderer;
        // Disable VR.
        //renderer.xr.enabled = false;
        this.renderCapture(side);
        // Trigger file download.
        this.saveCapture(slug, side);
        // Restore VR.
        //renderer.xr.enabled = isVREnabled;
     }

    renderCapture (cubeSide) {
        var imageData;
        var pixels3 = new Uint8Array(4 * TARGETWIDTH * TARGETHEIGHT);
        var renderer = window.APP.scene.renderer;

        renderer.readRenderTargetPixels(this.renderTarget, 0, 0, TARGETWIDTH,TARGETHEIGHT, pixels3, cubeSide);

        //pixels3 = this.flipPixelsVertically(pixels3, TARGETWIDTH, TARGETHEIGHT);
        var pixels4 = pixels3;  //this.convert3to4(pixels3, TARGETWIDTH, TARGETHEIGHT);
        imageData = new ImageData(new Uint8ClampedArray(pixels4), TARGETWIDTH, TARGETHEIGHT);

        // Copy pixels into canvas.

        // could use drawImage instead, to scale, if we want
        this.ctx.putImageData(imageData, 0, 0);
    }

    flipPixelsVertically (pixels, width, height) {
        var flippedPixels = pixels.slice(0);
        for (var x = 0; x < width; ++x) {
          for (var y = 0; y < height; ++y) {
            flippedPixels[x * 3 + y * width * 3] = pixels[x * 3 + (height - y - 1) * width * 3];
            flippedPixels[x * 3 + 1 + y * width * 3] = pixels[x * 3 + 1 + (height - y - 1) * width * 3];
            flippedPixels[x * 3 + 2 + y * width * 3] = pixels[x * 3 + 2 + (height - y - 1) * width * 3];
          }
        }
        return flippedPixels;
    }

    convert3to4 (pixels, width, height) {
        var newPixels = new Uint8Array(4 * TARGETWIDTH * TARGETHEIGHT);

        for (var x = 0; x < width; ++x) {
          for (var y = 0; y < height; ++y) {
            newPixels[x * 4 + y * width * 4] = pixels[x * 3 + y * width * 3];
            newPixels[x * 4 + 1 + y * width * 4] = pixels[x * 3 + 1 + y * width * 3];
            newPixels[x * 4 + 2 + y * width * 4] = pixels[x * 3 + 2 + y * width * 3];
            newPixels[x * 4 + 3 + y * width * 4] = 255;
          }
        }
        return newPixels;
    }


    sides = [
        "Right", "Left", "Top", "Bottom", "Front", "Back"
    ]

    saveCapture (slug, side) {
        this.canvas.toBlob( (blob) => {
            var fileName = slug + '-' + this.sides[side] + '.png';
            var linkEl = document.createElement('a');
            var url = URL.createObjectURL(blob);
            linkEl.href = url;
            linkEl.setAttribute('download', fileName);
            linkEl.innerHTML = 'downloading...';
            linkEl.style.display = 'none';
            document.body.appendChild(linkEl);
            setTimeout(function () {
                linkEl.click();
                document.body.removeChild(linkEl);
            }, 1);
        }, 'image/png');
    }
}

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

// load and setup all the bits of the textures for the door
const loader$1 = new THREE.TextureLoader();
const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.0, 
    //emissiveIntensity: 1
});
const doormaterialY = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0, 
    //emissiveIntensity: 1
});

loader$1.load(goldcolor, (color) => {
    doorMaterial.map = color;
    color.repeat.set(1,25);
    color.wrapS = THREE.RepeatWrapping;
    color.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});
loader$1.load(goldcolor, (color) => {
    //color = color.clone()
    doormaterialY.map = color;
    color.repeat.set(1,1);
    color.wrapS = THREE.ClampToEdgeWrapping;
    color.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$1.load(goldDisplacement, (disp) => {
    doorMaterial.bumpMap = disp;
    disp.repeat.set(1,25);
    disp.wrapS = THREE.RepeatWrapping;
    disp.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$1.load(goldDisplacement, (disp) => {
    //disp = disp.clone()
    doormaterialY.bumpMap = disp;
    disp.repeat.set(1,1);
    disp.wrapS = THREE.ClampToEdgeWrapping;
    disp.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$1.load(goldgloss, (gloss) => {
    doorMaterial.roughness = gloss;
    gloss.repeat.set(1,25);
    gloss.wrapS = THREE.RepeatWrapping;
    gloss.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$1.load(goldgloss, (gloss) => {
    //gloss = gloss.clone()
    doormaterialY.roughness = gloss;
    gloss.repeat.set(1,1);
    gloss.wrapS = THREE.ClampToEdgeWrapping;
    gloss.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});
         
loader$1.load(goldao, (ao) => {
    doorMaterial.aoMap = ao;
    ao.repeat.set(1,25);
    ao.wrapS = THREE.RepeatWrapping;
    ao.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});
         
loader$1.load(goldao, (ao) => {
    // ao = ao.clone()
    doormaterialY.aoMap = ao;
    ao.repeat.set(1,1);
    ao.wrapS = THREE.ClampToEdgeWrapping;
    ao.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$1.load(goldnorm, (norm) => {
    doorMaterial.normalMap = norm;
    norm.repeat.set(1,25);
    norm.wrapS = THREE.RepeatWrapping;
    norm.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$1.load(goldnorm, (norm) => {
    // norm = norm.clone()
    doormaterialY.normalMap = norm;
    norm.repeat.set(1,1);
    norm.wrapS = THREE.ClampToEdgeWrapping;
    norm.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

// // map all materials via a callback.  Taken from hubs materials-utils
// function mapMaterials(object3D, fn) {
//     let mesh = object3D 
//     if (!mesh.material) return;
  
//     if (Array.isArray(mesh.material)) {
//       return mesh.material.map(fn);
//     } else {
//       return fn(mesh.material);
//     }
// }
  
const once$1 = {
    once : true
};

AFRAME.registerSystem('portal', {
  dependencies: ['fader-plus'],
  init: function () {
    this.teleporting = false;
    this.characterController = this.el.systems['hubs-systems'].characterController;
    this.fader = this.el.systems['fader-plus'];
    // this.roomData = null
    this.waitForFetch = this.waitForFetch.bind(this);

    // if the user is logged in, we want to retrieve their userData from the top level server
    // if (window.APP.store.state.credentials && window.APP.store.state.credentials.token && !window.APP.userData) {
    //     this.fetchRoomData()
    // }
  },
//   fetchRoomData: async function () {
//     var params = {token: window.APP.store.state.credentials.token,
//                   room_id: window.APP.hubChannel.hubId}

//     const options = {};
//     options.headers = new Headers();
//     options.headers.set("Authorization", `Bearer ${params}`);
//     options.headers.set("Content-Type", "application/json");
//     await fetch("https://realitymedia.digital/userData", options)
//         .then(response => response.json())
//         .then(data => {
//           console.log('Success:', data);
//           this.roomData = data;
//     })
//     this.roomData.textures = []
//   },
  getRoomURL: async function (number) {
      let hub_id = await this.getRoomHubId(number);

      let url = window.SSO.userInfo.rooms.length > number ? "https://xr.realitymedia.digital/" + hub_id : null;
      return url
  },
  getRoomHubId: async function (number) {
    this.waitForFetch();
    return window.SSO.userInfo.rooms[number]
  },
  getCubeMap: async function (number, waypoint) {
      this.waitForFetch();

      if (!waypoint || waypoint.length == 0) {
          waypoint = "start";
      }
      let urls = ["Right","Left","Top","Bottom","Front","Back"].map(el => {
          return "https://resources.realitymedia.digital/data/roomPanos/" + number.toString() + "/" + waypoint + "-" + el + ".png"
      });
      return urls
      //return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  getCubeMapByName: async function (name, waypoint) {
    if (!waypoint || waypoint.length == 0) {
        waypoint = "start";
    }
    let urls = ["Right","Left","Top","Bottom","Front","Back"].map(el => {
        return "https://resources.realitymedia.digital/data/roomPanos/" + name + "/" + waypoint + "-" + el + ".png"
    });
    return urls
    //return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  waitForFetch: function () {
     if (window.SSO.userInfo) return
     setTimeout(this.waitForFetch, 100); // try again in 100 milliseconds
  },
  teleportTo: async function (object) {
    this.teleporting = true;
    await this.fader.fadeOut();
    // Scale screws up the waypoint logic, so just send position and orientation
    object.getWorldQuaternion(worldQuat);
    object.getWorldDirection(worldDir);
    object.getWorldPosition(worldPos);
    worldPos.add(worldDir.multiplyScalar(3)); // Teleport in front of the portal to avoid infinite loop
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
        secondaryTarget: { default: "" },
        color: { type: 'color', default: null },
        materialTarget: { type: 'string', default: null },
        drawDoor: { type: 'boolean', default: false },
        text: { type: 'string', default: null},
        textPosition: { type: 'vec3' },
        textSize: { type: 'vec2' },
        textScale: { type: 'number', default: 1 }
    },

    init: function () {
        // TESTING
        //this.data.drawDoor = true
        // this.data.mainText = "Portal to the Abyss"
        // this.data.secondaryText = "To visit the Abyss, go through the door!"

        // A-Frame is supposed to do this by default but doesn't seem to?
        this.system = window.APP.scene.systems.portal; 

        if (this.data.portalType.length > 0 ) {
            this.setPortalInfo(this.data.portalType, this.data.portalTarget, this.data.color);
        } else {
            this.portalType = 0;
        }

        if (this.portalType == 0) {
            // parse the name to get portal type, target, and color
            this.parseNodeName();
        }
        
        this.portalTitle = null;

        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", (ev) => { 
            this.initialize();
        }, once$1);
    },

    initialize: async function () {
        // this.material = new THREE.ShaderMaterial({
        //   transparent: true,
        //   side: THREE.DoubleSide,
        //   uniforms: {
        //     cubeMap: { value: new THREE.Texture() },
        //     time: { value: 0 },
        //     radius: { value: 0 },
        //     ringColor: { value: this.color },
        //   },
        //   vertexShader,
        //   fragmentShader: `
        //     ${snoise}
        //     ${fragmentShader}
        //   `,
        // })

        // Assume that the object has a plane geometry
        //const mesh = this.el.getOrCreateObject3D('mesh')
        //mesh.material = this.material

        this.materials = null;
        this.radius = 0.2;
        this.cubeMap = new THREE.CubeTexture();

        // get the other before continuing
        this.other = await this.getOther();

        this.el.setAttribute('animation__portal', {
            property: 'components.portal.radius',
            dur: 700,
            easing: 'easeInOutCubic',
        });
        
        // this.el.addEventListener('animationbegin', () => (this.el.object3D.visible = true))
        // this.el.addEventListener('animationcomplete__portal', () => (this.el.object3D.visible = !this.isClosed()))

        // going to want to try and make the object this portal is on clickable
        // this.el.setAttribute('is-remote-hover-target','')
        // this.el.setAttribute('tags', {singleActionButton: true})
        //this.el.setAttribute('class', "interactable")
        // orward the 'interact' events to our portal movement 
        //this.followPortal = this.followPortal.bind(this)
        //this.el.object3D.addEventListener('interact', this.followPortal)

        if ( this.el.components["media-loader"] || this.el.components["media-image"] ) {
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    this.setupPortal();
                    if (this.data.drawDoor) {
                        this.setupDoor();
                    }
                    this.el.removeEventListener('model-loaded', fn);
                 };
                this.el.addEventListener("media-loaded", fn);
            } else {
                this.setupPortal();
                if (this.data.drawDoor) {
                    this.setupDoor();
                }
            }
        } else {
            this.setupPortal();
            if (this.data.drawDoor) {
                this.setupDoor();
            }
        }
    },

    setupPortal: async function () {
        // get rid of interactivity
        if (this.el.classList.contains("interactable")) {
            this.el.classList.remove("interactable");
        }
        this.el.removeAttribute("is-remote-hover-target");
        
        let target = this.data.materialTarget;
        if (target && target.length == 0) {target=null;}
    
        this.materials = updateWithShader(WarpPortalShader, this.el, target, {
            radius: this.radius,
            ringColor: this.color,
            cubeMap: this.cubeMap,
            invertWarpColor: this.portalType == 1 ? 1 : 0
        });

        if (this.portalType == 1) {
            this.system.getCubeMap(this.portalTarget, this.data.secondaryTarget).then( urls => {
                //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
                new Promise((resolve, reject) =>
                  new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
                ).then(texture => {
                    texture.format = THREE.RGBFormat;
                    //this.material.uniforms.cubeMap.value = texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = texture;})
                    this.cubeMap = texture;
                }).catch(e => console.error(e));    
            });
        } else if (this.portalType == 4) {
            this.system.getCubeMapByName(this.portalTarget, this.data.secondaryTarget).then( urls => {
                //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
                new Promise((resolve, reject) =>
                    new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
                ).then(texture => {
                    texture.format = THREE.RGBFormat;
                    //this.material.uniforms.cubeMap.value = texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = texture;})
                    this.cubeMap = texture;
                }).catch(e => console.error(e));    
            });
        } else if (this.portalType == 2 || this.portalType == 3) { 
            if (THREE.REVISION < 125) {   
                this.cubeCamera = new CubeCameraWriter(0.1, 1000, 1024);
            } else {
                const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( 1024, { encoding: THREE.sRGBEncoding, generateMipmaps: true } );
                this.cubeCamera = new CubeCameraWriter(1, 100000, cubeRenderTarget);
            }

            //this.cubeCamera.rotateY(Math.PI) // Face forwards
            if (this.portalType == 2) {
                this.el.object3D.add(this.cubeCamera);
                // this.other.components.portal.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture 
                //this.other.components.portal.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                this.other.components.portal.cubeMap = this.cubeCamera.renderTarget.texture;
            } else {
                let waypoint = document.getElementsByClassName(this.portalTarget);
                if (waypoint.length > 0) {
                    waypoint = waypoint.item(0);
                    this.cubeCamera.position.y = 1.6;
                    this.cubeCamera.needsUpdate = true;
                    waypoint.object3D.add(this.cubeCamera);
                    // this.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                    this.cubeMap = this.cubeCamera.renderTarget.texture;
                }
            }
            //this.el.sceneEl.addEventListener('model-loaded', () => {
                showRegionForObject(this.el);
                this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D);
                // this.cubeCamera.renderTarget.texture.generateMipmaps = true
                // this.cubeCamera.renderTarget.texture.needsUpdate = true
                hiderRegionForObject(this.el);
            //}, once)
        }

        let scaleM = this.el.object3DMap["mesh"].scale;
        let scaleI = this.el.object3D.scale;
        let scaleX = scaleM.x * scaleI.x;
        let scaleY = scaleM.y * scaleI.y;
        let scaleZ = scaleM.z * scaleI.z;

        // this.portalWidth = scaleX / 2
        // this.portalHeight = scaleY / 2

        // offset to center of portal assuming walking on ground
        // this.Yoffset = -(this.el.object3D.position.y - 1.6)
        this.Yoffset = -(scaleY/2 - 1.6);

        this.el.setAttribute('proximity-events', { radius: 4, Yoffset: this.Yoffset });
        this.el.addEventListener('proximityenter', () => this.open());
        this.el.addEventListener('proximityleave', () => this.close());

        this.el.setObject3D.matrixAutoUpdate = true;
    
        if (this.data.text && this.data.text.length > 0) {
            var titleScriptData = {
                width: this.data.textSize.x,
                height: this.data.textSize.y,
                message: this.data.text
            };
            const portalTitle = vueComponents["PortalTitle"];
            // const portalSubtitle = htmlComponents["PortalSubtitle"]

            this.portalTitle = await portalTitle(titleScriptData);
            // this.portalSubtitle = portalSubtitle(subtitleScriptData)

            this.el.setObject3D('portalTitle', this.portalTitle.webLayer3D);
            let size = this.portalTitle.getSize();
            let titleScaleX = scaleX / this.data.textScale;
            let titleScaleY = scaleY / this.data.textScale;
            let titleScaleZ = scaleZ / this.data.textScale;

            this.portalTitle.webLayer3D.scale.x /= titleScaleX;
            this.portalTitle.webLayer3D.scale.y /= titleScaleY;
            this.portalTitle.webLayer3D.scale.z /= titleScaleZ;

            this.portalTitle.webLayer3D.position.x = this.data.textPosition.x / scaleX;
            this.portalTitle.webLayer3D.position.y = 0.5 + size.height / 2 + this.data.textPosition.y / scaleY;
            this.portalTitle.webLayer3D.position.z = this.data.textPosition.z / scaleY;
            // this.el.setObject3D('portalSubtitle', this.portalSubtitle.webLayer3D)
            // this.portalSubtitle.webLayer3D.position.x = 1
            this.portalTitle.webLayer3D.matrixAutoUpdate = true;
            // this.portalSubtitle.webLayer3D.matrixAutoUpdate = true
        }
        // this.materials.map((mat) => {
        //     mat.userData.radius = this.radius
        //     mat.userData.ringColor = this.color
        //     mat.userData.cubeMap = this.cubeMap
        // })
    },

    remove: function () {
        this.el.removeObject3D("portalTitle");

        this.portalTitle.destroy();
        this.portalTitle = null;

        if (this.cubeMap) {
            this.cubeMap.dispose();
            this.cubeMap = null;
        } 
    },

        //   replaceMaterial: function (newMaterial) {
//     let target = this.data.materialTarget
//     if (target && target.length == 0) {target=null}
    
//     let traverse = (object) => {
//       let mesh = object
//       if (mesh.material) {
//           mapMaterials(mesh, (material) => {         
//               if (!target || material.name === target) {
//                   mesh.material = newMaterial
//               }
//           })
//       }
//       const children = object.children;
//       for (let i = 0; i < children.length; i++) {
//           traverse(children[i]);
//       }
//     }

//     let replaceMaterials = () => {
//         // mesh would contain the object that is, or contains, the meshes
//         var mesh = this.el.object3DMap.mesh
//         if (!mesh) {
//             // if no mesh, we'll search through all of the children.  This would
//             // happen if we dropped the component on a glb in spoke
//             mesh = this.el.object3D
//         }
//         traverse(mesh);
//        // this.el.removeEventListener("model-loaded", initializer);
//     }

//     // let root = findAncestorWithComponent(this.el, "gltf-model-plus")
//     // let initializer = () =>{
//       if (this.el.components["media-loader"]) {
//           this.el.addEventListener("media-loaded", replaceMaterials)
//       } else {
//           replaceMaterials()
//       }
//     // };
//     //replaceMaterials()
//     // root.addEventListener("model-loaded", initializer);
//   },

//   followPortal: function() {
//     if (this.portalType == 1) {
//         console.log("set window.location.href to " + this.other)
//         window.location.href = this.other
//       } else if (this.portalType == 2) {
//         this.system.teleportTo(this.other.object3D)
//       }
//   },

    setupDoor: function() {
        // attached to an image in spoke.  This is the only way we allow buidling a 
        // door around it
        let scaleM = this.el.object3DMap["mesh"].scale;
        let scaleI = this.el.object3D.scale;
        var width = scaleM.x * scaleI.x;
        var height = scaleM.y * scaleI.y;
        var depth = 1.0; //  scaleM.z * scaleI.z

        const environmentMapComponent = this.el.sceneEl.components["environment-map"];

        // let above = new THREE.Mesh(
        //     new THREE.SphereGeometry(1, 50, 50),
        //     doormaterialY 
        // );
        // if (environmentMapComponent) {
        //     environmentMapComponent.applyEnvironmentMap(above);
        // }
        // above.position.set(0, 2.5, 0)
        // this.el.object3D.add(above)

        let left = new THREE.Mesh(
            // new THREE.BoxGeometry(0.1/width,2/height,0.1/depth,2,5,2),
            new THREE.BoxGeometry(0.1/width,1,0.1/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(left);
        }
        left.position.set(-0.51, 0, 0);
        this.el.object3D.add(left);

        let right = new THREE.Mesh(
            new THREE.BoxGeometry(0.1/width,1,0.1/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(right);
        }
        right.position.set(0.51, 0, 0);
        this.el.object3D.add(right);

        let top = new THREE.Mesh(
            new THREE.BoxGeometry(1 + 0.3/width,0.1/height,0.1/depth,2,5,2),
            [doormaterialY,doormaterialY,doorMaterial,doorMaterial,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(top);
        }
        top.position.set(0.0, 0.505, 0);
        this.el.object3D.add(top);

        // if (width > 0 && height > 0) {
        //     const {width: wsize, height: hsize} = this.script.getSize()
        //     var scale = Math.min(width / wsize, height / hsize)
        //     this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
        // }
    },

    tick: function (time) {
        //this.material.uniforms.time.value = time / 1000
        if (!this.materials) { return }

        if (this.portalTitle) {
            this.portalTitle.tick(time);
            // this.portalSubtitle.tick(time)
        }

        this.materials.map((mat) => {
            mat.userData.radius = this.radius;
            mat.userData.cubeMap = this.cubeMap;
            WarpPortalShader.updateUniforms(time, mat);
        });

        if (this.other && !this.system.teleporting) {
        //   this.el.object3D.getWorldPosition(worldPos)
        //   this.el.sceneEl.camera.getWorldPosition(worldCameraPos)
        //   worldCameraPos.y -= this.Yoffset
        //   const dist = worldCameraPos.distanceTo(worldPos)
          this.el.sceneEl.camera.getWorldPosition(worldCameraPos);
          this.el.object3D.worldToLocal(worldCameraPos);

          // in local portal coordinates, the width and height are 1
          if (Math.abs(worldCameraPos.x) > 0.5 || Math.abs(worldCameraPos.y) > 0.5) {
            return;
          }
          const dist = Math.abs(worldCameraPos.z);

          // window.APP.utils.changeToHub
          if ((this.portalType == 1 || this.portalType == 4) && dist < 0.25) {
              if (!this.locationhref) {
                this.locationhref = this.other;
                if (!APP.store.state.preferences.fastRoomSwitching) {
                    console.log("set window.location.href to " + this.other);
                    window.location.href = this.other;
                } else {
                    let wayPoint = this.data.secondaryTarget;
                    document.querySelector("#environment-scene");
                    let goToWayPoint = function() {
                        if (wayPoint && wayPoint.length > 0) {
                            console.log("FAST ROOM SWITCH INCLUDES waypoint: setting hash to " + wayPoint);
                            window.location.hash = wayPoint;
                        }
                    };
                    console.log("FAST ROOM SWITCH. going to " + this.hub_id);
                    if (this.hubId === APP.hub.hub_id) {
                        console.log("Same Room");
                        goToWayPoint();
                    } else {
                        window.changeHub(this.hub_id).then(() => {
                            // environmentScene.addEventListener("model-loaded", () => {
                            //     console.log("Environment scene has loaded");
                                goToWayPoint();
                            // })
                        });
                    }
                }
            }
          } else if (this.portalType == 2 && dist < 0.25) {
            this.system.teleportTo(this.other.object3D);
          } else if (this.portalType == 3) {
              if (dist < 0.25) {
                if (!this.locationhref) {
                  console.log("set window.location.hash to " + this.other);
                  this.locationhref = this.other;
                  window.location.hash = this.other;
                }
              } else {
                  // if we set locationhref, we teleported.  when it
                  // finally happens, and we move outside the range of the portal,
                  // we will clear the flag
                  this.locationhref = null;
              }
          }
        }
      },

    getOther: function () {
        return new Promise((resolve) => {
            if (this.portalType == 0) resolve(null);
            if (this.portalType  == 1) {
                // first wait for the hub_id
                this.system.getRoomHubId(this.portalTarget).then(hub_id => {
                    this.hub_id = hub_id;
            
                    // the target is another room, resolve with the URL to the room
                    this.system.getRoomURL(this.portalTarget).then(url => { 
                        if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                            resolve(url + "#" + this.data.secondaryTarget);
                        } else {
                            resolve(url); 
                        }
                    });
                });
            }
            if (this.portalType == 3) {
                resolve ("#" + this.portalTarget);
            }
            if (this.portalType == 4) {
                let url = window.location.origin + "/" + this.portalTarget;
                this.hub_id = this.portalTarget;
                if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                    resolve(url + "#" + this.data.secondaryTarget);
                } else {
                    resolve(url); 
                }
            }

            // now find the portal within the room.  The portals should come in pairs with the same portalTarget
            const portals = Array.from(document.querySelectorAll(`[portal]`));
            const other = portals.find((el) => el.components.portal.portalType == this.portalType &&
                          el.components.portal.portalTarget === this.portalTarget && 
                          el !== this.el);
            if (other !== undefined) {
                // Case 1: The other portal already exists
                resolve(other);
                other.emit('pair', { other: this.el }); // Let the other know that we're ready
            } else {
                // Case 2: We couldn't find the other portal, wait for it to signal that it's ready
                this.el.addEventListener('pair', (event) => { 
                    resolve(event.detail.other);
                }, { once: true });
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
        } else if (portalType === "waypoint") {
            this.portalType = 3;
            this.portalTarget = portalTarget;
        } else if (portalType === "roomName") {
            this.portalType = 4;
            this.portalTarget = portalTarget;
        } else {    
            this.portalType = 0;
            this.portalTarget = null;
        } 
        this.color = new THREE.Color(color);
    },

    setRadius(val) {
        this.el.setAttribute('animation__portal', {
        //   from: this.material.uniforms.radius.value,
            from: this.radius,
            to: val,
        });
    },
    open() {
        this.setRadius(1);
    },
    close() {
        this.setRadius(0.2);
    },
    isClosed() {
        // return this.material.uniforms.radius.value === 0
        return this.radius === 0.2
    },
});

var ballfx = "https://resources.realitymedia.digital/core-components/e1702ea21afb4a86.png";

const glsl$2 = `
varying vec2 ballvUv;
varying vec3 ballvPosition;
varying vec3 ballvNormal;
varying vec3 ballvWorldPos;
uniform float ballTime;
uniform float selected;

mat4 ballinverse(mat4 m) {
  float
      a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
      a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
      a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
      a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  return mat4(
      a11 * b11 - a12 * b10 + a13 * b09,
      a02 * b10 - a01 * b11 - a03 * b09,
      a31 * b05 - a32 * b04 + a33 * b03,
      a22 * b04 - a21 * b05 - a23 * b03,
      a12 * b08 - a10 * b11 - a13 * b07,
      a00 * b11 - a02 * b08 + a03 * b07,
      a32 * b02 - a30 * b05 - a33 * b01,
      a20 * b05 - a22 * b02 + a23 * b01,
      a10 * b10 - a11 * b08 + a13 * b06,
      a01 * b08 - a00 * b10 - a03 * b06,
      a30 * b04 - a31 * b02 + a33 * b00,
      a21 * b02 - a20 * b04 - a23 * b00,
      a11 * b07 - a10 * b09 - a12 * b06,
      a00 * b09 - a01 * b07 + a02 * b06,
      a31 * b01 - a30 * b03 - a32 * b00,
      a20 * b03 - a21 * b01 + a22 * b00) / det;
}


mat4 balltranspose(in mat4 m) {
  vec4 i0 = m[0];
  vec4 i1 = m[1];
  vec4 i2 = m[2];
  vec4 i3 = m[3];

  return mat4(
    vec4(i0.x, i1.x, i2.x, i3.x),
    vec4(i0.y, i1.y, i2.y, i3.y),
    vec4(i0.z, i1.z, i2.z, i3.z),
    vec4(i0.w, i1.w, i2.w, i3.w)
  );
}

void main()
{
  ballvUv = uv;

  ballvPosition = position;

  vec3 offset = vec3(
    sin(position.x * 50.0 + ballTime),
    sin(position.y * 10.0 + ballTime * 2.0),
    cos(position.z * 40.0 + ballTime)
  ) * 0.003;

   ballvPosition *= 1.0 + selected * 0.2;

   ballvNormal = normalize(ballinverse(balltranspose(modelMatrix)) * vec4(normalize(normal), 1.0)).xyz;
   ballvWorldPos = (modelMatrix * vec4(ballvPosition, 1.0)).xyz;

   vec4 ballvPosition = modelViewMatrix * vec4(ballvPosition + offset, 1.0);

  gl_Position = projectionMatrix * ballvPosition;
}
`;

const glsl$1 = `
uniform sampler2D panotex;
uniform sampler2D texfx;
uniform float ballTime;
uniform float selected;
varying vec2 ballvUv;
varying vec3 ballvPosition;
varying vec3 ballvNormal;
varying vec3 ballvWorldPos;

uniform float opacity;

void main( void ) {
   vec2 uv = ballvUv;
  //uv.y =  1.0 - uv.y;

   vec3 eye = normalize(cameraPosition - ballvWorldPos);
   float fresnel = abs(dot(eye, ballvNormal));
   float shift = pow((1.0 - fresnel), 4.0) * 0.05;

  vec3 col = vec3(
    texture2D(panotex, uv - shift).r,
    texture2D(panotex, uv).g,
    texture2D(panotex, uv + shift).b
  );

   col = mix(col * 0.7, vec3(1.0), 0.7 - fresnel);

   col += selected * 0.3;

   float t = ballTime * 0.4 + ballvPosition.x + ballvPosition.z;
   uv = vec2(ballvUv.x + t * 0.2, ballvUv.y + t);
   vec3 fx = texture2D(texfx, uv).rgb * 0.4;

  //vec4 col = vec4(1.0, 1.0, 0.0, 1.0);
  gl_FragColor = vec4(col + fx, opacity);
  //gl_FragColor = vec4(col + fx, 1.0);
}
`;

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

const loader = new THREE.TextureLoader();
var ballTex = null;
loader.load(ballfx, (ball) => {
    ball.minFilter = THREE.NearestFilter;
    ball.magFilter = THREE.NearestFilter;
    ball.wrapS = THREE.RepeatWrapping;
    ball.wrapT = THREE.RepeatWrapping;
    ballTex = ball;
});

AFRAME.registerComponent('immersive-360', {
  schema: {
    url: { type: 'string', default: null },
  },
  init: async function () {
    var url = this.data.url;
    if (!url || url == "") {
        url = this.parseSpokeName();
    }
    
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

    var ball = new THREE.Mesh(
        new THREE.SphereBufferGeometry(0.15, 30, 20),
        new THREE.ShaderMaterial({
            uniforms: {
              panotex: {value: this.mesh.material.map},
              texfx: {value: ballTex},
              selected: {value: 0},
              ballTime: {value: 0}
            },
            vertexShader: glsl$2,
            fragmentShader: glsl$1,
            side: THREE.BackSide,
          })
    );
   
    ball.rotation.set(Math.PI, 0, 0);
    ball.position.copy(this.mesh.position);
    ball.userData.floatY = this.mesh.position.y + 0.6;
    ball.userData.selected = 0;
    ball.userData.timeOffset = (Math.random()+0.5) * 10;
    this.ball = ball;
    this.el.setObject3D("ball", ball);

    this.mesh.geometry.scale(100, 100, 100);
    this.mesh.material.setValues({
      transparent: true,
      depthTest: false,
    });
    this.mesh.visible = false;

    this.near = 0.8;
    this.far = 1.1;

    // Render OVER the scene but UNDER the cursor
    this.mesh.renderOrder = APP.RENDER_ORDER.CURSOR - 0.1;
  },
  remove: function() {
    this.ball.geometry.dispose();
    this.ball.geometry = null;
    this.ball.material.dispose();
    this.ball.material = null;
    this.el.removeObject3D("ball");
    this.ball = null;
  },
  tick: function (time) {
    if (this.mesh && ballTex) {
      this.ball.position.y = this.ball.userData.floatY + Math.cos((time + this.ball.userData.timeOffset)/1000 * 3 ) * 0.02;
      this.ball.matrixNeedsUpdate = true;

      this.ball.material.uniforms.texfx.value = ballTex;
      this.ball.material.uniforms.ballTime.value = time * 0.001 + this.ball.userData.timeOffset;
      // Linearly map camera distance to material opacity
      this.mesh.getWorldPosition(worldSelf);
      this.el.sceneEl.camera.getWorldPosition(worldCamera);
      const distance = worldSelf.distanceTo(worldCamera);
      const opacity = 1 - (distance - this.near) / (this.far - this.near);
      if (opacity < 0) {
          // far away
          this.mesh.visible = false;
          this.mesh.material.opacity = 1;
          this.ball.material.opacity = 1;
        } else {
            this.mesh.material.opacity = opacity > 1 ? 1 : opacity;
            this.mesh.visible = true;
            this.ball.material.opacity = this.mesh.material.opacity;
        }
    }
  },
  parseSpokeName: function () {
    // Accepted names: "label__image-hash_ext" OR "image-hash_ext"
    const spokeName = this.el.parentEl.parentEl.className;
    const matches = spokeName.match(/(?:.*__)?(.*)_(.*)/);
    if (!matches || matches.length < 3) { return "" }
    const [, hash, extension]  = matches;
    const url = `https://resources.realitymedia.digital/data/${hash}.${extension}`;
    return url
  },
  getMesh: async function () {
    return new Promise((resolve) => {
      const mesh = this.el.object3DMap.mesh;
      if (mesh) resolve(mesh);
      this.el.addEventListener(
        'image-loaded',
        () => {
            console.log("immersive-360 pano loaded: " + this.data.url);
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
        this.systemTick = vueComponents["systemTick"];
        this.initializeEthereal = vueComponents["initializeEthereal"];
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
  
const once = {
    once : true
};
  
AFRAME.registerComponent('html-script', {
    schema: {
        // name must follow the pattern "*_componentName"
        name: { type: "string", default: ""},
        width: { type: "number", default: -1},
        height: { type: "number", default: -1},
        parameter1: { type: "string", default: ""},
        parameter2: { type: "string", default: ""},
        parameter3: { type: "string", default: ""},
        parameter4: { type: "string", default: ""},
    },
    init: function () {
        this.script = null;
        this.fullName = this.data.name;

        this.scriptData = {
            width: this.data.width,
            height: this.data.height,
            parameter1: this.data.parameter1,
            parameter2: this.data.parameter2,
            parameter3: this.data.parameter3,
            parameter4: this.data.parameter4
        };

        if (!this.fullName || this.fullName.length == 0) {
            this.parseNodeName();
        } else {
            this.componentName = this.fullName;
        }

        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", (ev) => { 
            this.createScript();
        }, once);

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
                    this.el.removeAttribute("is-remote-hover-target");
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

                            // if this is the first networked entity, it's sharedData will default to the  
                            // string "{}", and we should initialize it with the initial data from the script
                            if (this.stateSync.sharedData.length == 2) {
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
            }).catch(e => {
                console.error("loadScript failed for script " + this.data.name + ": " + e);
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
        console.log("clicked on html: ", evt);
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
        var initScript = vueComponents[this.componentName];
        if (!initScript) {
            console.warn("'html-script' component doesn't have script for " + this.componentName);
            this.script = null;
            return;
        }
        this.script = initScript(this.scriptData);
        if (this.script){
            this.script.needsUpdate = true;
            // this.script.webLayer3D.refresh(true)
            // this.script.webLayer3D.update(true)
        } else {
            console.warn("'html-script' component failed to initialize script for " + this.componentName);
        }
    },

    remove: function () {
        this.destroyScript();
    },

    destroyScript: function () {
        if (this.script.isInteractive) {
            this.simpleContainer.object3D.removeEventListener('interact', this.clicked);
        }

        window.APP.scene.removeEventListener('didConnectToNetworkedScene', this.setupNetworked);

        this.el.removeChild(this.simpleContainer);
        this.simpleContainer.removeObject3D("weblayer3d");
        this.simpleContainer = null;

        if (this.script.isNetworked && this.netEntity.parentNode) {
            this.netEntity.parentNode.removeChild(this.netEntity);
        }
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
                this.sharedData = "{}";
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

/**
 * control a video from a component you stand on.  Implements a radius from the center of
 * the object it's attached to, in meters
 */
AFRAME.registerComponent('video-control-pad', {
    mediaVideo: {},
    schema: {
        target: { type: 'string', default: "" },
        radius: { type: 'number', default: 1 }
    },
    init: function () {
        if (this.data.target.length == 0) {
            console.warn("video-control-pad must have 'target' set");
            return;
        }
        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", () => {
            this.initialize();
        });
    },
    initialize: function () {
        var _a;
        let v = (_a = this.el.sceneEl) === null || _a === void 0 ? void 0 : _a.object3D.getObjectByName(this.data.target);
        if (v == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' does not exist");
            return;
        }
        if (v.el.components["media-loader"] || v.el.components["media-video"]) {
            if (v.el.components["media-loader"]) {
                let fn = () => {
                    this.setupVideoPad(v);
                    v.el.removeEventListener('model-loaded', fn);
                };
                v.el.addEventListener("media-loaded", fn);
            }
            else {
                this.setupVideoPad(v);
            }
        }
        else {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element");
        }
    },
    setupVideoPad: function (video) {
        this.mediaVideo = video.el.components["media-video"];
        if (this.mediaVideo == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element");
        }
        // //@ts-ignore
        // if (!this.mediaVideo.video.paused) {
        //     //@ts-ignore
        //     this.mediaVideo.togglePlaying()
        // }
        this.el.setAttribute('proximity-events', { radius: this.data.radius, Yoffset: 1.6 });
        this.el.addEventListener('proximityenter', () => this.enterRegion());
        this.el.addEventListener('proximityleave', () => this.leaveRegion());
    },
    enterRegion: function () {
        if (this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying();
        }
    },
    leaveRegion: function () {
        if (!this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying();
        }
    },
});

new THREE.Vector3();
new THREE.Quaternion();

const IDENTITY = new THREE.Matrix4().identity();
function setMatrixWorld(object3D, m) {
  if (!object3D.matrixIsModified) {
    object3D.applyMatrix(IDENTITY); // hack around our matrix optimizations
  }
  object3D.matrixWorld.copy(m);
  if (object3D.parent) {
    object3D.parent.updateMatrices();
    object3D.matrix = object3D.matrix.getInverse(object3D.parent.matrixWorld).multiply(object3D.matrixWorld);
  } else {
    object3D.matrix.copy(object3D.matrixWorld);
  }
  object3D.matrix.decompose(object3D.position, object3D.quaternion, object3D.scale);
  object3D.childrenNeedMatrixWorldUpdate = true;
}

((function() {
  const mat4 = new THREE.Matrix4();
  const end = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  const start = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  const interpolated = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  return function(startMat4, endMat4, progress, outMat4) {
    start.quaternion.setFromRotationMatrix(mat4.extractRotation(startMat4));
    end.quaternion.setFromRotationMatrix(mat4.extractRotation(endMat4));
    THREE.Quaternion.slerp(start.quaternion, end.quaternion, interpolated.quaternion, progress);
    interpolated.position.lerpVectors(
      start.position.setFromMatrixColumn(startMat4, 3),
      end.position.setFromMatrixColumn(endMat4, 3),
      progress
    );
    interpolated.scale.lerpVectors(
      start.scale.setFromMatrixScale(startMat4),
      end.scale.setFromMatrixScale(endMat4),
      progress
    );
    return outMat4.compose(
      interpolated.position,
      interpolated.quaternion,
      interpolated.scale
    );
  };
}))();

((function() {
  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();
  return function(objA, objB) {
    objA.updateMatrices();
    objB.updateMatrices();
    posA.setFromMatrixColumn(objA.matrixWorld, 3);
    posB.setFromMatrixColumn(objB.matrixWorld, 3);
    return posA.distanceToSquared(posB);
  };
}))();

const affixToWorldUp = (function() {
  const inRotationMat4 = new THREE.Matrix4();
  const inForward = new THREE.Vector3();
  const outForward = new THREE.Vector3();
  const outSide = new THREE.Vector3();
  const worldUp = new THREE.Vector3(); // Could be called "outUp"
  const v = new THREE.Vector3();
  const inMat4Copy = new THREE.Matrix4();
  return function affixToWorldUp(inMat4, outMat4) {
    inRotationMat4.identity().extractRotation(inMat4Copy.copy(inMat4));
    inForward.setFromMatrixColumn(inRotationMat4, 2).multiplyScalar(-1);
    outForward
      .copy(inForward)
      .sub(v.copy(inForward).projectOnVector(worldUp.set(0, 1, 0)))
      .normalize();
    outSide.crossVectors(outForward, worldUp);
    outMat4.makeBasis(outSide, worldUp, outForward.multiplyScalar(-1));
    outMat4.scale(v.setFromMatrixScale(inMat4Copy));
    outMat4.setPosition(v.setFromMatrixColumn(inMat4Copy, 3));
    return outMat4;
  };
})();

((function() {
  const upAffixedCameraTransform = new THREE.Matrix4();
  const upAffixedWaypointTransform = new THREE.Matrix4();
  const detachFromWorldUp = new THREE.Matrix4();
  return function calculateCameraTransformForWaypoint(cameraTransform, waypointTransform, outMat4) {
    affixToWorldUp(cameraTransform, upAffixedCameraTransform);
    detachFromWorldUp.getInverse(upAffixedCameraTransform).multiply(cameraTransform);
    affixToWorldUp(waypointTransform, upAffixedWaypointTransform);
    outMat4.copy(upAffixedWaypointTransform).multiply(detachFromWorldUp);
  };
}))();

((function() {
  const inMat4Copy = new THREE.Matrix4();
  const startRotation = new THREE.Matrix4();
  const endRotation = new THREE.Matrix4();
  const v = new THREE.Vector3();
  return function rotateInPlaceAroundWorldUp(inMat4, theta, outMat4) {
    inMat4Copy.copy(inMat4);
    return outMat4
      .copy(endRotation.makeRotationY(theta).multiply(startRotation.extractRotation(inMat4Copy)))
      .scale(v.setFromMatrixScale(inMat4Copy))
      .setPosition(v.setFromMatrixPosition(inMat4Copy));
  };
}))();

((function() {
  const inverseParentWorld = new THREE.Matrix4();
  const childRelativeToParent = new THREE.Matrix4();
  const childInverse = new THREE.Matrix4();
  const newParentMatrix = new THREE.Matrix4();
  // transform the parent such that its child matches the target
  return function childMatch(parent, child, target) {
    parent.updateMatrices();
    inverseParentWorld.getInverse(parent.matrixWorld);
    child.updateMatrices();
    childRelativeToParent.multiplyMatrices(inverseParentWorld, child.matrixWorld);
    childInverse.getInverse(childRelativeToParent);
    newParentMatrix.multiplyMatrices(target, childInverse);
    setMatrixWorld(parent, newParentMatrix);
  };
}))();

const calculatePlaneMatrix = (function () {
    const planeMatrix = new THREE.Matrix4();
    const planeUp = new THREE.Vector3();
    const planeForward = new THREE.Vector3();
    const planeRight = new THREE.Vector3();
    const planePosition = new THREE.Vector3();
    const camPosition = new THREE.Vector3();

    return function calculatePlaneMatrix(camera, button) {
        camera.updateMatrices();
        camPosition.setFromMatrixPosition(camera.matrixWorld);
        button.updateMatrices();
        planePosition.setFromMatrixPosition(button.matrixWorld);
        planeForward.subVectors(planePosition, camPosition);
        planeForward.y = 0;
        planeForward.normalize();
        planeUp.set(0, 1, 0);
        planeRight.crossVectors(planeForward, planeUp);
        planeMatrix.makeBasis(planeRight, planeUp, planeForward.multiplyScalar(-1));
        planeMatrix.elements[12] = planePosition.x;
        planeMatrix.elements[13] = planePosition.y;
        planeMatrix.elements[14] = planePosition.z;
        return planeMatrix;
    };
})();

const planeForLeftCursor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(100000, 100000, 2, 2),
    new THREE.MeshBasicMaterial({
        visible: true,
        wireframe: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
    })
);
const planeForRightCursor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(100000, 100000, 2, 2),
    new THREE.MeshBasicMaterial({
        visible: true,
        wireframe: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
    })
);

class HandleInteraction {
    constructor(el) {
        this.el = el;

        this.isDragging = false;
        this.dragInteractor = null;
        this.planeRotation = new THREE.Matrix4();
        this.planeUp = new THREE.Vector3();
        this.planeRight = new THREE.Vector3();
        this.intersections = [];
        this.initialIntersectionPoint = new THREE.Vector3();
        this.intersectionPoint = new THREE.Vector3();
        this.delta = {
            x: 0,
            y: 0
        };
        this.objectMatrix = new THREE.Matrix4();
        this.dragVector = new THREE.Vector3();

        this.camPosition = new THREE.Vector3();
        this.objectPosition = new THREE.Vector3();
        this.objectToCam = new THREE.Vector3();
    }

    getInteractors(obj) {
        let toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;

        // more or less copied from "hoverable-visuals.js" in hubs
        const interaction = this.el.sceneEl.systems.interaction;
        var passthruInteractor = [];

        let interactorOne, interactorTwo;
        if (!interaction.ready) return; //DOMContentReady workaround

        // TODO:  may want to look to see the hovered objects are children of obj??
        let hoverEl = obj;
        if (interaction.state.leftHand.hovered === hoverEl && !interaction.state.leftHand.held) {
            interactorOne = {
                cursor: interaction.options.leftHand.entity.object3D,
                controller: interaction.leftCursorControllerEl.components["cursor-controller"]
            };
        }
        if (
            interaction.state.leftRemote.hovered === hoverEl &&
            !interaction.state.leftRemote.held &&
            !toggling.leftToggledOff
        ) {
            interactorOne = {
                cursor: interaction.options.leftRemote.entity.object3D,
                controller: interaction.leftCursorControllerEl.components["cursor-controller"]
            };

        }
        if (interactorOne) {
            passthruInteractor.push(interactorOne);
        }
        if (
            interaction.state.rightRemote.hovered === hoverEl &&
            !interaction.state.rightRemote.held &&
            !toggling.rightToggledOff
        ) {
            interactorTwo = {
                cursor: interaction.options.rightRemote.entity.object3D,
                controller: interaction.rightCursorControllerEl.components["cursor-controller"]
            };
        }
        if (interaction.state.rightHand.hovered === hoverEl && !interaction.state.rightHand.held) {
            interactorTwo = {
                cursor: interaction.options.rightHand.entity.object3D,
                controller: interaction.rightCursorControllerEl.components["cursor-controller"]
            };
        }
        if (interactorTwo) {
            passthruInteractor.push(interactorTwo);
        }
        return passthruInteractor
    }

    getRefs() {
        if (!this.didGetObjectReferences) {
            this.didGetObjectReferences = true;
            const interaction = this.el.sceneEl.systems.interaction;

            // this.leftEventer = document.getElementById("left-cursor").object3D;
            // this.leftCursorController = document.getElementById("left-cursor-controller");
            // this.leftRaycaster = this.leftCursorController.components["cursor-controller"].raycaster;
            // this.rightCursorController = document.getElementById("right-cursor-controller");
            // this.rightRaycaster = this.rightCursorController.components["cursor-controller"].raycaster;
            this.leftEventer = interaction.options.leftRemote.entity.object3D;
            this.leftCursorController = interaction.leftCursorControllerEl.components["cursor-controller"];
            this.leftRaycaster = this.leftCursorController.raycaster;
            this.rightCursorController = interaction.rightCursorControllerEl.components["cursor-controller"];
            this.rightRaycaster = this.rightCursorController.raycaster;

            this.viewingCamera = document.getElementById("viewing-camera").object3DMap.camera;
        }
    }

    getIntersection(interactor, targets) {
        this.getRefs();
        let object3D = interactor.cursor;
        let raycaster = object3D === this.leftEventer ? this.leftRaycaster : this.rightRaycaster;

        let intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            return intersects[0];
        }
        return null;
    }

    startDrag(e) {
        if (this.isDragging) {
            return false;
        }
        this.getRefs();

        this.plane = e.object3D === this.leftEventer ? planeForLeftCursor : planeForRightCursor;

        setMatrixWorld(this.plane, calculatePlaneMatrix(this.viewingCamera, this.el.object3D));
        this.planeRotation.extractRotation(this.plane.matrixWorld);
        this.planeUp.set(0, 1, 0).applyMatrix4(this.planeRotation);
        this.planeRight.set(1, 0, 0).applyMatrix4(this.planeRotation);
        this.raycaster = e.object3D === this.leftEventer ? this.leftRaycaster : this.rightRaycaster;
        const intersection = this.raycastOnPlane();

        // shouldn't happen, but we should check
        if (!intersection) return false;

        this.isDragging = true;
        this.dragInteractor = {
            cursor: e.object3D,
            controller: e.object3D === this.leftEventer ? this.leftCursorController : this.rightCursorController,
        };

        this.initialIntersectionPoint.copy(intersection.point);
        this.initialDistanceToObject = this.objectToCam
            .subVectors(
                this.camPosition.setFromMatrixPosition(this.viewingCamera.matrixWorld),
                this.objectPosition.setFromMatrixPosition(this.el.object3D.matrixWorld)
            )
            .length();
        this.intersectionRight = 0;
        this.intersectionUp = 0;
        this.delta = {
            x: 0,
            y: 0
        };

        return true
    }

    endDrag(e) {
        if (!this.isDragging) {
            return;
        }
        if (
            (e.object3D === this.leftEventer && this.raycaster === this.leftRaycaster) ||
            (e.object3D !== this.leftEventer && this.raycaster === this.rightRaycaster)
        ) {
            this.isDragging = false;
            this.dragInteractor = null;
        }
    }

    raycastOnPlane() {
        this.intersections.length = 0;
        const far = this.raycaster.far;
        this.raycaster.far = 1000;
        this.plane.raycast(this.raycaster, this.intersections);
        this.raycaster.far = far;
        return this.intersections[0];
    }

    drag() {
        if (!this.isDragging) return null;
        const intersection = this.raycastOnPlane();
        if (!intersection) return null;
        this.intersectionPoint.copy(intersection.point);
        this.dragVector.subVectors(this.intersectionPoint, this.initialIntersectionPoint);
        this.delta.x = this.dragVector.dot(this.planeUp);
        this.delta.y = this.dragVector.dot(this.planeRight);
        return this.dragVector;
    }
}


// template

function interactiveComponentTemplate(componentName) {
    return {
        startInit: function () {
            this.fullName = this.el.parentEl.parentEl.className;
            this.relativeSize = 1;
            this.isDraggable = false;
            this.isInteractive = false;
            this.isNetworked = false;
        },

        finishInit: function () {
            let root = findAncestorWithComponent(this.el, "gltf-model-plus");
            root && root.addEventListener("model-loaded", (ev) => {
                this.internalInit();
            });
        },

        removeTemplate: function () {
            if (this.isInteractive) {
                this.simpleContainer.object3D.removeEventListener('interact', this.clicked);
            }
            this.el.removeChild(this.simpleContainer);
            this.simpleContainer = null;
    
            if (this.isNetworked && this.netEntity.parentNode) {
                this.netEntity.parentNode.removeChild(this.netEntity);
            }    
        },

        internalInit: function () {
            // each time we load a component we will possibly create
            // a new networked component.  This is fine, since the networked Id 
            // is based on the name passed as a parameter, or assigned to the
            // component in Spoke.  It does mean that if we have
            // multiple objects in the scene which have the same name, they will
            // be in sync.  It also means that if you want to drop a component on
            // the scene via a .glb, it must have a valid name parameter inside it.
            // A .glb in spoke will fall back to the spoke name if you use one without
            // a name inside it.
            let loader = () => {
                // lets load something externally, like a json config file
                this.loadData().then(() => {
                    if (this.isNetworked) {
                        // get the parent networked entity, when it's finished initializing.  
                        // When creating this as part of a GLTF load, the 
                        // parent a few steps up will be networked. 
                        this.netEntity = null;

                        // bind callbacks
                        this.getSharedData = this.getSharedData.bind(this);
                        this.setSharedData = this.setSharedData.bind(this);
                    }

                    // set up the local content and hook it to the scene
                    this.simpleContainer = document.createElement('a-entity');
                    this.simpleContainer.object3D.matrixAutoUpdate = true;

                    this.initializeData();
                    // lets figure out the scale, by scaling to fill the a 1x1m square, that has also
                    // potentially been scaled by the parents parent node. If we scale the entity in spoke,
                    // this is where the scale is set.  If we drop a node in and scale it, the scale is also
                    // set there.

                    // TODO: need to find environment-scene, go down two levels to the group above 
                    // the nodes in the scene.  Then accumulate the scales up from this node to
                    // that node.  This will account for groups, and nesting.

                    var width = 1,
                        height = 1;
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
                        // PROBABLY DONT NEED TO SUPPORT THIS ANYMORE
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
                        var scale = Math.min(width * this.relativeSize, height * this.relativeSize);
                        this.simpleContainer.setAttribute("scale", {
                            x: scale,
                            y: scale,
                            z: scale
                        });
                    }

                    // there might be some elements already, like the cube we created in blender
                    // and attached this component to, so hide them if they are there.
                    for (const c of this.el.object3D.children) {
                        c.visible = false;
                    }

                    // add in our container
                    this.el.appendChild(this.simpleContainer);

                    // TODO:  we are going to have to make sure this works if 
                    // the component is ON an interactable (like an image)

                    if (this.isInteractive) {
                        this.handleInteraction = new HandleInteraction(this.el);

                        // make the object clickable
                        this.simpleContainer.setAttribute('is-remote-hover-target', '');
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

                        if (this.isDraggable) {
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

                            this.dragStart = this.dragStart.bind(this);
                            this.dragEnd = this.dragEnd.bind(this);
                            this.simpleContainer.object3D.addEventListener('holdable-button-down', (evt) => {
                                this.dragStart(evt);
                            });
                            this.simpleContainer.object3D.addEventListener('holdable-button-up', (evt) => {
                                this.dragEnd(evt);
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
                        this.el.removeAttribute("is-remote-hover-target");
                    }

                    // TODO: this SHOULD work but make sure it works if the el we are on
                    // is networked, such as when attached to an image

                    if (this.el.hasAttribute("networked")) {
                        this.el.removeAttribute("networked");
                    }

                    if (this.isNetworked) {
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
                                netId = NAF.utils.getNetworkId(networkedEl) + "-" + componentName;

                                // if we need to create an entity, use the same persistence as our
                                // network entity (true if pinned, false if not)
                                persistent = entity.components.networked.data.persistent;
                            } else {
                                // this only happens if this component is on a scene file, since the
                                // elements on the scene aren't networked.  So let's assume each entity in the
                                // scene will have a unique name.  Adding a bit of text so we can find it
                                // in the DOM when debugging.
                                netId = this.fullName.replaceAll("_", "-") + "-" + componentName;
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

                                // store the method to retrieve the data on this entity
                                entity.getSharedData = this.getSharedData;

                                // the "networked" component should have persistent=true, the template and 
                                // networkId set, owner set to "scene" (so that it doesn't update the rest of
                                // the world with it's initial data, and should NOT set creator (the system will do that)
                                entity.setAttribute('networked', {
                                    template: "#" + componentName + "-data-media",
                                    persistent: persistent,
                                    owner: "scene", // so that our initial value doesn't overwrite others
                                    networkId: netId
                                });
                                this.el.sceneEl.appendChild(entity);
                            }

                            // save a pointer to the networked entity and then wait for it to be fully
                            // initialized before getting a pointer to the actual networked component in it
                            this.netEntity = entity;
                            NAF.utils.getNetworkedEntity(this.netEntity).then(networkedEl => {
                                this.stateSync = networkedEl.components[componentName + "-data"];
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
                }, {
                    once: true
                });
            } else {
                loader();
            }
        }
    }
}

function registerSharedAFRAMEComponents(componentName) {
    //
    // Component for our networked state.  This component does nothing except all us to 
    // change the state when appropriate. We could set this up to signal the component above when
    // something has changed, instead of having the component above poll each frame.
    //

    AFRAME.registerComponent(componentName + '-data', {
        schema: {
            sampledata: {
                type: "string",
                default: "{}"
            },
        },
        init: function () {
            this.setSharedData = this.setSharedData.bind(this);

            this.dataObject = this.el.getSharedData();
            try {
                this.sharedData = encodeURIComponent(JSON.stringify(this.dataObject));
                this.el.setAttribute(componentName + "-data", "sampledata", this.sharedData);
            } catch (e) {
                console.error("Couldn't encode initial data object: ", e, this.dataObject);
                this.sharedData = "{}";
                this.dataObject = {};
            }
            this.changed = false;
        },

        update() {
            this.changed = !(this.sharedData === this.data.sampledata);
            if (this.changed) {
                try {
                    this.dataObject = JSON.parse(decodeURIComponent(this.data.sampledata));

                    // do these after the JSON parse to make sure it has succeeded
                    this.sharedData = this.data.sampledata;
                    this.changed = true;
                } catch (e) {
                    console.error("couldn't parse JSON received in data-sync: ", e);
                    this.sharedData = "{}";
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

        setSharedData(dataObject) {
            if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

            try {
                var dataString = encodeURIComponent(JSON.stringify(dataObject));
                this.sharedData = dataString;
                this.dataObject = dataObject;
                this.el.setAttribute(componentName + "-data", "sampledata", dataString);
                return true
            } catch (e) {
                console.error("can't stringify the object passed to data-sync");
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
<template id="` + componentName + `-data-media">
  <a-entity
    ` + componentName + `-data
  ></a-entity>
</template>
`
    );

    NAF.schemas.add({
        template: "#" + componentName + "-data-media",
        components: [{
            component: componentName + "-data",
            property: "sampledata"
        }],
        nonAuthorizedComponents: [{
            component: componentName + "-data",
            property: "sampledata"
        }],

    });
}

/**
 * Description
 * ===========
 * create a threejs object (two cubes, one on the surface of the other) that can be interacted 
 * with and has some networked attributes.
 *
 */

///////////////////////////////////////////////////////////////////////////////
// simple convenience functions 
function randomColor() {
    return new THREE.Color(Math.random(), Math.random(), Math.random());
}

function almostEqualVec3(u, v, epsilon) {
    return Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon;
}
// a lot of the complexity has been pulled out into methods in the object
// created by interactiveComponentTemplate() and registerSharedAFRAMEcomponents().
// Here, we define methods that are used by the object there, to do our object-specific
// work.

// We need to define:
// - AFRAME 
//   - schema
//   - init() method, which should can startInit() and finishInit()
//   - update() and play() if you need them
//   - tick() and tick2() to handle frame updates
//
// - change isNetworked, isInteractive, isDraggable (default: false) to reflect what 
//   the object needs to do.
// - loadData() is an async function that does any slow work (loading things, etc)
//   and is called by finishInit(), which waits till it's done before setting things up
// - initializeData() is called to set up the initial state of the object, a good 
//   place to create the 3D content.  The three.js scene should be added to 
//   this.simpleContainter
// - clicked() is called when the object is clicked
// - dragStart() is called right after clicked() if isDraggable is true, to set up
//   for a possible drag operation
// - dragEnd() is called when the mouse is released
// - drag() should be called each frame while the object is being dragged (between 
//   dragStart() and dragEnd())
// - getInteractors() returns an array of objects for which interaction controls are
//   intersecting the object. There will likely be zero, one, or two of these (if 
//   there are two controllers and both are pointing at the object).  The "cursor"
//   field is a pointer to the small sphere Object3D that is displayed where the 
//   interaction ray touches the object. The "controller" field is the 
///  corresponding controller
//   object that includes things like the rayCaster.
// - getIntersection() takes in the interactor and the three.js object3D array 
//   that should be tested for interaction.

// Note that only the entity that this component is attached to will be "seen"
// by Hubs interaction system, so the entire three.js tree below it triggers
// click and drag events.  The getIntersection() method is needed 

// the componentName must be lowercase, can have hyphens, start with a letter, 
// but no underscores
let componentName = "test-cube";

// get the template part of the object need for the AFRAME component
let template = interactiveComponentTemplate(componentName);

// create the additional parts of the object needed for the AFRAME component
let child = {
    schema: {
        // name is hopefully unique for each instance
        name: {
            type: "string",
            default: ""
        },

        // the template will look for these properties. If they aren't there, then
        // the lookup (this.data.*) will evaluate to falsey
        isNetworked: {
            type: "boolean",
            default: false
        },
        isInteractive: {
            type: "boolean",
            default: true
        },
        isDraggable: {
            type: "boolean",
            default: true
        },

        // our data
        width: {
            type: "number",
            default: 1
        },
        color: {
            type: "string",
            default: ""
        },
        parameter1: {
            type: "string",
            default: ""
        }
    },

    // fullName is used to generate names for the AFRame objects we create.  Should be
    // unique for each instance of an object, which we specify with name.  If name does
    // name get used as a scheme parameter, it defaults to the name of it's parent glTF
    // object, which only works if those are uniquely named.
    init: function () {
        this.startInit();

        // the template uses these to set things up.  relativeSize
        // is used to set the size of the object relative to the size of the image
        // that it's attached to: a size of 1 means 
        //   "the size of 1x1x1 units in the object
        //    space will be the same as the size of the image".  
        // Larger relative sizes will make the object smaller because we are
        // saying that a size of NxNxN maps to the Size of the image, and vice versa.  
        // For example, if the object below is 2,2 in size and we set size 2, then
        // the object will remain the same size as the image. If we leave it at 1,1,
        // then the object will be twice the size of the image. 
        this.relativeSize = this.data.width;

        // override the defaults in the template
        this.isDraggable = this.data.isDraggable;
        this.isInteractive = this.data.isInteractive;
        this.isNetworked = this.data.isNetworked;

        // our potentiall-shared object state (two roations and two colors for the boxes) 
        this.sharedData = {
            color: new THREE.Color(this.data.color.length > 0 ? this.data.color : "grey"),
            rotation: new THREE.Euler(),
            position: new THREE.Vector3(0,0.5,0)
        };

        // some local state
        this.initialEuler = new THREE.Euler();

        // some click/drag state
        this.clickEvent = null;
        this.clickIntersection = null;

        // we should set fullName if we have a meaningful name
        if (this.data.name && this.data.name.length > 0) {
            this.fullName = this.data.name;
        }

        // finish the initialization
        this.finishInit();
    },

    // if anything changed in this.data, we need to update the object.  
    // this is probably not going to happen, but could if another of 
    // our scripts modifies the component properties in the DOM
    update: function () {},

    // do some stuff to get async data.  Called by initTemplate()
    loadData: async function () {
        return
    },

    // called by initTemplate() when the component is being processed.  Here, we create
    // the three.js objects we want, and add them to simpleContainer (an AFrame node 
    // the template created for us).
    initializeData: function () {
        this.box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: this.sharedData.color
            })
        );
        this.box.matrixAutoUpdate = true;
        this.simpleContainer.setObject3D('box', this.box);

        // create a second small, black box on the surface of the box
        this.box2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 0.1, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: "black"
            })
        );
        this.box2.matrixAutoUpdate = true;
        this.box2.position.copy(this.sharedData.position);

        // add it as a child of the first box, since we want it to move with the first box
        this.box.add(this.box2);

        // IMPORTANT: any three.js object that is added to a Hubs (aframe) entity 
        // must have ".el" pointing to the AFRAME Entity that contains it.
        // When an object3D is added with ".setObject3D", it is added to the 
        // object3D for that Entity, and sets all of the children of that
        // object3D to point to the same Entity.  If you add an object3D to
        // the sub-tree of that object later, you must do this yourself. 
        this.box2.el = this.simpleContainer;
    },

    // called from remove() in the template to remove any local resources when the component
    // is destroyed
    remove: function () {
        this.simpleContainer.removeObject3D("box");
        this.box.geometry.dispose();
        this.box.material.dispose();
        this.box2.geometry.dispose();
        this.box2.material.dispose();
        this.removeTemplate();
    },

    // handle "interact" events for clickable entities
    clicked: function (evt) {
        // the evt.target will point at the object3D in this entity.  We can use
        // handleInteraction.getInteractionTarget() to get the more precise 
        // hit information about which object3Ds in our object were hit.  We store
        // the one that was clicked here, so we know which it was as we drag around
        this.clickIntersection = this.handleInteraction.getIntersection(evt.object3D, [evt.target]);
        this.clickEvent = evt;

        if (!this.clickIntersection) {
            console.warn("click didn't hit anything; shouldn't happen");
            return;
        }

        if (this.clickIntersection.object == this.box) {
            // new random color on each click
            let newColor = randomColor();

            this.box.material.color.set(newColor);
            this.sharedData.color.set(newColor);
            this.setSharedData();
        } else if (this.clickIntersection.object == this.box2) ;
    },

    // called to start the drag.  Will be called after clicked() if isDraggable is true
    dragStart: function (evt) {
        // set up the drag state
        if (!this.handleInteraction.startDrag(evt)) {
            return
        }

        // grab a copy of the current orientation of the object we clicked
        if (this.clickIntersection.object == this.box) {
            this.initialEuler.copy(this.box.rotation);
        } else if (this.clickIntersection.object == this.box2) {
            this.box2.material.color.set("red");
        }
    },

    // called when the button is released to finish the drag
    dragEnd: function (evt) {
        this.handleInteraction.endDrag(evt);
        if (this.clickIntersection.object == this.box) ; else if (this.clickIntersection.object == this.box2) {
            this.box2.material.color.set("black");
        }
    },

    // the method setSharedData() always sets the shared data, causing a network update.  
    // We can be smarter here by calling it only when significant changes happen, 
    // which we'll do in the setSharedEuler methods
    setSharedEuler: function (newEuler) {
        if (!almostEqualVec3(this.sharedData.rotation, newEuler, 0.05)) {
            this.sharedData.rotation.copy(newEuler);
            this.setSharedData();
        }
    },
    setSharedPosition: function (newPos) {
        if (!almostEqualVec3(this.sharedData.position, newPos, 0.05)) {
            this.sharedData.position.copy(newPos);
            this.setSharedData();
        }
    },

    // if the object is networked, this.stateSync will exist and should be called
    setSharedData: function () {
        if (this.stateSync) {
            return this.stateSync.setSharedData(this.sharedData)
        }
        return true
    },

    // this is called from the networked data entity to get the initial data 
    // from the component
    getSharedData: function () {
        return this.sharedData
    },

    // per frame stuff
    tick: function (time) {
        if (!this.box) {
            // haven't finished initializing yet
            return;
        }

        // if it's interactive, we'll handle drag and hover events
        if (this.isInteractive) {

            // if we're dragging, update the rotation
            if (this.isDraggable && this.handleInteraction.isDragging) {

                // do something with the dragging. Here, we'll use delta.x and delta.y
                // to rotate the object.  These values are set as a relative offset in
                // the plane perpendicular to the view, so we'll use them to offset the
                // x and y rotation of the object.  This is a TERRIBLE way to do rotate,
                // but it's a simple example.
                if (this.clickIntersection.object == this.box) {
                    // update drag state
                    this.handleInteraction.drag();

                    // compute a new rotation based on the delta
                    this.box.rotation.set(this.initialEuler.x - this.handleInteraction.delta.x,
                        this.initialEuler.y + this.handleInteraction.delta.y,
                        this.initialEuler.z);

                    // update the shared rotation
                    this.setSharedEuler(this.box.rotation);
                } else if (this.clickIntersection.object == this.box2) {

                    // we want to hit test on our boxes, but only want to know if/where
                    // we hit the big box.  So first hide the small box, and then do a
                    // a hit test, which can only result in a hit on the big box.  
                    this.box2.visible = false;
                    let intersect = this.handleInteraction.getIntersection(this.handleInteraction.dragInteractor, [this.box]);
                    this.box2.visible = true;

                    // if we hit the big box, move the small box to the position of the hit
                    if (intersect) {
                        // the intersect object is a THREE.Intersection object, which has the hit point
                        // specified in world coordinates.  So we move those coordinates into the local
                        // coordiates of the big box, and then set the position of the small box to that
                        let position = this.box.worldToLocal(intersect.point);
                        this.box2.position.copy(position);
                        this.setSharedPosition(this.box2.position);
                    }
                }
            } else {
                // do something with the rays when not dragging or clicking.
                // For example, we could display some additional content when hovering
                let passthruInteractor = this.handleInteraction.getInteractors(this.simpleContainer);

                // we will set yellow if either interactor hits the box. We'll keep track of if
                // one does
                let setIt = false;

                // for each of our interactors, check if it hits the scene
                for (let i = 0; i < passthruInteractor.length; i++) {
                    let intersection = this.handleInteraction.getIntersection(passthruInteractor[i], this.simpleContainer.object3D.children);

                    // if we hit the small box, set the color to yellow, and flag that we hit
                    if (intersection && intersection.object === this.box2) {
                        this.box2.material.color.set("yellow");
                        setIt = true;
                    }
                }

                // if we didn't hit, make sure the color remains black
                if (!setIt) {
                    this.box2.material.color.set("black");
                }
            }
        }

        if (this.isNetworked) {
            // if we haven't finished setting up the networked entity don't do anything.
            if (!this.netEntity || !this.stateSync) {
                return
            }

            // if the state has changed in the networked data, update our html object
            if (this.stateSync.changed) {
                this.stateSync.changed = false;

                // got the data, now do something with it
                let newData = this.stateSync.dataObject;
                this.sharedData.color.set(newData.color);
                this.sharedData.rotation.copy(newData.rotation);
                this.sharedData.position.copy(newData.position);
                this.box.material.color.set(newData.color);
                this.box.rotation.copy(newData.rotation);
                this.box2.position.copy(newData.position);
            }
        }
    }
};

// register the component with the AFrame scene
AFRAME.registerComponent(componentName, {
    ...child,
    ...template
});

// create and register the data component and it's NAF component with the AFrame scene
registerSharedAFRAMEComponents(componentName);

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360');
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal');
AFRAME.GLTFModelPlus.registerComponent('shader', 'shader');
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax');
AFRAME.GLTFModelPlus.registerComponent('html-script', 'html-script');
AFRAME.GLTFModelPlus.registerComponent('region-hider', 'region-hider');
AFRAME.GLTFModelPlus.registerComponent('video-control-pad', 'video-control-pad');
AFRAME.GLTFModelPlus.registerComponent('test-cube', 'test-cube');
// do a simple monkey patch to see if it works
// var myisMineOrLocal = function (that) {
//     return !that.el.components.networked || (that.networkedEl && NAF.utils.isMine(that.networkedEl));
//  }
//  var videoComp = AFRAME.components["media-video"]
//  videoComp.Component.prototype.isMineOrLocal = myisMineOrLocal;
// let homePageDesc = document.querySelector('[class^="HomePage__app-description"]')
// if (homePageDesc) {
//     homePageDesc.innerHTML = "Reality Media Immersive Experience<br><br>After signing in, visit <a href='https://realitymedia.digital'>realitymedia.digital</a> to get started"
// }
function hideLobbySphere() {
    // @ts-ignore
    window.APP.scene.addEventListener('stateadded', function (evt) {
        if (evt.detail === 'entered') {
            // @ts-ignore
            var lobbySphere = window.APP.scene.object3D.getObjectByName('lobbySphere');
            if (lobbySphere) {
                lobbySphere.visible = false;
            }
        }
    });
}
if (document.readyState === 'complete') {
    hideLobbySphere();
}
else {
    document.addEventListener('DOMContentLoaded', hideLobbySphere);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wcm94aW1pdHktZXZlbnRzLmpzIiwiLi4vc3JjL3V0aWxzL2NvbXBvbmVudC11dGlscy5qcyIsIi4uL3NyYy91dGlscy9zY2VuZS1ncmFwaC50cyIsIi4uL3NyYy9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcyIsIi4uL3NyYy91dGlscy9kZWZhdWx0SG9va3MudHMiLCIuLi9zcmMvdXRpbHMvTWF0ZXJpYWxNb2RpZmllci50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveU1haW4udHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lVbmlmb3JtT2JqLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95VW5pZm9ybV9wYXJhcy50cyIsIi4uL3NyYy9hc3NldHMvYmF5ZXIucG5nIiwiLi4vc3JjL3NoYWRlcnMvYmxlZXB5LWJsb2Nrcy1zaGFkZXIudHMiLCIuLi9zcmMvc2hhZGVycy9ub2lzZS50cyIsIi4uL3NyYy9zaGFkZXJzL2xpcXVpZC1tYXJibGUudHMiLCIuLi9zcmMvYXNzZXRzL3NtYWxsLW5vaXNlLnBuZyIsIi4uL3NyYy9zaGFkZXJzL2dhbGF4eS50cyIsIi4uL3NyYy9zaGFkZXJzL2xhY2UtdHVubmVsLnRzIiwiLi4vc3JjL2Fzc2V0cy9ub2lzZS0yNTYucG5nIiwiLi4vc3JjL3NoYWRlcnMvZmlyZS10dW5uZWwudHMiLCIuLi9zcmMvc2hhZGVycy9taXN0LnRzIiwiLi4vc3JjL3NoYWRlcnMvbWFyYmxlMS50cyIsIi4uL3NyYy9hc3NldHMvYmFkU2hhZGVyLmpwZyIsIi4uL3NyYy9zaGFkZXJzL25vdC1mb3VuZC50cyIsIi4uL3NyYy9hc3NldHMvd2FycGZ4LnBuZyIsIi4uL3NyYy9zaGFkZXJzL3dhcnAudHMiLCIuLi9zcmMvc2hhZGVycy9zbm9pc2UudHMiLCIuLi9zcmMvc2hhZGVycy93YXJwLXBvcnRhbC50cyIsIi4uL3NyYy9jb21wb25lbnRzL3NoYWRlci50cyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9DT0xPUi5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfRElTUC5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfZ2xvc3NpbmVzcy5wbmciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfTlJNLmpwZyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9PQ0MuanBnIiwiLi4vc3JjL3V0aWxzL3dyaXRlQ3ViZU1hcC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3BvcnRhbC5qcyIsIi4uL3NyYy9hc3NldHMvYmFsbGZ4LnBuZyIsIi4uL3NyYy9zaGFkZXJzL3Bhbm9iYWxsLnZlcnQuanMiLCIuLi9zcmMvc2hhZGVycy9wYW5vYmFsbC5mcmFnLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvaW1tZXJzaXZlLTM2MC5qcyIsIi4uL3NyYy9zaGFkZXJzL3BhcmFsbGF4LXNoYWRlci5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3BhcmFsbGF4LmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMiLCIuLi9zcmMvY29tcG9uZW50cy92aWRlby1jb250cm9sLXBhZC50cyIsIi4uL3NyYy91dGlscy90aHJlZS11dGlscy5qcyIsIi4uL3NyYy91dGlscy9pbnRlcmFjdGlvbi5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3RocmVlLXNhbXBsZS5qcyIsIi4uL3NyYy9yb29tcy9pbmRleC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdmYWRlci1wbHVzJywge1xuICBzY2hlbWE6IHtcbiAgICBkaXJlY3Rpb246IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdub25lJyB9LCAvLyBcImluXCIsIFwib3V0XCIsIG9yIFwibm9uZVwiXG4gICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDIwMCB9LCAvLyBUcmFuc2l0aW9uIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kc1xuICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6ICd3aGl0ZScgfSxcbiAgfSxcblxuICBpbml0KCkge1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgpLFxuICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgY29sb3I6IHRoaXMuZGF0YS5jb2xvcixcbiAgICAgICAgc2lkZTogVEhSRUUuQmFja1NpZGUsXG4gICAgICAgIG9wYWNpdHk6IDAsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBmb2c6IGZhbHNlLFxuICAgICAgfSlcbiAgICApXG4gICAgbWVzaC5zY2FsZS54ID0gbWVzaC5zY2FsZS55ID0gMVxuICAgIG1lc2guc2NhbGUueiA9IDAuMTVcbiAgICBtZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgIG1lc2gucmVuZGVyT3JkZXIgPSAxIC8vIHJlbmRlciBhZnRlciBvdGhlciB0cmFuc3BhcmVudCBzdHVmZlxuICAgIHRoaXMuZWwuY2FtZXJhLmFkZChtZXNoKVxuICAgIHRoaXMubWVzaCA9IG1lc2hcbiAgfSxcblxuICBmYWRlT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmJlZ2luVHJhbnNpdGlvbignb3V0JylcbiAgfSxcblxuICBmYWRlSW4oKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdpbicpXG4gIH0sXG5cbiAgYXN5bmMgYmVnaW5UcmFuc2l0aW9uKGRpcmVjdGlvbikge1xuICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmYWRlIHdoaWxlIGEgZmFkZSBpcyBoYXBwZW5pbmcuJylcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uIH0pXG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcykgPT4ge1xuICAgICAgaWYgKHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID09PSAoZGlyZWN0aW9uID09ICdpbicgPyAwIDogMSkpIHtcbiAgICAgICAgcmVzKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSByZXNcbiAgICAgIH1cbiAgICB9KVxuICB9LFxuXG4gIHRpY2sodCwgZHQpIHtcbiAgICBjb25zdCBtYXQgPSB0aGlzLm1lc2gubWF0ZXJpYWxcbiAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnIHx8IG1hdC5vcGFjaXR5ICE9PSAwXG4gICAgaWYgKCF0aGlzLm1lc2gudmlzaWJsZSkgcmV0dXJuXG5cbiAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ2luJykge1xuICAgICAgbWF0Lm9wYWNpdHkgPSBNYXRoLm1heCgwLCBtYXQub3BhY2l0eSAtICgxLjAgLyB0aGlzLmRhdGEuZHVyYXRpb24pICogTWF0aC5taW4oZHQsIDUwKSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWluKDEsIG1hdC5vcGFjaXR5ICsgKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH1cblxuICAgIGlmIChtYXQub3BhY2l0eSA9PT0gMCB8fCBtYXQub3BhY2l0eSA9PT0gMSkge1xuICAgICAgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gIT09ICdub25lJykge1xuICAgICAgICBpZiAodGhpcy5fcmVzb2x2ZUZpbmlzaCkge1xuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2goKVxuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSBudWxsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2ZhZGVyLXBsdXMnLCB7IGRpcmVjdGlvbjogJ25vbmUnIH0pXG4gICAgfVxuICB9LFxufSlcbiIsImNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3Byb3hpbWl0eS1ldmVudHMnLCB7XG4gIHNjaGVtYToge1xuICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9LFxuICAgIGZ1eno6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuMSB9LFxuICAgIFlvZmZzZXQ6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAgfSxcbiAgfSxcbiAgaW5pdCgpIHtcbiAgICB0aGlzLmluWm9uZSA9IGZhbHNlXG4gICAgdGhpcy5jYW1lcmEgPSB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgdGhpcy5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYSlcbiAgICB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgIGNvbnN0IHdhc0luem9uZSA9IHRoaXMuaW5ab25lXG5cbiAgICB3b3JsZENhbWVyYS55IC09IHRoaXMuZGF0YS5Zb2Zmc2V0XG4gICAgdmFyIGRpc3QgPSB3b3JsZENhbWVyYS5kaXN0YW5jZVRvKHdvcmxkU2VsZilcbiAgICB2YXIgdGhyZXNob2xkID0gdGhpcy5kYXRhLnJhZGl1cyArICh0aGlzLmluWm9uZSA/IHRoaXMuZGF0YS5mdXp6ICA6IDApXG4gICAgdGhpcy5pblpvbmUgPSBkaXN0IDwgdGhyZXNob2xkXG4gICAgaWYgKHRoaXMuaW5ab25lICYmICF3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5ZW50ZXInKVxuICAgIGlmICghdGhpcy5pblpvbmUgJiYgd2FzSW56b25lKSB0aGlzLmVsLmVtaXQoJ3Byb3hpbWl0eWxlYXZlJylcbiAgfSxcbn0pXG4iLCIvLyBQcm92aWRlcyBhIGdsb2JhbCByZWdpc3RyeSBvZiBydW5uaW5nIGNvbXBvbmVudHNcbi8vIGNvcGllZCBmcm9tIGh1YnMgc291cmNlXG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8IHt9O1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdIHx8IFtdO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0ucHVzaChjb21wb25lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIGlmICghd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSkgcmV0dXJuO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uc3BsaWNlKHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uaW5kZXhPZihjb21wb25lbnQpLCAxKTtcbn1cbiAgIiwiLy8gY29waWVkIGZyb20gaHVic1xuaW1wb3J0IHsgRW50aXR5LCBDb21wb25lbnQgfSBmcm9tICdhZnJhbWUnXG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KGVudGl0eTogRW50aXR5LCBjb21wb25lbnROYW1lOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5LmNvbXBvbmVudHMgJiYgZW50aXR5LmNvbXBvbmVudHNbY29tcG9uZW50TmFtZV0pKSB7XG4gICAgICBlbnRpdHkgPSAoZW50aXR5LnBhcmVudE5vZGUgYXMgRW50aXR5KTtcbiAgICB9XG4gICAgcmV0dXJuIGVudGl0eTtcbiAgfVxuICBcbiAgZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21wb25lbnRzSW5OZWFyZXN0QW5jZXN0b3IoZW50aXR5OiBFbnRpdHksIGNvbXBvbmVudE5hbWU6IHN0cmluZyk6IENvbXBvbmVudFtdIHtcbiAgICBjb25zdCBjb21wb25lbnRzID0gW107XG4gICAgd2hpbGUgKGVudGl0eSkge1xuICAgICAgaWYgKGVudGl0eS5jb21wb25lbnRzKSB7XG4gICAgICAgIGZvciAoY29uc3QgYyBpbiBlbnRpdHkuY29tcG9uZW50cykge1xuICAgICAgICAgIGlmIChlbnRpdHkuY29tcG9uZW50c1tjXS5uYW1lID09PSBjb21wb25lbnROYW1lKSB7XG4gICAgICAgICAgICBjb21wb25lbnRzLnB1c2goZW50aXR5LmNvbXBvbmVudHNbY10pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBjb21wb25lbnRzO1xuICAgICAgfVxuICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGUgYXMgRW50aXR5O1xuICAgIH1cbiAgICByZXR1cm4gY29tcG9uZW50cztcbiAgfVxuICAiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogYnJlYWsgdGhlIHJvb20gaW50byBxdWFkcmFudHMgb2YgYSBjZXJ0YWluIHNpemUsIGFuZCBoaWRlIHRoZSBjb250ZW50cyBvZiBhcmVhcyB0aGF0IGhhdmVcbiAqIG5vYm9keSBpbiB0aGVtLiAgTWVkaWEgd2lsbCBiZSBwYXVzZWQgaW4gdGhvc2UgYXJlYXMgdG9vLlxuICogXG4gKiBJbmNsdWRlIGEgd2F5IGZvciB0aGUgcG9ydGFsIGNvbXBvbmVudCB0byB0dXJuIG9uIGVsZW1lbnRzIGluIHRoZSByZWdpb24gb2YgdGhlIHBvcnRhbCBiZWZvcmVcbiAqIGl0IGNhcHR1cmVzIGEgY3ViZW1hcFxuICovXG5cbmltcG9ydCB7IHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UsIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuLi91dGlscy9jb21wb25lbnQtdXRpbHNcIjtcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcblxuIC8vIGFyYml0cmFyaWx5IGNob29zZSAxMDAwMDAwIGFzIHRoZSBudW1iZXIgb2YgY29tcHV0ZWQgem9uZXMgaW4gIHggYW5kIHlcbmxldCBNQVhfWk9ORVMgPSAxMDAwMDAwXG5sZXQgcmVnaW9uVGFnID0gZnVuY3Rpb24oc2l6ZSwgb2JqM2QpIHtcbiAgICBsZXQgcG9zID0gb2JqM2QucG9zaXRpb25cbiAgICBsZXQgeHAgPSBNYXRoLmZsb29yKHBvcy54IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIGxldCB6cCA9IE1hdGguZmxvb3IocG9zLnogLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgcmV0dXJuIE1BWF9aT05FUyAqIHhwICsgenBcbn1cblxubGV0IHJlZ2lvbnNJblVzZSA9IFtdXG5cbi8qKlxuICogRmluZCB0aGUgY2xvc2VzdCBhbmNlc3RvciAoaW5jbHVkaW5nIHRoZSBwYXNzZWQgaW4gZW50aXR5KSB0aGF0IGhhcyBhbiBgb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcmAgY29tcG9uZW50LFxuICogYW5kIHJldHVybiB0aGF0IGNvbXBvbmVudFxuICovXG5mdW5jdGlvbiBnZXRSZWdpb25Gb2xsb3dlcihlbnRpdHkpIHtcbiAgICBsZXQgY3VyRW50aXR5ID0gZW50aXR5O1xuICBcbiAgICB3aGlsZShjdXJFbnRpdHkgJiYgY3VyRW50aXR5LmNvbXBvbmVudHMgJiYgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICBjdXJFbnRpdHkgPSBjdXJFbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gIFxuICAgIGlmICghY3VyRW50aXR5IHx8ICFjdXJFbnRpdHkuY29tcG9uZW50cyB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXVxufVxuICBcbmZ1bmN0aW9uIGFkZFRvUmVnaW9uKHJlZ2lvbikge1xuICAgIHJlZ2lvbnNJblVzZVtyZWdpb25dID8gcmVnaW9uc0luVXNlW3JlZ2lvbl0rKyA6IHJlZ2lvbnNJblVzZVtyZWdpb25dID0gMVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBpbiByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMSkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHRydWUpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJhbHJlYWR5IGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHN1YnRyYWN0RnJvbVJlZ2lvbihyZWdpb24pIHtcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0pIHtyZWdpb25zSW5Vc2VbcmVnaW9uXS0tIH1cbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgbGVmdCByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcblxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAwKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgZmFsc2UpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJzdGlsbCBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd1JlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcInNob3dpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgYWRkVG9SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGlkZXJSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJoaWRpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgc3VidHJhY3RGcm9tUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzKCkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKFwic2hvd2luZy9oaWRpbmcgYWxsIG9iamVjdHNcIilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2Vbb2JqLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgIGlmIChvYmouZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IGNvbnRpbnVlIH1cblxuICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCJoaWRpbmcgXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdmlzaWJsZSkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nXCIgOiBcImhpZGluZ1wiKSArIFwiIGFsbCBvYmplY3RzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgaWYgKG9iai5yZWdpb24gPT0gcmVnaW9uKSB7XG4gICAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiIGhpZGluZ1wiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG4gIFxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdhdmF0YXItcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXZhdGFyOiByZWdpb24gXCIsIHRoaXMucmVnaW9uKVxuICAgICAgICBhZGRUb1JlZ2lvbih0aGlzLnJlZ2lvbilcblxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbmV3UmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBpZiAobmV3UmVnaW9uICE9IHRoaXMucmVnaW9uKSB7XG4gICAgICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgICAgICAgICBhZGRUb1JlZ2lvbihuZXdSZWdpb24pXG4gICAgICAgICAgICB0aGlzLnJlZ2lvbiA9IG5ld1JlZ2lvblxuICAgICAgICB9XG4gICAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9LFxuICAgICAgICBkeW5hbWljOiB7IGRlZmF1bHQ6IHRydWUgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICB0aGlzLnNob3dIaWRlID0gdGhpcy5zaG93SGlkZS5iaW5kKHRoaXMpXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgIH1cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZG9uJ3QgbW92ZVxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5keW5hbWljKSB7IHJldHVybiB9XG5cbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2VbdGhpcy5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyByZXR1cm4gfVxuXG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLnNob3dIaWRlKHZpc2libGUpXG4gICAgfSxcblxuICAgIHNob3dIaWRlOiBmdW5jdGlvbiAodmlzaWJsZSkge1xuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdmlzaWJsZVxuXG4gICAgICAgIC8vLyBjaGVjayBmb3IgbWVkaWEtdmlkZW8gY29tcG9uZW50IG9uIHBhcmVudCB0byBzZWUgaWYgd2UncmUgYSB2aWRlby4gIEFsc28gc2FtZSBmb3IgYXVkaW9cbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICBpZiAodmlzaWJsZSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLndhc1BhdXNlZCAhPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICAgICAgICAgIGlmICghdGhpcy53YXNQYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncmVnaW9uLWhpZGVyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGFyZW50IHdpdGggXCJuYXYtbWVzaC1oZWxwZXJcIiwgdGhpcyBpcyBpbiB0aGUgc2NlbmUuICBcbiAgICAgICAgLy8gSWYgbm90LCBpdCdzIGluIGFuIG9iamVjdCB3ZSBkcm9wcGVkIG9uIHRoZSB3aW5kb3csIHdoaWNoIHdlIGRvbid0IHN1cHBvcnRcbiAgICAgICAgaWYgKCFmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwibmF2LW1lc2gtaGVscGVyXCIpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50IG11c3QgYmUgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGdsYi5cIilcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IDA7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmKHRoaXMuZGF0YS5zaXplID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5zaXplID0gMTA7XG4gICAgICAgICAgICB0aGlzLnNpemUgPSB0aGlzLnBhcnNlTm9kZU5hbWUodGhpcy5kYXRhLnNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhpcy5uZXdTY2VuZSA9IHRoaXMubmV3U2NlbmUuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLm5ld1NjZW5lKVxuICAgICAgICAvLyBjb25zdCBlbnZpcm9ubWVudFNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNlbnZpcm9ubWVudC1zY2VuZVwiKTtcbiAgICAgICAgLy8gdGhpcy5hZGRTY2VuZUVsZW1lbnQgPSB0aGlzLmFkZFNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50ID0gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFNjZW5lRWxlbWVudClcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2Ugd2FudCB0byBub3RpY2Ugd2hlbiBuZXcgdGhpbmdzIGdldCBhZGRlZCB0byB0aGUgcm9vbS4gIFRoaXMgd2lsbCBoYXBwZW4gZm9yXG4gICAgICAgIC8vIG9iamVjdHMgZHJvcHBlZCBpbiB0aGUgcm9vbSwgb3IgZm9yIG5ldyByZW1vdGUgYXZhdGFycywgYXQgbGVhc3RcbiAgICAgICAgLy8gdGhpcy5hZGRSb290RWxlbWVudCA9IHRoaXMuYWRkUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVJvb3RFbGVtZW50ID0gdGhpcy5yZW1vdmVSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRSb290RWxlbWVudClcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVJvb3RFbGVtZW50KVxuXG4gICAgICAgIC8vIHdhbnQgdG8gc2VlIGlmIHRoZXJlIGFyZSBwaW5uZWQgb2JqZWN0cyB0aGF0IHdlcmUgbG9hZGVkIGZyb20gaHVic1xuICAgICAgICBsZXQgcm9vbU9iamVjdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFwiUm9vbU9iamVjdHNcIilcbiAgICAgICAgdGhpcy5yb29tT2JqZWN0cyA9IHJvb21PYmplY3RzLmxlbmd0aCA+IDAgPyByb29tT2JqZWN0c1swXSA6IG51bGxcblxuICAgICAgICAvLyBnZXQgYXZhdGFyc1xuICAgICAgICBjb25zdCBhdmF0YXJzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dXCIpO1xuICAgICAgICBhdmF0YXJzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayBvYmplY3RzIGluIHRoZSByb290ICh0aGluZ3MgdGhhdCBoYXZlIGJlZW4gZHJvcHBlZCBvbiB0aGUgc2NlbmUpXG4gICAgICAgIC8vIC0gZHJhd2luZ3MgaGF2ZSBjbGFzcz1cImRyYXdpbmdcIiwgbmV0d29ya2VkLWRyYXdpbmdcbiAgICAgICAgLy8gTm90IGdvaW5nIHRvIGRvIGRyYXdpbmdzIHJpZ2h0IG5vdy5cblxuICAgICAgICAvLyBwaW5uZWQgbWVkaWEgbGl2ZSB1bmRlciBhIG5vZGUgd2l0aCBjbGFzcz1cIlJvb21PYmplY3RzXCJcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuUm9vbU9iamVjdHMgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0gY2FtZXJhIGhhcyBjYW1lcmEtdG9vbCAgICAgICAgXG4gICAgICAgIC8vIC0gaW1hZ2UgZnJvbSBjYW1lcmEsIG9yIGRyb3BwZWQsIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLWltYWdlLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSBnbGIgaGFzIG1lZGlhLWxvYWRlciwgZ2x0Zi1tb2RlbC1wbHVzLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSB2aWRlbyBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS12aWRlbywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vXG4gICAgICAgIC8vICBzbywgZ2V0IGFsbCBjYW1lcmEtdG9vbHMsIGFuZCBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIHRoZSBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZS4gIE11c3Qgd2FpdCBmb3Igc2NlbmUgdG8gZmluaXNoIGxvYWRpbmdcbiAgICAgICAgdGhpcy5zY2VuZUxvYWRlZCA9IHRoaXMuc2NlbmVMb2FkZWQuYmluZCh0aGlzKVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcblxuICAgIH0sXG5cbiAgICBpc0FuY2VzdG9yOiBmdW5jdGlvbiAocm9vdCwgZW50aXR5KSB7XG4gICAgICAgIHdoaWxlIChlbnRpdHkgJiYgIShlbnRpdHkgPT0gcm9vdCkpIHtcbiAgICAgICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gKGVudGl0eSA9PSByb290KTtcbiAgICB9LFxuICAgIFxuICAgIC8vIFRoaW5ncyB3ZSBkb24ndCB3YW50IHRvIGhpZGU6XG4gICAgLy8gLSBbd2F5cG9pbnRdXG4gICAgLy8gLSBwYXJlbnQgb2Ygc29tZXRoaW5nIHdpdGggW25hdm1lc2hdIGFzIGEgY2hpbGQgKHRoaXMgaXMgdGhlIG5hdmlnYXRpb24gc3R1ZmZcbiAgICAvLyAtIHRoaXMuZWwucGFyZW50RWwucGFyZW50RWxcbiAgICAvLyAtIFtza3lib3hdXG4gICAgLy8gLSBbZGlyZWN0aW9uYWwtbGlnaHRdXG4gICAgLy8gLSBbYW1iaWVudC1saWdodF1cbiAgICAvLyAtIFtoZW1pc3BoZXJlLWxpZ2h0XVxuICAgIC8vIC0gI0NvbWJpbmVkTWVzaFxuICAgIC8vIC0gI3NjZW5lLXByZXZpZXctY2FtZXJhIG9yIFtzY2VuZS1wcmV2aWV3LWNhbWVyYV1cbiAgICAvL1xuICAgIC8vIHdlIHdpbGwgZG9cbiAgICAvLyAtIFttZWRpYS1sb2FkZXJdXG4gICAgLy8gLSBbc3BvdC1saWdodF1cbiAgICAvLyAtIFtwb2ludC1saWdodF1cbiAgICBzY2VuZUxvYWRlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbm9kZXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImVudmlyb25tZW50LXNjZW5lXCIpLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdXG4gICAgICAgIC8vdmFyIG5vZGVzID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5wYXJlbnRFbC5jaGlsZE5vZGVzO1xuICAgICAgICBmb3IgKGxldCBpPTA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG5vZGUgPSBub2Rlc1tpXVxuICAgICAgICAgICAgLy9pZiAobm9kZSA9PSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsKSB7Y29udGludWV9XG4gICAgICAgICAgICBpZiAodGhpcy5pc0FuY2VzdG9yKG5vZGUsIHRoaXMuZWwpKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjbCA9IG5vZGUuY2xhc3NOYW1lXG4gICAgICAgICAgICBpZiAoY2wgPT09IFwiQ29tYmluZWRNZXNoXCIgfHwgY2wgPT09IFwic2NlbmUtcHJldmlldy1jYW1lcmFcIikge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgYyA9IG5vZGUuY29tcG9uZW50c1xuICAgICAgICAgICAgaWYgKGNbXCJ3YXlwb2ludFwiXSB8fCBjW1wic2t5Ym94XCJdIHx8IGNbXCJkaXJlY3Rpb25hbC1saWdodFwiXSB8fCBjW1wiYW1iaWVudC1saWdodFwiXSB8fCBjW1wiaGVtaXNwaGVyZS1saWdodFwiXSkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2ggPSBub2RlLmNoaWxkcmVuXG4gICAgICAgICAgICB2YXIgbmF2bWVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChsZXQgaj0wOyBqIDwgY2gubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoY2hbal0uY29tcG9uZW50c1tcIm5hdm1lc2hcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgbmF2bWVzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChuYXZtZXNoKSB7Y29udGludWV9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSwgZHluYW1pYzogZmFsc2UgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFsbCBvYmplY3RzIGFuZCBhdmF0YXIgc2hvdWxkIGJlIHNldCB1cCwgc28gbGV0cyBtYWtlIHN1cmUgYWxsIG9iamVjdHMgYXJlIGNvcnJlY3RseSBzaG93blxuICAgICAgICBzaG93SGlkZU9iamVjdHMoKVxuICAgIH0sXG5cbiAgICB1cGRhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09PSB0aGlzLnNpemUpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwXG4gICAgICAgICAgICB0aGlzLnNpemUgPSB0aGlzLnBhcnNlTm9kZU5hbWUodGhpcy5kYXRhLnNpemUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmVsLnNjZW5lRWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy8gc2l6ZSA9PSAwIGlzIHVzZWQgdG8gc2lnbmFsIFwiZG8gbm90aGluZ1wiXG4gICAgICAgIGlmICh0aGlzLnNpemUgPT0gMCkge3JldHVybn1cblxuICAgICAgICAvLyBzZWUgaWYgdGhlcmUgYXJlIG5ldyBhdmF0YXJzXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXTpub3QoW2F2YXRhci1yZWdpb24tZm9sbG93ZXJdKVwiKVxuICAgICAgICBub2Rlcy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vICBzZWUgaWYgdGhlcmUgYXJlIG5ldyBjYW1lcmEtdG9vbHMgb3IgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSksIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuICAgIH0sXG4gIFxuICAgIC8vIG5ld1NjZW5lOiBmdW5jdGlvbihtb2RlbCkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudmlyb25tZW50IHNjZW5lIGxvYWRlZDogXCIsIG1vZGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LCAgXG4gICAgXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKHNpemUpIHtcbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBcbiAgICAgICAgLy8gIFwic2l6ZVwiIChhbiBpbnRlZ2VyIG51bWJlcilcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIHNldCB0aGUgaGlkZGVyIGNvbXBvbmVudCB0byBcbiAgICAgICAgLy8gdXNlIHRoYXQgc2l6ZSBpbiBtZXRlcnMgZm9yIHRoZSBxdWFkcmFudHNcbiAgICAgICAgdGhpcy5ub2RlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG5cbiAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5ub2RlTmFtZS5tYXRjaCgvXyhbMC05XSopJC8pXG5cbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDIsIGZpcnN0IG1hdGNoIGlzIHRoZSBkaXIsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgY29tcG9uZW50TmFtZSBuYW1lIG9yIG51bWJlclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLm5vZGVOYW1lKVxuICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBub2RlU2l6ZSA9IHBhcnNlSW50KHBhcmFtc1sxXSlcbiAgICAgICAgICAgIGlmICghbm9kZVNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbm9kZVNpemVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pIiwibGV0IERlZmF1bHRIb29rcyA9IHtcbiAgICB2ZXJ0ZXhIb29rczoge1xuICAgICAgICB1bmlmb3JtczogJ2luc2VydGJlZm9yZTojaW5jbHVkZSA8Y29tbW9uPlxcbicsXG4gICAgICAgIGZ1bmN0aW9uczogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxjbGlwcGluZ19wbGFuZXNfcGFyc192ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcHJlVHJhbnNmb3JtOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG4nLFxuICAgICAgICBwb3N0VHJhbnNmb3JtOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPHByb2plY3RfdmVydGV4PlxcbicsXG4gICAgICAgIHByZU5vcm1hbDogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxiZWdpbm5vcm1hbF92ZXJ0ZXg+XFxuJ1xuICAgIH0sXG4gICAgZnJhZ21lbnRIb29rczoge1xuICAgICAgICB1bmlmb3JtczogJ2luc2VydGJlZm9yZTojaW5jbHVkZSA8Y29tbW9uPlxcbicsXG4gICAgICAgIGZ1bmN0aW9uczogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxjbGlwcGluZ19wbGFuZXNfcGFyc19mcmFnbWVudD5cXG4nLFxuICAgICAgICBwcmVGcmFnQ29sb3I6ICdpbnNlcnRiZWZvcmU6Z2xfRnJhZ0NvbG9yID0gdmVjNCggb3V0Z29pbmdMaWdodCwgZGlmZnVzZUNvbG9yLmEgKTtcXG4nLFxuICAgICAgICBwb3N0RnJhZ0NvbG9yOiAnaW5zZXJ0YWZ0ZXI6Z2xfRnJhZ0NvbG9yID0gdmVjNCggb3V0Z29pbmdMaWdodCwgZGlmZnVzZUNvbG9yLmEgKTtcXG4nLFxuICAgICAgICBwb3N0TWFwOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPG1hcF9mcmFnbWVudD5cXG4nLFxuICAgICAgICByZXBsYWNlTWFwOiAncmVwbGFjZTojaW5jbHVkZSA8bWFwX2ZyYWdtZW50PlxcbidcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IERlZmF1bHRIb29rcyIsIi8vIGJhc2VkIG9uIGh0dHBzOi8vZ2l0aHViLmNvbS9qYW1pZW93ZW4vdGhyZWUtbWF0ZXJpYWwtbW9kaWZpZXJcblxuaW1wb3J0IGRlZmF1bHRIb29rcyBmcm9tICcuL2RlZmF1bHRIb29rcyc7XG5cbmludGVyZmFjZSBFeHRlbmRlZE1hdGVyaWFsIHtcbiAgICB1bmlmb3JtczogVW5pZm9ybXM7XG4gICAgdmVydGV4U2hhZGVyOiBzdHJpbmc7XG4gICAgZnJhZ21lbnRTaGFkZXI6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNoYWRlckV4dGVuc2lvbk9wdHMge1xuICAgIHVuaWZvcm1zOiB7IFt1bmlmb3JtOiBzdHJpbmddOiBhbnkgfTtcbiAgICB2ZXJ0ZXhTaGFkZXI6IHsgW3BhdHRlcm46IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGZyYWdtZW50U2hhZGVyOiB7IFtwYXR0ZXJuOiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgICBjbGFzc05hbWU/OiBzdHJpbmc7XG4gICAgcG9zdE1vZGlmeVZlcnRleFNoYWRlcj86IChzaGFkZXI6IHN0cmluZykgPT4gc3RyaW5nO1xuICAgIHBvc3RNb2RpZnlGcmFnbWVudFNoYWRlcj86IChzaGFkZXI6IHN0cmluZykgPT4gc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2hhZGVyRXh0ZW5zaW9uIGV4dGVuZHMgU2hhZGVyRXh0ZW5zaW9uT3B0cyB7XG4gICAgaW5pdChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKTogdm9pZDtcbiAgICB1cGRhdGVVbmlmb3Jtcyh0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpOiB2b2lkXG59XG5cbmNvbnN0IG1vZGlmeVNvdXJjZSA9ICggc291cmNlOiBzdHJpbmcsIGhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30sIGhvb2tzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKT0+e1xuICAgIGxldCBtYXRjaDtcbiAgICBmb3IoIGxldCBrZXkgaW4gaG9va0RlZnMgKXtcbiAgICAgICAgaWYoIGhvb2tzW2tleV0gKXtcbiAgICAgICAgICAgIG1hdGNoID0gL2luc2VydChiZWZvcmUpOiguKil8aW5zZXJ0KGFmdGVyKTooLiopfChyZXBsYWNlKTooLiopLy5leGVjKCBob29rRGVmc1trZXldICk7XG5cbiAgICAgICAgICAgIGlmKCBtYXRjaCApe1xuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFsxXSApeyAvLyBiZWZvcmVcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzJdLCBob29rc1trZXldICsgJ1xcbicgKyBtYXRjaFsyXSApO1xuICAgICAgICAgICAgICAgIH1lbHNlXG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzNdICl7IC8vIGFmdGVyXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFs0XSwgbWF0Y2hbNF0gKyAnXFxuJyArIGhvb2tzW2tleV0gKTtcbiAgICAgICAgICAgICAgICB9ZWxzZVxuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFs1XSApeyAvLyByZXBsYWNlXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFs2XSwgaG9va3Nba2V5XSApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzb3VyY2U7XG59XG5cbnR5cGUgVW5pZm9ybXMgPSB7XG4gICAgW2tleTogc3RyaW5nXTogYW55O1xufVxuXG4vLyBjb3BpZWQgZnJvbSB0aHJlZS5yZW5kZXJlcnMuc2hhZGVycy5Vbmlmb3JtVXRpbHMuanNcbmV4cG9ydCBmdW5jdGlvbiBjbG9uZVVuaWZvcm1zKCBzcmM6IFVuaWZvcm1zICk6IFVuaWZvcm1zIHtcblx0dmFyIGRzdDogVW5pZm9ybXMgPSB7fTtcblxuXHRmb3IgKCB2YXIgdSBpbiBzcmMgKSB7XG5cdFx0ZHN0WyB1IF0gPSB7fSA7XG5cdFx0Zm9yICggdmFyIHAgaW4gc3JjWyB1IF0gKSB7XG5cdFx0XHR2YXIgcHJvcGVydHkgPSBzcmNbIHUgXVsgcCBdO1xuXHRcdFx0aWYgKCBwcm9wZXJ0eSAmJiAoIHByb3BlcnR5LmlzQ29sb3IgfHxcblx0XHRcdFx0cHJvcGVydHkuaXNNYXRyaXgzIHx8IHByb3BlcnR5LmlzTWF0cml4NCB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc1ZlY3RvcjIgfHwgcHJvcGVydHkuaXNWZWN0b3IzIHx8IHByb3BlcnR5LmlzVmVjdG9yNCB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc1RleHR1cmUgKSApIHtcblx0XHRcdFx0ICAgIGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eS5jbG9uZSgpO1xuXHRcdFx0fSBlbHNlIGlmICggQXJyYXkuaXNBcnJheSggcHJvcGVydHkgKSApIHtcblx0XHRcdFx0ZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5LnNsaWNlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkc3RbIHUgXVsgcCBdID0gcHJvcGVydHk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkc3Q7XG59XG5cbnR5cGUgU3VwZXJDbGFzc1R5cGVzID0gdHlwZW9mIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcblxudHlwZSBTdXBlckNsYXNzZXMgPSBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCB8IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsIHwgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB8IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsIHwgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcblxuaW50ZXJmYWNlIEV4dGVuc2lvbkRhdGEge1xuICAgIFNoYWRlckNsYXNzOiBTdXBlckNsYXNzVHlwZXM7XG4gICAgU2hhZGVyTGliOiBUSFJFRS5TaGFkZXI7XG4gICAgS2V5OiBzdHJpbmcsXG4gICAgQ291bnQ6IG51bWJlcixcbiAgICBNb2RpZmllZE5hbWUoKTogc3RyaW5nLFxuICAgIFR5cGVDaGVjazogc3RyaW5nXG59XG5cbmxldCBjbGFzc01hcDoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmc7fSA9IHtcbiAgICBNZXNoU3RhbmRhcmRNYXRlcmlhbDogXCJzdGFuZGFyZFwiLFxuICAgIE1lc2hCYXNpY01hdGVyaWFsOiBcImJhc2ljXCIsXG4gICAgTWVzaExhbWJlcnRNYXRlcmlhbDogXCJsYW1iZXJ0XCIsXG4gICAgTWVzaFBob25nTWF0ZXJpYWw6IFwicGhvbmdcIixcbiAgICBNZXNoRGVwdGhNYXRlcmlhbDogXCJkZXB0aFwiLFxuICAgIHN0YW5kYXJkOiBcInN0YW5kYXJkXCIsXG4gICAgYmFzaWM6IFwiYmFzaWNcIixcbiAgICBsYW1iZXJ0OiBcImxhbWJlcnRcIixcbiAgICBwaG9uZzogXCJwaG9uZ1wiLFxuICAgIGRlcHRoOiBcImRlcHRoXCJcbn1cblxubGV0IHNoYWRlck1hcDoge1tuYW1lOiBzdHJpbmddOiBFeHRlbnNpb25EYXRhO31cblxuY29uc3QgZ2V0U2hhZGVyRGVmID0gKCBjbGFzc09yU3RyaW5nOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcgKT0+e1xuXG4gICAgaWYoICFzaGFkZXJNYXAgKXtcblxuICAgICAgICBsZXQgY2xhc3Nlczoge1tuYW1lOiBzdHJpbmddOiBTdXBlckNsYXNzVHlwZXM7fSA9IHtcbiAgICAgICAgICAgIHN0YW5kYXJkOiBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCxcbiAgICAgICAgICAgIGJhc2ljOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCxcbiAgICAgICAgICAgIGxhbWJlcnQ6IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwsXG4gICAgICAgICAgICBwaG9uZzogVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwsXG4gICAgICAgICAgICBkZXB0aDogVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcbiAgICAgICAgfVxuXG4gICAgICAgIHNoYWRlck1hcCA9IHt9O1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBjbGFzc2VzICl7XG4gICAgICAgICAgICBzaGFkZXJNYXBbIGtleSBdID0ge1xuICAgICAgICAgICAgICAgIFNoYWRlckNsYXNzOiBjbGFzc2VzWyBrZXkgXSxcbiAgICAgICAgICAgICAgICBTaGFkZXJMaWI6IFRIUkVFLlNoYWRlckxpYlsga2V5IF0sXG4gICAgICAgICAgICAgICAgS2V5OiBrZXksXG4gICAgICAgICAgICAgICAgQ291bnQ6IDAsXG4gICAgICAgICAgICAgICAgTW9kaWZpZWROYW1lOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYE1vZGlmaWVkTWVzaCR7IHRoaXMuS2V5WzBdLnRvVXBwZXJDYXNlKCkgKyB0aGlzLktleS5zbGljZSgxKSB9TWF0ZXJpYWxfJHsgKyt0aGlzLkNvdW50IH1gO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgVHlwZUNoZWNrOiBgaXNNZXNoJHsga2V5WzBdLnRvVXBwZXJDYXNlKCkgKyBrZXkuc2xpY2UoMSkgfU1hdGVyaWFsYFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHNoYWRlckRlZjogRXh0ZW5zaW9uRGF0YSB8IHVuZGVmaW5lZDtcblxuICAgIGlmICggdHlwZW9mIGNsYXNzT3JTdHJpbmcgPT09ICdmdW5jdGlvbicgKXtcbiAgICAgICAgZm9yKCBsZXQga2V5IGluIHNoYWRlck1hcCApe1xuICAgICAgICAgICAgaWYoIHNoYWRlck1hcFsga2V5IF0uU2hhZGVyQ2xhc3MgPT09IGNsYXNzT3JTdHJpbmcgKXtcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBzaGFkZXJNYXBbIGtleSBdO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgY2xhc3NPclN0cmluZyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgbGV0IG1hcHBlZENsYXNzT3JTdHJpbmcgPSBjbGFzc01hcFsgY2xhc3NPclN0cmluZyBdXG4gICAgICAgIHNoYWRlckRlZiA9IHNoYWRlck1hcFsgbWFwcGVkQ2xhc3NPclN0cmluZyB8fCBjbGFzc09yU3RyaW5nIF07XG4gICAgfVxuXG4gICAgaWYoICFzaGFkZXJEZWYgKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnTm8gU2hhZGVyIGZvdW5kIHRvIG1vZGlmeS4uLicgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyRGVmO1xufVxuXG4vKipcbiAqIFRoZSBtYWluIE1hdGVyaWFsIE1vZG9maWVyXG4gKi9cbmNsYXNzIE1hdGVyaWFsTW9kaWZpZXIge1xuICAgIF92ZXJ0ZXhIb29rczoge1t2ZXJ0ZXhob29rOiBzdHJpbmddOiBzdHJpbmd9XG4gICAgX2ZyYWdtZW50SG9va3M6IHtbZnJhZ2VtZW50aG9vazogc3RyaW5nXTogc3RyaW5nfVxuXG4gICAgY29uc3RydWN0b3IoIHZlcnRleEhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30sIGZyYWdtZW50SG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApe1xuXG4gICAgICAgIHRoaXMuX3ZlcnRleEhvb2tzID0ge307XG4gICAgICAgIHRoaXMuX2ZyYWdtZW50SG9va3MgPSB7fTtcblxuICAgICAgICBpZiggdmVydGV4SG9va0RlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuZGVmaW5lVmVydGV4SG9va3MoIHZlcnRleEhvb2tEZWZzICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiggZnJhZ21lbnRIb29rRGVmcyApe1xuICAgICAgICAgICAgdGhpcy5kZWZpbmVGcmFnbWVudEhvb2tzKCBmcmFnbWVudEhvb2tEZWZzICk7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIG1vZGlmeSggc2hhZGVyOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcsIG9wdHM6IFNoYWRlckV4dGVuc2lvbk9wdHMgKTogRXh0ZW5kZWRNYXRlcmlhbCB7XG5cbiAgICAgICAgbGV0IGRlZiA9IGdldFNoYWRlckRlZiggc2hhZGVyICk7XG5cbiAgICAgICAgbGV0IHZlcnRleFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi52ZXJ0ZXhTaGFkZXIsIHRoaXMuX3ZlcnRleEhvb2tzLCBvcHRzLnZlcnRleFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgZnJhZ21lbnRTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIuZnJhZ21lbnRTaGFkZXIsIHRoaXMuX2ZyYWdtZW50SG9va3MsIG9wdHMuZnJhZ21lbnRTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIGRlZi5TaGFkZXJMaWIudW5pZm9ybXMsIG9wdHMudW5pZm9ybXMgfHwge30gKTtcblxuICAgICAgICByZXR1cm4geyB2ZXJ0ZXhTaGFkZXIsZnJhZ21lbnRTaGFkZXIsdW5pZm9ybXMgfTtcblxuICAgIH1cblxuICAgIGV4dGVuZCggc2hhZGVyOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcsIG9wdHM6IFNoYWRlckV4dGVuc2lvbk9wdHMgKTogeyBuZXcoKTogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsIH0ge1xuXG4gICAgICAgIGxldCBkZWYgPSBnZXRTaGFkZXJEZWYoIHNoYWRlciApOyAvLyBBREpVU1QgVEhJUyBTSEFERVIgREVGIC0gT05MWSBERUZJTkUgT05DRSAtIEFORCBTVE9SRSBBIFVTRSBDT1VOVCBPTiBFWFRFTkRFRCBWRVJTSU9OUy5cblxuICAgICAgICBsZXQgdmVydGV4U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLnZlcnRleFNoYWRlciwgdGhpcy5fdmVydGV4SG9va3MsIG9wdHMudmVydGV4U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCBmcmFnbWVudFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi5mcmFnbWVudFNoYWRlciwgdGhpcy5fZnJhZ21lbnRIb29rcywgb3B0cy5mcmFnbWVudFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgZGVmLlNoYWRlckxpYi51bmlmb3Jtcywgb3B0cy51bmlmb3JtcyB8fCB7fSApO1xuXG4gICAgICAgIGxldCBDbGFzc05hbWUgPSBvcHRzLmNsYXNzTmFtZSB8fCBkZWYuTW9kaWZpZWROYW1lKCk7XG5cbiAgICAgICAgbGV0IGV4dGVuZE1hdGVyaWFsID0gbmV3IEZ1bmN0aW9uKCAnQmFzZUNsYXNzJywgJ3VuaWZvcm1zJywgJ3ZlcnRleFNoYWRlcicsICdmcmFnbWVudFNoYWRlcicsICdjbG9uZVVuaWZvcm1zJyxgXG5cbiAgICAgICAgICAgIGxldCBjbHMgPSBjbGFzcyAke0NsYXNzTmFtZX0gZXh0ZW5kcyBCYXNlQ2xhc3Mge1xuICAgICAgICAgICAgICAgIGNvbnN0cnVjdG9yKCBwYXJhbXMgKXtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIocGFyYW1zKVxuICAgIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1zID0gY2xvbmVVbmlmb3JtcyggdW5pZm9ybXMgKTtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0VmFsdWVzKCBwYXJhbXMgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICAgICAgY29weSggc291cmNlICl7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHN1cGVyLmNvcHkoc291cmNlICk7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgc291cmNlLnVuaWZvcm1zICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICBcbiAgICAgICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2YXIgY2xzID0gZnVuY3Rpb24gJHtDbGFzc05hbWV9KCBwYXJhbXMgKXtcblxuICAgICAgICAgICAgLy8gICAgIC8vQmFzZUNsYXNzLnByb3RvdHlwZS5jb25zdHJ1Y3Rvci5jYWxsKCB0aGlzLCBwYXJhbXMgKTtcblxuICAgICAgICAgICAgLy8gICAgIHRoaXMudW5pZm9ybXMgPSBjbG9uZVVuaWZvcm1zKCB1bmlmb3JtcyApO1xuXG4gICAgICAgICAgICAvLyAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAvLyAgICAgdGhpcy5mcmFnbWVudFNoYWRlciA9IGZyYWdtZW50U2hhZGVyO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuXG4gICAgICAgICAgICAvLyAgICAgdGhpcy5zZXRWYWx1ZXMoIHBhcmFtcyApO1xuXG4gICAgICAgICAgICAvLyB9XG5cbiAgICAgICAgICAgIC8vIGNscy5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKCBCYXNlQ2xhc3MucHJvdG90eXBlICk7XG4gICAgICAgICAgICAvLyBjbHMucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY2xzO1xuICAgICAgICAgICAgLy8gY2xzLnByb3RvdHlwZS4keyBkZWYuVHlwZUNoZWNrIH0gPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyBjbHMucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiggc291cmNlICl7XG5cbiAgICAgICAgICAgIC8vICAgICBCYXNlQ2xhc3MucHJvdG90eXBlLmNvcHkuY2FsbCggdGhpcywgc291cmNlICk7XG5cbiAgICAgICAgICAgIC8vICAgICB0aGlzLnVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIHNvdXJjZS51bmlmb3JtcyApO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgIC8vICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcblxuICAgICAgICAgICAgLy8gICAgIHJldHVybiB0aGlzO1xuXG4gICAgICAgICAgICAvLyB9XG5cbiAgICAgICAgICAgIHJldHVybiBjbHM7XG5cbiAgICAgICAgYCk7XG5cbiAgICAgICAgaWYoIG9wdHMucG9zdE1vZGlmeVZlcnRleFNoYWRlciApe1xuICAgICAgICAgICAgdmVydGV4U2hhZGVyID0gb3B0cy5wb3N0TW9kaWZ5VmVydGV4U2hhZGVyKCB2ZXJ0ZXhTaGFkZXIgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiggb3B0cy5wb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXIgKXtcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyID0gb3B0cy5wb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXIoIGZyYWdtZW50U2hhZGVyICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXh0ZW5kTWF0ZXJpYWwoIGRlZi5TaGFkZXJDbGFzcywgdW5pZm9ybXMsIHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIsIGNsb25lVW5pZm9ybXMgKTtcblxuICAgIH1cblxuICAgIGRlZmluZVZlcnRleEhvb2tzKCBkZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKXtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gZGVmcyApe1xuICAgICAgICAgICAgdGhpcy5fdmVydGV4SG9va3NbIGtleSBdID0gZGVmc1trZXldO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBkZWZpbmVGcmFnbWVudEhvb2tzKCBkZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZyB9ICkge1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBkZWZzICl7XG4gICAgICAgICAgICB0aGlzLl9mcmFnbWVudEhvb2tzWyBrZXkgXSA9IGRlZnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG59XG5cbmxldCBkZWZhdWx0TWF0ZXJpYWxNb2RpZmllciA9IG5ldyBNYXRlcmlhbE1vZGlmaWVyKCBkZWZhdWx0SG9va3MudmVydGV4SG9va3MsIGRlZmF1bHRIb29rcy5mcmFnbWVudEhvb2tzICk7XG5cbmV4cG9ydCB7IEV4dGVuZGVkTWF0ZXJpYWwsIE1hdGVyaWFsTW9kaWZpZXIsIFNoYWRlckV4dGVuc2lvbiwgU2hhZGVyRXh0ZW5zaW9uT3B0cywgZGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgIGFzIERlZmF1bHRNYXRlcmlhbE1vZGlmaWVyfSIsImV4cG9ydCBkZWZhdWx0IC8qIGdsc2wgKi9gXG4gICAgICAgIC8vIGFib3ZlIGhlcmUsIHRoZSB0ZXh0dXJlIGxvb2t1cCB3aWxsIGJlIGRvbmUsIHdoaWNoIHdlXG4gICAgICAgIC8vIGNhbiBkaXNhYmxlIGJ5IHJlbW92aW5nIHRoZSBtYXAgZnJvbSB0aGUgbWF0ZXJpYWxcbiAgICAgICAgLy8gYnV0IGlmIHdlIGxlYXZlIGl0LCB3ZSBjYW4gYWxzbyBjaG9vc2UgdGhlIGJsZW5kIHRoZSB0ZXh0dXJlXG4gICAgICAgIC8vIHdpdGggb3VyIHNoYWRlciBjcmVhdGVkIGNvbG9yLCBvciB1c2UgaXQgaW4gdGhlIHNoYWRlciBvclxuICAgICAgICAvLyB3aGF0ZXZlclxuICAgICAgICAvL1xuICAgICAgICAvLyB2ZWM0IHRleGVsQ29sb3IgPSB0ZXh0dXJlMkQoIG1hcCwgdlV2ICk7XG4gICAgICAgIC8vIHRleGVsQ29sb3IgPSBtYXBUZXhlbFRvTGluZWFyKCB0ZXhlbENvbG9yICk7XG4gICAgICAgIFxuICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuICAgICAgICBcbiAgICAgICAgdmVjNCBzaGFkZXJDb2xvcjtcbiAgICAgICAgbWFpbkltYWdlKHNoYWRlckNvbG9yLCB1di54eSAqIGlSZXNvbHV0aW9uLnh5KTtcbiAgICAgICAgc2hhZGVyQ29sb3IgPSBtYXBUZXhlbFRvTGluZWFyKCBzaGFkZXJDb2xvciApO1xuXG4gICAgICAgIGRpZmZ1c2VDb2xvciAqPSBzaGFkZXJDb2xvcjtcbmA7XG4iLCJleHBvcnQgZGVmYXVsdCB7XG4gICAgaVRpbWU6IHsgdmFsdWU6IDAuMCB9LFxuICAgIGlSZXNvbHV0aW9uOiAgeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjMoNTEyLCA1MTIsIDEpIH0sXG4gICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0sXG4gICAgdGV4RmxpcFk6IHsgdmFsdWU6IDAgfVxufTsiLCJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxudW5pZm9ybSB2ZWMzIGlSZXNvbHV0aW9uO1xudW5pZm9ybSBmbG9hdCBpVGltZTtcbnVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG51bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xudW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuICBgO1xuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvYTQ0OGUzNGI4MTM2ZmFlNS5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IGJheWVySW1hZ2UgZnJvbSAnLi4vYXNzZXRzL2JheWVyLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBiYXllclRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKGJheWVySW1hZ2UsIChiYXllcikgPT4ge1xuICAgIGJheWVyLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmF5ZXIubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYXllci53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJheWVyLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmF5ZXJUZXggPSBiYXllclxufSlcblxubGV0IEJsZWVweUJsb2Nrc1NoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICB1bmlmb3JtczogdW5pZm9ybXMsXG5cbiAgdmVydGV4U2hhZGVyOiB7fSxcblxuICBmcmFnbWVudFNoYWRlcjogeyBcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAvLyBCeSBEYWVkZWx1czogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS91c2VyL0RhZWRlbHVzXG4gICAgICAvLyBsaWNlbnNlOiBDcmVhdGl2ZSBDb21tb25zIEF0dHJpYnV0aW9uLU5vbkNvbW1lcmNpYWwtU2hhcmVBbGlrZSAzLjAgVW5wb3J0ZWQgTGljZW5zZS5cbiAgICAgICNkZWZpbmUgVElNRVNDQUxFIDAuMjUgXG4gICAgICAjZGVmaW5lIFRJTEVTIDhcbiAgICAgICNkZWZpbmUgQ09MT1IgMC43LCAxLjYsIDIuOFxuXG4gICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICB7XG4gICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgdXYueCAqPSBpUmVzb2x1dGlvbi54IC8gaVJlc29sdXRpb24ueTtcbiAgICAgICAgXG4gICAgICAgIHZlYzQgbm9pc2UgPSB0ZXh0dXJlMkQoaUNoYW5uZWwwLCBmbG9vcih1diAqIGZsb2F0KFRJTEVTKSkgLyBmbG9hdChUSUxFUykpO1xuICAgICAgICBmbG9hdCBwID0gMS4wIC0gbW9kKG5vaXNlLnIgKyBub2lzZS5nICsgbm9pc2UuYiArIGlUaW1lICogZmxvYXQoVElNRVNDQUxFKSwgMS4wKTtcbiAgICAgICAgcCA9IG1pbihtYXgocCAqIDMuMCAtIDEuOCwgMC4xKSwgMi4wKTtcbiAgICAgICAgXG4gICAgICAgIHZlYzIgciA9IG1vZCh1diAqIGZsb2F0KFRJTEVTKSwgMS4wKTtcbiAgICAgICAgciA9IHZlYzIocG93KHIueCAtIDAuNSwgMi4wKSwgcG93KHIueSAtIDAuNSwgMi4wKSk7XG4gICAgICAgIHAgKj0gMS4wIC0gcG93KG1pbigxLjAsIDEyLjAgKiBkb3QociwgcikpLCAyLjApO1xuICAgICAgICBcbiAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChDT0xPUiwgMS4wKSAqIHA7XG4gICAgICB9XG4gICAgICBgLFxuICAgICAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBiYXllclRleFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBiYXllclRleFxuICAgIH1cblxufVxuZXhwb3J0IHsgQmxlZXB5QmxvY2tzU2hhZGVyIH1cbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5sZXQgTm9pc2VTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiksXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgICNkZWZpbmUgblBJIDMuMTQxNTkyNjUzNTg5NzkzMlxuXG4gICAgICAgIG1hdDIgbl9yb3RhdGUyZChmbG9hdCBhbmdsZSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1hdDIoY29zKGFuZ2xlKSwtc2luKGFuZ2xlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW4oYW5nbGUpLCBjb3MoYW5nbGUpKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbl9zdHJpcGUoZmxvYXQgbnVtYmVyKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbW9kID0gbW9kKG51bWJlciwgMi4wKTtcbiAgICAgICAgICAgICAgICAvL3JldHVybiBzdGVwKDAuNSwgbW9kKSpzdGVwKDEuNSwgbW9kKTtcbiAgICAgICAgICAgICAgICAvL3JldHVybiBtb2QtMS4wO1xuICAgICAgICAgICAgICAgIHJldHVybiBtaW4oMS4wLCAoc21vb3Roc3RlcCgwLjAsIDAuNSwgbW9kKSAtIHNtb290aHN0ZXAoMC41LCAxLjAsIG1vZCkpKjEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkICkge1xuICAgICAgICAgICAgICAgIHZlYzIgdV9yZXNvbHV0aW9uID0gaVJlc29sdXRpb24ueHk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdV90aW1lID0gaVRpbWU7XG4gICAgICAgICAgICAgICAgdmVjMyBjb2xvcjtcbiAgICAgICAgICAgICAgICB2ZWMyIHN0ID0gZnJhZ0Nvb3JkLnh5O1xuICAgICAgICAgICAgICAgIHN0ICs9IDIwMDAuMCArIDk5ODAwMC4wKnN0ZXAoMS43NSwgMS4wLXNpbih1X3RpbWUvOC4wKSk7XG4gICAgICAgICAgICAgICAgc3QgKz0gdV90aW1lLzIwMDAuMDtcbiAgICAgICAgICAgICAgICBmbG9hdCBtID0gKDEuMCs5LjAqc3RlcCgxLjAsIDEuMC1zaW4odV90aW1lLzguMCkpKS8oMS4wKzkuMCpzdGVwKDEuMCwgMS4wLXNpbih1X3RpbWUvMTYuMCkpKTtcbiAgICAgICAgICAgICAgICB2ZWMyIHN0MSA9IHN0ICogKDQwMC4wICsgMTIwMC4wKnN0ZXAoMS43NSwgMS4wK3Npbih1X3RpbWUpKSAtIDMwMC4wKnN0ZXAoMS41LCAxLjArc2luKHVfdGltZS8zLjApKSk7XG4gICAgICAgICAgICAgICAgc3QgPSBuX3JvdGF0ZTJkKHNpbihzdDEueCkqc2luKHN0MS55KS8obSoxMDAuMCt1X3RpbWUvMTAwLjApKSAqIHN0O1xuICAgICAgICAgICAgICAgIHZlYzIgc3QyID0gc3QgKiAoMTAwLjAgKyAxOTAwLjAqc3RlcCgxLjc1LCAxLjAtc2luKHVfdGltZS8yLjApKSk7XG4gICAgICAgICAgICAgICAgc3QgPSBuX3JvdGF0ZTJkKGNvcyhzdDIueCkqY29zKHN0Mi55KS8obSoxMDAuMCt1X3RpbWUvMTAwLjApKSAqIHN0O1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZCgwLjUqblBJKyhuUEkqMC41KnN0ZXAoIDEuMCwxLjArIHNpbih1X3RpbWUvMS4wKSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICArKG5QSSowLjEqc3RlcCggMS4wLDEuMCsgY29zKHVfdGltZS8yLjApKSkrdV90aW1lKjAuMDAwMSkgKiBzdDtcbiAgICAgICAgICAgICAgICBzdCAqPSAxMC4wO1xuICAgICAgICAgICAgICAgIHN0IC89IHVfcmVzb2x1dGlvbjtcbiAgICAgICAgICAgICAgICBjb2xvciA9IHZlYzMobl9zdHJpcGUoc3QueCp1X3Jlc29sdXRpb24ueC8xMC4wK3VfdGltZS8xMC4wKSk7XG4gICAgICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChjb2xvciwgMS4wKTtcbiAgICAgICAgfVxuICAgICAgICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxXG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IE5vaXNlU2hhZGVyIH1cbiIsIi8vIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L1hkc0JEQlxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5sZXQgTGlxdWlkTWFyYmxlU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgLy8vLyBDT0xPUlMgLy8vL1xuXG4gICAgICBjb25zdCB2ZWMzIE9SQU5HRSA9IHZlYzMoMS4wLCAwLjYsIDAuMik7XG4gICAgICBjb25zdCB2ZWMzIFBJTksgICA9IHZlYzMoMC43LCAwLjEsIDAuNCk7IFxuICAgICAgY29uc3QgdmVjMyBCTFVFICAgPSB2ZWMzKDAuMCwgMC4yLCAwLjkpOyBcbiAgICAgIGNvbnN0IHZlYzMgQkxBQ0sgID0gdmVjMygwLjAsIDAuMCwgMC4yKTtcbiAgICAgIFxuICAgICAgLy8vLy8gTk9JU0UgLy8vLy9cbiAgICAgIFxuICAgICAgZmxvYXQgaGFzaCggZmxvYXQgbiApIHtcbiAgICAgICAgICAvL3JldHVybiBmcmFjdChzaW4obikqNDM3NTguNTQ1MzEyMyk7ICAgXG4gICAgICAgICAgcmV0dXJuIGZyYWN0KHNpbihuKSo3NTcyOC41NDUzMTIzKTsgXG4gICAgICB9XG4gICAgICBcbiAgICAgIFxuICAgICAgZmxvYXQgbm9pc2UoIGluIHZlYzIgeCApIHtcbiAgICAgICAgICB2ZWMyIHAgPSBmbG9vcih4KTtcbiAgICAgICAgICB2ZWMyIGYgPSBmcmFjdCh4KTtcbiAgICAgICAgICBmID0gZipmKigzLjAtMi4wKmYpO1xuICAgICAgICAgIGZsb2F0IG4gPSBwLnggKyBwLnkqNTcuMDtcbiAgICAgICAgICByZXR1cm4gbWl4KG1peCggaGFzaChuICsgMC4wKSwgaGFzaChuICsgMS4wKSwgZi54KSwgbWl4KGhhc2gobiArIDU3LjApLCBoYXNoKG4gKyA1OC4wKSwgZi54KSwgZi55KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8vLy8vIEZCTSAvLy8vLy8gXG4gICAgICBcbiAgICAgIG1hdDIgbSA9IG1hdDIoIDAuNiwgMC42LCAtMC42LCAwLjgpO1xuICAgICAgZmxvYXQgZmJtKHZlYzIgcCl7XG4gICAgICAgXG4gICAgICAgICAgZmxvYXQgZiA9IDAuMDtcbiAgICAgICAgICBmICs9IDAuNTAwMCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAyO1xuICAgICAgICAgIGYgKz0gMC4yNTAwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDM7XG4gICAgICAgICAgZiArPSAwLjEyNTAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMTtcbiAgICAgICAgICBmICs9IDAuMDYyNSAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjA0O1xuICAgICAgICAgIGYgLz0gMC45Mzc1O1xuICAgICAgICAgIHJldHVybiBmO1xuICAgICAgfVxuICAgICAgXG4gICAgICBcbiAgICAgIHZvaWQgbWFpbkltYWdlKG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQpe1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIHBpeGVsIHJhdGlvXG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5IDsgIFxuICAgICAgICAgIHZlYzIgcCA9IC0gMS4gKyAyLiAqIHV2O1xuICAgICAgICAgIHAueCAqPSBpUmVzb2x1dGlvbi54IC8gaVJlc29sdXRpb24ueTtcbiAgICAgICAgICAgXG4gICAgICAgICAgLy8gZG9tYWluc1xuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IHIgPSBzcXJ0KGRvdChwLHApKTsgXG4gICAgICAgICAgZmxvYXQgYSA9IGNvcyhwLnkgKiBwLngpOyAgXG4gICAgICAgICAgICAgICAgIFxuICAgICAgICAgIC8vIGRpc3RvcnRpb25cbiAgICAgICAgICBcbiAgICAgICAgICBmbG9hdCBmID0gZmJtKCA1LjAgKiBwKTtcbiAgICAgICAgICBhICs9IGZibSh2ZWMyKDEuOSAtIHAueCwgMC45ICogaVRpbWUgKyBwLnkpKTtcbiAgICAgICAgICBhICs9IGZibSgwLjQgKiBwKTtcbiAgICAgICAgICByICs9IGZibSgyLjkgKiBwKTtcbiAgICAgICAgICAgICBcbiAgICAgICAgICAvLyBjb2xvcml6ZVxuICAgICAgICAgIFxuICAgICAgICAgIHZlYzMgY29sID0gQkxVRTtcbiAgICAgICAgICBcbiAgICAgICAgICBmbG9hdCBmZiA9IDEuMCAtIHNtb290aHN0ZXAoLTAuNCwgMS4xLCBub2lzZSh2ZWMyKDAuNSAqIGEsIDMuMyAqIGEpKSApOyAgICAgICAgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBPUkFOR0UsIGZmKTtcbiAgICAgICAgICAgICBcbiAgICAgICAgICBmZiA9IDEuMCAtIHNtb290aHN0ZXAoLjAsIDIuOCwgciApO1xuICAgICAgICAgIGNvbCArPSAgbWl4KCBjb2wsIEJMQUNLLCAgZmYpO1xuICAgICAgICAgIFxuICAgICAgICAgIGZmIC09IDEuMCAtIHNtb290aHN0ZXAoMC4zLCAwLjUsIGZibSh2ZWMyKDEuMCwgNDAuMCAqIGEpKSApOyBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIFBJTkssICBmZik7ICBcbiAgICAgICAgICAgIFxuICAgICAgICAgIGZmID0gMS4wIC0gc21vb3Roc3RlcCgyLiwgMi45LCBhICogMS41ICk7IFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgQkxBQ0ssICBmZik7ICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KGNvbCwgMS4pO1xuICAgICAgfVxuICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMihtYXQubWFwLm9mZnNldC54KyBNYXRoLnJhbmRvbSgpLCBtYXQubWFwLm9mZnNldC54KyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgIH1cbn1cblxuZXhwb3J0IHsgTGlxdWlkTWFyYmxlU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2NlY2VmYjUwZTQwOGQxMDUucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zbEdXTlxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcblxubGV0IEdhbGF4eVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vQ0JTXG4gICAgICAgIC8vUGFyYWxsYXggc2Nyb2xsaW5nIGZyYWN0YWwgZ2FsYXh5LlxuICAgICAgICAvL0luc3BpcmVkIGJ5IEpvc2hQJ3MgU2ltcGxpY2l0eSBzaGFkZXI6IGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9sc2xHV3JcbiAgICAgICAgXG4gICAgICAgIC8vIGh0dHA6Ly93d3cuZnJhY3RhbGZvcnVtcy5jb20vbmV3LXRoZW9yaWVzLWFuZC1yZXNlYXJjaC92ZXJ5LXNpbXBsZS1mb3JtdWxhLWZvci1mcmFjdGFsLXBhdHRlcm5zL1xuICAgICAgICBmbG9hdCBmaWVsZChpbiB2ZWMzIHAsZmxvYXQgcykge1xuICAgICAgICAgICAgZmxvYXQgc3RyZW5ndGggPSA3LiArIC4wMyAqIGxvZygxLmUtNiArIGZyYWN0KHNpbihpVGltZSkgKiA0MzczLjExKSk7XG4gICAgICAgICAgICBmbG9hdCBhY2N1bSA9IHMvNC47XG4gICAgICAgICAgICBmbG9hdCBwcmV2ID0gMC47XG4gICAgICAgICAgICBmbG9hdCB0dyA9IDAuO1xuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAyNjsgKytpKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbWFnID0gZG90KHAsIHApO1xuICAgICAgICAgICAgICAgIHAgPSBhYnMocCkgLyBtYWcgKyB2ZWMzKC0uNSwgLS40LCAtMS41KTtcbiAgICAgICAgICAgICAgICBmbG9hdCB3ID0gZXhwKC1mbG9hdChpKSAvIDcuKTtcbiAgICAgICAgICAgICAgICBhY2N1bSArPSB3ICogZXhwKC1zdHJlbmd0aCAqIHBvdyhhYnMobWFnIC0gcHJldiksIDIuMikpO1xuICAgICAgICAgICAgICAgIHR3ICs9IHc7XG4gICAgICAgICAgICAgICAgcHJldiA9IG1hZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXgoMC4sIDUuICogYWNjdW0gLyB0dyAtIC43KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gTGVzcyBpdGVyYXRpb25zIGZvciBzZWNvbmQgbGF5ZXJcbiAgICAgICAgZmxvYXQgZmllbGQyKGluIHZlYzMgcCwgZmxvYXQgcykge1xuICAgICAgICAgICAgZmxvYXQgc3RyZW5ndGggPSA3LiArIC4wMyAqIGxvZygxLmUtNiArIGZyYWN0KHNpbihpVGltZSkgKiA0MzczLjExKSk7XG4gICAgICAgICAgICBmbG9hdCBhY2N1bSA9IHMvNC47XG4gICAgICAgICAgICBmbG9hdCBwcmV2ID0gMC47XG4gICAgICAgICAgICBmbG9hdCB0dyA9IDAuO1xuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAxODsgKytpKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbWFnID0gZG90KHAsIHApO1xuICAgICAgICAgICAgICAgIHAgPSBhYnMocCkgLyBtYWcgKyB2ZWMzKC0uNSwgLS40LCAtMS41KTtcbiAgICAgICAgICAgICAgICBmbG9hdCB3ID0gZXhwKC1mbG9hdChpKSAvIDcuKTtcbiAgICAgICAgICAgICAgICBhY2N1bSArPSB3ICogZXhwKC1zdHJlbmd0aCAqIHBvdyhhYnMobWFnIC0gcHJldiksIDIuMikpO1xuICAgICAgICAgICAgICAgIHR3ICs9IHc7XG4gICAgICAgICAgICAgICAgcHJldiA9IG1hZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBtYXgoMC4sIDUuICogYWNjdW0gLyB0dyAtIC43KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBucmFuZDMoIHZlYzIgY28gKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGEgPSBmcmFjdCggY29zKCBjby54KjguM2UtMyArIGNvLnkgKSp2ZWMzKDEuM2U1LCA0LjdlNSwgMi45ZTUpICk7XG4gICAgICAgICAgICB2ZWMzIGIgPSBmcmFjdCggc2luKCBjby54KjAuM2UtMyArIGNvLnkgKSp2ZWMzKDguMWU1LCAxLjBlNSwgMC4xZTUpICk7XG4gICAgICAgICAgICB2ZWMzIGMgPSBtaXgoYSwgYiwgMC41KTtcbiAgICAgICAgICAgIHJldHVybiBjO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKSB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gMi4gKiBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eSAtIDEuO1xuICAgICAgICAgICAgdmVjMiB1dnMgPSB1diAqIGlSZXNvbHV0aW9uLnh5IC8gbWF4KGlSZXNvbHV0aW9uLngsIGlSZXNvbHV0aW9uLnkpO1xuICAgICAgICAgICAgdmVjMyBwID0gdmVjMyh1dnMgLyA0LiwgMCkgKyB2ZWMzKDEuLCAtMS4zLCAwLik7XG4gICAgICAgICAgICBwICs9IC4yICogdmVjMyhzaW4oaVRpbWUgLyAxNi4pLCBzaW4oaVRpbWUgLyAxMi4pLCAgc2luKGlUaW1lIC8gMTI4LikpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBmcmVxc1s0XTtcbiAgICAgICAgICAgIC8vU291bmRcbiAgICAgICAgICAgIGZyZXFzWzBdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjAxLCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbMV0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMDcsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1syXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4xNSwgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzNdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjMwLCAwLjI1ICkgKS54O1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHQgPSBmaWVsZChwLGZyZXFzWzJdKTtcbiAgICAgICAgICAgIGZsb2F0IHYgPSAoMS4gLSBleHAoKGFicyh1di54KSAtIDEuKSAqIDYuKSkgKiAoMS4gLSBleHAoKGFicyh1di55KSAtIDEuKSAqIDYuKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vU2Vjb25kIExheWVyXG4gICAgICAgICAgICB2ZWMzIHAyID0gdmVjMyh1dnMgLyAoNC4rc2luKGlUaW1lKjAuMTEpKjAuMiswLjIrc2luKGlUaW1lKjAuMTUpKjAuMyswLjQpLCAxLjUpICsgdmVjMygyLiwgLTEuMywgLTEuKTtcbiAgICAgICAgICAgIHAyICs9IDAuMjUgKiB2ZWMzKHNpbihpVGltZSAvIDE2LiksIHNpbihpVGltZSAvIDEyLiksICBzaW4oaVRpbWUgLyAxMjguKSk7XG4gICAgICAgICAgICBmbG9hdCB0MiA9IGZpZWxkMihwMixmcmVxc1szXSk7XG4gICAgICAgICAgICB2ZWM0IGMyID0gbWl4KC40LCAxLiwgdikgKiB2ZWM0KDEuMyAqIHQyICogdDIgKiB0MiAsMS44ICAqIHQyICogdDIgLCB0MiogZnJlcXNbMF0sIHQyKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL0xldCdzIGFkZCBzb21lIHN0YXJzXG4gICAgICAgICAgICAvL1RoYW5rcyB0byBodHRwOi8vZ2xzbC5oZXJva3UuY29tL2UjNjkwNC4wXG4gICAgICAgICAgICB2ZWMyIHNlZWQgPSBwLnh5ICogMi4wO1x0XG4gICAgICAgICAgICBzZWVkID0gZmxvb3Ioc2VlZCAqIGlSZXNvbHV0aW9uLngpO1xuICAgICAgICAgICAgdmVjMyBybmQgPSBucmFuZDMoIHNlZWQgKTtcbiAgICAgICAgICAgIHZlYzQgc3RhcmNvbG9yID0gdmVjNChwb3cocm5kLnksNDAuMCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1NlY29uZCBMYXllclxuICAgICAgICAgICAgdmVjMiBzZWVkMiA9IHAyLnh5ICogMi4wO1xuICAgICAgICAgICAgc2VlZDIgPSBmbG9vcihzZWVkMiAqIGlSZXNvbHV0aW9uLngpO1xuICAgICAgICAgICAgdmVjMyBybmQyID0gbnJhbmQzKCBzZWVkMiApO1xuICAgICAgICAgICAgc3RhcmNvbG9yICs9IHZlYzQocG93KHJuZDIueSw0MC4wKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZyYWdDb2xvciA9IG1peChmcmVxc1szXS0uMywgMS4sIHYpICogdmVjNCgxLjUqZnJlcXNbMl0gKiB0ICogdCogdCAsIDEuMipmcmVxc1sxXSAqIHQgKiB0LCBmcmVxc1szXSp0LCAxLjApK2MyK3N0YXJjb2xvcjtcbiAgICAgICAgfVxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgIH1cbn1cblxuZXhwb3J0IHsgR2FsYXh5U2hhZGVyIH1cbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvNHNHU3pjXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvc21hbGwtbm9pc2UucG5nJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG59KVxuXG5sZXQgTGFjZVR1bm5lbFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIENyZWF0ZWQgYnkgU3RlcGhhbmUgQ3VpbGxlcmRpZXIgLSBBaWVraWNrLzIwMTUgKHR3aXR0ZXI6QGFpZWtpY2spXG4gICAgICAgIC8vIExpY2Vuc2UgQ3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbi1Ob25Db21tZXJjaWFsLVNoYXJlQWxpa2UgMy4wIFVucG9ydGVkIExpY2Vuc2UuXG4gICAgICAgIC8vIFR1bmVkIHZpYSBYU2hhZGUgKGh0dHA6Ly93d3cuZnVucGFyYWRpZ20uY29tL3hzaGFkZS8pXG4gICAgICAgIFxuICAgICAgICB2ZWMyIGx0X21vID0gdmVjMigwKTtcbiAgICAgICAgXG4gICAgICAgIGZsb2F0IGx0X3BuKCBpbiB2ZWMzIHggKSAvLyBpcSBub2lzZVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIHAgPSBmbG9vcih4KTtcbiAgICAgICAgICAgIHZlYzMgZiA9IGZyYWN0KHgpO1xuICAgICAgICAgICAgZiA9IGYqZiooMy4wLTIuMCpmKTtcbiAgICAgICAgICAgIHZlYzIgdXYgPSAocC54eSt2ZWMyKDM3LjAsMTcuMCkqcC56KSArIGYueHk7XG4gICAgICAgICAgICB2ZWMyIHJnID0gdGV4dHVyZShpQ2hhbm5lbDAsICh1disgMC41KS8yNTYuMCwgLTEwMC4wICkueXg7XG4gICAgICAgICAgICByZXR1cm4gLTEuMCsyLjQqbWl4KCByZy54LCByZy55LCBmLnogKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMiBsdF9wYXRoKGZsb2F0IHQpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJldHVybiB2ZWMyKGNvcyh0KjAuMiksIHNpbih0KjAuMikpICogMi47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXggPSBtYXQzKDEsMCwwLDAsNywwLDAsMCw3KTtcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teSA9IG1hdDMoNywwLDAsMCwxLDAsMCwwLDcpO1xuICAgICAgICBjb25zdCBtYXQzIGx0X216ID0gbWF0Myg3LDAsMCwwLDcsMCwwLDAsMSk7XG4gICAgICAgIFxuICAgICAgICAvLyBiYXNlIG9uIHNoYW5lIHRlY2ggaW4gc2hhZGVyIDogT25lIFR3ZWV0IENlbGx1bGFyIFBhdHRlcm5cbiAgICAgICAgZmxvYXQgbHRfZnVuYyh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAgPSBmcmFjdChwLzY4LjYpIC0gLjU7XG4gICAgICAgICAgICByZXR1cm4gbWluKG1pbihhYnMocC54KSwgYWJzKHAueSkpLCBhYnMocC56KSkgKyAwLjE7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfZWZmZWN0KHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgcCAqPSBsdF9teiAqIGx0X214ICogbHRfbXkgKiBzaW4ocC56eHkpOyAvLyBzaW4ocC56eHkpIGlzIGJhc2VkIG9uIGlxIHRlY2ggZnJvbSBzaGFkZXIgKFNjdWxwdHVyZSBJSUkpXG4gICAgICAgICAgICByZXR1cm4gdmVjMyhtaW4obWluKGx0X2Z1bmMocCpsdF9teCksIGx0X2Z1bmMocCpsdF9teSkpLCBsdF9mdW5jKHAqbHRfbXopKS8uNik7XG4gICAgICAgIH1cbiAgICAgICAgLy9cbiAgICAgICAgXG4gICAgICAgIHZlYzQgbHRfZGlzcGxhY2VtZW50KHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBjb2wgPSAxLi1sdF9lZmZlY3QocCowLjgpO1xuICAgICAgICAgICAgICAgY29sID0gY2xhbXAoY29sLCAtLjUsIDEuKTtcbiAgICAgICAgICAgIGZsb2F0IGRpc3QgPSBkb3QoY29sLHZlYzMoMC4wMjMpKTtcbiAgICAgICAgICAgIGNvbCA9IHN0ZXAoY29sLCB2ZWMzKDAuODIpKTsvLyBibGFjayBsaW5lIG9uIHNoYXBlXG4gICAgICAgICAgICByZXR1cm4gdmVjNChkaXN0LGNvbCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzQgbHRfbWFwKHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgcC54eSAtPSBsdF9wYXRoKHAueik7XG4gICAgICAgICAgICB2ZWM0IGRpc3AgPSBsdF9kaXNwbGFjZW1lbnQoc2luKHAuenh5KjIuKSowLjgpO1xuICAgICAgICAgICAgcCArPSBzaW4ocC56eHkqLjUpKjEuNTtcbiAgICAgICAgICAgIGZsb2F0IGwgPSBsZW5ndGgocC54eSkgLSA0LjtcbiAgICAgICAgICAgIHJldHVybiB2ZWM0KG1heCgtbCArIDAuMDksIGwpIC0gZGlzcC54LCBkaXNwLnl6dyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfbm9yKCBpbiB2ZWMzIHBvcywgZmxvYXQgcHJlYyApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgZXBzID0gdmVjMyggcHJlYywgMC4sIDAuICk7XG4gICAgICAgICAgICB2ZWMzIGx0X25vciA9IHZlYzMoXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueHl5KS54IC0gbHRfbWFwKHBvcy1lcHMueHl5KS54LFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnl4eSkueCAtIGx0X21hcChwb3MtZXBzLnl4eSkueCxcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy55eXgpLnggLSBsdF9tYXAocG9zLWVwcy55eXgpLnggKTtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemUobHRfbm9yKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZlYzQgbHRfbGlnaHQodmVjMyBybywgdmVjMyByZCwgZmxvYXQgZCwgdmVjMyBsaWdodHBvcywgdmVjMyBsYylcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBwID0gcm8gKyByZCAqIGQ7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIG9yaWdpbmFsIG5vcm1hbGVcbiAgICAgICAgICAgIHZlYzMgbiA9IGx0X25vcihwLCAwLjEpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGxpZ2h0ZGlyID0gbGlnaHRwb3MgLSBwO1xuICAgICAgICAgICAgZmxvYXQgbGlnaHRsZW4gPSBsZW5ndGgobGlnaHRwb3MgLSBwKTtcbiAgICAgICAgICAgIGxpZ2h0ZGlyIC89IGxpZ2h0bGVuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBhbWIgPSAwLjY7XG4gICAgICAgICAgICBmbG9hdCBkaWZmID0gY2xhbXAoIGRvdCggbiwgbGlnaHRkaXIgKSwgMC4wLCAxLjAgKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgYnJkZiA9IHZlYzMoMCk7XG4gICAgICAgICAgICBicmRmICs9IGFtYiAqIHZlYzMoMC4yLDAuNSwwLjMpOyAvLyBjb2xvciBtYXRcbiAgICAgICAgICAgIGJyZGYgKz0gZGlmZiAqIDAuNjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYnJkZiA9IG1peChicmRmLCBsdF9tYXAocCkueXp3LCAwLjUpOy8vIG1lcmdlIGxpZ2h0IGFuZCBibGFjayBsaW5lIHBhdHRlcm5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB2ZWM0KGJyZGYsIGxpZ2h0bGVuKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBsdF9zdGFycyh2ZWMyIHV2LCB2ZWMzIHJkLCBmbG9hdCBkLCB2ZWMyIHMsIHZlYzIgZylcbiAgICAgICAge1xuICAgICAgICAgICAgdXYgKj0gODAwLiAqIHMueC9zLnk7XG4gICAgICAgICAgICBmbG9hdCBrID0gZnJhY3QoIGNvcyh1di55ICogMC4wMDAxICsgdXYueCkgKiA5MDAwMC4pO1xuICAgICAgICAgICAgZmxvYXQgdmFyID0gc2luKGx0X3BuKGQqMC42K3JkKjE4Mi4xNCkpKjAuNSswLjU7Ly8gdGhhbmsgdG8ga2xlbXMgZm9yIHRoZSB2YXJpYXRpb24gaW4gbXkgc2hhZGVyIHN1Ymx1bWluaWNcbiAgICAgICAgICAgIHZlYzMgY29sID0gdmVjMyhtaXgoMC4sIDEuLCB2YXIqcG93KGssIDIwMC4pKSk7Ly8gY29tZSBmcm9tIENCUyBTaGFkZXIgXCJTaW1wbGljaXR5XCIgOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNsR1dOXG4gICAgICAgICAgICByZXR1cm4gY29sO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLy8vLy8vL01BSU4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiBzID0gaVJlc29sdXRpb24ueHk7XG4gICAgICAgICAgICB2ZWMyIGcgPSBmcmFnQ29vcmQ7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0aW1lID0gaVRpbWUqMS4wO1xuICAgICAgICAgICAgZmxvYXQgY2FtX2EgPSB0aW1lOyAvLyBhbmdsZSB6XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGNhbV9lID0gMy4yOyAvLyBlbGV2YXRpb25cbiAgICAgICAgICAgIGZsb2F0IGNhbV9kID0gNC47IC8vIGRpc3RhbmNlIHRvIG9yaWdpbiBheGlzXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IG1heGQgPSA0MC47IC8vIHJheSBtYXJjaGluZyBkaXN0YW5jZSBtYXhcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMiB1diA9IChnKjIuLXMpL3MueTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBjb2wgPSB2ZWMzKDAuKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIHJvID0gdmVjMyhsdF9wYXRoKHRpbWUpK2x0X21vLHRpbWUpO1xuICAgICAgICAgICAgICB2ZWMzIGN2ID0gdmVjMyhsdF9wYXRoKHRpbWUrMC4xKStsdF9tbyx0aW1lKzAuMSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY3U9dmVjMygwLDEsMCk7XG4gICAgICAgICAgICAgIHZlYzMgcm92ID0gbm9ybWFsaXplKGN2LXJvKTtcbiAgICAgICAgICAgIHZlYzMgdSA9IG5vcm1hbGl6ZShjcm9zcyhjdSxyb3YpKTtcbiAgICAgICAgICAgICAgdmVjMyB2ID0gY3Jvc3Mocm92LHUpO1xuICAgICAgICAgICAgICB2ZWMzIHJkID0gbm9ybWFsaXplKHJvdiArIHV2LngqdSArIHV2Lnkqdik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY3VydmUwID0gdmVjMygwKTtcbiAgICAgICAgICAgIHZlYzMgY3VydmUxID0gdmVjMygwKTtcbiAgICAgICAgICAgIHZlYzMgY3VydmUyID0gdmVjMygwKTtcbiAgICAgICAgICAgIGZsb2F0IG91dFN0ZXAgPSAwLjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYW8gPSAwLjsgLy8gYW8gbG93IGNvc3QgOilcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgc3QgPSAwLjtcbiAgICAgICAgICAgIGZsb2F0IGQgPSAwLjtcbiAgICAgICAgICAgIGZvcihpbnQgaT0wO2k8MjUwO2krKylcbiAgICAgICAgICAgIHsgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoc3Q8MC4wMjUqbG9nKGQqZC9zdC8xZTUpfHxkPm1heGQpIGJyZWFrOy8vIHNwZWNpYWwgYnJlYWsgY29uZGl0aW9uIGZvciBsb3cgdGhpY2tuZXNzIG9iamVjdFxuICAgICAgICAgICAgICAgIHN0ID0gbHRfbWFwKHJvK3JkKmQpLng7XG4gICAgICAgICAgICAgICAgZCArPSBzdCAqIDAuNjsgLy8gdGhlIDAuNiBpcyBzZWxlY3RlZCBhY2NvcmRpbmcgdG8gdGhlIDFlNSBhbmQgdGhlIDAuMDI1IG9mIHRoZSBicmVhayBjb25kaXRpb24gZm9yIGdvb2QgcmVzdWx0XG4gICAgICAgICAgICAgICAgYW8rKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGQgPCBtYXhkKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZlYzQgbGkgPSBsdF9saWdodChybywgcmQsIGQsIHJvLCB2ZWMzKDApKTsvLyBwb2ludCBsaWdodCBvbiB0aGUgY2FtXG4gICAgICAgICAgICAgICAgY29sID0gbGkueHl6LyhsaS53KjAuMik7Ly8gY2hlYXAgbGlnaHQgYXR0ZW51YXRpb25cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICBjb2wgPSBtaXgodmVjMygxLi1hby8xMDAuKSwgY29sLCAwLjUpOy8vIGxvdyBjb3N0IGFvIDopXG4gICAgICAgICAgICAgICAgZnJhZ0NvbG9yLnJnYiA9IG1peCggY29sLCB2ZWMzKDApLCAxLjAtZXhwKCAtMC4wMDMqZCpkICkgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgPSBsdF9zdGFycyh1diwgcmQsIGQsIHMsIGZyYWdDb29yZCk7Ly8gc3RhcnMgYmdcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gdmlnbmV0dGVcbiAgICAgICAgICAgIHZlYzIgcSA9IGZyYWdDb29yZC9zO1xuICAgICAgICAgICAgZnJhZ0NvbG9yLnJnYiAqPSAwLjUgKyAwLjUqcG93KCAxNi4wKnEueCpxLnkqKDEuMC1xLngpKigxLjAtcS55KSwgMC4yNSApOyAvLyBpcSB2aWduZXR0ZVxuICAgICAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IExhY2VUdW5uZWxTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvZjI3ZTAxMDQ2MDVmMGNkNy5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTWRmR1JYXG5cbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvbm9pc2UtMjU2LnBuZydcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIGlDaGFubmVsUmVzb2x1dGlvbjogeyB2YWx1ZTogWyBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSldIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxuICAgIGNvbnNvbGUubG9nKCBcIm5vaXNlIHRleHR1cmUgc2l6ZTogXCIsIG5vaXNlLmltYWdlLndpZHRoLG5vaXNlLmltYWdlLmhlaWdodCApO1xufSlcblxubGV0IEZpcmVUdW5uZWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgIHVuaWZvcm0gdmVjMyBpQ2hhbm5lbFJlc29sdXRpb25bNF07XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gQ3JlYXRlZCBieSBpbmlnbyBxdWlsZXogLSBpcS8yMDEzXG4vLyBJIHNoYXJlIHRoaXMgcGllY2UgKGFydCBhbmQgY29kZSkgaGVyZSBpbiBTaGFkZXJ0b3kgYW5kIHRocm91Z2ggaXRzIFB1YmxpYyBBUEksIG9ubHkgZm9yIGVkdWNhdGlvbmFsIHB1cnBvc2VzLiBcbi8vIFlvdSBjYW5ub3QgdXNlLCBzZWxsLCBzaGFyZSBvciBob3N0IHRoaXMgcGllY2Ugb3IgbW9kaWZpY2F0aW9ucyBvZiBpdCBhcyBwYXJ0IG9mIHlvdXIgb3duIGNvbW1lcmNpYWwgb3Igbm9uLWNvbW1lcmNpYWwgcHJvZHVjdCwgd2Vic2l0ZSBvciBwcm9qZWN0LlxuLy8gWW91IGNhbiBzaGFyZSBhIGxpbmsgdG8gaXQgb3IgYW4gdW5tb2RpZmllZCBzY3JlZW5zaG90IG9mIGl0IHByb3ZpZGVkIHlvdSBhdHRyaWJ1dGUgXCJieSBJbmlnbyBRdWlsZXosIEBpcXVpbGV6bGVzIGFuZCBpcXVpbGV6bGVzLm9yZ1wiLiBcbi8vIElmIHlvdSBhcmUgYSB0ZWNoZXIsIGxlY3R1cmVyLCBlZHVjYXRvciBvciBzaW1pbGFyIGFuZCB0aGVzZSBjb25kaXRpb25zIGFyZSB0b28gcmVzdHJpY3RpdmUgZm9yIHlvdXIgbmVlZHMsIHBsZWFzZSBjb250YWN0IG1lIGFuZCB3ZSdsbCB3b3JrIGl0IG91dC5cblxuZmxvYXQgZmlyZV9ub2lzZSggaW4gdmVjMyB4IClcbntcbiAgICB2ZWMzIHAgPSBmbG9vcih4KTtcbiAgICB2ZWMzIGYgPSBmcmFjdCh4KTtcblx0ZiA9IGYqZiooMy4wLTIuMCpmKTtcblx0XG5cdHZlYzIgdXYgPSAocC54eSt2ZWMyKDM3LjAsMTcuMCkqcC56KSArIGYueHk7XG5cdHZlYzIgcmcgPSB0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsICh1disgMC41KS8yNTYuMCwgMC4wICkueXg7XG5cdHJldHVybiBtaXgoIHJnLngsIHJnLnksIGYueiApO1xufVxuXG52ZWM0IGZpcmVfbWFwKCB2ZWMzIHAgKVxue1xuXHRmbG9hdCBkZW4gPSAwLjIgLSBwLnk7XG5cbiAgICAvLyBpbnZlcnQgc3BhY2VcdFxuXHRwID0gLTcuMCpwL2RvdChwLHApO1xuXG4gICAgLy8gdHdpc3Qgc3BhY2VcdFxuXHRmbG9hdCBjbyA9IGNvcyhkZW4gLSAwLjI1KmlUaW1lKTtcblx0ZmxvYXQgc2kgPSBzaW4oZGVuIC0gMC4yNSppVGltZSk7XG5cdHAueHogPSBtYXQyKGNvLC1zaSxzaSxjbykqcC54ejtcblxuICAgIC8vIHNtb2tlXHRcblx0ZmxvYXQgZjtcblx0dmVjMyBxID0gcCAgICAgICAgICAgICAgICAgICAgICAgICAgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTs7XG4gICAgZiAgPSAwLjUwMDAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMiAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4yNTAwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDMgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMTI1MDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAxIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjA2MjUwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMiAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4wMzEyNSpmaXJlX25vaXNlKCBxICk7XG5cblx0ZGVuID0gY2xhbXAoIGRlbiArIDQuMCpmLCAwLjAsIDEuMCApO1xuXHRcblx0dmVjMyBjb2wgPSBtaXgoIHZlYzMoMS4wLDAuOSwwLjgpLCB2ZWMzKDAuNCwwLjE1LDAuMSksIGRlbiApICsgMC4wNSpzaW4ocCk7XG5cdFxuXHRyZXR1cm4gdmVjNCggY29sLCBkZW4gKTtcbn1cblxudmVjMyByYXltYXJjaCggaW4gdmVjMyBybywgaW4gdmVjMyByZCwgaW4gdmVjMiBwaXhlbCApXG57XG5cdHZlYzQgc3VtID0gdmVjNCggMC4wICk7XG5cblx0ZmxvYXQgdCA9IDAuMDtcblxuICAgIC8vIGRpdGhlcmluZ1x0XG5cdHQgKz0gMC4wNSp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIHBpeGVsLnh5L2lDaGFubmVsUmVzb2x1dGlvblswXS54LCAwLjAgKS54O1xuXHRcblx0Zm9yKCBpbnQgaT0wOyBpPDEwMDsgaSsrIClcblx0e1xuXHRcdGlmKCBzdW0uYSA+IDAuOTkgKSBicmVhaztcblx0XHRcblx0XHR2ZWMzIHBvcyA9IHJvICsgdCpyZDtcblx0XHR2ZWM0IGNvbCA9IGZpcmVfbWFwKCBwb3MgKTtcblx0XHRcblx0XHRjb2wueHl6ICo9IG1peCggMy4xKnZlYzMoMS4wLDAuNSwwLjA1KSwgdmVjMygwLjQ4LDAuNTMsMC41KSwgY2xhbXAoIChwb3MueS0wLjIpLzIuMCwgMC4wLCAxLjAgKSApO1xuXHRcdFxuXHRcdGNvbC5hICo9IDAuNjtcblx0XHRjb2wucmdiICo9IGNvbC5hO1xuXG5cdFx0c3VtID0gc3VtICsgY29sKigxLjAgLSBzdW0uYSk7XHRcblxuXHRcdHQgKz0gMC4wNTtcblx0fVxuXG5cdHJldHVybiBjbGFtcCggc3VtLnh5eiwgMC4wLCAxLjAgKTtcbn1cblxudm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxue1xuXHR2ZWMyIHEgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICB2ZWMyIHAgPSAtMS4wICsgMi4wKnE7XG4gICAgcC54ICo9IGlSZXNvbHV0aW9uLngvIGlSZXNvbHV0aW9uLnk7XG5cdFxuICAgIHZlYzIgbW8gPSB2ZWMyKDAuNSwwLjUpOyAvL2lNb3VzZS54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgIC8vaWYoIGlNb3VzZS53PD0wLjAwMDAxICkgbW89dmVjMigwLjApO1xuXHRcbiAgICAvLyBjYW1lcmFcbiAgICB2ZWMzIHJvID0gNC4wKm5vcm1hbGl6ZSh2ZWMzKGNvcygzLjAqbW8ueCksIDEuNCAtIDEuMCoobW8ueS0uMSksIHNpbigzLjAqbW8ueCkpKTtcblx0dmVjMyB0YSA9IHZlYzMoMC4wLCAxLjAsIDAuMCk7XG5cdGZsb2F0IGNyID0gMC41KmNvcygwLjcqaVRpbWUpO1xuXHRcbiAgICAvLyBzaGFrZVx0XHRcblx0cm8gKz0gMC4xKigtMS4wKzIuMCp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIGlUaW1lKnZlYzIoMC4wMTAsMC4wMTQpLCAwLjAgKS54eXopO1xuXHR0YSArPSAwLjEqKC0xLjArMi4wKnRleHR1cmVMb2QoIGlDaGFubmVsMCwgaVRpbWUqdmVjMigwLjAxMywwLjAwOCksIDAuMCApLnh5eik7XG5cdFxuXHQvLyBidWlsZCByYXlcbiAgICB2ZWMzIHd3ID0gbm9ybWFsaXplKCB0YSAtIHJvKTtcbiAgICB2ZWMzIHV1ID0gbm9ybWFsaXplKGNyb3NzKCB2ZWMzKHNpbihjciksY29zKGNyKSwwLjApLCB3dyApKTtcbiAgICB2ZWMzIHZ2ID0gbm9ybWFsaXplKGNyb3NzKHd3LHV1KSk7XG4gICAgdmVjMyByZCA9IG5vcm1hbGl6ZSggcC54KnV1ICsgcC55KnZ2ICsgMi4wKnd3ICk7XG5cdFxuICAgIC8vIHJheW1hcmNoXHRcblx0dmVjMyBjb2wgPSByYXltYXJjaCggcm8sIHJkLCBmcmFnQ29vcmQgKTtcblx0XG5cdC8vIGNvbnRyYXN0IGFuZCB2aWduZXR0aW5nXHRcblx0Y29sID0gY29sKjAuNSArIDAuNSpjb2wqY29sKigzLjAtMi4wKmNvbCk7XG5cdGNvbCAqPSAwLjI1ICsgMC43NSpwb3coIDE2LjAqcS54KnEueSooMS4wLXEueCkqKDEuMC1xLnkpLCAwLjEgKTtcblx0XG4gICAgZnJhZ0NvbG9yID0gdmVjNCggY29sLCAxLjAgKTtcbn1cblxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbFJlc29sdXRpb24udmFsdWVbMF0ueCA9IG5vaXNlVGV4LmltYWdlLndpZHRoXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsUmVzb2x1dGlvbi52YWx1ZVswXS55ID0gbm9pc2VUZXguaW1hZ2UuaGVpZ2h0XG4gICAgfVxufVxuXG5leHBvcnQgeyBGaXJlVHVubmVsU2hhZGVyIH1cbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvN2xmWFJCXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBNaXN0U2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuXG4gICAgICAgIGZsb2F0IG1yYW5kKHZlYzIgY29vcmRzKVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gZnJhY3Qoc2luKGRvdChjb29yZHMsIHZlYzIoNTYuMzQ1Niw3OC4zNDU2KSkgKiA1LjApICogMTAwMDAuMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1ub2lzZSh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiBpID0gZmxvb3IoY29vcmRzKTtcbiAgICAgICAgICAgIHZlYzIgZiA9IGZyYWN0KGNvb3Jkcyk7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYSA9IG1yYW5kKGkpO1xuICAgICAgICAgICAgZmxvYXQgYiA9IG1yYW5kKGkgKyB2ZWMyKDEuMCwgMC4wKSk7XG4gICAgICAgICAgICBmbG9hdCBjID0gbXJhbmQoaSArIHZlYzIoMC4wLCAxLjApKTtcbiAgICAgICAgICAgIGZsb2F0IGQgPSBtcmFuZChpICsgdmVjMigxLjAsIDEuMCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgY3ViaWMgPSBmICogZiAqICgzLjAgLSAyLjAgKiBmKTtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gbWl4KGEsIGIsIGN1YmljLngpICsgKGMgLSBhKSAqIGN1YmljLnkgKiAoMS4wIC0gY3ViaWMueCkgKyAoZCAtIGIpICogY3ViaWMueCAqIGN1YmljLnk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IGZibSh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgZmxvYXQgdmFsdWUgPSAwLjA7XG4gICAgICAgICAgICBmbG9hdCBzY2FsZSA9IDAuNTtcbiAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IDEwOyBpKyspXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gbW5vaXNlKGNvb3JkcykgKiBzY2FsZTtcbiAgICAgICAgICAgICAgICBjb29yZHMgKj0gNC4wO1xuICAgICAgICAgICAgICAgIHNjYWxlICo9IDAuNTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi55ICogMi4wO1xuICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBmaW5hbCA9IDAuMDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9MTsgaSA8IDY7IGkrKylcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2ZWMyIG1vdGlvbiA9IHZlYzIoZmJtKHV2ICsgdmVjMigwLjAsaVRpbWUpICogMC4wNSArIHZlYzIoaSwgMC4wKSkpO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBmaW5hbCArPSBmYm0odXYgKyBtb3Rpb24pO1xuICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmluYWwgLz0gNS4wO1xuICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChtaXgodmVjMygtMC4zKSwgdmVjMygwLjQ1LCAwLjQsIDAuNikgKyB2ZWMzKDAuNiksIGZpbmFsKSwgMSk7XG4gICAgICAgIH1cbiAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSswLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxMikgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IE1pc3RTaGFkZXIgfVxuIiwiLy8gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvWGRzQkRCXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHN0YXRlID0ge1xuICAgIGFuaW1hdGU6IGZhbHNlLFxuICAgIG5vaXNlTW9kZTogJ3NjYWxlJyxcbiAgICBpbnZlcnQ6IGZhbHNlLFxuICAgIHNoYXJwZW46IHRydWUsXG4gICAgc2NhbGVCeVByZXY6IGZhbHNlLFxuICAgIGdhaW46IDAuNTQsXG4gICAgbGFjdW5hcml0eTogMi4wLFxuICAgIG9jdGF2ZXM6IDUsXG4gICAgc2NhbGUxOiAzLjAsXG4gICAgc2NhbGUyOiAzLjAsXG4gICAgdGltZVNjYWxlWDogMC40LFxuICAgIHRpbWVTY2FsZVk6IDAuMyxcbiAgICBjb2xvcjE6IFswLCAwLCAwXSxcbiAgICBjb2xvcjI6IFsxMzAsIDEyOSwxMjldLFxuICAgIGNvbG9yMzogWzExMCwgMTEwLCAxMTBdLFxuICAgIGNvbG9yNDogWzgyLCA1MSwgMTNdLFxuICAgIG9mZnNldEFYOiAwLFxuICAgIG9mZnNldEFZOiAwLFxuICAgIG9mZnNldEJYOiAzLjcsXG4gICAgb2Zmc2V0Qlk6IDAuOSxcbiAgICBvZmZzZXRDWDogMi4xLFxuICAgIG9mZnNldENZOiAzLjIsXG4gICAgb2Zmc2V0RFg6IDQuMyxcbiAgICBvZmZzZXREWTogMi44LFxuICAgIG9mZnNldFg6IDAsXG4gICAgb2Zmc2V0WTogMCxcbn07XG5cbmxldCBNYXJibGUxU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHtcbiAgICAgICAgbWJfYW5pbWF0ZTogeyB2YWx1ZTogc3RhdGUuYW5pbWF0ZSB9LFxuICAgICAgICBtYl9jb2xvcjE6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMS5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjI6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMi5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjM6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMy5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjQ6IHsgdmFsdWU6IHN0YXRlLmNvbG9yNC5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9nYWluOiB7IHZhbHVlOiBzdGF0ZS5nYWluIH0sXG4gICAgICAgIG1iX2ludmVydDogeyB2YWx1ZTogc3RhdGUuaW52ZXJ0IH0sXG4gICAgICAgIG1iX2xhY3VuYXJpdHk6IHsgdmFsdWU6IHN0YXRlLmxhY3VuYXJpdHkgfSxcbiAgICAgICAgbWJfbm9pc2VNb2RlOiB7IHZhbHVlOiBzdGF0ZS5ub2lzZU1vZGUgPT09ICdzY2FsZScgPyAwIDogMSB9LFxuICAgICAgICBtYl9vY3RhdmVzOiB7IHZhbHVlOiBzdGF0ZS5vY3RhdmVzIH0sXG4gICAgICAgIG1iX29mZnNldDogeyB2YWx1ZTogW3N0YXRlLm9mZnNldFgsIHN0YXRlLm9mZnNldFldIH0sXG4gICAgICAgIG1iX29mZnNldEE6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRBWCwgc3RhdGUub2Zmc2V0QVldIH0sXG4gICAgICAgIG1iX29mZnNldEI6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRCWCwgc3RhdGUub2Zmc2V0QlldIH0sXG4gICAgICAgIG1iX29mZnNldEM6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRDWCwgc3RhdGUub2Zmc2V0Q1ldIH0sXG4gICAgICAgIG1iX29mZnNldEQ6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXREWCwgc3RhdGUub2Zmc2V0RFldIH0sXG4gICAgICAgIG1iX3NjYWxlMTogeyB2YWx1ZTogc3RhdGUuc2NhbGUxIH0sXG4gICAgICAgIG1iX3NjYWxlMjogeyB2YWx1ZTogc3RhdGUuc2NhbGUyIH0sXG4gICAgICAgIG1iX3NjYWxlQnlQcmV2OiB7IHZhbHVlOiBzdGF0ZS5zY2FsZUJ5UHJldiB9LFxuICAgICAgICBtYl9zaGFycGVuOiB7IHZhbHVlOiBzdGF0ZS5zaGFycGVuIH0sXG4gICAgICAgIG1iX3RpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgbWJfdGltZVNjYWxlOiB7IHZhbHVlOiBbc3RhdGUudGltZVNjYWxlWCwgc3RhdGUudGltZVNjYWxlWV0gfSxcbiAgICAgICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9ICAgIFxuICAgIH0sXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX2FuaW1hdGU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IxO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMjtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3I0O1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9nYWluO1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX2ludmVydDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfbGFjdW5hcml0eTtcbiAgICAgICAgICAgIHVuaWZvcm0gaW50IG1iX25vaXNlTW9kZTtcbiAgICAgICAgICAgIHVuaWZvcm0gaW50IG1iX29jdGF2ZXM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0O1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEE7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QjtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRDO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3NjYWxlMTtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfc2NhbGUyO1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX3NjYWxlQnlQcmV2O1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX3NoYXJwZW47XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3RpbWU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfdGltZVNjYWxlO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG4gICAgICAgICAgICAgICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gU29tZSB1c2VmdWwgZnVuY3Rpb25zXG4gICAgICAgIHZlYzMgbWJfbW9kMjg5KHZlYzMgeCkgeyByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wOyB9XG4gICAgICAgIHZlYzIgbWJfbW9kMjg5KHZlYzIgeCkgeyByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wOyB9XG4gICAgICAgIHZlYzMgbWJfcGVybXV0ZSh2ZWMzIHgpIHsgcmV0dXJuIG1iX21vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTsgfVxuICAgICAgICBcbiAgICAgICAgLy9cbiAgICAgICAgLy8gRGVzY3JpcHRpb24gOiBHTFNMIDJEIHNpbXBsZXggbm9pc2UgZnVuY3Rpb25cbiAgICAgICAgLy8gICAgICBBdXRob3IgOiBJYW4gTWNFd2FuLCBBc2hpbWEgQXJ0c1xuICAgICAgICAvLyAgTWFpbnRhaW5lciA6IGlqbVxuICAgICAgICAvLyAgICAgTGFzdG1vZCA6IDIwMTEwODIyIChpam0pXG4gICAgICAgIC8vICAgICBMaWNlbnNlIDpcbiAgICAgICAgLy8gIENvcHlyaWdodCAoQykgMjAxMSBBc2hpbWEgQXJ0cy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAgICAgICAgLy8gIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZS5cbiAgICAgICAgLy8gIGh0dHBzOi8vZ2l0aHViLmNvbS9hc2hpbWEvd2ViZ2wtbm9pc2VcbiAgICAgICAgLy9cbiAgICAgICAgZmxvYXQgbWJfc25vaXNlKHZlYzIgdikge1xuICAgICAgICAgICAgLy8gUHJlY29tcHV0ZSB2YWx1ZXMgZm9yIHNrZXdlZCB0cmlhbmd1bGFyIGdyaWRcbiAgICAgICAgICAgIGNvbnN0IHZlYzQgQyA9IHZlYzQoMC4yMTEzMjQ4NjU0MDUxODcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICgzLjAtc3FydCgzLjApKS82LjBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC4zNjYwMjU0MDM3ODQ0MzksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAuNSooc3FydCgzLjApLTEuMClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLTAuNTc3MzUwMjY5MTg5NjI2LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAtMS4wICsgMi4wICogQy54XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuMDI0MzkwMjQzOTAyNDM5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMS4wIC8gNDEuMFxuICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpcnN0IGNvcm5lciAoeDApXG4gICAgICAgICAgICB2ZWMyIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5KSk7XG4gICAgICAgICAgICB2ZWMyIHgwID0gdiAtIGkgKyBkb3QoaSwgQy54eCk7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gT3RoZXIgdHdvIGNvcm5lcnMgKHgxLCB4MilcbiAgICAgICAgICAgIHZlYzIgaTEgPSB2ZWMyKDAuMCk7XG4gICAgICAgICAgICBpMSA9ICh4MC54ID4geDAueSk/IHZlYzIoMS4wLCAwLjApOnZlYzIoMC4wLCAxLjApO1xuICAgICAgICAgICAgdmVjMiB4MSA9IHgwLnh5ICsgQy54eCAtIGkxO1xuICAgICAgICAgICAgdmVjMiB4MiA9IHgwLnh5ICsgQy56ejtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBEbyBzb21lIHBlcm11dGF0aW9ucyB0byBhdm9pZFxuICAgICAgICAgICAgLy8gdHJ1bmNhdGlvbiBlZmZlY3RzIGluIHBlcm11dGF0aW9uXG4gICAgICAgICAgICBpID0gbWJfbW9kMjg5KGkpO1xuICAgICAgICAgICAgdmVjMyBwID0gbWJfcGVybXV0ZShcbiAgICAgICAgICAgICAgICAgICAgbWJfcGVybXV0ZSggaS55ICsgdmVjMygwLjAsIGkxLnksIDEuMCkpXG4gICAgICAgICAgICAgICAgICAgICAgICArIGkueCArIHZlYzMoMC4wLCBpMS54LCAxLjAgKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyBtID0gbWF4KDAuNSAtIHZlYzMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4MCx4MCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4MSx4MSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4Mix4MilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSwgMC4wKTtcbiAgICAgICAgXG4gICAgICAgICAgICBtID0gbSptO1xuICAgICAgICAgICAgbSA9IG0qbTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBHcmFkaWVudHM6XG4gICAgICAgICAgICAvLyAgNDEgcHRzIHVuaWZvcm1seSBvdmVyIGEgbGluZSwgbWFwcGVkIG9udG8gYSBkaWFtb25kXG4gICAgICAgICAgICAvLyAgVGhlIHJpbmcgc2l6ZSAxNyoxNyA9IDI4OSBpcyBjbG9zZSB0byBhIG11bHRpcGxlXG4gICAgICAgICAgICAvLyAgICAgIG9mIDQxICg0MSo3ID0gMjg3KVxuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgeCA9IDIuMCAqIGZyYWN0KHAgKiBDLnd3dykgLSAxLjA7XG4gICAgICAgICAgICB2ZWMzIGggPSBhYnMoeCkgLSAwLjU7XG4gICAgICAgICAgICB2ZWMzIG94ID0gZmxvb3IoeCArIDAuNSk7XG4gICAgICAgICAgICB2ZWMzIGEwID0geCAtIG94O1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIE5vcm1hbGlzZSBncmFkaWVudHMgaW1wbGljaXRseSBieSBzY2FsaW5nIG1cbiAgICAgICAgICAgIC8vIEFwcHJveGltYXRpb24gb2Y6IG0gKj0gaW52ZXJzZXNxcnQoYTAqYTAgKyBoKmgpO1xuICAgICAgICAgICAgbSAqPSAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqIChhMCphMCtoKmgpO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIENvbXB1dGUgZmluYWwgbm9pc2UgdmFsdWUgYXQgUFxuICAgICAgICAgICAgdmVjMyBnID0gdmVjMygwLjApO1xuICAgICAgICAgICAgZy54ICA9IGEwLnggICogeDAueCAgKyBoLnggICogeDAueTtcbiAgICAgICAgICAgIGcueXogPSBhMC55eiAqIHZlYzIoeDEueCx4Mi54KSArIGgueXogKiB2ZWMyKHgxLnkseDIueSk7XG4gICAgICAgICAgICByZXR1cm4gMTMwLjAgKiBkb3QobSwgZyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1iX2dldE5vaXNlVmFsKHZlYzIgcCkge1xuICAgICAgICAgICAgZmxvYXQgcmF3ID0gbWJfc25vaXNlKHApO1xuICAgICAgICBcbiAgICAgICAgICAgIGlmIChtYl9ub2lzZU1vZGUgPT0gMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhYnMocmF3KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gcmF3ICogMC41ICsgMC41O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9mYm0odmVjMiBwKSB7XG4gICAgICAgICAgICBmbG9hdCBzdW0gPSAwLjA7XG4gICAgICAgICAgICBmbG9hdCBmcmVxID0gMS4wO1xuICAgICAgICAgICAgZmxvYXQgYW1wID0gMC41O1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDEuMDtcbiAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IG1iX29jdGF2ZXM7IGkrKykge1xuICAgICAgICAgICAgICAgIGZsb2F0IG4gPSBtYl9nZXROb2lzZVZhbChwICogZnJlcSk7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9pbnZlcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IDEuMCAtIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfc2hhcnBlbikge1xuICAgICAgICAgICAgICAgICAgICBuID0gbiAqIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBzdW0gKz0gbiAqIGFtcDtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX3NjYWxlQnlQcmV2KSB7XG4gICAgICAgICAgICAgICAgICAgIHN1bSArPSBuICogYW1wICogcHJldjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIHByZXYgPSBuO1xuICAgICAgICAgICAgICAgIGZyZXEgKj0gbWJfbGFjdW5hcml0eTtcbiAgICAgICAgICAgICAgICBhbXAgKj0gbWJfZ2FpbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gc3VtO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9wYXR0ZXJuKGluIHZlYzIgcCwgb3V0IHZlYzIgcSwgb3V0IHZlYzIgcikge1xuICAgICAgICAgICAgcCAqPSBtYl9zY2FsZTE7XG4gICAgICAgICAgICBwICs9IG1iX29mZnNldDtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0ID0gMC4wO1xuICAgICAgICAgICAgaWYgKG1iX2FuaW1hdGUpIHtcbiAgICAgICAgICAgICAgICB0ID0gbWJfdGltZSAqIDAuMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICBxID0gdmVjMihtYl9mYm0ocCArIG1iX29mZnNldEEgKyB0ICogbWJfdGltZVNjYWxlLngpLCBtYl9mYm0ocCArIG1iX29mZnNldEIgLSB0ICogbWJfdGltZVNjYWxlLnkpKTtcbiAgICAgICAgICAgIHIgPSB2ZWMyKG1iX2ZibShwICsgbWJfc2NhbGUyICogcSArIG1iX29mZnNldEMpLCBtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHEgKyBtYl9vZmZzZXREKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG1iX2ZibShwICsgbWJfc2NhbGUyICogcik7XG4gICAgICAgIH1cbiAgICBgLFxuICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgIHZlYzMgbWFyYmxlQ29sb3IgPSB2ZWMzKDAuMCk7XG5cbiAgICAgICAgdmVjMiBxO1xuICAgICAgICB2ZWMyIHI7XG5cbiAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyBcbiAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG5cbiAgICAgICAgZmxvYXQgZiA9IG1iX3BhdHRlcm4odXYsIHEsIHIpO1xuICAgICAgICBcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWJfY29sb3IxLCBtYl9jb2xvcjIsIGYpO1xuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYXJibGVDb2xvciwgbWJfY29sb3IzLCBsZW5ndGgocSkgLyAyLjApO1xuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYXJibGVDb2xvciwgbWJfY29sb3I0LCByLnkgLyAyLjApO1xuXG4gICAgICAgIHZlYzQgbWFyYmxlQ29sb3I0ID0gbWFwVGV4ZWxUb0xpbmVhciggdmVjNChtYXJibGVDb2xvciwxLjApICk7XG5cbiAgICAgICAgZGlmZnVzZUNvbG9yICo9IG1hcmJsZUNvbG9yNDtcbiAgICBgXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuXG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9pbnZlcnQgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gc3RhdGUuaW52ZXJ0IDogIXN0YXRlLmludmVydCB9XG5cbiAgICAgICAgLy8gbGV0cyBhZGQgYSBiaXQgb2YgcmFuZG9tbmVzcyB0byB0aGUgaW5wdXQgc28gbXVsdGlwbGUgaW5zdGFuY2VzIGFyZSBkaWZmZXJlbnRcbiAgICAgICAgbGV0IHJ4ID0gTWF0aC5yYW5kb20oKVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9vZmZzZXRBID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoIHN0YXRlLm9mZnNldEFYICsgTWF0aC5yYW5kb20oKSwgc3RhdGUub2Zmc2V0QVkgKyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX29mZnNldEIgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMiggc3RhdGUub2Zmc2V0QlggKyBNYXRoLnJhbmRvbSgpLCBzdGF0ZS5vZmZzZXRCWSArIE1hdGgucmFuZG9tKCkpIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfdGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgIH1cbn1cblxuZXhwb3J0IHsgTWFyYmxlMVNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy8xZWM5NjVjNWQ2ZGY1NzdjLmpwZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy80dDMzejhcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgbm90Rm91bmQgZnJvbSAnLi4vYXNzZXRzL2JhZFNoYWRlci5qcGcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIGlDaGFubmVsMTogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcbnZhciBub3RGb3VuZFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQobm90Rm91bmQsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm90Rm91bmRUZXggPSBub2lzZVxufSlcblxubGV0IE5vdEZvdW5kU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwxO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgdmVjMiB3YXJwVVYgPSAyLiAqIHV2O1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGQgPSBsZW5ndGgoIHdhcnBVViApO1xuICAgICAgICAgICAgdmVjMiBzdCA9IHdhcnBVViowLjEgKyAwLjIqdmVjMihjb3MoMC4wNzEqaVRpbWUqMi4rZCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luKDAuMDczKmlUaW1lKjIuLWQpKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIHdhcnBlZENvbCA9IHRleHR1cmUoIGlDaGFubmVsMCwgc3QgKS54eXogKiAyLjA7XG4gICAgICAgICAgICBmbG9hdCB3ID0gbWF4KCB3YXJwZWRDb2wuciwgMC44NSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgb2Zmc2V0ID0gMC4wMSAqIGNvcyggd2FycGVkQ29sLnJnICogMy4xNDE1OSApO1xuICAgICAgICAgICAgdmVjMyBjb2wgPSB0ZXh0dXJlKCBpQ2hhbm5lbDEsIHV2ICsgb2Zmc2V0ICkucmdiICogdmVjMygwLjgsIDAuOCwgMS41KSA7XG4gICAgICAgICAgICBjb2wgKj0gdyoxLjI7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoIG1peChjb2wsIHRleHR1cmUoIGlDaGFubmVsMSwgdXYgKyBvZmZzZXQgKS5yZ2IsIDAuNSksICAxLjApO1xuICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwxLnZhbHVlID0gbm90Rm91bmRUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwMDAwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMS52YWx1ZSA9IG5vdEZvdW5kVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBOb3RGb3VuZFNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy80ODFhOTJiNDRlNTZkYWQ0LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcbmltcG9ydCB3YXJwZnggZnJvbSAnLi4vYXNzZXRzL3dhcnBmeC5wbmcnXG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmNvbnN0IHVuaWZvcm1zID0ge1xuICAgIHdhcnBUaW1lOiB7dmFsdWU6IDB9LFxuICAgIHdhcnBUZXg6IHt2YWx1ZTogbnVsbH0sXG4gICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0sXG4gICAgdGV4RmxpcFk6IHsgdmFsdWU6IDAgfVxufSBcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciB3YXJwVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZCh3YXJwZngsICh3YXJwKSA9PiB7XG4gICAgd2FycC5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIHdhcnAubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgd2FycC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnBUZXggPSB3YXJwXG59KVxuXG5sZXQgV2FycFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IGdsc2xgXG4gICAgICAgIHVuaWZvcm0gZmxvYXQgd2FycFRpbWU7XG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHdhcnBUZXg7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG4gICAgICAgIHVuaWZvcm0gaW50IHRleEZsaXBZOyBcbiAgICAgICAgICAgICAgICBgLFxuICAgICAgICByZXBsYWNlTWFwOiBnbHNsYFxuICAgICAgICAgIGZsb2F0IHQgPSB3YXJwVGltZTtcblxuICAgICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgLy9tb2QodlV2Lnh5ICogdGV4UmVwZWF0Lnh5ICsgdGV4T2Zmc2V0Lnh5LCB2ZWMyKDEuMCwxLjApKTtcblxuICAgICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgICAgaWYgKHRleEZsaXBZID4gMCkgeyB1di55ID0gMS4wIC0gdXYueTt9XG4gICAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuICBcbiAgICAgICAgICB2ZWMyIHNjYWxlZFVWID0gdXYgKiAyLjAgLSAxLjA7XG4gICAgICAgICAgdmVjMiBwdXYgPSB2ZWMyKGxlbmd0aChzY2FsZWRVVi54eSksIGF0YW4oc2NhbGVkVVYueCwgc2NhbGVkVVYueSkpO1xuICAgICAgICAgIHZlYzQgY29sID0gdGV4dHVyZTJEKHdhcnBUZXgsIHZlYzIobG9nKHB1di54KSArIHQgLyA1LjAsIHB1di55IC8gMy4xNDE1OTI2ICkpO1xuICAgICAgICAgIGZsb2F0IGdsb3cgPSAoMS4wIC0gcHV2LngpICogKDAuNSArIChzaW4odCkgKyAyLjAgKSAvIDQuMCk7XG4gICAgICAgICAgLy8gYmx1ZSBnbG93XG4gICAgICAgICAgY29sICs9IHZlYzQoMTE4LjAvMjU1LjAsIDE0NC4wLzI1NS4wLCAyMTkuMC8yNTUuMCwgMS4wKSAqICgwLjQgKyBnbG93ICogMS4wKTtcbiAgICAgICAgICAvLyB3aGl0ZSBnbG93XG4gICAgICAgICAgY29sICs9IHZlYzQoMC4yKSAqIHNtb290aHN0ZXAoMC4wLCAyLjAsIGdsb3cgKiBnbG93KTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb2wgPSBtYXBUZXhlbFRvTGluZWFyKCBjb2wgKTtcbiAgICAgICAgICBkaWZmdXNlQ29sb3IgKj0gY29sO1xuICAgICAgICBgXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUaW1lID0geyB2YWx1ZTogMCB9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGV4LnZhbHVlID0gd2FycFRleFxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBXYXJwU2hhZGVyIH1cbiIsIi8qXG4gKiAzRCBTaW1wbGV4IG5vaXNlXG4gKiBTSUdOQVRVUkU6IGZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gKiBodHRwczovL2dpdGh1Yi5jb20vaHVnaHNrL2dsc2wtbm9pc2VcbiAqL1xuXG5jb25zdCBnbHNsID0gYFxuLy9cbi8vIERlc2NyaXB0aW9uIDogQXJyYXkgYW5kIHRleHR1cmVsZXNzIEdMU0wgMkQvM0QvNEQgc2ltcGxleFxuLy8gICAgICAgICAgICAgICBub2lzZSBmdW5jdGlvbnMuXG4vLyAgICAgIEF1dGhvciA6IElhbiBNY0V3YW4sIEFzaGltYSBBcnRzLlxuLy8gIE1haW50YWluZXIgOiBpam1cbi8vICAgICBMYXN0bW9kIDogMjAxMTA4MjIgKGlqbSlcbi8vICAgICBMaWNlbnNlIDogQ29weXJpZ2h0IChDKSAyMDExIEFzaGltYSBBcnRzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy8gICAgICAgICAgICAgICBEaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMSUNFTlNFIGZpbGUuXG4vLyAgICAgICAgICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9hc2hpbWEvd2ViZ2wtbm9pc2Vcbi8vXG5cbnZlYzMgbW9kMjg5KHZlYzMgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IG1vZDI4OSh2ZWM0IHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBwZXJtdXRlKHZlYzQgeCkge1xuICAgICByZXR1cm4gbW9kMjg5KCgoeCozNC4wKSsxLjApKngpO1xufVxuXG52ZWM0IHRheWxvckludlNxcnQodmVjNCByKVxue1xuICByZXR1cm4gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiByO1xufVxuXG5mbG9hdCBzbm9pc2UodmVjMyB2KVxuICB7XG4gIGNvbnN0IHZlYzIgIEMgPSB2ZWMyKDEuMC82LjAsIDEuMC8zLjApIDtcbiAgY29uc3QgdmVjNCAgRCA9IHZlYzQoMC4wLCAwLjUsIDEuMCwgMi4wKTtcblxuLy8gRmlyc3QgY29ybmVyXG4gIHZlYzMgaSAgPSBmbG9vcih2ICsgZG90KHYsIEMueXl5KSApO1xuICB2ZWMzIHgwID0gICB2IC0gaSArIGRvdChpLCBDLnh4eCkgO1xuXG4vLyBPdGhlciBjb3JuZXJzXG4gIHZlYzMgZyA9IHN0ZXAoeDAueXp4LCB4MC54eXopO1xuICB2ZWMzIGwgPSAxLjAgLSBnO1xuICB2ZWMzIGkxID0gbWluKCBnLnh5eiwgbC56eHkgKTtcbiAgdmVjMyBpMiA9IG1heCggZy54eXosIGwuenh5ICk7XG5cbiAgLy8gICB4MCA9IHgwIC0gMC4wICsgMC4wICogQy54eHg7XG4gIC8vICAgeDEgPSB4MCAtIGkxICArIDEuMCAqIEMueHh4O1xuICAvLyAgIHgyID0geDAgLSBpMiAgKyAyLjAgKiBDLnh4eDtcbiAgLy8gICB4MyA9IHgwIC0gMS4wICsgMy4wICogQy54eHg7XG4gIHZlYzMgeDEgPSB4MCAtIGkxICsgQy54eHg7XG4gIHZlYzMgeDIgPSB4MCAtIGkyICsgQy55eXk7IC8vIDIuMCpDLnggPSAxLzMgPSBDLnlcbiAgdmVjMyB4MyA9IHgwIC0gRC55eXk7ICAgICAgLy8gLTEuMCszLjAqQy54ID0gLTAuNSA9IC1ELnlcblxuLy8gUGVybXV0YXRpb25zXG4gIGkgPSBtb2QyODkoaSk7XG4gIHZlYzQgcCA9IHBlcm11dGUoIHBlcm11dGUoIHBlcm11dGUoXG4gICAgICAgICAgICAgaS56ICsgdmVjNCgwLjAsIGkxLnosIGkyLnosIDEuMCApKVxuICAgICAgICAgICArIGkueSArIHZlYzQoMC4wLCBpMS55LCBpMi55LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnggKyB2ZWM0KDAuMCwgaTEueCwgaTIueCwgMS4wICkpO1xuXG4vLyBHcmFkaWVudHM6IDd4NyBwb2ludHMgb3ZlciBhIHNxdWFyZSwgbWFwcGVkIG9udG8gYW4gb2N0YWhlZHJvbi5cbi8vIFRoZSByaW5nIHNpemUgMTcqMTcgPSAyODkgaXMgY2xvc2UgdG8gYSBtdWx0aXBsZSBvZiA0OSAoNDkqNiA9IDI5NClcbiAgZmxvYXQgbl8gPSAwLjE0Mjg1NzE0Mjg1NzsgLy8gMS4wLzcuMFxuICB2ZWMzICBucyA9IG5fICogRC53eXogLSBELnh6eDtcblxuICB2ZWM0IGogPSBwIC0gNDkuMCAqIGZsb29yKHAgKiBucy56ICogbnMueik7ICAvLyAgbW9kKHAsNyo3KVxuXG4gIHZlYzQgeF8gPSBmbG9vcihqICogbnMueik7XG4gIHZlYzQgeV8gPSBmbG9vcihqIC0gNy4wICogeF8gKTsgICAgLy8gbW9kKGosTilcblxuICB2ZWM0IHggPSB4XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgeSA9IHlfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCBoID0gMS4wIC0gYWJzKHgpIC0gYWJzKHkpO1xuXG4gIHZlYzQgYjAgPSB2ZWM0KCB4Lnh5LCB5Lnh5ICk7XG4gIHZlYzQgYjEgPSB2ZWM0KCB4Lnp3LCB5Lnp3ICk7XG5cbiAgLy92ZWM0IHMwID0gdmVjNChsZXNzVGhhbihiMCwwLjApKSoyLjAgLSAxLjA7XG4gIC8vdmVjNCBzMSA9IHZlYzQobGVzc1RoYW4oYjEsMC4wKSkqMi4wIC0gMS4wO1xuICB2ZWM0IHMwID0gZmxvb3IoYjApKjIuMCArIDEuMDtcbiAgdmVjNCBzMSA9IGZsb29yKGIxKSoyLjAgKyAxLjA7XG4gIHZlYzQgc2ggPSAtc3RlcChoLCB2ZWM0KDAuMCkpO1xuXG4gIHZlYzQgYTAgPSBiMC54enl3ICsgczAueHp5dypzaC54eHl5IDtcbiAgdmVjNCBhMSA9IGIxLnh6eXcgKyBzMS54enl3KnNoLnp6d3cgO1xuXG4gIHZlYzMgcDAgPSB2ZWMzKGEwLnh5LGgueCk7XG4gIHZlYzMgcDEgPSB2ZWMzKGEwLnp3LGgueSk7XG4gIHZlYzMgcDIgPSB2ZWMzKGExLnh5LGgueik7XG4gIHZlYzMgcDMgPSB2ZWMzKGExLnp3LGgudyk7XG5cbi8vTm9ybWFsaXNlIGdyYWRpZW50c1xuICB2ZWM0IG5vcm0gPSB0YXlsb3JJbnZTcXJ0KHZlYzQoZG90KHAwLHAwKSwgZG90KHAxLHAxKSwgZG90KHAyLCBwMiksIGRvdChwMyxwMykpKTtcbiAgcDAgKj0gbm9ybS54O1xuICBwMSAqPSBub3JtLnk7XG4gIHAyICo9IG5vcm0uejtcbiAgcDMgKj0gbm9ybS53O1xuXG4vLyBNaXggZmluYWwgbm9pc2UgdmFsdWVcbiAgdmVjNCBtID0gbWF4KDAuNiAtIHZlYzQoZG90KHgwLHgwKSwgZG90KHgxLHgxKSwgZG90KHgyLHgyKSwgZG90KHgzLHgzKSksIDAuMCk7XG4gIG0gPSBtICogbTtcbiAgcmV0dXJuIDQyLjAgKiBkb3QoIG0qbSwgdmVjNCggZG90KHAwLHgwKSwgZG90KHAxLHgxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHAyLHgyKSwgZG90KHAzLHgzKSApICk7XG4gIH0gIFxuYFxuZXhwb3J0IGRlZmF1bHQgZ2xzbFxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcbmltcG9ydCB3YXJwZnggZnJvbSAnLi4vYXNzZXRzL3dhcnBmeC5wbmcnXG5pbXBvcnQgc25vaXNlIGZyb20gJy4vc25vaXNlJ1xuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgdW5pZm9ybXMgPSB7XG4gICAgd2FycFRpbWU6IHt2YWx1ZTogMH0sXG4gICAgd2FycFRleDoge3ZhbHVlOiBudWxsfSxcbiAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSxcbiAgICB0ZXhGbGlwWTogeyB2YWx1ZTogMCB9LFxuICAgIHBvcnRhbEN1YmVNYXA6IHsgdmFsdWU6IG5ldyBUSFJFRS5DdWJlVGV4dHVyZSgpIH0sXG4gICAgcG9ydGFsVGltZTogeyB2YWx1ZTogMCB9LFxuICAgIHBvcnRhbFJhZGl1czogeyB2YWx1ZTogMC41IH0sXG4gICAgcG9ydGFsUmluZ0NvbG9yOiB7IHZhbHVlOiBuZXcgVEhSRUUuQ29sb3IoXCJyZWRcIikgIH0sXG4gICAgaW52ZXJ0V2FycENvbG9yOiB7IHZhbHVlOiAwIH0sXG4gICAgdGV4SW52U2l6ZTogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9XG59IFxuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IGN1YmVNYXAgPSBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgd2FycFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQod2FycGZ4LCAod2FycCkgPT4ge1xuICAgIHdhcnAubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdE1pcG1hcE5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0TWlwbWFwTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgd2FycC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnBUZXggPSB3YXJwXG4gICAgY3ViZU1hcC5pbWFnZXMgPSBbd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZV1cbiAgICBjdWJlTWFwLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubGV0IFdhcnBQb3J0YWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB2YXJ5aW5nIHZlYzMgdlJheTtcbiAgICAgICAgdmFyeWluZyB2ZWMzIHBvcnRhbE5vcm1hbDtcbiAgICAgICAgLy92YXJ5aW5nIHZlYzMgY2FtZXJhTG9jYWw7XG4gICAgICAgIGAsXG4gICAgICAgIHBvc3RUcmFuc2Zvcm06IGdsc2xgXG4gICAgICAgIC8vIHZlYzMgY2FtZXJhTG9jYWwgPSAoaW52ZXJzZShtb2RlbE1hdHJpeCkgKiB2ZWM0KGNhbWVyYVBvc2l0aW9uLCAxLjApKS54eXo7XG4gICAgICAgIHZlYzMgY2FtZXJhTG9jYWwgPSAoaW52ZXJzZShtb2RlbFZpZXdNYXRyaXgpICogdmVjNCgwLjAsMC4wLDAuMCwgMS4wKSkueHl6O1xuICAgICAgICB2UmF5ID0gcG9zaXRpb24gLSBjYW1lcmFMb2NhbDtcbiAgICAgICAgaWYgKHZSYXkueiA8IDAuMCkge1xuICAgICAgICAgICAgdlJheS56ID0gLXZSYXkuejtcbiAgICAgICAgICAgIHZSYXkueCA9IC12UmF5Lng7XG4gICAgICAgIH1cbiAgICAgICAgLy92UmF5ID0gdmVjMyhtdlBvc2l0aW9uLngsIG12UG9zaXRpb24ueSwgbXZQb3NpdGlvbi56KTtcbiAgICAgICAgcG9ydGFsTm9ybWFsID0gbm9ybWFsaXplKC0xLiAqIHZSYXkpO1xuICAgICAgICAvL2Zsb2F0IHBvcnRhbF9kaXN0ID0gbGVuZ3RoKGNhbWVyYUxvY2FsKTtcbiAgICAgICAgZmxvYXQgcG9ydGFsX2Rpc3QgPSBsZW5ndGgodlJheSk7XG4gICAgICAgIHZSYXkueiAqPSAxLjEgLyAoMS4gKyBwb3cocG9ydGFsX2Rpc3QsIDAuNSkpOyAvLyBDaGFuZ2UgRk9WIGJ5IHNxdWFzaGluZyBsb2NhbCBaIGRpcmVjdGlvblxuICAgICAgYFxuICAgIH0sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICBmdW5jdGlvbnM6IHNub2lzZSxcbiAgICAgICAgdW5pZm9ybXM6IGdsc2xgXG4gICAgICAgIHVuaWZvcm0gc2FtcGxlckN1YmUgcG9ydGFsQ3ViZU1hcDtcbiAgICAgICAgdW5pZm9ybSBmbG9hdCBwb3J0YWxSYWRpdXM7XG4gICAgICAgIHVuaWZvcm0gdmVjMyBwb3J0YWxSaW5nQ29sb3I7XG4gICAgICAgIHVuaWZvcm0gZmxvYXQgcG9ydGFsVGltZTtcbiAgICAgICAgdW5pZm9ybSBpbnQgaW52ZXJ0V2FycENvbG9yO1xuXG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhJbnZTaXplO1xuXG4gICAgICAgIHZhcnlpbmcgdmVjMyB2UmF5O1xuICAgICAgICB2YXJ5aW5nIHZlYzMgcG9ydGFsTm9ybWFsO1xuICAgICAgIC8vIHZhcnlpbmcgdmVjMyBjYW1lcmFMb2NhbDtcblxuICAgICAgICB1bmlmb3JtIGZsb2F0IHdhcnBUaW1lO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCB3YXJwVGV4O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICB1bmlmb3JtIGludCB0ZXhGbGlwWTsgXG5cbiAgICAgICAgI2RlZmluZSBSSU5HX1dJRFRIIDAuMVxuICAgICAgICAjZGVmaW5lIFJJTkdfSEFSRF9PVVRFUiAwLjAxXG4gICAgICAgICNkZWZpbmUgUklOR19IQVJEX0lOTkVSIDAuMDhcbiAgICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogZ2xzbGBcbiAgICAgICAgICBmbG9hdCB0ID0gd2FycFRpbWU7XG5cbiAgICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgXG4gICAgICAgICAgdmVjMiBzY2FsZWRVViA9IHV2ICogMi4wIC0gMS4wO1xuICAgICAgICAgIHZlYzIgcHV2ID0gdmVjMihsZW5ndGgoc2NhbGVkVVYueHkpLCBhdGFuKHNjYWxlZFVWLngsIHNjYWxlZFVWLnkpKTtcbiAgICAgICAgICB2ZWM0IGNvbCA9IHRleHR1cmUyRCh3YXJwVGV4LCB2ZWMyKGxvZyhwdXYueCkgKyB0IC8gNS4wLCBwdXYueSAvIDMuMTQxNTkyNiApKTtcblxuICAgICAgICAgIGZsb2F0IGdsb3cgPSAoMS4wIC0gcHV2LngpICogKDAuNSArIChzaW4odCkgKyAyLjAgKSAvIDQuMCk7XG4gICAgICAgICAgLy8gYmx1ZSBnbG93XG4gICAgICAgICAgY29sICs9IHZlYzQoMTE4LjAvMjU1LjAsIDE0NC4wLzI1NS4wLCAyMTkuMC8yNTUuMCwgMS4wKSAqICgwLjQgKyBnbG93ICogMS4wKTtcbiAgICAgICAgICAvLyB3aGl0ZSBnbG93XG4gICAgICAgICAgY29sICs9IHZlYzQoMC4yKSAqIHNtb290aHN0ZXAoMC4wLCAyLjAsIGdsb3cgKiBnbG93KTtcbiAgICAgICAgICBjb2wgPSBtYXBUZXhlbFRvTGluZWFyKCBjb2wgKTtcbiAgICAgICAgIFxuICAgICAgICAgIGlmIChpbnZlcnRXYXJwQ29sb3IgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbCA9IHZlYzQoY29sLmIsIGNvbC5nLCBjb2wuciwgY29sLmEpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vLyBwb3J0YWwgc2hhZGVyIGVmZmVjdFxuICAgICAgICAgIHZlYzIgcG9ydGFsX2Nvb3JkID0gdlV2ICogMi4wIC0gMS4wO1xuICAgICAgICAgIGZsb2F0IHBvcnRhbF9ub2lzZSA9IHNub2lzZSh2ZWMzKHBvcnRhbF9jb29yZCAqIDEuLCBwb3J0YWxUaW1lKSkgKiAwLjUgKyAwLjU7XG4gICAgICAgIFxuICAgICAgICAgIC8vIFBvbGFyIGRpc3RhbmNlXG4gICAgICAgICAgZmxvYXQgcG9ydGFsX2Rpc3QgPSBsZW5ndGgocG9ydGFsX2Nvb3JkKTtcbiAgICAgICAgICBwb3J0YWxfZGlzdCArPSBwb3J0YWxfbm9pc2UgKiAwLjI7XG4gICAgICAgIFxuICAgICAgICAgIGZsb2F0IG1hc2tPdXRlciA9IDEuMCAtIHNtb290aHN0ZXAocG9ydGFsUmFkaXVzIC0gUklOR19IQVJEX09VVEVSLCBwb3J0YWxSYWRpdXMsIHBvcnRhbF9kaXN0KTtcbiAgICAgICAgICBmbG9hdCBtYXNrSW5uZXIgPSAxLjAgLSBzbW9vdGhzdGVwKHBvcnRhbFJhZGl1cyAtIFJJTkdfV0lEVEgsIHBvcnRhbFJhZGl1cyAtIFJJTkdfV0lEVEggKyBSSU5HX0hBUkRfSU5ORVIsIHBvcnRhbF9kaXN0KTtcbiAgICAgICAgICBmbG9hdCBwb3J0YWxfZGlzdG9ydGlvbiA9IHNtb290aHN0ZXAocG9ydGFsUmFkaXVzIC0gMC4yLCBwb3J0YWxSYWRpdXMgKyAwLjIsIHBvcnRhbF9kaXN0KTtcbiAgICAgICAgICBcbiAgICAgICAgICB2ZWMzIHBvcnRhbG5vcm1hbCA9IG5vcm1hbGl6ZShwb3J0YWxOb3JtYWwpO1xuICAgICAgICAgIHZlYzMgZm9yd2FyZFBvcnRhbCA9IHZlYzMoMC4wLCAwLjAsIC0xLjApO1xuXG4gICAgICAgICAgZmxvYXQgcG9ydGFsX2RpcmVjdFZpZXcgPSBzbW9vdGhzdGVwKDAuMCwgMC44LCBkb3QocG9ydGFsbm9ybWFsLCBmb3J3YXJkUG9ydGFsKSk7XG4gICAgICAgICAgdmVjMyBwb3J0YWxfdGFuZ2VudE91dHdhcmQgPSBub3JtYWxpemUodmVjMyhwb3J0YWxfY29vcmQsIDAuMCkpO1xuICAgICAgICAgIHZlYzMgcG9ydGFsX3JheSA9IG1peCh2UmF5LCBwb3J0YWxfdGFuZ2VudE91dHdhcmQsIHBvcnRhbF9kaXN0b3J0aW9uKTtcblxuICAgICAgICAgIHZlYzQgbXlDdWJlVGV4ZWwgPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBwb3J0YWxfcmF5KTtcblxuICAgICAgICAvLyAgIG15Q3ViZVRleGVsICs9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9yYXkueCAtIHRleEludlNpemUucywgcG9ydGFsX3JheS55eikpKSAvIDguMDsgICAgICAgIFxuICAgICAgICAvLyAgIG15Q3ViZVRleGVsICs9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9yYXkueCAtIHRleEludlNpemUucywgcG9ydGFsX3JheS55eikpKSAvIDguMDsgICAgICAgIFxuICAgICAgICAvLyAgIG15Q3ViZVRleGVsICs9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9yYXkueCwgcG9ydGFsX3JheS55IC0gdGV4SW52U2l6ZS50LCBwb3J0YWxfcmF5LnopKSkgLyA4LjA7ICAgICAgICBcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCArPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBub3JtYWxpemUodmVjMyhwb3J0YWxfcmF5LngsIHBvcnRhbF9yYXkueSAtIHRleEludlNpemUudCwgcG9ydGFsX3JheS56KSkpIC8gOC4wOyAgICAgICAgXG5cbiAgICAgICAgICBteUN1YmVUZXhlbCA9IG1hcFRleGVsVG9MaW5lYXIoIG15Q3ViZVRleGVsICk7XG5cbiAgICAgICAgLy8gICB2ZWM0IHBvc0NvbCA9IHZlYzQoc21vb3Roc3RlcCgtNi4wLCA2LjAsIGNhbWVyYUxvY2FsKSwgMS4wKTsgLy9ub3JtYWxpemUoKGNhbWVyYUxvY2FsIC8gNi4wKSk7XG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgPSBwb3NDb2w7IC8vIHZlYzQocG9zQ29sLngsIHBvc0NvbC55LCBwb3NDb2wueSwgMS4wKTtcbiAgICAgICAgICB2ZWMzIGNlbnRlckxheWVyID0gbXlDdWJlVGV4ZWwucmdiICogbWFza0lubmVyO1xuICAgICAgICAgIHZlYzMgcmluZ0xheWVyID0gcG9ydGFsUmluZ0NvbG9yICogKDEuIC0gbWFza0lubmVyKTtcbiAgICAgICAgICB2ZWMzIHBvcnRhbF9jb21wb3NpdGUgPSBjZW50ZXJMYXllciArIHJpbmdMYXllcjtcbiAgICAgICAgXG4gICAgICAgICAgLy9nbF9GcmFnQ29sb3IgXG4gICAgICAgICAgdmVjNCBwb3J0YWxDb2wgPSB2ZWM0KHBvcnRhbF9jb21wb3NpdGUsIChtYXNrT3V0ZXIgLSBtYXNrSW5uZXIpICsgbWFza0lubmVyICogcG9ydGFsX2RpcmVjdFZpZXcpO1xuICAgICAgICBcbiAgICAgICAgICAvLyBibGVuZCB0aGUgdHdvXG4gICAgICAgICAgcG9ydGFsQ29sLnJnYiAqPSBwb3J0YWxDb2wuYTsgLy9wcmVtdWx0aXBseSBzb3VyY2UgXG4gICAgICAgICAgY29sLnJnYiAqPSAoMS4wIC0gcG9ydGFsQ29sLmEpO1xuICAgICAgICAgIGNvbC5yZ2IgKz0gcG9ydGFsQ29sLnJnYjtcblxuICAgICAgICAgIGRpZmZ1c2VDb2xvciAqPSBjb2w7XG4gICAgICAgIGBcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcCAmJiBtYXQubWFwLnJlcGVhdCA/IG1hdC5tYXAucmVwZWF0IDogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAgJiYgbWF0Lm1hcC5vZmZzZXQgPyBtYXQubWFwLm9mZnNldCA6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwICYmIG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSswLjUpICogMTBcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGV4LnZhbHVlID0gd2FycFRleFxuXG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxUaW1lID0geyB2YWx1ZTogMCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmludmVydFdhcnBDb2xvciA9IHsgdmFsdWU6IG1hdC51c2VyRGF0YS5pbnZlcnRXYXJwQ29sb3IgPyBtYXQudXNlckRhdGEuaW52ZXJ0V2FycENvbG9yIDogZmFsc2V9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFJpbmdDb2xvciA9IHsgdmFsdWU6IG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgPyBtYXQudXNlckRhdGEucmluZ0NvbG9yIDogbmV3IFRIUkVFLkNvbG9yKFwicmVkXCIpIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsQ3ViZU1hcCA9IHsgdmFsdWU6IG1hdC51c2VyRGF0YS5jdWJlTWFwID8gbWF0LnVzZXJEYXRhLmN1YmVNYXAgOiBjdWJlTWFwIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmFkaXVzID0gIHt2YWx1ZTogbWF0LnVzZXJEYXRhLnJhZGl1cyA/IG1hdC51c2VyRGF0YS5yYWRpdXMgOiAwLjV9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbEN1YmVNYXAudmFsdWUgPSBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwID8gbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcCA6IGN1YmVNYXAgXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFJhZGl1cy52YWx1ZSA9IG1hdGVyaWFsLnVzZXJEYXRhLnJhZGl1cyA/IG1hdGVyaWFsLnVzZXJEYXRhLnJhZGl1cyA6IDAuNVxuXG4gICAgICAgIGlmIChtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwICYmIEFycmF5LmlzQXJyYXkobWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcC5pbWFnZXMpICYmIG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzWzBdKSB7XG4gICAgICAgICAgICBsZXQgaGVpZ2h0ID0gbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcC5pbWFnZXNbMF0uaGVpZ2h0XG4gICAgICAgICAgICBsZXQgd2lkdGggPSBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlc1swXS53aWR0aFxuICAgICAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4SW52U2l6ZS52YWx1ZSA9IG5ldyBUSFJFRS5WZWN0b3IyKHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG5cbiAgICB9XG59XG5cblxuZXhwb3J0IHsgV2FycFBvcnRhbFNoYWRlciB9XG4iLCIvKipcbiAqIFZhcmlvdXMgc2ltcGxlIHNoYWRlcnNcbiAqL1xuXG4vLyBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNOiAgQmxlZXB5IEJsb2Nrc1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsLCBEZWZhdWx0TWF0ZXJpYWxNb2RpZmllciBhcyBNYXRlcmlhbE1vZGlmaWVyLCBTaGFkZXJFeHRlbnNpb25PcHRzIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcidcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tICcuLi91dGlscy9zY2VuZS1ncmFwaCdcblxuLy8gYWRkICBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvN2RLR3p6XG5cbmltcG9ydCB7IEJsZWVweUJsb2Nrc1NoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvYmxlZXB5LWJsb2Nrcy1zaGFkZXInXG5pbXBvcnQgeyBOb2lzZVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbm9pc2UnXG5pbXBvcnQgeyBMaXF1aWRNYXJibGVTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2xpcXVpZC1tYXJibGUnXG5pbXBvcnQgeyBHYWxheHlTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2dhbGF4eSdcbmltcG9ydCB7IExhY2VUdW5uZWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2xhY2UtdHVubmVsJ1xuaW1wb3J0IHsgRmlyZVR1bm5lbFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvZmlyZS10dW5uZWwnXG5pbXBvcnQgeyBNaXN0U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9taXN0J1xuaW1wb3J0IHsgTWFyYmxlMVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbWFyYmxlMSdcbmltcG9ydCB7IE5vdEZvdW5kU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ub3QtZm91bmQnXG5pbXBvcnQgeyBXYXJwU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy93YXJwJ1xuaW1wb3J0IHsgV2FycFBvcnRhbFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvd2FycC1wb3J0YWwnXG5cbmZ1bmN0aW9uIG1hcE1hdGVyaWFscyhvYmplY3QzRDogVEhSRUUuT2JqZWN0M0QsIGZuOiAobWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsKSA9PiB2b2lkKSB7XG4gICAgbGV0IG1lc2ggPSBvYmplY3QzRCBhcyBUSFJFRS5NZXNoXG4gICAgaWYgKCFtZXNoLm1hdGVyaWFsKSByZXR1cm47XG4gIFxuICAgIGlmIChBcnJheS5pc0FycmF5KG1lc2gubWF0ZXJpYWwpKSB7XG4gICAgICByZXR1cm4gbWVzaC5tYXRlcmlhbC5tYXAoZm4pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZm4obWVzaC5tYXRlcmlhbCk7XG4gICAgfVxufVxuICBcbiAgLy8gVE9ETzogIGtleSBhIHJlY29yZCBvZiBuZXcgbWF0ZXJpYWxzLCBpbmRleGVkIGJ5IHRoZSBvcmlnaW5hbFxuICAvLyBtYXRlcmlhbCBVVUlELCBzbyB3ZSBjYW4ganVzdCByZXR1cm4gaXQgaWYgcmVwbGFjZSBpcyBjYWxsZWQgb25cbiAgLy8gdGhlIHNhbWUgbWF0ZXJpYWwgbW9yZSB0aGFuIG9uY2VcbiAgZXhwb3J0IGZ1bmN0aW9uIHJlcGxhY2VNYXRlcmlhbCAob2xkTWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsLCBzaGFkZXI6IFNoYWRlckV4dGVuc2lvbiwgdXNlckRhdGE6IGFueSk6IG51bGwgfCBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwge1xuICAgIC8vICAgaWYgKG9sZE1hdGVyaWFsLnR5cGUgIT0gXCJNZXNoU3RhbmRhcmRNYXRlcmlhbFwiKSB7XG4gICAgLy8gICAgICAgY29uc29sZS53YXJuKFwiU2hhZGVyIENvbXBvbmVudDogZG9uJ3Qga25vdyBob3cgdG8gaGFuZGxlIFNoYWRlcnMgb2YgdHlwZSAnXCIgKyBvbGRNYXRlcmlhbC50eXBlICsgXCInLCBvbmx5IE1lc2hTdGFuZGFyZE1hdGVyaWFsIGF0IHRoaXMgdGltZS5cIilcbiAgICAvLyAgICAgICByZXR1cm47XG4gICAgLy8gICB9XG5cbiAgICAgIC8vY29uc3QgbWF0ZXJpYWwgPSBvbGRNYXRlcmlhbC5jbG9uZSgpO1xuICAgICAgdmFyIEN1c3RvbU1hdGVyaWFsXG4gICAgICB0cnkge1xuICAgICAgICAgIEN1c3RvbU1hdGVyaWFsID0gTWF0ZXJpYWxNb2RpZmllci5leHRlbmQgKG9sZE1hdGVyaWFsLnR5cGUsIHtcbiAgICAgICAgICAgIHVuaWZvcm1zOiBzaGFkZXIudW5pZm9ybXMsXG4gICAgICAgICAgICB2ZXJ0ZXhTaGFkZXI6IHNoYWRlci52ZXJ0ZXhTaGFkZXIsXG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlcjogc2hhZGVyLmZyYWdtZW50U2hhZGVyXG4gICAgICAgICAgfSlcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICAvLyBjcmVhdGUgYSBuZXcgbWF0ZXJpYWwsIGluaXRpYWxpemluZyB0aGUgYmFzZSBwYXJ0IHdpdGggdGhlIG9sZCBtYXRlcmlhbCBoZXJlXG4gICAgICBsZXQgbWF0ZXJpYWwgPSBuZXcgQ3VzdG9tTWF0ZXJpYWwoKVxuXG4gICAgICBzd2l0Y2ggKG9sZE1hdGVyaWFsLnR5cGUpIHtcbiAgICAgICAgICBjYXNlIFwiTWVzaFN0YW5kYXJkTWF0ZXJpYWxcIjpcbiAgICAgICAgICAgICAgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJNZXNoUGhvbmdNYXRlcmlhbFwiOlxuICAgICAgICAgICAgICBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbC5wcm90b3R5cGUuY29weS5jYWxsKG1hdGVyaWFsLCBvbGRNYXRlcmlhbClcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIk1lc2hCYXNpY01hdGVyaWFsXCI6XG4gICAgICAgICAgICAgIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsLnByb3RvdHlwZS5jb3B5LmNhbGwobWF0ZXJpYWwsIG9sZE1hdGVyaWFsKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgbWF0ZXJpYWwudXNlckRhdGEgPSB1c2VyRGF0YTtcbiAgICAgIG1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgIHNoYWRlci5pbml0KG1hdGVyaWFsKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIG1hdGVyaWFsXG4gIH1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVdpdGhTaGFkZXIoc2hhZGVyRGVmOiBTaGFkZXJFeHRlbnNpb24sIGVsOiBhbnksIHRhcmdldDogc3RyaW5nLCB1c2VyRGF0YTogYW55ID0ge30pOiAoVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKVtdIHtcbiAgICAvLyBtZXNoIHdvdWxkIGNvbnRhaW4gdGhlIG9iamVjdCB0aGF0IGlzLCBvciBjb250YWlucywgdGhlIG1lc2hlc1xuICAgIHZhciBtZXNoID0gZWwub2JqZWN0M0RNYXAubWVzaFxuICAgIGlmICghbWVzaCkge1xuICAgICAgICAvLyBpZiBubyBtZXNoLCB3ZSdsbCBzZWFyY2ggdGhyb3VnaCBhbGwgb2YgdGhlIGNoaWxkcmVuLiAgVGhpcyB3b3VsZFxuICAgICAgICAvLyBoYXBwZW4gaWYgd2UgZHJvcHBlZCB0aGUgY29tcG9uZW50IG9uIGEgZ2xiIGluIHNwb2tlXG4gICAgICAgIG1lc2ggPSBlbC5vYmplY3QzRFxuICAgIH1cbiAgICBcbiAgICBsZXQgbWF0ZXJpYWxzOiBhbnkgPSBbXVxuICAgIGxldCB0cmF2ZXJzZSA9IChvYmplY3Q6IFRIUkVFLk9iamVjdDNEKSA9PiB7XG4gICAgICBsZXQgbWVzaCA9IG9iamVjdCBhcyBUSFJFRS5NZXNoXG4gICAgICBpZiAobWVzaC5tYXRlcmlhbCkge1xuICAgICAgICAgIG1hcE1hdGVyaWFscyhtZXNoLCAobWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsKSA9PiB7ICAgICAgICAgXG4gICAgICAgICAgICAgIGlmICghdGFyZ2V0IHx8IG1hdGVyaWFsLm5hbWUgPT09IHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgbGV0IG5ld00gPSByZXBsYWNlTWF0ZXJpYWwobWF0ZXJpYWwsIHNoYWRlckRlZiwgdXNlckRhdGEpXG4gICAgICAgICAgICAgICAgICBpZiAobmV3TSkge1xuICAgICAgICAgICAgICAgICAgICAgIG1lc2gubWF0ZXJpYWwgPSBuZXdNXG5cbiAgICAgICAgICAgICAgICAgICAgICBtYXRlcmlhbHMucHVzaChuZXdNKVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNoaWxkcmVuID0gb2JqZWN0LmNoaWxkcmVuO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIHRyYXZlcnNlKGNoaWxkcmVuW2ldKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cmF2ZXJzZShtZXNoKTtcbiAgICByZXR1cm4gbWF0ZXJpYWxzXG4gIH1cblxuY29uc3QgdmVjID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3QgZm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpXG5cbmNvbnN0IG9uY2UgPSB7XG4gICAgb25jZSA6IHRydWVcbn07XG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnc2hhZGVyJywge1xuICAgIG1hdGVyaWFsczogbnVsbCBhcyAoVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKVtdIHwgbnVsbCwgIFxuICAgIHNoYWRlckRlZjogbnVsbCBhcyBTaGFkZXJFeHRlbnNpb24gfCBudWxsLFxuXG4gICAgc2NoZW1hOiB7XG4gICAgICAgIG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IFwibm9pc2VcIiB9LFxuICAgICAgICB0YXJnZXQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IFwiXCIgfSAgLy8gaWYgbm90aGluZyBwYXNzZWQsIGp1c3QgY3JlYXRlIHNvbWUgbm9pc2VcbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2hhZGVyRGVmOiBTaGFkZXJFeHRlbnNpb247XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLmRhdGEubmFtZSkge1xuICAgICAgICAgICAgY2FzZSBcIm5vaXNlXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTm9pc2VTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcIndhcnBcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBXYXJwU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJ3YXJwLXBvcnRhbFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IFdhcnBQb3J0YWxTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImxpcXVpZG1hcmJsZVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IExpcXVpZE1hcmJsZVNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgXCJibGVlcHlibG9ja3NcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBCbGVlcHlCbG9ja3NTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImdhbGF4eVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IEdhbGF4eVNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwibGFjZXR1bm5lbFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IExhY2VUdW5uZWxTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImZpcmV0dW5uZWxcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBGaXJlVHVubmVsU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIFxuICAgICAgICAgICAgY2FzZSBcIm1pc3RcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBNaXN0U2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJtYXJibGUxXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTWFyYmxlMVNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIC8vIGFuIHVua25vd24gbmFtZSB3YXMgcGFzc2VkIGluXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwidW5rbm93biBuYW1lICdcIiArIHRoaXMuZGF0YS5uYW1lICsgXCInIHBhc3NlZCB0byBzaGFkZXIgY29tcG9uZW50XCIpXG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTm90Rm91bmRTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBcblxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgbGV0IHVwZGF0ZU1hdGVyaWFscyA9ICgpID0+e1xuICAgICAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMuZGF0YS50YXJnZXRcbiAgICAgICAgICAgIGlmICh0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5tYXRlcmlhbHMgPSB1cGRhdGVXaXRoU2hhZGVyKHNoYWRlckRlZiwgdGhpcy5lbCwgdGFyZ2V0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpbml0aWFsaXplciA9ICgpID0+e1xuICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlTWF0ZXJpYWxzKClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGZuKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgZm4pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHVwZGF0ZU1hdGVyaWFscygpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcm9vdCAmJiAocm9vdCBhcyBIVE1MRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplciwgb25jZSk7XG4gICAgICAgIHRoaXMuc2hhZGVyRGVmID0gc2hhZGVyRGVmXG4gICAgfSxcblxuXG4gIHRpY2s6IGZ1bmN0aW9uKHRpbWUpIHtcbiAgICBpZiAodGhpcy5zaGFkZXJEZWYgPT0gbnVsbCB8fCB0aGlzLm1hdGVyaWFscyA9PSBudWxsKSB7IHJldHVybiB9XG5cbiAgICBsZXQgc2hhZGVyRGVmID0gdGhpcy5zaGFkZXJEZWZcbiAgICB0aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge3NoYWRlckRlZi51cGRhdGVVbmlmb3Jtcyh0aW1lLCBtYXQpfSlcbiAgICAvLyBzd2l0Y2ggKHRoaXMuZGF0YS5uYW1lKSB7XG4gICAgLy8gICAgIGNhc2UgXCJub2lzZVwiOlxuICAgIC8vICAgICAgICAgYnJlYWs7XG4gICAgLy8gICAgIGNhc2UgXCJibGVlcHlibG9ja3NcIjpcbiAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgIC8vICAgICBkZWZhdWx0OlxuICAgIC8vICAgICAgICAgYnJlYWs7XG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKHRoaXMuc2hhZGVyKSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZnJhZ21lbnQgc2hhZGVyOlwiLCB0aGlzLm1hdGVyaWFsLmZyYWdtZW50U2hhZGVyKVxuICAgIC8vICAgICB0aGlzLnNoYWRlciA9IG51bGxcbiAgICAvLyB9XG4gIH0sXG59KVxuXG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy8yYWViMDBiNjRhZTk1NjhmLmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvNTBhMWI2ZDMzOGNiMjQ2ZS5qcGdcIiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2FlYWIyMDkxZTRhNTNlOWQucG5nXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy8wY2U0NmM0MjJmOTQ1YTk2LmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvNmEzZThiNDMzMmQ0N2NlMi5qcGdcIiIsImxldCBTSVpFID0gMTAyNFxubGV0IFRBUkdFVFdJRFRIID0gU0laRVxubGV0IFRBUkdFVEhFSUdIVCA9IFNJWkVcblxud2luZG93LkFQUC53cml0ZVdheVBvaW50VGV4dHVyZXMgPSBmdW5jdGlvbihuYW1lcykge1xuICAgIGlmICggIUFycmF5LmlzQXJyYXkoIG5hbWVzICkgKSB7XG4gICAgICAgIG5hbWVzID0gWyBuYW1lcyBdXG4gICAgfVxuXG4gICAgZm9yICggbGV0IGsgPSAwOyBrIDwgbmFtZXMubGVuZ3RoOyBrKysgKSB7XG4gICAgICAgIGxldCB3YXlwb2ludHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKG5hbWVzW2tdKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHdheXBvaW50c1tpXS5jb21wb25lbnRzLndheXBvaW50KSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1YmVjYW0gPSBudWxsXG4gICAgICAgICAgICAgICAgLy8gXG4gICAgICAgICAgICAgICAgLy8gZm9yIChsZXQgaiA9IDA7IGogPCB3YXlwb2ludHNbaV0ub2JqZWN0M0QuY2hpbGRyZW4ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgaWYgKHdheXBvaW50c1tpXS5vYmplY3QzRC5jaGlsZHJlbltqXSBpbnN0YW5jZW9mIEN1YmVDYW1lcmFXcml0ZXIpIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGNvbnNvbGUubG9nKFwiZm91bmQgd2F5cG9pbnQgd2l0aCBjdWJlQ2FtZXJhICdcIiArIG5hbWVzW2tdICsgXCInXCIpXG4gICAgICAgICAgICAgICAgLy8gICAgICAgICBjdWJlY2FtID0gd2F5cG9pbnRzW2ldLm9iamVjdDNELmNoaWxkcmVuW2pdXG4gICAgICAgICAgICAgICAgLy8gICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAvLyAgICAgfVxuICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgICAgICAvLyBpZiAoIWN1YmVjYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJkaWRuJ3QgZmluZCB3YXlwb2ludCB3aXRoIGN1YmVDYW1lcmEgJ1wiICsgbmFtZXNba10gKyBcIicsIGNyZWF0aW5nIG9uZS5cIikgICAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBhIGN1YmUgbWFwIGNhbWVyYSBhbmQgcmVuZGVyIHRoZSB2aWV3IVxuICAgICAgICAgICAgICAgICAgICBpZiAoVEhSRUUuUkVWSVNJT04gPCAxMjUpIHsgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1YmVjYW0gPSBuZXcgQ3ViZUNhbWVyYVdyaXRlcigwLjEsIDEwMDAsIFNJWkUpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdWJlUmVuZGVyVGFyZ2V0ID0gbmV3IFRIUkVFLldlYkdMQ3ViZVJlbmRlclRhcmdldCggU0laRSwgeyBlbmNvZGluZzogVEhSRUUuc1JHQkVuY29kaW5nLCBnZW5lcmF0ZU1pcG1hcHM6IHRydWUgfSApXG4gICAgICAgICAgICAgICAgICAgICAgICBjdWJlY2FtID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMSwgMTAwMDAwLCBjdWJlUmVuZGVyVGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLnBvc2l0aW9uLnkgPSAxLjZcbiAgICAgICAgICAgICAgICAgICAgY3ViZWNhbS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnRzW2ldLm9iamVjdDNELmFkZChjdWJlY2FtKVxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLnVwZGF0ZSh3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LkFQUC5zY2VuZS5vYmplY3QzRClcbiAgICAgICAgICAgICAgICAvLyB9ICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgY3ViZWNhbS5zYXZlQ3ViZU1hcFNpZGVzKG5hbWVzW2tdKVxuICAgICAgICAgICAgICAgIHdheXBvaW50c1tpXS5vYmplY3QzRC5yZW1vdmUoY3ViZWNhbSlcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuY2xhc3MgQ3ViZUNhbWVyYVdyaXRlciBleHRlbmRzIFRIUkVFLkN1YmVDYW1lcmEge1xuXG4gICAgY29uc3RydWN0b3IoLi4uYXJncykge1xuICAgICAgICBzdXBlciguLi5hcmdzKTtcblxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IFRBUkdFVFdJRFRIO1xuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSBUQVJHRVRIRUlHSFQ7XG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgLy8gdGhpcy5yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSB0cnVlO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhck1pcE1hcExpbmVhckZpbHRlcjtcbiAgICAgICAgLy8gdGhpcy5yZW5kZXJUYXJnZXQudGV4dHVyZS5tYWdGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG5cbiAgICAgICAgLy8gdGhpcy51cGRhdGUgPSBmdW5jdGlvbiggcmVuZGVyZXIsIHNjZW5lICkge1xuXG4gICAgICAgIC8vICAgICBsZXQgWyBjYW1lcmFQWCwgY2FtZXJhTlgsIGNhbWVyYVBZLCBjYW1lcmFOWSwgY2FtZXJhUFosIGNhbWVyYU5aIF0gPSB0aGlzLmNoaWxkcmVuO1xuXG4gICAgXHQvLyBcdGlmICggdGhpcy5wYXJlbnQgPT09IG51bGwgKSB0aGlzLnVwZGF0ZU1hdHJpeFdvcmxkKCk7XG5cbiAgICBcdC8vIFx0aWYgKCB0aGlzLnBhcmVudCA9PT0gbnVsbCApIHRoaXMudXBkYXRlTWF0cml4V29ybGQoKTtcblxuICAgIFx0Ly8gXHR2YXIgY3VycmVudFJlbmRlclRhcmdldCA9IHJlbmRlcmVyLmdldFJlbmRlclRhcmdldCgpO1xuXG4gICAgXHQvLyBcdHZhciByZW5kZXJUYXJnZXQgPSB0aGlzLnJlbmRlclRhcmdldDtcbiAgICBcdC8vIFx0Ly92YXIgZ2VuZXJhdGVNaXBtYXBzID0gcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzO1xuXG4gICAgXHQvLyBcdC8vcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZmFsc2U7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDAgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhUFggKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMSApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFOWCApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCAyICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYVBZICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDMgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhTlkgKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgNCApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFQWiApO1xuXG4gICAgXHQvLyBcdC8vcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZ2VuZXJhdGVNaXBtYXBzO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCA1ICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYU5aICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCBjdXJyZW50UmVuZGVyVGFyZ2V0ICk7XG4gICAgICAgIC8vIH07XG5cdH1cblxuICAgIHNhdmVDdWJlTWFwU2lkZXMoc2x1Zykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5jYXB0dXJlKHNsdWcsIGkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIGNhcHR1cmUgKHNsdWcsIHNpZGUpIHtcbiAgICAgICAgLy92YXIgaXNWUkVuYWJsZWQgPSB3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyLnhyLmVuYWJsZWQ7XG4gICAgICAgIHZhciByZW5kZXJlciA9IHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXI7XG4gICAgICAgIC8vIERpc2FibGUgVlIuXG4gICAgICAgIC8vcmVuZGVyZXIueHIuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlbmRlckNhcHR1cmUoc2lkZSk7XG4gICAgICAgIC8vIFRyaWdnZXIgZmlsZSBkb3dubG9hZC5cbiAgICAgICAgdGhpcy5zYXZlQ2FwdHVyZShzbHVnLCBzaWRlKTtcbiAgICAgICAgLy8gUmVzdG9yZSBWUi5cbiAgICAgICAgLy9yZW5kZXJlci54ci5lbmFibGVkID0gaXNWUkVuYWJsZWQ7XG4gICAgIH1cblxuICAgIHJlbmRlckNhcHR1cmUgKGN1YmVTaWRlKSB7XG4gICAgICAgIHZhciBpbWFnZURhdGE7XG4gICAgICAgIHZhciBwaXhlbHMzID0gbmV3IFVpbnQ4QXJyYXkoNCAqIFRBUkdFVFdJRFRIICogVEFSR0VUSEVJR0hUKTtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gd2luZG93LkFQUC5zY2VuZS5yZW5kZXJlcjtcblxuICAgICAgICByZW5kZXJlci5yZWFkUmVuZGVyVGFyZ2V0UGl4ZWxzKHRoaXMucmVuZGVyVGFyZ2V0LCAwLCAwLCBUQVJHRVRXSURUSCxUQVJHRVRIRUlHSFQsIHBpeGVsczMsIGN1YmVTaWRlKTtcblxuICAgICAgICAvL3BpeGVsczMgPSB0aGlzLmZsaXBQaXhlbHNWZXJ0aWNhbGx5KHBpeGVsczMsIFRBUkdFVFdJRFRILCBUQVJHRVRIRUlHSFQpO1xuICAgICAgICB2YXIgcGl4ZWxzNCA9IHBpeGVsczM7ICAvL3RoaXMuY29udmVydDN0bzQocGl4ZWxzMywgVEFSR0VUV0lEVEgsIFRBUkdFVEhFSUdIVCk7XG4gICAgICAgIGltYWdlRGF0YSA9IG5ldyBJbWFnZURhdGEobmV3IFVpbnQ4Q2xhbXBlZEFycmF5KHBpeGVsczQpLCBUQVJHRVRXSURUSCwgVEFSR0VUSEVJR0hUKTtcblxuICAgICAgICAvLyBDb3B5IHBpeGVscyBpbnRvIGNhbnZhcy5cblxuICAgICAgICAvLyBjb3VsZCB1c2UgZHJhd0ltYWdlIGluc3RlYWQsIHRvIHNjYWxlLCBpZiB3ZSB3YW50XG4gICAgICAgIHRoaXMuY3R4LnB1dEltYWdlRGF0YShpbWFnZURhdGEsIDAsIDApO1xuICAgIH1cblxuICAgIGZsaXBQaXhlbHNWZXJ0aWNhbGx5IChwaXhlbHMsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgdmFyIGZsaXBwZWRQaXhlbHMgPSBwaXhlbHMuc2xpY2UoMCk7XG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgd2lkdGg7ICsreCkge1xuICAgICAgICAgIGZvciAodmFyIHkgPSAwOyB5IDwgaGVpZ2h0OyArK3kpIHtcbiAgICAgICAgICAgIGZsaXBwZWRQaXhlbHNbeCAqIDMgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIChoZWlnaHQgLSB5IC0gMSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIDEgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIDEgKyAoaGVpZ2h0IC0geSAtIDEpICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIGZsaXBwZWRQaXhlbHNbeCAqIDMgKyAyICsgeSAqIHdpZHRoICogM10gPSBwaXhlbHNbeCAqIDMgKyAyICsgKGhlaWdodCAtIHkgLSAxKSAqIHdpZHRoICogM107XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmbGlwcGVkUGl4ZWxzO1xuICAgIH1cblxuICAgIGNvbnZlcnQzdG80IChwaXhlbHMsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgdmFyIG5ld1BpeGVscyA9IG5ldyBVaW50OEFycmF5KDQgKiBUQVJHRVRXSURUSCAqIFRBUkdFVEhFSUdIVCk7XG5cbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCB3aWR0aDsgKyt4KSB7XG4gICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCBoZWlnaHQ7ICsreSkge1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgeSAqIHdpZHRoICogNF0gPSBwaXhlbHNbeCAqIDMgKyB5ICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIDEgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIDEgKyB5ICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIDIgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIDIgKyB5ICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIDMgKyB5ICogd2lkdGggKiA0XSA9IDI1NTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld1BpeGVscztcbiAgICB9XG5cblxuICAgIHNpZGVzID0gW1xuICAgICAgICBcIlJpZ2h0XCIsIFwiTGVmdFwiLCBcIlRvcFwiLCBcIkJvdHRvbVwiLCBcIkZyb250XCIsIFwiQmFja1wiXG4gICAgXVxuXG4gICAgc2F2ZUNhcHR1cmUgKHNsdWcsIHNpZGUpIHtcbiAgICAgICAgdGhpcy5jYW52YXMudG9CbG9iKCAoYmxvYikgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbGVOYW1lID0gc2x1ZyArICctJyArIHRoaXMuc2lkZXNbc2lkZV0gKyAnLnBuZyc7XG4gICAgICAgICAgICB2YXIgbGlua0VsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgdmFyIHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgICAgICBsaW5rRWwuaHJlZiA9IHVybDtcbiAgICAgICAgICAgIGxpbmtFbC5zZXRBdHRyaWJ1dGUoJ2Rvd25sb2FkJywgZmlsZU5hbWUpO1xuICAgICAgICAgICAgbGlua0VsLmlubmVySFRNTCA9ICdkb3dubG9hZGluZy4uLic7XG4gICAgICAgICAgICBsaW5rRWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobGlua0VsKTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGxpbmtFbC5jbGljaygpO1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobGlua0VsKTtcbiAgICAgICAgICAgIH0sIDEpO1xuICAgICAgICB9LCAnaW1hZ2UvcG5nJyk7XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDdWJlQ2FtZXJhV3JpdGVyIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIEJpZGlyZWN0aW9uYWwgc2VlLXRocm91Z2ggcG9ydGFsLiBUd28gcG9ydGFscyBhcmUgcGFpcmVkIGJ5IGNvbG9yLlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBBZGQgdHdvIGluc3RhbmNlcyBvZiBgcG9ydGFsLmdsYmAgdG8gdGhlIFNwb2tlIHNjZW5lLlxuICogVGhlIG5hbWUgb2YgZWFjaCBpbnN0YW5jZSBzaG91bGQgbG9vayBsaWtlIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fY29sb3JcIlxuICogQW55IHZhbGlkIFRIUkVFLkNvbG9yIGFyZ3VtZW50IGlzIGEgdmFsaWQgY29sb3IgdmFsdWUuXG4gKiBTZWUgaGVyZSBmb3IgZXhhbXBsZSBjb2xvciBuYW1lcyBodHRwczovL3d3dy53M3NjaG9vbHMuY29tL2Nzc3JlZi9jc3NfY29sb3JzLmFzcFxuICpcbiAqIEZvciBleGFtcGxlLCB0byBtYWtlIGEgcGFpciBvZiBjb25uZWN0ZWQgYmx1ZSBwb3J0YWxzLFxuICogeW91IGNvdWxkIG5hbWUgdGhlbSBcInBvcnRhbC10b19fYmx1ZVwiIGFuZCBcInBvcnRhbC1mcm9tX19ibHVlXCJcbiAqL1xuaW1wb3J0IHt2dWVDb21wb25lbnRzIGFzIGh0bWxDb21wb25lbnRzfSBmcm9tIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG4vLyAgaW1wb3J0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG4vLyBsZXQgaHRtbENvbXBvbmVudHMgPSB3aW5kb3cuQVBQLnZ1ZUFwcHNcblxuaW1wb3J0ICcuL3Byb3hpbWl0eS1ldmVudHMuanMnXG4vLyBpbXBvcnQgdmVydGV4U2hhZGVyIGZyb20gJy4uL3NoYWRlcnMvcG9ydGFsLnZlcnQuanMnXG4vLyBpbXBvcnQgZnJhZ21lbnRTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwuZnJhZy5qcydcbi8vIGltcG9ydCBzbm9pc2UgZnJvbSAnLi4vc2hhZGVycy9zbm9pc2UnXG5cbmltcG9ydCB7IHNob3dSZWdpb25Gb3JPYmplY3QsIGhpZGVyUmVnaW9uRm9yT2JqZWN0IH0gZnJvbSAnLi9yZWdpb24taGlkZXIuanMnXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5pbXBvcnQgeyB1cGRhdGVXaXRoU2hhZGVyIH0gZnJvbSAnLi9zaGFkZXInXG5pbXBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy93YXJwLXBvcnRhbC5qcydcblxuaW1wb3J0IGdvbGRjb2xvciBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9DT0xPUi5qcGcnXG5pbXBvcnQgZ29sZERpc3BsYWNlbWVudCBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9ESVNQLmpwZydcbmltcG9ydCBnb2xkZ2xvc3MgZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfZ2xvc3NpbmVzcy5wbmcnXG5pbXBvcnQgZ29sZG5vcm0gZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfTlJNLmpwZydcbmltcG9ydCBnb2xkYW8gZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfT0NDLmpwZydcblxuaW1wb3J0IEN1YmVDYW1lcmFXcml0ZXIgZnJvbSBcIi4uL3V0aWxzL3dyaXRlQ3ViZU1hcC5qc1wiO1xuXG5pbXBvcnQgeyByZXBsYWNlTWF0ZXJpYWwgYXMgcmVwbGFjZVdpdGhTaGFkZXJ9IGZyb20gJy4vc2hhZGVyJ1xuXG5jb25zdCB3b3JsZFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkQ2FtZXJhUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGREaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFF1YXQgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpXG5jb25zdCBtYXQ0ID0gbmV3IFRIUkVFLk1hdHJpeDQoKVxuXG4vLyBsb2FkIGFuZCBzZXR1cCBhbGwgdGhlIGJpdHMgb2YgdGhlIHRleHR1cmVzIGZvciB0aGUgZG9vclxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxuY29uc3QgZG9vck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcbiAgICBjb2xvcjogMHhmZmZmZmYsXG4gICAgbWV0YWxuZXNzOiAwLjAsXG4gICAgcm91Z2huZXNzOiAwLjAsIFxuICAgIC8vZW1pc3NpdmVJbnRlbnNpdHk6IDFcbn0pXG5jb25zdCBkb29ybWF0ZXJpYWxZID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcbiAgICBjb2xvcjogMHhmZmZmZmYsXG4gICAgbWV0YWxuZXNzOiAwLjAsXG4gICAgcm91Z2huZXNzOiAwLCBcbiAgICAvL2VtaXNzaXZlSW50ZW5zaXR5OiAxXG59KVxuXG5sb2FkZXIubG9hZChnb2xkY29sb3IsIChjb2xvcikgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5tYXAgPSBjb2xvcjtcbiAgICBjb2xvci5yZXBlYXQuc2V0KDEsMjUpXG4gICAgY29sb3Iud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBjb2xvci53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5sb2FkZXIubG9hZChnb2xkY29sb3IsIChjb2xvcikgPT4ge1xuICAgIC8vY29sb3IgPSBjb2xvci5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5tYXAgPSBjb2xvcjtcbiAgICBjb2xvci5yZXBlYXQuc2V0KDEsMSlcbiAgICBjb2xvci53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgY29sb3Iud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkRGlzcGxhY2VtZW50LCAoZGlzcCkgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5idW1wTWFwID0gZGlzcDtcbiAgICBkaXNwLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBkaXNwLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZGlzcC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGREaXNwbGFjZW1lbnQsIChkaXNwKSA9PiB7XG4gICAgLy9kaXNwID0gZGlzcC5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5idW1wTWFwID0gZGlzcDtcbiAgICBkaXNwLnJlcGVhdC5zZXQoMSwxKVxuICAgIGRpc3Aud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRpc3Aud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkZ2xvc3MsIChnbG9zcykgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5yb3VnaG5lc3MgPSBnbG9zc1xuICAgIGdsb3NzLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBnbG9zcy53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGdsb3NzLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZGdsb3NzLCAoZ2xvc3MpID0+IHtcbiAgICAvL2dsb3NzID0gZ2xvc3MuY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkucm91Z2huZXNzID0gZ2xvc3NcbiAgICBnbG9zcy5yZXBlYXQuc2V0KDEsMSlcbiAgICBnbG9zcy53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZ2xvc3Mud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuICAgICAgICAgXG5sb2FkZXIubG9hZChnb2xkYW8sIChhbykgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5hb01hcCA9IGFvXG4gICAgYW8ucmVwZWF0LnNldCgxLDI1KVxuICAgIGFvLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYW8ud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuICAgICAgICAgXG5sb2FkZXIubG9hZChnb2xkYW8sIChhbykgPT4ge1xuICAgIC8vIGFvID0gYW8uY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkuYW9NYXAgPSBhb1xuICAgIGFvLnJlcGVhdC5zZXQoMSwxKVxuICAgIGFvLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBhby53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRub3JtLCAobm9ybSkgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5ub3JtYWxNYXAgPSBub3JtO1xuICAgIG5vcm0ucmVwZWF0LnNldCgxLDI1KVxuICAgIG5vcm0ud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub3JtLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZG5vcm0sIChub3JtKSA9PiB7XG4gICAgLy8gbm9ybSA9IG5vcm0uY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkubm9ybWFsTWFwID0gbm9ybTtcbiAgICBub3JtLnJlcGVhdC5zZXQoMSwxKVxuICAgIG5vcm0ud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIG5vcm0ud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG4vLyAvLyBtYXAgYWxsIG1hdGVyaWFscyB2aWEgYSBjYWxsYmFjay4gIFRha2VuIGZyb20gaHVicyBtYXRlcmlhbHMtdXRpbHNcbi8vIGZ1bmN0aW9uIG1hcE1hdGVyaWFscyhvYmplY3QzRCwgZm4pIHtcbi8vICAgICBsZXQgbWVzaCA9IG9iamVjdDNEIFxuLy8gICAgIGlmICghbWVzaC5tYXRlcmlhbCkgcmV0dXJuO1xuICBcbi8vICAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xuLy8gICAgICAgcmV0dXJuIG1lc2gubWF0ZXJpYWwubWFwKGZuKTtcbi8vICAgICB9IGVsc2Uge1xuLy8gICAgICAgcmV0dXJuIGZuKG1lc2gubWF0ZXJpYWwpO1xuLy8gICAgIH1cbi8vIH1cbiAgXG5jb25zdCBvbmNlID0ge1xuICAgIG9uY2UgOiB0cnVlXG59O1xuXG5BRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ3BvcnRhbCcsIHtcbiAgZGVwZW5kZW5jaWVzOiBbJ2ZhZGVyLXBsdXMnXSxcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudGVsZXBvcnRpbmcgPSBmYWxzZVxuICAgIHRoaXMuY2hhcmFjdGVyQ29udHJvbGxlciA9IHRoaXMuZWwuc3lzdGVtc1snaHVicy1zeXN0ZW1zJ10uY2hhcmFjdGVyQ29udHJvbGxlclxuICAgIHRoaXMuZmFkZXIgPSB0aGlzLmVsLnN5c3RlbXNbJ2ZhZGVyLXBsdXMnXVxuICAgIC8vIHRoaXMucm9vbURhdGEgPSBudWxsXG4gICAgdGhpcy53YWl0Rm9yRmV0Y2ggPSB0aGlzLndhaXRGb3JGZXRjaC5iaW5kKHRoaXMpXG5cbiAgICAvLyBpZiB0aGUgdXNlciBpcyBsb2dnZWQgaW4sIHdlIHdhbnQgdG8gcmV0cmlldmUgdGhlaXIgdXNlckRhdGEgZnJvbSB0aGUgdG9wIGxldmVsIHNlcnZlclxuICAgIC8vIGlmICh3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzICYmIHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMudG9rZW4gJiYgIXdpbmRvdy5BUFAudXNlckRhdGEpIHtcbiAgICAvLyAgICAgdGhpcy5mZXRjaFJvb21EYXRhKClcbiAgICAvLyB9XG4gIH0sXG4vLyAgIGZldGNoUm9vbURhdGE6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbi8vICAgICB2YXIgcGFyYW1zID0ge3Rva2VuOiB3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzLnRva2VuLFxuLy8gICAgICAgICAgICAgICAgICAgcm9vbV9pZDogd2luZG93LkFQUC5odWJDaGFubmVsLmh1YklkfVxuXG4vLyAgICAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuLy8gICAgIG9wdGlvbnMuaGVhZGVycyA9IG5ldyBIZWFkZXJzKCk7XG4vLyAgICAgb3B0aW9ucy5oZWFkZXJzLnNldChcIkF1dGhvcml6YXRpb25cIiwgYEJlYXJlciAke3BhcmFtc31gKTtcbi8vICAgICBvcHRpb25zLmhlYWRlcnMuc2V0KFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vanNvblwiKTtcbi8vICAgICBhd2FpdCBmZXRjaChcImh0dHBzOi8vcmVhbGl0eW1lZGlhLmRpZ2l0YWwvdXNlckRhdGFcIiwgb3B0aW9ucylcbi8vICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKVxuLy8gICAgICAgICAudGhlbihkYXRhID0+IHtcbi8vICAgICAgICAgICBjb25zb2xlLmxvZygnU3VjY2VzczonLCBkYXRhKTtcbi8vICAgICAgICAgICB0aGlzLnJvb21EYXRhID0gZGF0YTtcbi8vICAgICB9KVxuLy8gICAgIHRoaXMucm9vbURhdGEudGV4dHVyZXMgPSBbXVxuLy8gICB9LFxuICBnZXRSb29tVVJMOiBhc3luYyBmdW5jdGlvbiAobnVtYmVyKSB7XG4gICAgICBsZXQgaHViX2lkID0gYXdhaXQgdGhpcy5nZXRSb29tSHViSWQobnVtYmVyKVxuXG4gICAgICBsZXQgdXJsID0gd2luZG93LlNTTy51c2VySW5mby5yb29tcy5sZW5ndGggPiBudW1iZXIgPyBcImh0dHBzOi8veHIucmVhbGl0eW1lZGlhLmRpZ2l0YWwvXCIgKyBodWJfaWQgOiBudWxsO1xuICAgICAgcmV0dXJuIHVybFxuICB9LFxuICBnZXRSb29tSHViSWQ6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICB0aGlzLndhaXRGb3JGZXRjaCgpXG4gICAgcmV0dXJuIHdpbmRvdy5TU08udXNlckluZm8ucm9vbXNbbnVtYmVyXVxuICB9LFxuICBnZXRDdWJlTWFwOiBhc3luYyBmdW5jdGlvbiAobnVtYmVyLCB3YXlwb2ludCkge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuXG4gICAgICBpZiAoIXdheXBvaW50IHx8IHdheXBvaW50Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgd2F5cG9pbnQgPSBcInN0YXJ0XCJcbiAgICAgIH1cbiAgICAgIGxldCB1cmxzID0gW1wiUmlnaHRcIixcIkxlZnRcIixcIlRvcFwiLFwiQm90dG9tXCIsXCJGcm9udFwiLFwiQmFja1wiXS5tYXAoZWwgPT4ge1xuICAgICAgICAgIHJldHVybiBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2RhdGEvcm9vbVBhbm9zL1wiICsgbnVtYmVyLnRvU3RyaW5nKCkgKyBcIi9cIiArIHdheXBvaW50ICsgXCItXCIgKyBlbCArIFwiLnBuZ1wiXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHVybHNcbiAgICAgIC8vcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgZ2V0Q3ViZU1hcEJ5TmFtZTogYXN5bmMgZnVuY3Rpb24gKG5hbWUsIHdheXBvaW50KSB7XG4gICAgaWYgKCF3YXlwb2ludCB8fCB3YXlwb2ludC5sZW5ndGggPT0gMCkge1xuICAgICAgICB3YXlwb2ludCA9IFwic3RhcnRcIlxuICAgIH1cbiAgICBsZXQgdXJscyA9IFtcIlJpZ2h0XCIsXCJMZWZ0XCIsXCJUb3BcIixcIkJvdHRvbVwiLFwiRnJvbnRcIixcIkJhY2tcIl0ubWFwKGVsID0+IHtcbiAgICAgICAgcmV0dXJuIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvZGF0YS9yb29tUGFub3MvXCIgKyBuYW1lICsgXCIvXCIgKyB3YXlwb2ludCArIFwiLVwiICsgZWwgKyBcIi5wbmdcIlxuICAgIH0pXG4gICAgcmV0dXJuIHVybHNcbiAgICAvL3JldHVybiB0aGlzLnJvb21EYXRhLmN1YmVtYXBzLmxlbmd0aCA+IG51bWJlciA/IHRoaXMucm9vbURhdGEuY3ViZW1hcHNbbnVtYmVyXSA6IG51bGw7XG4gIH0sXG4gIHdhaXRGb3JGZXRjaDogZnVuY3Rpb24gKCkge1xuICAgICBpZiAod2luZG93LlNTTy51c2VySW5mbykgcmV0dXJuXG4gICAgIHNldFRpbWVvdXQodGhpcy53YWl0Rm9yRmV0Y2gsIDEwMCk7IC8vIHRyeSBhZ2FpbiBpbiAxMDAgbWlsbGlzZWNvbmRzXG4gIH0sXG4gIHRlbGVwb3J0VG86IGFzeW5jIGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gdHJ1ZVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZU91dCgpXG4gICAgLy8gU2NhbGUgc2NyZXdzIHVwIHRoZSB3YXlwb2ludCBsb2dpYywgc28ganVzdCBzZW5kIHBvc2l0aW9uIGFuZCBvcmllbnRhdGlvblxuICAgIG9iamVjdC5nZXRXb3JsZFF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG9iamVjdC5nZXRXb3JsZERpcmVjdGlvbih3b3JsZERpcilcbiAgICBvYmplY3QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICB3b3JsZFBvcy5hZGQod29ybGREaXIubXVsdGlwbHlTY2FsYXIoMykpIC8vIFRlbGVwb3J0IGluIGZyb250IG9mIHRoZSBwb3J0YWwgdG8gYXZvaWQgaW5maW5pdGUgbG9vcFxuICAgIG1hdDQubWFrZVJvdGF0aW9uRnJvbVF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG1hdDQuc2V0UG9zaXRpb24od29ybGRQb3MpXG4gICAgLy8gVXNpbmcgdGhlIGNoYXJhY3RlckNvbnRyb2xsZXIgZW5zdXJlcyB3ZSBkb24ndCBzdHJheSBmcm9tIHRoZSBuYXZtZXNoXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyLnRyYXZlbEJ5V2F5cG9pbnQobWF0NCwgdHJ1ZSwgZmFsc2UpXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlSW4oKVxuICAgIHRoaXMudGVsZXBvcnRpbmcgPSBmYWxzZVxuICB9LFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHBvcnRhbFR5cGU6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgICAgICBwb3J0YWxUYXJnZXQ6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgICAgICBzZWNvbmRhcnlUYXJnZXQ6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgICAgICBjb2xvcjogeyB0eXBlOiAnY29sb3InLCBkZWZhdWx0OiBudWxsIH0sXG4gICAgICAgIG1hdGVyaWFsVGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH0sXG4gICAgICAgIGRyYXdEb29yOiB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogZmFsc2UgfSxcbiAgICAgICAgdGV4dDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbH0sXG4gICAgICAgIHRleHRQb3NpdGlvbjogeyB0eXBlOiAndmVjMycgfSxcbiAgICAgICAgdGV4dFNpemU6IHsgdHlwZTogJ3ZlYzInIH0sXG4gICAgICAgIHRleHRTY2FsZTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9XG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gVEVTVElOR1xuICAgICAgICAvL3RoaXMuZGF0YS5kcmF3RG9vciA9IHRydWVcbiAgICAgICAgLy8gdGhpcy5kYXRhLm1haW5UZXh0ID0gXCJQb3J0YWwgdG8gdGhlIEFieXNzXCJcbiAgICAgICAgLy8gdGhpcy5kYXRhLnNlY29uZGFyeVRleHQgPSBcIlRvIHZpc2l0IHRoZSBBYnlzcywgZ28gdGhyb3VnaCB0aGUgZG9vciFcIlxuXG4gICAgICAgIC8vIEEtRnJhbWUgaXMgc3VwcG9zZWQgdG8gZG8gdGhpcyBieSBkZWZhdWx0IGJ1dCBkb2Vzbid0IHNlZW0gdG8/XG4gICAgICAgIHRoaXMuc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zLnBvcnRhbCBcblxuICAgICAgICBpZiAodGhpcy5kYXRhLnBvcnRhbFR5cGUubGVuZ3RoID4gMCApIHtcbiAgICAgICAgICAgIHRoaXMuc2V0UG9ydGFsSW5mbyh0aGlzLmRhdGEucG9ydGFsVHlwZSwgdGhpcy5kYXRhLnBvcnRhbFRhcmdldCwgdGhpcy5kYXRhLmNvbG9yKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAwKSB7XG4gICAgICAgICAgICAvLyBwYXJzZSB0aGUgbmFtZSB0byBnZXQgcG9ydGFsIHR5cGUsIHRhcmdldCwgYW5kIGNvbG9yXG4gICAgICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlID0gbnVsbDtcblxuICAgICAgICAvLyB3YWl0IHVudGlsIHRoZSBzY2VuZSBsb2FkcyB0byBmaW5pc2guICBXZSB3YW50IHRvIG1ha2Ugc3VyZSBldmVyeXRoaW5nXG4gICAgICAgIC8vIGlzIGluaXRpYWxpemVkXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemUoKVxuICAgICAgICB9LCBvbmNlKTtcbiAgICB9LFxuXG4gICAgaW5pdGlhbGl6ZTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyB0aGlzLm1hdGVyaWFsID0gbmV3IFRIUkVFLlNoYWRlck1hdGVyaWFsKHtcbiAgICAgICAgLy8gICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgICAgLy8gICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICAgICAgICAvLyAgIHVuaWZvcm1zOiB7XG4gICAgICAgIC8vICAgICBjdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuVGV4dHVyZSgpIH0sXG4gICAgICAgIC8vICAgICB0aW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIC8vICAgICByYWRpdXM6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgLy8gICAgIHJpbmdDb2xvcjogeyB2YWx1ZTogdGhpcy5jb2xvciB9LFxuICAgICAgICAvLyAgIH0sXG4gICAgICAgIC8vICAgdmVydGV4U2hhZGVyLFxuICAgICAgICAvLyAgIGZyYWdtZW50U2hhZGVyOiBgXG4gICAgICAgIC8vICAgICAke3Nub2lzZX1cbiAgICAgICAgLy8gICAgICR7ZnJhZ21lbnRTaGFkZXJ9XG4gICAgICAgIC8vICAgYCxcbiAgICAgICAgLy8gfSlcblxuICAgICAgICAvLyBBc3N1bWUgdGhhdCB0aGUgb2JqZWN0IGhhcyBhIHBsYW5lIGdlb21ldHJ5XG4gICAgICAgIC8vY29uc3QgbWVzaCA9IHRoaXMuZWwuZ2V0T3JDcmVhdGVPYmplY3QzRCgnbWVzaCcpXG4gICAgICAgIC8vbWVzaC5tYXRlcmlhbCA9IHRoaXMubWF0ZXJpYWxcblxuICAgICAgICB0aGlzLm1hdGVyaWFscyA9IG51bGxcbiAgICAgICAgdGhpcy5yYWRpdXMgPSAwLjJcbiAgICAgICAgdGhpcy5jdWJlTWFwID0gbmV3IFRIUkVFLkN1YmVUZXh0dXJlKClcblxuICAgICAgICAvLyBnZXQgdGhlIG90aGVyIGJlZm9yZSBjb250aW51aW5nXG4gICAgICAgIHRoaXMub3RoZXIgPSBhd2FpdCB0aGlzLmdldE90aGVyKClcblxuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnYW5pbWF0aW9uX19wb3J0YWwnLCB7XG4gICAgICAgICAgICBwcm9wZXJ0eTogJ2NvbXBvbmVudHMucG9ydGFsLnJhZGl1cycsXG4gICAgICAgICAgICBkdXI6IDcwMCxcbiAgICAgICAgICAgIGVhc2luZzogJ2Vhc2VJbk91dEN1YmljJyxcbiAgICAgICAgfSlcbiAgICAgICAgXG4gICAgICAgIC8vIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uYmVnaW4nLCAoKSA9PiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdHJ1ZSkpXG4gICAgICAgIC8vIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uY29tcGxldGVfX3BvcnRhbCcsICgpID0+ICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSAhdGhpcy5pc0Nsb3NlZCgpKSlcblxuICAgICAgICAvLyBnb2luZyB0byB3YW50IHRvIHRyeSBhbmQgbWFrZSB0aGUgb2JqZWN0IHRoaXMgcG9ydGFsIGlzIG9uIGNsaWNrYWJsZVxuICAgICAgICAvLyB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgICAgIC8vIHRoaXMuZWwuc2V0QXR0cmlidXRlKCd0YWdzJywge3NpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZX0pXG4gICAgICAgIC8vdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgLy8gb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgcG9ydGFsIG1vdmVtZW50IFxuICAgICAgICAvL3RoaXMuZm9sbG93UG9ydGFsID0gdGhpcy5mb2xsb3dQb3J0YWwuYmluZCh0aGlzKVxuICAgICAgICAvL3RoaXMuZWwub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmZvbGxvd1BvcnRhbClcblxuICAgICAgICBpZiAoIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSB8fCB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1pbWFnZVwiXSApIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICBsZXQgZm4gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5kcmF3RG9vcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cERvb3IoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsIGZuKVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIGZuKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwUG9ydGFsKClcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLmRyYXdEb29yKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBEb29yKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZXR1cFBvcnRhbCgpXG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmRyYXdEb29yKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cERvb3IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBzZXR1cFBvcnRhbDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBnZXQgcmlkIG9mIGludGVyYWN0aXZpdHlcbiAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcImlzLXJlbW90ZS1ob3Zlci10YXJnZXRcIilcbiAgICAgICAgXG4gICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLmRhdGEubWF0ZXJpYWxUYXJnZXRcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICBcbiAgICAgICAgdGhpcy5tYXRlcmlhbHMgPSB1cGRhdGVXaXRoU2hhZGVyKFdhcnBQb3J0YWxTaGFkZXIsIHRoaXMuZWwsIHRhcmdldCwge1xuICAgICAgICAgICAgcmFkaXVzOiB0aGlzLnJhZGl1cyxcbiAgICAgICAgICAgIHJpbmdDb2xvcjogdGhpcy5jb2xvcixcbiAgICAgICAgICAgIGN1YmVNYXA6IHRoaXMuY3ViZU1hcCxcbiAgICAgICAgICAgIGludmVydFdhcnBDb2xvcjogdGhpcy5wb3J0YWxUeXBlID09IDEgPyAxIDogMFxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Q3ViZU1hcCh0aGlzLnBvcnRhbFRhcmdldCwgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCkudGhlbiggdXJscyA9PiB7XG4gICAgICAgICAgICAgICAgLy9jb25zdCB1cmxzID0gW2N1YmVNYXBQb3NYLCBjdWJlTWFwTmVnWCwgY3ViZU1hcFBvc1ksIGN1YmVNYXBOZWdZLCBjdWJlTWFwUG9zWiwgY3ViZU1hcE5lZ1pdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLkN1YmVUZXh0dXJlTG9hZGVyKCkubG9hZCh1cmxzLCByZXNvbHZlLCB1bmRlZmluZWQsIHJlamVjdClcbiAgICAgICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRleHR1cmU7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gdGV4dHVyZVxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSA0KSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRDdWJlTWFwQnlOYW1lKHRoaXMucG9ydGFsVGFyZ2V0LCB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0KS50aGVuKCB1cmxzID0+IHtcbiAgICAgICAgICAgICAgICAvL2NvbnN0IHVybHMgPSBbY3ViZU1hcFBvc1gsIGN1YmVNYXBOZWdYLCBjdWJlTWFwUG9zWSwgY3ViZU1hcE5lZ1ksIGN1YmVNYXBQb3NaLCBjdWJlTWFwTmVnWl07XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5DdWJlVGV4dHVyZUxvYWRlcigpLmxvYWQodXJscywgcmVzb2x2ZSwgdW5kZWZpbmVkLCByZWplY3QpXG4gICAgICAgICAgICAgICAgKS50aGVuKHRleHR1cmUgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFsLnVuaWZvcm1zLmN1YmVNYXAudmFsdWUgPSB0ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7bWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IHRleHR1cmVcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZSkpICAgIFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiB8fCB0aGlzLnBvcnRhbFR5cGUgPT0gMykgeyBcbiAgICAgICAgICAgIGlmIChUSFJFRS5SRVZJU0lPTiA8IDEyNSkgeyAgIFxuICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYSA9IG5ldyBDdWJlQ2FtZXJhV3JpdGVyKDAuMSwgMTAwMCwgMTAyNClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3ViZVJlbmRlclRhcmdldCA9IG5ldyBUSFJFRS5XZWJHTEN1YmVSZW5kZXJUYXJnZXQoIDEwMjQsIHsgZW5jb2Rpbmc6IFRIUkVFLnNSR0JFbmNvZGluZywgZ2VuZXJhdGVNaXBtYXBzOiB0cnVlIH0gKVxuICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYSA9IG5ldyBDdWJlQ2FtZXJhV3JpdGVyKDEsIDEwMDAwMCwgY3ViZVJlbmRlclRhcmdldClcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy90aGlzLmN1YmVDYW1lcmEucm90YXRlWShNYXRoLlBJKSAvLyBGYWNlIGZvcndhcmRzXG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlIFxuICAgICAgICAgICAgICAgIC8vdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTt9KVxuICAgICAgICAgICAgICAgIHRoaXMub3RoZXIuY29tcG9uZW50cy5wb3J0YWwuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsZXQgd2F5cG9pbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKHRoaXMucG9ydGFsVGFyZ2V0KVxuICAgICAgICAgICAgICAgIGlmICh3YXlwb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHdheXBvaW50ID0gd2F5cG9pbnQuaXRlbSgwKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEucG9zaXRpb24ueSA9IDEuNlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgIHdheXBvaW50Lm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsICgpID0+IHtcbiAgICAgICAgICAgICAgICBzaG93UmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnVwZGF0ZSh0aGlzLmVsLnNjZW5lRWwucmVuZGVyZXIsIHRoaXMuZWwuc2NlbmVFbC5vYmplY3QzRClcbiAgICAgICAgICAgICAgICAvLyB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgICAgICAgIC8vIHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICBoaWRlclJlZ2lvbkZvck9iamVjdCh0aGlzLmVsKVxuICAgICAgICAgICAgLy99LCBvbmNlKVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgIGxldCBzY2FsZVggPSBzY2FsZU0ueCAqIHNjYWxlSS54XG4gICAgICAgIGxldCBzY2FsZVkgPSBzY2FsZU0ueSAqIHNjYWxlSS55XG4gICAgICAgIGxldCBzY2FsZVogPSBzY2FsZU0ueiAqIHNjYWxlSS56XG5cbiAgICAgICAgLy8gdGhpcy5wb3J0YWxXaWR0aCA9IHNjYWxlWCAvIDJcbiAgICAgICAgLy8gdGhpcy5wb3J0YWxIZWlnaHQgPSBzY2FsZVkgLyAyXG5cbiAgICAgICAgLy8gb2Zmc2V0IHRvIGNlbnRlciBvZiBwb3J0YWwgYXNzdW1pbmcgd2Fsa2luZyBvbiBncm91bmRcbiAgICAgICAgLy8gdGhpcy5Zb2Zmc2V0ID0gLSh0aGlzLmVsLm9iamVjdDNELnBvc2l0aW9uLnkgLSAxLjYpXG4gICAgICAgIHRoaXMuWW9mZnNldCA9IC0oc2NhbGVZLzIgLSAxLjYpXG5cbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3Byb3hpbWl0eS1ldmVudHMnLCB7IHJhZGl1czogNCwgWW9mZnNldDogdGhpcy5Zb2Zmc2V0IH0pXG4gICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5ZW50ZXInLCAoKSA9PiB0aGlzLm9wZW4oKSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHlsZWF2ZScsICgpID0+IHRoaXMuY2xvc2UoKSlcblxuICAgICAgICB0aGlzLmVsLnNldE9iamVjdDNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgXG4gICAgICAgIGlmICh0aGlzLmRhdGEudGV4dCAmJiB0aGlzLmRhdGEudGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB2YXIgdGl0bGVTY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgICAgIHdpZHRoOiB0aGlzLmRhdGEudGV4dFNpemUueCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuZGF0YS50ZXh0U2l6ZS55LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHRoaXMuZGF0YS50ZXh0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwb3J0YWxUaXRsZSA9IGh0bWxDb21wb25lbnRzW1wiUG9ydGFsVGl0bGVcIl1cbiAgICAgICAgICAgIC8vIGNvbnN0IHBvcnRhbFN1YnRpdGxlID0gaHRtbENvbXBvbmVudHNbXCJQb3J0YWxTdWJ0aXRsZVwiXVxuXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlID0gYXdhaXQgcG9ydGFsVGl0bGUodGl0bGVTY3JpcHREYXRhKVxuICAgICAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZSA9IHBvcnRhbFN1YnRpdGxlKHN1YnRpdGxlU2NyaXB0RGF0YSlcblxuICAgICAgICAgICAgdGhpcy5lbC5zZXRPYmplY3QzRCgncG9ydGFsVGl0bGUnLCB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QpXG4gICAgICAgICAgICBsZXQgc2l6ZSA9IHRoaXMucG9ydGFsVGl0bGUuZ2V0U2l6ZSgpXG4gICAgICAgICAgICBsZXQgdGl0bGVTY2FsZVggPSBzY2FsZVggLyB0aGlzLmRhdGEudGV4dFNjYWxlXG4gICAgICAgICAgICBsZXQgdGl0bGVTY2FsZVkgPSBzY2FsZVkgLyB0aGlzLmRhdGEudGV4dFNjYWxlXG4gICAgICAgICAgICBsZXQgdGl0bGVTY2FsZVogPSBzY2FsZVogLyB0aGlzLmRhdGEudGV4dFNjYWxlXG5cbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5zY2FsZS54IC89IHRpdGxlU2NhbGVYXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0Quc2NhbGUueSAvPSB0aXRsZVNjYWxlWVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnogLz0gdGl0bGVTY2FsZVpcblxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnggPSB0aGlzLmRhdGEudGV4dFBvc2l0aW9uLnggLyBzY2FsZVhcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi55ID0gMC41ICsgc2l6ZS5oZWlnaHQgLyAyICsgdGhpcy5kYXRhLnRleHRQb3NpdGlvbi55IC8gc2NhbGVZXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueiA9IHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueiAvIHNjYWxlWVxuICAgICAgICAgICAgLy8gdGhpcy5lbC5zZXRPYmplY3QzRCgncG9ydGFsU3VidGl0bGUnLCB0aGlzLnBvcnRhbFN1YnRpdGxlLndlYkxheWVyM0QpXG4gICAgICAgICAgICAvLyB0aGlzLnBvcnRhbFN1YnRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueCA9IDFcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZS53ZWJMYXllcjNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgICAgLy8gdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHtcbiAgICAgICAgLy8gICAgIG1hdC51c2VyRGF0YS5yYWRpdXMgPSB0aGlzLnJhZGl1c1xuICAgICAgICAvLyAgICAgbWF0LnVzZXJEYXRhLnJpbmdDb2xvciA9IHRoaXMuY29sb3JcbiAgICAgICAgLy8gICAgIG1hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlTWFwXG4gICAgICAgIC8vIH0pXG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwicG9ydGFsVGl0bGVcIilcblxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLmRlc3Ryb3koKVxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlID0gbnVsbFxuXG4gICAgICAgIGlmICh0aGlzLmN1YmVNYXApIHtcbiAgICAgICAgICAgIHRoaXMuY3ViZU1hcC5kaXNwb3NlKClcbiAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IG51bGxcbiAgICAgICAgfSBcbiAgICB9LFxuXG4gICAgICAgIC8vICAgcmVwbGFjZU1hdGVyaWFsOiBmdW5jdGlvbiAobmV3TWF0ZXJpYWwpIHtcbi8vICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLm1hdGVyaWFsVGFyZ2V0XG4vLyAgICAgaWYgKHRhcmdldCAmJiB0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICBcbi8vICAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0KSA9PiB7XG4vLyAgICAgICBsZXQgbWVzaCA9IG9iamVjdFxuLy8gICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbi8vICAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsKSA9PiB7ICAgICAgICAgXG4vLyAgICAgICAgICAgICAgIGlmICghdGFyZ2V0IHx8IG1hdGVyaWFsLm5hbWUgPT09IHRhcmdldCkge1xuLy8gICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01hdGVyaWFsXG4vLyAgICAgICAgICAgICAgIH1cbi8vICAgICAgICAgICB9KVxuLy8gICAgICAgfVxuLy8gICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4vLyAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4vLyAgICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuLy8gICAgICAgfVxuLy8gICAgIH1cblxuLy8gICAgIGxldCByZXBsYWNlTWF0ZXJpYWxzID0gKCkgPT4ge1xuLy8gICAgICAgICAvLyBtZXNoIHdvdWxkIGNvbnRhaW4gdGhlIG9iamVjdCB0aGF0IGlzLCBvciBjb250YWlucywgdGhlIG1lc2hlc1xuLy8gICAgICAgICB2YXIgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuLy8gICAgICAgICBpZiAoIW1lc2gpIHtcbi8vICAgICAgICAgICAgIC8vIGlmIG5vIG1lc2gsIHdlJ2xsIHNlYXJjaCB0aHJvdWdoIGFsbCBvZiB0aGUgY2hpbGRyZW4uICBUaGlzIHdvdWxkXG4vLyAgICAgICAgICAgICAvLyBoYXBwZW4gaWYgd2UgZHJvcHBlZCB0aGUgY29tcG9uZW50IG9uIGEgZ2xiIGluIHNwb2tlXG4vLyAgICAgICAgICAgICBtZXNoID0gdGhpcy5lbC5vYmplY3QzRFxuLy8gICAgICAgICB9XG4vLyAgICAgICAgIHRyYXZlcnNlKG1lc2gpO1xuLy8gICAgICAgIC8vIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4vLyAgICAgfVxuXG4vLyAgICAgLy8gbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4vLyAgICAgLy8gbGV0IGluaXRpYWxpemVyID0gKCkgPT57XG4vLyAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4vLyAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIHJlcGxhY2VNYXRlcmlhbHMpXG4vLyAgICAgICB9IGVsc2Uge1xuLy8gICAgICAgICAgIHJlcGxhY2VNYXRlcmlhbHMoKVxuLy8gICAgICAgfVxuLy8gICAgIC8vIH07XG4vLyAgICAgLy9yZXBsYWNlTWF0ZXJpYWxzKClcbi8vICAgICAvLyByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuLy8gICB9LFxuXG4vLyAgIGZvbGxvd1BvcnRhbDogZnVuY3Rpb24oKSB7XG4vLyAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4vLyAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbi8vICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4vLyAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyKSB7XG4vLyAgICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbi8vICAgICAgIH1cbi8vICAgfSxcblxuICAgIHNldHVwRG9vcjogZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vIGF0dGFjaGVkIHRvIGFuIGltYWdlIGluIHNwb2tlLiAgVGhpcyBpcyB0aGUgb25seSB3YXkgd2UgYWxsb3cgYnVpZGxpbmcgYSBcbiAgICAgICAgLy8gZG9vciBhcm91bmQgaXRcbiAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgIHZhciB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgdmFyIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgdmFyIGRlcHRoID0gMS4wOyAvLyAgc2NhbGVNLnogKiBzY2FsZUkuelxuXG4gICAgICAgIGNvbnN0IGVudmlyb25tZW50TWFwQ29tcG9uZW50ID0gdGhpcy5lbC5zY2VuZUVsLmNvbXBvbmVudHNbXCJlbnZpcm9ubWVudC1tYXBcIl07XG5cbiAgICAgICAgLy8gbGV0IGFib3ZlID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIC8vICAgICBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoMSwgNTAsIDUwKSxcbiAgICAgICAgLy8gICAgIGRvb3JtYXRlcmlhbFkgXG4gICAgICAgIC8vICk7XG4gICAgICAgIC8vIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAvLyAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcChhYm92ZSk7XG4gICAgICAgIC8vIH1cbiAgICAgICAgLy8gYWJvdmUucG9zaXRpb24uc2V0KDAsIDIuNSwgMClcbiAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5hZGQoYWJvdmUpXG5cbiAgICAgICAgbGV0IGxlZnQgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIC8vIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMi9oZWlnaHQsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMSwwLjEvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgW2Rvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vcm1hdGVyaWFsWSwgZG9vcm1hdGVyaWFsWSxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKGxlZnQpO1xuICAgICAgICB9XG4gICAgICAgIGxlZnQucG9zaXRpb24uc2V0KC0wLjUxLCAwLCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZChsZWZ0KVxuXG4gICAgICAgIGxldCByaWdodCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwxLDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29ybWF0ZXJpYWxZLCBkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWxdLCBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAocmlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIHJpZ2h0LnBvc2l0aW9uLnNldCgwLjUxLCAwLCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZChyaWdodClcblxuICAgICAgICBsZXQgdG9wID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSArIDAuMy93aWR0aCwwLjEvaGVpZ2h0LDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vcm1hdGVyaWFsWSxkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbF0sIFxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIHRvcC5wb3NpdGlvbi5zZXQoMC4wLCAwLjUwNSwgMClcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5hZGQodG9wKVxuXG4gICAgICAgIC8vIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAvLyAgICAgY29uc3Qge3dpZHRoOiB3c2l6ZSwgaGVpZ2h0OiBoc2l6ZX0gPSB0aGlzLnNjcmlwdC5nZXRTaXplKClcbiAgICAgICAgLy8gICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHdpZHRoIC8gd3NpemUsIGhlaWdodCAvIGhzaXplKVxuICAgICAgICAvLyAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwgeyB4OiBzY2FsZSwgeTogc2NhbGUsIHo6IHNjYWxlfSk7XG4gICAgICAgIC8vIH1cbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy90aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnRpbWUudmFsdWUgPSB0aW1lIC8gMTAwMFxuICAgICAgICBpZiAoIXRoaXMubWF0ZXJpYWxzKSB7IHJldHVybiB9XG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVGl0bGUpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUudGljayh0aW1lKVxuICAgICAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZS50aWNrKHRpbWUpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge1xuICAgICAgICAgICAgbWF0LnVzZXJEYXRhLnJhZGl1cyA9IHRoaXMucmFkaXVzXG4gICAgICAgICAgICBtYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZU1hcFxuICAgICAgICAgICAgV2FycFBvcnRhbFNoYWRlci51cGRhdGVVbmlmb3Jtcyh0aW1lLCBtYXQpXG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKHRoaXMub3RoZXIgJiYgIXRoaXMuc3lzdGVtLnRlbGVwb3J0aW5nKSB7XG4gICAgICAgIC8vICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgICAgICAvLyAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYVBvcylcbiAgICAgICAgLy8gICB3b3JsZENhbWVyYVBvcy55IC09IHRoaXMuWW9mZnNldFxuICAgICAgICAvLyAgIGNvbnN0IGRpc3QgPSB3b3JsZENhbWVyYVBvcy5kaXN0YW5jZVRvKHdvcmxkUG9zKVxuICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYVBvcylcbiAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh3b3JsZENhbWVyYVBvcylcblxuICAgICAgICAgIC8vIGluIGxvY2FsIHBvcnRhbCBjb29yZGluYXRlcywgdGhlIHdpZHRoIGFuZCBoZWlnaHQgYXJlIDFcbiAgICAgICAgICBpZiAoTWF0aC5hYnMod29ybGRDYW1lcmFQb3MueCkgPiAwLjUgfHwgTWF0aC5hYnMod29ybGRDYW1lcmFQb3MueSkgPiAwLjUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgZGlzdCA9IE1hdGguYWJzKHdvcmxkQ2FtZXJhUG9zLnopO1xuXG4gICAgICAgICAgLy8gd2luZG93LkFQUC51dGlscy5jaGFuZ2VUb0h1YlxuICAgICAgICAgIGlmICgodGhpcy5wb3J0YWxUeXBlID09IDEgfHwgdGhpcy5wb3J0YWxUeXBlID09IDQpICYmIGRpc3QgPCAwLjI1KSB7XG4gICAgICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvY2F0aW9uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgICAgICAgICAgICBpZiAoIUFQUC5zdG9yZS5zdGF0ZS5wcmVmZXJlbmNlcy5mYXN0Um9vbVN3aXRjaGluZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInNldCB3aW5kb3cubG9jYXRpb24uaHJlZiB0byBcIiArIHRoaXMub3RoZXIpXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB3YXlQb2ludCA9IHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXRcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW52aXJvbm1lbnRTY2VuZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZW52aXJvbm1lbnQtc2NlbmVcIik7XG4gICAgICAgICAgICAgICAgICAgIGxldCBnb1RvV2F5UG9pbnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh3YXlQb2ludCAmJiB3YXlQb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJGQVNUIFJPT00gU1dJVENIIElOQ0xVREVTIHdheXBvaW50OiBzZXR0aW5nIGhhc2ggdG8gXCIgKyB3YXlQb2ludClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHdheVBvaW50XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJGQVNUIFJPT00gU1dJVENILiBnb2luZyB0byBcIiArIHRoaXMuaHViX2lkKVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5odWJJZCA9PT0gQVBQLmh1Yi5odWJfaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiU2FtZSBSb29tXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICBnb1RvV2F5UG9pbnQoKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LmNoYW5nZUh1Yih0aGlzLmh1Yl9pZCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgY29uc29sZS5sb2coXCJFbnZpcm9ubWVudCBzY2VuZSBoYXMgbG9hZGVkXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnb1RvV2F5UG9pbnQoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIgJiYgZGlzdCA8IDAuMjUpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7XG4gICAgICAgICAgICAgIGlmIChkaXN0IDwgMC4yNSkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5oYXNoIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgLy8gaWYgd2Ugc2V0IGxvY2F0aW9uaHJlZiwgd2UgdGVsZXBvcnRlZC4gIHdoZW4gaXRcbiAgICAgICAgICAgICAgICAgIC8vIGZpbmFsbHkgaGFwcGVucywgYW5kIHdlIG1vdmUgb3V0c2lkZSB0aGUgcmFuZ2Ugb2YgdGhlIHBvcnRhbCxcbiAgICAgICAgICAgICAgICAgIC8vIHdlIHdpbGwgY2xlYXIgdGhlIGZsYWdcbiAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gbnVsbFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgZ2V0T3RoZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHJlc29sdmUobnVsbClcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgID09IDEpIHtcbiAgICAgICAgICAgICAgICAvLyBmaXJzdCB3YWl0IGZvciB0aGUgaHViX2lkXG4gICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Um9vbUh1YklkKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKGh1Yl9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaHViX2lkID0gaHViX2lkXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHRhcmdldCBpcyBhbm90aGVyIHJvb20sIHJlc29sdmUgd2l0aCB0aGUgVVJMIHRvIHRoZSByb29tXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldFJvb21VUkwodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4odXJsID0+IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCAmJiB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCArIFwiI1wiICsgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwpIFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDMpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlIChcIiNcIiArIHRoaXMucG9ydGFsVGFyZ2V0KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSA0KSB7XG4gICAgICAgICAgICAgICAgbGV0IHVybCA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4gKyBcIi9cIiArIHRoaXMucG9ydGFsVGFyZ2V0O1xuICAgICAgICAgICAgICAgIHRoaXMuaHViX2lkID0gdGhpcy5wb3J0YWxUYXJnZXRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCAmJiB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwgKyBcIiNcIiArIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwpIFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbm93IGZpbmQgdGhlIHBvcnRhbCB3aXRoaW4gdGhlIHJvb20uICBUaGUgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycyB3aXRoIHRoZSBzYW1lIHBvcnRhbFRhcmdldFxuICAgICAgICAgICAgY29uc3QgcG9ydGFscyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW3BvcnRhbF1gKSlcbiAgICAgICAgICAgIGNvbnN0IG90aGVyID0gcG9ydGFscy5maW5kKChlbCkgPT4gZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVHlwZSA9PSB0aGlzLnBvcnRhbFR5cGUgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVGFyZ2V0ID09PSB0aGlzLnBvcnRhbFRhcmdldCAmJiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZWwgIT09IHRoaXMuZWwpXG4gICAgICAgICAgICBpZiAob3RoZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIC8vIENhc2UgMTogVGhlIG90aGVyIHBvcnRhbCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUob3RoZXIpO1xuICAgICAgICAgICAgICAgIG90aGVyLmVtaXQoJ3BhaXInLCB7IG90aGVyOiB0aGlzLmVsIH0pIC8vIExldCB0aGUgb3RoZXIga25vdyB0aGF0IHdlJ3JlIHJlYWR5XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIENhc2UgMjogV2UgY291bGRuJ3QgZmluZCB0aGUgb3RoZXIgcG9ydGFsLCB3YWl0IGZvciBpdCB0byBzaWduYWwgdGhhdCBpdCdzIHJlYWR5XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwYWlyJywgKGV2ZW50KSA9PiB7IFxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGV2ZW50LmRldGFpbC5vdGhlcilcbiAgICAgICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9LFxuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBub2RlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG5cbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBlaXRoZXIgXG4gICAgICAgIC8vIC0gXCJyb29tX25hbWVfY29sb3JcIlxuICAgICAgICAvLyAtIFwicG9ydGFsX05fY29sb3JcIiBcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiBOdW1iZXJlZCBwb3J0YWxzIHNob3VsZCBjb21lIGluIHBhaXJzLlxuICAgICAgICBjb25zdCBwYXJhbXMgPSBub2RlTmFtZS5tYXRjaCgvKFtBLVphLXpdKilfKFtBLVphLXowLTldKilfKFtBLVphLXowLTldKikkLylcbiAgICAgICAgXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiA0LCBmaXJzdCBtYXRjaCBpcyB0aGUgcG9ydGFsIHR5cGUsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgbmFtZSBvciBudW1iZXIsIGFuZCBsYXN0IGlzIHRoZSBjb2xvclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicG9ydGFsIG5vZGUgbmFtZSBub3QgZm9ybWVkIGNvcnJlY3RseTogXCIsIG5vZGVOYW1lKVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgICAgICB0aGlzLmNvbG9yID0gXCJyZWRcIiAvLyBkZWZhdWx0IHNvIHRoZSBwb3J0YWwgaGFzIGEgY29sb3IgdG8gdXNlXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuc2V0UG9ydGFsSW5mbyhwYXJhbXNbMV0sIHBhcmFtc1syXSwgcGFyYW1zWzNdKVxuICAgIH0sXG5cbiAgICBzZXRQb3J0YWxJbmZvOiBmdW5jdGlvbihwb3J0YWxUeXBlLCBwb3J0YWxUYXJnZXQsIGNvbG9yKSB7XG4gICAgICAgIGlmIChwb3J0YWxUeXBlID09PSBcInJvb21cIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMTtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcGFyc2VJbnQocG9ydGFsVGFyZ2V0KVxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwicG9ydGFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDI7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBvcnRhbFRhcmdldFxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMztcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcG9ydGFsVGFyZ2V0XG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJyb29tTmFtZVwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSA0O1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwb3J0YWxUYXJnZXRcbiAgICAgICAgfSBlbHNlIHsgICAgXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IoY29sb3IpXG4gICAgfSxcblxuICAgIHNldFJhZGl1cyh2YWwpIHtcbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAvLyAgIGZyb206IHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlLFxuICAgICAgICAgICAgZnJvbTogdGhpcy5yYWRpdXMsXG4gICAgICAgICAgICB0bzogdmFsLFxuICAgICAgICB9KVxuICAgIH0sXG4gICAgb3BlbigpIHtcbiAgICAgICAgdGhpcy5zZXRSYWRpdXMoMSlcbiAgICB9LFxuICAgIGNsb3NlKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygwLjIpXG4gICAgfSxcbiAgICBpc0Nsb3NlZCgpIHtcbiAgICAgICAgLy8gcmV0dXJuIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlID09PSAwXG4gICAgICAgIHJldHVybiB0aGlzLnJhZGl1cyA9PT0gMC4yXG4gICAgfSxcbn0pIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvZTE3MDJlYTIxYWZiNGE4Ni5wbmdcIiIsImNvbnN0IGdsc2wgPSBgXG52YXJ5aW5nIHZlYzIgYmFsbHZVdjtcbnZhcnlpbmcgdmVjMyBiYWxsdlBvc2l0aW9uO1xudmFyeWluZyB2ZWMzIGJhbGx2Tm9ybWFsO1xudmFyeWluZyB2ZWMzIGJhbGx2V29ybGRQb3M7XG51bmlmb3JtIGZsb2F0IGJhbGxUaW1lO1xudW5pZm9ybSBmbG9hdCBzZWxlY3RlZDtcblxubWF0NCBiYWxsaW52ZXJzZShtYXQ0IG0pIHtcbiAgZmxvYXRcbiAgICAgIGEwMCA9IG1bMF1bMF0sIGEwMSA9IG1bMF1bMV0sIGEwMiA9IG1bMF1bMl0sIGEwMyA9IG1bMF1bM10sXG4gICAgICBhMTAgPSBtWzFdWzBdLCBhMTEgPSBtWzFdWzFdLCBhMTIgPSBtWzFdWzJdLCBhMTMgPSBtWzFdWzNdLFxuICAgICAgYTIwID0gbVsyXVswXSwgYTIxID0gbVsyXVsxXSwgYTIyID0gbVsyXVsyXSwgYTIzID0gbVsyXVszXSxcbiAgICAgIGEzMCA9IG1bM11bMF0sIGEzMSA9IG1bM11bMV0sIGEzMiA9IG1bM11bMl0sIGEzMyA9IG1bM11bM10sXG5cbiAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMixcblxuICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gIHJldHVybiBtYXQ0KFxuICAgICAgYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5LFxuICAgICAgYTAyICogYjEwIC0gYTAxICogYjExIC0gYTAzICogYjA5LFxuICAgICAgYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzLFxuICAgICAgYTIyICogYjA0IC0gYTIxICogYjA1IC0gYTIzICogYjAzLFxuICAgICAgYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3LFxuICAgICAgYTAwICogYjExIC0gYTAyICogYjA4ICsgYTAzICogYjA3LFxuICAgICAgYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxLFxuICAgICAgYTIwICogYjA1IC0gYTIyICogYjAyICsgYTIzICogYjAxLFxuICAgICAgYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2LFxuICAgICAgYTAxICogYjA4IC0gYTAwICogYjEwIC0gYTAzICogYjA2LFxuICAgICAgYTMwICogYjA0IC0gYTMxICogYjAyICsgYTMzICogYjAwLFxuICAgICAgYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwLFxuICAgICAgYTExICogYjA3IC0gYTEwICogYjA5IC0gYTEyICogYjA2LFxuICAgICAgYTAwICogYjA5IC0gYTAxICogYjA3ICsgYTAyICogYjA2LFxuICAgICAgYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwLFxuICAgICAgYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAvIGRldDtcbn1cblxuXG5tYXQ0IGJhbGx0cmFuc3Bvc2UoaW4gbWF0NCBtKSB7XG4gIHZlYzQgaTAgPSBtWzBdO1xuICB2ZWM0IGkxID0gbVsxXTtcbiAgdmVjNCBpMiA9IG1bMl07XG4gIHZlYzQgaTMgPSBtWzNdO1xuXG4gIHJldHVybiBtYXQ0KFxuICAgIHZlYzQoaTAueCwgaTEueCwgaTIueCwgaTMueCksXG4gICAgdmVjNChpMC55LCBpMS55LCBpMi55LCBpMy55KSxcbiAgICB2ZWM0KGkwLnosIGkxLnosIGkyLnosIGkzLnopLFxuICAgIHZlYzQoaTAudywgaTEudywgaTIudywgaTMudylcbiAgKTtcbn1cblxudm9pZCBtYWluKClcbntcbiAgYmFsbHZVdiA9IHV2O1xuXG4gIGJhbGx2UG9zaXRpb24gPSBwb3NpdGlvbjtcblxuICB2ZWMzIG9mZnNldCA9IHZlYzMoXG4gICAgc2luKHBvc2l0aW9uLnggKiA1MC4wICsgYmFsbFRpbWUpLFxuICAgIHNpbihwb3NpdGlvbi55ICogMTAuMCArIGJhbGxUaW1lICogMi4wKSxcbiAgICBjb3MocG9zaXRpb24ueiAqIDQwLjAgKyBiYWxsVGltZSlcbiAgKSAqIDAuMDAzO1xuXG4gICBiYWxsdlBvc2l0aW9uICo9IDEuMCArIHNlbGVjdGVkICogMC4yO1xuXG4gICBiYWxsdk5vcm1hbCA9IG5vcm1hbGl6ZShiYWxsaW52ZXJzZShiYWxsdHJhbnNwb3NlKG1vZGVsTWF0cml4KSkgKiB2ZWM0KG5vcm1hbGl6ZShub3JtYWwpLCAxLjApKS54eXo7XG4gICBiYWxsdldvcmxkUG9zID0gKG1vZGVsTWF0cml4ICogdmVjNChiYWxsdlBvc2l0aW9uLCAxLjApKS54eXo7XG5cbiAgIHZlYzQgYmFsbHZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoYmFsbHZQb3NpdGlvbiArIG9mZnNldCwgMS4wKTtcblxuICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBiYWxsdlBvc2l0aW9uO1xufVxuYFxuXG5leHBvcnQgZGVmYXVsdCBnbHNsIiwiY29uc3QgZ2xzbCA9IGBcbnVuaWZvcm0gc2FtcGxlcjJEIHBhbm90ZXg7XG51bmlmb3JtIHNhbXBsZXIyRCB0ZXhmeDtcbnVuaWZvcm0gZmxvYXQgYmFsbFRpbWU7XG51bmlmb3JtIGZsb2F0IHNlbGVjdGVkO1xudmFyeWluZyB2ZWMyIGJhbGx2VXY7XG52YXJ5aW5nIHZlYzMgYmFsbHZQb3NpdGlvbjtcbnZhcnlpbmcgdmVjMyBiYWxsdk5vcm1hbDtcbnZhcnlpbmcgdmVjMyBiYWxsdldvcmxkUG9zO1xuXG51bmlmb3JtIGZsb2F0IG9wYWNpdHk7XG5cbnZvaWQgbWFpbiggdm9pZCApIHtcbiAgIHZlYzIgdXYgPSBiYWxsdlV2O1xuICAvL3V2LnkgPSAgMS4wIC0gdXYueTtcblxuICAgdmVjMyBleWUgPSBub3JtYWxpemUoY2FtZXJhUG9zaXRpb24gLSBiYWxsdldvcmxkUG9zKTtcbiAgIGZsb2F0IGZyZXNuZWwgPSBhYnMoZG90KGV5ZSwgYmFsbHZOb3JtYWwpKTtcbiAgIGZsb2F0IHNoaWZ0ID0gcG93KCgxLjAgLSBmcmVzbmVsKSwgNC4wKSAqIDAuMDU7XG5cbiAgdmVjMyBjb2wgPSB2ZWMzKFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1diAtIHNoaWZ0KS5yLFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1dikuZyxcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYgKyBzaGlmdCkuYlxuICApO1xuXG4gICBjb2wgPSBtaXgoY29sICogMC43LCB2ZWMzKDEuMCksIDAuNyAtIGZyZXNuZWwpO1xuXG4gICBjb2wgKz0gc2VsZWN0ZWQgKiAwLjM7XG5cbiAgIGZsb2F0IHQgPSBiYWxsVGltZSAqIDAuNCArIGJhbGx2UG9zaXRpb24ueCArIGJhbGx2UG9zaXRpb24uejtcbiAgIHV2ID0gdmVjMihiYWxsdlV2LnggKyB0ICogMC4yLCBiYWxsdlV2LnkgKyB0KTtcbiAgIHZlYzMgZnggPSB0ZXh0dXJlMkQodGV4ZngsIHV2KS5yZ2IgKiAwLjQ7XG5cbiAgLy92ZWM0IGNvbCA9IHZlYzQoMS4wLCAxLjAsIDAuMCwgMS4wKTtcbiAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgb3BhY2l0eSk7XG4gIC8vZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgMS4wKTtcbn1cbmBcblxuZXhwb3J0IGRlZmF1bHQgZ2xzbCIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiAzNjAgaW1hZ2UgdGhhdCBmaWxscyB0aGUgdXNlcidzIHZpc2lvbiB3aGVuIGluIGEgY2xvc2UgcHJveGltaXR5LlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBHaXZlbiBhIDM2MCBpbWFnZSBhc3NldCB3aXRoIHRoZSBmb2xsb3dpbmcgVVJMIGluIFNwb2tlOlxuICogaHR0cHM6Ly9ndC1hZWwtYXEtYXNzZXRzLmFlbGF0Z3QtaW50ZXJuYWwubmV0L2ZpbGVzLzEyMzQ1YWJjLTY3ODlkZWYuanBnXG4gKlxuICogVGhlIG5hbWUgb2YgdGhlIGBpbW1lcnNpdmUtMzYwLmdsYmAgaW5zdGFuY2UgaW4gdGhlIHNjZW5lIHNob3VsZCBiZTpcbiAqIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fMTIzNDVhYmMtNjc4OWRlZl9qcGdcIiBPUiBcIjEyMzQ1YWJjLTY3ODlkZWZfanBnXCJcbiAqL1xuXG5cbi8vIFRPRE86IFxuLy8gLSBhZGp1c3Qgc2l6ZSBvZiBwYW5vIGJhbGxcbi8vIC0gZHJvcCBvbiB2aWRlbyBvciBpbWFnZSBhbmQgcHVsbCB2aWRlby9pbWFnZSBmcm9tIHRoYXQgbWVkaWEgbG9jYXRpb25cbi8vIC0gaW50ZXJjZXB0IG1vdXNlIGlucHV0IHNvbWVob3c/ICAgIE5vdCBzdXJlIGlmIGl0J3MgcG9zc2libGUuXG5cblxuaW1wb3J0IGJhbGxmeCBmcm9tICcuLi9hc3NldHMvYmFsbGZ4LnBuZydcbmltcG9ydCBwYW5vdmVydCBmcm9tICcuLi9zaGFkZXJzL3Bhbm9iYWxsLnZlcnQnXG5pbXBvcnQgcGFub2ZyYWcgZnJvbSAnLi4vc2hhZGVycy9wYW5vYmFsbC5mcmFnJ1xuXG5jb25zdCB3b3JsZENhbWVyYSA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkU2VsZiA9IG5ldyBUSFJFRS5WZWN0b3IzKClcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIGJhbGxUZXggPSBudWxsXG5sb2FkZXIubG9hZChiYWxsZngsIChiYWxsKSA9PiB7XG4gICAgYmFsbC5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJhbGwubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYWxsLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmFsbC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJhbGxUZXggPSBiYWxsXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCB7XG4gIHNjaGVtYToge1xuICAgIHVybDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbCB9LFxuICB9LFxuICBpbml0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHVybCA9IHRoaXMuZGF0YS51cmxcbiAgICBpZiAoIXVybCB8fCB1cmwgPT0gXCJcIikge1xuICAgICAgICB1cmwgPSB0aGlzLnBhcnNlU3Bva2VOYW1lKClcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdXJsLm1hdGNoKC9eLipcXC4oLiopJC8pWzFdXG5cbiAgICAvLyBtZWRpYS1pbWFnZSB3aWxsIHNldCB1cCB0aGUgc3BoZXJlIGdlb21ldHJ5IGZvciB1c1xuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdtZWRpYS1pbWFnZScsIHtcbiAgICAgIHByb2plY3Rpb246ICczNjAtZXF1aXJlY3Rhbmd1bGFyJyxcbiAgICAgIGFscGhhTW9kZTogJ29wYXF1ZScsXG4gICAgICBzcmM6IHVybCxcbiAgICAgIHZlcnNpb246IDEsXG4gICAgICBiYXRjaDogZmFsc2UsXG4gICAgICBjb250ZW50VHlwZTogYGltYWdlLyR7ZXh0ZW5zaW9ufWAsXG4gICAgICBhbHBoYUN1dG9mZjogMCxcbiAgICB9KVxuICAgIC8vIGJ1dCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoaXMgdG8gaGFwcGVuXG4gICAgdGhpcy5tZXNoID0gYXdhaXQgdGhpcy5nZXRNZXNoKClcblxuICAgIHZhciBiYWxsID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSgwLjE1LCAzMCwgMjApLFxuICAgICAgICBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgICAgcGFub3RleDoge3ZhbHVlOiB0aGlzLm1lc2gubWF0ZXJpYWwubWFwfSxcbiAgICAgICAgICAgICAgdGV4Zng6IHt2YWx1ZTogYmFsbFRleH0sXG4gICAgICAgICAgICAgIHNlbGVjdGVkOiB7dmFsdWU6IDB9LFxuICAgICAgICAgICAgICBiYWxsVGltZToge3ZhbHVlOiAwfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogcGFub3ZlcnQsXG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlcjogcGFub2ZyYWcsXG4gICAgICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgICB9KVxuICAgIClcbiAgIFxuICAgIGJhbGwucm90YXRpb24uc2V0KE1hdGguUEksIDAsIDApO1xuICAgIGJhbGwucG9zaXRpb24uY29weSh0aGlzLm1lc2gucG9zaXRpb24pO1xuICAgIGJhbGwudXNlckRhdGEuZmxvYXRZID0gdGhpcy5tZXNoLnBvc2l0aW9uLnkgKyAwLjY7XG4gICAgYmFsbC51c2VyRGF0YS5zZWxlY3RlZCA9IDA7XG4gICAgYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgdGhpcy5iYWxsID0gYmFsbFxuICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoXCJiYWxsXCIsIGJhbGwpXG5cbiAgICB0aGlzLm1lc2guZ2VvbWV0cnkuc2NhbGUoMTAwLCAxMDAsIDEwMClcbiAgICB0aGlzLm1lc2gubWF0ZXJpYWwuc2V0VmFsdWVzKHtcbiAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgZGVwdGhUZXN0OiBmYWxzZSxcbiAgICB9KVxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gZmFsc2VcblxuICAgIHRoaXMubmVhciA9IDAuOFxuICAgIHRoaXMuZmFyID0gMS4xXG5cbiAgICAvLyBSZW5kZXIgT1ZFUiB0aGUgc2NlbmUgYnV0IFVOREVSIHRoZSBjdXJzb3JcbiAgICB0aGlzLm1lc2gucmVuZGVyT3JkZXIgPSBBUFAuUkVOREVSX09SREVSLkNVUlNPUiAtIDAuMVxuICB9LFxuICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFsbC5nZW9tZXRyeS5kaXNwb3NlKClcbiAgICB0aGlzLmJhbGwuZ2VvbWV0cnkgPSBudWxsXG4gICAgdGhpcy5iYWxsLm1hdGVyaWFsLmRpc3Bvc2UoKVxuICAgIHRoaXMuYmFsbC5tYXRlcmlhbCA9IG51bGxcbiAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwiYmFsbFwiKVxuICAgIHRoaXMuYmFsbCA9IG51bGxcbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICBpZiAodGhpcy5tZXNoICYmIGJhbGxUZXgpIHtcbiAgICAgIHRoaXMuYmFsbC5wb3NpdGlvbi55ID0gdGhpcy5iYWxsLnVzZXJEYXRhLmZsb2F0WSArIE1hdGguY29zKCh0aW1lICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXQpLzEwMDAgKiAzICkgKiAwLjAyO1xuICAgICAgdGhpcy5iYWxsLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcblxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLnRleGZ4LnZhbHVlID0gYmFsbFRleFxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLmJhbGxUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgIC8vIExpbmVhcmx5IG1hcCBjYW1lcmEgZGlzdGFuY2UgdG8gbWF0ZXJpYWwgb3BhY2l0eVxuICAgICAgdGhpcy5tZXNoLmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSB3b3JsZFNlbGYuZGlzdGFuY2VUbyh3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IG9wYWNpdHkgPSAxIC0gKGRpc3RhbmNlIC0gdGhpcy5uZWFyKSAvICh0aGlzLmZhciAtIHRoaXMubmVhcilcbiAgICAgIGlmIChvcGFjaXR5IDwgMCkge1xuICAgICAgICAgIC8vIGZhciBhd2F5XG4gICAgICAgICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZVxuICAgICAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPSBvcGFjaXR5ID4gMSA/IDEgOiBvcGFjaXR5XG4gICAgICAgICAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRydWVcbiAgICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHlcbiAgICAgICAgfVxuICAgIH1cbiAgfSxcbiAgcGFyc2VTcG9rZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBBY2NlcHRlZCBuYW1lczogXCJsYWJlbF9faW1hZ2UtaGFzaF9leHRcIiBPUiBcImltYWdlLWhhc2hfZXh0XCJcbiAgICBjb25zdCBzcG9rZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgIGNvbnN0IG1hdGNoZXMgPSBzcG9rZU5hbWUubWF0Y2goLyg/Oi4qX18pPyguKilfKC4qKS8pXG4gICAgaWYgKCFtYXRjaGVzIHx8IG1hdGNoZXMubGVuZ3RoIDwgMykgeyByZXR1cm4gXCJcIiB9XG4gICAgY29uc3QgWywgaGFzaCwgZXh0ZW5zaW9uXSAgPSBtYXRjaGVzXG4gICAgY29uc3QgdXJsID0gYGh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2RhdGEvJHtoYXNofS4ke2V4dGVuc2lvbn1gXG4gICAgcmV0dXJuIHVybFxuICB9LFxuICBnZXRNZXNoOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgICBpZiAobWVzaCkgcmVzb2x2ZShtZXNoKVxuICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAnaW1hZ2UtbG9hZGVkJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJpbW1lcnNpdmUtMzYwIHBhbm8gbG9hZGVkOiBcIiArIHRoaXMuZGF0YS51cmwpXG4gICAgICAgICAgcmVzb2x2ZSh0aGlzLmVsLm9iamVjdDNETWFwLm1lc2gpXG4gICAgICAgIH0sXG4gICAgICAgIHsgb25jZTogdHJ1ZSB9XG4gICAgICApXG4gICAgfSlcbiAgfSxcbn0pXG4iLCIvLyBQYXJhbGxheCBPY2NsdXNpb24gc2hhZGVycyBmcm9tXG4vLyAgICBodHRwOi8vc3VuYW5kYmxhY2tjYXQuY29tL3RpcEZ1bGxWaWV3LnBocD90b3BpY2lkPTI4XG4vLyBObyB0YW5nZW50LXNwYWNlIHRyYW5zZm9ybXMgbG9naWMgYmFzZWQgb25cbi8vICAgaHR0cDovL21taWtrZWxzZW4zZC5ibG9nc3BvdC5zay8yMDEyLzAyL3BhcmFsbGF4cG9jLW1hcHBpbmctYW5kLW5vLXRhbmdlbnQuaHRtbFxuXG4vLyBJZGVudGl0eSBmdW5jdGlvbiBmb3IgZ2xzbC1saXRlcmFsIGhpZ2hsaWdodGluZyBpbiBWUyBDb2RlXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCBQYXJhbGxheFNoYWRlciA9IHtcbiAgLy8gT3JkZXJlZCBmcm9tIGZhc3Rlc3QgdG8gYmVzdCBxdWFsaXR5LlxuICBtb2Rlczoge1xuICAgIG5vbmU6ICdOT19QQVJBTExBWCcsXG4gICAgYmFzaWM6ICdVU0VfQkFTSUNfUEFSQUxMQVgnLFxuICAgIHN0ZWVwOiAnVVNFX1NURUVQX1BBUkFMTEFYJyxcbiAgICBvY2NsdXNpb246ICdVU0VfT0NMVVNJT05fUEFSQUxMQVgnLCAvLyBhLmsuYS4gUE9NXG4gICAgcmVsaWVmOiAnVVNFX1JFTElFRl9QQVJBTExBWCcsXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBidW1wTWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgbWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgfSxcblxuICB2ZXJ0ZXhTaGFkZXI6IGdsc2xgXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZVdiA9IHV2O1xuICAgICAgdmVjNCBtdlBvc2l0aW9uID0gbW9kZWxWaWV3TWF0cml4ICogdmVjNCggcG9zaXRpb24sIDEuMCApO1xuICAgICAgdlZpZXdQb3NpdGlvbiA9IC1tdlBvc2l0aW9uLnh5ejtcbiAgICAgIHZOb3JtYWwgPSBub3JtYWxpemUoIG5vcm1hbE1hdHJpeCAqIG5vcm1hbCApO1xuICAgICAgXG4gICAgICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtdlBvc2l0aW9uO1xuICAgIH1cbiAgYCxcblxuICBmcmFnbWVudFNoYWRlcjogZ2xzbGBcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBidW1wTWFwO1xuICAgIHVuaWZvcm0gc2FtcGxlcjJEIG1hcDtcblxuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhTY2FsZTtcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWluTGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNYXhMYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBmYWRlOyAvLyBDVVNUT01cblxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICAjaWZkZWYgVVNFX0JBU0lDX1BBUkFMTEFYXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgZmxvYXQgaW5pdGlhbEhlaWdodCA9IHRleHR1cmUyRChidW1wTWFwLCB2VXYpLnI7XG5cbiAgICAgIC8vIE5vIE9mZnNldCBMaW1pdHRpbmc6IG1lc3N5LCBmbG9hdGluZyBvdXRwdXQgYXQgZ3JhemluZyBhbmdsZXMuXG4gICAgICAvL1widmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56ICogaW5pdGlhbEhlaWdodDtcIixcblxuICAgICAgLy8gT2Zmc2V0IExpbWl0aW5nXG4gICAgICB2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgKiBpbml0aWFsSGVpZ2h0O1xuICAgICAgcmV0dXJuIHZVdiAtIHRleENvb3JkT2Zmc2V0O1xuICAgIH1cblxuICAgICNlbHNlXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgLy8gRGV0ZXJtaW5lIG51bWJlciBvZiBsYXllcnMgZnJvbSBhbmdsZSBiZXR3ZWVuIFYgYW5kIE5cbiAgICAgIGZsb2F0IG51bUxheWVycyA9IG1peChwYXJhbGxheE1heExheWVycywgcGFyYWxsYXhNaW5MYXllcnMsIGFicyhkb3QodmVjMygwLjAsIDAuMCwgMS4wKSwgVikpKTtcblxuICAgICAgZmxvYXQgbGF5ZXJIZWlnaHQgPSAxLjAgLyBudW1MYXllcnM7XG4gICAgICBmbG9hdCBjdXJyZW50TGF5ZXJIZWlnaHQgPSAwLjA7XG4gICAgICAvLyBTaGlmdCBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzIGZvciBlYWNoIGl0ZXJhdGlvblxuICAgICAgdmVjMiBkdGV4ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogLyBudW1MYXllcnM7XG5cbiAgICAgIHZlYzIgY3VycmVudFRleHR1cmVDb29yZHMgPSB2VXY7XG5cbiAgICAgIGZsb2F0IGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuXG4gICAgICAvLyB3aGlsZSAoIGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0IClcbiAgICAgIC8vIEluZmluaXRlIGxvb3BzIGFyZSBub3Qgd2VsbCBzdXBwb3J0ZWQuIERvIGEgXCJsYXJnZVwiIGZpbml0ZVxuICAgICAgLy8gbG9vcCwgYnV0IG5vdCB0b28gbGFyZ2UsIGFzIGl0IHNsb3dzIGRvd24gc29tZSBjb21waWxlcnMuXG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IDMwOyBpICs9IDEpIHtcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlIDw9IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBsYXllckhlaWdodDtcbiAgICAgICAgLy8gU2hpZnQgdGV4dHVyZSBjb29yZGluYXRlcyBhbG9uZyB2ZWN0b3IgVlxuICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkdGV4O1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgIH1cblxuICAgICAgI2lmZGVmIFVTRV9TVEVFUF9QQVJBTExBWFxuXG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX1JFTElFRl9QQVJBTExBWClcblxuICAgICAgdmVjMiBkZWx0YVRleENvb3JkID0gZHRleCAvIDIuMDtcbiAgICAgIGZsb2F0IGRlbHRhSGVpZ2h0ID0gbGF5ZXJIZWlnaHQgLyAyLjA7XG5cbiAgICAgIC8vIFJldHVybiB0byB0aGUgbWlkIHBvaW50IG9mIHByZXZpb3VzIGxheWVyXG4gICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuXG4gICAgICAvLyBCaW5hcnkgc2VhcmNoIHRvIGluY3JlYXNlIHByZWNpc2lvbiBvZiBTdGVlcCBQYXJhbGxheCBNYXBwaW5nXG4gICAgICBjb25zdCBpbnQgbnVtU2VhcmNoZXMgPSA1O1xuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBudW1TZWFyY2hlczsgaSArPSAxKSB7XG4gICAgICAgIGRlbHRhVGV4Q29vcmQgLz0gMi4wO1xuICAgICAgICBkZWx0YUhlaWdodCAvPSAyLjA7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgICAvLyBTaGlmdCBhbG9uZyBvciBhZ2FpbnN0IHZlY3RvciBWXG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIC8vIEJlbG93IHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBhYm92ZSB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfT0NMVVNJT05fUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgcHJldlRDb29yZHMgPSBjdXJyZW50VGV4dHVyZUNvb3JkcyArIGR0ZXg7XG5cbiAgICAgIC8vIEhlaWdodHMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCBuZXh0SCA9IGhlaWdodEZyb21UZXh0dXJlIC0gY3VycmVudExheWVySGVpZ2h0O1xuICAgICAgZmxvYXQgcHJldkggPSB0ZXh0dXJlMkQoYnVtcE1hcCwgcHJldlRDb29yZHMpLnIgLSBjdXJyZW50TGF5ZXJIZWlnaHQgKyBsYXllckhlaWdodDtcblxuICAgICAgLy8gUHJvcG9ydGlvbnMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCB3ZWlnaHQgPSBuZXh0SCAvIChuZXh0SCAtIHByZXZIKTtcblxuICAgICAgLy8gSW50ZXJwb2xhdGlvbiBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzXG4gICAgICByZXR1cm4gcHJldlRDb29yZHMgKiB3ZWlnaHQgKyBjdXJyZW50VGV4dHVyZUNvb3JkcyAqICgxLjAgLSB3ZWlnaHQpO1xuXG4gICAgICAjZWxzZSAvLyBOT19QQVJBTExBWFxuXG4gICAgICByZXR1cm4gdlV2O1xuXG4gICAgICAjZW5kaWZcbiAgICB9XG4gICAgI2VuZGlmXG5cbiAgICB2ZWMyIHBlcnR1cmJVdih2ZWMzIHN1cmZQb3NpdGlvbiwgdmVjMyBzdXJmTm9ybWFsLCB2ZWMzIHZpZXdQb3NpdGlvbikge1xuICAgICAgdmVjMiB0ZXhEeCA9IGRGZHgodlV2KTtcbiAgICAgIHZlYzIgdGV4RHkgPSBkRmR5KHZVdik7XG5cbiAgICAgIHZlYzMgdlNpZ21hWCA9IGRGZHgoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlNpZ21hWSA9IGRGZHkoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlIxID0gY3Jvc3ModlNpZ21hWSwgc3VyZk5vcm1hbCk7XG4gICAgICB2ZWMzIHZSMiA9IGNyb3NzKHN1cmZOb3JtYWwsIHZTaWdtYVgpO1xuICAgICAgZmxvYXQgZkRldCA9IGRvdCh2U2lnbWFYLCB2UjEpO1xuXG4gICAgICB2ZWMyIHZQcm9qVnNjciA9ICgxLjAgLyBmRGV0KSAqIHZlYzIoZG90KHZSMSwgdmlld1Bvc2l0aW9uKSwgZG90KHZSMiwgdmlld1Bvc2l0aW9uKSk7XG4gICAgICB2ZWMzIHZQcm9qVnRleDtcbiAgICAgIHZQcm9qVnRleC54eSA9IHRleER4ICogdlByb2pWc2NyLnggKyB0ZXhEeSAqIHZQcm9qVnNjci55O1xuICAgICAgdlByb2pWdGV4LnogPSBkb3Qoc3VyZk5vcm1hbCwgdmlld1Bvc2l0aW9uKTtcblxuICAgICAgcmV0dXJuIHBhcmFsbGF4TWFwKHZQcm9qVnRleCk7XG4gICAgfVxuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdmVjMiBtYXBVdiA9IHBlcnR1cmJVdigtdlZpZXdQb3NpdGlvbiwgbm9ybWFsaXplKHZOb3JtYWwpLCBub3JtYWxpemUodlZpZXdQb3NpdGlvbikpO1xuICAgICAgXG4gICAgICAvLyBDVVNUT00gU1RBUlRcbiAgICAgIHZlYzQgdGV4ZWwgPSB0ZXh0dXJlMkQobWFwLCBtYXBVdik7XG4gICAgICB2ZWMzIGNvbG9yID0gbWl4KHRleGVsLnh5eiwgdmVjMygwKSwgZmFkZSk7XG4gICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgLy8gQ1VTVE9NIEVORFxuICAgIH1cblxuICBgLFxufVxuXG5leHBvcnQgeyBQYXJhbGxheFNoYWRlciB9XG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQ3JlYXRlIHRoZSBpbGx1c2lvbiBvZiBkZXB0aCBpbiBhIGNvbG9yIGltYWdlIGZyb20gYSBkZXB0aCBtYXBcbiAqXG4gKiBVc2FnZVxuICogPT09PT1cbiAqIENyZWF0ZSBhIHBsYW5lIGluIEJsZW5kZXIgYW5kIGdpdmUgaXQgYSBtYXRlcmlhbCAoanVzdCB0aGUgZGVmYXVsdCBQcmluY2lwbGVkIEJTREYpLlxuICogQXNzaWduIGNvbG9yIGltYWdlIHRvIFwiY29sb3JcIiBjaGFubmVsIGFuZCBkZXB0aCBtYXAgdG8gXCJlbWlzc2l2ZVwiIGNoYW5uZWwuXG4gKiBZb3UgbWF5IHdhbnQgdG8gc2V0IGVtaXNzaXZlIHN0cmVuZ3RoIHRvIHplcm8gc28gdGhlIHByZXZpZXcgbG9va3MgYmV0dGVyLlxuICogQWRkIHRoZSBcInBhcmFsbGF4XCIgY29tcG9uZW50IGZyb20gdGhlIEh1YnMgZXh0ZW5zaW9uLCBjb25maWd1cmUsIGFuZCBleHBvcnQgYXMgLmdsYlxuICovXG5cbmltcG9ydCB7IFBhcmFsbGF4U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMnXG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4Jywge1xuICBzY2hlbWE6IHtcbiAgICBzdHJlbmd0aDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC41IH0sXG4gICAgY3V0b2ZmVHJhbnNpdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDggfSxcbiAgICBjdXRvZmZBbmdsZTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDQgfSxcbiAgfSxcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBjb25zdCB7IG1hcDogY29sb3JNYXAsIGVtaXNzaXZlTWFwOiBkZXB0aE1hcCB9ID0gbWVzaC5tYXRlcmlhbFxuICAgIGNvbG9yTWFwLndyYXBTID0gY29sb3JNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgZGVwdGhNYXAud3JhcFMgPSBkZXB0aE1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBjb25zdCB7IHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIgfSA9IFBhcmFsbGF4U2hhZGVyXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICBmcmFnbWVudFNoYWRlcixcbiAgICAgIGRlZmluZXM6IHsgVVNFX09DTFVTSU9OX1BBUkFMTEFYOiB0cnVlIH0sXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBtYXA6IHsgdmFsdWU6IGNvbG9yTWFwIH0sXG4gICAgICAgIGJ1bXBNYXA6IHsgdmFsdWU6IGRlcHRoTWFwIH0sXG4gICAgICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IC0xICogdGhpcy5kYXRhLnN0cmVuZ3RoIH0sXG4gICAgICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiAyMCB9LFxuICAgICAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogMzAgfSxcbiAgICAgICAgZmFkZTogeyB2YWx1ZTogMCB9LFxuICAgICAgfSxcbiAgICB9KVxuICAgIG1lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgaWYgKHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEpIHtcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih2ZWMpXG4gICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh2ZWMpXG4gICAgICBjb25zdCBhbmdsZSA9IHZlYy5hbmdsZVRvKGZvcndhcmQpXG4gICAgICBjb25zdCBmYWRlID0gbWFwTGluZWFyQ2xhbXBlZChcbiAgICAgICAgYW5nbGUsXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSAtIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgKyB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgMCwgLy8gSW4gdmlldyB6b25lLCBubyBmYWRlXG4gICAgICAgIDEgLy8gT3V0c2lkZSB2aWV3IHpvbmUsIGZ1bGwgZmFkZVxuICAgICAgKVxuICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5mYWRlLnZhbHVlID0gZmFkZVxuICAgIH1cbiAgfSxcbn0pXG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBiMSArICgoeCAtIGExKSAqIChiMiAtIGIxKSkgLyAoYTIgLSBhMSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyQ2xhbXBlZCh4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gY2xhbXAobWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSwgYjEsIGIyKVxufVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGNyZWF0ZSBhIEhUTUwgb2JqZWN0IGJ5IHJlbmRlcmluZyBhIHNjcmlwdCB0aGF0IGNyZWF0ZXMgYW5kIG1hbmFnZXMgaXRcbiAqXG4gKi9cbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcbmltcG9ydCB7dnVlQ29tcG9uZW50cyBhcyBodG1sQ29tcG9uZW50c30gZnJvbSBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiO1xuXG4vLyB2YXIgaHRtbENvbXBvbmVudHM7XG4vLyB2YXIgc2NyaXB0UHJvbWlzZTtcbi8vIGlmICh3aW5kb3cuX190ZXN0aW5nVnVlQXBwcykge1xuLy8gICAgIHNjcmlwdFByb21pc2UgPSBpbXBvcnQod2luZG93Ll9fdGVzdGluZ1Z1ZUFwcHMpICAgIFxuLy8gfSBlbHNlIHtcbi8vICAgICBzY3JpcHRQcm9taXNlID0gaW1wb3J0KFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCIpIFxuLy8gfVxuLy8gLy8gc2NyaXB0UHJvbWlzZSA9IHNjcmlwdFByb21pc2UudGhlbihtb2R1bGUgPT4ge1xuLy8gLy8gICAgIHJldHVybiBtb2R1bGVcbi8vIC8vIH0pO1xuLyoqXG4gKiBNb2RpZmllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL2h1YnMvYmxvYi9tYXN0ZXIvc3JjL2NvbXBvbmVudHMvZmFkZXIuanNcbiAqIHRvIGluY2x1ZGUgYWRqdXN0YWJsZSBkdXJhdGlvbiBhbmQgY29udmVydGVkIGZyb20gY29tcG9uZW50IHRvIHN5c3RlbVxuICovXG5cbiBBRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2h0bWwtc2NyaXB0JywgeyAgXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW1UaWNrID0gaHRtbENvbXBvbmVudHNbXCJzeXN0ZW1UaWNrXCJdO1xuICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCA9IGh0bWxDb21wb25lbnRzW1wiaW5pdGlhbGl6ZUV0aGVyZWFsXCJdXG4gICAgICAgIGlmICghdGhpcy5zeXN0ZW1UaWNrIHx8ICF0aGlzLmluaXRpYWxpemVFdGhlcmVhbCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImVycm9yIGluIGh0bWwtc2NyaXB0IHN5c3RlbTogaHRtbENvbXBvbmVudHMgaGFzIG5vIHN5c3RlbVRpY2sgYW5kL29yIGluaXRpYWxpemVFdGhlcmVhbCBtZXRob2RzXCIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCgpXG4gICAgICAgIH1cbiAgICB9LFxuICBcbiAgICB0aWNrKHQsIGR0KSB7XG4gICAgICAgIHRoaXMuc3lzdGVtVGljayh0LCBkdClcbiAgICB9LFxuICB9KVxuICBcbmNvbnN0IG9uY2UgPSB7XG4gICAgb25jZSA6IHRydWVcbn07XG4gIFxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdodG1sLXNjcmlwdCcsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBcIipfY29tcG9uZW50TmFtZVwiXG4gICAgICAgIG5hbWU6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn0sXG4gICAgICAgIHdpZHRoOiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IC0xfSxcbiAgICAgICAgaGVpZ2h0OiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IC0xfSxcbiAgICAgICAgcGFyYW1ldGVyMTogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyMjogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyMzogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyNDogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsO1xuICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5kYXRhLm5hbWU7XG5cbiAgICAgICAgdGhpcy5zY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgd2lkdGg6IHRoaXMuZGF0YS53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogdGhpcy5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgIHBhcmFtZXRlcjE6IHRoaXMuZGF0YS5wYXJhbWV0ZXIxLFxuICAgICAgICAgICAgcGFyYW1ldGVyMjogdGhpcy5kYXRhLnBhcmFtZXRlcjIsXG4gICAgICAgICAgICBwYXJhbWV0ZXIzOiB0aGlzLmRhdGEucGFyYW1ldGVyMyxcbiAgICAgICAgICAgIHBhcmFtZXRlcjQ6IHRoaXMuZGF0YS5wYXJhbWV0ZXI0XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuZnVsbE5hbWUgfHwgdGhpcy5mdWxsTmFtZS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSB0aGlzLmZ1bGxOYW1lXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdCAmJiByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKGV2KSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKVxuICAgICAgICB9LCBvbmNlKTtcblxuICAgICAgICAvL3RoaXMuY3JlYXRlU2NyaXB0KCk7XG4gICAgfSxcblxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLm5hbWUgPT09IFwiXCIgfHwgdGhpcy5kYXRhLm5hbWUgPT09IHRoaXMuZnVsbE5hbWUpIHJldHVyblxuXG4gICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcbiAgICAgICAgLy8gdGhpcy5wYXJzZU5vZGVOYW1lKCk7XG4gICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHRoaXMuZnVsbE5hbWU7XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveVNjcmlwdCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgY3JlYXRlU2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGVhY2ggdGltZSB3ZSBsb2FkIGEgc2NyaXB0IGNvbXBvbmVudCB3ZSB3aWxsIHBvc3NpYmx5IGNyZWF0ZVxuICAgICAgICAvLyBhIG5ldyBuZXR3b3JrZWQgY29tcG9uZW50LiAgVGhpcyBpcyBmaW5lLCBzaW5jZSB0aGUgbmV0d29ya2VkIElkIFxuICAgICAgICAvLyBpcyBiYXNlZCBvbiB0aGUgZnVsbCBuYW1lIHBhc3NlZCBhcyBhIHBhcmFtZXRlciwgb3IgYXNzaWduZWQgdG8gdGhlXG4gICAgICAgIC8vIGNvbXBvbmVudCBpbiBTcG9rZS4gIEl0IGRvZXMgbWVhbiB0aGF0IGlmIHdlIGhhdmVcbiAgICAgICAgLy8gbXVsdGlwbGUgb2JqZWN0cyBpbiB0aGUgc2NlbmUgd2hpY2ggaGF2ZSB0aGUgc2FtZSBuYW1lLCB0aGV5IHdpbGxcbiAgICAgICAgLy8gYmUgaW4gc3luYy4gIEl0IGFsc28gbWVhbnMgdGhhdCBpZiB5b3Ugd2FudCB0byBkcm9wIGEgY29tcG9uZW50IG9uXG4gICAgICAgIC8vIHRoZSBzY2VuZSB2aWEgYSAuZ2xiLCBpdCBtdXN0IGhhdmUgYSB2YWxpZCBuYW1lIHBhcmFtZXRlciBpbnNpZGUgaXQuXG4gICAgICAgIC8vIEEgLmdsYiBpbiBzcG9rZSB3aWxsIGZhbGwgYmFjayB0byB0aGUgc3Bva2UgbmFtZSBpZiB5b3UgdXNlIG9uZSB3aXRob3V0XG4gICAgICAgIC8vIGEgbmFtZSBpbnNpZGUgaXQuXG4gICAgICAgIGxldCBsb2FkZXIgPSAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmxvYWRTY3JpcHQoKS50aGVuKCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNjcmlwdCkgcmV0dXJuXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2V0IHRoZSBwYXJlbnQgbmV0d29ya2VkIGVudGl0eSwgd2hlbiBpdCdzIGZpbmlzaGVkIGluaXRpYWxpemluZy4gIFxuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIGNyZWF0aW5nIHRoaXMgYXMgcGFydCBvZiBhIEdMVEYgbG9hZCwgdGhlIFxuICAgICAgICAgICAgICAgICAgICAvLyBwYXJlbnQgYSBmZXcgc3RlcHMgdXAgd2lsbCBiZSBuZXR3b3JrZWQuICBXZSdsbCBvbmx5IGRvIHRoaXNcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIEhUTUwgc2NyaXB0IHdhbnRzIHRvIGJlIG5ldHdvcmtlZFxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IG51bGxcblxuICAgICAgICAgICAgICAgICAgICAvLyBiaW5kIGNhbGxiYWNrc1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YWtlT3duZXJzaGlwID0gdGhpcy50YWtlT3duZXJzaGlwLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuc2V0TmV0d29ya01ldGhvZHModGhpcy50YWtlT3duZXJzaGlwLCB0aGlzLnNldFNoYXJlZERhdGEpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgIGNvbnN0IHNjcmlwdEVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gc2NyaXB0RWxcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldE9iamVjdDNEKFwid2VibGF5ZXIzZFwiLCB0aGlzLnNjcmlwdC53ZWJMYXllcjNEKVxuXG4gICAgICAgICAgICAgICAgLy8gbGV0cyBmaWd1cmUgb3V0IHRoZSBzY2FsZSwgYnV0IHNjYWxpbmcgdG8gZmlsbCB0aGUgYSAxeDFtIHNxdWFyZSwgdGhhdCBoYXMgYWxzb1xuICAgICAgICAgICAgICAgIC8vIHBvdGVudGlhbGx5IGJlZW4gc2NhbGVkIGJ5IHRoZSBwYXJlbnRzIHBhcmVudCBub2RlLiBJZiB3ZSBzY2FsZSB0aGUgZW50aXR5IGluIHNwb2tlLFxuICAgICAgICAgICAgICAgIC8vIHRoaXMgaXMgd2hlcmUgdGhlIHNjYWxlIGlzIHNldC4gIElmIHdlIGRyb3AgYSBub2RlIGluIGFuZCBzY2FsZSBpdCwgdGhlIHNjYWxlIGlzIGFsc29cbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlcmUuXG4gICAgICAgICAgICAgICAgLy8gV2UgdXNlZCB0byBoYXZlIGEgZml4ZWQgc2l6ZSBwYXNzZWQgYmFjayBmcm9tIHRoZSBlbnRpdHksIGJ1dCB0aGF0J3MgdG9vIHJlc3RyaWN0aXZlOlxuICAgICAgICAgICAgICAgIC8vIGNvbnN0IHdpZHRoID0gdGhpcy5zY3JpcHQud2lkdGhcbiAgICAgICAgICAgICAgICAvLyBjb25zdCBoZWlnaHQgPSB0aGlzLnNjcmlwdC5oZWlnaHRcblxuICAgICAgICAgICAgICAgIC8vIFRPRE86IG5lZWQgdG8gZmluZCBlbnZpcm9ubWVudC1zY2VuZSwgZ28gZG93biB0d28gbGV2ZWxzIHRvIHRoZSBncm91cCBhYm92ZSBcbiAgICAgICAgICAgICAgICAvLyB0aGUgbm9kZXMgaW4gdGhlIHNjZW5lLiAgVGhlbiBhY2N1bXVsYXRlIHRoZSBzY2FsZXMgdXAgZnJvbSB0aGlzIG5vZGUgdG9cbiAgICAgICAgICAgICAgICAvLyB0aGF0IG5vZGUuICBUaGlzIHdpbGwgYWNjb3VudCBmb3IgZ3JvdXBzLCBhbmQgbmVzdGluZy5cblxuICAgICAgICAgICAgICAgIHZhciB3aWR0aCA9IDEsIGhlaWdodCA9IDE7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGF0dGFjaGVkIHRvIGFuIGltYWdlIGluIHNwb2tlLCBzbyB0aGUgaW1hZ2UgbWVzaCBpcyBzaXplIDEgYW5kIGlzIHNjYWxlZCBkaXJlY3RseVxuICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBzY2FsZU0ueCAqIHNjYWxlSS54XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnggPSAxXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS55ID0gMVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaXQncyBlbWJlZGRlZCBpbiBhIHNpbXBsZSBnbHRmIG1vZGVsOyAgb3RoZXIgbW9kZWxzIG1heSBub3Qgd29ya1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhc3N1bWUgaXQncyBhdCB0aGUgdG9wIGxldmVsIG1lc2gsIGFuZCB0aGF0IHRoZSBtb2RlbCBpdHNlbGYgaXMgc2NhbGVkXG4gICAgICAgICAgICAgICAgICAgIGxldCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG1lc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBib3ggPSBtZXNoLmdlb21ldHJ5LmJvdW5kaW5nQm94O1xuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSAoYm94Lm1heC54IC0gYm94Lm1pbi54KSAqIG1lc2guc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gKGJveC5tYXgueSAtIGJveC5taW4ueSkgKiBtZXNoLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtZXNoU2NhbGUgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IG1lc2hTY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBtZXNoU2NhbGUueVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgdGhlIHJvb3QgZ2x0ZiBzY2FsZS5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmVudDIgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLm9iamVjdDNEXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoICo9IHBhcmVudDIuc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQgKj0gcGFyZW50Mi5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAgICAgICAgICAgICB2YXIgc2NhbGUgPSBNYXRoLm1pbih3aWR0aCAvIHdzaXplLCBoZWlnaHQgLyBoc2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwgeyB4OiBzY2FsZSwgeTogc2NhbGUsIHo6IHNjYWxlfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgd2lsbCBiZSBvbmUgZWxlbWVudCBhbHJlYWR5LCB0aGUgY3ViZSB3ZSBjcmVhdGVkIGluIGJsZW5kZXJcbiAgICAgICAgICAgICAgICAvLyBhbmQgYXR0YWNoZWQgdGhpcyBjb21wb25lbnQgdG8sIHNvIHJlbW92ZSBpdCBpZiBpdCBpcyB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuLnBvcCgpXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgYy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIFwiaXNTdGF0aWNcIiBpcyBjb3JyZWN0OyAgY2FuJ3QgYmUgc3RhdGljIGlmIGVpdGhlciBpbnRlcmFjdGl2ZSBvciBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNTdGF0aWMgJiYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUgfHwgdGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hcHBlbmRDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcblxuICAgICAgICAgICAgICAgIC8vIFRPRE86ICB3ZSBhcmUgZ29pbmcgdG8gaGF2ZSB0byBtYWtlIHN1cmUgdGhpcyB3b3JrcyBpZiBcbiAgICAgICAgICAgICAgICAvLyB0aGUgc2NyaXB0IGlzIE9OIGFuIGludGVyYWN0YWJsZSAobGlrZSBhbiBpbWFnZSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIG1ha2UgdGhlIGh0bWwgb2JqZWN0IGNsaWNrYWJsZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gZm9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIG9iamVjdCBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGlja2VkID0gdGhpcy5jbGlja2VkLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzRHJhZ2dhYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhcmVuJ3QgZ29pbmcgdG8gcmVhbGx5IGRlYWwgd2l0aCB0aGlzIHRpbGwgd2UgaGF2ZSBhIHVzZSBjYXNlLCBidXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGNhbiBzZXQgaXQgdXAgZm9yIG5vd1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNIb2xkYWJsZTogdHJ1ZSwgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhvbGRhYmxlQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi1kb3duJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmRyYWdTdGFydChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLXVwJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmRyYWdFbmQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5yYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBubyBpbnRlcmFjdGl2aXR5LCBwbGVhc2VcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcImlzLXJlbW90ZS1ob3Zlci10YXJnZXRcIilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIFNIT1VMRCB3b3JrIGJ1dCBtYWtlIHN1cmUgaXQgd29ya3MgaWYgdGhlIGVsIHdlIGFyZSBvblxuICAgICAgICAgICAgICAgIC8vIGlzIG5ldHdvcmtlZCwgc3VjaCBhcyB3aGVuIGF0dGFjaGVkIHRvIGFuIGltYWdlXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5oYXNBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhbiBleGlzdGluZyBjb3B5IG9mIHRoZSBOZXR3b3JrZWQgRW50aXR5IChpZiB3ZSBhcmUgbm90IHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBmaXJzdCBjbGllbnQgaW4gdGhlIHJvb20gaXQgd2lsbCBleGlzdCBpbiBvdGhlciBjbGllbnRzIGFuZCBiZSBjcmVhdGVkIGJ5IE5BRilcbiAgICAgICAgICAgICAgICAgICAgLy8gb3IgY3JlYXRlIGFuIGVudGl0eSBpZiB3ZSBhcmUgZmlyc3QuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSBmdW5jdGlvbiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwZXJzaXN0ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgYmUgcGFydCBvZiBhIE5ldHdvcmtlZCBHTFRGIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIHBpbm5lZCBhbmQgbG9hZGVkIHdoZW4gd2UgZW50ZXIgdGhlIHJvb20uICBVc2UgdGhlIG5ldHdvcmtlZCBwYXJlbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHBsdXMgYSBkaXNhbWJpZ3VhdGluZyBiaXQgb2YgdGV4dCB0byBjcmVhdGUgYSB1bmlxdWUgSWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSBOQUYudXRpbHMuZ2V0TmV0d29ya0lkKG5ldHdvcmtlZEVsKSArIFwiLWh0bWwtc2NyaXB0XCI7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBuZWVkIHRvIGNyZWF0ZSBhbiBlbnRpdHksIHVzZSB0aGUgc2FtZSBwZXJzaXN0ZW5jZSBhcyBvdXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrIGVudGl0eSAodHJ1ZSBpZiBwaW5uZWQsIGZhbHNlIGlmIG5vdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50ID0gZW50aXR5LmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEucGVyc2lzdGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBvbmx5IGhhcHBlbnMgaWYgdGhpcyBjb21wb25lbnQgaXMgb24gYSBzY2VuZSBmaWxlLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBlbGVtZW50cyBvbiB0aGUgc2NlbmUgYXJlbid0IG5ldHdvcmtlZC4gIFNvIGxldCdzIGFzc3VtZSBlYWNoIGVudGl0eSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzY2VuZSB3aWxsIGhhdmUgYSB1bmlxdWUgbmFtZS4gIEFkZGluZyBhIGJpdCBvZiB0ZXh0IHNvIHdlIGNhbiBmaW5kIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIERPTSB3aGVuIGRlYnVnZ2luZy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IHRoaXMuZnVsbE5hbWUucmVwbGFjZUFsbChcIl9cIixcIi1cIikgKyBcIi1odG1sLXNjcmlwdFwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBuZXR3b3JrZWQgZW50aXR5IHdlIGNyZWF0ZSBmb3IgdGhpcyBjb21wb25lbnQgYWxyZWFkeSBleGlzdHMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBjcmVhdGUgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gTk9URTogaXQgaXMgY3JlYXRlZCBvbiB0aGUgc2NlbmUsIG5vdCBhcyBhIGNoaWxkIG9mIHRoaXMgZW50aXR5LCBiZWNhdXNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIE5BRiBjcmVhdGVzIHJlbW90ZSBlbnRpdGllcyBpbiB0aGUgc2NlbmUuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5lbnRpdGllcy5oYXNFbnRpdHkobmV0SWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gTkFGLmVudGl0aWVzLmdldEVudGl0eShuZXRJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZXRob2QgdG8gcmV0cmlldmUgdGhlIHNjcmlwdCBkYXRhIG9uIHRoaXMgZW50aXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgXCJuZXR3b3JrZWRcIiBjb21wb25lbnQgc2hvdWxkIGhhdmUgcGVyc2lzdGVudD10cnVlLCB0aGUgdGVtcGxhdGUgYW5kIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBzZXQsIG93bmVyIHNldCB0byBcInNjZW5lXCIgKHNvIHRoYXQgaXQgZG9lc24ndCB1cGRhdGUgdGhlIHJlc3Qgb2ZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgd29ybGQgd2l0aCBpdCdzIGluaXRpYWwgZGF0YSwgYW5kIHNob3VsZCBOT1Qgc2V0IGNyZWF0b3IgKHRoZSBzeXN0ZW0gd2lsbCBkbyB0aGF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5zZXRBdHRyaWJ1dGUoJ25ldHdvcmtlZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGU6IFwiI3NjcmlwdC1kYXRhLW1lZGlhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQ6IHBlcnNpc3RlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG93bmVyOiBcInNjZW5lXCIsICAvLyBzbyB0aGF0IG91ciBpbml0aWFsIHZhbHVlIGRvZXNuJ3Qgb3ZlcndyaXRlIG90aGVyc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXR3b3JrSWQ6IG5ldElkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFwcGVuZENoaWxkKGVudGl0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNhdmUgYSBwb2ludGVyIHRvIHRoZSBuZXR3b3JrZWQgZW50aXR5IGFuZCB0aGVuIHdhaXQgZm9yIGl0IHRvIGJlIGZ1bGx5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCBiZWZvcmUgZ2V0dGluZyBhIHBvaW50ZXIgdG8gdGhlIGFjdHVhbCBuZXR3b3JrZWQgY29tcG9uZW50IGluIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5uZXRFbnRpdHkpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tcInNjcmlwdC1kYXRhXCJdXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIGlzIHRoZSBmaXJzdCBuZXR3b3JrZWQgZW50aXR5LCBpdCdzIHNoYXJlZERhdGEgd2lsbCBkZWZhdWx0IHRvIHRoZSAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RyaW5nIFwie31cIiwgYW5kIHdlIHNob3VsZCBpbml0aWFsaXplIGl0IHdpdGggdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuc2hhcmVkRGF0YS5sZW5ndGggPT0gMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgbmV0d29ya2VkID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tcIm5ldHdvcmtlZFwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiAobmV0d29ya2VkLmRhdGEuY3JlYXRvciA9PSBOQUYuY2xpZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIHRoaXMuc3RhdGVTeW5jLmluaXRTaGFyZWREYXRhKHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMuZWwpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkobmV0d29ya2VkRWwpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSgpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSB0aGlzLnNldHVwTmV0d29ya2VkLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIG1ldGhvZCBoYW5kbGVzIHRoZSBkaWZmZXJlbnQgc3RhcnR1cCBjYXNlczpcbiAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmUsIE5BRiB3aWxsIGJlIGNvbm5lY3RlZCBhbmQgd2UgY2FuIFxuICAgICAgICAgICAgICAgICAgICAvLyAgIGltbWVkaWF0ZWx5IGluaXRpYWxpemVcbiAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiBpcyBpbiB0aGUgcm9vbSBzY2VuZSBvciBwaW5uZWQsIGl0IHdpbGwgbGlrZWx5IGJlIGNyZWF0ZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gICBiZWZvcmUgTkFGIGlzIHN0YXJ0ZWQgYW5kIGNvbm5lY3RlZCwgc28gd2Ugd2FpdCBmb3IgYW4gZXZlbnQgdGhhdCBpc1xuICAgICAgICAgICAgICAgICAgICAvLyAgIGZpcmVkIHdoZW4gSHVicyBoYXMgc3RhcnRlZCBOQUZcbiAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5jb25uZWN0aW9uICYmIE5BRi5jb25uZWN0aW9uLmlzQ29ubmVjdGVkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQoKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdkaWRDb25uZWN0VG9OZXR3b3JrZWRTY2VuZScsIHRoaXMuc2V0dXBOZXR3b3JrZWQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaChlID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwibG9hZFNjcmlwdCBmYWlsZWQgZm9yIHNjcmlwdCBcIiArIHRoaXMuZGF0YS5uYW1lICsgXCI6IFwiICsgZSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgYXR0YWNoZWQgdG8gYSBub2RlIHdpdGggYSBtZWRpYS1sb2FkZXIgY29tcG9uZW50LCB0aGlzIG1lYW5zIHdlIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50XG4gICAgICAgIC8vIHRvIGEgbWVkaWEgb2JqZWN0IGluIFNwb2tlLiAgV2Ugc2hvdWxkIHdhaXQgdGlsbCB0aGUgb2JqZWN0IGlzIGZ1bGx5IGxvYWRlZC4gIFxuICAgICAgICAvLyBPdGhlcndpc2UsIGl0IHdhcyBhdHRhY2hlZCB0byBzb21ldGhpbmcgaW5zaWRlIGEgR0xURiAocHJvYmFibHkgaW4gYmxlbmRlcilcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQucGxheSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wYXVzZSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaGFuZGxlIFwiaW50ZXJhY3RcIiBldmVudHMgZm9yIGNsaWNrYWJsZSBlbnRpdGllc1xuICAgIGNsaWNrZWQ6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcImNsaWNrZWQgb24gaHRtbDogXCIsIGV2dClcbiAgICAgICAgdGhpcy5zY3JpcHQuY2xpY2tlZChldnQpIFxuICAgIH0sXG4gIFxuICAgIC8vIG1ldGhvZHMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgaHRtbCBvYmplY3Qgc28gdGhleSBjYW4gdXBkYXRlIG5ldHdvcmtlZCBkYXRhXG4gICAgdGFrZU93bmVyc2hpcDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnRha2VPd25lcnNoaXAoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBzdXJlLCBnbyBhaGVhZCBhbmQgY2hhbmdlIGl0IGZvciBub3dcbiAgICAgICAgfVxuICAgIH0sXG4gICAgXG4gICAgc2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oZGF0YU9iamVjdCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXRlU3luYy5zZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9LFxuXG4gICAgLy8gdGhpcyBpcyBjYWxsZWQgZnJvbSBiZWxvdywgdG8gZ2V0IHRoZSBpbml0aWFsIGRhdGEgZnJvbSB0aGUgc2NyaXB0XG4gICAgZ2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKVxuICAgICAgICB9XG4gICAgICAgIC8vIHNob3VsZG4ndCBoYXBwZW5cbiAgICAgICAgY29uc29sZS53YXJuKFwic2NyaXB0LWRhdGEgY29tcG9uZW50IGNhbGxlZCBwYXJlbnQgZWxlbWVudCBidXQgdGhlcmUgaXMgbm8gc2NyaXB0IHlldD9cIilcbiAgICAgICAgcmV0dXJuIFwie31cIlxuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICBpZiAoIXRoaXMuc2NyaXB0KSByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgLy8gbW9yZSBvciBsZXNzIGNvcGllZCBmcm9tIFwiaG92ZXJhYmxlLXZpc3VhbHMuanNcIiBpbiBodWJzXG4gICAgICAgICAgICBjb25zdCB0b2dnbGluZyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zW1wiaHVicy1zeXN0ZW1zXCJdLmN1cnNvclRvZ2dsaW5nU3lzdGVtO1xuICAgICAgICAgICAgdmFyIHBhc3N0aHJ1SW50ZXJhY3RvciA9IFtdXG5cbiAgICAgICAgICAgIGxldCBpbnRlcmFjdG9yT25lLCBpbnRlcmFjdG9yVHdvO1xuICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcbiAgICAgICAgICAgIGlmICghaW50ZXJhY3Rpb24ucmVhZHkpIHJldHVybjsgLy9ET01Db250ZW50UmVhZHkgd29ya2Fyb3VuZFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBsZXQgaG92ZXJFbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICF0b2dnbGluZy5sZWZ0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JPbmUpIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3Rvck9uZS5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwuc2V0KHBvcywgZGlyKVxuXG4gICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheUwpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgIXRvZ2dsaW5nLnJpZ2h0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodEhhbmQuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JUd28pIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3RvclR3by5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIuc2V0KHBvcywgZGlyKVxuICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlSKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmludGVyYWN0aW9uUmF5cyA9IHBhc3N0aHJ1SW50ZXJhY3RvclxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlbid0IGZpbmlzaGVkIHNldHRpbmcgdXAgdGhlIG5ldHdvcmtlZCBlbnRpdHkgZG9uJ3QgZG8gYW55dGhpbmcuXG4gICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykgeyByZXR1cm4gfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgc3RhdGUgaGFzIGNoYW5nZWQgaW4gdGhlIG5ldHdvcmtlZCBkYXRhLCB1cGRhdGUgb3VyIGh0bWwgb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LnVwZGF0ZVNoYXJlZERhdGEodGhpcy5zdGF0ZVN5bmMuZGF0YU9iamVjdClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2NyaXB0LnRpY2sodGltZSlcbiAgICB9LFxuICBcbiAgICAvLyBUT0RPOiAgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIGlmIHRoZXJlIGlzIG5vIHBhcmFtZXRlciBzcGVjaWZ5aW5nIHRoZVxuICAgIC8vIGh0bWwgc2NyaXB0IG5hbWUuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5mdWxsTmFtZSA9PT0gXCJcIikge1xuXG4gICAgICAgICAgICAvLyBUT0RPOiAgc3dpdGNoIHRoaXMgdG8gZmluZCBlbnZpcm9ubWVudC1yb290IGFuZCBnbyBkb3duIHRvIFxuICAgICAgICAgICAgLy8gdGhlIG5vZGUgYXQgdGhlIHJvb20gb2Ygc2NlbmUgKG9uZSBhYm92ZSB0aGUgdmFyaW91cyBub2RlcykuICBcbiAgICAgICAgICAgIC8vIHRoZW4gZ28gdXAgZnJvbSBoZXJlIHRpbGwgd2UgZ2V0IHRvIGEgbm9kZSB0aGF0IGhhcyB0aGF0IG5vZGVcbiAgICAgICAgICAgIC8vIGFzIGl0J3MgcGFyZW50XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICAgICAgfSBcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJjb21wb25lbnROYW1lXCJcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIGZldGNoIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgcmVzb3VyY2VcbiAgICAgICAgLy8gY29tcG9uZW50TmFtZVxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmZ1bGxOYW1lLm1hdGNoKC9fKFtBLVphLXowLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMywgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJodG1sLXNjcmlwdCBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5mdWxsTmFtZSlcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IG51bGxcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHBhcmFtc1sxXVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxvYWRTY3JpcHQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaWYgKHNjcmlwdFByb21pc2UpIHtcbiAgICAgICAgLy8gICAgIHRyeSB7XG4gICAgICAgIC8vICAgICAgICAgaHRtbENvbXBvbmVudHMgPSBhd2FpdCBzY3JpcHRQcm9taXNlO1xuICAgICAgICAvLyAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgLy8gICAgICAgICByZXR1cm5cbiAgICAgICAgLy8gICAgIH1cbiAgICAgICAgLy8gICAgIHNjcmlwdFByb21pc2UgPSBudWxsXG4gICAgICAgIC8vIH1cbiAgICAgICAgdmFyIGluaXRTY3JpcHQgPSBodG1sQ29tcG9uZW50c1t0aGlzLmNvbXBvbmVudE5hbWVdXG4gICAgICAgIGlmICghaW5pdFNjcmlwdCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiJ2h0bWwtc2NyaXB0JyBjb21wb25lbnQgZG9lc24ndCBoYXZlIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JpcHQgPSBpbml0U2NyaXB0KHRoaXMuc2NyaXB0RGF0YSlcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KXtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0Lm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgLy8gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5yZWZyZXNoKHRydWUpXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnVwZGF0ZSh0cnVlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiJ2h0bWwtc2NyaXB0JyBjb21wb25lbnQgZmFpbGVkIHRvIGluaXRpYWxpemUgc2NyaXB0IGZvciBcIiArIHRoaXMuY29tcG9uZW50TmFtZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZGVzdHJveVNjcmlwdCgpXG4gICAgfSxcblxuICAgIGRlc3Ryb3lTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuICAgICAgICB9XG5cbiAgICAgICAgd2luZG93LkFQUC5zY2VuZS5yZW1vdmVFdmVudExpc3RlbmVyKCdkaWRDb25uZWN0VG9OZXR3b3JrZWRTY2VuZScsIHRoaXMuc2V0dXBOZXR3b3JrZWQpXG5cbiAgICAgICAgdGhpcy5lbC5yZW1vdmVDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcbiAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIucmVtb3ZlT2JqZWN0M0QoXCJ3ZWJsYXllcjNkXCIpXG4gICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gbnVsbFxuXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCAmJiB0aGlzLm5ldEVudGl0eS5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICB0aGlzLm5ldEVudGl0eS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMubmV0RW50aXR5KVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2NyaXB0LmRlc3Ryb3koKVxuICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICB9XG59KVxuXG4vL1xuLy8gQ29tcG9uZW50IGZvciBvdXIgbmV0d29ya2VkIHN0YXRlLiAgVGhpcyBjb21wb25lbnQgZG9lcyBub3RoaW5nIGV4Y2VwdCBhbGwgdXMgdG8gXG4vLyBjaGFuZ2UgdGhlIHN0YXRlIHdoZW4gYXBwcm9wcmlhdGUuIFdlIGNvdWxkIHNldCB0aGlzIHVwIHRvIHNpZ25hbCB0aGUgY29tcG9uZW50IGFib3ZlIHdoZW5cbi8vIHNvbWV0aGluZyBoYXMgY2hhbmdlZCwgaW5zdGVhZCBvZiBoYXZpbmcgdGhlIGNvbXBvbmVudCBhYm92ZSBwb2xsIGVhY2ggZnJhbWUuXG4vL1xuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3NjcmlwdC1kYXRhJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzY3JpcHRkYXRhOiB7dHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJ7fVwifSxcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy50YWtlT3duZXJzaGlwID0gdGhpcy50YWtlT3duZXJzaGlwLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHRoaXMuZWwuZ2V0U2hhcmVkRGF0YSgpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXMuZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCB0aGlzLnNoYXJlZERhdGEpO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDb3VsZG4ndCBlbmNvZGUgaW5pdGlhbCBzY3JpcHQgZGF0YSBvYmplY3Q6IFwiLCBlLCB0aGlzLmRhdGFPYmplY3QpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcInt9XCJcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGFuZ2VkID0gZmFsc2U7XG4gICAgfSxcblxuICAgIHVwZGF0ZSgpIHtcbiAgICAgICAgdGhpcy5jaGFuZ2VkID0gISh0aGlzLnNoYXJlZERhdGEgPT09IHRoaXMuZGF0YS5zY3JpcHRkYXRhKTtcbiAgICAgICAgaWYgKHRoaXMuY2hhbmdlZCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudCh0aGlzLmRhdGEuc2NyaXB0ZGF0YSkpXG5cbiAgICAgICAgICAgICAgICAvLyBkbyB0aGVzZSBhZnRlciB0aGUgSlNPTiBwYXJzZSB0byBtYWtlIHN1cmUgaXQgaGFzIHN1Y2NlZWRlZFxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IHRoaXMuZGF0YS5zY3JpcHRkYXRhO1xuICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlZCA9IHRydWVcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjb3VsZG4ndCBwYXJzZSBKU09OIHJlY2VpdmVkIGluIHNjcmlwdC1zeW5jOiBcIiwgZSlcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcInt9XCJcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIGl0IGlzIGxpa2VseSB0aGF0IGFwcGx5UGVyc2lzdGVudFN5bmMgb25seSBuZWVkcyB0byBiZSBjYWxsZWQgZm9yIHBlcnNpc3RlbnRcbiAgICAvLyBuZXR3b3JrZWQgZW50aXRpZXMsIHNvIHdlIF9wcm9iYWJseV8gZG9uJ3QgbmVlZCB0byBkbyB0aGlzLiAgQnV0IGlmIHRoZXJlIGlzIG5vXG4gICAgLy8gcGVyc2lzdGVudCBkYXRhIHNhdmVkIGZyb20gdGhlIG5ldHdvcmsgZm9yIHRoaXMgZW50aXR5LCB0aGlzIGNvbW1hbmQgZG9lcyBub3RoaW5nLlxuICAgIHBsYXkoKSB7XG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIHJlYWxseSBuZWVkZWQsIGJ1dCBjYW4ndCBodXJ0XG4gICAgICAgICAgICBpZiAoQVBQLnV0aWxzKSB7IC8vIHRlbXBvcmFyeSB0aWxsIHdlIHNoaXAgbmV3IGNsaWVudFxuICAgICAgICAgICAgICAgIEFQUC51dGlscy5hcHBseVBlcnNpc3RlbnRTeW5jKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5uZXR3b3JrSWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHRha2VPd25lcnNoaXAoKSB7XG4gICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9LFxuXG4gICAgLy8gaW5pdFNoYXJlZERhdGEoZGF0YU9iamVjdCkge1xuICAgIC8vICAgICB0cnkge1xuICAgIC8vICAgICAgICAgdmFyIGh0bWxTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgLy8gICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBodG1sU3RyaW5nXG4gICAgLy8gICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgLy8gICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIC8vICAgICB9IGNhdGNoIChlKSB7XG4gICAgLy8gICAgICAgICBjb25zb2xlLmVycm9yKFwiY2FuJ3Qgc3RyaW5naWZ5IHRoZSBvYmplY3QgcGFzc2VkIHRvIHNjcmlwdC1zeW5jXCIpXG4gICAgLy8gICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAvLyAgICAgfVxuICAgIC8vIH0sXG5cbiAgICAvLyBUaGUga2V5IHBhcnQgaW4gdGhlc2UgbWV0aG9kcyAod2hpY2ggYXJlIGNhbGxlZCBmcm9tIHRoZSBjb21wb25lbnQgYWJvdmUpIGlzIHRvXG4gICAgLy8gY2hlY2sgaWYgd2UgYXJlIGFsbG93ZWQgdG8gY2hhbmdlIHRoZSBuZXR3b3JrZWQgb2JqZWN0LiAgSWYgd2Ugb3duIGl0IChpc01pbmUoKSBpcyB0cnVlKVxuICAgIC8vIHdlIGNhbiBjaGFuZ2UgaXQuICBJZiB3ZSBkb24ndCBvd24gaW4sIHdlIGNhbiB0cnkgdG8gYmVjb21lIHRoZSBvd25lciB3aXRoXG4gICAgLy8gdGFrZU93bmVyc2hpcCgpLiBJZiB0aGlzIHN1Y2NlZWRzLCB3ZSBjYW4gc2V0IHRoZSBkYXRhLiAgXG4gICAgLy9cbiAgICAvLyBOT1RFOiB0YWtlT3duZXJzaGlwIEFUVEVNUFRTIHRvIGJlY29tZSB0aGUgb3duZXIsIGJ5IGFzc3VtaW5nIGl0IGNhbiBiZWNvbWUgdGhlXG4gICAgLy8gb3duZXIgYW5kIG5vdGlmeWluZyB0aGUgbmV0d29ya2VkIGNvcGllcy4gIElmIHR3byBvciBtb3JlIGVudGl0aWVzIHRyeSB0byBiZWNvbWVcbiAgICAvLyBvd25lciwgIG9ubHkgb25lICh0aGUgbGFzdCBvbmUgdG8gdHJ5KSBiZWNvbWVzIHRoZSBvd25lci4gIEFueSBzdGF0ZSB1cGRhdGVzIGRvbmVcbiAgICAvLyBieSB0aGUgXCJmYWlsZWQgYXR0ZW1wdGVkIG93bmVyc1wiIHdpbGwgbm90IGJlIGRpc3RyaWJ1dGVkIHRvIHRoZSBvdGhlciBjbGllbnRzLFxuICAgIC8vIGFuZCB3aWxsIGJlIG92ZXJ3cml0dGVuIChldmVudHVhbGx5KSBieSB1cGRhdGVzIGZyb20gdGhlIG90aGVyIGNsaWVudHMuICAgQnkgbm90XG4gICAgLy8gYXR0ZW1wdGluZyB0byBndWFyYW50ZWUgb3duZXJzaGlwLCB0aGlzIGNhbGwgaXMgZmFzdCBhbmQgc3luY2hyb25vdXMuICBBbnkgXG4gICAgLy8gbWV0aG9kcyBmb3IgZ3VhcmFudGVlaW5nIG93bmVyc2hpcCBjaGFuZ2Ugd291bGQgdGFrZSBhIG5vbi10cml2aWFsIGFtb3VudCBvZiB0aW1lXG4gICAgLy8gYmVjYXVzZSBvZiBuZXR3b3JrIGxhdGVuY2llcy5cblxuICAgIHNldFNoYXJlZERhdGEoZGF0YU9iamVjdCkge1xuICAgICAgICBpZiAoIU5BRi51dGlscy5pc01pbmUodGhpcy5lbCkgJiYgIU5BRi51dGlscy50YWtlT3duZXJzaGlwKHRoaXMuZWwpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHZhciBodG1sU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gaHRtbFN0cmluZ1xuICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gZGF0YU9iamVjdFxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgaHRtbFN0cmluZyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY2FuJ3Qgc3RyaW5naWZ5IHRoZSBvYmplY3QgcGFzc2VkIHRvIHNjcmlwdC1zeW5jXCIpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG4vLyBBZGQgb3VyIHRlbXBsYXRlIGZvciBvdXIgbmV0d29ya2VkIG9iamVjdCB0byB0aGUgYS1mcmFtZSBhc3NldHMgb2JqZWN0LFxuLy8gYW5kIGEgc2NoZW1hIHRvIHRoZSBOQUYuc2NoZW1hcy4gIEJvdGggbXVzdCBiZSB0aGVyZSB0byBoYXZlIGN1c3RvbSBjb21wb25lbnRzIHdvcmtcblxuY29uc3QgYXNzZXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImEtYXNzZXRzXCIpO1xuXG5hc3NldHMuaW5zZXJ0QWRqYWNlbnRIVE1MKFxuICAgICdiZWZvcmVlbmQnLFxuICAgIGBcbiAgICA8dGVtcGxhdGUgaWQ9XCJzY3JpcHQtZGF0YS1tZWRpYVwiPlxuICAgICAgPGEtZW50aXR5XG4gICAgICAgIHNjcmlwdC1kYXRhXG4gICAgICA+PC9hLWVudGl0eT5cbiAgICA8L3RlbXBsYXRlPlxuICBgXG4gIClcblxuY29uc3QgdmVjdG9yUmVxdWlyZXNVcGRhdGUgPSBlcHNpbG9uID0+IHtcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0bGV0IHByZXYgPSBudWxsO1xuXHRcdFx0cmV0dXJuIGN1cnIgPT4ge1xuXHRcdFx0XHRpZiAocHJldiA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdHByZXYgPSBuZXcgVEhSRUUuVmVjdG9yMyhjdXJyLngsIGN1cnIueSwgY3Vyci56KTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmICghTkFGLnV0aWxzLmFsbW9zdEVxdWFsVmVjMyhwcmV2LCBjdXJyLCBlcHNpbG9uKSkge1xuXHRcdFx0XHRcdHByZXYuY29weShjdXJyKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9O1xuXHRcdH07XG5cdH07XG5cbk5BRi5zY2hlbWFzLmFkZCh7XG4gIFx0dGVtcGxhdGU6IFwiI3NjcmlwdC1kYXRhLW1lZGlhXCIsXG4gICAgY29tcG9uZW50czogW1xuICAgIC8vIHtcbiAgICAvLyAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgLy8gICAgIHByb3BlcnR5OiBcInJvdGF0aW9uXCIsXG4gICAgLy8gICAgIHJlcXVpcmVzTmV0d29ya1VwZGF0ZTogdmVjdG9yUmVxdWlyZXNVcGRhdGUoMC4wMDEpXG4gICAgLy8gfSxcbiAgICAvLyB7XG4gICAgLy8gICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgIC8vICAgICBwcm9wZXJ0eTogXCJzY2FsZVwiLFxuICAgIC8vICAgICByZXF1aXJlc05ldHdvcmtVcGRhdGU6IHZlY3RvclJlcXVpcmVzVXBkYXRlKDAuMDAxKVxuICAgIC8vIH0sXG4gICAge1xuICAgICAgXHRjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAgIFx0cHJvcGVydHk6IFwic2NyaXB0ZGF0YVwiXG4gICAgfV0sXG4gICAgICBub25BdXRob3JpemVkQ29tcG9uZW50czogW1xuICAgICAge1xuICAgICAgICAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgICAgICAgICBwcm9wZXJ0eTogXCJzY3JpcHRkYXRhXCJcbiAgICAgIH1cbiAgICBdLFxuXG4gIH0pO1xuXG4iLCIvKipcbiAqIGNvbnRyb2wgYSB2aWRlbyBmcm9tIGEgY29tcG9uZW50IHlvdSBzdGFuZCBvbi4gIEltcGxlbWVudHMgYSByYWRpdXMgZnJvbSB0aGUgY2VudGVyIG9mIFxuICogdGhlIG9iamVjdCBpdCdzIGF0dGFjaGVkIHRvLCBpbiBtZXRlcnNcbiAqL1xuXG5pbXBvcnQgeyBFbnRpdHksIENvbXBvbmVudCB9IGZyb20gJ2FmcmFtZSdcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tICcuLi91dGlscy9zY2VuZS1ncmFwaCdcbmltcG9ydCAnLi9wcm94aW1pdHktZXZlbnRzLmpzJ1xuXG5pbnRlcmZhY2UgQU9iamVjdDNEIGV4dGVuZHMgVEhSRUUuT2JqZWN0M0Qge1xuICAgIGVsOiBFbnRpdHlcbn1cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCd2aWRlby1jb250cm9sLXBhZCcsIHtcbiAgICBtZWRpYVZpZGVvOiB7fSBhcyBDb21wb25lbnQsXG4gICAgXG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHRhcmdldDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJcIiB9LCAgLy8gaWYgbm90aGluZyBwYXNzZWQsIGp1c3QgY3JlYXRlIHNvbWUgbm9pc2VcbiAgICAgICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH1cbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLnRhcmdldC5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgbXVzdCBoYXZlICd0YXJnZXQnIHNldFwiKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyB3YWl0IHVudGlsIHRoZSBzY2VuZSBsb2FkcyB0byBmaW5pc2guICBXZSB3YW50IHRvIG1ha2Ugc3VyZSBldmVyeXRoaW5nXG4gICAgICAgIC8vIGlzIGluaXRpYWxpemVkXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoKSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplKClcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICBcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCB2ID0gdGhpcy5lbC5zY2VuZUVsPy5vYmplY3QzRC5nZXRPYmplY3RCeU5hbWUodGhpcy5kYXRhLnRhcmdldCkgYXMgQU9iamVjdDNEXG4gICAgICAgIGlmICh2ID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgdGFyZ2V0ICdcIiArIHRoaXMuZGF0YS50YXJnZXQgKyBcIicgZG9lcyBub3QgZXhpc3RcIilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCB2LmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0gfHwgdi5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0gKSB7XG4gICAgICAgICAgICBpZiAodi5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICAgICAgbGV0IGZuID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwVmlkZW9QYWQodilcbiAgICAgICAgICAgICAgICAgICAgdi5lbC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCBmbilcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHYuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCBmbilcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cFZpZGVvUGFkKHYpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCB0YXJnZXQgJ1wiICsgdGhpcy5kYXRhLnRhcmdldCArIFwiJyBpcyBub3QgYSB2aWRlbyBlbGVtZW50XCIpXG4gICAgICAgIH1cblxuICAgIH0sXG5cbiAgICBzZXR1cFZpZGVvUGFkOiBmdW5jdGlvbiAodmlkZW86IEFPYmplY3QzRCkge1xuICAgICAgICB0aGlzLm1lZGlhVmlkZW8gPSB2aWRlby5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl1cbiAgICAgICAgaWYgKHRoaXMubWVkaWFWaWRlbyA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIHRhcmdldCAnXCIgKyB0aGlzLmRhdGEudGFyZ2V0ICsgXCInIGlzIG5vdCBhIHZpZGVvIGVsZW1lbnRcIilcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIC8vQHRzLWlnbm9yZVxuICAgICAgICAvLyBpZiAoIXRoaXMubWVkaWFWaWRlby52aWRlby5wYXVzZWQpIHtcbiAgICAgICAgLy8gICAgIC8vQHRzLWlnbm9yZVxuICAgICAgICAvLyAgICAgdGhpcy5tZWRpYVZpZGVvLnRvZ2dsZVBsYXlpbmcoKVxuICAgICAgICAvLyB9XG5cbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3Byb3hpbWl0eS1ldmVudHMnLCB7IHJhZGl1czogdGhpcy5kYXRhLnJhZGl1cywgWW9mZnNldDogMS42IH0pXG4gICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5ZW50ZXInLCAoKSA9PiB0aGlzLmVudGVyUmVnaW9uKCkpXG4gICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5bGVhdmUnLCAoKSA9PiB0aGlzLmxlYXZlUmVnaW9uKCkpXG4gICAgfSxcblxuICAgIGVudGVyUmVnaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLm1lZGlhVmlkZW8uZGF0YS52aWRlb1BhdXNlZCkge1xuICAgICAgICAgICAgLy9AdHMtaWdub3JlXG4gICAgICAgICAgICB0aGlzLm1lZGlhVmlkZW8udG9nZ2xlUGxheWluZygpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgbGVhdmVSZWdpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLm1lZGlhVmlkZW8uZGF0YS52aWRlb1BhdXNlZCkge1xuICAgICAgICAgICAgLy9AdHMtaWdub3JlXG4gICAgICAgICAgICB0aGlzLm1lZGlhVmlkZW8udG9nZ2xlUGxheWluZygpXG4gICAgICAgIH1cbiAgICB9LFxufSlcbiIsImNvbnN0IHRlbXBWZWN0b3IzID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbmNvbnN0IHRlbXBRdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldExhc3RXb3JsZFBvc2l0aW9uKHNyYywgdGFyZ2V0KSB7XG4gIHNyYy51cGRhdGVNYXRyaWNlcygpO1xuICB0YXJnZXQuc2V0RnJvbU1hdHJpeFBvc2l0aW9uKHNyYy5tYXRyaXhXb3JsZCk7XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXN0V29ybGRRdWF0ZXJuaW9uKHNyYywgdGFyZ2V0KSB7XG4gIHNyYy51cGRhdGVNYXRyaWNlcygpO1xuICBzcmMubWF0cml4V29ybGQuZGVjb21wb3NlKHRlbXBWZWN0b3IzLCB0YXJnZXQsIHRlbXBWZWN0b3IzKTtcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExhc3RXb3JsZFNjYWxlKHNyYywgdGFyZ2V0KSB7XG4gIHNyYy51cGRhdGVNYXRyaWNlcygpO1xuICBzcmMubWF0cml4V29ybGQuZGVjb21wb3NlKHRlbXBWZWN0b3IzLCB0ZW1wUXVhdGVybmlvbiwgdGFyZ2V0KTtcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2VNYXRlcmlhbChtdHJsKSB7XG4gIGlmIChtdHJsLm1hcCkgbXRybC5tYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5saWdodE1hcCkgbXRybC5saWdodE1hcC5kaXNwb3NlKCk7XG4gIGlmIChtdHJsLmJ1bXBNYXApIG10cmwuYnVtcE1hcC5kaXNwb3NlKCk7XG4gIGlmIChtdHJsLm5vcm1hbE1hcCkgbXRybC5ub3JtYWxNYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5zcGVjdWxhck1hcCkgbXRybC5zcGVjdWxhck1hcC5kaXNwb3NlKCk7XG4gIGlmIChtdHJsLmVudk1hcCkgbXRybC5lbnZNYXAuZGlzcG9zZSgpO1xuICBtdHJsLmRpc3Bvc2UoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2VOb2RlKG5vZGUpIHtcbiAgaWYgKCEobm9kZSBpbnN0YW5jZW9mIFRIUkVFLk1lc2gpKSByZXR1cm47XG5cbiAgaWYgKG5vZGUuZ2VvbWV0cnkpIHtcbiAgICBub2RlLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgfVxuXG4gIGlmIChub2RlLm1hdGVyaWFsKSB7XG4gICAgbGV0IG1hdGVyaWFsQXJyYXk7XG4gICAgaWYgKG5vZGUubWF0ZXJpYWwgaW5zdGFuY2VvZiBUSFJFRS5NZXNoRmFjZU1hdGVyaWFsIHx8IG5vZGUubWF0ZXJpYWwgaW5zdGFuY2VvZiBUSFJFRS5NdWx0aU1hdGVyaWFsKSB7XG4gICAgICBtYXRlcmlhbEFycmF5ID0gbm9kZS5tYXRlcmlhbC5tYXRlcmlhbHM7XG4gICAgfSBlbHNlIGlmIChub2RlLm1hdGVyaWFsIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIG1hdGVyaWFsQXJyYXkgPSBub2RlLm1hdGVyaWFsO1xuICAgIH1cbiAgICBpZiAobWF0ZXJpYWxBcnJheSkge1xuICAgICAgbWF0ZXJpYWxBcnJheS5mb3JFYWNoKGRpc3Bvc2VNYXRlcmlhbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpc3Bvc2VNYXRlcmlhbChub2RlLm1hdGVyaWFsKTtcbiAgICB9XG4gIH1cbn1cblxuY29uc3QgSURFTlRJVFkgPSBuZXcgVEhSRUUuTWF0cml4NCgpLmlkZW50aXR5KCk7XG5leHBvcnQgZnVuY3Rpb24gc2V0TWF0cml4V29ybGQob2JqZWN0M0QsIG0pIHtcbiAgaWYgKCFvYmplY3QzRC5tYXRyaXhJc01vZGlmaWVkKSB7XG4gICAgb2JqZWN0M0QuYXBwbHlNYXRyaXgoSURFTlRJVFkpOyAvLyBoYWNrIGFyb3VuZCBvdXIgbWF0cml4IG9wdGltaXphdGlvbnNcbiAgfVxuICBvYmplY3QzRC5tYXRyaXhXb3JsZC5jb3B5KG0pO1xuICBpZiAob2JqZWN0M0QucGFyZW50KSB7XG4gICAgb2JqZWN0M0QucGFyZW50LnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgb2JqZWN0M0QubWF0cml4ID0gb2JqZWN0M0QubWF0cml4LmdldEludmVyc2Uob2JqZWN0M0QucGFyZW50Lm1hdHJpeFdvcmxkKS5tdWx0aXBseShvYmplY3QzRC5tYXRyaXhXb3JsZCk7XG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0M0QubWF0cml4LmNvcHkob2JqZWN0M0QubWF0cml4V29ybGQpO1xuICB9XG4gIG9iamVjdDNELm1hdHJpeC5kZWNvbXBvc2Uob2JqZWN0M0QucG9zaXRpb24sIG9iamVjdDNELnF1YXRlcm5pb24sIG9iamVjdDNELnNjYWxlKTtcbiAgb2JqZWN0M0QuY2hpbGRyZW5OZWVkTWF0cml4V29ybGRVcGRhdGUgPSB0cnVlO1xufVxuXG4vLyBNb2RpZmllZCB2ZXJzaW9uIG9mIERvbiBNY0N1cmR5J3MgQW5pbWF0aW9uVXRpbHMuY2xvbmVcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9tcmRvb2IvdGhyZWUuanMvcHVsbC8xNDQ5NFxuXG5mdW5jdGlvbiBwYXJhbGxlbFRyYXZlcnNlKGEsIGIsIGNhbGxiYWNrKSB7XG4gIGNhbGxiYWNrKGEsIGIpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYS5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgIHBhcmFsbGVsVHJhdmVyc2UoYS5jaGlsZHJlbltpXSwgYi5jaGlsZHJlbltpXSwgY2FsbGJhY2spO1xuICB9XG59XG5cbi8vIFN1cHBvcnRzIHRoZSBmb2xsb3dpbmcgUHJvcGVydHlCaW5kaW5nIHBhdGggZm9ybWF0czpcbi8vIHV1aWQucHJvcGVydHlOYW1lXG4vLyB1dWlkLnByb3BlcnR5TmFtZVtwcm9wZXJ0eUluZGV4XVxuLy8gdXVpZC5vYmplY3ROYW1lW29iamVjdEluZGV4XS5wcm9wZXJ0eU5hbWVbcHJvcGVydHlJbmRleF1cbi8vIERvZXMgbm90IHN1cHBvcnQgcHJvcGVydHkgYmluZGluZ3MgdGhhdCB1c2Ugb2JqZWN0M0QgbmFtZXMgb3IgcGFyZW50IG5vZGVzXG5mdW5jdGlvbiBjbG9uZUtleWZyYW1lVHJhY2soc291cmNlS2V5ZnJhbWVUcmFjaywgY2xvbmVVVUlETG9va3VwKSB7XG4gIGNvbnN0IHsgbm9kZU5hbWU6IHV1aWQsIG9iamVjdE5hbWUsIG9iamVjdEluZGV4LCBwcm9wZXJ0eU5hbWUsIHByb3BlcnR5SW5kZXggfSA9IFRIUkVFLlByb3BlcnR5QmluZGluZy5wYXJzZVRyYWNrTmFtZShcbiAgICBzb3VyY2VLZXlmcmFtZVRyYWNrLm5hbWVcbiAgKTtcblxuICBsZXQgcGF0aCA9IFwiXCI7XG5cbiAgaWYgKHV1aWQgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IGNsb25lZFVVSUQgPSBjbG9uZVVVSURMb29rdXAuZ2V0KHV1aWQpO1xuXG4gICAgaWYgKGNsb25lZFVVSUQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc29sZS53YXJuKGBDb3VsZCBub3QgZmluZCBLZXlmcmFtZVRyYWNrIHRhcmdldCB3aXRoIHV1aWQ6IFwiJHt1dWlkfVwiYCk7XG4gICAgfVxuXG4gICAgcGF0aCArPSBjbG9uZWRVVUlEO1xuICB9XG5cbiAgaWYgKG9iamVjdE5hbWUgIT09IHVuZGVmaW5lZCkge1xuICAgIHBhdGggKz0gXCIuXCIgKyBvYmplY3ROYW1lO1xuICB9XG5cbiAgaWYgKG9iamVjdEluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICBwYXRoICs9IFwiW1wiICsgb2JqZWN0SW5kZXggKyBcIl1cIjtcbiAgfVxuXG4gIGlmIChwcm9wZXJ0eU5hbWUgIT09IHVuZGVmaW5lZCkge1xuICAgIHBhdGggKz0gXCIuXCIgKyBwcm9wZXJ0eU5hbWU7XG4gIH1cblxuICBpZiAocHJvcGVydHlJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcGF0aCArPSBcIltcIiArIHByb3BlcnR5SW5kZXggKyBcIl1cIjtcbiAgfVxuXG4gIGNvbnN0IGNsb25lZEtleWZyYW1lVHJhY2sgPSBzb3VyY2VLZXlmcmFtZVRyYWNrLmNsb25lKCk7XG4gIGNsb25lZEtleWZyYW1lVHJhY2submFtZSA9IHBhdGg7XG5cbiAgcmV0dXJuIGNsb25lZEtleWZyYW1lVHJhY2s7XG59XG5cbmZ1bmN0aW9uIGNsb25lQW5pbWF0aW9uQ2xpcChzb3VyY2VBbmltYXRpb25DbGlwLCBjbG9uZVVVSURMb29rdXApIHtcbiAgY29uc3QgY2xvbmVkVHJhY2tzID0gc291cmNlQW5pbWF0aW9uQ2xpcC50cmFja3MubWFwKGtleWZyYW1lVHJhY2sgPT5cbiAgICBjbG9uZUtleWZyYW1lVHJhY2soa2V5ZnJhbWVUcmFjaywgY2xvbmVVVUlETG9va3VwKVxuICApO1xuICByZXR1cm4gbmV3IFRIUkVFLkFuaW1hdGlvbkNsaXAoc291cmNlQW5pbWF0aW9uQ2xpcC5uYW1lLCBzb3VyY2VBbmltYXRpb25DbGlwLmR1cmF0aW9uLCBjbG9uZWRUcmFja3MpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVPYmplY3QzRChzb3VyY2UsIHByZXNlcnZlVVVJRHMpIHtcbiAgY29uc3QgY2xvbmVMb29rdXAgPSBuZXcgTWFwKCk7XG4gIGNvbnN0IGNsb25lVVVJRExvb2t1cCA9IG5ldyBNYXAoKTtcblxuICBjb25zdCBjbG9uZSA9IHNvdXJjZS5jbG9uZSgpO1xuXG4gIHBhcmFsbGVsVHJhdmVyc2Uoc291cmNlLCBjbG9uZSwgKHNvdXJjZU5vZGUsIGNsb25lZE5vZGUpID0+IHtcbiAgICBjbG9uZUxvb2t1cC5zZXQoc291cmNlTm9kZSwgY2xvbmVkTm9kZSk7XG4gIH0pO1xuXG4gIHNvdXJjZS50cmF2ZXJzZShzb3VyY2VOb2RlID0+IHtcbiAgICBjb25zdCBjbG9uZWROb2RlID0gY2xvbmVMb29rdXAuZ2V0KHNvdXJjZU5vZGUpO1xuXG4gICAgaWYgKHByZXNlcnZlVVVJRHMpIHtcbiAgICAgIGNsb25lZE5vZGUudXVpZCA9IHNvdXJjZU5vZGUudXVpZDtcbiAgICB9XG5cbiAgICBjbG9uZVVVSURMb29rdXAuc2V0KHNvdXJjZU5vZGUudXVpZCwgY2xvbmVkTm9kZS51dWlkKTtcbiAgfSk7XG5cbiAgc291cmNlLnRyYXZlcnNlKHNvdXJjZU5vZGUgPT4ge1xuICAgIGNvbnN0IGNsb25lZE5vZGUgPSBjbG9uZUxvb2t1cC5nZXQoc291cmNlTm9kZSk7XG5cbiAgICBpZiAoIWNsb25lZE5vZGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoc291cmNlTm9kZS5hbmltYXRpb25zKSB7XG4gICAgICBjbG9uZWROb2RlLmFuaW1hdGlvbnMgPSBzb3VyY2VOb2RlLmFuaW1hdGlvbnMubWFwKGFuaW1hdGlvbkNsaXAgPT5cbiAgICAgICAgY2xvbmVBbmltYXRpb25DbGlwKGFuaW1hdGlvbkNsaXAsIGNsb25lVVVJRExvb2t1cClcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHNvdXJjZU5vZGUuaXNNZXNoICYmIHNvdXJjZU5vZGUuZ2VvbWV0cnkuYm91bmRzVHJlZSkge1xuICAgICAgY2xvbmVkTm9kZS5nZW9tZXRyeS5ib3VuZHNUcmVlID0gc291cmNlTm9kZS5nZW9tZXRyeS5ib3VuZHNUcmVlO1xuICAgIH1cblxuICAgIGlmICgoY2xvbmVkTm9kZS5pc0RpcmVjdGlvbmFsTGlnaHQgfHwgY2xvbmVkTm9kZS5pc1Nwb3RMaWdodCkgJiYgc291cmNlTm9kZS50YXJnZXQpIHtcbiAgICAgIGNsb25lZE5vZGUudGFyZ2V0ID0gY2xvbmVMb29rdXAuZ2V0KHNvdXJjZU5vZGUudGFyZ2V0KTtcbiAgICB9XG5cbiAgICBpZiAoIXNvdXJjZU5vZGUuaXNTa2lubmVkTWVzaCkgcmV0dXJuO1xuXG4gICAgY29uc3Qgc291cmNlQm9uZXMgPSBzb3VyY2VOb2RlLnNrZWxldG9uLmJvbmVzO1xuXG4gICAgY2xvbmVkTm9kZS5za2VsZXRvbiA9IHNvdXJjZU5vZGUuc2tlbGV0b24uY2xvbmUoKTtcblxuICAgIGNsb25lZE5vZGUuc2tlbGV0b24uYm9uZXMgPSBzb3VyY2VCb25lcy5tYXAoc291cmNlQm9uZSA9PiB7XG4gICAgICBpZiAoIWNsb25lTG9va3VwLmhhcyhzb3VyY2VCb25lKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSZXF1aXJlZCBib25lcyBhcmUgbm90IGRlc2NlbmRhbnRzIG9mIHRoZSBnaXZlbiBvYmplY3QuXCIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY2xvbmVMb29rdXAuZ2V0KHNvdXJjZUJvbmUpO1xuICAgIH0pO1xuXG4gICAgY2xvbmVkTm9kZS5iaW5kKGNsb25lZE5vZGUuc2tlbGV0b24sIHNvdXJjZU5vZGUuYmluZE1hdHJpeCk7XG4gIH0pO1xuXG4gIHJldHVybiBjbG9uZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmROb2RlKHJvb3QsIHByZWQpIHtcbiAgbGV0IG5vZGVzID0gW3Jvb3RdO1xuICB3aGlsZSAobm9kZXMubGVuZ3RoKSB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzLnNoaWZ0KCk7XG4gICAgaWYgKHByZWQobm9kZSkpIHJldHVybiBub2RlO1xuICAgIGlmIChub2RlLmNoaWxkcmVuKSBub2RlcyA9IG5vZGVzLmNvbmNhdChub2RlLmNoaWxkcmVuKTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGludGVycG9sYXRlQWZmaW5lID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBtYXQ0ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgZW5kID0ge1xuICAgIHBvc2l0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygpLFxuICAgIHF1YXRlcm5pb246IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCksXG4gICAgc2NhbGU6IG5ldyBUSFJFRS5WZWN0b3IzKClcbiAgfTtcbiAgY29uc3Qgc3RhcnQgPSB7XG4gICAgcG9zaXRpb246IG5ldyBUSFJFRS5WZWN0b3IzKCksXG4gICAgcXVhdGVybmlvbjogbmV3IFRIUkVFLlF1YXRlcm5pb24oKSxcbiAgICBzY2FsZTogbmV3IFRIUkVFLlZlY3RvcjMoKVxuICB9O1xuICBjb25zdCBpbnRlcnBvbGF0ZWQgPSB7XG4gICAgcG9zaXRpb246IG5ldyBUSFJFRS5WZWN0b3IzKCksXG4gICAgcXVhdGVybmlvbjogbmV3IFRIUkVFLlF1YXRlcm5pb24oKSxcbiAgICBzY2FsZTogbmV3IFRIUkVFLlZlY3RvcjMoKVxuICB9O1xuICByZXR1cm4gZnVuY3Rpb24oc3RhcnRNYXQ0LCBlbmRNYXQ0LCBwcm9ncmVzcywgb3V0TWF0NCkge1xuICAgIHN0YXJ0LnF1YXRlcm5pb24uc2V0RnJvbVJvdGF0aW9uTWF0cml4KG1hdDQuZXh0cmFjdFJvdGF0aW9uKHN0YXJ0TWF0NCkpO1xuICAgIGVuZC5xdWF0ZXJuaW9uLnNldEZyb21Sb3RhdGlvbk1hdHJpeChtYXQ0LmV4dHJhY3RSb3RhdGlvbihlbmRNYXQ0KSk7XG4gICAgVEhSRUUuUXVhdGVybmlvbi5zbGVycChzdGFydC5xdWF0ZXJuaW9uLCBlbmQucXVhdGVybmlvbiwgaW50ZXJwb2xhdGVkLnF1YXRlcm5pb24sIHByb2dyZXNzKTtcbiAgICBpbnRlcnBvbGF0ZWQucG9zaXRpb24ubGVycFZlY3RvcnMoXG4gICAgICBzdGFydC5wb3NpdGlvbi5zZXRGcm9tTWF0cml4Q29sdW1uKHN0YXJ0TWF0NCwgMyksXG4gICAgICBlbmQucG9zaXRpb24uc2V0RnJvbU1hdHJpeENvbHVtbihlbmRNYXQ0LCAzKSxcbiAgICAgIHByb2dyZXNzXG4gICAgKTtcbiAgICBpbnRlcnBvbGF0ZWQuc2NhbGUubGVycFZlY3RvcnMoXG4gICAgICBzdGFydC5zY2FsZS5zZXRGcm9tTWF0cml4U2NhbGUoc3RhcnRNYXQ0KSxcbiAgICAgIGVuZC5zY2FsZS5zZXRGcm9tTWF0cml4U2NhbGUoZW5kTWF0NCksXG4gICAgICBwcm9ncmVzc1xuICAgICk7XG4gICAgcmV0dXJuIG91dE1hdDQuY29tcG9zZShcbiAgICAgIGludGVycG9sYXRlZC5wb3NpdGlvbixcbiAgICAgIGludGVycG9sYXRlZC5xdWF0ZXJuaW9uLFxuICAgICAgaW50ZXJwb2xhdGVkLnNjYWxlXG4gICAgKTtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBjb25zdCBzcXVhcmVEaXN0YW5jZUJldHdlZW4gPSAoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IHBvc0EgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCBwb3NCID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgcmV0dXJuIGZ1bmN0aW9uKG9iakEsIG9iakIpIHtcbiAgICBvYmpBLnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgb2JqQi51cGRhdGVNYXRyaWNlcygpO1xuICAgIHBvc0Euc2V0RnJvbU1hdHJpeENvbHVtbihvYmpBLm1hdHJpeFdvcmxkLCAzKTtcbiAgICBwb3NCLnNldEZyb21NYXRyaXhDb2x1bW4ob2JqQi5tYXRyaXhXb3JsZCwgMyk7XG4gICAgcmV0dXJuIHBvc0EuZGlzdGFuY2VUb1NxdWFyZWQocG9zQik7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNBbG1vc3RVbmlmb3JtVmVjdG9yMyh2LCBlcHNpbG9uSGFsZiA9IDAuMDA1KSB7XG4gIHJldHVybiBNYXRoLmFicyh2LnggLSB2LnkpIDwgZXBzaWxvbkhhbGYgJiYgTWF0aC5hYnModi54IC0gdi56KSA8IGVwc2lsb25IYWxmO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGFsbW9zdEVxdWFsKGEsIGIsIGVwc2lsb24gPSAwLjAxKSB7XG4gIHJldHVybiBNYXRoLmFicyhhIC0gYikgPCBlcHNpbG9uO1xufVxuXG5leHBvcnQgY29uc3QgYWZmaXhUb1dvcmxkVXAgPSAoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IGluUm90YXRpb25NYXQ0ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgaW5Gb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgY29uc3Qgb3V0Rm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IG91dFNpZGUgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCB3b3JsZFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoKTsgLy8gQ291bGQgYmUgY2FsbGVkIFwib3V0VXBcIlxuICBjb25zdCB2ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgY29uc3QgaW5NYXQ0Q29weSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIHJldHVybiBmdW5jdGlvbiBhZmZpeFRvV29ybGRVcChpbk1hdDQsIG91dE1hdDQpIHtcbiAgICBpblJvdGF0aW9uTWF0NC5pZGVudGl0eSgpLmV4dHJhY3RSb3RhdGlvbihpbk1hdDRDb3B5LmNvcHkoaW5NYXQ0KSk7XG4gICAgaW5Gb3J3YXJkLnNldEZyb21NYXRyaXhDb2x1bW4oaW5Sb3RhdGlvbk1hdDQsIDIpLm11bHRpcGx5U2NhbGFyKC0xKTtcbiAgICBvdXRGb3J3YXJkXG4gICAgICAuY29weShpbkZvcndhcmQpXG4gICAgICAuc3ViKHYuY29weShpbkZvcndhcmQpLnByb2plY3RPblZlY3Rvcih3b3JsZFVwLnNldCgwLCAxLCAwKSkpXG4gICAgICAubm9ybWFsaXplKCk7XG4gICAgb3V0U2lkZS5jcm9zc1ZlY3RvcnMob3V0Rm9yd2FyZCwgd29ybGRVcCk7XG4gICAgb3V0TWF0NC5tYWtlQmFzaXMob3V0U2lkZSwgd29ybGRVcCwgb3V0Rm9yd2FyZC5tdWx0aXBseVNjYWxhcigtMSkpO1xuICAgIG91dE1hdDQuc2NhbGUodi5zZXRGcm9tTWF0cml4U2NhbGUoaW5NYXQ0Q29weSkpO1xuICAgIG91dE1hdDQuc2V0UG9zaXRpb24odi5zZXRGcm9tTWF0cml4Q29sdW1uKGluTWF0NENvcHksIDMpKTtcbiAgICByZXR1cm4gb3V0TWF0NDtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBjb25zdCBjYWxjdWxhdGVDYW1lcmFUcmFuc2Zvcm1Gb3JXYXlwb2ludCA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgdXBBZmZpeGVkQ2FtZXJhVHJhbnNmb3JtID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgdXBBZmZpeGVkV2F5cG9pbnRUcmFuc2Zvcm0gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBkZXRhY2hGcm9tV29ybGRVcCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIHJldHVybiBmdW5jdGlvbiBjYWxjdWxhdGVDYW1lcmFUcmFuc2Zvcm1Gb3JXYXlwb2ludChjYW1lcmFUcmFuc2Zvcm0sIHdheXBvaW50VHJhbnNmb3JtLCBvdXRNYXQ0KSB7XG4gICAgYWZmaXhUb1dvcmxkVXAoY2FtZXJhVHJhbnNmb3JtLCB1cEFmZml4ZWRDYW1lcmFUcmFuc2Zvcm0pO1xuICAgIGRldGFjaEZyb21Xb3JsZFVwLmdldEludmVyc2UodXBBZmZpeGVkQ2FtZXJhVHJhbnNmb3JtKS5tdWx0aXBseShjYW1lcmFUcmFuc2Zvcm0pO1xuICAgIGFmZml4VG9Xb3JsZFVwKHdheXBvaW50VHJhbnNmb3JtLCB1cEFmZml4ZWRXYXlwb2ludFRyYW5zZm9ybSk7XG4gICAgb3V0TWF0NC5jb3B5KHVwQWZmaXhlZFdheXBvaW50VHJhbnNmb3JtKS5tdWx0aXBseShkZXRhY2hGcm9tV29ybGRVcCk7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3QgY2FsY3VsYXRlVmlld2luZ0Rpc3RhbmNlID0gKGZ1bmN0aW9uKCkge1xuICByZXR1cm4gZnVuY3Rpb24gY2FsY3VsYXRlVmlld2luZ0Rpc3RhbmNlKGZvdiwgYXNwZWN0LCBib3gsIGNlbnRlciwgdnJNb2RlKSB7XG4gICAgY29uc3QgaGFsZllFeHRlbnRzID0gTWF0aC5tYXgoTWF0aC5hYnMoYm94Lm1heC55IC0gY2VudGVyLnkpLCBNYXRoLmFicyhjZW50ZXIueSAtIGJveC5taW4ueSkpO1xuICAgIGNvbnN0IGhhbGZYRXh0ZW50cyA9IE1hdGgubWF4KE1hdGguYWJzKGJveC5tYXgueCAtIGNlbnRlci54KSwgTWF0aC5hYnMoY2VudGVyLnggLSBib3gubWluLngpKTtcbiAgICBjb25zdCBoYWxmVmVydEZPViA9IFRIUkVFLk1hdGguZGVnVG9SYWQoZm92IC8gMik7XG4gICAgY29uc3QgaGFsZkhvckZPViA9IE1hdGguYXRhbihNYXRoLnRhbihoYWxmVmVydEZPVikgKiBhc3BlY3QpICogKHZyTW9kZSA/IDAuNSA6IDEpO1xuICAgIGNvbnN0IG1hcmdpbiA9IDEuMDU7XG4gICAgY29uc3QgbGVuZ3RoMSA9IE1hdGguYWJzKChoYWxmWUV4dGVudHMgKiBtYXJnaW4pIC8gTWF0aC50YW4oaGFsZlZlcnRGT1YpKTtcbiAgICBjb25zdCBsZW5ndGgyID0gTWF0aC5hYnMoKGhhbGZYRXh0ZW50cyAqIG1hcmdpbikgLyBNYXRoLnRhbihoYWxmSG9yRk9WKSk7XG4gICAgY29uc3QgbGVuZ3RoMyA9IE1hdGguYWJzKGJveC5tYXgueiAtIGNlbnRlci56KSArIE1hdGgubWF4KGxlbmd0aDEsIGxlbmd0aDIpO1xuICAgIGNvbnN0IGxlbmd0aCA9IHZyTW9kZSA/IE1hdGgubWF4KDAuMjUsIGxlbmd0aDMpIDogbGVuZ3RoMztcbiAgICByZXR1cm4gbGVuZ3RoIHx8IDEuMjU7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3Qgcm90YXRlSW5QbGFjZUFyb3VuZFdvcmxkVXAgPSAoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IGluTWF0NENvcHkgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBzdGFydFJvdGF0aW9uID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgZW5kUm90YXRpb24gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCB2ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgcmV0dXJuIGZ1bmN0aW9uIHJvdGF0ZUluUGxhY2VBcm91bmRXb3JsZFVwKGluTWF0NCwgdGhldGEsIG91dE1hdDQpIHtcbiAgICBpbk1hdDRDb3B5LmNvcHkoaW5NYXQ0KTtcbiAgICByZXR1cm4gb3V0TWF0NFxuICAgICAgLmNvcHkoZW5kUm90YXRpb24ubWFrZVJvdGF0aW9uWSh0aGV0YSkubXVsdGlwbHkoc3RhcnRSb3RhdGlvbi5leHRyYWN0Um90YXRpb24oaW5NYXQ0Q29weSkpKVxuICAgICAgLnNjYWxlKHYuc2V0RnJvbU1hdHJpeFNjYWxlKGluTWF0NENvcHkpKVxuICAgICAgLnNldFBvc2l0aW9uKHYuc2V0RnJvbU1hdHJpeFBvc2l0aW9uKGluTWF0NENvcHkpKTtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBjb25zdCBjaGlsZE1hdGNoID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBpbnZlcnNlUGFyZW50V29ybGQgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBjaGlsZFJlbGF0aXZlVG9QYXJlbnQgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBjaGlsZEludmVyc2UgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBuZXdQYXJlbnRNYXRyaXggPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICAvLyB0cmFuc2Zvcm0gdGhlIHBhcmVudCBzdWNoIHRoYXQgaXRzIGNoaWxkIG1hdGNoZXMgdGhlIHRhcmdldFxuICByZXR1cm4gZnVuY3Rpb24gY2hpbGRNYXRjaChwYXJlbnQsIGNoaWxkLCB0YXJnZXQpIHtcbiAgICBwYXJlbnQudXBkYXRlTWF0cmljZXMoKTtcbiAgICBpbnZlcnNlUGFyZW50V29ybGQuZ2V0SW52ZXJzZShwYXJlbnQubWF0cml4V29ybGQpO1xuICAgIGNoaWxkLnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgY2hpbGRSZWxhdGl2ZVRvUGFyZW50Lm11bHRpcGx5TWF0cmljZXMoaW52ZXJzZVBhcmVudFdvcmxkLCBjaGlsZC5tYXRyaXhXb3JsZCk7XG4gICAgY2hpbGRJbnZlcnNlLmdldEludmVyc2UoY2hpbGRSZWxhdGl2ZVRvUGFyZW50KTtcbiAgICBuZXdQYXJlbnRNYXRyaXgubXVsdGlwbHlNYXRyaWNlcyh0YXJnZXQsIGNoaWxkSW52ZXJzZSk7XG4gICAgc2V0TWF0cml4V29ybGQocGFyZW50LCBuZXdQYXJlbnRNYXRyaXgpO1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHRyYXZlcnNlQW5pbWF0aW9uVGFyZ2V0cyhyb290T2JqZWN0LCBhbmltYXRpb25zLCBjYWxsYmFjaykge1xuICBpZiAoYW5pbWF0aW9ucyAmJiBhbmltYXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICBmb3IgKGNvbnN0IGFuaW1hdGlvbiBvZiBhbmltYXRpb25zKSB7XG4gICAgICBmb3IgKGNvbnN0IHRyYWNrIG9mIGFuaW1hdGlvbi50cmFja3MpIHtcbiAgICAgICAgY29uc3QgeyBub2RlTmFtZSB9ID0gVEhSRUUuUHJvcGVydHlCaW5kaW5nLnBhcnNlVHJhY2tOYW1lKHRyYWNrLm5hbWUpO1xuICAgICAgICBsZXQgYW5pbWF0ZWROb2RlID0gcm9vdE9iamVjdC5nZXRPYmplY3RCeVByb3BlcnR5KFwidXVpZFwiLCBub2RlTmFtZSk7XG5cbiAgICAgICAgaWYgKCFhbmltYXRlZE5vZGUpIHtcbiAgICAgICAgICBhbmltYXRlZE5vZGUgPSByb290T2JqZWN0LmdldE9iamVjdEJ5TmFtZShub2RlTmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYW5pbWF0ZWROb2RlKSB7XG4gICAgICAgICAgY2FsbGJhY2soYW5pbWF0ZWROb2RlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHtcbiAgICBzZXRNYXRyaXhXb3JsZFxufSBmcm9tIFwiLi4vdXRpbHMvdGhyZWUtdXRpbHNcIjtcbmltcG9ydCB7XG4gICAgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudFxufSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcblxuY29uc3QgY2FsY3VsYXRlUGxhbmVNYXRyaXggPSAoZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHBsYW5lTWF0cml4ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgICBjb25zdCBwbGFuZVVwID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICBjb25zdCBwbGFuZUZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgIGNvbnN0IHBsYW5lUmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgIGNvbnN0IHBsYW5lUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgIGNvbnN0IGNhbVBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcblxuICAgIHJldHVybiBmdW5jdGlvbiBjYWxjdWxhdGVQbGFuZU1hdHJpeChjYW1lcmEsIGJ1dHRvbikge1xuICAgICAgICBjYW1lcmEudXBkYXRlTWF0cmljZXMoKTtcbiAgICAgICAgY2FtUG9zaXRpb24uc2V0RnJvbU1hdHJpeFBvc2l0aW9uKGNhbWVyYS5tYXRyaXhXb3JsZCk7XG4gICAgICAgIGJ1dHRvbi51cGRhdGVNYXRyaWNlcygpO1xuICAgICAgICBwbGFuZVBvc2l0aW9uLnNldEZyb21NYXRyaXhQb3NpdGlvbihidXR0b24ubWF0cml4V29ybGQpO1xuICAgICAgICBwbGFuZUZvcndhcmQuc3ViVmVjdG9ycyhwbGFuZVBvc2l0aW9uLCBjYW1Qb3NpdGlvbik7XG4gICAgICAgIHBsYW5lRm9yd2FyZC55ID0gMDtcbiAgICAgICAgcGxhbmVGb3J3YXJkLm5vcm1hbGl6ZSgpO1xuICAgICAgICBwbGFuZVVwLnNldCgwLCAxLCAwKTtcbiAgICAgICAgcGxhbmVSaWdodC5jcm9zc1ZlY3RvcnMocGxhbmVGb3J3YXJkLCBwbGFuZVVwKTtcbiAgICAgICAgcGxhbmVNYXRyaXgubWFrZUJhc2lzKHBsYW5lUmlnaHQsIHBsYW5lVXAsIHBsYW5lRm9yd2FyZC5tdWx0aXBseVNjYWxhcigtMSkpO1xuICAgICAgICBwbGFuZU1hdHJpeC5lbGVtZW50c1sxMl0gPSBwbGFuZVBvc2l0aW9uLng7XG4gICAgICAgIHBsYW5lTWF0cml4LmVsZW1lbnRzWzEzXSA9IHBsYW5lUG9zaXRpb24ueTtcbiAgICAgICAgcGxhbmVNYXRyaXguZWxlbWVudHNbMTRdID0gcGxhbmVQb3NpdGlvbi56O1xuICAgICAgICByZXR1cm4gcGxhbmVNYXRyaXg7XG4gICAgfTtcbn0pKCk7XG5cbmNvbnN0IHBsYW5lRm9yTGVmdEN1cnNvciA9IG5ldyBUSFJFRS5NZXNoKFxuICAgIG5ldyBUSFJFRS5QbGFuZUJ1ZmZlckdlb21ldHJ5KDEwMDAwMCwgMTAwMDAwLCAyLCAyKSxcbiAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICB3aXJlZnJhbWU6IGZhbHNlLFxuICAgICAgICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICAgICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgICAgb3BhY2l0eTogMC4zXG4gICAgfSlcbik7XG5jb25zdCBwbGFuZUZvclJpZ2h0Q3Vyc29yID0gbmV3IFRIUkVFLk1lc2goXG4gICAgbmV3IFRIUkVFLlBsYW5lQnVmZmVyR2VvbWV0cnkoMTAwMDAwLCAxMDAwMDAsIDIsIDIpLFxuICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgIHdpcmVmcmFtZTogZmFsc2UsXG4gICAgICAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBvcGFjaXR5OiAwLjNcbiAgICB9KVxuKTtcblxuZXhwb3J0IGNsYXNzIEhhbmRsZUludGVyYWN0aW9uIHtcbiAgICBjb25zdHJ1Y3RvcihlbCkge1xuICAgICAgICB0aGlzLmVsID0gZWw7XG5cbiAgICAgICAgdGhpcy5pc0RyYWdnaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZHJhZ0ludGVyYWN0b3IgPSBudWxsO1xuICAgICAgICB0aGlzLnBsYW5lUm90YXRpb24gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICAgICAgICB0aGlzLnBsYW5lVXAgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICB0aGlzLnBsYW5lUmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICB0aGlzLmludGVyc2VjdGlvbnMgPSBbXTtcbiAgICAgICAgdGhpcy5pbml0aWFsSW50ZXJzZWN0aW9uUG9pbnQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICB0aGlzLmludGVyc2VjdGlvblBvaW50ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5kZWx0YSA9IHtcbiAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICB5OiAwXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub2JqZWN0TWF0cml4ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgICAgICAgdGhpcy5kcmFnVmVjdG9yID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcblxuICAgICAgICB0aGlzLmNhbVBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5vYmplY3RQb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMub2JqZWN0VG9DYW0gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgIH1cblxuICAgIGdldEludGVyYWN0b3JzKG9iaikge1xuICAgICAgICBsZXQgdG9nZ2xpbmcgPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtc1tcImh1YnMtc3lzdGVtc1wiXS5jdXJzb3JUb2dnbGluZ1N5c3RlbTtcblxuICAgICAgICAvLyBtb3JlIG9yIGxlc3MgY29waWVkIGZyb20gXCJob3ZlcmFibGUtdmlzdWFscy5qc1wiIGluIGh1YnNcbiAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcbiAgICAgICAgdmFyIHBhc3N0aHJ1SW50ZXJhY3RvciA9IFtdXG5cbiAgICAgICAgbGV0IGludGVyYWN0b3JPbmUsIGludGVyYWN0b3JUd287XG4gICAgICAgIGlmICghaW50ZXJhY3Rpb24ucmVhZHkpIHJldHVybjsgLy9ET01Db250ZW50UmVhZHkgd29ya2Fyb3VuZFxuXG4gICAgICAgIC8vIFRPRE86ICBtYXkgd2FudCB0byBsb29rIHRvIHNlZSB0aGUgaG92ZXJlZCBvYmplY3RzIGFyZSBjaGlsZHJlbiBvZiBvYmo/P1xuICAgICAgICBsZXQgaG92ZXJFbCA9IG9ialxuICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IHtcbiAgICAgICAgICAgICAgICBjdXJzb3I6IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdEhhbmQuZW50aXR5Lm9iamVjdDNELFxuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6IGludGVyYWN0aW9uLmxlZnRDdXJzb3JDb250cm9sbGVyRWwuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAhdG9nZ2xpbmcubGVmdFRvZ2dsZWRPZmZcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBpbnRlcmFjdG9yT25lID0ge1xuICAgICAgICAgICAgICAgIGN1cnNvcjogaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0UmVtb3RlLmVudGl0eS5vYmplY3QzRCxcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiBpbnRlcmFjdGlvbi5sZWZ0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXVxuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGludGVyYWN0b3JPbmUpIHtcbiAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKGludGVyYWN0b3JPbmUpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICF0b2dnbGluZy5yaWdodFRvZ2dsZWRPZmZcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0ge1xuICAgICAgICAgICAgICAgIGN1cnNvcjogaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodFJlbW90ZS5lbnRpdHkub2JqZWN0M0QsXG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogaW50ZXJhY3Rpb24ucmlnaHRDdXJzb3JDb250cm9sbGVyRWwuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IHtcbiAgICAgICAgICAgICAgICBjdXJzb3I6IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRIYW5kLmVudGl0eS5vYmplY3QzRCxcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiBpbnRlcmFjdGlvbi5yaWdodEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoaW50ZXJhY3RvclR3bykge1xuICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2goaW50ZXJhY3RvclR3bylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcGFzc3RocnVJbnRlcmFjdG9yXG4gICAgfVxuXG4gICAgZ2V0UmVmcygpIHtcbiAgICAgICAgaWYgKCF0aGlzLmRpZEdldE9iamVjdFJlZmVyZW5jZXMpIHtcbiAgICAgICAgICAgIHRoaXMuZGlkR2V0T2JqZWN0UmVmZXJlbmNlcyA9IHRydWU7XG4gICAgICAgICAgICBjb25zdCBpbnRlcmFjdGlvbiA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLmludGVyYWN0aW9uO1xuXG4gICAgICAgICAgICAvLyB0aGlzLmxlZnRFdmVudGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsZWZ0LWN1cnNvclwiKS5vYmplY3QzRDtcbiAgICAgICAgICAgIC8vIHRoaXMubGVmdEN1cnNvckNvbnRyb2xsZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxlZnQtY3Vyc29yLWNvbnRyb2xsZXJcIik7XG4gICAgICAgICAgICAvLyB0aGlzLmxlZnRSYXljYXN0ZXIgPSB0aGlzLmxlZnRDdXJzb3JDb250cm9sbGVyLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXS5yYXljYXN0ZXI7XG4gICAgICAgICAgICAvLyB0aGlzLnJpZ2h0Q3Vyc29yQ29udHJvbGxlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmlnaHQtY3Vyc29yLWNvbnRyb2xsZXJcIik7XG4gICAgICAgICAgICAvLyB0aGlzLnJpZ2h0UmF5Y2FzdGVyID0gdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdLnJheWNhc3RlcjtcbiAgICAgICAgICAgIHRoaXMubGVmdEV2ZW50ZXIgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgdGhpcy5sZWZ0Q3Vyc29yQ29udHJvbGxlciA9IGludGVyYWN0aW9uLmxlZnRDdXJzb3JDb250cm9sbGVyRWwuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdO1xuICAgICAgICAgICAgdGhpcy5sZWZ0UmF5Y2FzdGVyID0gdGhpcy5sZWZ0Q3Vyc29yQ29udHJvbGxlci5yYXljYXN0ZXI7XG4gICAgICAgICAgICB0aGlzLnJpZ2h0Q3Vyc29yQ29udHJvbGxlciA9IGludGVyYWN0aW9uLnJpZ2h0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXTtcbiAgICAgICAgICAgIHRoaXMucmlnaHRSYXljYXN0ZXIgPSB0aGlzLnJpZ2h0Q3Vyc29yQ29udHJvbGxlci5yYXljYXN0ZXI7XG5cbiAgICAgICAgICAgIHRoaXMudmlld2luZ0NhbWVyYSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidmlld2luZy1jYW1lcmFcIikub2JqZWN0M0RNYXAuY2FtZXJhO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0SW50ZXJzZWN0aW9uKGludGVyYWN0b3IsIHRhcmdldHMpIHtcbiAgICAgICAgdGhpcy5nZXRSZWZzKCk7XG4gICAgICAgIGxldCBvYmplY3QzRCA9IGludGVyYWN0b3IuY3Vyc29yXG4gICAgICAgIGxldCByYXljYXN0ZXIgPSBvYmplY3QzRCA9PT0gdGhpcy5sZWZ0RXZlbnRlciA/IHRoaXMubGVmdFJheWNhc3RlciA6IHRoaXMucmlnaHRSYXljYXN0ZXI7XG5cbiAgICAgICAgbGV0IGludGVyc2VjdHMgPSByYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyh0YXJnZXRzLCB0cnVlKTtcbiAgICAgICAgaWYgKGludGVyc2VjdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGludGVyc2VjdHNbMF07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgc3RhcnREcmFnKGUpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNEcmFnZ2luZykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZ2V0UmVmcygpO1xuXG4gICAgICAgIHRoaXMucGxhbmUgPSBlLm9iamVjdDNEID09PSB0aGlzLmxlZnRFdmVudGVyID8gcGxhbmVGb3JMZWZ0Q3Vyc29yIDogcGxhbmVGb3JSaWdodEN1cnNvcjtcblxuICAgICAgICBzZXRNYXRyaXhXb3JsZCh0aGlzLnBsYW5lLCBjYWxjdWxhdGVQbGFuZU1hdHJpeCh0aGlzLnZpZXdpbmdDYW1lcmEsIHRoaXMuZWwub2JqZWN0M0QpKTtcbiAgICAgICAgdGhpcy5wbGFuZVJvdGF0aW9uLmV4dHJhY3RSb3RhdGlvbih0aGlzLnBsYW5lLm1hdHJpeFdvcmxkKTtcbiAgICAgICAgdGhpcy5wbGFuZVVwLnNldCgwLCAxLCAwKS5hcHBseU1hdHJpeDQodGhpcy5wbGFuZVJvdGF0aW9uKTtcbiAgICAgICAgdGhpcy5wbGFuZVJpZ2h0LnNldCgxLCAwLCAwKS5hcHBseU1hdHJpeDQodGhpcy5wbGFuZVJvdGF0aW9uKTtcbiAgICAgICAgdGhpcy5yYXljYXN0ZXIgPSBlLm9iamVjdDNEID09PSB0aGlzLmxlZnRFdmVudGVyID8gdGhpcy5sZWZ0UmF5Y2FzdGVyIDogdGhpcy5yaWdodFJheWNhc3RlcjtcbiAgICAgICAgY29uc3QgaW50ZXJzZWN0aW9uID0gdGhpcy5yYXljYXN0T25QbGFuZSgpO1xuXG4gICAgICAgIC8vIHNob3VsZG4ndCBoYXBwZW4sIGJ1dCB3ZSBzaG91bGQgY2hlY2tcbiAgICAgICAgaWYgKCFpbnRlcnNlY3Rpb24pIHJldHVybiBmYWxzZTtcblxuICAgICAgICB0aGlzLmlzRHJhZ2dpbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLmRyYWdJbnRlcmFjdG9yID0ge1xuICAgICAgICAgICAgY3Vyc29yOiBlLm9iamVjdDNELFxuICAgICAgICAgICAgY29udHJvbGxlcjogZS5vYmplY3QzRCA9PT0gdGhpcy5sZWZ0RXZlbnRlciA/IHRoaXMubGVmdEN1cnNvckNvbnRyb2xsZXIgOiB0aGlzLnJpZ2h0Q3Vyc29yQ29udHJvbGxlcixcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW5pdGlhbEludGVyc2VjdGlvblBvaW50LmNvcHkoaW50ZXJzZWN0aW9uLnBvaW50KTtcbiAgICAgICAgdGhpcy5pbml0aWFsRGlzdGFuY2VUb09iamVjdCA9IHRoaXMub2JqZWN0VG9DYW1cbiAgICAgICAgICAgIC5zdWJWZWN0b3JzKFxuICAgICAgICAgICAgICAgIHRoaXMuY2FtUG9zaXRpb24uc2V0RnJvbU1hdHJpeFBvc2l0aW9uKHRoaXMudmlld2luZ0NhbWVyYS5tYXRyaXhXb3JsZCksXG4gICAgICAgICAgICAgICAgdGhpcy5vYmplY3RQb3NpdGlvbi5zZXRGcm9tTWF0cml4UG9zaXRpb24odGhpcy5lbC5vYmplY3QzRC5tYXRyaXhXb3JsZClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC5sZW5ndGgoKTtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25SaWdodCA9IDA7XG4gICAgICAgIHRoaXMuaW50ZXJzZWN0aW9uVXAgPSAwO1xuICAgICAgICB0aGlzLmRlbHRhID0ge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDBcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cblxuICAgIGVuZERyYWcoZSkge1xuICAgICAgICBpZiAoIXRoaXMuaXNEcmFnZ2luZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIChlLm9iamVjdDNEID09PSB0aGlzLmxlZnRFdmVudGVyICYmIHRoaXMucmF5Y2FzdGVyID09PSB0aGlzLmxlZnRSYXljYXN0ZXIpIHx8XG4gICAgICAgICAgICAoZS5vYmplY3QzRCAhPT0gdGhpcy5sZWZ0RXZlbnRlciAmJiB0aGlzLnJheWNhc3RlciA9PT0gdGhpcy5yaWdodFJheWNhc3RlcilcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmlzRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuZHJhZ0ludGVyYWN0b3IgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmF5Y2FzdE9uUGxhbmUoKSB7XG4gICAgICAgIHRoaXMuaW50ZXJzZWN0aW9ucy5sZW5ndGggPSAwO1xuICAgICAgICBjb25zdCBmYXIgPSB0aGlzLnJheWNhc3Rlci5mYXI7XG4gICAgICAgIHRoaXMucmF5Y2FzdGVyLmZhciA9IDEwMDA7XG4gICAgICAgIHRoaXMucGxhbmUucmF5Y2FzdCh0aGlzLnJheWNhc3RlciwgdGhpcy5pbnRlcnNlY3Rpb25zKTtcbiAgICAgICAgdGhpcy5yYXljYXN0ZXIuZmFyID0gZmFyO1xuICAgICAgICByZXR1cm4gdGhpcy5pbnRlcnNlY3Rpb25zWzBdO1xuICAgIH1cblxuICAgIGRyYWcoKSB7XG4gICAgICAgIGlmICghdGhpcy5pc0RyYWdnaW5nKSByZXR1cm4gbnVsbDtcbiAgICAgICAgY29uc3QgaW50ZXJzZWN0aW9uID0gdGhpcy5yYXljYXN0T25QbGFuZSgpO1xuICAgICAgICBpZiAoIWludGVyc2VjdGlvbikgcmV0dXJuIG51bGw7XG4gICAgICAgIHRoaXMuaW50ZXJzZWN0aW9uUG9pbnQuY29weShpbnRlcnNlY3Rpb24ucG9pbnQpO1xuICAgICAgICB0aGlzLmRyYWdWZWN0b3Iuc3ViVmVjdG9ycyh0aGlzLmludGVyc2VjdGlvblBvaW50LCB0aGlzLmluaXRpYWxJbnRlcnNlY3Rpb25Qb2ludCk7XG4gICAgICAgIHRoaXMuZGVsdGEueCA9IHRoaXMuZHJhZ1ZlY3Rvci5kb3QodGhpcy5wbGFuZVVwKTtcbiAgICAgICAgdGhpcy5kZWx0YS55ID0gdGhpcy5kcmFnVmVjdG9yLmRvdCh0aGlzLnBsYW5lUmlnaHQpO1xuICAgICAgICByZXR1cm4gdGhpcy5kcmFnVmVjdG9yO1xuICAgIH1cbn1cblxuXG4vLyB0ZW1wbGF0ZVxuXG5leHBvcnQgZnVuY3Rpb24gaW50ZXJhY3RpdmVDb21wb25lbnRUZW1wbGF0ZShjb21wb25lbnROYW1lKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RhcnRJbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICAgICAgICAgIHRoaXMucmVsYXRpdmVTaXplID0gMTtcbiAgICAgICAgICAgIHRoaXMuaXNEcmFnZ2FibGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuaXNJbnRlcmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc05ldHdvcmtlZCA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIGZpbmlzaEluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICAgICAgcm9vdCAmJiByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbnRlcm5hbEluaXQoKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVtb3ZlVGVtcGxhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IG51bGxcbiAgICBcbiAgICAgICAgICAgIGlmICh0aGlzLmlzTmV0d29ya2VkICYmIHRoaXMubmV0RW50aXR5LnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMubmV0RW50aXR5KVxuICAgICAgICAgICAgfSAgICBcbiAgICAgICAgfSxcblxuICAgICAgICBpbnRlcm5hbEluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIC8vIGVhY2ggdGltZSB3ZSBsb2FkIGEgY29tcG9uZW50IHdlIHdpbGwgcG9zc2libHkgY3JlYXRlXG4gICAgICAgICAgICAvLyBhIG5ldyBuZXR3b3JrZWQgY29tcG9uZW50LiAgVGhpcyBpcyBmaW5lLCBzaW5jZSB0aGUgbmV0d29ya2VkIElkIFxuICAgICAgICAgICAgLy8gaXMgYmFzZWQgb24gdGhlIG5hbWUgcGFzc2VkIGFzIGEgcGFyYW1ldGVyLCBvciBhc3NpZ25lZCB0byB0aGVcbiAgICAgICAgICAgIC8vIGNvbXBvbmVudCBpbiBTcG9rZS4gIEl0IGRvZXMgbWVhbiB0aGF0IGlmIHdlIGhhdmVcbiAgICAgICAgICAgIC8vIG11bHRpcGxlIG9iamVjdHMgaW4gdGhlIHNjZW5lIHdoaWNoIGhhdmUgdGhlIHNhbWUgbmFtZSwgdGhleSB3aWxsXG4gICAgICAgICAgICAvLyBiZSBpbiBzeW5jLiAgSXQgYWxzbyBtZWFucyB0aGF0IGlmIHlvdSB3YW50IHRvIGRyb3AgYSBjb21wb25lbnQgb25cbiAgICAgICAgICAgIC8vIHRoZSBzY2VuZSB2aWEgYSAuZ2xiLCBpdCBtdXN0IGhhdmUgYSB2YWxpZCBuYW1lIHBhcmFtZXRlciBpbnNpZGUgaXQuXG4gICAgICAgICAgICAvLyBBIC5nbGIgaW4gc3Bva2Ugd2lsbCBmYWxsIGJhY2sgdG8gdGhlIHNwb2tlIG5hbWUgaWYgeW91IHVzZSBvbmUgd2l0aG91dFxuICAgICAgICAgICAgLy8gYSBuYW1lIGluc2lkZSBpdC5cbiAgICAgICAgICAgIGxldCBsb2FkZXIgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gbGV0cyBsb2FkIHNvbWV0aGluZyBleHRlcm5hbGx5LCBsaWtlIGEganNvbiBjb25maWcgZmlsZVxuICAgICAgICAgICAgICAgIHRoaXMubG9hZERhdGEoKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGdldCB0aGUgcGFyZW50IG5ldHdvcmtlZCBlbnRpdHksIHdoZW4gaXQncyBmaW5pc2hlZCBpbml0aWFsaXppbmcuICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gY3JlYXRpbmcgdGhpcyBhcyBwYXJ0IG9mIGEgR0xURiBsb2FkLCB0aGUgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBwYXJlbnQgYSBmZXcgc3RlcHMgdXAgd2lsbCBiZSBuZXR3b3JrZWQuIFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBudWxsXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJpbmQgY2FsbGJhY2tzXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBzZXQgdXAgdGhlIGxvY2FsIGNvbnRlbnQgYW5kIGhvb2sgaXQgdG8gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZURhdGEoKVxuICAgICAgICAgICAgICAgICAgICAvLyBsZXRzIGZpZ3VyZSBvdXQgdGhlIHNjYWxlLCBieSBzY2FsaW5nIHRvIGZpbGwgdGhlIGEgMXgxbSBzcXVhcmUsIHRoYXQgaGFzIGFsc29cbiAgICAgICAgICAgICAgICAgICAgLy8gcG90ZW50aWFsbHkgYmVlbiBzY2FsZWQgYnkgdGhlIHBhcmVudHMgcGFyZW50IG5vZGUuIElmIHdlIHNjYWxlIHRoZSBlbnRpdHkgaW4gc3Bva2UsXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgaXMgd2hlcmUgdGhlIHNjYWxlIGlzIHNldC4gIElmIHdlIGRyb3AgYSBub2RlIGluIGFuZCBzY2FsZSBpdCwgdGhlIHNjYWxlIGlzIGFsc29cbiAgICAgICAgICAgICAgICAgICAgLy8gc2V0IHRoZXJlLlxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IG5lZWQgdG8gZmluZCBlbnZpcm9ubWVudC1zY2VuZSwgZ28gZG93biB0d28gbGV2ZWxzIHRvIHRoZSBncm91cCBhYm92ZSBcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIG5vZGVzIGluIHRoZSBzY2VuZS4gIFRoZW4gYWNjdW11bGF0ZSB0aGUgc2NhbGVzIHVwIGZyb20gdGhpcyBub2RlIHRvXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoYXQgbm9kZS4gIFRoaXMgd2lsbCBhY2NvdW50IGZvciBncm91cHMsIGFuZCBuZXN0aW5nLlxuXG4gICAgICAgICAgICAgICAgICAgIHZhciB3aWR0aCA9IDEsXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtaW1hZ2VcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGF0dGFjaGVkIHRvIGFuIGltYWdlIGluIHNwb2tlLCBzbyB0aGUgaW1hZ2UgbWVzaCBpcyBzaXplIDEgYW5kIGlzIHNjYWxlZCBkaXJlY3RseVxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVJID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBzY2FsZU0ueCAqIHNjYWxlSS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBzY2FsZU0ueSAqIHNjYWxlSS55XG4gICAgICAgICAgICAgICAgICAgICAgICBzY2FsZUkueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlSS55ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnogPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFBST0JBQkxZIERPTlQgTkVFRCBUTyBTVVBQT1JUIFRISVMgQU5ZTU9SRVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXQncyBlbWJlZGRlZCBpbiBhIHNpbXBsZSBnbHRmIG1vZGVsOyAgb3RoZXIgbW9kZWxzIG1heSBub3Qgd29ya1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXNzdW1lIGl0J3MgYXQgdGhlIHRvcCBsZXZlbCBtZXNoLCBhbmQgdGhhdCB0aGUgbW9kZWwgaXRzZWxmIGlzIHNjYWxlZFxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1lc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgYm94ID0gbWVzaC5nZW9tZXRyeS5ib3VuZGluZ0JveDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IChib3gubWF4LnggLSBib3gubWluLngpICogbWVzaC5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gKGJveC5tYXgueSAtIGJveC5taW4ueSkgKiBtZXNoLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2hTY2FsZSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IG1lc2hTY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gbWVzaFNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IHRoZSByb290IGdsdGYgc2NhbGUuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGFyZW50MiA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwub2JqZWN0M0RcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoICo9IHBhcmVudDIuc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ICo9IHBhcmVudDIuc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAod2lkdGggPiAwICYmIGhlaWdodCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHdpZHRoICogdGhpcy5yZWxhdGl2ZVNpemUsIGhlaWdodCAqIHRoaXMucmVsYXRpdmVTaXplKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IHNjYWxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IHNjYWxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHo6IHNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZXJlIG1pZ2h0IGJlIHNvbWUgZWxlbWVudHMgYWxyZWFkeSwgbGlrZSB0aGUgY3ViZSB3ZSBjcmVhdGVkIGluIGJsZW5kZXJcbiAgICAgICAgICAgICAgICAgICAgLy8gYW5kIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50IHRvLCBzbyBoaWRlIHRoZW0gaWYgdGhleSBhcmUgdGhlcmUuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjLnZpc2libGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuYXBwZW5kQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogIHdlIGFyZSBnb2luZyB0byBoYXZlIHRvIG1ha2Ugc3VyZSB0aGlzIHdvcmtzIGlmIFxuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgY29tcG9uZW50IGlzIE9OIGFuIGludGVyYWN0YWJsZSAobGlrZSBhbiBpbWFnZSlcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUludGVyYWN0aW9uID0gbmV3IEhhbmRsZUludGVyYWN0aW9uKHRoaXMuZWwpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtYWtlIHRoZSBvYmplY3QgY2xpY2thYmxlXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZm9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIG9iamVjdCBcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2xpY2tlZCA9IHRoaXMuY2xpY2tlZC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNEcmFnZ2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhcmVuJ3QgZ29pbmcgdG8gcmVhbGx5IGRlYWwgd2l0aCB0aGlzIHRpbGwgd2UgaGF2ZSBhIHVzZSBjYXNlLCBidXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjYW4gc2V0IGl0IHVwIGZvciBub3dcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNIb2xkYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaG9sZGFibGVCdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmFnU3RhcnQgPSB0aGlzLmRyYWdTdGFydC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmFnRW5kID0gdGhpcy5kcmFnRW5kLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tZG93bicsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmFnU3RhcnQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLXVwJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYWdFbmQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vdGhpcy5yYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5UiA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbm8gaW50ZXJhY3Rpdml0eSwgcGxlYXNlXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwiaXMtcmVtb3RlLWhvdmVyLXRhcmdldFwiKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBTSE9VTEQgd29yayBidXQgbWFrZSBzdXJlIGl0IHdvcmtzIGlmIHRoZSBlbCB3ZSBhcmUgb25cbiAgICAgICAgICAgICAgICAgICAgLy8gaXMgbmV0d29ya2VkLCBzdWNoIGFzIHdoZW4gYXR0YWNoZWQgdG8gYW4gaW1hZ2VcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5oYXNBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwibmV0d29ya2VkXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhbiBleGlzdGluZyBjb3B5IG9mIHRoZSBOZXR3b3JrZWQgRW50aXR5IChpZiB3ZSBhcmUgbm90IHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZmlyc3QgY2xpZW50IGluIHRoZSByb29tIGl0IHdpbGwgZXhpc3QgaW4gb3RoZXIgY2xpZW50cyBhbmQgYmUgY3JlYXRlZCBieSBOQUYpXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvciBjcmVhdGUgYW4gZW50aXR5IGlmIHdlIGFyZSBmaXJzdC5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSBmdW5jdGlvbiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGVyc2lzdGVudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ldElkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIGJlIHBhcnQgb2YgYSBOZXR3b3JrZWQgR0xURiBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgcGlubmVkIGFuZCBsb2FkZWQgd2hlbiB3ZSBlbnRlciB0aGUgcm9vbS4gIFVzZSB0aGUgbmV0d29ya2VkIHBhcmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHBsdXMgYSBkaXNhbWJpZ3VhdGluZyBiaXQgb2YgdGV4dCB0byBjcmVhdGUgYSB1bmlxdWUgSWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gTkFGLnV0aWxzLmdldE5ldHdvcmtJZChuZXR3b3JrZWRFbCkgKyBcIi1cIiArIGNvbXBvbmVudE5hbWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgbmVlZCB0byBjcmVhdGUgYW4gZW50aXR5LCB1c2UgdGhlIHNhbWUgcGVyc2lzdGVuY2UgYXMgb3VyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmsgZW50aXR5ICh0cnVlIGlmIHBpbm5lZCwgZmFsc2UgaWYgbm90KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50ID0gZW50aXR5LmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEucGVyc2lzdGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIG9ubHkgaGFwcGVucyBpZiB0aGlzIGNvbXBvbmVudCBpcyBvbiBhIHNjZW5lIGZpbGUsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBlbGVtZW50cyBvbiB0aGUgc2NlbmUgYXJlbid0IG5ldHdvcmtlZC4gIFNvIGxldCdzIGFzc3VtZSBlYWNoIGVudGl0eSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2NlbmUgd2lsbCBoYXZlIGEgdW5pcXVlIG5hbWUuICBBZGRpbmcgYSBiaXQgb2YgdGV4dCBzbyB3ZSBjYW4gZmluZCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgRE9NIHdoZW4gZGVidWdnaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IHRoaXMuZnVsbE5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCItXCIpICsgXCItXCIgKyBjb21wb25lbnROYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBuZXR3b3JrZWQgZW50aXR5IHdlIGNyZWF0ZSBmb3IgdGhpcyBjb21wb25lbnQgYWxyZWFkeSBleGlzdHMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgY3JlYXRlIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gLSBOT1RFOiBpdCBpcyBjcmVhdGVkIG9uIHRoZSBzY2VuZSwgbm90IGFzIGEgY2hpbGQgb2YgdGhpcyBlbnRpdHksIGJlY2F1c2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIE5BRiBjcmVhdGVzIHJlbW90ZSBlbnRpdGllcyBpbiB0aGUgc2NlbmUuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmVudGl0aWVzLmhhc0VudGl0eShuZXRJZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gTkFGLmVudGl0aWVzLmdldEVudGl0eShuZXRJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZXRob2QgdG8gcmV0cmlldmUgdGhlIGRhdGEgb24gdGhpcyBlbnRpdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIFwibmV0d29ya2VkXCIgY29tcG9uZW50IHNob3VsZCBoYXZlIHBlcnNpc3RlbnQ9dHJ1ZSwgdGhlIHRlbXBsYXRlIGFuZCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHNldCwgb3duZXIgc2V0IHRvIFwic2NlbmVcIiAoc28gdGhhdCBpdCBkb2Vzbid0IHVwZGF0ZSB0aGUgcmVzdCBvZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgd29ybGQgd2l0aCBpdCdzIGluaXRpYWwgZGF0YSwgYW5kIHNob3VsZCBOT1Qgc2V0IGNyZWF0b3IgKHRoZSBzeXN0ZW0gd2lsbCBkbyB0aGF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuc2V0QXR0cmlidXRlKCduZXR3b3JrZWQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogXCIjXCIgKyBjb21wb25lbnROYW1lICsgXCItZGF0YS1tZWRpYVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudDogcGVyc2lzdGVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG93bmVyOiBcInNjZW5lXCIsIC8vIHNvIHRoYXQgb3VyIGluaXRpYWwgdmFsdWUgZG9lc24ndCBvdmVyd3JpdGUgb3RoZXJzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXR3b3JrSWQ6IG5ldElkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYXBwZW5kQ2hpbGQoZW50aXR5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzYXZlIGEgcG9pbnRlciB0byB0aGUgbmV0d29ya2VkIGVudGl0eSBhbmQgdGhlbiB3YWl0IGZvciBpdCB0byBiZSBmdWxseVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIGJlZm9yZSBnZXR0aW5nIGEgcG9pbnRlciB0byB0aGUgYWN0dWFsIG5ldHdvcmtlZCBjb21wb25lbnQgaW4gaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMubmV0RW50aXR5KS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW2NvbXBvbmVudE5hbWUgKyBcIi1kYXRhXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5LmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMuZWwpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KG5ldHdvcmtlZEVsKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSB0aGlzLnNldHVwTmV0d29ya2VkLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZXRob2QgaGFuZGxlcyB0aGUgZGlmZmVyZW50IHN0YXJ0dXAgY2FzZXM6XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZSwgTkFGIHdpbGwgYmUgY29ubmVjdGVkIGFuZCB3ZSBjYW4gXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGltbWVkaWF0ZWx5IGluaXRpYWxpemVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgaXMgaW4gdGhlIHJvb20gc2NlbmUgb3IgcGlubmVkLCBpdCB3aWxsIGxpa2VseSBiZSBjcmVhdGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGJlZm9yZSBOQUYgaXMgc3RhcnRlZCBhbmQgY29ubmVjdGVkLCBzbyB3ZSB3YWl0IGZvciBhbiBldmVudCB0aGF0IGlzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGZpcmVkIHdoZW4gSHVicyBoYXMgc3RhcnRlZCBOQUZcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChOQUYuY29ubmVjdGlvbiAmJiBOQUYuY29ubmVjdGlvbi5pc0Nvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignZGlkQ29ubmVjdFRvTmV0d29ya2VkU2NlbmUnLCB0aGlzLnNldHVwTmV0d29ya2VkKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGlmIGF0dGFjaGVkIHRvIGEgbm9kZSB3aXRoIGEgbWVkaWEtbG9hZGVyIGNvbXBvbmVudCwgdGhpcyBtZWFucyB3ZSBhdHRhY2hlZCB0aGlzIGNvbXBvbmVudFxuICAgICAgICAgICAgLy8gdG8gYSBtZWRpYSBvYmplY3QgaW4gU3Bva2UuICBXZSBzaG91bGQgd2FpdCB0aWxsIHRoZSBvYmplY3QgaXMgZnVsbHkgbG9hZGVkLiAgXG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIGl0IHdhcyBhdHRhY2hlZCB0byBzb21ldGhpbmcgaW5zaWRlIGEgR0xURiAocHJvYmFibHkgaW4gYmxlbmRlcilcbiAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgb25jZTogdHJ1ZVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclNoYXJlZEFGUkFNRUNvbXBvbmVudHMoY29tcG9uZW50TmFtZSkge1xuICAgIC8vXG4gICAgLy8gQ29tcG9uZW50IGZvciBvdXIgbmV0d29ya2VkIHN0YXRlLiAgVGhpcyBjb21wb25lbnQgZG9lcyBub3RoaW5nIGV4Y2VwdCBhbGwgdXMgdG8gXG4gICAgLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4gICAgLy8gc29tZXRoaW5nIGhhcyBjaGFuZ2VkLCBpbnN0ZWFkIG9mIGhhdmluZyB0aGUgY29tcG9uZW50IGFib3ZlIHBvbGwgZWFjaCBmcmFtZS5cbiAgICAvL1xuXG4gICAgQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KGNvbXBvbmVudE5hbWUgKyAnLWRhdGEnLCB7XG4gICAgICAgIHNjaGVtYToge1xuICAgICAgICAgICAgc2FtcGxlZGF0YToge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogXCJ7fVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gdGhpcy5lbC5nZXRTaGFyZWREYXRhKCk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKGNvbXBvbmVudE5hbWUgKyBcIi1kYXRhXCIsIFwic2FtcGxlZGF0YVwiLCB0aGlzLnNoYXJlZERhdGEpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDb3VsZG4ndCBlbmNvZGUgaW5pdGlhbCBkYXRhIG9iamVjdDogXCIsIGUsIHRoaXMuZGF0YU9iamVjdClcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcInt9XCJcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jaGFuZ2VkID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgdXBkYXRlKCkge1xuICAgICAgICAgICAgdGhpcy5jaGFuZ2VkID0gISh0aGlzLnNoYXJlZERhdGEgPT09IHRoaXMuZGF0YS5zYW1wbGVkYXRhKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudCh0aGlzLmRhdGEuc2FtcGxlZGF0YSkpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gdGhpcy5kYXRhLnNhbXBsZWRhdGE7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlZCA9IHRydWVcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjb3VsZG4ndCBwYXJzZSBKU09OIHJlY2VpdmVkIGluIGRhdGEtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IFwie31cIlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvLyBpdCBpcyBsaWtlbHkgdGhhdCBhcHBseVBlcnNpc3RlbnRTeW5jIG9ubHkgbmVlZHMgdG8gYmUgY2FsbGVkIGZvciBwZXJzaXN0ZW50XG4gICAgICAgIC8vIG5ldHdvcmtlZCBlbnRpdGllcywgc28gd2UgX3Byb2JhYmx5XyBkb24ndCBuZWVkIHRvIGRvIHRoaXMuICBCdXQgaWYgdGhlcmUgaXMgbm9cbiAgICAgICAgLy8gcGVyc2lzdGVudCBkYXRhIHNhdmVkIGZyb20gdGhlIG5ldHdvcmsgZm9yIHRoaXMgZW50aXR5LCB0aGlzIGNvbW1hbmQgZG9lcyBub3RoaW5nLlxuICAgICAgICBwbGF5KCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIHJlYWxseSBuZWVkZWQsIGJ1dCBjYW4ndCBodXJ0XG4gICAgICAgICAgICAgICAgaWYgKEFQUC51dGlscykgeyAvLyB0ZW1wb3JhcnkgdGlsbCB3ZSBzaGlwIG5ldyBjbGllbnRcbiAgICAgICAgICAgICAgICAgICAgQVBQLnV0aWxzLmFwcGx5UGVyc2lzdGVudFN5bmModGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLm5ldHdvcmtJZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHNldFNoYXJlZERhdGEoZGF0YU9iamVjdCkge1xuICAgICAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBkYXRhU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGRhdGFTdHJpbmdcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoY29tcG9uZW50TmFtZSArIFwiLWRhdGFcIiwgXCJzYW1wbGVkYXRhXCIsIGRhdGFTdHJpbmcpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBkYXRhLXN5bmNcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIG91ciB0ZW1wbGF0ZSBmb3Igb3VyIG5ldHdvcmtlZCBvYmplY3QgdG8gdGhlIGEtZnJhbWUgYXNzZXRzIG9iamVjdCxcbiAgICAvLyBhbmQgYSBzY2hlbWEgdG8gdGhlIE5BRi5zY2hlbWFzLiAgQm90aCBtdXN0IGJlIHRoZXJlIHRvIGhhdmUgY3VzdG9tIGNvbXBvbmVudHMgd29ya1xuXG4gICAgY29uc3QgYXNzZXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImEtYXNzZXRzXCIpO1xuXG4gICAgYXNzZXRzLmluc2VydEFkamFjZW50SFRNTChcbiAgICAgICAgJ2JlZm9yZWVuZCcsXG4gICAgICAgIGBcbjx0ZW1wbGF0ZSBpZD1cImAgKyBjb21wb25lbnROYW1lICsgYC1kYXRhLW1lZGlhXCI+XG4gIDxhLWVudGl0eVxuICAgIGAgKyBjb21wb25lbnROYW1lICsgYC1kYXRhXG4gID48L2EtZW50aXR5PlxuPC90ZW1wbGF0ZT5cbmBcbiAgICApXG5cbiAgICBOQUYuc2NoZW1hcy5hZGQoe1xuICAgICAgICB0ZW1wbGF0ZTogXCIjXCIgKyBjb21wb25lbnROYW1lICsgXCItZGF0YS1tZWRpYVwiLFxuICAgICAgICBjb21wb25lbnRzOiBbe1xuICAgICAgICAgICAgY29tcG9uZW50OiBjb21wb25lbnROYW1lICsgXCItZGF0YVwiLFxuICAgICAgICAgICAgcHJvcGVydHk6IFwic2FtcGxlZGF0YVwiXG4gICAgICAgIH1dLFxuICAgICAgICBub25BdXRob3JpemVkQ29tcG9uZW50czogW3tcbiAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50TmFtZSArIFwiLWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNhbXBsZWRhdGFcIlxuICAgICAgICB9XSxcblxuICAgIH0pO1xufSIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBjcmVhdGUgYSB0aHJlZWpzIG9iamVjdCAodHdvIGN1YmVzLCBvbmUgb24gdGhlIHN1cmZhY2Ugb2YgdGhlIG90aGVyKSB0aGF0IGNhbiBiZSBpbnRlcmFjdGVkIFxuICogd2l0aCBhbmQgaGFzIHNvbWUgbmV0d29ya2VkIGF0dHJpYnV0ZXMuXG4gKlxuICovXG5pbXBvcnQge1xuICAgIGludGVyYWN0aXZlQ29tcG9uZW50VGVtcGxhdGUsXG4gICAgcmVnaXN0ZXJTaGFyZWRBRlJBTUVDb21wb25lbnRzXG59IGZyb20gXCIuLi91dGlscy9pbnRlcmFjdGlvblwiO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBzaW1wbGUgY29udmVuaWVuY2UgZnVuY3Rpb25zIFxuZnVuY3Rpb24gcmFuZG9tQ29sb3IoKSB7XG4gICAgcmV0dXJuIG5ldyBUSFJFRS5Db2xvcihNYXRoLnJhbmRvbSgpLCBNYXRoLnJhbmRvbSgpLCBNYXRoLnJhbmRvbSgpKTtcbn1cblxuZnVuY3Rpb24gYWxtb3N0RXF1YWxWZWMzKHUsIHYsIGVwc2lsb24pIHtcbiAgICByZXR1cm4gTWF0aC5hYnModS54IC0gdi54KSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS55IC0gdi55KSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS56IC0gdi56KSA8IGVwc2lsb247XG59O1xuXG5mdW5jdGlvbiBhbG1vc3RFcXVhbENvbG9yKHUsIHYsIGVwc2lsb24pIHtcbiAgICByZXR1cm4gTWF0aC5hYnModS5yIC0gdi5yKSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS5nIC0gdi5nKSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS5iIC0gdi5iKSA8IGVwc2lsb247XG59O1xuXG4vLyBhIGxvdCBvZiB0aGUgY29tcGxleGl0eSBoYXMgYmVlbiBwdWxsZWQgb3V0IGludG8gbWV0aG9kcyBpbiB0aGUgb2JqZWN0XG4vLyBjcmVhdGVkIGJ5IGludGVyYWN0aXZlQ29tcG9uZW50VGVtcGxhdGUoKSBhbmQgcmVnaXN0ZXJTaGFyZWRBRlJBTUVjb21wb25lbnRzKCkuXG4vLyBIZXJlLCB3ZSBkZWZpbmUgbWV0aG9kcyB0aGF0IGFyZSB1c2VkIGJ5IHRoZSBvYmplY3QgdGhlcmUsIHRvIGRvIG91ciBvYmplY3Qtc3BlY2lmaWNcbi8vIHdvcmsuXG5cbi8vIFdlIG5lZWQgdG8gZGVmaW5lOlxuLy8gLSBBRlJBTUUgXG4vLyAgIC0gc2NoZW1hXG4vLyAgIC0gaW5pdCgpIG1ldGhvZCwgd2hpY2ggc2hvdWxkIGNhbiBzdGFydEluaXQoKSBhbmQgZmluaXNoSW5pdCgpXG4vLyAgIC0gdXBkYXRlKCkgYW5kIHBsYXkoKSBpZiB5b3UgbmVlZCB0aGVtXG4vLyAgIC0gdGljaygpIGFuZCB0aWNrMigpIHRvIGhhbmRsZSBmcmFtZSB1cGRhdGVzXG4vL1xuLy8gLSBjaGFuZ2UgaXNOZXR3b3JrZWQsIGlzSW50ZXJhY3RpdmUsIGlzRHJhZ2dhYmxlIChkZWZhdWx0OiBmYWxzZSkgdG8gcmVmbGVjdCB3aGF0IFxuLy8gICB0aGUgb2JqZWN0IG5lZWRzIHRvIGRvLlxuLy8gLSBsb2FkRGF0YSgpIGlzIGFuIGFzeW5jIGZ1bmN0aW9uIHRoYXQgZG9lcyBhbnkgc2xvdyB3b3JrIChsb2FkaW5nIHRoaW5ncywgZXRjKVxuLy8gICBhbmQgaXMgY2FsbGVkIGJ5IGZpbmlzaEluaXQoKSwgd2hpY2ggd2FpdHMgdGlsbCBpdCdzIGRvbmUgYmVmb3JlIHNldHRpbmcgdGhpbmdzIHVwXG4vLyAtIGluaXRpYWxpemVEYXRhKCkgaXMgY2FsbGVkIHRvIHNldCB1cCB0aGUgaW5pdGlhbCBzdGF0ZSBvZiB0aGUgb2JqZWN0LCBhIGdvb2QgXG4vLyAgIHBsYWNlIHRvIGNyZWF0ZSB0aGUgM0QgY29udGVudC4gIFRoZSB0aHJlZS5qcyBzY2VuZSBzaG91bGQgYmUgYWRkZWQgdG8gXG4vLyAgIHRoaXMuc2ltcGxlQ29udGFpbnRlclxuLy8gLSBjbGlja2VkKCkgaXMgY2FsbGVkIHdoZW4gdGhlIG9iamVjdCBpcyBjbGlja2VkXG4vLyAtIGRyYWdTdGFydCgpIGlzIGNhbGxlZCByaWdodCBhZnRlciBjbGlja2VkKCkgaWYgaXNEcmFnZ2FibGUgaXMgdHJ1ZSwgdG8gc2V0IHVwXG4vLyAgIGZvciBhIHBvc3NpYmxlIGRyYWcgb3BlcmF0aW9uXG4vLyAtIGRyYWdFbmQoKSBpcyBjYWxsZWQgd2hlbiB0aGUgbW91c2UgaXMgcmVsZWFzZWRcbi8vIC0gZHJhZygpIHNob3VsZCBiZSBjYWxsZWQgZWFjaCBmcmFtZSB3aGlsZSB0aGUgb2JqZWN0IGlzIGJlaW5nIGRyYWdnZWQgKGJldHdlZW4gXG4vLyAgIGRyYWdTdGFydCgpIGFuZCBkcmFnRW5kKCkpXG4vLyAtIGdldEludGVyYWN0b3JzKCkgcmV0dXJucyBhbiBhcnJheSBvZiBvYmplY3RzIGZvciB3aGljaCBpbnRlcmFjdGlvbiBjb250cm9scyBhcmVcbi8vICAgaW50ZXJzZWN0aW5nIHRoZSBvYmplY3QuIFRoZXJlIHdpbGwgbGlrZWx5IGJlIHplcm8sIG9uZSwgb3IgdHdvIG9mIHRoZXNlIChpZiBcbi8vICAgdGhlcmUgYXJlIHR3byBjb250cm9sbGVycyBhbmQgYm90aCBhcmUgcG9pbnRpbmcgYXQgdGhlIG9iamVjdCkuICBUaGUgXCJjdXJzb3JcIlxuLy8gICBmaWVsZCBpcyBhIHBvaW50ZXIgdG8gdGhlIHNtYWxsIHNwaGVyZSBPYmplY3QzRCB0aGF0IGlzIGRpc3BsYXllZCB3aGVyZSB0aGUgXG4vLyAgIGludGVyYWN0aW9uIHJheSB0b3VjaGVzIHRoZSBvYmplY3QuIFRoZSBcImNvbnRyb2xsZXJcIiBmaWVsZCBpcyB0aGUgXG4vLy8gIGNvcnJlc3BvbmRpbmcgY29udHJvbGxlclxuLy8gICBvYmplY3QgdGhhdCBpbmNsdWRlcyB0aGluZ3MgbGlrZSB0aGUgcmF5Q2FzdGVyLlxuLy8gLSBnZXRJbnRlcnNlY3Rpb24oKSB0YWtlcyBpbiB0aGUgaW50ZXJhY3RvciBhbmQgdGhlIHRocmVlLmpzIG9iamVjdDNEIGFycmF5IFxuLy8gICB0aGF0IHNob3VsZCBiZSB0ZXN0ZWQgZm9yIGludGVyYWN0aW9uLlxuXG4vLyBOb3RlIHRoYXQgb25seSB0aGUgZW50aXR5IHRoYXQgdGhpcyBjb21wb25lbnQgaXMgYXR0YWNoZWQgdG8gd2lsbCBiZSBcInNlZW5cIlxuLy8gYnkgSHVicyBpbnRlcmFjdGlvbiBzeXN0ZW0sIHNvIHRoZSBlbnRpcmUgdGhyZWUuanMgdHJlZSBiZWxvdyBpdCB0cmlnZ2Vyc1xuLy8gY2xpY2sgYW5kIGRyYWcgZXZlbnRzLiAgVGhlIGdldEludGVyc2VjdGlvbigpIG1ldGhvZCBpcyBuZWVkZWQgXG5cbi8vIHRoZSBjb21wb25lbnROYW1lIG11c3QgYmUgbG93ZXJjYXNlLCBjYW4gaGF2ZSBoeXBoZW5zLCBzdGFydCB3aXRoIGEgbGV0dGVyLCBcbi8vIGJ1dCBubyB1bmRlcnNjb3Jlc1xubGV0IGNvbXBvbmVudE5hbWUgPSBcInRlc3QtY3ViZVwiO1xuXG4vLyBnZXQgdGhlIHRlbXBsYXRlIHBhcnQgb2YgdGhlIG9iamVjdCBuZWVkIGZvciB0aGUgQUZSQU1FIGNvbXBvbmVudFxubGV0IHRlbXBsYXRlID0gaW50ZXJhY3RpdmVDb21wb25lbnRUZW1wbGF0ZShjb21wb25lbnROYW1lKTtcblxuLy8gY3JlYXRlIHRoZSBhZGRpdGlvbmFsIHBhcnRzIG9mIHRoZSBvYmplY3QgbmVlZGVkIGZvciB0aGUgQUZSQU1FIGNvbXBvbmVudFxubGV0IGNoaWxkID0ge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIGlzIGhvcGVmdWxseSB1bmlxdWUgZm9yIGVhY2ggaW5zdGFuY2VcbiAgICAgICAgbmFtZToge1xuICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IFwiXCJcbiAgICAgICAgfSxcblxuICAgICAgICAvLyB0aGUgdGVtcGxhdGUgd2lsbCBsb29rIGZvciB0aGVzZSBwcm9wZXJ0aWVzLiBJZiB0aGV5IGFyZW4ndCB0aGVyZSwgdGhlblxuICAgICAgICAvLyB0aGUgbG9va3VwICh0aGlzLmRhdGEuKikgd2lsbCBldmFsdWF0ZSB0byBmYWxzZXlcbiAgICAgICAgaXNOZXR3b3JrZWQ6IHtcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgaXNJbnRlcmFjdGl2ZToge1xuICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIGlzRHJhZ2dhYmxlOiB7XG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IHRydWVcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBvdXIgZGF0YVxuICAgICAgICB3aWR0aDoge1xuICAgICAgICAgICAgdHlwZTogXCJudW1iZXJcIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IDFcbiAgICAgICAgfSxcbiAgICAgICAgY29sb3I6IHtcbiAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiBcIlwiXG4gICAgICAgIH0sXG4gICAgICAgIHBhcmFtZXRlcjE6IHtcbiAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiBcIlwiXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gZnVsbE5hbWUgaXMgdXNlZCB0byBnZW5lcmF0ZSBuYW1lcyBmb3IgdGhlIEFGUmFtZSBvYmplY3RzIHdlIGNyZWF0ZS4gIFNob3VsZCBiZVxuICAgIC8vIHVuaXF1ZSBmb3IgZWFjaCBpbnN0YW5jZSBvZiBhbiBvYmplY3QsIHdoaWNoIHdlIHNwZWNpZnkgd2l0aCBuYW1lLiAgSWYgbmFtZSBkb2VzXG4gICAgLy8gbmFtZSBnZXQgdXNlZCBhcyBhIHNjaGVtZSBwYXJhbWV0ZXIsIGl0IGRlZmF1bHRzIHRvIHRoZSBuYW1lIG9mIGl0J3MgcGFyZW50IGdsVEZcbiAgICAvLyBvYmplY3QsIHdoaWNoIG9ubHkgd29ya3MgaWYgdGhvc2UgYXJlIHVuaXF1ZWx5IG5hbWVkLlxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zdGFydEluaXQoKTtcblxuICAgICAgICAvLyB0aGUgdGVtcGxhdGUgdXNlcyB0aGVzZSB0byBzZXQgdGhpbmdzIHVwLiAgcmVsYXRpdmVTaXplXG4gICAgICAgIC8vIGlzIHVzZWQgdG8gc2V0IHRoZSBzaXplIG9mIHRoZSBvYmplY3QgcmVsYXRpdmUgdG8gdGhlIHNpemUgb2YgdGhlIGltYWdlXG4gICAgICAgIC8vIHRoYXQgaXQncyBhdHRhY2hlZCB0bzogYSBzaXplIG9mIDEgbWVhbnMgXG4gICAgICAgIC8vICAgXCJ0aGUgc2l6ZSBvZiAxeDF4MSB1bml0cyBpbiB0aGUgb2JqZWN0XG4gICAgICAgIC8vICAgIHNwYWNlIHdpbGwgYmUgdGhlIHNhbWUgYXMgdGhlIHNpemUgb2YgdGhlIGltYWdlXCIuICBcbiAgICAgICAgLy8gTGFyZ2VyIHJlbGF0aXZlIHNpemVzIHdpbGwgbWFrZSB0aGUgb2JqZWN0IHNtYWxsZXIgYmVjYXVzZSB3ZSBhcmVcbiAgICAgICAgLy8gc2F5aW5nIHRoYXQgYSBzaXplIG9mIE54TnhOIG1hcHMgdG8gdGhlIFNpemUgb2YgdGhlIGltYWdlLCBhbmQgdmljZSB2ZXJzYS4gIFxuICAgICAgICAvLyBGb3IgZXhhbXBsZSwgaWYgdGhlIG9iamVjdCBiZWxvdyBpcyAyLDIgaW4gc2l6ZSBhbmQgd2Ugc2V0IHNpemUgMiwgdGhlblxuICAgICAgICAvLyB0aGUgb2JqZWN0IHdpbGwgcmVtYWluIHRoZSBzYW1lIHNpemUgYXMgdGhlIGltYWdlLiBJZiB3ZSBsZWF2ZSBpdCBhdCAxLDEsXG4gICAgICAgIC8vIHRoZW4gdGhlIG9iamVjdCB3aWxsIGJlIHR3aWNlIHRoZSBzaXplIG9mIHRoZSBpbWFnZS4gXG4gICAgICAgIHRoaXMucmVsYXRpdmVTaXplID0gdGhpcy5kYXRhLndpZHRoO1xuXG4gICAgICAgIC8vIG92ZXJyaWRlIHRoZSBkZWZhdWx0cyBpbiB0aGUgdGVtcGxhdGVcbiAgICAgICAgdGhpcy5pc0RyYWdnYWJsZSA9IHRoaXMuZGF0YS5pc0RyYWdnYWJsZTtcbiAgICAgICAgdGhpcy5pc0ludGVyYWN0aXZlID0gdGhpcy5kYXRhLmlzSW50ZXJhY3RpdmU7XG4gICAgICAgIHRoaXMuaXNOZXR3b3JrZWQgPSB0aGlzLmRhdGEuaXNOZXR3b3JrZWQ7XG5cbiAgICAgICAgLy8gb3VyIHBvdGVudGlhbGwtc2hhcmVkIG9iamVjdCBzdGF0ZSAodHdvIHJvYXRpb25zIGFuZCB0d28gY29sb3JzIGZvciB0aGUgYm94ZXMpIFxuICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB7XG4gICAgICAgICAgICBjb2xvcjogbmV3IFRIUkVFLkNvbG9yKHRoaXMuZGF0YS5jb2xvci5sZW5ndGggPiAwID8gdGhpcy5kYXRhLmNvbG9yIDogXCJncmV5XCIpLFxuICAgICAgICAgICAgcm90YXRpb246IG5ldyBUSFJFRS5FdWxlcigpLFxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBUSFJFRS5WZWN0b3IzKDAsMC41LDApXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gc29tZSBsb2NhbCBzdGF0ZVxuICAgICAgICB0aGlzLmluaXRpYWxFdWxlciA9IG5ldyBUSFJFRS5FdWxlcigpXG5cbiAgICAgICAgLy8gc29tZSBjbGljay9kcmFnIHN0YXRlXG4gICAgICAgIHRoaXMuY2xpY2tFdmVudCA9IG51bGxcbiAgICAgICAgdGhpcy5jbGlja0ludGVyc2VjdGlvbiA9IG51bGxcblxuICAgICAgICAvLyB3ZSBzaG91bGQgc2V0IGZ1bGxOYW1lIGlmIHdlIGhhdmUgYSBtZWFuaW5nZnVsIG5hbWVcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5uYW1lICYmIHRoaXMuZGF0YS5uYW1lLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZpbmlzaCB0aGUgaW5pdGlhbGl6YXRpb25cbiAgICAgICAgdGhpcy5maW5pc2hJbml0KCk7XG4gICAgfSxcblxuICAgIC8vIGlmIGFueXRoaW5nIGNoYW5nZWQgaW4gdGhpcy5kYXRhLCB3ZSBuZWVkIHRvIHVwZGF0ZSB0aGUgb2JqZWN0LiAgXG4gICAgLy8gdGhpcyBpcyBwcm9iYWJseSBub3QgZ29pbmcgdG8gaGFwcGVuLCBidXQgY291bGQgaWYgYW5vdGhlciBvZiBcbiAgICAvLyBvdXIgc2NyaXB0cyBtb2RpZmllcyB0aGUgY29tcG9uZW50IHByb3BlcnRpZXMgaW4gdGhlIERPTVxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge30sXG5cbiAgICAvLyBkbyBzb21lIHN0dWZmIHRvIGdldCBhc3luYyBkYXRhLiAgQ2FsbGVkIGJ5IGluaXRUZW1wbGF0ZSgpXG4gICAgbG9hZERhdGE6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgfSxcblxuICAgIC8vIGNhbGxlZCBieSBpbml0VGVtcGxhdGUoKSB3aGVuIHRoZSBjb21wb25lbnQgaXMgYmVpbmcgcHJvY2Vzc2VkLiAgSGVyZSwgd2UgY3JlYXRlXG4gICAgLy8gdGhlIHRocmVlLmpzIG9iamVjdHMgd2Ugd2FudCwgYW5kIGFkZCB0aGVtIHRvIHNpbXBsZUNvbnRhaW5lciAoYW4gQUZyYW1lIG5vZGUgXG4gICAgLy8gdGhlIHRlbXBsYXRlIGNyZWF0ZWQgZm9yIHVzKS5cbiAgICBpbml0aWFsaXplRGF0YTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmJveCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDEsIDEsIDIsIDIsIDIpLFxuICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgICAgICAgICBjb2xvcjogdGhpcy5zaGFyZWREYXRhLmNvbG9yXG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmJveC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0T2JqZWN0M0QoJ2JveCcsIHRoaXMuYm94KVxuXG4gICAgICAgIC8vIGNyZWF0ZSBhIHNlY29uZCBzbWFsbCwgYmxhY2sgYm94IG9uIHRoZSBzdXJmYWNlIG9mIHRoZSBib3hcbiAgICAgICAgdGhpcy5ib3gyID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMC4xLCAwLjEsIDAuMSwgMiwgMiwgMiksXG4gICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICAgICAgICAgIGNvbG9yOiBcImJsYWNrXCJcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuYm94Mi5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5ib3gyLnBvc2l0aW9uLmNvcHkodGhpcy5zaGFyZWREYXRhLnBvc2l0aW9uKVxuXG4gICAgICAgIC8vIGFkZCBpdCBhcyBhIGNoaWxkIG9mIHRoZSBmaXJzdCBib3gsIHNpbmNlIHdlIHdhbnQgaXQgdG8gbW92ZSB3aXRoIHRoZSBmaXJzdCBib3hcbiAgICAgICAgdGhpcy5ib3guYWRkKHRoaXMuYm94MilcblxuICAgICAgICAvLyBJTVBPUlRBTlQ6IGFueSB0aHJlZS5qcyBvYmplY3QgdGhhdCBpcyBhZGRlZCB0byBhIEh1YnMgKGFmcmFtZSkgZW50aXR5IFxuICAgICAgICAvLyBtdXN0IGhhdmUgXCIuZWxcIiBwb2ludGluZyB0byB0aGUgQUZSQU1FIEVudGl0eSB0aGF0IGNvbnRhaW5zIGl0LlxuICAgICAgICAvLyBXaGVuIGFuIG9iamVjdDNEIGlzIGFkZGVkIHdpdGggXCIuc2V0T2JqZWN0M0RcIiwgaXQgaXMgYWRkZWQgdG8gdGhlIFxuICAgICAgICAvLyBvYmplY3QzRCBmb3IgdGhhdCBFbnRpdHksIGFuZCBzZXRzIGFsbCBvZiB0aGUgY2hpbGRyZW4gb2YgdGhhdFxuICAgICAgICAvLyBvYmplY3QzRCB0byBwb2ludCB0byB0aGUgc2FtZSBFbnRpdHkuICBJZiB5b3UgYWRkIGFuIG9iamVjdDNEIHRvXG4gICAgICAgIC8vIHRoZSBzdWItdHJlZSBvZiB0aGF0IG9iamVjdCBsYXRlciwgeW91IG11c3QgZG8gdGhpcyB5b3Vyc2VsZi4gXG4gICAgICAgIHRoaXMuYm94Mi5lbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG4gICAgfSxcblxuICAgIC8vIGNhbGxlZCBmcm9tIHJlbW92ZSgpIGluIHRoZSB0ZW1wbGF0ZSB0byByZW1vdmUgYW55IGxvY2FsIHJlc291cmNlcyB3aGVuIHRoZSBjb21wb25lbnRcbiAgICAvLyBpcyBkZXN0cm95ZWRcbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIucmVtb3ZlT2JqZWN0M0QoXCJib3hcIilcbiAgICAgICAgdGhpcy5ib3guZ2VvbWV0cnkuZGlzcG9zZSgpXG4gICAgICAgIHRoaXMuYm94Lm1hdGVyaWFsLmRpc3Bvc2UoKVxuICAgICAgICB0aGlzLmJveDIuZ2VvbWV0cnkuZGlzcG9zZSgpXG4gICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5kaXNwb3NlKClcbiAgICAgICAgdGhpcy5yZW1vdmVUZW1wbGF0ZSgpXG4gICAgfSxcblxuICAgIC8vIGhhbmRsZSBcImludGVyYWN0XCIgZXZlbnRzIGZvciBjbGlja2FibGUgZW50aXRpZXNcbiAgICBjbGlja2VkOiBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgIC8vIHRoZSBldnQudGFyZ2V0IHdpbGwgcG9pbnQgYXQgdGhlIG9iamVjdDNEIGluIHRoaXMgZW50aXR5LiAgV2UgY2FuIHVzZVxuICAgICAgICAvLyBoYW5kbGVJbnRlcmFjdGlvbi5nZXRJbnRlcmFjdGlvblRhcmdldCgpIHRvIGdldCB0aGUgbW9yZSBwcmVjaXNlIFxuICAgICAgICAvLyBoaXQgaW5mb3JtYXRpb24gYWJvdXQgd2hpY2ggb2JqZWN0M0RzIGluIG91ciBvYmplY3Qgd2VyZSBoaXQuICBXZSBzdG9yZVxuICAgICAgICAvLyB0aGUgb25lIHRoYXQgd2FzIGNsaWNrZWQgaGVyZSwgc28gd2Uga25vdyB3aGljaCBpdCB3YXMgYXMgd2UgZHJhZyBhcm91bmRcbiAgICAgICAgdGhpcy5jbGlja0ludGVyc2VjdGlvbiA9IHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJzZWN0aW9uKGV2dC5vYmplY3QzRCwgW2V2dC50YXJnZXRdKTtcbiAgICAgICAgdGhpcy5jbGlja0V2ZW50ID0gZXZ0O1xuXG4gICAgICAgIGlmICghdGhpcy5jbGlja0ludGVyc2VjdGlvbikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiY2xpY2sgZGlkbid0IGhpdCBhbnl0aGluZzsgc2hvdWxkbid0IGhhcHBlblwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveCkge1xuICAgICAgICAgICAgLy8gbmV3IHJhbmRvbSBjb2xvciBvbiBlYWNoIGNsaWNrXG4gICAgICAgICAgICBsZXQgbmV3Q29sb3IgPSByYW5kb21Db2xvcigpXG5cbiAgICAgICAgICAgIHRoaXMuYm94Lm1hdGVyaWFsLmNvbG9yLnNldChuZXdDb2xvcilcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YS5jb2xvci5zZXQobmV3Q29sb3IpXG4gICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEoKVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94Mikge31cbiAgICB9LFxuXG4gICAgLy8gY2FsbGVkIHRvIHN0YXJ0IHRoZSBkcmFnLiAgV2lsbCBiZSBjYWxsZWQgYWZ0ZXIgY2xpY2tlZCgpIGlmIGlzRHJhZ2dhYmxlIGlzIHRydWVcbiAgICBkcmFnU3RhcnQ6IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgLy8gc2V0IHVwIHRoZSBkcmFnIHN0YXRlXG4gICAgICAgIGlmICghdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5zdGFydERyYWcoZXZ0KSkge1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBncmFiIGEgY29weSBvZiB0aGUgY3VycmVudCBvcmllbnRhdGlvbiBvZiB0aGUgb2JqZWN0IHdlIGNsaWNrZWRcbiAgICAgICAgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94KSB7XG4gICAgICAgICAgICB0aGlzLmluaXRpYWxFdWxlci5jb3B5KHRoaXMuYm94LnJvdGF0aW9uKVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94Mikge1xuICAgICAgICAgICAgdGhpcy5ib3gyLm1hdGVyaWFsLmNvbG9yLnNldChcInJlZFwiKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIGNhbGxlZCB3aGVuIHRoZSBidXR0b24gaXMgcmVsZWFzZWQgdG8gZmluaXNoIHRoZSBkcmFnXG4gICAgZHJhZ0VuZDogZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmVuZERyYWcoZXZ0KVxuICAgICAgICBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gpIHt9IGVsc2UgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94Mikge1xuICAgICAgICAgICAgdGhpcy5ib3gyLm1hdGVyaWFsLmNvbG9yLnNldChcImJsYWNrXCIpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gdGhlIG1ldGhvZCBzZXRTaGFyZWREYXRhKCkgYWx3YXlzIHNldHMgdGhlIHNoYXJlZCBkYXRhLCBjYXVzaW5nIGEgbmV0d29yayB1cGRhdGUuICBcbiAgICAvLyBXZSBjYW4gYmUgc21hcnRlciBoZXJlIGJ5IGNhbGxpbmcgaXQgb25seSB3aGVuIHNpZ25pZmljYW50IGNoYW5nZXMgaGFwcGVuLCBcbiAgICAvLyB3aGljaCB3ZSdsbCBkbyBpbiB0aGUgc2V0U2hhcmVkRXVsZXIgbWV0aG9kc1xuICAgIHNldFNoYXJlZEV1bGVyOiBmdW5jdGlvbiAobmV3RXVsZXIpIHtcbiAgICAgICAgaWYgKCFhbG1vc3RFcXVhbFZlYzModGhpcy5zaGFyZWREYXRhLnJvdGF0aW9uLCBuZXdFdWxlciwgMC4wNSkpIHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YS5yb3RhdGlvbi5jb3B5KG5ld0V1bGVyKVxuICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhKClcbiAgICAgICAgfVxuICAgIH0sXG4gICAgc2V0U2hhcmVkUG9zaXRpb246IGZ1bmN0aW9uIChuZXdQb3MpIHtcbiAgICAgICAgaWYgKCFhbG1vc3RFcXVhbFZlYzModGhpcy5zaGFyZWREYXRhLnBvc2l0aW9uLCBuZXdQb3MsIDAuMDUpKSB7XG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEucG9zaXRpb24uY29weShuZXdQb3MpXG4gICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIGlmIHRoZSBvYmplY3QgaXMgbmV0d29ya2VkLCB0aGlzLnN0YXRlU3luYyB3aWxsIGV4aXN0IGFuZCBzaG91bGQgYmUgY2FsbGVkXG4gICAgc2V0U2hhcmVkRGF0YTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXRlU3luYy5zZXRTaGFyZWREYXRhKHRoaXMuc2hhcmVkRGF0YSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyB0aGlzIGlzIGNhbGxlZCBmcm9tIHRoZSBuZXR3b3JrZWQgZGF0YSBlbnRpdHkgdG8gZ2V0IHRoZSBpbml0aWFsIGRhdGEgXG4gICAgLy8gZnJvbSB0aGUgY29tcG9uZW50XG4gICAgZ2V0U2hhcmVkRGF0YTogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zaGFyZWREYXRhXG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5ib3gpIHtcbiAgICAgICAgICAgIC8vIGhhdmVuJ3QgZmluaXNoZWQgaW5pdGlhbGl6aW5nIHlldFxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgaXQncyBpbnRlcmFjdGl2ZSwgd2UnbGwgaGFuZGxlIGRyYWcgYW5kIGhvdmVyIGV2ZW50c1xuICAgICAgICBpZiAodGhpcy5pc0ludGVyYWN0aXZlKSB7XG5cbiAgICAgICAgICAgIC8vIGlmIHdlJ3JlIGRyYWdnaW5nLCB1cGRhdGUgdGhlIHJvdGF0aW9uXG4gICAgICAgICAgICBpZiAodGhpcy5pc0RyYWdnYWJsZSAmJiB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmlzRHJhZ2dpbmcpIHtcblxuICAgICAgICAgICAgICAgIC8vIGRvIHNvbWV0aGluZyB3aXRoIHRoZSBkcmFnZ2luZy4gSGVyZSwgd2UnbGwgdXNlIGRlbHRhLnggYW5kIGRlbHRhLnlcbiAgICAgICAgICAgICAgICAvLyB0byByb3RhdGUgdGhlIG9iamVjdC4gIFRoZXNlIHZhbHVlcyBhcmUgc2V0IGFzIGEgcmVsYXRpdmUgb2Zmc2V0IGluXG4gICAgICAgICAgICAgICAgLy8gdGhlIHBsYW5lIHBlcnBlbmRpY3VsYXIgdG8gdGhlIHZpZXcsIHNvIHdlJ2xsIHVzZSB0aGVtIHRvIG9mZnNldCB0aGVcbiAgICAgICAgICAgICAgICAvLyB4IGFuZCB5IHJvdGF0aW9uIG9mIHRoZSBvYmplY3QuICBUaGlzIGlzIGEgVEVSUklCTEUgd2F5IHRvIGRvIHJvdGF0ZSxcbiAgICAgICAgICAgICAgICAvLyBidXQgaXQncyBhIHNpbXBsZSBleGFtcGxlLlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveCkge1xuICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgZHJhZyBzdGF0ZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmRyYWcoKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNvbXB1dGUgYSBuZXcgcm90YXRpb24gYmFzZWQgb24gdGhlIGRlbHRhXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm94LnJvdGF0aW9uLnNldCh0aGlzLmluaXRpYWxFdWxlci54IC0gdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5kZWx0YS54LFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0aWFsRXVsZXIueSArIHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZGVsdGEueSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5pdGlhbEV1bGVyLnopXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIHRoZSBzaGFyZWQgcm90YXRpb25cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWRFdWxlcih0aGlzLmJveC5yb3RhdGlvbilcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94Mikge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIHdhbnQgdG8gaGl0IHRlc3Qgb24gb3VyIGJveGVzLCBidXQgb25seSB3YW50IHRvIGtub3cgaWYvd2hlcmVcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgaGl0IHRoZSBiaWcgYm94LiAgU28gZmlyc3QgaGlkZSB0aGUgc21hbGwgYm94LCBhbmQgdGhlbiBkbyBhXG4gICAgICAgICAgICAgICAgICAgIC8vIGEgaGl0IHRlc3QsIHdoaWNoIGNhbiBvbmx5IHJlc3VsdCBpbiBhIGhpdCBvbiB0aGUgYmlnIGJveC4gIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJveDIudmlzaWJsZSA9IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgIGxldCBpbnRlcnNlY3QgPSB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmdldEludGVyc2VjdGlvbih0aGlzLmhhbmRsZUludGVyYWN0aW9uLmRyYWdJbnRlcmFjdG9yLCBbdGhpcy5ib3hdKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJveDIudmlzaWJsZSA9IHRydWVcblxuICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoaXQgdGhlIGJpZyBib3gsIG1vdmUgdGhlIHNtYWxsIGJveCB0byB0aGUgcG9zaXRpb24gb2YgdGhlIGhpdFxuICAgICAgICAgICAgICAgICAgICBpZiAoaW50ZXJzZWN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgaW50ZXJzZWN0IG9iamVjdCBpcyBhIFRIUkVFLkludGVyc2VjdGlvbiBvYmplY3QsIHdoaWNoIGhhcyB0aGUgaGl0IHBvaW50XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzcGVjaWZpZWQgaW4gd29ybGQgY29vcmRpbmF0ZXMuICBTbyB3ZSBtb3ZlIHRob3NlIGNvb3JkaW5hdGVzIGludG8gdGhlIGxvY2FsXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBjb29yZGlhdGVzIG9mIHRoZSBiaWcgYm94LCBhbmQgdGhlbiBzZXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBzbWFsbCBib3ggdG8gdGhhdFxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHBvc2l0aW9uID0gdGhpcy5ib3gud29ybGRUb0xvY2FsKGludGVyc2VjdC5wb2ludClcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYm94Mi5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWRQb3NpdGlvbih0aGlzLmJveDIucG9zaXRpb24pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGRvIHNvbWV0aGluZyB3aXRoIHRoZSByYXlzIHdoZW4gbm90IGRyYWdnaW5nIG9yIGNsaWNraW5nLlxuICAgICAgICAgICAgICAgIC8vIEZvciBleGFtcGxlLCB3ZSBjb3VsZCBkaXNwbGF5IHNvbWUgYWRkaXRpb25hbCBjb250ZW50IHdoZW4gaG92ZXJpbmdcbiAgICAgICAgICAgICAgICBsZXQgcGFzc3RocnVJbnRlcmFjdG9yID0gdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5nZXRJbnRlcmFjdG9ycyh0aGlzLnNpbXBsZUNvbnRhaW5lcik7XG5cbiAgICAgICAgICAgICAgICAvLyB3ZSB3aWxsIHNldCB5ZWxsb3cgaWYgZWl0aGVyIGludGVyYWN0b3IgaGl0cyB0aGUgYm94LiBXZSdsbCBrZWVwIHRyYWNrIG9mIGlmXG4gICAgICAgICAgICAgICAgLy8gb25lIGRvZXNcbiAgICAgICAgICAgICAgICBsZXQgc2V0SXQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIC8vIGZvciBlYWNoIG9mIG91ciBpbnRlcmFjdG9ycywgY2hlY2sgaWYgaXQgaGl0cyB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhc3N0aHJ1SW50ZXJhY3Rvci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBsZXQgaW50ZXJzZWN0aW9uID0gdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5nZXRJbnRlcnNlY3Rpb24ocGFzc3RocnVJbnRlcmFjdG9yW2ldLCB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5jaGlsZHJlbilcblxuICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoaXQgdGhlIHNtYWxsIGJveCwgc2V0IHRoZSBjb2xvciB0byB5ZWxsb3csIGFuZCBmbGFnIHRoYXQgd2UgaGl0XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbnRlcnNlY3Rpb24gJiYgaW50ZXJzZWN0aW9uLm9iamVjdCA9PT0gdGhpcy5ib3gyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmJveDIubWF0ZXJpYWwuY29sb3Iuc2V0KFwieWVsbG93XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRJdCA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGlmIHdlIGRpZG4ndCBoaXQsIG1ha2Ugc3VyZSB0aGUgY29sb3IgcmVtYWlucyBibGFja1xuICAgICAgICAgICAgICAgIGlmICghc2V0SXQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLm1hdGVyaWFsLmNvbG9yLnNldChcImJsYWNrXCIpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmVuJ3QgZmluaXNoZWQgc2V0dGluZyB1cCB0aGUgbmV0d29ya2VkIGVudGl0eSBkb24ndCBkbyBhbnl0aGluZy5cbiAgICAgICAgICAgIGlmICghdGhpcy5uZXRFbnRpdHkgfHwgIXRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGlmIHRoZSBzdGF0ZSBoYXMgY2hhbmdlZCBpbiB0aGUgbmV0d29ya2VkIGRhdGEsIHVwZGF0ZSBvdXIgaHRtbCBvYmplY3RcbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCA9IGZhbHNlXG5cbiAgICAgICAgICAgICAgICAvLyBnb3QgdGhlIGRhdGEsIG5vdyBkbyBzb21ldGhpbmcgd2l0aCBpdFxuICAgICAgICAgICAgICAgIGxldCBuZXdEYXRhID0gdGhpcy5zdGF0ZVN5bmMuZGF0YU9iamVjdFxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YS5jb2xvci5zZXQobmV3RGF0YS5jb2xvcilcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEucm90YXRpb24uY29weShuZXdEYXRhLnJvdGF0aW9uKVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YS5wb3NpdGlvbi5jb3B5KG5ld0RhdGEucG9zaXRpb24pXG4gICAgICAgICAgICAgICAgdGhpcy5ib3gubWF0ZXJpYWwuY29sb3Iuc2V0KG5ld0RhdGEuY29sb3IpXG4gICAgICAgICAgICAgICAgdGhpcy5ib3gucm90YXRpb24uY29weShuZXdEYXRhLnJvdGF0aW9uKVxuICAgICAgICAgICAgICAgIHRoaXMuYm94Mi5wb3NpdGlvbi5jb3B5KG5ld0RhdGEucG9zaXRpb24pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIHJlZ2lzdGVyIHRoZSBjb21wb25lbnQgd2l0aCB0aGUgQUZyYW1lIHNjZW5lXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoY29tcG9uZW50TmFtZSwge1xuICAgIC4uLmNoaWxkLFxuICAgIC4uLnRlbXBsYXRlXG59KVxuXG4vLyBjcmVhdGUgYW5kIHJlZ2lzdGVyIHRoZSBkYXRhIGNvbXBvbmVudCBhbmQgaXQncyBOQUYgY29tcG9uZW50IHdpdGggdGhlIEFGcmFtZSBzY2VuZVxucmVnaXN0ZXJTaGFyZWRBRlJBTUVDb21wb25lbnRzKGNvbXBvbmVudE5hbWUpIiwiaW1wb3J0ICcuLi9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcG9ydGFsLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcGFyYWxsYXguanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvc2hhZGVyLnRzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy92aWRlby1jb250cm9sLXBhZCdcbmltcG9ydCAnLi4vY29tcG9uZW50cy90aHJlZS1zYW1wbGUuanMnXG5cbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywgJ2ltbWVyc2l2ZS0zNjAnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsICdwb3J0YWwnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3NoYWRlcicsICdzaGFkZXInKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4JywgJ3BhcmFsbGF4JylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdodG1sLXNjcmlwdCcsICdodG1sLXNjcmlwdCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncmVnaW9uLWhpZGVyJywgJ3JlZ2lvbi1oaWRlcicpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgndmlkZW8tY29udHJvbC1wYWQnLCAndmlkZW8tY29udHJvbC1wYWQnKVxuXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgndGVzdC1jdWJlJywgJ3Rlc3QtY3ViZScpXG5cbi8vIGRvIGEgc2ltcGxlIG1vbmtleSBwYXRjaCB0byBzZWUgaWYgaXQgd29ya3NcblxuLy8gdmFyIG15aXNNaW5lT3JMb2NhbCA9IGZ1bmN0aW9uICh0aGF0KSB7XG4vLyAgICAgcmV0dXJuICF0aGF0LmVsLmNvbXBvbmVudHMubmV0d29ya2VkIHx8ICh0aGF0Lm5ldHdvcmtlZEVsICYmIE5BRi51dGlscy5pc01pbmUodGhhdC5uZXR3b3JrZWRFbCkpO1xuLy8gIH1cblxuLy8gIHZhciB2aWRlb0NvbXAgPSBBRlJBTUUuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4vLyAgdmlkZW9Db21wLkNvbXBvbmVudC5wcm90b3R5cGUuaXNNaW5lT3JMb2NhbCA9IG15aXNNaW5lT3JMb2NhbDtcblxuLy8gbGV0IGhvbWVQYWdlRGVzYyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tjbGFzc149XCJIb21lUGFnZV9fYXBwLWRlc2NyaXB0aW9uXCJdJylcbi8vIGlmIChob21lUGFnZURlc2MpIHtcbi8vICAgICBob21lUGFnZURlc2MuaW5uZXJIVE1MID0gXCJSZWFsaXR5IE1lZGlhIEltbWVyc2l2ZSBFeHBlcmllbmNlPGJyPjxicj5BZnRlciBzaWduaW5nIGluLCB2aXNpdCA8YSBocmVmPSdodHRwczovL3JlYWxpdHltZWRpYS5kaWdpdGFsJz5yZWFsaXR5bWVkaWEuZGlnaXRhbDwvYT4gdG8gZ2V0IHN0YXJ0ZWRcIlxuLy8gfVxuXG5cbmZ1bmN0aW9uIGhpZGVMb2JieVNwaGVyZSgpIHtcbiAgICAvLyBAdHMtaWdub3JlXG4gICAgd2luZG93LkFQUC5zY2VuZS5hZGRFdmVudExpc3RlbmVyKCdzdGF0ZWFkZGVkJywgZnVuY3Rpb24oZXZ0OkN1c3RvbUV2ZW50KSB7IFxuICAgICAgICBpZiAoZXZ0LmRldGFpbCA9PT0gJ2VudGVyZWQnKSB7XG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgICB2YXIgbG9iYnlTcGhlcmUgPSB3aW5kb3cuQVBQLnNjZW5lLm9iamVjdDNELmdldE9iamVjdEJ5TmFtZSgnbG9iYnlTcGhlcmUnKVxuICAgICAgICAgICAgaWYgKGxvYmJ5U3BoZXJlKSB7XG4gICAgICAgICAgICAgICAgbG9iYnlTcGhlcmUudmlzaWJsZSA9IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuaWYgKGRvY3VtZW50LnJlYWR5U3RhdGUgPT09ICdjb21wbGV0ZScpIHtcbiAgICBoaWRlTG9iYnlTcGhlcmUoKTtcbn0gZWxzZSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGhpZGVMb2JieVNwaGVyZSk7XG59Il0sIm5hbWVzIjpbIndvcmxkQ2FtZXJhIiwid29ybGRTZWxmIiwiZGVmYXVsdEhvb2tzIiwiZ2xzbCIsInVuaWZvcm1zIiwibG9hZGVyIiwibm9pc2VUZXgiLCJzbWFsbE5vaXNlIiwid2FycFRleCIsInNub2lzZSIsIk1hdGVyaWFsTW9kaWZpZXIiLCJvbmNlIiwiaHRtbENvbXBvbmVudHMiLCJwYW5vdmVydCIsInBhbm9mcmFnIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLENBQUMsY0FB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c0IsR0FBR0QsTUFBSSxDQUFBOztTQUV0QztRQUNELFNBQVMsRUFBRUEsTUFBSSxDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztRQW9LZjtRQUNKLFVBQVUsRUFBRSxhQUFhO0tBQ3hCO0lBQ0QsSUFBSSxFQUFFLFVBQVMsUUFBMkM7UUFDdEQsSUFBSSxHQUFHLEdBQUksUUFBMEQsQ0FBQTtRQUVyRSxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFBO1FBQ3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUE7O1FBRXZELFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQTtRQUM3RCxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUdHLFVBQVEsQ0FBQTtRQUM1QyxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxHQUFHLElBQUksRUFBRSxDQUFBO0tBQzVEO0lBQ0QsY0FBYyxFQUFFLFVBQVMsSUFBWSxFQUFFLFFBQTJDO1FBQzlFLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksR0FBRyxLQUFLLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUE7UUFDN0UsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFT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RSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3BELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ2xDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ2xDLGNBQWMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsV0FBVyxFQUFFO1FBQzVDLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFO1FBQ3BDLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUU7UUFDckIsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDN0QsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDNUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUU7S0FDL0M7SUFDRCxZQUFZLEVBQUUsRUFBRTtJQUVoQixjQUFjLEVBQUU7UUFDWixRQUFRLEVBQUVBLE1BQUksQ0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O3FCQXdCRDtRQUNiLFNBQVMsRUFBRUEsTUFBSSxDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7S0FpSWxCO1FBQ0QsVUFBVSxFQUFFQSxNQUFJLENBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQXFCZjtLQUNBO0lBQ0QsSUFBSSxFQUFFLFVBQVMsUUFBMkM7UUFDdEQsSUFBSSxHQUFHLEdBQUksUUFBMEQsQ0FBQTtRQUVyRSxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFBO1FBQ3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUE7O1FBR3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUE7UUFJckYsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFFLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQTtRQUM1SCxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUUsS0FBSyxD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QXNCYjtRQUNELFVBQVUsRUFBRUEsTUFBSSxDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FxRWY7S0FDSjtJQUNELElBQUksRUFBRSxVQUFTLFFBQTJDO1FBQ3RELElBQUksR0FBRyxHQUFJLFFBQTBELENBQUE7UUFFckUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7UUFDNUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7O1FBRTVHLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFBO1FBQ3hFLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFDLEdBQUcsSUFBSSxFQUFFLENBQUE7UUFFdkQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQTs7UUFHekMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUE7UUFDekMsUUFBUSxDQUFDLFFBQVEsQ0FB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QTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQSxNQUFNQSxNQUFJLEdBQUcsQ0FBQztBQUNkO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBWUE7QUFDQSxNQUFNLFdBQVcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDdkMsTUFBTSxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQ3JDO0FBQ0EsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsYUFBYSxHQUFFO0FBQ3hDLElBQUksT0FBTyxHQUFHLEtBQUk7QUFDbEIsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEtBQUs7QUFDOUIsSUFBSSxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUM7QUFDekMsSUFBSSxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUM7QUFDekMsSUFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUM7QUFDdEMsSUFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUM7QUFDdEMsSUFBSSxPQUFPLEdBQUcsS0FBSTtBQUNsQixDQUFDLEVBQUM7QUFD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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBRSxDQUFDO0FBQ0g7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0EsTUFBTSxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQy9CLE1BQU0sT0FBTyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBQztBQUMxQztBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUU7QUFDckMsRUFBRSxNQUFNLEVB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
