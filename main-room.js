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
        root && root.addEventListener("model-loaded", initializer);
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
                    cubecam = new CubeCameraWriter(0.1, 1000, SIZE);
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
        var pixels3 = new Uint8Array(3 * TARGETWIDTH * TARGETHEIGHT);
        var renderer = window.APP.scene.renderer;

        renderer.readRenderTargetPixels(this.renderTarget, 0, 0, TARGETWIDTH,TARGETHEIGHT, pixels3, cubeSide);

        //pixels3 = this.flipPixelsVertically(pixels3, TARGETWIDTH, TARGETHEIGHT);
        var pixels4 = this.convert3to4(pixels3, TARGETWIDTH, TARGETHEIGHT);
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
        
        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", (ev) => { 
            this.initialize();
        });
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

    setupPortal: function () {
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
        } else if (this.portalType == 2 || this.portalType == 3) {    
            this.cubeCamera = new CubeCameraWriter(0.1, 1000, 1024);
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
            this.el.sceneEl.addEventListener('model-loaded', () => {
                showRegionForObject(this.el);
                this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D);
                // this.cubeCamera.renderTarget.texture.generateMipmaps = true
                // this.cubeCamera.renderTarget.texture.needsUpdate = true
                hiderRegionForObject(this.el);
            });
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
    
        var titleScriptData = {
            width: this.data.textSize.x,
            height: this.data.textSize.y,
            message: this.data.text
        };
        const portalTitle = htmlComponents["PortalTitle"];
        // const portalSubtitle = htmlComponents["PortalSubtitle"]

        this.portalTitle = portalTitle(titleScriptData);
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
        this.el.setObject3D.matrixAutoUpdate = true;
        this.portalTitle.webLayer3D.matrixAutoUpdate = true;
        // this.portalSubtitle.webLayer3D.matrixAutoUpdate = true

        // this.materials.map((mat) => {
        //     mat.userData.radius = this.radius
        //     mat.userData.ringColor = this.color
        //     mat.userData.cubeMap = this.cubeMap
        // })
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

        this.portalTitle.tick(time);
        // this.portalSubtitle.tick(time)

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

          if (this.portalType == 1 && dist < 0.25) {
              if (!this.locationhref) {
                console.log("set window.location.href to " + this.other);
                this.locationhref = this.other;
                window.location.href = this.other;
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
                // the target is another room, resolve with the URL to the room
                this.system.getRoomURL(this.portalTarget).then(url => { 
                    if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                        resolve(url + "#" + this.data.secondaryTarget);
                    } else {
                        resolve(url); 
                    }
                });
                return
            }
            if (this.portalType == 3) {
                resolve ("#" + this.portalTarget);
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
        this.script = initScript(this.scriptData);
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
                this.dataObject = JSON.parse(decodeURIComponent(this.scriptData));

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
        let v = this.el.sceneEl?.object3D.getObjectByName(this.data.target);
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

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360');
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal');
AFRAME.GLTFModelPlus.registerComponent('shader', 'shader');
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax');
AFRAME.GLTFModelPlus.registerComponent('html-script', 'html-script');
AFRAME.GLTFModelPlus.registerComponent('region-hider', 'region-hider');
AFRAME.GLTFModelPlus.registerComponent('video-control-pad', 'video-control-pad');
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1yb29tLmpzIiwic291cmNlcyI6WyIuLi9zcmMvc3lzdGVtcy9mYWRlci1wbHVzLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcHJveGltaXR5LWV2ZW50cy5qcyIsIi4uL3NyYy91dGlscy9jb21wb25lbnQtdXRpbHMuanMiLCIuLi9zcmMvdXRpbHMvc2NlbmUtZ3JhcGgudHMiLCIuLi9zcmMvY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMiLCIuLi9zcmMvdXRpbHMvZGVmYXVsdEhvb2tzLnRzIiwiLi4vc3JjL3V0aWxzL01hdGVyaWFsTW9kaWZpZXIudHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lNYWluLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95VW5pZm9ybU9iai50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveVVuaWZvcm1fcGFyYXMudHMiLCIuLi9zcmMvYXNzZXRzL2JheWVyLnBuZyIsIi4uL3NyYy9zaGFkZXJzL2JsZWVweS1ibG9ja3Mtc2hhZGVyLnRzIiwiLi4vc3JjL3NoYWRlcnMvbm9pc2UudHMiLCIuLi9zcmMvc2hhZGVycy9saXF1aWQtbWFyYmxlLnRzIiwiLi4vc3JjL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmciLCIuLi9zcmMvc2hhZGVycy9nYWxheHkudHMiLCIuLi9zcmMvc2hhZGVycy9sYWNlLXR1bm5lbC50cyIsIi4uL3NyYy9hc3NldHMvbm9pc2UtMjU2LnBuZyIsIi4uL3NyYy9zaGFkZXJzL2ZpcmUtdHVubmVsLnRzIiwiLi4vc3JjL3NoYWRlcnMvbWlzdC50cyIsIi4uL3NyYy9zaGFkZXJzL21hcmJsZTEudHMiLCIuLi9zcmMvYXNzZXRzL2JhZFNoYWRlci5qcGciLCIuLi9zcmMvc2hhZGVycy9ub3QtZm91bmQudHMiLCIuLi9zcmMvYXNzZXRzL3dhcnBmeC5wbmciLCIuLi9zcmMvc2hhZGVycy93YXJwLnRzIiwiLi4vc3JjL3NoYWRlcnMvc25vaXNlLnRzIiwiLi4vc3JjL3NoYWRlcnMvd2FycC1wb3J0YWwudHMiLCIuLi9zcmMvY29tcG9uZW50cy9zaGFkZXIudHMiLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfQ09MT1IuanBnIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0RJU1AuanBnIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX2dsb3NzaW5lc3MucG5nIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX05STS5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfT0NDLmpwZyIsIi4uL3NyYy91dGlscy93cml0ZUN1YmVNYXAuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wb3J0YWwuanMiLCIuLi9zcmMvYXNzZXRzL2JhbGxmeC5wbmciLCIuLi9zcmMvc2hhZGVycy9wYW5vYmFsbC52ZXJ0LmpzIiwiLi4vc3JjL3NoYWRlcnMvcGFub2JhbGwuZnJhZy5qcyIsIi4uL3NyYy9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMiLCIuLi9zcmMvc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wYXJhbGxheC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvdmlkZW8tY29udHJvbC1wYWQudHMiLCIuLi9zcmMvcm9vbXMvbWFpbi1yb29tLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG5BRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2ZhZGVyLXBsdXMnLCB7XG4gIHNjaGVtYToge1xuICAgIGRpcmVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ25vbmUnIH0sIC8vIFwiaW5cIiwgXCJvdXRcIiwgb3IgXCJub25lXCJcbiAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMjAwIH0sIC8vIFRyYW5zaXRpb24gZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogJ3doaXRlJyB9LFxuICB9LFxuXG4gIGluaXQoKSB7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KCksXG4gICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICBjb2xvcjogdGhpcy5kYXRhLmNvbG9yLFxuICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgb3BhY2l0eTogMCxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIGZvZzogZmFsc2UsXG4gICAgICB9KVxuICAgIClcbiAgICBtZXNoLnNjYWxlLnggPSBtZXNoLnNjYWxlLnkgPSAxXG4gICAgbWVzaC5zY2FsZS56ID0gMC4xNVxuICAgIG1lc2gubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgbWVzaC5yZW5kZXJPcmRlciA9IDEgLy8gcmVuZGVyIGFmdGVyIG90aGVyIHRyYW5zcGFyZW50IHN0dWZmXG4gICAgdGhpcy5lbC5jYW1lcmEuYWRkKG1lc2gpXG4gICAgdGhpcy5tZXNoID0gbWVzaFxuICB9LFxuXG4gIGZhZGVPdXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdvdXQnKVxuICB9LFxuXG4gIGZhZGVJbigpIHtcbiAgICByZXR1cm4gdGhpcy5iZWdpblRyYW5zaXRpb24oJ2luJylcbiAgfSxcblxuICBhc3luYyBiZWdpblRyYW5zaXRpb24oZGlyZWN0aW9uKSB7XG4gICAgaWYgKHRoaXMuX3Jlc29sdmVGaW5pc2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZhZGUgd2hpbGUgYSBmYWRlIGlzIGhhcHBlbmluZy4nKVxuICAgIH1cblxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdmYWRlci1wbHVzJywgeyBkaXJlY3Rpb24gfSlcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzKSA9PiB7XG4gICAgICBpZiAodGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPT09IChkaXJlY3Rpb24gPT0gJ2luJyA/IDAgOiAxKSkge1xuICAgICAgICByZXMoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IHJlc1xuICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgdGljayh0LCBkdCkge1xuICAgIGNvbnN0IG1hdCA9IHRoaXMubWVzaC5tYXRlcmlhbFxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gdGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcgfHwgbWF0Lm9wYWNpdHkgIT09IDBcbiAgICBpZiAoIXRoaXMubWVzaC52aXNpYmxlKSByZXR1cm5cblxuICAgIGlmICh0aGlzLmRhdGEuZGlyZWN0aW9uID09PSAnaW4nKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWF4KDAsIG1hdC5vcGFjaXR5IC0gKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcpIHtcbiAgICAgIG1hdC5vcGFjaXR5ID0gTWF0aC5taW4oMSwgbWF0Lm9wYWNpdHkgKyAoMS4wIC8gdGhpcy5kYXRhLmR1cmF0aW9uKSAqIE1hdGgubWluKGR0LCA1MCkpXG4gICAgfVxuXG4gICAgaWYgKG1hdC5vcGFjaXR5ID09PSAwIHx8IG1hdC5vcGFjaXR5ID09PSAxKSB7XG4gICAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiAhPT0gJ25vbmUnKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCgpXG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uOiAnbm9uZScgfSlcbiAgICB9XG4gIH0sXG59KVxuIiwiY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncHJveGltaXR5LWV2ZW50cycsIHtcbiAgc2NoZW1hOiB7XG4gICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH0sXG4gICAgZnV6ejogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC4xIH0sXG4gICAgWW9mZnNldDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMCB9LFxuICB9LFxuICBpbml0KCkge1xuICAgIHRoaXMuaW5ab25lID0gZmFsc2VcbiAgICB0aGlzLmNhbWVyYSA9IHRoaXMuZWwuc2NlbmVFbC5jYW1lcmFcbiAgfSxcbiAgdGljaygpIHtcbiAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgY29uc3Qgd2FzSW56b25lID0gdGhpcy5pblpvbmVcblxuICAgIHdvcmxkQ2FtZXJhLnkgLT0gdGhpcy5kYXRhLllvZmZzZXRcbiAgICB2YXIgZGlzdCA9IHdvcmxkQ2FtZXJhLmRpc3RhbmNlVG8od29ybGRTZWxmKVxuICAgIHZhciB0aHJlc2hvbGQgPSB0aGlzLmRhdGEucmFkaXVzICsgKHRoaXMuaW5ab25lID8gdGhpcy5kYXRhLmZ1enogIDogMClcbiAgICB0aGlzLmluWm9uZSA9IGRpc3QgPCB0aHJlc2hvbGRcbiAgICBpZiAodGhpcy5pblpvbmUgJiYgIXdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHllbnRlcicpXG4gICAgaWYgKCF0aGlzLmluWm9uZSAmJiB3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5bGVhdmUnKVxuICB9LFxufSlcbiIsIi8vIFByb3ZpZGVzIGEgZ2xvYmFsIHJlZ2lzdHJ5IG9mIHJ1bm5pbmcgY29tcG9uZW50c1xuLy8gY29waWVkIGZyb20gaHVicyBzb3VyY2VcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UoY29tcG9uZW50LCBuYW1lKSB7XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgfHwge307XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gfHwgW107XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5wdXNoKGNvbXBvbmVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UoY29tcG9uZW50LCBuYW1lKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdKSByZXR1cm47XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5zcGxpY2Uod2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5pbmRleE9mKGNvbXBvbmVudCksIDEpO1xufVxuICAiLCIvLyBjb3BpZWQgZnJvbSBodWJzXG5pbXBvcnQgeyBFbnRpdHksIENvbXBvbmVudCB9IGZyb20gJ2FmcmFtZSdcblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQoZW50aXR5OiBFbnRpdHksIGNvbXBvbmVudE5hbWU6IHN0cmluZyk6IEVudGl0eSB8IG51bGwge1xuICAgIHdoaWxlIChlbnRpdHkgJiYgIShlbnRpdHkuY29tcG9uZW50cyAmJiBlbnRpdHkuY29tcG9uZW50c1tjb21wb25lbnROYW1lXSkpIHtcbiAgICAgIGVudGl0eSA9IChlbnRpdHkucGFyZW50Tm9kZSBhcyBFbnRpdHkpO1xuICAgIH1cbiAgICByZXR1cm4gZW50aXR5O1xuICB9XG4gIFxuICBleHBvcnQgZnVuY3Rpb24gZmluZENvbXBvbmVudHNJbk5lYXJlc3RBbmNlc3RvcihlbnRpdHk6IEVudGl0eSwgY29tcG9uZW50TmFtZTogc3RyaW5nKTogQ29tcG9uZW50W10ge1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBbXTtcbiAgICB3aGlsZSAoZW50aXR5KSB7XG4gICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgZm9yIChjb25zdCBjIGluIGVudGl0eS5jb21wb25lbnRzKSB7XG4gICAgICAgICAgaWYgKGVudGl0eS5jb21wb25lbnRzW2NdLm5hbWUgPT09IGNvbXBvbmVudE5hbWUpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudHMucHVzaChlbnRpdHkuY29tcG9uZW50c1tjXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gICAgICB9XG4gICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZSBhcyBFbnRpdHk7XG4gICAgfVxuICAgIHJldHVybiBjb21wb25lbnRzO1xuICB9XG4gICIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBicmVhayB0aGUgcm9vbSBpbnRvIHF1YWRyYW50cyBvZiBhIGNlcnRhaW4gc2l6ZSwgYW5kIGhpZGUgdGhlIGNvbnRlbnRzIG9mIGFyZWFzIHRoYXQgaGF2ZVxuICogbm9ib2R5IGluIHRoZW0uICBNZWRpYSB3aWxsIGJlIHBhdXNlZCBpbiB0aG9zZSBhcmVhcyB0b28uXG4gKiBcbiAqIEluY2x1ZGUgYSB3YXkgZm9yIHRoZSBwb3J0YWwgY29tcG9uZW50IHRvIHR1cm4gb24gZWxlbWVudHMgaW4gdGhlIHJlZ2lvbiBvZiB0aGUgcG9ydGFsIGJlZm9yZVxuICogaXQgY2FwdHVyZXMgYSBjdWJlbWFwXG4gKi9cblxuaW1wb3J0IHsgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSwgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlIH0gZnJvbSBcIi4uL3V0aWxzL2NvbXBvbmVudC11dGlsc1wiO1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuXG4gLy8gYXJiaXRyYXJpbHkgY2hvb3NlIDEwMDAwMDAgYXMgdGhlIG51bWJlciBvZiBjb21wdXRlZCB6b25lcyBpbiAgeCBhbmQgeVxubGV0IE1BWF9aT05FUyA9IDEwMDAwMDBcbmxldCByZWdpb25UYWcgPSBmdW5jdGlvbihzaXplLCBvYmozZCkge1xuICAgIGxldCBwb3MgPSBvYmozZC5wb3NpdGlvblxuICAgIGxldCB4cCA9IE1hdGguZmxvb3IocG9zLnggLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgbGV0IHpwID0gTWF0aC5mbG9vcihwb3MueiAvIHNpemUpICsgTUFYX1pPTkVTLzJcbiAgICByZXR1cm4gTUFYX1pPTkVTICogeHAgKyB6cFxufVxuXG5sZXQgcmVnaW9uc0luVXNlID0gW11cblxuLyoqXG4gKiBGaW5kIHRoZSBjbG9zZXN0IGFuY2VzdG9yIChpbmNsdWRpbmcgdGhlIHBhc3NlZCBpbiBlbnRpdHkpIHRoYXQgaGFzIGFuIGBvYmplY3QtcmVnaW9uLWZvbGxvd2VyYCBjb21wb25lbnQsXG4gKiBhbmQgcmV0dXJuIHRoYXQgY29tcG9uZW50XG4gKi9cbmZ1bmN0aW9uIGdldFJlZ2lvbkZvbGxvd2VyKGVudGl0eSkge1xuICAgIGxldCBjdXJFbnRpdHkgPSBlbnRpdHk7XG4gIFxuICAgIHdoaWxlKGN1ckVudGl0eSAmJiBjdXJFbnRpdHkuY29tcG9uZW50cyAmJiAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIGN1ckVudGl0eSA9IGN1ckVudGl0eS5wYXJlbnROb2RlO1xuICAgIH1cbiAgXG4gICAgaWYgKCFjdXJFbnRpdHkgfHwgIWN1ckVudGl0eS5jb21wb25lbnRzIHx8ICFjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdXG59XG4gIFxuZnVuY3Rpb24gYWRkVG9SZWdpb24ocmVnaW9uKSB7XG4gICAgcmVnaW9uc0luVXNlW3JlZ2lvbl0gPyByZWdpb25zSW5Vc2VbcmVnaW9uXSsrIDogcmVnaW9uc0luVXNlW3JlZ2lvbl0gPSAxXG4gICAgY29uc29sZS5sb2coXCJBdmF0YXJzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbiArIFwiOiBcIiArIHJlZ2lvbnNJblVzZVtyZWdpb25dKVxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAxKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdHJ1ZSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcImFscmVhZHkgYW5vdGhlciBhdmF0YXIgaW4gdGhpcyByZWdpb24sIG5vIGNoYW5nZVwiKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gc3VidHJhY3RGcm9tUmVnaW9uKHJlZ2lvbikge1xuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSkge3JlZ2lvbnNJblVzZVtyZWdpb25dLS0gfVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBsZWZ0IHJlZ2lvbiBcIiArIHJlZ2lvbiArIFwiOiBcIiArIHJlZ2lvbnNJblVzZVtyZWdpb25dKVxuXG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dID09IDApIHtcbiAgICAgICAgc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCBmYWxzZSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcInN0aWxsIGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93UmVnaW9uRm9yT2JqZWN0KGVsZW1lbnQpIHtcbiAgICBsZXQgZm9sbG93ZXIgPSBnZXRSZWdpb25Gb2xsb3dlcihlbGVtZW50KVxuICAgIGlmICghZm9sbG93ZXIpIHsgcmV0dXJuIH1cblxuICAgIGNvbnNvbGUubG9nKFwic2hvd2luZyBvYmplY3RzIG5lYXIgXCIgKyBmb2xsb3dlci5lbC5jbGFzc05hbWUpXG5cbiAgICBhZGRUb1JlZ2lvbihmb2xsb3dlci5yZWdpb24pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoaWRlclJlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcImhpZGluZyBvYmplY3RzIG5lYXIgXCIgKyBmb2xsb3dlci5lbC5jbGFzc05hbWUpXG5cbiAgICBzdWJ0cmFjdEZyb21SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5mdW5jdGlvbiBzaG93SGlkZU9iamVjdHMoKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQIHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5KVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zb2xlLmxvZyAoXCJzaG93aW5nL2hpZGluZyBhbGwgb2JqZWN0c1wiKVxuICAgIGNvbnN0IG9iamVjdHMgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSB8fCBbXTtcbiAgXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvYmplY3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBvYmogPSBvYmplY3RzW2ldO1xuICAgICAgXG4gICAgICBsZXQgdmlzaWJsZSA9IHJlZ2lvbnNJblVzZVtvYmoucmVnaW9uXSA/IHRydWU6IGZhbHNlXG4gICAgICAgIFxuICAgICAgaWYgKG9iai5lbC5vYmplY3QzRC52aXNpYmxlID09IHZpc2libGUpIHsgY29udGludWUgfVxuXG4gICAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmcgXCIgOiBcImhpZGluZyBcIikgKyBvYmouZWwuY2xhc3NOYW1lKVxuICAgICAgb2JqLnNob3dIaWRlKHZpc2libGUpXG4gICAgfVxuICBcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCB2aXNpYmxlKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQIHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5KVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmdcIiA6IFwiaGlkaW5nXCIpICsgXCIgYWxsIG9iamVjdHMgaW4gcmVnaW9uIFwiICsgcmVnaW9uKVxuICAgIGNvbnN0IG9iamVjdHMgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSB8fCBbXTtcbiAgXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvYmplY3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBvYmogPSBvYmplY3RzW2ldO1xuICAgICAgXG4gICAgICBpZiAob2JqLnJlZ2lvbiA9PSByZWdpb24pIHtcbiAgICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCIgaGlkaW5nXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgICAgb2JqLnNob3dIaWRlKHZpc2libGUpXG4gICAgICB9XG4gICAgfVxuICBcbiAgICByZXR1cm4gbnVsbDtcbn1cbiAgXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2F2YXRhci1yZWdpb24tZm9sbG93ZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcbiAgICAgICAgY29uc29sZS5sb2coXCJBdmF0YXI6IHJlZ2lvbiBcIiwgdGhpcy5yZWdpb24pXG4gICAgICAgIGFkZFRvUmVnaW9uKHRoaXMucmVnaW9uKVxuXG4gICAgICAgIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG4gICAgcmVtb3ZlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICAgICAgc3VidHJhY3RGcm9tUmVnaW9uKHRoaXMucmVnaW9uKVxuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCBuZXdSZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGlmIChuZXdSZWdpb24gIT0gdGhpcy5yZWdpb24pIHtcbiAgICAgICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICAgICAgICAgIGFkZFRvUmVnaW9uKG5ld1JlZ2lvbilcbiAgICAgICAgICAgIHRoaXMucmVnaW9uID0gbmV3UmVnaW9uXG4gICAgICAgIH1cbiAgICB9LFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdvYmplY3QtcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH0sXG4gICAgICAgIGR5bmFtaWM6IHsgZGVmYXVsdDogdHJ1ZSB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuXG4gICAgICAgIHRoaXMuc2hvd0hpZGUgPSB0aGlzLnNob3dIaWRlLmJpbmQodGhpcylcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICB0aGlzLndhc1BhdXNlZCA9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWRcbiAgICAgICAgfVxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZSBkb24ndCBtb3ZlXG4gICAgICAgIGlmICghdGhpcy5kYXRhLmR5bmFtaWMpIHsgcmV0dXJuIH1cblxuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICBsZXQgdmlzaWJsZSA9IHJlZ2lvbnNJblVzZVt0aGlzLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IHJldHVybiB9XG5cbiAgICAgICAgLy8gaGFuZGxlIHNob3cvaGlkaW5nIHRoZSBvYmplY3RzXG4gICAgICAgIHRoaXMuc2hvd0hpZGUodmlzaWJsZSlcbiAgICB9LFxuXG4gICAgc2hvd0hpZGU6IGZ1bmN0aW9uICh2aXNpYmxlKSB7XG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB2aXNpYmxlXG5cbiAgICAgICAgLy8vIGNoZWNrIGZvciBtZWRpYS12aWRlbyBjb21wb25lbnQgb24gcGFyZW50IHRvIHNlZSBpZiB3ZSdyZSBhIHZpZGVvLiAgQWxzbyBzYW1lIGZvciBhdWRpb1xuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0pIHtcbiAgICAgICAgICAgIGlmICh2aXNpYmxlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMud2FzUGF1c2VkICE9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLndhc1BhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS50b2dnbGVQbGF5aW5nKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gXCIqX2NvbXBvbmVudE5hbWVcIlxuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBwYXJlbnQgd2l0aCBcIm5hdi1tZXNoLWhlbHBlclwiLCB0aGlzIGlzIGluIHRoZSBzY2VuZS4gIFxuICAgICAgICAvLyBJZiBub3QsIGl0J3MgaW4gYW4gb2JqZWN0IHdlIGRyb3BwZWQgb24gdGhlIHdpbmRvdywgd2hpY2ggd2UgZG9uJ3Qgc3VwcG9ydFxuICAgICAgICBpZiAoIWZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJuYXYtbWVzaC1oZWxwZXJcIikpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJlZ2lvbi1oaWRlciBjb21wb25lbnQgbXVzdCBiZSBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZ2xiLlwiKVxuICAgICAgICAgICAgdGhpcy5zaXplID0gMDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYodGhpcy5kYXRhLnNpemUgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnNpemUgPSAxMDtcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGlzLm5ld1NjZW5lID0gdGhpcy5uZXdTY2VuZS5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMubmV3U2NlbmUpXG4gICAgICAgIC8vIGNvbnN0IGVudmlyb25tZW50U2NlbmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2Vudmlyb25tZW50LXNjZW5lXCIpO1xuICAgICAgICAvLyB0aGlzLmFkZFNjZW5lRWxlbWVudCA9IHRoaXMuYWRkU2NlbmVFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQgPSB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIGVudmlyb25tZW50U2NlbmUuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWF0dGFjaGVkXCIsIHRoaXMuYWRkU2NlbmVFbGVtZW50KVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudClcblxuICAgICAgICAvLyB3ZSB3YW50IHRvIG5vdGljZSB3aGVuIG5ldyB0aGluZ3MgZ2V0IGFkZGVkIHRvIHRoZSByb29tLiAgVGhpcyB3aWxsIGhhcHBlbiBmb3JcbiAgICAgICAgLy8gb2JqZWN0cyBkcm9wcGVkIGluIHRoZSByb29tLCBvciBmb3IgbmV3IHJlbW90ZSBhdmF0YXJzLCBhdCBsZWFzdFxuICAgICAgICAvLyB0aGlzLmFkZFJvb3RFbGVtZW50ID0gdGhpcy5hZGRSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQgPSB0aGlzLnJlbW92ZVJvb3RFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFJvb3RFbGVtZW50KVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWRldGFjaGVkXCIsIHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2FudCB0byBzZWUgaWYgdGhlcmUgYXJlIHBpbm5lZCBvYmplY3RzIHRoYXQgd2VyZSBsb2FkZWQgZnJvbSBodWJzXG4gICAgICAgIGxldCByb29tT2JqZWN0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoXCJSb29tT2JqZWN0c1wiKVxuICAgICAgICB0aGlzLnJvb21PYmplY3RzID0gcm9vbU9iamVjdHMubGVuZ3RoID4gMCA/IHJvb21PYmplY3RzWzBdIDogbnVsbFxuXG4gICAgICAgIC8vIGdldCBhdmF0YXJzXG4gICAgICAgIGNvbnN0IGF2YXRhcnMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltwbGF5ZXItaW5mb11cIik7XG4gICAgICAgIGF2YXRhcnMuZm9yRWFjaCgoYXZhdGFyKSA9PiB7XG4gICAgICAgICAgICBhdmF0YXIuc2V0QXR0cmlidXRlKFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIG9iamVjdHMgaW4gdGhlIHJvb3QgKHRoaW5ncyB0aGF0IGhhdmUgYmVlbiBkcm9wcGVkIG9uIHRoZSBzY2VuZSlcbiAgICAgICAgLy8gLSBkcmF3aW5ncyBoYXZlIGNsYXNzPVwiZHJhd2luZ1wiLCBuZXR3b3JrZWQtZHJhd2luZ1xuICAgICAgICAvLyBOb3QgZ29pbmcgdG8gZG8gZHJhd2luZ3MgcmlnaHQgbm93LlxuXG4gICAgICAgIC8vIHBpbm5lZCBtZWRpYSBsaXZlIHVuZGVyIGEgbm9kZSB3aXRoIGNsYXNzPVwiUm9vbU9iamVjdHNcIlxuICAgICAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIi5Sb29tT2JqZWN0cyA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLSBjYW1lcmEgaGFzIGNhbWVyYS10b29sICAgICAgICBcbiAgICAgICAgLy8gLSBpbWFnZSBmcm9tIGNhbWVyYSwgb3IgZHJvcHBlZCwgaGFzIG1lZGlhLWxvYWRlciwgbWVkaWEtaW1hZ2UsIGxpc3RlZC1tZWRpYVxuICAgICAgICAvLyAtIGdsYiBoYXMgbWVkaWEtbG9hZGVyLCBnbHRmLW1vZGVsLXBsdXMsIGxpc3RlZC1tZWRpYVxuICAgICAgICAvLyAtIHZpZGVvIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLXZpZGVvLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy9cbiAgICAgICAgLy8gIHNvLCBnZXQgYWxsIGNhbWVyYS10b29scywgYW5kIG1lZGlhLWxvYWRlciBvYmplY3RzIGF0IHRoZSB0b3AgbGV2ZWwgb2YgdGhlIHNjZW5lXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdLCBhLXNjZW5lID4gW21lZGlhLWxvYWRlcl1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHdhbGsgdGhlIG9iamVjdHMgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lLiAgTXVzdCB3YWl0IGZvciBzY2VuZSB0byBmaW5pc2ggbG9hZGluZ1xuICAgICAgICB0aGlzLnNjZW5lTG9hZGVkID0gdGhpcy5zY2VuZUxvYWRlZC5iaW5kKHRoaXMpXG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMuc2NlbmVMb2FkZWQpO1xuXG4gICAgfSxcblxuICAgIGlzQW5jZXN0b3I6IGZ1bmN0aW9uIChyb290LCBlbnRpdHkpIHtcbiAgICAgICAgd2hpbGUgKGVudGl0eSAmJiAhKGVudGl0eSA9PSByb290KSkge1xuICAgICAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAoZW50aXR5ID09IHJvb3QpO1xuICAgIH0sXG4gICAgXG4gICAgLy8gVGhpbmdzIHdlIGRvbid0IHdhbnQgdG8gaGlkZTpcbiAgICAvLyAtIFt3YXlwb2ludF1cbiAgICAvLyAtIHBhcmVudCBvZiBzb21ldGhpbmcgd2l0aCBbbmF2bWVzaF0gYXMgYSBjaGlsZCAodGhpcyBpcyB0aGUgbmF2aWdhdGlvbiBzdHVmZlxuICAgIC8vIC0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbFxuICAgIC8vIC0gW3NreWJveF1cbiAgICAvLyAtIFtkaXJlY3Rpb25hbC1saWdodF1cbiAgICAvLyAtIFthbWJpZW50LWxpZ2h0XVxuICAgIC8vIC0gW2hlbWlzcGhlcmUtbGlnaHRdXG4gICAgLy8gLSAjQ29tYmluZWRNZXNoXG4gICAgLy8gLSAjc2NlbmUtcHJldmlldy1jYW1lcmEgb3IgW3NjZW5lLXByZXZpZXctY2FtZXJhXVxuICAgIC8vXG4gICAgLy8gd2Ugd2lsbCBkb1xuICAgIC8vIC0gW21lZGlhLWxvYWRlcl1cbiAgICAvLyAtIFtzcG90LWxpZ2h0XVxuICAgIC8vIC0gW3BvaW50LWxpZ2h0XVxuICAgIHNjZW5lTG9hZGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCBub2RlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZW52aXJvbm1lbnQtc2NlbmVcIikuY2hpbGRyZW5bMF0uY2hpbGRyZW5bMF1cbiAgICAgICAgLy92YXIgbm9kZXMgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLnBhcmVudEVsLmNoaWxkTm9kZXM7XG4gICAgICAgIGZvciAobGV0IGk9MDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgbm9kZSA9IG5vZGVzW2ldXG4gICAgICAgICAgICAvL2lmIChub2RlID09IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwpIHtjb250aW51ZX1cbiAgICAgICAgICAgIGlmICh0aGlzLmlzQW5jZXN0b3Iobm9kZSwgdGhpcy5lbCkpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNsID0gbm9kZS5jbGFzc05hbWVcbiAgICAgICAgICAgIGlmIChjbCA9PT0gXCJDb21iaW5lZE1lc2hcIiB8fCBjbCA9PT0gXCJzY2VuZS1wcmV2aWV3LWNhbWVyYVwiKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjID0gbm9kZS5jb21wb25lbnRzXG4gICAgICAgICAgICBpZiAoY1tcIndheXBvaW50XCJdIHx8IGNbXCJza3lib3hcIl0gfHwgY1tcImRpcmVjdGlvbmFsLWxpZ2h0XCJdIHx8IGNbXCJhbWJpZW50LWxpZ2h0XCJdIHx8IGNbXCJoZW1pc3BoZXJlLWxpZ2h0XCJdKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjaCA9IG5vZGUuY2hpbGRyZW5cbiAgICAgICAgICAgIHZhciBuYXZtZXNoID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGxldCBqPTA7IGogPCBjaC5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChjaFtqXS5jb21wb25lbnRzW1wibmF2bWVzaFwiXSkge1xuICAgICAgICAgICAgICAgICAgICBuYXZtZXNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5hdm1lc2gpIHtjb250aW51ZX1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplLCBkeW5hbWljOiBmYWxzZSB9KVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWxsIG9iamVjdHMgYW5kIGF2YXRhciBzaG91bGQgYmUgc2V0IHVwLCBzbyBsZXRzIG1ha2Ugc3VyZSBhbGwgb2JqZWN0cyBhcmUgY29ycmVjdGx5IHNob3duXG4gICAgICAgIHNob3dIaWRlT2JqZWN0cygpXG4gICAgfSxcblxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLnNpemUgPT09IHRoaXMuc2l6ZSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5zaXplID0gMTBcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMuc2NlbmVMb2FkZWQpO1xuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICAvLyBzaXplID09IDAgaXMgdXNlZCB0byBzaWduYWwgXCJkbyBub3RoaW5nXCJcbiAgICAgICAgaWYgKHRoaXMuc2l6ZSA9PSAwKSB7cmV0dXJufVxuXG4gICAgICAgIC8vIHNlZSBpZiB0aGVyZSBhcmUgbmV3IGF2YXRhcnNcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dOm5vdChbYXZhdGFyLXJlZ2lvbi1mb2xsb3dlcl0pXCIpXG4gICAgICAgIG5vZGVzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gIHNlZSBpZiB0aGVyZSBhcmUgbmV3IGNhbWVyYS10b29scyBvciBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdOm5vdChbb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcl0pXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgXG4gICAgLy8gbmV3U2NlbmU6IGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW52aXJvbm1lbnQgc2NlbmUgbG9hZGVkOiBcIiwgbW9kZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIGFkZFJvb3RFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgYWRkZWQgdG8gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IHJlbW92ZWQgZnJvbSByb290OiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIGFkZFNjZW5lRWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIGVudmlyb25tZW50IHNjZW5lOiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIHJlbW92ZVNjZW5lRWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IHJlbW92ZWQgZnJvbSBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sICBcbiAgICBcbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoc2l6ZSkge1xuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJzaXplXCIgKGFuIGludGVnZXIgbnVtYmVyKVxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuICBUaGlzIHdpbGwgc2V0IHRoZSBoaWRkZXIgY29tcG9uZW50IHRvIFxuICAgICAgICAvLyB1c2UgdGhhdCBzaXplIGluIG1ldGVycyBmb3IgdGhlIHF1YWRyYW50c1xuICAgICAgICB0aGlzLm5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLm5vZGVOYW1lLm1hdGNoKC9fKFswLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMiwgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50TmFtZSBub3QgZm9ybWF0dGVkIGNvcnJlY3RseTogXCIsIHRoaXMubm9kZU5hbWUpXG4gICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG5vZGVTaXplID0gcGFyc2VJbnQocGFyYW1zWzFdKVxuICAgICAgICAgICAgaWYgKCFub2RlU2l6ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzaXplXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBub2RlU2l6ZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSkiLCJsZXQgRGVmYXVsdEhvb2tzID0ge1xuICAgIHZlcnRleEhvb2tzOiB7XG4gICAgICAgIHVuaWZvcm1zOiAnaW5zZXJ0YmVmb3JlOiNpbmNsdWRlIDxjb21tb24+XFxuJyxcbiAgICAgICAgZnVuY3Rpb25zOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGNsaXBwaW5nX3BsYW5lc19wYXJzX3ZlcnRleD5cXG4nLFxuICAgICAgICBwcmVUcmFuc2Zvcm06ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbicsXG4gICAgICAgIHBvc3RUcmFuc2Zvcm06ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8cHJvamVjdF92ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcHJlTm9ybWFsOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGJlZ2lubm9ybWFsX3ZlcnRleD5cXG4nXG4gICAgfSxcbiAgICBmcmFnbWVudEhvb2tzOiB7XG4gICAgICAgIHVuaWZvcm1zOiAnaW5zZXJ0YmVmb3JlOiNpbmNsdWRlIDxjb21tb24+XFxuJyxcbiAgICAgICAgZnVuY3Rpb25zOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGNsaXBwaW5nX3BsYW5lc19wYXJzX2ZyYWdtZW50PlxcbicsXG4gICAgICAgIHByZUZyYWdDb2xvcjogJ2luc2VydGJlZm9yZTpnbF9GcmFnQ29sb3IgPSB2ZWM0KCBvdXRnb2luZ0xpZ2h0LCBkaWZmdXNlQ29sb3IuYSApO1xcbicsXG4gICAgICAgIHBvc3RGcmFnQ29sb3I6ICdpbnNlcnRhZnRlcjpnbF9GcmFnQ29sb3IgPSB2ZWM0KCBvdXRnb2luZ0xpZ2h0LCBkaWZmdXNlQ29sb3IuYSApO1xcbicsXG4gICAgICAgIHBvc3RNYXA6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8bWFwX2ZyYWdtZW50PlxcbicsXG4gICAgICAgIHJlcGxhY2VNYXA6ICdyZXBsYWNlOiNpbmNsdWRlIDxtYXBfZnJhZ21lbnQ+XFxuJ1xuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgRGVmYXVsdEhvb2tzIiwiLy8gYmFzZWQgb24gaHR0cHM6Ly9naXRodWIuY29tL2phbWllb3dlbi90aHJlZS1tYXRlcmlhbC1tb2RpZmllclxuXG5pbXBvcnQgZGVmYXVsdEhvb2tzIGZyb20gJy4vZGVmYXVsdEhvb2tzJztcblxuaW50ZXJmYWNlIEV4dGVuZGVkTWF0ZXJpYWwge1xuICAgIHVuaWZvcm1zOiBVbmlmb3JtcztcbiAgICB2ZXJ0ZXhTaGFkZXI6IHN0cmluZztcbiAgICBmcmFnbWVudFNoYWRlcjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2hhZGVyRXh0ZW5zaW9uT3B0cyB7XG4gICAgdW5pZm9ybXM6IHsgW3VuaWZvcm06IHN0cmluZ106IGFueSB9O1xuICAgIHZlcnRleFNoYWRlcjogeyBbcGF0dGVybjogc3RyaW5nXTogc3RyaW5nIH07XG4gICAgZnJhZ21lbnRTaGFkZXI6IHsgW3BhdHRlcm46IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGNsYXNzTmFtZT86IHN0cmluZztcbiAgICBwb3N0TW9kaWZ5VmVydGV4U2hhZGVyPzogKHNoYWRlcjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gICAgcG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyPzogKHNoYWRlcjogc3RyaW5nKSA9PiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTaGFkZXJFeHRlbnNpb24gZXh0ZW5kcyBTaGFkZXJFeHRlbnNpb25PcHRzIHtcbiAgICBpbml0KG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpOiB2b2lkO1xuICAgIHVwZGF0ZVVuaWZvcm1zKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCk6IHZvaWRcbn1cblxuY29uc3QgbW9kaWZ5U291cmNlID0gKCBzb3VyY2U6IHN0cmluZywgaG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSwgaG9va3M6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApPT57XG4gICAgbGV0IG1hdGNoO1xuICAgIGZvciggbGV0IGtleSBpbiBob29rRGVmcyApe1xuICAgICAgICBpZiggaG9va3Nba2V5XSApe1xuICAgICAgICAgICAgbWF0Y2ggPSAvaW5zZXJ0KGJlZm9yZSk6KC4qKXxpbnNlcnQoYWZ0ZXIpOiguKil8KHJlcGxhY2UpOiguKikvLmV4ZWMoIGhvb2tEZWZzW2tleV0gKTtcblxuICAgICAgICAgICAgaWYoIG1hdGNoICl7XG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzFdICl7IC8vIGJlZm9yZVxuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSggbWF0Y2hbMl0sIGhvb2tzW2tleV0gKyAnXFxuJyArIG1hdGNoWzJdICk7XG4gICAgICAgICAgICAgICAgfWVsc2VcbiAgICAgICAgICAgICAgICBpZiggbWF0Y2hbM10gKXsgLy8gYWZ0ZXJcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzRdLCBtYXRjaFs0XSArICdcXG4nICsgaG9va3Nba2V5XSApO1xuICAgICAgICAgICAgICAgIH1lbHNlXG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzVdICl7IC8vIHJlcGxhY2VcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzZdLCBob29rc1trZXldICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHNvdXJjZTtcbn1cblxudHlwZSBVbmlmb3JtcyA9IHtcbiAgICBba2V5OiBzdHJpbmddOiBhbnk7XG59XG5cbi8vIGNvcGllZCBmcm9tIHRocmVlLnJlbmRlcmVycy5zaGFkZXJzLlVuaWZvcm1VdGlscy5qc1xuZXhwb3J0IGZ1bmN0aW9uIGNsb25lVW5pZm9ybXMoIHNyYzogVW5pZm9ybXMgKTogVW5pZm9ybXMge1xuXHR2YXIgZHN0OiBVbmlmb3JtcyA9IHt9O1xuXG5cdGZvciAoIHZhciB1IGluIHNyYyApIHtcblx0XHRkc3RbIHUgXSA9IHt9IDtcblx0XHRmb3IgKCB2YXIgcCBpbiBzcmNbIHUgXSApIHtcblx0XHRcdHZhciBwcm9wZXJ0eSA9IHNyY1sgdSBdWyBwIF07XG5cdFx0XHRpZiAoIHByb3BlcnR5ICYmICggcHJvcGVydHkuaXNDb2xvciB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc01hdHJpeDMgfHwgcHJvcGVydHkuaXNNYXRyaXg0IHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzVmVjdG9yMiB8fCBwcm9wZXJ0eS5pc1ZlY3RvcjMgfHwgcHJvcGVydHkuaXNWZWN0b3I0IHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzVGV4dHVyZSApICkge1xuXHRcdFx0XHQgICAgZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5LmNsb25lKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCBBcnJheS5pc0FycmF5KCBwcm9wZXJ0eSApICkge1xuXHRcdFx0XHRkc3RbIHUgXVsgcCBdID0gcHJvcGVydHkuc2xpY2UoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGRzdDtcbn1cblxudHlwZSBTdXBlckNsYXNzVHlwZXMgPSB0eXBlb2YgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuXG50eXBlIFN1cGVyQ2xhc3NlcyA9IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsIHwgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgfCBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHwgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwgfCBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuXG5pbnRlcmZhY2UgRXh0ZW5zaW9uRGF0YSB7XG4gICAgU2hhZGVyQ2xhc3M6IFN1cGVyQ2xhc3NUeXBlcztcbiAgICBTaGFkZXJMaWI6IFRIUkVFLlNoYWRlcjtcbiAgICBLZXk6IHN0cmluZyxcbiAgICBDb3VudDogbnVtYmVyLFxuICAgIE1vZGlmaWVkTmFtZSgpOiBzdHJpbmcsXG4gICAgVHlwZUNoZWNrOiBzdHJpbmdcbn1cblxubGV0IGNsYXNzTWFwOiB7W25hbWU6IHN0cmluZ106IHN0cmluZzt9ID0ge1xuICAgIE1lc2hTdGFuZGFyZE1hdGVyaWFsOiBcInN0YW5kYXJkXCIsXG4gICAgTWVzaEJhc2ljTWF0ZXJpYWw6IFwiYmFzaWNcIixcbiAgICBNZXNoTGFtYmVydE1hdGVyaWFsOiBcImxhbWJlcnRcIixcbiAgICBNZXNoUGhvbmdNYXRlcmlhbDogXCJwaG9uZ1wiLFxuICAgIE1lc2hEZXB0aE1hdGVyaWFsOiBcImRlcHRoXCIsXG4gICAgc3RhbmRhcmQ6IFwic3RhbmRhcmRcIixcbiAgICBiYXNpYzogXCJiYXNpY1wiLFxuICAgIGxhbWJlcnQ6IFwibGFtYmVydFwiLFxuICAgIHBob25nOiBcInBob25nXCIsXG4gICAgZGVwdGg6IFwiZGVwdGhcIlxufVxuXG5sZXQgc2hhZGVyTWFwOiB7W25hbWU6IHN0cmluZ106IEV4dGVuc2lvbkRhdGE7fVxuXG5jb25zdCBnZXRTaGFkZXJEZWYgPSAoIGNsYXNzT3JTdHJpbmc6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZyApPT57XG5cbiAgICBpZiggIXNoYWRlck1hcCApe1xuXG4gICAgICAgIGxldCBjbGFzc2VzOiB7W25hbWU6IHN0cmluZ106IFN1cGVyQ2xhc3NUeXBlczt9ID0ge1xuICAgICAgICAgICAgc3RhbmRhcmQ6IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsLFxuICAgICAgICAgICAgYmFzaWM6IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsLFxuICAgICAgICAgICAgbGFtYmVydDogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCxcbiAgICAgICAgICAgIHBob25nOiBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCxcbiAgICAgICAgICAgIGRlcHRoOiBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuICAgICAgICB9XG5cbiAgICAgICAgc2hhZGVyTWFwID0ge307XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGNsYXNzZXMgKXtcbiAgICAgICAgICAgIHNoYWRlck1hcFsga2V5IF0gPSB7XG4gICAgICAgICAgICAgICAgU2hhZGVyQ2xhc3M6IGNsYXNzZXNbIGtleSBdLFxuICAgICAgICAgICAgICAgIFNoYWRlckxpYjogVEhSRUUuU2hhZGVyTGliWyBrZXkgXSxcbiAgICAgICAgICAgICAgICBLZXk6IGtleSxcbiAgICAgICAgICAgICAgICBDb3VudDogMCxcbiAgICAgICAgICAgICAgICBNb2RpZmllZE5hbWU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgTW9kaWZpZWRNZXNoJHsgdGhpcy5LZXlbMF0udG9VcHBlckNhc2UoKSArIHRoaXMuS2V5LnNsaWNlKDEpIH1NYXRlcmlhbF8keyArK3RoaXMuQ291bnQgfWA7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBUeXBlQ2hlY2s6IGBpc01lc2gkeyBrZXlbMF0udG9VcHBlckNhc2UoKSArIGtleS5zbGljZSgxKSB9TWF0ZXJpYWxgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgc2hhZGVyRGVmOiBFeHRlbnNpb25EYXRhIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKCB0eXBlb2YgY2xhc3NPclN0cmluZyA9PT0gJ2Z1bmN0aW9uJyApe1xuICAgICAgICBmb3IoIGxldCBrZXkgaW4gc2hhZGVyTWFwICl7XG4gICAgICAgICAgICBpZiggc2hhZGVyTWFwWyBrZXkgXS5TaGFkZXJDbGFzcyA9PT0gY2xhc3NPclN0cmluZyApe1xuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IHNoYWRlck1hcFsga2V5IF07XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbGFzc09yU3RyaW5nID09PSAnc3RyaW5nJykge1xuICAgICAgICBsZXQgbWFwcGVkQ2xhc3NPclN0cmluZyA9IGNsYXNzTWFwWyBjbGFzc09yU3RyaW5nIF1cbiAgICAgICAgc2hhZGVyRGVmID0gc2hhZGVyTWFwWyBtYXBwZWRDbGFzc09yU3RyaW5nIHx8IGNsYXNzT3JTdHJpbmcgXTtcbiAgICB9XG5cbiAgICBpZiggIXNoYWRlckRlZiApe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdObyBTaGFkZXIgZm91bmQgdG8gbW9kaWZ5Li4uJyApO1xuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJEZWY7XG59XG5cbi8qKlxuICogVGhlIG1haW4gTWF0ZXJpYWwgTW9kb2ZpZXJcbiAqL1xuY2xhc3MgTWF0ZXJpYWxNb2RpZmllciB7XG4gICAgX3ZlcnRleEhvb2tzOiB7W3ZlcnRleGhvb2s6IHN0cmluZ106IHN0cmluZ31cbiAgICBfZnJhZ21lbnRIb29rczoge1tmcmFnZW1lbnRob29rOiBzdHJpbmddOiBzdHJpbmd9XG5cbiAgICBjb25zdHJ1Y3RvciggdmVydGV4SG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSwgZnJhZ21lbnRIb29rRGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICl7XG5cbiAgICAgICAgdGhpcy5fdmVydGV4SG9va3MgPSB7fTtcbiAgICAgICAgdGhpcy5fZnJhZ21lbnRIb29rcyA9IHt9O1xuXG4gICAgICAgIGlmKCB2ZXJ0ZXhIb29rRGVmcyApe1xuICAgICAgICAgICAgdGhpcy5kZWZpbmVWZXJ0ZXhIb29rcyggdmVydGV4SG9va0RlZnMgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCBmcmFnbWVudEhvb2tEZWZzICl7XG4gICAgICAgICAgICB0aGlzLmRlZmluZUZyYWdtZW50SG9va3MoIGZyYWdtZW50SG9va0RlZnMgKTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgbW9kaWZ5KCBzaGFkZXI6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZywgb3B0czogU2hhZGVyRXh0ZW5zaW9uT3B0cyApOiBFeHRlbmRlZE1hdGVyaWFsIHtcblxuICAgICAgICBsZXQgZGVmID0gZ2V0U2hhZGVyRGVmKCBzaGFkZXIgKTtcblxuICAgICAgICBsZXQgdmVydGV4U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLnZlcnRleFNoYWRlciwgdGhpcy5fdmVydGV4SG9va3MsIG9wdHMudmVydGV4U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCBmcmFnbWVudFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi5mcmFnbWVudFNoYWRlciwgdGhpcy5fZnJhZ21lbnRIb29rcywgb3B0cy5mcmFnbWVudFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgZGVmLlNoYWRlckxpYi51bmlmb3Jtcywgb3B0cy51bmlmb3JtcyB8fCB7fSApO1xuXG4gICAgICAgIHJldHVybiB7IHZlcnRleFNoYWRlcixmcmFnbWVudFNoYWRlcix1bmlmb3JtcyB9O1xuXG4gICAgfVxuXG4gICAgZXh0ZW5kKCBzaGFkZXI6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZywgb3B0czogU2hhZGVyRXh0ZW5zaW9uT3B0cyApOiB7IG5ldygpOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgfSB7XG5cbiAgICAgICAgbGV0IGRlZiA9IGdldFNoYWRlckRlZiggc2hhZGVyICk7IC8vIEFESlVTVCBUSElTIFNIQURFUiBERUYgLSBPTkxZIERFRklORSBPTkNFIC0gQU5EIFNUT1JFIEEgVVNFIENPVU5UIE9OIEVYVEVOREVEIFZFUlNJT05TLlxuXG4gICAgICAgIGxldCB2ZXJ0ZXhTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIudmVydGV4U2hhZGVyLCB0aGlzLl92ZXJ0ZXhIb29rcywgb3B0cy52ZXJ0ZXhTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IGZyYWdtZW50U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLmZyYWdtZW50U2hhZGVyLCB0aGlzLl9mcmFnbWVudEhvb2tzLCBvcHRzLmZyYWdtZW50U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBkZWYuU2hhZGVyTGliLnVuaWZvcm1zLCBvcHRzLnVuaWZvcm1zIHx8IHt9ICk7XG5cbiAgICAgICAgbGV0IENsYXNzTmFtZSA9IG9wdHMuY2xhc3NOYW1lIHx8IGRlZi5Nb2RpZmllZE5hbWUoKTtcblxuICAgICAgICBsZXQgZXh0ZW5kTWF0ZXJpYWwgPSBuZXcgRnVuY3Rpb24oICdCYXNlQ2xhc3MnLCAndW5pZm9ybXMnLCAndmVydGV4U2hhZGVyJywgJ2ZyYWdtZW50U2hhZGVyJywgJ2Nsb25lVW5pZm9ybXMnLGBcblxuICAgICAgICAgICAgdmFyIGNscyA9IGZ1bmN0aW9uICR7Q2xhc3NOYW1lfSggcGFyYW1zICl7XG5cbiAgICAgICAgICAgICAgICBCYXNlQ2xhc3MuY2FsbCggdGhpcywgcGFyYW1zICk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1zID0gY2xvbmVVbmlmb3JtcyggdW5pZm9ybXMgKTtcblxuICAgICAgICAgICAgICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0VmFsdWVzKCBwYXJhbXMgKTtcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjbHMucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSggQmFzZUNsYXNzLnByb3RvdHlwZSApO1xuICAgICAgICAgICAgY2xzLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGNscztcbiAgICAgICAgICAgIGNscy5wcm90b3R5cGUuJHsgZGVmLlR5cGVDaGVjayB9ID0gdHJ1ZTtcblxuICAgICAgICAgICAgY2xzLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24oIHNvdXJjZSApe1xuXG4gICAgICAgICAgICAgICAgQmFzZUNsYXNzLnByb3RvdHlwZS5jb3B5LmNhbGwoIHRoaXMsIHNvdXJjZSApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy51bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBzb3VyY2UudW5pZm9ybXMgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRleFNoYWRlciA9IHZlcnRleFNoYWRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gY2xzO1xuXG4gICAgICAgIGApO1xuXG4gICAgICAgIGlmKCBvcHRzLnBvc3RNb2RpZnlWZXJ0ZXhTaGFkZXIgKXtcbiAgICAgICAgICAgIHZlcnRleFNoYWRlciA9IG9wdHMucG9zdE1vZGlmeVZlcnRleFNoYWRlciggdmVydGV4U2hhZGVyICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYoIG9wdHMucG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyICl7XG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlciA9IG9wdHMucG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyKCBmcmFnbWVudFNoYWRlciApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGV4dGVuZE1hdGVyaWFsKCBkZWYuU2hhZGVyQ2xhc3MsIHVuaWZvcm1zLCB2ZXJ0ZXhTaGFkZXIsIGZyYWdtZW50U2hhZGVyLCBjbG9uZVVuaWZvcm1zICk7XG5cbiAgICB9XG5cbiAgICBkZWZpbmVWZXJ0ZXhIb29rcyggZGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICl7XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGRlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuX3ZlcnRleEhvb2tzWyBrZXkgXSA9IGRlZnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgZGVmaW5lRnJhZ21lbnRIb29rcyggZGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmcgfSApIHtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gZGVmcyApe1xuICAgICAgICAgICAgdGhpcy5fZnJhZ21lbnRIb29rc1sga2V5IF0gPSBkZWZzW2tleV07XG4gICAgICAgIH1cblxuICAgIH1cblxufVxuXG5sZXQgZGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgPSBuZXcgTWF0ZXJpYWxNb2RpZmllciggZGVmYXVsdEhvb2tzLnZlcnRleEhvb2tzLCBkZWZhdWx0SG9va3MuZnJhZ21lbnRIb29rcyApO1xuXG5leHBvcnQgeyBFeHRlbmRlZE1hdGVyaWFsLCBNYXRlcmlhbE1vZGlmaWVyLCBTaGFkZXJFeHRlbnNpb24sIFNoYWRlckV4dGVuc2lvbk9wdHMsIGRlZmF1bHRNYXRlcmlhbE1vZGlmaWVyICBhcyBEZWZhdWx0TWF0ZXJpYWxNb2RpZmllcn0iLCJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxuICAgICAgICAvLyBhYm92ZSBoZXJlLCB0aGUgdGV4dHVyZSBsb29rdXAgd2lsbCBiZSBkb25lLCB3aGljaCB3ZVxuICAgICAgICAvLyBjYW4gZGlzYWJsZSBieSByZW1vdmluZyB0aGUgbWFwIGZyb20gdGhlIG1hdGVyaWFsXG4gICAgICAgIC8vIGJ1dCBpZiB3ZSBsZWF2ZSBpdCwgd2UgY2FuIGFsc28gY2hvb3NlIHRoZSBibGVuZCB0aGUgdGV4dHVyZVxuICAgICAgICAvLyB3aXRoIG91ciBzaGFkZXIgY3JlYXRlZCBjb2xvciwgb3IgdXNlIGl0IGluIHRoZSBzaGFkZXIgb3JcbiAgICAgICAgLy8gd2hhdGV2ZXJcbiAgICAgICAgLy9cbiAgICAgICAgLy8gdmVjNCB0ZXhlbENvbG9yID0gdGV4dHVyZTJEKCBtYXAsIHZVdiApO1xuICAgICAgICAvLyB0ZXhlbENvbG9yID0gbWFwVGV4ZWxUb0xpbmVhciggdGV4ZWxDb2xvciApO1xuICAgICAgICBcbiAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgICAgICAgXG4gICAgICAgIHZlYzQgc2hhZGVyQ29sb3I7XG4gICAgICAgIG1haW5JbWFnZShzaGFkZXJDb2xvciwgdXYueHkgKiBpUmVzb2x1dGlvbi54eSk7XG4gICAgICAgIHNoYWRlckNvbG9yID0gbWFwVGV4ZWxUb0xpbmVhciggc2hhZGVyQ29sb3IgKTtcblxuICAgICAgICBkaWZmdXNlQ29sb3IgKj0gc2hhZGVyQ29sb3I7XG5gO1xuIiwiZXhwb3J0IGRlZmF1bHQge1xuICAgIGlUaW1lOiB7IHZhbHVlOiAwLjAgfSxcbiAgICBpUmVzb2x1dGlvbjogIHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IzKDUxMiwgNTEyLCAxKSB9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH1cbn07IiwiZXhwb3J0IGRlZmF1bHQgLyogZ2xzbCAqL2BcbnVuaWZvcm0gdmVjMyBpUmVzb2x1dGlvbjtcbnVuaWZvcm0gZmxvYXQgaVRpbWU7XG51bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xudW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbnVuaWZvcm0gaW50IHRleEZsaXBZOyBcbiAgYDtcbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2E0NDhlMzRiODEzNmZhZTUucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBiYXllckltYWdlIGZyb20gJy4uL2Fzc2V0cy9iYXllci5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgYmF5ZXJUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChiYXllckltYWdlLCAoYmF5ZXIpID0+IHtcbiAgICBiYXllci5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJheWVyLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmF5ZXIud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYXllci53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJheWVyVGV4ID0gYmF5ZXJcbn0pXG5cbmxldCBCbGVlcHlCbG9ja3NTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuXG4gIHZlcnRleFNoYWRlcjoge30sXG5cbiAgZnJhZ21lbnRTaGFkZXI6IHsgXG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgLy8gQnkgRGFlZGVsdXM6IGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdXNlci9EYWVkZWx1c1xuICAgICAgLy8gbGljZW5zZTogQ3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbi1Ob25Db21tZXJjaWFsLVNoYXJlQWxpa2UgMy4wIFVucG9ydGVkIExpY2Vuc2UuXG4gICAgICAjZGVmaW5lIFRJTUVTQ0FMRSAwLjI1IFxuICAgICAgI2RlZmluZSBUSUxFUyA4XG4gICAgICAjZGVmaW5lIENPTE9SIDAuNywgMS42LCAyLjhcblxuICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAge1xuICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgICAgIHV2LnggKj0gaVJlc29sdXRpb24ueCAvIGlSZXNvbHV0aW9uLnk7XG4gICAgICAgIFxuICAgICAgICB2ZWM0IG5vaXNlID0gdGV4dHVyZTJEKGlDaGFubmVsMCwgZmxvb3IodXYgKiBmbG9hdChUSUxFUykpIC8gZmxvYXQoVElMRVMpKTtcbiAgICAgICAgZmxvYXQgcCA9IDEuMCAtIG1vZChub2lzZS5yICsgbm9pc2UuZyArIG5vaXNlLmIgKyBpVGltZSAqIGZsb2F0KFRJTUVTQ0FMRSksIDEuMCk7XG4gICAgICAgIHAgPSBtaW4obWF4KHAgKiAzLjAgLSAxLjgsIDAuMSksIDIuMCk7XG4gICAgICAgIFxuICAgICAgICB2ZWMyIHIgPSBtb2QodXYgKiBmbG9hdChUSUxFUyksIDEuMCk7XG4gICAgICAgIHIgPSB2ZWMyKHBvdyhyLnggLSAwLjUsIDIuMCksIHBvdyhyLnkgLSAwLjUsIDIuMCkpO1xuICAgICAgICBwICo9IDEuMCAtIHBvdyhtaW4oMS4wLCAxMi4wICogZG90KHIsIHIpKSwgMi4wKTtcbiAgICAgICAgXG4gICAgICAgIGZyYWdDb2xvciA9IHZlYzQoQ09MT1IsIDEuMCkgKiBwO1xuICAgICAgfVxuICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gYmF5ZXJUZXhcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gYmF5ZXJUZXhcbiAgICB9XG5cbn1cbmV4cG9ydCB7IEJsZWVweUJsb2Nrc1NoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IE5vaXNlU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAjZGVmaW5lIG5QSSAzLjE0MTU5MjY1MzU4OTc5MzJcblxuICAgICAgICBtYXQyIG5fcm90YXRlMmQoZmxvYXQgYW5nbGUpe1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXQyKGNvcyhhbmdsZSksLXNpbihhbmdsZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luKGFuZ2xlKSwgY29zKGFuZ2xlKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG5fc3RyaXBlKGZsb2F0IG51bWJlcikge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1vZCA9IG1vZChudW1iZXIsIDIuMCk7XG4gICAgICAgICAgICAgICAgLy9yZXR1cm4gc3RlcCgwLjUsIG1vZCkqc3RlcCgxLjUsIG1vZCk7XG4gICAgICAgICAgICAgICAgLy9yZXR1cm4gbW9kLTEuMDtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWluKDEuMCwgKHNtb290aHN0ZXAoMC4wLCAwLjUsIG1vZCkgLSBzbW9vdGhzdGVwKDAuNSwgMS4wLCBtb2QpKSoxLjApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApIHtcbiAgICAgICAgICAgICAgICB2ZWMyIHVfcmVzb2x1dGlvbiA9IGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgICAgIGZsb2F0IHVfdGltZSA9IGlUaW1lO1xuICAgICAgICAgICAgICAgIHZlYzMgY29sb3I7XG4gICAgICAgICAgICAgICAgdmVjMiBzdCA9IGZyYWdDb29yZC54eTtcbiAgICAgICAgICAgICAgICBzdCArPSAyMDAwLjAgKyA5OTgwMDAuMCpzdGVwKDEuNzUsIDEuMC1zaW4odV90aW1lLzguMCkpO1xuICAgICAgICAgICAgICAgIHN0ICs9IHVfdGltZS8yMDAwLjA7XG4gICAgICAgICAgICAgICAgZmxvYXQgbSA9ICgxLjArOS4wKnN0ZXAoMS4wLCAxLjAtc2luKHVfdGltZS84LjApKSkvKDEuMCs5LjAqc3RlcCgxLjAsIDEuMC1zaW4odV90aW1lLzE2LjApKSk7XG4gICAgICAgICAgICAgICAgdmVjMiBzdDEgPSBzdCAqICg0MDAuMCArIDEyMDAuMCpzdGVwKDEuNzUsIDEuMCtzaW4odV90aW1lKSkgLSAzMDAuMCpzdGVwKDEuNSwgMS4wK3Npbih1X3RpbWUvMy4wKSkpO1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZChzaW4oc3QxLngpKnNpbihzdDEueSkvKG0qMTAwLjArdV90aW1lLzEwMC4wKSkgKiBzdDtcbiAgICAgICAgICAgICAgICB2ZWMyIHN0MiA9IHN0ICogKDEwMC4wICsgMTkwMC4wKnN0ZXAoMS43NSwgMS4wLXNpbih1X3RpbWUvMi4wKSkpO1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZChjb3Moc3QyLngpKmNvcyhzdDIueSkvKG0qMTAwLjArdV90aW1lLzEwMC4wKSkgKiBzdDtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoMC41Km5QSSsoblBJKjAuNSpzdGVwKCAxLjAsMS4wKyBzaW4odV90aW1lLzEuMCkpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyhuUEkqMC4xKnN0ZXAoIDEuMCwxLjArIGNvcyh1X3RpbWUvMi4wKSkpK3VfdGltZSowLjAwMDEpICogc3Q7XG4gICAgICAgICAgICAgICAgc3QgKj0gMTAuMDtcbiAgICAgICAgICAgICAgICBzdCAvPSB1X3Jlc29sdXRpb247XG4gICAgICAgICAgICAgICAgY29sb3IgPSB2ZWMzKG5fc3RyaXBlKHN0LngqdV9yZXNvbHV0aW9uLngvMTAuMCt1X3RpbWUvMTAuMCkpO1xuICAgICAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBOb2lzZVNoYWRlciB9XG4iLCIvLyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9YZHNCREJcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxubGV0IExpcXVpZE1hcmJsZVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgIC8vLy8gQ09MT1JTIC8vLy9cblxuICAgICAgY29uc3QgdmVjMyBPUkFOR0UgPSB2ZWMzKDEuMCwgMC42LCAwLjIpO1xuICAgICAgY29uc3QgdmVjMyBQSU5LICAgPSB2ZWMzKDAuNywgMC4xLCAwLjQpOyBcbiAgICAgIGNvbnN0IHZlYzMgQkxVRSAgID0gdmVjMygwLjAsIDAuMiwgMC45KTsgXG4gICAgICBjb25zdCB2ZWMzIEJMQUNLICA9IHZlYzMoMC4wLCAwLjAsIDAuMik7XG4gICAgICBcbiAgICAgIC8vLy8vIE5PSVNFIC8vLy8vXG4gICAgICBcbiAgICAgIGZsb2F0IGhhc2goIGZsb2F0IG4gKSB7XG4gICAgICAgICAgLy9yZXR1cm4gZnJhY3Qoc2luKG4pKjQzNzU4LjU0NTMxMjMpOyAgIFxuICAgICAgICAgIHJldHVybiBmcmFjdChzaW4obikqNzU3MjguNTQ1MzEyMyk7IFxuICAgICAgfVxuICAgICAgXG4gICAgICBcbiAgICAgIGZsb2F0IG5vaXNlKCBpbiB2ZWMyIHggKSB7XG4gICAgICAgICAgdmVjMiBwID0gZmxvb3IoeCk7XG4gICAgICAgICAgdmVjMiBmID0gZnJhY3QoeCk7XG4gICAgICAgICAgZiA9IGYqZiooMy4wLTIuMCpmKTtcbiAgICAgICAgICBmbG9hdCBuID0gcC54ICsgcC55KjU3LjA7XG4gICAgICAgICAgcmV0dXJuIG1peChtaXgoIGhhc2gobiArIDAuMCksIGhhc2gobiArIDEuMCksIGYueCksIG1peChoYXNoKG4gKyA1Ny4wKSwgaGFzaChuICsgNTguMCksIGYueCksIGYueSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vLy8vLyBGQk0gLy8vLy8vIFxuICAgICAgXG4gICAgICBtYXQyIG0gPSBtYXQyKCAwLjYsIDAuNiwgLTAuNiwgMC44KTtcbiAgICAgIGZsb2F0IGZibSh2ZWMyIHApe1xuICAgICAgIFxuICAgICAgICAgIGZsb2F0IGYgPSAwLjA7XG4gICAgICAgICAgZiArPSAwLjUwMDAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMjtcbiAgICAgICAgICBmICs9IDAuMjUwMCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAzO1xuICAgICAgICAgIGYgKz0gMC4xMjUwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDE7XG4gICAgICAgICAgZiArPSAwLjA2MjUgKiBub2lzZShwKTsgcCAqPSBtICogMi4wNDtcbiAgICAgICAgICBmIC89IDAuOTM3NTtcbiAgICAgICAgICByZXR1cm4gZjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgICB2b2lkIG1haW5JbWFnZShvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkKXtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBwaXhlbCByYXRpb1xuICAgICAgICAgIFxuICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eSA7ICBcbiAgICAgICAgICB2ZWMyIHAgPSAtIDEuICsgMi4gKiB1djtcbiAgICAgICAgICBwLnggKj0gaVJlc29sdXRpb24ueCAvIGlSZXNvbHV0aW9uLnk7XG4gICAgICAgICAgIFxuICAgICAgICAgIC8vIGRvbWFpbnNcbiAgICAgICAgICBcbiAgICAgICAgICBmbG9hdCByID0gc3FydChkb3QocCxwKSk7IFxuICAgICAgICAgIGZsb2F0IGEgPSBjb3MocC55ICogcC54KTsgIFxuICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAvLyBkaXN0b3J0aW9uXG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgZiA9IGZibSggNS4wICogcCk7XG4gICAgICAgICAgYSArPSBmYm0odmVjMigxLjkgLSBwLngsIDAuOSAqIGlUaW1lICsgcC55KSk7XG4gICAgICAgICAgYSArPSBmYm0oMC40ICogcCk7XG4gICAgICAgICAgciArPSBmYm0oMi45ICogcCk7XG4gICAgICAgICAgICAgXG4gICAgICAgICAgLy8gY29sb3JpemVcbiAgICAgICAgICBcbiAgICAgICAgICB2ZWMzIGNvbCA9IEJMVUU7XG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKC0wLjQsIDEuMSwgbm9pc2UodmVjMigwLjUgKiBhLCAzLjMgKiBhKSkgKTsgICAgICAgIFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgT1JBTkdFLCBmZik7XG4gICAgICAgICAgICAgXG4gICAgICAgICAgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKC4wLCAyLjgsIHIgKTtcbiAgICAgICAgICBjb2wgKz0gIG1peCggY29sLCBCTEFDSywgIGZmKTtcbiAgICAgICAgICBcbiAgICAgICAgICBmZiAtPSAxLjAgLSBzbW9vdGhzdGVwKDAuMywgMC41LCBmYm0odmVjMigxLjAsIDQwLjAgKiBhKSkgKTsgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBQSU5LLCAgZmYpOyAgXG4gICAgICAgICAgICBcbiAgICAgICAgICBmZiA9IDEuMCAtIHNtb290aHN0ZXAoMi4sIDIuOSwgYSAqIDEuNSApOyBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIEJMQUNLLCAgZmYpOyAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChjb2wsIDEuKTtcbiAgICAgIH1cbiAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIobWF0Lm1hcC5vZmZzZXQueCsgTWF0aC5yYW5kb20oKSwgbWF0Lm1hcC5vZmZzZXQueCsgTWF0aC5yYW5kb20oKSkgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICB9XG59XG5cbmV4cG9ydCB7IExpcXVpZE1hcmJsZVNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9jZWNlZmI1MGU0MDhkMTA1LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc2xHV05cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBHYWxheHlTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvL0NCU1xuICAgICAgICAvL1BhcmFsbGF4IHNjcm9sbGluZyBmcmFjdGFsIGdhbGF4eS5cbiAgICAgICAgLy9JbnNwaXJlZCBieSBKb3NoUCdzIFNpbXBsaWNpdHkgc2hhZGVyOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvbHNsR1dyXG4gICAgICAgIFxuICAgICAgICAvLyBodHRwOi8vd3d3LmZyYWN0YWxmb3J1bXMuY29tL25ldy10aGVvcmllcy1hbmQtcmVzZWFyY2gvdmVyeS1zaW1wbGUtZm9ybXVsYS1mb3ItZnJhY3RhbC1wYXR0ZXJucy9cbiAgICAgICAgZmxvYXQgZmllbGQoaW4gdmVjMyBwLGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMjY7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExlc3MgaXRlcmF0aW9ucyBmb3Igc2Vjb25kIGxheWVyXG4gICAgICAgIGZsb2F0IGZpZWxkMihpbiB2ZWMzIHAsIGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMTg7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbnJhbmQzKCB2ZWMyIGNvIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBhID0gZnJhY3QoIGNvcyggY28ueCo4LjNlLTMgKyBjby55ICkqdmVjMygxLjNlNSwgNC43ZTUsIDIuOWU1KSApO1xuICAgICAgICAgICAgdmVjMyBiID0gZnJhY3QoIHNpbiggY28ueCowLjNlLTMgKyBjby55ICkqdmVjMyg4LjFlNSwgMS4wZTUsIDAuMWU1KSApO1xuICAgICAgICAgICAgdmVjMyBjID0gbWl4KGEsIGIsIDAuNSk7XG4gICAgICAgICAgICByZXR1cm4gYztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkICkge1xuICAgICAgICAgICAgdmVjMiB1diA9IDIuICogZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHkgLSAxLjtcbiAgICAgICAgICAgIHZlYzIgdXZzID0gdXYgKiBpUmVzb2x1dGlvbi54eSAvIG1heChpUmVzb2x1dGlvbi54LCBpUmVzb2x1dGlvbi55KTtcbiAgICAgICAgICAgIHZlYzMgcCA9IHZlYzModXZzIC8gNC4sIDApICsgdmVjMygxLiwgLTEuMywgMC4pO1xuICAgICAgICAgICAgcCArPSAuMiAqIHZlYzMoc2luKGlUaW1lIC8gMTYuKSwgc2luKGlUaW1lIC8gMTIuKSwgIHNpbihpVGltZSAvIDEyOC4pKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZnJlcXNbNF07XG4gICAgICAgICAgICAvL1NvdW5kXG4gICAgICAgICAgICBmcmVxc1swXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4wMSwgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzFdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjA3LCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbMl0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMTUsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1szXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4zMCwgMC4yNSApICkueDtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0ID0gZmllbGQocCxmcmVxc1syXSk7XG4gICAgICAgICAgICBmbG9hdCB2ID0gKDEuIC0gZXhwKChhYnModXYueCkgLSAxLikgKiA2LikpICogKDEuIC0gZXhwKChhYnModXYueSkgLSAxLikgKiA2LikpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1NlY29uZCBMYXllclxuICAgICAgICAgICAgdmVjMyBwMiA9IHZlYzModXZzIC8gKDQuK3NpbihpVGltZSowLjExKSowLjIrMC4yK3NpbihpVGltZSowLjE1KSowLjMrMC40KSwgMS41KSArIHZlYzMoMi4sIC0xLjMsIC0xLik7XG4gICAgICAgICAgICBwMiArPSAwLjI1ICogdmVjMyhzaW4oaVRpbWUgLyAxNi4pLCBzaW4oaVRpbWUgLyAxMi4pLCAgc2luKGlUaW1lIC8gMTI4LikpO1xuICAgICAgICAgICAgZmxvYXQgdDIgPSBmaWVsZDIocDIsZnJlcXNbM10pO1xuICAgICAgICAgICAgdmVjNCBjMiA9IG1peCguNCwgMS4sIHYpICogdmVjNCgxLjMgKiB0MiAqIHQyICogdDIgLDEuOCAgKiB0MiAqIHQyICwgdDIqIGZyZXFzWzBdLCB0Mik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9MZXQncyBhZGQgc29tZSBzdGFyc1xuICAgICAgICAgICAgLy9UaGFua3MgdG8gaHR0cDovL2dsc2wuaGVyb2t1LmNvbS9lIzY5MDQuMFxuICAgICAgICAgICAgdmVjMiBzZWVkID0gcC54eSAqIDIuMDtcdFxuICAgICAgICAgICAgc2VlZCA9IGZsb29yKHNlZWQgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kID0gbnJhbmQzKCBzZWVkICk7XG4gICAgICAgICAgICB2ZWM0IHN0YXJjb2xvciA9IHZlYzQocG93KHJuZC55LDQwLjApKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9TZWNvbmQgTGF5ZXJcbiAgICAgICAgICAgIHZlYzIgc2VlZDIgPSBwMi54eSAqIDIuMDtcbiAgICAgICAgICAgIHNlZWQyID0gZmxvb3Ioc2VlZDIgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kMiA9IG5yYW5kMyggc2VlZDIgKTtcbiAgICAgICAgICAgIHN0YXJjb2xvciArPSB2ZWM0KHBvdyhybmQyLnksNDAuMCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmcmFnQ29sb3IgPSBtaXgoZnJlcXNbM10tLjMsIDEuLCB2KSAqIHZlYzQoMS41KmZyZXFzWzJdICogdCAqIHQqIHQgLCAxLjIqZnJlcXNbMV0gKiB0ICogdCwgZnJlcXNbM10qdCwgMS4wKStjMitzdGFyY29sb3I7XG4gICAgICAgIH1cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IEdhbGF4eVNoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzRzR1N6Y1xuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcblxubGV0IExhY2VUdW5uZWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBDcmVhdGVkIGJ5IFN0ZXBoYW5lIEN1aWxsZXJkaWVyIC0gQWlla2ljay8yMDE1ICh0d2l0dGVyOkBhaWVraWNrKVxuICAgICAgICAvLyBMaWNlbnNlIENyZWF0aXZlIENvbW1vbnMgQXR0cmlidXRpb24tTm9uQ29tbWVyY2lhbC1TaGFyZUFsaWtlIDMuMCBVbnBvcnRlZCBMaWNlbnNlLlxuICAgICAgICAvLyBUdW5lZCB2aWEgWFNoYWRlIChodHRwOi8vd3d3LmZ1bnBhcmFkaWdtLmNvbS94c2hhZGUvKVxuICAgICAgICBcbiAgICAgICAgdmVjMiBsdF9tbyA9IHZlYzIoMCk7XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBsdF9wbiggaW4gdmVjMyB4ICkgLy8gaXEgbm9pc2VcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBwID0gZmxvb3IoeCk7XG4gICAgICAgICAgICB2ZWMzIGYgPSBmcmFjdCh4KTtcbiAgICAgICAgICAgIGYgPSBmKmYqKDMuMC0yLjAqZik7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gKHAueHkrdmVjMigzNy4wLDE3LjApKnAueikgKyBmLnh5O1xuICAgICAgICAgICAgdmVjMiByZyA9IHRleHR1cmUoaUNoYW5uZWwwLCAodXYrIDAuNSkvMjU2LjAsIC0xMDAuMCApLnl4O1xuICAgICAgICAgICAgcmV0dXJuIC0xLjArMi40Km1peCggcmcueCwgcmcueSwgZi56ICk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzIgbHRfcGF0aChmbG9hdCB0KVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gdmVjMihjb3ModCowLjIpLCBzaW4odCowLjIpKSAqIDIuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXQzIGx0X214ID0gbWF0MygxLDAsMCwwLDcsMCwwLDAsNyk7XG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXkgPSBtYXQzKDcsMCwwLDAsMSwwLDAsMCw3KTtcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teiA9IG1hdDMoNywwLDAsMCw3LDAsMCwwLDEpO1xuICAgICAgICBcbiAgICAgICAgLy8gYmFzZSBvbiBzaGFuZSB0ZWNoIGluIHNoYWRlciA6IE9uZSBUd2VldCBDZWxsdWxhciBQYXR0ZXJuXG4gICAgICAgIGZsb2F0IGx0X2Z1bmModmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwID0gZnJhY3QocC82OC42KSAtIC41O1xuICAgICAgICAgICAgcmV0dXJuIG1pbihtaW4oYWJzKHAueCksIGFicyhwLnkpKSwgYWJzKHAueikpICsgMC4xO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X2VmZmVjdCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAgKj0gbHRfbXogKiBsdF9teCAqIGx0X215ICogc2luKHAuenh5KTsgLy8gc2luKHAuenh5KSBpcyBiYXNlZCBvbiBpcSB0ZWNoIGZyb20gc2hhZGVyIChTY3VscHR1cmUgSUlJKVxuICAgICAgICAgICAgcmV0dXJuIHZlYzMobWluKG1pbihsdF9mdW5jKHAqbHRfbXgpLCBsdF9mdW5jKHAqbHRfbXkpKSwgbHRfZnVuYyhwKmx0X216KSkvLjYpO1xuICAgICAgICB9XG4gICAgICAgIC8vXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2Rpc3BsYWNlbWVudCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgY29sID0gMS4tbHRfZWZmZWN0KHAqMC44KTtcbiAgICAgICAgICAgICAgIGNvbCA9IGNsYW1wKGNvbCwgLS41LCAxLik7XG4gICAgICAgICAgICBmbG9hdCBkaXN0ID0gZG90KGNvbCx2ZWMzKDAuMDIzKSk7XG4gICAgICAgICAgICBjb2wgPSBzdGVwKGNvbCwgdmVjMygwLjgyKSk7Ly8gYmxhY2sgbGluZSBvbiBzaGFwZVxuICAgICAgICAgICAgcmV0dXJuIHZlYzQoZGlzdCxjb2wpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X21hcCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAueHkgLT0gbHRfcGF0aChwLnopO1xuICAgICAgICAgICAgdmVjNCBkaXNwID0gbHRfZGlzcGxhY2VtZW50KHNpbihwLnp4eSoyLikqMC44KTtcbiAgICAgICAgICAgIHAgKz0gc2luKHAuenh5Ki41KSoxLjU7XG4gICAgICAgICAgICBmbG9hdCBsID0gbGVuZ3RoKHAueHkpIC0gNC47XG4gICAgICAgICAgICByZXR1cm4gdmVjNChtYXgoLWwgKyAwLjA5LCBsKSAtIGRpc3AueCwgZGlzcC55encpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X25vciggaW4gdmVjMyBwb3MsIGZsb2F0IHByZWMgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGVwcyA9IHZlYzMoIHByZWMsIDAuLCAwLiApO1xuICAgICAgICAgICAgdmVjMyBsdF9ub3IgPSB2ZWMzKFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnh5eSkueCAtIGx0X21hcChwb3MtZXBzLnh5eSkueCxcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy55eHkpLnggLSBsdF9tYXAocG9zLWVwcy55eHkpLngsXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueXl4KS54IC0gbHRfbWFwKHBvcy1lcHMueXl4KS54ICk7XG4gICAgICAgICAgICByZXR1cm4gbm9ybWFsaXplKGx0X25vcik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2xpZ2h0KHZlYzMgcm8sIHZlYzMgcmQsIGZsb2F0IGQsIHZlYzMgbGlnaHRwb3MsIHZlYzMgbGMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgcCA9IHJvICsgcmQgKiBkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBvcmlnaW5hbCBub3JtYWxlXG4gICAgICAgICAgICB2ZWMzIG4gPSBsdF9ub3IocCwgMC4xKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBsaWdodGRpciA9IGxpZ2h0cG9zIC0gcDtcbiAgICAgICAgICAgIGZsb2F0IGxpZ2h0bGVuID0gbGVuZ3RoKGxpZ2h0cG9zIC0gcCk7XG4gICAgICAgICAgICBsaWdodGRpciAvPSBsaWdodGxlbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYW1iID0gMC42O1xuICAgICAgICAgICAgZmxvYXQgZGlmZiA9IGNsYW1wKCBkb3QoIG4sIGxpZ2h0ZGlyICksIDAuMCwgMS4wICk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGJyZGYgPSB2ZWMzKDApO1xuICAgICAgICAgICAgYnJkZiArPSBhbWIgKiB2ZWMzKDAuMiwwLjUsMC4zKTsgLy8gY29sb3IgbWF0XG4gICAgICAgICAgICBicmRmICs9IGRpZmYgKiAwLjY7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZGYgPSBtaXgoYnJkZiwgbHRfbWFwKHApLnl6dywgMC41KTsvLyBtZXJnZSBsaWdodCBhbmQgYmxhY2sgbGluZSBwYXR0ZXJuXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdmVjNChicmRmLCBsaWdodGxlbik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfc3RhcnModmVjMiB1diwgdmVjMyByZCwgZmxvYXQgZCwgdmVjMiBzLCB2ZWMyIGcpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHV2ICo9IDgwMC4gKiBzLngvcy55O1xuICAgICAgICAgICAgZmxvYXQgayA9IGZyYWN0KCBjb3ModXYueSAqIDAuMDAwMSArIHV2LngpICogOTAwMDAuKTtcbiAgICAgICAgICAgIGZsb2F0IHZhciA9IHNpbihsdF9wbihkKjAuNityZCoxODIuMTQpKSowLjUrMC41Oy8vIHRoYW5rIHRvIGtsZW1zIGZvciB0aGUgdmFyaWF0aW9uIGluIG15IHNoYWRlciBzdWJsdW1pbmljXG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHZlYzMobWl4KDAuLCAxLiwgdmFyKnBvdyhrLCAyMDAuKSkpOy8vIGNvbWUgZnJvbSBDQlMgU2hhZGVyIFwiU2ltcGxpY2l0eVwiIDogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zbEdXTlxuICAgICAgICAgICAgcmV0dXJuIGNvbDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8vLy8vLy9NQUlOLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgcyA9IGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgdmVjMiBnID0gZnJhZ0Nvb3JkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdGltZSA9IGlUaW1lKjEuMDtcbiAgICAgICAgICAgIGZsb2F0IGNhbV9hID0gdGltZTsgLy8gYW5nbGUgelxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBjYW1fZSA9IDMuMjsgLy8gZWxldmF0aW9uXG4gICAgICAgICAgICBmbG9hdCBjYW1fZCA9IDQuOyAvLyBkaXN0YW5jZSB0byBvcmlnaW4gYXhpc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBtYXhkID0gNDAuOyAvLyByYXkgbWFyY2hpbmcgZGlzdGFuY2UgbWF4XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgdXYgPSAoZyoyLi1zKS9zLnk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY29sID0gdmVjMygwLik7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyBybyA9IHZlYzMobHRfcGF0aCh0aW1lKStsdF9tbyx0aW1lKTtcbiAgICAgICAgICAgICAgdmVjMyBjdiA9IHZlYzMobHRfcGF0aCh0aW1lKzAuMSkrbHRfbW8sdGltZSswLjEpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1PXZlYzMoMCwxLDApO1xuICAgICAgICAgICAgICB2ZWMzIHJvdiA9IG5vcm1hbGl6ZShjdi1ybyk7XG4gICAgICAgICAgICB2ZWMzIHUgPSBub3JtYWxpemUoY3Jvc3MoY3Uscm92KSk7XG4gICAgICAgICAgICAgIHZlYzMgdiA9IGNyb3NzKHJvdix1KTtcbiAgICAgICAgICAgICAgdmVjMyByZCA9IG5vcm1hbGl6ZShyb3YgKyB1di54KnUgKyB1di55KnYpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1cnZlMCA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMSA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMiA9IHZlYzMoMCk7XG4gICAgICAgICAgICBmbG9hdCBvdXRTdGVwID0gMC47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGFvID0gMC47IC8vIGFvIGxvdyBjb3N0IDopXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHN0ID0gMC47XG4gICAgICAgICAgICBmbG9hdCBkID0gMC47XG4gICAgICAgICAgICBmb3IoaW50IGk9MDtpPDI1MDtpKyspXG4gICAgICAgICAgICB7ICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHN0PDAuMDI1KmxvZyhkKmQvc3QvMWU1KXx8ZD5tYXhkKSBicmVhazsvLyBzcGVjaWFsIGJyZWFrIGNvbmRpdGlvbiBmb3IgbG93IHRoaWNrbmVzcyBvYmplY3RcbiAgICAgICAgICAgICAgICBzdCA9IGx0X21hcChybytyZCpkKS54O1xuICAgICAgICAgICAgICAgIGQgKz0gc3QgKiAwLjY7IC8vIHRoZSAwLjYgaXMgc2VsZWN0ZWQgYWNjb3JkaW5nIHRvIHRoZSAxZTUgYW5kIHRoZSAwLjAyNSBvZiB0aGUgYnJlYWsgY29uZGl0aW9uIGZvciBnb29kIHJlc3VsdFxuICAgICAgICAgICAgICAgIGFvKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkIDwgbWF4ZClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2ZWM0IGxpID0gbHRfbGlnaHQocm8sIHJkLCBkLCBybywgdmVjMygwKSk7Ly8gcG9pbnQgbGlnaHQgb24gdGhlIGNhbVxuICAgICAgICAgICAgICAgIGNvbCA9IGxpLnh5ei8obGkudyowLjIpOy8vIGNoZWFwIGxpZ2h0IGF0dGVudWF0aW9uXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgY29sID0gbWl4KHZlYzMoMS4tYW8vMTAwLiksIGNvbCwgMC41KTsvLyBsb3cgY29zdCBhbyA6KVxuICAgICAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgPSBtaXgoIGNvbCwgdmVjMygwKSwgMS4wLWV4cCggLTAuMDAzKmQqZCApICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBmcmFnQ29sb3IucmdiID0gbHRfc3RhcnModXYsIHJkLCBkLCBzLCBmcmFnQ29vcmQpOy8vIHN0YXJzIGJnXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHZpZ25ldHRlXG4gICAgICAgICAgICB2ZWMyIHEgPSBmcmFnQ29vcmQvcztcbiAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgKj0gMC41ICsgMC41KnBvdyggMTYuMCpxLngqcS55KigxLjAtcS54KSooMS4wLXEueSksIDAuMjUgKTsgLy8gaXEgdmlnbmV0dGVcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBMYWNlVHVubmVsU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2YyN2UwMTA0NjA1ZjBjZDcucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01kZkdSWFxuXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL25vaXNlLTI1Ni5wbmcnXG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBpQ2hhbm5lbFJlc29sdXRpb246IHsgdmFsdWU6IFsgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpXSB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2VcbiAgICBjb25zb2xlLmxvZyggXCJub2lzZSB0ZXh0dXJlIHNpemU6IFwiLCBub2lzZS5pbWFnZS53aWR0aCxub2lzZS5pbWFnZS5oZWlnaHQgKTtcbn0pXG5cbmxldCBGaXJlVHVubmVsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICB1bmlmb3JtIHZlYzMgaUNoYW5uZWxSZXNvbHV0aW9uWzRdO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIENyZWF0ZWQgYnkgaW5pZ28gcXVpbGV6IC0gaXEvMjAxM1xuLy8gSSBzaGFyZSB0aGlzIHBpZWNlIChhcnQgYW5kIGNvZGUpIGhlcmUgaW4gU2hhZGVydG95IGFuZCB0aHJvdWdoIGl0cyBQdWJsaWMgQVBJLCBvbmx5IGZvciBlZHVjYXRpb25hbCBwdXJwb3Nlcy4gXG4vLyBZb3UgY2Fubm90IHVzZSwgc2VsbCwgc2hhcmUgb3IgaG9zdCB0aGlzIHBpZWNlIG9yIG1vZGlmaWNhdGlvbnMgb2YgaXQgYXMgcGFydCBvZiB5b3VyIG93biBjb21tZXJjaWFsIG9yIG5vbi1jb21tZXJjaWFsIHByb2R1Y3QsIHdlYnNpdGUgb3IgcHJvamVjdC5cbi8vIFlvdSBjYW4gc2hhcmUgYSBsaW5rIHRvIGl0IG9yIGFuIHVubW9kaWZpZWQgc2NyZWVuc2hvdCBvZiBpdCBwcm92aWRlZCB5b3UgYXR0cmlidXRlIFwiYnkgSW5pZ28gUXVpbGV6LCBAaXF1aWxlemxlcyBhbmQgaXF1aWxlemxlcy5vcmdcIi4gXG4vLyBJZiB5b3UgYXJlIGEgdGVjaGVyLCBsZWN0dXJlciwgZWR1Y2F0b3Igb3Igc2ltaWxhciBhbmQgdGhlc2UgY29uZGl0aW9ucyBhcmUgdG9vIHJlc3RyaWN0aXZlIGZvciB5b3VyIG5lZWRzLCBwbGVhc2UgY29udGFjdCBtZSBhbmQgd2UnbGwgd29yayBpdCBvdXQuXG5cbmZsb2F0IGZpcmVfbm9pc2UoIGluIHZlYzMgeCApXG57XG4gICAgdmVjMyBwID0gZmxvb3IoeCk7XG4gICAgdmVjMyBmID0gZnJhY3QoeCk7XG5cdGYgPSBmKmYqKDMuMC0yLjAqZik7XG5cdFxuXHR2ZWMyIHV2ID0gKHAueHkrdmVjMigzNy4wLDE3LjApKnAueikgKyBmLnh5O1xuXHR2ZWMyIHJnID0gdGV4dHVyZUxvZCggaUNoYW5uZWwwLCAodXYrIDAuNSkvMjU2LjAsIDAuMCApLnl4O1xuXHRyZXR1cm4gbWl4KCByZy54LCByZy55LCBmLnogKTtcbn1cblxudmVjNCBmaXJlX21hcCggdmVjMyBwIClcbntcblx0ZmxvYXQgZGVuID0gMC4yIC0gcC55O1xuXG4gICAgLy8gaW52ZXJ0IHNwYWNlXHRcblx0cCA9IC03LjAqcC9kb3QocCxwKTtcblxuICAgIC8vIHR3aXN0IHNwYWNlXHRcblx0ZmxvYXQgY28gPSBjb3MoZGVuIC0gMC4yNSppVGltZSk7XG5cdGZsb2F0IHNpID0gc2luKGRlbiAtIDAuMjUqaVRpbWUpO1xuXHRwLnh6ID0gbWF0Mihjbywtc2ksc2ksY28pKnAueHo7XG5cbiAgICAvLyBzbW9rZVx0XG5cdGZsb2F0IGY7XG5cdHZlYzMgcSA9IHAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7O1xuICAgIGYgID0gMC41MDAwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDIgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMjUwMDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAzIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjEyNTAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMSAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4wNjI1MCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDIgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMDMxMjUqZmlyZV9ub2lzZSggcSApO1xuXG5cdGRlbiA9IGNsYW1wKCBkZW4gKyA0LjAqZiwgMC4wLCAxLjAgKTtcblx0XG5cdHZlYzMgY29sID0gbWl4KCB2ZWMzKDEuMCwwLjksMC44KSwgdmVjMygwLjQsMC4xNSwwLjEpLCBkZW4gKSArIDAuMDUqc2luKHApO1xuXHRcblx0cmV0dXJuIHZlYzQoIGNvbCwgZGVuICk7XG59XG5cbnZlYzMgcmF5bWFyY2goIGluIHZlYzMgcm8sIGluIHZlYzMgcmQsIGluIHZlYzIgcGl4ZWwgKVxue1xuXHR2ZWM0IHN1bSA9IHZlYzQoIDAuMCApO1xuXG5cdGZsb2F0IHQgPSAwLjA7XG5cbiAgICAvLyBkaXRoZXJpbmdcdFxuXHR0ICs9IDAuMDUqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBwaXhlbC54eS9pQ2hhbm5lbFJlc29sdXRpb25bMF0ueCwgMC4wICkueDtcblx0XG5cdGZvciggaW50IGk9MDsgaTwxMDA7IGkrKyApXG5cdHtcblx0XHRpZiggc3VtLmEgPiAwLjk5ICkgYnJlYWs7XG5cdFx0XG5cdFx0dmVjMyBwb3MgPSBybyArIHQqcmQ7XG5cdFx0dmVjNCBjb2wgPSBmaXJlX21hcCggcG9zICk7XG5cdFx0XG5cdFx0Y29sLnh5eiAqPSBtaXgoIDMuMSp2ZWMzKDEuMCwwLjUsMC4wNSksIHZlYzMoMC40OCwwLjUzLDAuNSksIGNsYW1wKCAocG9zLnktMC4yKS8yLjAsIDAuMCwgMS4wICkgKTtcblx0XHRcblx0XHRjb2wuYSAqPSAwLjY7XG5cdFx0Y29sLnJnYiAqPSBjb2wuYTtcblxuXHRcdHN1bSA9IHN1bSArIGNvbCooMS4wIC0gc3VtLmEpO1x0XG5cblx0XHR0ICs9IDAuMDU7XG5cdH1cblxuXHRyZXR1cm4gY2xhbXAoIHN1bS54eXosIDAuMCwgMS4wICk7XG59XG5cbnZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbntcblx0dmVjMiBxID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgdmVjMiBwID0gLTEuMCArIDIuMCpxO1xuICAgIHAueCAqPSBpUmVzb2x1dGlvbi54LyBpUmVzb2x1dGlvbi55O1xuXHRcbiAgICB2ZWMyIG1vID0gdmVjMigwLjUsMC41KTsgLy9pTW91c2UueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAvL2lmKCBpTW91c2Uudzw9MC4wMDAwMSApIG1vPXZlYzIoMC4wKTtcblx0XG4gICAgLy8gY2FtZXJhXG4gICAgdmVjMyBybyA9IDQuMCpub3JtYWxpemUodmVjMyhjb3MoMy4wKm1vLngpLCAxLjQgLSAxLjAqKG1vLnktLjEpLCBzaW4oMy4wKm1vLngpKSk7XG5cdHZlYzMgdGEgPSB2ZWMzKDAuMCwgMS4wLCAwLjApO1xuXHRmbG9hdCBjciA9IDAuNSpjb3MoMC43KmlUaW1lKTtcblx0XG4gICAgLy8gc2hha2VcdFx0XG5cdHJvICs9IDAuMSooLTEuMCsyLjAqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBpVGltZSp2ZWMyKDAuMDEwLDAuMDE0KSwgMC4wICkueHl6KTtcblx0dGEgKz0gMC4xKigtMS4wKzIuMCp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIGlUaW1lKnZlYzIoMC4wMTMsMC4wMDgpLCAwLjAgKS54eXopO1xuXHRcblx0Ly8gYnVpbGQgcmF5XG4gICAgdmVjMyB3dyA9IG5vcm1hbGl6ZSggdGEgLSBybyk7XG4gICAgdmVjMyB1dSA9IG5vcm1hbGl6ZShjcm9zcyggdmVjMyhzaW4oY3IpLGNvcyhjciksMC4wKSwgd3cgKSk7XG4gICAgdmVjMyB2diA9IG5vcm1hbGl6ZShjcm9zcyh3dyx1dSkpO1xuICAgIHZlYzMgcmQgPSBub3JtYWxpemUoIHAueCp1dSArIHAueSp2diArIDIuMCp3dyApO1xuXHRcbiAgICAvLyByYXltYXJjaFx0XG5cdHZlYzMgY29sID0gcmF5bWFyY2goIHJvLCByZCwgZnJhZ0Nvb3JkICk7XG5cdFxuXHQvLyBjb250cmFzdCBhbmQgdmlnbmV0dGluZ1x0XG5cdGNvbCA9IGNvbCowLjUgKyAwLjUqY29sKmNvbCooMy4wLTIuMCpjb2wpO1xuXHRjb2wgKj0gMC4yNSArIDAuNzUqcG93KCAxNi4wKnEueCpxLnkqKDEuMC1xLngpKigxLjAtcS55KSwgMC4xICk7XG5cdFxuICAgIGZyYWdDb2xvciA9IHZlYzQoIGNvbCwgMS4wICk7XG59XG5cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWxSZXNvbHV0aW9uLnZhbHVlWzBdLnggPSBub2lzZVRleC5pbWFnZS53aWR0aFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbFJlc29sdXRpb24udmFsdWVbMF0ueSA9IG5vaXNlVGV4LmltYWdlLmhlaWdodFxuICAgIH1cbn1cblxuZXhwb3J0IHsgRmlyZVR1bm5lbFNoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzdsZlhSQlxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5sZXQgTWlzdFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcblxuICAgICAgICBmbG9hdCBtcmFuZCh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIGZyYWN0KHNpbihkb3QoY29vcmRzLCB2ZWMyKDU2LjM0NTYsNzguMzQ1NikpICogNS4wKSAqIDEwMDAwLjApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtbm9pc2UodmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgaSA9IGZsb29yKGNvb3Jkcyk7XG4gICAgICAgICAgICB2ZWMyIGYgPSBmcmFjdChjb29yZHMpO1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGEgPSBtcmFuZChpKTtcbiAgICAgICAgICAgIGZsb2F0IGIgPSBtcmFuZChpICsgdmVjMigxLjAsIDAuMCkpO1xuICAgICAgICAgICAgZmxvYXQgYyA9IG1yYW5kKGkgKyB2ZWMyKDAuMCwgMS4wKSk7XG4gICAgICAgICAgICBmbG9hdCBkID0gbXJhbmQoaSArIHZlYzIoMS4wLCAxLjApKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIGN1YmljID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG1peChhLCBiLCBjdWJpYy54KSArIChjIC0gYSkgKiBjdWJpYy55ICogKDEuMCAtIGN1YmljLngpICsgKGQgLSBiKSAqIGN1YmljLnggKiBjdWJpYy55O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBmYm0odmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGZsb2F0IHZhbHVlID0gMC4wO1xuICAgICAgICAgICAgZmxvYXQgc2NhbGUgPSAwLjU7XG4gICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAxMDsgaSsrKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZhbHVlICs9IG1ub2lzZShjb29yZHMpICogc2NhbGU7XG4gICAgICAgICAgICAgICAgY29vcmRzICo9IDQuMDtcbiAgICAgICAgICAgICAgICBzY2FsZSAqPSAwLjU7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueSAqIDIuMDtcbiAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZmluYWwgPSAwLjA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaW50IGkgPTE7IGkgPCA2OyBpKyspXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmVjMiBtb3Rpb24gPSB2ZWMyKGZibSh1diArIHZlYzIoMC4wLGlUaW1lKSAqIDAuMDUgKyB2ZWMyKGksIDAuMCkpKTtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgZmluYWwgKz0gZmJtKHV2ICsgbW90aW9uKTtcbiAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZpbmFsIC89IDUuMDtcbiAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQobWl4KHZlYzMoLTAuMyksIHZlYzMoMC40NSwgMC40LCAwLjYpICsgdmVjMygwLjYpLCBmaW5hbCksIDEpO1xuICAgICAgICB9XG4gICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMTIpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBNaXN0U2hhZGVyIH1cbiIsIi8vIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L1hkc0JEQlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBzdGF0ZSA9IHtcbiAgICBhbmltYXRlOiBmYWxzZSxcbiAgICBub2lzZU1vZGU6ICdzY2FsZScsXG4gICAgaW52ZXJ0OiBmYWxzZSxcbiAgICBzaGFycGVuOiB0cnVlLFxuICAgIHNjYWxlQnlQcmV2OiBmYWxzZSxcbiAgICBnYWluOiAwLjU0LFxuICAgIGxhY3VuYXJpdHk6IDIuMCxcbiAgICBvY3RhdmVzOiA1LFxuICAgIHNjYWxlMTogMy4wLFxuICAgIHNjYWxlMjogMy4wLFxuICAgIHRpbWVTY2FsZVg6IDAuNCxcbiAgICB0aW1lU2NhbGVZOiAwLjMsXG4gICAgY29sb3IxOiBbMCwgMCwgMF0sXG4gICAgY29sb3IyOiBbMTMwLCAxMjksMTI5XSxcbiAgICBjb2xvcjM6IFsxMTAsIDExMCwgMTEwXSxcbiAgICBjb2xvcjQ6IFs4MiwgNTEsIDEzXSxcbiAgICBvZmZzZXRBWDogMCxcbiAgICBvZmZzZXRBWTogMCxcbiAgICBvZmZzZXRCWDogMy43LFxuICAgIG9mZnNldEJZOiAwLjksXG4gICAgb2Zmc2V0Q1g6IDIuMSxcbiAgICBvZmZzZXRDWTogMy4yLFxuICAgIG9mZnNldERYOiA0LjMsXG4gICAgb2Zmc2V0RFk6IDIuOCxcbiAgICBvZmZzZXRYOiAwLFxuICAgIG9mZnNldFk6IDAsXG59O1xuXG5sZXQgTWFyYmxlMVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB7XG4gICAgICAgIG1iX2FuaW1hdGU6IHsgdmFsdWU6IHN0YXRlLmFuaW1hdGUgfSxcbiAgICAgICAgbWJfY29sb3IxOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjEubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3IyOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjIubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3IzOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjMubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3I0OiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjQubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfZ2FpbjogeyB2YWx1ZTogc3RhdGUuZ2FpbiB9LFxuICAgICAgICBtYl9pbnZlcnQ6IHsgdmFsdWU6IHN0YXRlLmludmVydCB9LFxuICAgICAgICBtYl9sYWN1bmFyaXR5OiB7IHZhbHVlOiBzdGF0ZS5sYWN1bmFyaXR5IH0sXG4gICAgICAgIG1iX25vaXNlTW9kZTogeyB2YWx1ZTogc3RhdGUubm9pc2VNb2RlID09PSAnc2NhbGUnID8gMCA6IDEgfSxcbiAgICAgICAgbWJfb2N0YXZlczogeyB2YWx1ZTogc3RhdGUub2N0YXZlcyB9LFxuICAgICAgICBtYl9vZmZzZXQ6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRYLCBzdGF0ZS5vZmZzZXRZXSB9LFxuICAgICAgICBtYl9vZmZzZXRBOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0QVgsIHN0YXRlLm9mZnNldEFZXSB9LFxuICAgICAgICBtYl9vZmZzZXRCOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0QlgsIHN0YXRlLm9mZnNldEJZXSB9LFxuICAgICAgICBtYl9vZmZzZXRDOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0Q1gsIHN0YXRlLm9mZnNldENZXSB9LFxuICAgICAgICBtYl9vZmZzZXREOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0RFgsIHN0YXRlLm9mZnNldERZXSB9LFxuICAgICAgICBtYl9zY2FsZTE6IHsgdmFsdWU6IHN0YXRlLnNjYWxlMSB9LFxuICAgICAgICBtYl9zY2FsZTI6IHsgdmFsdWU6IHN0YXRlLnNjYWxlMiB9LFxuICAgICAgICBtYl9zY2FsZUJ5UHJldjogeyB2YWx1ZTogc3RhdGUuc2NhbGVCeVByZXYgfSxcbiAgICAgICAgbWJfc2hhcnBlbjogeyB2YWx1ZTogc3RhdGUuc2hhcnBlbiB9LFxuICAgICAgICBtYl90aW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIG1iX3RpbWVTY2FsZTogeyB2YWx1ZTogW3N0YXRlLnRpbWVTY2FsZVgsIHN0YXRlLnRpbWVTY2FsZVldIH0sXG4gICAgICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgICAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSAgICBcbiAgICB9LFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9hbmltYXRlO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjI7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IzO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yNDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfZ2FpbjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9pbnZlcnQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX2xhY3VuYXJpdHk7XG4gICAgICAgICAgICB1bmlmb3JtIGludCBtYl9ub2lzZU1vZGU7XG4gICAgICAgICAgICB1bmlmb3JtIGludCBtYl9vY3RhdmVzO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldDtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRBO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEI7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXREO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9zY2FsZTE7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3NjYWxlMjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9zY2FsZUJ5UHJldjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9zaGFycGVuO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl90aW1lO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX3RpbWVTY2FsZTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICAgICAgICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIFNvbWUgdXNlZnVsIGZ1bmN0aW9uc1xuICAgICAgICB2ZWMzIG1iX21vZDI4OSh2ZWMzIHgpIHsgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDsgfVxuICAgICAgICB2ZWMyIG1iX21vZDI4OSh2ZWMyIHgpIHsgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDsgfVxuICAgICAgICB2ZWMzIG1iX3Blcm11dGUodmVjMyB4KSB7IHJldHVybiBtYl9tb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7IH1cbiAgICAgICAgXG4gICAgICAgIC8vXG4gICAgICAgIC8vIERlc2NyaXB0aW9uIDogR0xTTCAyRCBzaW1wbGV4IG5vaXNlIGZ1bmN0aW9uXG4gICAgICAgIC8vICAgICAgQXV0aG9yIDogSWFuIE1jRXdhbiwgQXNoaW1hIEFydHNcbiAgICAgICAgLy8gIE1haW50YWluZXIgOiBpam1cbiAgICAgICAgLy8gICAgIExhc3Rtb2QgOiAyMDExMDgyMiAoaWptKVxuICAgICAgICAvLyAgICAgTGljZW5zZSA6XG4gICAgICAgIC8vICBDb3B5cmlnaHQgKEMpIDIwMTEgQXNoaW1hIEFydHMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gICAgICAgIC8vICBEaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMSUNFTlNFIGZpbGUuXG4gICAgICAgIC8vICBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlXG4gICAgICAgIC8vXG4gICAgICAgIGZsb2F0IG1iX3Nub2lzZSh2ZWMyIHYpIHtcbiAgICAgICAgICAgIC8vIFByZWNvbXB1dGUgdmFsdWVzIGZvciBza2V3ZWQgdHJpYW5ndWxhciBncmlkXG4gICAgICAgICAgICBjb25zdCB2ZWM0IEMgPSB2ZWM0KDAuMjExMzI0ODY1NDA1MTg3LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAoMy4wLXNxcnQoMy4wKSkvNi4wXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuMzY2MDI1NDAzNzg0NDM5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwLjUqKHNxcnQoMy4wKS0xLjApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0wLjU3NzM1MDI2OTE4OTYyNixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gLTEuMCArIDIuMCAqIEMueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjAyNDM5MDI0MzkwMjQzOSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDEuMCAvIDQxLjBcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBGaXJzdCBjb3JuZXIgKHgwKVxuICAgICAgICAgICAgdmVjMiBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eSkpO1xuICAgICAgICAgICAgdmVjMiB4MCA9IHYgLSBpICsgZG90KGksIEMueHgpO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIE90aGVyIHR3byBjb3JuZXJzICh4MSwgeDIpXG4gICAgICAgICAgICB2ZWMyIGkxID0gdmVjMigwLjApO1xuICAgICAgICAgICAgaTEgPSAoeDAueCA+IHgwLnkpPyB2ZWMyKDEuMCwgMC4wKTp2ZWMyKDAuMCwgMS4wKTtcbiAgICAgICAgICAgIHZlYzIgeDEgPSB4MC54eSArIEMueHggLSBpMTtcbiAgICAgICAgICAgIHZlYzIgeDIgPSB4MC54eSArIEMueno7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gRG8gc29tZSBwZXJtdXRhdGlvbnMgdG8gYXZvaWRcbiAgICAgICAgICAgIC8vIHRydW5jYXRpb24gZWZmZWN0cyBpbiBwZXJtdXRhdGlvblxuICAgICAgICAgICAgaSA9IG1iX21vZDI4OShpKTtcbiAgICAgICAgICAgIHZlYzMgcCA9IG1iX3Blcm11dGUoXG4gICAgICAgICAgICAgICAgICAgIG1iX3Blcm11dGUoIGkueSArIHZlYzMoMC4wLCBpMS55LCAxLjApKVxuICAgICAgICAgICAgICAgICAgICAgICAgKyBpLnggKyB2ZWMzKDAuMCwgaTEueCwgMS4wICkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgbSA9IG1heCgwLjUgLSB2ZWMzKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDAseDApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDEseDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDIseDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksIDAuMCk7XG4gICAgICAgIFxuICAgICAgICAgICAgbSA9IG0qbTtcbiAgICAgICAgICAgIG0gPSBtKm07XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gR3JhZGllbnRzOlxuICAgICAgICAgICAgLy8gIDQxIHB0cyB1bmlmb3JtbHkgb3ZlciBhIGxpbmUsIG1hcHBlZCBvbnRvIGEgZGlhbW9uZFxuICAgICAgICAgICAgLy8gIFRoZSByaW5nIHNpemUgMTcqMTcgPSAyODkgaXMgY2xvc2UgdG8gYSBtdWx0aXBsZVxuICAgICAgICAgICAgLy8gICAgICBvZiA0MSAoNDEqNyA9IDI4NylcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIHggPSAyLjAgKiBmcmFjdChwICogQy53d3cpIC0gMS4wO1xuICAgICAgICAgICAgdmVjMyBoID0gYWJzKHgpIC0gMC41O1xuICAgICAgICAgICAgdmVjMyBveCA9IGZsb29yKHggKyAwLjUpO1xuICAgICAgICAgICAgdmVjMyBhMCA9IHggLSBveDtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBOb3JtYWxpc2UgZ3JhZGllbnRzIGltcGxpY2l0bHkgYnkgc2NhbGluZyBtXG4gICAgICAgICAgICAvLyBBcHByb3hpbWF0aW9uIG9mOiBtICo9IGludmVyc2VzcXJ0KGEwKmEwICsgaCpoKTtcbiAgICAgICAgICAgIG0gKj0gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiAoYTAqYTAraCpoKTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBDb21wdXRlIGZpbmFsIG5vaXNlIHZhbHVlIGF0IFBcbiAgICAgICAgICAgIHZlYzMgZyA9IHZlYzMoMC4wKTtcbiAgICAgICAgICAgIGcueCAgPSBhMC54ICAqIHgwLnggICsgaC54ICAqIHgwLnk7XG4gICAgICAgICAgICBnLnl6ID0gYTAueXogKiB2ZWMyKHgxLngseDIueCkgKyBoLnl6ICogdmVjMih4MS55LHgyLnkpO1xuICAgICAgICAgICAgcmV0dXJuIDEzMC4wICogZG90KG0sIGcpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9nZXROb2lzZVZhbCh2ZWMyIHApIHtcbiAgICAgICAgICAgIGZsb2F0IHJhdyA9IG1iX3Nub2lzZShwKTtcbiAgICAgICAgXG4gICAgICAgICAgICBpZiAobWJfbm9pc2VNb2RlID09IDEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWJzKHJhdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHJhdyAqIDAuNSArIDAuNTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfZmJtKHZlYzIgcCkge1xuICAgICAgICAgICAgZmxvYXQgc3VtID0gMC4wO1xuICAgICAgICAgICAgZmxvYXQgZnJlcSA9IDEuMDtcbiAgICAgICAgICAgIGZsb2F0IGFtcCA9IDAuNTtcbiAgICAgICAgICAgIGZsb2F0IHByZXYgPSAxLjA7XG4gICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBtYl9vY3RhdmVzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBuID0gbWJfZ2V0Tm9pc2VWYWwocCAqIGZyZXEpO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfaW52ZXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSAxLjAgLSBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX3NoYXJwZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IG4gKiBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgc3VtICs9IG4gKiBhbXA7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9zY2FsZUJ5UHJldikge1xuICAgICAgICAgICAgICAgICAgICBzdW0gKz0gbiAqIGFtcCAqIHByZXY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBwcmV2ID0gbjtcbiAgICAgICAgICAgICAgICBmcmVxICo9IG1iX2xhY3VuYXJpdHk7XG4gICAgICAgICAgICAgICAgYW1wICo9IG1iX2dhaW47XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHN1bTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfcGF0dGVybihpbiB2ZWMyIHAsIG91dCB2ZWMyIHEsIG91dCB2ZWMyIHIpIHtcbiAgICAgICAgICAgIHAgKj0gbWJfc2NhbGUxO1xuICAgICAgICAgICAgcCArPSBtYl9vZmZzZXQ7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdCA9IDAuMDtcbiAgICAgICAgICAgIGlmIChtYl9hbmltYXRlKSB7XG4gICAgICAgICAgICAgICAgdCA9IG1iX3RpbWUgKiAwLjE7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcSA9IHZlYzIobWJfZmJtKHAgKyBtYl9vZmZzZXRBICsgdCAqIG1iX3RpbWVTY2FsZS54KSwgbWJfZmJtKHAgKyBtYl9vZmZzZXRCIC0gdCAqIG1iX3RpbWVTY2FsZS55KSk7XG4gICAgICAgICAgICByID0gdmVjMihtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHEgKyBtYl9vZmZzZXRDKSwgbWJfZmJtKHAgKyBtYl9zY2FsZTIgKiBxICsgbWJfb2Zmc2V0RCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHIpO1xuICAgICAgICB9XG4gICAgYCxcbiAgICByZXBsYWNlTWFwOiBnbHNsYFxuICAgICAgICB2ZWMzIG1hcmJsZUNvbG9yID0gdmVjMygwLjApO1xuXG4gICAgICAgIHZlYzIgcTtcbiAgICAgICAgdmVjMiByO1xuXG4gICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgXG4gICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuXG4gICAgICAgIGZsb2F0IGYgPSBtYl9wYXR0ZXJuKHV2LCBxLCByKTtcbiAgICAgICAgXG4gICAgICAgIG1hcmJsZUNvbG9yID0gbWl4KG1iX2NvbG9yMSwgbWJfY29sb3IyLCBmKTtcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWFyYmxlQ29sb3IsIG1iX2NvbG9yMywgbGVuZ3RoKHEpIC8gMi4wKTtcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWFyYmxlQ29sb3IsIG1iX2NvbG9yNCwgci55IC8gMi4wKTtcblxuICAgICAgICB2ZWM0IG1hcmJsZUNvbG9yNCA9IG1hcFRleGVsVG9MaW5lYXIoIHZlYzQobWFyYmxlQ29sb3IsMS4wKSApO1xuXG4gICAgICAgIGRpZmZ1c2VDb2xvciAqPSBtYXJibGVDb2xvcjQ7XG4gICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfaW52ZXJ0ID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IHN0YXRlLmludmVydCA6ICFzdGF0ZS5pbnZlcnQgfVxuXG4gICAgICAgIC8vIGxldHMgYWRkIGEgYml0IG9mIHJhbmRvbW5lc3MgdG8gdGhlIGlucHV0IHNvIG11bHRpcGxlIGluc3RhbmNlcyBhcmUgZGlmZmVyZW50XG4gICAgICAgIGxldCByeCA9IE1hdGgucmFuZG9tKClcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfb2Zmc2V0QSA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKCBzdGF0ZS5vZmZzZXRBWCArIE1hdGgucmFuZG9tKCksIHN0YXRlLm9mZnNldEFZICsgTWF0aC5yYW5kb20oKSkgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9vZmZzZXRCID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoIHN0YXRlLm9mZnNldEJYICsgTWF0aC5yYW5kb20oKSwgc3RhdGUub2Zmc2V0QlkgKyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX3RpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICB9XG59XG5cbmV4cG9ydCB7IE1hcmJsZTFTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvMWVjOTY1YzVkNmRmNTc3Yy5qcGdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvNHQzM3o4XG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvc21hbGwtbm9pc2UucG5nJ1xuaW1wb3J0IG5vdEZvdW5kIGZyb20gJy4uL2Fzc2V0cy9iYWRTaGFkZXIuanBnJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBpQ2hhbm5lbDE6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG52YXIgbm90Rm91bmRUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKG5vdEZvdW5kLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vdEZvdW5kVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBOb3RGb3VuZFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMTtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgIHZlYzIgd2FycFVWID0gMi4gKiB1djtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBkID0gbGVuZ3RoKCB3YXJwVVYgKTtcbiAgICAgICAgICAgIHZlYzIgc3QgPSB3YXJwVVYqMC4xICsgMC4yKnZlYzIoY29zKDAuMDcxKmlUaW1lKjIuK2QpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbigwLjA3MyppVGltZSoyLi1kKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyB3YXJwZWRDb2wgPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHN0ICkueHl6ICogMi4wO1xuICAgICAgICAgICAgZmxvYXQgdyA9IG1heCggd2FycGVkQ29sLnIsIDAuODUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIG9mZnNldCA9IDAuMDEgKiBjb3MoIHdhcnBlZENvbC5yZyAqIDMuMTQxNTkgKTtcbiAgICAgICAgICAgIHZlYzMgY29sID0gdGV4dHVyZSggaUNoYW5uZWwxLCB1diArIG9mZnNldCApLnJnYiAqIHZlYzMoMC44LCAwLjgsIDEuNSkgO1xuICAgICAgICAgICAgY29sICo9IHcqMS4yO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KCBtaXgoY29sLCB0ZXh0dXJlKCBpQ2hhbm5lbDEsIHV2ICsgb2Zmc2V0ICkucmdiLCAwLjUpLCAgMS4wKTtcbiAgICAgICAgfVxuICAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMS52YWx1ZSA9IG5vdEZvdW5kVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDEudmFsdWUgPSBub3RGb3VuZFRleFxuICAgIH1cbn1cblxuZXhwb3J0IHsgTm90Rm91bmRTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvNDgxYTkyYjQ0ZTU2ZGFkNC5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCB1bmlmb3JtcyA9IHtcbiAgICB3YXJwVGltZToge3ZhbHVlOiAwfSxcbiAgICB3YXJwVGV4OiB7dmFsdWU6IG51bGx9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH1cbn0gXG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgd2FycFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQod2FycGZ4LCAod2FycCkgPT4ge1xuICAgIHdhcnAubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnAud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwVGV4ID0gd2FycFxufSlcblxubGV0IFdhcnBTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB1bmlmb3JtIGZsb2F0IHdhcnBUaW1lO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCB3YXJwVGV4O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICB1bmlmb3JtIGludCB0ZXhGbGlwWTsgXG4gICAgICAgICAgICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogZ2xzbGBcbiAgICAgICAgICBmbG9hdCB0ID0gd2FycFRpbWU7XG5cbiAgICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgXG4gICAgICAgICAgdmVjMiBzY2FsZWRVViA9IHV2ICogMi4wIC0gMS4wO1xuICAgICAgICAgIHZlYzIgcHV2ID0gdmVjMihsZW5ndGgoc2NhbGVkVVYueHkpLCBhdGFuKHNjYWxlZFVWLngsIHNjYWxlZFVWLnkpKTtcbiAgICAgICAgICB2ZWM0IGNvbCA9IHRleHR1cmUyRCh3YXJwVGV4LCB2ZWMyKGxvZyhwdXYueCkgKyB0IC8gNS4wLCBwdXYueSAvIDMuMTQxNTkyNiApKTtcbiAgICAgICAgICBmbG9hdCBnbG93ID0gKDEuMCAtIHB1di54KSAqICgwLjUgKyAoc2luKHQpICsgMi4wICkgLyA0LjApO1xuICAgICAgICAgIC8vIGJsdWUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDExOC4wLzI1NS4wLCAxNDQuMC8yNTUuMCwgMjE5LjAvMjU1LjAsIDEuMCkgKiAoMC40ICsgZ2xvdyAqIDEuMCk7XG4gICAgICAgICAgLy8gd2hpdGUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDAuMikgKiBzbW9vdGhzdGVwKDAuMCwgMi4wLCBnbG93ICogZ2xvdyk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sID0gbWFwVGV4ZWxUb0xpbmVhciggY29sICk7XG4gICAgICAgICAgZGlmZnVzZUNvbG9yICo9IGNvbDtcbiAgICAgICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgV2FycFNoYWRlciB9XG4iLCIvKlxuICogM0QgU2ltcGxleCBub2lzZVxuICogU0lHTkFUVVJFOiBmbG9hdCBzbm9pc2UodmVjMyB2KVxuICogaHR0cHM6Ly9naXRodWIuY29tL2h1Z2hzay9nbHNsLW5vaXNlXG4gKi9cblxuY29uc3QgZ2xzbCA9IGBcbi8vXG4vLyBEZXNjcmlwdGlvbiA6IEFycmF5IGFuZCB0ZXh0dXJlbGVzcyBHTFNMIDJELzNELzREIHNpbXBsZXhcbi8vICAgICAgICAgICAgICAgbm9pc2UgZnVuY3Rpb25zLlxuLy8gICAgICBBdXRob3IgOiBJYW4gTWNFd2FuLCBBc2hpbWEgQXJ0cy5cbi8vICBNYWludGFpbmVyIDogaWptXG4vLyAgICAgTGFzdG1vZCA6IDIwMTEwODIyIChpam0pXG4vLyAgICAgTGljZW5zZSA6IENvcHlyaWdodCAoQykgMjAxMSBBc2hpbWEgQXJ0cy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vICAgICAgICAgICAgICAgRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTElDRU5TRSBmaWxlLlxuLy8gICAgICAgICAgICAgICBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlXG4vL1xuXG52ZWMzIG1vZDI4OSh2ZWMzIHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBtb2QyODkodmVjNCB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgcGVybXV0ZSh2ZWM0IHgpIHtcbiAgICAgcmV0dXJuIG1vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTtcbn1cblxudmVjNCB0YXlsb3JJbnZTcXJ0KHZlYzQgcilcbntcbiAgcmV0dXJuIDEuNzkyODQyOTE0MDAxNTkgLSAwLjg1MzczNDcyMDk1MzE0ICogcjtcbn1cblxuZmxvYXQgc25vaXNlKHZlYzMgdilcbiAge1xuICBjb25zdCB2ZWMyICBDID0gdmVjMigxLjAvNi4wLCAxLjAvMy4wKSA7XG4gIGNvbnN0IHZlYzQgIEQgPSB2ZWM0KDAuMCwgMC41LCAxLjAsIDIuMCk7XG5cbi8vIEZpcnN0IGNvcm5lclxuICB2ZWMzIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5eSkgKTtcbiAgdmVjMyB4MCA9ICAgdiAtIGkgKyBkb3QoaSwgQy54eHgpIDtcblxuLy8gT3RoZXIgY29ybmVyc1xuICB2ZWMzIGcgPSBzdGVwKHgwLnl6eCwgeDAueHl6KTtcbiAgdmVjMyBsID0gMS4wIC0gZztcbiAgdmVjMyBpMSA9IG1pbiggZy54eXosIGwuenh5ICk7XG4gIHZlYzMgaTIgPSBtYXgoIGcueHl6LCBsLnp4eSApO1xuXG4gIC8vICAgeDAgPSB4MCAtIDAuMCArIDAuMCAqIEMueHh4O1xuICAvLyAgIHgxID0geDAgLSBpMSAgKyAxLjAgKiBDLnh4eDtcbiAgLy8gICB4MiA9IHgwIC0gaTIgICsgMi4wICogQy54eHg7XG4gIC8vICAgeDMgPSB4MCAtIDEuMCArIDMuMCAqIEMueHh4O1xuICB2ZWMzIHgxID0geDAgLSBpMSArIEMueHh4O1xuICB2ZWMzIHgyID0geDAgLSBpMiArIEMueXl5OyAvLyAyLjAqQy54ID0gMS8zID0gQy55XG4gIHZlYzMgeDMgPSB4MCAtIEQueXl5OyAgICAgIC8vIC0xLjArMy4wKkMueCA9IC0wLjUgPSAtRC55XG5cbi8vIFBlcm11dGF0aW9uc1xuICBpID0gbW9kMjg5KGkpO1xuICB2ZWM0IHAgPSBwZXJtdXRlKCBwZXJtdXRlKCBwZXJtdXRlKFxuICAgICAgICAgICAgIGkueiArIHZlYzQoMC4wLCBpMS56LCBpMi56LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnkgKyB2ZWM0KDAuMCwgaTEueSwgaTIueSwgMS4wICkpXG4gICAgICAgICAgICsgaS54ICsgdmVjNCgwLjAsIGkxLngsIGkyLngsIDEuMCApKTtcblxuLy8gR3JhZGllbnRzOiA3eDcgcG9pbnRzIG92ZXIgYSBzcXVhcmUsIG1hcHBlZCBvbnRvIGFuIG9jdGFoZWRyb24uXG4vLyBUaGUgcmluZyBzaXplIDE3KjE3ID0gMjg5IGlzIGNsb3NlIHRvIGEgbXVsdGlwbGUgb2YgNDkgKDQ5KjYgPSAyOTQpXG4gIGZsb2F0IG5fID0gMC4xNDI4NTcxNDI4NTc7IC8vIDEuMC83LjBcbiAgdmVjMyAgbnMgPSBuXyAqIEQud3l6IC0gRC54eng7XG5cbiAgdmVjNCBqID0gcCAtIDQ5LjAgKiBmbG9vcihwICogbnMueiAqIG5zLnopOyAgLy8gIG1vZChwLDcqNylcblxuICB2ZWM0IHhfID0gZmxvb3IoaiAqIG5zLnopO1xuICB2ZWM0IHlfID0gZmxvb3IoaiAtIDcuMCAqIHhfICk7ICAgIC8vIG1vZChqLE4pXG5cbiAgdmVjNCB4ID0geF8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IHkgPSB5XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgaCA9IDEuMCAtIGFicyh4KSAtIGFicyh5KTtcblxuICB2ZWM0IGIwID0gdmVjNCggeC54eSwgeS54eSApO1xuICB2ZWM0IGIxID0gdmVjNCggeC56dywgeS56dyApO1xuXG4gIC8vdmVjNCBzMCA9IHZlYzQobGVzc1RoYW4oYjAsMC4wKSkqMi4wIC0gMS4wO1xuICAvL3ZlYzQgczEgPSB2ZWM0KGxlc3NUaGFuKGIxLDAuMCkpKjIuMCAtIDEuMDtcbiAgdmVjNCBzMCA9IGZsb29yKGIwKSoyLjAgKyAxLjA7XG4gIHZlYzQgczEgPSBmbG9vcihiMSkqMi4wICsgMS4wO1xuICB2ZWM0IHNoID0gLXN0ZXAoaCwgdmVjNCgwLjApKTtcblxuICB2ZWM0IGEwID0gYjAueHp5dyArIHMwLnh6eXcqc2gueHh5eSA7XG4gIHZlYzQgYTEgPSBiMS54enl3ICsgczEueHp5dypzaC56end3IDtcblxuICB2ZWMzIHAwID0gdmVjMyhhMC54eSxoLngpO1xuICB2ZWMzIHAxID0gdmVjMyhhMC56dyxoLnkpO1xuICB2ZWMzIHAyID0gdmVjMyhhMS54eSxoLnopO1xuICB2ZWMzIHAzID0gdmVjMyhhMS56dyxoLncpO1xuXG4vL05vcm1hbGlzZSBncmFkaWVudHNcbiAgdmVjNCBub3JtID0gdGF5bG9ySW52U3FydCh2ZWM0KGRvdChwMCxwMCksIGRvdChwMSxwMSksIGRvdChwMiwgcDIpLCBkb3QocDMscDMpKSk7XG4gIHAwICo9IG5vcm0ueDtcbiAgcDEgKj0gbm9ybS55O1xuICBwMiAqPSBub3JtLno7XG4gIHAzICo9IG5vcm0udztcblxuLy8gTWl4IGZpbmFsIG5vaXNlIHZhbHVlXG4gIHZlYzQgbSA9IG1heCgwLjYgLSB2ZWM0KGRvdCh4MCx4MCksIGRvdCh4MSx4MSksIGRvdCh4Mix4MiksIGRvdCh4Myx4MykpLCAwLjApO1xuICBtID0gbSAqIG07XG4gIHJldHVybiA0Mi4wICogZG90KCBtKm0sIHZlYzQoIGRvdChwMCx4MCksIGRvdChwMSx4MSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdChwMix4MiksIGRvdChwMyx4MykgKSApO1xuICB9ICBcbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuaW1wb3J0IHNub2lzZSBmcm9tICcuL3Nub2lzZSdcbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmNvbnN0IHVuaWZvcm1zID0ge1xuICAgIHdhcnBUaW1lOiB7dmFsdWU6IDB9LFxuICAgIHdhcnBUZXg6IHt2YWx1ZTogbnVsbH0sXG4gICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0sXG4gICAgdGV4RmxpcFk6IHsgdmFsdWU6IDAgfSxcbiAgICBwb3J0YWxDdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKSB9LFxuICAgIHBvcnRhbFRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICBwb3J0YWxSYWRpdXM6IHsgdmFsdWU6IDAuNSB9LFxuICAgIHBvcnRhbFJpbmdDb2xvcjogeyB2YWx1ZTogbmV3IFRIUkVFLkNvbG9yKFwicmVkXCIpICB9LFxuICAgIGludmVydFdhcnBDb2xvcjogeyB2YWx1ZTogMCB9LFxuICAgIHRleEludlNpemU6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfVxufSBcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBjdWJlTWFwID0gbmV3IFRIUkVFLkN1YmVUZXh0dXJlKClcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIHdhcnBUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKHdhcnBmeCwgKHdhcnApID0+IHtcbiAgICB3YXJwLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RNaXBtYXBOZWFyZXN0RmlsdGVyO1xuICAgIHdhcnAubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdE1pcG1hcE5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnAud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwVGV4ID0gd2FycFxuICAgIGN1YmVNYXAuaW1hZ2VzID0gW3dhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2VdXG4gICAgY3ViZU1hcC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxldCBXYXJwUG9ydGFsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdmFyeWluZyB2ZWMzIHZSYXk7XG4gICAgICAgIHZhcnlpbmcgdmVjMyBwb3J0YWxOb3JtYWw7XG4gICAgICAgIC8vdmFyeWluZyB2ZWMzIGNhbWVyYUxvY2FsO1xuICAgICAgICBgLFxuICAgICAgICBwb3N0VHJhbnNmb3JtOiBnbHNsYFxuICAgICAgICAvLyB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxNYXRyaXgpICogdmVjNChjYW1lcmFQb3NpdGlvbiwgMS4wKSkueHl6O1xuICAgICAgICB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxWaWV3TWF0cml4KSAqIHZlYzQoMC4wLDAuMCwwLjAsIDEuMCkpLnh5ejtcbiAgICAgICAgdlJheSA9IHBvc2l0aW9uIC0gY2FtZXJhTG9jYWw7XG4gICAgICAgIGlmICh2UmF5LnogPCAwLjApIHtcbiAgICAgICAgICAgIHZSYXkueiA9IC12UmF5Lno7XG4gICAgICAgICAgICB2UmF5LnggPSAtdlJheS54O1xuICAgICAgICB9XG4gICAgICAgIC8vdlJheSA9IHZlYzMobXZQb3NpdGlvbi54LCBtdlBvc2l0aW9uLnksIG12UG9zaXRpb24ueik7XG4gICAgICAgIHBvcnRhbE5vcm1hbCA9IG5vcm1hbGl6ZSgtMS4gKiB2UmF5KTtcbiAgICAgICAgLy9mbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aChjYW1lcmFMb2NhbCk7XG4gICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0ID0gbGVuZ3RoKHZSYXkpO1xuICAgICAgICB2UmF5LnogKj0gMS4xIC8gKDEuICsgcG93KHBvcnRhbF9kaXN0LCAwLjUpKTsgLy8gQ2hhbmdlIEZPViBieSBzcXVhc2hpbmcgbG9jYWwgWiBkaXJlY3Rpb25cbiAgICAgIGBcbiAgICB9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgZnVuY3Rpb25zOiBzbm9pc2UsXG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB1bmlmb3JtIHNhbXBsZXJDdWJlIHBvcnRhbEN1YmVNYXA7XG4gICAgICAgIHVuaWZvcm0gZmxvYXQgcG9ydGFsUmFkaXVzO1xuICAgICAgICB1bmlmb3JtIHZlYzMgcG9ydGFsUmluZ0NvbG9yO1xuICAgICAgICB1bmlmb3JtIGZsb2F0IHBvcnRhbFRpbWU7XG4gICAgICAgIHVuaWZvcm0gaW50IGludmVydFdhcnBDb2xvcjtcblxuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4SW52U2l6ZTtcblxuICAgICAgICB2YXJ5aW5nIHZlYzMgdlJheTtcbiAgICAgICAgdmFyeWluZyB2ZWMzIHBvcnRhbE5vcm1hbDtcbiAgICAgICAvLyB2YXJ5aW5nIHZlYzMgY2FtZXJhTG9jYWw7XG5cbiAgICAgICAgdW5pZm9ybSBmbG9hdCB3YXJwVGltZTtcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgd2FycFRleDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbiAgICAgICAgdW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuXG4gICAgICAgICNkZWZpbmUgUklOR19XSURUSCAwLjFcbiAgICAgICAgI2RlZmluZSBSSU5HX0hBUkRfT1VURVIgMC4wMVxuICAgICAgICAjZGVmaW5lIFJJTkdfSEFSRF9JTk5FUiAwLjA4XG4gICAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgICAgZmxvYXQgdCA9IHdhcnBUaW1lO1xuXG4gICAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG4gIFxuICAgICAgICAgIHZlYzIgc2NhbGVkVVYgPSB1diAqIDIuMCAtIDEuMDtcbiAgICAgICAgICB2ZWMyIHB1diA9IHZlYzIobGVuZ3RoKHNjYWxlZFVWLnh5KSwgYXRhbihzY2FsZWRVVi54LCBzY2FsZWRVVi55KSk7XG4gICAgICAgICAgdmVjNCBjb2wgPSB0ZXh0dXJlMkQod2FycFRleCwgdmVjMihsb2cocHV2LngpICsgdCAvIDUuMCwgcHV2LnkgLyAzLjE0MTU5MjYgKSk7XG5cbiAgICAgICAgICBmbG9hdCBnbG93ID0gKDEuMCAtIHB1di54KSAqICgwLjUgKyAoc2luKHQpICsgMi4wICkgLyA0LjApO1xuICAgICAgICAgIC8vIGJsdWUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDExOC4wLzI1NS4wLCAxNDQuMC8yNTUuMCwgMjE5LjAvMjU1LjAsIDEuMCkgKiAoMC40ICsgZ2xvdyAqIDEuMCk7XG4gICAgICAgICAgLy8gd2hpdGUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDAuMikgKiBzbW9vdGhzdGVwKDAuMCwgMi4wLCBnbG93ICogZ2xvdyk7XG4gICAgICAgICAgY29sID0gbWFwVGV4ZWxUb0xpbmVhciggY29sICk7XG4gICAgICAgICBcbiAgICAgICAgICBpZiAoaW52ZXJ0V2FycENvbG9yID4gMCkge1xuICAgICAgICAgICAgICBjb2wgPSB2ZWM0KGNvbC5iLCBjb2wuZywgY29sLnIsIGNvbC5hKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLy8gcG9ydGFsIHNoYWRlciBlZmZlY3RcbiAgICAgICAgICB2ZWMyIHBvcnRhbF9jb29yZCA9IHZVdiAqIDIuMCAtIDEuMDtcbiAgICAgICAgICBmbG9hdCBwb3J0YWxfbm9pc2UgPSBzbm9pc2UodmVjMyhwb3J0YWxfY29vcmQgKiAxLiwgcG9ydGFsVGltZSkpICogMC41ICsgMC41O1xuICAgICAgICBcbiAgICAgICAgICAvLyBQb2xhciBkaXN0YW5jZVxuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0ID0gbGVuZ3RoKHBvcnRhbF9jb29yZCk7XG4gICAgICAgICAgcG9ydGFsX2Rpc3QgKz0gcG9ydGFsX25vaXNlICogMC4yO1xuICAgICAgICBcbiAgICAgICAgICBmbG9hdCBtYXNrT3V0ZXIgPSAxLjAgLSBzbW9vdGhzdGVwKHBvcnRhbFJhZGl1cyAtIFJJTkdfSEFSRF9PVVRFUiwgcG9ydGFsUmFkaXVzLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgZmxvYXQgbWFza0lubmVyID0gMS4wIC0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSBSSU5HX1dJRFRILCBwb3J0YWxSYWRpdXMgLSBSSU5HX1dJRFRIICsgUklOR19IQVJEX0lOTkVSLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgZmxvYXQgcG9ydGFsX2Rpc3RvcnRpb24gPSBzbW9vdGhzdGVwKHBvcnRhbFJhZGl1cyAtIDAuMiwgcG9ydGFsUmFkaXVzICsgMC4yLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMyBwb3J0YWxub3JtYWwgPSBub3JtYWxpemUocG9ydGFsTm9ybWFsKTtcbiAgICAgICAgICB2ZWMzIGZvcndhcmRQb3J0YWwgPSB2ZWMzKDAuMCwgMC4wLCAtMS4wKTtcblxuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXJlY3RWaWV3ID0gc21vb3Roc3RlcCgwLjAsIDAuOCwgZG90KHBvcnRhbG5vcm1hbCwgZm9yd2FyZFBvcnRhbCkpO1xuICAgICAgICAgIHZlYzMgcG9ydGFsX3RhbmdlbnRPdXR3YXJkID0gbm9ybWFsaXplKHZlYzMocG9ydGFsX2Nvb3JkLCAwLjApKTtcbiAgICAgICAgICB2ZWMzIHBvcnRhbF9yYXkgPSBtaXgodlJheSwgcG9ydGFsX3RhbmdlbnRPdXR3YXJkLCBwb3J0YWxfZGlzdG9ydGlvbik7XG5cbiAgICAgICAgICB2ZWM0IG15Q3ViZVRleGVsID0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgcG9ydGFsX3JheSk7XG5cbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCArPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBub3JtYWxpemUodmVjMyhwb3J0YWxfcmF5LnggLSB0ZXhJbnZTaXplLnMsIHBvcnRhbF9yYXkueXopKSkgLyA4LjA7ICAgICAgICBcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCArPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBub3JtYWxpemUodmVjMyhwb3J0YWxfcmF5LnggLSB0ZXhJbnZTaXplLnMsIHBvcnRhbF9yYXkueXopKSkgLyA4LjA7ICAgICAgICBcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCArPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBub3JtYWxpemUodmVjMyhwb3J0YWxfcmF5LngsIHBvcnRhbF9yYXkueSAtIHRleEludlNpemUudCwgcG9ydGFsX3JheS56KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54LCBwb3J0YWxfcmF5LnkgLSB0ZXhJbnZTaXplLnQsIHBvcnRhbF9yYXkueikpKSAvIDguMDsgICAgICAgIFxuXG4gICAgICAgICAgbXlDdWJlVGV4ZWwgPSBtYXBUZXhlbFRvTGluZWFyKCBteUN1YmVUZXhlbCApO1xuXG4gICAgICAgIC8vICAgdmVjNCBwb3NDb2wgPSB2ZWM0KHNtb290aHN0ZXAoLTYuMCwgNi4wLCBjYW1lcmFMb2NhbCksIDEuMCk7IC8vbm9ybWFsaXplKChjYW1lcmFMb2NhbCAvIDYuMCkpO1xuICAgICAgICAvLyAgIG15Q3ViZVRleGVsID0gcG9zQ29sOyAvLyB2ZWM0KHBvc0NvbC54LCBwb3NDb2wueSwgcG9zQ29sLnksIDEuMCk7XG4gICAgICAgICAgdmVjMyBjZW50ZXJMYXllciA9IG15Q3ViZVRleGVsLnJnYiAqIG1hc2tJbm5lcjtcbiAgICAgICAgICB2ZWMzIHJpbmdMYXllciA9IHBvcnRhbFJpbmdDb2xvciAqICgxLiAtIG1hc2tJbm5lcik7XG4gICAgICAgICAgdmVjMyBwb3J0YWxfY29tcG9zaXRlID0gY2VudGVyTGF5ZXIgKyByaW5nTGF5ZXI7XG4gICAgICAgIFxuICAgICAgICAgIC8vZ2xfRnJhZ0NvbG9yIFxuICAgICAgICAgIHZlYzQgcG9ydGFsQ29sID0gdmVjNChwb3J0YWxfY29tcG9zaXRlLCAobWFza091dGVyIC0gbWFza0lubmVyKSArIG1hc2tJbm5lciAqIHBvcnRhbF9kaXJlY3RWaWV3KTtcbiAgICAgICAgXG4gICAgICAgICAgLy8gYmxlbmQgdGhlIHR3b1xuICAgICAgICAgIHBvcnRhbENvbC5yZ2IgKj0gcG9ydGFsQ29sLmE7IC8vcHJlbXVsdGlwbHkgc291cmNlIFxuICAgICAgICAgIGNvbC5yZ2IgKj0gKDEuMCAtIHBvcnRhbENvbC5hKTtcbiAgICAgICAgICBjb2wucmdiICs9IHBvcnRhbENvbC5yZ2I7XG5cbiAgICAgICAgICBkaWZmdXNlQ29sb3IgKj0gY29sO1xuICAgICAgICBgXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAgJiYgbWF0Lm1hcC5yZXBlYXQgPyBtYXQubWFwLnJlcGVhdCA6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwICYmIG1hdC5tYXAub2Zmc2V0ID8gbWF0Lm1hcC5vZmZzZXQgOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcCAmJiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUgPSB7IHZhbHVlOiAwIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pbnZlcnRXYXJwQ29sb3IgPSB7IHZhbHVlOiBtYXQudXNlckRhdGEuaW52ZXJ0V2FycENvbG9yID8gbWF0LnVzZXJEYXRhLmludmVydFdhcnBDb2xvciA6IGZhbHNlfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxSaW5nQ29sb3IgPSB7IHZhbHVlOiBtYXQudXNlckRhdGEucmluZ0NvbG9yID8gbWF0LnVzZXJEYXRhLnJpbmdDb2xvciA6IG5ldyBUSFJFRS5Db2xvcihcInJlZFwiKSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbEN1YmVNYXAgPSB7IHZhbHVlOiBtYXQudXNlckRhdGEuY3ViZU1hcCA/IG1hdC51c2VyRGF0YS5jdWJlTWFwIDogY3ViZU1hcCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFJhZGl1cyA9ICB7dmFsdWU6IG1hdC51c2VyRGF0YS5yYWRpdXMgPyBtYXQudXNlckRhdGEucmFkaXVzIDogMC41fVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGV4LnZhbHVlID0gd2FycFRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxDdWJlTWFwLnZhbHVlID0gbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcCA/IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgOiBjdWJlTWFwIFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxSYWRpdXMudmFsdWUgPSBtYXRlcmlhbC51c2VyRGF0YS5yYWRpdXMgPyBtYXRlcmlhbC51c2VyRGF0YS5yYWRpdXMgOiAwLjVcblxuICAgICAgICBpZiAobWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcCAmJiBBcnJheS5pc0FycmF5KG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzKSAmJiBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlc1swXSkge1xuICAgICAgICAgICAgbGV0IGhlaWdodCA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzWzBdLmhlaWdodFxuICAgICAgICAgICAgbGV0IHdpZHRoID0gbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcC5pbWFnZXNbMF0ud2lkdGhcbiAgICAgICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEludlNpemUudmFsdWUgPSBuZXcgVEhSRUUuVmVjdG9yMih3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfVxuIiwiLyoqXG4gKiBWYXJpb3VzIHNpbXBsZSBzaGFkZXJzXG4gKi9cblxuLy8gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TTogIEJsZWVweSBCbG9ja3NcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCwgRGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgYXMgTWF0ZXJpYWxNb2RpZmllciwgU2hhZGVyRXh0ZW5zaW9uT3B0cyB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5cbi8vIGFkZCAgaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzdkS0d6elxuXG5pbXBvcnQgeyBCbGVlcHlCbG9ja3NTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2JsZWVweS1ibG9ja3Mtc2hhZGVyJ1xuaW1wb3J0IHsgTm9pc2VTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL25vaXNlJ1xuaW1wb3J0IHsgTGlxdWlkTWFyYmxlU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9saXF1aWQtbWFyYmxlJ1xuaW1wb3J0IHsgR2FsYXh5U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9nYWxheHknXG5pbXBvcnQgeyBMYWNlVHVubmVsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9sYWNlLXR1bm5lbCdcbmltcG9ydCB7IEZpcmVUdW5uZWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2ZpcmUtdHVubmVsJ1xuaW1wb3J0IHsgTWlzdFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbWlzdCdcbmltcG9ydCB7IE1hcmJsZTFTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21hcmJsZTEnXG5pbXBvcnQgeyBOb3RGb3VuZFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbm90LWZvdW5kJ1xuaW1wb3J0IHsgV2FycFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvd2FycCdcbmltcG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAtcG9ydGFsJ1xuXG5mdW5jdGlvbiBtYXBNYXRlcmlhbHMob2JqZWN0M0Q6IFRIUkVFLk9iamVjdDNELCBmbjogKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCkgPT4gdm9pZCkge1xuICAgIGxldCBtZXNoID0gb2JqZWN0M0QgYXMgVEhSRUUuTWVzaFxuICAgIGlmICghbWVzaC5tYXRlcmlhbCkgcmV0dXJuO1xuICBcbiAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xuICAgICAgcmV0dXJuIG1lc2gubWF0ZXJpYWwubWFwKGZuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZuKG1lc2gubWF0ZXJpYWwpO1xuICAgIH1cbn1cbiAgXG4gIC8vIFRPRE86ICBrZXkgYSByZWNvcmQgb2YgbmV3IG1hdGVyaWFscywgaW5kZXhlZCBieSB0aGUgb3JpZ2luYWxcbiAgLy8gbWF0ZXJpYWwgVVVJRCwgc28gd2UgY2FuIGp1c3QgcmV0dXJuIGl0IGlmIHJlcGxhY2UgaXMgY2FsbGVkIG9uXG4gIC8vIHRoZSBzYW1lIG1hdGVyaWFsIG1vcmUgdGhhbiBvbmNlXG4gIGV4cG9ydCBmdW5jdGlvbiByZXBsYWNlTWF0ZXJpYWwgKG9sZE1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCwgc2hhZGVyOiBTaGFkZXJFeHRlbnNpb24sIHVzZXJEYXRhOiBhbnkpOiBudWxsIHwgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsIHtcbiAgICAvLyAgIGlmIChvbGRNYXRlcmlhbC50eXBlICE9IFwiTWVzaFN0YW5kYXJkTWF0ZXJpYWxcIikge1xuICAgIC8vICAgICAgIGNvbnNvbGUud2FybihcIlNoYWRlciBDb21wb25lbnQ6IGRvbid0IGtub3cgaG93IHRvIGhhbmRsZSBTaGFkZXJzIG9mIHR5cGUgJ1wiICsgb2xkTWF0ZXJpYWwudHlwZSArIFwiJywgb25seSBNZXNoU3RhbmRhcmRNYXRlcmlhbCBhdCB0aGlzIHRpbWUuXCIpXG4gICAgLy8gICAgICAgcmV0dXJuO1xuICAgIC8vICAgfVxuXG4gICAgICAvL2NvbnN0IG1hdGVyaWFsID0gb2xkTWF0ZXJpYWwuY2xvbmUoKTtcbiAgICAgIHZhciBDdXN0b21NYXRlcmlhbFxuICAgICAgdHJ5IHtcbiAgICAgICAgICBDdXN0b21NYXRlcmlhbCA9IE1hdGVyaWFsTW9kaWZpZXIuZXh0ZW5kIChvbGRNYXRlcmlhbC50eXBlLCB7XG4gICAgICAgICAgICB1bmlmb3Jtczogc2hhZGVyLnVuaWZvcm1zLFxuICAgICAgICAgICAgdmVydGV4U2hhZGVyOiBzaGFkZXIudmVydGV4U2hhZGVyLFxuICAgICAgICAgICAgZnJhZ21lbnRTaGFkZXI6IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgICAgIH0pXG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgLy8gY3JlYXRlIGEgbmV3IG1hdGVyaWFsLCBpbml0aWFsaXppbmcgdGhlIGJhc2UgcGFydCB3aXRoIHRoZSBvbGQgbWF0ZXJpYWwgaGVyZVxuICAgICAgbGV0IG1hdGVyaWFsID0gbmV3IEN1c3RvbU1hdGVyaWFsKClcblxuICAgICAgc3dpdGNoIChvbGRNYXRlcmlhbC50eXBlKSB7XG4gICAgICAgICAgY2FzZSBcIk1lc2hTdGFuZGFyZE1hdGVyaWFsXCI6XG4gICAgICAgICAgICAgIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsLnByb3RvdHlwZS5jb3B5LmNhbGwobWF0ZXJpYWwsIG9sZE1hdGVyaWFsKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwiTWVzaFBob25nTWF0ZXJpYWxcIjpcbiAgICAgICAgICAgICAgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJNZXNoQmFzaWNNYXRlcmlhbFwiOlxuICAgICAgICAgICAgICBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbC5wcm90b3R5cGUuY29weS5jYWxsKG1hdGVyaWFsLCBvbGRNYXRlcmlhbClcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIG1hdGVyaWFsLnVzZXJEYXRhID0gdXNlckRhdGE7XG4gICAgICBtYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICBzaGFkZXIuaW5pdChtYXRlcmlhbCk7XG4gICAgICBcbiAgICAgIHJldHVybiBtYXRlcmlhbFxuICB9XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVXaXRoU2hhZGVyKHNoYWRlckRlZjogU2hhZGVyRXh0ZW5zaW9uLCBlbDogYW55LCB0YXJnZXQ6IHN0cmluZywgdXNlckRhdGE6IGFueSA9IHt9KTogKFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbClbXSB7XG4gICAgLy8gbWVzaCB3b3VsZCBjb250YWluIHRoZSBvYmplY3QgdGhhdCBpcywgb3IgY29udGFpbnMsIHRoZSBtZXNoZXNcbiAgICB2YXIgbWVzaCA9IGVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBpZiAoIW1lc2gpIHtcbiAgICAgICAgLy8gaWYgbm8gbWVzaCwgd2UnbGwgc2VhcmNoIHRocm91Z2ggYWxsIG9mIHRoZSBjaGlsZHJlbi4gIFRoaXMgd291bGRcbiAgICAgICAgLy8gaGFwcGVuIGlmIHdlIGRyb3BwZWQgdGhlIGNvbXBvbmVudCBvbiBhIGdsYiBpbiBzcG9rZVxuICAgICAgICBtZXNoID0gZWwub2JqZWN0M0RcbiAgICB9XG4gICAgXG4gICAgbGV0IG1hdGVyaWFsczogYW55ID0gW11cbiAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0OiBUSFJFRS5PYmplY3QzRCkgPT4ge1xuICAgICAgbGV0IG1lc2ggPSBvYmplY3QgYXMgVEhSRUUuTWVzaFxuICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbiAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCkgPT4geyAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoIXRhcmdldCB8fCBtYXRlcmlhbC5uYW1lID09PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgIGxldCBuZXdNID0gcmVwbGFjZU1hdGVyaWFsKG1hdGVyaWFsLCBzaGFkZXJEZWYsIHVzZXJEYXRhKVxuICAgICAgICAgICAgICAgICAgaWYgKG5ld00pIHtcbiAgICAgICAgICAgICAgICAgICAgICBtZXNoLm1hdGVyaWFsID0gbmV3TVxuXG4gICAgICAgICAgICAgICAgICAgICAgbWF0ZXJpYWxzLnB1c2gobmV3TSlcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgICBjb25zdCBjaGlsZHJlbiA9IG9iamVjdC5jaGlsZHJlbjtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICB0cmF2ZXJzZShjaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdHJhdmVyc2UobWVzaCk7XG4gICAgcmV0dXJuIG1hdGVyaWFsc1xuICB9XG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3NoYWRlcicsIHtcbiAgICBtYXRlcmlhbHM6IG51bGwgYXMgKFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbClbXSB8IG51bGwsICBcbiAgICBzaGFkZXJEZWY6IG51bGwgYXMgU2hhZGVyRXh0ZW5zaW9uIHwgbnVsbCxcblxuICAgIHNjaGVtYToge1xuICAgICAgICBuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIm5vaXNlXCIgfSxcbiAgICAgICAgdGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIlwiIH0gIC8vIGlmIG5vdGhpbmcgcGFzc2VkLCBqdXN0IGNyZWF0ZSBzb21lIG5vaXNlXG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNoYWRlckRlZjogU2hhZGVyRXh0ZW5zaW9uO1xuXG4gICAgICAgIHN3aXRjaCAodGhpcy5kYXRhLm5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJub2lzZVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE5vaXNlU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJ3YXJwXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gV2FycFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwid2FycC1wb3J0YWxcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBXYXJwUG9ydGFsU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJsaXF1aWRtYXJibGVcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBMaXF1aWRNYXJibGVTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICAgICAgICBjYXNlIFwiYmxlZXB5YmxvY2tzXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gQmxlZXB5QmxvY2tzU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJnYWxheHlcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBHYWxheHlTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImxhY2V0dW5uZWxcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBMYWNlVHVubmVsU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJmaXJldHVubmVsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gRmlyZVR1bm5lbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgXCJtaXN0XCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTWlzdFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwibWFyYmxlMVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE1hcmJsZTFTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBhbiB1bmtub3duIG5hbWUgd2FzIHBhc3NlZCBpblxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcInVua25vd24gbmFtZSAnXCIgKyB0aGlzLmRhdGEubmFtZSArIFwiJyBwYXNzZWQgdG8gc2hhZGVyIGNvbXBvbmVudFwiKVxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE5vdEZvdW5kU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH0gXG5cbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIGxldCB1cGRhdGVNYXRlcmlhbHMgPSAoKSA9PntcbiAgICAgICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLmRhdGEudGFyZ2V0XG4gICAgICAgICAgICBpZiAodGFyZ2V0Lmxlbmd0aCA9PSAwKSB7dGFyZ2V0PW51bGx9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRoaXMubWF0ZXJpYWxzID0gdXBkYXRlV2l0aFNoYWRlcihzaGFkZXJEZWYsIHRoaXMuZWwsIHRhcmdldCk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgaW5pdGlhbGl6ZXIgPSAoKSA9PntcbiAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICBsZXQgZm4gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZU1hdGVyaWFscygpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBmbik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIGZuKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB1cGRhdGVNYXRlcmlhbHMoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJvb3QgJiYgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGluaXRpYWxpemVyKTtcbiAgICAgICAgdGhpcy5zaGFkZXJEZWYgPSBzaGFkZXJEZWZcbiAgICB9LFxuXG5cbiAgdGljazogZnVuY3Rpb24odGltZSkge1xuICAgIGlmICh0aGlzLnNoYWRlckRlZiA9PSBudWxsIHx8IHRoaXMubWF0ZXJpYWxzID09IG51bGwpIHsgcmV0dXJuIH1cblxuICAgIGxldCBzaGFkZXJEZWYgPSB0aGlzLnNoYWRlckRlZlxuICAgIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7c2hhZGVyRGVmLnVwZGF0ZVVuaWZvcm1zKHRpbWUsIG1hdCl9KVxuICAgIC8vIHN3aXRjaCAodGhpcy5kYXRhLm5hbWUpIHtcbiAgICAvLyAgICAgY2FzZSBcIm5vaXNlXCI6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyAgICAgY2FzZSBcImJsZWVweWJsb2Nrc1wiOlxuICAgIC8vICAgICAgICAgYnJlYWs7XG4gICAgLy8gICAgIGRlZmF1bHQ6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyB9XG5cbiAgICAvLyBpZiAodGhpcy5zaGFkZXIpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJmcmFnbWVudCBzaGFkZXI6XCIsIHRoaXMubWF0ZXJpYWwuZnJhZ21lbnRTaGFkZXIpXG4gICAgLy8gICAgIHRoaXMuc2hhZGVyID0gbnVsbFxuICAgIC8vIH1cbiAgfSxcbn0pXG5cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzJhZWIwMGI2NGFlOTU2OGYuanBnXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy81MGExYjZkMzM4Y2IyNDZlLmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvYWVhYjIwOTFlNGE1M2U5ZC5wbmdcIiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzBjZTQ2YzQyMmY5NDVhOTYuanBnXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy82YTNlOGI0MzMyZDQ3Y2UyLmpwZ1wiIiwibGV0IFNJWkUgPSAxMDI0XG5sZXQgVEFSR0VUV0lEVEggPSBTSVpFXG5sZXQgVEFSR0VUSEVJR0hUID0gU0laRVxuXG53aW5kb3cuQVBQLndyaXRlV2F5UG9pbnRUZXh0dXJlcyA9IGZ1bmN0aW9uKG5hbWVzKSB7XG4gICAgaWYgKCAhQXJyYXkuaXNBcnJheSggbmFtZXMgKSApIHtcbiAgICAgICAgbmFtZXMgPSBbIG5hbWVzIF1cbiAgICB9XG5cbiAgICBmb3IgKCBsZXQgayA9IDA7IGsgPCBuYW1lcy5sZW5ndGg7IGsrKyApIHtcbiAgICAgICAgbGV0IHdheXBvaW50cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUobmFtZXNba10pXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAod2F5cG9pbnRzW2ldLmNvbXBvbmVudHMud2F5cG9pbnQpIHtcbiAgICAgICAgICAgICAgICBsZXQgY3ViZWNhbSA9IG51bGxcbiAgICAgICAgICAgICAgICAvLyBcbiAgICAgICAgICAgICAgICAvLyBmb3IgKGxldCBqID0gMDsgaiA8IHdheXBvaW50c1tpXS5vYmplY3QzRC5jaGlsZHJlbi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIC8vICAgICBpZiAod2F5cG9pbnRzW2ldLm9iamVjdDNELmNoaWxkcmVuW2pdIGluc3RhbmNlb2YgQ3ViZUNhbWVyYVdyaXRlcikge1xuICAgICAgICAgICAgICAgIC8vICAgICAgICAgY29uc29sZS5sb2coXCJmb3VuZCB3YXlwb2ludCB3aXRoIGN1YmVDYW1lcmEgJ1wiICsgbmFtZXNba10gKyBcIidcIilcbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGN1YmVjYW0gPSB3YXlwb2ludHNbaV0ub2JqZWN0M0QuY2hpbGRyZW5bal1cbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIC8vICAgICB9XG4gICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgIC8vIGlmICghY3ViZWNhbSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcImRpZG4ndCBmaW5kIHdheXBvaW50IHdpdGggY3ViZUNhbWVyYSAnXCIgKyBuYW1lc1trXSArIFwiJywgY3JlYXRpbmcgb25lLlwiKSAgICAgICAgICAgICAgICAgICAgLy8gY3JlYXRlIGEgY3ViZSBtYXAgY2FtZXJhIGFuZCByZW5kZXIgdGhlIHZpZXchXG4gICAgICAgICAgICAgICAgICAgIGN1YmVjYW0gPSBuZXcgQ3ViZUNhbWVyYVdyaXRlcigwLjEsIDEwMDAsIFNJWkUpXG4gICAgICAgICAgICAgICAgICAgIGN1YmVjYW0ucG9zaXRpb24ueSA9IDEuNlxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB3YXlwb2ludHNbaV0ub2JqZWN0M0QuYWRkKGN1YmVjYW0pXG4gICAgICAgICAgICAgICAgICAgIGN1YmVjYW0udXBkYXRlKHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXIsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuQVBQLnNjZW5lLm9iamVjdDNEKVxuICAgICAgICAgICAgICAgIC8vIH0gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICBjdWJlY2FtLnNhdmVDdWJlTWFwU2lkZXMobmFtZXNba10pXG4gICAgICAgICAgICAgICAgd2F5cG9pbnRzW2ldLm9iamVjdDNELnJlbW92ZShjdWJlY2FtKVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5jbGFzcyBDdWJlQ2FtZXJhV3JpdGVyIGV4dGVuZHMgVEhSRUUuQ3ViZUNhbWVyYSB7XG5cbiAgICBjb25zdHJ1Y3RvciguLi5hcmdzKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3MpO1xuXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gVEFSR0VUV0lEVEg7XG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IFRBUkdFVEhFSUdIVDtcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IHRydWU7XG4gICAgICAgIC8vIHRoaXMucmVuZGVyVGFyZ2V0LnRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyTWlwTWFwTGluZWFyRmlsdGVyO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcblxuICAgICAgICAvLyB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKCByZW5kZXJlciwgc2NlbmUgKSB7XG5cbiAgICAgICAgLy8gICAgIGxldCBbIGNhbWVyYVBYLCBjYW1lcmFOWCwgY2FtZXJhUFksIGNhbWVyYU5ZLCBjYW1lcmFQWiwgY2FtZXJhTlogXSA9IHRoaXMuY2hpbGRyZW47XG5cbiAgICBcdC8vIFx0aWYgKCB0aGlzLnBhcmVudCA9PT0gbnVsbCApIHRoaXMudXBkYXRlTWF0cml4V29ybGQoKTtcblxuICAgIFx0Ly8gXHRpZiAoIHRoaXMucGFyZW50ID09PSBudWxsICkgdGhpcy51cGRhdGVNYXRyaXhXb3JsZCgpO1xuXG4gICAgXHQvLyBcdHZhciBjdXJyZW50UmVuZGVyVGFyZ2V0ID0gcmVuZGVyZXIuZ2V0UmVuZGVyVGFyZ2V0KCk7XG5cbiAgICBcdC8vIFx0dmFyIHJlbmRlclRhcmdldCA9IHRoaXMucmVuZGVyVGFyZ2V0O1xuICAgIFx0Ly8gXHQvL3ZhciBnZW5lcmF0ZU1pcG1hcHMgPSByZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHM7XG5cbiAgICBcdC8vIFx0Ly9yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMCApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFQWCApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCAxICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYU5YICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDIgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhUFkgKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMyApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFOWSApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCA0ICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYVBaICk7XG5cbiAgICBcdC8vIFx0Ly9yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBnZW5lcmF0ZU1pcG1hcHM7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDUgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhTlogKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIGN1cnJlbnRSZW5kZXJUYXJnZXQgKTtcbiAgICAgICAgLy8gfTtcblx0fVxuXG4gICAgc2F2ZUN1YmVNYXBTaWRlcyhzbHVnKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNjsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmNhcHR1cmUoc2x1ZywgaSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY2FwdHVyZSAoc2x1Zywgc2lkZSkge1xuICAgICAgICAvL3ZhciBpc1ZSRW5hYmxlZCA9IHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXIueHIuZW5hYmxlZDtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gd2luZG93LkFQUC5zY2VuZS5yZW5kZXJlcjtcbiAgICAgICAgLy8gRGlzYWJsZSBWUi5cbiAgICAgICAgLy9yZW5kZXJlci54ci5lbmFibGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVuZGVyQ2FwdHVyZShzaWRlKTtcbiAgICAgICAgLy8gVHJpZ2dlciBmaWxlIGRvd25sb2FkLlxuICAgICAgICB0aGlzLnNhdmVDYXB0dXJlKHNsdWcsIHNpZGUpO1xuICAgICAgICAvLyBSZXN0b3JlIFZSLlxuICAgICAgICAvL3JlbmRlcmVyLnhyLmVuYWJsZWQgPSBpc1ZSRW5hYmxlZDtcbiAgICAgfVxuXG4gICAgcmVuZGVyQ2FwdHVyZSAoY3ViZVNpZGUpIHtcbiAgICAgICAgdmFyIGltYWdlRGF0YTtcbiAgICAgICAgdmFyIHBpeGVsczMgPSBuZXcgVWludDhBcnJheSgzICogVEFSR0VUV0lEVEggKiBUQVJHRVRIRUlHSFQpO1xuICAgICAgICB2YXIgcmVuZGVyZXIgPSB3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyO1xuXG4gICAgICAgIHJlbmRlcmVyLnJlYWRSZW5kZXJUYXJnZXRQaXhlbHModGhpcy5yZW5kZXJUYXJnZXQsIDAsIDAsIFRBUkdFVFdJRFRILFRBUkdFVEhFSUdIVCwgcGl4ZWxzMywgY3ViZVNpZGUpO1xuXG4gICAgICAgIC8vcGl4ZWxzMyA9IHRoaXMuZmxpcFBpeGVsc1ZlcnRpY2FsbHkocGl4ZWxzMywgVEFSR0VUV0lEVEgsIFRBUkdFVEhFSUdIVCk7XG4gICAgICAgIHZhciBwaXhlbHM0ID0gdGhpcy5jb252ZXJ0M3RvNChwaXhlbHMzLCBUQVJHRVRXSURUSCwgVEFSR0VUSEVJR0hUKTtcbiAgICAgICAgaW1hZ2VEYXRhID0gbmV3IEltYWdlRGF0YShuZXcgVWludDhDbGFtcGVkQXJyYXkocGl4ZWxzNCksIFRBUkdFVFdJRFRILCBUQVJHRVRIRUlHSFQpO1xuXG4gICAgICAgIC8vIENvcHkgcGl4ZWxzIGludG8gY2FudmFzLlxuXG4gICAgICAgIC8vIGNvdWxkIHVzZSBkcmF3SW1hZ2UgaW5zdGVhZCwgdG8gc2NhbGUsIGlmIHdlIHdhbnRcbiAgICAgICAgdGhpcy5jdHgucHV0SW1hZ2VEYXRhKGltYWdlRGF0YSwgMCwgMCk7XG4gICAgfVxuXG4gICAgZmxpcFBpeGVsc1ZlcnRpY2FsbHkgKHBpeGVscywgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZmxpcHBlZFBpeGVscyA9IHBpeGVscy5zbGljZSgwKTtcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCB3aWR0aDsgKyt4KSB7XG4gICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCBoZWlnaHQ7ICsreSkge1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIHkgKiB3aWR0aCAqIDNdID0gcGl4ZWxzW3ggKiAzICsgKGhlaWdodCAtIHkgLSAxKSAqIHdpZHRoICogM107XG4gICAgICAgICAgICBmbGlwcGVkUGl4ZWxzW3ggKiAzICsgMSArIHkgKiB3aWR0aCAqIDNdID0gcGl4ZWxzW3ggKiAzICsgMSArIChoZWlnaHQgLSB5IC0gMSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIDIgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIDIgKyAoaGVpZ2h0IC0geSAtIDEpICogd2lkdGggKiAzXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZsaXBwZWRQaXhlbHM7XG4gICAgfVxuXG4gICAgY29udmVydDN0bzQgKHBpeGVscywgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgbmV3UGl4ZWxzID0gbmV3IFVpbnQ4QXJyYXkoNCAqIFRBUkdFVFdJRFRIICogVEFSR0VUSEVJR0hUKTtcblxuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHdpZHRoOyArK3gpIHtcbiAgICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IGhlaWdodDsgKyt5KSB7XG4gICAgICAgICAgICBuZXdQaXhlbHNbeCAqIDQgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMSArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgMSArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMiArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgMiArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMyArIHkgKiB3aWR0aCAqIDRdID0gMjU1O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3UGl4ZWxzO1xuICAgIH1cblxuXG4gICAgc2lkZXMgPSBbXG4gICAgICAgIFwiUmlnaHRcIiwgXCJMZWZ0XCIsIFwiVG9wXCIsIFwiQm90dG9tXCIsIFwiRnJvbnRcIiwgXCJCYWNrXCJcbiAgICBdXG5cbiAgICBzYXZlQ2FwdHVyZSAoc2x1Zywgc2lkZSkge1xuICAgICAgICB0aGlzLmNhbnZhcy50b0Jsb2IoIChibG9iKSA9PiB7XG4gICAgICAgICAgICB2YXIgZmlsZU5hbWUgPSBzbHVnICsgJy0nICsgdGhpcy5zaWRlc1tzaWRlXSArICcucG5nJztcbiAgICAgICAgICAgIHZhciBsaW5rRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICB2YXIgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgICAgIGxpbmtFbC5ocmVmID0gdXJsO1xuICAgICAgICAgICAgbGlua0VsLnNldEF0dHJpYnV0ZSgnZG93bmxvYWQnLCBmaWxlTmFtZSk7XG4gICAgICAgICAgICBsaW5rRWwuaW5uZXJIVE1MID0gJ2Rvd25sb2FkaW5nLi4uJztcbiAgICAgICAgICAgIGxpbmtFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaW5rRWwpO1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbGlua0VsLmNsaWNrKCk7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChsaW5rRWwpO1xuICAgICAgICAgICAgfSwgMSk7XG4gICAgICAgIH0sICdpbWFnZS9wbmcnKTtcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEN1YmVDYW1lcmFXcml0ZXIiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQmlkaXJlY3Rpb25hbCBzZWUtdGhyb3VnaCBwb3J0YWwuIFR3byBwb3J0YWxzIGFyZSBwYWlyZWQgYnkgY29sb3IuXG4gKlxuICogVXNhZ2VcbiAqID09PT09PT1cbiAqIEFkZCB0d28gaW5zdGFuY2VzIG9mIGBwb3J0YWwuZ2xiYCB0byB0aGUgU3Bva2Ugc2NlbmUuXG4gKiBUaGUgbmFtZSBvZiBlYWNoIGluc3RhbmNlIHNob3VsZCBsb29rIGxpa2UgXCJzb21lLWRlc2NyaXB0aXZlLWxhYmVsX19jb2xvclwiXG4gKiBBbnkgdmFsaWQgVEhSRUUuQ29sb3IgYXJndW1lbnQgaXMgYSB2YWxpZCBjb2xvciB2YWx1ZS5cbiAqIFNlZSBoZXJlIGZvciBleGFtcGxlIGNvbG9yIG5hbWVzIGh0dHBzOi8vd3d3Lnczc2Nob29scy5jb20vY3NzcmVmL2Nzc19jb2xvcnMuYXNwXG4gKlxuICogRm9yIGV4YW1wbGUsIHRvIG1ha2UgYSBwYWlyIG9mIGNvbm5lY3RlZCBibHVlIHBvcnRhbHMsXG4gKiB5b3UgY291bGQgbmFtZSB0aGVtIFwicG9ydGFsLXRvX19ibHVlXCIgYW5kIFwicG9ydGFsLWZyb21fX2JsdWVcIlxuICovXG4gaW1wb3J0ICogYXMgaHRtbENvbXBvbmVudHMgZnJvbSBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiO1xuXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcbi8vIGltcG9ydCB2ZXJ0ZXhTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwudmVydC5qcydcbi8vIGltcG9ydCBmcmFnbWVudFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC5mcmFnLmpzJ1xuLy8gaW1wb3J0IHNub2lzZSBmcm9tICcuLi9zaGFkZXJzL3Nub2lzZSdcblxuaW1wb3J0IHsgc2hvd1JlZ2lvbkZvck9iamVjdCwgaGlkZXJSZWdpb25Gb3JPYmplY3QgfSBmcm9tICcuL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tICcuLi91dGlscy9zY2VuZS1ncmFwaCdcbmltcG9ydCB7IHVwZGF0ZVdpdGhTaGFkZXIgfSBmcm9tICcuL3NoYWRlcidcbmltcG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAtcG9ydGFsLmpzJ1xuXG5pbXBvcnQgZ29sZGNvbG9yIGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0NPTE9SLmpwZydcbmltcG9ydCBnb2xkRGlzcGxhY2VtZW50IGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0RJU1AuanBnJ1xuaW1wb3J0IGdvbGRnbG9zcyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9nbG9zc2luZXNzLnBuZydcbmltcG9ydCBnb2xkbm9ybSBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9OUk0uanBnJ1xuaW1wb3J0IGdvbGRhbyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9PQ0MuanBnJ1xuXG5pbXBvcnQgQ3ViZUNhbWVyYVdyaXRlciBmcm9tIFwiLi4vdXRpbHMvd3JpdGVDdWJlTWFwLmpzXCI7XG5cbmltcG9ydCB7IE1hcmJsZTFTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21hcmJsZTEnXG5pbXBvcnQgeyByZXBsYWNlTWF0ZXJpYWwgYXMgcmVwbGFjZVdpdGhTaGFkZXJ9IGZyb20gJy4vc2hhZGVyJ1xuXG5jb25zdCB3b3JsZFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkQ2FtZXJhUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGREaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFF1YXQgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpXG5jb25zdCBtYXQ0ID0gbmV3IFRIUkVFLk1hdHJpeDQoKVxuXG4vLyBsb2FkIGFuZCBzZXR1cCBhbGwgdGhlIGJpdHMgb2YgdGhlIHRleHR1cmVzIGZvciB0aGUgZG9vclxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxuY29uc3QgZG9vck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcbiAgICBjb2xvcjogMHhmZmZmZmYsXG4gICAgbWV0YWxuZXNzOiAwLjAsXG4gICAgcm91Z2huZXNzOiAwLjAsIFxuICAgIC8vZW1pc3NpdmVJbnRlbnNpdHk6IDFcbn0pXG5jb25zdCBkb29ybWF0ZXJpYWxZID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcbiAgICBjb2xvcjogMHhmZmZmZmYsXG4gICAgbWV0YWxuZXNzOiAwLjAsXG4gICAgcm91Z2huZXNzOiAwLCBcbiAgICAvL2VtaXNzaXZlSW50ZW5zaXR5OiAxXG59KVxuXG5sb2FkZXIubG9hZChnb2xkY29sb3IsIChjb2xvcikgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5tYXAgPSBjb2xvcjtcbiAgICBjb2xvci5yZXBlYXQuc2V0KDEsMjUpXG4gICAgY29sb3Iud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBjb2xvci53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5sb2FkZXIubG9hZChnb2xkY29sb3IsIChjb2xvcikgPT4ge1xuICAgIC8vY29sb3IgPSBjb2xvci5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5tYXAgPSBjb2xvcjtcbiAgICBjb2xvci5yZXBlYXQuc2V0KDEsMSlcbiAgICBjb2xvci53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgY29sb3Iud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkRGlzcGxhY2VtZW50LCAoZGlzcCkgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5idW1wTWFwID0gZGlzcDtcbiAgICBkaXNwLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBkaXNwLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZGlzcC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGREaXNwbGFjZW1lbnQsIChkaXNwKSA9PiB7XG4gICAgLy9kaXNwID0gZGlzcC5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5idW1wTWFwID0gZGlzcDtcbiAgICBkaXNwLnJlcGVhdC5zZXQoMSwxKVxuICAgIGRpc3Aud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRpc3Aud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkZ2xvc3MsIChnbG9zcykgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5yb3VnaG5lc3MgPSBnbG9zc1xuICAgIGdsb3NzLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBnbG9zcy53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGdsb3NzLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZGdsb3NzLCAoZ2xvc3MpID0+IHtcbiAgICAvL2dsb3NzID0gZ2xvc3MuY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkucm91Z2huZXNzID0gZ2xvc3NcbiAgICBnbG9zcy5yZXBlYXQuc2V0KDEsMSlcbiAgICBnbG9zcy53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZ2xvc3Mud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuICAgICAgICAgXG5sb2FkZXIubG9hZChnb2xkYW8sIChhbykgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5hb01hcCA9IGFvXG4gICAgYW8ucmVwZWF0LnNldCgxLDI1KVxuICAgIGFvLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYW8ud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuICAgICAgICAgXG5sb2FkZXIubG9hZChnb2xkYW8sIChhbykgPT4ge1xuICAgIC8vIGFvID0gYW8uY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkuYW9NYXAgPSBhb1xuICAgIGFvLnJlcGVhdC5zZXQoMSwxKVxuICAgIGFvLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBhby53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRub3JtLCAobm9ybSkgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5ub3JtYWxNYXAgPSBub3JtO1xuICAgIG5vcm0ucmVwZWF0LnNldCgxLDI1KVxuICAgIG5vcm0ud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub3JtLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZG5vcm0sIChub3JtKSA9PiB7XG4gICAgLy8gbm9ybSA9IG5vcm0uY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkubm9ybWFsTWFwID0gbm9ybTtcbiAgICBub3JtLnJlcGVhdC5zZXQoMSwxKVxuICAgIG5vcm0ud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIG5vcm0ud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG4vLyAvLyBtYXAgYWxsIG1hdGVyaWFscyB2aWEgYSBjYWxsYmFjay4gIFRha2VuIGZyb20gaHVicyBtYXRlcmlhbHMtdXRpbHNcbi8vIGZ1bmN0aW9uIG1hcE1hdGVyaWFscyhvYmplY3QzRCwgZm4pIHtcbi8vICAgICBsZXQgbWVzaCA9IG9iamVjdDNEIFxuLy8gICAgIGlmICghbWVzaC5tYXRlcmlhbCkgcmV0dXJuO1xuICBcbi8vICAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xuLy8gICAgICAgcmV0dXJuIG1lc2gubWF0ZXJpYWwubWFwKGZuKTtcbi8vICAgICB9IGVsc2Uge1xuLy8gICAgICAgcmV0dXJuIGZuKG1lc2gubWF0ZXJpYWwpO1xuLy8gICAgIH1cbi8vIH1cbiAgXG5BRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ3BvcnRhbCcsIHtcbiAgZGVwZW5kZW5jaWVzOiBbJ2ZhZGVyLXBsdXMnXSxcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudGVsZXBvcnRpbmcgPSBmYWxzZVxuICAgIHRoaXMuY2hhcmFjdGVyQ29udHJvbGxlciA9IHRoaXMuZWwuc3lzdGVtc1snaHVicy1zeXN0ZW1zJ10uY2hhcmFjdGVyQ29udHJvbGxlclxuICAgIHRoaXMuZmFkZXIgPSB0aGlzLmVsLnN5c3RlbXNbJ2ZhZGVyLXBsdXMnXVxuICAgIHRoaXMucm9vbURhdGEgPSBudWxsXG4gICAgdGhpcy53YWl0Rm9yRmV0Y2ggPSB0aGlzLndhaXRGb3JGZXRjaC5iaW5kKHRoaXMpXG5cbiAgICAvLyBpZiB0aGUgdXNlciBpcyBsb2dnZWQgaW4sIHdlIHdhbnQgdG8gcmV0cmlldmUgdGhlaXIgdXNlckRhdGEgZnJvbSB0aGUgdG9wIGxldmVsIHNlcnZlclxuICAgIGlmICh3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzICYmIHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMudG9rZW4gJiYgIXdpbmRvdy5BUFAudXNlckRhdGEpIHtcbiAgICAgICAgdGhpcy5mZXRjaFJvb21EYXRhKClcbiAgICB9XG4gIH0sXG4gIGZldGNoUm9vbURhdGE6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcGFyYW1zID0ge3Rva2VuOiB3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzLnRva2VuLFxuICAgICAgICAgICAgICAgICAgcm9vbV9pZDogd2luZG93LkFQUC5odWJDaGFubmVsLmh1YklkfVxuXG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuICAgIG9wdGlvbnMuaGVhZGVycyA9IG5ldyBIZWFkZXJzKCk7XG4gICAgb3B0aW9ucy5oZWFkZXJzLnNldChcIkF1dGhvcml6YXRpb25cIiwgYEJlYXJlciAke3BhcmFtc31gKTtcbiAgICBvcHRpb25zLmhlYWRlcnMuc2V0KFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vanNvblwiKTtcbiAgICBhd2FpdCBmZXRjaChcImh0dHBzOi8vcmVhbGl0eW1lZGlhLmRpZ2l0YWwvdXNlckRhdGFcIiwgb3B0aW9ucylcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKVxuICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnU3VjY2VzczonLCBkYXRhKTtcbiAgICAgICAgICB0aGlzLnJvb21EYXRhID0gZGF0YTtcbiAgICB9KVxuICAgIHRoaXMucm9vbURhdGEudGV4dHVyZXMgPSBbXVxuICB9LFxuICBnZXRSb29tVVJMOiBhc3luYyBmdW5jdGlvbiAobnVtYmVyKSB7XG4gICAgICB0aGlzLndhaXRGb3JGZXRjaCgpXG4gICAgICAvL3JldHVybiB0aGlzLnJvb21EYXRhLnJvb21zLmxlbmd0aCA+IG51bWJlciA/IFwiaHR0cHM6Ly94ci5yZWFsaXR5bWVkaWEuZGlnaXRhbC9cIiArIHRoaXMucm9vbURhdGEucm9vbXNbbnVtYmVyXSA6IG51bGw7XG4gICAgICBsZXQgdXJsID0gd2luZG93LlNTTy51c2VySW5mby5yb29tcy5sZW5ndGggPiBudW1iZXIgPyBcImh0dHBzOi8veHIucmVhbGl0eW1lZGlhLmRpZ2l0YWwvXCIgKyB3aW5kb3cuU1NPLnVzZXJJbmZvLnJvb21zW251bWJlcl0gOiBudWxsO1xuICAgICAgcmV0dXJuIHVybFxuICB9LFxuICBnZXRDdWJlTWFwOiBhc3luYyBmdW5jdGlvbiAobnVtYmVyLCB3YXlwb2ludCkge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuXG4gICAgICBpZiAoIXdheXBvaW50IHx8IHdheXBvaW50Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgd2F5cG9pbnQgPSBcInN0YXJ0XCJcbiAgICAgIH1cbiAgICAgIGxldCB1cmxzID0gW1wiUmlnaHRcIixcIkxlZnRcIixcIlRvcFwiLFwiQm90dG9tXCIsXCJGcm9udFwiLFwiQmFja1wiXS5tYXAoZWwgPT4ge1xuICAgICAgICAgIHJldHVybiBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2RhdGEvcm9vbVBhbm9zL1wiICsgbnVtYmVyLnRvU3RyaW5nKCkgKyBcIi9cIiArIHdheXBvaW50ICsgXCItXCIgKyBlbCArIFwiLnBuZ1wiXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHVybHNcbiAgICAgIC8vcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgd2FpdEZvckZldGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgIGlmICh0aGlzLnJvb21EYXRhICYmIHdpbmRvdy5TU08udXNlckluZm8pIHJldHVyblxuICAgICBzZXRUaW1lb3V0KHRoaXMud2FpdEZvckZldGNoLCAxMDApOyAvLyB0cnkgYWdhaW4gaW4gMTAwIG1pbGxpc2Vjb25kc1xuICB9LFxuICB0ZWxlcG9ydFRvOiBhc3luYyBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IHRydWVcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVPdXQoKVxuICAgIC8vIFNjYWxlIHNjcmV3cyB1cCB0aGUgd2F5cG9pbnQgbG9naWMsIHNvIGp1c3Qgc2VuZCBwb3NpdGlvbiBhbmQgb3JpZW50YXRpb25cbiAgICBvYmplY3QuZ2V0V29ybGRRdWF0ZXJuaW9uKHdvcmxkUXVhdClcbiAgICBvYmplY3QuZ2V0V29ybGREaXJlY3Rpb24od29ybGREaXIpXG4gICAgb2JqZWN0LmdldFdvcmxkUG9zaXRpb24od29ybGRQb3MpXG4gICAgd29ybGRQb3MuYWRkKHdvcmxkRGlyLm11bHRpcGx5U2NhbGFyKDMpKSAvLyBUZWxlcG9ydCBpbiBmcm9udCBvZiB0aGUgcG9ydGFsIHRvIGF2b2lkIGluZmluaXRlIGxvb3BcbiAgICBtYXQ0Lm1ha2VSb3RhdGlvbkZyb21RdWF0ZXJuaW9uKHdvcmxkUXVhdClcbiAgICBtYXQ0LnNldFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgIC8vIFVzaW5nIHRoZSBjaGFyYWN0ZXJDb250cm9sbGVyIGVuc3VyZXMgd2UgZG9uJ3Qgc3RyYXkgZnJvbSB0aGUgbmF2bWVzaFxuICAgIHRoaXMuY2hhcmFjdGVyQ29udHJvbGxlci50cmF2ZWxCeVdheXBvaW50KG1hdDQsIHRydWUsIGZhbHNlKVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZUluKClcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBwb3J0YWxUeXBlOiB7IGRlZmF1bHQ6IFwiXCIgfSxcbiAgICAgICAgcG9ydGFsVGFyZ2V0OiB7IGRlZmF1bHQ6IFwiXCIgfSxcbiAgICAgICAgc2Vjb25kYXJ5VGFyZ2V0OiB7IGRlZmF1bHQ6IFwiXCIgfSxcbiAgICAgICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogbnVsbCB9LFxuICAgICAgICBtYXRlcmlhbFRhcmdldDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbCB9LFxuICAgICAgICBkcmF3RG9vcjogeyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IGZhbHNlIH0sXG4gICAgICAgIHRleHQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IG51bGx9LFxuICAgICAgICB0ZXh0UG9zaXRpb246IHsgdHlwZTogJ3ZlYzMnIH0sXG4gICAgICAgIHRleHRTaXplOiB7IHR5cGU6ICd2ZWMyJyB9LFxuICAgICAgICB0ZXh0U2NhbGU6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDEgfVxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIFRFU1RJTkdcbiAgICAgICAgLy90aGlzLmRhdGEuZHJhd0Rvb3IgPSB0cnVlXG4gICAgICAgIC8vIHRoaXMuZGF0YS5tYWluVGV4dCA9IFwiUG9ydGFsIHRvIHRoZSBBYnlzc1wiXG4gICAgICAgIC8vIHRoaXMuZGF0YS5zZWNvbmRhcnlUZXh0ID0gXCJUbyB2aXNpdCB0aGUgQWJ5c3MsIGdvIHRocm91Z2ggdGhlIGRvb3IhXCJcblxuICAgICAgICAvLyBBLUZyYW1lIGlzIHN1cHBvc2VkIHRvIGRvIHRoaXMgYnkgZGVmYXVsdCBidXQgZG9lc24ndCBzZWVtIHRvP1xuICAgICAgICB0aGlzLnN5c3RlbSA9IHdpbmRvdy5BUFAuc2NlbmUuc3lzdGVtcy5wb3J0YWwgXG5cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5wb3J0YWxUeXBlLmxlbmd0aCA+IDAgKSB7XG4gICAgICAgICAgICB0aGlzLnNldFBvcnRhbEluZm8odGhpcy5kYXRhLnBvcnRhbFR5cGUsIHRoaXMuZGF0YS5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5jb2xvcilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMCkge1xuICAgICAgICAgICAgLy8gcGFyc2UgdGhlIG5hbWUgdG8gZ2V0IHBvcnRhbCB0eXBlLCB0YXJnZXQsIGFuZCBjb2xvclxuICAgICAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKClcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gd2FpdCB1bnRpbCB0aGUgc2NlbmUgbG9hZHMgdG8gZmluaXNoLiAgV2Ugd2FudCB0byBtYWtlIHN1cmUgZXZlcnl0aGluZ1xuICAgICAgICAvLyBpcyBpbml0aWFsaXplZFxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdCAmJiByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKGV2KSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplKClcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIGluaXRpYWxpemU6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICAgIC8vICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIC8vICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgICAgICAgLy8gICB1bmlmb3Jtczoge1xuICAgICAgICAvLyAgICAgY3ViZU1hcDogeyB2YWx1ZTogbmV3IFRIUkVFLlRleHR1cmUoKSB9LFxuICAgICAgICAvLyAgICAgdGltZTogeyB2YWx1ZTogMCB9LFxuICAgICAgICAvLyAgICAgcmFkaXVzOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIC8vICAgICByaW5nQ29sb3I6IHsgdmFsdWU6IHRoaXMuY29sb3IgfSxcbiAgICAgICAgLy8gICB9LFxuICAgICAgICAvLyAgIHZlcnRleFNoYWRlcixcbiAgICAgICAgLy8gICBmcmFnbWVudFNoYWRlcjogYFxuICAgICAgICAvLyAgICAgJHtzbm9pc2V9XG4gICAgICAgIC8vICAgICAke2ZyYWdtZW50U2hhZGVyfVxuICAgICAgICAvLyAgIGAsXG4gICAgICAgIC8vIH0pXG5cbiAgICAgICAgLy8gQXNzdW1lIHRoYXQgdGhlIG9iamVjdCBoYXMgYSBwbGFuZSBnZW9tZXRyeVxuICAgICAgICAvL2NvbnN0IG1lc2ggPSB0aGlzLmVsLmdldE9yQ3JlYXRlT2JqZWN0M0QoJ21lc2gnKVxuICAgICAgICAvL21lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbHMgPSBudWxsXG4gICAgICAgIHRoaXMucmFkaXVzID0gMC4yXG4gICAgICAgIHRoaXMuY3ViZU1hcCA9IG5ldyBUSFJFRS5DdWJlVGV4dHVyZSgpXG5cbiAgICAgICAgLy8gZ2V0IHRoZSBvdGhlciBiZWZvcmUgY29udGludWluZ1xuICAgICAgICB0aGlzLm90aGVyID0gYXdhaXQgdGhpcy5nZXRPdGhlcigpXG5cbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAgICAgcHJvcGVydHk6ICdjb21wb25lbnRzLnBvcnRhbC5yYWRpdXMnLFxuICAgICAgICAgICAgZHVyOiA3MDAsXG4gICAgICAgICAgICBlYXNpbmc6ICdlYXNlSW5PdXRDdWJpYycsXG4gICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICAvLyB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmJlZ2luJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHRydWUpKVxuICAgICAgICAvLyB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmNvbXBsZXRlX19wb3J0YWwnLCAoKSA9PiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gIXRoaXMuaXNDbG9zZWQoKSkpXG5cbiAgICAgICAgLy8gZ29pbmcgdG8gd2FudCB0byB0cnkgYW5kIG1ha2UgdGhlIG9iamVjdCB0aGlzIHBvcnRhbCBpcyBvbiBjbGlja2FibGVcbiAgICAgICAgLy8gdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgICAgICAvLyB0aGlzLmVsLnNldEF0dHJpYnV0ZSgndGFncycsIHtzaW5nbGVBY3Rpb25CdXR0b246IHRydWV9KVxuICAgICAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgIC8vIG9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIHBvcnRhbCBtb3ZlbWVudCBcbiAgICAgICAgLy90aGlzLmZvbGxvd1BvcnRhbCA9IHRoaXMuZm9sbG93UG9ydGFsLmJpbmQodGhpcylcbiAgICAgICAgLy90aGlzLmVsLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5mb2xsb3dQb3J0YWwpXG5cbiAgICAgICAgaWYgKCB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0gfHwgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtaW1hZ2VcIl0gKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICAgICAgbGV0IGZuID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwUG9ydGFsKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBEb29yKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCBmbilcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCBmbilcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cFBvcnRhbCgpXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5kcmF3RG9vcikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5kcmF3RG9vcikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBEb29yKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc2V0dXBQb3J0YWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gZ2V0IHJpZCBvZiBpbnRlcmFjdGl2aXR5XG4gICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJpcy1yZW1vdGUtaG92ZXItdGFyZ2V0XCIpXG4gICAgICAgIFxuICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLm1hdGVyaWFsVGFyZ2V0XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0Lmxlbmd0aCA9PSAwKSB7dGFyZ2V0PW51bGx9XG4gICAgXG4gICAgICAgIHRoaXMubWF0ZXJpYWxzID0gdXBkYXRlV2l0aFNoYWRlcihXYXJwUG9ydGFsU2hhZGVyLCB0aGlzLmVsLCB0YXJnZXQsIHtcbiAgICAgICAgICAgIHJhZGl1czogdGhpcy5yYWRpdXMsXG4gICAgICAgICAgICByaW5nQ29sb3I6IHRoaXMuY29sb3IsXG4gICAgICAgICAgICBjdWJlTWFwOiB0aGlzLmN1YmVNYXAsXG4gICAgICAgICAgICBpbnZlcnRXYXJwQ29sb3I6IHRoaXMucG9ydGFsVHlwZSA9PSAxID8gMSA6IDBcbiAgICAgICAgfSlcblxuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldEN1YmVNYXAodGhpcy5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQpLnRoZW4oIHVybHMgPT4ge1xuICAgICAgICAgICAgICAgIC8vY29uc3QgdXJscyA9IFtjdWJlTWFwUG9zWCwgY3ViZU1hcE5lZ1gsIGN1YmVNYXBQb3NZLCBjdWJlTWFwTmVnWSwgY3ViZU1hcFBvc1osIGN1YmVNYXBOZWdaXTtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5DdWJlVGV4dHVyZUxvYWRlcigpLmxvYWQodXJscywgcmVzb2x2ZSwgdW5kZWZpbmVkLCByZWplY3QpXG4gICAgICAgICAgICAgICAgKS50aGVuKHRleHR1cmUgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFsLnVuaWZvcm1zLmN1YmVNYXAudmFsdWUgPSB0ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7bWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IHRleHR1cmVcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZSkpICAgIFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiB8fCB0aGlzLnBvcnRhbFR5cGUgPT0gMykgeyAgICBcbiAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYSA9IG5ldyBDdWJlQ2FtZXJhV3JpdGVyKDAuMSwgMTAwMCwgMTAyNClcbiAgICAgICAgICAgIC8vdGhpcy5jdWJlQ2FtZXJhLnJvdGF0ZVkoTWF0aC5QSSkgLy8gRmFjZSBmb3J3YXJkc1xuICAgICAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5hZGQodGhpcy5jdWJlQ2FtZXJhKVxuICAgICAgICAgICAgICAgIC8vIHRoaXMub3RoZXIuY29tcG9uZW50cy5wb3J0YWwubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZSBcbiAgICAgICAgICAgICAgICAvL3RoaXMub3RoZXIuY29tcG9uZW50cy5wb3J0YWwubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7bWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICB0aGlzLm90aGVyLmNvbXBvbmVudHMucG9ydGFsLmN1YmVNYXAgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmVcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGV0IHdheXBvaW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSh0aGlzLnBvcnRhbFRhcmdldClcbiAgICAgICAgICAgICAgICBpZiAod2F5cG9pbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB3YXlwb2ludCA9IHdheXBvaW50Lml0ZW0oMClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnBvc2l0aW9uLnkgPSAxLjZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB3YXlwb2ludC5vYmplY3QzRC5hZGQodGhpcy5jdWJlQ2FtZXJhKVxuICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLmN1YmVNYXAudmFsdWUgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmU7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTt9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVNYXAgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHNob3dSZWdpb25Gb3JPYmplY3QodGhpcy5lbClcbiAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEudXBkYXRlKHRoaXMuZWwuc2NlbmVFbC5yZW5kZXJlciwgdGhpcy5lbC5zY2VuZUVsLm9iamVjdDNEKVxuICAgICAgICAgICAgICAgIC8vIHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSB0cnVlXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlLm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgIGhpZGVyUmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgIGxldCBzY2FsZVggPSBzY2FsZU0ueCAqIHNjYWxlSS54XG4gICAgICAgIGxldCBzY2FsZVkgPSBzY2FsZU0ueSAqIHNjYWxlSS55XG4gICAgICAgIGxldCBzY2FsZVogPSBzY2FsZU0ueiAqIHNjYWxlSS56XG5cbiAgICAgICAgLy8gdGhpcy5wb3J0YWxXaWR0aCA9IHNjYWxlWCAvIDJcbiAgICAgICAgLy8gdGhpcy5wb3J0YWxIZWlnaHQgPSBzY2FsZVkgLyAyXG5cbiAgICAgICAgLy8gb2Zmc2V0IHRvIGNlbnRlciBvZiBwb3J0YWwgYXNzdW1pbmcgd2Fsa2luZyBvbiBncm91bmRcbiAgICAgICAgLy8gdGhpcy5Zb2Zmc2V0ID0gLSh0aGlzLmVsLm9iamVjdDNELnBvc2l0aW9uLnkgLSAxLjYpXG4gICAgICAgIHRoaXMuWW9mZnNldCA9IC0oc2NhbGVZLzIgLSAxLjYpXG5cbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3Byb3hpbWl0eS1ldmVudHMnLCB7IHJhZGl1czogNCwgWW9mZnNldDogdGhpcy5Zb2Zmc2V0IH0pXG4gICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5ZW50ZXInLCAoKSA9PiB0aGlzLm9wZW4oKSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHlsZWF2ZScsICgpID0+IHRoaXMuY2xvc2UoKSlcbiAgICBcbiAgICAgICAgdmFyIHRpdGxlU2NyaXB0RGF0YSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiB0aGlzLmRhdGEudGV4dFNpemUueCxcbiAgICAgICAgICAgIGhlaWdodDogdGhpcy5kYXRhLnRleHRTaXplLnksXG4gICAgICAgICAgICBtZXNzYWdlOiB0aGlzLmRhdGEudGV4dFxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBvcnRhbFRpdGxlID0gaHRtbENvbXBvbmVudHNbXCJQb3J0YWxUaXRsZVwiXVxuICAgICAgICAvLyBjb25zdCBwb3J0YWxTdWJ0aXRsZSA9IGh0bWxDb21wb25lbnRzW1wiUG9ydGFsU3VidGl0bGVcIl1cblxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlID0gcG9ydGFsVGl0bGUodGl0bGVTY3JpcHREYXRhKVxuICAgICAgICAvLyB0aGlzLnBvcnRhbFN1YnRpdGxlID0gcG9ydGFsU3VidGl0bGUoc3VidGl0bGVTY3JpcHREYXRhKVxuXG4gICAgICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoJ3BvcnRhbFRpdGxlJywgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNEKVxuICAgICAgICBsZXQgc2l6ZSA9IHRoaXMucG9ydGFsVGl0bGUuZ2V0U2l6ZSgpXG4gICAgICAgIGxldCB0aXRsZVNjYWxlWCA9IHNjYWxlWCAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiAgICAgICAgbGV0IHRpdGxlU2NhbGVZID0gc2NhbGVZIC8gdGhpcy5kYXRhLnRleHRTY2FsZVxuICAgICAgICBsZXQgdGl0bGVTY2FsZVogPSBzY2FsZVogLyB0aGlzLmRhdGEudGV4dFNjYWxlXG5cbiAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnggLz0gdGl0bGVTY2FsZVhcbiAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnkgLz0gdGl0bGVTY2FsZVlcbiAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnogLz0gdGl0bGVTY2FsZVpcblxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueCA9IHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueCAvIHNjYWxlWFxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueSA9IDAuNSArIHNpemUuaGVpZ2h0IC8gMiArIHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueSAvIHNjYWxlWVxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueiA9IHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueiAvIHNjYWxlWVxuICAgICAgICAvLyB0aGlzLmVsLnNldE9iamVjdDNEKCdwb3J0YWxTdWJ0aXRsZScsIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRClcbiAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnggPSAxXG4gICAgICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuXG4gICAgICAgIC8vIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7XG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEucmFkaXVzID0gdGhpcy5yYWRpdXNcbiAgICAgICAgLy8gICAgIG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgPSB0aGlzLmNvbG9yXG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZU1hcFxuICAgICAgICAvLyB9KVxuICAgIH0sXG4gICAgICAgIC8vICAgcmVwbGFjZU1hdGVyaWFsOiBmdW5jdGlvbiAobmV3TWF0ZXJpYWwpIHtcbi8vICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLm1hdGVyaWFsVGFyZ2V0XG4vLyAgICAgaWYgKHRhcmdldCAmJiB0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICBcbi8vICAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0KSA9PiB7XG4vLyAgICAgICBsZXQgbWVzaCA9IG9iamVjdFxuLy8gICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbi8vICAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsKSA9PiB7ICAgICAgICAgXG4vLyAgICAgICAgICAgICAgIGlmICghdGFyZ2V0IHx8IG1hdGVyaWFsLm5hbWUgPT09IHRhcmdldCkge1xuLy8gICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01hdGVyaWFsXG4vLyAgICAgICAgICAgICAgIH1cbi8vICAgICAgICAgICB9KVxuLy8gICAgICAgfVxuLy8gICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4vLyAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4vLyAgICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuLy8gICAgICAgfVxuLy8gICAgIH1cblxuLy8gICAgIGxldCByZXBsYWNlTWF0ZXJpYWxzID0gKCkgPT4ge1xuLy8gICAgICAgICAvLyBtZXNoIHdvdWxkIGNvbnRhaW4gdGhlIG9iamVjdCB0aGF0IGlzLCBvciBjb250YWlucywgdGhlIG1lc2hlc1xuLy8gICAgICAgICB2YXIgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuLy8gICAgICAgICBpZiAoIW1lc2gpIHtcbi8vICAgICAgICAgICAgIC8vIGlmIG5vIG1lc2gsIHdlJ2xsIHNlYXJjaCB0aHJvdWdoIGFsbCBvZiB0aGUgY2hpbGRyZW4uICBUaGlzIHdvdWxkXG4vLyAgICAgICAgICAgICAvLyBoYXBwZW4gaWYgd2UgZHJvcHBlZCB0aGUgY29tcG9uZW50IG9uIGEgZ2xiIGluIHNwb2tlXG4vLyAgICAgICAgICAgICBtZXNoID0gdGhpcy5lbC5vYmplY3QzRFxuLy8gICAgICAgICB9XG4vLyAgICAgICAgIHRyYXZlcnNlKG1lc2gpO1xuLy8gICAgICAgIC8vIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4vLyAgICAgfVxuXG4vLyAgICAgLy8gbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4vLyAgICAgLy8gbGV0IGluaXRpYWxpemVyID0gKCkgPT57XG4vLyAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4vLyAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIHJlcGxhY2VNYXRlcmlhbHMpXG4vLyAgICAgICB9IGVsc2Uge1xuLy8gICAgICAgICAgIHJlcGxhY2VNYXRlcmlhbHMoKVxuLy8gICAgICAgfVxuLy8gICAgIC8vIH07XG4vLyAgICAgLy9yZXBsYWNlTWF0ZXJpYWxzKClcbi8vICAgICAvLyByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuLy8gICB9LFxuXG4vLyAgIGZvbGxvd1BvcnRhbDogZnVuY3Rpb24oKSB7XG4vLyAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4vLyAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbi8vICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4vLyAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyKSB7XG4vLyAgICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbi8vICAgICAgIH1cbi8vICAgfSxcblxuICAgIHNldHVwRG9vcjogZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vIGF0dGFjaGVkIHRvIGFuIGltYWdlIGluIHNwb2tlLiAgVGhpcyBpcyB0aGUgb25seSB3YXkgd2UgYWxsb3cgYnVpZGxpbmcgYSBcbiAgICAgICAgLy8gZG9vciBhcm91bmQgaXRcbiAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgIHZhciB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgdmFyIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgdmFyIGRlcHRoID0gMS4wOyAvLyAgc2NhbGVNLnogKiBzY2FsZUkuelxuXG4gICAgICAgIGNvbnN0IGVudmlyb25tZW50TWFwQ29tcG9uZW50ID0gdGhpcy5lbC5zY2VuZUVsLmNvbXBvbmVudHNbXCJlbnZpcm9ubWVudC1tYXBcIl07XG5cbiAgICAgICAgLy8gbGV0IGFib3ZlID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIC8vICAgICBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoMSwgNTAsIDUwKSxcbiAgICAgICAgLy8gICAgIGRvb3JtYXRlcmlhbFkgXG4gICAgICAgIC8vICk7XG4gICAgICAgIC8vIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAvLyAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcChhYm92ZSk7XG4gICAgICAgIC8vIH1cbiAgICAgICAgLy8gYWJvdmUucG9zaXRpb24uc2V0KDAsIDIuNSwgMClcbiAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5hZGQoYWJvdmUpXG5cbiAgICAgICAgbGV0IGxlZnQgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIC8vIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMi9oZWlnaHQsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMSwwLjEvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgW2Rvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vcm1hdGVyaWFsWSwgZG9vcm1hdGVyaWFsWSxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKGxlZnQpO1xuICAgICAgICB9XG4gICAgICAgIGxlZnQucG9zaXRpb24uc2V0KC0wLjUxLCAwLCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZChsZWZ0KVxuXG4gICAgICAgIGxldCByaWdodCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwxLDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29ybWF0ZXJpYWxZLCBkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWxdLCBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAocmlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIHJpZ2h0LnBvc2l0aW9uLnNldCgwLjUxLCAwLCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZChyaWdodClcblxuICAgICAgICBsZXQgdG9wID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSArIDAuMy93aWR0aCwwLjEvaGVpZ2h0LDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vcm1hdGVyaWFsWSxkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbF0sIFxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcCh0b3ApO1xuICAgICAgICB9XG4gICAgICAgIHRvcC5wb3NpdGlvbi5zZXQoMC4wLCAwLjUwNSwgMClcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5hZGQodG9wKVxuXG4gICAgICAgIC8vIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAvLyAgICAgY29uc3Qge3dpZHRoOiB3c2l6ZSwgaGVpZ2h0OiBoc2l6ZX0gPSB0aGlzLnNjcmlwdC5nZXRTaXplKClcbiAgICAgICAgLy8gICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHdpZHRoIC8gd3NpemUsIGhlaWdodCAvIGhzaXplKVxuICAgICAgICAvLyAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwgeyB4OiBzY2FsZSwgeTogc2NhbGUsIHo6IHNjYWxlfSk7XG4gICAgICAgIC8vIH1cbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy90aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnRpbWUudmFsdWUgPSB0aW1lIC8gMTAwMFxuICAgICAgICBpZiAoIXRoaXMubWF0ZXJpYWxzKSB7IHJldHVybiB9XG5cbiAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS50aWNrKHRpbWUpXG4gICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUudGljayh0aW1lKVxuXG4gICAgICAgIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7XG4gICAgICAgICAgICBtYXQudXNlckRhdGEucmFkaXVzID0gdGhpcy5yYWRpdXNcbiAgICAgICAgICAgIG1hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlTWFwXG4gICAgICAgICAgICBXYXJwUG9ydGFsU2hhZGVyLnVwZGF0ZVVuaWZvcm1zKHRpbWUsIG1hdClcbiAgICAgICAgfSlcblxuICAgICAgICBpZiAodGhpcy5vdGhlciAmJiAhdGhpcy5zeXN0ZW0udGVsZXBvcnRpbmcpIHtcbiAgICAgICAgLy8gICB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUG9zaXRpb24od29ybGRQb3MpXG4gICAgICAgIC8vICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhUG9zKVxuICAgICAgICAvLyAgIHdvcmxkQ2FtZXJhUG9zLnkgLT0gdGhpcy5Zb2Zmc2V0XG4gICAgICAgIC8vICAgY29uc3QgZGlzdCA9IHdvcmxkQ2FtZXJhUG9zLmRpc3RhbmNlVG8od29ybGRQb3MpXG4gICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhUG9zKVxuICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0Qud29ybGRUb0xvY2FsKHdvcmxkQ2FtZXJhUG9zKVxuXG4gICAgICAgICAgLy8gaW4gbG9jYWwgcG9ydGFsIGNvb3JkaW5hdGVzLCB0aGUgd2lkdGggYW5kIGhlaWdodCBhcmUgMVxuICAgICAgICAgIGlmIChNYXRoLmFicyh3b3JsZENhbWVyYVBvcy54KSA+IDAuNSB8fCBNYXRoLmFicyh3b3JsZENhbWVyYVBvcy55KSA+IDAuNSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBkaXN0ID0gTWF0aC5hYnMod29ybGRDYW1lcmFQb3Mueik7XG5cbiAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEgJiYgZGlzdCA8IDAuMjUpIHtcbiAgICAgICAgICAgICAgaWYgKCF0aGlzLmxvY2F0aW9uaHJlZikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgICAgICB0aGlzLmxvY2F0aW9uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIgJiYgZGlzdCA8IDAuMjUpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7XG4gICAgICAgICAgICAgIGlmIChkaXN0IDwgMC4yNSkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5oYXNoIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgLy8gaWYgd2Ugc2V0IGxvY2F0aW9uaHJlZiwgd2UgdGVsZXBvcnRlZC4gIHdoZW4gaXRcbiAgICAgICAgICAgICAgICAgIC8vIGZpbmFsbHkgaGFwcGVucywgYW5kIHdlIG1vdmUgb3V0c2lkZSB0aGUgcmFuZ2Ugb2YgdGhlIHBvcnRhbCxcbiAgICAgICAgICAgICAgICAgIC8vIHdlIHdpbGwgY2xlYXIgdGhlIGZsYWdcbiAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gbnVsbFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgZ2V0T3RoZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHJlc29sdmUobnVsbClcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgID09IDEpIHtcbiAgICAgICAgICAgICAgICAvLyB0aGUgdGFyZ2V0IGlzIGFub3RoZXIgcm9vbSwgcmVzb2x2ZSB3aXRoIHRoZSBVUkwgdG8gdGhlIHJvb21cbiAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRSb29tVVJMKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKHVybCA9PiB7IFxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCAmJiB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUodXJsICsgXCIjXCIgKyB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwpIFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMykge1xuICAgICAgICAgICAgICAgIHJlc29sdmUgKFwiI1wiICsgdGhpcy5wb3J0YWxUYXJnZXQpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIG5vdyBmaW5kIHRoZSBwb3J0YWwgd2l0aGluIHRoZSByb29tLiAgVGhlIHBvcnRhbHMgc2hvdWxkIGNvbWUgaW4gcGFpcnMgd2l0aCB0aGUgc2FtZSBwb3J0YWxUYXJnZXRcbiAgICAgICAgICAgIGNvbnN0IHBvcnRhbHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtwb3J0YWxdYCkpXG4gICAgICAgICAgICBjb25zdCBvdGhlciA9IHBvcnRhbHMuZmluZCgoZWwpID0+IGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFR5cGUgPT0gdGhpcy5wb3J0YWxUeXBlICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFRhcmdldCA9PT0gdGhpcy5wb3J0YWxUYXJnZXQgJiYgXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGVsICE9PSB0aGlzLmVsKVxuICAgICAgICAgICAgaWYgKG90aGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBDYXNlIDE6IFRoZSBvdGhlciBwb3J0YWwgYWxyZWFkeSBleGlzdHNcbiAgICAgICAgICAgICAgICByZXNvbHZlKG90aGVyKTtcbiAgICAgICAgICAgICAgICBvdGhlci5lbWl0KCdwYWlyJywgeyBvdGhlcjogdGhpcy5lbCB9KSAvLyBMZXQgdGhlIG90aGVyIGtub3cgdGhhdCB3ZSdyZSByZWFkeVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBDYXNlIDI6IFdlIGNvdWxkbid0IGZpbmQgdGhlIG90aGVyIHBvcnRhbCwgd2FpdCBmb3IgaXQgdG8gc2lnbmFsIHRoYXQgaXQncyByZWFkeVxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncGFpcicsIChldmVudCkgPT4geyBcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShldmVudC5kZXRhaWwub3RoZXIpXG4gICAgICAgICAgICAgICAgfSwgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfSxcblxuICAgIHBhcnNlTm9kZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc3Qgbm9kZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuXG4gICAgICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggZWl0aGVyIFxuICAgICAgICAvLyAtIFwicm9vbV9uYW1lX2NvbG9yXCJcbiAgICAgICAgLy8gLSBcInBvcnRhbF9OX2NvbG9yXCIgXG4gICAgICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gTnVtYmVyZWQgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycy5cbiAgICAgICAgY29uc3QgcGFyYW1zID0gbm9kZU5hbWUubWF0Y2goLyhbQS1aYS16XSopXyhbQS1aYS16MC05XSopXyhbQS1aYS16MC05XSopJC8pXG4gICAgICAgIFxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgNCwgZmlyc3QgbWF0Y2ggaXMgdGhlIHBvcnRhbCB0eXBlLFxuICAgICAgICAvLyBzZWNvbmQgaXMgdGhlIG5hbWUgb3IgbnVtYmVyLCBhbmQgbGFzdCBpcyB0aGUgY29sb3JcbiAgICAgICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInBvcnRhbCBub2RlIG5hbWUgbm90IGZvcm1lZCBjb3JyZWN0bHk6IFwiLCBub2RlTmFtZSlcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDBcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gbnVsbFxuICAgICAgICAgICAgdGhpcy5jb2xvciA9IFwicmVkXCIgLy8gZGVmYXVsdCBzbyB0aGUgcG9ydGFsIGhhcyBhIGNvbG9yIHRvIHVzZVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IFxuICAgICAgICB0aGlzLnNldFBvcnRhbEluZm8ocGFyYW1zWzFdLCBwYXJhbXNbMl0sIHBhcmFtc1szXSlcbiAgICB9LFxuXG4gICAgc2V0UG9ydGFsSW5mbzogZnVuY3Rpb24ocG9ydGFsVHlwZSwgcG9ydGFsVGFyZ2V0LCBjb2xvcikge1xuICAgICAgICBpZiAocG9ydGFsVHlwZSA9PT0gXCJyb29tXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDE7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBhcnNlSW50KHBvcnRhbFRhcmdldClcbiAgICAgICAgfSBlbHNlIGlmIChwb3J0YWxUeXBlID09PSBcInBvcnRhbFwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAyO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwb3J0YWxUYXJnZXRcbiAgICAgICAgfSBlbHNlIGlmIChwb3J0YWxUeXBlID09PSBcIndheXBvaW50XCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDM7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBvcnRhbFRhcmdldFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMDtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gbnVsbFxuICAgICAgICB9IFxuICAgICAgICB0aGlzLmNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKGNvbG9yKVxuICAgIH0sXG5cbiAgICBzZXRSYWRpdXModmFsKSB7XG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhbmltYXRpb25fX3BvcnRhbCcsIHtcbiAgICAgICAgLy8gICBmcm9tOiB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZSxcbiAgICAgICAgICAgIGZyb206IHRoaXMucmFkaXVzLFxuICAgICAgICAgICAgdG86IHZhbCxcbiAgICAgICAgfSlcbiAgICB9LFxuICAgIG9wZW4oKSB7XG4gICAgICAgIHRoaXMuc2V0UmFkaXVzKDEpXG4gICAgfSxcbiAgICBjbG9zZSgpIHtcbiAgICAgICAgdGhpcy5zZXRSYWRpdXMoMC4yKVxuICAgIH0sXG4gICAgaXNDbG9zZWQoKSB7XG4gICAgICAgIC8vIHJldHVybiB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnJhZGl1cy52YWx1ZSA9PT0gMFxuICAgICAgICByZXR1cm4gdGhpcy5yYWRpdXMgPT09IDAuMlxuICAgIH0sXG59KVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvZTE3MDJlYTIxYWZiNGE4Ni5wbmdcIiIsImNvbnN0IGdsc2wgPSBgXG52YXJ5aW5nIHZlYzIgYmFsbHZVdjtcbnZhcnlpbmcgdmVjMyBiYWxsdlBvc2l0aW9uO1xudmFyeWluZyB2ZWMzIGJhbGx2Tm9ybWFsO1xudmFyeWluZyB2ZWMzIGJhbGx2V29ybGRQb3M7XG51bmlmb3JtIGZsb2F0IGJhbGxUaW1lO1xudW5pZm9ybSBmbG9hdCBzZWxlY3RlZDtcblxubWF0NCBiYWxsaW52ZXJzZShtYXQ0IG0pIHtcbiAgZmxvYXRcbiAgICAgIGEwMCA9IG1bMF1bMF0sIGEwMSA9IG1bMF1bMV0sIGEwMiA9IG1bMF1bMl0sIGEwMyA9IG1bMF1bM10sXG4gICAgICBhMTAgPSBtWzFdWzBdLCBhMTEgPSBtWzFdWzFdLCBhMTIgPSBtWzFdWzJdLCBhMTMgPSBtWzFdWzNdLFxuICAgICAgYTIwID0gbVsyXVswXSwgYTIxID0gbVsyXVsxXSwgYTIyID0gbVsyXVsyXSwgYTIzID0gbVsyXVszXSxcbiAgICAgIGEzMCA9IG1bM11bMF0sIGEzMSA9IG1bM11bMV0sIGEzMiA9IG1bM11bMl0sIGEzMyA9IG1bM11bM10sXG5cbiAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMixcblxuICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gIHJldHVybiBtYXQ0KFxuICAgICAgYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5LFxuICAgICAgYTAyICogYjEwIC0gYTAxICogYjExIC0gYTAzICogYjA5LFxuICAgICAgYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzLFxuICAgICAgYTIyICogYjA0IC0gYTIxICogYjA1IC0gYTIzICogYjAzLFxuICAgICAgYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3LFxuICAgICAgYTAwICogYjExIC0gYTAyICogYjA4ICsgYTAzICogYjA3LFxuICAgICAgYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxLFxuICAgICAgYTIwICogYjA1IC0gYTIyICogYjAyICsgYTIzICogYjAxLFxuICAgICAgYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2LFxuICAgICAgYTAxICogYjA4IC0gYTAwICogYjEwIC0gYTAzICogYjA2LFxuICAgICAgYTMwICogYjA0IC0gYTMxICogYjAyICsgYTMzICogYjAwLFxuICAgICAgYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwLFxuICAgICAgYTExICogYjA3IC0gYTEwICogYjA5IC0gYTEyICogYjA2LFxuICAgICAgYTAwICogYjA5IC0gYTAxICogYjA3ICsgYTAyICogYjA2LFxuICAgICAgYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwLFxuICAgICAgYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAvIGRldDtcbn1cblxuXG5tYXQ0IGJhbGx0cmFuc3Bvc2UoaW4gbWF0NCBtKSB7XG4gIHZlYzQgaTAgPSBtWzBdO1xuICB2ZWM0IGkxID0gbVsxXTtcbiAgdmVjNCBpMiA9IG1bMl07XG4gIHZlYzQgaTMgPSBtWzNdO1xuXG4gIHJldHVybiBtYXQ0KFxuICAgIHZlYzQoaTAueCwgaTEueCwgaTIueCwgaTMueCksXG4gICAgdmVjNChpMC55LCBpMS55LCBpMi55LCBpMy55KSxcbiAgICB2ZWM0KGkwLnosIGkxLnosIGkyLnosIGkzLnopLFxuICAgIHZlYzQoaTAudywgaTEudywgaTIudywgaTMudylcbiAgKTtcbn1cblxudm9pZCBtYWluKClcbntcbiAgYmFsbHZVdiA9IHV2O1xuXG4gIGJhbGx2UG9zaXRpb24gPSBwb3NpdGlvbjtcblxuICB2ZWMzIG9mZnNldCA9IHZlYzMoXG4gICAgc2luKHBvc2l0aW9uLnggKiA1MC4wICsgYmFsbFRpbWUpLFxuICAgIHNpbihwb3NpdGlvbi55ICogMTAuMCArIGJhbGxUaW1lICogMi4wKSxcbiAgICBjb3MocG9zaXRpb24ueiAqIDQwLjAgKyBiYWxsVGltZSlcbiAgKSAqIDAuMDAzO1xuXG4gICBiYWxsdlBvc2l0aW9uICo9IDEuMCArIHNlbGVjdGVkICogMC4yO1xuXG4gICBiYWxsdk5vcm1hbCA9IG5vcm1hbGl6ZShiYWxsaW52ZXJzZShiYWxsdHJhbnNwb3NlKG1vZGVsTWF0cml4KSkgKiB2ZWM0KG5vcm1hbGl6ZShub3JtYWwpLCAxLjApKS54eXo7XG4gICBiYWxsdldvcmxkUG9zID0gKG1vZGVsTWF0cml4ICogdmVjNChiYWxsdlBvc2l0aW9uLCAxLjApKS54eXo7XG5cbiAgIHZlYzQgYmFsbHZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoYmFsbHZQb3NpdGlvbiArIG9mZnNldCwgMS4wKTtcblxuICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBiYWxsdlBvc2l0aW9uO1xufVxuYFxuXG5leHBvcnQgZGVmYXVsdCBnbHNsIiwiY29uc3QgZ2xzbCA9IGBcbnVuaWZvcm0gc2FtcGxlcjJEIHBhbm90ZXg7XG51bmlmb3JtIHNhbXBsZXIyRCB0ZXhmeDtcbnVuaWZvcm0gZmxvYXQgYmFsbFRpbWU7XG51bmlmb3JtIGZsb2F0IHNlbGVjdGVkO1xudmFyeWluZyB2ZWMyIGJhbGx2VXY7XG52YXJ5aW5nIHZlYzMgYmFsbHZQb3NpdGlvbjtcbnZhcnlpbmcgdmVjMyBiYWxsdk5vcm1hbDtcbnZhcnlpbmcgdmVjMyBiYWxsdldvcmxkUG9zO1xuXG51bmlmb3JtIGZsb2F0IG9wYWNpdHk7XG5cbnZvaWQgbWFpbiggdm9pZCApIHtcbiAgIHZlYzIgdXYgPSBiYWxsdlV2O1xuICAvL3V2LnkgPSAgMS4wIC0gdXYueTtcblxuICAgdmVjMyBleWUgPSBub3JtYWxpemUoY2FtZXJhUG9zaXRpb24gLSBiYWxsdldvcmxkUG9zKTtcbiAgIGZsb2F0IGZyZXNuZWwgPSBhYnMoZG90KGV5ZSwgYmFsbHZOb3JtYWwpKTtcbiAgIGZsb2F0IHNoaWZ0ID0gcG93KCgxLjAgLSBmcmVzbmVsKSwgNC4wKSAqIDAuMDU7XG5cbiAgdmVjMyBjb2wgPSB2ZWMzKFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1diAtIHNoaWZ0KS5yLFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1dikuZyxcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYgKyBzaGlmdCkuYlxuICApO1xuXG4gICBjb2wgPSBtaXgoY29sICogMC43LCB2ZWMzKDEuMCksIDAuNyAtIGZyZXNuZWwpO1xuXG4gICBjb2wgKz0gc2VsZWN0ZWQgKiAwLjM7XG5cbiAgIGZsb2F0IHQgPSBiYWxsVGltZSAqIDAuNCArIGJhbGx2UG9zaXRpb24ueCArIGJhbGx2UG9zaXRpb24uejtcbiAgIHV2ID0gdmVjMihiYWxsdlV2LnggKyB0ICogMC4yLCBiYWxsdlV2LnkgKyB0KTtcbiAgIHZlYzMgZnggPSB0ZXh0dXJlMkQodGV4ZngsIHV2KS5yZ2IgKiAwLjQ7XG5cbiAgLy92ZWM0IGNvbCA9IHZlYzQoMS4wLCAxLjAsIDAuMCwgMS4wKTtcbiAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgb3BhY2l0eSk7XG4gIC8vZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgMS4wKTtcbn1cbmBcblxuZXhwb3J0IGRlZmF1bHQgZ2xzbCIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiAzNjAgaW1hZ2UgdGhhdCBmaWxscyB0aGUgdXNlcidzIHZpc2lvbiB3aGVuIGluIGEgY2xvc2UgcHJveGltaXR5LlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBHaXZlbiBhIDM2MCBpbWFnZSBhc3NldCB3aXRoIHRoZSBmb2xsb3dpbmcgVVJMIGluIFNwb2tlOlxuICogaHR0cHM6Ly9ndC1hZWwtYXEtYXNzZXRzLmFlbGF0Z3QtaW50ZXJuYWwubmV0L2ZpbGVzLzEyMzQ1YWJjLTY3ODlkZWYuanBnXG4gKlxuICogVGhlIG5hbWUgb2YgdGhlIGBpbW1lcnNpdmUtMzYwLmdsYmAgaW5zdGFuY2UgaW4gdGhlIHNjZW5lIHNob3VsZCBiZTpcbiAqIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fMTIzNDVhYmMtNjc4OWRlZl9qcGdcIiBPUiBcIjEyMzQ1YWJjLTY3ODlkZWZfanBnXCJcbiAqL1xuXG5pbXBvcnQgYmFsbGZ4IGZyb20gJy4uL2Fzc2V0cy9iYWxsZngucG5nJ1xuaW1wb3J0IHBhbm92ZXJ0IGZyb20gJy4uL3NoYWRlcnMvcGFub2JhbGwudmVydCdcbmltcG9ydCBwYW5vZnJhZyBmcm9tICcuLi9zaGFkZXJzL3Bhbm9iYWxsLmZyYWcnXG5cbmNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgYmFsbFRleCA9IG51bGxcbmxvYWRlci5sb2FkKGJhbGxmeCwgKGJhbGwpID0+IHtcbiAgICBiYWxsLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmFsbC5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJhbGwud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYWxsLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmFsbFRleCA9IGJhbGxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaW1tZXJzaXZlLTM2MCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgdXJsOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH0sXG4gIH0sXG4gIGluaXQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdXJsID0gdGhpcy5kYXRhLnVybFxuICAgIGlmICghdXJsIHx8IHVybCA9PSBcIlwiKSB7XG4gICAgICAgIHVybCA9IHRoaXMucGFyc2VTcG9rZU5hbWUoKVxuICAgIH1cbiAgICBcbiAgICBjb25zdCBleHRlbnNpb24gPSB1cmwubWF0Y2goL14uKlxcLiguKikkLylbMV1cblxuICAgIC8vIG1lZGlhLWltYWdlIHdpbGwgc2V0IHVwIHRoZSBzcGhlcmUgZ2VvbWV0cnkgZm9yIHVzXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ21lZGlhLWltYWdlJywge1xuICAgICAgcHJvamVjdGlvbjogJzM2MC1lcXVpcmVjdGFuZ3VsYXInLFxuICAgICAgYWxwaGFNb2RlOiAnb3BhcXVlJyxcbiAgICAgIHNyYzogdXJsLFxuICAgICAgdmVyc2lvbjogMSxcbiAgICAgIGJhdGNoOiBmYWxzZSxcbiAgICAgIGNvbnRlbnRUeXBlOiBgaW1hZ2UvJHtleHRlbnNpb259YCxcbiAgICAgIGFscGhhQ3V0b2ZmOiAwLFxuICAgIH0pXG4gICAgLy8gYnV0IHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhpcyB0byBoYXBwZW5cbiAgICB0aGlzLm1lc2ggPSBhd2FpdCB0aGlzLmdldE1lc2goKVxuXG4gICAgdmFyIGJhbGwgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgbmV3IFRIUkVFLlNwaGVyZUJ1ZmZlckdlb21ldHJ5KDAuMTUsIDMwLCAyMCksXG4gICAgICAgIG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICAgICAgICB1bmlmb3Jtczoge1xuICAgICAgICAgICAgICBwYW5vdGV4OiB7dmFsdWU6IHRoaXMubWVzaC5tYXRlcmlhbC5tYXB9LFxuICAgICAgICAgICAgICB0ZXhmeDoge3ZhbHVlOiBiYWxsVGV4fSxcbiAgICAgICAgICAgICAgc2VsZWN0ZWQ6IHt2YWx1ZTogMH0sXG4gICAgICAgICAgICAgIGJhbGxUaW1lOiB7dmFsdWU6IDB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdmVydGV4U2hhZGVyOiBwYW5vdmVydCxcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyOiBwYW5vZnJhZyxcbiAgICAgICAgICAgIHNpZGU6IFRIUkVFLkJhY2tTaWRlLFxuICAgICAgICAgIH0pXG4gICAgKVxuICAgXG4gICAgYmFsbC5yb3RhdGlvbi5zZXQoTWF0aC5QSSwgMCwgMCk7XG4gICAgYmFsbC5wb3NpdGlvbi5jb3B5KHRoaXMubWVzaC5wb3NpdGlvbik7XG4gICAgYmFsbC51c2VyRGF0YS5mbG9hdFkgPSB0aGlzLm1lc2gucG9zaXRpb24ueSArIDAuNjtcbiAgICBiYWxsLnVzZXJEYXRhLnNlbGVjdGVkID0gMDtcbiAgICBiYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSswLjUpICogMTBcbiAgICB0aGlzLmJhbGwgPSBiYWxsXG4gICAgdGhpcy5lbC5zZXRPYmplY3QzRChcImJhbGxcIiwgYmFsbClcblxuICAgIHRoaXMubWVzaC5nZW9tZXRyeS5zY2FsZSgxMDAsIDEwMCwgMTAwKVxuICAgIHRoaXMubWVzaC5tYXRlcmlhbC5zZXRWYWx1ZXMoe1xuICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICBkZXB0aFRlc3Q6IGZhbHNlLFxuICAgIH0pXG4gICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZVxuXG4gICAgdGhpcy5uZWFyID0gMC44XG4gICAgdGhpcy5mYXIgPSAxLjFcblxuICAgIC8vIFJlbmRlciBPVkVSIHRoZSBzY2VuZSBidXQgVU5ERVIgdGhlIGN1cnNvclxuICAgIHRoaXMubWVzaC5yZW5kZXJPcmRlciA9IEFQUC5SRU5ERVJfT1JERVIuQ1VSU09SIC0gMC4xXG4gIH0sXG4gIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgaWYgKHRoaXMubWVzaCAmJiBiYWxsVGV4KSB7XG4gICAgICB0aGlzLmJhbGwucG9zaXRpb24ueSA9IHRoaXMuYmFsbC51c2VyRGF0YS5mbG9hdFkgKyBNYXRoLmNvcygodGltZSArIHRoaXMuYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0KS8xMDAwICogMyApICogMC4wMjtcbiAgICAgIHRoaXMuYmFsbC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG5cbiAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC51bmlmb3Jtcy50ZXhmeC52YWx1ZSA9IGJhbGxUZXhcbiAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC51bmlmb3Jtcy5iYWxsVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIHRoaXMuYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAvLyBMaW5lYXJseSBtYXAgY2FtZXJhIGRpc3RhbmNlIHRvIG1hdGVyaWFsIG9wYWNpdHlcbiAgICAgIHRoaXMubWVzaC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkU2VsZilcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IGRpc3RhbmNlID0gd29ybGRTZWxmLmRpc3RhbmNlVG8od29ybGRDYW1lcmEpXG4gICAgICBjb25zdCBvcGFjaXR5ID0gMSAtIChkaXN0YW5jZSAtIHRoaXMubmVhcikgLyAodGhpcy5mYXIgLSB0aGlzLm5lYXIpXG4gICAgICBpZiAob3BhY2l0eSA8IDApIHtcbiAgICAgICAgICAvLyBmYXIgYXdheVxuICAgICAgICAgIHRoaXMubWVzaC52aXNpYmxlID0gZmFsc2VcbiAgICAgICAgICB0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eSA9IDFcbiAgICAgICAgICB0aGlzLmJhbGwubWF0ZXJpYWwub3BhY2l0eSA9IDFcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gb3BhY2l0eSA+IDEgPyAxIDogb3BhY2l0eVxuICAgICAgICAgICAgdGhpcy5tZXNoLnZpc2libGUgPSB0cnVlXG4gICAgICAgICAgICB0aGlzLmJhbGwubWF0ZXJpYWwub3BhY2l0eSA9IHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5XG4gICAgICAgIH1cbiAgICB9XG4gIH0sXG4gIHBhcnNlU3Bva2VOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgLy8gQWNjZXB0ZWQgbmFtZXM6IFwibGFiZWxfX2ltYWdlLWhhc2hfZXh0XCIgT1IgXCJpbWFnZS1oYXNoX2V4dFwiXG4gICAgY29uc3Qgc3Bva2VOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICBjb25zdCBtYXRjaGVzID0gc3Bva2VOYW1lLm1hdGNoKC8oPzouKl9fKT8oLiopXyguKikvKVxuICAgIGlmICghbWF0Y2hlcyB8fCBtYXRjaGVzLmxlbmd0aCA8IDMpIHsgcmV0dXJuIFwiXCIgfVxuICAgIGNvbnN0IFssIGhhc2gsIGV4dGVuc2lvbl0gID0gbWF0Y2hlc1xuICAgIGNvbnN0IHVybCA9IGBodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9kYXRhLyR7aGFzaH0uJHtleHRlbnNpb259YFxuICAgIHJldHVybiB1cmxcbiAgfSxcbiAgZ2V0TWVzaDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuICAgICAgaWYgKG1lc2gpIHJlc29sdmUobWVzaClcbiAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgJ2ltYWdlLWxvYWRlZCcsXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiaW1tZXJzaXZlLTM2MCBwYW5vIGxvYWRlZDogXCIgKyB0aGlzLmRhdGEudXJsKVxuICAgICAgICAgIHJlc29sdmUodGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoKVxuICAgICAgICB9LFxuICAgICAgICB7IG9uY2U6IHRydWUgfVxuICAgICAgKVxuICAgIH0pXG4gIH0sXG59KVxuIiwiLy8gUGFyYWxsYXggT2NjbHVzaW9uIHNoYWRlcnMgZnJvbVxuLy8gICAgaHR0cDovL3N1bmFuZGJsYWNrY2F0LmNvbS90aXBGdWxsVmlldy5waHA/dG9waWNpZD0yOFxuLy8gTm8gdGFuZ2VudC1zcGFjZSB0cmFuc2Zvcm1zIGxvZ2ljIGJhc2VkIG9uXG4vLyAgIGh0dHA6Ly9tbWlra2Vsc2VuM2QuYmxvZ3Nwb3Quc2svMjAxMi8wMi9wYXJhbGxheHBvYy1tYXBwaW5nLWFuZC1uby10YW5nZW50Lmh0bWxcblxuLy8gSWRlbnRpdHkgZnVuY3Rpb24gZm9yIGdsc2wtbGl0ZXJhbCBoaWdobGlnaHRpbmcgaW4gVlMgQ29kZVxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgUGFyYWxsYXhTaGFkZXIgPSB7XG4gIC8vIE9yZGVyZWQgZnJvbSBmYXN0ZXN0IHRvIGJlc3QgcXVhbGl0eS5cbiAgbW9kZXM6IHtcbiAgICBub25lOiAnTk9fUEFSQUxMQVgnLFxuICAgIGJhc2ljOiAnVVNFX0JBU0lDX1BBUkFMTEFYJyxcbiAgICBzdGVlcDogJ1VTRV9TVEVFUF9QQVJBTExBWCcsXG4gICAgb2NjbHVzaW9uOiAnVVNFX09DTFVTSU9OX1BBUkFMTEFYJywgLy8gYS5rLmEuIFBPTVxuICAgIHJlbGllZjogJ1VTRV9SRUxJRUZfUEFSQUxMQVgnLFxuICB9LFxuXG4gIHVuaWZvcm1zOiB7XG4gICAgYnVtcE1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIG1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWF4TGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gIH0sXG5cbiAgdmVydGV4U2hhZGVyOiBnbHNsYFxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICB2VXYgPSB1djtcbiAgICAgIHZlYzQgbXZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoIHBvc2l0aW9uLCAxLjAgKTtcbiAgICAgIHZWaWV3UG9zaXRpb24gPSAtbXZQb3NpdGlvbi54eXo7XG4gICAgICB2Tm9ybWFsID0gbm9ybWFsaXplKCBub3JtYWxNYXRyaXggKiBub3JtYWwgKTtcbiAgICAgIFxuICAgICAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uTWF0cml4ICogbXZQb3NpdGlvbjtcbiAgICB9XG4gIGAsXG5cbiAgZnJhZ21lbnRTaGFkZXI6IGdsc2xgXG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgYnVtcE1hcDtcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBtYXA7XG5cbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4U2NhbGU7XG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheE1pbkxheWVycztcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWF4TGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgZmFkZTsgLy8gQ1VTVE9NXG5cbiAgICB2YXJ5aW5nIHZlYzIgdlV2O1xuICAgIHZhcnlpbmcgdmVjMyB2Vmlld1Bvc2l0aW9uO1xuICAgIHZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG4gICAgI2lmZGVmIFVTRV9CQVNJQ19QQVJBTExBWFxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIGZsb2F0IGluaXRpYWxIZWlnaHQgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgdlV2KS5yO1xuXG4gICAgICAvLyBObyBPZmZzZXQgTGltaXR0aW5nOiBtZXNzeSwgZmxvYXRpbmcgb3V0cHV0IGF0IGdyYXppbmcgYW5nbGVzLlxuICAgICAgLy9cInZlYzIgdGV4Q29vcmRPZmZzZXQgPSBwYXJhbGxheFNjYWxlICogVi54eSAvIFYueiAqIGluaXRpYWxIZWlnaHQ7XCIsXG5cbiAgICAgIC8vIE9mZnNldCBMaW1pdGluZ1xuICAgICAgdmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5ICogaW5pdGlhbEhlaWdodDtcbiAgICAgIHJldHVybiB2VXYgLSB0ZXhDb29yZE9mZnNldDtcbiAgICB9XG5cbiAgICAjZWxzZVxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIC8vIERldGVybWluZSBudW1iZXIgb2YgbGF5ZXJzIGZyb20gYW5nbGUgYmV0d2VlbiBWIGFuZCBOXG4gICAgICBmbG9hdCBudW1MYXllcnMgPSBtaXgocGFyYWxsYXhNYXhMYXllcnMsIHBhcmFsbGF4TWluTGF5ZXJzLCBhYnMoZG90KHZlYzMoMC4wLCAwLjAsIDEuMCksIFYpKSk7XG5cbiAgICAgIGZsb2F0IGxheWVySGVpZ2h0ID0gMS4wIC8gbnVtTGF5ZXJzO1xuICAgICAgZmxvYXQgY3VycmVudExheWVySGVpZ2h0ID0gMC4wO1xuICAgICAgLy8gU2hpZnQgb2YgdGV4dHVyZSBjb29yZGluYXRlcyBmb3IgZWFjaCBpdGVyYXRpb25cbiAgICAgIHZlYzIgZHRleCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56IC8gbnVtTGF5ZXJzO1xuXG4gICAgICB2ZWMyIGN1cnJlbnRUZXh0dXJlQ29vcmRzID0gdlV2O1xuXG4gICAgICBmbG9hdCBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcblxuICAgICAgLy8gd2hpbGUgKCBoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCApXG4gICAgICAvLyBJbmZpbml0ZSBsb29wcyBhcmUgbm90IHdlbGwgc3VwcG9ydGVkLiBEbyBhIFwibGFyZ2VcIiBmaW5pdGVcbiAgICAgIC8vIGxvb3AsIGJ1dCBub3QgdG9vIGxhcmdlLCBhcyBpdCBzbG93cyBkb3duIHNvbWUgY29tcGlsZXJzLlxuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAzMDsgaSArPSAxKSB7XG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA8PSBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gbGF5ZXJIZWlnaHQ7XG4gICAgICAgIC8vIFNoaWZ0IHRleHR1cmUgY29vcmRpbmF0ZXMgYWxvbmcgdmVjdG9yIFZcbiAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZHRleDtcbiAgICAgICAgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG4gICAgICB9XG5cbiAgICAgICNpZmRlZiBVU0VfU1RFRVBfUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIGN1cnJlbnRUZXh0dXJlQ29vcmRzO1xuXG4gICAgICAjZWxpZiBkZWZpbmVkKFVTRV9SRUxJRUZfUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgZGVsdGFUZXhDb29yZCA9IGR0ZXggLyAyLjA7XG4gICAgICBmbG9hdCBkZWx0YUhlaWdodCA9IGxheWVySGVpZ2h0IC8gMi4wO1xuXG4gICAgICAvLyBSZXR1cm4gdG8gdGhlIG1pZCBwb2ludCBvZiBwcmV2aW91cyBsYXllclxuICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgIGN1cnJlbnRMYXllckhlaWdodCAtPSBkZWx0YUhlaWdodDtcblxuICAgICAgLy8gQmluYXJ5IHNlYXJjaCB0byBpbmNyZWFzZSBwcmVjaXNpb24gb2YgU3RlZXAgUGFyYWxsYXggTWFwcGluZ1xuICAgICAgY29uc3QgaW50IG51bVNlYXJjaGVzID0gNTtcbiAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgbnVtU2VhcmNoZXM7IGkgKz0gMSkge1xuICAgICAgICBkZWx0YVRleENvb3JkIC89IDIuMDtcbiAgICAgICAgZGVsdGFIZWlnaHQgLz0gMi4wO1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgICAgLy8gU2hpZnQgYWxvbmcgb3IgYWdhaW5zdCB2ZWN0b3IgVlxuICAgICAgICBpZiAoaGVpZ2h0RnJvbVRleHR1cmUgPiBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICAvLyBCZWxvdyB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gYWJvdmUgdGhlIHN1cmZhY2VcblxuICAgICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzICs9IGRlbHRhVGV4Q29vcmQ7XG4gICAgICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX09DTFVTSU9OX1BBUkFMTEFYKVxuXG4gICAgICB2ZWMyIHByZXZUQ29vcmRzID0gY3VycmVudFRleHR1cmVDb29yZHMgKyBkdGV4O1xuXG4gICAgICAvLyBIZWlnaHRzIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgbmV4dEggPSBoZWlnaHRGcm9tVGV4dHVyZSAtIGN1cnJlbnRMYXllckhlaWdodDtcbiAgICAgIGZsb2F0IHByZXZIID0gdGV4dHVyZTJEKGJ1bXBNYXAsIHByZXZUQ29vcmRzKS5yIC0gY3VycmVudExheWVySGVpZ2h0ICsgbGF5ZXJIZWlnaHQ7XG5cbiAgICAgIC8vIFByb3BvcnRpb25zIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgd2VpZ2h0ID0gbmV4dEggLyAobmV4dEggLSBwcmV2SCk7XG5cbiAgICAgIC8vIEludGVycG9sYXRpb24gb2YgdGV4dHVyZSBjb29yZGluYXRlc1xuICAgICAgcmV0dXJuIHByZXZUQ29vcmRzICogd2VpZ2h0ICsgY3VycmVudFRleHR1cmVDb29yZHMgKiAoMS4wIC0gd2VpZ2h0KTtcblxuICAgICAgI2Vsc2UgLy8gTk9fUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIHZVdjtcblxuICAgICAgI2VuZGlmXG4gICAgfVxuICAgICNlbmRpZlxuXG4gICAgdmVjMiBwZXJ0dXJiVXYodmVjMyBzdXJmUG9zaXRpb24sIHZlYzMgc3VyZk5vcm1hbCwgdmVjMyB2aWV3UG9zaXRpb24pIHtcbiAgICAgIHZlYzIgdGV4RHggPSBkRmR4KHZVdik7XG4gICAgICB2ZWMyIHRleER5ID0gZEZkeSh2VXYpO1xuXG4gICAgICB2ZWMzIHZTaWdtYVggPSBkRmR4KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZTaWdtYVkgPSBkRmR5KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZSMSA9IGNyb3NzKHZTaWdtYVksIHN1cmZOb3JtYWwpO1xuICAgICAgdmVjMyB2UjIgPSBjcm9zcyhzdXJmTm9ybWFsLCB2U2lnbWFYKTtcbiAgICAgIGZsb2F0IGZEZXQgPSBkb3QodlNpZ21hWCwgdlIxKTtcblxuICAgICAgdmVjMiB2UHJvalZzY3IgPSAoMS4wIC8gZkRldCkgKiB2ZWMyKGRvdCh2UjEsIHZpZXdQb3NpdGlvbiksIGRvdCh2UjIsIHZpZXdQb3NpdGlvbikpO1xuICAgICAgdmVjMyB2UHJvalZ0ZXg7XG4gICAgICB2UHJvalZ0ZXgueHkgPSB0ZXhEeCAqIHZQcm9qVnNjci54ICsgdGV4RHkgKiB2UHJvalZzY3IueTtcbiAgICAgIHZQcm9qVnRleC56ID0gZG90KHN1cmZOb3JtYWwsIHZpZXdQb3NpdGlvbik7XG5cbiAgICAgIHJldHVybiBwYXJhbGxheE1hcCh2UHJvalZ0ZXgpO1xuICAgIH1cblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZlYzIgbWFwVXYgPSBwZXJ0dXJiVXYoLXZWaWV3UG9zaXRpb24sIG5vcm1hbGl6ZSh2Tm9ybWFsKSwgbm9ybWFsaXplKHZWaWV3UG9zaXRpb24pKTtcbiAgICAgIFxuICAgICAgLy8gQ1VTVE9NIFNUQVJUXG4gICAgICB2ZWM0IHRleGVsID0gdGV4dHVyZTJEKG1hcCwgbWFwVXYpO1xuICAgICAgdmVjMyBjb2xvciA9IG1peCh0ZXhlbC54eXosIHZlYzMoMCksIGZhZGUpO1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2xvciwgMS4wKTtcbiAgICAgIC8vIENVU1RPTSBFTkRcbiAgICB9XG5cbiAgYCxcbn1cblxuZXhwb3J0IHsgUGFyYWxsYXhTaGFkZXIgfVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIENyZWF0ZSB0aGUgaWxsdXNpb24gb2YgZGVwdGggaW4gYSBjb2xvciBpbWFnZSBmcm9tIGEgZGVwdGggbWFwXG4gKlxuICogVXNhZ2VcbiAqID09PT09XG4gKiBDcmVhdGUgYSBwbGFuZSBpbiBCbGVuZGVyIGFuZCBnaXZlIGl0IGEgbWF0ZXJpYWwgKGp1c3QgdGhlIGRlZmF1bHQgUHJpbmNpcGxlZCBCU0RGKS5cbiAqIEFzc2lnbiBjb2xvciBpbWFnZSB0byBcImNvbG9yXCIgY2hhbm5lbCBhbmQgZGVwdGggbWFwIHRvIFwiZW1pc3NpdmVcIiBjaGFubmVsLlxuICogWW91IG1heSB3YW50IHRvIHNldCBlbWlzc2l2ZSBzdHJlbmd0aCB0byB6ZXJvIHNvIHRoZSBwcmV2aWV3IGxvb2tzIGJldHRlci5cbiAqIEFkZCB0aGUgXCJwYXJhbGxheFwiIGNvbXBvbmVudCBmcm9tIHRoZSBIdWJzIGV4dGVuc2lvbiwgY29uZmlndXJlLCBhbmQgZXhwb3J0IGFzIC5nbGJcbiAqL1xuXG5pbXBvcnQgeyBQYXJhbGxheFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzJ1xuXG5jb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBmb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwYXJhbGxheCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgc3RyZW5ndGg6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuNSB9LFxuICAgIGN1dG9mZlRyYW5zaXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA4IH0sXG4gICAgY3V0b2ZmQW5nbGU6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA0IH0sXG4gIH0sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgY29uc3QgeyBtYXA6IGNvbG9yTWFwLCBlbWlzc2l2ZU1hcDogZGVwdGhNYXAgfSA9IG1lc2gubWF0ZXJpYWxcbiAgICBjb2xvck1hcC53cmFwUyA9IGNvbG9yTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZ1xuICAgIGRlcHRoTWFwLndyYXBTID0gZGVwdGhNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgY29uc3QgeyB2ZXJ0ZXhTaGFkZXIsIGZyYWdtZW50U2hhZGVyIH0gPSBQYXJhbGxheFNoYWRlclxuICAgIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgdmVydGV4U2hhZGVyLFxuICAgICAgZnJhZ21lbnRTaGFkZXIsXG4gICAgICBkZWZpbmVzOiB7IFVTRV9PQ0xVU0lPTl9QQVJBTExBWDogdHJ1ZSB9LFxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgbWFwOiB7IHZhbHVlOiBjb2xvck1hcCB9LFxuICAgICAgICBidW1wTWFwOiB7IHZhbHVlOiBkZXB0aE1hcCB9LFxuICAgICAgICBwYXJhbGxheFNjYWxlOiB7IHZhbHVlOiAtMSAqIHRoaXMuZGF0YS5zdHJlbmd0aCB9LFxuICAgICAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogMjAgfSxcbiAgICAgICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IDMwIH0sXG4gICAgICAgIGZhZGU6IHsgdmFsdWU6IDAgfSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICBtZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuICB9LFxuICB0aWNrKCkge1xuICAgIGlmICh0aGlzLmVsLnNjZW5lRWwuY2FtZXJhKSB7XG4gICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24odmVjKVxuICAgICAgdGhpcy5lbC5vYmplY3QzRC53b3JsZFRvTG9jYWwodmVjKVxuICAgICAgY29uc3QgYW5nbGUgPSB2ZWMuYW5nbGVUbyhmb3J3YXJkKVxuICAgICAgY29uc3QgZmFkZSA9IG1hcExpbmVhckNsYW1wZWQoXG4gICAgICAgIGFuZ2xlLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgLSB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgdGhpcy5kYXRhLmN1dG9mZkFuZ2xlICsgdGhpcy5kYXRhLmN1dG9mZlRyYW5zaXRpb24sXG4gICAgICAgIDAsIC8vIEluIHZpZXcgem9uZSwgbm8gZmFkZVxuICAgICAgICAxIC8vIE91dHNpZGUgdmlldyB6b25lLCBmdWxsIGZhZGVcbiAgICAgIClcbiAgICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuZmFkZS52YWx1ZSA9IGZhZGVcbiAgICB9XG4gIH0sXG59KVxuXG5mdW5jdGlvbiBjbGFtcCh2YWx1ZSwgbWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gYjEgKyAoKHggLSBhMSkgKiAoYjIgLSBiMSkpIC8gKGEyIC0gYTEpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhckNsYW1wZWQoeCwgYTEsIGEyLCBiMSwgYjIpIHtcbiAgcmV0dXJuIGNsYW1wKG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMiksIGIxLCBiMilcbn1cbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBjcmVhdGUgYSBIVE1MIG9iamVjdCBieSByZW5kZXJpbmcgYSBzY3JpcHQgdGhhdCBjcmVhdGVzIGFuZCBtYW5hZ2VzIGl0XG4gKlxuICovXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSBcIi4uL3V0aWxzL3NjZW5lLWdyYXBoXCI7XG5pbXBvcnQgKiBhcyBodG1sQ29tcG9uZW50cyBmcm9tIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG5cbi8vIHZhciBodG1sQ29tcG9uZW50cztcbi8vIHZhciBzY3JpcHRQcm9taXNlO1xuLy8gaWYgKHdpbmRvdy5fX3Rlc3RpbmdWdWVBcHBzKSB7XG4vLyAgICAgc2NyaXB0UHJvbWlzZSA9IGltcG9ydCh3aW5kb3cuX190ZXN0aW5nVnVlQXBwcykgICAgXG4vLyB9IGVsc2Uge1xuLy8gICAgIHNjcmlwdFByb21pc2UgPSBpbXBvcnQoXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIikgXG4vLyB9XG4vLyAvLyBzY3JpcHRQcm9taXNlID0gc2NyaXB0UHJvbWlzZS50aGVuKG1vZHVsZSA9PiB7XG4vLyAvLyAgICAgcmV0dXJuIG1vZHVsZVxuLy8gLy8gfSk7XG4vKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuIEFGUkFNRS5yZWdpc3RlclN5c3RlbSgnaHRtbC1zY3JpcHQnLCB7ICBcbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLnN5c3RlbVRpY2sgPSBodG1sQ29tcG9uZW50c1tcInN5c3RlbVRpY2tcIl07XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsID0gaHRtbENvbXBvbmVudHNbXCJpbml0aWFsaXplRXRoZXJlYWxcIl1cbiAgICAgICAgaWYgKCF0aGlzLnN5c3RlbVRpY2sgfHwgIXRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZXJyb3IgaW4gaHRtbC1zY3JpcHQgc3lzdGVtOiBodG1sQ29tcG9uZW50cyBoYXMgbm8gc3lzdGVtVGljayBhbmQvb3IgaW5pdGlhbGl6ZUV0aGVyZWFsIG1ldGhvZHNcIilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsKClcbiAgICAgICAgfVxuICAgIH0sXG4gIFxuICAgIHRpY2sodCwgZHQpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW1UaWNrKHQsIGR0KVxuICAgIH0sXG4gIH0pXG4gIFxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2h0bWwtc2NyaXB0Jywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgbmFtZTogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgd2lkdGg6IHsgdHlwZTogXCJudW1iZXJcIiwgZGVmYXVsdDogLTF9LFxuICAgICAgICBoZWlnaHQ6IHsgdHlwZTogXCJudW1iZXJcIiwgZGVmYXVsdDogLTF9LFxuICAgICAgICBwYXJhbWV0ZXIxOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXIyOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXIzOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXI0OiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGw7XG4gICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcblxuICAgICAgICB0aGlzLnNjcmlwdERhdGEgPSB7XG4gICAgICAgICAgICB3aWR0aDogdGhpcy5kYXRhLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmRhdGEuaGVpZ2h0LFxuICAgICAgICAgICAgcGFyYW1ldGVyMTogdGhpcy5kYXRhLnBhcmFtZXRlcjEsXG4gICAgICAgICAgICBwYXJhbWV0ZXIyOiB0aGlzLmRhdGEucGFyYW1ldGVyMixcbiAgICAgICAgICAgIHBhcmFtZXRlcjM6IHRoaXMuZGF0YS5wYXJhbWV0ZXIzLFxuICAgICAgICAgICAgcGFyYW1ldGVyNDogdGhpcy5kYXRhLnBhcmFtZXRlcjRcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5mdWxsTmFtZSB8fCB0aGlzLmZ1bGxOYW1lLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHRoaXMuZnVsbE5hbWVcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSA9PT0gXCJcIiB8fCB0aGlzLmRhdGEubmFtZSA9PT0gdGhpcy5mdWxsTmFtZSkgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICAvLyB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gdGhpcy5mdWxsTmFtZTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95U2NyaXB0KClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpO1xuICAgIH0sXG5cbiAgICBjcmVhdGVTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gZWFjaCB0aW1lIHdlIGxvYWQgYSBzY3JpcHQgY29tcG9uZW50IHdlIHdpbGwgcG9zc2libHkgY3JlYXRlXG4gICAgICAgIC8vIGEgbmV3IG5ldHdvcmtlZCBjb21wb25lbnQuICBUaGlzIGlzIGZpbmUsIHNpbmNlIHRoZSBuZXR3b3JrZWQgSWQgXG4gICAgICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBmdWxsIG5hbWUgcGFzc2VkIGFzIGEgcGFyYW1ldGVyLCBvciBhc3NpZ25lZCB0byB0aGVcbiAgICAgICAgLy8gY29tcG9uZW50IGluIFNwb2tlLiAgSXQgZG9lcyBtZWFuIHRoYXQgaWYgd2UgaGF2ZVxuICAgICAgICAvLyBtdWx0aXBsZSBvYmplY3RzIGluIHRoZSBzY2VuZSB3aGljaCBoYXZlIHRoZSBzYW1lIG5hbWUsIHRoZXkgd2lsbFxuICAgICAgICAvLyBiZSBpbiBzeW5jLiAgSXQgYWxzbyBtZWFucyB0aGF0IGlmIHlvdSB3YW50IHRvIGRyb3AgYSBjb21wb25lbnQgb25cbiAgICAgICAgLy8gdGhlIHNjZW5lIHZpYSBhIC5nbGIsIGl0IG11c3QgaGF2ZSBhIHZhbGlkIG5hbWUgcGFyYW1ldGVyIGluc2lkZSBpdC5cbiAgICAgICAgLy8gQSAuZ2xiIGluIHNwb2tlIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBzcG9rZSBuYW1lIGlmIHlvdSB1c2Ugb25lIHdpdGhvdXRcbiAgICAgICAgLy8gYSBuYW1lIGluc2lkZSBpdC5cbiAgICAgICAgbGV0IGxvYWRlciA9ICgpID0+IHtcblxuICAgICAgICAgICAgdGhpcy5sb2FkU2NyaXB0KCkudGhlbiggKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGdldCB0aGUgcGFyZW50IG5ldHdvcmtlZCBlbnRpdHksIHdoZW4gaXQncyBmaW5pc2hlZCBpbml0aWFsaXppbmcuICBcbiAgICAgICAgICAgICAgICAgICAgLy8gV2hlbiBjcmVhdGluZyB0aGlzIGFzIHBhcnQgb2YgYSBHTFRGIGxvYWQsIHRoZSBcbiAgICAgICAgICAgICAgICAgICAgLy8gcGFyZW50IGEgZmV3IHN0ZXBzIHVwIHdpbGwgYmUgbmV0d29ya2VkLiAgV2UnbGwgb25seSBkbyB0aGlzXG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBIVE1MIHNjcmlwdCB3YW50cyB0byBiZSBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBudWxsXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gYmluZCBjYWxsYmFja3NcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LnNldE5ldHdvcmtNZXRob2RzKHRoaXMudGFrZU93bmVyc2hpcCwgdGhpcy5zZXRTaGFyZWREYXRhKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHNldCB1cCB0aGUgbG9jYWwgY29udGVudCBhbmQgaG9vayBpdCB0byB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICBjb25zdCBzY3JpcHRFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IHNjcmlwdEVsXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRPYmplY3QzRChcIndlYmxheWVyM2RcIiwgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRClcblxuICAgICAgICAgICAgICAgIC8vIGxldHMgZmlndXJlIG91dCB0aGUgc2NhbGUsIGJ1dCBzY2FsaW5nIHRvIGZpbGwgdGhlIGEgMXgxbSBzcXVhcmUsIHRoYXQgaGFzIGFsc29cbiAgICAgICAgICAgICAgICAvLyBwb3RlbnRpYWxseSBiZWVuIHNjYWxlZCBieSB0aGUgcGFyZW50cyBwYXJlbnQgbm9kZS4gSWYgd2Ugc2NhbGUgdGhlIGVudGl0eSBpbiBzcG9rZSxcbiAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIHdoZXJlIHRoZSBzY2FsZSBpcyBzZXQuICBJZiB3ZSBkcm9wIGEgbm9kZSBpbiBhbmQgc2NhbGUgaXQsIHRoZSBzY2FsZSBpcyBhbHNvXG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZXJlLlxuICAgICAgICAgICAgICAgIC8vIFdlIHVzZWQgdG8gaGF2ZSBhIGZpeGVkIHNpemUgcGFzc2VkIGJhY2sgZnJvbSB0aGUgZW50aXR5LCBidXQgdGhhdCdzIHRvbyByZXN0cmljdGl2ZTpcbiAgICAgICAgICAgICAgICAvLyBjb25zdCB3aWR0aCA9IHRoaXMuc2NyaXB0LndpZHRoXG4gICAgICAgICAgICAgICAgLy8gY29uc3QgaGVpZ2h0ID0gdGhpcy5zY3JpcHQuaGVpZ2h0XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBuZWVkIHRvIGZpbmQgZW52aXJvbm1lbnQtc2NlbmUsIGdvIGRvd24gdHdvIGxldmVscyB0byB0aGUgZ3JvdXAgYWJvdmUgXG4gICAgICAgICAgICAgICAgLy8gdGhlIG5vZGVzIGluIHRoZSBzY2VuZS4gIFRoZW4gYWNjdW11bGF0ZSB0aGUgc2NhbGVzIHVwIGZyb20gdGhpcyBub2RlIHRvXG4gICAgICAgICAgICAgICAgLy8gdGhhdCBub2RlLiAgVGhpcyB3aWxsIGFjY291bnQgZm9yIGdyb3VwcywgYW5kIG5lc3RpbmcuXG5cbiAgICAgICAgICAgICAgICB2YXIgd2lkdGggPSAxLCBoZWlnaHQgPSAxO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1pbWFnZVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhdHRhY2hlZCB0byBhbiBpbWFnZSBpbiBzcG9rZSwgc28gdGhlIGltYWdlIG1lc2ggaXMgc2l6ZSAxIGFuZCBpcyBzY2FsZWQgZGlyZWN0bHlcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBzY2FsZU0ueSAqIHNjYWxlSS55XG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS54ID0gMVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnogPSAxXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGl0J3MgZW1iZWRkZWQgaW4gYSBzaW1wbGUgZ2x0ZiBtb2RlbDsgIG90aGVyIG1vZGVscyBtYXkgbm90IHdvcmtcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXNzdW1lIGl0J3MgYXQgdGhlIHRvcCBsZXZlbCBtZXNoLCBhbmQgdGhhdCB0aGUgbW9kZWwgaXRzZWxmIGlzIHNjYWxlZFxuICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdXG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYm94ID0gbWVzaC5nZW9tZXRyeS5ib3VuZGluZ0JveDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gKGJveC5tYXgueCAtIGJveC5taW4ueCkgKiBtZXNoLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IChib3gubWF4LnkgLSBib3gubWluLnkpICogbWVzaC5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaFNjYWxlID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBtZXNoU2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gbWVzaFNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IHRoZSByb290IGdsdGYgc2NhbGUuXG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJlbnQyID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5vYmplY3QzRFxuICAgICAgICAgICAgICAgICAgICB3aWR0aCAqPSBwYXJlbnQyLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ICo9IHBhcmVudDIuc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAod2lkdGggPiAwICYmIGhlaWdodCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qge3dpZHRoOiB3c2l6ZSwgaGVpZ2h0OiBoc2l6ZX0gPSB0aGlzLnNjcmlwdC5nZXRTaXplKClcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZShcInNjYWxlXCIsIHsgeDogc2NhbGUsIHk6IHNjYWxlLCB6OiBzY2FsZX0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHRoZXJlIHdpbGwgYmUgb25lIGVsZW1lbnQgYWxyZWFkeSwgdGhlIGN1YmUgd2UgY3JlYXRlZCBpbiBibGVuZGVyXG4gICAgICAgICAgICAgICAgLy8gYW5kIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50IHRvLCBzbyByZW1vdmUgaXQgaWYgaXQgaXMgdGhlcmUuXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5jaGlsZHJlbi5wb3AoKVxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgIGMudmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSBcImlzU3RhdGljXCIgaXMgY29ycmVjdDsgIGNhbid0IGJlIHN0YXRpYyBpZiBlaXRoZXIgaW50ZXJhY3RpdmUgb3IgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzU3RhdGljICYmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlIHx8IHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5pc1N0YXRpYyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBhZGQgaW4gb3VyIGNvbnRhaW5lclxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYXBwZW5kQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiAgd2UgYXJlIGdvaW5nIHRvIGhhdmUgdG8gbWFrZSBzdXJlIHRoaXMgd29ya3MgaWYgXG4gICAgICAgICAgICAgICAgLy8gdGhlIHNjcmlwdCBpcyBPTiBhbiBpbnRlcmFjdGFibGUgKGxpa2UgYW4gaW1hZ2UpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBtYWtlIHRoZSBodG1sIG9iamVjdCBjbGlja2FibGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywnJylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGZvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBvYmplY3QgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xpY2tlZCA9IHRoaXMuY2xpY2tlZC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0RyYWdnYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXJlbid0IGdvaW5nIHRvIHJlYWxseSBkZWFsIHdpdGggdGhpcyB0aWxsIHdlIGhhdmUgYSB1c2UgY2FzZSwgYnV0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjYW4gc2V0IGl0IHVwIGZvciBub3dcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzSG9sZGFibGU6IHRydWUsICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBob2xkYWJsZUJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tZG93bicsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnU3RhcnQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi11cCcsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnRW5kKGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvL3RoaXMucmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlSID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gbm8gaW50ZXJhY3Rpdml0eSwgcGxlYXNlXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJpcy1yZW1vdGUtaG92ZXItdGFyZ2V0XCIpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBTSE9VTEQgd29yayBidXQgbWFrZSBzdXJlIGl0IHdvcmtzIGlmIHRoZSBlbCB3ZSBhcmUgb25cbiAgICAgICAgICAgICAgICAvLyBpcyBuZXR3b3JrZWQsIHN1Y2ggYXMgd2hlbiBhdHRhY2hlZCB0byBhbiBpbWFnZVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuaGFzQXR0cmlidXRlKFwibmV0d29ya2VkXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwibmV0d29ya2VkXCIpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gZmluZHMgYW4gZXhpc3RpbmcgY29weSBvZiB0aGUgTmV0d29ya2VkIEVudGl0eSAoaWYgd2UgYXJlIG5vdCB0aGVcbiAgICAgICAgICAgICAgICAgICAgLy8gZmlyc3QgY2xpZW50IGluIHRoZSByb29tIGl0IHdpbGwgZXhpc3QgaW4gb3RoZXIgY2xpZW50cyBhbmQgYmUgY3JlYXRlZCBieSBOQUYpXG4gICAgICAgICAgICAgICAgICAgIC8vIG9yIGNyZWF0ZSBhbiBlbnRpdHkgaWYgd2UgYXJlIGZpcnN0LlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gZnVuY3Rpb24gKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGVyc2lzdGVudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV0SWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIGJlIHBhcnQgb2YgYSBOZXR3b3JrZWQgR0xURiBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvciBwaW5uZWQgYW5kIGxvYWRlZCB3aGVuIHdlIGVudGVyIHRoZSByb29tLiAgVXNlIHRoZSBuZXR3b3JrZWQgcGFyZW50c1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBwbHVzIGEgZGlzYW1iaWd1YXRpbmcgYml0IG9mIHRleHQgdG8gY3JlYXRlIGEgdW5pcXVlIElkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gTkFGLnV0aWxzLmdldE5ldHdvcmtJZChuZXR3b3JrZWRFbCkgKyBcIi1odG1sLXNjcmlwdFwiO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgbmVlZCB0byBjcmVhdGUgYW4gZW50aXR5LCB1c2UgdGhlIHNhbWUgcGVyc2lzdGVuY2UgYXMgb3VyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29yayBlbnRpdHkgKHRydWUgaWYgcGlubmVkLCBmYWxzZSBpZiBub3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudCA9IGVudGl0eS5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLnBlcnNpc3RlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgb25seSBoYXBwZW5zIGlmIHRoaXMgY29tcG9uZW50IGlzIG9uIGEgc2NlbmUgZmlsZSwgc2luY2UgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZWxlbWVudHMgb24gdGhlIHNjZW5lIGFyZW4ndCBuZXR3b3JrZWQuICBTbyBsZXQncyBhc3N1bWUgZWFjaCBlbnRpdHkgaW4gdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2NlbmUgd2lsbCBoYXZlIGEgdW5pcXVlIG5hbWUuICBBZGRpbmcgYSBiaXQgb2YgdGV4dCBzbyB3ZSBjYW4gZmluZCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluIHRoZSBET00gd2hlbiBkZWJ1Z2dpbmcuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSB0aGlzLmZ1bGxOYW1lLnJlcGxhY2VBbGwoXCJfXCIsXCItXCIpICsgXCItaHRtbC1zY3JpcHRcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgbmV0d29ya2VkIGVudGl0eSB3ZSBjcmVhdGUgZm9yIHRoaXMgY29tcG9uZW50IGFscmVhZHkgZXhpc3RzLiBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgY3JlYXRlIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAtIE5PVEU6IGl0IGlzIGNyZWF0ZWQgb24gdGhlIHNjZW5lLCBub3QgYXMgYSBjaGlsZCBvZiB0aGlzIGVudGl0eSwgYmVjYXVzZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBOQUYgY3JlYXRlcyByZW1vdGUgZW50aXRpZXMgaW4gdGhlIHNjZW5lLlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChOQUYuZW50aXRpZXMuaGFzRW50aXR5KG5ldElkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IE5BRi5lbnRpdGllcy5nZXRFbnRpdHkobmV0SWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWV0aG9kIHRvIHJldHJpZXZlIHRoZSBzY3JpcHQgZGF0YSBvbiB0aGlzIGVudGl0eVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIFwibmV0d29ya2VkXCIgY29tcG9uZW50IHNob3VsZCBoYXZlIHBlcnNpc3RlbnQ9dHJ1ZSwgdGhlIHRlbXBsYXRlIGFuZCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgc2V0LCBvd25lciBzZXQgdG8gXCJzY2VuZVwiIChzbyB0aGF0IGl0IGRvZXNuJ3QgdXBkYXRlIHRoZSByZXN0IG9mXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHdvcmxkIHdpdGggaXQncyBpbml0aWFsIGRhdGEsIGFuZCBzaG91bGQgTk9UIHNldCBjcmVhdG9yICh0aGUgc3lzdGVtIHdpbGwgZG8gdGhhdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuc2V0QXR0cmlidXRlKCduZXR3b3JrZWQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlOiBcIiNzY3JpcHQtZGF0YS1tZWRpYVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50OiBwZXJzaXN0ZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvd25lcjogXCJzY2VuZVwiLCAgLy8gc28gdGhhdCBvdXIgaW5pdGlhbCB2YWx1ZSBkb2Vzbid0IG92ZXJ3cml0ZSBvdGhlcnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya0lkOiBuZXRJZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hcHBlbmRDaGlsZChlbnRpdHkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzYXZlIGEgcG9pbnRlciB0byB0aGUgbmV0d29ya2VkIGVudGl0eSBhbmQgdGhlbiB3YWl0IGZvciBpdCB0byBiZSBmdWxseVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW5pdGlhbGl6ZWQgYmVmb3JlIGdldHRpbmcgYSBwb2ludGVyIHRvIHRoZSBhY3R1YWwgbmV0d29ya2VkIGNvbXBvbmVudCBpbiBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMubmV0RW50aXR5KS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlU3luYyA9IG5ldHdvcmtlZEVsLmNvbXBvbmVudHNbXCJzY3JpcHQtZGF0YVwiXVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyB0aGUgZmlyc3QgbmV0d29ya2VkIGVudGl0eSwgaXQncyBzaGFyZWREYXRhIHdpbGwgZGVmYXVsdCB0byB0aGUgZW1wdHkgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RyaW5nLCBhbmQgd2Ugc2hvdWxkIGluaXRpYWxpemUgaXQgd2l0aCB0aGUgaW5pdGlhbCBkYXRhIGZyb20gdGhlIHNjcmlwdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5zaGFyZWREYXRhID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBuZXR3b3JrZWQgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wibmV0d29ya2VkXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIChuZXR3b3JrZWQuZGF0YS5jcmVhdG9yID09IE5BRi5jbGllbnRJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgdGhpcy5zdGF0ZVN5bmMuaW5pdFNoYXJlZERhdGEodGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5lbCkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eShuZXR3b3JrZWRFbClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IHRoaXMuc2V0dXBOZXR3b3JrZWQuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWV0aG9kIGhhbmRsZXMgdGhlIGRpZmZlcmVudCBzdGFydHVwIGNhc2VzOlxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZSwgTkFGIHdpbGwgYmUgY29ubmVjdGVkIGFuZCB3ZSBjYW4gXG4gICAgICAgICAgICAgICAgICAgIC8vICAgaW1tZWRpYXRlbHkgaW5pdGlhbGl6ZVxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIGlzIGluIHRoZSByb29tIHNjZW5lIG9yIHBpbm5lZCwgaXQgd2lsbCBsaWtlbHkgYmUgY3JlYXRlZFxuICAgICAgICAgICAgICAgICAgICAvLyAgIGJlZm9yZSBOQUYgaXMgc3RhcnRlZCBhbmQgY29ubmVjdGVkLCBzbyB3ZSB3YWl0IGZvciBhbiBldmVudCB0aGF0IGlzXG4gICAgICAgICAgICAgICAgICAgIC8vICAgZmlyZWQgd2hlbiBIdWJzIGhhcyBzdGFydGVkIE5BRlxuICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmNvbm5lY3Rpb24gJiYgTkFGLmNvbm5lY3Rpb24uaXNDb25uZWN0ZWQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2RpZENvbm5lY3RUb05ldHdvcmtlZFNjZW5lJywgdGhpcy5zZXR1cE5ldHdvcmtlZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgLy8gaWYgYXR0YWNoZWQgdG8gYSBub2RlIHdpdGggYSBtZWRpYS1sb2FkZXIgY29tcG9uZW50LCB0aGlzIG1lYW5zIHdlIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50XG4gICAgICAgIC8vIHRvIGEgbWVkaWEgb2JqZWN0IGluIFNwb2tlLiAgV2Ugc2hvdWxkIHdhaXQgdGlsbCB0aGUgb2JqZWN0IGlzIGZ1bGx5IGxvYWRlZC4gIFxuICAgICAgICAvLyBPdGhlcndpc2UsIGl0IHdhcyBhdHRhY2hlZCB0byBzb21ldGhpbmcgaW5zaWRlIGEgR0xURiAocHJvYmFibHkgaW4gYmxlbmRlcilcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwbGF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQucGxheSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wYXVzZSgpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaGFuZGxlIFwiaW50ZXJhY3RcIiBldmVudHMgZm9yIGNsaWNrYWJsZSBlbnRpdGllc1xuICAgIGNsaWNrZWQ6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICB0aGlzLnNjcmlwdC5jbGlja2VkKGV2dCkgXG4gICAgfSxcbiAgXG4gICAgLy8gbWV0aG9kcyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIHRoZSBodG1sIG9iamVjdCBzbyB0aGV5IGNhbiB1cGRhdGUgbmV0d29ya2VkIGRhdGFcbiAgICB0YWtlT3duZXJzaGlwOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMudGFrZU93bmVyc2hpcCgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIHN1cmUsIGdvIGFoZWFkIGFuZCBjaGFuZ2UgaXQgZm9yIG5vd1xuICAgICAgICB9XG4gICAgfSxcbiAgICBcbiAgICBzZXRTaGFyZWREYXRhOiBmdW5jdGlvbihkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnNldFNoYXJlZERhdGEoZGF0YU9iamVjdClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyB0aGlzIGlzIGNhbGxlZCBmcm9tIGJlbG93LCB0byBnZXQgdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICBnZXRTaGFyZWREYXRhOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICAgICAgLy8gc2hvdWxkbid0IGhhcHBlblxuICAgICAgICBjb25zb2xlLndhcm4oXCJzY3JpcHQtZGF0YSBjb21wb25lbnQgY2FsbGVkIHBhcmVudCBlbGVtZW50IGJ1dCB0aGVyZSBpcyBubyBzY3JpcHQgeWV0P1wiKVxuICAgICAgICByZXR1cm4gXCJ7fVwiXG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAvLyBtb3JlIG9yIGxlc3MgY29waWVkIGZyb20gXCJob3ZlcmFibGUtdmlzdWFscy5qc1wiIGluIGh1YnNcbiAgICAgICAgICAgIGNvbnN0IHRvZ2dsaW5nID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXNbXCJodWJzLXN5c3RlbXNcIl0uY3Vyc29yVG9nZ2xpbmdTeXN0ZW07XG4gICAgICAgICAgICB2YXIgcGFzc3RocnVJbnRlcmFjdG9yID0gW11cblxuICAgICAgICAgICAgbGV0IGludGVyYWN0b3JPbmUsIGludGVyYWN0b3JUd287XG4gICAgICAgICAgICBjb25zdCBpbnRlcmFjdGlvbiA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLmludGVyYWN0aW9uO1xuICAgICAgICAgICAgaWYgKCFpbnRlcmFjdGlvbi5yZWFkeSkgcmV0dXJuOyAvL0RPTUNvbnRlbnRSZWFkeSB3b3JrYXJvdW5kXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGxldCBob3ZlckVsID0gdGhpcy5zaW1wbGVDb250YWluZXJcbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRIYW5kLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgIXRvZ2dsaW5nLmxlZnRUb2dnbGVkT2ZmXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rvck9uZSkge1xuICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yT25lLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgbGV0IGRpciA9IHRoaXMuc2NyaXB0LndlYkxheWVyM0QuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkubmVnYXRlKClcbiAgICAgICAgICAgICAgICBwb3MuYWRkU2NhbGVkVmVjdG9yKGRpciwgLTAuMSlcbiAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TC5zZXQocG9zLCBkaXIpXG5cbiAgICAgICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaCh0aGlzLmhvdmVyUmF5TClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgICAhdG9nZ2xpbmcucmlnaHRUb2dnbGVkT2ZmXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5ob3ZlcmVkID09PSBob3ZlckVsICYmICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3RvclR3bykge1xuICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yVHdvLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgbGV0IGRpciA9IHRoaXMuc2NyaXB0LndlYkxheWVyM0QuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkubmVnYXRlKClcbiAgICAgICAgICAgICAgICBwb3MuYWRkU2NhbGVkVmVjdG9yKGRpciwgLTAuMSlcbiAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5Ui5zZXQocG9zLCBkaXIpXG4gICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheVIpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QuaW50ZXJhY3Rpb25SYXlzID0gcGFzc3RocnVJbnRlcmFjdG9yXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIGhhdmVuJ3QgZmluaXNoZWQgc2V0dGluZyB1cCB0aGUgbmV0d29ya2VkIGVudGl0eSBkb24ndCBkbyBhbnl0aGluZy5cbiAgICAgICAgICAgIGlmICghdGhpcy5uZXRFbnRpdHkgfHwgIXRoaXMuc3RhdGVTeW5jKSB7IHJldHVybiB9XG5cbiAgICAgICAgICAgIC8vIGlmIHRoZSBzdGF0ZSBoYXMgY2hhbmdlZCBpbiB0aGUgbmV0d29ya2VkIGRhdGEsIHVwZGF0ZSBvdXIgaHRtbCBvYmplY3RcbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCA9IGZhbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQudXBkYXRlU2hhcmVkRGF0YSh0aGlzLnN0YXRlU3luYy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zY3JpcHQudGljayh0aW1lKVxuICAgIH0sXG4gIFxuICAgIC8vIFRPRE86ICBzaG91bGQgb25seSBiZSBjYWxsZWQgaWYgdGhlcmUgaXMgbm8gcGFyYW1ldGVyIHNwZWNpZnlpbmcgdGhlXG4gICAgLy8gaHRtbCBzY3JpcHQgbmFtZS5cbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmZ1bGxOYW1lID09PSBcIlwiKSB7XG5cbiAgICAgICAgICAgIC8vIFRPRE86ICBzd2l0Y2ggdGhpcyB0byBmaW5kIGVudmlyb25tZW50LXJvb3QgYW5kIGdvIGRvd24gdG8gXG4gICAgICAgICAgICAvLyB0aGUgbm9kZSBhdCB0aGUgcm9vbSBvZiBzY2VuZSAob25lIGFib3ZlIHRoZSB2YXJpb3VzIG5vZGVzKS4gIFxuICAgICAgICAgICAgLy8gdGhlbiBnbyB1cCBmcm9tIGhlcmUgdGlsbCB3ZSBnZXQgdG8gYSBub2RlIHRoYXQgaGFzIHRoYXQgbm9kZVxuICAgICAgICAgICAgLy8gYXMgaXQncyBwYXJlbnRcbiAgICAgICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgICAgICB9IFxuXG4gICAgICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggXG4gICAgICAgIC8vICBcImNvbXBvbmVudE5hbWVcIlxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuICBUaGlzIHdpbGwgZmV0Y2ggdGhlIGNvbXBvbmVudCBmcm9tIHRoZSByZXNvdXJjZVxuICAgICAgICAvLyBjb21wb25lbnROYW1lXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMuZnVsbE5hbWUubWF0Y2goL18oW0EtWmEtejAtOV0qKSQvKVxuXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiAzLCBmaXJzdCBtYXRjaCBpcyB0aGUgZGlyLFxuICAgICAgICAvLyBzZWNvbmQgaXMgdGhlIGNvbXBvbmVudE5hbWUgbmFtZSBvciBudW1iZXJcbiAgICAgICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcImh0bWwtc2NyaXB0IGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLmZ1bGxOYW1lKVxuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gbnVsbFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gcGFyYW1zWzFdXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgbG9hZFNjcmlwdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBpZiAoc2NyaXB0UHJvbWlzZSkge1xuICAgICAgICAvLyAgICAgdHJ5IHtcbiAgICAgICAgLy8gICAgICAgICBodG1sQ29tcG9uZW50cyA9IGF3YWl0IHNjcmlwdFByb21pc2U7XG4gICAgICAgIC8vICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgLy8gICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAvLyAgICAgICAgIHJldHVyblxuICAgICAgICAvLyAgICAgfVxuICAgICAgICAvLyAgICAgc2NyaXB0UHJvbWlzZSA9IG51bGxcbiAgICAgICAgLy8gfVxuICAgICAgICB2YXIgaW5pdFNjcmlwdCA9IGh0bWxDb21wb25lbnRzW3RoaXMuY29tcG9uZW50TmFtZV1cbiAgICAgICAgaWYgKCFpbml0U2NyaXB0KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBkb2Vzbid0IGhhdmUgc2NyaXB0IGZvciBcIiArIHRoaXMuY29tcG9uZW50TmFtZSk7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcmlwdCA9IGluaXRTY3JpcHQodGhpcy5zY3JpcHREYXRhKVxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpe1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudXBkYXRlKHRydWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCInaHRtbC1zY3JpcHQnIGNvbXBvbmVudCBmYWlsZWQgdG8gaW5pdGlhbGl6ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBkZXN0cm95U2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVsLnJlbW92ZUNoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IG51bGxcblxuICAgICAgICB0aGlzLnNjcmlwdC5kZXN0cm95KClcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgfVxufSlcblxuLy9cbi8vIENvbXBvbmVudCBmb3Igb3VyIG5ldHdvcmtlZCBzdGF0ZS4gIFRoaXMgY29tcG9uZW50IGRvZXMgbm90aGluZyBleGNlcHQgYWxsIHVzIHRvIFxuLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4vLyBzb21ldGhpbmcgaGFzIGNoYW5nZWQsIGluc3RlYWQgb2YgaGF2aW5nIHRoZSBjb21wb25lbnQgYWJvdmUgcG9sbCBlYWNoIGZyYW1lLlxuLy9cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzY3JpcHQtZGF0YScsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2NyaXB0ZGF0YToge3R5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwie31cIn0sXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB0aGlzLmVsLmdldFNoYXJlZERhdGEoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgdGhpcy5zaGFyZWREYXRhKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgZW5jb2RlIGluaXRpYWwgc2NyaXB0IGRhdGEgb2JqZWN0OiBcIiwgZSwgdGhpcy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9IGZhbHNlO1xuICAgIH0sXG5cbiAgICB1cGRhdGUoKSB7XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9ICEodGhpcy5zaGFyZWREYXRhID09PSB0aGlzLmRhdGEuc2NyaXB0ZGF0YSk7XG4gICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodGhpcy5zY3JpcHREYXRhKSlcblxuICAgICAgICAgICAgICAgIC8vIGRvIHRoZXNlIGFmdGVyIHRoZSBKU09OIHBhcnNlIHRvIG1ha2Ugc3VyZSBpdCBoYXMgc3VjY2VlZGVkXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gdGhpcy5kYXRhLnNjcmlwdGRhdGE7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VkID0gdHJ1ZVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNvdWxkbid0IHBhcnNlIEpTT04gcmVjZWl2ZWQgaW4gc2NyaXB0LXN5bmM6IFwiLCBlKVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IFwiXCJcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIGl0IGlzIGxpa2VseSB0aGF0IGFwcGx5UGVyc2lzdGVudFN5bmMgb25seSBuZWVkcyB0byBiZSBjYWxsZWQgZm9yIHBlcnNpc3RlbnRcbiAgICAvLyBuZXR3b3JrZWQgZW50aXRpZXMsIHNvIHdlIF9wcm9iYWJseV8gZG9uJ3QgbmVlZCB0byBkbyB0aGlzLiAgQnV0IGlmIHRoZXJlIGlzIG5vXG4gICAgLy8gcGVyc2lzdGVudCBkYXRhIHNhdmVkIGZyb20gdGhlIG5ldHdvcmsgZm9yIHRoaXMgZW50aXR5LCB0aGlzIGNvbW1hbmQgZG9lcyBub3RoaW5nLlxuICAgIHBsYXkoKSB7XG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIHJlYWxseSBuZWVkZWQsIGJ1dCBjYW4ndCBodXJ0XG4gICAgICAgICAgICBpZiAoQVBQLnV0aWxzKSB7IC8vIHRlbXBvcmFyeSB0aWxsIHdlIHNoaXAgbmV3IGNsaWVudFxuICAgICAgICAgICAgICAgIEFQUC51dGlscy5hcHBseVBlcnNpc3RlbnRTeW5jKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5uZXR3b3JrSWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHRha2VPd25lcnNoaXAoKSB7XG4gICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9LFxuXG4gICAgLy8gaW5pdFNoYXJlZERhdGEoZGF0YU9iamVjdCkge1xuICAgIC8vICAgICB0cnkge1xuICAgIC8vICAgICAgICAgdmFyIGh0bWxTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgLy8gICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBodG1sU3RyaW5nXG4gICAgLy8gICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgLy8gICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIC8vICAgICB9IGNhdGNoIChlKSB7XG4gICAgLy8gICAgICAgICBjb25zb2xlLmVycm9yKFwiY2FuJ3Qgc3RyaW5naWZ5IHRoZSBvYmplY3QgcGFzc2VkIHRvIHNjcmlwdC1zeW5jXCIpXG4gICAgLy8gICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAvLyAgICAgfVxuICAgIC8vIH0sXG5cbiAgICAvLyBUaGUga2V5IHBhcnQgaW4gdGhlc2UgbWV0aG9kcyAod2hpY2ggYXJlIGNhbGxlZCBmcm9tIHRoZSBjb21wb25lbnQgYWJvdmUpIGlzIHRvXG4gICAgLy8gY2hlY2sgaWYgd2UgYXJlIGFsbG93ZWQgdG8gY2hhbmdlIHRoZSBuZXR3b3JrZWQgb2JqZWN0LiAgSWYgd2Ugb3duIGl0IChpc01pbmUoKSBpcyB0cnVlKVxuICAgIC8vIHdlIGNhbiBjaGFuZ2UgaXQuICBJZiB3ZSBkb24ndCBvd24gaW4sIHdlIGNhbiB0cnkgdG8gYmVjb21lIHRoZSBvd25lciB3aXRoXG4gICAgLy8gdGFrZU93bmVyc2hpcCgpLiBJZiB0aGlzIHN1Y2NlZWRzLCB3ZSBjYW4gc2V0IHRoZSBkYXRhLiAgXG4gICAgLy9cbiAgICAvLyBOT1RFOiB0YWtlT3duZXJzaGlwIEFUVEVNUFRTIHRvIGJlY29tZSB0aGUgb3duZXIsIGJ5IGFzc3VtaW5nIGl0IGNhbiBiZWNvbWUgdGhlXG4gICAgLy8gb3duZXIgYW5kIG5vdGlmeWluZyB0aGUgbmV0d29ya2VkIGNvcGllcy4gIElmIHR3byBvciBtb3JlIGVudGl0aWVzIHRyeSB0byBiZWNvbWVcbiAgICAvLyBvd25lciwgIG9ubHkgb25lICh0aGUgbGFzdCBvbmUgdG8gdHJ5KSBiZWNvbWVzIHRoZSBvd25lci4gIEFueSBzdGF0ZSB1cGRhdGVzIGRvbmVcbiAgICAvLyBieSB0aGUgXCJmYWlsZWQgYXR0ZW1wdGVkIG93bmVyc1wiIHdpbGwgbm90IGJlIGRpc3RyaWJ1dGVkIHRvIHRoZSBvdGhlciBjbGllbnRzLFxuICAgIC8vIGFuZCB3aWxsIGJlIG92ZXJ3cml0dGVuIChldmVudHVhbGx5KSBieSB1cGRhdGVzIGZyb20gdGhlIG90aGVyIGNsaWVudHMuICAgQnkgbm90XG4gICAgLy8gYXR0ZW1wdGluZyB0byBndWFyYW50ZWUgb3duZXJzaGlwLCB0aGlzIGNhbGwgaXMgZmFzdCBhbmQgc3luY2hyb25vdXMuICBBbnkgXG4gICAgLy8gbWV0aG9kcyBmb3IgZ3VhcmFudGVlaW5nIG93bmVyc2hpcCBjaGFuZ2Ugd291bGQgdGFrZSBhIG5vbi10cml2aWFsIGFtb3VudCBvZiB0aW1lXG4gICAgLy8gYmVjYXVzZSBvZiBuZXR3b3JrIGxhdGVuY2llcy5cblxuICAgIHNldFNoYXJlZERhdGEoZGF0YU9iamVjdCkge1xuICAgICAgICBpZiAoIU5BRi51dGlscy5pc01pbmUodGhpcy5lbCkgJiYgIU5BRi51dGlscy50YWtlT3duZXJzaGlwKHRoaXMuZWwpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHZhciBodG1sU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gaHRtbFN0cmluZ1xuICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gZGF0YU9iamVjdFxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgaHRtbFN0cmluZyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY2FuJ3Qgc3RyaW5naWZ5IHRoZSBvYmplY3QgcGFzc2VkIHRvIHNjcmlwdC1zeW5jXCIpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG4vLyBBZGQgb3VyIHRlbXBsYXRlIGZvciBvdXIgbmV0d29ya2VkIG9iamVjdCB0byB0aGUgYS1mcmFtZSBhc3NldHMgb2JqZWN0LFxuLy8gYW5kIGEgc2NoZW1hIHRvIHRoZSBOQUYuc2NoZW1hcy4gIEJvdGggbXVzdCBiZSB0aGVyZSB0byBoYXZlIGN1c3RvbSBjb21wb25lbnRzIHdvcmtcblxuY29uc3QgYXNzZXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImEtYXNzZXRzXCIpO1xuXG5hc3NldHMuaW5zZXJ0QWRqYWNlbnRIVE1MKFxuICAgICdiZWZvcmVlbmQnLFxuICAgIGBcbiAgICA8dGVtcGxhdGUgaWQ9XCJzY3JpcHQtZGF0YS1tZWRpYVwiPlxuICAgICAgPGEtZW50aXR5XG4gICAgICAgIHNjcmlwdC1kYXRhXG4gICAgICA+PC9hLWVudGl0eT5cbiAgICA8L3RlbXBsYXRlPlxuICBgXG4gIClcblxuY29uc3QgdmVjdG9yUmVxdWlyZXNVcGRhdGUgPSBlcHNpbG9uID0+IHtcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0bGV0IHByZXYgPSBudWxsO1xuXHRcdFx0cmV0dXJuIGN1cnIgPT4ge1xuXHRcdFx0XHRpZiAocHJldiA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdHByZXYgPSBuZXcgVEhSRUUuVmVjdG9yMyhjdXJyLngsIGN1cnIueSwgY3Vyci56KTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmICghTkFGLnV0aWxzLmFsbW9zdEVxdWFsVmVjMyhwcmV2LCBjdXJyLCBlcHNpbG9uKSkge1xuXHRcdFx0XHRcdHByZXYuY29weShjdXJyKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9O1xuXHRcdH07XG5cdH07XG5cbk5BRi5zY2hlbWFzLmFkZCh7XG4gIFx0dGVtcGxhdGU6IFwiI3NjcmlwdC1kYXRhLW1lZGlhXCIsXG4gICAgY29tcG9uZW50czogW1xuICAgIC8vIHtcbiAgICAvLyAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgLy8gICAgIHByb3BlcnR5OiBcInJvdGF0aW9uXCIsXG4gICAgLy8gICAgIHJlcXVpcmVzTmV0d29ya1VwZGF0ZTogdmVjdG9yUmVxdWlyZXNVcGRhdGUoMC4wMDEpXG4gICAgLy8gfSxcbiAgICAvLyB7XG4gICAgLy8gICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgIC8vICAgICBwcm9wZXJ0eTogXCJzY2FsZVwiLFxuICAgIC8vICAgICByZXF1aXJlc05ldHdvcmtVcGRhdGU6IHZlY3RvclJlcXVpcmVzVXBkYXRlKDAuMDAxKVxuICAgIC8vIH0sXG4gICAge1xuICAgICAgXHRjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAgIFx0cHJvcGVydHk6IFwic2NyaXB0ZGF0YVwiXG4gICAgfV0sXG4gICAgICBub25BdXRob3JpemVkQ29tcG9uZW50czogW1xuICAgICAge1xuICAgICAgICAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgICAgICAgICBwcm9wZXJ0eTogXCJzY3JpcHRkYXRhXCJcbiAgICAgIH1cbiAgICBdLFxuXG4gIH0pO1xuXG4iLCIvKipcbiAqIGNvbnRyb2wgYSB2aWRlbyBmcm9tIGEgY29tcG9uZW50IHlvdSBzdGFuZCBvbi4gIEltcGxlbWVudHMgYSByYWRpdXMgZnJvbSB0aGUgY2VudGVyIG9mIFxuICogdGhlIG9iamVjdCBpdCdzIGF0dGFjaGVkIHRvLCBpbiBtZXRlcnNcbiAqL1xuXG5pbXBvcnQgeyBFbnRpdHksIENvbXBvbmVudCB9IGZyb20gJ2FmcmFtZSdcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tICcuLi91dGlscy9zY2VuZS1ncmFwaCdcbmltcG9ydCAnLi9wcm94aW1pdHktZXZlbnRzLmpzJ1xuXG5pbnRlcmZhY2UgQU9iamVjdDNEIGV4dGVuZHMgVEhSRUUuT2JqZWN0M0Qge1xuICAgIGVsOiBFbnRpdHlcbn1cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCd2aWRlby1jb250cm9sLXBhZCcsIHtcbiAgICBtZWRpYVZpZGVvOiB7fSBhcyBDb21wb25lbnQsXG4gICAgXG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHRhcmdldDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJcIiB9LCAgLy8gaWYgbm90aGluZyBwYXNzZWQsIGp1c3QgY3JlYXRlIHNvbWUgbm9pc2VcbiAgICAgICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH1cbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLnRhcmdldC5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgbXVzdCBoYXZlICd0YXJnZXQnIHNldFwiKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyB3YWl0IHVudGlsIHRoZSBzY2VuZSBsb2FkcyB0byBmaW5pc2guICBXZSB3YW50IHRvIG1ha2Ugc3VyZSBldmVyeXRoaW5nXG4gICAgICAgIC8vIGlzIGluaXRpYWxpemVkXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoKSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplKClcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IHYgPSB0aGlzLmVsLnNjZW5lRWw/Lm9iamVjdDNELmdldE9iamVjdEJ5TmFtZSh0aGlzLmRhdGEudGFyZ2V0KSBhcyBBT2JqZWN0M0RcbiAgICAgICAgaWYgKHYgPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCB0YXJnZXQgJ1wiICsgdGhpcy5kYXRhLnRhcmdldCArIFwiJyBkb2VzIG5vdCBleGlzdFwiKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSB8fCB2LmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSApIHtcbiAgICAgICAgICAgIGlmICh2LmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICBsZXQgZm4gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBWaWRlb1BhZCh2KVxuICAgICAgICAgICAgICAgICAgICB2LmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsIGZuKVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdi5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIGZuKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwVmlkZW9QYWQodilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIHRhcmdldCAnXCIgKyB0aGlzLmRhdGEudGFyZ2V0ICsgXCInIGlzIG5vdCBhIHZpZGVvIGVsZW1lbnRcIilcbiAgICAgICAgfVxuXG4gICAgfSxcblxuICAgIHNldHVwVmlkZW9QYWQ6IGZ1bmN0aW9uICh2aWRlbzogQU9iamVjdDNEKSB7XG4gICAgICAgIHRoaXMubWVkaWFWaWRlbyA9IHZpZGVvLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXVxuICAgICAgICBpZiAodGhpcy5tZWRpYVZpZGVvID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgdGFyZ2V0ICdcIiArIHRoaXMuZGF0YS50YXJnZXQgKyBcIicgaXMgbm90IGEgdmlkZW8gZWxlbWVudFwiKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gLy9AdHMtaWdub3JlXG4gICAgICAgIC8vIGlmICghdGhpcy5tZWRpYVZpZGVvLnZpZGVvLnBhdXNlZCkge1xuICAgICAgICAvLyAgICAgLy9AdHMtaWdub3JlXG4gICAgICAgIC8vICAgICB0aGlzLm1lZGlhVmlkZW8udG9nZ2xlUGxheWluZygpXG4gICAgICAgIC8vIH1cblxuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiB0aGlzLmRhdGEucmFkaXVzLCBZb2Zmc2V0OiAxLjYgfSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMuZW50ZXJSZWdpb24oKSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHlsZWF2ZScsICgpID0+IHRoaXMubGVhdmVSZWdpb24oKSlcbiAgICB9LFxuXG4gICAgZW50ZXJSZWdpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMubWVkaWFWaWRlby5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBsZWF2ZVJlZ2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXRoaXMubWVkaWFWaWRlby5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgfVxuICAgIH0sXG59KVxuIiwiaW1wb3J0ICcuLi9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcG9ydGFsLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcGFyYWxsYXguanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvc2hhZGVyLnRzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy92aWRlby1jb250cm9sLXBhZCdcblxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCAnaW1tZXJzaXZlLTM2MCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywgJ3BvcnRhbCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnc2hhZGVyJywgJ3NoYWRlcicpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncGFyYWxsYXgnLCAncGFyYWxsYXgnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2h0bWwtc2NyaXB0JywgJ2h0bWwtc2NyaXB0JylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCAncmVnaW9uLWhpZGVyJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCd2aWRlby1jb250cm9sLXBhZCcsICd2aWRlby1jb250cm9sLXBhZCcpXG5cbi8vIGRvIGEgc2ltcGxlIG1vbmtleSBwYXRjaCB0byBzZWUgaWYgaXQgd29ya3NcblxuLy8gdmFyIG15aXNNaW5lT3JMb2NhbCA9IGZ1bmN0aW9uICh0aGF0KSB7XG4vLyAgICAgcmV0dXJuICF0aGF0LmVsLmNvbXBvbmVudHMubmV0d29ya2VkIHx8ICh0aGF0Lm5ldHdvcmtlZEVsICYmIE5BRi51dGlscy5pc01pbmUodGhhdC5uZXR3b3JrZWRFbCkpO1xuLy8gIH1cblxuLy8gIHZhciB2aWRlb0NvbXAgPSBBRlJBTUUuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4vLyAgdmlkZW9Db21wLkNvbXBvbmVudC5wcm90b3R5cGUuaXNNaW5lT3JMb2NhbCA9IG15aXNNaW5lT3JMb2NhbDtcblxuLy8gYWRkIHRoZSByZWdpb24taGlkZXIgdG8gdGhlIHNjZW5lXG4vLyBjb25zdCBzY2VuZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJhLXNjZW5lXCIpO1xuLy8gc2NlbmUuc2V0QXR0cmlidXRlKFwicmVnaW9uLWhpZGVyXCIsIHtzaXplOiAxMDB9KVxuXG5sZXQgaG9tZVBhZ2VEZXNjID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2NsYXNzXj1cIkhvbWVQYWdlX19hcHAtZGVzY3JpcHRpb25cIl0nKVxuaWYgKGhvbWVQYWdlRGVzYykge1xuICAgIGhvbWVQYWdlRGVzYy5pbm5lckhUTUwgPSBcIlJlYWxpdHkgTWVkaWEgSW1tZXJzaXZlIEV4cGVyaWVuY2U8YnI+PGJyPkFmdGVyIHNpZ25pbmcgaW4sIHZpc2l0IDxhIGhyZWY9J2h0dHBzOi8vcmVhbGl0eW1lZGlhLmRpZ2l0YWwnPnJlYWxpdHltZWRpYS5kaWdpdGFsPC9hPiB0byBnZXQgc3RhcnRlZFwiXG59XG4iXSwibmFtZXMiOlsid29ybGRDYW1lcmEiLCJ3b3JsZFNlbGYiLCJkZWZhdWx0SG9va3MiLCJnbHNsIiwidW5pZm9ybXMiLCJsb2FkZXIiLCJub2lzZVRleCIsInNtYWxsTm9pc2UiLCJ3YXJwVGV4Iiwic25vaXNlIiwiTWF0ZXJpYWxNb2RpZmllciIsInBhbm92ZXJ0IiwicGFub2ZyYWciXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFO0FBQ3BDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDbEQsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFF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LEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUU7UUFDcEQsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUU7UUFDOUIsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUU7UUFDbEMsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxVQUFVLEVBQUU7UUFDMUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFnQyxDQUFDLENBQUksRUFBRTtRQUM1RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRTtRQUNwQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNwRCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUN2RCxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxL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RWhCLGNBQWMsRUFBRTtRQUNaLFFBQVEsRUFBRSxzQkFBc0IsR0FBR0QsTUFBSSxDQUFBOzs7U0FHdEM7UUFDRCxTQUFTLEVBQUVBLE1BQUksQ0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztTQW1CZDtRQUNMLFVBQVUsRUFBRSxhQUFhO0tBQ3hCO0lBQ0QsSUFBSSxFQUFFLFVBQVMsUUFBMkM7UUFDdEQsSUFBSSxHQUFHLEdBQUksUUFBMEQsQ0FBQTtRQUVyRSxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFBO1FBQ3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUE7O1FBRXZELFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQTtRQUM3RCxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFBO1FBQzVDLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUE7UUFDL0MsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQTtLQUMvRDtJQUNELGNBQWMsRUFBRSxVQUFTLElBQVksRUFBRSxRQUEyQztRQUM5RSxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLEdBQUcsS0FBSyxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFBO1FBQzdFLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUE7UUFDNUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLFdBQVcsQ0FBQTtLQUNsRDtDQUNKOztBQ3BGRCxhQUFlOztBQ0tmLE1BQU1BLE1BQUksR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFBO0FBRXZCLE1BQU1DLFVBQVEsR0FBRztJQUNiLFFBQVEsRUFBRSxFQUFDLEtBQUssRUFBRSxDQUFDLEVBQUM7SUFDcEIsT0FBTyxFQUFFLEVBQUMsS0FBSyxFQUFFLElBQUksRUFBQztJQUN0QixTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRTtJQUM1QyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRTtJQUM1QyxRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFO0NBQ3pCLENBQUE7QUFNRCxNQUFNQyxRQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUE7QUFDeEMsSUFBSUcsU0FBc0IsQ0FBQTtBQUMxQkgsUUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJO0lBQ3JCLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQztJQUNyQyxJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUM7SUFDckMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQztJQUNsQ0csU0FBTyxHQUFHLElBQUksQ0FBQTtBQUNsQixDQUFDLENBQUMsQ0FBQTtBQUVGLElBQUksVUFBVSxHQUFvQjtJQUM5QixRQUFRLEVBQUVKLFVBQVE7SUFDbEIsWUFBWSxFQUFFLEVBQUU7SUFFaEIsY0FBYyxFQUFFO1FBQ1osUUFBUSxFQUFFRCxNQUFJLENBQUE7Ozs7OztpQkFNTDtRQUNULFVBQVUsRUFBRUEsTUFBSSxDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBc0JmO0tBQ0o7SUFDRCxJQUFJLEVBQUUsVUFBUyxRQUEyQztRQUN0RCxJQUFJLEdBQUcsR0FBSSxRQUEwRCxDQUFBO1FBRXJFLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUE7UUFDdkQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQTs7UUFFdkQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFBO1FBQzdELFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFDLEdBQUcsSUFBSSxFQUFFLENBQUE7UUFFdkQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHSyxTQUFPLENBQUE7O1FBRXpDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFBO0tBQzVDO0lBQ0QsY0FBYyxFQUFFLFVBQVMsSUFBWSxFQUFFLFFBQTJDO1FBQzlFLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFBO1FBQzlFLFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBR0EsU0FBTyxDQUFBO0tBQzVDO0NBQ0o7O0FDbEZEOzs7OztBQU1BLE1BQU1MLE1BQUksR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7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QUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRSxDQUFBO1FBQzVHLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsRUFBRSxDQUFBOztRQUU1RyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQTtRQUN4RSxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBQyxHQUFHLElBQUksRUFBRSxDQUFBO1FBRXZELFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUE7O1FBR3pDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFBO1FBQ3pDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFBO1FBQzNDLFFBQVEsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEtBQUssRUFBQyxDQUFBO1FBQ2pILFFBQVEsQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEdB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QUFHLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3hHLFdBQVc7QUFDWCxTQUFTO0FBQ1QsUUFBUSxPQUFPLGFBQWEsQ0FBQztBQUM3QixLQUFLO0FBQ0w7QUFDQSxJQUFJLFdBQVcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQ3hDLFFBQVEsSUFBSSxTQUFTLEdBQUcsSUFBSSxVQUFVLENBQUMsQ0FBQyxHQUFHLFdBQVcsR0FBRyxZQUFZLENBQUMsQ0FBQztBQUN2RTtBQUNBLFFBQVEsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRTtBQUN4QyxVQUFVLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDM0MsWUFBWSxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDN0UsWUFBWSxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNyRixZQUFZLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FB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LEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtBQUN0QyxHQUFHO0FBQ0g7QUFDQSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUM7QUFDckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBRSxDQUFDO0FBQ0g7QUFDQSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEVBQUUsQ0FBQztBQUNIOztBQ3BMQTtBQUNB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
