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

        this.updatePortal = this.updatePortal.bind(this);

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

    updatePortal: async function () {
        // no-op for portals that use pre-rendered cube maps
        if (this.portalType == 2 || this.portalType == 3) { 
            //this.el.sceneEl.addEventListener('model-loaded', () => {
                showRegionForObject(this.el);
                this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D);
                // this.cubeCamera.renderTarget.texture.generateMipmaps = true
                // this.cubeCamera.renderTarget.texture.needsUpdate = true
                hiderRegionForObject(this.el);
            //}, once)
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
            this.updatePortal();
            this.el.sceneEl.addEventListener('updatePortals', this.updatePortal);
            this.el.sceneEl.addEventListener('model-loaded', this.updatePortal);
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

        this.close();
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
        this.el.sceneEl.removeEventListener('updatePortals', this.updatePortal);
        this.el.sceneEl.removeEventListener('model-loaded', this.updatePortal);

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

        try {
            this.script = new initScript(this.scriptData);
        } catch (e) {
            console.error("error creating script for " + this.componentName, e);
            this.script = null;
        }
        if (this.script){
            this.script.needsUpdate = true;
            // this.script.webLayer3D.refresh(true)
            // this.script.webLayer3D.update(true)

            this.script.readyPromise?.then(() => {
                // when a script finishes getting ready, tell the 
                // portals to update themselves
                this.el.sceneEl.emit('updatePortals'); 
            });
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

        // tell the portals to update their view
        this.el.sceneEl.emit('updatePortals'); 

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
// add the region-hider to the scene
// const scene = document.querySelector("a-scene");
// scene.setAttribute("region-hider", {size: 100})
let homePageDesc = document.querySelector('[class^="HomePage__app-description"]');
if (homePageDesc) {
    homePageDesc.innerHTML = "Reality Media Immersive Experience<br><br>After signing in, visit <a href='https://realitymedia.digital'>realitymedia.digital</a> to get started";
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1yb29tLmpzIiwic291cmNlcyI6WyIuLi9zcmMvc3lzdGVtcy9mYWRlci1wbHVzLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcHJveGltaXR5LWV2ZW50cy5qcyIsIi4uL3NyYy91dGlscy9jb21wb25lbnQtdXRpbHMuanMiLCIuLi9zcmMvdXRpbHMvc2NlbmUtZ3JhcGgudHMiLCIuLi9zcmMvY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMiLCIuLi9zcmMvdXRpbHMvZGVmYXVsdEhvb2tzLnRzIiwiLi4vc3JjL3V0aWxzL01hdGVyaWFsTW9kaWZpZXIudHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lNYWluLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95VW5pZm9ybU9iai50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveVVuaWZvcm1fcGFyYXMudHMiLCIuLi9zcmMvYXNzZXRzL2JheWVyLnBuZyIsIi4uL3NyYy9zaGFkZXJzL2JsZWVweS1ibG9ja3Mtc2hhZGVyLnRzIiwiLi4vc3JjL3NoYWRlcnMvbm9pc2UudHMiLCIuLi9zcmMvc2hhZGVycy9saXF1aWQtbWFyYmxlLnRzIiwiLi4vc3JjL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmciLCIuLi9zcmMvc2hhZGVycy9nYWxheHkudHMiLCIuLi9zcmMvc2hhZGVycy9sYWNlLXR1bm5lbC50cyIsIi4uL3NyYy9hc3NldHMvbm9pc2UtMjU2LnBuZyIsIi4uL3NyYy9zaGFkZXJzL2ZpcmUtdHVubmVsLnRzIiwiLi4vc3JjL3NoYWRlcnMvbWlzdC50cyIsIi4uL3NyYy9zaGFkZXJzL21hcmJsZTEudHMiLCIuLi9zcmMvYXNzZXRzL2JhZFNoYWRlci5qcGciLCIuLi9zcmMvc2hhZGVycy9ub3QtZm91bmQudHMiLCIuLi9zcmMvYXNzZXRzL3dhcnBmeC5wbmciLCIuLi9zcmMvc2hhZGVycy93YXJwLnRzIiwiLi4vc3JjL3NoYWRlcnMvc25vaXNlLnRzIiwiLi4vc3JjL3NoYWRlcnMvd2FycC1wb3J0YWwudHMiLCIuLi9zcmMvY29tcG9uZW50cy9zaGFkZXIudHMiLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfQ09MT1IuanBnIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0RJU1AuanBnIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX2dsb3NzaW5lc3MucG5nIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX05STS5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfT0NDLmpwZyIsIi4uL3NyYy91dGlscy93cml0ZUN1YmVNYXAuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wb3J0YWwuanMiLCIuLi9zcmMvYXNzZXRzL2JhbGxmeC5wbmciLCIuLi9zcmMvc2hhZGVycy9wYW5vYmFsbC52ZXJ0LmpzIiwiLi4vc3JjL3NoYWRlcnMvcGFub2JhbGwuZnJhZy5qcyIsIi4uL3NyYy9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMiLCIuLi9zcmMvc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wYXJhbGxheC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvdmlkZW8tY29udHJvbC1wYWQudHMiLCIuLi9zcmMvdXRpbHMvdGhyZWUtdXRpbHMuanMiLCIuLi9zcmMvdXRpbHMvaW50ZXJhY3Rpb24uanMiLCIuLi9zcmMvY29tcG9uZW50cy90aHJlZS1zYW1wbGUuanMiLCIuLi9zcmMvcm9vbXMvbWFpbi1yb29tLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG5BRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2ZhZGVyLXBsdXMnLCB7XG4gIHNjaGVtYToge1xuICAgIGRpcmVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ25vbmUnIH0sIC8vIFwiaW5cIiwgXCJvdXRcIiwgb3IgXCJub25lXCJcbiAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMjAwIH0sIC8vIFRyYW5zaXRpb24gZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogJ3doaXRlJyB9LFxuICB9LFxuXG4gIGluaXQoKSB7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KCksXG4gICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICBjb2xvcjogdGhpcy5kYXRhLmNvbG9yLFxuICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgb3BhY2l0eTogMCxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIGZvZzogZmFsc2UsXG4gICAgICB9KVxuICAgIClcbiAgICBtZXNoLnNjYWxlLnggPSBtZXNoLnNjYWxlLnkgPSAxXG4gICAgbWVzaC5zY2FsZS56ID0gMC4xNVxuICAgIG1lc2gubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgbWVzaC5yZW5kZXJPcmRlciA9IDEgLy8gcmVuZGVyIGFmdGVyIG90aGVyIHRyYW5zcGFyZW50IHN0dWZmXG4gICAgdGhpcy5lbC5jYW1lcmEuYWRkKG1lc2gpXG4gICAgdGhpcy5tZXNoID0gbWVzaFxuICB9LFxuXG4gIGZhZGVPdXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdvdXQnKVxuICB9LFxuXG4gIGZhZGVJbigpIHtcbiAgICByZXR1cm4gdGhpcy5iZWdpblRyYW5zaXRpb24oJ2luJylcbiAgfSxcblxuICBhc3luYyBiZWdpblRyYW5zaXRpb24oZGlyZWN0aW9uKSB7XG4gICAgaWYgKHRoaXMuX3Jlc29sdmVGaW5pc2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZhZGUgd2hpbGUgYSBmYWRlIGlzIGhhcHBlbmluZy4nKVxuICAgIH1cblxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdmYWRlci1wbHVzJywgeyBkaXJlY3Rpb24gfSlcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzKSA9PiB7XG4gICAgICBpZiAodGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPT09IChkaXJlY3Rpb24gPT0gJ2luJyA/IDAgOiAxKSkge1xuICAgICAgICByZXMoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IHJlc1xuICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgdGljayh0LCBkdCkge1xuICAgIGNvbnN0IG1hdCA9IHRoaXMubWVzaC5tYXRlcmlhbFxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gdGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcgfHwgbWF0Lm9wYWNpdHkgIT09IDBcbiAgICBpZiAoIXRoaXMubWVzaC52aXNpYmxlKSByZXR1cm5cblxuICAgIGlmICh0aGlzLmRhdGEuZGlyZWN0aW9uID09PSAnaW4nKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWF4KDAsIG1hdC5vcGFjaXR5IC0gKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcpIHtcbiAgICAgIG1hdC5vcGFjaXR5ID0gTWF0aC5taW4oMSwgbWF0Lm9wYWNpdHkgKyAoMS4wIC8gdGhpcy5kYXRhLmR1cmF0aW9uKSAqIE1hdGgubWluKGR0LCA1MCkpXG4gICAgfVxuXG4gICAgaWYgKG1hdC5vcGFjaXR5ID09PSAwIHx8IG1hdC5vcGFjaXR5ID09PSAxKSB7XG4gICAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiAhPT0gJ25vbmUnKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCgpXG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uOiAnbm9uZScgfSlcbiAgICB9XG4gIH0sXG59KVxuIiwiY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncHJveGltaXR5LWV2ZW50cycsIHtcbiAgc2NoZW1hOiB7XG4gICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH0sXG4gICAgZnV6ejogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC4xIH0sXG4gICAgWW9mZnNldDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMCB9LFxuICB9LFxuICBpbml0KCkge1xuICAgIHRoaXMuaW5ab25lID0gZmFsc2VcbiAgICB0aGlzLmNhbWVyYSA9IHRoaXMuZWwuc2NlbmVFbC5jYW1lcmFcbiAgfSxcbiAgdGljaygpIHtcbiAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgY29uc3Qgd2FzSW56b25lID0gdGhpcy5pblpvbmVcblxuICAgIHdvcmxkQ2FtZXJhLnkgLT0gdGhpcy5kYXRhLllvZmZzZXRcbiAgICB2YXIgZGlzdCA9IHdvcmxkQ2FtZXJhLmRpc3RhbmNlVG8od29ybGRTZWxmKVxuICAgIHZhciB0aHJlc2hvbGQgPSB0aGlzLmRhdGEucmFkaXVzICsgKHRoaXMuaW5ab25lID8gdGhpcy5kYXRhLmZ1enogIDogMClcbiAgICB0aGlzLmluWm9uZSA9IGRpc3QgPCB0aHJlc2hvbGRcbiAgICBpZiAodGhpcy5pblpvbmUgJiYgIXdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHllbnRlcicpXG4gICAgaWYgKCF0aGlzLmluWm9uZSAmJiB3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5bGVhdmUnKVxuICB9LFxufSlcbiIsIi8vIFByb3ZpZGVzIGEgZ2xvYmFsIHJlZ2lzdHJ5IG9mIHJ1bm5pbmcgY29tcG9uZW50c1xuLy8gY29waWVkIGZyb20gaHVicyBzb3VyY2VcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UoY29tcG9uZW50LCBuYW1lKSB7XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgfHwge307XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gfHwgW107XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5wdXNoKGNvbXBvbmVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UoY29tcG9uZW50LCBuYW1lKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdKSByZXR1cm47XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5zcGxpY2Uod2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5pbmRleE9mKGNvbXBvbmVudCksIDEpO1xufVxuICAiLCIvLyBjb3BpZWQgZnJvbSBodWJzXG5pbXBvcnQgeyBFbnRpdHksIENvbXBvbmVudCB9IGZyb20gJ2FmcmFtZSdcblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQoZW50aXR5OiBFbnRpdHksIGNvbXBvbmVudE5hbWU6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICAgIHdoaWxlIChlbnRpdHkgJiYgIShlbnRpdHkuY29tcG9uZW50cyAmJiBlbnRpdHkuY29tcG9uZW50c1tjb21wb25lbnROYW1lXSkpIHtcbiAgICAgIGVudGl0eSA9IChlbnRpdHkucGFyZW50Tm9kZSBhcyBFbnRpdHkpO1xuICAgIH1cbiAgICByZXR1cm4gZW50aXR5O1xuICB9XG4gIFxuICBleHBvcnQgZnVuY3Rpb24gZmluZENvbXBvbmVudHNJbk5lYXJlc3RBbmNlc3RvcihlbnRpdHk6IEVudGl0eSwgY29tcG9uZW50TmFtZTogc3RyaW5nKTogQ29tcG9uZW50W10ge1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBbXTtcbiAgICB3aGlsZSAoZW50aXR5KSB7XG4gICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgZm9yIChjb25zdCBjIGluIGVudGl0eS5jb21wb25lbnRzKSB7XG4gICAgICAgICAgaWYgKGVudGl0eS5jb21wb25lbnRzW2NdLm5hbWUgPT09IGNvbXBvbmVudE5hbWUpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudHMucHVzaChlbnRpdHkuY29tcG9uZW50c1tjXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gICAgICB9XG4gICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZSBhcyBFbnRpdHk7XG4gICAgfVxuICAgIHJldHVybiBjb21wb25lbnRzO1xuICB9XG4gICIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBicmVhayB0aGUgcm9vbSBpbnRvIHF1YWRyYW50cyBvZiBhIGNlcnRhaW4gc2l6ZSwgYW5kIGhpZGUgdGhlIGNvbnRlbnRzIG9mIGFyZWFzIHRoYXQgaGF2ZVxuICogbm9ib2R5IGluIHRoZW0uICBNZWRpYSB3aWxsIGJlIHBhdXNlZCBpbiB0aG9zZSBhcmVhcyB0b28uXG4gKiBcbiAqIEluY2x1ZGUgYSB3YXkgZm9yIHRoZSBwb3J0YWwgY29tcG9uZW50IHRvIHR1cm4gb24gZWxlbWVudHMgaW4gdGhlIHJlZ2lvbiBvZiB0aGUgcG9ydGFsIGJlZm9yZVxuICogaXQgY2FwdHVyZXMgYSBjdWJlbWFwXG4gKi9cblxuaW1wb3J0IHsgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSwgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlIH0gZnJvbSBcIi4uL3V0aWxzL2NvbXBvbmVudC11dGlsc1wiO1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuXG4gLy8gYXJiaXRyYXJpbHkgY2hvb3NlIDEwMDAwMDAgYXMgdGhlIG51bWJlciBvZiBjb21wdXRlZCB6b25lcyBpbiAgeCBhbmQgeVxubGV0IE1BWF9aT05FUyA9IDEwMDAwMDBcbmxldCByZWdpb25UYWcgPSBmdW5jdGlvbihzaXplLCBvYmozZCkge1xuICAgIGxldCBwb3MgPSBvYmozZC5wb3NpdGlvblxuICAgIGxldCB4cCA9IE1hdGguZmxvb3IocG9zLnggLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgbGV0IHpwID0gTWF0aC5mbG9vcihwb3MueiAvIHNpemUpICsgTUFYX1pPTkVTLzJcbiAgICByZXR1cm4gTUFYX1pPTkVTICogeHAgKyB6cFxufVxuXG5sZXQgcmVnaW9uc0luVXNlID0gW11cblxuLyoqXG4gKiBGaW5kIHRoZSBjbG9zZXN0IGFuY2VzdG9yIChpbmNsdWRpbmcgdGhlIHBhc3NlZCBpbiBlbnRpdHkpIHRoYXQgaGFzIGFuIGBvYmplY3QtcmVnaW9uLWZvbGxvd2VyYCBjb21wb25lbnQsXG4gKiBhbmQgcmV0dXJuIHRoYXQgY29tcG9uZW50XG4gKi9cbmZ1bmN0aW9uIGdldFJlZ2lvbkZvbGxvd2VyKGVudGl0eSkge1xuICAgIGxldCBjdXJFbnRpdHkgPSBlbnRpdHk7XG4gIFxuICAgIHdoaWxlKGN1ckVudGl0eSAmJiBjdXJFbnRpdHkuY29tcG9uZW50cyAmJiAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIGN1ckVudGl0eSA9IGN1ckVudGl0eS5wYXJlbnROb2RlO1xuICAgIH1cbiAgXG4gICAgaWYgKCFjdXJFbnRpdHkgfHwgIWN1ckVudGl0eS5jb21wb25lbnRzIHx8ICFjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdXG59XG4gIFxuZnVuY3Rpb24gYWRkVG9SZWdpb24ocmVnaW9uKSB7XG4gICAgcmVnaW9uc0luVXNlW3JlZ2lvbl0gPyByZWdpb25zSW5Vc2VbcmVnaW9uXSsrIDogcmVnaW9uc0luVXNlW3JlZ2lvbl0gPSAxXG4gICAgY29uc29sZS5sb2coXCJBdmF0YXJzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbiArIFwiOiBcIiArIHJlZ2lvbnNJblVzZVtyZWdpb25dKVxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAxKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdHJ1ZSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcImFscmVhZHkgYW5vdGhlciBhdmF0YXIgaW4gdGhpcyByZWdpb24sIG5vIGNoYW5nZVwiKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gc3VidHJhY3RGcm9tUmVnaW9uKHJlZ2lvbikge1xuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSkge3JlZ2lvbnNJblVzZVtyZWdpb25dLS0gfVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBsZWZ0IHJlZ2lvbiBcIiArIHJlZ2lvbiArIFwiOiBcIiArIHJlZ2lvbnNJblVzZVtyZWdpb25dKVxuXG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dID09IDApIHtcbiAgICAgICAgc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCBmYWxzZSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcInN0aWxsIGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93UmVnaW9uRm9yT2JqZWN0KGVsZW1lbnQpIHtcbiAgICBsZXQgZm9sbG93ZXIgPSBnZXRSZWdpb25Gb2xsb3dlcihlbGVtZW50KVxuICAgIGlmICghZm9sbG93ZXIpIHsgcmV0dXJuIH1cblxuICAgIGNvbnNvbGUubG9nKFwic2hvd2luZyBvYmplY3RzIG5lYXIgXCIgKyBmb2xsb3dlci5lbC5jbGFzc05hbWUpXG5cbiAgICBhZGRUb1JlZ2lvbihmb2xsb3dlci5yZWdpb24pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoaWRlclJlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcImhpZGluZyBvYmplY3RzIG5lYXIgXCIgKyBmb2xsb3dlci5lbC5jbGFzc05hbWUpXG5cbiAgICBzdWJ0cmFjdEZyb21SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5mdW5jdGlvbiBzaG93SGlkZU9iamVjdHMoKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQIHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5KVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zb2xlLmxvZyAoXCJzaG93aW5nL2hpZGluZyBhbGwgb2JqZWN0c1wiKVxuICAgIGNvbnN0IG9iamVjdHMgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSB8fCBbXTtcbiAgXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvYmplY3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBvYmogPSBvYmplY3RzW2ldO1xuICAgICAgXG4gICAgICBsZXQgdmlzaWJsZSA9IHJlZ2lvbnNJblVzZVtvYmoucmVnaW9uXSA/IHRydWU6IGZhbHNlXG4gICAgICAgIFxuICAgICAgaWYgKG9iai5lbC5vYmplY3QzRC52aXNpYmxlID09IHZpc2libGUpIHsgY29udGludWUgfVxuXG4gICAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmcgXCIgOiBcImhpZGluZyBcIikgKyBvYmouZWwuY2xhc3NOYW1lKVxuICAgICAgb2JqLnNob3dIaWRlKHZpc2libGUpXG4gICAgfVxuICBcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCB2aXNpYmxlKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQIHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5KVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmdcIiA6IFwiaGlkaW5nXCIpICsgXCIgYWxsIG9iamVjdHMgaW4gcmVnaW9uIFwiICsgcmVnaW9uKVxuICAgIGNvbnN0IG9iamVjdHMgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSB8fCBbXTtcbiAgXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvYmplY3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBvYmogPSBvYmplY3RzW2ldO1xuICAgICAgXG4gICAgICBpZiAob2JqLnJlZ2lvbiA9PSByZWdpb24pIHtcbiAgICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCIgaGlkaW5nXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgICAgb2JqLnNob3dIaWRlKHZpc2libGUpXG4gICAgICB9XG4gICAgfVxuICBcbiAgICByZXR1cm4gbnVsbDtcbn1cbiAgXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2F2YXRhci1yZWdpb24tZm9sbG93ZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcbiAgICAgICAgY29uc29sZS5sb2coXCJBdmF0YXI6IHJlZ2lvbiBcIiwgdGhpcy5yZWdpb24pXG4gICAgICAgIGFkZFRvUmVnaW9uKHRoaXMucmVnaW9uKVxuXG4gICAgICAgIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG4gICAgcmVtb3ZlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICAgICAgc3VidHJhY3RGcm9tUmVnaW9uKHRoaXMucmVnaW9uKVxuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCBuZXdSZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGlmIChuZXdSZWdpb24gIT0gdGhpcy5yZWdpb24pIHtcbiAgICAgICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICAgICAgICAgIGFkZFRvUmVnaW9uKG5ld1JlZ2lvbilcbiAgICAgICAgICAgIHRoaXMucmVnaW9uID0gbmV3UmVnaW9uXG4gICAgICAgIH1cbiAgICB9LFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdvYmplY3QtcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH0sXG4gICAgICAgIGR5bmFtaWM6IHsgZGVmYXVsdDogdHJ1ZSB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuXG4gICAgICAgIHRoaXMuc2hvd0hpZGUgPSB0aGlzLnNob3dIaWRlLmJpbmQodGhpcylcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICB0aGlzLndhc1BhdXNlZCA9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWRcbiAgICAgICAgfVxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZSBkb24ndCBtb3ZlXG4gICAgICAgIGlmICghdGhpcy5kYXRhLmR5bmFtaWMpIHsgcmV0dXJuIH1cblxuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICBsZXQgdmlzaWJsZSA9IHJlZ2lvbnNJblVzZVt0aGlzLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IHJldHVybiB9XG5cbiAgICAgICAgLy8gaGFuZGxlIHNob3cvaGlkaW5nIHRoZSBvYmplY3RzXG4gICAgICAgIHRoaXMuc2hvd0hpZGUodmlzaWJsZSlcbiAgICB9LFxuXG4gICAgc2hvd0hpZGU6IGZ1bmN0aW9uICh2aXNpYmxlKSB7XG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB2aXNpYmxlXG5cbiAgICAgICAgLy8vIGNoZWNrIGZvciBtZWRpYS12aWRlbyBjb21wb25lbnQgb24gcGFyZW50IHRvIHNlZSBpZiB3ZSdyZSBhIHZpZGVvLiAgQWxzbyBzYW1lIGZvciBhdWRpb1xuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0pIHtcbiAgICAgICAgICAgIGlmICh2aXNpYmxlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMud2FzUGF1c2VkICE9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLndhc1BhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS50b2dnbGVQbGF5aW5nKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gXCIqX2NvbXBvbmVudE5hbWVcIlxuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBwYXJlbnQgd2l0aCBcIm5hdi1tZXNoLWhlbHBlclwiLCB0aGlzIGlzIGluIHRoZSBzY2VuZS4gIFxuICAgICAgICAvLyBJZiBub3QsIGl0J3MgaW4gYW4gb2JqZWN0IHdlIGRyb3BwZWQgb24gdGhlIHdpbmRvdywgd2hpY2ggd2UgZG9uJ3Qgc3VwcG9ydFxuICAgICAgICBpZiAoIWZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJuYXYtbWVzaC1oZWxwZXJcIikpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJlZ2lvbi1oaWRlciBjb21wb25lbnQgbXVzdCBiZSBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZ2xiLlwiKVxuICAgICAgICAgICAgdGhpcy5zaXplID0gMDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYodGhpcy5kYXRhLnNpemUgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnNpemUgPSAxMDtcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGlzLm5ld1NjZW5lID0gdGhpcy5uZXdTY2VuZS5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMubmV3U2NlbmUpXG4gICAgICAgIC8vIGNvbnN0IGVudmlyb25tZW50U2NlbmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2Vudmlyb25tZW50LXNjZW5lXCIpO1xuICAgICAgICAvLyB0aGlzLmFkZFNjZW5lRWxlbWVudCA9IHRoaXMuYWRkU2NlbmVFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQgPSB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIGVudmlyb25tZW50U2NlbmUuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWF0dGFjaGVkXCIsIHRoaXMuYWRkU2NlbmVFbGVtZW50KVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudClcblxuICAgICAgICAvLyB3ZSB3YW50IHRvIG5vdGljZSB3aGVuIG5ldyB0aGluZ3MgZ2V0IGFkZGVkIHRvIHRoZSByb29tLiAgVGhpcyB3aWxsIGhhcHBlbiBmb3JcbiAgICAgICAgLy8gb2JqZWN0cyBkcm9wcGVkIGluIHRoZSByb29tLCBvciBmb3IgbmV3IHJlbW90ZSBhdmF0YXJzLCBhdCBsZWFzdFxuICAgICAgICAvLyB0aGlzLmFkZFJvb3RFbGVtZW50ID0gdGhpcy5hZGRSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQgPSB0aGlzLnJlbW92ZVJvb3RFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFJvb3RFbGVtZW50KVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWRldGFjaGVkXCIsIHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2FudCB0byBzZWUgaWYgdGhlcmUgYXJlIHBpbm5lZCBvYmplY3RzIHRoYXQgd2VyZSBsb2FkZWQgZnJvbSBodWJzXG4gICAgICAgIGxldCByb29tT2JqZWN0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoXCJSb29tT2JqZWN0c1wiKVxuICAgICAgICB0aGlzLnJvb21PYmplY3RzID0gcm9vbU9iamVjdHMubGVuZ3RoID4gMCA/IHJvb21PYmplY3RzWzBdIDogbnVsbFxuXG4gICAgICAgIC8vIGdldCBhdmF0YXJzXG4gICAgICAgIGNvbnN0IGF2YXRhcnMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltwbGF5ZXItaW5mb11cIik7XG4gICAgICAgIGF2YXRhcnMuZm9yRWFjaCgoYXZhdGFyKSA9PiB7XG4gICAgICAgICAgICBhdmF0YXIuc2V0QXR0cmlidXRlKFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIG9iamVjdHMgaW4gdGhlIHJvb3QgKHRoaW5ncyB0aGF0IGhhdmUgYmVlbiBkcm9wcGVkIG9uIHRoZSBzY2VuZSlcbiAgICAgICAgLy8gLSBkcmF3aW5ncyBoYXZlIGNsYXNzPVwiZHJhd2luZ1wiLCBuZXR3b3JrZWQtZHJhd2luZ1xuICAgICAgICAvLyBOb3QgZ29pbmcgdG8gZG8gZHJhd2luZ3MgcmlnaHQgbm93LlxuXG4gICAgICAgIC8vIHBpbm5lZCBtZWRpYSBsaXZlIHVuZGVyIGEgbm9kZSB3aXRoIGNsYXNzPVwiUm9vbU9iamVjdHNcIlxuICAgICAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIi5Sb29tT2JqZWN0cyA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLSBjYW1lcmEgaGFzIGNhbWVyYS10b29sICAgICAgICBcbiAgICAgICAgLy8gLSBpbWFnZSBmcm9tIGNhbWVyYSwgb3IgZHJvcHBlZCwgaGFzIG1lZGlhLWxvYWRlciwgbWVkaWEtaW1hZ2UsIGxpc3RlZC1tZWRpYVxuICAgICAgICAvLyAtIGdsYiBoYXMgbWVkaWEtbG9hZGVyLCBnbHRmLW1vZGVsLXBsdXMsIGxpc3RlZC1tZWRpYVxuICAgICAgICAvLyAtIHZpZGVvIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLXZpZGVvLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy9cbiAgICAgICAgLy8gIHNvLCBnZXQgYWxsIGNhbWVyYS10b29scywgYW5kIG1lZGlhLWxvYWRlciBvYmplY3RzIGF0IHRoZSB0b3AgbGV2ZWwgb2YgdGhlIHNjZW5lXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdLCBhLXNjZW5lID4gW21lZGlhLWxvYWRlcl1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHdhbGsgdGhlIG9iamVjdHMgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lLiAgTXVzdCB3YWl0IGZvciBzY2VuZSB0byBmaW5pc2ggbG9hZGluZ1xuICAgICAgICB0aGlzLnNjZW5lTG9hZGVkID0gdGhpcy5zY2VuZUxvYWRlZC5iaW5kKHRoaXMpXG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMuc2NlbmVMb2FkZWQpO1xuXG4gICAgfSxcblxuICAgIGlzQW5jZXN0b3I6IGZ1bmN0aW9uIChyb290LCBlbnRpdHkpIHtcbiAgICAgICAgd2hpbGUgKGVudGl0eSAmJiAhKGVudGl0eSA9PSByb290KSkge1xuICAgICAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAoZW50aXR5ID09IHJvb3QpO1xuICAgIH0sXG4gICAgXG4gICAgLy8gVGhpbmdzIHdlIGRvbid0IHdhbnQgdG8gaGlkZTpcbiAgICAvLyAtIFt3YXlwb2ludF1cbiAgICAvLyAtIHBhcmVudCBvZiBzb21ldGhpbmcgd2l0aCBbbmF2bWVzaF0gYXMgYSBjaGlsZCAodGhpcyBpcyB0aGUgbmF2aWdhdGlvbiBzdHVmZlxuICAgIC8vIC0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbFxuICAgIC8vIC0gW3NreWJveF1cbiAgICAvLyAtIFtkaXJlY3Rpb25hbC1saWdodF1cbiAgICAvLyAtIFthbWJpZW50LWxpZ2h0XVxuICAgIC8vIC0gW2hlbWlzcGhlcmUtbGlnaHRdXG4gICAgLy8gLSAjQ29tYmluZWRNZXNoXG4gICAgLy8gLSAjc2NlbmUtcHJldmlldy1jYW1lcmEgb3IgW3NjZW5lLXByZXZpZXctY2FtZXJhXVxuICAgIC8vXG4gICAgLy8gd2Ugd2lsbCBkb1xuICAgIC8vIC0gW21lZGlhLWxvYWRlcl1cbiAgICAvLyAtIFtzcG90LWxpZ2h0XVxuICAgIC8vIC0gW3BvaW50LWxpZ2h0XVxuICAgIHNjZW5lTG9hZGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCBub2RlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZW52aXJvbm1lbnQtc2NlbmVcIikuY2hpbGRyZW5bMF0uY2hpbGRyZW5bMF1cbiAgICAgICAgLy92YXIgbm9kZXMgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLnBhcmVudEVsLmNoaWxkTm9kZXM7XG4gICAgICAgIGZvciAobGV0IGk9MDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgbm9kZSA9IG5vZGVzW2ldXG4gICAgICAgICAgICAvL2lmIChub2RlID09IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwpIHtjb250aW51ZX1cbiAgICAgICAgICAgIGlmICh0aGlzLmlzQW5jZXN0b3Iobm9kZSwgdGhpcy5lbCkpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNsID0gbm9kZS5jbGFzc05hbWVcbiAgICAgICAgICAgIGlmIChjbCA9PT0gXCJDb21iaW5lZE1lc2hcIiB8fCBjbCA9PT0gXCJzY2VuZS1wcmV2aWV3LWNhbWVyYVwiKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjID0gbm9kZS5jb21wb25lbnRzXG4gICAgICAgICAgICBpZiAoY1tcIndheXBvaW50XCJdIHx8IGNbXCJza3lib3hcIl0gfHwgY1tcImRpcmVjdGlvbmFsLWxpZ2h0XCJdIHx8IGNbXCJhbWJpZW50LWxpZ2h0XCJdIHx8IGNbXCJoZW1pc3BoZXJlLWxpZ2h0XCJdKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjaCA9IG5vZGUuY2hpbGRyZW5cbiAgICAgICAgICAgIHZhciBuYXZtZXNoID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGxldCBqPTA7IGogPCBjaC5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChjaFtqXS5jb21wb25lbnRzW1wibmF2bWVzaFwiXSkge1xuICAgICAgICAgICAgICAgICAgICBuYXZtZXNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5hdm1lc2gpIHtjb250aW51ZX1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplLCBkeW5hbWljOiBmYWxzZSB9KVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWxsIG9iamVjdHMgYW5kIGF2YXRhciBzaG91bGQgYmUgc2V0IHVwLCBzbyBsZXRzIG1ha2Ugc3VyZSBhbGwgb2JqZWN0cyBhcmUgY29ycmVjdGx5IHNob3duXG4gICAgICAgIHNob3dIaWRlT2JqZWN0cygpXG4gICAgfSxcblxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLnNpemUgPT09IHRoaXMuc2l6ZSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5zaXplID0gMTBcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMuc2NlbmVMb2FkZWQpO1xuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICAvLyBzaXplID09IDAgaXMgdXNlZCB0byBzaWduYWwgXCJkbyBub3RoaW5nXCJcbiAgICAgICAgaWYgKHRoaXMuc2l6ZSA9PSAwKSB7cmV0dXJufVxuXG4gICAgICAgIC8vIHNlZSBpZiB0aGVyZSBhcmUgbmV3IGF2YXRhcnNcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dOm5vdChbYXZhdGFyLXJlZ2lvbi1mb2xsb3dlcl0pXCIpXG4gICAgICAgIG5vZGVzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gIHNlZSBpZiB0aGVyZSBhcmUgbmV3IGNhbWVyYS10b29scyBvciBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdOm5vdChbb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcl0pXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgXG4gICAgLy8gbmV3U2NlbmU6IGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW52aXJvbm1lbnQgc2NlbmUgbG9hZGVkOiBcIiwgbW9kZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIGFkZFJvb3RFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgYWRkZWQgdG8gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IHJlbW92ZWQgZnJvbSByb290OiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIGFkZFNjZW5lRWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIGVudmlyb25tZW50IHNjZW5lOiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIHJlbW92ZVNjZW5lRWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IHJlbW92ZWQgZnJvbSBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sICBcbiAgICBcbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoc2l6ZSkge1xuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJzaXplXCIgKGFuIGludGVnZXIgbnVtYmVyKVxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuICBUaGlzIHdpbGwgc2V0IHRoZSBoaWRkZXIgY29tcG9uZW50IHRvIFxuICAgICAgICAvLyB1c2UgdGhhdCBzaXplIGluIG1ldGVycyBmb3IgdGhlIHF1YWRyYW50c1xuICAgICAgICB0aGlzLm5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLm5vZGVOYW1lLm1hdGNoKC9fKFswLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMiwgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50TmFtZSBub3QgZm9ybWF0dGVkIGNvcnJlY3RseTogXCIsIHRoaXMubm9kZU5hbWUpXG4gICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG5vZGVTaXplID0gcGFyc2VJbnQocGFyYW1zWzFdKVxuICAgICAgICAgICAgaWYgKCFub2RlU2l6ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzaXplXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBub2RlU2l6ZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSkiLCJsZXQgRGVmYXVsdEhvb2tzID0ge1xuICAgIHZlcnRleEhvb2tzOiB7XG4gICAgICAgIHVuaWZvcm1zOiAnaW5zZXJ0YmVmb3JlOiNpbmNsdWRlIDxjb21tb24+XFxuJyxcbiAgICAgICAgZnVuY3Rpb25zOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGNsaXBwaW5nX3BsYW5lc19wYXJzX3ZlcnRleD5cXG4nLFxuICAgICAgICBwcmVUcmFuc2Zvcm06ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbicsXG4gICAgICAgIHBvc3RUcmFuc2Zvcm06ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8cHJvamVjdF92ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcHJlTm9ybWFsOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGJlZ2lubm9ybWFsX3ZlcnRleD5cXG4nXG4gICAgfSxcbiAgICBmcmFnbWVudEhvb2tzOiB7XG4gICAgICAgIHVuaWZvcm1zOiAnaW5zZXJ0YmVmb3JlOiNpbmNsdWRlIDxjb21tb24+XFxuJyxcbiAgICAgICAgZnVuY3Rpb25zOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGNsaXBwaW5nX3BsYW5lc19wYXJzX2ZyYWdtZW50PlxcbicsXG4gICAgICAgIHByZUZyYWdDb2xvcjogJ2luc2VydGJlZm9yZTpnbF9GcmFnQ29sb3IgPSB2ZWM0KCBvdXRnb2luZ0xpZ2h0LCBkaWZmdXNlQ29sb3IuYSApO1xcbicsXG4gICAgICAgIHBvc3RGcmFnQ29sb3I6ICdpbnNlcnRhZnRlcjpnbF9GcmFnQ29sb3IgPSB2ZWM0KCBvdXRnb2luZ0xpZ2h0LCBkaWZmdXNlQ29sb3IuYSApO1xcbicsXG4gICAgICAgIHBvc3RNYXA6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8bWFwX2ZyYWdtZW50PlxcbicsXG4gICAgICAgIHJlcGxhY2VNYXA6ICdyZXBsYWNlOiNpbmNsdWRlIDxtYXBfZnJhZ21lbnQ+XFxuJ1xuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgRGVmYXVsdEhvb2tzIiwiLy8gYmFzZWQgb24gaHR0cHM6Ly9naXRodWIuY29tL2phbWllb3dlbi90aHJlZS1tYXRlcmlhbC1tb2RpZmllclxuXG5pbXBvcnQgZGVmYXVsdEhvb2tzIGZyb20gJy4vZGVmYXVsdEhvb2tzJztcblxuaW50ZXJmYWNlIEV4dGVuZGVkTWF0ZXJpYWwge1xuICAgIHVuaWZvcm1zOiBVbmlmb3JtcztcbiAgICB2ZXJ0ZXhTaGFkZXI6IHN0cmluZztcbiAgICBmcmFnbWVudFNoYWRlcjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2hhZGVyRXh0ZW5zaW9uT3B0cyB7XG4gICAgdW5pZm9ybXM6IHsgW3VuaWZvcm06IHN0cmluZ106IGFueSB9O1xuICAgIHZlcnRleFNoYWRlcjogeyBbcGF0dGVybjogc3RyaW5nXTogc3RyaW5nIH07XG4gICAgZnJhZ21lbnRTaGFkZXI6IHsgW3BhdHRlcm46IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGNsYXNzTmFtZT86IHN0cmluZztcbiAgICBwb3N0TW9kaWZ5VmVydGV4U2hhZGVyPzogKHNoYWRlcjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gICAgcG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyPzogKHNoYWRlcjogc3RyaW5nKSA9PiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTaGFkZXJFeHRlbnNpb24gZXh0ZW5kcyBTaGFkZXJFeHRlbnNpb25PcHRzIHtcbiAgICBpbml0KG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpOiB2b2lkO1xuICAgIHVwZGF0ZVVuaWZvcm1zKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCk6IHZvaWRcbn1cblxuY29uc3QgbW9kaWZ5U291cmNlID0gKCBzb3VyY2U6IHN0cmluZywgaG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSwgaG9va3M6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApPT57XG4gICAgbGV0IG1hdGNoO1xuICAgIGZvciggbGV0IGtleSBpbiBob29rRGVmcyApe1xuICAgICAgICBpZiggaG9va3Nba2V5XSApe1xuICAgICAgICAgICAgbWF0Y2ggPSAvaW5zZXJ0KGJlZm9yZSk6KC4qKXxpbnNlcnQoYWZ0ZXIpOiguKil8KHJlcGxhY2UpOiguKikvLmV4ZWMoIGhvb2tEZWZzW2tleV0gKTtcblxuICAgICAgICAgICAgaWYoIG1hdGNoICl7XG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzFdICl7IC8vIGJlZm9yZVxuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSggbWF0Y2hbMl0sIGhvb2tzW2tleV0gKyAnXFxuJyArIG1hdGNoWzJdICk7XG4gICAgICAgICAgICAgICAgfWVsc2VcbiAgICAgICAgICAgICAgICBpZiggbWF0Y2hbM10gKXsgLy8gYWZ0ZXJcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzRdLCBtYXRjaFs0XSArICdcXG4nICsgaG9va3Nba2V5XSApO1xuICAgICAgICAgICAgICAgIH1lbHNlXG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzVdICl7IC8vIHJlcGxhY2VcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzZdLCBob29rc1trZXldICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHNvdXJjZTtcbn1cblxudHlwZSBVbmlmb3JtcyA9IHtcbiAgICBba2V5OiBzdHJpbmddOiBhbnk7XG59XG5cbi8vIGNvcGllZCBmcm9tIHRocmVlLnJlbmRlcmVycy5zaGFkZXJzLlVuaWZvcm1VdGlscy5qc1xuZXhwb3J0IGZ1bmN0aW9uIGNsb25lVW5pZm9ybXMoIHNyYzogVW5pZm9ybXMgKTogVW5pZm9ybXMge1xuXHR2YXIgZHN0OiBVbmlmb3JtcyA9IHt9O1xuXG5cdGZvciAoIHZhciB1IGluIHNyYyApIHtcblx0XHRkc3RbIHUgXSA9IHt9IDtcblx0XHRmb3IgKCB2YXIgcCBpbiBzcmNbIHUgXSApIHtcblx0XHRcdHZhciBwcm9wZXJ0eSA9IHNyY1sgdSBdWyBwIF07XG5cdFx0XHRpZiAoIHByb3BlcnR5ICYmICggcHJvcGVydHkuaXNDb2xvciB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc01hdHJpeDMgfHwgcHJvcGVydHkuaXNNYXRyaXg0IHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzVmVjdG9yMiB8fCBwcm9wZXJ0eS5pc1ZlY3RvcjMgfHwgcHJvcGVydHkuaXNWZWN0b3I0IHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzVGV4dHVyZSApICkge1xuXHRcdFx0XHQgICAgZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5LmNsb25lKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCBBcnJheS5pc0FycmF5KCBwcm9wZXJ0eSApICkge1xuXHRcdFx0XHRkc3RbIHUgXVsgcCBdID0gcHJvcGVydHkuc2xpY2UoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGRzdDtcbn1cblxudHlwZSBTdXBlckNsYXNzVHlwZXMgPSB0eXBlb2YgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuXG50eXBlIFN1cGVyQ2xhc3NlcyA9IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsIHwgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgfCBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHwgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwgfCBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuXG5pbnRlcmZhY2UgRXh0ZW5zaW9uRGF0YSB7XG4gICAgU2hhZGVyQ2xhc3M6IFN1cGVyQ2xhc3NUeXBlcztcbiAgICBTaGFkZXJMaWI6IFRIUkVFLlNoYWRlcjtcbiAgICBLZXk6IHN0cmluZyxcbiAgICBDb3VudDogbnVtYmVyLFxuICAgIE1vZGlmaWVkTmFtZSgpOiBzdHJpbmcsXG4gICAgVHlwZUNoZWNrOiBzdHJpbmdcbn1cblxubGV0IGNsYXNzTWFwOiB7W25hbWU6IHN0cmluZ106IHN0cmluZzt9ID0ge1xuICAgIE1lc2hTdGFuZGFyZE1hdGVyaWFsOiBcInN0YW5kYXJkXCIsXG4gICAgTWVzaEJhc2ljTWF0ZXJpYWw6IFwiYmFzaWNcIixcbiAgICBNZXNoTGFtYmVydE1hdGVyaWFsOiBcImxhbWJlcnRcIixcbiAgICBNZXNoUGhvbmdNYXRlcmlhbDogXCJwaG9uZ1wiLFxuICAgIE1lc2hEZXB0aE1hdGVyaWFsOiBcImRlcHRoXCIsXG4gICAgc3RhbmRhcmQ6IFwic3RhbmRhcmRcIixcbiAgICBiYXNpYzogXCJiYXNpY1wiLFxuICAgIGxhbWJlcnQ6IFwibGFtYmVydFwiLFxuICAgIHBob25nOiBcInBob25nXCIsXG4gICAgZGVwdGg6IFwiZGVwdGhcIlxufVxuXG5sZXQgc2hhZGVyTWFwOiB7W25hbWU6IHN0cmluZ106IEV4dGVuc2lvbkRhdGE7fVxuXG5jb25zdCBnZXRTaGFkZXJEZWYgPSAoIGNsYXNzT3JTdHJpbmc6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZyApPT57XG5cbiAgICBpZiggIXNoYWRlck1hcCApe1xuXG4gICAgICAgIGxldCBjbGFzc2VzOiB7W25hbWU6IHN0cmluZ106IFN1cGVyQ2xhc3NUeXBlczt9ID0ge1xuICAgICAgICAgICAgc3RhbmRhcmQ6IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsLFxuICAgICAgICAgICAgYmFzaWM6IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsLFxuICAgICAgICAgICAgbGFtYmVydDogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCxcbiAgICAgICAgICAgIHBob25nOiBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCxcbiAgICAgICAgICAgIGRlcHRoOiBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuICAgICAgICB9XG5cbiAgICAgICAgc2hhZGVyTWFwID0ge307XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGNsYXNzZXMgKXtcbiAgICAgICAgICAgIHNoYWRlck1hcFsga2V5IF0gPSB7XG4gICAgICAgICAgICAgICAgU2hhZGVyQ2xhc3M6IGNsYXNzZXNbIGtleSBdLFxuICAgICAgICAgICAgICAgIFNoYWRlckxpYjogVEhSRUUuU2hhZGVyTGliWyBrZXkgXSxcbiAgICAgICAgICAgICAgICBLZXk6IGtleSxcbiAgICAgICAgICAgICAgICBDb3VudDogMCxcbiAgICAgICAgICAgICAgICBNb2RpZmllZE5hbWU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgTW9kaWZpZWRNZXNoJHsgdGhpcy5LZXlbMF0udG9VcHBlckNhc2UoKSArIHRoaXMuS2V5LnNsaWNlKDEpIH1NYXRlcmlhbF8keyArK3RoaXMuQ291bnQgfWA7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBUeXBlQ2hlY2s6IGBpc01lc2gkeyBrZXlbMF0udG9VcHBlckNhc2UoKSArIGtleS5zbGljZSgxKSB9TWF0ZXJpYWxgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgc2hhZGVyRGVmOiBFeHRlbnNpb25EYXRhIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKCB0eXBlb2YgY2xhc3NPclN0cmluZyA9PT0gJ2Z1bmN0aW9uJyApe1xuICAgICAgICBmb3IoIGxldCBrZXkgaW4gc2hhZGVyTWFwICl7XG4gICAgICAgICAgICBpZiggc2hhZGVyTWFwWyBrZXkgXS5TaGFkZXJDbGFzcyA9PT0gY2xhc3NPclN0cmluZyApe1xuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IHNoYWRlck1hcFsga2V5IF07XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbGFzc09yU3RyaW5nID09PSAnc3RyaW5nJykge1xuICAgICAgICBsZXQgbWFwcGVkQ2xhc3NPclN0cmluZyA9IGNsYXNzTWFwWyBjbGFzc09yU3RyaW5nIF1cbiAgICAgICAgc2hhZGVyRGVmID0gc2hhZGVyTWFwWyBtYXBwZWRDbGFzc09yU3RyaW5nIHx8IGNsYXNzT3JTdHJpbmcgXTtcbiAgICB9XG5cbiAgICBpZiggIXNoYWRlckRlZiApe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdObyBTaGFkZXIgZm91bmQgdG8gbW9kaWZ5Li4uJyApO1xuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJEZWY7XG59XG5cbi8qKlxuICogVGhlIG1haW4gTWF0ZXJpYWwgTW9kb2ZpZXJcbiAqL1xuY2xhc3MgTWF0ZXJpYWxNb2RpZmllciB7XG4gICAgX3ZlcnRleEhvb2tzOiB7W3ZlcnRleGhvb2s6IHN0cmluZ106IHN0cmluZ31cbiAgICBfZnJhZ21lbnRIb29rczoge1tmcmFnZW1lbnRob29rOiBzdHJpbmddOiBzdHJpbmd9XG5cbiAgICBjb25zdHJ1Y3RvciggdmVydGV4SG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSwgZnJhZ21lbnRIb29rRGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICl7XG5cbiAgICAgICAgdGhpcy5fdmVydGV4SG9va3MgPSB7fTtcbiAgICAgICAgdGhpcy5fZnJhZ21lbnRIb29rcyA9IHt9O1xuXG4gICAgICAgIGlmKCB2ZXJ0ZXhIb29rRGVmcyApe1xuICAgICAgICAgICAgdGhpcy5kZWZpbmVWZXJ0ZXhIb29rcyggdmVydGV4SG9va0RlZnMgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCBmcmFnbWVudEhvb2tEZWZzICl7XG4gICAgICAgICAgICB0aGlzLmRlZmluZUZyYWdtZW50SG9va3MoIGZyYWdtZW50SG9va0RlZnMgKTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgbW9kaWZ5KCBzaGFkZXI6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZywgb3B0czogU2hhZGVyRXh0ZW5zaW9uT3B0cyApOiBFeHRlbmRlZE1hdGVyaWFsIHtcblxuICAgICAgICBsZXQgZGVmID0gZ2V0U2hhZGVyRGVmKCBzaGFkZXIgKTtcblxuICAgICAgICBsZXQgdmVydGV4U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLnZlcnRleFNoYWRlciwgdGhpcy5fdmVydGV4SG9va3MsIG9wdHMudmVydGV4U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCBmcmFnbWVudFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi5mcmFnbWVudFNoYWRlciwgdGhpcy5fZnJhZ21lbnRIb29rcywgb3B0cy5mcmFnbWVudFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgZGVmLlNoYWRlckxpYi51bmlmb3Jtcywgb3B0cy51bmlmb3JtcyB8fCB7fSApO1xuXG4gICAgICAgIHJldHVybiB7IHZlcnRleFNoYWRlcixmcmFnbWVudFNoYWRlcix1bmlmb3JtcyB9O1xuXG4gICAgfVxuXG4gICAgZXh0ZW5kKCBzaGFkZXI6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZywgb3B0czogU2hhZGVyRXh0ZW5zaW9uT3B0cyApOiB7IG5ldygpOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgfSB7XG5cbiAgICAgICAgbGV0IGRlZiA9IGdldFNoYWRlckRlZiggc2hhZGVyICk7IC8vIEFESlVTVCBUSElTIFNIQURFUiBERUYgLSBPTkxZIERFRklORSBPTkNFIC0gQU5EIFNUT1JFIEEgVVNFIENPVU5UIE9OIEVYVEVOREVEIFZFUlNJT05TLlxuXG4gICAgICAgIGxldCB2ZXJ0ZXhTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIudmVydGV4U2hhZGVyLCB0aGlzLl92ZXJ0ZXhIb29rcywgb3B0cy52ZXJ0ZXhTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IGZyYWdtZW50U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLmZyYWdtZW50U2hhZGVyLCB0aGlzLl9mcmFnbWVudEhvb2tzLCBvcHRzLmZyYWdtZW50U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBkZWYuU2hhZGVyTGliLnVuaWZvcm1zLCBvcHRzLnVuaWZvcm1zIHx8IHt9ICk7XG5cbiAgICAgICAgbGV0IENsYXNzTmFtZSA9IG9wdHMuY2xhc3NOYW1lIHx8IGRlZi5Nb2RpZmllZE5hbWUoKTtcblxuICAgICAgICBsZXQgZXh0ZW5kTWF0ZXJpYWwgPSBuZXcgRnVuY3Rpb24oICdCYXNlQ2xhc3MnLCAndW5pZm9ybXMnLCAndmVydGV4U2hhZGVyJywgJ2ZyYWdtZW50U2hhZGVyJywgJ2Nsb25lVW5pZm9ybXMnLGBcblxuICAgICAgICAgICAgbGV0IGNscyA9IGNsYXNzICR7Q2xhc3NOYW1lfSBleHRlbmRzIEJhc2VDbGFzcyB7XG4gICAgICAgICAgICAgICAgY29uc3RydWN0b3IoIHBhcmFtcyApe1xuICAgICAgICAgICAgICAgICAgICBzdXBlcihwYXJhbXMpXG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pZm9ybXMgPSBjbG9uZVVuaWZvcm1zKCB1bmlmb3JtcyApO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnZlcnRleFNoYWRlciA9IHZlcnRleFNoYWRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mcmFnbWVudFNoYWRlciA9IGZyYWdtZW50U2hhZGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRWYWx1ZXMoIHBhcmFtcyApO1xuICAgICAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgICAgICBjb3B5KCBzb3VyY2UgKXtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIuY29weShzb3VyY2UgKTtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBzb3VyY2UudW5pZm9ybXMgKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgIFxuICAgICAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHZhciBjbHMgPSBmdW5jdGlvbiAke0NsYXNzTmFtZX0oIHBhcmFtcyApe1xuXG4gICAgICAgICAgICAvLyAgICAgLy9CYXNlQ2xhc3MucHJvdG90eXBlLmNvbnN0cnVjdG9yLmNhbGwoIHRoaXMsIHBhcmFtcyApO1xuXG4gICAgICAgICAgICAvLyAgICAgdGhpcy51bmlmb3JtcyA9IGNsb25lVW5pZm9ybXMoIHVuaWZvcm1zICk7XG5cbiAgICAgICAgICAgIC8vICAgICB0aGlzLnZlcnRleFNoYWRlciA9IHZlcnRleFNoYWRlcjtcbiAgICAgICAgICAgIC8vICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAvLyAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG5cbiAgICAgICAgICAgIC8vICAgICB0aGlzLnNldFZhbHVlcyggcGFyYW1zICk7XG5cbiAgICAgICAgICAgIC8vIH1cblxuICAgICAgICAgICAgLy8gY2xzLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoIEJhc2VDbGFzcy5wcm90b3R5cGUgKTtcbiAgICAgICAgICAgIC8vIGNscy5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjbHM7XG4gICAgICAgICAgICAvLyBjbHMucHJvdG90eXBlLiR7IGRlZi5UeXBlQ2hlY2sgfSA9IHRydWU7XG5cbiAgICAgICAgICAgIC8vIGNscy5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uKCBzb3VyY2UgKXtcblxuICAgICAgICAgICAgLy8gICAgIEJhc2VDbGFzcy5wcm90b3R5cGUuY29weS5jYWxsKCB0aGlzLCBzb3VyY2UgKTtcblxuICAgICAgICAgICAgLy8gICAgIHRoaXMudW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgc291cmNlLnVuaWZvcm1zICk7XG4gICAgICAgICAgICAvLyAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAvLyAgICAgdGhpcy5mcmFnbWVudFNoYWRlciA9IGZyYWdtZW50U2hhZGVyO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuXG4gICAgICAgICAgICAvLyAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICAgICAgICAgIC8vIH1cblxuICAgICAgICAgICAgcmV0dXJuIGNscztcblxuICAgICAgICBgKTtcblxuICAgICAgICBpZiggb3B0cy5wb3N0TW9kaWZ5VmVydGV4U2hhZGVyICl7XG4gICAgICAgICAgICB2ZXJ0ZXhTaGFkZXIgPSBvcHRzLnBvc3RNb2RpZnlWZXJ0ZXhTaGFkZXIoIHZlcnRleFNoYWRlciApO1xuICAgICAgICB9XG4gICAgICAgIGlmKCBvcHRzLnBvc3RNb2RpZnlGcmFnbWVudFNoYWRlciApe1xuICAgICAgICAgICAgZnJhZ21lbnRTaGFkZXIgPSBvcHRzLnBvc3RNb2RpZnlGcmFnbWVudFNoYWRlciggZnJhZ21lbnRTaGFkZXIgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBleHRlbmRNYXRlcmlhbCggZGVmLlNoYWRlckNsYXNzLCB1bmlmb3JtcywgdmVydGV4U2hhZGVyLCBmcmFnbWVudFNoYWRlciwgY2xvbmVVbmlmb3JtcyApO1xuXG4gICAgfVxuXG4gICAgZGVmaW5lVmVydGV4SG9va3MoIGRlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApe1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBkZWZzICl7XG4gICAgICAgICAgICB0aGlzLl92ZXJ0ZXhIb29rc1sga2V5IF0gPSBkZWZzW2tleV07XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIGRlZmluZUZyYWdtZW50SG9va3MoIGRlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nIH0gKSB7XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGRlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuX2ZyYWdtZW50SG9va3NbIGtleSBdID0gZGVmc1trZXldO1xuICAgICAgICB9XG5cbiAgICB9XG5cbn1cblxubGV0IGRlZmF1bHRNYXRlcmlhbE1vZGlmaWVyID0gbmV3IE1hdGVyaWFsTW9kaWZpZXIoIGRlZmF1bHRIb29rcy52ZXJ0ZXhIb29rcywgZGVmYXVsdEhvb2tzLmZyYWdtZW50SG9va3MgKTtcblxuZXhwb3J0IHsgRXh0ZW5kZWRNYXRlcmlhbCwgTWF0ZXJpYWxNb2RpZmllciwgU2hhZGVyRXh0ZW5zaW9uLCBTaGFkZXJFeHRlbnNpb25PcHRzLCBkZWZhdWx0TWF0ZXJpYWxNb2RpZmllciAgYXMgRGVmYXVsdE1hdGVyaWFsTW9kaWZpZXJ9IiwiZXhwb3J0IGRlZmF1bHQgLyogZ2xzbCAqL2BcbiAgICAgICAgLy8gYWJvdmUgaGVyZSwgdGhlIHRleHR1cmUgbG9va3VwIHdpbGwgYmUgZG9uZSwgd2hpY2ggd2VcbiAgICAgICAgLy8gY2FuIGRpc2FibGUgYnkgcmVtb3ZpbmcgdGhlIG1hcCBmcm9tIHRoZSBtYXRlcmlhbFxuICAgICAgICAvLyBidXQgaWYgd2UgbGVhdmUgaXQsIHdlIGNhbiBhbHNvIGNob29zZSB0aGUgYmxlbmQgdGhlIHRleHR1cmVcbiAgICAgICAgLy8gd2l0aCBvdXIgc2hhZGVyIGNyZWF0ZWQgY29sb3IsIG9yIHVzZSBpdCBpbiB0aGUgc2hhZGVyIG9yXG4gICAgICAgIC8vIHdoYXRldmVyXG4gICAgICAgIC8vXG4gICAgICAgIC8vIHZlYzQgdGV4ZWxDb2xvciA9IHRleHR1cmUyRCggbWFwLCB2VXYgKTtcbiAgICAgICAgLy8gdGV4ZWxDb2xvciA9IG1hcFRleGVsVG9MaW5lYXIoIHRleGVsQ29sb3IgKTtcbiAgICAgICAgXG4gICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgLy9tb2QodlV2Lnh5ICogdGV4UmVwZWF0Lnh5ICsgdGV4T2Zmc2V0Lnh5LCB2ZWMyKDEuMCwxLjApKTtcblxuICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgaWYgKHRleEZsaXBZID4gMCkgeyB1di55ID0gMS4wIC0gdXYueTt9XG4gICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG4gICAgICAgIFxuICAgICAgICB2ZWM0IHNoYWRlckNvbG9yO1xuICAgICAgICBtYWluSW1hZ2Uoc2hhZGVyQ29sb3IsIHV2Lnh5ICogaVJlc29sdXRpb24ueHkpO1xuICAgICAgICBzaGFkZXJDb2xvciA9IG1hcFRleGVsVG9MaW5lYXIoIHNoYWRlckNvbG9yICk7XG5cbiAgICAgICAgZGlmZnVzZUNvbG9yICo9IHNoYWRlckNvbG9yO1xuYDtcbiIsImV4cG9ydCBkZWZhdWx0IHtcbiAgICBpVGltZTogeyB2YWx1ZTogMC4wIH0sXG4gICAgaVJlc29sdXRpb246ICB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMyg1MTIsIDUxMiwgMSkgfSxcbiAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSxcbiAgICB0ZXhGbGlwWTogeyB2YWx1ZTogMCB9XG59OyIsImV4cG9ydCBkZWZhdWx0IC8qIGdsc2wgKi9gXG51bmlmb3JtIHZlYzMgaVJlc29sdXRpb247XG51bmlmb3JtIGZsb2F0IGlUaW1lO1xudW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbnVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG51bmlmb3JtIGludCB0ZXhGbGlwWTsgXG4gIGA7XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9hNDQ4ZTM0YjgxMzZmYWU1LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgYmF5ZXJJbWFnZSBmcm9tICcuLi9hc3NldHMvYmF5ZXIucG5nJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIGJheWVyVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoYmF5ZXJJbWFnZSwgKGJheWVyKSA9PiB7XG4gICAgYmF5ZXIubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYXllci5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJheWVyLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmF5ZXIud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYXllclRleCA9IGJheWVyXG59KVxuXG5sZXQgQmxlZXB5QmxvY2tzU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gIHVuaWZvcm1zOiB1bmlmb3JtcyxcblxuICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gIGZyYWdtZW50U2hhZGVyOiB7IFxuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgIC8vIEJ5IERhZWRlbHVzOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3VzZXIvRGFlZGVsdXNcbiAgICAgIC8vIGxpY2Vuc2U6IENyZWF0aXZlIENvbW1vbnMgQXR0cmlidXRpb24tTm9uQ29tbWVyY2lhbC1TaGFyZUFsaWtlIDMuMCBVbnBvcnRlZCBMaWNlbnNlLlxuICAgICAgI2RlZmluZSBUSU1FU0NBTEUgMC4yNSBcbiAgICAgICNkZWZpbmUgVElMRVMgOFxuICAgICAgI2RlZmluZSBDT0xPUiAwLjcsIDEuNiwgMi44XG5cbiAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgIHtcbiAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICB1di54ICo9IGlSZXNvbHV0aW9uLnggLyBpUmVzb2x1dGlvbi55O1xuICAgICAgICBcbiAgICAgICAgdmVjNCBub2lzZSA9IHRleHR1cmUyRChpQ2hhbm5lbDAsIGZsb29yKHV2ICogZmxvYXQoVElMRVMpKSAvIGZsb2F0KFRJTEVTKSk7XG4gICAgICAgIGZsb2F0IHAgPSAxLjAgLSBtb2Qobm9pc2UuciArIG5vaXNlLmcgKyBub2lzZS5iICsgaVRpbWUgKiBmbG9hdChUSU1FU0NBTEUpLCAxLjApO1xuICAgICAgICBwID0gbWluKG1heChwICogMy4wIC0gMS44LCAwLjEpLCAyLjApO1xuICAgICAgICBcbiAgICAgICAgdmVjMiByID0gbW9kKHV2ICogZmxvYXQoVElMRVMpLCAxLjApO1xuICAgICAgICByID0gdmVjMihwb3coci54IC0gMC41LCAyLjApLCBwb3coci55IC0gMC41LCAyLjApKTtcbiAgICAgICAgcCAqPSAxLjAgLSBwb3cobWluKDEuMCwgMTIuMCAqIGRvdChyLCByKSksIDIuMCk7XG4gICAgICAgIFxuICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KENPTE9SLCAxLjApICogcDtcbiAgICAgIH1cbiAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IGJheWVyVGV4XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IGJheWVyVGV4XG4gICAgfVxuXG59XG5leHBvcnQgeyBCbGVlcHlCbG9ja3NTaGFkZXIgfVxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBOb2lzZVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgI2RlZmluZSBuUEkgMy4xNDE1OTI2NTM1ODk3OTMyXG5cbiAgICAgICAgbWF0MiBuX3JvdGF0ZTJkKGZsb2F0IGFuZ2xlKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWF0Mihjb3MoYW5nbGUpLC1zaW4oYW5nbGUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbihhbmdsZSksIGNvcyhhbmdsZSkpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBuX3N0cmlwZShmbG9hdCBudW1iZXIpIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBtb2QgPSBtb2QobnVtYmVyLCAyLjApO1xuICAgICAgICAgICAgICAgIC8vcmV0dXJuIHN0ZXAoMC41LCBtb2QpKnN0ZXAoMS41LCBtb2QpO1xuICAgICAgICAgICAgICAgIC8vcmV0dXJuIG1vZC0xLjA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1pbigxLjAsIChzbW9vdGhzdGVwKDAuMCwgMC41LCBtb2QpIC0gc21vb3Roc3RlcCgwLjUsIDEuMCwgbW9kKSkqMS4wKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKSB7XG4gICAgICAgICAgICAgICAgdmVjMiB1X3Jlc29sdXRpb24gPSBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgICAgICBmbG9hdCB1X3RpbWUgPSBpVGltZTtcbiAgICAgICAgICAgICAgICB2ZWMzIGNvbG9yO1xuICAgICAgICAgICAgICAgIHZlYzIgc3QgPSBmcmFnQ29vcmQueHk7XG4gICAgICAgICAgICAgICAgc3QgKz0gMjAwMC4wICsgOTk4MDAwLjAqc3RlcCgxLjc1LCAxLjAtc2luKHVfdGltZS84LjApKTtcbiAgICAgICAgICAgICAgICBzdCArPSB1X3RpbWUvMjAwMC4wO1xuICAgICAgICAgICAgICAgIGZsb2F0IG0gPSAoMS4wKzkuMCpzdGVwKDEuMCwgMS4wLXNpbih1X3RpbWUvOC4wKSkpLygxLjArOS4wKnN0ZXAoMS4wLCAxLjAtc2luKHVfdGltZS8xNi4wKSkpO1xuICAgICAgICAgICAgICAgIHZlYzIgc3QxID0gc3QgKiAoNDAwLjAgKyAxMjAwLjAqc3RlcCgxLjc1LCAxLjArc2luKHVfdGltZSkpIC0gMzAwLjAqc3RlcCgxLjUsIDEuMCtzaW4odV90aW1lLzMuMCkpKTtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoc2luKHN0MS54KSpzaW4oc3QxLnkpLyhtKjEwMC4wK3VfdGltZS8xMDAuMCkpICogc3Q7XG4gICAgICAgICAgICAgICAgdmVjMiBzdDIgPSBzdCAqICgxMDAuMCArIDE5MDAuMCpzdGVwKDEuNzUsIDEuMC1zaW4odV90aW1lLzIuMCkpKTtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoY29zKHN0Mi54KSpjb3Moc3QyLnkpLyhtKjEwMC4wK3VfdGltZS8xMDAuMCkpICogc3Q7XG4gICAgICAgICAgICAgICAgc3QgPSBuX3JvdGF0ZTJkKDAuNSpuUEkrKG5QSSowLjUqc3RlcCggMS4wLDEuMCsgc2luKHVfdGltZS8xLjApKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsoblBJKjAuMSpzdGVwKCAxLjAsMS4wKyBjb3ModV90aW1lLzIuMCkpKSt1X3RpbWUqMC4wMDAxKSAqIHN0O1xuICAgICAgICAgICAgICAgIHN0ICo9IDEwLjA7XG4gICAgICAgICAgICAgICAgc3QgLz0gdV9yZXNvbHV0aW9uO1xuICAgICAgICAgICAgICAgIGNvbG9yID0gdmVjMyhuX3N0cmlwZShzdC54KnVfcmVzb2x1dGlvbi54LzEwLjArdV90aW1lLzEwLjApKTtcbiAgICAgICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgICB9XG4gICAgICAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgTm9pc2VTaGFkZXIgfVxuIiwiLy8gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvWGRzQkRCXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmxldCBMaXF1aWRNYXJibGVTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiksXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAvLy8vIENPTE9SUyAvLy8vXG5cbiAgICAgIGNvbnN0IHZlYzMgT1JBTkdFID0gdmVjMygxLjAsIDAuNiwgMC4yKTtcbiAgICAgIGNvbnN0IHZlYzMgUElOSyAgID0gdmVjMygwLjcsIDAuMSwgMC40KTsgXG4gICAgICBjb25zdCB2ZWMzIEJMVUUgICA9IHZlYzMoMC4wLCAwLjIsIDAuOSk7IFxuICAgICAgY29uc3QgdmVjMyBCTEFDSyAgPSB2ZWMzKDAuMCwgMC4wLCAwLjIpO1xuICAgICAgXG4gICAgICAvLy8vLyBOT0lTRSAvLy8vL1xuICAgICAgXG4gICAgICBmbG9hdCBoYXNoKCBmbG9hdCBuICkge1xuICAgICAgICAgIC8vcmV0dXJuIGZyYWN0KHNpbihuKSo0Mzc1OC41NDUzMTIzKTsgICBcbiAgICAgICAgICByZXR1cm4gZnJhY3Qoc2luKG4pKjc1NzI4LjU0NTMxMjMpOyBcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgICBmbG9hdCBub2lzZSggaW4gdmVjMiB4ICkge1xuICAgICAgICAgIHZlYzIgcCA9IGZsb29yKHgpO1xuICAgICAgICAgIHZlYzIgZiA9IGZyYWN0KHgpO1xuICAgICAgICAgIGYgPSBmKmYqKDMuMC0yLjAqZik7XG4gICAgICAgICAgZmxvYXQgbiA9IHAueCArIHAueSo1Ny4wO1xuICAgICAgICAgIHJldHVybiBtaXgobWl4KCBoYXNoKG4gKyAwLjApLCBoYXNoKG4gKyAxLjApLCBmLngpLCBtaXgoaGFzaChuICsgNTcuMCksIGhhc2gobiArIDU4LjApLCBmLngpLCBmLnkpO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLy8vLy8gRkJNIC8vLy8vLyBcbiAgICAgIFxuICAgICAgbWF0MiBtID0gbWF0MiggMC42LCAwLjYsIC0wLjYsIDAuOCk7XG4gICAgICBmbG9hdCBmYm0odmVjMiBwKXtcbiAgICAgICBcbiAgICAgICAgICBmbG9hdCBmID0gMC4wO1xuICAgICAgICAgIGYgKz0gMC41MDAwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDI7XG4gICAgICAgICAgZiArPSAwLjI1MDAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMztcbiAgICAgICAgICBmICs9IDAuMTI1MCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAxO1xuICAgICAgICAgIGYgKz0gMC4wNjI1ICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDQ7XG4gICAgICAgICAgZiAvPSAwLjkzNzU7XG4gICAgICAgICAgcmV0dXJuIGY7XG4gICAgICB9XG4gICAgICBcbiAgICAgIFxuICAgICAgdm9pZCBtYWluSW1hZ2Uob3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCl7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gcGl4ZWwgcmF0aW9cbiAgICAgICAgICBcbiAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHkgOyAgXG4gICAgICAgICAgdmVjMiBwID0gLSAxLiArIDIuICogdXY7XG4gICAgICAgICAgcC54ICo9IGlSZXNvbHV0aW9uLnggLyBpUmVzb2x1dGlvbi55O1xuICAgICAgICAgICBcbiAgICAgICAgICAvLyBkb21haW5zXG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgciA9IHNxcnQoZG90KHAscCkpOyBcbiAgICAgICAgICBmbG9hdCBhID0gY29zKHAueSAqIHAueCk7ICBcbiAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgLy8gZGlzdG9ydGlvblxuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IGYgPSBmYm0oIDUuMCAqIHApO1xuICAgICAgICAgIGEgKz0gZmJtKHZlYzIoMS45IC0gcC54LCAwLjkgKiBpVGltZSArIHAueSkpO1xuICAgICAgICAgIGEgKz0gZmJtKDAuNCAqIHApO1xuICAgICAgICAgIHIgKz0gZmJtKDIuOSAqIHApO1xuICAgICAgICAgICAgIFxuICAgICAgICAgIC8vIGNvbG9yaXplXG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMyBjb2wgPSBCTFVFO1xuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IGZmID0gMS4wIC0gc21vb3Roc3RlcCgtMC40LCAxLjEsIG5vaXNlKHZlYzIoMC41ICogYSwgMy4zICogYSkpICk7ICAgICAgICBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIE9SQU5HRSwgZmYpO1xuICAgICAgICAgICAgIFxuICAgICAgICAgIGZmID0gMS4wIC0gc21vb3Roc3RlcCguMCwgMi44LCByICk7XG4gICAgICAgICAgY29sICs9ICBtaXgoIGNvbCwgQkxBQ0ssICBmZik7XG4gICAgICAgICAgXG4gICAgICAgICAgZmYgLT0gMS4wIC0gc21vb3Roc3RlcCgwLjMsIDAuNSwgZmJtKHZlYzIoMS4wLCA0MC4wICogYSkpICk7IFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgUElOSywgIGZmKTsgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKDIuLCAyLjksIGEgKiAxLjUgKTsgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBCTEFDSywgIGZmKTsgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoY29sLCAxLik7XG4gICAgICB9XG4gICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKG1hdC5tYXAub2Zmc2V0LngrIE1hdGgucmFuZG9tKCksIG1hdC5tYXAub2Zmc2V0LngrIE1hdGgucmFuZG9tKCkpIH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgfVxufVxuXG5leHBvcnQgeyBMaXF1aWRNYXJibGVTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvY2VjZWZiNTBlNDA4ZDEwNS5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNsR1dOXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvc21hbGwtbm9pc2UucG5nJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG59KVxuXG5sZXQgR2FsYXh5U2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy9DQlNcbiAgICAgICAgLy9QYXJhbGxheCBzY3JvbGxpbmcgZnJhY3RhbCBnYWxheHkuXG4gICAgICAgIC8vSW5zcGlyZWQgYnkgSm9zaFAncyBTaW1wbGljaXR5IHNoYWRlcjogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L2xzbEdXclxuICAgICAgICBcbiAgICAgICAgLy8gaHR0cDovL3d3dy5mcmFjdGFsZm9ydW1zLmNvbS9uZXctdGhlb3JpZXMtYW5kLXJlc2VhcmNoL3Zlcnktc2ltcGxlLWZvcm11bGEtZm9yLWZyYWN0YWwtcGF0dGVybnMvXG4gICAgICAgIGZsb2F0IGZpZWxkKGluIHZlYzMgcCxmbG9hdCBzKSB7XG4gICAgICAgICAgICBmbG9hdCBzdHJlbmd0aCA9IDcuICsgLjAzICogbG9nKDEuZS02ICsgZnJhY3Qoc2luKGlUaW1lKSAqIDQzNzMuMTEpKTtcbiAgICAgICAgICAgIGZsb2F0IGFjY3VtID0gcy80LjtcbiAgICAgICAgICAgIGZsb2F0IHByZXYgPSAwLjtcbiAgICAgICAgICAgIGZsb2F0IHR3ID0gMC47XG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IDI2OyArK2kpIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBtYWcgPSBkb3QocCwgcCk7XG4gICAgICAgICAgICAgICAgcCA9IGFicyhwKSAvIG1hZyArIHZlYzMoLS41LCAtLjQsIC0xLjUpO1xuICAgICAgICAgICAgICAgIGZsb2F0IHcgPSBleHAoLWZsb2F0KGkpIC8gNy4pO1xuICAgICAgICAgICAgICAgIGFjY3VtICs9IHcgKiBleHAoLXN0cmVuZ3RoICogcG93KGFicyhtYWcgLSBwcmV2KSwgMi4yKSk7XG4gICAgICAgICAgICAgICAgdHcgKz0gdztcbiAgICAgICAgICAgICAgICBwcmV2ID0gbWFnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1heCgwLiwgNS4gKiBhY2N1bSAvIHR3IC0gLjcpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBMZXNzIGl0ZXJhdGlvbnMgZm9yIHNlY29uZCBsYXllclxuICAgICAgICBmbG9hdCBmaWVsZDIoaW4gdmVjMyBwLCBmbG9hdCBzKSB7XG4gICAgICAgICAgICBmbG9hdCBzdHJlbmd0aCA9IDcuICsgLjAzICogbG9nKDEuZS02ICsgZnJhY3Qoc2luKGlUaW1lKSAqIDQzNzMuMTEpKTtcbiAgICAgICAgICAgIGZsb2F0IGFjY3VtID0gcy80LjtcbiAgICAgICAgICAgIGZsb2F0IHByZXYgPSAwLjtcbiAgICAgICAgICAgIGZsb2F0IHR3ID0gMC47XG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IDE4OyArK2kpIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBtYWcgPSBkb3QocCwgcCk7XG4gICAgICAgICAgICAgICAgcCA9IGFicyhwKSAvIG1hZyArIHZlYzMoLS41LCAtLjQsIC0xLjUpO1xuICAgICAgICAgICAgICAgIGZsb2F0IHcgPSBleHAoLWZsb2F0KGkpIC8gNy4pO1xuICAgICAgICAgICAgICAgIGFjY3VtICs9IHcgKiBleHAoLXN0cmVuZ3RoICogcG93KGFicyhtYWcgLSBwcmV2KSwgMi4yKSk7XG4gICAgICAgICAgICAgICAgdHcgKz0gdztcbiAgICAgICAgICAgICAgICBwcmV2ID0gbWFnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1heCgwLiwgNS4gKiBhY2N1bSAvIHR3IC0gLjcpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIG5yYW5kMyggdmVjMiBjbyApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgYSA9IGZyYWN0KCBjb3MoIGNvLngqOC4zZS0zICsgY28ueSApKnZlYzMoMS4zZTUsIDQuN2U1LCAyLjllNSkgKTtcbiAgICAgICAgICAgIHZlYzMgYiA9IGZyYWN0KCBzaW4oIGNvLngqMC4zZS0zICsgY28ueSApKnZlYzMoOC4xZTUsIDEuMGU1LCAwLjFlNSkgKTtcbiAgICAgICAgICAgIHZlYzMgYyA9IG1peChhLCBiLCAwLjUpO1xuICAgICAgICAgICAgcmV0dXJuIGM7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSAyLiAqIGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5IC0gMS47XG4gICAgICAgICAgICB2ZWMyIHV2cyA9IHV2ICogaVJlc29sdXRpb24ueHkgLyBtYXgoaVJlc29sdXRpb24ueCwgaVJlc29sdXRpb24ueSk7XG4gICAgICAgICAgICB2ZWMzIHAgPSB2ZWMzKHV2cyAvIDQuLCAwKSArIHZlYzMoMS4sIC0xLjMsIDAuKTtcbiAgICAgICAgICAgIHAgKz0gLjIgKiB2ZWMzKHNpbihpVGltZSAvIDE2LiksIHNpbihpVGltZSAvIDEyLiksICBzaW4oaVRpbWUgLyAxMjguKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGZyZXFzWzRdO1xuICAgICAgICAgICAgLy9Tb3VuZFxuICAgICAgICAgICAgZnJlcXNbMF0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMDEsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1sxXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4wNywgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzJdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjE1LCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbM10gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMzAsIDAuMjUgKSApLng7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdCA9IGZpZWxkKHAsZnJlcXNbMl0pO1xuICAgICAgICAgICAgZmxvYXQgdiA9ICgxLiAtIGV4cCgoYWJzKHV2LngpIC0gMS4pICogNi4pKSAqICgxLiAtIGV4cCgoYWJzKHV2LnkpIC0gMS4pICogNi4pKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9TZWNvbmQgTGF5ZXJcbiAgICAgICAgICAgIHZlYzMgcDIgPSB2ZWMzKHV2cyAvICg0LitzaW4oaVRpbWUqMC4xMSkqMC4yKzAuMitzaW4oaVRpbWUqMC4xNSkqMC4zKzAuNCksIDEuNSkgKyB2ZWMzKDIuLCAtMS4zLCAtMS4pO1xuICAgICAgICAgICAgcDIgKz0gMC4yNSAqIHZlYzMoc2luKGlUaW1lIC8gMTYuKSwgc2luKGlUaW1lIC8gMTIuKSwgIHNpbihpVGltZSAvIDEyOC4pKTtcbiAgICAgICAgICAgIGZsb2F0IHQyID0gZmllbGQyKHAyLGZyZXFzWzNdKTtcbiAgICAgICAgICAgIHZlYzQgYzIgPSBtaXgoLjQsIDEuLCB2KSAqIHZlYzQoMS4zICogdDIgKiB0MiAqIHQyICwxLjggICogdDIgKiB0MiAsIHQyKiBmcmVxc1swXSwgdDIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vTGV0J3MgYWRkIHNvbWUgc3RhcnNcbiAgICAgICAgICAgIC8vVGhhbmtzIHRvIGh0dHA6Ly9nbHNsLmhlcm9rdS5jb20vZSM2OTA0LjBcbiAgICAgICAgICAgIHZlYzIgc2VlZCA9IHAueHkgKiAyLjA7XHRcbiAgICAgICAgICAgIHNlZWQgPSBmbG9vcihzZWVkICogaVJlc29sdXRpb24ueCk7XG4gICAgICAgICAgICB2ZWMzIHJuZCA9IG5yYW5kMyggc2VlZCApO1xuICAgICAgICAgICAgdmVjNCBzdGFyY29sb3IgPSB2ZWM0KHBvdyhybmQueSw0MC4wKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vU2Vjb25kIExheWVyXG4gICAgICAgICAgICB2ZWMyIHNlZWQyID0gcDIueHkgKiAyLjA7XG4gICAgICAgICAgICBzZWVkMiA9IGZsb29yKHNlZWQyICogaVJlc29sdXRpb24ueCk7XG4gICAgICAgICAgICB2ZWMzIHJuZDIgPSBucmFuZDMoIHNlZWQyICk7XG4gICAgICAgICAgICBzdGFyY29sb3IgKz0gdmVjNChwb3cocm5kMi55LDQwLjApKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnJhZ0NvbG9yID0gbWl4KGZyZXFzWzNdLS4zLCAxLiwgdikgKiB2ZWM0KDEuNSpmcmVxc1syXSAqIHQgKiB0KiB0ICwgMS4yKmZyZXFzWzFdICogdCAqIHQsIGZyZXFzWzNdKnQsIDEuMCkrYzIrc3RhcmNvbG9yO1xuICAgICAgICB9XG4gICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTAwMDAwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBHYWxheHlTaGFkZXIgfVxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy80c0dTemNcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBMYWNlVHVubmVsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gQ3JlYXRlZCBieSBTdGVwaGFuZSBDdWlsbGVyZGllciAtIEFpZWtpY2svMjAxNSAodHdpdHRlcjpAYWlla2ljaylcbiAgICAgICAgLy8gTGljZW5zZSBDcmVhdGl2ZSBDb21tb25zIEF0dHJpYnV0aW9uLU5vbkNvbW1lcmNpYWwtU2hhcmVBbGlrZSAzLjAgVW5wb3J0ZWQgTGljZW5zZS5cbiAgICAgICAgLy8gVHVuZWQgdmlhIFhTaGFkZSAoaHR0cDovL3d3dy5mdW5wYXJhZGlnbS5jb20veHNoYWRlLylcbiAgICAgICAgXG4gICAgICAgIHZlYzIgbHRfbW8gPSB2ZWMyKDApO1xuICAgICAgICBcbiAgICAgICAgZmxvYXQgbHRfcG4oIGluIHZlYzMgeCApIC8vIGlxIG5vaXNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgcCA9IGZsb29yKHgpO1xuICAgICAgICAgICAgdmVjMyBmID0gZnJhY3QoeCk7XG4gICAgICAgICAgICBmID0gZipmKigzLjAtMi4wKmYpO1xuICAgICAgICAgICAgdmVjMiB1diA9IChwLnh5K3ZlYzIoMzcuMCwxNy4wKSpwLnopICsgZi54eTtcbiAgICAgICAgICAgIHZlYzIgcmcgPSB0ZXh0dXJlKGlDaGFubmVsMCwgKHV2KyAwLjUpLzI1Ni4wLCAtMTAwLjAgKS55eDtcbiAgICAgICAgICAgIHJldHVybiAtMS4wKzIuNCptaXgoIHJnLngsIHJnLnksIGYueiApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMyIGx0X3BhdGgoZmxvYXQgdClcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIHZlYzIoY29zKHQqMC4yKSwgc2luKHQqMC4yKSkgKiAyLjtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teCA9IG1hdDMoMSwwLDAsMCw3LDAsMCwwLDcpO1xuICAgICAgICBjb25zdCBtYXQzIGx0X215ID0gbWF0Myg3LDAsMCwwLDEsMCwwLDAsNyk7XG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXogPSBtYXQzKDcsMCwwLDAsNywwLDAsMCwxKTtcbiAgICAgICAgXG4gICAgICAgIC8vIGJhc2Ugb24gc2hhbmUgdGVjaCBpbiBzaGFkZXIgOiBPbmUgVHdlZXQgQ2VsbHVsYXIgUGF0dGVyblxuICAgICAgICBmbG9hdCBsdF9mdW5jKHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgcCA9IGZyYWN0KHAvNjguNikgLSAuNTtcbiAgICAgICAgICAgIHJldHVybiBtaW4obWluKGFicyhwLngpLCBhYnMocC55KSksIGFicyhwLnopKSArIDAuMTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBsdF9lZmZlY3QodmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwICo9IGx0X216ICogbHRfbXggKiBsdF9teSAqIHNpbihwLnp4eSk7IC8vIHNpbihwLnp4eSkgaXMgYmFzZWQgb24gaXEgdGVjaCBmcm9tIHNoYWRlciAoU2N1bHB0dXJlIElJSSlcbiAgICAgICAgICAgIHJldHVybiB2ZWMzKG1pbihtaW4obHRfZnVuYyhwKmx0X214KSwgbHRfZnVuYyhwKmx0X215KSksIGx0X2Z1bmMocCpsdF9teikpLy42KTtcbiAgICAgICAgfVxuICAgICAgICAvL1xuICAgICAgICBcbiAgICAgICAgdmVjNCBsdF9kaXNwbGFjZW1lbnQodmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGNvbCA9IDEuLWx0X2VmZmVjdChwKjAuOCk7XG4gICAgICAgICAgICAgICBjb2wgPSBjbGFtcChjb2wsIC0uNSwgMS4pO1xuICAgICAgICAgICAgZmxvYXQgZGlzdCA9IGRvdChjb2wsdmVjMygwLjAyMykpO1xuICAgICAgICAgICAgY29sID0gc3RlcChjb2wsIHZlYzMoMC44MikpOy8vIGJsYWNrIGxpbmUgb24gc2hhcGVcbiAgICAgICAgICAgIHJldHVybiB2ZWM0KGRpc3QsY29sKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjNCBsdF9tYXAodmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwLnh5IC09IGx0X3BhdGgocC56KTtcbiAgICAgICAgICAgIHZlYzQgZGlzcCA9IGx0X2Rpc3BsYWNlbWVudChzaW4ocC56eHkqMi4pKjAuOCk7XG4gICAgICAgICAgICBwICs9IHNpbihwLnp4eSouNSkqMS41O1xuICAgICAgICAgICAgZmxvYXQgbCA9IGxlbmd0aChwLnh5KSAtIDQuO1xuICAgICAgICAgICAgcmV0dXJuIHZlYzQobWF4KC1sICsgMC4wOSwgbCkgLSBkaXNwLngsIGRpc3AueXp3KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBsdF9ub3IoIGluIHZlYzMgcG9zLCBmbG9hdCBwcmVjIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBlcHMgPSB2ZWMzKCBwcmVjLCAwLiwgMC4gKTtcbiAgICAgICAgICAgIHZlYzMgbHRfbm9yID0gdmVjMyhcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy54eXkpLnggLSBsdF9tYXAocG9zLWVwcy54eXkpLngsXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueXh5KS54IC0gbHRfbWFwKHBvcy1lcHMueXh5KS54LFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnl5eCkueCAtIGx0X21hcChwb3MtZXBzLnl5eCkueCApO1xuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShsdF9ub3IpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgdmVjNCBsdF9saWdodCh2ZWMzIHJvLCB2ZWMzIHJkLCBmbG9hdCBkLCB2ZWMzIGxpZ2h0cG9zLCB2ZWMzIGxjKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIHAgPSBybyArIHJkICogZDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gb3JpZ2luYWwgbm9ybWFsZVxuICAgICAgICAgICAgdmVjMyBuID0gbHRfbm9yKHAsIDAuMSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgbGlnaHRkaXIgPSBsaWdodHBvcyAtIHA7XG4gICAgICAgICAgICBmbG9hdCBsaWdodGxlbiA9IGxlbmd0aChsaWdodHBvcyAtIHApO1xuICAgICAgICAgICAgbGlnaHRkaXIgLz0gbGlnaHRsZW47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGFtYiA9IDAuNjtcbiAgICAgICAgICAgIGZsb2F0IGRpZmYgPSBjbGFtcCggZG90KCBuLCBsaWdodGRpciApLCAwLjAsIDEuMCApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBicmRmID0gdmVjMygwKTtcbiAgICAgICAgICAgIGJyZGYgKz0gYW1iICogdmVjMygwLjIsMC41LDAuMyk7IC8vIGNvbG9yIG1hdFxuICAgICAgICAgICAgYnJkZiArPSBkaWZmICogMC42O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmRmID0gbWl4KGJyZGYsIGx0X21hcChwKS55encsIDAuNSk7Ly8gbWVyZ2UgbGlnaHQgYW5kIGJsYWNrIGxpbmUgcGF0dGVyblxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHZlYzQoYnJkZiwgbGlnaHRsZW4pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X3N0YXJzKHZlYzIgdXYsIHZlYzMgcmQsIGZsb2F0IGQsIHZlYzIgcywgdmVjMiBnKVxuICAgICAgICB7XG4gICAgICAgICAgICB1diAqPSA4MDAuICogcy54L3MueTtcbiAgICAgICAgICAgIGZsb2F0IGsgPSBmcmFjdCggY29zKHV2LnkgKiAwLjAwMDEgKyB1di54KSAqIDkwMDAwLik7XG4gICAgICAgICAgICBmbG9hdCB2YXIgPSBzaW4obHRfcG4oZCowLjYrcmQqMTgyLjE0KSkqMC41KzAuNTsvLyB0aGFuayB0byBrbGVtcyBmb3IgdGhlIHZhcmlhdGlvbiBpbiBteSBzaGFkZXIgc3VibHVtaW5pY1xuICAgICAgICAgICAgdmVjMyBjb2wgPSB2ZWMzKG1peCgwLiwgMS4sIHZhcipwb3coaywgMjAwLikpKTsvLyBjb21lIGZyb20gQ0JTIFNoYWRlciBcIlNpbXBsaWNpdHlcIiA6IGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc2xHV05cbiAgICAgICAgICAgIHJldHVybiBjb2w7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vLy8vLy8vTUFJTi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHMgPSBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgIHZlYzIgZyA9IGZyYWdDb29yZDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHRpbWUgPSBpVGltZSoxLjA7XG4gICAgICAgICAgICBmbG9hdCBjYW1fYSA9IHRpbWU7IC8vIGFuZ2xlIHpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgY2FtX2UgPSAzLjI7IC8vIGVsZXZhdGlvblxuICAgICAgICAgICAgZmxvYXQgY2FtX2QgPSA0LjsgLy8gZGlzdGFuY2UgdG8gb3JpZ2luIGF4aXNcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgbWF4ZCA9IDQwLjsgLy8gcmF5IG1hcmNoaW5nIGRpc3RhbmNlIG1heFxuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIHV2ID0gKGcqMi4tcykvcy55O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHZlYzMoMC4pO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgcm8gPSB2ZWMzKGx0X3BhdGgodGltZSkrbHRfbW8sdGltZSk7XG4gICAgICAgICAgICAgIHZlYzMgY3YgPSB2ZWMzKGx0X3BhdGgodGltZSswLjEpK2x0X21vLHRpbWUrMC4xKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBjdT12ZWMzKDAsMSwwKTtcbiAgICAgICAgICAgICAgdmVjMyByb3YgPSBub3JtYWxpemUoY3Ytcm8pO1xuICAgICAgICAgICAgdmVjMyB1ID0gbm9ybWFsaXplKGNyb3NzKGN1LHJvdikpO1xuICAgICAgICAgICAgICB2ZWMzIHYgPSBjcm9zcyhyb3YsdSk7XG4gICAgICAgICAgICAgIHZlYzMgcmQgPSBub3JtYWxpemUocm92ICsgdXYueCp1ICsgdXYueSp2KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBjdXJ2ZTAgPSB2ZWMzKDApO1xuICAgICAgICAgICAgdmVjMyBjdXJ2ZTEgPSB2ZWMzKDApO1xuICAgICAgICAgICAgdmVjMyBjdXJ2ZTIgPSB2ZWMzKDApO1xuICAgICAgICAgICAgZmxvYXQgb3V0U3RlcCA9IDAuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBhbyA9IDAuOyAvLyBhbyBsb3cgY29zdCA6KVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBzdCA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgZCA9IDAuO1xuICAgICAgICAgICAgZm9yKGludCBpPTA7aTwyNTA7aSsrKVxuICAgICAgICAgICAgeyAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChzdDwwLjAyNSpsb2coZCpkL3N0LzFlNSl8fGQ+bWF4ZCkgYnJlYWs7Ly8gc3BlY2lhbCBicmVhayBjb25kaXRpb24gZm9yIGxvdyB0aGlja25lc3Mgb2JqZWN0XG4gICAgICAgICAgICAgICAgc3QgPSBsdF9tYXAocm8rcmQqZCkueDtcbiAgICAgICAgICAgICAgICBkICs9IHN0ICogMC42OyAvLyB0aGUgMC42IGlzIHNlbGVjdGVkIGFjY29yZGluZyB0byB0aGUgMWU1IGFuZCB0aGUgMC4wMjUgb2YgdGhlIGJyZWFrIGNvbmRpdGlvbiBmb3IgZ29vZCByZXN1bHRcbiAgICAgICAgICAgICAgICBhbysrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZCA8IG1heGQpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmVjNCBsaSA9IGx0X2xpZ2h0KHJvLCByZCwgZCwgcm8sIHZlYzMoMCkpOy8vIHBvaW50IGxpZ2h0IG9uIHRoZSBjYW1cbiAgICAgICAgICAgICAgICBjb2wgPSBsaS54eXovKGxpLncqMC4yKTsvLyBjaGVhcCBsaWdodCBhdHRlbnVhdGlvblxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgIGNvbCA9IG1peCh2ZWMzKDEuLWFvLzEwMC4pLCBjb2wsIDAuNSk7Ly8gbG93IGNvc3QgYW8gOilcbiAgICAgICAgICAgICAgICBmcmFnQ29sb3IucmdiID0gbWl4KCBjb2wsIHZlYzMoMCksIDEuMC1leHAoIC0wLjAwMypkKmQgKSApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgZnJhZ0NvbG9yLnJnYiA9IGx0X3N0YXJzKHV2LCByZCwgZCwgcywgZnJhZ0Nvb3JkKTsvLyBzdGFycyBiZ1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB2aWduZXR0ZVxuICAgICAgICAgICAgdmVjMiBxID0gZnJhZ0Nvb3JkL3M7XG4gICAgICAgICAgICBmcmFnQ29sb3IucmdiICo9IDAuNSArIDAuNSpwb3coIDE2LjAqcS54KnEueSooMS4wLXEueCkqKDEuMC1xLnkpLCAwLjI1ICk7IC8vIGlxIHZpZ25ldHRlXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgIH1cbn1cblxuZXhwb3J0IHsgTGFjZVR1bm5lbFNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9mMjdlMDEwNDYwNWYwY2Q3LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9NZGZHUlhcblxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9ub2lzZS0yNTYucG5nJ1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgaUNoYW5uZWxSZXNvbHV0aW9uOiB7IHZhbHVlOiBbIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKV0gfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG4gICAgY29uc29sZS5sb2coIFwibm9pc2UgdGV4dHVyZSBzaXplOiBcIiwgbm9pc2UuaW1hZ2Uud2lkdGgsbm9pc2UuaW1hZ2UuaGVpZ2h0ICk7XG59KVxuXG5sZXQgRmlyZVR1bm5lbFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgdW5pZm9ybSB2ZWMzIGlDaGFubmVsUmVzb2x1dGlvbls0XTtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBDcmVhdGVkIGJ5IGluaWdvIHF1aWxleiAtIGlxLzIwMTNcbi8vIEkgc2hhcmUgdGhpcyBwaWVjZSAoYXJ0IGFuZCBjb2RlKSBoZXJlIGluIFNoYWRlcnRveSBhbmQgdGhyb3VnaCBpdHMgUHVibGljIEFQSSwgb25seSBmb3IgZWR1Y2F0aW9uYWwgcHVycG9zZXMuIFxuLy8gWW91IGNhbm5vdCB1c2UsIHNlbGwsIHNoYXJlIG9yIGhvc3QgdGhpcyBwaWVjZSBvciBtb2RpZmljYXRpb25zIG9mIGl0IGFzIHBhcnQgb2YgeW91ciBvd24gY29tbWVyY2lhbCBvciBub24tY29tbWVyY2lhbCBwcm9kdWN0LCB3ZWJzaXRlIG9yIHByb2plY3QuXG4vLyBZb3UgY2FuIHNoYXJlIGEgbGluayB0byBpdCBvciBhbiB1bm1vZGlmaWVkIHNjcmVlbnNob3Qgb2YgaXQgcHJvdmlkZWQgeW91IGF0dHJpYnV0ZSBcImJ5IEluaWdvIFF1aWxleiwgQGlxdWlsZXpsZXMgYW5kIGlxdWlsZXpsZXMub3JnXCIuIFxuLy8gSWYgeW91IGFyZSBhIHRlY2hlciwgbGVjdHVyZXIsIGVkdWNhdG9yIG9yIHNpbWlsYXIgYW5kIHRoZXNlIGNvbmRpdGlvbnMgYXJlIHRvbyByZXN0cmljdGl2ZSBmb3IgeW91ciBuZWVkcywgcGxlYXNlIGNvbnRhY3QgbWUgYW5kIHdlJ2xsIHdvcmsgaXQgb3V0LlxuXG5mbG9hdCBmaXJlX25vaXNlKCBpbiB2ZWMzIHggKVxue1xuICAgIHZlYzMgcCA9IGZsb29yKHgpO1xuICAgIHZlYzMgZiA9IGZyYWN0KHgpO1xuXHRmID0gZipmKigzLjAtMi4wKmYpO1xuXHRcblx0dmVjMiB1diA9IChwLnh5K3ZlYzIoMzcuMCwxNy4wKSpwLnopICsgZi54eTtcblx0dmVjMiByZyA9IHRleHR1cmVMb2QoIGlDaGFubmVsMCwgKHV2KyAwLjUpLzI1Ni4wLCAwLjAgKS55eDtcblx0cmV0dXJuIG1peCggcmcueCwgcmcueSwgZi56ICk7XG59XG5cbnZlYzQgZmlyZV9tYXAoIHZlYzMgcCApXG57XG5cdGZsb2F0IGRlbiA9IDAuMiAtIHAueTtcblxuICAgIC8vIGludmVydCBzcGFjZVx0XG5cdHAgPSAtNy4wKnAvZG90KHAscCk7XG5cbiAgICAvLyB0d2lzdCBzcGFjZVx0XG5cdGZsb2F0IGNvID0gY29zKGRlbiAtIDAuMjUqaVRpbWUpO1xuXHRmbG9hdCBzaSA9IHNpbihkZW4gLSAwLjI1KmlUaW1lKTtcblx0cC54eiA9IG1hdDIoY28sLXNpLHNpLGNvKSpwLnh6O1xuXG4gICAgLy8gc21va2VcdFxuXHRmbG9hdCBmO1xuXHR2ZWMzIHEgPSBwICAgICAgICAgICAgICAgICAgICAgICAgICAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lOztcbiAgICBmICA9IDAuNTAwMDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAyIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjI1MDAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMyAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4xMjUwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDEgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMDYyNTAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAyIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjAzMTI1KmZpcmVfbm9pc2UoIHEgKTtcblxuXHRkZW4gPSBjbGFtcCggZGVuICsgNC4wKmYsIDAuMCwgMS4wICk7XG5cdFxuXHR2ZWMzIGNvbCA9IG1peCggdmVjMygxLjAsMC45LDAuOCksIHZlYzMoMC40LDAuMTUsMC4xKSwgZGVuICkgKyAwLjA1KnNpbihwKTtcblx0XG5cdHJldHVybiB2ZWM0KCBjb2wsIGRlbiApO1xufVxuXG52ZWMzIHJheW1hcmNoKCBpbiB2ZWMzIHJvLCBpbiB2ZWMzIHJkLCBpbiB2ZWMyIHBpeGVsIClcbntcblx0dmVjNCBzdW0gPSB2ZWM0KCAwLjAgKTtcblxuXHRmbG9hdCB0ID0gMC4wO1xuXG4gICAgLy8gZGl0aGVyaW5nXHRcblx0dCArPSAwLjA1KnRleHR1cmVMb2QoIGlDaGFubmVsMCwgcGl4ZWwueHkvaUNoYW5uZWxSZXNvbHV0aW9uWzBdLngsIDAuMCApLng7XG5cdFxuXHRmb3IoIGludCBpPTA7IGk8MTAwOyBpKysgKVxuXHR7XG5cdFx0aWYoIHN1bS5hID4gMC45OSApIGJyZWFrO1xuXHRcdFxuXHRcdHZlYzMgcG9zID0gcm8gKyB0KnJkO1xuXHRcdHZlYzQgY29sID0gZmlyZV9tYXAoIHBvcyApO1xuXHRcdFxuXHRcdGNvbC54eXogKj0gbWl4KCAzLjEqdmVjMygxLjAsMC41LDAuMDUpLCB2ZWMzKDAuNDgsMC41MywwLjUpLCBjbGFtcCggKHBvcy55LTAuMikvMi4wLCAwLjAsIDEuMCApICk7XG5cdFx0XG5cdFx0Y29sLmEgKj0gMC42O1xuXHRcdGNvbC5yZ2IgKj0gY29sLmE7XG5cblx0XHRzdW0gPSBzdW0gKyBjb2wqKDEuMCAtIHN1bS5hKTtcdFxuXG5cdFx0dCArPSAwLjA1O1xuXHR9XG5cblx0cmV0dXJuIGNsYW1wKCBzdW0ueHl6LCAwLjAsIDEuMCApO1xufVxuXG52b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG57XG5cdHZlYzIgcSA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgIHZlYzIgcCA9IC0xLjAgKyAyLjAqcTtcbiAgICBwLnggKj0gaVJlc29sdXRpb24ueC8gaVJlc29sdXRpb24ueTtcblx0XG4gICAgdmVjMiBtbyA9IHZlYzIoMC41LDAuNSk7IC8vaU1vdXNlLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgLy9pZiggaU1vdXNlLnc8PTAuMDAwMDEgKSBtbz12ZWMyKDAuMCk7XG5cdFxuICAgIC8vIGNhbWVyYVxuICAgIHZlYzMgcm8gPSA0LjAqbm9ybWFsaXplKHZlYzMoY29zKDMuMCptby54KSwgMS40IC0gMS4wKihtby55LS4xKSwgc2luKDMuMCptby54KSkpO1xuXHR2ZWMzIHRhID0gdmVjMygwLjAsIDEuMCwgMC4wKTtcblx0ZmxvYXQgY3IgPSAwLjUqY29zKDAuNyppVGltZSk7XG5cdFxuICAgIC8vIHNoYWtlXHRcdFxuXHRybyArPSAwLjEqKC0xLjArMi4wKnRleHR1cmVMb2QoIGlDaGFubmVsMCwgaVRpbWUqdmVjMigwLjAxMCwwLjAxNCksIDAuMCApLnh5eik7XG5cdHRhICs9IDAuMSooLTEuMCsyLjAqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBpVGltZSp2ZWMyKDAuMDEzLDAuMDA4KSwgMC4wICkueHl6KTtcblx0XG5cdC8vIGJ1aWxkIHJheVxuICAgIHZlYzMgd3cgPSBub3JtYWxpemUoIHRhIC0gcm8pO1xuICAgIHZlYzMgdXUgPSBub3JtYWxpemUoY3Jvc3MoIHZlYzMoc2luKGNyKSxjb3MoY3IpLDAuMCksIHd3ICkpO1xuICAgIHZlYzMgdnYgPSBub3JtYWxpemUoY3Jvc3Mod3csdXUpKTtcbiAgICB2ZWMzIHJkID0gbm9ybWFsaXplKCBwLngqdXUgKyBwLnkqdnYgKyAyLjAqd3cgKTtcblx0XG4gICAgLy8gcmF5bWFyY2hcdFxuXHR2ZWMzIGNvbCA9IHJheW1hcmNoKCBybywgcmQsIGZyYWdDb29yZCApO1xuXHRcblx0Ly8gY29udHJhc3QgYW5kIHZpZ25ldHRpbmdcdFxuXHRjb2wgPSBjb2wqMC41ICsgMC41KmNvbCpjb2wqKDMuMC0yLjAqY29sKTtcblx0Y29sICo9IDAuMjUgKyAwLjc1KnBvdyggMTYuMCpxLngqcS55KigxLjAtcS54KSooMS4wLXEueSksIDAuMSApO1xuXHRcbiAgICBmcmFnQ29sb3IgPSB2ZWM0KCBjb2wsIDEuMCApO1xufVxuXG4gICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTAwMDAwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsUmVzb2x1dGlvbi52YWx1ZVswXS54ID0gbm9pc2VUZXguaW1hZ2Uud2lkdGhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWxSZXNvbHV0aW9uLnZhbHVlWzBdLnkgPSBub2lzZVRleC5pbWFnZS5oZWlnaHRcbiAgICB9XG59XG5cbmV4cG9ydCB7IEZpcmVUdW5uZWxTaGFkZXIgfVxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy83bGZYUkJcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IE1pc3RTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiksXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG5cbiAgICAgICAgZmxvYXQgbXJhbmQodmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJldHVybiBmcmFjdChzaW4oZG90KGNvb3JkcywgdmVjMig1Ni4zNDU2LDc4LjM0NTYpKSAqIDUuMCkgKiAxMDAwMC4wKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbW5vaXNlKHZlYzIgY29vcmRzKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIGkgPSBmbG9vcihjb29yZHMpO1xuICAgICAgICAgICAgdmVjMiBmID0gZnJhY3QoY29vcmRzKTtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBhID0gbXJhbmQoaSk7XG4gICAgICAgICAgICBmbG9hdCBiID0gbXJhbmQoaSArIHZlYzIoMS4wLCAwLjApKTtcbiAgICAgICAgICAgIGZsb2F0IGMgPSBtcmFuZChpICsgdmVjMigwLjAsIDEuMCkpO1xuICAgICAgICAgICAgZmxvYXQgZCA9IG1yYW5kKGkgKyB2ZWMyKDEuMCwgMS4wKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMiBjdWJpYyA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBtaXgoYSwgYiwgY3ViaWMueCkgKyAoYyAtIGEpICogY3ViaWMueSAqICgxLjAgLSBjdWJpYy54KSArIChkIC0gYikgKiBjdWJpYy54ICogY3ViaWMueTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgZmJtKHZlYzIgY29vcmRzKVxuICAgICAgICB7XG4gICAgICAgICAgICBmbG9hdCB2YWx1ZSA9IDAuMDtcbiAgICAgICAgICAgIGZsb2F0IHNjYWxlID0gMC41O1xuICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMTA7IGkrKylcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBtbm9pc2UoY29vcmRzKSAqIHNjYWxlO1xuICAgICAgICAgICAgICAgIGNvb3JkcyAqPSA0LjA7XG4gICAgICAgICAgICAgICAgc2NhbGUgKj0gMC41O1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnkgKiAyLjA7XG4gICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGZpbmFsID0gMC4wO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0xOyBpIDwgNjsgaSsrKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZlYzIgbW90aW9uID0gdmVjMihmYm0odXYgKyB2ZWMyKDAuMCxpVGltZSkgKiAwLjA1ICsgdmVjMihpLCAwLjApKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGZpbmFsICs9IGZibSh1diArIG1vdGlvbik7XG4gICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmaW5hbCAvPSA1LjA7XG4gICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KG1peCh2ZWMzKC0wLjMpLCB2ZWMzKDAuNDUsIDAuNCwgMC42KSArIHZlYzMoMC42KSwgZmluYWwpLCAxKTtcbiAgICAgICAgfVxuICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEyKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgTWlzdFNoYWRlciB9XG4iLCIvLyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9YZHNCREJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3Qgc3RhdGUgPSB7XG4gICAgYW5pbWF0ZTogZmFsc2UsXG4gICAgbm9pc2VNb2RlOiAnc2NhbGUnLFxuICAgIGludmVydDogZmFsc2UsXG4gICAgc2hhcnBlbjogdHJ1ZSxcbiAgICBzY2FsZUJ5UHJldjogZmFsc2UsXG4gICAgZ2FpbjogMC41NCxcbiAgICBsYWN1bmFyaXR5OiAyLjAsXG4gICAgb2N0YXZlczogNSxcbiAgICBzY2FsZTE6IDMuMCxcbiAgICBzY2FsZTI6IDMuMCxcbiAgICB0aW1lU2NhbGVYOiAwLjQsXG4gICAgdGltZVNjYWxlWTogMC4zLFxuICAgIGNvbG9yMTogWzAsIDAsIDBdLFxuICAgIGNvbG9yMjogWzEzMCwgMTI5LDEyOV0sXG4gICAgY29sb3IzOiBbMTEwLCAxMTAsIDExMF0sXG4gICAgY29sb3I0OiBbODIsIDUxLCAxM10sXG4gICAgb2Zmc2V0QVg6IDAsXG4gICAgb2Zmc2V0QVk6IDAsXG4gICAgb2Zmc2V0Qlg6IDMuNyxcbiAgICBvZmZzZXRCWTogMC45LFxuICAgIG9mZnNldENYOiAyLjEsXG4gICAgb2Zmc2V0Q1k6IDMuMixcbiAgICBvZmZzZXREWDogNC4zLFxuICAgIG9mZnNldERZOiAyLjgsXG4gICAgb2Zmc2V0WDogMCxcbiAgICBvZmZzZXRZOiAwLFxufTtcblxubGV0IE1hcmJsZTFTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3Jtczoge1xuICAgICAgICBtYl9hbmltYXRlOiB7IHZhbHVlOiBzdGF0ZS5hbmltYXRlIH0sXG4gICAgICAgIG1iX2NvbG9yMTogeyB2YWx1ZTogc3RhdGUuY29sb3IxLm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2NvbG9yMjogeyB2YWx1ZTogc3RhdGUuY29sb3IyLm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2NvbG9yMzogeyB2YWx1ZTogc3RhdGUuY29sb3IzLm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2NvbG9yNDogeyB2YWx1ZTogc3RhdGUuY29sb3I0Lm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2dhaW46IHsgdmFsdWU6IHN0YXRlLmdhaW4gfSxcbiAgICAgICAgbWJfaW52ZXJ0OiB7IHZhbHVlOiBzdGF0ZS5pbnZlcnQgfSxcbiAgICAgICAgbWJfbGFjdW5hcml0eTogeyB2YWx1ZTogc3RhdGUubGFjdW5hcml0eSB9LFxuICAgICAgICBtYl9ub2lzZU1vZGU6IHsgdmFsdWU6IHN0YXRlLm5vaXNlTW9kZSA9PT0gJ3NjYWxlJyA/IDAgOiAxIH0sXG4gICAgICAgIG1iX29jdGF2ZXM6IHsgdmFsdWU6IHN0YXRlLm9jdGF2ZXMgfSxcbiAgICAgICAgbWJfb2Zmc2V0OiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0WCwgc3RhdGUub2Zmc2V0WV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0QTogeyB2YWx1ZTogW3N0YXRlLm9mZnNldEFYLCBzdGF0ZS5vZmZzZXRBWV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0QjogeyB2YWx1ZTogW3N0YXRlLm9mZnNldEJYLCBzdGF0ZS5vZmZzZXRCWV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0QzogeyB2YWx1ZTogW3N0YXRlLm9mZnNldENYLCBzdGF0ZS5vZmZzZXRDWV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0RDogeyB2YWx1ZTogW3N0YXRlLm9mZnNldERYLCBzdGF0ZS5vZmZzZXREWV0gfSxcbiAgICAgICAgbWJfc2NhbGUxOiB7IHZhbHVlOiBzdGF0ZS5zY2FsZTEgfSxcbiAgICAgICAgbWJfc2NhbGUyOiB7IHZhbHVlOiBzdGF0ZS5zY2FsZTIgfSxcbiAgICAgICAgbWJfc2NhbGVCeVByZXY6IHsgdmFsdWU6IHN0YXRlLnNjYWxlQnlQcmV2IH0sXG4gICAgICAgIG1iX3NoYXJwZW46IHsgdmFsdWU6IHN0YXRlLnNoYXJwZW4gfSxcbiAgICAgICAgbWJfdGltZTogeyB2YWx1ZTogMCB9LFxuICAgICAgICBtYl90aW1lU2NhbGU6IHsgdmFsdWU6IFtzdGF0ZS50aW1lU2NhbGVYLCBzdGF0ZS50aW1lU2NhbGVZXSB9LFxuICAgICAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICAgICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0gICAgXG4gICAgfSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IGdsc2xgXG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfYW5pbWF0ZTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjE7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IyO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX2dhaW47XG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfaW52ZXJ0O1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9sYWN1bmFyaXR5O1xuICAgICAgICAgICAgdW5pZm9ybSBpbnQgbWJfbm9pc2VNb2RlO1xuICAgICAgICAgICAgdW5pZm9ybSBpbnQgbWJfb2N0YXZlcztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXQ7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRCO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0RDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfc2NhbGUxO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9zY2FsZTI7XG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfc2NhbGVCeVByZXY7XG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfc2hhcnBlbjtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfdGltZTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl90aW1lU2NhbGU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbiAgICAgICAgICAgICAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBTb21lIHVzZWZ1bCBmdW5jdGlvbnNcbiAgICAgICAgdmVjMyBtYl9tb2QyODkodmVjMyB4KSB7IHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7IH1cbiAgICAgICAgdmVjMiBtYl9tb2QyODkodmVjMiB4KSB7IHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7IH1cbiAgICAgICAgdmVjMyBtYl9wZXJtdXRlKHZlYzMgeCkgeyByZXR1cm4gbWJfbW9kMjg5KCgoeCozNC4wKSsxLjApKngpOyB9XG4gICAgICAgIFxuICAgICAgICAvL1xuICAgICAgICAvLyBEZXNjcmlwdGlvbiA6IEdMU0wgMkQgc2ltcGxleCBub2lzZSBmdW5jdGlvblxuICAgICAgICAvLyAgICAgIEF1dGhvciA6IElhbiBNY0V3YW4sIEFzaGltYSBBcnRzXG4gICAgICAgIC8vICBNYWludGFpbmVyIDogaWptXG4gICAgICAgIC8vICAgICBMYXN0bW9kIDogMjAxMTA4MjIgKGlqbSlcbiAgICAgICAgLy8gICAgIExpY2Vuc2UgOlxuICAgICAgICAvLyAgQ29weXJpZ2h0IChDKSAyMDExIEFzaGltYSBBcnRzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICAgICAgICAvLyAgRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTElDRU5TRSBmaWxlLlxuICAgICAgICAvLyAgaHR0cHM6Ly9naXRodWIuY29tL2FzaGltYS93ZWJnbC1ub2lzZVxuICAgICAgICAvL1xuICAgICAgICBmbG9hdCBtYl9zbm9pc2UodmVjMiB2KSB7XG4gICAgICAgICAgICAvLyBQcmVjb21wdXRlIHZhbHVlcyBmb3Igc2tld2VkIHRyaWFuZ3VsYXIgZ3JpZFxuICAgICAgICAgICAgY29uc3QgdmVjNCBDID0gdmVjNCgwLjIxMTMyNDg2NTQwNTE4NyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gKDMuMC1zcXJ0KDMuMCkpLzYuMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjM2NjAyNTQwMzc4NDQzOSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMC41KihzcXJ0KDMuMCktMS4wKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAtMC41NzczNTAyNjkxODk2MjYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0xLjAgKyAyLjAgKiBDLnhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC4wMjQzOTAyNDM5MDI0MzkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAxLjAgLyA0MS4wXG4gICAgICAgIFxuICAgICAgICAgICAgLy8gRmlyc3QgY29ybmVyICh4MClcbiAgICAgICAgICAgIHZlYzIgaSAgPSBmbG9vcih2ICsgZG90KHYsIEMueXkpKTtcbiAgICAgICAgICAgIHZlYzIgeDAgPSB2IC0gaSArIGRvdChpLCBDLnh4KTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBPdGhlciB0d28gY29ybmVycyAoeDEsIHgyKVxuICAgICAgICAgICAgdmVjMiBpMSA9IHZlYzIoMC4wKTtcbiAgICAgICAgICAgIGkxID0gKHgwLnggPiB4MC55KT8gdmVjMigxLjAsIDAuMCk6dmVjMigwLjAsIDEuMCk7XG4gICAgICAgICAgICB2ZWMyIHgxID0geDAueHkgKyBDLnh4IC0gaTE7XG4gICAgICAgICAgICB2ZWMyIHgyID0geDAueHkgKyBDLnp6O1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIERvIHNvbWUgcGVybXV0YXRpb25zIHRvIGF2b2lkXG4gICAgICAgICAgICAvLyB0cnVuY2F0aW9uIGVmZmVjdHMgaW4gcGVybXV0YXRpb25cbiAgICAgICAgICAgIGkgPSBtYl9tb2QyODkoaSk7XG4gICAgICAgICAgICB2ZWMzIHAgPSBtYl9wZXJtdXRlKFxuICAgICAgICAgICAgICAgICAgICBtYl9wZXJtdXRlKCBpLnkgKyB2ZWMzKDAuMCwgaTEueSwgMS4wKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICsgaS54ICsgdmVjMygwLjAsIGkxLngsIDEuMCApKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIG0gPSBtYXgoMC41IC0gdmVjMyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHgwLHgwKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHgxLHgxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHgyLHgyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApLCAwLjApO1xuICAgICAgICBcbiAgICAgICAgICAgIG0gPSBtKm07XG4gICAgICAgICAgICBtID0gbSptO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIEdyYWRpZW50czpcbiAgICAgICAgICAgIC8vICA0MSBwdHMgdW5pZm9ybWx5IG92ZXIgYSBsaW5lLCBtYXBwZWQgb250byBhIGRpYW1vbmRcbiAgICAgICAgICAgIC8vICBUaGUgcmluZyBzaXplIDE3KjE3ID0gMjg5IGlzIGNsb3NlIHRvIGEgbXVsdGlwbGVcbiAgICAgICAgICAgIC8vICAgICAgb2YgNDEgKDQxKjcgPSAyODcpXG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyB4ID0gMi4wICogZnJhY3QocCAqIEMud3d3KSAtIDEuMDtcbiAgICAgICAgICAgIHZlYzMgaCA9IGFicyh4KSAtIDAuNTtcbiAgICAgICAgICAgIHZlYzMgb3ggPSBmbG9vcih4ICsgMC41KTtcbiAgICAgICAgICAgIHZlYzMgYTAgPSB4IC0gb3g7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gTm9ybWFsaXNlIGdyYWRpZW50cyBpbXBsaWNpdGx5IGJ5IHNjYWxpbmcgbVxuICAgICAgICAgICAgLy8gQXBwcm94aW1hdGlvbiBvZjogbSAqPSBpbnZlcnNlc3FydChhMCphMCArIGgqaCk7XG4gICAgICAgICAgICBtICo9IDEuNzkyODQyOTE0MDAxNTkgLSAwLjg1MzczNDcyMDk1MzE0ICogKGEwKmEwK2gqaCk7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gQ29tcHV0ZSBmaW5hbCBub2lzZSB2YWx1ZSBhdCBQXG4gICAgICAgICAgICB2ZWMzIGcgPSB2ZWMzKDAuMCk7XG4gICAgICAgICAgICBnLnggID0gYTAueCAgKiB4MC54ICArIGgueCAgKiB4MC55O1xuICAgICAgICAgICAgZy55eiA9IGEwLnl6ICogdmVjMih4MS54LHgyLngpICsgaC55eiAqIHZlYzIoeDEueSx4Mi55KTtcbiAgICAgICAgICAgIHJldHVybiAxMzAuMCAqIGRvdChtLCBnKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfZ2V0Tm9pc2VWYWwodmVjMiBwKSB7XG4gICAgICAgICAgICBmbG9hdCByYXcgPSBtYl9zbm9pc2UocCk7XG4gICAgICAgIFxuICAgICAgICAgICAgaWYgKG1iX25vaXNlTW9kZSA9PSAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFicyhyYXcpO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiByYXcgKiAwLjUgKyAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1iX2ZibSh2ZWMyIHApIHtcbiAgICAgICAgICAgIGZsb2F0IHN1bSA9IDAuMDtcbiAgICAgICAgICAgIGZsb2F0IGZyZXEgPSAxLjA7XG4gICAgICAgICAgICBmbG9hdCBhbXAgPSAwLjU7XG4gICAgICAgICAgICBmbG9hdCBwcmV2ID0gMS4wO1xuICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgbWJfb2N0YXZlczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbiA9IG1iX2dldE5vaXNlVmFsKHAgKiBmcmVxKTtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX2ludmVydCkge1xuICAgICAgICAgICAgICAgICAgICBuID0gMS4wIC0gbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9zaGFycGVuKSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSBuICogbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIHN1bSArPSBuICogYW1wO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfc2NhbGVCeVByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgc3VtICs9IG4gKiBhbXAgKiBwcmV2O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgcHJldiA9IG47XG4gICAgICAgICAgICAgICAgZnJlcSAqPSBtYl9sYWN1bmFyaXR5O1xuICAgICAgICAgICAgICAgIGFtcCAqPSBtYl9nYWluO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBzdW07XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1iX3BhdHRlcm4oaW4gdmVjMiBwLCBvdXQgdmVjMiBxLCBvdXQgdmVjMiByKSB7XG4gICAgICAgICAgICBwICo9IG1iX3NjYWxlMTtcbiAgICAgICAgICAgIHAgKz0gbWJfb2Zmc2V0O1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHQgPSAwLjA7XG4gICAgICAgICAgICBpZiAobWJfYW5pbWF0ZSkge1xuICAgICAgICAgICAgICAgIHQgPSBtYl90aW1lICogMC4xO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHEgPSB2ZWMyKG1iX2ZibShwICsgbWJfb2Zmc2V0QSArIHQgKiBtYl90aW1lU2NhbGUueCksIG1iX2ZibShwICsgbWJfb2Zmc2V0QiAtIHQgKiBtYl90aW1lU2NhbGUueSkpO1xuICAgICAgICAgICAgciA9IHZlYzIobWJfZmJtKHAgKyBtYl9zY2FsZTIgKiBxICsgbWJfb2Zmc2V0QyksIG1iX2ZibShwICsgbWJfc2NhbGUyICogcSArIG1iX29mZnNldEQpKTtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gbWJfZmJtKHAgKyBtYl9zY2FsZTIgKiByKTtcbiAgICAgICAgfVxuICAgIGAsXG4gICAgcmVwbGFjZU1hcDogZ2xzbGBcbiAgICAgICAgdmVjMyBtYXJibGVDb2xvciA9IHZlYzMoMC4wKTtcblxuICAgICAgICB2ZWMyIHE7XG4gICAgICAgIHZlYzIgcjtcblxuICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IFxuICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcblxuICAgICAgICBmbG9hdCBmID0gbWJfcGF0dGVybih1diwgcSwgcik7XG4gICAgICAgIFxuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYl9jb2xvcjEsIG1iX2NvbG9yMiwgZik7XG4gICAgICAgIG1hcmJsZUNvbG9yID0gbWl4KG1hcmJsZUNvbG9yLCBtYl9jb2xvcjMsIGxlbmd0aChxKSAvIDIuMCk7XG4gICAgICAgIG1hcmJsZUNvbG9yID0gbWl4KG1hcmJsZUNvbG9yLCBtYl9jb2xvcjQsIHIueSAvIDIuMCk7XG5cbiAgICAgICAgdmVjNCBtYXJibGVDb2xvcjQgPSBtYXBUZXhlbFRvTGluZWFyKCB2ZWM0KG1hcmJsZUNvbG9yLDEuMCkgKTtcblxuICAgICAgICBkaWZmdXNlQ29sb3IgKj0gbWFyYmxlQ29sb3I0O1xuICAgIGBcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX2ludmVydCA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyBzdGF0ZS5pbnZlcnQgOiAhc3RhdGUuaW52ZXJ0IH1cblxuICAgICAgICAvLyBsZXRzIGFkZCBhIGJpdCBvZiByYW5kb21uZXNzIHRvIHRoZSBpbnB1dCBzbyBtdWx0aXBsZSBpbnN0YW5jZXMgYXJlIGRpZmZlcmVudFxuICAgICAgICBsZXQgcnggPSBNYXRoLnJhbmRvbSgpXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX29mZnNldEEgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMiggc3RhdGUub2Zmc2V0QVggKyBNYXRoLnJhbmRvbSgpLCBzdGF0ZS5vZmZzZXRBWSArIE1hdGgucmFuZG9tKCkpIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfb2Zmc2V0QiA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKCBzdGF0ZS5vZmZzZXRCWCArIE1hdGgucmFuZG9tKCksIHN0YXRlLm9mZnNldEJZICsgTWF0aC5yYW5kb20oKSkgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl90aW1lLnZhbHVlID0gdGltZSAqIDAuMDAxXG4gICAgfVxufVxuXG5leHBvcnQgeyBNYXJibGUxU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzFlYzk2NWM1ZDZkZjU3N2MuanBnXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzR0MzN6OFxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCBub3RGb3VuZCBmcm9tICcuLi9hc3NldHMvYmFkU2hhZGVyLmpwZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgaUNoYW5uZWwxOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG59KVxudmFyIG5vdEZvdW5kVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZChub3RGb3VuZCwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub3RGb3VuZFRleCA9IG5vaXNlXG59KVxuXG5sZXQgTm90Rm91bmRTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDE7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgICAgICAgICB2ZWMyIHdhcnBVViA9IDIuICogdXY7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZCA9IGxlbmd0aCggd2FycFVWICk7XG4gICAgICAgICAgICB2ZWMyIHN0ID0gd2FycFVWKjAuMSArIDAuMip2ZWMyKGNvcygwLjA3MSppVGltZSoyLitkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW4oMC4wNzMqaVRpbWUqMi4tZCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgd2FycGVkQ29sID0gdGV4dHVyZSggaUNoYW5uZWwwLCBzdCApLnh5eiAqIDIuMDtcbiAgICAgICAgICAgIGZsb2F0IHcgPSBtYXgoIHdhcnBlZENvbC5yLCAwLjg1KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMiBvZmZzZXQgPSAwLjAxICogY29zKCB3YXJwZWRDb2wucmcgKiAzLjE0MTU5ICk7XG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHRleHR1cmUoIGlDaGFubmVsMSwgdXYgKyBvZmZzZXQgKS5yZ2IgKiB2ZWMzKDAuOCwgMC44LCAxLjUpIDtcbiAgICAgICAgICAgIGNvbCAqPSB3KjEuMjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNCggbWl4KGNvbCwgdGV4dHVyZSggaUNoYW5uZWwxLCB1diArIG9mZnNldCApLnJnYiwgMC41KSwgIDEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDEudmFsdWUgPSBub3RGb3VuZFRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwxLnZhbHVlID0gbm90Rm91bmRUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IE5vdEZvdW5kU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzQ4MWE5MmI0NGU1NmRhZDQucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuaW1wb3J0IHdhcnBmeCBmcm9tICcuLi9hc3NldHMvd2FycGZ4LnBuZydcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgdW5pZm9ybXMgPSB7XG4gICAgd2FycFRpbWU6IHt2YWx1ZTogMH0sXG4gICAgd2FycFRleDoge3ZhbHVlOiBudWxsfSxcbiAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSxcbiAgICB0ZXhGbGlwWTogeyB2YWx1ZTogMCB9XG59IFxuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIHdhcnBUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKHdhcnBmeCwgKHdhcnApID0+IHtcbiAgICB3YXJwLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIHdhcnAud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgd2FycFRleCA9IHdhcnBcbn0pXG5cbmxldCBXYXJwU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBmbG9hdCB3YXJwVGltZTtcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgd2FycFRleDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbiAgICAgICAgdW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuICAgICAgICAgICAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgICAgZmxvYXQgdCA9IHdhcnBUaW1lO1xuXG4gICAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG4gIFxuICAgICAgICAgIHZlYzIgc2NhbGVkVVYgPSB1diAqIDIuMCAtIDEuMDtcbiAgICAgICAgICB2ZWMyIHB1diA9IHZlYzIobGVuZ3RoKHNjYWxlZFVWLnh5KSwgYXRhbihzY2FsZWRVVi54LCBzY2FsZWRVVi55KSk7XG4gICAgICAgICAgdmVjNCBjb2wgPSB0ZXh0dXJlMkQod2FycFRleCwgdmVjMihsb2cocHV2LngpICsgdCAvIDUuMCwgcHV2LnkgLyAzLjE0MTU5MjYgKSk7XG4gICAgICAgICAgZmxvYXQgZ2xvdyA9ICgxLjAgLSBwdXYueCkgKiAoMC41ICsgKHNpbih0KSArIDIuMCApIC8gNC4wKTtcbiAgICAgICAgICAvLyBibHVlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgxMTguMC8yNTUuMCwgMTQ0LjAvMjU1LjAsIDIxOS4wLzI1NS4wLCAxLjApICogKDAuNCArIGdsb3cgKiAxLjApO1xuICAgICAgICAgIC8vIHdoaXRlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgwLjIpICogc21vb3Roc3RlcCgwLjAsIDIuMCwgZ2xvdyAqIGdsb3cpO1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbCA9IG1hcFRleGVsVG9MaW5lYXIoIGNvbCApO1xuICAgICAgICAgIGRpZmZ1c2VDb2xvciAqPSBjb2w7XG4gICAgICAgIGBcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSswLjUpICogMTBcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGV4LnZhbHVlID0gd2FycFRleFxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUgPSB7IHZhbHVlOiAwIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IFdhcnBTaGFkZXIgfVxuIiwiLypcbiAqIDNEIFNpbXBsZXggbm9pc2VcbiAqIFNJR05BVFVSRTogZmxvYXQgc25vaXNlKHZlYzMgdilcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9odWdoc2svZ2xzbC1ub2lzZVxuICovXG5cbmNvbnN0IGdsc2wgPSBgXG4vL1xuLy8gRGVzY3JpcHRpb24gOiBBcnJheSBhbmQgdGV4dHVyZWxlc3MgR0xTTCAyRC8zRC80RCBzaW1wbGV4XG4vLyAgICAgICAgICAgICAgIG5vaXNlIGZ1bmN0aW9ucy5cbi8vICAgICAgQXV0aG9yIDogSWFuIE1jRXdhbiwgQXNoaW1hIEFydHMuXG4vLyAgTWFpbnRhaW5lciA6IGlqbVxuLy8gICAgIExhc3Rtb2QgOiAyMDExMDgyMiAoaWptKVxuLy8gICAgIExpY2Vuc2UgOiBDb3B5cmlnaHQgKEMpIDIwMTEgQXNoaW1hIEFydHMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vLyAgICAgICAgICAgICAgIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZS5cbi8vICAgICAgICAgICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FzaGltYS93ZWJnbC1ub2lzZVxuLy9cblxudmVjMyBtb2QyODkodmVjMyB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgbW9kMjg5KHZlYzQgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IHBlcm11dGUodmVjNCB4KSB7XG4gICAgIHJldHVybiBtb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7XG59XG5cbnZlYzQgdGF5bG9ySW52U3FydCh2ZWM0IHIpXG57XG4gIHJldHVybiAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqIHI7XG59XG5cbmZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gIHtcbiAgY29uc3QgdmVjMiAgQyA9IHZlYzIoMS4wLzYuMCwgMS4wLzMuMCkgO1xuICBjb25zdCB2ZWM0ICBEID0gdmVjNCgwLjAsIDAuNSwgMS4wLCAyLjApO1xuXG4vLyBGaXJzdCBjb3JuZXJcbiAgdmVjMyBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eXkpICk7XG4gIHZlYzMgeDAgPSAgIHYgLSBpICsgZG90KGksIEMueHh4KSA7XG5cbi8vIE90aGVyIGNvcm5lcnNcbiAgdmVjMyBnID0gc3RlcCh4MC55engsIHgwLnh5eik7XG4gIHZlYzMgbCA9IDEuMCAtIGc7XG4gIHZlYzMgaTEgPSBtaW4oIGcueHl6LCBsLnp4eSApO1xuICB2ZWMzIGkyID0gbWF4KCBnLnh5eiwgbC56eHkgKTtcblxuICAvLyAgIHgwID0geDAgLSAwLjAgKyAwLjAgKiBDLnh4eDtcbiAgLy8gICB4MSA9IHgwIC0gaTEgICsgMS4wICogQy54eHg7XG4gIC8vICAgeDIgPSB4MCAtIGkyICArIDIuMCAqIEMueHh4O1xuICAvLyAgIHgzID0geDAgLSAxLjAgKyAzLjAgKiBDLnh4eDtcbiAgdmVjMyB4MSA9IHgwIC0gaTEgKyBDLnh4eDtcbiAgdmVjMyB4MiA9IHgwIC0gaTIgKyBDLnl5eTsgLy8gMi4wKkMueCA9IDEvMyA9IEMueVxuICB2ZWMzIHgzID0geDAgLSBELnl5eTsgICAgICAvLyAtMS4wKzMuMCpDLnggPSAtMC41ID0gLUQueVxuXG4vLyBQZXJtdXRhdGlvbnNcbiAgaSA9IG1vZDI4OShpKTtcbiAgdmVjNCBwID0gcGVybXV0ZSggcGVybXV0ZSggcGVybXV0ZShcbiAgICAgICAgICAgICBpLnogKyB2ZWM0KDAuMCwgaTEueiwgaTIueiwgMS4wICkpXG4gICAgICAgICAgICsgaS55ICsgdmVjNCgwLjAsIGkxLnksIGkyLnksIDEuMCApKVxuICAgICAgICAgICArIGkueCArIHZlYzQoMC4wLCBpMS54LCBpMi54LCAxLjAgKSk7XG5cbi8vIEdyYWRpZW50czogN3g3IHBvaW50cyBvdmVyIGEgc3F1YXJlLCBtYXBwZWQgb250byBhbiBvY3RhaGVkcm9uLlxuLy8gVGhlIHJpbmcgc2l6ZSAxNyoxNyA9IDI4OSBpcyBjbG9zZSB0byBhIG11bHRpcGxlIG9mIDQ5ICg0OSo2ID0gMjk0KVxuICBmbG9hdCBuXyA9IDAuMTQyODU3MTQyODU3OyAvLyAxLjAvNy4wXG4gIHZlYzMgIG5zID0gbl8gKiBELnd5eiAtIEQueHp4O1xuXG4gIHZlYzQgaiA9IHAgLSA0OS4wICogZmxvb3IocCAqIG5zLnogKiBucy56KTsgIC8vICBtb2QocCw3KjcpXG5cbiAgdmVjNCB4XyA9IGZsb29yKGogKiBucy56KTtcbiAgdmVjNCB5XyA9IGZsb29yKGogLSA3LjAgKiB4XyApOyAgICAvLyBtb2QoaixOKVxuXG4gIHZlYzQgeCA9IHhfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCB5ID0geV8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IGggPSAxLjAgLSBhYnMoeCkgLSBhYnMoeSk7XG5cbiAgdmVjNCBiMCA9IHZlYzQoIHgueHksIHkueHkgKTtcbiAgdmVjNCBiMSA9IHZlYzQoIHguencsIHkuencgKTtcblxuICAvL3ZlYzQgczAgPSB2ZWM0KGxlc3NUaGFuKGIwLDAuMCkpKjIuMCAtIDEuMDtcbiAgLy92ZWM0IHMxID0gdmVjNChsZXNzVGhhbihiMSwwLjApKSoyLjAgLSAxLjA7XG4gIHZlYzQgczAgPSBmbG9vcihiMCkqMi4wICsgMS4wO1xuICB2ZWM0IHMxID0gZmxvb3IoYjEpKjIuMCArIDEuMDtcbiAgdmVjNCBzaCA9IC1zdGVwKGgsIHZlYzQoMC4wKSk7XG5cbiAgdmVjNCBhMCA9IGIwLnh6eXcgKyBzMC54enl3KnNoLnh4eXkgO1xuICB2ZWM0IGExID0gYjEueHp5dyArIHMxLnh6eXcqc2guenp3dyA7XG5cbiAgdmVjMyBwMCA9IHZlYzMoYTAueHksaC54KTtcbiAgdmVjMyBwMSA9IHZlYzMoYTAuencsaC55KTtcbiAgdmVjMyBwMiA9IHZlYzMoYTEueHksaC56KTtcbiAgdmVjMyBwMyA9IHZlYzMoYTEuencsaC53KTtcblxuLy9Ob3JtYWxpc2UgZ3JhZGllbnRzXG4gIHZlYzQgbm9ybSA9IHRheWxvckludlNxcnQodmVjNChkb3QocDAscDApLCBkb3QocDEscDEpLCBkb3QocDIsIHAyKSwgZG90KHAzLHAzKSkpO1xuICBwMCAqPSBub3JtLng7XG4gIHAxICo9IG5vcm0ueTtcbiAgcDIgKj0gbm9ybS56O1xuICBwMyAqPSBub3JtLnc7XG5cbi8vIE1peCBmaW5hbCBub2lzZSB2YWx1ZVxuICB2ZWM0IG0gPSBtYXgoMC42IC0gdmVjNChkb3QoeDAseDApLCBkb3QoeDEseDEpLCBkb3QoeDIseDIpLCBkb3QoeDMseDMpKSwgMC4wKTtcbiAgbSA9IG0gKiBtO1xuICByZXR1cm4gNDIuMCAqIGRvdCggbSptLCB2ZWM0KCBkb3QocDAseDApLCBkb3QocDEseDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QocDIseDIpLCBkb3QocDMseDMpICkgKTtcbiAgfSAgXG5gXG5leHBvcnQgZGVmYXVsdCBnbHNsXG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuaW1wb3J0IHdhcnBmeCBmcm9tICcuLi9hc3NldHMvd2FycGZ4LnBuZydcbmltcG9ydCBzbm9pc2UgZnJvbSAnLi9zbm9pc2UnXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCB1bmlmb3JtcyA9IHtcbiAgICB3YXJwVGltZToge3ZhbHVlOiAwfSxcbiAgICB3YXJwVGV4OiB7dmFsdWU6IG51bGx9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH0sXG4gICAgcG9ydGFsQ3ViZU1hcDogeyB2YWx1ZTogbmV3IFRIUkVFLkN1YmVUZXh0dXJlKCkgfSxcbiAgICBwb3J0YWxUaW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgcG9ydGFsUmFkaXVzOiB7IHZhbHVlOiAwLjUgfSxcbiAgICBwb3J0YWxSaW5nQ29sb3I6IHsgdmFsdWU6IG5ldyBUSFJFRS5Db2xvcihcInJlZFwiKSAgfSxcbiAgICBpbnZlcnRXYXJwQ29sb3I6IHsgdmFsdWU6IDAgfSxcbiAgICB0ZXhJbnZTaXplOiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH1cbn0gXG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5sZXQgY3ViZU1hcCA9IG5ldyBUSFJFRS5DdWJlVGV4dHVyZSgpXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciB3YXJwVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZCh3YXJwZngsICh3YXJwKSA9PiB7XG4gICAgd2FycC5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0TWlwbWFwTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RNaXBtYXBOZWFyZXN0RmlsdGVyO1xuICAgIHdhcnAud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgd2FycFRleCA9IHdhcnBcbiAgICBjdWJlTWFwLmltYWdlcyA9IFt3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlXVxuICAgIGN1YmVNYXAubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sZXQgV2FycFBvcnRhbFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IGdsc2xgXG4gICAgICAgIHZhcnlpbmcgdmVjMyB2UmF5O1xuICAgICAgICB2YXJ5aW5nIHZlYzMgcG9ydGFsTm9ybWFsO1xuICAgICAgICAvL3ZhcnlpbmcgdmVjMyBjYW1lcmFMb2NhbDtcbiAgICAgICAgYCxcbiAgICAgICAgcG9zdFRyYW5zZm9ybTogZ2xzbGBcbiAgICAgICAgLy8gdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlKG1vZGVsTWF0cml4KSAqIHZlYzQoY2FtZXJhUG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgICAgICAgdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlKG1vZGVsVmlld01hdHJpeCkgKiB2ZWM0KDAuMCwwLjAsMC4wLCAxLjApKS54eXo7XG4gICAgICAgIHZSYXkgPSBwb3NpdGlvbiAtIGNhbWVyYUxvY2FsO1xuICAgICAgICBpZiAodlJheS56IDwgMC4wKSB7XG4gICAgICAgICAgICB2UmF5LnogPSAtdlJheS56O1xuICAgICAgICAgICAgdlJheS54ID0gLXZSYXkueDtcbiAgICAgICAgfVxuICAgICAgICAvL3ZSYXkgPSB2ZWMzKG12UG9zaXRpb24ueCwgbXZQb3NpdGlvbi55LCBtdlBvc2l0aW9uLnopO1xuICAgICAgICBwb3J0YWxOb3JtYWwgPSBub3JtYWxpemUoLTEuICogdlJheSk7XG4gICAgICAgIC8vZmxvYXQgcG9ydGFsX2Rpc3QgPSBsZW5ndGgoY2FtZXJhTG9jYWwpO1xuICAgICAgICBmbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aCh2UmF5KTtcbiAgICAgICAgdlJheS56ICo9IDEuMSAvICgxLiArIHBvdyhwb3J0YWxfZGlzdCwgMC41KSk7IC8vIENoYW5nZSBGT1YgYnkgc3F1YXNoaW5nIGxvY2FsIFogZGlyZWN0aW9uXG4gICAgICBgXG4gICAgfSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIGZ1bmN0aW9uczogc25vaXNlLFxuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyQ3ViZSBwb3J0YWxDdWJlTWFwO1xuICAgICAgICB1bmlmb3JtIGZsb2F0IHBvcnRhbFJhZGl1cztcbiAgICAgICAgdW5pZm9ybSB2ZWMzIHBvcnRhbFJpbmdDb2xvcjtcbiAgICAgICAgdW5pZm9ybSBmbG9hdCBwb3J0YWxUaW1lO1xuICAgICAgICB1bmlmb3JtIGludCBpbnZlcnRXYXJwQ29sb3I7XG5cbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleEludlNpemU7XG5cbiAgICAgICAgdmFyeWluZyB2ZWMzIHZSYXk7XG4gICAgICAgIHZhcnlpbmcgdmVjMyBwb3J0YWxOb3JtYWw7XG4gICAgICAgLy8gdmFyeWluZyB2ZWMzIGNhbWVyYUxvY2FsO1xuXG4gICAgICAgIHVuaWZvcm0gZmxvYXQgd2FycFRpbWU7XG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHdhcnBUZXg7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG4gICAgICAgIHVuaWZvcm0gaW50IHRleEZsaXBZOyBcblxuICAgICAgICAjZGVmaW5lIFJJTkdfV0lEVEggMC4xXG4gICAgICAgICNkZWZpbmUgUklOR19IQVJEX09VVEVSIDAuMDFcbiAgICAgICAgI2RlZmluZSBSSU5HX0hBUkRfSU5ORVIgMC4wOFxuICAgICAgICBgLFxuICAgICAgICByZXBsYWNlTWFwOiBnbHNsYFxuICAgICAgICAgIGZsb2F0IHQgPSB3YXJwVGltZTtcblxuICAgICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgLy9tb2QodlV2Lnh5ICogdGV4UmVwZWF0Lnh5ICsgdGV4T2Zmc2V0Lnh5LCB2ZWMyKDEuMCwxLjApKTtcblxuICAgICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgICAgaWYgKHRleEZsaXBZID4gMCkgeyB1di55ID0gMS4wIC0gdXYueTt9XG4gICAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuICBcbiAgICAgICAgICB2ZWMyIHNjYWxlZFVWID0gdXYgKiAyLjAgLSAxLjA7XG4gICAgICAgICAgdmVjMiBwdXYgPSB2ZWMyKGxlbmd0aChzY2FsZWRVVi54eSksIGF0YW4oc2NhbGVkVVYueCwgc2NhbGVkVVYueSkpO1xuICAgICAgICAgIHZlYzQgY29sID0gdGV4dHVyZTJEKHdhcnBUZXgsIHZlYzIobG9nKHB1di54KSArIHQgLyA1LjAsIHB1di55IC8gMy4xNDE1OTI2ICkpO1xuXG4gICAgICAgICAgZmxvYXQgZ2xvdyA9ICgxLjAgLSBwdXYueCkgKiAoMC41ICsgKHNpbih0KSArIDIuMCApIC8gNC4wKTtcbiAgICAgICAgICAvLyBibHVlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgxMTguMC8yNTUuMCwgMTQ0LjAvMjU1LjAsIDIxOS4wLzI1NS4wLCAxLjApICogKDAuNCArIGdsb3cgKiAxLjApO1xuICAgICAgICAgIC8vIHdoaXRlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgwLjIpICogc21vb3Roc3RlcCgwLjAsIDIuMCwgZ2xvdyAqIGdsb3cpO1xuICAgICAgICAgIGNvbCA9IG1hcFRleGVsVG9MaW5lYXIoIGNvbCApO1xuICAgICAgICAgXG4gICAgICAgICAgaWYgKGludmVydFdhcnBDb2xvciA+IDApIHtcbiAgICAgICAgICAgICAgY29sID0gdmVjNChjb2wuYiwgY29sLmcsIGNvbC5yLCBjb2wuYSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8vIHBvcnRhbCBzaGFkZXIgZWZmZWN0XG4gICAgICAgICAgdmVjMiBwb3J0YWxfY29vcmQgPSB2VXYgKiAyLjAgLSAxLjA7XG4gICAgICAgICAgZmxvYXQgcG9ydGFsX25vaXNlID0gc25vaXNlKHZlYzMocG9ydGFsX2Nvb3JkICogMS4sIHBvcnRhbFRpbWUpKSAqIDAuNSArIDAuNTtcbiAgICAgICAgXG4gICAgICAgICAgLy8gUG9sYXIgZGlzdGFuY2VcbiAgICAgICAgICBmbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aChwb3J0YWxfY29vcmQpO1xuICAgICAgICAgIHBvcnRhbF9kaXN0ICs9IHBvcnRhbF9ub2lzZSAqIDAuMjtcbiAgICAgICAgXG4gICAgICAgICAgZmxvYXQgbWFza091dGVyID0gMS4wIC0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSBSSU5HX0hBUkRfT1VURVIsIHBvcnRhbFJhZGl1cywgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIGZsb2F0IG1hc2tJbm5lciA9IDEuMCAtIHNtb290aHN0ZXAocG9ydGFsUmFkaXVzIC0gUklOR19XSURUSCwgcG9ydGFsUmFkaXVzIC0gUklOR19XSURUSCArIFJJTkdfSEFSRF9JTk5FUiwgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0b3J0aW9uID0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSAwLjIsIHBvcnRhbFJhZGl1cyArIDAuMiwgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIFxuICAgICAgICAgIHZlYzMgcG9ydGFsbm9ybWFsID0gbm9ybWFsaXplKHBvcnRhbE5vcm1hbCk7XG4gICAgICAgICAgdmVjMyBmb3J3YXJkUG9ydGFsID0gdmVjMygwLjAsIDAuMCwgLTEuMCk7XG5cbiAgICAgICAgICBmbG9hdCBwb3J0YWxfZGlyZWN0VmlldyA9IHNtb290aHN0ZXAoMC4wLCAwLjgsIGRvdChwb3J0YWxub3JtYWwsIGZvcndhcmRQb3J0YWwpKTtcbiAgICAgICAgICB2ZWMzIHBvcnRhbF90YW5nZW50T3V0d2FyZCA9IG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9jb29yZCwgMC4wKSk7XG4gICAgICAgICAgdmVjMyBwb3J0YWxfcmF5ID0gbWl4KHZSYXksIHBvcnRhbF90YW5nZW50T3V0d2FyZCwgcG9ydGFsX2Rpc3RvcnRpb24pO1xuXG4gICAgICAgICAgdmVjNCBteUN1YmVUZXhlbCA9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIHBvcnRhbF9yYXkpO1xuXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54IC0gdGV4SW52U2l6ZS5zLCBwb3J0YWxfcmF5Lnl6KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54IC0gdGV4SW52U2l6ZS5zLCBwb3J0YWxfcmF5Lnl6KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54LCBwb3J0YWxfcmF5LnkgLSB0ZXhJbnZTaXplLnQsIHBvcnRhbF9yYXkueikpKSAvIDguMDsgICAgICAgIFxuICAgICAgICAvLyAgIG15Q3ViZVRleGVsICs9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9yYXkueCwgcG9ydGFsX3JheS55IC0gdGV4SW52U2l6ZS50LCBwb3J0YWxfcmF5LnopKSkgLyA4LjA7ICAgICAgICBcblxuICAgICAgICAgIG15Q3ViZVRleGVsID0gbWFwVGV4ZWxUb0xpbmVhciggbXlDdWJlVGV4ZWwgKTtcblxuICAgICAgICAvLyAgIHZlYzQgcG9zQ29sID0gdmVjNChzbW9vdGhzdGVwKC02LjAsIDYuMCwgY2FtZXJhTG9jYWwpLCAxLjApOyAvL25vcm1hbGl6ZSgoY2FtZXJhTG9jYWwgLyA2LjApKTtcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCA9IHBvc0NvbDsgLy8gdmVjNChwb3NDb2wueCwgcG9zQ29sLnksIHBvc0NvbC55LCAxLjApO1xuICAgICAgICAgIHZlYzMgY2VudGVyTGF5ZXIgPSBteUN1YmVUZXhlbC5yZ2IgKiBtYXNrSW5uZXI7XG4gICAgICAgICAgdmVjMyByaW5nTGF5ZXIgPSBwb3J0YWxSaW5nQ29sb3IgKiAoMS4gLSBtYXNrSW5uZXIpO1xuICAgICAgICAgIHZlYzMgcG9ydGFsX2NvbXBvc2l0ZSA9IGNlbnRlckxheWVyICsgcmluZ0xheWVyO1xuICAgICAgICBcbiAgICAgICAgICAvL2dsX0ZyYWdDb2xvciBcbiAgICAgICAgICB2ZWM0IHBvcnRhbENvbCA9IHZlYzQocG9ydGFsX2NvbXBvc2l0ZSwgKG1hc2tPdXRlciAtIG1hc2tJbm5lcikgKyBtYXNrSW5uZXIgKiBwb3J0YWxfZGlyZWN0Vmlldyk7XG4gICAgICAgIFxuICAgICAgICAgIC8vIGJsZW5kIHRoZSB0d29cbiAgICAgICAgICBwb3J0YWxDb2wucmdiICo9IHBvcnRhbENvbC5hOyAvL3ByZW11bHRpcGx5IHNvdXJjZSBcbiAgICAgICAgICBjb2wucmdiICo9ICgxLjAgLSBwb3J0YWxDb2wuYSk7XG4gICAgICAgICAgY29sLnJnYiArPSBwb3J0YWxDb2wucmdiO1xuXG4gICAgICAgICAgZGlmZnVzZUNvbG9yICo9IGNvbDtcbiAgICAgICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwICYmIG1hdC5tYXAucmVwZWF0ID8gbWF0Lm1hcC5yZXBlYXQgOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcCAmJiBtYXQubWFwLm9mZnNldCA/IG1hdC5tYXAub2Zmc2V0IDogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAgJiYgbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUaW1lID0geyB2YWx1ZTogMCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFRpbWUgPSB7IHZhbHVlOiAwIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaW52ZXJ0V2FycENvbG9yID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLmludmVydFdhcnBDb2xvciA/IG1hdC51c2VyRGF0YS5pbnZlcnRXYXJwQ29sb3IgOiBmYWxzZX1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmluZ0NvbG9yID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLnJpbmdDb2xvciA/IG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgOiBuZXcgVEhSRUUuQ29sb3IoXCJyZWRcIikgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxDdWJlTWFwID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLmN1YmVNYXAgPyBtYXQudXNlckRhdGEuY3ViZU1hcCA6IGN1YmVNYXAgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxSYWRpdXMgPSAge3ZhbHVlOiBtYXQudXNlckRhdGEucmFkaXVzID8gbWF0LnVzZXJEYXRhLnJhZGl1cyA6IDAuNX1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsQ3ViZU1hcC52YWx1ZSA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgPyBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwIDogY3ViZU1hcCBcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmFkaXVzLnZhbHVlID0gbWF0ZXJpYWwudXNlckRhdGEucmFkaXVzID8gbWF0ZXJpYWwudXNlckRhdGEucmFkaXVzIDogMC41XG5cbiAgICAgICAgaWYgKG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgJiYgQXJyYXkuaXNBcnJheShtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlcykgJiYgbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcC5pbWFnZXNbMF0pIHtcbiAgICAgICAgICAgIGxldCBoZWlnaHQgPSBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlc1swXS5oZWlnaHRcbiAgICAgICAgICAgIGxldCB3aWR0aCA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzWzBdLndpZHRoXG4gICAgICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhJbnZTaXplLnZhbHVlID0gbmV3IFRIUkVFLlZlY3RvcjIod2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cblxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH1cbiIsIi8qKlxuICogVmFyaW91cyBzaW1wbGUgc2hhZGVyc1xuICovXG5cbi8vIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek06ICBCbGVlcHkgQmxvY2tzXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwsIERlZmF1bHRNYXRlcmlhbE1vZGlmaWVyIGFzIE1hdGVyaWFsTW9kaWZpZXIsIFNoYWRlckV4dGVuc2lvbk9wdHMgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuXG4vLyBhZGQgIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy83ZEtHenpcblxuaW1wb3J0IHsgQmxlZXB5QmxvY2tzU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ibGVlcHktYmxvY2tzLXNoYWRlcidcbmltcG9ydCB7IE5vaXNlU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ub2lzZSdcbmltcG9ydCB7IExpcXVpZE1hcmJsZVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGlxdWlkLW1hcmJsZSdcbmltcG9ydCB7IEdhbGF4eVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvZ2FsYXh5J1xuaW1wb3J0IHsgTGFjZVR1bm5lbFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGFjZS10dW5uZWwnXG5pbXBvcnQgeyBGaXJlVHVubmVsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9maXJlLXR1bm5lbCdcbmltcG9ydCB7IE1pc3RTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21pc3QnXG5pbXBvcnQgeyBNYXJibGUxU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9tYXJibGUxJ1xuaW1wb3J0IHsgTm90Rm91bmRTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL25vdC1mb3VuZCdcbmltcG9ydCB7IFdhcnBTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAnXG5pbXBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy93YXJwLXBvcnRhbCdcblxuZnVuY3Rpb24gbWFwTWF0ZXJpYWxzKG9iamVjdDNEOiBUSFJFRS5PYmplY3QzRCwgZm46IChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpID0+IHZvaWQpIHtcbiAgICBsZXQgbWVzaCA9IG9iamVjdDNEIGFzIFRIUkVFLk1lc2hcbiAgICBpZiAoIW1lc2gubWF0ZXJpYWwpIHJldHVybjtcbiAgXG4gICAgaWYgKEFycmF5LmlzQXJyYXkobWVzaC5tYXRlcmlhbCkpIHtcbiAgICAgIHJldHVybiBtZXNoLm1hdGVyaWFsLm1hcChmbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmbihtZXNoLm1hdGVyaWFsKTtcbiAgICB9XG59XG4gIFxuICAvLyBUT0RPOiAga2V5IGEgcmVjb3JkIG9mIG5ldyBtYXRlcmlhbHMsIGluZGV4ZWQgYnkgdGhlIG9yaWdpbmFsXG4gIC8vIG1hdGVyaWFsIFVVSUQsIHNvIHdlIGNhbiBqdXN0IHJldHVybiBpdCBpZiByZXBsYWNlIGlzIGNhbGxlZCBvblxuICAvLyB0aGUgc2FtZSBtYXRlcmlhbCBtb3JlIHRoYW4gb25jZVxuICBleHBvcnQgZnVuY3Rpb24gcmVwbGFjZU1hdGVyaWFsIChvbGRNYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwsIHNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uLCB1c2VyRGF0YTogYW55KTogbnVsbCB8IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCB7XG4gICAgLy8gICBpZiAob2xkTWF0ZXJpYWwudHlwZSAhPSBcIk1lc2hTdGFuZGFyZE1hdGVyaWFsXCIpIHtcbiAgICAvLyAgICAgICBjb25zb2xlLndhcm4oXCJTaGFkZXIgQ29tcG9uZW50OiBkb24ndCBrbm93IGhvdyB0byBoYW5kbGUgU2hhZGVycyBvZiB0eXBlICdcIiArIG9sZE1hdGVyaWFsLnR5cGUgKyBcIicsIG9ubHkgTWVzaFN0YW5kYXJkTWF0ZXJpYWwgYXQgdGhpcyB0aW1lLlwiKVxuICAgIC8vICAgICAgIHJldHVybjtcbiAgICAvLyAgIH1cblxuICAgICAgLy9jb25zdCBtYXRlcmlhbCA9IG9sZE1hdGVyaWFsLmNsb25lKCk7XG4gICAgICB2YXIgQ3VzdG9tTWF0ZXJpYWxcbiAgICAgIHRyeSB7XG4gICAgICAgICAgQ3VzdG9tTWF0ZXJpYWwgPSBNYXRlcmlhbE1vZGlmaWVyLmV4dGVuZCAob2xkTWF0ZXJpYWwudHlwZSwge1xuICAgICAgICAgICAgdW5pZm9ybXM6IHNoYWRlci51bmlmb3JtcyxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogc2hhZGVyLnZlcnRleFNoYWRlcixcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyOiBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgICAgICB9KVxuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIC8vIGNyZWF0ZSBhIG5ldyBtYXRlcmlhbCwgaW5pdGlhbGl6aW5nIHRoZSBiYXNlIHBhcnQgd2l0aCB0aGUgb2xkIG1hdGVyaWFsIGhlcmVcbiAgICAgIGxldCBtYXRlcmlhbCA9IG5ldyBDdXN0b21NYXRlcmlhbCgpXG5cbiAgICAgIHN3aXRjaCAob2xkTWF0ZXJpYWwudHlwZSkge1xuICAgICAgICAgIGNhc2UgXCJNZXNoU3RhbmRhcmRNYXRlcmlhbFwiOlxuICAgICAgICAgICAgICBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbC5wcm90b3R5cGUuY29weS5jYWxsKG1hdGVyaWFsLCBvbGRNYXRlcmlhbClcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIk1lc2hQaG9uZ01hdGVyaWFsXCI6XG4gICAgICAgICAgICAgIFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsLnByb3RvdHlwZS5jb3B5LmNhbGwobWF0ZXJpYWwsIG9sZE1hdGVyaWFsKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwiTWVzaEJhc2ljTWF0ZXJpYWxcIjpcbiAgICAgICAgICAgICAgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBtYXRlcmlhbC51c2VyRGF0YSA9IHVzZXJEYXRhO1xuICAgICAgbWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgc2hhZGVyLmluaXQobWF0ZXJpYWwpO1xuICAgICAgXG4gICAgICByZXR1cm4gbWF0ZXJpYWxcbiAgfVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlV2l0aFNoYWRlcihzaGFkZXJEZWY6IFNoYWRlckV4dGVuc2lvbiwgZWw6IGFueSwgdGFyZ2V0OiBzdHJpbmcsIHVzZXJEYXRhOiBhbnkgPSB7fSk6IChUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpW10ge1xuICAgIC8vIG1lc2ggd291bGQgY29udGFpbiB0aGUgb2JqZWN0IHRoYXQgaXMsIG9yIGNvbnRhaW5zLCB0aGUgbWVzaGVzXG4gICAgdmFyIG1lc2ggPSBlbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgaWYgKCFtZXNoKSB7XG4gICAgICAgIC8vIGlmIG5vIG1lc2gsIHdlJ2xsIHNlYXJjaCB0aHJvdWdoIGFsbCBvZiB0aGUgY2hpbGRyZW4uICBUaGlzIHdvdWxkXG4gICAgICAgIC8vIGhhcHBlbiBpZiB3ZSBkcm9wcGVkIHRoZSBjb21wb25lbnQgb24gYSBnbGIgaW4gc3Bva2VcbiAgICAgICAgbWVzaCA9IGVsLm9iamVjdDNEXG4gICAgfVxuICAgIFxuICAgIGxldCBtYXRlcmlhbHM6IGFueSA9IFtdXG4gICAgbGV0IHRyYXZlcnNlID0gKG9iamVjdDogVEhSRUUuT2JqZWN0M0QpID0+IHtcbiAgICAgIGxldCBtZXNoID0gb2JqZWN0IGFzIFRIUkVFLk1lc2hcbiAgICAgIGlmIChtZXNoLm1hdGVyaWFsKSB7XG4gICAgICAgICAgbWFwTWF0ZXJpYWxzKG1lc2gsIChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpID0+IHsgICAgICAgICBcbiAgICAgICAgICAgICAgaWYgKCF0YXJnZXQgfHwgbWF0ZXJpYWwubmFtZSA9PT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICBsZXQgbmV3TSA9IHJlcGxhY2VNYXRlcmlhbChtYXRlcmlhbCwgc2hhZGVyRGVmLCB1c2VyRGF0YSlcbiAgICAgICAgICAgICAgICAgIGlmIChuZXdNKSB7XG4gICAgICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01cblxuICAgICAgICAgICAgICAgICAgICAgIG1hdGVyaWFscy5wdXNoKG5ld00pXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgfVxuICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRyYXZlcnNlKG1lc2gpO1xuICAgIHJldHVybiBtYXRlcmlhbHNcbiAgfVxuXG5jb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBmb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMSlcblxuY29uc3Qgb25jZSA9IHtcbiAgICBvbmNlIDogdHJ1ZVxufTtcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzaGFkZXInLCB7XG4gICAgbWF0ZXJpYWxzOiBudWxsIGFzIChUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpW10gfCBudWxsLCAgXG4gICAgc2hhZGVyRGVmOiBudWxsIGFzIFNoYWRlckV4dGVuc2lvbiB8IG51bGwsXG5cbiAgICBzY2hlbWE6IHtcbiAgICAgICAgbmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJub2lzZVwiIH0sXG4gICAgICAgIHRhcmdldDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJcIiB9ICAvLyBpZiBub3RoaW5nIHBhc3NlZCwganVzdCBjcmVhdGUgc29tZSBub2lzZVxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzaGFkZXJEZWY6IFNoYWRlckV4dGVuc2lvbjtcblxuICAgICAgICBzd2l0Y2ggKHRoaXMuZGF0YS5uYW1lKSB7XG4gICAgICAgICAgICBjYXNlIFwibm9pc2VcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBOb2lzZVNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwid2FycFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IFdhcnBTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcIndhcnAtcG9ydGFsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gV2FycFBvcnRhbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwibGlxdWlkbWFyYmxlXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTGlxdWlkTWFyYmxlU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIFxuICAgICAgICAgICAgY2FzZSBcImJsZWVweWJsb2Nrc1wiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IEJsZWVweUJsb2Nrc1NoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwiZ2FsYXh5XCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gR2FsYXh5U2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJsYWNldHVubmVsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTGFjZVR1bm5lbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwiZmlyZXR1bm5lbFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IEZpcmVUdW5uZWxTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICAgICAgICBjYXNlIFwibWlzdFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE1pc3RTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcIm1hcmJsZTFcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBNYXJibGUxU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLy8gYW4gdW5rbm93biBuYW1lIHdhcyBwYXNzZWQgaW5cbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ1bmtub3duIG5hbWUgJ1wiICsgdGhpcy5kYXRhLm5hbWUgKyBcIicgcGFzc2VkIHRvIHNoYWRlciBjb21wb25lbnRcIilcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBOb3RGb3VuZFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IFxuXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICBsZXQgdXBkYXRlTWF0ZXJpYWxzID0gKCkgPT57XG4gICAgICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLnRhcmdldFxuICAgICAgICAgICAgaWYgKHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1hdGVyaWFscyA9IHVwZGF0ZVdpdGhTaGFkZXIoc2hhZGVyRGVmLCB0aGlzLmVsLCB0YXJnZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGluaXRpYWxpemVyID0gKCkgPT57XG4gICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICAgICAgbGV0IGZuID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVNYXRlcmlhbHMoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgZm4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCBmbilcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlTWF0ZXJpYWxzKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByb290ICYmIChyb290IGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGluaXRpYWxpemVyLCBvbmNlKTtcbiAgICAgICAgdGhpcy5zaGFkZXJEZWYgPSBzaGFkZXJEZWZcbiAgICB9LFxuXG5cbiAgdGljazogZnVuY3Rpb24odGltZSkge1xuICAgIGlmICh0aGlzLnNoYWRlckRlZiA9PSBudWxsIHx8IHRoaXMubWF0ZXJpYWxzID09IG51bGwpIHsgcmV0dXJuIH1cblxuICAgIGxldCBzaGFkZXJEZWYgPSB0aGlzLnNoYWRlckRlZlxuICAgIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7c2hhZGVyRGVmLnVwZGF0ZVVuaWZvcm1zKHRpbWUsIG1hdCl9KVxuICAgIC8vIHN3aXRjaCAodGhpcy5kYXRhLm5hbWUpIHtcbiAgICAvLyAgICAgY2FzZSBcIm5vaXNlXCI6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyAgICAgY2FzZSBcImJsZWVweWJsb2Nrc1wiOlxuICAgIC8vICAgICAgICAgYnJlYWs7XG4gICAgLy8gICAgIGRlZmF1bHQ6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyB9XG5cbiAgICAvLyBpZiAodGhpcy5zaGFkZXIpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJmcmFnbWVudCBzaGFkZXI6XCIsIHRoaXMubWF0ZXJpYWwuZnJhZ21lbnRTaGFkZXIpXG4gICAgLy8gICAgIHRoaXMuc2hhZGVyID0gbnVsbFxuICAgIC8vIH1cbiAgfSxcbn0pXG5cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzJhZWIwMGI2NGFlOTU2OGYuanBnXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy81MGExYjZkMzM4Y2IyNDZlLmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvYWVhYjIwOTFlNGE1M2U5ZC5wbmdcIiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzBjZTQ2YzQyMmY5NDVhOTYuanBnXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy82YTNlOGI0MzMyZDQ3Y2UyLmpwZ1wiIiwibGV0IFNJWkUgPSAxMDI0XG5sZXQgVEFSR0VUV0lEVEggPSBTSVpFXG5sZXQgVEFSR0VUSEVJR0hUID0gU0laRVxuXG53aW5kb3cuQVBQLndyaXRlV2F5UG9pbnRUZXh0dXJlcyA9IGZ1bmN0aW9uKG5hbWVzKSB7XG4gICAgaWYgKCAhQXJyYXkuaXNBcnJheSggbmFtZXMgKSApIHtcbiAgICAgICAgbmFtZXMgPSBbIG5hbWVzIF1cbiAgICB9XG5cbiAgICBmb3IgKCBsZXQgayA9IDA7IGsgPCBuYW1lcy5sZW5ndGg7IGsrKyApIHtcbiAgICAgICAgbGV0IHdheXBvaW50cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUobmFtZXNba10pXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAod2F5cG9pbnRzW2ldLmNvbXBvbmVudHMud2F5cG9pbnQpIHtcbiAgICAgICAgICAgICAgICBsZXQgY3ViZWNhbSA9IG51bGxcbiAgICAgICAgICAgICAgICAvLyBcbiAgICAgICAgICAgICAgICAvLyBmb3IgKGxldCBqID0gMDsgaiA8IHdheXBvaW50c1tpXS5vYmplY3QzRC5jaGlsZHJlbi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIC8vICAgICBpZiAod2F5cG9pbnRzW2ldLm9iamVjdDNELmNoaWxkcmVuW2pdIGluc3RhbmNlb2YgQ3ViZUNhbWVyYVdyaXRlcikge1xuICAgICAgICAgICAgICAgIC8vICAgICAgICAgY29uc29sZS5sb2coXCJmb3VuZCB3YXlwb2ludCB3aXRoIGN1YmVDYW1lcmEgJ1wiICsgbmFtZXNba10gKyBcIidcIilcbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGN1YmVjYW0gPSB3YXlwb2ludHNbaV0ub2JqZWN0M0QuY2hpbGRyZW5bal1cbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIC8vICAgICB9XG4gICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgIC8vIGlmICghY3ViZWNhbSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcImRpZG4ndCBmaW5kIHdheXBvaW50IHdpdGggY3ViZUNhbWVyYSAnXCIgKyBuYW1lc1trXSArIFwiJywgY3JlYXRpbmcgb25lLlwiKSAgICAgICAgICAgICAgICAgICAgLy8gY3JlYXRlIGEgY3ViZSBtYXAgY2FtZXJhIGFuZCByZW5kZXIgdGhlIHZpZXchXG4gICAgICAgICAgICAgICAgICAgIGlmIChUSFJFRS5SRVZJU0lPTiA8IDEyNSkgeyAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgY3ViZWNhbSA9IG5ldyBDdWJlQ2FtZXJhV3JpdGVyKDAuMSwgMTAwMCwgU0laRSlcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1YmVSZW5kZXJUYXJnZXQgPSBuZXcgVEhSRUUuV2ViR0xDdWJlUmVuZGVyVGFyZ2V0KCBTSVpFLCB7IGVuY29kaW5nOiBUSFJFRS5zUkdCRW5jb2RpbmcsIGdlbmVyYXRlTWlwbWFwczogdHJ1ZSB9IClcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1YmVjYW0gPSBuZXcgQ3ViZUNhbWVyYVdyaXRlcigxLCAxMDAwMDAsIGN1YmVSZW5kZXJUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGN1YmVjYW0ucG9zaXRpb24ueSA9IDEuNlxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB3YXlwb2ludHNbaV0ub2JqZWN0M0QuYWRkKGN1YmVjYW0pXG4gICAgICAgICAgICAgICAgICAgIGN1YmVjYW0udXBkYXRlKHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXIsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuQVBQLnNjZW5lLm9iamVjdDNEKVxuICAgICAgICAgICAgICAgIC8vIH0gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICBjdWJlY2FtLnNhdmVDdWJlTWFwU2lkZXMobmFtZXNba10pXG4gICAgICAgICAgICAgICAgd2F5cG9pbnRzW2ldLm9iamVjdDNELnJlbW92ZShjdWJlY2FtKVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5jbGFzcyBDdWJlQ2FtZXJhV3JpdGVyIGV4dGVuZHMgVEhSRUUuQ3ViZUNhbWVyYSB7XG5cbiAgICBjb25zdHJ1Y3RvciguLi5hcmdzKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3MpO1xuXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gVEFSR0VUV0lEVEg7XG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IFRBUkdFVEhFSUdIVDtcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IHRydWU7XG4gICAgICAgIC8vIHRoaXMucmVuZGVyVGFyZ2V0LnRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyTWlwTWFwTGluZWFyRmlsdGVyO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcblxuICAgICAgICAvLyB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKCByZW5kZXJlciwgc2NlbmUgKSB7XG5cbiAgICAgICAgLy8gICAgIGxldCBbIGNhbWVyYVBYLCBjYW1lcmFOWCwgY2FtZXJhUFksIGNhbWVyYU5ZLCBjYW1lcmFQWiwgY2FtZXJhTlogXSA9IHRoaXMuY2hpbGRyZW47XG5cbiAgICBcdC8vIFx0aWYgKCB0aGlzLnBhcmVudCA9PT0gbnVsbCApIHRoaXMudXBkYXRlTWF0cml4V29ybGQoKTtcblxuICAgIFx0Ly8gXHRpZiAoIHRoaXMucGFyZW50ID09PSBudWxsICkgdGhpcy51cGRhdGVNYXRyaXhXb3JsZCgpO1xuXG4gICAgXHQvLyBcdHZhciBjdXJyZW50UmVuZGVyVGFyZ2V0ID0gcmVuZGVyZXIuZ2V0UmVuZGVyVGFyZ2V0KCk7XG5cbiAgICBcdC8vIFx0dmFyIHJlbmRlclRhcmdldCA9IHRoaXMucmVuZGVyVGFyZ2V0O1xuICAgIFx0Ly8gXHQvL3ZhciBnZW5lcmF0ZU1pcG1hcHMgPSByZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHM7XG5cbiAgICBcdC8vIFx0Ly9yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMCApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFQWCApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCAxICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYU5YICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDIgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhUFkgKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMyApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFOWSApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCA0ICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYVBaICk7XG5cbiAgICBcdC8vIFx0Ly9yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBnZW5lcmF0ZU1pcG1hcHM7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDUgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhTlogKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIGN1cnJlbnRSZW5kZXJUYXJnZXQgKTtcbiAgICAgICAgLy8gfTtcblx0fVxuXG4gICAgc2F2ZUN1YmVNYXBTaWRlcyhzbHVnKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNjsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmNhcHR1cmUoc2x1ZywgaSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY2FwdHVyZSAoc2x1Zywgc2lkZSkge1xuICAgICAgICAvL3ZhciBpc1ZSRW5hYmxlZCA9IHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXIueHIuZW5hYmxlZDtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gd2luZG93LkFQUC5zY2VuZS5yZW5kZXJlcjtcbiAgICAgICAgLy8gRGlzYWJsZSBWUi5cbiAgICAgICAgLy9yZW5kZXJlci54ci5lbmFibGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVuZGVyQ2FwdHVyZShzaWRlKTtcbiAgICAgICAgLy8gVHJpZ2dlciBmaWxlIGRvd25sb2FkLlxuICAgICAgICB0aGlzLnNhdmVDYXB0dXJlKHNsdWcsIHNpZGUpO1xuICAgICAgICAvLyBSZXN0b3JlIFZSLlxuICAgICAgICAvL3JlbmRlcmVyLnhyLmVuYWJsZWQgPSBpc1ZSRW5hYmxlZDtcbiAgICAgfVxuXG4gICAgcmVuZGVyQ2FwdHVyZSAoY3ViZVNpZGUpIHtcbiAgICAgICAgdmFyIGltYWdlRGF0YTtcbiAgICAgICAgdmFyIHBpeGVsczMgPSBuZXcgVWludDhBcnJheSg0ICogVEFSR0VUV0lEVEggKiBUQVJHRVRIRUlHSFQpO1xuICAgICAgICB2YXIgcmVuZGVyZXIgPSB3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyO1xuXG4gICAgICAgIHJlbmRlcmVyLnJlYWRSZW5kZXJUYXJnZXRQaXhlbHModGhpcy5yZW5kZXJUYXJnZXQsIDAsIDAsIFRBUkdFVFdJRFRILFRBUkdFVEhFSUdIVCwgcGl4ZWxzMywgY3ViZVNpZGUpO1xuXG4gICAgICAgIC8vcGl4ZWxzMyA9IHRoaXMuZmxpcFBpeGVsc1ZlcnRpY2FsbHkocGl4ZWxzMywgVEFSR0VUV0lEVEgsIFRBUkdFVEhFSUdIVCk7XG4gICAgICAgIHZhciBwaXhlbHM0ID0gcGl4ZWxzMzsgIC8vdGhpcy5jb252ZXJ0M3RvNChwaXhlbHMzLCBUQVJHRVRXSURUSCwgVEFSR0VUSEVJR0hUKTtcbiAgICAgICAgaW1hZ2VEYXRhID0gbmV3IEltYWdlRGF0YShuZXcgVWludDhDbGFtcGVkQXJyYXkocGl4ZWxzNCksIFRBUkdFVFdJRFRILCBUQVJHRVRIRUlHSFQpO1xuXG4gICAgICAgIC8vIENvcHkgcGl4ZWxzIGludG8gY2FudmFzLlxuXG4gICAgICAgIC8vIGNvdWxkIHVzZSBkcmF3SW1hZ2UgaW5zdGVhZCwgdG8gc2NhbGUsIGlmIHdlIHdhbnRcbiAgICAgICAgdGhpcy5jdHgucHV0SW1hZ2VEYXRhKGltYWdlRGF0YSwgMCwgMCk7XG4gICAgfVxuXG4gICAgZmxpcFBpeGVsc1ZlcnRpY2FsbHkgKHBpeGVscywgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZmxpcHBlZFBpeGVscyA9IHBpeGVscy5zbGljZSgwKTtcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCB3aWR0aDsgKyt4KSB7XG4gICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCBoZWlnaHQ7ICsreSkge1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIHkgKiB3aWR0aCAqIDNdID0gcGl4ZWxzW3ggKiAzICsgKGhlaWdodCAtIHkgLSAxKSAqIHdpZHRoICogM107XG4gICAgICAgICAgICBmbGlwcGVkUGl4ZWxzW3ggKiAzICsgMSArIHkgKiB3aWR0aCAqIDNdID0gcGl4ZWxzW3ggKiAzICsgMSArIChoZWlnaHQgLSB5IC0gMSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIDIgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIDIgKyAoaGVpZ2h0IC0geSAtIDEpICogd2lkdGggKiAzXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZsaXBwZWRQaXhlbHM7XG4gICAgfVxuXG4gICAgY29udmVydDN0bzQgKHBpeGVscywgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgbmV3UGl4ZWxzID0gbmV3IFVpbnQ4QXJyYXkoNCAqIFRBUkdFVFdJRFRIICogVEFSR0VUSEVJR0hUKTtcblxuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHdpZHRoOyArK3gpIHtcbiAgICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IGhlaWdodDsgKyt5KSB7XG4gICAgICAgICAgICBuZXdQaXhlbHNbeCAqIDQgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMSArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgMSArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMiArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgMiArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMyArIHkgKiB3aWR0aCAqIDRdID0gMjU1O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3UGl4ZWxzO1xuICAgIH1cblxuXG4gICAgc2lkZXMgPSBbXG4gICAgICAgIFwiUmlnaHRcIiwgXCJMZWZ0XCIsIFwiVG9wXCIsIFwiQm90dG9tXCIsIFwiRnJvbnRcIiwgXCJCYWNrXCJcbiAgICBdXG5cbiAgICBzYXZlQ2FwdHVyZSAoc2x1Zywgc2lkZSkge1xuICAgICAgICB0aGlzLmNhbnZhcy50b0Jsb2IoIChibG9iKSA9PiB7XG4gICAgICAgICAgICB2YXIgZmlsZU5hbWUgPSBzbHVnICsgJy0nICsgdGhpcy5zaWRlc1tzaWRlXSArICcucG5nJztcbiAgICAgICAgICAgIHZhciBsaW5rRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICB2YXIgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgICAgIGxpbmtFbC5ocmVmID0gdXJsO1xuICAgICAgICAgICAgbGlua0VsLnNldEF0dHJpYnV0ZSgnZG93bmxvYWQnLCBmaWxlTmFtZSk7XG4gICAgICAgICAgICBsaW5rRWwuaW5uZXJIVE1MID0gJ2Rvd25sb2FkaW5nLi4uJztcbiAgICAgICAgICAgIGxpbmtFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaW5rRWwpO1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbGlua0VsLmNsaWNrKCk7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChsaW5rRWwpO1xuICAgICAgICAgICAgfSwgMSk7XG4gICAgICAgIH0sICdpbWFnZS9wbmcnKTtcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEN1YmVDYW1lcmFXcml0ZXIiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQmlkaXJlY3Rpb25hbCBzZWUtdGhyb3VnaCBwb3J0YWwuIFR3byBwb3J0YWxzIGFyZSBwYWlyZWQgYnkgY29sb3IuXG4gKlxuICogVXNhZ2VcbiAqID09PT09PT1cbiAqIEFkZCB0d28gaW5zdGFuY2VzIG9mIGBwb3J0YWwuZ2xiYCB0byB0aGUgU3Bva2Ugc2NlbmUuXG4gKiBUaGUgbmFtZSBvZiBlYWNoIGluc3RhbmNlIHNob3VsZCBsb29rIGxpa2UgXCJzb21lLWRlc2NyaXB0aXZlLWxhYmVsX19jb2xvclwiXG4gKiBBbnkgdmFsaWQgVEhSRUUuQ29sb3IgYXJndW1lbnQgaXMgYSB2YWxpZCBjb2xvciB2YWx1ZS5cbiAqIFNlZSBoZXJlIGZvciBleGFtcGxlIGNvbG9yIG5hbWVzIGh0dHBzOi8vd3d3Lnczc2Nob29scy5jb20vY3NzcmVmL2Nzc19jb2xvcnMuYXNwXG4gKlxuICogRm9yIGV4YW1wbGUsIHRvIG1ha2UgYSBwYWlyIG9mIGNvbm5lY3RlZCBibHVlIHBvcnRhbHMsXG4gKiB5b3UgY291bGQgbmFtZSB0aGVtIFwicG9ydGFsLXRvX19ibHVlXCIgYW5kIFwicG9ydGFsLWZyb21fX2JsdWVcIlxuICovXG5pbXBvcnQge3Z1ZUNvbXBvbmVudHMgYXMgaHRtbENvbXBvbmVudHN9IGZyb20gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIjtcbi8vICBpbXBvcnQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIjtcbi8vIGxldCBodG1sQ29tcG9uZW50cyA9IHdpbmRvdy5BUFAudnVlQXBwc1xuXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcbi8vIGltcG9ydCB2ZXJ0ZXhTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwudmVydC5qcydcbi8vIGltcG9ydCBmcmFnbWVudFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC5mcmFnLmpzJ1xuLy8gaW1wb3J0IHNub2lzZSBmcm9tICcuLi9zaGFkZXJzL3Nub2lzZSdcblxuaW1wb3J0IHsgc2hvd1JlZ2lvbkZvck9iamVjdCwgaGlkZXJSZWdpb25Gb3JPYmplY3QgfSBmcm9tICcuL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tICcuLi91dGlscy9zY2VuZS1ncmFwaCdcbmltcG9ydCB7IHVwZGF0ZVdpdGhTaGFkZXIgfSBmcm9tICcuL3NoYWRlcidcbmltcG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAtcG9ydGFsLmpzJ1xuXG5pbXBvcnQgZ29sZGNvbG9yIGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0NPTE9SLmpwZydcbmltcG9ydCBnb2xkRGlzcGxhY2VtZW50IGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0RJU1AuanBnJ1xuaW1wb3J0IGdvbGRnbG9zcyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9nbG9zc2luZXNzLnBuZydcbmltcG9ydCBnb2xkbm9ybSBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9OUk0uanBnJ1xuaW1wb3J0IGdvbGRhbyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9PQ0MuanBnJ1xuXG5pbXBvcnQgQ3ViZUNhbWVyYVdyaXRlciBmcm9tIFwiLi4vdXRpbHMvd3JpdGVDdWJlTWFwLmpzXCI7XG5cbmltcG9ydCB7IHJlcGxhY2VNYXRlcmlhbCBhcyByZXBsYWNlV2l0aFNoYWRlcn0gZnJvbSAnLi9zaGFkZXInXG5cbmNvbnN0IHdvcmxkUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRDYW1lcmFQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZERpciA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkUXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKClcbmNvbnN0IG1hdDQgPSBuZXcgVEhSRUUuTWF0cml4NCgpXG5cbi8vIGxvYWQgYW5kIHNldHVwIGFsbCB0aGUgYml0cyBvZiB0aGUgdGV4dHVyZXMgZm9yIHRoZSBkb29yXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG5jb25zdCBkb29yTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xuICAgIGNvbG9yOiAweGZmZmZmZixcbiAgICBtZXRhbG5lc3M6IDAuMCxcbiAgICByb3VnaG5lc3M6IDAuMCwgXG4gICAgLy9lbWlzc2l2ZUludGVuc2l0eTogMVxufSlcbmNvbnN0IGRvb3JtYXRlcmlhbFkgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xuICAgIGNvbG9yOiAweGZmZmZmZixcbiAgICBtZXRhbG5lc3M6IDAuMCxcbiAgICByb3VnaG5lc3M6IDAsIFxuICAgIC8vZW1pc3NpdmVJbnRlbnNpdHk6IDFcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRjb2xvciwgKGNvbG9yKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLm1hcCA9IGNvbG9yO1xuICAgIGNvbG9yLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBjb2xvci53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGNvbG9yLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcbmxvYWRlci5sb2FkKGdvbGRjb2xvciwgKGNvbG9yKSA9PiB7XG4gICAgLy9jb2xvciA9IGNvbG9yLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLm1hcCA9IGNvbG9yO1xuICAgIGNvbG9yLnJlcGVhdC5zZXQoMSwxKVxuICAgIGNvbG9yLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBjb2xvci53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGREaXNwbGFjZW1lbnQsIChkaXNwKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLmJ1bXBNYXAgPSBkaXNwO1xuICAgIGRpc3AucmVwZWF0LnNldCgxLDI1KVxuICAgIGRpc3Aud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkaXNwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZERpc3BsYWNlbWVudCwgKGRpc3ApID0+IHtcbiAgICAvL2Rpc3AgPSBkaXNwLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLmJ1bXBNYXAgPSBkaXNwO1xuICAgIGRpc3AucmVwZWF0LnNldCgxLDEpXG4gICAgZGlzcC53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZGlzcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRnbG9zcywgKGdsb3NzKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLnJvdWdobmVzcyA9IGdsb3NzXG4gICAgZ2xvc3MucmVwZWF0LnNldCgxLDI1KVxuICAgIGdsb3NzLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZ2xvc3Mud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkZ2xvc3MsIChnbG9zcykgPT4ge1xuICAgIC8vZ2xvc3MgPSBnbG9zcy5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5yb3VnaG5lc3MgPSBnbG9zc1xuICAgIGdsb3NzLnJlcGVhdC5zZXQoMSwxKVxuICAgIGdsb3NzLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBnbG9zcy53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG4gICAgICAgICBcbmxvYWRlci5sb2FkKGdvbGRhbywgKGFvKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLmFvTWFwID0gYW9cbiAgICBhby5yZXBlYXQuc2V0KDEsMjUpXG4gICAgYW8ud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBhby53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG4gICAgICAgICBcbmxvYWRlci5sb2FkKGdvbGRhbywgKGFvKSA9PiB7XG4gICAgLy8gYW8gPSBhby5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5hb01hcCA9IGFvXG4gICAgYW8ucmVwZWF0LnNldCgxLDEpXG4gICAgYW8ud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGFvLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkb29ybWF0ZXJpYWxZLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZG5vcm0sIChub3JtKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLm5vcm1hbE1hcCA9IG5vcm07XG4gICAgbm9ybS5yZXBlYXQuc2V0KDEsMjUpXG4gICAgbm9ybS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vcm0ud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkbm9ybSwgKG5vcm0pID0+IHtcbiAgICAvLyBub3JtID0gbm9ybS5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5ub3JtYWxNYXAgPSBub3JtO1xuICAgIG5vcm0ucmVwZWF0LnNldCgxLDEpXG4gICAgbm9ybS53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgbm9ybS53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbi8vIC8vIG1hcCBhbGwgbWF0ZXJpYWxzIHZpYSBhIGNhbGxiYWNrLiAgVGFrZW4gZnJvbSBodWJzIG1hdGVyaWFscy11dGlsc1xuLy8gZnVuY3Rpb24gbWFwTWF0ZXJpYWxzKG9iamVjdDNELCBmbikge1xuLy8gICAgIGxldCBtZXNoID0gb2JqZWN0M0QgXG4vLyAgICAgaWYgKCFtZXNoLm1hdGVyaWFsKSByZXR1cm47XG4gIFxuLy8gICAgIGlmIChBcnJheS5pc0FycmF5KG1lc2gubWF0ZXJpYWwpKSB7XG4vLyAgICAgICByZXR1cm4gbWVzaC5tYXRlcmlhbC5tYXAoZm4pO1xuLy8gICAgIH0gZWxzZSB7XG4vLyAgICAgICByZXR1cm4gZm4obWVzaC5tYXRlcmlhbCk7XG4vLyAgICAgfVxuLy8gfVxuICBcbmNvbnN0IG9uY2UgPSB7XG4gICAgb25jZSA6IHRydWVcbn07XG5cbkFGUkFNRS5yZWdpc3RlclN5c3RlbSgncG9ydGFsJywge1xuICBkZXBlbmRlbmNpZXM6IFsnZmFkZXItcGx1cyddLFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyID0gdGhpcy5lbC5zeXN0ZW1zWydodWJzLXN5c3RlbXMnXS5jaGFyYWN0ZXJDb250cm9sbGVyXG4gICAgdGhpcy5mYWRlciA9IHRoaXMuZWwuc3lzdGVtc1snZmFkZXItcGx1cyddXG4gICAgLy8gdGhpcy5yb29tRGF0YSA9IG51bGxcbiAgICB0aGlzLndhaXRGb3JGZXRjaCA9IHRoaXMud2FpdEZvckZldGNoLmJpbmQodGhpcylcblxuICAgIC8vIGlmIHRoZSB1c2VyIGlzIGxvZ2dlZCBpbiwgd2Ugd2FudCB0byByZXRyaWV2ZSB0aGVpciB1c2VyRGF0YSBmcm9tIHRoZSB0b3AgbGV2ZWwgc2VydmVyXG4gICAgLy8gaWYgKHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMgJiYgd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbiAmJiAhd2luZG93LkFQUC51c2VyRGF0YSkge1xuICAgIC8vICAgICB0aGlzLmZldGNoUm9vbURhdGEoKVxuICAgIC8vIH1cbiAgfSxcbi8vICAgZmV0Y2hSb29tRGF0YTogYXN5bmMgZnVuY3Rpb24gKCkge1xuLy8gICAgIHZhciBwYXJhbXMgPSB7dG9rZW46IHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMudG9rZW4sXG4vLyAgICAgICAgICAgICAgICAgICByb29tX2lkOiB3aW5kb3cuQVBQLmh1YkNoYW5uZWwuaHViSWR9XG5cbi8vICAgICBjb25zdCBvcHRpb25zID0ge307XG4vLyAgICAgb3B0aW9ucy5oZWFkZXJzID0gbmV3IEhlYWRlcnMoKTtcbi8vICAgICBvcHRpb25zLmhlYWRlcnMuc2V0KFwiQXV0aG9yaXphdGlvblwiLCBgQmVhcmVyICR7cGFyYW1zfWApO1xuLy8gICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuLy8gICAgIGF3YWl0IGZldGNoKFwiaHR0cHM6Ly9yZWFsaXR5bWVkaWEuZGlnaXRhbC91c2VyRGF0YVwiLCBvcHRpb25zKVxuLy8gICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4vLyAgICAgICAgIC50aGVuKGRhdGEgPT4ge1xuLy8gICAgICAgICAgIGNvbnNvbGUubG9nKCdTdWNjZXNzOicsIGRhdGEpO1xuLy8gICAgICAgICAgIHRoaXMucm9vbURhdGEgPSBkYXRhO1xuLy8gICAgIH0pXG4vLyAgICAgdGhpcy5yb29tRGF0YS50ZXh0dXJlcyA9IFtdXG4vLyAgIH0sXG4gIGdldFJvb21VUkw6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgIGxldCBodWJfaWQgPSBhd2FpdCB0aGlzLmdldFJvb21IdWJJZChudW1iZXIpXG5cbiAgICAgIGxldCB1cmwgPSB3aW5kb3cuU1NPLnVzZXJJbmZvLnJvb21zLmxlbmd0aCA+IG51bWJlciA/IFwiaHR0cHM6Ly94ci5yZWFsaXR5bWVkaWEuZGlnaXRhbC9cIiArIGh1Yl9pZCA6IG51bGw7XG4gICAgICByZXR1cm4gdXJsXG4gIH0sXG4gIGdldFJvb21IdWJJZDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgIHRoaXMud2FpdEZvckZldGNoKClcbiAgICByZXR1cm4gd2luZG93LlNTTy51c2VySW5mby5yb29tc1tudW1iZXJdXG4gIH0sXG4gIGdldEN1YmVNYXA6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIsIHdheXBvaW50KSB7XG4gICAgICB0aGlzLndhaXRGb3JGZXRjaCgpXG5cbiAgICAgIGlmICghd2F5cG9pbnQgfHwgd2F5cG9pbnQubGVuZ3RoID09IDApIHtcbiAgICAgICAgICB3YXlwb2ludCA9IFwic3RhcnRcIlxuICAgICAgfVxuICAgICAgbGV0IHVybHMgPSBbXCJSaWdodFwiLFwiTGVmdFwiLFwiVG9wXCIsXCJCb3R0b21cIixcIkZyb250XCIsXCJCYWNrXCJdLm1hcChlbCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvZGF0YS9yb29tUGFub3MvXCIgKyBudW1iZXIudG9TdHJpbmcoKSArIFwiL1wiICsgd2F5cG9pbnQgKyBcIi1cIiArIGVsICsgXCIucG5nXCJcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdXJsc1xuICAgICAgLy9yZXR1cm4gdGhpcy5yb29tRGF0YS5jdWJlbWFwcy5sZW5ndGggPiBudW1iZXIgPyB0aGlzLnJvb21EYXRhLmN1YmVtYXBzW251bWJlcl0gOiBudWxsO1xuICB9LFxuICBnZXRDdWJlTWFwQnlOYW1lOiBhc3luYyBmdW5jdGlvbiAobmFtZSwgd2F5cG9pbnQpIHtcbiAgICBpZiAoIXdheXBvaW50IHx8IHdheXBvaW50Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHdheXBvaW50ID0gXCJzdGFydFwiXG4gICAgfVxuICAgIGxldCB1cmxzID0gW1wiUmlnaHRcIixcIkxlZnRcIixcIlRvcFwiLFwiQm90dG9tXCIsXCJGcm9udFwiLFwiQmFja1wiXS5tYXAoZWwgPT4ge1xuICAgICAgICByZXR1cm4gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9kYXRhL3Jvb21QYW5vcy9cIiArIG5hbWUgKyBcIi9cIiArIHdheXBvaW50ICsgXCItXCIgKyBlbCArIFwiLnBuZ1wiXG4gICAgfSlcbiAgICByZXR1cm4gdXJsc1xuICAgIC8vcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgd2FpdEZvckZldGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgIGlmICh3aW5kb3cuU1NPLnVzZXJJbmZvKSByZXR1cm5cbiAgICAgc2V0VGltZW91dCh0aGlzLndhaXRGb3JGZXRjaCwgMTAwKTsgLy8gdHJ5IGFnYWluIGluIDEwMCBtaWxsaXNlY29uZHNcbiAgfSxcbiAgdGVsZXBvcnRUbzogYXN5bmMgZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIHRoaXMudGVsZXBvcnRpbmcgPSB0cnVlXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlT3V0KClcbiAgICAvLyBTY2FsZSBzY3Jld3MgdXAgdGhlIHdheXBvaW50IGxvZ2ljLCBzbyBqdXN0IHNlbmQgcG9zaXRpb24gYW5kIG9yaWVudGF0aW9uXG4gICAgb2JqZWN0LmdldFdvcmxkUXVhdGVybmlvbih3b3JsZFF1YXQpXG4gICAgb2JqZWN0LmdldFdvcmxkRGlyZWN0aW9uKHdvcmxkRGlyKVxuICAgIG9iamVjdC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgIHdvcmxkUG9zLmFkZCh3b3JsZERpci5tdWx0aXBseVNjYWxhcigzKSkgLy8gVGVsZXBvcnQgaW4gZnJvbnQgb2YgdGhlIHBvcnRhbCB0byBhdm9pZCBpbmZpbml0ZSBsb29wXG4gICAgbWF0NC5tYWtlUm90YXRpb25Gcm9tUXVhdGVybmlvbih3b3JsZFF1YXQpXG4gICAgbWF0NC5zZXRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAvLyBVc2luZyB0aGUgY2hhcmFjdGVyQ29udHJvbGxlciBlbnN1cmVzIHdlIGRvbid0IHN0cmF5IGZyb20gdGhlIG5hdm1lc2hcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIudHJhdmVsQnlXYXlwb2ludChtYXQ0LCB0cnVlLCBmYWxzZSlcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVJbigpXG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gIH0sXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgcG9ydGFsVHlwZTogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgICAgIHBvcnRhbFRhcmdldDogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgICAgIHNlY29uZGFyeVRhcmdldDogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6IG51bGwgfSxcbiAgICAgICAgbWF0ZXJpYWxUYXJnZXQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IG51bGwgfSxcbiAgICAgICAgZHJhd0Rvb3I6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiBmYWxzZSB9LFxuICAgICAgICB0ZXh0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsfSxcbiAgICAgICAgdGV4dFBvc2l0aW9uOiB7IHR5cGU6ICd2ZWMzJyB9LFxuICAgICAgICB0ZXh0U2l6ZTogeyB0eXBlOiAndmVjMicgfSxcbiAgICAgICAgdGV4dFNjYWxlOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH1cbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBURVNUSU5HXG4gICAgICAgIC8vdGhpcy5kYXRhLmRyYXdEb29yID0gdHJ1ZVxuICAgICAgICAvLyB0aGlzLmRhdGEubWFpblRleHQgPSBcIlBvcnRhbCB0byB0aGUgQWJ5c3NcIlxuICAgICAgICAvLyB0aGlzLmRhdGEuc2Vjb25kYXJ5VGV4dCA9IFwiVG8gdmlzaXQgdGhlIEFieXNzLCBnbyB0aHJvdWdoIHRoZSBkb29yIVwiXG5cbiAgICAgICAgLy8gQS1GcmFtZSBpcyBzdXBwb3NlZCB0byBkbyB0aGlzIGJ5IGRlZmF1bHQgYnV0IGRvZXNuJ3Qgc2VlbSB0bz9cbiAgICAgICAgdGhpcy5zeXN0ZW0gPSB3aW5kb3cuQVBQLnNjZW5lLnN5c3RlbXMucG9ydGFsIFxuXG4gICAgICAgIHRoaXMudXBkYXRlUG9ydGFsID0gdGhpcy51cGRhdGVQb3J0YWwuYmluZCh0aGlzKVxuXG4gICAgICAgIGlmICh0aGlzLmRhdGEucG9ydGFsVHlwZS5sZW5ndGggPiAwICkge1xuICAgICAgICAgICAgdGhpcy5zZXRQb3J0YWxJbmZvKHRoaXMuZGF0YS5wb3J0YWxUeXBlLCB0aGlzLmRhdGEucG9ydGFsVGFyZ2V0LCB0aGlzLmRhdGEuY29sb3IpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHtcbiAgICAgICAgICAgIC8vIHBhcnNlIHRoZSBuYW1lIHRvIGdldCBwb3J0YWwgdHlwZSwgdGFyZ2V0LCBhbmQgY29sb3JcbiAgICAgICAgICAgIHRoaXMucGFyc2VOb2RlTmFtZSgpXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUgPSBudWxsO1xuXG4gICAgICAgIC8vIHdhaXQgdW50aWwgdGhlIHNjZW5lIGxvYWRzIHRvIGZpbmlzaC4gIFdlIHdhbnQgdG8gbWFrZSBzdXJlIGV2ZXJ5dGhpbmdcbiAgICAgICAgLy8gaXMgaW5pdGlhbGl6ZWRcbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIHJvb3QgJiYgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIChldikgPT4geyBcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZSgpXG4gICAgICAgIH0sIG9uY2UpO1xuICAgIH0sXG5cbiAgICBpbml0aWFsaXplOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgICAvLyAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICAvLyAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgICAgIC8vICAgdW5pZm9ybXM6IHtcbiAgICAgICAgLy8gICAgIGN1YmVNYXA6IHsgdmFsdWU6IG5ldyBUSFJFRS5UZXh0dXJlKCkgfSxcbiAgICAgICAgLy8gICAgIHRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgLy8gICAgIHJhZGl1czogeyB2YWx1ZTogMCB9LFxuICAgICAgICAvLyAgICAgcmluZ0NvbG9yOiB7IHZhbHVlOiB0aGlzLmNvbG9yIH0sXG4gICAgICAgIC8vICAgfSxcbiAgICAgICAgLy8gICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICAgIC8vICAgZnJhZ21lbnRTaGFkZXI6IGBcbiAgICAgICAgLy8gICAgICR7c25vaXNlfVxuICAgICAgICAvLyAgICAgJHtmcmFnbWVudFNoYWRlcn1cbiAgICAgICAgLy8gICBgLFxuICAgICAgICAvLyB9KVxuXG4gICAgICAgIC8vIEFzc3VtZSB0aGF0IHRoZSBvYmplY3QgaGFzIGEgcGxhbmUgZ2VvbWV0cnlcbiAgICAgICAgLy9jb25zdCBtZXNoID0gdGhpcy5lbC5nZXRPckNyZWF0ZU9iamVjdDNEKCdtZXNoJylcbiAgICAgICAgLy9tZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuXG4gICAgICAgIHRoaXMubWF0ZXJpYWxzID0gbnVsbFxuICAgICAgICB0aGlzLnJhZGl1cyA9IDAuMlxuICAgICAgICB0aGlzLmN1YmVNYXAgPSBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKVxuXG4gICAgICAgIC8vIGdldCB0aGUgb3RoZXIgYmVmb3JlIGNvbnRpbnVpbmdcbiAgICAgICAgdGhpcy5vdGhlciA9IGF3YWl0IHRoaXMuZ2V0T3RoZXIoKVxuXG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhbmltYXRpb25fX3BvcnRhbCcsIHtcbiAgICAgICAgICAgIHByb3BlcnR5OiAnY29tcG9uZW50cy5wb3J0YWwucmFkaXVzJyxcbiAgICAgICAgICAgIGR1cjogNzAwLFxuICAgICAgICAgICAgZWFzaW5nOiAnZWFzZUluT3V0Q3ViaWMnLFxuICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25iZWdpbicsICgpID0+ICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB0cnVlKSlcbiAgICAgICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25jb21wbGV0ZV9fcG9ydGFsJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9ICF0aGlzLmlzQ2xvc2VkKCkpKVxuXG4gICAgICAgIC8vIGdvaW5nIHRvIHdhbnQgdG8gdHJ5IGFuZCBtYWtlIHRoZSBvYmplY3QgdGhpcyBwb3J0YWwgaXMgb24gY2xpY2thYmxlXG4gICAgICAgIC8vIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywnJylcbiAgICAgICAgLy8gdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlfSlcbiAgICAgICAgLy90aGlzLmVsLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAvLyBvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBwb3J0YWwgbW92ZW1lbnQgXG4gICAgICAgIC8vdGhpcy5mb2xsb3dQb3J0YWwgPSB0aGlzLmZvbGxvd1BvcnRhbC5iaW5kKHRoaXMpXG4gICAgICAgIC8vdGhpcy5lbC5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuZm9sbG93UG9ydGFsKVxuXG4gICAgICAgIGlmICggdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdIHx8IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdICkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cFBvcnRhbCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLmRyYXdEb29yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgZm4pXG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgZm4pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKVxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cERvb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldHVwUG9ydGFsKClcbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHVwZGF0ZVBvcnRhbDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBuby1vcCBmb3IgcG9ydGFscyB0aGF0IHVzZSBwcmUtcmVuZGVyZWQgY3ViZSBtYXBzXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiB8fCB0aGlzLnBvcnRhbFR5cGUgPT0gMykgeyBcbiAgICAgICAgICAgIC8vdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsICgpID0+IHtcbiAgICAgICAgICAgICAgICBzaG93UmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnVwZGF0ZSh0aGlzLmVsLnNjZW5lRWwucmVuZGVyZXIsIHRoaXMuZWwuc2NlbmVFbC5vYmplY3QzRClcbiAgICAgICAgICAgICAgICAvLyB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgICAgICAgIC8vIHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICBoaWRlclJlZ2lvbkZvck9iamVjdCh0aGlzLmVsKVxuICAgICAgICAgICAgLy99LCBvbmNlKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHNldHVwUG9ydGFsOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGdldCByaWQgb2YgaW50ZXJhY3Rpdml0eVxuICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwiaXMtcmVtb3RlLWhvdmVyLXRhcmdldFwiKVxuICAgICAgICBcbiAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMuZGF0YS5tYXRlcmlhbFRhcmdldFxuICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgIFxuICAgICAgICB0aGlzLm1hdGVyaWFscyA9IHVwZGF0ZVdpdGhTaGFkZXIoV2FycFBvcnRhbFNoYWRlciwgdGhpcy5lbCwgdGFyZ2V0LCB7XG4gICAgICAgICAgICByYWRpdXM6IHRoaXMucmFkaXVzLFxuICAgICAgICAgICAgcmluZ0NvbG9yOiB0aGlzLmNvbG9yLFxuICAgICAgICAgICAgY3ViZU1hcDogdGhpcy5jdWJlTWFwLFxuICAgICAgICAgICAgaW52ZXJ0V2FycENvbG9yOiB0aGlzLnBvcnRhbFR5cGUgPT0gMSA/IDEgOiAwXG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRDdWJlTWFwKHRoaXMucG9ydGFsVGFyZ2V0LCB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0KS50aGVuKCB1cmxzID0+IHtcbiAgICAgICAgICAgICAgICAvL2NvbnN0IHVybHMgPSBbY3ViZU1hcFBvc1gsIGN1YmVNYXBOZWdYLCBjdWJlTWFwUG9zWSwgY3ViZU1hcE5lZ1ksIGN1YmVNYXBQb3NaLCBjdWJlTWFwTmVnWl07XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuQ3ViZVRleHR1cmVMb2FkZXIoKS5sb2FkKHVybHMsIHJlc29sdmUsIHVuZGVmaW5lZCwgcmVqZWN0KVxuICAgICAgICAgICAgICAgICkudGhlbih0ZXh0dXJlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGV4dHVyZTtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGV4dHVyZTt9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVNYXAgPSB0ZXh0dXJlXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGUpKSAgICBcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDQpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldEN1YmVNYXBCeU5hbWUodGhpcy5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQpLnRoZW4oIHVybHMgPT4ge1xuICAgICAgICAgICAgICAgIC8vY29uc3QgdXJscyA9IFtjdWJlTWFwUG9zWCwgY3ViZU1hcE5lZ1gsIGN1YmVNYXBQb3NZLCBjdWJlTWFwTmVnWSwgY3ViZU1hcFBvc1osIGN1YmVNYXBOZWdaXTtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLkN1YmVUZXh0dXJlTG9hZGVyKCkubG9hZCh1cmxzLCByZXNvbHZlLCB1bmRlZmluZWQsIHJlamVjdClcbiAgICAgICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRleHR1cmU7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gdGV4dHVyZVxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyIHx8IHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7IFxuICAgICAgICAgICAgaWYgKFRIUkVFLlJFVklTSU9OIDwgMTI1KSB7ICAgXG4gICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMC4xLCAxMDAwLCAxMDI0KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdWJlUmVuZGVyVGFyZ2V0ID0gbmV3IFRIUkVFLldlYkdMQ3ViZVJlbmRlclRhcmdldCggMTAyNCwgeyBlbmNvZGluZzogVEhSRUUuc1JHQkVuY29kaW5nLCBnZW5lcmF0ZU1pcG1hcHM6IHRydWUgfSApXG4gICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMSwgMTAwMDAwLCBjdWJlUmVuZGVyVGFyZ2V0KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3RoaXMuY3ViZUNhbWVyYS5yb3RhdGVZKE1hdGguUEkpIC8vIEZhY2UgZm9yd2FyZHNcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikge1xuICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgICAgICAgICAvLyB0aGlzLm90aGVyLmNvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFsLnVuaWZvcm1zLmN1YmVNYXAudmFsdWUgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmUgXG4gICAgICAgICAgICAgICAgLy90aGlzLm90aGVyLmNvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCB3YXlwb2ludCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUodGhpcy5wb3J0YWxUYXJnZXQpXG4gICAgICAgICAgICAgICAgaWYgKHdheXBvaW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnQgPSB3YXlwb2ludC5pdGVtKDApXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS5wb3NpdGlvbi55ID0gMS42XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnQub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7bWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy51cGRhdGVQb3J0YWwoKVxuICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ3VwZGF0ZVBvcnRhbHMnLCB0aGlzLnVwZGF0ZVBvcnRhbClcbiAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCB0aGlzLnVwZGF0ZVBvcnRhbClcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuICAgICAgICBsZXQgc2NhbGVJID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICBsZXQgc2NhbGVYID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICBsZXQgc2NhbGVZID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICBsZXQgc2NhbGVaID0gc2NhbGVNLnogKiBzY2FsZUkuelxuXG4gICAgICAgIC8vIHRoaXMucG9ydGFsV2lkdGggPSBzY2FsZVggLyAyXG4gICAgICAgIC8vIHRoaXMucG9ydGFsSGVpZ2h0ID0gc2NhbGVZIC8gMlxuXG4gICAgICAgIC8vIG9mZnNldCB0byBjZW50ZXIgb2YgcG9ydGFsIGFzc3VtaW5nIHdhbGtpbmcgb24gZ3JvdW5kXG4gICAgICAgIC8vIHRoaXMuWW9mZnNldCA9IC0odGhpcy5lbC5vYmplY3QzRC5wb3NpdGlvbi55IC0gMS42KVxuICAgICAgICB0aGlzLllvZmZzZXQgPSAtKHNjYWxlWS8yIC0gMS42KVxuXG4gICAgICAgIHRoaXMuY2xvc2UoKVxuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiA0LCBZb2Zmc2V0OiB0aGlzLllvZmZzZXQgfSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMub3BlbigpKVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5jbG9zZSgpKVxuXG4gICAgICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICBcbiAgICAgICAgaWYgKHRoaXMuZGF0YS50ZXh0ICYmIHRoaXMuZGF0YS50ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHZhciB0aXRsZVNjcmlwdERhdGEgPSB7XG4gICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMuZGF0YS50ZXh0U2l6ZS54LFxuICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5kYXRhLnRleHRTaXplLnksXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogdGhpcy5kYXRhLnRleHRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBvcnRhbFRpdGxlID0gaHRtbENvbXBvbmVudHNbXCJQb3J0YWxUaXRsZVwiXVxuICAgICAgICAgICAgLy8gY29uc3QgcG9ydGFsU3VidGl0bGUgPSBodG1sQ29tcG9uZW50c1tcIlBvcnRhbFN1YnRpdGxlXCJdXG5cbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUgPSBhd2FpdCBwb3J0YWxUaXRsZSh0aXRsZVNjcmlwdERhdGEpXG4gICAgICAgICAgICAvLyB0aGlzLnBvcnRhbFN1YnRpdGxlID0gcG9ydGFsU3VidGl0bGUoc3VidGl0bGVTY3JpcHREYXRhKVxuXG4gICAgICAgICAgICB0aGlzLmVsLnNldE9iamVjdDNEKCdwb3J0YWxUaXRsZScsIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRClcbiAgICAgICAgICAgIGxldCBzaXplID0gdGhpcy5wb3J0YWxUaXRsZS5nZXRTaXplKClcbiAgICAgICAgICAgIGxldCB0aXRsZVNjYWxlWCA9IHNjYWxlWCAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiAgICAgICAgICAgIGxldCB0aXRsZVNjYWxlWSA9IHNjYWxlWSAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiAgICAgICAgICAgIGxldCB0aXRsZVNjYWxlWiA9IHNjYWxlWiAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcblxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnggLz0gdGl0bGVTY2FsZVhcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5zY2FsZS55IC89IHRpdGxlU2NhbGVZXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0Quc2NhbGUueiAvPSB0aXRsZVNjYWxlWlxuXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueCA9IHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueCAvIHNjYWxlWFxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnkgPSAwLjUgKyBzaXplLmhlaWdodCAvIDIgKyB0aGlzLmRhdGEudGV4dFBvc2l0aW9uLnkgLyBzY2FsZVlcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi56ID0gdGhpcy5kYXRhLnRleHRQb3NpdGlvbi56IC8gc2NhbGVZXG4gICAgICAgICAgICAvLyB0aGlzLmVsLnNldE9iamVjdDNEKCdwb3J0YWxTdWJ0aXRsZScsIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRClcbiAgICAgICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi54ID0gMVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAvLyB0aGlzLnBvcnRhbFN1YnRpdGxlLndlYkxheWVyM0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICAgICAgfVxuICAgICAgICAvLyB0aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge1xuICAgICAgICAvLyAgICAgbWF0LnVzZXJEYXRhLnJhZGl1cyA9IHRoaXMucmFkaXVzXG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEucmluZ0NvbG9yID0gdGhpcy5jb2xvclxuICAgICAgICAvLyAgICAgbWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0aGlzLmN1YmVNYXBcbiAgICAgICAgLy8gfSlcbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5yZW1vdmVFdmVudExpc3RlbmVyKCd1cGRhdGVQb3J0YWxzJywgdGhpcy51cGRhdGVQb3J0YWwpXG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCB0aGlzLnVwZGF0ZVBvcnRhbClcblxuICAgICAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwicG9ydGFsVGl0bGVcIilcblxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLmRlc3Ryb3koKVxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlID0gbnVsbFxuXG4gICAgICAgIGlmICh0aGlzLmN1YmVNYXApIHtcbiAgICAgICAgICAgIHRoaXMuY3ViZU1hcC5kaXNwb3NlKClcbiAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IG51bGxcbiAgICAgICAgfSBcbiAgICB9LFxuXG4gICAgICAgIC8vICAgcmVwbGFjZU1hdGVyaWFsOiBmdW5jdGlvbiAobmV3TWF0ZXJpYWwpIHtcbi8vICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLm1hdGVyaWFsVGFyZ2V0XG4vLyAgICAgaWYgKHRhcmdldCAmJiB0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICBcbi8vICAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0KSA9PiB7XG4vLyAgICAgICBsZXQgbWVzaCA9IG9iamVjdFxuLy8gICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbi8vICAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsKSA9PiB7ICAgICAgICAgXG4vLyAgICAgICAgICAgICAgIGlmICghdGFyZ2V0IHx8IG1hdGVyaWFsLm5hbWUgPT09IHRhcmdldCkge1xuLy8gICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01hdGVyaWFsXG4vLyAgICAgICAgICAgICAgIH1cbi8vICAgICAgICAgICB9KVxuLy8gICAgICAgfVxuLy8gICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4vLyAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4vLyAgICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuLy8gICAgICAgfVxuLy8gICAgIH1cblxuLy8gICAgIGxldCByZXBsYWNlTWF0ZXJpYWxzID0gKCkgPT4ge1xuLy8gICAgICAgICAvLyBtZXNoIHdvdWxkIGNvbnRhaW4gdGhlIG9iamVjdCB0aGF0IGlzLCBvciBjb250YWlucywgdGhlIG1lc2hlc1xuLy8gICAgICAgICB2YXIgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuLy8gICAgICAgICBpZiAoIW1lc2gpIHtcbi8vICAgICAgICAgICAgIC8vIGlmIG5vIG1lc2gsIHdlJ2xsIHNlYXJjaCB0aHJvdWdoIGFsbCBvZiB0aGUgY2hpbGRyZW4uICBUaGlzIHdvdWxkXG4vLyAgICAgICAgICAgICAvLyBoYXBwZW4gaWYgd2UgZHJvcHBlZCB0aGUgY29tcG9uZW50IG9uIGEgZ2xiIGluIHNwb2tlXG4vLyAgICAgICAgICAgICBtZXNoID0gdGhpcy5lbC5vYmplY3QzRFxuLy8gICAgICAgICB9XG4vLyAgICAgICAgIHRyYXZlcnNlKG1lc2gpO1xuLy8gICAgICAgIC8vIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4vLyAgICAgfVxuXG4vLyAgICAgLy8gbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4vLyAgICAgLy8gbGV0IGluaXRpYWxpemVyID0gKCkgPT57XG4vLyAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4vLyAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIHJlcGxhY2VNYXRlcmlhbHMpXG4vLyAgICAgICB9IGVsc2Uge1xuLy8gICAgICAgICAgIHJlcGxhY2VNYXRlcmlhbHMoKVxuLy8gICAgICAgfVxuLy8gICAgIC8vIH07XG4vLyAgICAgLy9yZXBsYWNlTWF0ZXJpYWxzKClcbi8vICAgICAvLyByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuLy8gICB9LFxuXG4vLyAgIGZvbGxvd1BvcnRhbDogZnVuY3Rpb24oKSB7XG4vLyAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4vLyAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbi8vICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4vLyAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyKSB7XG4vLyAgICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbi8vICAgICAgIH1cbi8vICAgfSxcblxuICAgIHNldHVwRG9vcjogZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vIGF0dGFjaGVkIHRvIGFuIGltYWdlIGluIHNwb2tlLiAgVGhpcyBpcyB0aGUgb25seSB3YXkgd2UgYWxsb3cgYnVpZGxpbmcgYSBcbiAgICAgICAgLy8gZG9vciBhcm91bmQgaXRcbiAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgIHZhciB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgdmFyIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgdmFyIGRlcHRoID0gMS4wOyAvLyAgc2NhbGVNLnogKiBzY2FsZUkuelxuXG4gICAgICAgIGNvbnN0IGVudmlyb25tZW50TWFwQ29tcG9uZW50ID0gdGhpcy5lbC5zY2VuZUVsLmNvbXBvbmVudHNbXCJlbnZpcm9ubWVudC1tYXBcIl07XG5cbiAgICAgICAgLy8gbGV0IGFib3ZlID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIC8vICAgICBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoMSwgNTAsIDUwKSxcbiAgICAgICAgLy8gICAgIGRvb3JtYXRlcmlhbFkgXG4gICAgICAgIC8vICk7XG4gICAgICAgIC8vIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAvLyAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcChhYm92ZSk7XG4gICAgICAgIC8vIH1cbiAgICAgICAgLy8gYWJvdmUucG9zaXRpb24uc2V0KDAsIDIuNSwgMClcbiAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5hZGQoYWJvdmUpXG5cbiAgICAgICAgbGV0IGxlZnQgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIC8vIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMi9oZWlnaHQsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMSwwLjEvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgW2Rvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vcm1hdGVyaWFsWSwgZG9vcm1hdGVyaWFsWSxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKGxlZnQpO1xuICAgICAgICB9XG4gICAgICAgIGxlZnQucG9zaXRpb24uc2V0KC0wLjUxLCAwLCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZChsZWZ0KVxuXG4gICAgICAgIGxldCByaWdodCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwxLDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29ybWF0ZXJpYWxZLCBkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWxdLCBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAocmlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIHJpZ2h0LnBvc2l0aW9uLnNldCgwLjUxLCAwLCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZChyaWdodClcblxuICAgICAgICBsZXQgdG9wID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSArIDAuMy93aWR0aCwwLjEvaGVpZ2h0LDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vcm1hdGVyaWFsWSxkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbF0sIFxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIHRvcC5wb3NpdGlvbi5zZXQoMC4wLCAwLjUwNSwgMClcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5hZGQodG9wKVxuXG4gICAgICAgIC8vIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAvLyAgICAgY29uc3Qge3dpZHRoOiB3c2l6ZSwgaGVpZ2h0OiBoc2l6ZX0gPSB0aGlzLnNjcmlwdC5nZXRTaXplKClcbiAgICAgICAgLy8gICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHdpZHRoIC8gd3NpemUsIGhlaWdodCAvIGhzaXplKVxuICAgICAgICAvLyAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwgeyB4OiBzY2FsZSwgeTogc2NhbGUsIHo6IHNjYWxlfSk7XG4gICAgICAgIC8vIH1cbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy90aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnRpbWUudmFsdWUgPSB0aW1lIC8gMTAwMFxuICAgICAgICBpZiAoIXRoaXMubWF0ZXJpYWxzKSB7IHJldHVybiB9XG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVGl0bGUpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUudGljayh0aW1lKVxuICAgICAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZS50aWNrKHRpbWUpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge1xuICAgICAgICAgICAgbWF0LnVzZXJEYXRhLnJhZGl1cyA9IHRoaXMucmFkaXVzXG4gICAgICAgICAgICBtYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZU1hcFxuICAgICAgICAgICAgV2FycFBvcnRhbFNoYWRlci51cGRhdGVVbmlmb3Jtcyh0aW1lLCBtYXQpXG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKHRoaXMub3RoZXIgJiYgIXRoaXMuc3lzdGVtLnRlbGVwb3J0aW5nKSB7XG4gICAgICAgIC8vICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgICAgICAvLyAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYVBvcylcbiAgICAgICAgLy8gICB3b3JsZENhbWVyYVBvcy55IC09IHRoaXMuWW9mZnNldFxuICAgICAgICAvLyAgIGNvbnN0IGRpc3QgPSB3b3JsZENhbWVyYVBvcy5kaXN0YW5jZVRvKHdvcmxkUG9zKVxuICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYVBvcylcbiAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh3b3JsZENhbWVyYVBvcylcblxuICAgICAgICAgIC8vIGluIGxvY2FsIHBvcnRhbCBjb29yZGluYXRlcywgdGhlIHdpZHRoIGFuZCBoZWlnaHQgYXJlIDFcbiAgICAgICAgICBpZiAoTWF0aC5hYnMod29ybGRDYW1lcmFQb3MueCkgPiAwLjUgfHwgTWF0aC5hYnMod29ybGRDYW1lcmFQb3MueSkgPiAwLjUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgZGlzdCA9IE1hdGguYWJzKHdvcmxkQ2FtZXJhUG9zLnopO1xuXG4gICAgICAgICAgLy8gd2luZG93LkFQUC51dGlscy5jaGFuZ2VUb0h1YlxuICAgICAgICAgIGlmICgodGhpcy5wb3J0YWxUeXBlID09IDEgfHwgdGhpcy5wb3J0YWxUeXBlID09IDQpICYmIGRpc3QgPCAwLjI1KSB7XG4gICAgICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvY2F0aW9uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgICAgICAgICAgICBpZiAoIUFQUC5zdG9yZS5zdGF0ZS5wcmVmZXJlbmNlcy5mYXN0Um9vbVN3aXRjaGluZykge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInNldCB3aW5kb3cubG9jYXRpb24uaHJlZiB0byBcIiArIHRoaXMub3RoZXIpXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB3YXlQb2ludCA9IHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXRcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW52aXJvbm1lbnRTY2VuZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZW52aXJvbm1lbnQtc2NlbmVcIik7XG4gICAgICAgICAgICAgICAgICAgIGxldCBnb1RvV2F5UG9pbnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh3YXlQb2ludCAmJiB3YXlQb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJGQVNUIFJPT00gU1dJVENIIElOQ0xVREVTIHdheXBvaW50OiBzZXR0aW5nIGhhc2ggdG8gXCIgKyB3YXlQb2ludClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHdheVBvaW50XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJGQVNUIFJPT00gU1dJVENILiBnb2luZyB0byBcIiArIHRoaXMuaHViX2lkKVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5odWJJZCA9PT0gQVBQLmh1Yi5odWJfaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiU2FtZSBSb29tXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICBnb1RvV2F5UG9pbnQoKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LmNoYW5nZUh1Yih0aGlzLmh1Yl9pZCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgY29uc29sZS5sb2coXCJFbnZpcm9ubWVudCBzY2VuZSBoYXMgbG9hZGVkXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnb1RvV2F5UG9pbnQoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIgJiYgZGlzdCA8IDAuMjUpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7XG4gICAgICAgICAgICAgIGlmIChkaXN0IDwgMC4yNSkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5oYXNoIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgLy8gaWYgd2Ugc2V0IGxvY2F0aW9uaHJlZiwgd2UgdGVsZXBvcnRlZC4gIHdoZW4gaXRcbiAgICAgICAgICAgICAgICAgIC8vIGZpbmFsbHkgaGFwcGVucywgYW5kIHdlIG1vdmUgb3V0c2lkZSB0aGUgcmFuZ2Ugb2YgdGhlIHBvcnRhbCxcbiAgICAgICAgICAgICAgICAgIC8vIHdlIHdpbGwgY2xlYXIgdGhlIGZsYWdcbiAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gbnVsbFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgZ2V0T3RoZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHJlc29sdmUobnVsbClcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgID09IDEpIHtcbiAgICAgICAgICAgICAgICAvLyBmaXJzdCB3YWl0IGZvciB0aGUgaHViX2lkXG4gICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Um9vbUh1YklkKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKGh1Yl9pZCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaHViX2lkID0gaHViX2lkXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHRhcmdldCBpcyBhbm90aGVyIHJvb20sIHJlc29sdmUgd2l0aCB0aGUgVVJMIHRvIHRoZSByb29tXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldFJvb21VUkwodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4odXJsID0+IHsgXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCAmJiB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCArIFwiI1wiICsgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwpIFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDMpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlIChcIiNcIiArIHRoaXMucG9ydGFsVGFyZ2V0KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSA0KSB7XG4gICAgICAgICAgICAgICAgbGV0IHVybCA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4gKyBcIi9cIiArIHRoaXMucG9ydGFsVGFyZ2V0O1xuICAgICAgICAgICAgICAgIHRoaXMuaHViX2lkID0gdGhpcy5wb3J0YWxUYXJnZXRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCAmJiB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwgKyBcIiNcIiArIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwpIFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbm93IGZpbmQgdGhlIHBvcnRhbCB3aXRoaW4gdGhlIHJvb20uICBUaGUgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycyB3aXRoIHRoZSBzYW1lIHBvcnRhbFRhcmdldFxuICAgICAgICAgICAgY29uc3QgcG9ydGFscyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW3BvcnRhbF1gKSlcbiAgICAgICAgICAgIGNvbnN0IG90aGVyID0gcG9ydGFscy5maW5kKChlbCkgPT4gZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVHlwZSA9PSB0aGlzLnBvcnRhbFR5cGUgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVGFyZ2V0ID09PSB0aGlzLnBvcnRhbFRhcmdldCAmJiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZWwgIT09IHRoaXMuZWwpXG4gICAgICAgICAgICBpZiAob3RoZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIC8vIENhc2UgMTogVGhlIG90aGVyIHBvcnRhbCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUob3RoZXIpO1xuICAgICAgICAgICAgICAgIG90aGVyLmVtaXQoJ3BhaXInLCB7IG90aGVyOiB0aGlzLmVsIH0pIC8vIExldCB0aGUgb3RoZXIga25vdyB0aGF0IHdlJ3JlIHJlYWR5XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIENhc2UgMjogV2UgY291bGRuJ3QgZmluZCB0aGUgb3RoZXIgcG9ydGFsLCB3YWl0IGZvciBpdCB0byBzaWduYWwgdGhhdCBpdCdzIHJlYWR5XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwYWlyJywgKGV2ZW50KSA9PiB7IFxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGV2ZW50LmRldGFpbC5vdGhlcilcbiAgICAgICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9LFxuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBub2RlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG5cbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBlaXRoZXIgXG4gICAgICAgIC8vIC0gXCJyb29tX25hbWVfY29sb3JcIlxuICAgICAgICAvLyAtIFwicG9ydGFsX05fY29sb3JcIiBcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiBOdW1iZXJlZCBwb3J0YWxzIHNob3VsZCBjb21lIGluIHBhaXJzLlxuICAgICAgICBjb25zdCBwYXJhbXMgPSBub2RlTmFtZS5tYXRjaCgvKFtBLVphLXpdKilfKFtBLVphLXowLTldKilfKFtBLVphLXowLTldKikkLylcbiAgICAgICAgXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiA0LCBmaXJzdCBtYXRjaCBpcyB0aGUgcG9ydGFsIHR5cGUsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgbmFtZSBvciBudW1iZXIsIGFuZCBsYXN0IGlzIHRoZSBjb2xvclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicG9ydGFsIG5vZGUgbmFtZSBub3QgZm9ybWVkIGNvcnJlY3RseTogXCIsIG5vZGVOYW1lKVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgICAgICB0aGlzLmNvbG9yID0gXCJyZWRcIiAvLyBkZWZhdWx0IHNvIHRoZSBwb3J0YWwgaGFzIGEgY29sb3IgdG8gdXNlXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuc2V0UG9ydGFsSW5mbyhwYXJhbXNbMV0sIHBhcmFtc1syXSwgcGFyYW1zWzNdKVxuICAgIH0sXG5cbiAgICBzZXRQb3J0YWxJbmZvOiBmdW5jdGlvbihwb3J0YWxUeXBlLCBwb3J0YWxUYXJnZXQsIGNvbG9yKSB7XG4gICAgICAgIGlmIChwb3J0YWxUeXBlID09PSBcInJvb21cIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMTtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcGFyc2VJbnQocG9ydGFsVGFyZ2V0KVxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwicG9ydGFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDI7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBvcnRhbFRhcmdldFxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMztcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcG9ydGFsVGFyZ2V0XG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJyb29tTmFtZVwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSA0O1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwb3J0YWxUYXJnZXRcbiAgICAgICAgfSBlbHNlIHsgICAgXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IoY29sb3IpXG4gICAgfSxcblxuICAgIHNldFJhZGl1cyh2YWwpIHtcbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAvLyAgIGZyb206IHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlLFxuICAgICAgICAgICAgZnJvbTogdGhpcy5yYWRpdXMsXG4gICAgICAgICAgICB0bzogdmFsLFxuICAgICAgICB9KVxuICAgIH0sXG4gICAgb3BlbigpIHtcbiAgICAgICAgdGhpcy5zZXRSYWRpdXMoMSlcbiAgICB9LFxuICAgIGNsb3NlKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygwLjIpXG4gICAgfSxcbiAgICBpc0Nsb3NlZCgpIHtcbiAgICAgICAgLy8gcmV0dXJuIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlID09PSAwXG4gICAgICAgIHJldHVybiB0aGlzLnJhZGl1cyA9PT0gMC4yXG4gICAgfSxcbn0pIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvZTE3MDJlYTIxYWZiNGE4Ni5wbmdcIiIsImNvbnN0IGdsc2wgPSBgXG52YXJ5aW5nIHZlYzIgYmFsbHZVdjtcbnZhcnlpbmcgdmVjMyBiYWxsdlBvc2l0aW9uO1xudmFyeWluZyB2ZWMzIGJhbGx2Tm9ybWFsO1xudmFyeWluZyB2ZWMzIGJhbGx2V29ybGRQb3M7XG51bmlmb3JtIGZsb2F0IGJhbGxUaW1lO1xudW5pZm9ybSBmbG9hdCBzZWxlY3RlZDtcblxubWF0NCBiYWxsaW52ZXJzZShtYXQ0IG0pIHtcbiAgZmxvYXRcbiAgICAgIGEwMCA9IG1bMF1bMF0sIGEwMSA9IG1bMF1bMV0sIGEwMiA9IG1bMF1bMl0sIGEwMyA9IG1bMF1bM10sXG4gICAgICBhMTAgPSBtWzFdWzBdLCBhMTEgPSBtWzFdWzFdLCBhMTIgPSBtWzFdWzJdLCBhMTMgPSBtWzFdWzNdLFxuICAgICAgYTIwID0gbVsyXVswXSwgYTIxID0gbVsyXVsxXSwgYTIyID0gbVsyXVsyXSwgYTIzID0gbVsyXVszXSxcbiAgICAgIGEzMCA9IG1bM11bMF0sIGEzMSA9IG1bM11bMV0sIGEzMiA9IG1bM11bMl0sIGEzMyA9IG1bM11bM10sXG5cbiAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMixcblxuICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gIHJldHVybiBtYXQ0KFxuICAgICAgYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5LFxuICAgICAgYTAyICogYjEwIC0gYTAxICogYjExIC0gYTAzICogYjA5LFxuICAgICAgYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzLFxuICAgICAgYTIyICogYjA0IC0gYTIxICogYjA1IC0gYTIzICogYjAzLFxuICAgICAgYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3LFxuICAgICAgYTAwICogYjExIC0gYTAyICogYjA4ICsgYTAzICogYjA3LFxuICAgICAgYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxLFxuICAgICAgYTIwICogYjA1IC0gYTIyICogYjAyICsgYTIzICogYjAxLFxuICAgICAgYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2LFxuICAgICAgYTAxICogYjA4IC0gYTAwICogYjEwIC0gYTAzICogYjA2LFxuICAgICAgYTMwICogYjA0IC0gYTMxICogYjAyICsgYTMzICogYjAwLFxuICAgICAgYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwLFxuICAgICAgYTExICogYjA3IC0gYTEwICogYjA5IC0gYTEyICogYjA2LFxuICAgICAgYTAwICogYjA5IC0gYTAxICogYjA3ICsgYTAyICogYjA2LFxuICAgICAgYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwLFxuICAgICAgYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAvIGRldDtcbn1cblxuXG5tYXQ0IGJhbGx0cmFuc3Bvc2UoaW4gbWF0NCBtKSB7XG4gIHZlYzQgaTAgPSBtWzBdO1xuICB2ZWM0IGkxID0gbVsxXTtcbiAgdmVjNCBpMiA9IG1bMl07XG4gIHZlYzQgaTMgPSBtWzNdO1xuXG4gIHJldHVybiBtYXQ0KFxuICAgIHZlYzQoaTAueCwgaTEueCwgaTIueCwgaTMueCksXG4gICAgdmVjNChpMC55LCBpMS55LCBpMi55LCBpMy55KSxcbiAgICB2ZWM0KGkwLnosIGkxLnosIGkyLnosIGkzLnopLFxuICAgIHZlYzQoaTAudywgaTEudywgaTIudywgaTMudylcbiAgKTtcbn1cblxudm9pZCBtYWluKClcbntcbiAgYmFsbHZVdiA9IHV2O1xuXG4gIGJhbGx2UG9zaXRpb24gPSBwb3NpdGlvbjtcblxuICB2ZWMzIG9mZnNldCA9IHZlYzMoXG4gICAgc2luKHBvc2l0aW9uLnggKiA1MC4wICsgYmFsbFRpbWUpLFxuICAgIHNpbihwb3NpdGlvbi55ICogMTAuMCArIGJhbGxUaW1lICogMi4wKSxcbiAgICBjb3MocG9zaXRpb24ueiAqIDQwLjAgKyBiYWxsVGltZSlcbiAgKSAqIDAuMDAzO1xuXG4gICBiYWxsdlBvc2l0aW9uICo9IDEuMCArIHNlbGVjdGVkICogMC4yO1xuXG4gICBiYWxsdk5vcm1hbCA9IG5vcm1hbGl6ZShiYWxsaW52ZXJzZShiYWxsdHJhbnNwb3NlKG1vZGVsTWF0cml4KSkgKiB2ZWM0KG5vcm1hbGl6ZShub3JtYWwpLCAxLjApKS54eXo7XG4gICBiYWxsdldvcmxkUG9zID0gKG1vZGVsTWF0cml4ICogdmVjNChiYWxsdlBvc2l0aW9uLCAxLjApKS54eXo7XG5cbiAgIHZlYzQgYmFsbHZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoYmFsbHZQb3NpdGlvbiArIG9mZnNldCwgMS4wKTtcblxuICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBiYWxsdlBvc2l0aW9uO1xufVxuYFxuXG5leHBvcnQgZGVmYXVsdCBnbHNsIiwiY29uc3QgZ2xzbCA9IGBcbnVuaWZvcm0gc2FtcGxlcjJEIHBhbm90ZXg7XG51bmlmb3JtIHNhbXBsZXIyRCB0ZXhmeDtcbnVuaWZvcm0gZmxvYXQgYmFsbFRpbWU7XG51bmlmb3JtIGZsb2F0IHNlbGVjdGVkO1xudmFyeWluZyB2ZWMyIGJhbGx2VXY7XG52YXJ5aW5nIHZlYzMgYmFsbHZQb3NpdGlvbjtcbnZhcnlpbmcgdmVjMyBiYWxsdk5vcm1hbDtcbnZhcnlpbmcgdmVjMyBiYWxsdldvcmxkUG9zO1xuXG51bmlmb3JtIGZsb2F0IG9wYWNpdHk7XG5cbnZvaWQgbWFpbiggdm9pZCApIHtcbiAgIHZlYzIgdXYgPSBiYWxsdlV2O1xuICAvL3V2LnkgPSAgMS4wIC0gdXYueTtcblxuICAgdmVjMyBleWUgPSBub3JtYWxpemUoY2FtZXJhUG9zaXRpb24gLSBiYWxsdldvcmxkUG9zKTtcbiAgIGZsb2F0IGZyZXNuZWwgPSBhYnMoZG90KGV5ZSwgYmFsbHZOb3JtYWwpKTtcbiAgIGZsb2F0IHNoaWZ0ID0gcG93KCgxLjAgLSBmcmVzbmVsKSwgNC4wKSAqIDAuMDU7XG5cbiAgdmVjMyBjb2wgPSB2ZWMzKFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1diAtIHNoaWZ0KS5yLFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1dikuZyxcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYgKyBzaGlmdCkuYlxuICApO1xuXG4gICBjb2wgPSBtaXgoY29sICogMC43LCB2ZWMzKDEuMCksIDAuNyAtIGZyZXNuZWwpO1xuXG4gICBjb2wgKz0gc2VsZWN0ZWQgKiAwLjM7XG5cbiAgIGZsb2F0IHQgPSBiYWxsVGltZSAqIDAuNCArIGJhbGx2UG9zaXRpb24ueCArIGJhbGx2UG9zaXRpb24uejtcbiAgIHV2ID0gdmVjMihiYWxsdlV2LnggKyB0ICogMC4yLCBiYWxsdlV2LnkgKyB0KTtcbiAgIHZlYzMgZnggPSB0ZXh0dXJlMkQodGV4ZngsIHV2KS5yZ2IgKiAwLjQ7XG5cbiAgLy92ZWM0IGNvbCA9IHZlYzQoMS4wLCAxLjAsIDAuMCwgMS4wKTtcbiAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgb3BhY2l0eSk7XG4gIC8vZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgMS4wKTtcbn1cbmBcblxuZXhwb3J0IGRlZmF1bHQgZ2xzbCIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiAzNjAgaW1hZ2UgdGhhdCBmaWxscyB0aGUgdXNlcidzIHZpc2lvbiB3aGVuIGluIGEgY2xvc2UgcHJveGltaXR5LlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBHaXZlbiBhIDM2MCBpbWFnZSBhc3NldCB3aXRoIHRoZSBmb2xsb3dpbmcgVVJMIGluIFNwb2tlOlxuICogaHR0cHM6Ly9ndC1hZWwtYXEtYXNzZXRzLmFlbGF0Z3QtaW50ZXJuYWwubmV0L2ZpbGVzLzEyMzQ1YWJjLTY3ODlkZWYuanBnXG4gKlxuICogVGhlIG5hbWUgb2YgdGhlIGBpbW1lcnNpdmUtMzYwLmdsYmAgaW5zdGFuY2UgaW4gdGhlIHNjZW5lIHNob3VsZCBiZTpcbiAqIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fMTIzNDVhYmMtNjc4OWRlZl9qcGdcIiBPUiBcIjEyMzQ1YWJjLTY3ODlkZWZfanBnXCJcbiAqL1xuXG5cbi8vIFRPRE86IFxuLy8gLSBhZGp1c3Qgc2l6ZSBvZiBwYW5vIGJhbGxcbi8vIC0gZHJvcCBvbiB2aWRlbyBvciBpbWFnZSBhbmQgcHVsbCB2aWRlby9pbWFnZSBmcm9tIHRoYXQgbWVkaWEgbG9jYXRpb25cbi8vIC0gaW50ZXJjZXB0IG1vdXNlIGlucHV0IHNvbWVob3c/ICAgIE5vdCBzdXJlIGlmIGl0J3MgcG9zc2libGUuXG5cblxuaW1wb3J0IGJhbGxmeCBmcm9tICcuLi9hc3NldHMvYmFsbGZ4LnBuZydcbmltcG9ydCBwYW5vdmVydCBmcm9tICcuLi9zaGFkZXJzL3Bhbm9iYWxsLnZlcnQnXG5pbXBvcnQgcGFub2ZyYWcgZnJvbSAnLi4vc2hhZGVycy9wYW5vYmFsbC5mcmFnJ1xuXG5jb25zdCB3b3JsZENhbWVyYSA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkU2VsZiA9IG5ldyBUSFJFRS5WZWN0b3IzKClcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIGJhbGxUZXggPSBudWxsXG5sb2FkZXIubG9hZChiYWxsZngsIChiYWxsKSA9PiB7XG4gICAgYmFsbC5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJhbGwubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYWxsLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmFsbC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJhbGxUZXggPSBiYWxsXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCB7XG4gIHNjaGVtYToge1xuICAgIHVybDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbCB9LFxuICB9LFxuICBpbml0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHVybCA9IHRoaXMuZGF0YS51cmxcbiAgICBpZiAoIXVybCB8fCB1cmwgPT0gXCJcIikge1xuICAgICAgICB1cmwgPSB0aGlzLnBhcnNlU3Bva2VOYW1lKClcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdXJsLm1hdGNoKC9eLipcXC4oLiopJC8pWzFdXG5cbiAgICAvLyBtZWRpYS1pbWFnZSB3aWxsIHNldCB1cCB0aGUgc3BoZXJlIGdlb21ldHJ5IGZvciB1c1xuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdtZWRpYS1pbWFnZScsIHtcbiAgICAgIHByb2plY3Rpb246ICczNjAtZXF1aXJlY3Rhbmd1bGFyJyxcbiAgICAgIGFscGhhTW9kZTogJ29wYXF1ZScsXG4gICAgICBzcmM6IHVybCxcbiAgICAgIHZlcnNpb246IDEsXG4gICAgICBiYXRjaDogZmFsc2UsXG4gICAgICBjb250ZW50VHlwZTogYGltYWdlLyR7ZXh0ZW5zaW9ufWAsXG4gICAgICBhbHBoYUN1dG9mZjogMCxcbiAgICB9KVxuICAgIC8vIGJ1dCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoaXMgdG8gaGFwcGVuXG4gICAgdGhpcy5tZXNoID0gYXdhaXQgdGhpcy5nZXRNZXNoKClcblxuICAgIHZhciBiYWxsID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSgwLjE1LCAzMCwgMjApLFxuICAgICAgICBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgICAgcGFub3RleDoge3ZhbHVlOiB0aGlzLm1lc2gubWF0ZXJpYWwubWFwfSxcbiAgICAgICAgICAgICAgdGV4Zng6IHt2YWx1ZTogYmFsbFRleH0sXG4gICAgICAgICAgICAgIHNlbGVjdGVkOiB7dmFsdWU6IDB9LFxuICAgICAgICAgICAgICBiYWxsVGltZToge3ZhbHVlOiAwfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogcGFub3ZlcnQsXG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlcjogcGFub2ZyYWcsXG4gICAgICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgICB9KVxuICAgIClcbiAgIFxuICAgIGJhbGwucm90YXRpb24uc2V0KE1hdGguUEksIDAsIDApO1xuICAgIGJhbGwucG9zaXRpb24uY29weSh0aGlzLm1lc2gucG9zaXRpb24pO1xuICAgIGJhbGwudXNlckRhdGEuZmxvYXRZID0gdGhpcy5tZXNoLnBvc2l0aW9uLnkgKyAwLjY7XG4gICAgYmFsbC51c2VyRGF0YS5zZWxlY3RlZCA9IDA7XG4gICAgYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgdGhpcy5iYWxsID0gYmFsbFxuICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoXCJiYWxsXCIsIGJhbGwpXG5cbiAgICB0aGlzLm1lc2guZ2VvbWV0cnkuc2NhbGUoMTAwLCAxMDAsIDEwMClcbiAgICB0aGlzLm1lc2gubWF0ZXJpYWwuc2V0VmFsdWVzKHtcbiAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgZGVwdGhUZXN0OiBmYWxzZSxcbiAgICB9KVxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gZmFsc2VcblxuICAgIHRoaXMubmVhciA9IDAuOFxuICAgIHRoaXMuZmFyID0gMS4xXG5cbiAgICAvLyBSZW5kZXIgT1ZFUiB0aGUgc2NlbmUgYnV0IFVOREVSIHRoZSBjdXJzb3JcbiAgICB0aGlzLm1lc2gucmVuZGVyT3JkZXIgPSBBUFAuUkVOREVSX09SREVSLkNVUlNPUiAtIDAuMVxuICB9LFxuICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFsbC5nZW9tZXRyeS5kaXNwb3NlKClcbiAgICB0aGlzLmJhbGwuZ2VvbWV0cnkgPSBudWxsXG4gICAgdGhpcy5iYWxsLm1hdGVyaWFsLmRpc3Bvc2UoKVxuICAgIHRoaXMuYmFsbC5tYXRlcmlhbCA9IG51bGxcbiAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwiYmFsbFwiKVxuICAgIHRoaXMuYmFsbCA9IG51bGxcbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICBpZiAodGhpcy5tZXNoICYmIGJhbGxUZXgpIHtcbiAgICAgIHRoaXMuYmFsbC5wb3NpdGlvbi55ID0gdGhpcy5iYWxsLnVzZXJEYXRhLmZsb2F0WSArIE1hdGguY29zKCh0aW1lICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXQpLzEwMDAgKiAzICkgKiAwLjAyO1xuICAgICAgdGhpcy5iYWxsLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcblxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLnRleGZ4LnZhbHVlID0gYmFsbFRleFxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLmJhbGxUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgIC8vIExpbmVhcmx5IG1hcCBjYW1lcmEgZGlzdGFuY2UgdG8gbWF0ZXJpYWwgb3BhY2l0eVxuICAgICAgdGhpcy5tZXNoLmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSB3b3JsZFNlbGYuZGlzdGFuY2VUbyh3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IG9wYWNpdHkgPSAxIC0gKGRpc3RhbmNlIC0gdGhpcy5uZWFyKSAvICh0aGlzLmZhciAtIHRoaXMubmVhcilcbiAgICAgIGlmIChvcGFjaXR5IDwgMCkge1xuICAgICAgICAgIC8vIGZhciBhd2F5XG4gICAgICAgICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZVxuICAgICAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPSBvcGFjaXR5ID4gMSA/IDEgOiBvcGFjaXR5XG4gICAgICAgICAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRydWVcbiAgICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHlcbiAgICAgICAgfVxuICAgIH1cbiAgfSxcbiAgcGFyc2VTcG9rZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBBY2NlcHRlZCBuYW1lczogXCJsYWJlbF9faW1hZ2UtaGFzaF9leHRcIiBPUiBcImltYWdlLWhhc2hfZXh0XCJcbiAgICBjb25zdCBzcG9rZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgIGNvbnN0IG1hdGNoZXMgPSBzcG9rZU5hbWUubWF0Y2goLyg/Oi4qX18pPyguKilfKC4qKS8pXG4gICAgaWYgKCFtYXRjaGVzIHx8IG1hdGNoZXMubGVuZ3RoIDwgMykgeyByZXR1cm4gXCJcIiB9XG4gICAgY29uc3QgWywgaGFzaCwgZXh0ZW5zaW9uXSAgPSBtYXRjaGVzXG4gICAgY29uc3QgdXJsID0gYGh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2RhdGEvJHtoYXNofS4ke2V4dGVuc2lvbn1gXG4gICAgcmV0dXJuIHVybFxuICB9LFxuICBnZXRNZXNoOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgICBpZiAobWVzaCkgcmVzb2x2ZShtZXNoKVxuICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAnaW1hZ2UtbG9hZGVkJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJpbW1lcnNpdmUtMzYwIHBhbm8gbG9hZGVkOiBcIiArIHRoaXMuZGF0YS51cmwpXG4gICAgICAgICAgcmVzb2x2ZSh0aGlzLmVsLm9iamVjdDNETWFwLm1lc2gpXG4gICAgICAgIH0sXG4gICAgICAgIHsgb25jZTogdHJ1ZSB9XG4gICAgICApXG4gICAgfSlcbiAgfSxcbn0pXG4iLCIvLyBQYXJhbGxheCBPY2NsdXNpb24gc2hhZGVycyBmcm9tXG4vLyAgICBodHRwOi8vc3VuYW5kYmxhY2tjYXQuY29tL3RpcEZ1bGxWaWV3LnBocD90b3BpY2lkPTI4XG4vLyBObyB0YW5nZW50LXNwYWNlIHRyYW5zZm9ybXMgbG9naWMgYmFzZWQgb25cbi8vICAgaHR0cDovL21taWtrZWxzZW4zZC5ibG9nc3BvdC5zay8yMDEyLzAyL3BhcmFsbGF4cG9jLW1hcHBpbmctYW5kLW5vLXRhbmdlbnQuaHRtbFxuXG4vLyBJZGVudGl0eSBmdW5jdGlvbiBmb3IgZ2xzbC1saXRlcmFsIGhpZ2hsaWdodGluZyBpbiBWUyBDb2RlXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCBQYXJhbGxheFNoYWRlciA9IHtcbiAgLy8gT3JkZXJlZCBmcm9tIGZhc3Rlc3QgdG8gYmVzdCBxdWFsaXR5LlxuICBtb2Rlczoge1xuICAgIG5vbmU6ICdOT19QQVJBTExBWCcsXG4gICAgYmFzaWM6ICdVU0VfQkFTSUNfUEFSQUxMQVgnLFxuICAgIHN0ZWVwOiAnVVNFX1NURUVQX1BBUkFMTEFYJyxcbiAgICBvY2NsdXNpb246ICdVU0VfT0NMVVNJT05fUEFSQUxMQVgnLCAvLyBhLmsuYS4gUE9NXG4gICAgcmVsaWVmOiAnVVNFX1JFTElFRl9QQVJBTExBWCcsXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBidW1wTWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgbWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgfSxcblxuICB2ZXJ0ZXhTaGFkZXI6IGdsc2xgXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZVdiA9IHV2O1xuICAgICAgdmVjNCBtdlBvc2l0aW9uID0gbW9kZWxWaWV3TWF0cml4ICogdmVjNCggcG9zaXRpb24sIDEuMCApO1xuICAgICAgdlZpZXdQb3NpdGlvbiA9IC1tdlBvc2l0aW9uLnh5ejtcbiAgICAgIHZOb3JtYWwgPSBub3JtYWxpemUoIG5vcm1hbE1hdHJpeCAqIG5vcm1hbCApO1xuICAgICAgXG4gICAgICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtdlBvc2l0aW9uO1xuICAgIH1cbiAgYCxcblxuICBmcmFnbWVudFNoYWRlcjogZ2xzbGBcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBidW1wTWFwO1xuICAgIHVuaWZvcm0gc2FtcGxlcjJEIG1hcDtcblxuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhTY2FsZTtcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWluTGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNYXhMYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBmYWRlOyAvLyBDVVNUT01cblxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICAjaWZkZWYgVVNFX0JBU0lDX1BBUkFMTEFYXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgZmxvYXQgaW5pdGlhbEhlaWdodCA9IHRleHR1cmUyRChidW1wTWFwLCB2VXYpLnI7XG5cbiAgICAgIC8vIE5vIE9mZnNldCBMaW1pdHRpbmc6IG1lc3N5LCBmbG9hdGluZyBvdXRwdXQgYXQgZ3JhemluZyBhbmdsZXMuXG4gICAgICAvL1widmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56ICogaW5pdGlhbEhlaWdodDtcIixcblxuICAgICAgLy8gT2Zmc2V0IExpbWl0aW5nXG4gICAgICB2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgKiBpbml0aWFsSGVpZ2h0O1xuICAgICAgcmV0dXJuIHZVdiAtIHRleENvb3JkT2Zmc2V0O1xuICAgIH1cblxuICAgICNlbHNlXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgLy8gRGV0ZXJtaW5lIG51bWJlciBvZiBsYXllcnMgZnJvbSBhbmdsZSBiZXR3ZWVuIFYgYW5kIE5cbiAgICAgIGZsb2F0IG51bUxheWVycyA9IG1peChwYXJhbGxheE1heExheWVycywgcGFyYWxsYXhNaW5MYXllcnMsIGFicyhkb3QodmVjMygwLjAsIDAuMCwgMS4wKSwgVikpKTtcblxuICAgICAgZmxvYXQgbGF5ZXJIZWlnaHQgPSAxLjAgLyBudW1MYXllcnM7XG4gICAgICBmbG9hdCBjdXJyZW50TGF5ZXJIZWlnaHQgPSAwLjA7XG4gICAgICAvLyBTaGlmdCBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzIGZvciBlYWNoIGl0ZXJhdGlvblxuICAgICAgdmVjMiBkdGV4ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogLyBudW1MYXllcnM7XG5cbiAgICAgIHZlYzIgY3VycmVudFRleHR1cmVDb29yZHMgPSB2VXY7XG5cbiAgICAgIGZsb2F0IGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuXG4gICAgICAvLyB3aGlsZSAoIGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0IClcbiAgICAgIC8vIEluZmluaXRlIGxvb3BzIGFyZSBub3Qgd2VsbCBzdXBwb3J0ZWQuIERvIGEgXCJsYXJnZVwiIGZpbml0ZVxuICAgICAgLy8gbG9vcCwgYnV0IG5vdCB0b28gbGFyZ2UsIGFzIGl0IHNsb3dzIGRvd24gc29tZSBjb21waWxlcnMuXG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IDMwOyBpICs9IDEpIHtcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlIDw9IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBsYXllckhlaWdodDtcbiAgICAgICAgLy8gU2hpZnQgdGV4dHVyZSBjb29yZGluYXRlcyBhbG9uZyB2ZWN0b3IgVlxuICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkdGV4O1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgIH1cblxuICAgICAgI2lmZGVmIFVTRV9TVEVFUF9QQVJBTExBWFxuXG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX1JFTElFRl9QQVJBTExBWClcblxuICAgICAgdmVjMiBkZWx0YVRleENvb3JkID0gZHRleCAvIDIuMDtcbiAgICAgIGZsb2F0IGRlbHRhSGVpZ2h0ID0gbGF5ZXJIZWlnaHQgLyAyLjA7XG5cbiAgICAgIC8vIFJldHVybiB0byB0aGUgbWlkIHBvaW50IG9mIHByZXZpb3VzIGxheWVyXG4gICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuXG4gICAgICAvLyBCaW5hcnkgc2VhcmNoIHRvIGluY3JlYXNlIHByZWNpc2lvbiBvZiBTdGVlcCBQYXJhbGxheCBNYXBwaW5nXG4gICAgICBjb25zdCBpbnQgbnVtU2VhcmNoZXMgPSA1O1xuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBudW1TZWFyY2hlczsgaSArPSAxKSB7XG4gICAgICAgIGRlbHRhVGV4Q29vcmQgLz0gMi4wO1xuICAgICAgICBkZWx0YUhlaWdodCAvPSAyLjA7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgICAvLyBTaGlmdCBhbG9uZyBvciBhZ2FpbnN0IHZlY3RvciBWXG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIC8vIEJlbG93IHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBhYm92ZSB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfT0NMVVNJT05fUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgcHJldlRDb29yZHMgPSBjdXJyZW50VGV4dHVyZUNvb3JkcyArIGR0ZXg7XG5cbiAgICAgIC8vIEhlaWdodHMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCBuZXh0SCA9IGhlaWdodEZyb21UZXh0dXJlIC0gY3VycmVudExheWVySGVpZ2h0O1xuICAgICAgZmxvYXQgcHJldkggPSB0ZXh0dXJlMkQoYnVtcE1hcCwgcHJldlRDb29yZHMpLnIgLSBjdXJyZW50TGF5ZXJIZWlnaHQgKyBsYXllckhlaWdodDtcblxuICAgICAgLy8gUHJvcG9ydGlvbnMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCB3ZWlnaHQgPSBuZXh0SCAvIChuZXh0SCAtIHByZXZIKTtcblxuICAgICAgLy8gSW50ZXJwb2xhdGlvbiBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzXG4gICAgICByZXR1cm4gcHJldlRDb29yZHMgKiB3ZWlnaHQgKyBjdXJyZW50VGV4dHVyZUNvb3JkcyAqICgxLjAgLSB3ZWlnaHQpO1xuXG4gICAgICAjZWxzZSAvLyBOT19QQVJBTExBWFxuXG4gICAgICByZXR1cm4gdlV2O1xuXG4gICAgICAjZW5kaWZcbiAgICB9XG4gICAgI2VuZGlmXG5cbiAgICB2ZWMyIHBlcnR1cmJVdih2ZWMzIHN1cmZQb3NpdGlvbiwgdmVjMyBzdXJmTm9ybWFsLCB2ZWMzIHZpZXdQb3NpdGlvbikge1xuICAgICAgdmVjMiB0ZXhEeCA9IGRGZHgodlV2KTtcbiAgICAgIHZlYzIgdGV4RHkgPSBkRmR5KHZVdik7XG5cbiAgICAgIHZlYzMgdlNpZ21hWCA9IGRGZHgoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlNpZ21hWSA9IGRGZHkoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlIxID0gY3Jvc3ModlNpZ21hWSwgc3VyZk5vcm1hbCk7XG4gICAgICB2ZWMzIHZSMiA9IGNyb3NzKHN1cmZOb3JtYWwsIHZTaWdtYVgpO1xuICAgICAgZmxvYXQgZkRldCA9IGRvdCh2U2lnbWFYLCB2UjEpO1xuXG4gICAgICB2ZWMyIHZQcm9qVnNjciA9ICgxLjAgLyBmRGV0KSAqIHZlYzIoZG90KHZSMSwgdmlld1Bvc2l0aW9uKSwgZG90KHZSMiwgdmlld1Bvc2l0aW9uKSk7XG4gICAgICB2ZWMzIHZQcm9qVnRleDtcbiAgICAgIHZQcm9qVnRleC54eSA9IHRleER4ICogdlByb2pWc2NyLnggKyB0ZXhEeSAqIHZQcm9qVnNjci55O1xuICAgICAgdlByb2pWdGV4LnogPSBkb3Qoc3VyZk5vcm1hbCwgdmlld1Bvc2l0aW9uKTtcblxuICAgICAgcmV0dXJuIHBhcmFsbGF4TWFwKHZQcm9qVnRleCk7XG4gICAgfVxuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdmVjMiBtYXBVdiA9IHBlcnR1cmJVdigtdlZpZXdQb3NpdGlvbiwgbm9ybWFsaXplKHZOb3JtYWwpLCBub3JtYWxpemUodlZpZXdQb3NpdGlvbikpO1xuICAgICAgXG4gICAgICAvLyBDVVNUT00gU1RBUlRcbiAgICAgIHZlYzQgdGV4ZWwgPSB0ZXh0dXJlMkQobWFwLCBtYXBVdik7XG4gICAgICB2ZWMzIGNvbG9yID0gbWl4KHRleGVsLnh5eiwgdmVjMygwKSwgZmFkZSk7XG4gICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgLy8gQ1VTVE9NIEVORFxuICAgIH1cblxuICBgLFxufVxuXG5leHBvcnQgeyBQYXJhbGxheFNoYWRlciB9XG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQ3JlYXRlIHRoZSBpbGx1c2lvbiBvZiBkZXB0aCBpbiBhIGNvbG9yIGltYWdlIGZyb20gYSBkZXB0aCBtYXBcbiAqXG4gKiBVc2FnZVxuICogPT09PT1cbiAqIENyZWF0ZSBhIHBsYW5lIGluIEJsZW5kZXIgYW5kIGdpdmUgaXQgYSBtYXRlcmlhbCAoanVzdCB0aGUgZGVmYXVsdCBQcmluY2lwbGVkIEJTREYpLlxuICogQXNzaWduIGNvbG9yIGltYWdlIHRvIFwiY29sb3JcIiBjaGFubmVsIGFuZCBkZXB0aCBtYXAgdG8gXCJlbWlzc2l2ZVwiIGNoYW5uZWwuXG4gKiBZb3UgbWF5IHdhbnQgdG8gc2V0IGVtaXNzaXZlIHN0cmVuZ3RoIHRvIHplcm8gc28gdGhlIHByZXZpZXcgbG9va3MgYmV0dGVyLlxuICogQWRkIHRoZSBcInBhcmFsbGF4XCIgY29tcG9uZW50IGZyb20gdGhlIEh1YnMgZXh0ZW5zaW9uLCBjb25maWd1cmUsIGFuZCBleHBvcnQgYXMgLmdsYlxuICovXG5cbmltcG9ydCB7IFBhcmFsbGF4U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMnXG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4Jywge1xuICBzY2hlbWE6IHtcbiAgICBzdHJlbmd0aDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC41IH0sXG4gICAgY3V0b2ZmVHJhbnNpdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDggfSxcbiAgICBjdXRvZmZBbmdsZTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDQgfSxcbiAgfSxcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBjb25zdCB7IG1hcDogY29sb3JNYXAsIGVtaXNzaXZlTWFwOiBkZXB0aE1hcCB9ID0gbWVzaC5tYXRlcmlhbFxuICAgIGNvbG9yTWFwLndyYXBTID0gY29sb3JNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgZGVwdGhNYXAud3JhcFMgPSBkZXB0aE1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBjb25zdCB7IHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIgfSA9IFBhcmFsbGF4U2hhZGVyXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICBmcmFnbWVudFNoYWRlcixcbiAgICAgIGRlZmluZXM6IHsgVVNFX09DTFVTSU9OX1BBUkFMTEFYOiB0cnVlIH0sXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBtYXA6IHsgdmFsdWU6IGNvbG9yTWFwIH0sXG4gICAgICAgIGJ1bXBNYXA6IHsgdmFsdWU6IGRlcHRoTWFwIH0sXG4gICAgICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IC0xICogdGhpcy5kYXRhLnN0cmVuZ3RoIH0sXG4gICAgICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiAyMCB9LFxuICAgICAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogMzAgfSxcbiAgICAgICAgZmFkZTogeyB2YWx1ZTogMCB9LFxuICAgICAgfSxcbiAgICB9KVxuICAgIG1lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgaWYgKHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEpIHtcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih2ZWMpXG4gICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh2ZWMpXG4gICAgICBjb25zdCBhbmdsZSA9IHZlYy5hbmdsZVRvKGZvcndhcmQpXG4gICAgICBjb25zdCBmYWRlID0gbWFwTGluZWFyQ2xhbXBlZChcbiAgICAgICAgYW5nbGUsXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSAtIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgKyB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgMCwgLy8gSW4gdmlldyB6b25lLCBubyBmYWRlXG4gICAgICAgIDEgLy8gT3V0c2lkZSB2aWV3IHpvbmUsIGZ1bGwgZmFkZVxuICAgICAgKVxuICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5mYWRlLnZhbHVlID0gZmFkZVxuICAgIH1cbiAgfSxcbn0pXG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBiMSArICgoeCAtIGExKSAqIChiMiAtIGIxKSkgLyAoYTIgLSBhMSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyQ2xhbXBlZCh4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gY2xhbXAobWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSwgYjEsIGIyKVxufVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGNyZWF0ZSBhIEhUTUwgb2JqZWN0IGJ5IHJlbmRlcmluZyBhIHNjcmlwdCB0aGF0IGNyZWF0ZXMgYW5kIG1hbmFnZXMgaXRcbiAqXG4gKi9cbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcbmltcG9ydCB7dnVlQ29tcG9uZW50cyBhcyBodG1sQ29tcG9uZW50c30gZnJvbSBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiO1xuXG4vLyB2YXIgaHRtbENvbXBvbmVudHM7XG4vLyB2YXIgc2NyaXB0UHJvbWlzZTtcbi8vIGlmICh3aW5kb3cuX190ZXN0aW5nVnVlQXBwcykge1xuLy8gICAgIHNjcmlwdFByb21pc2UgPSBpbXBvcnQod2luZG93Ll9fdGVzdGluZ1Z1ZUFwcHMpICAgIFxuLy8gfSBlbHNlIHtcbi8vICAgICBzY3JpcHRQcm9taXNlID0gaW1wb3J0KFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCIpIFxuLy8gfVxuLy8gLy8gc2NyaXB0UHJvbWlzZSA9IHNjcmlwdFByb21pc2UudGhlbihtb2R1bGUgPT4ge1xuLy8gLy8gICAgIHJldHVybiBtb2R1bGVcbi8vIC8vIH0pO1xuLyoqXG4gKiBNb2RpZmllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL2h1YnMvYmxvYi9tYXN0ZXIvc3JjL2NvbXBvbmVudHMvZmFkZXIuanNcbiAqIHRvIGluY2x1ZGUgYWRqdXN0YWJsZSBkdXJhdGlvbiBhbmQgY29udmVydGVkIGZyb20gY29tcG9uZW50IHRvIHN5c3RlbVxuICovXG5cbiBBRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2h0bWwtc2NyaXB0JywgeyAgXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW1UaWNrID0gaHRtbENvbXBvbmVudHNbXCJzeXN0ZW1UaWNrXCJdO1xuICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCA9IGh0bWxDb21wb25lbnRzW1wiaW5pdGlhbGl6ZUV0aGVyZWFsXCJdXG4gICAgICAgIGlmICghdGhpcy5zeXN0ZW1UaWNrIHx8ICF0aGlzLmluaXRpYWxpemVFdGhlcmVhbCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImVycm9yIGluIGh0bWwtc2NyaXB0IHN5c3RlbTogaHRtbENvbXBvbmVudHMgaGFzIG5vIHN5c3RlbVRpY2sgYW5kL29yIGluaXRpYWxpemVFdGhlcmVhbCBtZXRob2RzXCIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCgpXG4gICAgICAgIH1cbiAgICB9LFxuICBcbiAgICB0aWNrKHQsIGR0KSB7XG4gICAgICAgIHRoaXMuc3lzdGVtVGljayh0LCBkdClcbiAgICB9LFxuICB9KVxuICBcbmNvbnN0IG9uY2UgPSB7XG4gICAgb25jZSA6IHRydWVcbn07XG4gIFxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdodG1sLXNjcmlwdCcsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBcIipfY29tcG9uZW50TmFtZVwiXG4gICAgICAgIG5hbWU6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn0sXG4gICAgICAgIHdpZHRoOiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IC0xfSxcbiAgICAgICAgaGVpZ2h0OiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IC0xfSxcbiAgICAgICAgcGFyYW1ldGVyMTogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyMjogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyMzogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyNDogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsO1xuICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5kYXRhLm5hbWU7XG5cbiAgICAgICAgdGhpcy5zY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgd2lkdGg6IHRoaXMuZGF0YS53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogdGhpcy5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgIHBhcmFtZXRlcjE6IHRoaXMuZGF0YS5wYXJhbWV0ZXIxLFxuICAgICAgICAgICAgcGFyYW1ldGVyMjogdGhpcy5kYXRhLnBhcmFtZXRlcjIsXG4gICAgICAgICAgICBwYXJhbWV0ZXIzOiB0aGlzLmRhdGEucGFyYW1ldGVyMyxcbiAgICAgICAgICAgIHBhcmFtZXRlcjQ6IHRoaXMuZGF0YS5wYXJhbWV0ZXI0XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuZnVsbE5hbWUgfHwgdGhpcy5mdWxsTmFtZS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSB0aGlzLmZ1bGxOYW1lXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdCAmJiByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKGV2KSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKVxuICAgICAgICB9LCBvbmNlKTtcblxuICAgICAgICAvL3RoaXMuY3JlYXRlU2NyaXB0KCk7XG4gICAgfSxcblxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLm5hbWUgPT09IFwiXCIgfHwgdGhpcy5kYXRhLm5hbWUgPT09IHRoaXMuZnVsbE5hbWUpIHJldHVyblxuXG4gICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcbiAgICAgICAgLy8gdGhpcy5wYXJzZU5vZGVOYW1lKCk7XG4gICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHRoaXMuZnVsbE5hbWU7XG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveVNjcmlwdCgpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgY3JlYXRlU2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGVhY2ggdGltZSB3ZSBsb2FkIGEgc2NyaXB0IGNvbXBvbmVudCB3ZSB3aWxsIHBvc3NpYmx5IGNyZWF0ZVxuICAgICAgICAvLyBhIG5ldyBuZXR3b3JrZWQgY29tcG9uZW50LiAgVGhpcyBpcyBmaW5lLCBzaW5jZSB0aGUgbmV0d29ya2VkIElkIFxuICAgICAgICAvLyBpcyBiYXNlZCBvbiB0aGUgZnVsbCBuYW1lIHBhc3NlZCBhcyBhIHBhcmFtZXRlciwgb3IgYXNzaWduZWQgdG8gdGhlXG4gICAgICAgIC8vIGNvbXBvbmVudCBpbiBTcG9rZS4gIEl0IGRvZXMgbWVhbiB0aGF0IGlmIHdlIGhhdmVcbiAgICAgICAgLy8gbXVsdGlwbGUgb2JqZWN0cyBpbiB0aGUgc2NlbmUgd2hpY2ggaGF2ZSB0aGUgc2FtZSBuYW1lLCB0aGV5IHdpbGxcbiAgICAgICAgLy8gYmUgaW4gc3luYy4gIEl0IGFsc28gbWVhbnMgdGhhdCBpZiB5b3Ugd2FudCB0byBkcm9wIGEgY29tcG9uZW50IG9uXG4gICAgICAgIC8vIHRoZSBzY2VuZSB2aWEgYSAuZ2xiLCBpdCBtdXN0IGhhdmUgYSB2YWxpZCBuYW1lIHBhcmFtZXRlciBpbnNpZGUgaXQuXG4gICAgICAgIC8vIEEgLmdsYiBpbiBzcG9rZSB3aWxsIGZhbGwgYmFjayB0byB0aGUgc3Bva2UgbmFtZSBpZiB5b3UgdXNlIG9uZSB3aXRob3V0XG4gICAgICAgIC8vIGEgbmFtZSBpbnNpZGUgaXQuXG4gICAgICAgIGxldCBsb2FkZXIgPSAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmxvYWRTY3JpcHQoKS50aGVuKCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNjcmlwdCkgcmV0dXJuXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2V0IHRoZSBwYXJlbnQgbmV0d29ya2VkIGVudGl0eSwgd2hlbiBpdCdzIGZpbmlzaGVkIGluaXRpYWxpemluZy4gIFxuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIGNyZWF0aW5nIHRoaXMgYXMgcGFydCBvZiBhIEdMVEYgbG9hZCwgdGhlIFxuICAgICAgICAgICAgICAgICAgICAvLyBwYXJlbnQgYSBmZXcgc3RlcHMgdXAgd2lsbCBiZSBuZXR3b3JrZWQuICBXZSdsbCBvbmx5IGRvIHRoaXNcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIEhUTUwgc2NyaXB0IHdhbnRzIHRvIGJlIG5ldHdvcmtlZFxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IG51bGxcblxuICAgICAgICAgICAgICAgICAgICAvLyBiaW5kIGNhbGxiYWNrc1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YWtlT3duZXJzaGlwID0gdGhpcy50YWtlT3duZXJzaGlwLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuc2V0TmV0d29ya01ldGhvZHModGhpcy50YWtlT3duZXJzaGlwLCB0aGlzLnNldFNoYXJlZERhdGEpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgIGNvbnN0IHNjcmlwdEVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gc2NyaXB0RWxcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldE9iamVjdDNEKFwid2VibGF5ZXIzZFwiLCB0aGlzLnNjcmlwdC53ZWJMYXllcjNEKVxuXG4gICAgICAgICAgICAgICAgLy8gbGV0cyBmaWd1cmUgb3V0IHRoZSBzY2FsZSwgYnV0IHNjYWxpbmcgdG8gZmlsbCB0aGUgYSAxeDFtIHNxdWFyZSwgdGhhdCBoYXMgYWxzb1xuICAgICAgICAgICAgICAgIC8vIHBvdGVudGlhbGx5IGJlZW4gc2NhbGVkIGJ5IHRoZSBwYXJlbnRzIHBhcmVudCBub2RlLiBJZiB3ZSBzY2FsZSB0aGUgZW50aXR5IGluIHNwb2tlLFxuICAgICAgICAgICAgICAgIC8vIHRoaXMgaXMgd2hlcmUgdGhlIHNjYWxlIGlzIHNldC4gIElmIHdlIGRyb3AgYSBub2RlIGluIGFuZCBzY2FsZSBpdCwgdGhlIHNjYWxlIGlzIGFsc29cbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlcmUuXG4gICAgICAgICAgICAgICAgLy8gV2UgdXNlZCB0byBoYXZlIGEgZml4ZWQgc2l6ZSBwYXNzZWQgYmFjayBmcm9tIHRoZSBlbnRpdHksIGJ1dCB0aGF0J3MgdG9vIHJlc3RyaWN0aXZlOlxuICAgICAgICAgICAgICAgIC8vIGNvbnN0IHdpZHRoID0gdGhpcy5zY3JpcHQud2lkdGhcbiAgICAgICAgICAgICAgICAvLyBjb25zdCBoZWlnaHQgPSB0aGlzLnNjcmlwdC5oZWlnaHRcblxuICAgICAgICAgICAgICAgIC8vIFRPRE86IG5lZWQgdG8gZmluZCBlbnZpcm9ubWVudC1zY2VuZSwgZ28gZG93biB0d28gbGV2ZWxzIHRvIHRoZSBncm91cCBhYm92ZSBcbiAgICAgICAgICAgICAgICAvLyB0aGUgbm9kZXMgaW4gdGhlIHNjZW5lLiAgVGhlbiBhY2N1bXVsYXRlIHRoZSBzY2FsZXMgdXAgZnJvbSB0aGlzIG5vZGUgdG9cbiAgICAgICAgICAgICAgICAvLyB0aGF0IG5vZGUuICBUaGlzIHdpbGwgYWNjb3VudCBmb3IgZ3JvdXBzLCBhbmQgbmVzdGluZy5cblxuICAgICAgICAgICAgICAgIHZhciB3aWR0aCA9IDEsIGhlaWdodCA9IDE7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGF0dGFjaGVkIHRvIGFuIGltYWdlIGluIHNwb2tlLCBzbyB0aGUgaW1hZ2UgbWVzaCBpcyBzaXplIDEgYW5kIGlzIHNjYWxlZCBkaXJlY3RseVxuICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBzY2FsZU0ueCAqIHNjYWxlSS54XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnggPSAxXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS55ID0gMVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaXQncyBlbWJlZGRlZCBpbiBhIHNpbXBsZSBnbHRmIG1vZGVsOyAgb3RoZXIgbW9kZWxzIG1heSBub3Qgd29ya1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhc3N1bWUgaXQncyBhdCB0aGUgdG9wIGxldmVsIG1lc2gsIGFuZCB0aGF0IHRoZSBtb2RlbCBpdHNlbGYgaXMgc2NhbGVkXG4gICAgICAgICAgICAgICAgICAgIGxldCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG1lc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBib3ggPSBtZXNoLmdlb21ldHJ5LmJvdW5kaW5nQm94O1xuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSAoYm94Lm1heC54IC0gYm94Lm1pbi54KSAqIG1lc2guc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gKGJveC5tYXgueSAtIGJveC5taW4ueSkgKiBtZXNoLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtZXNoU2NhbGUgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IG1lc2hTY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBtZXNoU2NhbGUueVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgdGhlIHJvb3QgZ2x0ZiBzY2FsZS5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmVudDIgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLm9iamVjdDNEXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoICo9IHBhcmVudDIuc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQgKj0gcGFyZW50Mi5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAgICAgICAgICAgICB2YXIgc2NhbGUgPSBNYXRoLm1pbih3aWR0aCAvIHdzaXplLCBoZWlnaHQgLyBoc2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwgeyB4OiBzY2FsZSwgeTogc2NhbGUsIHo6IHNjYWxlfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgd2lsbCBiZSBvbmUgZWxlbWVudCBhbHJlYWR5LCB0aGUgY3ViZSB3ZSBjcmVhdGVkIGluIGJsZW5kZXJcbiAgICAgICAgICAgICAgICAvLyBhbmQgYXR0YWNoZWQgdGhpcyBjb21wb25lbnQgdG8sIHNvIHJlbW92ZSBpdCBpZiBpdCBpcyB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuLnBvcCgpXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgYy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIFwiaXNTdGF0aWNcIiBpcyBjb3JyZWN0OyAgY2FuJ3QgYmUgc3RhdGljIGlmIGVpdGhlciBpbnRlcmFjdGl2ZSBvciBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNTdGF0aWMgJiYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUgfHwgdGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hcHBlbmRDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcblxuICAgICAgICAgICAgICAgIC8vIFRPRE86ICB3ZSBhcmUgZ29pbmcgdG8gaGF2ZSB0byBtYWtlIHN1cmUgdGhpcyB3b3JrcyBpZiBcbiAgICAgICAgICAgICAgICAvLyB0aGUgc2NyaXB0IGlzIE9OIGFuIGludGVyYWN0YWJsZSAobGlrZSBhbiBpbWFnZSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIG1ha2UgdGhlIGh0bWwgb2JqZWN0IGNsaWNrYWJsZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gZm9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIG9iamVjdCBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGlja2VkID0gdGhpcy5jbGlja2VkLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzRHJhZ2dhYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhcmVuJ3QgZ29pbmcgdG8gcmVhbGx5IGRlYWwgd2l0aCB0aGlzIHRpbGwgd2UgaGF2ZSBhIHVzZSBjYXNlLCBidXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGNhbiBzZXQgaXQgdXAgZm9yIG5vd1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNIb2xkYWJsZTogdHJ1ZSwgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhvbGRhYmxlQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi1kb3duJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmRyYWdTdGFydChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLXVwJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmRyYWdFbmQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5yYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBubyBpbnRlcmFjdGl2aXR5LCBwbGVhc2VcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcImlzLXJlbW90ZS1ob3Zlci10YXJnZXRcIilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIFNIT1VMRCB3b3JrIGJ1dCBtYWtlIHN1cmUgaXQgd29ya3MgaWYgdGhlIGVsIHdlIGFyZSBvblxuICAgICAgICAgICAgICAgIC8vIGlzIG5ldHdvcmtlZCwgc3VjaCBhcyB3aGVuIGF0dGFjaGVkIHRvIGFuIGltYWdlXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5oYXNBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhbiBleGlzdGluZyBjb3B5IG9mIHRoZSBOZXR3b3JrZWQgRW50aXR5IChpZiB3ZSBhcmUgbm90IHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBmaXJzdCBjbGllbnQgaW4gdGhlIHJvb20gaXQgd2lsbCBleGlzdCBpbiBvdGhlciBjbGllbnRzIGFuZCBiZSBjcmVhdGVkIGJ5IE5BRilcbiAgICAgICAgICAgICAgICAgICAgLy8gb3IgY3JlYXRlIGFuIGVudGl0eSBpZiB3ZSBhcmUgZmlyc3QuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSBmdW5jdGlvbiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwZXJzaXN0ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgYmUgcGFydCBvZiBhIE5ldHdvcmtlZCBHTFRGIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIHBpbm5lZCBhbmQgbG9hZGVkIHdoZW4gd2UgZW50ZXIgdGhlIHJvb20uICBVc2UgdGhlIG5ldHdvcmtlZCBwYXJlbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHBsdXMgYSBkaXNhbWJpZ3VhdGluZyBiaXQgb2YgdGV4dCB0byBjcmVhdGUgYSB1bmlxdWUgSWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSBOQUYudXRpbHMuZ2V0TmV0d29ya0lkKG5ldHdvcmtlZEVsKSArIFwiLWh0bWwtc2NyaXB0XCI7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBuZWVkIHRvIGNyZWF0ZSBhbiBlbnRpdHksIHVzZSB0aGUgc2FtZSBwZXJzaXN0ZW5jZSBhcyBvdXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrIGVudGl0eSAodHJ1ZSBpZiBwaW5uZWQsIGZhbHNlIGlmIG5vdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50ID0gZW50aXR5LmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEucGVyc2lzdGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBvbmx5IGhhcHBlbnMgaWYgdGhpcyBjb21wb25lbnQgaXMgb24gYSBzY2VuZSBmaWxlLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBlbGVtZW50cyBvbiB0aGUgc2NlbmUgYXJlbid0IG5ldHdvcmtlZC4gIFNvIGxldCdzIGFzc3VtZSBlYWNoIGVudGl0eSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzY2VuZSB3aWxsIGhhdmUgYSB1bmlxdWUgbmFtZS4gIEFkZGluZyBhIGJpdCBvZiB0ZXh0IHNvIHdlIGNhbiBmaW5kIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIERPTSB3aGVuIGRlYnVnZ2luZy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IHRoaXMuZnVsbE5hbWUucmVwbGFjZUFsbChcIl9cIixcIi1cIikgKyBcIi1odG1sLXNjcmlwdFwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBuZXR3b3JrZWQgZW50aXR5IHdlIGNyZWF0ZSBmb3IgdGhpcyBjb21wb25lbnQgYWxyZWFkeSBleGlzdHMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBjcmVhdGUgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gTk9URTogaXQgaXMgY3JlYXRlZCBvbiB0aGUgc2NlbmUsIG5vdCBhcyBhIGNoaWxkIG9mIHRoaXMgZW50aXR5LCBiZWNhdXNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIE5BRiBjcmVhdGVzIHJlbW90ZSBlbnRpdGllcyBpbiB0aGUgc2NlbmUuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5lbnRpdGllcy5oYXNFbnRpdHkobmV0SWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gTkFGLmVudGl0aWVzLmdldEVudGl0eShuZXRJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZXRob2QgdG8gcmV0cmlldmUgdGhlIHNjcmlwdCBkYXRhIG9uIHRoaXMgZW50aXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgXCJuZXR3b3JrZWRcIiBjb21wb25lbnQgc2hvdWxkIGhhdmUgcGVyc2lzdGVudD10cnVlLCB0aGUgdGVtcGxhdGUgYW5kIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBzZXQsIG93bmVyIHNldCB0byBcInNjZW5lXCIgKHNvIHRoYXQgaXQgZG9lc24ndCB1cGRhdGUgdGhlIHJlc3Qgb2ZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgd29ybGQgd2l0aCBpdCdzIGluaXRpYWwgZGF0YSwgYW5kIHNob3VsZCBOT1Qgc2V0IGNyZWF0b3IgKHRoZSBzeXN0ZW0gd2lsbCBkbyB0aGF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5zZXRBdHRyaWJ1dGUoJ25ldHdvcmtlZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGU6IFwiI3NjcmlwdC1kYXRhLW1lZGlhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQ6IHBlcnNpc3RlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG93bmVyOiBcInNjZW5lXCIsICAvLyBzbyB0aGF0IG91ciBpbml0aWFsIHZhbHVlIGRvZXNuJ3Qgb3ZlcndyaXRlIG90aGVyc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXR3b3JrSWQ6IG5ldElkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFwcGVuZENoaWxkKGVudGl0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNhdmUgYSBwb2ludGVyIHRvIHRoZSBuZXR3b3JrZWQgZW50aXR5IGFuZCB0aGVuIHdhaXQgZm9yIGl0IHRvIGJlIGZ1bGx5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCBiZWZvcmUgZ2V0dGluZyBhIHBvaW50ZXIgdG8gdGhlIGFjdHVhbCBuZXR3b3JrZWQgY29tcG9uZW50IGluIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5uZXRFbnRpdHkpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tcInNjcmlwdC1kYXRhXCJdXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIGlzIHRoZSBmaXJzdCBuZXR3b3JrZWQgZW50aXR5LCBpdCdzIHNoYXJlZERhdGEgd2lsbCBkZWZhdWx0IHRvIHRoZSAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RyaW5nIFwie31cIiwgYW5kIHdlIHNob3VsZCBpbml0aWFsaXplIGl0IHdpdGggdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuc2hhcmVkRGF0YS5sZW5ndGggPT0gMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgbmV0d29ya2VkID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tcIm5ldHdvcmtlZFwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiAobmV0d29ya2VkLmRhdGEuY3JlYXRvciA9PSBOQUYuY2xpZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIHRoaXMuc3RhdGVTeW5jLmluaXRTaGFyZWREYXRhKHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMuZWwpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkobmV0d29ya2VkRWwpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSgpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSB0aGlzLnNldHVwTmV0d29ya2VkLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIG1ldGhvZCBoYW5kbGVzIHRoZSBkaWZmZXJlbnQgc3RhcnR1cCBjYXNlczpcbiAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmUsIE5BRiB3aWxsIGJlIGNvbm5lY3RlZCBhbmQgd2UgY2FuIFxuICAgICAgICAgICAgICAgICAgICAvLyAgIGltbWVkaWF0ZWx5IGluaXRpYWxpemVcbiAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiBpcyBpbiB0aGUgcm9vbSBzY2VuZSBvciBwaW5uZWQsIGl0IHdpbGwgbGlrZWx5IGJlIGNyZWF0ZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gICBiZWZvcmUgTkFGIGlzIHN0YXJ0ZWQgYW5kIGNvbm5lY3RlZCwgc28gd2Ugd2FpdCBmb3IgYW4gZXZlbnQgdGhhdCBpc1xuICAgICAgICAgICAgICAgICAgICAvLyAgIGZpcmVkIHdoZW4gSHVicyBoYXMgc3RhcnRlZCBOQUZcbiAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5jb25uZWN0aW9uICYmIE5BRi5jb25uZWN0aW9uLmlzQ29ubmVjdGVkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQoKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdkaWRDb25uZWN0VG9OZXR3b3JrZWRTY2VuZScsIHRoaXMuc2V0dXBOZXR3b3JrZWQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5jYXRjaChlID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwibG9hZFNjcmlwdCBmYWlsZWQgZm9yIHNjcmlwdCBcIiArIHRoaXMuZGF0YS5uYW1lICsgXCI6IFwiICsgZSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgYXR0YWNoZWQgdG8gYSBub2RlIHdpdGggYSBtZWRpYS1sb2FkZXIgY29tcG9uZW50LCB0aGlzIG1lYW5zIHdlIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50XG4gICAgICAgIC8vIHRvIGEgbWVkaWEgb2JqZWN0IGluIFNwb2tlLiAgV2Ugc2hvdWxkIHdhaXQgdGlsbCB0aGUgb2JqZWN0IGlzIGZ1bGx5IGxvYWRlZC4gIFxuICAgICAgICAvLyBPdGhlcndpc2UsIGl0IHdhcyBhdHRhY2hlZCB0byBzb21ldGhpbmcgaW5zaWRlIGEgR0xURiAocHJvYmFibHkgaW4gYmxlbmRlcilcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQucGxheSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wYXVzZSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaGFuZGxlIFwiaW50ZXJhY3RcIiBldmVudHMgZm9yIGNsaWNrYWJsZSBlbnRpdGllc1xuICAgIGNsaWNrZWQ6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcImNsaWNrZWQgb24gaHRtbDogXCIsIGV2dClcbiAgICAgICAgdGhpcy5zY3JpcHQuY2xpY2tlZChldnQpIFxuICAgIH0sXG4gIFxuICAgIC8vIG1ldGhvZHMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgaHRtbCBvYmplY3Qgc28gdGhleSBjYW4gdXBkYXRlIG5ldHdvcmtlZCBkYXRhXG4gICAgdGFrZU93bmVyc2hpcDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnRha2VPd25lcnNoaXAoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBzdXJlLCBnbyBhaGVhZCBhbmQgY2hhbmdlIGl0IGZvciBub3dcbiAgICAgICAgfVxuICAgIH0sXG4gICAgXG4gICAgc2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oZGF0YU9iamVjdCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXRlU3luYy5zZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9LFxuXG4gICAgLy8gdGhpcyBpcyBjYWxsZWQgZnJvbSBiZWxvdywgdG8gZ2V0IHRoZSBpbml0aWFsIGRhdGEgZnJvbSB0aGUgc2NyaXB0XG4gICAgZ2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKVxuICAgICAgICB9XG4gICAgICAgIC8vIHNob3VsZG4ndCBoYXBwZW5cbiAgICAgICAgY29uc29sZS53YXJuKFwic2NyaXB0LWRhdGEgY29tcG9uZW50IGNhbGxlZCBwYXJlbnQgZWxlbWVudCBidXQgdGhlcmUgaXMgbm8gc2NyaXB0IHlldD9cIilcbiAgICAgICAgcmV0dXJuIFwie31cIlxuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICBpZiAoIXRoaXMuc2NyaXB0KSByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgLy8gbW9yZSBvciBsZXNzIGNvcGllZCBmcm9tIFwiaG92ZXJhYmxlLXZpc3VhbHMuanNcIiBpbiBodWJzXG4gICAgICAgICAgICBjb25zdCB0b2dnbGluZyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zW1wiaHVicy1zeXN0ZW1zXCJdLmN1cnNvclRvZ2dsaW5nU3lzdGVtO1xuICAgICAgICAgICAgdmFyIHBhc3N0aHJ1SW50ZXJhY3RvciA9IFtdXG5cbiAgICAgICAgICAgIGxldCBpbnRlcmFjdG9yT25lLCBpbnRlcmFjdG9yVHdvO1xuICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcbiAgICAgICAgICAgIGlmICghaW50ZXJhY3Rpb24ucmVhZHkpIHJldHVybjsgLy9ET01Db250ZW50UmVhZHkgd29ya2Fyb3VuZFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBsZXQgaG92ZXJFbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICF0b2dnbGluZy5sZWZ0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JPbmUpIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3Rvck9uZS5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwuc2V0KHBvcywgZGlyKVxuXG4gICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheUwpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgIXRvZ2dsaW5nLnJpZ2h0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodEhhbmQuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JUd28pIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3RvclR3by5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIuc2V0KHBvcywgZGlyKVxuICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlSKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmludGVyYWN0aW9uUmF5cyA9IHBhc3N0aHJ1SW50ZXJhY3RvclxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlbid0IGZpbmlzaGVkIHNldHRpbmcgdXAgdGhlIG5ldHdvcmtlZCBlbnRpdHkgZG9uJ3QgZG8gYW55dGhpbmcuXG4gICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykgeyByZXR1cm4gfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgc3RhdGUgaGFzIGNoYW5nZWQgaW4gdGhlIG5ldHdvcmtlZCBkYXRhLCB1cGRhdGUgb3VyIGh0bWwgb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LnVwZGF0ZVNoYXJlZERhdGEodGhpcy5zdGF0ZVN5bmMuZGF0YU9iamVjdClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2NyaXB0LnRpY2sodGltZSlcbiAgICB9LFxuICBcbiAgICAvLyBUT0RPOiAgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIGlmIHRoZXJlIGlzIG5vIHBhcmFtZXRlciBzcGVjaWZ5aW5nIHRoZVxuICAgIC8vIGh0bWwgc2NyaXB0IG5hbWUuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5mdWxsTmFtZSA9PT0gXCJcIikge1xuXG4gICAgICAgICAgICAvLyBUT0RPOiAgc3dpdGNoIHRoaXMgdG8gZmluZCBlbnZpcm9ubWVudC1yb290IGFuZCBnbyBkb3duIHRvIFxuICAgICAgICAgICAgLy8gdGhlIG5vZGUgYXQgdGhlIHJvb20gb2Ygc2NlbmUgKG9uZSBhYm92ZSB0aGUgdmFyaW91cyBub2RlcykuICBcbiAgICAgICAgICAgIC8vIHRoZW4gZ28gdXAgZnJvbSBoZXJlIHRpbGwgd2UgZ2V0IHRvIGEgbm9kZSB0aGF0IGhhcyB0aGF0IG5vZGVcbiAgICAgICAgICAgIC8vIGFzIGl0J3MgcGFyZW50XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICAgICAgfSBcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJjb21wb25lbnROYW1lXCJcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIGZldGNoIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgcmVzb3VyY2VcbiAgICAgICAgLy8gY29tcG9uZW50TmFtZVxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmZ1bGxOYW1lLm1hdGNoKC9fKFtBLVphLXowLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMywgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJodG1sLXNjcmlwdCBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5mdWxsTmFtZSlcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IG51bGxcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHBhcmFtc1sxXVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxvYWRTY3JpcHQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaWYgKHNjcmlwdFByb21pc2UpIHtcbiAgICAgICAgLy8gICAgIHRyeSB7XG4gICAgICAgIC8vICAgICAgICAgaHRtbENvbXBvbmVudHMgPSBhd2FpdCBzY3JpcHRQcm9taXNlO1xuICAgICAgICAvLyAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgLy8gICAgICAgICByZXR1cm5cbiAgICAgICAgLy8gICAgIH1cbiAgICAgICAgLy8gICAgIHNjcmlwdFByb21pc2UgPSBudWxsXG4gICAgICAgIC8vIH1cbiAgICAgICAgdmFyIGluaXRTY3JpcHQgPSBodG1sQ29tcG9uZW50c1t0aGlzLmNvbXBvbmVudE5hbWVdXG4gICAgICAgIGlmICghaW5pdFNjcmlwdCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiJ2h0bWwtc2NyaXB0JyBjb21wb25lbnQgZG9lc24ndCBoYXZlIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBuZXcgaW5pdFNjcmlwdCh0aGlzLnNjcmlwdERhdGEpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZXJyb3IgY3JlYXRpbmcgc2NyaXB0IGZvciBcIiArIHRoaXMuY29tcG9uZW50TmFtZSwgZSk7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpe1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudXBkYXRlKHRydWUpXG5cbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LnJlYWR5UHJvbWlzZT8udGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gd2hlbiBhIHNjcmlwdCBmaW5pc2hlcyBnZXR0aW5nIHJlYWR5LCB0ZWxsIHRoZSBcbiAgICAgICAgICAgICAgICAvLyBwb3J0YWxzIHRvIHVwZGF0ZSB0aGVtc2VsdmVzXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmVtaXQoJ3VwZGF0ZVBvcnRhbHMnKSBcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBmYWlsZWQgdG8gaW5pdGlhbGl6ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5kZXN0cm95U2NyaXB0KClcbiAgICB9LFxuXG4gICAgZGVzdHJveVNjcmlwdDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QucmVtb3ZlRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG4gICAgICAgIH1cblxuICAgICAgICB3aW5kb3cuQVBQLnNjZW5lLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2RpZENvbm5lY3RUb05ldHdvcmtlZFNjZW5lJywgdGhpcy5zZXR1cE5ldHdvcmtlZClcblxuICAgICAgICB0aGlzLmVsLnJlbW92ZUNoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5yZW1vdmVPYmplY3QzRChcIndlYmxheWVyM2RcIilcbiAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBudWxsXG5cbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkICYmIHRoaXMubmV0RW50aXR5LnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgIHRoaXMubmV0RW50aXR5LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5uZXRFbnRpdHkpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JpcHQuZGVzdHJveSgpXG4gICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbFxuICAgIH1cbn0pXG5cbi8vXG4vLyBDb21wb25lbnQgZm9yIG91ciBuZXR3b3JrZWQgc3RhdGUuICBUaGlzIGNvbXBvbmVudCBkb2VzIG5vdGhpbmcgZXhjZXB0IGFsbCB1cyB0byBcbi8vIGNoYW5nZSB0aGUgc3RhdGUgd2hlbiBhcHByb3ByaWF0ZS4gV2UgY291bGQgc2V0IHRoaXMgdXAgdG8gc2lnbmFsIHRoZSBjb21wb25lbnQgYWJvdmUgd2hlblxuLy8gc29tZXRoaW5nIGhhcyBjaGFuZ2VkLCBpbnN0ZWFkIG9mIGhhdmluZyB0aGUgY29tcG9uZW50IGFib3ZlIHBvbGwgZWFjaCBmcmFtZS5cbi8vXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnc2NyaXB0LWRhdGEnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNjcmlwdGRhdGE6IHt0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcInt9XCJ9LFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnRha2VPd25lcnNoaXAgPSB0aGlzLnRha2VPd25lcnNoaXAuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhID0gdGhpcy5zZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gdGhpcy5lbC5nZXRTaGFyZWREYXRhKCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkodGhpcy5kYXRhT2JqZWN0KSlcbiAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKFwic2NyaXB0LWRhdGFcIiwgXCJzY3JpcHRkYXRhXCIsIHRoaXMuc2hhcmVkRGF0YSk7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkNvdWxkbid0IGVuY29kZSBpbml0aWFsIHNjcmlwdCBkYXRhIG9iamVjdDogXCIsIGUsIHRoaXMuZGF0YU9iamVjdClcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IFwie31cIlxuICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoYW5nZWQgPSBmYWxzZTtcbiAgICB9LFxuXG4gICAgdXBkYXRlKCkge1xuICAgICAgICB0aGlzLmNoYW5nZWQgPSAhKHRoaXMuc2hhcmVkRGF0YSA9PT0gdGhpcy5kYXRhLnNjcmlwdGRhdGEpO1xuICAgICAgICBpZiAodGhpcy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHRoaXMuZGF0YS5zY3JpcHRkYXRhKSlcblxuICAgICAgICAgICAgICAgIC8vIGRvIHRoZXNlIGFmdGVyIHRoZSBKU09OIHBhcnNlIHRvIG1ha2Ugc3VyZSBpdCBoYXMgc3VjY2VlZGVkXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gdGhpcy5kYXRhLnNjcmlwdGRhdGE7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VkID0gdHJ1ZVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNvdWxkbid0IHBhcnNlIEpTT04gcmVjZWl2ZWQgaW4gc2NyaXB0LXN5bmM6IFwiLCBlKVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IFwie31cIlxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaXQgaXMgbGlrZWx5IHRoYXQgYXBwbHlQZXJzaXN0ZW50U3luYyBvbmx5IG5lZWRzIHRvIGJlIGNhbGxlZCBmb3IgcGVyc2lzdGVudFxuICAgIC8vIG5ldHdvcmtlZCBlbnRpdGllcywgc28gd2UgX3Byb2JhYmx5XyBkb24ndCBuZWVkIHRvIGRvIHRoaXMuICBCdXQgaWYgdGhlcmUgaXMgbm9cbiAgICAvLyBwZXJzaXN0ZW50IGRhdGEgc2F2ZWQgZnJvbSB0aGUgbmV0d29yayBmb3IgdGhpcyBlbnRpdHksIHRoaXMgY29tbWFuZCBkb2VzIG5vdGhpbmcuXG4gICAgcGxheSgpIHtcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgcmVhbGx5IG5lZWRlZCwgYnV0IGNhbid0IGh1cnRcbiAgICAgICAgICAgIGlmIChBUFAudXRpbHMpIHsgLy8gdGVtcG9yYXJ5IHRpbGwgd2Ugc2hpcCBuZXcgY2xpZW50XG4gICAgICAgICAgICAgICAgQVBQLnV0aWxzLmFwcGx5UGVyc2lzdGVudFN5bmModGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLm5ldHdvcmtJZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgdGFrZU93bmVyc2hpcCgpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG5cbiAgICAvLyBpbml0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgLy8gICAgIHRyeSB7XG4gICAgLy8gICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAvLyAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAvLyAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAvLyAgICAgICAgIHJldHVybiB0cnVlXG4gICAgLy8gICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAvLyAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAvLyAgICAgICAgIHJldHVybiBmYWxzZVxuICAgIC8vICAgICB9XG4gICAgLy8gfSxcblxuICAgIC8vIFRoZSBrZXkgcGFydCBpbiB0aGVzZSBtZXRob2RzICh3aGljaCBhcmUgY2FsbGVkIGZyb20gdGhlIGNvbXBvbmVudCBhYm92ZSkgaXMgdG9cbiAgICAvLyBjaGVjayBpZiB3ZSBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgdGhlIG5ldHdvcmtlZCBvYmplY3QuICBJZiB3ZSBvd24gaXQgKGlzTWluZSgpIGlzIHRydWUpXG4gICAgLy8gd2UgY2FuIGNoYW5nZSBpdC4gIElmIHdlIGRvbid0IG93biBpbiwgd2UgY2FuIHRyeSB0byBiZWNvbWUgdGhlIG93bmVyIHdpdGhcbiAgICAvLyB0YWtlT3duZXJzaGlwKCkuIElmIHRoaXMgc3VjY2VlZHMsIHdlIGNhbiBzZXQgdGhlIGRhdGEuICBcbiAgICAvL1xuICAgIC8vIE5PVEU6IHRha2VPd25lcnNoaXAgQVRURU1QVFMgdG8gYmVjb21lIHRoZSBvd25lciwgYnkgYXNzdW1pbmcgaXQgY2FuIGJlY29tZSB0aGVcbiAgICAvLyBvd25lciBhbmQgbm90aWZ5aW5nIHRoZSBuZXR3b3JrZWQgY29waWVzLiAgSWYgdHdvIG9yIG1vcmUgZW50aXRpZXMgdHJ5IHRvIGJlY29tZVxuICAgIC8vIG93bmVyLCAgb25seSBvbmUgKHRoZSBsYXN0IG9uZSB0byB0cnkpIGJlY29tZXMgdGhlIG93bmVyLiAgQW55IHN0YXRlIHVwZGF0ZXMgZG9uZVxuICAgIC8vIGJ5IHRoZSBcImZhaWxlZCBhdHRlbXB0ZWQgb3duZXJzXCIgd2lsbCBub3QgYmUgZGlzdHJpYnV0ZWQgdG8gdGhlIG90aGVyIGNsaWVudHMsXG4gICAgLy8gYW5kIHdpbGwgYmUgb3ZlcndyaXR0ZW4gKGV2ZW50dWFsbHkpIGJ5IHVwZGF0ZXMgZnJvbSB0aGUgb3RoZXIgY2xpZW50cy4gICBCeSBub3RcbiAgICAvLyBhdHRlbXB0aW5nIHRvIGd1YXJhbnRlZSBvd25lcnNoaXAsIHRoaXMgY2FsbCBpcyBmYXN0IGFuZCBzeW5jaHJvbm91cy4gIEFueSBcbiAgICAvLyBtZXRob2RzIGZvciBndWFyYW50ZWVpbmcgb3duZXJzaGlwIGNoYW5nZSB3b3VsZCB0YWtlIGEgbm9uLXRyaXZpYWwgYW1vdW50IG9mIHRpbWVcbiAgICAvLyBiZWNhdXNlIG9mIG5ldHdvcmsgbGF0ZW5jaWVzLlxuXG4gICAgc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdmFyIGh0bWxTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBodG1sU3RyaW5nXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCBodG1sU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSk7XG5cbi8vIEFkZCBvdXIgdGVtcGxhdGUgZm9yIG91ciBuZXR3b3JrZWQgb2JqZWN0IHRvIHRoZSBhLWZyYW1lIGFzc2V0cyBvYmplY3QsXG4vLyBhbmQgYSBzY2hlbWEgdG8gdGhlIE5BRi5zY2hlbWFzLiAgQm90aCBtdXN0IGJlIHRoZXJlIHRvIGhhdmUgY3VzdG9tIGNvbXBvbmVudHMgd29ya1xuXG5jb25zdCBhc3NldHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiYS1hc3NldHNcIik7XG5cbmFzc2V0cy5pbnNlcnRBZGphY2VudEhUTUwoXG4gICAgJ2JlZm9yZWVuZCcsXG4gICAgYFxuICAgIDx0ZW1wbGF0ZSBpZD1cInNjcmlwdC1kYXRhLW1lZGlhXCI+XG4gICAgICA8YS1lbnRpdHlcbiAgICAgICAgc2NyaXB0LWRhdGFcbiAgICAgID48L2EtZW50aXR5PlxuICAgIDwvdGVtcGxhdGU+XG4gIGBcbiAgKVxuXG5jb25zdCB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSA9IGVwc2lsb24gPT4ge1xuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRsZXQgcHJldiA9IG51bGw7XG5cdFx0XHRyZXR1cm4gY3VyciA9PiB7XG5cdFx0XHRcdGlmIChwcmV2ID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cHJldiA9IG5ldyBUSFJFRS5WZWN0b3IzKGN1cnIueCwgY3Vyci55LCBjdXJyLnopO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFOQUYudXRpbHMuYWxtb3N0RXF1YWxWZWMzKHByZXYsIGN1cnIsIGVwc2lsb24pKSB7XG5cdFx0XHRcdFx0cHJldi5jb3B5KGN1cnIpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH07XG5cdFx0fTtcblx0fTtcblxuTkFGLnNjaGVtYXMuYWRkKHtcbiAgXHR0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICBjb21wb25lbnRzOiBbXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwicm90YXRpb25cIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIC8vIHtcbiAgICAvLyAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgLy8gICAgIHByb3BlcnR5OiBcInNjYWxlXCIsXG4gICAgLy8gICAgIHJlcXVpcmVzTmV0d29ya1VwZGF0ZTogdmVjdG9yUmVxdWlyZXNVcGRhdGUoMC4wMDEpXG4gICAgLy8gfSxcbiAgICB7XG4gICAgICBcdGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgXHRwcm9wZXJ0eTogXCJzY3JpcHRkYXRhXCJcbiAgICB9XSxcbiAgICAgIG5vbkF1dGhvcml6ZWRDb21wb25lbnRzOiBbXG4gICAgICB7XG4gICAgICAgICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgICAgfVxuICAgIF0sXG5cbiAgfSk7XG5cbiIsIi8qKlxuICogY29udHJvbCBhIHZpZGVvIGZyb20gYSBjb21wb25lbnQgeW91IHN0YW5kIG9uLiAgSW1wbGVtZW50cyBhIHJhZGl1cyBmcm9tIHRoZSBjZW50ZXIgb2YgXG4gKiB0aGUgb2JqZWN0IGl0J3MgYXR0YWNoZWQgdG8sIGluIG1ldGVyc1xuICovXG5cbmltcG9ydCB7IEVudGl0eSwgQ29tcG9uZW50IH0gZnJvbSAnYWZyYW1lJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuaW1wb3J0ICcuL3Byb3hpbWl0eS1ldmVudHMuanMnXG5cbmludGVyZmFjZSBBT2JqZWN0M0QgZXh0ZW5kcyBUSFJFRS5PYmplY3QzRCB7XG4gICAgZWw6IEVudGl0eVxufVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3ZpZGVvLWNvbnRyb2wtcGFkJywge1xuICAgIG1lZGlhVmlkZW86IHt9IGFzIENvbXBvbmVudCxcbiAgICBcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgdGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIlwiIH0sICAvLyBpZiBub3RoaW5nIHBhc3NlZCwganVzdCBjcmVhdGUgc29tZSBub2lzZVxuICAgICAgICByYWRpdXM6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDEgfVxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEudGFyZ2V0Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCBtdXN0IGhhdmUgJ3RhcmdldCcgc2V0XCIpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHdhaXQgdW50aWwgdGhlIHNjZW5lIGxvYWRzIHRvIGZpbmlzaC4gIFdlIHdhbnQgdG8gbWFrZSBzdXJlIGV2ZXJ5dGhpbmdcbiAgICAgICAgLy8gaXMgaW5pdGlhbGl6ZWRcbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIHJvb3QgJiYgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsICgpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemUoKVxuICAgICAgICB9KTtcbiAgICB9LFxuICAgIFxuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IHYgPSB0aGlzLmVsLnNjZW5lRWw/Lm9iamVjdDNELmdldE9iamVjdEJ5TmFtZSh0aGlzLmRhdGEudGFyZ2V0KSBhcyBBT2JqZWN0M0RcbiAgICAgICAgaWYgKHYgPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCB0YXJnZXQgJ1wiICsgdGhpcy5kYXRhLnRhcmdldCArIFwiJyBkb2VzIG5vdCBleGlzdFwiKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSB8fCB2LmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSApIHtcbiAgICAgICAgICAgIGlmICh2LmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICBsZXQgZm4gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBWaWRlb1BhZCh2KVxuICAgICAgICAgICAgICAgICAgICB2LmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsIGZuKVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdi5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIGZuKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwVmlkZW9QYWQodilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIHRhcmdldCAnXCIgKyB0aGlzLmRhdGEudGFyZ2V0ICsgXCInIGlzIG5vdCBhIHZpZGVvIGVsZW1lbnRcIilcbiAgICAgICAgfVxuXG4gICAgfSxcblxuICAgIHNldHVwVmlkZW9QYWQ6IGZ1bmN0aW9uICh2aWRlbzogQU9iamVjdDNEKSB7XG4gICAgICAgIHRoaXMubWVkaWFWaWRlbyA9IHZpZGVvLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXVxuICAgICAgICBpZiAodGhpcy5tZWRpYVZpZGVvID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgdGFyZ2V0ICdcIiArIHRoaXMuZGF0YS50YXJnZXQgKyBcIicgaXMgbm90IGEgdmlkZW8gZWxlbWVudFwiKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gLy9AdHMtaWdub3JlXG4gICAgICAgIC8vIGlmICghdGhpcy5tZWRpYVZpZGVvLnZpZGVvLnBhdXNlZCkge1xuICAgICAgICAvLyAgICAgLy9AdHMtaWdub3JlXG4gICAgICAgIC8vICAgICB0aGlzLm1lZGlhVmlkZW8udG9nZ2xlUGxheWluZygpXG4gICAgICAgIC8vIH1cblxuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiB0aGlzLmRhdGEucmFkaXVzLCBZb2Zmc2V0OiAxLjYgfSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMuZW50ZXJSZWdpb24oKSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHlsZWF2ZScsICgpID0+IHRoaXMubGVhdmVSZWdpb24oKSlcbiAgICB9LFxuXG4gICAgZW50ZXJSZWdpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMubWVkaWFWaWRlby5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBsZWF2ZVJlZ2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXRoaXMubWVkaWFWaWRlby5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgfVxuICAgIH0sXG59KVxuIiwiY29uc3QgdGVtcFZlY3RvcjMgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuY29uc3QgdGVtcFF1YXRlcm5pb24gPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdFdvcmxkUG9zaXRpb24oc3JjLCB0YXJnZXQpIHtcbiAgc3JjLnVwZGF0ZU1hdHJpY2VzKCk7XG4gIHRhcmdldC5zZXRGcm9tTWF0cml4UG9zaXRpb24oc3JjLm1hdHJpeFdvcmxkKTtcbiAgcmV0dXJuIHRhcmdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExhc3RXb3JsZFF1YXRlcm5pb24oc3JjLCB0YXJnZXQpIHtcbiAgc3JjLnVwZGF0ZU1hdHJpY2VzKCk7XG4gIHNyYy5tYXRyaXhXb3JsZC5kZWNvbXBvc2UodGVtcFZlY3RvcjMsIHRhcmdldCwgdGVtcFZlY3RvcjMpO1xuICByZXR1cm4gdGFyZ2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdFdvcmxkU2NhbGUoc3JjLCB0YXJnZXQpIHtcbiAgc3JjLnVwZGF0ZU1hdHJpY2VzKCk7XG4gIHNyYy5tYXRyaXhXb3JsZC5kZWNvbXBvc2UodGVtcFZlY3RvcjMsIHRlbXBRdWF0ZXJuaW9uLCB0YXJnZXQpO1xuICByZXR1cm4gdGFyZ2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGlzcG9zZU1hdGVyaWFsKG10cmwpIHtcbiAgaWYgKG10cmwubWFwKSBtdHJsLm1hcC5kaXNwb3NlKCk7XG4gIGlmIChtdHJsLmxpZ2h0TWFwKSBtdHJsLmxpZ2h0TWFwLmRpc3Bvc2UoKTtcbiAgaWYgKG10cmwuYnVtcE1hcCkgbXRybC5idW1wTWFwLmRpc3Bvc2UoKTtcbiAgaWYgKG10cmwubm9ybWFsTWFwKSBtdHJsLm5vcm1hbE1hcC5kaXNwb3NlKCk7XG4gIGlmIChtdHJsLnNwZWN1bGFyTWFwKSBtdHJsLnNwZWN1bGFyTWFwLmRpc3Bvc2UoKTtcbiAgaWYgKG10cmwuZW52TWFwKSBtdHJsLmVudk1hcC5kaXNwb3NlKCk7XG4gIG10cmwuZGlzcG9zZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGlzcG9zZU5vZGUobm9kZSkge1xuICBpZiAoIShub2RlIGluc3RhbmNlb2YgVEhSRUUuTWVzaCkpIHJldHVybjtcblxuICBpZiAobm9kZS5nZW9tZXRyeSkge1xuICAgIG5vZGUuZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICB9XG5cbiAgaWYgKG5vZGUubWF0ZXJpYWwpIHtcbiAgICBsZXQgbWF0ZXJpYWxBcnJheTtcbiAgICBpZiAobm9kZS5tYXRlcmlhbCBpbnN0YW5jZW9mIFRIUkVFLk1lc2hGYWNlTWF0ZXJpYWwgfHwgbm9kZS5tYXRlcmlhbCBpbnN0YW5jZW9mIFRIUkVFLk11bHRpTWF0ZXJpYWwpIHtcbiAgICAgIG1hdGVyaWFsQXJyYXkgPSBub2RlLm1hdGVyaWFsLm1hdGVyaWFscztcbiAgICB9IGVsc2UgaWYgKG5vZGUubWF0ZXJpYWwgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgbWF0ZXJpYWxBcnJheSA9IG5vZGUubWF0ZXJpYWw7XG4gICAgfVxuICAgIGlmIChtYXRlcmlhbEFycmF5KSB7XG4gICAgICBtYXRlcmlhbEFycmF5LmZvckVhY2goZGlzcG9zZU1hdGVyaWFsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlzcG9zZU1hdGVyaWFsKG5vZGUubWF0ZXJpYWwpO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBJREVOVElUWSA9IG5ldyBUSFJFRS5NYXRyaXg0KCkuaWRlbnRpdHkoKTtcbmV4cG9ydCBmdW5jdGlvbiBzZXRNYXRyaXhXb3JsZChvYmplY3QzRCwgbSkge1xuICBpZiAoIW9iamVjdDNELm1hdHJpeElzTW9kaWZpZWQpIHtcbiAgICBvYmplY3QzRC5hcHBseU1hdHJpeChJREVOVElUWSk7IC8vIGhhY2sgYXJvdW5kIG91ciBtYXRyaXggb3B0aW1pemF0aW9uc1xuICB9XG4gIG9iamVjdDNELm1hdHJpeFdvcmxkLmNvcHkobSk7XG4gIGlmIChvYmplY3QzRC5wYXJlbnQpIHtcbiAgICBvYmplY3QzRC5wYXJlbnQudXBkYXRlTWF0cmljZXMoKTtcbiAgICBvYmplY3QzRC5tYXRyaXggPSBvYmplY3QzRC5tYXRyaXguZ2V0SW52ZXJzZShvYmplY3QzRC5wYXJlbnQubWF0cml4V29ybGQpLm11bHRpcGx5KG9iamVjdDNELm1hdHJpeFdvcmxkKTtcbiAgfSBlbHNlIHtcbiAgICBvYmplY3QzRC5tYXRyaXguY29weShvYmplY3QzRC5tYXRyaXhXb3JsZCk7XG4gIH1cbiAgb2JqZWN0M0QubWF0cml4LmRlY29tcG9zZShvYmplY3QzRC5wb3NpdGlvbiwgb2JqZWN0M0QucXVhdGVybmlvbiwgb2JqZWN0M0Quc2NhbGUpO1xuICBvYmplY3QzRC5jaGlsZHJlbk5lZWRNYXRyaXhXb3JsZFVwZGF0ZSA9IHRydWU7XG59XG5cbi8vIE1vZGlmaWVkIHZlcnNpb24gb2YgRG9uIE1jQ3VyZHkncyBBbmltYXRpb25VdGlscy5jbG9uZVxuLy8gaHR0cHM6Ly9naXRodWIuY29tL21yZG9vYi90aHJlZS5qcy9wdWxsLzE0NDk0XG5cbmZ1bmN0aW9uIHBhcmFsbGVsVHJhdmVyc2UoYSwgYiwgY2FsbGJhY2spIHtcbiAgY2FsbGJhY2soYSwgYik7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgcGFyYWxsZWxUcmF2ZXJzZShhLmNoaWxkcmVuW2ldLCBiLmNoaWxkcmVuW2ldLCBjYWxsYmFjayk7XG4gIH1cbn1cblxuLy8gU3VwcG9ydHMgdGhlIGZvbGxvd2luZyBQcm9wZXJ0eUJpbmRpbmcgcGF0aCBmb3JtYXRzOlxuLy8gdXVpZC5wcm9wZXJ0eU5hbWVcbi8vIHV1aWQucHJvcGVydHlOYW1lW3Byb3BlcnR5SW5kZXhdXG4vLyB1dWlkLm9iamVjdE5hbWVbb2JqZWN0SW5kZXhdLnByb3BlcnR5TmFtZVtwcm9wZXJ0eUluZGV4XVxuLy8gRG9lcyBub3Qgc3VwcG9ydCBwcm9wZXJ0eSBiaW5kaW5ncyB0aGF0IHVzZSBvYmplY3QzRCBuYW1lcyBvciBwYXJlbnQgbm9kZXNcbmZ1bmN0aW9uIGNsb25lS2V5ZnJhbWVUcmFjayhzb3VyY2VLZXlmcmFtZVRyYWNrLCBjbG9uZVVVSURMb29rdXApIHtcbiAgY29uc3QgeyBub2RlTmFtZTogdXVpZCwgb2JqZWN0TmFtZSwgb2JqZWN0SW5kZXgsIHByb3BlcnR5TmFtZSwgcHJvcGVydHlJbmRleCB9ID0gVEhSRUUuUHJvcGVydHlCaW5kaW5nLnBhcnNlVHJhY2tOYW1lKFxuICAgIHNvdXJjZUtleWZyYW1lVHJhY2submFtZVxuICApO1xuXG4gIGxldCBwYXRoID0gXCJcIjtcblxuICBpZiAodXVpZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgY2xvbmVkVVVJRCA9IGNsb25lVVVJRExvb2t1cC5nZXQodXVpZCk7XG5cbiAgICBpZiAoY2xvbmVkVVVJRCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zb2xlLndhcm4oYENvdWxkIG5vdCBmaW5kIEtleWZyYW1lVHJhY2sgdGFyZ2V0IHdpdGggdXVpZDogXCIke3V1aWR9XCJgKTtcbiAgICB9XG5cbiAgICBwYXRoICs9IGNsb25lZFVVSUQ7XG4gIH1cblxuICBpZiAob2JqZWN0TmFtZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcGF0aCArPSBcIi5cIiArIG9iamVjdE5hbWU7XG4gIH1cblxuICBpZiAob2JqZWN0SW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHBhdGggKz0gXCJbXCIgKyBvYmplY3RJbmRleCArIFwiXVwiO1xuICB9XG5cbiAgaWYgKHByb3BlcnR5TmFtZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcGF0aCArPSBcIi5cIiArIHByb3BlcnR5TmFtZTtcbiAgfVxuXG4gIGlmIChwcm9wZXJ0eUluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICBwYXRoICs9IFwiW1wiICsgcHJvcGVydHlJbmRleCArIFwiXVwiO1xuICB9XG5cbiAgY29uc3QgY2xvbmVkS2V5ZnJhbWVUcmFjayA9IHNvdXJjZUtleWZyYW1lVHJhY2suY2xvbmUoKTtcbiAgY2xvbmVkS2V5ZnJhbWVUcmFjay5uYW1lID0gcGF0aDtcblxuICByZXR1cm4gY2xvbmVkS2V5ZnJhbWVUcmFjaztcbn1cblxuZnVuY3Rpb24gY2xvbmVBbmltYXRpb25DbGlwKHNvdXJjZUFuaW1hdGlvbkNsaXAsIGNsb25lVVVJRExvb2t1cCkge1xuICBjb25zdCBjbG9uZWRUcmFja3MgPSBzb3VyY2VBbmltYXRpb25DbGlwLnRyYWNrcy5tYXAoa2V5ZnJhbWVUcmFjayA9PlxuICAgIGNsb25lS2V5ZnJhbWVUcmFjayhrZXlmcmFtZVRyYWNrLCBjbG9uZVVVSURMb29rdXApXG4gICk7XG4gIHJldHVybiBuZXcgVEhSRUUuQW5pbWF0aW9uQ2xpcChzb3VyY2VBbmltYXRpb25DbGlwLm5hbWUsIHNvdXJjZUFuaW1hdGlvbkNsaXAuZHVyYXRpb24sIGNsb25lZFRyYWNrcyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZU9iamVjdDNEKHNvdXJjZSwgcHJlc2VydmVVVUlEcykge1xuICBjb25zdCBjbG9uZUxvb2t1cCA9IG5ldyBNYXAoKTtcbiAgY29uc3QgY2xvbmVVVUlETG9va3VwID0gbmV3IE1hcCgpO1xuXG4gIGNvbnN0IGNsb25lID0gc291cmNlLmNsb25lKCk7XG5cbiAgcGFyYWxsZWxUcmF2ZXJzZShzb3VyY2UsIGNsb25lLCAoc291cmNlTm9kZSwgY2xvbmVkTm9kZSkgPT4ge1xuICAgIGNsb25lTG9va3VwLnNldChzb3VyY2VOb2RlLCBjbG9uZWROb2RlKTtcbiAgfSk7XG5cbiAgc291cmNlLnRyYXZlcnNlKHNvdXJjZU5vZGUgPT4ge1xuICAgIGNvbnN0IGNsb25lZE5vZGUgPSBjbG9uZUxvb2t1cC5nZXQoc291cmNlTm9kZSk7XG5cbiAgICBpZiAocHJlc2VydmVVVUlEcykge1xuICAgICAgY2xvbmVkTm9kZS51dWlkID0gc291cmNlTm9kZS51dWlkO1xuICAgIH1cblxuICAgIGNsb25lVVVJRExvb2t1cC5zZXQoc291cmNlTm9kZS51dWlkLCBjbG9uZWROb2RlLnV1aWQpO1xuICB9KTtcblxuICBzb3VyY2UudHJhdmVyc2Uoc291cmNlTm9kZSA9PiB7XG4gICAgY29uc3QgY2xvbmVkTm9kZSA9IGNsb25lTG9va3VwLmdldChzb3VyY2VOb2RlKTtcblxuICAgIGlmICghY2xvbmVkTm9kZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChzb3VyY2VOb2RlLmFuaW1hdGlvbnMpIHtcbiAgICAgIGNsb25lZE5vZGUuYW5pbWF0aW9ucyA9IHNvdXJjZU5vZGUuYW5pbWF0aW9ucy5tYXAoYW5pbWF0aW9uQ2xpcCA9PlxuICAgICAgICBjbG9uZUFuaW1hdGlvbkNsaXAoYW5pbWF0aW9uQ2xpcCwgY2xvbmVVVUlETG9va3VwKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoc291cmNlTm9kZS5pc01lc2ggJiYgc291cmNlTm9kZS5nZW9tZXRyeS5ib3VuZHNUcmVlKSB7XG4gICAgICBjbG9uZWROb2RlLmdlb21ldHJ5LmJvdW5kc1RyZWUgPSBzb3VyY2VOb2RlLmdlb21ldHJ5LmJvdW5kc1RyZWU7XG4gICAgfVxuXG4gICAgaWYgKChjbG9uZWROb2RlLmlzRGlyZWN0aW9uYWxMaWdodCB8fCBjbG9uZWROb2RlLmlzU3BvdExpZ2h0KSAmJiBzb3VyY2VOb2RlLnRhcmdldCkge1xuICAgICAgY2xvbmVkTm9kZS50YXJnZXQgPSBjbG9uZUxvb2t1cC5nZXQoc291cmNlTm9kZS50YXJnZXQpO1xuICAgIH1cblxuICAgIGlmICghc291cmNlTm9kZS5pc1NraW5uZWRNZXNoKSByZXR1cm47XG5cbiAgICBjb25zdCBzb3VyY2VCb25lcyA9IHNvdXJjZU5vZGUuc2tlbGV0b24uYm9uZXM7XG5cbiAgICBjbG9uZWROb2RlLnNrZWxldG9uID0gc291cmNlTm9kZS5za2VsZXRvbi5jbG9uZSgpO1xuXG4gICAgY2xvbmVkTm9kZS5za2VsZXRvbi5ib25lcyA9IHNvdXJjZUJvbmVzLm1hcChzb3VyY2VCb25lID0+IHtcbiAgICAgIGlmICghY2xvbmVMb29rdXAuaGFzKHNvdXJjZUJvbmUpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJlcXVpcmVkIGJvbmVzIGFyZSBub3QgZGVzY2VuZGFudHMgb2YgdGhlIGdpdmVuIG9iamVjdC5cIik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjbG9uZUxvb2t1cC5nZXQoc291cmNlQm9uZSk7XG4gICAgfSk7XG5cbiAgICBjbG9uZWROb2RlLmJpbmQoY2xvbmVkTm9kZS5za2VsZXRvbiwgc291cmNlTm9kZS5iaW5kTWF0cml4KTtcbiAgfSk7XG5cbiAgcmV0dXJuIGNsb25lO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZE5vZGUocm9vdCwgcHJlZCkge1xuICBsZXQgbm9kZXMgPSBbcm9vdF07XG4gIHdoaWxlIChub2Rlcy5sZW5ndGgpIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXMuc2hpZnQoKTtcbiAgICBpZiAocHJlZChub2RlKSkgcmV0dXJuIG5vZGU7XG4gICAgaWYgKG5vZGUuY2hpbGRyZW4pIG5vZGVzID0gbm9kZXMuY29uY2F0KG5vZGUuY2hpbGRyZW4pO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgaW50ZXJwb2xhdGVBZmZpbmUgPSAoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IG1hdDQgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBlbmQgPSB7XG4gICAgcG9zaXRpb246IG5ldyBUSFJFRS5WZWN0b3IzKCksXG4gICAgcXVhdGVybmlvbjogbmV3IFRIUkVFLlF1YXRlcm5pb24oKSxcbiAgICBzY2FsZTogbmV3IFRIUkVFLlZlY3RvcjMoKVxuICB9O1xuICBjb25zdCBzdGFydCA9IHtcbiAgICBwb3NpdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoKSxcbiAgICBxdWF0ZXJuaW9uOiBuZXcgVEhSRUUuUXVhdGVybmlvbigpLFxuICAgIHNjYWxlOiBuZXcgVEhSRUUuVmVjdG9yMygpXG4gIH07XG4gIGNvbnN0IGludGVycG9sYXRlZCA9IHtcbiAgICBwb3NpdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoKSxcbiAgICBxdWF0ZXJuaW9uOiBuZXcgVEhSRUUuUXVhdGVybmlvbigpLFxuICAgIHNjYWxlOiBuZXcgVEhSRUUuVmVjdG9yMygpXG4gIH07XG4gIHJldHVybiBmdW5jdGlvbihzdGFydE1hdDQsIGVuZE1hdDQsIHByb2dyZXNzLCBvdXRNYXQ0KSB7XG4gICAgc3RhcnQucXVhdGVybmlvbi5zZXRGcm9tUm90YXRpb25NYXRyaXgobWF0NC5leHRyYWN0Um90YXRpb24oc3RhcnRNYXQ0KSk7XG4gICAgZW5kLnF1YXRlcm5pb24uc2V0RnJvbVJvdGF0aW9uTWF0cml4KG1hdDQuZXh0cmFjdFJvdGF0aW9uKGVuZE1hdDQpKTtcbiAgICBUSFJFRS5RdWF0ZXJuaW9uLnNsZXJwKHN0YXJ0LnF1YXRlcm5pb24sIGVuZC5xdWF0ZXJuaW9uLCBpbnRlcnBvbGF0ZWQucXVhdGVybmlvbiwgcHJvZ3Jlc3MpO1xuICAgIGludGVycG9sYXRlZC5wb3NpdGlvbi5sZXJwVmVjdG9ycyhcbiAgICAgIHN0YXJ0LnBvc2l0aW9uLnNldEZyb21NYXRyaXhDb2x1bW4oc3RhcnRNYXQ0LCAzKSxcbiAgICAgIGVuZC5wb3NpdGlvbi5zZXRGcm9tTWF0cml4Q29sdW1uKGVuZE1hdDQsIDMpLFxuICAgICAgcHJvZ3Jlc3NcbiAgICApO1xuICAgIGludGVycG9sYXRlZC5zY2FsZS5sZXJwVmVjdG9ycyhcbiAgICAgIHN0YXJ0LnNjYWxlLnNldEZyb21NYXRyaXhTY2FsZShzdGFydE1hdDQpLFxuICAgICAgZW5kLnNjYWxlLnNldEZyb21NYXRyaXhTY2FsZShlbmRNYXQ0KSxcbiAgICAgIHByb2dyZXNzXG4gICAgKTtcbiAgICByZXR1cm4gb3V0TWF0NC5jb21wb3NlKFxuICAgICAgaW50ZXJwb2xhdGVkLnBvc2l0aW9uLFxuICAgICAgaW50ZXJwb2xhdGVkLnF1YXRlcm5pb24sXG4gICAgICBpbnRlcnBvbGF0ZWQuc2NhbGVcbiAgICApO1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGNvbnN0IHNxdWFyZURpc3RhbmNlQmV0d2VlbiA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgcG9zQSA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IHBvc0IgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICByZXR1cm4gZnVuY3Rpb24ob2JqQSwgb2JqQikge1xuICAgIG9iakEudXBkYXRlTWF0cmljZXMoKTtcbiAgICBvYmpCLnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgcG9zQS5zZXRGcm9tTWF0cml4Q29sdW1uKG9iakEubWF0cml4V29ybGQsIDMpO1xuICAgIHBvc0Iuc2V0RnJvbU1hdHJpeENvbHVtbihvYmpCLm1hdHJpeFdvcmxkLCAzKTtcbiAgICByZXR1cm4gcG9zQS5kaXN0YW5jZVRvU3F1YXJlZChwb3NCKTtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0FsbW9zdFVuaWZvcm1WZWN0b3IzKHYsIGVwc2lsb25IYWxmID0gMC4wMDUpIHtcbiAgcmV0dXJuIE1hdGguYWJzKHYueCAtIHYueSkgPCBlcHNpbG9uSGFsZiAmJiBNYXRoLmFicyh2LnggLSB2LnopIDwgZXBzaWxvbkhhbGY7XG59XG5leHBvcnQgZnVuY3Rpb24gYWxtb3N0RXF1YWwoYSwgYiwgZXBzaWxvbiA9IDAuMDEpIHtcbiAgcmV0dXJuIE1hdGguYWJzKGEgLSBiKSA8IGVwc2lsb247XG59XG5cbmV4cG9ydCBjb25zdCBhZmZpeFRvV29ybGRVcCA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgaW5Sb3RhdGlvbk1hdDQgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBpbkZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCBvdXRGb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgY29uc3Qgb3V0U2lkZSA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IHdvcmxkVXAgPSBuZXcgVEhSRUUuVmVjdG9yMygpOyAvLyBDb3VsZCBiZSBjYWxsZWQgXCJvdXRVcFwiXG4gIGNvbnN0IHYgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCBpbk1hdDRDb3B5ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgcmV0dXJuIGZ1bmN0aW9uIGFmZml4VG9Xb3JsZFVwKGluTWF0NCwgb3V0TWF0NCkge1xuICAgIGluUm90YXRpb25NYXQ0LmlkZW50aXR5KCkuZXh0cmFjdFJvdGF0aW9uKGluTWF0NENvcHkuY29weShpbk1hdDQpKTtcbiAgICBpbkZvcndhcmQuc2V0RnJvbU1hdHJpeENvbHVtbihpblJvdGF0aW9uTWF0NCwgMikubXVsdGlwbHlTY2FsYXIoLTEpO1xuICAgIG91dEZvcndhcmRcbiAgICAgIC5jb3B5KGluRm9yd2FyZClcbiAgICAgIC5zdWIodi5jb3B5KGluRm9yd2FyZCkucHJvamVjdE9uVmVjdG9yKHdvcmxkVXAuc2V0KDAsIDEsIDApKSlcbiAgICAgIC5ub3JtYWxpemUoKTtcbiAgICBvdXRTaWRlLmNyb3NzVmVjdG9ycyhvdXRGb3J3YXJkLCB3b3JsZFVwKTtcbiAgICBvdXRNYXQ0Lm1ha2VCYXNpcyhvdXRTaWRlLCB3b3JsZFVwLCBvdXRGb3J3YXJkLm11bHRpcGx5U2NhbGFyKC0xKSk7XG4gICAgb3V0TWF0NC5zY2FsZSh2LnNldEZyb21NYXRyaXhTY2FsZShpbk1hdDRDb3B5KSk7XG4gICAgb3V0TWF0NC5zZXRQb3NpdGlvbih2LnNldEZyb21NYXRyaXhDb2x1bW4oaW5NYXQ0Q29weSwgMykpO1xuICAgIHJldHVybiBvdXRNYXQ0O1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGNvbnN0IGNhbGN1bGF0ZUNhbWVyYVRyYW5zZm9ybUZvcldheXBvaW50ID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCB1cEFmZml4ZWRDYW1lcmFUcmFuc2Zvcm0gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCB1cEFmZml4ZWRXYXlwb2ludFRyYW5zZm9ybSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGRldGFjaEZyb21Xb3JsZFVwID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgcmV0dXJuIGZ1bmN0aW9uIGNhbGN1bGF0ZUNhbWVyYVRyYW5zZm9ybUZvcldheXBvaW50KGNhbWVyYVRyYW5zZm9ybSwgd2F5cG9pbnRUcmFuc2Zvcm0sIG91dE1hdDQpIHtcbiAgICBhZmZpeFRvV29ybGRVcChjYW1lcmFUcmFuc2Zvcm0sIHVwQWZmaXhlZENhbWVyYVRyYW5zZm9ybSk7XG4gICAgZGV0YWNoRnJvbVdvcmxkVXAuZ2V0SW52ZXJzZSh1cEFmZml4ZWRDYW1lcmFUcmFuc2Zvcm0pLm11bHRpcGx5KGNhbWVyYVRyYW5zZm9ybSk7XG4gICAgYWZmaXhUb1dvcmxkVXAod2F5cG9pbnRUcmFuc2Zvcm0sIHVwQWZmaXhlZFdheXBvaW50VHJhbnNmb3JtKTtcbiAgICBvdXRNYXQ0LmNvcHkodXBBZmZpeGVkV2F5cG9pbnRUcmFuc2Zvcm0pLm11bHRpcGx5KGRldGFjaEZyb21Xb3JsZFVwKTtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBjb25zdCBjYWxjdWxhdGVWaWV3aW5nRGlzdGFuY2UgPSAoZnVuY3Rpb24oKSB7XG4gIHJldHVybiBmdW5jdGlvbiBjYWxjdWxhdGVWaWV3aW5nRGlzdGFuY2UoZm92LCBhc3BlY3QsIGJveCwgY2VudGVyLCB2ck1vZGUpIHtcbiAgICBjb25zdCBoYWxmWUV4dGVudHMgPSBNYXRoLm1heChNYXRoLmFicyhib3gubWF4LnkgLSBjZW50ZXIueSksIE1hdGguYWJzKGNlbnRlci55IC0gYm94Lm1pbi55KSk7XG4gICAgY29uc3QgaGFsZlhFeHRlbnRzID0gTWF0aC5tYXgoTWF0aC5hYnMoYm94Lm1heC54IC0gY2VudGVyLngpLCBNYXRoLmFicyhjZW50ZXIueCAtIGJveC5taW4ueCkpO1xuICAgIGNvbnN0IGhhbGZWZXJ0Rk9WID0gVEhSRUUuTWF0aC5kZWdUb1JhZChmb3YgLyAyKTtcbiAgICBjb25zdCBoYWxmSG9yRk9WID0gTWF0aC5hdGFuKE1hdGgudGFuKGhhbGZWZXJ0Rk9WKSAqIGFzcGVjdCkgKiAodnJNb2RlID8gMC41IDogMSk7XG4gICAgY29uc3QgbWFyZ2luID0gMS4wNTtcbiAgICBjb25zdCBsZW5ndGgxID0gTWF0aC5hYnMoKGhhbGZZRXh0ZW50cyAqIG1hcmdpbikgLyBNYXRoLnRhbihoYWxmVmVydEZPVikpO1xuICAgIGNvbnN0IGxlbmd0aDIgPSBNYXRoLmFicygoaGFsZlhFeHRlbnRzICogbWFyZ2luKSAvIE1hdGgudGFuKGhhbGZIb3JGT1YpKTtcbiAgICBjb25zdCBsZW5ndGgzID0gTWF0aC5hYnMoYm94Lm1heC56IC0gY2VudGVyLnopICsgTWF0aC5tYXgobGVuZ3RoMSwgbGVuZ3RoMik7XG4gICAgY29uc3QgbGVuZ3RoID0gdnJNb2RlID8gTWF0aC5tYXgoMC4yNSwgbGVuZ3RoMykgOiBsZW5ndGgzO1xuICAgIHJldHVybiBsZW5ndGggfHwgMS4yNTtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBjb25zdCByb3RhdGVJblBsYWNlQXJvdW5kV29ybGRVcCA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgaW5NYXQ0Q29weSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IHN0YXJ0Um90YXRpb24gPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICBjb25zdCBlbmRSb3RhdGlvbiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IHYgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICByZXR1cm4gZnVuY3Rpb24gcm90YXRlSW5QbGFjZUFyb3VuZFdvcmxkVXAoaW5NYXQ0LCB0aGV0YSwgb3V0TWF0NCkge1xuICAgIGluTWF0NENvcHkuY29weShpbk1hdDQpO1xuICAgIHJldHVybiBvdXRNYXQ0XG4gICAgICAuY29weShlbmRSb3RhdGlvbi5tYWtlUm90YXRpb25ZKHRoZXRhKS5tdWx0aXBseShzdGFydFJvdGF0aW9uLmV4dHJhY3RSb3RhdGlvbihpbk1hdDRDb3B5KSkpXG4gICAgICAuc2NhbGUodi5zZXRGcm9tTWF0cml4U2NhbGUoaW5NYXQ0Q29weSkpXG4gICAgICAuc2V0UG9zaXRpb24odi5zZXRGcm9tTWF0cml4UG9zaXRpb24oaW5NYXQ0Q29weSkpO1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGNvbnN0IGNoaWxkTWF0Y2ggPSAoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IGludmVyc2VQYXJlbnRXb3JsZCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGNoaWxkUmVsYXRpdmVUb1BhcmVudCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGNoaWxkSW52ZXJzZSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IG5ld1BhcmVudE1hdHJpeCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIC8vIHRyYW5zZm9ybSB0aGUgcGFyZW50IHN1Y2ggdGhhdCBpdHMgY2hpbGQgbWF0Y2hlcyB0aGUgdGFyZ2V0XG4gIHJldHVybiBmdW5jdGlvbiBjaGlsZE1hdGNoKHBhcmVudCwgY2hpbGQsIHRhcmdldCkge1xuICAgIHBhcmVudC51cGRhdGVNYXRyaWNlcygpO1xuICAgIGludmVyc2VQYXJlbnRXb3JsZC5nZXRJbnZlcnNlKHBhcmVudC5tYXRyaXhXb3JsZCk7XG4gICAgY2hpbGQudXBkYXRlTWF0cmljZXMoKTtcbiAgICBjaGlsZFJlbGF0aXZlVG9QYXJlbnQubXVsdGlwbHlNYXRyaWNlcyhpbnZlcnNlUGFyZW50V29ybGQsIGNoaWxkLm1hdHJpeFdvcmxkKTtcbiAgICBjaGlsZEludmVyc2UuZ2V0SW52ZXJzZShjaGlsZFJlbGF0aXZlVG9QYXJlbnQpO1xuICAgIG5ld1BhcmVudE1hdHJpeC5tdWx0aXBseU1hdHJpY2VzKHRhcmdldCwgY2hpbGRJbnZlcnNlKTtcbiAgICBzZXRNYXRyaXhXb3JsZChwYXJlbnQsIG5ld1BhcmVudE1hdHJpeCk7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gdHJhdmVyc2VBbmltYXRpb25UYXJnZXRzKHJvb3RPYmplY3QsIGFuaW1hdGlvbnMsIGNhbGxiYWNrKSB7XG4gIGlmIChhbmltYXRpb25zICYmIGFuaW1hdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIGZvciAoY29uc3QgYW5pbWF0aW9uIG9mIGFuaW1hdGlvbnMpIHtcbiAgICAgIGZvciAoY29uc3QgdHJhY2sgb2YgYW5pbWF0aW9uLnRyYWNrcykge1xuICAgICAgICBjb25zdCB7IG5vZGVOYW1lIH0gPSBUSFJFRS5Qcm9wZXJ0eUJpbmRpbmcucGFyc2VUcmFja05hbWUodHJhY2submFtZSk7XG4gICAgICAgIGxldCBhbmltYXRlZE5vZGUgPSByb290T2JqZWN0LmdldE9iamVjdEJ5UHJvcGVydHkoXCJ1dWlkXCIsIG5vZGVOYW1lKTtcblxuICAgICAgICBpZiAoIWFuaW1hdGVkTm9kZSkge1xuICAgICAgICAgIGFuaW1hdGVkTm9kZSA9IHJvb3RPYmplY3QuZ2V0T2JqZWN0QnlOYW1lKG5vZGVOYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhbmltYXRlZE5vZGUpIHtcbiAgICAgICAgICBjYWxsYmFjayhhbmltYXRlZE5vZGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQge1xuICAgIHNldE1hdHJpeFdvcmxkXG59IGZyb20gXCIuLi91dGlscy90aHJlZS11dGlsc1wiO1xuaW1wb3J0IHtcbiAgICBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50XG59IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuXG5jb25zdCBjYWxjdWxhdGVQbGFuZU1hdHJpeCA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgcGxhbmVNYXRyaXggPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICAgIGNvbnN0IHBsYW5lVXAgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgIGNvbnN0IHBsYW5lRm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgY29uc3QgcGxhbmVSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgY29uc3QgcGxhbmVQb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgY29uc3QgY2FtUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIGNhbGN1bGF0ZVBsYW5lTWF0cml4KGNhbWVyYSwgYnV0dG9uKSB7XG4gICAgICAgIGNhbWVyYS51cGRhdGVNYXRyaWNlcygpO1xuICAgICAgICBjYW1Qb3NpdGlvbi5zZXRGcm9tTWF0cml4UG9zaXRpb24oY2FtZXJhLm1hdHJpeFdvcmxkKTtcbiAgICAgICAgYnV0dG9uLnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgICAgIHBsYW5lUG9zaXRpb24uc2V0RnJvbU1hdHJpeFBvc2l0aW9uKGJ1dHRvbi5tYXRyaXhXb3JsZCk7XG4gICAgICAgIHBsYW5lRm9yd2FyZC5zdWJWZWN0b3JzKHBsYW5lUG9zaXRpb24sIGNhbVBvc2l0aW9uKTtcbiAgICAgICAgcGxhbmVGb3J3YXJkLnkgPSAwO1xuICAgICAgICBwbGFuZUZvcndhcmQubm9ybWFsaXplKCk7XG4gICAgICAgIHBsYW5lVXAuc2V0KDAsIDEsIDApO1xuICAgICAgICBwbGFuZVJpZ2h0LmNyb3NzVmVjdG9ycyhwbGFuZUZvcndhcmQsIHBsYW5lVXApO1xuICAgICAgICBwbGFuZU1hdHJpeC5tYWtlQmFzaXMocGxhbmVSaWdodCwgcGxhbmVVcCwgcGxhbmVGb3J3YXJkLm11bHRpcGx5U2NhbGFyKC0xKSk7XG4gICAgICAgIHBsYW5lTWF0cml4LmVsZW1lbnRzWzEyXSA9IHBsYW5lUG9zaXRpb24ueDtcbiAgICAgICAgcGxhbmVNYXRyaXguZWxlbWVudHNbMTNdID0gcGxhbmVQb3NpdGlvbi55O1xuICAgICAgICBwbGFuZU1hdHJpeC5lbGVtZW50c1sxNF0gPSBwbGFuZVBvc2l0aW9uLno7XG4gICAgICAgIHJldHVybiBwbGFuZU1hdHJpeDtcbiAgICB9O1xufSkoKTtcblxuY29uc3QgcGxhbmVGb3JMZWZ0Q3Vyc29yID0gbmV3IFRIUkVFLk1lc2goXG4gICAgbmV3IFRIUkVFLlBsYW5lQnVmZmVyR2VvbWV0cnkoMTAwMDAwLCAxMDAwMDAsIDIsIDIpLFxuICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgIHdpcmVmcmFtZTogZmFsc2UsXG4gICAgICAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBvcGFjaXR5OiAwLjNcbiAgICB9KVxuKTtcbmNvbnN0IHBsYW5lRm9yUmlnaHRDdXJzb3IgPSBuZXcgVEhSRUUuTWVzaChcbiAgICBuZXcgVEhSRUUuUGxhbmVCdWZmZXJHZW9tZXRyeSgxMDAwMDAsIDEwMDAwMCwgMiwgMiksXG4gICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgICAgd2lyZWZyYW1lOiBmYWxzZSxcbiAgICAgICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIG9wYWNpdHk6IDAuM1xuICAgIH0pXG4pO1xuXG5leHBvcnQgY2xhc3MgSGFuZGxlSW50ZXJhY3Rpb24ge1xuICAgIGNvbnN0cnVjdG9yKGVsKSB7XG4gICAgICAgIHRoaXMuZWwgPSBlbDtcblxuICAgICAgICB0aGlzLmlzRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5kcmFnSW50ZXJhY3RvciA9IG51bGw7XG4gICAgICAgIHRoaXMucGxhbmVSb3RhdGlvbiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgICAgIHRoaXMucGxhbmVVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMucGxhbmVSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMuaW50ZXJzZWN0aW9ucyA9IFtdO1xuICAgICAgICB0aGlzLmluaXRpYWxJbnRlcnNlY3Rpb25Qb2ludCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMuaW50ZXJzZWN0aW9uUG9pbnQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICB0aGlzLmRlbHRhID0ge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDBcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vYmplY3RNYXRyaXggPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICAgICAgICB0aGlzLmRyYWdWZWN0b3IgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuXG4gICAgICAgIHRoaXMuY2FtUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICB0aGlzLm9iamVjdFBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5vYmplY3RUb0NhbSA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgfVxuXG4gICAgZ2V0SW50ZXJhY3RvcnMob2JqKSB7XG4gICAgICAgIGxldCB0b2dnbGluZyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zW1wiaHVicy1zeXN0ZW1zXCJdLmN1cnNvclRvZ2dsaW5nU3lzdGVtO1xuXG4gICAgICAgIC8vIG1vcmUgb3IgbGVzcyBjb3BpZWQgZnJvbSBcImhvdmVyYWJsZS12aXN1YWxzLmpzXCIgaW4gaHVic1xuICAgICAgICBjb25zdCBpbnRlcmFjdGlvbiA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLmludGVyYWN0aW9uO1xuICAgICAgICB2YXIgcGFzc3RocnVJbnRlcmFjdG9yID0gW11cblxuICAgICAgICBsZXQgaW50ZXJhY3Rvck9uZSwgaW50ZXJhY3RvclR3bztcbiAgICAgICAgaWYgKCFpbnRlcmFjdGlvbi5yZWFkeSkgcmV0dXJuOyAvL0RPTUNvbnRlbnRSZWFkeSB3b3JrYXJvdW5kXG5cbiAgICAgICAgLy8gVE9ETzogIG1heSB3YW50IHRvIGxvb2sgdG8gc2VlIHRoZSBob3ZlcmVkIG9iamVjdHMgYXJlIGNoaWxkcmVuIG9mIG9iaj8/XG4gICAgICAgIGxldCBob3ZlckVsID0gb2JqXG4gICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICBpbnRlcmFjdG9yT25lID0ge1xuICAgICAgICAgICAgICAgIGN1cnNvcjogaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0SGFuZC5lbnRpdHkub2JqZWN0M0QsXG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogaW50ZXJhY3Rpb24ubGVmdEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICF0b2dnbGluZy5sZWZ0VG9nZ2xlZE9mZlxuICAgICAgICApIHtcbiAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yOiBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRSZW1vdGUuZW50aXR5Lm9iamVjdDNELFxuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6IGludGVyYWN0aW9uLmxlZnRDdXJzb3JDb250cm9sbGVyRWwuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuICAgICAgICBpZiAoaW50ZXJhY3Rvck9uZSkge1xuICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2goaW50ZXJhY3Rvck9uZSlcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgIXRvZ2dsaW5nLnJpZ2h0VG9nZ2xlZE9mZlxuICAgICAgICApIHtcbiAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yOiBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0UmVtb3RlLmVudGl0eS5vYmplY3QzRCxcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiBpbnRlcmFjdGlvbi5yaWdodEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0ge1xuICAgICAgICAgICAgICAgIGN1cnNvcjogaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodEhhbmQuZW50aXR5Lm9iamVjdDNELFxuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6IGludGVyYWN0aW9uLnJpZ2h0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnRlcmFjdG9yVHdvKSB7XG4gICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaChpbnRlcmFjdG9yVHdvKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwYXNzdGhydUludGVyYWN0b3JcbiAgICB9XG5cbiAgICBnZXRSZWZzKCkge1xuICAgICAgICBpZiAoIXRoaXMuZGlkR2V0T2JqZWN0UmVmZXJlbmNlcykge1xuICAgICAgICAgICAgdGhpcy5kaWRHZXRPYmplY3RSZWZlcmVuY2VzID0gdHJ1ZTtcbiAgICAgICAgICAgIGNvbnN0IGludGVyYWN0aW9uID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMuaW50ZXJhY3Rpb247XG5cbiAgICAgICAgICAgIC8vIHRoaXMubGVmdEV2ZW50ZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxlZnQtY3Vyc29yXCIpLm9iamVjdDNEO1xuICAgICAgICAgICAgLy8gdGhpcy5sZWZ0Q3Vyc29yQ29udHJvbGxlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGVmdC1jdXJzb3ItY29udHJvbGxlclwiKTtcbiAgICAgICAgICAgIC8vIHRoaXMubGVmdFJheWNhc3RlciA9IHRoaXMubGVmdEN1cnNvckNvbnRyb2xsZXIuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdLnJheWNhc3RlcjtcbiAgICAgICAgICAgIC8vIHRoaXMucmlnaHRDdXJzb3JDb250cm9sbGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyaWdodC1jdXJzb3ItY29udHJvbGxlclwiKTtcbiAgICAgICAgICAgIC8vIHRoaXMucmlnaHRSYXljYXN0ZXIgPSB0aGlzLnJpZ2h0Q3Vyc29yQ29udHJvbGxlci5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl0ucmF5Y2FzdGVyO1xuICAgICAgICAgICAgdGhpcy5sZWZ0RXZlbnRlciA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB0aGlzLmxlZnRDdXJzb3JDb250cm9sbGVyID0gaW50ZXJhY3Rpb24ubGVmdEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl07XG4gICAgICAgICAgICB0aGlzLmxlZnRSYXljYXN0ZXIgPSB0aGlzLmxlZnRDdXJzb3JDb250cm9sbGVyLnJheWNhc3RlcjtcbiAgICAgICAgICAgIHRoaXMucmlnaHRDdXJzb3JDb250cm9sbGVyID0gaW50ZXJhY3Rpb24ucmlnaHRDdXJzb3JDb250cm9sbGVyRWwuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdO1xuICAgICAgICAgICAgdGhpcy5yaWdodFJheWNhc3RlciA9IHRoaXMucmlnaHRDdXJzb3JDb250cm9sbGVyLnJheWNhc3RlcjtcblxuICAgICAgICAgICAgdGhpcy52aWV3aW5nQ2FtZXJhID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ2aWV3aW5nLWNhbWVyYVwiKS5vYmplY3QzRE1hcC5jYW1lcmE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRJbnRlcnNlY3Rpb24oaW50ZXJhY3RvciwgdGFyZ2V0cykge1xuICAgICAgICB0aGlzLmdldFJlZnMoKTtcbiAgICAgICAgbGV0IG9iamVjdDNEID0gaW50ZXJhY3Rvci5jdXJzb3JcbiAgICAgICAgbGV0IHJheWNhc3RlciA9IG9iamVjdDNEID09PSB0aGlzLmxlZnRFdmVudGVyID8gdGhpcy5sZWZ0UmF5Y2FzdGVyIDogdGhpcy5yaWdodFJheWNhc3RlcjtcblxuICAgICAgICBsZXQgaW50ZXJzZWN0cyA9IHJheWNhc3Rlci5pbnRlcnNlY3RPYmplY3RzKHRhcmdldHMsIHRydWUpO1xuICAgICAgICBpZiAoaW50ZXJzZWN0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gaW50ZXJzZWN0c1swXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBzdGFydERyYWcoZSkge1xuICAgICAgICBpZiAodGhpcy5pc0RyYWdnaW5nKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5nZXRSZWZzKCk7XG5cbiAgICAgICAgdGhpcy5wbGFuZSA9IGUub2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgPyBwbGFuZUZvckxlZnRDdXJzb3IgOiBwbGFuZUZvclJpZ2h0Q3Vyc29yO1xuXG4gICAgICAgIHNldE1hdHJpeFdvcmxkKHRoaXMucGxhbmUsIGNhbGN1bGF0ZVBsYW5lTWF0cml4KHRoaXMudmlld2luZ0NhbWVyYSwgdGhpcy5lbC5vYmplY3QzRCkpO1xuICAgICAgICB0aGlzLnBsYW5lUm90YXRpb24uZXh0cmFjdFJvdGF0aW9uKHRoaXMucGxhbmUubWF0cml4V29ybGQpO1xuICAgICAgICB0aGlzLnBsYW5lVXAuc2V0KDAsIDEsIDApLmFwcGx5TWF0cml4NCh0aGlzLnBsYW5lUm90YXRpb24pO1xuICAgICAgICB0aGlzLnBsYW5lUmlnaHQuc2V0KDEsIDAsIDApLmFwcGx5TWF0cml4NCh0aGlzLnBsYW5lUm90YXRpb24pO1xuICAgICAgICB0aGlzLnJheWNhc3RlciA9IGUub2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgPyB0aGlzLmxlZnRSYXljYXN0ZXIgOiB0aGlzLnJpZ2h0UmF5Y2FzdGVyO1xuICAgICAgICBjb25zdCBpbnRlcnNlY3Rpb24gPSB0aGlzLnJheWNhc3RPblBsYW5lKCk7XG5cbiAgICAgICAgLy8gc2hvdWxkbid0IGhhcHBlbiwgYnV0IHdlIHNob3VsZCBjaGVja1xuICAgICAgICBpZiAoIWludGVyc2VjdGlvbikgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHRoaXMuaXNEcmFnZ2luZyA9IHRydWU7XG4gICAgICAgIHRoaXMuZHJhZ0ludGVyYWN0b3IgPSB7XG4gICAgICAgICAgICBjdXJzb3I6IGUub2JqZWN0M0QsXG4gICAgICAgICAgICBjb250cm9sbGVyOiBlLm9iamVjdDNEID09PSB0aGlzLmxlZnRFdmVudGVyID8gdGhpcy5sZWZ0Q3Vyc29yQ29udHJvbGxlciA6IHRoaXMucmlnaHRDdXJzb3JDb250cm9sbGVyLFxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5pbml0aWFsSW50ZXJzZWN0aW9uUG9pbnQuY29weShpbnRlcnNlY3Rpb24ucG9pbnQpO1xuICAgICAgICB0aGlzLmluaXRpYWxEaXN0YW5jZVRvT2JqZWN0ID0gdGhpcy5vYmplY3RUb0NhbVxuICAgICAgICAgICAgLnN1YlZlY3RvcnMoXG4gICAgICAgICAgICAgICAgdGhpcy5jYW1Qb3NpdGlvbi5zZXRGcm9tTWF0cml4UG9zaXRpb24odGhpcy52aWV3aW5nQ2FtZXJhLm1hdHJpeFdvcmxkKSxcbiAgICAgICAgICAgICAgICB0aGlzLm9iamVjdFBvc2l0aW9uLnNldEZyb21NYXRyaXhQb3NpdGlvbih0aGlzLmVsLm9iamVjdDNELm1hdHJpeFdvcmxkKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmxlbmd0aCgpO1xuICAgICAgICB0aGlzLmludGVyc2VjdGlvblJpZ2h0ID0gMDtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25VcCA9IDA7XG4gICAgICAgIHRoaXMuZGVsdGEgPSB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgZW5kRHJhZyhlKSB7XG4gICAgICAgIGlmICghdGhpcy5pc0RyYWdnaW5nKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgKGUub2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgJiYgdGhpcy5yYXljYXN0ZXIgPT09IHRoaXMubGVmdFJheWNhc3RlcikgfHxcbiAgICAgICAgICAgIChlLm9iamVjdDNEICE9PSB0aGlzLmxlZnRFdmVudGVyICYmIHRoaXMucmF5Y2FzdGVyID09PSB0aGlzLnJpZ2h0UmF5Y2FzdGVyKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuaXNEcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5kcmFnSW50ZXJhY3RvciA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByYXljYXN0T25QbGFuZSgpIHtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25zLmxlbmd0aCA9IDA7XG4gICAgICAgIGNvbnN0IGZhciA9IHRoaXMucmF5Y2FzdGVyLmZhcjtcbiAgICAgICAgdGhpcy5yYXljYXN0ZXIuZmFyID0gMTAwMDtcbiAgICAgICAgdGhpcy5wbGFuZS5yYXljYXN0KHRoaXMucmF5Y2FzdGVyLCB0aGlzLmludGVyc2VjdGlvbnMpO1xuICAgICAgICB0aGlzLnJheWNhc3Rlci5mYXIgPSBmYXI7XG4gICAgICAgIHJldHVybiB0aGlzLmludGVyc2VjdGlvbnNbMF07XG4gICAgfVxuXG4gICAgZHJhZygpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlzRHJhZ2dpbmcpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBpbnRlcnNlY3Rpb24gPSB0aGlzLnJheWNhc3RPblBsYW5lKCk7XG4gICAgICAgIGlmICghaW50ZXJzZWN0aW9uKSByZXR1cm4gbnVsbDtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25Qb2ludC5jb3B5KGludGVyc2VjdGlvbi5wb2ludCk7XG4gICAgICAgIHRoaXMuZHJhZ1ZlY3Rvci5zdWJWZWN0b3JzKHRoaXMuaW50ZXJzZWN0aW9uUG9pbnQsIHRoaXMuaW5pdGlhbEludGVyc2VjdGlvblBvaW50KTtcbiAgICAgICAgdGhpcy5kZWx0YS54ID0gdGhpcy5kcmFnVmVjdG9yLmRvdCh0aGlzLnBsYW5lVXApO1xuICAgICAgICB0aGlzLmRlbHRhLnkgPSB0aGlzLmRyYWdWZWN0b3IuZG90KHRoaXMucGxhbmVSaWdodCk7XG4gICAgICAgIHJldHVybiB0aGlzLmRyYWdWZWN0b3I7XG4gICAgfVxufVxuXG5cbi8vIHRlbXBsYXRlXG5cbmV4cG9ydCBmdW5jdGlvbiBpbnRlcmFjdGl2ZUNvbXBvbmVudFRlbXBsYXRlKGNvbXBvbmVudE5hbWUpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBzdGFydEluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgICAgICAgICAgdGhpcy5yZWxhdGl2ZVNpemUgPSAxO1xuICAgICAgICAgICAgdGhpcy5pc0RyYWdnYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc0ludGVyYWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmlzTmV0d29ya2VkID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZmluaXNoSW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmludGVybmFsSW5pdCgpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW1vdmVUZW1wbGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcbiAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gbnVsbFxuICAgIFxuICAgICAgICAgICAgaWYgKHRoaXMuaXNOZXR3b3JrZWQgJiYgdGhpcy5uZXRFbnRpdHkucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5uZXRFbnRpdHkpXG4gICAgICAgICAgICB9ICAgIFxuICAgICAgICB9LFxuXG4gICAgICAgIGludGVybmFsSW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gZWFjaCB0aW1lIHdlIGxvYWQgYSBjb21wb25lbnQgd2Ugd2lsbCBwb3NzaWJseSBjcmVhdGVcbiAgICAgICAgICAgIC8vIGEgbmV3IG5ldHdvcmtlZCBjb21wb25lbnQuICBUaGlzIGlzIGZpbmUsIHNpbmNlIHRoZSBuZXR3b3JrZWQgSWQgXG4gICAgICAgICAgICAvLyBpcyBiYXNlZCBvbiB0aGUgbmFtZSBwYXNzZWQgYXMgYSBwYXJhbWV0ZXIsIG9yIGFzc2lnbmVkIHRvIHRoZVxuICAgICAgICAgICAgLy8gY29tcG9uZW50IGluIFNwb2tlLiAgSXQgZG9lcyBtZWFuIHRoYXQgaWYgd2UgaGF2ZVxuICAgICAgICAgICAgLy8gbXVsdGlwbGUgb2JqZWN0cyBpbiB0aGUgc2NlbmUgd2hpY2ggaGF2ZSB0aGUgc2FtZSBuYW1lLCB0aGV5IHdpbGxcbiAgICAgICAgICAgIC8vIGJlIGluIHN5bmMuICBJdCBhbHNvIG1lYW5zIHRoYXQgaWYgeW91IHdhbnQgdG8gZHJvcCBhIGNvbXBvbmVudCBvblxuICAgICAgICAgICAgLy8gdGhlIHNjZW5lIHZpYSBhIC5nbGIsIGl0IG11c3QgaGF2ZSBhIHZhbGlkIG5hbWUgcGFyYW1ldGVyIGluc2lkZSBpdC5cbiAgICAgICAgICAgIC8vIEEgLmdsYiBpbiBzcG9rZSB3aWxsIGZhbGwgYmFjayB0byB0aGUgc3Bva2UgbmFtZSBpZiB5b3UgdXNlIG9uZSB3aXRob3V0XG4gICAgICAgICAgICAvLyBhIG5hbWUgaW5zaWRlIGl0LlxuICAgICAgICAgICAgbGV0IGxvYWRlciA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBsZXRzIGxvYWQgc29tZXRoaW5nIGV4dGVybmFsbHksIGxpa2UgYSBqc29uIGNvbmZpZyBmaWxlXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkRGF0YSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZ2V0IHRoZSBwYXJlbnQgbmV0d29ya2VkIGVudGl0eSwgd2hlbiBpdCdzIGZpbmlzaGVkIGluaXRpYWxpemluZy4gIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2hlbiBjcmVhdGluZyB0aGlzIGFzIHBhcnQgb2YgYSBHTFRGIGxvYWQsIHRoZSBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHBhcmVudCBhIGZldyBzdGVwcyB1cCB3aWxsIGJlIG5ldHdvcmtlZC4gXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IG51bGxcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmluZCBjYWxsYmFja3NcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhID0gdGhpcy5zZXRTaGFyZWREYXRhLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHNldCB1cCB0aGUgbG9jYWwgY29udGVudCBhbmQgaG9vayBpdCB0byB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplRGF0YSgpXG4gICAgICAgICAgICAgICAgICAgIC8vIGxldHMgZmlndXJlIG91dCB0aGUgc2NhbGUsIGJ5IHNjYWxpbmcgdG8gZmlsbCB0aGUgYSAxeDFtIHNxdWFyZSwgdGhhdCBoYXMgYWxzb1xuICAgICAgICAgICAgICAgICAgICAvLyBwb3RlbnRpYWxseSBiZWVuIHNjYWxlZCBieSB0aGUgcGFyZW50cyBwYXJlbnQgbm9kZS4gSWYgd2Ugc2NhbGUgdGhlIGVudGl0eSBpbiBzcG9rZSxcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBpcyB3aGVyZSB0aGUgc2NhbGUgaXMgc2V0LiAgSWYgd2UgZHJvcCBhIG5vZGUgaW4gYW5kIHNjYWxlIGl0LCB0aGUgc2NhbGUgaXMgYWxzb1xuICAgICAgICAgICAgICAgICAgICAvLyBzZXQgdGhlcmUuXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogbmVlZCB0byBmaW5kIGVudmlyb25tZW50LXNjZW5lLCBnbyBkb3duIHR3byBsZXZlbHMgdG8gdGhlIGdyb3VwIGFib3ZlIFxuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgbm9kZXMgaW4gdGhlIHNjZW5lLiAgVGhlbiBhY2N1bXVsYXRlIHRoZSBzY2FsZXMgdXAgZnJvbSB0aGlzIG5vZGUgdG9cbiAgICAgICAgICAgICAgICAgICAgLy8gdGhhdCBub2RlLiAgVGhpcyB3aWxsIGFjY291bnQgZm9yIGdyb3VwcywgYW5kIG5lc3RpbmcuXG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHdpZHRoID0gMSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1pbWFnZVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYXR0YWNoZWQgdG8gYW4gaW1hZ2UgaW4gc3Bva2UsIHNvIHRoZSBpbWFnZSBtZXNoIGlzIHNpemUgMSBhbmQgaXMgc2NhbGVkIGRpcmVjdGx5XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlSS54ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2FsZUkueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUFJPQkFCTFkgRE9OVCBORUVEIFRPIFNVUFBPUlQgVEhJUyBBTllNT1JFXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpdCdzIGVtYmVkZGVkIGluIGEgc2ltcGxlIGdsdGYgbW9kZWw7ICBvdGhlciBtb2RlbHMgbWF5IG5vdCB3b3JrXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhc3N1bWUgaXQncyBhdCB0aGUgdG9wIGxldmVsIG1lc2gsIGFuZCB0aGF0IHRoZSBtb2RlbCBpdHNlbGYgaXMgc2NhbGVkXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBib3ggPSBtZXNoLmdlb21ldHJ5LmJvdW5kaW5nQm94O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gKGJveC5tYXgueCAtIGJveC5taW4ueCkgKiBtZXNoLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSAoYm94Lm1heC55IC0gYm94Lm1pbi55KSAqIG1lc2guc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaFNjYWxlID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gbWVzaFNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBtZXNoU2NhbGUueVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgdGhlIHJvb3QgZ2x0ZiBzY2FsZS5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYXJlbnQyID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5vYmplY3QzRFxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggKj0gcGFyZW50Mi5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgKj0gcGFyZW50Mi5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggKiB0aGlzLnJlbGF0aXZlU2l6ZSwgaGVpZ2h0ICogdGhpcy5yZWxhdGl2ZVNpemUpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogc2NhbGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogc2NhbGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgejogc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlcmUgbWlnaHQgYmUgc29tZSBlbGVtZW50cyBhbHJlYWR5LCBsaWtlIHRoZSBjdWJlIHdlIGNyZWF0ZWQgaW4gYmxlbmRlclxuICAgICAgICAgICAgICAgICAgICAvLyBhbmQgYXR0YWNoZWQgdGhpcyBjb21wb25lbnQgdG8sIHNvIGhpZGUgdGhlbSBpZiB0aGV5IGFyZSB0aGVyZS5cbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGMudmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gYWRkIGluIG91ciBjb250YWluZXJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5hcHBlbmRDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcblxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiAgd2UgYXJlIGdvaW5nIHRvIGhhdmUgdG8gbWFrZSBzdXJlIHRoaXMgd29ya3MgaWYgXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZSBjb21wb25lbnQgaXMgT04gYW4gaW50ZXJhY3RhYmxlIChsaWtlIGFuIGltYWdlKVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24gPSBuZXcgSGFuZGxlSW50ZXJhY3Rpb24odGhpcy5lbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG1ha2UgdGhlIG9iamVjdCBjbGlja2FibGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgb2JqZWN0IFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGlja2VkID0gdGhpcy5jbGlja2VkLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5pc0RyYWdnYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGFyZW4ndCBnb2luZyB0byByZWFsbHkgZGVhbCB3aXRoIHRoaXMgdGlsbCB3ZSBoYXZlIGEgdXNlIGNhc2UsIGJ1dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGNhbiBzZXQgaXQgdXAgZm9yIG5vd1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0hvbGRhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBob2xkYWJsZUJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYWdTdGFydCA9IHRoaXMuZHJhZ1N0YXJ0LmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYWdFbmQgPSB0aGlzLmRyYWdFbmQuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi1kb3duJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYWdTdGFydChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tdXAnLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhZ0VuZChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy90aGlzLnJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIoKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlSID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBubyBpbnRlcmFjdGl2aXR5LCBwbGVhc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJpcy1yZW1vdGUtaG92ZXItdGFyZ2V0XCIpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIFNIT1VMRCB3b3JrIGJ1dCBtYWtlIHN1cmUgaXQgd29ya3MgaWYgdGhlIGVsIHdlIGFyZSBvblxuICAgICAgICAgICAgICAgICAgICAvLyBpcyBuZXR3b3JrZWQsIHN1Y2ggYXMgd2hlbiBhdHRhY2hlZCB0byBhbiBpbWFnZVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmhhc0F0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIGZpbmRzIGFuIGV4aXN0aW5nIGNvcHkgb2YgdGhlIE5ldHdvcmtlZCBFbnRpdHkgKGlmIHdlIGFyZSBub3QgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmaXJzdCBjbGllbnQgaW4gdGhlIHJvb20gaXQgd2lsbCBleGlzdCBpbiBvdGhlciBjbGllbnRzIGFuZCBiZSBjcmVhdGVkIGJ5IE5BRilcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIGNyZWF0ZSBhbiBlbnRpdHkgaWYgd2UgYXJlIGZpcnN0LlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IGZ1bmN0aW9uIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwZXJzaXN0ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV0SWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgYmUgcGFydCBvZiBhIE5ldHdvcmtlZCBHTFRGIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvciBwaW5uZWQgYW5kIGxvYWRlZCB3aGVuIHdlIGVudGVyIHRoZSByb29tLiAgVXNlIHRoZSBuZXR3b3JrZWQgcGFyZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgcGx1cyBhIGRpc2FtYmlndWF0aW5nIGJpdCBvZiB0ZXh0IHRvIGNyZWF0ZSBhIHVuaXF1ZSBJZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSBOQUYudXRpbHMuZ2V0TmV0d29ya0lkKG5ldHdvcmtlZEVsKSArIFwiLVwiICsgY29tcG9uZW50TmFtZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBuZWVkIHRvIGNyZWF0ZSBhbiBlbnRpdHksIHVzZSB0aGUgc2FtZSBwZXJzaXN0ZW5jZSBhcyBvdXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29yayBlbnRpdHkgKHRydWUgaWYgcGlubmVkLCBmYWxzZSBpZiBub3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQgPSBlbnRpdHkuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5wZXJzaXN0ZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgb25seSBoYXBwZW5zIGlmIHRoaXMgY29tcG9uZW50IGlzIG9uIGEgc2NlbmUgZmlsZSwgc2luY2UgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsZW1lbnRzIG9uIHRoZSBzY2VuZSBhcmVuJ3QgbmV0d29ya2VkLiAgU28gbGV0J3MgYXNzdW1lIGVhY2ggZW50aXR5IGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzY2VuZSB3aWxsIGhhdmUgYSB1bmlxdWUgbmFtZS4gIEFkZGluZyBhIGJpdCBvZiB0ZXh0IHNvIHdlIGNhbiBmaW5kIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluIHRoZSBET00gd2hlbiBkZWJ1Z2dpbmcuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gdGhpcy5mdWxsTmFtZS5yZXBsYWNlQWxsKFwiX1wiLCBcIi1cIikgKyBcIi1cIiArIGNvbXBvbmVudE5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgdGhlIG5ldHdvcmtlZCBlbnRpdHkgd2UgY3JlYXRlIGZvciB0aGlzIGNvbXBvbmVudCBhbHJlYWR5IGV4aXN0cy4gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBjcmVhdGUgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAtIE5PVEU6IGl0IGlzIGNyZWF0ZWQgb24gdGhlIHNjZW5lLCBub3QgYXMgYSBjaGlsZCBvZiB0aGlzIGVudGl0eSwgYmVjYXVzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgTkFGIGNyZWF0ZXMgcmVtb3RlIGVudGl0aWVzIGluIHRoZSBzY2VuZS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChOQUYuZW50aXRpZXMuaGFzRW50aXR5KG5ldElkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBOQUYuZW50aXRpZXMuZ2V0RW50aXR5KG5ldElkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1ldGhvZCB0byByZXRyaWV2ZSB0aGUgZGF0YSBvbiB0aGlzIGVudGl0eVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgXCJuZXR3b3JrZWRcIiBjb21wb25lbnQgc2hvdWxkIGhhdmUgcGVyc2lzdGVudD10cnVlLCB0aGUgdGVtcGxhdGUgYW5kIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgc2V0LCBvd25lciBzZXQgdG8gXCJzY2VuZVwiIChzbyB0aGF0IGl0IGRvZXNuJ3QgdXBkYXRlIHRoZSByZXN0IG9mXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSB3b3JsZCB3aXRoIGl0J3MgaW5pdGlhbCBkYXRhLCBhbmQgc2hvdWxkIE5PVCBzZXQgY3JlYXRvciAodGhlIHN5c3RlbSB3aWxsIGRvIHRoYXQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5zZXRBdHRyaWJ1dGUoJ25ldHdvcmtlZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlOiBcIiNcIiArIGNvbXBvbmVudE5hbWUgKyBcIi1kYXRhLW1lZGlhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50OiBwZXJzaXN0ZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3duZXI6IFwic2NlbmVcIiwgLy8gc28gdGhhdCBvdXIgaW5pdGlhbCB2YWx1ZSBkb2Vzbid0IG92ZXJ3cml0ZSBvdGhlcnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtJZDogbmV0SWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hcHBlbmRDaGlsZChlbnRpdHkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNhdmUgYSBwb2ludGVyIHRvIHRoZSBuZXR3b3JrZWQgZW50aXR5IGFuZCB0aGVuIHdhaXQgZm9yIGl0IHRvIGJlIGZ1bGx5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW5pdGlhbGl6ZWQgYmVmb3JlIGdldHRpbmcgYSBwb2ludGVyIHRvIHRoZSBhY3R1YWwgbmV0d29ya2VkIGNvbXBvbmVudCBpbiBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5uZXRFbnRpdHkpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlU3luYyA9IG5ldHdvcmtlZEVsLmNvbXBvbmVudHNbY29tcG9uZW50TmFtZSArIFwiLWRhdGFcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5lbCkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkobmV0d29ya2VkRWwpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IHRoaXMuc2V0dXBOZXR3b3JrZWQuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIG1ldGhvZCBoYW5kbGVzIHRoZSBkaWZmZXJlbnQgc3RhcnR1cCBjYXNlczpcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lLCBOQUYgd2lsbCBiZSBjb25uZWN0ZWQgYW5kIHdlIGNhbiBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgaW1tZWRpYXRlbHkgaW5pdGlhbGl6ZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiBpcyBpbiB0aGUgcm9vbSBzY2VuZSBvciBwaW5uZWQsIGl0IHdpbGwgbGlrZWx5IGJlIGNyZWF0ZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgYmVmb3JlIE5BRiBpcyBzdGFydGVkIGFuZCBjb25uZWN0ZWQsIHNvIHdlIHdhaXQgZm9yIGFuIGV2ZW50IHRoYXQgaXNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgZmlyZWQgd2hlbiBIdWJzIGhhcyBzdGFydGVkIE5BRlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5jb25uZWN0aW9uICYmIE5BRi5jb25uZWN0aW9uLmlzQ29ubmVjdGVkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdkaWRDb25uZWN0VG9OZXR3b3JrZWRTY2VuZScsIHRoaXMuc2V0dXBOZXR3b3JrZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gaWYgYXR0YWNoZWQgdG8gYSBub2RlIHdpdGggYSBtZWRpYS1sb2FkZXIgY29tcG9uZW50LCB0aGlzIG1lYW5zIHdlIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50XG4gICAgICAgICAgICAvLyB0byBhIG1lZGlhIG9iamVjdCBpbiBTcG9rZS4gIFdlIHNob3VsZCB3YWl0IHRpbGwgdGhlIG9iamVjdCBpcyBmdWxseSBsb2FkZWQuICBcbiAgICAgICAgICAgIC8vIE90aGVyd2lzZSwgaXQgd2FzIGF0dGFjaGVkIHRvIHNvbWV0aGluZyBpbnNpZGUgYSBHTFRGIChwcm9iYWJseSBpbiBibGVuZGVyKVxuICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICBvbmNlOiB0cnVlXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyU2hhcmVkQUZSQU1FQ29tcG9uZW50cyhjb21wb25lbnROYW1lKSB7XG4gICAgLy9cbiAgICAvLyBDb21wb25lbnQgZm9yIG91ciBuZXR3b3JrZWQgc3RhdGUuICBUaGlzIGNvbXBvbmVudCBkb2VzIG5vdGhpbmcgZXhjZXB0IGFsbCB1cyB0byBcbiAgICAvLyBjaGFuZ2UgdGhlIHN0YXRlIHdoZW4gYXBwcm9wcmlhdGUuIFdlIGNvdWxkIHNldCB0aGlzIHVwIHRvIHNpZ25hbCB0aGUgY29tcG9uZW50IGFib3ZlIHdoZW5cbiAgICAvLyBzb21ldGhpbmcgaGFzIGNoYW5nZWQsIGluc3RlYWQgb2YgaGF2aW5nIHRoZSBjb21wb25lbnQgYWJvdmUgcG9sbCBlYWNoIGZyYW1lLlxuICAgIC8vXG5cbiAgICBBRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoY29tcG9uZW50TmFtZSArICctZGF0YScsIHtcbiAgICAgICAgc2NoZW1hOiB7XG4gICAgICAgICAgICBzYW1wbGVkYXRhOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiBcInt9XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB0aGlzLmVsLmdldFNoYXJlZERhdGEoKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXMuZGF0YU9iamVjdCkpXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoY29tcG9uZW50TmFtZSArIFwiLWRhdGFcIiwgXCJzYW1wbGVkYXRhXCIsIHRoaXMuc2hhcmVkRGF0YSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkNvdWxkbid0IGVuY29kZSBpbml0aWFsIGRhdGEgb2JqZWN0OiBcIiwgZSwgdGhpcy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IFwie31cIlxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICB1cGRhdGUoKSB7XG4gICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSAhKHRoaXMuc2hhcmVkRGF0YSA9PT0gdGhpcy5kYXRhLnNhbXBsZWRhdGEpO1xuICAgICAgICAgICAgaWYgKHRoaXMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHRoaXMuZGF0YS5zYW1wbGVkYXRhKSlcblxuICAgICAgICAgICAgICAgICAgICAvLyBkbyB0aGVzZSBhZnRlciB0aGUgSlNPTiBwYXJzZSB0byBtYWtlIHN1cmUgaXQgaGFzIHN1Y2NlZWRlZFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB0aGlzLmRhdGEuc2FtcGxlZGF0YTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VkID0gdHJ1ZVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNvdWxkbid0IHBhcnNlIEpTT04gcmVjZWl2ZWQgaW4gZGF0YS1zeW5jOiBcIiwgZSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIGl0IGlzIGxpa2VseSB0aGF0IGFwcGx5UGVyc2lzdGVudFN5bmMgb25seSBuZWVkcyB0byBiZSBjYWxsZWQgZm9yIHBlcnNpc3RlbnRcbiAgICAgICAgLy8gbmV0d29ya2VkIGVudGl0aWVzLCBzbyB3ZSBfcHJvYmFibHlfIGRvbid0IG5lZWQgdG8gZG8gdGhpcy4gIEJ1dCBpZiB0aGVyZSBpcyBub1xuICAgICAgICAvLyBwZXJzaXN0ZW50IGRhdGEgc2F2ZWQgZnJvbSB0aGUgbmV0d29yayBmb3IgdGhpcyBlbnRpdHksIHRoaXMgY29tbWFuZCBkb2VzIG5vdGhpbmcuXG4gICAgICAgIHBsYXkoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgIC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgcmVhbGx5IG5lZWRlZCwgYnV0IGNhbid0IGh1cnRcbiAgICAgICAgICAgICAgICBpZiAoQVBQLnV0aWxzKSB7IC8vIHRlbXBvcmFyeSB0aWxsIHdlIHNoaXAgbmV3IGNsaWVudFxuICAgICAgICAgICAgICAgICAgICBBUFAudXRpbHMuYXBwbHlQZXJzaXN0ZW50U3luYyh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEubmV0d29ya0lkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgICAgICAgICBpZiAoIU5BRi51dGlscy5pc01pbmUodGhpcy5lbCkgJiYgIU5BRi51dGlscy50YWtlT3duZXJzaGlwKHRoaXMuZWwpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGFTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gZGF0YVN0cmluZ1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAgICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShjb21wb25lbnROYW1lICsgXCItZGF0YVwiLCBcInNhbXBsZWRhdGFcIiwgZGF0YVN0cmluZyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY2FuJ3Qgc3RyaW5naWZ5IHRoZSBvYmplY3QgcGFzc2VkIHRvIGRhdGEtc3luY1wiKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgb3VyIHRlbXBsYXRlIGZvciBvdXIgbmV0d29ya2VkIG9iamVjdCB0byB0aGUgYS1mcmFtZSBhc3NldHMgb2JqZWN0LFxuICAgIC8vIGFuZCBhIHNjaGVtYSB0byB0aGUgTkFGLnNjaGVtYXMuICBCb3RoIG11c3QgYmUgdGhlcmUgdG8gaGF2ZSBjdXN0b20gY29tcG9uZW50cyB3b3JrXG5cbiAgICBjb25zdCBhc3NldHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiYS1hc3NldHNcIik7XG5cbiAgICBhc3NldHMuaW5zZXJ0QWRqYWNlbnRIVE1MKFxuICAgICAgICAnYmVmb3JlZW5kJyxcbiAgICAgICAgYFxuPHRlbXBsYXRlIGlkPVwiYCArIGNvbXBvbmVudE5hbWUgKyBgLWRhdGEtbWVkaWFcIj5cbiAgPGEtZW50aXR5XG4gICAgYCArIGNvbXBvbmVudE5hbWUgKyBgLWRhdGFcbiAgPjwvYS1lbnRpdHk+XG48L3RlbXBsYXRlPlxuYFxuICAgIClcblxuICAgIE5BRi5zY2hlbWFzLmFkZCh7XG4gICAgICAgIHRlbXBsYXRlOiBcIiNcIiArIGNvbXBvbmVudE5hbWUgKyBcIi1kYXRhLW1lZGlhXCIsXG4gICAgICAgIGNvbXBvbmVudHM6IFt7XG4gICAgICAgICAgICBjb21wb25lbnQ6IGNvbXBvbmVudE5hbWUgKyBcIi1kYXRhXCIsXG4gICAgICAgICAgICBwcm9wZXJ0eTogXCJzYW1wbGVkYXRhXCJcbiAgICAgICAgfV0sXG4gICAgICAgIG5vbkF1dGhvcml6ZWRDb21wb25lbnRzOiBbe1xuICAgICAgICAgICAgY29tcG9uZW50OiBjb21wb25lbnROYW1lICsgXCItZGF0YVwiLFxuICAgICAgICAgICAgcHJvcGVydHk6IFwic2FtcGxlZGF0YVwiXG4gICAgICAgIH1dLFxuXG4gICAgfSk7XG59IiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGNyZWF0ZSBhIHRocmVlanMgb2JqZWN0ICh0d28gY3ViZXMsIG9uZSBvbiB0aGUgc3VyZmFjZSBvZiB0aGUgb3RoZXIpIHRoYXQgY2FuIGJlIGludGVyYWN0ZWQgXG4gKiB3aXRoIGFuZCBoYXMgc29tZSBuZXR3b3JrZWQgYXR0cmlidXRlcy5cbiAqXG4gKi9cbmltcG9ydCB7XG4gICAgaW50ZXJhY3RpdmVDb21wb25lbnRUZW1wbGF0ZSxcbiAgICByZWdpc3RlclNoYXJlZEFGUkFNRUNvbXBvbmVudHNcbn0gZnJvbSBcIi4uL3V0aWxzL2ludGVyYWN0aW9uXCI7XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIHNpbXBsZSBjb252ZW5pZW5jZSBmdW5jdGlvbnMgXG5mdW5jdGlvbiByYW5kb21Db2xvcigpIHtcbiAgICByZXR1cm4gbmV3IFRIUkVFLkNvbG9yKE1hdGgucmFuZG9tKCksIE1hdGgucmFuZG9tKCksIE1hdGgucmFuZG9tKCkpO1xufVxuXG5mdW5jdGlvbiBhbG1vc3RFcXVhbFZlYzModSwgdiwgZXBzaWxvbikge1xuICAgIHJldHVybiBNYXRoLmFicyh1LnggLSB2LngpIDwgZXBzaWxvbiAmJiBNYXRoLmFicyh1LnkgLSB2LnkpIDwgZXBzaWxvbiAmJiBNYXRoLmFicyh1LnogLSB2LnopIDwgZXBzaWxvbjtcbn07XG5cbmZ1bmN0aW9uIGFsbW9zdEVxdWFsQ29sb3IodSwgdiwgZXBzaWxvbikge1xuICAgIHJldHVybiBNYXRoLmFicyh1LnIgLSB2LnIpIDwgZXBzaWxvbiAmJiBNYXRoLmFicyh1LmcgLSB2LmcpIDwgZXBzaWxvbiAmJiBNYXRoLmFicyh1LmIgLSB2LmIpIDwgZXBzaWxvbjtcbn07XG5cbi8vIGEgbG90IG9mIHRoZSBjb21wbGV4aXR5IGhhcyBiZWVuIHB1bGxlZCBvdXQgaW50byBtZXRob2RzIGluIHRoZSBvYmplY3Rcbi8vIGNyZWF0ZWQgYnkgaW50ZXJhY3RpdmVDb21wb25lbnRUZW1wbGF0ZSgpIGFuZCByZWdpc3RlclNoYXJlZEFGUkFNRWNvbXBvbmVudHMoKS5cbi8vIEhlcmUsIHdlIGRlZmluZSBtZXRob2RzIHRoYXQgYXJlIHVzZWQgYnkgdGhlIG9iamVjdCB0aGVyZSwgdG8gZG8gb3VyIG9iamVjdC1zcGVjaWZpY1xuLy8gd29yay5cblxuLy8gV2UgbmVlZCB0byBkZWZpbmU6XG4vLyAtIEFGUkFNRSBcbi8vICAgLSBzY2hlbWFcbi8vICAgLSBpbml0KCkgbWV0aG9kLCB3aGljaCBzaG91bGQgY2FuIHN0YXJ0SW5pdCgpIGFuZCBmaW5pc2hJbml0KClcbi8vICAgLSB1cGRhdGUoKSBhbmQgcGxheSgpIGlmIHlvdSBuZWVkIHRoZW1cbi8vICAgLSB0aWNrKCkgYW5kIHRpY2syKCkgdG8gaGFuZGxlIGZyYW1lIHVwZGF0ZXNcbi8vXG4vLyAtIGNoYW5nZSBpc05ldHdvcmtlZCwgaXNJbnRlcmFjdGl2ZSwgaXNEcmFnZ2FibGUgKGRlZmF1bHQ6IGZhbHNlKSB0byByZWZsZWN0IHdoYXQgXG4vLyAgIHRoZSBvYmplY3QgbmVlZHMgdG8gZG8uXG4vLyAtIGxvYWREYXRhKCkgaXMgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBkb2VzIGFueSBzbG93IHdvcmsgKGxvYWRpbmcgdGhpbmdzLCBldGMpXG4vLyAgIGFuZCBpcyBjYWxsZWQgYnkgZmluaXNoSW5pdCgpLCB3aGljaCB3YWl0cyB0aWxsIGl0J3MgZG9uZSBiZWZvcmUgc2V0dGluZyB0aGluZ3MgdXBcbi8vIC0gaW5pdGlhbGl6ZURhdGEoKSBpcyBjYWxsZWQgdG8gc2V0IHVwIHRoZSBpbml0aWFsIHN0YXRlIG9mIHRoZSBvYmplY3QsIGEgZ29vZCBcbi8vICAgcGxhY2UgdG8gY3JlYXRlIHRoZSAzRCBjb250ZW50LiAgVGhlIHRocmVlLmpzIHNjZW5lIHNob3VsZCBiZSBhZGRlZCB0byBcbi8vICAgdGhpcy5zaW1wbGVDb250YWludGVyXG4vLyAtIGNsaWNrZWQoKSBpcyBjYWxsZWQgd2hlbiB0aGUgb2JqZWN0IGlzIGNsaWNrZWRcbi8vIC0gZHJhZ1N0YXJ0KCkgaXMgY2FsbGVkIHJpZ2h0IGFmdGVyIGNsaWNrZWQoKSBpZiBpc0RyYWdnYWJsZSBpcyB0cnVlLCB0byBzZXQgdXBcbi8vICAgZm9yIGEgcG9zc2libGUgZHJhZyBvcGVyYXRpb25cbi8vIC0gZHJhZ0VuZCgpIGlzIGNhbGxlZCB3aGVuIHRoZSBtb3VzZSBpcyByZWxlYXNlZFxuLy8gLSBkcmFnKCkgc2hvdWxkIGJlIGNhbGxlZCBlYWNoIGZyYW1lIHdoaWxlIHRoZSBvYmplY3QgaXMgYmVpbmcgZHJhZ2dlZCAoYmV0d2VlbiBcbi8vICAgZHJhZ1N0YXJ0KCkgYW5kIGRyYWdFbmQoKSlcbi8vIC0gZ2V0SW50ZXJhY3RvcnMoKSByZXR1cm5zIGFuIGFycmF5IG9mIG9iamVjdHMgZm9yIHdoaWNoIGludGVyYWN0aW9uIGNvbnRyb2xzIGFyZVxuLy8gICBpbnRlcnNlY3RpbmcgdGhlIG9iamVjdC4gVGhlcmUgd2lsbCBsaWtlbHkgYmUgemVybywgb25lLCBvciB0d28gb2YgdGhlc2UgKGlmIFxuLy8gICB0aGVyZSBhcmUgdHdvIGNvbnRyb2xsZXJzIGFuZCBib3RoIGFyZSBwb2ludGluZyBhdCB0aGUgb2JqZWN0KS4gIFRoZSBcImN1cnNvclwiXG4vLyAgIGZpZWxkIGlzIGEgcG9pbnRlciB0byB0aGUgc21hbGwgc3BoZXJlIE9iamVjdDNEIHRoYXQgaXMgZGlzcGxheWVkIHdoZXJlIHRoZSBcbi8vICAgaW50ZXJhY3Rpb24gcmF5IHRvdWNoZXMgdGhlIG9iamVjdC4gVGhlIFwiY29udHJvbGxlclwiIGZpZWxkIGlzIHRoZSBcbi8vLyAgY29ycmVzcG9uZGluZyBjb250cm9sbGVyXG4vLyAgIG9iamVjdCB0aGF0IGluY2x1ZGVzIHRoaW5ncyBsaWtlIHRoZSByYXlDYXN0ZXIuXG4vLyAtIGdldEludGVyc2VjdGlvbigpIHRha2VzIGluIHRoZSBpbnRlcmFjdG9yIGFuZCB0aGUgdGhyZWUuanMgb2JqZWN0M0QgYXJyYXkgXG4vLyAgIHRoYXQgc2hvdWxkIGJlIHRlc3RlZCBmb3IgaW50ZXJhY3Rpb24uXG5cbi8vIE5vdGUgdGhhdCBvbmx5IHRoZSBlbnRpdHkgdGhhdCB0aGlzIGNvbXBvbmVudCBpcyBhdHRhY2hlZCB0byB3aWxsIGJlIFwic2VlblwiXG4vLyBieSBIdWJzIGludGVyYWN0aW9uIHN5c3RlbSwgc28gdGhlIGVudGlyZSB0aHJlZS5qcyB0cmVlIGJlbG93IGl0IHRyaWdnZXJzXG4vLyBjbGljayBhbmQgZHJhZyBldmVudHMuICBUaGUgZ2V0SW50ZXJzZWN0aW9uKCkgbWV0aG9kIGlzIG5lZWRlZCBcblxuLy8gdGhlIGNvbXBvbmVudE5hbWUgbXVzdCBiZSBsb3dlcmNhc2UsIGNhbiBoYXZlIGh5cGhlbnMsIHN0YXJ0IHdpdGggYSBsZXR0ZXIsIFxuLy8gYnV0IG5vIHVuZGVyc2NvcmVzXG5sZXQgY29tcG9uZW50TmFtZSA9IFwidGVzdC1jdWJlXCI7XG5cbi8vIGdldCB0aGUgdGVtcGxhdGUgcGFydCBvZiB0aGUgb2JqZWN0IG5lZWQgZm9yIHRoZSBBRlJBTUUgY29tcG9uZW50XG5sZXQgdGVtcGxhdGUgPSBpbnRlcmFjdGl2ZUNvbXBvbmVudFRlbXBsYXRlKGNvbXBvbmVudE5hbWUpO1xuXG4vLyBjcmVhdGUgdGhlIGFkZGl0aW9uYWwgcGFydHMgb2YgdGhlIG9iamVjdCBuZWVkZWQgZm9yIHRoZSBBRlJBTUUgY29tcG9uZW50XG5sZXQgY2hpbGQgPSB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgaXMgaG9wZWZ1bGx5IHVuaXF1ZSBmb3IgZWFjaCBpbnN0YW5jZVxuICAgICAgICBuYW1lOiB7XG4gICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgZGVmYXVsdDogXCJcIlxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIHRoZSB0ZW1wbGF0ZSB3aWxsIGxvb2sgZm9yIHRoZXNlIHByb3BlcnRpZXMuIElmIHRoZXkgYXJlbid0IHRoZXJlLCB0aGVuXG4gICAgICAgIC8vIHRoZSBsb29rdXAgKHRoaXMuZGF0YS4qKSB3aWxsIGV2YWx1YXRlIHRvIGZhbHNleVxuICAgICAgICBpc05ldHdvcmtlZDoge1xuICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBpc0ludGVyYWN0aXZlOiB7XG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgaXNEcmFnZ2FibGU6IHtcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIG91ciBkYXRhXG4gICAgICAgIHdpZHRoOiB7XG4gICAgICAgICAgICB0eXBlOiBcIm51bWJlclwiLFxuICAgICAgICAgICAgZGVmYXVsdDogMVxuICAgICAgICB9LFxuICAgICAgICBjb2xvcjoge1xuICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IFwiXCJcbiAgICAgICAgfSxcbiAgICAgICAgcGFyYW1ldGVyMToge1xuICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IFwiXCJcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBmdWxsTmFtZSBpcyB1c2VkIHRvIGdlbmVyYXRlIG5hbWVzIGZvciB0aGUgQUZSYW1lIG9iamVjdHMgd2UgY3JlYXRlLiAgU2hvdWxkIGJlXG4gICAgLy8gdW5pcXVlIGZvciBlYWNoIGluc3RhbmNlIG9mIGFuIG9iamVjdCwgd2hpY2ggd2Ugc3BlY2lmeSB3aXRoIG5hbWUuICBJZiBuYW1lIGRvZXNcbiAgICAvLyBuYW1lIGdldCB1c2VkIGFzIGEgc2NoZW1lIHBhcmFtZXRlciwgaXQgZGVmYXVsdHMgdG8gdGhlIG5hbWUgb2YgaXQncyBwYXJlbnQgZ2xURlxuICAgIC8vIG9iamVjdCwgd2hpY2ggb25seSB3b3JrcyBpZiB0aG9zZSBhcmUgdW5pcXVlbHkgbmFtZWQuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnN0YXJ0SW5pdCgpO1xuXG4gICAgICAgIC8vIHRoZSB0ZW1wbGF0ZSB1c2VzIHRoZXNlIHRvIHNldCB0aGluZ3MgdXAuICByZWxhdGl2ZVNpemVcbiAgICAgICAgLy8gaXMgdXNlZCB0byBzZXQgdGhlIHNpemUgb2YgdGhlIG9iamVjdCByZWxhdGl2ZSB0byB0aGUgc2l6ZSBvZiB0aGUgaW1hZ2VcbiAgICAgICAgLy8gdGhhdCBpdCdzIGF0dGFjaGVkIHRvOiBhIHNpemUgb2YgMSBtZWFucyBcbiAgICAgICAgLy8gICBcInRoZSBzaXplIG9mIDF4MXgxIHVuaXRzIGluIHRoZSBvYmplY3RcbiAgICAgICAgLy8gICAgc3BhY2Ugd2lsbCBiZSB0aGUgc2FtZSBhcyB0aGUgc2l6ZSBvZiB0aGUgaW1hZ2VcIi4gIFxuICAgICAgICAvLyBMYXJnZXIgcmVsYXRpdmUgc2l6ZXMgd2lsbCBtYWtlIHRoZSBvYmplY3Qgc21hbGxlciBiZWNhdXNlIHdlIGFyZVxuICAgICAgICAvLyBzYXlpbmcgdGhhdCBhIHNpemUgb2YgTnhOeE4gbWFwcyB0byB0aGUgU2l6ZSBvZiB0aGUgaW1hZ2UsIGFuZCB2aWNlIHZlcnNhLiAgXG4gICAgICAgIC8vIEZvciBleGFtcGxlLCBpZiB0aGUgb2JqZWN0IGJlbG93IGlzIDIsMiBpbiBzaXplIGFuZCB3ZSBzZXQgc2l6ZSAyLCB0aGVuXG4gICAgICAgIC8vIHRoZSBvYmplY3Qgd2lsbCByZW1haW4gdGhlIHNhbWUgc2l6ZSBhcyB0aGUgaW1hZ2UuIElmIHdlIGxlYXZlIGl0IGF0IDEsMSxcbiAgICAgICAgLy8gdGhlbiB0aGUgb2JqZWN0IHdpbGwgYmUgdHdpY2UgdGhlIHNpemUgb2YgdGhlIGltYWdlLiBcbiAgICAgICAgdGhpcy5yZWxhdGl2ZVNpemUgPSB0aGlzLmRhdGEud2lkdGg7XG5cbiAgICAgICAgLy8gb3ZlcnJpZGUgdGhlIGRlZmF1bHRzIGluIHRoZSB0ZW1wbGF0ZVxuICAgICAgICB0aGlzLmlzRHJhZ2dhYmxlID0gdGhpcy5kYXRhLmlzRHJhZ2dhYmxlO1xuICAgICAgICB0aGlzLmlzSW50ZXJhY3RpdmUgPSB0aGlzLmRhdGEuaXNJbnRlcmFjdGl2ZTtcbiAgICAgICAgdGhpcy5pc05ldHdvcmtlZCA9IHRoaXMuZGF0YS5pc05ldHdvcmtlZDtcblxuICAgICAgICAvLyBvdXIgcG90ZW50aWFsbC1zaGFyZWQgb2JqZWN0IHN0YXRlICh0d28gcm9hdGlvbnMgYW5kIHR3byBjb2xvcnMgZm9yIHRoZSBib3hlcykgXG4gICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IHtcbiAgICAgICAgICAgIGNvbG9yOiBuZXcgVEhSRUUuQ29sb3IodGhpcy5kYXRhLmNvbG9yLmxlbmd0aCA+IDAgPyB0aGlzLmRhdGEuY29sb3IgOiBcImdyZXlcIiksXG4gICAgICAgICAgICByb3RhdGlvbjogbmV3IFRIUkVFLkV1bGVyKCksXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoMCwwLjUsMClcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBzb21lIGxvY2FsIHN0YXRlXG4gICAgICAgIHRoaXMuaW5pdGlhbEV1bGVyID0gbmV3IFRIUkVFLkV1bGVyKClcblxuICAgICAgICAvLyBzb21lIGNsaWNrL2RyYWcgc3RhdGVcbiAgICAgICAgdGhpcy5jbGlja0V2ZW50ID0gbnVsbFxuICAgICAgICB0aGlzLmNsaWNrSW50ZXJzZWN0aW9uID0gbnVsbFxuXG4gICAgICAgIC8vIHdlIHNob3VsZCBzZXQgZnVsbE5hbWUgaWYgd2UgaGF2ZSBhIG1lYW5pbmdmdWwgbmFtZVxuICAgICAgICBpZiAodGhpcy5kYXRhLm5hbWUgJiYgdGhpcy5kYXRhLm5hbWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZmluaXNoIHRoZSBpbml0aWFsaXphdGlvblxuICAgICAgICB0aGlzLmZpbmlzaEluaXQoKTtcbiAgICB9LFxuXG4gICAgLy8gaWYgYW55dGhpbmcgY2hhbmdlZCBpbiB0aGlzLmRhdGEsIHdlIG5lZWQgdG8gdXBkYXRlIHRoZSBvYmplY3QuICBcbiAgICAvLyB0aGlzIGlzIHByb2JhYmx5IG5vdCBnb2luZyB0byBoYXBwZW4sIGJ1dCBjb3VsZCBpZiBhbm90aGVyIG9mIFxuICAgIC8vIG91ciBzY3JpcHRzIG1vZGlmaWVzIHRoZSBjb21wb25lbnQgcHJvcGVydGllcyBpbiB0aGUgRE9NXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7fSxcblxuICAgIC8vIGRvIHNvbWUgc3R1ZmYgdG8gZ2V0IGFzeW5jIGRhdGEuICBDYWxsZWQgYnkgaW5pdFRlbXBsYXRlKClcbiAgICBsb2FkRGF0YTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm5cbiAgICB9LFxuXG4gICAgLy8gY2FsbGVkIGJ5IGluaXRUZW1wbGF0ZSgpIHdoZW4gdGhlIGNvbXBvbmVudCBpcyBiZWluZyBwcm9jZXNzZWQuICBIZXJlLCB3ZSBjcmVhdGVcbiAgICAvLyB0aGUgdGhyZWUuanMgb2JqZWN0cyB3ZSB3YW50LCBhbmQgYWRkIHRoZW0gdG8gc2ltcGxlQ29udGFpbmVyIChhbiBBRnJhbWUgbm9kZSBcbiAgICAvLyB0aGUgdGVtcGxhdGUgY3JlYXRlZCBmb3IgdXMpLlxuICAgIGluaXRpYWxpemVEYXRhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuYm94ID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMSwgMSwgMiwgMiwgMiksXG4gICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICAgICAgICAgIGNvbG9yOiB0aGlzLnNoYXJlZERhdGEuY29sb3JcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuYm94Lm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlO1xuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRPYmplY3QzRCgnYm94JywgdGhpcy5ib3gpXG5cbiAgICAgICAgLy8gY3JlYXRlIGEgc2Vjb25kIHNtYWxsLCBibGFjayBib3ggb24gdGhlIHN1cmZhY2Ugb2YgdGhlIGJveFxuICAgICAgICB0aGlzLmJveDIgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEsIDAuMSwgMC4xLCAyLCAyLCAyKSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgICAgICAgICAgICAgY29sb3I6IFwiYmxhY2tcIlxuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5ib3gyLm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlO1xuICAgICAgICB0aGlzLmJveDIucG9zaXRpb24uY29weSh0aGlzLnNoYXJlZERhdGEucG9zaXRpb24pXG5cbiAgICAgICAgLy8gYWRkIGl0IGFzIGEgY2hpbGQgb2YgdGhlIGZpcnN0IGJveCwgc2luY2Ugd2Ugd2FudCBpdCB0byBtb3ZlIHdpdGggdGhlIGZpcnN0IGJveFxuICAgICAgICB0aGlzLmJveC5hZGQodGhpcy5ib3gyKVxuXG4gICAgICAgIC8vIElNUE9SVEFOVDogYW55IHRocmVlLmpzIG9iamVjdCB0aGF0IGlzIGFkZGVkIHRvIGEgSHVicyAoYWZyYW1lKSBlbnRpdHkgXG4gICAgICAgIC8vIG11c3QgaGF2ZSBcIi5lbFwiIHBvaW50aW5nIHRvIHRoZSBBRlJBTUUgRW50aXR5IHRoYXQgY29udGFpbnMgaXQuXG4gICAgICAgIC8vIFdoZW4gYW4gb2JqZWN0M0QgaXMgYWRkZWQgd2l0aCBcIi5zZXRPYmplY3QzRFwiLCBpdCBpcyBhZGRlZCB0byB0aGUgXG4gICAgICAgIC8vIG9iamVjdDNEIGZvciB0aGF0IEVudGl0eSwgYW5kIHNldHMgYWxsIG9mIHRoZSBjaGlsZHJlbiBvZiB0aGF0XG4gICAgICAgIC8vIG9iamVjdDNEIHRvIHBvaW50IHRvIHRoZSBzYW1lIEVudGl0eS4gIElmIHlvdSBhZGQgYW4gb2JqZWN0M0QgdG9cbiAgICAgICAgLy8gdGhlIHN1Yi10cmVlIG9mIHRoYXQgb2JqZWN0IGxhdGVyLCB5b3UgbXVzdCBkbyB0aGlzIHlvdXJzZWxmLiBcbiAgICAgICAgdGhpcy5ib3gyLmVsID0gdGhpcy5zaW1wbGVDb250YWluZXJcblxuICAgICAgICAvLyB0ZWxsIHRoZSBwb3J0YWxzIHRvIHVwZGF0ZSB0aGVpciB2aWV3XG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5lbWl0KCd1cGRhdGVQb3J0YWxzJykgXG5cbiAgICB9LFxuXG4gICAgLy8gY2FsbGVkIGZyb20gcmVtb3ZlKCkgaW4gdGhlIHRlbXBsYXRlIHRvIHJlbW92ZSBhbnkgbG9jYWwgcmVzb3VyY2VzIHdoZW4gdGhlIGNvbXBvbmVudFxuICAgIC8vIGlzIGRlc3Ryb3llZFxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5yZW1vdmVPYmplY3QzRChcImJveFwiKVxuICAgICAgICB0aGlzLmJveC5nZW9tZXRyeS5kaXNwb3NlKClcbiAgICAgICAgdGhpcy5ib3gubWF0ZXJpYWwuZGlzcG9zZSgpXG4gICAgICAgIHRoaXMuYm94Mi5nZW9tZXRyeS5kaXNwb3NlKClcbiAgICAgICAgdGhpcy5ib3gyLm1hdGVyaWFsLmRpc3Bvc2UoKVxuICAgICAgICB0aGlzLnJlbW92ZVRlbXBsYXRlKClcbiAgICB9LFxuXG4gICAgLy8gaGFuZGxlIFwiaW50ZXJhY3RcIiBldmVudHMgZm9yIGNsaWNrYWJsZSBlbnRpdGllc1xuICAgIGNsaWNrZWQ6IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgLy8gdGhlIGV2dC50YXJnZXQgd2lsbCBwb2ludCBhdCB0aGUgb2JqZWN0M0QgaW4gdGhpcyBlbnRpdHkuICBXZSBjYW4gdXNlXG4gICAgICAgIC8vIGhhbmRsZUludGVyYWN0aW9uLmdldEludGVyYWN0aW9uVGFyZ2V0KCkgdG8gZ2V0IHRoZSBtb3JlIHByZWNpc2UgXG4gICAgICAgIC8vIGhpdCBpbmZvcm1hdGlvbiBhYm91dCB3aGljaCBvYmplY3QzRHMgaW4gb3VyIG9iamVjdCB3ZXJlIGhpdC4gIFdlIHN0b3JlXG4gICAgICAgIC8vIHRoZSBvbmUgdGhhdCB3YXMgY2xpY2tlZCBoZXJlLCBzbyB3ZSBrbm93IHdoaWNoIGl0IHdhcyBhcyB3ZSBkcmFnIGFyb3VuZFxuICAgICAgICB0aGlzLmNsaWNrSW50ZXJzZWN0aW9uID0gdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5nZXRJbnRlcnNlY3Rpb24oZXZ0Lm9iamVjdDNELCBbZXZ0LnRhcmdldF0pO1xuICAgICAgICB0aGlzLmNsaWNrRXZlbnQgPSBldnQ7XG5cbiAgICAgICAgaWYgKCF0aGlzLmNsaWNrSW50ZXJzZWN0aW9uKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJjbGljayBkaWRuJ3QgaGl0IGFueXRoaW5nOyBzaG91bGRuJ3QgaGFwcGVuXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94KSB7XG4gICAgICAgICAgICAvLyBuZXcgcmFuZG9tIGNvbG9yIG9uIGVhY2ggY2xpY2tcbiAgICAgICAgICAgIGxldCBuZXdDb2xvciA9IHJhbmRvbUNvbG9yKClcblxuICAgICAgICAgICAgdGhpcy5ib3gubWF0ZXJpYWwuY29sb3Iuc2V0KG5ld0NvbG9yKVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLmNvbG9yLnNldChuZXdDb2xvcilcbiAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gyKSB7fVxuICAgIH0sXG5cbiAgICAvLyBjYWxsZWQgdG8gc3RhcnQgdGhlIGRyYWcuICBXaWxsIGJlIGNhbGxlZCBhZnRlciBjbGlja2VkKCkgaWYgaXNEcmFnZ2FibGUgaXMgdHJ1ZVxuICAgIGRyYWdTdGFydDogZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAvLyBzZXQgdXAgdGhlIGRyYWcgc3RhdGVcbiAgICAgICAgaWYgKCF0aGlzLmhhbmRsZUludGVyYWN0aW9uLnN0YXJ0RHJhZyhldnQpKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGdyYWIgYSBjb3B5IG9mIHRoZSBjdXJyZW50IG9yaWVudGF0aW9uIG9mIHRoZSBvYmplY3Qgd2UgY2xpY2tlZFxuICAgICAgICBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gpIHtcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbEV1bGVyLmNvcHkodGhpcy5ib3gucm90YXRpb24pXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gyKSB7XG4gICAgICAgICAgICB0aGlzLmJveDIubWF0ZXJpYWwuY29sb3Iuc2V0KFwicmVkXCIpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gY2FsbGVkIHdoZW4gdGhlIGJ1dHRvbiBpcyByZWxlYXNlZCB0byBmaW5pc2ggdGhlIGRyYWdcbiAgICBkcmFnRW5kOiBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgIHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZW5kRHJhZyhldnQpXG4gICAgICAgIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveCkge30gZWxzZSBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gyKSB7XG4gICAgICAgICAgICB0aGlzLmJveDIubWF0ZXJpYWwuY29sb3Iuc2V0KFwiYmxhY2tcIilcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyB0aGUgbWV0aG9kIHNldFNoYXJlZERhdGEoKSBhbHdheXMgc2V0cyB0aGUgc2hhcmVkIGRhdGEsIGNhdXNpbmcgYSBuZXR3b3JrIHVwZGF0ZS4gIFxuICAgIC8vIFdlIGNhbiBiZSBzbWFydGVyIGhlcmUgYnkgY2FsbGluZyBpdCBvbmx5IHdoZW4gc2lnbmlmaWNhbnQgY2hhbmdlcyBoYXBwZW4sIFxuICAgIC8vIHdoaWNoIHdlJ2xsIGRvIGluIHRoZSBzZXRTaGFyZWRFdWxlciBtZXRob2RzXG4gICAgc2V0U2hhcmVkRXVsZXI6IGZ1bmN0aW9uIChuZXdFdWxlcikge1xuICAgICAgICBpZiAoIWFsbW9zdEVxdWFsVmVjMyh0aGlzLnNoYXJlZERhdGEucm90YXRpb24sIG5ld0V1bGVyLCAwLjA1KSkge1xuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLnJvdGF0aW9uLmNvcHkobmV3RXVsZXIpXG4gICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEoKVxuICAgICAgICB9XG4gICAgfSxcbiAgICBzZXRTaGFyZWRQb3NpdGlvbjogZnVuY3Rpb24gKG5ld1Bvcykge1xuICAgICAgICBpZiAoIWFsbW9zdEVxdWFsVmVjMyh0aGlzLnNoYXJlZERhdGEucG9zaXRpb24sIG5ld1BvcywgMC4wNSkpIHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YS5wb3NpdGlvbi5jb3B5KG5ld1BvcylcbiAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaWYgdGhlIG9iamVjdCBpcyBuZXR3b3JrZWQsIHRoaXMuc3RhdGVTeW5jIHdpbGwgZXhpc3QgYW5kIHNob3VsZCBiZSBjYWxsZWRcbiAgICBzZXRTaGFyZWREYXRhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnNldFNoYXJlZERhdGEodGhpcy5zaGFyZWREYXRhKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfSxcblxuICAgIC8vIHRoaXMgaXMgY2FsbGVkIGZyb20gdGhlIG5ldHdvcmtlZCBkYXRhIGVudGl0eSB0byBnZXQgdGhlIGluaXRpYWwgZGF0YSBcbiAgICAvLyBmcm9tIHRoZSBjb21wb25lbnRcbiAgICBnZXRTaGFyZWREYXRhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNoYXJlZERhdGFcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLmJveCkge1xuICAgICAgICAgICAgLy8gaGF2ZW4ndCBmaW5pc2hlZCBpbml0aWFsaXppbmcgeWV0XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiBpdCdzIGludGVyYWN0aXZlLCB3ZSdsbCBoYW5kbGUgZHJhZyBhbmQgaG92ZXIgZXZlbnRzXG4gICAgICAgIGlmICh0aGlzLmlzSW50ZXJhY3RpdmUpIHtcblxuICAgICAgICAgICAgLy8gaWYgd2UncmUgZHJhZ2dpbmcsIHVwZGF0ZSB0aGUgcm90YXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmlzRHJhZ2dhYmxlICYmIHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uaXNEcmFnZ2luZykge1xuXG4gICAgICAgICAgICAgICAgLy8gZG8gc29tZXRoaW5nIHdpdGggdGhlIGRyYWdnaW5nLiBIZXJlLCB3ZSdsbCB1c2UgZGVsdGEueCBhbmQgZGVsdGEueVxuICAgICAgICAgICAgICAgIC8vIHRvIHJvdGF0ZSB0aGUgb2JqZWN0LiAgVGhlc2UgdmFsdWVzIGFyZSBzZXQgYXMgYSByZWxhdGl2ZSBvZmZzZXQgaW5cbiAgICAgICAgICAgICAgICAvLyB0aGUgcGxhbmUgcGVycGVuZGljdWxhciB0byB0aGUgdmlldywgc28gd2UnbGwgdXNlIHRoZW0gdG8gb2Zmc2V0IHRoZVxuICAgICAgICAgICAgICAgIC8vIHggYW5kIHkgcm90YXRpb24gb2YgdGhlIG9iamVjdC4gIFRoaXMgaXMgYSBURVJSSUJMRSB3YXkgdG8gZG8gcm90YXRlLFxuICAgICAgICAgICAgICAgIC8vIGJ1dCBpdCdzIGEgc2ltcGxlIGV4YW1wbGUuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBkcmFnIHN0YXRlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZHJhZygpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY29tcHV0ZSBhIG5ldyByb3RhdGlvbiBiYXNlZCBvbiB0aGUgZGVsdGFcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gucm90YXRpb24uc2V0KHRoaXMuaW5pdGlhbEV1bGVyLnggLSB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmRlbHRhLngsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRpYWxFdWxlci55ICsgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5kZWx0YS55LFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0aWFsRXVsZXIueilcblxuICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgdGhlIHNoYXJlZCByb3RhdGlvblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFNoYXJlZEV1bGVyKHRoaXMuYm94LnJvdGF0aW9uKVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gyKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gd2Ugd2FudCB0byBoaXQgdGVzdCBvbiBvdXIgYm94ZXMsIGJ1dCBvbmx5IHdhbnQgdG8ga25vdyBpZi93aGVyZVxuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBoaXQgdGhlIGJpZyBib3guICBTbyBmaXJzdCBoaWRlIHRoZSBzbWFsbCBib3gsIGFuZCB0aGVuIGRvIGFcbiAgICAgICAgICAgICAgICAgICAgLy8gYSBoaXQgdGVzdCwgd2hpY2ggY2FuIG9ubHkgcmVzdWx0IGluIGEgaGl0IG9uIHRoZSBiaWcgYm94LiAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm94Mi52aXNpYmxlID0gZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgbGV0IGludGVyc2VjdCA9IHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJzZWN0aW9uKHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZHJhZ0ludGVyYWN0b3IsIFt0aGlzLmJveF0pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm94Mi52aXNpYmxlID0gdHJ1ZVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhpdCB0aGUgYmlnIGJveCwgbW92ZSB0aGUgc21hbGwgYm94IHRvIHRoZSBwb3NpdGlvbiBvZiB0aGUgaGl0XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbnRlcnNlY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBpbnRlcnNlY3Qgb2JqZWN0IGlzIGEgVEhSRUUuSW50ZXJzZWN0aW9uIG9iamVjdCwgd2hpY2ggaGFzIHRoZSBoaXQgcG9pbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNwZWNpZmllZCBpbiB3b3JsZCBjb29yZGluYXRlcy4gIFNvIHdlIG1vdmUgdGhvc2UgY29vcmRpbmF0ZXMgaW50byB0aGUgbG9jYWxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNvb3JkaWF0ZXMgb2YgdGhlIGJpZyBib3gsIGFuZCB0aGVuIHNldCB0aGUgcG9zaXRpb24gb2YgdGhlIHNtYWxsIGJveCB0byB0aGF0XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcG9zaXRpb24gPSB0aGlzLmJveC53b3JsZFRvTG9jYWwoaW50ZXJzZWN0LnBvaW50KVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLnBvc2l0aW9uLmNvcHkocG9zaXRpb24pXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFNoYXJlZFBvc2l0aW9uKHRoaXMuYm94Mi5wb3NpdGlvbilcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gc29tZXRoaW5nIHdpdGggdGhlIHJheXMgd2hlbiBub3QgZHJhZ2dpbmcgb3IgY2xpY2tpbmcuXG4gICAgICAgICAgICAgICAgLy8gRm9yIGV4YW1wbGUsIHdlIGNvdWxkIGRpc3BsYXkgc29tZSBhZGRpdGlvbmFsIGNvbnRlbnQgd2hlbiBob3ZlcmluZ1xuICAgICAgICAgICAgICAgIGxldCBwYXNzdGhydUludGVyYWN0b3IgPSB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmdldEludGVyYWN0b3JzKHRoaXMuc2ltcGxlQ29udGFpbmVyKTtcblxuICAgICAgICAgICAgICAgIC8vIHdlIHdpbGwgc2V0IHllbGxvdyBpZiBlaXRoZXIgaW50ZXJhY3RvciBoaXRzIHRoZSBib3guIFdlJ2xsIGtlZXAgdHJhY2sgb2YgaWZcbiAgICAgICAgICAgICAgICAvLyBvbmUgZG9lc1xuICAgICAgICAgICAgICAgIGxldCBzZXRJdCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgLy8gZm9yIGVhY2ggb2Ygb3VyIGludGVyYWN0b3JzLCBjaGVjayBpZiBpdCBoaXRzIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFzc3RocnVJbnRlcmFjdG9yLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBpbnRlcnNlY3Rpb24gPSB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmdldEludGVyc2VjdGlvbihwYXNzdGhydUludGVyYWN0b3JbaV0sIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmNoaWxkcmVuKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhpdCB0aGUgc21hbGwgYm94LCBzZXQgdGhlIGNvbG9yIHRvIHllbGxvdywgYW5kIGZsYWcgdGhhdCB3ZSBoaXRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGludGVyc2VjdGlvbiAmJiBpbnRlcnNlY3Rpb24ub2JqZWN0ID09PSB0aGlzLmJveDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5jb2xvci5zZXQoXCJ5ZWxsb3dcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldEl0ID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gaWYgd2UgZGlkbid0IGhpdCwgbWFrZSBzdXJlIHRoZSBjb2xvciByZW1haW5zIGJsYWNrXG4gICAgICAgICAgICAgICAgaWYgKCFzZXRJdCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmJveDIubWF0ZXJpYWwuY29sb3Iuc2V0KFwiYmxhY2tcIilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZW4ndCBmaW5pc2hlZCBzZXR0aW5nIHVwIHRoZSBuZXR3b3JrZWQgZW50aXR5IGRvbid0IGRvIGFueXRoaW5nLlxuICAgICAgICAgICAgaWYgKCF0aGlzLm5ldEVudGl0eSB8fCAhdGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgdGhlIHN0YXRlIGhhcyBjaGFuZ2VkIGluIHRoZSBuZXR3b3JrZWQgZGF0YSwgdXBkYXRlIG91ciBodG1sIG9iamVjdFxuICAgICAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlU3luYy5jaGFuZ2VkID0gZmFsc2VcblxuICAgICAgICAgICAgICAgIC8vIGdvdCB0aGUgZGF0YSwgbm93IGRvIHNvbWV0aGluZyB3aXRoIGl0XG4gICAgICAgICAgICAgICAgbGV0IG5ld0RhdGEgPSB0aGlzLnN0YXRlU3luYy5kYXRhT2JqZWN0XG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLmNvbG9yLnNldChuZXdEYXRhLmNvbG9yKVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YS5yb3RhdGlvbi5jb3B5KG5ld0RhdGEucm90YXRpb24pXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLnBvc2l0aW9uLmNvcHkobmV3RGF0YS5wb3NpdGlvbilcbiAgICAgICAgICAgICAgICB0aGlzLmJveC5tYXRlcmlhbC5jb2xvci5zZXQobmV3RGF0YS5jb2xvcilcbiAgICAgICAgICAgICAgICB0aGlzLmJveC5yb3RhdGlvbi5jb3B5KG5ld0RhdGEucm90YXRpb24pXG4gICAgICAgICAgICAgICAgdGhpcy5ib3gyLnBvc2l0aW9uLmNvcHkobmV3RGF0YS5wb3NpdGlvbilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gcmVnaXN0ZXIgdGhlIGNvbXBvbmVudCB3aXRoIHRoZSBBRnJhbWUgc2NlbmVcbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudChjb21wb25lbnROYW1lLCB7XG4gICAgLi4uY2hpbGQsXG4gICAgLi4udGVtcGxhdGVcbn0pXG5cbi8vIGNyZWF0ZSBhbmQgcmVnaXN0ZXIgdGhlIGRhdGEgY29tcG9uZW50IGFuZCBpdCdzIE5BRiBjb21wb25lbnQgd2l0aCB0aGUgQUZyYW1lIHNjZW5lXG5yZWdpc3RlclNoYXJlZEFGUkFNRUNvbXBvbmVudHMoY29tcG9uZW50TmFtZSkiLCJpbXBvcnQgJy4uL3N5c3RlbXMvZmFkZXItcGx1cy5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9wb3J0YWwuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvaW1tZXJzaXZlLTM2MC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9wYXJhbGxheC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9zaGFkZXIudHMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcmVnaW9uLWhpZGVyLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3ZpZGVvLWNvbnRyb2wtcGFkJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3RocmVlLXNhbXBsZS5qcydcblxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCAnaW1tZXJzaXZlLTM2MCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywgJ3BvcnRhbCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnc2hhZGVyJywgJ3NoYWRlcicpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncGFyYWxsYXgnLCAncGFyYWxsYXgnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2h0bWwtc2NyaXB0JywgJ2h0bWwtc2NyaXB0JylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCAncmVnaW9uLWhpZGVyJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCd2aWRlby1jb250cm9sLXBhZCcsICd2aWRlby1jb250cm9sLXBhZCcpXG5cbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCd0ZXN0LWN1YmUnLCAndGVzdC1jdWJlJylcblxuLy8gZG8gYSBzaW1wbGUgbW9ua2V5IHBhdGNoIHRvIHNlZSBpZiBpdCB3b3Jrc1xuXG4vLyB2YXIgbXlpc01pbmVPckxvY2FsID0gZnVuY3Rpb24gKHRoYXQpIHtcbi8vICAgICByZXR1cm4gIXRoYXQuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQgfHwgKHRoYXQubmV0d29ya2VkRWwgJiYgTkFGLnV0aWxzLmlzTWluZSh0aGF0Lm5ldHdvcmtlZEVsKSk7XG4vLyAgfVxuXG4vLyAgdmFyIHZpZGVvQ29tcCA9IEFGUkFNRS5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl1cbi8vICB2aWRlb0NvbXAuQ29tcG9uZW50LnByb3RvdHlwZS5pc01pbmVPckxvY2FsID0gbXlpc01pbmVPckxvY2FsO1xuXG4vLyBhZGQgdGhlIHJlZ2lvbi1oaWRlciB0byB0aGUgc2NlbmVcbi8vIGNvbnN0IHNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImEtc2NlbmVcIik7XG4vLyBzY2VuZS5zZXRBdHRyaWJ1dGUoXCJyZWdpb24taGlkZXJcIiwge3NpemU6IDEwMH0pXG5cbmxldCBob21lUGFnZURlc2MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbY2xhc3NePVwiSG9tZVBhZ2VfX2FwcC1kZXNjcmlwdGlvblwiXScpXG5pZiAoaG9tZVBhZ2VEZXNjKSB7XG4gICAgaG9tZVBhZ2VEZXNjLmlubmVySFRNTCA9IFwiUmVhbGl0eSBNZWRpYSBJbW1lcnNpdmUgRXhwZXJpZW5jZTxicj48YnI+QWZ0ZXIgc2lnbmluZyBpbiwgdmlzaXQgPGEgaHJlZj0naHR0cHM6Ly9yZWFsaXR5bWVkaWEuZGlnaXRhbCc+cmVhbGl0eW1lZGlhLmRpZ2l0YWw8L2E+IHRvIGdldCBzdGFydGVkXCJcbn1cbiJdLCJuYW1lcyI6WyJ3b3JsZENhbWVyYSIsIndvcmxkU2VsZiIsImRlZmF1bHRIb29rcyIsImdsc2wiLCJ1bmlmb3JtcyIsImxvYWRlciIsIm5vaXNlVGV4Iiwic21hbGxOb2lzZSIsIndhcnBUZXgiLCJzbm9pc2UiLCJNYXRlcmlhbE1vZGlmaWVyIiwib25jZSIsImh0bWxDb21wb25lbnRzIiwicGFub3ZlcnQiLCJwYW5vZnJhZyJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTSxDQUFDLGNBQWMsQ0FBQyxZQUFZLEVBQUU7QUFDcEMsRUFBRSxNQUFNLEVBQUU7QUFDVixJQUFJLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRTtBQUNsRCxJQUFJLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEdBQUcs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R0FBb0I7SUFDakMsUUFBUSxFQUFFO1FBQ04sVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUU7UUFDcEMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUU7UUFDOUIsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUU7UUFDbEMsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxVQUFVLEVBQUU7UUFDMUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFnQyxDQUFDLENBQUksRUFBRTtRQUM1RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRTtRQUNwQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNwRCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUs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QUFBO1FBRXJFLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRSxDQUFBO1FBQzVHLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRSxDQUFBOztRQUU1RyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQTtRQUN4RSxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBQyxHQUFHLElBQUksRUFBRSxDQUFBO1FBRXZELFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUE7O1FBR3pDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFBO1FBQ3pDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFBO1FBQzNDLFFBQVEsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEtBQUssRUFBQyxD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YUFBYSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNoRyxZQUFZLGFBQWEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN4RyxZQUFZLGFBQWEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN4RyxXQUFXO0FBQ1gsU0FBUztBQUNULFFBQVEsT0FBTyxhQUFhLENBQUM7QUFDN0IsS0FBSztBQUNMO0FBQ0EsSUFBSSxXQUFXLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUN4QyxRQUFRLElBQUksU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLENBQUMsR0FBRyxXQUFXLEdBQUcsWUFBWSxDQUFDLENBQUM7QUFDdkU7QUFDQSxRQUFRLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDeEMsVUFBVSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQzNDLFlBQVksU0FBUyxDQUFDLENB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LFdBQVcsR0FBRyxNQUFNLFdBQVcsQ0FBQyxlQUFlLEVBQUM7QUFDakU7QUFDQTtBQUNBLFlBQVksSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFDO0FBQzNFLFlBQVksSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEdBQUU7QUFDakQsWUFBWSxJQUFJLFdBQVcsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFTO0FBQzFELFlBQVksSUFBSSxXQUFXLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBUztBQUMxRCxZQUFZLElBQUksV0FBVyxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVM7QUFDMUQ7QUFDQSxZQUFZLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksWUFBVztBQUM5RCxZQUFZLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksWUFBVztBQUM5RCxZQUFZLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksWUFBVztBQUM5RDtBQUNBLFlBQVksSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsT0FBTTtBQUN0RixZQUFZLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxPQUFNO0FBQzlHLFlBQVksSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFB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Q0FBQyxTQUFTLENBQUMsR0FBRyxFQUFDO0FBQzNCLEtBQUs7QUFDTCxJQUFJLFFBQVEsR0FBRztBQUNmO0FBQ0EsUUFBUSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssR0FBRztBQUNsQyxLQUFLO0FBQ0wsQ0FBQzs7QUM5eUJELGFBQWU7O0FDQWYsTUFBTVQsTUFBSSxHQUFHLENBQUM7QUFDZDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkEsTUFBTUEsTUFBSSxHQUFHLENBQUM7QUFDZDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBQ0EsTUFBTSxXQUFXLEdBQUcsSUFB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QUFDWixJQUFJLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7QUFDNUIsSUFBSSxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO0FBQ3hCLElBQUksYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUNsQyxJQUFJLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN0QyxJQUFJLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN0QyxHQUFHO0FBQ0g7QUFDQSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUM7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBRSxDQUFDO0FBQ0g7QUFDQSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEVBQUUsQ0FBQztBQUNIOztBQ3BMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFHQTtBQUNBLE1BQU0sR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUM7QUFDMUM7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsVUFBVSxFQUFFO0FBQ3JDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxnQkFBZ0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFO0FBQzlELElBQUksV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUU7QUFDekQsR0FBRztBQUNILEVBQUUsSUFBSSxFQUFFLFlBQVk7QUFDcEIsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFJO0FBQ3pDLElBQUksTUFBTSxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFRO0FBQ2xFLElBQUksUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxvQkFBbUI7QUFDL0QsSUFBSSxRQUFRLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLG9CQUFtQjtBQUMvRCxJQUFJLE1BQU0sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLEdBQUcsZUFBYztBQUMzRCxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDO0FBQzdDLE1BQU0sWUFBWTtBQUNsQixNQUFNLGNBQWM7QUFDcEIsTUFBTSxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxJQUFJLEVBQUU7QUFDOUMsTUFBTSxRQUFRLEVBQUU7QUFDaEIsUUFBUSxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFO0FBQ2hDLFFBQVEsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRTtBQUNwQyxRQUFRLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRTtBQUN6RCxRQUFRLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtBQUN4QyxRQUFRLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtBQUN4QyxRQUFRLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUU7QUFDMUIsT0FBTztBQUNQLEtBQUssRUFBQztBQUNOLElBQUksSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUTtBQUNqQyxHQUFHO0FBQ0gsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFO0FBQ2hDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBQztBQUNsRCxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUM7QUFDeEMsTUFBTSxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBQztBQUN4QyxNQUFNLE1BQU0sSUFBSSxHQUFHLGdCQUFnQjtBQUNuQyxRQUFRLEtBQUs7QUFDYixRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCO0FBQzFELFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0I7QUFDMUQsUUFBUSxDQUFDO0FBQ1QsUUFBUSxDQUFDO0FBQ1QsUUFBTztBQUNQLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFJO0FBQzlDLEtBQUs7QUFDTCxHQUFHO0FBQ0gsQ0FBQyxFQUFDO0FBQ0Y7QUFDQSxTQUFTLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRTtBQUNoQyxFQUFFLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDNUMsQ0FBQztBQUNEO0FBQ0EsU0FBUyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtBQUN0QyxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQ2hELENBQUM7QUFDRDtBQUNBLFNBQVMsZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtBQUM3QyxFQUFFLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUNwRDs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFO0FBQ3RDLElBQUksSUFBSSxHQUFHO0FBQ1gsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHRixhQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDdkQsUUFBUSxJQUFJLENBQUMsa0JBQWtCLEdBQUdBLGFBQWMsQ0FBQyxvQkFBb0IsRUFBQztBQUN0RSxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFO0FBQzFELFlBQVksT0FBTyxDQUFDLEtBQUssQ0FBQyxpR0FBaUcsRUFBQztBQUM1SCxTQUFTLE1BQU07QUFDZixZQUFZLElBQUksQ0FBQyxrQkFBa0IsR0FBRTtBQUNyQyxTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0EsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRTtBQUNoQixRQUFRLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBQztBQUM5QixLQUFLO0FBQ0wsR0FBRyxFQUFDO0FBQ0o7QUFDQSxNQUFNLElBQUksR0FBRztBQUNiLElBQUksSUFBSSxHQUFHLElBQUk7QUFDZixDQUFDLENBQUM7QUFDRjtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLEVBQUU7QUFDeEMsSUFBSSxNQUFNLEVBQUU7QUFDWjtBQUNBLFFBQVEsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDO0FBQzVDLFFBQVEsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDN0MsUUFBUSxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztBQUM5QyxRQUFRLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztBQUNsRCxRQUFRLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztBQUNsRCxRQUFRLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztBQUNsRCxRQUFRLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztBQUNsRCxLQUFLO0FBQ0wsSUFBSSxJQUFJLEVBQUUsWUFBWTtBQUN0QixRQUFRLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0FBQzNCLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztBQUN2QztBQUNBLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRztBQUMxQixZQUFZLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUs7QUFDbEMsWUFBWSxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNO0FBQ3BDLFlBQVksVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUM1QyxZQUFZLFVBQVUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDNUMsWUFBWSxVQUFVLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVO0FBQzVDLFlBQVksVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUM1QyxVQUFTO0FBQ1Q7QUFDQSxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTtBQUN6RCxZQUFZLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUNqQyxTQUFTLE1BQU07QUFDZixZQUFZLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVE7QUFDOUMsU0FBUztBQUNUO0FBQ0EsUUFBUSxJQUFJLElBQUksR0FBRyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFDO0FBQ3hFLFFBQVEsSUFBSSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxFQUFFLEtBQUs7QUFDOUQsWUFBWSxJQUFJLENBQUMsWUFBWSxHQUFFO0FBQy9CLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNqQjtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0EsSUFBSSxNQUFNLEVBQUUsWUFBWTtBQUN4QixRQUFRLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTTtBQUM3RTtBQUNBLFFBQVEsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztBQUN2QztBQUNBLFFBQVEsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0FBQzNDO0FBQ0EsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDekIsWUFBWSxJQUFJLENBQUMsYUFBYSxHQUFFO0FBQ2hDLFNBQVM7QUFDVCxRQUFRLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUM1QixLQUFLO0FBQ0w7QUFDQSxJQUFJLFlBQVksRUFBRSxZQUFZO0FBQzlCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxNQUFNLEdBQUcsTUFBTTtBQUMzQixZQUFZLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsTUFBTTtBQUMxQyxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTTtBQUN4QztBQUNBLGdCQUFnQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFO0FBQzdDO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSTtBQUN6QztBQUNBO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDdkUsb0JBQW9CLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDdkUsb0JBQW9CLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3RFO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFDO0FBQ3pGLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0EsZ0JBQWdCLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFDO0FBQ25FLGdCQUFnQixJQUFJLENBQUMsZUFBZSxHQUFHLFNBQVE7QUFDL0MsZ0JBQWdCLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGdCQUFnQixHQUFHLEtBQUk7QUFDckUsZ0JBQWdCLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBQztBQUN0RjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQixJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsTUFBTSxHQUFHLENBQUMsQ0FBQztBQUMxQyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRTtBQUN2RDtBQUNBLG9CQUFvQixJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFLO0FBQ2xFLG9CQUFvQixJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFLO0FBQ3ZELG9CQUFvQixLQUFLLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsRUFBQztBQUMvQyxvQkFBb0IsTUFBTSxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUM7QUFDaEQsb0JBQW9CLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUNoQyxvQkFBb0IsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ2hDLG9CQUFvQixNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDaEMsb0JBQW9CLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztBQUM5RCxpQkFBaUIsTUFBTTtBQUN2QjtBQUNBO0FBQ0Esb0JBQW9CLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBQztBQUMxRCxvQkFBb0IsSUFBSSxJQUFJLEVBQUU7QUFDOUIsd0JBQXdCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO0FBQzVELHdCQUF3QixLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUM7QUFDdEUsd0JBQXdCLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBQztBQUN2RSxxQkFBcUIsTUFBTTtBQUMzQix3QkFBd0IsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBSztBQUM5RCx3QkFBd0IsS0FBSyxHQUFHLFNBQVMsQ0FBQyxFQUFDO0FBQzNDLHdCQUF3QixNQUFNLEdBQUcsU0FBUyxDQUFDLEVBQUM7QUFDNUMsd0JBQXdCLFNBQVMsQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUN2Qyx3QkFBd0IsU0FBUyxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ3ZDLHdCQUF3QixTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDdkMsd0JBQXdCLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztBQUNsRSxxQkFBcUI7QUFDckI7QUFDQSxvQkFBb0IsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVE7QUFDcEUsb0JBQW9CLEtBQUssSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUM7QUFDNUMsb0JBQW9CLE1BQU0sSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUM7QUFDN0Msb0JBQW9CLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDdkMsb0JBQW9CLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDdkMsb0JBQW9CLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDdkMsb0JBQW9CLE9BQU8sQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7QUFDckQsaUJBQWlCO0FBQ2pCO0FBQ0EsZ0JBQWdCLElBQUksS0FBSyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQzdDLG9CQUFvQixNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEdBQUU7QUFDL0Usb0JBQW9CLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssRUFBRSxNQUFNLEdBQUcsS0FBSyxFQUFDO0FBQ3ZFLG9CQUFvQixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDaEcsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO0FBQzNELG9CQUFvQixDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztBQUN0QyxpQkFBaUI7QUFDakI7QUFDQTtBQUNBLGdCQUFnQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUU7QUFDcEcsb0JBQW9CLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztBQUNqRCxpQkFBaUI7QUFDakI7QUFDQTtBQUNBLGdCQUFnQixJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFDO0FBQ3pEO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUU7QUFDL0Msb0JBQW9CLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBRS9DO0FBQ3JCO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFDO0FBQ2xGLG9CQUFvQixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUU7QUFDOUQsd0JBQXdCLGtCQUFrQixFQUFFLElBQUk7QUFDaEQsd0JBQXdCLFdBQVcsRUFBRSxJQUFJO0FBQ3pDLHdCQUF3QixRQUFRLEVBQUUsSUFBSTtBQUN0Qyx3QkFBd0IsdUJBQXVCLEVBQUUsSUFBSTtBQUNyRCxxQkFBcUIsRUFBQztBQUN0QixvQkFBb0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBQztBQUM5RTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQzFELG9CQUFvQixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBQztBQUM1RjtBQUNBLG9CQUFvQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFO0FBQ2pEO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFO0FBQ2xFLDRCQUE0QixrQkFBa0IsRUFBRSxJQUFJO0FBQ3BELDRCQUE0QixVQUFVLEVBQUUsSUFBSTtBQUM1Qyw0QkFBNEIsY0FBYyxFQUFFLElBQUk7QUFDaEQsNEJBQTRCLFdBQVcsRUFBRSxJQUFJO0FBQzdDLDRCQUE0QixRQUFRLEVBQUUsSUFBSTtBQUMxQyw0QkFBNEIsdUJBQXVCLEVBQUUsSUFBSTtBQUN6RCx5QkFBeUIsRUFBQztBQUMxQjtBQUNBLHdCQUF3QixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLEdBQUcsS0FBSztBQUN4Ryw0QkFBNEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFDO0FBQ3RELHlCQUF5QixFQUFDO0FBQzFCLHdCQUF3QixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEdBQUcsS0FBSztBQUN0Ryw0QkFBNEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFDO0FBQ3BELHlCQUF5QixFQUFDO0FBQzFCLHFCQUFxQjtBQUNyQjtBQUNBO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFFO0FBQ3BELG9CQUFvQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLEdBQUcsR0FBRTtBQUNwRCxpQkFBaUIsTUFBTTtBQUN2QjtBQUNBLG9CQUFvQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRTtBQUNwRSx3QkFBd0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBQztBQUNoRSxxQkFBcUI7QUFDckIsb0JBQW9CLElBQUksQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLHdCQUF3QixFQUFDO0FBQ3JFLGlCQUFpQjtBQUNqQjtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdCQUFnQixJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxFQUFFO0FBQ3ZELG9CQUFvQixJQUFJLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUM7QUFDeEQsaUJBQWlCO0FBQ2pCO0FBQ0EsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7QUFDN0M7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxVQUFVLFdBQVcsRUFBRTtBQUN2RSx3QkFBd0IsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDO0FBQzlDLHdCQUF3QixJQUFJLEtBQUssQ0FBQztBQUNsQyx3QkFBd0IsSUFBSSxXQUFXLEVBQUU7QUFDekM7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsR0FBRyxjQUFjLENBQUM7QUFDekY7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLFVBQVUsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO0FBQ3JGLHlCQUF5QixNQUFNO0FBQy9CO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsZUFBYztBQUN0Rix5QkFBeUI7QUFDekI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixJQUFJLE1BQU0sQ0FBQztBQUNuQyx3QkFBd0IsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUMzRCw0QkFBNEIsTUFBTSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25FLHlCQUF5QixNQUFNO0FBQy9CLDRCQUE0QixNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUM7QUFDdkU7QUFDQTtBQUNBLDRCQUE0QixNQUFNLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7QUFDdEU7QUFDQTtBQUNBO0FBQ0E7QUFDQSw0QkFBNEIsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUU7QUFDN0QsZ0NBQWdDLFFBQVEsRUFBRSxvQkFBb0I7QUFDOUQsZ0NBQWdDLFVBQVUsRUFBRSxVQUFVO0FBQ3RELGdDQUFnQyxLQUFLLEVBQUUsT0FBTztBQUM5QyxnQ0FBZ0MsU0FBUyxFQUFFLEtBQUs7QUFDaEQsNkJBQTZCLENBQUMsQ0FBQztBQUMvQiw0QkFBNEIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2hFLHlCQUF5QjtBQUN6QjtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7QUFDaEQsd0JBQXdCLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUk7QUFDekYsNEJBQTRCLElBQUksQ0FBQyxTQUFTLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUM7QUFDbEY7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTtBQUN2RSxnQ0FBZ0QsV0FBVyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUM7QUFDbkY7QUFDQTtBQUNBO0FBQ0EsNkJBQTZCO0FBQzdCLHlCQUF5QixFQUFDO0FBQzFCLHNCQUFxQjtBQUNyQixvQkFBb0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3BGO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxjQUFjLEdBQUcsWUFBWTtBQUN0RCx3QkFBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSTtBQUNsRiw0QkFBNEIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsRUFBQztBQUNsRSx5QkFBeUIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNO0FBQ3ZDLDRCQUE0QixJQUFJLENBQUMsb0JBQW9CLEdBQUU7QUFDdkQseUJBQXlCLEVBQUM7QUFDMUIsc0JBQXFCO0FBQ3JCLG9CQUFvQixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUN4RTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG9CQUFvQixJQUFJLEdBQUcsQ0FBQyxVQUFVLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsRUFBRTtBQUN4RSx3QkFBd0IsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQzlDLHFCQUFxQixNQUFNO0FBQzNCLHdCQUF3QixJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFDO0FBQzNHLHFCQUFxQjtBQUNyQixpQkFBaUI7QUFDakIsYUFBYSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSTtBQUMxQixnQkFBZ0IsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxFQUFDO0FBQzFGLGFBQWEsRUFBQztBQUNkLFVBQVM7QUFDVDtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLEVBQUU7QUFDaEQsWUFBWSxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxNQUFNO0FBQzNELGdCQUFnQixNQUFNLEdBQUU7QUFDeEIsYUFBYTtBQUNiLFlBQVksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUM7QUFDM0IsU0FBUyxNQUFNO0FBQ2YsWUFBWSxNQUFNLEdBQUU7QUFDcEIsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDekIsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRTtBQUM5QixTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0EsSUFBSSxLQUFLLEVBQUUsWUFBWTtBQUN2QixRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtBQUN6QixZQUFZLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFFO0FBQy9CLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksT0FBTyxFQUFFLFNBQVMsR0FBRyxFQUFFO0FBQzNCLFFBQVEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUM7QUFDN0MsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUM7QUFDaEMsS0FBSztBQUNMO0FBQ0E7QUFDQSxJQUFJLGFBQWEsRUFBRSxXQUFXO0FBQzlCLFFBQVEsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFO0FBQzVCLFlBQVksT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRTtBQUNqRCxTQUFTLE1BQU07QUFDZixZQUFZLE9BQU8sSUFBSSxDQUFDO0FBQ3hCLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLGFBQWEsRUFBRSxTQUFTLFVBQVUsRUFBRTtBQUN4QyxRQUFRLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRTtBQUM1QixZQUFZLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDO0FBQzNELFNBQVM7QUFDVCxRQUFRLE9BQU8sSUFBSTtBQUNuQixLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksYUFBYSxFQUFFLFdBQVc7QUFDOUIsUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7QUFDekIsWUFBWSxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO0FBQzlDLFNBQVM7QUFDVDtBQUNBLFFBQVEsT0FBTyxDQUFDLElBQUksQ0FBQyx5RUFBeUUsRUFBQztBQUMvRixRQUFRLE9BQU8sSUFBSTtBQUNuQixLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksSUFBSSxFQUFFLFVBQVUsSUFBSSxFQUFFO0FBQzFCLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTTtBQUNoQztBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRTtBQUN2QztBQUNBLFlBQVksTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO0FBQzFGLFlBQVksSUFBSSxrQkFBa0IsR0FBRyxHQUFFO0FBQ3ZDO0FBQ0EsWUFBWSxJQUFJLGFBQWEsRUFBRSxhQUFhLENBQUM7QUFDN0MsWUFBWSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ3BFLFlBQVksSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsT0FBTztBQUMzQztBQUNBLFlBQVksSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLGdCQUFlO0FBQzlDLFlBQVksSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEtBQUssT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFO0FBQ3BHLGNBQWMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDM0UsYUFBYTtBQUNiLFlBQVk7QUFDWixjQUFjLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sS0FBSyxPQUFPO0FBQzlELGNBQWMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJO0FBQ2hELGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYztBQUN0QyxjQUFjO0FBQ2QsY0FBYyxhQUFhLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztBQUM3RSxhQUFhO0FBQ2IsWUFBWSxJQUFJLGFBQWEsRUFBRTtBQUMvQixnQkFBZ0IsSUFBSSxHQUFHLEdBQUcsYUFBYSxDQUFDLFNBQVE7QUFDaEQsZ0JBQWdCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsTUFBTSxHQUFFO0FBQ2hHLGdCQUFnQixHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBQztBQUM5QyxnQkFBZ0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBQztBQUM1QztBQUNBLGdCQUFnQixrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBQztBQUN2RCxhQUFhO0FBQ2IsWUFBWTtBQUNaLGNBQWMsV0FBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxLQUFLLE9BQU87QUFDL0QsY0FBYyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUk7QUFDakQsY0FBYyxDQUFDLFFBQVEsQ0FBQyxlQUFlO0FBQ3ZDLGNBQWM7QUFDZCxjQUFjLGFBQWEsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO0FBQzlFLGFBQWE7QUFDYixZQUFZLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsT0FBTyxLQUFLLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRTtBQUN0RyxnQkFBZ0IsYUFBYSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDOUUsYUFBYTtBQUNiLFlBQVksSUFBSSxhQUFhLEVBQUU7QUFDL0IsZ0JBQWdCLElBQUksR0FBRyxHQUFHLGFBQWEsQ0FBQyxTQUFRO0FBQ2hELGdCQUFnQixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRTtBQUNoRyxnQkFBZ0IsR0FBRyxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUM7QUFDOUMsZ0JBQWdCLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUM7QUFDNUMsZ0JBQWdCLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFDO0FBQ3ZELGFBQWE7QUFDYjtBQUNBLFlBQVksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsZUFBZSxHQUFHLG1CQUFrQjtBQUN2RSxTQUFTO0FBQ1Q7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7QUFDckM7QUFDQSxZQUFZLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRTtBQUM5RDtBQUNBO0FBQ0EsWUFBWSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFO0FBQ3hDLGdCQUFnQixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxNQUFLO0FBQzlDLGdCQUFnQixJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFDO0FBQ3ZFLGFBQWE7QUFDYixTQUFTO0FBQ1Q7QUFDQSxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUM5QixLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsSUFBSSxhQUFhLEVBQUUsWUFBWTtBQUMvQixRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxFQUFFLEVBQUU7QUFDbEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQVksSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBUztBQUMvRCxTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEVBQUM7QUFDOUQ7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQzFDLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxxREFBcUQsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFDO0FBQzlGLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFJO0FBQ3JDLFNBQVMsTUFBTTtBQUNmLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUMsQ0FBQyxFQUFDO0FBQzFDLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLFVBQVUsRUFBRSxrQkFBa0I7QUFDbEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUSxJQUFJLFVBQVUsR0FBR0EsYUFBYyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUM7QUFDM0QsUUFBUSxJQUFJLENBQUMsVUFBVSxFQUFFO0FBQ3pCLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxrREFBa0QsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDbEcsWUFBWSxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUk7QUFDOUIsWUFBWSxPQUFPO0FBQ25CLFNBQVM7QUFDVDtBQUNBLFFBQVEsSUFBSTtBQUNaLFlBQVksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDMUQsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFO0FBQ3BCLFlBQVksT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ2hGLFlBQVksSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFJO0FBQzlCLFNBQVM7QUFDVCxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQztBQUN4QixZQUFZLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxHQUFHLEtBQUk7QUFDMUM7QUFDQTtBQUNBO0FBQ0EsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsTUFBTTtBQUNqRDtBQUNBO0FBQ0EsZ0JBQWdCLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUM7QUFDckQsYUFBYSxFQUFDO0FBQ2QsU0FBUyxNQUFNO0FBQ2YsWUFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLDBEQUEwRCxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMxRyxTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0EsSUFBSSxNQUFNLEVBQUUsWUFBWTtBQUN4QixRQUFRLElBQUksQ0FBQyxhQUFhLEdBQUU7QUFDNUIsS0FBSztBQUNMO0FBQ0EsSUFBSSxhQUFhLEVBQUUsWUFBWTtBQUMvQixRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUU7QUFDdkMsWUFBWSxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBQztBQUN2RixTQUFTO0FBQ1Q7QUFDQSxRQUFRLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLDRCQUE0QixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUM7QUFDL0Y7QUFDQSxRQUFRLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUM7QUFDakQsUUFBUSxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxZQUFZLEVBQUM7QUFDekQsUUFBUSxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUk7QUFDbkM7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUU7QUFDbEUsWUFBWSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBQztBQUNqRSxTQUFTO0FBQ1QsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sR0FBRTtBQUM3QixRQUFRLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSTtBQUMxQixLQUFLO0FBQ0wsQ0FBQyxFQUFDO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLENBQUMsaUJBQWlCLENBQUMsYUFBYSxFQUFFO0FBQ3hDLElBQUksTUFBTSxFQUFFO0FBQ1osUUFBUSxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUM7QUFDbkQsS0FBSztBQUNMLElBQUksSUFBSSxFQUFFLFlBQVk7QUFDdEIsUUFBUSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNELFFBQVEsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMzRDtBQUNBLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLGFBQWEsRUFBRSxDQUFDO0FBQ2xELFFBQVEsSUFBSTtBQUNaLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBQztBQUNqRixZQUFZLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQy9FLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRTtBQUNuQixZQUFZLE9BQU8sQ0FBQyxLQUFLLENBQUMsOENBQThDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUM7QUFDN0YsWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUk7QUFDbEMsWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUU7QUFDaEMsU0FBUztBQUNULFFBQVEsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7QUFDN0IsS0FBSztBQUNMO0FBQ0EsSUFBSSxNQUFNLEdBQUc7QUFDYixRQUFRLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxJQUFJLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDbkUsUUFBUSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDMUIsWUFBWSxJQUFJO0FBQ2hCLGdCQUFnQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBQztBQUN0RjtBQUNBO0FBQ0EsZ0JBQWdCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7QUFDdkQsZ0JBQWdCLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSTtBQUNuQyxhQUFhLENBQUMsTUFBTSxDQUFDLEVBQUU7QUFDdkIsZ0JBQWdCLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0NBQStDLEVBQUUsQ0FBQyxFQUFDO0FBQ2pGLGdCQUFnQixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUk7QUFDdEMsZ0JBQWdCLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRTtBQUNwQyxhQUFhO0FBQ2IsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksSUFBSSxHQUFHO0FBQ1gsUUFBUSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRTtBQUMxQztBQUNBLFlBQVksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO0FBQzNCLGdCQUFnQixHQUFHLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDM0YsYUFBYTtBQUNiLFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQSxJQUFJLGFBQWEsR0FBRztBQUNwQixRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFDMUY7QUFDQSxRQUFRLE9BQU8sSUFBSSxDQUFDO0FBQ3BCLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLGFBQWEsQ0FBQyxVQUFVLEVBQUU7QUFDOUIsUUFBUSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQzFGO0FBQ0EsUUFBUSxJQUFJO0FBQ1osWUFBWSxJQUFJLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFDO0FBQzNFLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxXQUFVO0FBQ3hDLFlBQVksSUFBSSxDQUFDLFVBQVUsR0FBRyxXQUFVO0FBQ3hDLFlBQVksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLFlBQVksRUFBRSxVQUFVLENBQUMsQ0FBQztBQUMxRSxZQUFZLE9BQU8sSUFBSTtBQUN2QixTQUFTLENBQUMsT0FBTyxDQUFDLEVBQUU7QUFDcEIsWUFBWSxPQUFPLENBQUMsS0FBSyxDQUFDLGtEQUFrRCxFQUFDO0FBQzdFLFlBQVksT0FBTyxLQUFLO0FBQ3hCLFNBQVM7QUFDVCxLQUFLO0FBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDSDtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDbEQ7QUFDQSxNQUFNLENBQUMsa0JBQWtCO0FBQ3pCLElBQUksV0FBVztBQUNmLElBQUksQ0FBQztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxFQUFFLENBQUM7QUFDSCxJQUFHO0FBaUJIO0FBQ0EsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7QUFDaEIsR0FBRyxRQUFRLEVBQUUsb0JBQW9CO0FBQ2pDLElBQUksVUFBVSxFQUFFO0FBQ2hCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSTtBQUNKLE9BQU8sU0FBUyxFQUFFLGFBQWE7QUFDL0IsT0FBTyxRQUFRLEVBQUUsWUFBWTtBQUM3QixLQUFLLENBQUM7QUFDTixNQUFNLHVCQUF1QixFQUFFO0FBQy9CLE1BQU07QUFDTixZQUFZLFNBQVMsRUFBRSxhQUFhO0FBQ3BDLFlBQVksUUFBUSxFQUFFLFlBQVk7QUFDbEMsT0FBTztBQUNQLEtBQUs7QUFDTDtBQUNBLEdBQUcsQ0FBQzs7QUNydEJKOzs7O0FBYUEsTUFBTSxDQUFDLGlCQUFpQixDQUFDLG1CQUFtQixFQUFFO0lBQzFDLFVBQVUsRUFBRSxFQUFlO0lBRTNCLE1BQU0sRUFBRTtRQUNKLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtRQUN2QyxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUU7S0FDekM7SUFFRCxJQUFJLEVBQUU7UUFDRixJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7WUFDOUIsT0FBTyxDQUFDLElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxDQUFBO1lBQ3hELE9BQU07U0FDVDs7O1FBSUQsSUFBSSxJQUFJLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFBO1FBQ2hFLElBQUksSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFO1lBQzFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQTtTQUNwQixDQUFDLENBQUM7S0FDTjtJQUVELFVBQVUsRUFBRTs7UUFDUixJQUFJLENBQUMsR0FBRyxNQUFBLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTywwQ0FBRSxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFjLENBQUE7UUFDaEYsSUFBSSxDQUFDLElBQUksU0FBUyxFQUFFO1lBQ2hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsa0JBQWtCLENBQUMsQ0FBQTtZQUNsRixPQUFNO1NBQ1Q7UUFFRCxJQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFHO1lBQ3JFLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLEVBQUU7Z0JBQ2pDLElBQUksRUFBRSxHQUFHO29CQUNMLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUE7b0JBQ3JCLENBQUMsQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFBO2lCQUM5QyxDQUFBO2dCQUNGLENBQUMsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxDQUFBO2FBQzVDO2lCQUFNO2dCQUNILElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUE7YUFDeEI7U0FDSjthQUFNO1lBQ0gsT0FBTyxDQUFDLElBQUksQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRywwQkFBMEIsQ0FBQyxDQUFBO1NBQzdGO0tBRUo7SUFFRCxhQUFhLEVBQUUsVUFBVSxLQUFnQjtRQUNyQyxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFBO1FBQ3BELElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxTQUFTLEVBQUU7WUFDOUIsT0FBTyxDQUFDLElBQUksQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRywwQkFBMEIsQ0FBQyxDQUFBO1NBQzdGOzs7Ozs7UUFRRCxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQTtRQUNwRixJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixFQUFFLE1BQU0sSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUE7UUFDcEUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsRUFBRSxNQUFNLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFBO0tBQ3ZFO0lBRUQsV0FBVyxFQUFFO1FBQ1QsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUU7O1lBRWxDLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxFQUFFLENBQUE7U0FDbEM7S0FDSjtJQUVELFdBQVcsRUFBRTtRQUNULElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUU7O1lBRW5DLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxFQUFFLENBQUE7U0FDbEM7S0FDSjtDQUNKLENBQUM7O0FDeEZrQixJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUc7QUFDakIsSUFBSSxLQUFLLENBQUMsVUFBVSxHQUFHO0FBbUQ5QztBQUNBLE1BQU0sUUFBUSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDO0FBQ3pDLFNBQVMsY0FBYyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUU7QUFDNUMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFO0FBQ2xDLElBQUksUUFBUSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNuQyxHQUFHO0FBQ0gsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUMvQixFQUFFLElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRTtBQUN2QixJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7QUFDckMsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUM3RyxHQUFHLE1BQU07QUFDVCxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUMvQyxHQUFHO0FBQ0gsRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3BGLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixHQUFHLElBQUksQ0FBQztBQUNoRCxDQUFDO0FBc0lEO0FBQ2lDLEVBQUMsV0FBVztBQUM3QyxFQUFFLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ25DLEVBQUUsTUFBTSxHQUFHLEdBQUc7QUFDZCxJQUFJLFFBQVEsRUFBRSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUU7QUFDakMsSUFBSSxVQUFVLEVBQUUsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO0FBQ3RDLElBQUksS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRTtBQUM5QixHQUFHLENBQUM7QUFDSixFQUFFLE1BQU0sS0FBSyxHQUFHO0FBQ2hCLElBQUksUUFBUSxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRTtBQUNqQyxJQUFJLFVBQVUsRUFBRSxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUU7QUFDdEMsSUFBSSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFO0FBQzlCLEdBQUcsQ0FBQztBQUNKLEVBQUUsTUFBTSxZQUFZLEdBQUc7QUFDdkIsSUFBSSxRQUFRLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFO0FBQ2pDLElBQUksVUFBVSxFQUFFLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRTtBQUN0QyxJQUFJLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUU7QUFDOUIsR0FBRyxDQUFDO0FBQ0osRUFBRSxPQUFPLFNBQVMsU0FBUyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFO0FBQ3pELElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDNUUsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUN4RSxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQ2hHLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxXQUFXO0FBQ3JDLE1BQU0sS0FBSyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO0FBQ3RELE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQ2xELE1BQU0sUUFBUTtBQUNkLEtBQUssQ0FBQztBQUNOLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxXQUFXO0FBQ2xDLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUM7QUFDL0MsTUFBTSxHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQztBQUMzQyxNQUFNLFFBQVE7QUFDZCxLQUFLLENBQUM7QUFDTixJQUFJLE9BQU8sT0FBTyxDQUFDLE9BQU87QUFDMUIsTUFBTSxZQUFZLENBQUMsUUFBUTtBQUMzQixNQUFNLFlBQVksQ0FBQyxVQUFVO0FBQzdCLE1BQU0sWUFBWSxDQUFDLEtBQUs7QUFDeEIsS0FBSyxDQUFDO0FBQ04sR0FBRyxDQUFDO0FBQ0osRUFBQyxJQUFJO0FBQ0w7QUFDcUMsRUFBQyxXQUFXO0FBQ2pELEVBQUUsTUFBTSxJQUFJLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDbkMsRUFBRSxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUNuQyxFQUFFLE9BQU8sU0FBUyxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQzlCLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQzFCLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQzFCLElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEQsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNsRCxJQUFJLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3hDLEdBQUcsQ0FBQztBQUNKLEVBQUMsSUFBSTtBQVFMO0FBQ08sTUFBTSxjQUFjLEdBQUcsQ0FBQyxXQUFXO0FBQzFDLEVBQUUsTUFBTSxjQUFjLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDN0MsRUFBRSxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUN4QyxFQUFFLE1BQU0sVUFBVSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ3pDLEVBQUUsTUFBTSxPQUFPLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDdEMsRUFBRSxNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUN0QyxFQUFFLE1BQU0sQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ2hDLEVBQUUsTUFBTSxVQUFVLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDekMsRUFBRSxPQUFPLFNBQVMsY0FBYyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUU7QUFDbEQsSUFBSSxjQUFjLENBQUMsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUN2RSxJQUFJLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDeEUsSUFBSSxVQUFVO0FBQ2QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0FBQ3RCLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ25FLE9BQU8sU0FBUyxFQUFFLENBQUM7QUFDbkIsSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUM5QyxJQUFJLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2RSxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDcEQsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM5RCxJQUFJLE9BQU8sT0FBTyxDQUFDO0FBQ25CLEdBQUcsQ0FBQztBQUNKLENBQUMsR0FBRyxDQUFDO0FBQ0w7QUFDbUQsRUFBQyxXQUFXO0FBQy9ELEVBQUUsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUN2RCxFQUFFLE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDekQsRUFBRSxNQUFNLGlCQUFpQixHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ2hELEVBQUUsT0FBTyxTQUFTLG1DQUFtQyxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxPQUFPLEVBQUU7QUFDbkcsSUFBSSxjQUFjLENBQUMsZUFBZSxFQUFFLHdCQUF3QixDQUFDLENBQUM7QUFDOUQsSUFBSSxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDckYsSUFBSSxjQUFjLENBQUMsaUJBQWlCLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztBQUNsRSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUN6RSxHQUFHLENBQUM7QUFDSixFQUFDLElBQUk7QUFnQkw7QUFDMEMsRUFBQyxXQUFXO0FBQ3RELEVBQUUsTUFBTSxVQUFVLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDekMsRUFBRSxNQUFNLGFBQWEsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUM1QyxFQUFFLE1BQU0sV0FBVyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzFDLEVBQUUsTUFBTSxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDaEMsRUFBRSxPQUFPLFNBQVMsMEJBQTBCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7QUFDckUsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzVCLElBQUksT0FBTyxPQUFPO0FBQ2xCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUNqRyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDOUMsT0FBTyxXQUFXLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDeEQsR0FBRyxDQUFDO0FBQ0osRUFBQyxJQUFJO0FBQ0w7QUFDMEIsRUFBQyxXQUFXO0FBQ3RDLEVBQUUsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUNqRCxFQUFFLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDcEQsRUFBRSxNQUFNLFlBQVksR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUMzQyxFQUFFLE1BQU0sZUFBZSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzlDO0FBQ0EsRUFBRSxPQUFPLFNBQVMsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3BELElBQUksTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQzVCLElBQUksa0JBQWtCLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUN0RCxJQUFJLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUMzQixJQUFJLHFCQUFxQixDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUNsRixJQUFJLFlBQVksQ0FBQyxVQUFVLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUNuRCxJQUFJLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFDM0QsSUFBSSxjQUFjLENBQUMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBQzVDLEdBQUcsQ0FBQztBQUNKLEVBQUM7O0FDNVVELE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxZQUFZO0FBQzFDLElBQUksTUFBTSxXQUFXLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDNUMsSUFBSSxNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUN4QyxJQUFJLE1BQU0sWUFBWSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzdDLElBQUksTUFBTSxVQUFVLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDM0MsSUFBSSxNQUFNLGFBQWEsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUM5QyxJQUFJLE1BQU0sV0FBVyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzVDO0FBQ0EsSUFBSSxPQUFPLFNBQVMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRTtBQUN6RCxRQUFRLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUNoQyxRQUFRLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDOUQsUUFBUSxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7QUFDaEMsUUFBUSxhQUFhLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ2hFLFFBQVEsWUFBWSxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDNUQsUUFBUSxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMzQixRQUFRLFlBQVksQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUNqQyxRQUFRLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUM3QixRQUFRLFVBQVUsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3ZELFFBQVEsV0FBVyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BGLFFBQVEsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQ25ELFFBQVEsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQ25ELFFBQVEsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQ25ELFFBQVEsT0FBTyxXQUFXLENBQUM7QUFDM0IsS0FBSyxDQUFDO0FBQ04sQ0FBQyxHQUFHLENBQUM7QUFDTDtBQUNBLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxLQUFLLENBQUMsSUFBSTtBQUN6QyxJQUFJLElBQUksS0FBSyxDQUFDLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN2RCxJQUFJLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDO0FBQ2hDLFFBQVEsT0FBTyxFQUFFLElBQUk7QUFDckIsUUFBUSxTQUFTLEVBQUUsS0FBSztBQUN4QixRQUFRLElBQUksRUFBRSxLQUFLLENBQUMsVUFBVTtBQUM5QixRQUFRLFdBQVcsRUFBRSxJQUFJO0FBQ3pCLFFBQVEsT0FBTyxFQUFFLEdBQUc7QUFDcEIsS0FBSyxDQUFDO0FBQ04sQ0FBQyxDQUFDO0FBQ0YsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJO0FBQzFDLElBQUksSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZELElBQUksSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUM7QUFDaEMsUUFBUSxPQUFPLEVBQUUsSUFBSTtBQUNyQixRQUFRLFNBQVMsRUFBRSxLQUFLO0FBQ3hCLFFBQVEsSUFBSSxFQUFFLEtBQUssQ0FBQyxVQUFVO0FBQzlCLFFBQVEsV0FBVyxFQUFFLElBQUk7QUFDekIsUUFBUSxPQUFPLEVBQUUsR0FBRztBQUNwQixLQUFLLENBQUM7QUFDTixDQUFDLENBQUM7QUFDRjtBQUNPLE1BQU0saUJBQWlCLENBQUM7QUFDL0IsSUFBSSxXQUFXLENBQUMsRUFBRSxFQUFFO0FBQ3BCLFFBQVEsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDckI7QUFDQSxRQUFRLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ2hDLFFBQVEsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7QUFDbkMsUUFBUSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ2pELFFBQVEsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUMzQyxRQUFRLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDOUMsUUFBUSxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztBQUNoQyxRQUFRLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUM1RCxRQUFRLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUNyRCxRQUFRLElBQUksQ0FBQyxLQUFLLEdBQUc7QUFDckIsWUFBWSxDQUFDLEVBQUUsQ0FBQztBQUNoQixZQUFZLENBQUMsRUFBRSxDQUFDO0FBQ2hCLFNBQVMsQ0FBQztBQUNWLFFBQVEsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUNoRCxRQUFRLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDOUM7QUFDQSxRQUFRLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7QUFDL0MsUUFBUSxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ2xELFFBQVEsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUMvQyxLQUFLO0FBQ0w7QUFDQSxJQUFJLGNBQWMsQ0FBQyxHQUFHLEVBQUU7QUFDeEIsUUFBUSxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsb0JBQW9CLENBQUM7QUFDcEY7QUFDQTtBQUNBLFFBQVEsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztBQUNoRSxRQUFRLElBQUksa0JBQWtCLEdBQUcsR0FBRTtBQUNuQztBQUNBLFFBQVEsSUFBSSxhQUFhLEVBQUUsYUFBYSxDQUFDO0FBQ3pDLFFBQVEsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsT0FBTztBQUN2QztBQUNBO0FBQ0EsUUFBUSxJQUFJLE9BQU8sR0FBRyxJQUFHO0FBQ3pCLFFBQVEsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEtBQUssT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFO0FBQ2hHLFlBQVksYUFBYSxHQUFHO0FBQzVCLGdCQUFnQixNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVE7QUFDcEUsZ0JBQWdCLFVBQVUsRUFBRSxXQUFXLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDO0FBQzlGLGNBQWE7QUFDYixTQUFTO0FBQ1QsUUFBUTtBQUNSLFlBQVksV0FBVyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxLQUFLLE9BQU87QUFDNUQsWUFBWSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUk7QUFDOUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxjQUFjO0FBQ3BDLFVBQVU7QUFDVixZQUFZLGFBQWEsR0FBRztBQUM1QixnQkFBZ0IsTUFBTSxFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRO0FBQ3RFLGdCQUFnQixVQUFVLEVBQUUsV0FBVyxDQUFDLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQztBQUM5RixjQUFhO0FBQ2I7QUFDQSxTQUFTO0FBQ1QsUUFBUSxJQUFJLGFBQWEsRUFBRTtBQUMzQixZQUFZLGtCQUFrQixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUM7QUFDbEQsU0FBUztBQUNULFFBQVE7QUFDUixZQUFZLFdBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sS0FBSyxPQUFPO0FBQzdELFlBQVksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJO0FBQy9DLFlBQVksQ0FBQyxRQUFRLENBQUMsZUFBZTtBQUNyQyxVQUFVO0FBQ1YsWUFBWSxhQUFhLEdBQUc7QUFDNUIsZ0JBQWdCLE1BQU0sRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUTtBQUN2RSxnQkFBZ0IsVUFBVSxFQUFFLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUM7QUFDL0YsY0FBYTtBQUNiLFNBQVM7QUFDVCxRQUFRLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsT0FBTyxLQUFLLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRTtBQUNsRyxZQUFZLGFBQWEsR0FBRztBQUM1QixnQkFBZ0IsTUFBTSxFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRO0FBQ3JFLGdCQUFnQixVQUFVLEVBQUUsV0FBVyxDQUFDLHVCQUF1QixDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQztBQUMvRixjQUFhO0FBQ2IsU0FBUztBQUNULFFBQVEsSUFBSSxhQUFhLEVBQUU7QUFDM0IsWUFBWSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFDO0FBQ2xELFNBQVM7QUFDVCxRQUFRLE9BQU8sa0JBQWtCO0FBQ2pDLEtBQUs7QUFDTDtBQUNBLElBQUksT0FBTyxHQUFHO0FBQ2QsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFO0FBQzFDLFlBQVksSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksQ0FBQztBQUMvQyxZQUFZLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7QUFDcEU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWSxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDOUUsWUFBWSxJQUFJLENBQUMsb0JBQW9CLEdBQUcsV0FBVyxDQUFDLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQzNHLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDO0FBQ3JFLFlBQVksSUFBSSxDQUFDLHFCQUFxQixHQUFHLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUM3RyxZQUFZLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQztBQUN2RTtBQUNBLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQztBQUM5RixTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0EsSUFBSSxlQUFlLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRTtBQUN6QyxRQUFRLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUN2QixRQUFRLElBQUksUUFBUSxHQUFHLFVBQVUsQ0FBQyxPQUFNO0FBQ3hDLFFBQVEsSUFBSSxTQUFTLEdBQUcsUUFBUSxLQUFLLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO0FBQ2pHO0FBQ0EsUUFBUSxJQUFJLFVBQVUsR0FBRyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ25FLFFBQVEsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUNuQyxZQUFZLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2pDLFNBQVM7QUFDVCxRQUFRLE9BQU8sSUFBSSxDQUFDO0FBQ3BCLEtBQUs7QUFDTDtBQUNBLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRTtBQUNqQixRQUFRLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRTtBQUM3QixZQUFZLE9BQU8sS0FBSyxDQUFDO0FBQ3pCLFNBQVM7QUFDVCxRQUFRLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUN2QjtBQUNBLFFBQVEsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxXQUFXLEdBQUcsa0JBQWtCLEdBQUcsbUJBQW1CLENBQUM7QUFDaEc7QUFDQSxRQUFRLGNBQWMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQy9GLFFBQVEsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUNuRSxRQUFRLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUNuRSxRQUFRLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUN0RSxRQUFRLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztBQUNwRyxRQUFRLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztBQUNuRDtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsWUFBWSxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQ3hDO0FBQ0EsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztBQUMvQixRQUFRLElBQUksQ0FBQyxjQUFjLEdBQUc7QUFDOUIsWUFBWSxNQUFNLEVBQUUsQ0FBQyxDQUFDLFFBQVE7QUFDOUIsWUFBWSxVQUFVLEVBQUUsQ0FBQyxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMscUJBQXFCO0FBQ2hILFVBQVM7QUFDVDtBQUNBLFFBQVEsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDL0QsUUFBUSxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLFdBQVc7QUFDdkQsYUFBYSxVQUFVO0FBQ3ZCLGdCQUFnQixJQUFJLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDO0FBQ3RGLGdCQUFnQixJQUFJLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztBQUN2RixhQUFhO0FBQ2IsYUFBYSxNQUFNLEVBQUUsQ0FBQztBQUN0QixRQUFRLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLENBQUM7QUFDbkMsUUFBUSxJQUFJLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztBQUNoQyxRQUFRLElBQUksQ0FBQyxLQUFLLEdBQUc7QUFDckIsWUFBWSxDQUFDLEVBQUUsQ0FBQztBQUNoQixZQUFZLENBQUMsRUFBRSxDQUFDO0FBQ2hCLFNBQVMsQ0FBQztBQUNWO0FBQ0EsUUFBUSxPQUFPLElBQUk7QUFDbkIsS0FBSztBQUNMO0FBQ0EsSUFBSSxPQUFPLENBQUMsQ0FBQyxFQUFFO0FBQ2YsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRTtBQUM5QixZQUFZLE9BQU87QUFDbkIsU0FBUztBQUNULFFBQVE7QUFDUixZQUFZLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLGFBQWE7QUFDckYsYUFBYSxDQUFDLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsY0FBYyxDQUFDO0FBQ3ZGLFVBQVU7QUFDVixZQUFZLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ3BDLFlBQVksSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7QUFDdkMsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBLElBQUksY0FBYyxHQUFHO0FBQ3JCLFFBQVEsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQ3RDLFFBQVEsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUM7QUFDdkMsUUFBUSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUM7QUFDbEMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMvRCxRQUFRLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUNqQyxRQUFRLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyQyxLQUFLO0FBQ0w7QUFDQSxJQUFJLElBQUksR0FBRztBQUNYLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsT0FBTyxJQUFJLENBQUM7QUFDMUMsUUFBUSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7QUFDbkQsUUFBUSxJQUFJLENBQUMsWUFBWSxFQUFFLE9BQU8sSUFBSSxDQUFDO0FBQ3ZDLFFBQVEsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDeEQsUUFBUSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7QUFDMUYsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDekQsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDNUQsUUFBUSxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7QUFDL0IsS0FBSztBQUNMLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNBQVMsNEJBQTRCLENBQUMsYUFBYSxFQUFFO0FBQzVELElBQUksT0FBTztBQUNYLFFBQVEsU0FBUyxFQUFFLFlBQVk7QUFDL0IsWUFBWSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFTO0FBQy9ELFlBQVksSUFBSSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7QUFDbEMsWUFBWSxJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztBQUNyQyxZQUFZLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO0FBQ3ZDLFlBQVksSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7QUFDckMsU0FBUztBQUNUO0FBQ0EsUUFBUSxVQUFVLEVBQUUsWUFBWTtBQUNoQyxZQUFZLElBQUksSUFBSSxHQUFHLHlCQUF5QixDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLEVBQUM7QUFDNUUsWUFBWSxJQUFJLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxDQUFDLEVBQUUsS0FBSztBQUNsRSxnQkFBZ0IsSUFBSSxDQUFDLFlBQVksR0FBRTtBQUNuQyxhQUFhLENBQUMsQ0FBQztBQUNmLFNBQVM7QUFDVDtBQUNBLFFBQVEsY0FBYyxFQUFFLFlBQVk7QUFDcEMsWUFBWSxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7QUFDcEMsZ0JBQWdCLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFDO0FBQzNGLGFBQWE7QUFDYixZQUFZLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUM7QUFDckQsWUFBWSxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUk7QUFDdkM7QUFDQSxZQUFZLElBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRTtBQUMvRCxnQkFBZ0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUM7QUFDckUsYUFBYTtBQUNiLFNBQVM7QUFDVDtBQUNBLFFBQVEsWUFBWSxFQUFFLFlBQVk7QUFDbEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWSxJQUFJLE1BQU0sR0FBRyxNQUFNO0FBQy9CO0FBQ0EsZ0JBQWdCLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTTtBQUMzQyxvQkFBb0IsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQzFDO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUk7QUFDN0M7QUFDQTtBQUNBLHdCQUF3QixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzNFLHdCQUF3QixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUMxRSxxQkFBcUI7QUFDckI7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsZUFBZSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFDO0FBQzdFLG9CQUFvQixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxLQUFJO0FBQ3pFO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxjQUFjLEdBQUU7QUFDekM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksS0FBSyxHQUFHLENBQUM7QUFDakMsd0JBQXdCLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDbkMsb0JBQW9CLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUU7QUFDM0Q7QUFDQSx3QkFBd0IsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBSztBQUN0RSx3QkFBd0IsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBSztBQUMzRCx3QkFBd0IsS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUM7QUFDbkQsd0JBQXdCLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFDO0FBQ3BELHdCQUF3QixNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDcEMsd0JBQXdCLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUNwQyx3QkFBd0IsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQ3BDLHdCQUF3QixJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7QUFDbEUscUJBQXFCLE1BQU07QUFDM0I7QUFDQTtBQUNBO0FBQ0Esd0JBQXdCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBQztBQUM5RCx3QkFBd0IsSUFBSSxJQUFJLEVBQUU7QUFDbEMsNEJBQTRCLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO0FBQ2hFLDRCQUE0QixLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUM7QUFDMUUsNEJBQTRCLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBQztBQUMzRSx5QkFBeUIsTUFBTTtBQUMvQiw0QkFBNEIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBSztBQUNsRSw0QkFBNEIsS0FBSyxHQUFHLFNBQVMsQ0FBQyxFQUFDO0FBQy9DLDRCQUE0QixNQUFNLEdBQUcsU0FBUyxDQUFDLEVBQUM7QUFDaEQsNEJBQTRCLFNBQVMsQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUMzQyw0QkFBNEIsU0FBUyxDQUFDLENBQUMsR0FBRyxFQUFDO0FBQzNDLDRCQUE0QixTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDM0MsNEJBQTRCLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQztBQUN0RSx5QkFBeUI7QUFDekI7QUFDQSx3QkFBd0IsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVE7QUFDeEUsd0JBQXdCLEtBQUssSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUM7QUFDaEQsd0JBQXdCLE1BQU0sSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUM7QUFDakQsd0JBQXdCLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDM0Msd0JBQXdCLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDM0Msd0JBQXdCLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUM7QUFDM0Msd0JBQXdCLE9BQU8sQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7QUFDekQscUJBQXFCO0FBQ3JCO0FBQ0Esb0JBQW9CLElBQUksS0FBSyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQ2pELHdCQUF3QixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFDO0FBQ25HLHdCQUF3QixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUU7QUFDbkUsNEJBQTRCLENBQUMsRUFBRSxLQUFLO0FBQ3BDLDRCQUE0QixDQUFDLEVBQUUsS0FBSztBQUNwQyw0QkFBNEIsQ0FBQyxFQUFFLEtBQUs7QUFDcEMseUJBQXlCLENBQUMsQ0FBQztBQUMzQixxQkFBcUI7QUFDckI7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFO0FBQy9ELHdCQUF3QixDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztBQUMxQyxxQkFBcUI7QUFDckI7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFDO0FBQzdEO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRTtBQUM1Qyx3QkFBd0IsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ2hGO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxFQUFDO0FBQ3ZGLHdCQUF3QixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUU7QUFDbEUsNEJBQTRCLGtCQUFrQixFQUFFLElBQUk7QUFDcEQsNEJBQTRCLFdBQVcsRUFBRSxJQUFJO0FBQzdDLDRCQUE0QixRQUFRLEVBQUUsSUFBSTtBQUMxQyw0QkFBNEIsdUJBQXVCLEVBQUUsSUFBSTtBQUN6RCx5QkFBeUIsRUFBQztBQUMxQix3QkFBd0IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBQztBQUNsRjtBQUNBO0FBQ0Esd0JBQXdCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQzlELHdCQUF3QixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBQztBQUNoRztBQUNBLHdCQUF3QixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUU7QUFDOUM7QUFDQTtBQUNBLDRCQUE0QixJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUU7QUFDdEUsZ0NBQWdDLGtCQUFrQixFQUFFLElBQUk7QUFDeEQsZ0NBQWdDLFVBQVUsRUFBRSxJQUFJO0FBQ2hELGdDQUFnQyxjQUFjLEVBQUUsSUFBSTtBQUNwRCxnQ0FBZ0MsV0FBVyxFQUFFLElBQUk7QUFDakQsZ0NBQWdDLFFBQVEsRUFBRSxJQUFJO0FBQzlDLGdDQUFnQyx1QkFBdUIsRUFBRSxJQUFJO0FBQzdELDZCQUE2QixFQUFDO0FBQzlCO0FBQ0EsNEJBQTRCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQ3RFLDRCQUE0QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUNsRSw0QkFBNEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxHQUFHLEtBQUs7QUFDNUcsZ0NBQWdDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFDO0FBQ25ELDZCQUE2QixFQUFDO0FBQzlCLDRCQUE0QixJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLEdBQUcsS0FBSztBQUMxRyxnQ0FBZ0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUM7QUFDakQsNkJBQTZCLEVBQUM7QUFDOUIseUJBQXlCO0FBQ3pCO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLEdBQUU7QUFDeEQsd0JBQXdCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFFO0FBQ3hELHFCQUFxQixNQUFNO0FBQzNCO0FBQ0Esd0JBQXdCLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFO0FBQ3hFLDRCQUE0QixJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFDO0FBQ3BFLHlCQUF5QjtBQUN6Qix3QkFBd0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsd0JBQXdCLEVBQUM7QUFDekUscUJBQXFCO0FBQ3JCO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLEVBQUU7QUFDM0Qsd0JBQXdCLElBQUksQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBQztBQUM1RCxxQkFBcUI7QUFDckI7QUFDQSxvQkFBb0IsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO0FBQzFDO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixJQUFJLENBQUMsb0JBQW9CLEdBQUcsVUFBVSxXQUFXLEVBQUU7QUFDM0UsNEJBQTRCLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQztBQUNsRCw0QkFBNEIsSUFBSSxLQUFLLENBQUM7QUFDdEMsNEJBQTRCLElBQUksV0FBVyxFQUFFO0FBQzdDO0FBQ0E7QUFDQTtBQUNBLGdDQUFnQyxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHLGFBQWEsQ0FBQztBQUNsRztBQUNBO0FBQ0E7QUFDQSxnQ0FBZ0MsVUFBVSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7QUFDekYsNkJBQTZCLE1BQU07QUFDbkM7QUFDQTtBQUNBO0FBQ0E7QUFDQSxnQ0FBZ0MsS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsYUFBYSxDQUFDO0FBQ2pHLDZCQUE2QjtBQUM3QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsNEJBQTRCLElBQUksTUFBTSxDQUFDO0FBQ3ZDLDRCQUE0QixJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFO0FBQy9ELGdDQUFnQyxNQUFNLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDdkUsNkJBQTZCLE1BQU07QUFDbkMsZ0NBQWdDLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBQztBQUMzRTtBQUNBO0FBQ0EsZ0NBQWdDLE1BQU0sQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztBQUMxRTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGdDQUFnQyxNQUFNLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRTtBQUNqRSxvQ0FBb0MsUUFBUSxFQUFFLEdBQUcsR0FBRyxhQUFhLEdBQUcsYUFBYTtBQUNqRixvQ0FBb0MsVUFBVSxFQUFFLFVBQVU7QUFDMUQsb0NBQW9DLEtBQUssRUFBRSxPQUFPO0FBQ2xELG9DQUFvQyxTQUFTLEVBQUUsS0FBSztBQUNwRCxpQ0FBaUMsQ0FBQyxDQUFDO0FBQ25DLGdDQUFnQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDcEUsNkJBQTZCO0FBQzdCO0FBQ0E7QUFDQTtBQUNBLDRCQUE0QixJQUFJLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQztBQUNwRCw0QkFBNEIsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSTtBQUM3RixnQ0FBZ0MsSUFBSSxDQUFDLFNBQVMsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLGFBQWEsR0FBRyxPQUFPLEVBQUM7QUFDaEcsNkJBQTZCLEVBQUM7QUFDOUIsMEJBQXlCO0FBQ3pCLHdCQUF3QixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUM7QUFDeEY7QUFDQSx3QkFBd0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxZQUFZO0FBQzFELDRCQUE0QixHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJO0FBQ3RGLGdDQUFnQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxFQUFDO0FBQ3RFLDZCQUE2QixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU07QUFDM0MsZ0NBQWdDLElBQUksQ0FBQyxvQkFBb0IsR0FBRTtBQUMzRCw2QkFBNkIsRUFBQztBQUM5QiwwQkFBeUI7QUFDekIsd0JBQXdCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFDO0FBQzVFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esd0JBQXdCLElBQUksR0FBRyxDQUFDLFVBQVUsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxFQUFFO0FBQzVFLDRCQUE0QixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7QUFDbEQseUJBQXlCLE1BQU07QUFDL0IsNEJBQTRCLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLDRCQUE0QixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUM7QUFDL0cseUJBQXlCO0FBQ3pCLHFCQUFxQjtBQUNyQixpQkFBaUIsRUFBQztBQUNsQixjQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0EsWUFBWSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFO0FBQ3BELGdCQUFnQixJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxNQUFNO0FBQy9ELG9CQUFvQixNQUFNLEdBQUU7QUFDNUIsaUJBQWlCLEVBQUU7QUFDbkIsb0JBQW9CLElBQUksRUFBRSxJQUFJO0FBQzlCLGlCQUFpQixFQUFDO0FBQ2xCLGFBQWEsTUFBTTtBQUNuQixnQkFBZ0IsTUFBTSxHQUFFO0FBQ3hCLGFBQWE7QUFDYixTQUFTO0FBQ1QsS0FBSztBQUNMLENBQUM7QUFDRDtBQUNPLFNBQVMsOEJBQThCLENBQUMsYUFBYSxFQUFFO0FBQzlEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsR0FBRyxPQUFPLEVBQUU7QUFDdEQsUUFBUSxNQUFNLEVBQUU7QUFDaEIsWUFBWSxVQUFVLEVBQUU7QUFDeEIsZ0JBQWdCLElBQUksRUFBRSxRQUFRO0FBQzlCLGdCQUFnQixPQUFPLEVBQUUsSUFBSTtBQUM3QixhQUFhO0FBQ2IsU0FBUztBQUNULFFBQVEsSUFBSSxFQUFFLFlBQVk7QUFDMUIsWUFBWSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQy9EO0FBQ0EsWUFBWSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUM7QUFDdEQsWUFBWSxJQUFJO0FBQ2hCLGdCQUFnQixJQUFJLENBQUMsVUFBVSxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFDO0FBQ3JGLGdCQUFnQixJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxhQUFhLEdBQUcsT0FBTyxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDN0YsYUFBYSxDQUFDLE9BQU8sQ0FBQyxFQUFFO0FBQ3hCLGdCQUFnQixPQUFPLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFDO0FBQzFGLGdCQUFnQixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUk7QUFDdEMsZ0JBQWdCLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRTtBQUNwQyxhQUFhO0FBQ2IsWUFBWSxJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztBQUNqQyxTQUFTO0FBQ1Q7QUFDQSxRQUFRLE1BQU0sR0FBRztBQUNqQixZQUFZLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxJQUFJLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDdkUsWUFBWSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7QUFDOUIsZ0JBQWdCLElBQUk7QUFDcEIsb0JBQW9CLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFDO0FBQzFGO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztBQUMzRCxvQkFBb0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFJO0FBQ3ZDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxFQUFFO0FBQzVCLG9CQUFvQixPQUFPLENBQUMsS0FBSyxDQUFDLDZDQUE2QyxFQUFFLENBQUMsRUFBQztBQUNuRixvQkFBb0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFJO0FBQzFDLG9CQUFvQixJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUU7QUFDeEMsaUJBQWlCO0FBQ2pCLGFBQWE7QUFDYixTQUFTO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksR0FBRztBQUNmLFlBQVksSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUU7QUFDOUM7QUFDQSxnQkFBZ0IsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO0FBQy9CLG9CQUFvQixHQUFHLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDL0YsaUJBQWlCO0FBQ2pCLGFBQWE7QUFDYixTQUFTO0FBQ1Q7QUFDQSxRQUFRLGFBQWEsQ0FBQyxVQUFVLEVBQUU7QUFDbEMsWUFBWSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQzlGO0FBQ0EsWUFBWSxJQUFJO0FBQ2hCLGdCQUFnQixJQUFJLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFDO0FBQy9FLGdCQUFnQixJQUFJLENBQUMsVUFBVSxHQUFHLFdBQVU7QUFDNUMsZ0JBQWdCLElBQUksQ0FBQyxVQUFVLEdBQUcsV0FBVTtBQUM1QyxnQkFBZ0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsYUFBYSxHQUFHLE9BQU8sRUFBRSxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDeEYsZ0JBQWdCLE9BQU8sSUFBSTtBQUMzQixhQUFhLENBQUMsT0FBTyxDQUFDLEVBQUU7QUFDeEIsZ0JBQWdCLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0RBQWdELEVBQUM7QUFDL0UsZ0JBQWdCLE9BQU8sS0FBSztBQUM1QixhQUFhO0FBQ2IsU0FBUztBQUNULEtBQUssQ0FBQyxDQUFDO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDdEQ7QUFDQSxJQUFJLE1BQU0sQ0FBQyxrQkFBa0I7QUFDN0IsUUFBUSxXQUFXO0FBQ25CLFFBQVEsQ0FBQztBQUNULGNBQWMsQ0FBQyxHQUFHLGFBQWEsR0FBRyxDQUFDO0FBQ25DO0FBQ0EsSUFBSSxDQUFDLEdBQUcsYUFBYSxHQUFHLENBQUM7QUFDekI7QUFDQTtBQUNBLENBQUM7QUFDRCxNQUFLO0FBQ0w7QUFDQSxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO0FBQ3BCLFFBQVEsUUFBUSxFQUFFLEdBQUcsR0FBRyxhQUFhLEdBQUcsYUFBYTtBQUNyRCxRQUFRLFVBQVUsRUFBRSxDQUFDO0FBQ3JCLFlBQVksU0FBUyxFQUFFLGFBQWEsR0FBRyxPQUFPO0FBQzlDLFlBQVksUUFBUSxFQUFFLFlBQVk7QUFDbEMsU0FBUyxDQUFDO0FBQ1YsUUFBUSx1QkFBdUIsRUFBRSxDQUFDO0FBQ2xDLFlBQVksU0FBUyxFQUFFLGFBQWEsR0FBRyxPQUFPO0FBQzlDLFlBQVksUUFBUSxFQUFFLFlBQVk7QUFDbEMsU0FBUyxDQUFDO0FBQ1Y7QUFDQSxLQUFLLENBQUMsQ0FBQztBQUNQOztBQ2xuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFLQTtBQUNBO0FBQ0E7QUFDQSxTQUFTLFdBQVcsR0FBRztBQUN2QixJQUFJLE9BQU8sSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDeEUsQ0FBQztBQUNEO0FBQ0EsU0FBUyxlQUFlLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUU7QUFDeEMsSUFBSSxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDO0FBQzNHLENBS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsSUFBSSxhQUFhLEdBQUcsV0FBVyxDQUFDO0FBQ2hDO0FBQ0E7QUFDQSxJQUFJLFFBQVEsR0FBRyw0QkFBNEIsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUMzRDtBQUNBO0FBQ0EsSUFBSSxLQUFLLEdBQUc7QUFDWixJQUFJLE1BQU0sRUFBRTtBQUNaO0FBQ0EsUUFBUSxJQUFJLEVBQUU7QUFDZCxZQUFZLElBQUksRUFBRSxRQUFRO0FBQzFCLFlBQVksT0FBTyxFQUFFLEVBQUU7QUFDdkIsU0FBUztBQUNUO0FBQ0E7QUFDQTtBQUNBLFFBQVEsV0FBVyxFQUFFO0FBQ3JCLFlBQVksSUFBSSxFQUFFLFNBQVM7QUFDM0IsWUFBWSxPQUFPLEVBQUUsS0FBSztBQUMxQixTQUFTO0FBQ1QsUUFBUSxhQUFhLEVBQUU7QUFDdkIsWUFBWSxJQUFJLEVBQUUsU0FBUztBQUMzQixZQUFZLE9BQU8sRUFBRSxJQUFJO0FBQ3pCLFNBQVM7QUFDVCxRQUFRLFdBQVcsRUFBRTtBQUNyQixZQUFZLElBQUksRUFBRSxTQUFTO0FBQzNCLFlBQVksT0FBTyxFQUFFLElBQUk7QUFDekIsU0FBUztBQUNUO0FBQ0E7QUFDQSxRQUFRLEtBQUssRUFBRTtBQUNmLFlBQVksSUFBSSxFQUFFLFFBQVE7QUFDMUIsWUFBWSxPQUFPLEVBQUUsQ0FBQztBQUN0QixTQUFTO0FBQ1QsUUFBUSxLQUFLLEVBQUU7QUFDZixZQUFZLElBQUksRUFBRSxRQUFRO0FBQzFCLFlBQVksT0FBTyxFQUFFLEVBQUU7QUFDdkIsU0FBUztBQUNULFFBQVEsVUFBVSxFQUFFO0FBQ3BCLFlBQVksSUFBSSxFQUFFLFFBQVE7QUFDMUIsWUFBWSxPQUFPLEVBQUUsRUFBRTtBQUN2QixTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCLFFBQVEsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0FBQ3pCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7QUFDNUM7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztBQUNqRCxRQUFRLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUM7QUFDckQsUUFBUSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO0FBQ2pEO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxVQUFVLEdBQUc7QUFDMUIsWUFBWSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDO0FBQ3pGLFlBQVksUUFBUSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRTtBQUN2QyxZQUFZLFFBQVEsRUFBRSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDaEQsU0FBUyxDQUFDO0FBQ1Y7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLEdBQUU7QUFDN0M7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFJO0FBQzlCLFFBQVEsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUk7QUFDckM7QUFDQTtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQ3pELFlBQVksSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztBQUMzQyxTQUFTO0FBQ1Q7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQzFCLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksTUFBTSxFQUFFLFlBQVksRUFBRTtBQUMxQjtBQUNBO0FBQ0EsSUFBSSxRQUFRLEVBQUUsa0JBQWtCO0FBQ2hDLFFBQVEsTUFBTTtBQUNkLEtBQUs7QUFDTDtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksY0FBYyxFQUFFLFlBQVk7QUFDaEMsUUFBUSxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksS0FBSyxDQUFDLElBQUk7QUFDakMsWUFBWSxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDbkQsWUFBWSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztBQUN4QyxnQkFBZ0IsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSztBQUM1QyxhQUFhLENBQUM7QUFDZCxTQUFTLENBQUM7QUFDVixRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO0FBQ3pDLFFBQVEsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUM7QUFDekQ7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJO0FBQ2xDLFlBQVksSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3pELFlBQVksSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUM7QUFDeEMsZ0JBQWdCLEtBQUssRUFBRSxPQUFPO0FBQzlCLGFBQWEsQ0FBQztBQUNkLFNBQVMsQ0FBQztBQUNWLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDMUMsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUM7QUFDekQ7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQztBQUMvQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLGdCQUFlO0FBQzNDO0FBQ0E7QUFDQSxRQUFRLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUM7QUFDN0M7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsSUFBSSxNQUFNLEVBQUUsWUFBWTtBQUN4QixRQUFRLElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBQztBQUNsRCxRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sR0FBRTtBQUNuQyxRQUFRLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sR0FBRTtBQUNuQyxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sR0FBRTtBQUNwQyxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sR0FBRTtBQUNwQyxRQUFRLElBQUksQ0FBQyxjQUFjLEdBQUU7QUFDN0IsS0FBSztBQUNMO0FBQ0E7QUFDQSxJQUFJLE9BQU8sRUFBRSxVQUFVLEdBQUcsRUFBRTtBQUM1QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3BHLFFBQVEsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUM7QUFDOUI7QUFDQSxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUU7QUFDckMsWUFBWSxPQUFPLENBQUMsSUFBSSxDQUFDLDZDQUE2QyxDQUFDLENBQUM7QUFDeEUsWUFBWSxPQUFPO0FBQ25CLFNBQVM7QUFDVDtBQUNBLFFBQVEsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUU7QUFDdkQ7QUFDQSxZQUFZLElBQUksUUFBUSxHQUFHLFdBQVcsR0FBRTtBQUN4QztBQUNBLFlBQVksSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUM7QUFDakQsWUFBWSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFDO0FBQy9DLFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRTtBQUNoQyxTQUFTLE1BQU0sSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBRTtBQUNqRSxLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksU0FBUyxFQUFFLFVBQVUsR0FBRyxFQUFFO0FBQzlCO0FBQ0EsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsRUFBRTtBQUNwRCxZQUFZLE1BQU07QUFDbEIsU0FBUztBQUNUO0FBQ0E7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO0FBQ3ZELFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUM7QUFDckQsU0FBUyxNQUFNLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFO0FBQy9ELFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUM7QUFDL0MsU0FBUztBQUNULEtBQUs7QUFDTDtBQUNBO0FBQ0EsSUFBSSxPQUFPLEVBQUUsVUFBVSxHQUFHLEVBQUU7QUFDNUIsUUFBUSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBQztBQUMzQyxRQUFRLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUUsTUFBTSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtBQUMvRyxZQUFZLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFDO0FBQ2pELFNBQVM7QUFDVCxLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJLGNBQWMsRUFBRSxVQUFVLFFBQVEsRUFBRTtBQUN4QyxRQUFRLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFO0FBQ3hFLFlBQVksSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBQztBQUNuRCxZQUFZLElBQUksQ0FBQyxhQUFhLEdBQUU7QUFDaEMsU0FBUztBQUNULEtBQUs7QUFDTCxJQUFJLGlCQUFpQixFQUFFLFVBQVUsTUFBTSxFQUFFO0FBQ3pDLFFBQVEsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUU7QUFDdEUsWUFBWSxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFDO0FBQ2pELFlBQVksSUFBSSxDQUFDLGFBQWEsR0FBRTtBQUNoQyxTQUFTO0FBQ1QsS0FBSztBQUNMO0FBQ0E7QUFDQSxJQUFJLGFBQWEsRUFBRSxZQUFZO0FBQy9CLFFBQVEsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFO0FBQzVCLFlBQVksT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO0FBQ2hFLFNBQVM7QUFDVCxRQUFRLE9BQU8sSUFBSTtBQUNuQixLQUFLO0FBQ0w7QUFDQTtBQUNBO0FBQ0EsSUFBSSxhQUFhLEVBQUUsWUFBWTtBQUMvQixRQUFRLE9BQU8sSUFBSSxDQUFDLFVBQVU7QUFDOUIsS0FBSztBQUNMO0FBQ0E7QUFDQSxJQUFJLElBQUksRUFBRSxVQUFVLElBQUksRUFBRTtBQUMxQixRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO0FBQ3ZCO0FBQ0EsWUFBWSxPQUFPO0FBQ25CLFNBQVM7QUFDVDtBQUNBO0FBQ0EsUUFBUSxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7QUFDaEM7QUFDQTtBQUNBLFlBQVksSUFBSSxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUU7QUFDdkU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsZ0JBQWdCLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO0FBQy9EO0FBQ0Esb0JBQW9CLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEdBQUU7QUFDakQ7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzlGLHdCQUF3QixJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDNUUsd0JBQXdCLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxFQUFDO0FBQzVDO0FBQ0E7QUFDQSxvQkFBb0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBQztBQUMxRCxpQkFBaUIsTUFBTSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtBQUN2RTtBQUNBO0FBQ0E7QUFDQTtBQUNBLG9CQUFvQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFLO0FBQzdDLG9CQUFvQixJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUM7QUFDN0gsb0JBQW9CLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUk7QUFDNUM7QUFDQTtBQUNBLG9CQUFvQixJQUFJLFNBQVMsRUFBRTtBQUNuQztBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBQztBQUM3RSx3QkFBd0IsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBQztBQUN6RCx3QkFBd0IsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFDO0FBQ2xFLHFCQUFxQjtBQUNyQixpQkFBaUI7QUFDakIsYUFBYSxNQUFNO0FBQ25CO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUNyRztBQUNBO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBQ2xDO0FBQ0E7QUFDQSxnQkFBZ0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtBQUNwRSxvQkFBb0IsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUM7QUFDNUk7QUFDQTtBQUNBLG9CQUFvQixJQUFJLFlBQVksSUFBSSxZQUFZLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUU7QUFDM0Usd0JBQXdCLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFDO0FBQzlELHdCQUF3QixLQUFLLEdBQUcsS0FBSTtBQUNwQyxxQkFBcUI7QUFDckIsaUJBQWlCO0FBQ2pCO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxDQUFDLEtBQUssRUFBRTtBQUM1QixvQkFBb0IsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUM7QUFDekQsaUJBQWlCO0FBQ2pCLGFBQWE7QUFDYixTQUFTO0FBQ1Q7QUFDQSxRQUFRLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtBQUM5QjtBQUNBLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFO0FBQ3BELGdCQUFnQixNQUFNO0FBQ3RCLGFBQWE7QUFDYjtBQUNBO0FBQ0EsWUFBWSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFO0FBQ3hDLGdCQUFnQixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxNQUFLO0FBQzlDO0FBQ0E7QUFDQSxnQkFBZ0IsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFVO0FBQ3ZELGdCQUFnQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQztBQUN4RCxnQkFBZ0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUM7QUFDL0QsZ0JBQWdCLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFDO0FBQy9ELGdCQUFnQixJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUM7QUFDMUQsZ0JBQWdCLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFDO0FBQ3hELGdCQUFnQixJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBQztBQUN6RCxhQUFhO0FBQ2IsU0FBUztBQUNULEtBQUs7QUFDTCxFQUFDO0FBQ0Q7QUFDQTtBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLEVBQUU7QUFDeEMsSUFBSSxHQUFHLEtBQUs7QUFDWixJQUFJLEdBQUcsUUFBUTtBQUNmLENBQUMsRUFBQztBQUNGO0FBQ0E7QUFDQSw4QkFBOEIsQ0FBQyxhQUFhOztBQ3RZNUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDLENBQUE7QUFDeEUsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUE7QUFDMUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUE7QUFDMUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUE7QUFDOUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUE7QUFDcEUsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUE7QUFDdEUsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFBO0FBRWhGLE1BQU0sQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFBO0FBRWhFO0FBRUE7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUVBLElBQUksWUFBWSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsc0NBQXNDLENBQUMsQ0FBQTtBQUNqRixJQUFJLFlBQVksRUFBRTtJQUNkLFlBQVksQ0FBQyxTQUFTLEdBQUcsa0pBQWtKLENBQUE7In0=
