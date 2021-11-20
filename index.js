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
            material.uniforms.texInvSize.value;
            new THREE.Vector2(width, height);
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
        root.addEventListener("model-loaded", initializer);
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

        pixels3 = this.flipPixelsVertically(pixels3, TARGETWIDTH, TARGETHEIGHT);
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
            flippedPixels[x * 3 + y * width * 3] = pixels[x * 3 + (height - y) * width * 3];
            flippedPixels[x * 3 + 1 + y * width * 3] = pixels[x * 3 + 1 + (height - y) * width * 3];
            flippedPixels[x * 3 + 2 + y * width * 3] = pixels[x * 3 + 2 + (height - y) * width * 3];
          }
        }
        return flippedPixels;
    }

    convert3to4 (pixels, width, height) {
        var newPixels = new Uint8Array(4 * TARGETWIDTH * TARGETHEIGHT);

        for (var x = 0; x < width; ++x) {
          for (var y = 0; y < height; ++y) {
            newPixels[x * 4 + y * width * 4] = pixels[x * 3 + (height - y) * width * 3];
            newPixels[x * 4 + 1 + y * width * 4] = pixels[x * 3 + 1 + (height - y) * width * 3];
            newPixels[x * 4 + 2 + y * width * 4] = pixels[x * 3 + 2 + (height - y) * width * 3];
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
        root.addEventListener("model-loaded", (ev) => { 
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

        // offset to center of portal assuming walking on ground
        this.Yoffset = -(this.el.object3D.position.y - 1.6);

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
        let scaleM = this.el.object3DMap["mesh"].scale;
        let scaleI = this.el.object3D.scale;
        let scaleX = (scaleM.x * scaleI.x) / this.data.textScale;
        let scaleY = (scaleM.y * scaleI.y) / this.data.textScale;
        let scaleZ = (scaleM.y * scaleI.y) / this.data.textScale;
 
        this.portalTitle.webLayer3D.scale.x /= scaleX;
        this.portalTitle.webLayer3D.scale.y /= scaleY;

        this.portalTitle.webLayer3D.position.x = this.data.textPosition.x / scaleX;
        this.portalTitle.webLayer3D.position.y = 0.5 + size.height / 2 + this.data.textPosition.y / scaleY;
        this.portalTitle.webLayer3D.position.z = this.data.textPosition.z / scaleZ;
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
          this.el.object3D.getWorldPosition(worldPos);
          this.el.sceneEl.camera.getWorldPosition(worldCameraPos);
          worldCameraPos.y -= this.Yoffset;
          const dist = worldCameraPos.distanceTo(worldPos);

          if (this.portalType == 1 && dist < 0.5) {
              if (!this.locationhref) {
                console.log("set window.location.href to " + this.other);
                this.locationhref = this.other;
                window.location.href = this.other;
              }
          } else if (this.portalType == 2 && dist < 0.5) {
            this.system.teleportTo(this.other.object3D);
          } else if (this.portalType == 3) {
              if (dist < 0.5) {
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
        root.addEventListener("model-loaded", () => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wcm94aW1pdHktZXZlbnRzLmpzIiwiLi4vc3JjL3V0aWxzL2NvbXBvbmVudC11dGlscy5qcyIsIi4uL3NyYy91dGlscy9zY2VuZS1ncmFwaC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcyIsIi4uL3NyYy91dGlscy9kZWZhdWx0SG9va3MudHMiLCIuLi9zcmMvdXRpbHMvTWF0ZXJpYWxNb2RpZmllci50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveU1haW4udHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lVbmlmb3JtT2JqLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95VW5pZm9ybV9wYXJhcy50cyIsIi4uL3NyYy9hc3NldHMvYmF5ZXIucG5nIiwiLi4vc3JjL3NoYWRlcnMvYmxlZXB5LWJsb2Nrcy1zaGFkZXIudHMiLCIuLi9zcmMvc2hhZGVycy9ub2lzZS50cyIsIi4uL3NyYy9zaGFkZXJzL2xpcXVpZC1tYXJibGUudHMiLCIuLi9zcmMvYXNzZXRzL3NtYWxsLW5vaXNlLnBuZyIsIi4uL3NyYy9zaGFkZXJzL2dhbGF4eS50cyIsIi4uL3NyYy9zaGFkZXJzL2xhY2UtdHVubmVsLnRzIiwiLi4vc3JjL2Fzc2V0cy9ub2lzZS0yNTYucG5nIiwiLi4vc3JjL3NoYWRlcnMvZmlyZS10dW5uZWwudHMiLCIuLi9zcmMvc2hhZGVycy9taXN0LnRzIiwiLi4vc3JjL3NoYWRlcnMvbWFyYmxlMS50cyIsIi4uL3NyYy9hc3NldHMvYmFkU2hhZGVyLmpwZyIsIi4uL3NyYy9zaGFkZXJzL25vdC1mb3VuZC50cyIsIi4uL3NyYy9hc3NldHMvd2FycGZ4LnBuZyIsIi4uL3NyYy9zaGFkZXJzL3dhcnAudHMiLCIuLi9zcmMvc2hhZGVycy9zbm9pc2UudHMiLCIuLi9zcmMvc2hhZGVycy93YXJwLXBvcnRhbC50cyIsIi4uL3NyYy9jb21wb25lbnRzL3NoYWRlci50cyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9DT0xPUi5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfRElTUC5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfZ2xvc3NpbmVzcy5wbmciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfTlJNLmpwZyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9PQ0MuanBnIiwiLi4vc3JjL3V0aWxzL3dyaXRlQ3ViZU1hcC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3BvcnRhbC5qcyIsIi4uL3NyYy9hc3NldHMvYmFsbGZ4LnBuZyIsIi4uL3NyYy9zaGFkZXJzL3Bhbm9iYWxsLnZlcnQuanMiLCIuLi9zcmMvc2hhZGVycy9wYW5vYmFsbC5mcmFnLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvaW1tZXJzaXZlLTM2MC5qcyIsIi4uL3NyYy9zaGFkZXJzL3BhcmFsbGF4LXNoYWRlci5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3BhcmFsbGF4LmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMiLCIuLi9zcmMvY29tcG9uZW50cy92aWRlby1jb250cm9sLXBhZC50cyIsIi4uL3NyYy9yb29tcy9pbmRleC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdmYWRlci1wbHVzJywge1xuICBzY2hlbWE6IHtcbiAgICBkaXJlY3Rpb246IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdub25lJyB9LCAvLyBcImluXCIsIFwib3V0XCIsIG9yIFwibm9uZVwiXG4gICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDIwMCB9LCAvLyBUcmFuc2l0aW9uIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kc1xuICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6ICd3aGl0ZScgfSxcbiAgfSxcblxuICBpbml0KCkge1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgpLFxuICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgY29sb3I6IHRoaXMuZGF0YS5jb2xvcixcbiAgICAgICAgc2lkZTogVEhSRUUuQmFja1NpZGUsXG4gICAgICAgIG9wYWNpdHk6IDAsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBmb2c6IGZhbHNlLFxuICAgICAgfSlcbiAgICApXG4gICAgbWVzaC5zY2FsZS54ID0gbWVzaC5zY2FsZS55ID0gMVxuICAgIG1lc2guc2NhbGUueiA9IDAuMTVcbiAgICBtZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgIG1lc2gucmVuZGVyT3JkZXIgPSAxIC8vIHJlbmRlciBhZnRlciBvdGhlciB0cmFuc3BhcmVudCBzdHVmZlxuICAgIHRoaXMuZWwuY2FtZXJhLmFkZChtZXNoKVxuICAgIHRoaXMubWVzaCA9IG1lc2hcbiAgfSxcblxuICBmYWRlT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmJlZ2luVHJhbnNpdGlvbignb3V0JylcbiAgfSxcblxuICBmYWRlSW4oKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdpbicpXG4gIH0sXG5cbiAgYXN5bmMgYmVnaW5UcmFuc2l0aW9uKGRpcmVjdGlvbikge1xuICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmYWRlIHdoaWxlIGEgZmFkZSBpcyBoYXBwZW5pbmcuJylcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uIH0pXG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcykgPT4ge1xuICAgICAgaWYgKHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID09PSAoZGlyZWN0aW9uID09ICdpbicgPyAwIDogMSkpIHtcbiAgICAgICAgcmVzKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSByZXNcbiAgICAgIH1cbiAgICB9KVxuICB9LFxuXG4gIHRpY2sodCwgZHQpIHtcbiAgICBjb25zdCBtYXQgPSB0aGlzLm1lc2gubWF0ZXJpYWxcbiAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnIHx8IG1hdC5vcGFjaXR5ICE9PSAwXG4gICAgaWYgKCF0aGlzLm1lc2gudmlzaWJsZSkgcmV0dXJuXG5cbiAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ2luJykge1xuICAgICAgbWF0Lm9wYWNpdHkgPSBNYXRoLm1heCgwLCBtYXQub3BhY2l0eSAtICgxLjAgLyB0aGlzLmRhdGEuZHVyYXRpb24pICogTWF0aC5taW4oZHQsIDUwKSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWluKDEsIG1hdC5vcGFjaXR5ICsgKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH1cblxuICAgIGlmIChtYXQub3BhY2l0eSA9PT0gMCB8fCBtYXQub3BhY2l0eSA9PT0gMSkge1xuICAgICAgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gIT09ICdub25lJykge1xuICAgICAgICBpZiAodGhpcy5fcmVzb2x2ZUZpbmlzaCkge1xuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2goKVxuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSBudWxsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2ZhZGVyLXBsdXMnLCB7IGRpcmVjdGlvbjogJ25vbmUnIH0pXG4gICAgfVxuICB9LFxufSlcbiIsImNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3Byb3hpbWl0eS1ldmVudHMnLCB7XG4gIHNjaGVtYToge1xuICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9LFxuICAgIGZ1eno6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuMSB9LFxuICAgIFlvZmZzZXQ6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAgfSxcbiAgfSxcbiAgaW5pdCgpIHtcbiAgICB0aGlzLmluWm9uZSA9IGZhbHNlXG4gICAgdGhpcy5jYW1lcmEgPSB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgdGhpcy5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYSlcbiAgICB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgIGNvbnN0IHdhc0luem9uZSA9IHRoaXMuaW5ab25lXG5cbiAgICB3b3JsZENhbWVyYS55IC09IHRoaXMuZGF0YS5Zb2Zmc2V0XG4gICAgdmFyIGRpc3QgPSB3b3JsZENhbWVyYS5kaXN0YW5jZVRvKHdvcmxkU2VsZilcbiAgICB2YXIgdGhyZXNob2xkID0gdGhpcy5kYXRhLnJhZGl1cyArICh0aGlzLmluWm9uZSA/IHRoaXMuZGF0YS5mdXp6ICA6IDApXG4gICAgdGhpcy5pblpvbmUgPSBkaXN0IDwgdGhyZXNob2xkXG4gICAgaWYgKHRoaXMuaW5ab25lICYmICF3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5ZW50ZXInKVxuICAgIGlmICghdGhpcy5pblpvbmUgJiYgd2FzSW56b25lKSB0aGlzLmVsLmVtaXQoJ3Byb3hpbWl0eWxlYXZlJylcbiAgfSxcbn0pXG4iLCIvLyBQcm92aWRlcyBhIGdsb2JhbCByZWdpc3RyeSBvZiBydW5uaW5nIGNvbXBvbmVudHNcbi8vIGNvcGllZCBmcm9tIGh1YnMgc291cmNlXG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8IHt9O1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdIHx8IFtdO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0ucHVzaChjb21wb25lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIGlmICghd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSkgcmV0dXJuO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uc3BsaWNlKHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uaW5kZXhPZihjb21wb25lbnQpLCAxKTtcbn1cbiAgIiwiLy8gY29waWVkIGZyb20gaHVic1xuXG5leHBvcnQgZnVuY3Rpb24gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudChlbnRpdHksIGNvbXBvbmVudE5hbWUpIHtcbiAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5LmNvbXBvbmVudHMgJiYgZW50aXR5LmNvbXBvbmVudHNbY29tcG9uZW50TmFtZV0pKSB7XG4gICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gICAgcmV0dXJuIGVudGl0eTtcbiAgfVxuICBcbiAgZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21wb25lbnRzSW5OZWFyZXN0QW5jZXN0b3IoZW50aXR5LCBjb21wb25lbnROYW1lKSB7XG4gICAgY29uc3QgY29tcG9uZW50cyA9IFtdO1xuICAgIHdoaWxlIChlbnRpdHkpIHtcbiAgICAgIGlmIChlbnRpdHkuY29tcG9uZW50cykge1xuICAgICAgICBmb3IgKGNvbnN0IGMgaW4gZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHNbY10ubmFtZSA9PT0gY29tcG9uZW50TmFtZSkge1xuICAgICAgICAgICAgY29tcG9uZW50cy5wdXNoKGVudGl0eS5jb21wb25lbnRzW2NdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY29tcG9uZW50cztcbiAgICAgIH1cbiAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlO1xuICAgIH1cbiAgICByZXR1cm4gY29tcG9uZW50cztcbiAgfVxuICAiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogYnJlYWsgdGhlIHJvb20gaW50byBxdWFkcmFudHMgb2YgYSBjZXJ0YWluIHNpemUsIGFuZCBoaWRlIHRoZSBjb250ZW50cyBvZiBhcmVhcyB0aGF0IGhhdmVcbiAqIG5vYm9keSBpbiB0aGVtLiAgTWVkaWEgd2lsbCBiZSBwYXVzZWQgaW4gdGhvc2UgYXJlYXMgdG9vLlxuICogXG4gKiBJbmNsdWRlIGEgd2F5IGZvciB0aGUgcG9ydGFsIGNvbXBvbmVudCB0byB0dXJuIG9uIGVsZW1lbnRzIGluIHRoZSByZWdpb24gb2YgdGhlIHBvcnRhbCBiZWZvcmVcbiAqIGl0IGNhcHR1cmVzIGEgY3ViZW1hcFxuICovXG5cbmltcG9ydCB7IHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UsIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuLi91dGlscy9jb21wb25lbnQtdXRpbHNcIjtcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcblxuIC8vIGFyYml0cmFyaWx5IGNob29zZSAxMDAwMDAwIGFzIHRoZSBudW1iZXIgb2YgY29tcHV0ZWQgem9uZXMgaW4gIHggYW5kIHlcbmxldCBNQVhfWk9ORVMgPSAxMDAwMDAwXG5sZXQgcmVnaW9uVGFnID0gZnVuY3Rpb24oc2l6ZSwgb2JqM2QpIHtcbiAgICBsZXQgcG9zID0gb2JqM2QucG9zaXRpb25cbiAgICBsZXQgeHAgPSBNYXRoLmZsb29yKHBvcy54IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIGxldCB6cCA9IE1hdGguZmxvb3IocG9zLnogLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgcmV0dXJuIE1BWF9aT05FUyAqIHhwICsgenBcbn1cblxubGV0IHJlZ2lvbnNJblVzZSA9IFtdXG5cbi8qKlxuICogRmluZCB0aGUgY2xvc2VzdCBhbmNlc3RvciAoaW5jbHVkaW5nIHRoZSBwYXNzZWQgaW4gZW50aXR5KSB0aGF0IGhhcyBhbiBgb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcmAgY29tcG9uZW50LFxuICogYW5kIHJldHVybiB0aGF0IGNvbXBvbmVudFxuICovXG5mdW5jdGlvbiBnZXRSZWdpb25Gb2xsb3dlcihlbnRpdHkpIHtcbiAgICBsZXQgY3VyRW50aXR5ID0gZW50aXR5O1xuICBcbiAgICB3aGlsZShjdXJFbnRpdHkgJiYgY3VyRW50aXR5LmNvbXBvbmVudHMgJiYgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICBjdXJFbnRpdHkgPSBjdXJFbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gIFxuICAgIGlmICghY3VyRW50aXR5IHx8ICFjdXJFbnRpdHkuY29tcG9uZW50cyB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXVxufVxuICBcbmZ1bmN0aW9uIGFkZFRvUmVnaW9uKHJlZ2lvbikge1xuICAgIHJlZ2lvbnNJblVzZVtyZWdpb25dID8gcmVnaW9uc0luVXNlW3JlZ2lvbl0rKyA6IHJlZ2lvbnNJblVzZVtyZWdpb25dID0gMVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBpbiByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMSkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHRydWUpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJhbHJlYWR5IGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHN1YnRyYWN0RnJvbVJlZ2lvbihyZWdpb24pIHtcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0pIHtyZWdpb25zSW5Vc2VbcmVnaW9uXS0tIH1cbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgbGVmdCByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcblxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAwKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgZmFsc2UpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJzdGlsbCBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd1JlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcInNob3dpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgYWRkVG9SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGlkZXJSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJoaWRpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgc3VidHJhY3RGcm9tUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzKCkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKFwic2hvd2luZy9oaWRpbmcgYWxsIG9iamVjdHNcIilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2Vbb2JqLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgIGlmIChvYmouZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IGNvbnRpbnVlIH1cblxuICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCJoaWRpbmcgXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdmlzaWJsZSkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nXCIgOiBcImhpZGluZ1wiKSArIFwiIGFsbCBvYmplY3RzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgaWYgKG9iai5yZWdpb24gPT0gcmVnaW9uKSB7XG4gICAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiIGhpZGluZ1wiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG4gIFxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdhdmF0YXItcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXZhdGFyOiByZWdpb24gXCIsIHRoaXMucmVnaW9uKVxuICAgICAgICBhZGRUb1JlZ2lvbih0aGlzLnJlZ2lvbilcblxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbmV3UmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBpZiAobmV3UmVnaW9uICE9IHRoaXMucmVnaW9uKSB7XG4gICAgICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgICAgICAgICBhZGRUb1JlZ2lvbihuZXdSZWdpb24pXG4gICAgICAgICAgICB0aGlzLnJlZ2lvbiA9IG5ld1JlZ2lvblxuICAgICAgICB9XG4gICAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9LFxuICAgICAgICBkeW5hbWljOiB7IGRlZmF1bHQ6IHRydWUgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICB0aGlzLnNob3dIaWRlID0gdGhpcy5zaG93SGlkZS5iaW5kKHRoaXMpXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgIH1cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZG9uJ3QgbW92ZVxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5keW5hbWljKSB7IHJldHVybiB9XG5cbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2VbdGhpcy5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyByZXR1cm4gfVxuXG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLnNob3dIaWRlKHZpc2libGUpXG4gICAgfSxcblxuICAgIHNob3dIaWRlOiBmdW5jdGlvbiAodmlzaWJsZSkge1xuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdmlzaWJsZVxuXG4gICAgICAgIC8vLyBjaGVjayBmb3IgbWVkaWEtdmlkZW8gY29tcG9uZW50IG9uIHBhcmVudCB0byBzZWUgaWYgd2UncmUgYSB2aWRlby4gIEFsc28gc2FtZSBmb3IgYXVkaW9cbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICBpZiAodmlzaWJsZSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLndhc1BhdXNlZCAhPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICAgICAgICAgIGlmICghdGhpcy53YXNQYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncmVnaW9uLWhpZGVyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGFyZW50IHdpdGggXCJuYXYtbWVzaC1oZWxwZXJcIiwgdGhpcyBpcyBpbiB0aGUgc2NlbmUuICBcbiAgICAgICAgLy8gSWYgbm90LCBpdCdzIGluIGFuIG9iamVjdCB3ZSBkcm9wcGVkIG9uIHRoZSB3aW5kb3csIHdoaWNoIHdlIGRvbid0IHN1cHBvcnRcbiAgICAgICAgaWYgKCFmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwibmF2LW1lc2gtaGVscGVyXCIpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50IG11c3QgYmUgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGdsYi5cIilcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IDA7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmKHRoaXMuZGF0YS5zaXplID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5zaXplID0gMTA7XG4gICAgICAgICAgICB0aGlzLnNpemUgPSB0aGlzLnBhcnNlTm9kZU5hbWUodGhpcy5kYXRhLnNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhpcy5uZXdTY2VuZSA9IHRoaXMubmV3U2NlbmUuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLm5ld1NjZW5lKVxuICAgICAgICAvLyBjb25zdCBlbnZpcm9ubWVudFNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNlbnZpcm9ubWVudC1zY2VuZVwiKTtcbiAgICAgICAgLy8gdGhpcy5hZGRTY2VuZUVsZW1lbnQgPSB0aGlzLmFkZFNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50ID0gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFNjZW5lRWxlbWVudClcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2Ugd2FudCB0byBub3RpY2Ugd2hlbiBuZXcgdGhpbmdzIGdldCBhZGRlZCB0byB0aGUgcm9vbS4gIFRoaXMgd2lsbCBoYXBwZW4gZm9yXG4gICAgICAgIC8vIG9iamVjdHMgZHJvcHBlZCBpbiB0aGUgcm9vbSwgb3IgZm9yIG5ldyByZW1vdGUgYXZhdGFycywgYXQgbGVhc3RcbiAgICAgICAgLy8gdGhpcy5hZGRSb290RWxlbWVudCA9IHRoaXMuYWRkUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVJvb3RFbGVtZW50ID0gdGhpcy5yZW1vdmVSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRSb290RWxlbWVudClcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVJvb3RFbGVtZW50KVxuXG4gICAgICAgIC8vIHdhbnQgdG8gc2VlIGlmIHRoZXJlIGFyZSBwaW5uZWQgb2JqZWN0cyB0aGF0IHdlcmUgbG9hZGVkIGZyb20gaHVic1xuICAgICAgICBsZXQgcm9vbU9iamVjdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFwiUm9vbU9iamVjdHNcIilcbiAgICAgICAgdGhpcy5yb29tT2JqZWN0cyA9IHJvb21PYmplY3RzLmxlbmd0aCA+IDAgPyByb29tT2JqZWN0c1swXSA6IG51bGxcblxuICAgICAgICAvLyBnZXQgYXZhdGFyc1xuICAgICAgICBjb25zdCBhdmF0YXJzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dXCIpO1xuICAgICAgICBhdmF0YXJzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayBvYmplY3RzIGluIHRoZSByb290ICh0aGluZ3MgdGhhdCBoYXZlIGJlZW4gZHJvcHBlZCBvbiB0aGUgc2NlbmUpXG4gICAgICAgIC8vIC0gZHJhd2luZ3MgaGF2ZSBjbGFzcz1cImRyYXdpbmdcIiwgbmV0d29ya2VkLWRyYXdpbmdcbiAgICAgICAgLy8gTm90IGdvaW5nIHRvIGRvIGRyYXdpbmdzIHJpZ2h0IG5vdy5cblxuICAgICAgICAvLyBwaW5uZWQgbWVkaWEgbGl2ZSB1bmRlciBhIG5vZGUgd2l0aCBjbGFzcz1cIlJvb21PYmplY3RzXCJcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuUm9vbU9iamVjdHMgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0gY2FtZXJhIGhhcyBjYW1lcmEtdG9vbCAgICAgICAgXG4gICAgICAgIC8vIC0gaW1hZ2UgZnJvbSBjYW1lcmEsIG9yIGRyb3BwZWQsIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLWltYWdlLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSBnbGIgaGFzIG1lZGlhLWxvYWRlciwgZ2x0Zi1tb2RlbC1wbHVzLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSB2aWRlbyBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS12aWRlbywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vXG4gICAgICAgIC8vICBzbywgZ2V0IGFsbCBjYW1lcmEtdG9vbHMsIGFuZCBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIHRoZSBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZS4gIE11c3Qgd2FpdCBmb3Igc2NlbmUgdG8gZmluaXNoIGxvYWRpbmdcbiAgICAgICAgdGhpcy5zY2VuZUxvYWRlZCA9IHRoaXMuc2NlbmVMb2FkZWQuYmluZCh0aGlzKVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcblxuICAgIH0sXG5cbiAgICBpc0FuY2VzdG9yOiBmdW5jdGlvbiAocm9vdCwgZW50aXR5KSB7XG4gICAgICAgIHdoaWxlIChlbnRpdHkgJiYgIShlbnRpdHkgPT0gcm9vdCkpIHtcbiAgICAgICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gKGVudGl0eSA9PSByb290KTtcbiAgICB9LFxuICAgIFxuICAgIC8vIFRoaW5ncyB3ZSBkb24ndCB3YW50IHRvIGhpZGU6XG4gICAgLy8gLSBbd2F5cG9pbnRdXG4gICAgLy8gLSBwYXJlbnQgb2Ygc29tZXRoaW5nIHdpdGggW25hdm1lc2hdIGFzIGEgY2hpbGQgKHRoaXMgaXMgdGhlIG5hdmlnYXRpb24gc3R1ZmZcbiAgICAvLyAtIHRoaXMuZWwucGFyZW50RWwucGFyZW50RWxcbiAgICAvLyAtIFtza3lib3hdXG4gICAgLy8gLSBbZGlyZWN0aW9uYWwtbGlnaHRdXG4gICAgLy8gLSBbYW1iaWVudC1saWdodF1cbiAgICAvLyAtIFtoZW1pc3BoZXJlLWxpZ2h0XVxuICAgIC8vIC0gI0NvbWJpbmVkTWVzaFxuICAgIC8vIC0gI3NjZW5lLXByZXZpZXctY2FtZXJhIG9yIFtzY2VuZS1wcmV2aWV3LWNhbWVyYV1cbiAgICAvL1xuICAgIC8vIHdlIHdpbGwgZG9cbiAgICAvLyAtIFttZWRpYS1sb2FkZXJdXG4gICAgLy8gLSBbc3BvdC1saWdodF1cbiAgICAvLyAtIFtwb2ludC1saWdodF1cbiAgICBzY2VuZUxvYWRlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbm9kZXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImVudmlyb25tZW50LXNjZW5lXCIpLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdXG4gICAgICAgIC8vdmFyIG5vZGVzID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5wYXJlbnRFbC5jaGlsZE5vZGVzO1xuICAgICAgICBmb3IgKGxldCBpPTA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG5vZGUgPSBub2Rlc1tpXVxuICAgICAgICAgICAgLy9pZiAobm9kZSA9PSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsKSB7Y29udGludWV9XG4gICAgICAgICAgICBpZiAodGhpcy5pc0FuY2VzdG9yKG5vZGUsIHRoaXMuZWwpKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjbCA9IG5vZGUuY2xhc3NOYW1lXG4gICAgICAgICAgICBpZiAoY2wgPT09IFwiQ29tYmluZWRNZXNoXCIgfHwgY2wgPT09IFwic2NlbmUtcHJldmlldy1jYW1lcmFcIikge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgYyA9IG5vZGUuY29tcG9uZW50c1xuICAgICAgICAgICAgaWYgKGNbXCJ3YXlwb2ludFwiXSB8fCBjW1wic2t5Ym94XCJdIHx8IGNbXCJkaXJlY3Rpb25hbC1saWdodFwiXSB8fCBjW1wiYW1iaWVudC1saWdodFwiXSB8fCBjW1wiaGVtaXNwaGVyZS1saWdodFwiXSkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2ggPSBub2RlLmNoaWxkcmVuXG4gICAgICAgICAgICB2YXIgbmF2bWVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChsZXQgaj0wOyBqIDwgY2gubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoY2hbal0uY29tcG9uZW50c1tcIm5hdm1lc2hcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgbmF2bWVzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChuYXZtZXNoKSB7Y29udGludWV9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSwgZHluYW1pYzogZmFsc2UgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFsbCBvYmplY3RzIGFuZCBhdmF0YXIgc2hvdWxkIGJlIHNldCB1cCwgc28gbGV0cyBtYWtlIHN1cmUgYWxsIG9iamVjdHMgYXJlIGNvcnJlY3RseSBzaG93blxuICAgICAgICBzaG93SGlkZU9iamVjdHMoKVxuICAgIH0sXG5cbiAgICB1cGRhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09PSB0aGlzLnNpemUpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwXG4gICAgICAgICAgICB0aGlzLnNpemUgPSB0aGlzLnBhcnNlTm9kZU5hbWUodGhpcy5kYXRhLnNpemUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmVsLnNjZW5lRWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy8gc2l6ZSA9PSAwIGlzIHVzZWQgdG8gc2lnbmFsIFwiZG8gbm90aGluZ1wiXG4gICAgICAgIGlmICh0aGlzLnNpemUgPT0gMCkge3JldHVybn1cblxuICAgICAgICAvLyBzZWUgaWYgdGhlcmUgYXJlIG5ldyBhdmF0YXJzXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXTpub3QoW2F2YXRhci1yZWdpb24tZm9sbG93ZXJdKVwiKVxuICAgICAgICBub2Rlcy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vICBzZWUgaWYgdGhlcmUgYXJlIG5ldyBjYW1lcmEtdG9vbHMgb3IgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSksIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuICAgIH0sXG4gIFxuICAgIC8vIG5ld1NjZW5lOiBmdW5jdGlvbihtb2RlbCkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudmlyb25tZW50IHNjZW5lIGxvYWRlZDogXCIsIG1vZGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LCAgXG4gICAgXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKHNpemUpIHtcbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBcbiAgICAgICAgLy8gIFwic2l6ZVwiIChhbiBpbnRlZ2VyIG51bWJlcilcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIHNldCB0aGUgaGlkZGVyIGNvbXBvbmVudCB0byBcbiAgICAgICAgLy8gdXNlIHRoYXQgc2l6ZSBpbiBtZXRlcnMgZm9yIHRoZSBxdWFkcmFudHNcbiAgICAgICAgdGhpcy5ub2RlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG5cbiAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5ub2RlTmFtZS5tYXRjaCgvXyhbMC05XSopJC8pXG5cbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDIsIGZpcnN0IG1hdGNoIGlzIHRoZSBkaXIsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgY29tcG9uZW50TmFtZSBuYW1lIG9yIG51bWJlclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLm5vZGVOYW1lKVxuICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBub2RlU2l6ZSA9IHBhcnNlSW50KHBhcmFtc1sxXSlcbiAgICAgICAgICAgIGlmICghbm9kZVNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbm9kZVNpemVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pIiwibGV0IERlZmF1bHRIb29rcyA9IHtcbiAgICB2ZXJ0ZXhIb29rczoge1xuICAgICAgICB1bmlmb3JtczogJ2luc2VydGJlZm9yZTojaW5jbHVkZSA8Y29tbW9uPlxcbicsXG4gICAgICAgIGZ1bmN0aW9uczogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxjbGlwcGluZ19wbGFuZXNfcGFyc192ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcHJlVHJhbnNmb3JtOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG4nLFxuICAgICAgICBwb3N0VHJhbnNmb3JtOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPHByb2plY3RfdmVydGV4PlxcbicsXG4gICAgICAgIHByZU5vcm1hbDogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxiZWdpbm5vcm1hbF92ZXJ0ZXg+XFxuJ1xuICAgIH0sXG4gICAgZnJhZ21lbnRIb29rczoge1xuICAgICAgICB1bmlmb3JtczogJ2luc2VydGJlZm9yZTojaW5jbHVkZSA8Y29tbW9uPlxcbicsXG4gICAgICAgIGZ1bmN0aW9uczogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxjbGlwcGluZ19wbGFuZXNfcGFyc19mcmFnbWVudD5cXG4nLFxuICAgICAgICBwcmVGcmFnQ29sb3I6ICdpbnNlcnRiZWZvcmU6Z2xfRnJhZ0NvbG9yID0gdmVjNCggb3V0Z29pbmdMaWdodCwgZGlmZnVzZUNvbG9yLmEgKTtcXG4nLFxuICAgICAgICBwb3N0RnJhZ0NvbG9yOiAnaW5zZXJ0YWZ0ZXI6Z2xfRnJhZ0NvbG9yID0gdmVjNCggb3V0Z29pbmdMaWdodCwgZGlmZnVzZUNvbG9yLmEgKTtcXG4nLFxuICAgICAgICBwb3N0TWFwOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPG1hcF9mcmFnbWVudD5cXG4nLFxuICAgICAgICByZXBsYWNlTWFwOiAncmVwbGFjZTojaW5jbHVkZSA8bWFwX2ZyYWdtZW50PlxcbidcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IERlZmF1bHRIb29rcyIsIi8vIGJhc2VkIG9uIGh0dHBzOi8vZ2l0aHViLmNvbS9qYW1pZW93ZW4vdGhyZWUtbWF0ZXJpYWwtbW9kaWZpZXJcblxuaW1wb3J0IGRlZmF1bHRIb29rcyBmcm9tICcuL2RlZmF1bHRIb29rcyc7XG5cbmludGVyZmFjZSBFeHRlbmRlZE1hdGVyaWFsIHtcbiAgICB1bmlmb3JtczogVW5pZm9ybXM7XG4gICAgdmVydGV4U2hhZGVyOiBzdHJpbmc7XG4gICAgZnJhZ21lbnRTaGFkZXI6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNoYWRlckV4dGVuc2lvbk9wdHMge1xuICAgIHVuaWZvcm1zOiB7IFt1bmlmb3JtOiBzdHJpbmddOiBhbnkgfTtcbiAgICB2ZXJ0ZXhTaGFkZXI6IHsgW3BhdHRlcm46IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGZyYWdtZW50U2hhZGVyOiB7IFtwYXR0ZXJuOiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgICBjbGFzc05hbWU/OiBzdHJpbmc7XG4gICAgcG9zdE1vZGlmeVZlcnRleFNoYWRlcj86IChzaGFkZXI6IHN0cmluZykgPT4gc3RyaW5nO1xuICAgIHBvc3RNb2RpZnlGcmFnbWVudFNoYWRlcj86IChzaGFkZXI6IHN0cmluZykgPT4gc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2hhZGVyRXh0ZW5zaW9uIGV4dGVuZHMgU2hhZGVyRXh0ZW5zaW9uT3B0cyB7XG4gICAgaW5pdChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKTogdm9pZDtcbiAgICB1cGRhdGVVbmlmb3Jtcyh0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpOiB2b2lkXG59XG5cbmNvbnN0IG1vZGlmeVNvdXJjZSA9ICggc291cmNlOiBzdHJpbmcsIGhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30sIGhvb2tzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKT0+e1xuICAgIGxldCBtYXRjaDtcbiAgICBmb3IoIGxldCBrZXkgaW4gaG9va0RlZnMgKXtcbiAgICAgICAgaWYoIGhvb2tzW2tleV0gKXtcbiAgICAgICAgICAgIG1hdGNoID0gL2luc2VydChiZWZvcmUpOiguKil8aW5zZXJ0KGFmdGVyKTooLiopfChyZXBsYWNlKTooLiopLy5leGVjKCBob29rRGVmc1trZXldICk7XG5cbiAgICAgICAgICAgIGlmKCBtYXRjaCApe1xuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFsxXSApeyAvLyBiZWZvcmVcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzJdLCBob29rc1trZXldICsgJ1xcbicgKyBtYXRjaFsyXSApO1xuICAgICAgICAgICAgICAgIH1lbHNlXG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzNdICl7IC8vIGFmdGVyXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFs0XSwgbWF0Y2hbNF0gKyAnXFxuJyArIGhvb2tzW2tleV0gKTtcbiAgICAgICAgICAgICAgICB9ZWxzZVxuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFs1XSApeyAvLyByZXBsYWNlXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFs2XSwgaG9va3Nba2V5XSApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzb3VyY2U7XG59XG5cbnR5cGUgVW5pZm9ybXMgPSB7XG4gICAgW2tleTogc3RyaW5nXTogYW55O1xufVxuXG4vLyBjb3BpZWQgZnJvbSB0aHJlZS5yZW5kZXJlcnMuc2hhZGVycy5Vbmlmb3JtVXRpbHMuanNcbmV4cG9ydCBmdW5jdGlvbiBjbG9uZVVuaWZvcm1zKCBzcmM6IFVuaWZvcm1zICk6IFVuaWZvcm1zIHtcblx0dmFyIGRzdDogVW5pZm9ybXMgPSB7fTtcblxuXHRmb3IgKCB2YXIgdSBpbiBzcmMgKSB7XG5cdFx0ZHN0WyB1IF0gPSB7fSA7XG5cdFx0Zm9yICggdmFyIHAgaW4gc3JjWyB1IF0gKSB7XG5cdFx0XHR2YXIgcHJvcGVydHkgPSBzcmNbIHUgXVsgcCBdO1xuXHRcdFx0aWYgKCBwcm9wZXJ0eSAmJiAoIHByb3BlcnR5LmlzQ29sb3IgfHxcblx0XHRcdFx0cHJvcGVydHkuaXNNYXRyaXgzIHx8IHByb3BlcnR5LmlzTWF0cml4NCB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc1ZlY3RvcjIgfHwgcHJvcGVydHkuaXNWZWN0b3IzIHx8IHByb3BlcnR5LmlzVmVjdG9yNCB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc1RleHR1cmUgKSApIHtcblx0XHRcdFx0ICAgIGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eS5jbG9uZSgpO1xuXHRcdFx0fSBlbHNlIGlmICggQXJyYXkuaXNBcnJheSggcHJvcGVydHkgKSApIHtcblx0XHRcdFx0ZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5LnNsaWNlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkc3RbIHUgXVsgcCBdID0gcHJvcGVydHk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkc3Q7XG59XG5cbnR5cGUgU3VwZXJDbGFzc1R5cGVzID0gdHlwZW9mIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcblxudHlwZSBTdXBlckNsYXNzZXMgPSBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCB8IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsIHwgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB8IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsIHwgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcblxuaW50ZXJmYWNlIEV4dGVuc2lvbkRhdGEge1xuICAgIFNoYWRlckNsYXNzOiBTdXBlckNsYXNzVHlwZXM7XG4gICAgU2hhZGVyTGliOiBUSFJFRS5TaGFkZXI7XG4gICAgS2V5OiBzdHJpbmcsXG4gICAgQ291bnQ6IG51bWJlcixcbiAgICBNb2RpZmllZE5hbWUoKTogc3RyaW5nLFxuICAgIFR5cGVDaGVjazogc3RyaW5nXG59XG5cbmxldCBjbGFzc01hcDoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmc7fSA9IHtcbiAgICBNZXNoU3RhbmRhcmRNYXRlcmlhbDogXCJzdGFuZGFyZFwiLFxuICAgIE1lc2hCYXNpY01hdGVyaWFsOiBcImJhc2ljXCIsXG4gICAgTWVzaExhbWJlcnRNYXRlcmlhbDogXCJsYW1iZXJ0XCIsXG4gICAgTWVzaFBob25nTWF0ZXJpYWw6IFwicGhvbmdcIixcbiAgICBNZXNoRGVwdGhNYXRlcmlhbDogXCJkZXB0aFwiLFxuICAgIHN0YW5kYXJkOiBcInN0YW5kYXJkXCIsXG4gICAgYmFzaWM6IFwiYmFzaWNcIixcbiAgICBsYW1iZXJ0OiBcImxhbWJlcnRcIixcbiAgICBwaG9uZzogXCJwaG9uZ1wiLFxuICAgIGRlcHRoOiBcImRlcHRoXCJcbn1cblxubGV0IHNoYWRlck1hcDoge1tuYW1lOiBzdHJpbmddOiBFeHRlbnNpb25EYXRhO31cblxuY29uc3QgZ2V0U2hhZGVyRGVmID0gKCBjbGFzc09yU3RyaW5nOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcgKT0+e1xuXG4gICAgaWYoICFzaGFkZXJNYXAgKXtcblxuICAgICAgICBsZXQgY2xhc3Nlczoge1tuYW1lOiBzdHJpbmddOiBTdXBlckNsYXNzVHlwZXM7fSA9IHtcbiAgICAgICAgICAgIHN0YW5kYXJkOiBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCxcbiAgICAgICAgICAgIGJhc2ljOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCxcbiAgICAgICAgICAgIGxhbWJlcnQ6IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwsXG4gICAgICAgICAgICBwaG9uZzogVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwsXG4gICAgICAgICAgICBkZXB0aDogVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcbiAgICAgICAgfVxuXG4gICAgICAgIHNoYWRlck1hcCA9IHt9O1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBjbGFzc2VzICl7XG4gICAgICAgICAgICBzaGFkZXJNYXBbIGtleSBdID0ge1xuICAgICAgICAgICAgICAgIFNoYWRlckNsYXNzOiBjbGFzc2VzWyBrZXkgXSxcbiAgICAgICAgICAgICAgICBTaGFkZXJMaWI6IFRIUkVFLlNoYWRlckxpYlsga2V5IF0sXG4gICAgICAgICAgICAgICAgS2V5OiBrZXksXG4gICAgICAgICAgICAgICAgQ291bnQ6IDAsXG4gICAgICAgICAgICAgICAgTW9kaWZpZWROYW1lOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYE1vZGlmaWVkTWVzaCR7IHRoaXMuS2V5WzBdLnRvVXBwZXJDYXNlKCkgKyB0aGlzLktleS5zbGljZSgxKSB9TWF0ZXJpYWxfJHsgKyt0aGlzLkNvdW50IH1gO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgVHlwZUNoZWNrOiBgaXNNZXNoJHsga2V5WzBdLnRvVXBwZXJDYXNlKCkgKyBrZXkuc2xpY2UoMSkgfU1hdGVyaWFsYFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHNoYWRlckRlZjogRXh0ZW5zaW9uRGF0YSB8IHVuZGVmaW5lZDtcblxuICAgIGlmICggdHlwZW9mIGNsYXNzT3JTdHJpbmcgPT09ICdmdW5jdGlvbicgKXtcbiAgICAgICAgZm9yKCBsZXQga2V5IGluIHNoYWRlck1hcCApe1xuICAgICAgICAgICAgaWYoIHNoYWRlck1hcFsga2V5IF0uU2hhZGVyQ2xhc3MgPT09IGNsYXNzT3JTdHJpbmcgKXtcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBzaGFkZXJNYXBbIGtleSBdO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgY2xhc3NPclN0cmluZyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgbGV0IG1hcHBlZENsYXNzT3JTdHJpbmcgPSBjbGFzc01hcFsgY2xhc3NPclN0cmluZyBdXG4gICAgICAgIHNoYWRlckRlZiA9IHNoYWRlck1hcFsgbWFwcGVkQ2xhc3NPclN0cmluZyB8fCBjbGFzc09yU3RyaW5nIF07XG4gICAgfVxuXG4gICAgaWYoICFzaGFkZXJEZWYgKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnTm8gU2hhZGVyIGZvdW5kIHRvIG1vZGlmeS4uLicgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyRGVmO1xufVxuXG4vKipcbiAqIFRoZSBtYWluIE1hdGVyaWFsIE1vZG9maWVyXG4gKi9cbmNsYXNzIE1hdGVyaWFsTW9kaWZpZXIge1xuICAgIF92ZXJ0ZXhIb29rczoge1t2ZXJ0ZXhob29rOiBzdHJpbmddOiBzdHJpbmd9XG4gICAgX2ZyYWdtZW50SG9va3M6IHtbZnJhZ2VtZW50aG9vazogc3RyaW5nXTogc3RyaW5nfVxuXG4gICAgY29uc3RydWN0b3IoIHZlcnRleEhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30sIGZyYWdtZW50SG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApe1xuXG4gICAgICAgIHRoaXMuX3ZlcnRleEhvb2tzID0ge307XG4gICAgICAgIHRoaXMuX2ZyYWdtZW50SG9va3MgPSB7fTtcblxuICAgICAgICBpZiggdmVydGV4SG9va0RlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuZGVmaW5lVmVydGV4SG9va3MoIHZlcnRleEhvb2tEZWZzICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiggZnJhZ21lbnRIb29rRGVmcyApe1xuICAgICAgICAgICAgdGhpcy5kZWZpbmVGcmFnbWVudEhvb2tzKCBmcmFnbWVudEhvb2tEZWZzICk7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIG1vZGlmeSggc2hhZGVyOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcsIG9wdHM6IFNoYWRlckV4dGVuc2lvbk9wdHMgKTogRXh0ZW5kZWRNYXRlcmlhbCB7XG5cbiAgICAgICAgbGV0IGRlZiA9IGdldFNoYWRlckRlZiggc2hhZGVyICk7XG5cbiAgICAgICAgbGV0IHZlcnRleFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi52ZXJ0ZXhTaGFkZXIsIHRoaXMuX3ZlcnRleEhvb2tzLCBvcHRzLnZlcnRleFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgZnJhZ21lbnRTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIuZnJhZ21lbnRTaGFkZXIsIHRoaXMuX2ZyYWdtZW50SG9va3MsIG9wdHMuZnJhZ21lbnRTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIGRlZi5TaGFkZXJMaWIudW5pZm9ybXMsIG9wdHMudW5pZm9ybXMgfHwge30gKTtcblxuICAgICAgICByZXR1cm4geyB2ZXJ0ZXhTaGFkZXIsZnJhZ21lbnRTaGFkZXIsdW5pZm9ybXMgfTtcblxuICAgIH1cblxuICAgIGV4dGVuZCggc2hhZGVyOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcsIG9wdHM6IFNoYWRlckV4dGVuc2lvbk9wdHMgKTogeyBuZXcoKTogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsIH0ge1xuXG4gICAgICAgIGxldCBkZWYgPSBnZXRTaGFkZXJEZWYoIHNoYWRlciApOyAvLyBBREpVU1QgVEhJUyBTSEFERVIgREVGIC0gT05MWSBERUZJTkUgT05DRSAtIEFORCBTVE9SRSBBIFVTRSBDT1VOVCBPTiBFWFRFTkRFRCBWRVJTSU9OUy5cblxuICAgICAgICBsZXQgdmVydGV4U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLnZlcnRleFNoYWRlciwgdGhpcy5fdmVydGV4SG9va3MsIG9wdHMudmVydGV4U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCBmcmFnbWVudFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi5mcmFnbWVudFNoYWRlciwgdGhpcy5fZnJhZ21lbnRIb29rcywgb3B0cy5mcmFnbWVudFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgZGVmLlNoYWRlckxpYi51bmlmb3Jtcywgb3B0cy51bmlmb3JtcyB8fCB7fSApO1xuXG4gICAgICAgIGxldCBDbGFzc05hbWUgPSBvcHRzLmNsYXNzTmFtZSB8fCBkZWYuTW9kaWZpZWROYW1lKCk7XG5cbiAgICAgICAgbGV0IGV4dGVuZE1hdGVyaWFsID0gbmV3IEZ1bmN0aW9uKCAnQmFzZUNsYXNzJywgJ3VuaWZvcm1zJywgJ3ZlcnRleFNoYWRlcicsICdmcmFnbWVudFNoYWRlcicsICdjbG9uZVVuaWZvcm1zJyxgXG5cbiAgICAgICAgICAgIHZhciBjbHMgPSBmdW5jdGlvbiAke0NsYXNzTmFtZX0oIHBhcmFtcyApe1xuXG4gICAgICAgICAgICAgICAgQmFzZUNsYXNzLmNhbGwoIHRoaXMsIHBhcmFtcyApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy51bmlmb3JtcyA9IGNsb25lVW5pZm9ybXMoIHVuaWZvcm1zICk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRleFNoYWRlciA9IHZlcnRleFNoYWRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNldFZhbHVlcyggcGFyYW1zICk7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2xzLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoIEJhc2VDbGFzcy5wcm90b3R5cGUgKTtcbiAgICAgICAgICAgIGNscy5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjbHM7XG4gICAgICAgICAgICBjbHMucHJvdG90eXBlLiR7IGRlZi5UeXBlQ2hlY2sgfSA9IHRydWU7XG5cbiAgICAgICAgICAgIGNscy5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uKCBzb3VyY2UgKXtcblxuICAgICAgICAgICAgICAgIEJhc2VDbGFzcy5wcm90b3R5cGUuY29weS5jYWxsKCB0aGlzLCBzb3VyY2UgKTtcblxuICAgICAgICAgICAgICAgIHRoaXMudW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgc291cmNlLnVuaWZvcm1zICk7XG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5mcmFnbWVudFNoYWRlciA9IGZyYWdtZW50U2hhZGVyO1xuICAgICAgICAgICAgICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGNscztcblxuICAgICAgICBgKTtcblxuICAgICAgICBpZiggb3B0cy5wb3N0TW9kaWZ5VmVydGV4U2hhZGVyICl7XG4gICAgICAgICAgICB2ZXJ0ZXhTaGFkZXIgPSBvcHRzLnBvc3RNb2RpZnlWZXJ0ZXhTaGFkZXIoIHZlcnRleFNoYWRlciApO1xuICAgICAgICB9XG4gICAgICAgIGlmKCBvcHRzLnBvc3RNb2RpZnlGcmFnbWVudFNoYWRlciApe1xuICAgICAgICAgICAgZnJhZ21lbnRTaGFkZXIgPSBvcHRzLnBvc3RNb2RpZnlGcmFnbWVudFNoYWRlciggZnJhZ21lbnRTaGFkZXIgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBleHRlbmRNYXRlcmlhbCggZGVmLlNoYWRlckNsYXNzLCB1bmlmb3JtcywgdmVydGV4U2hhZGVyLCBmcmFnbWVudFNoYWRlciwgY2xvbmVVbmlmb3JtcyApO1xuXG4gICAgfVxuXG4gICAgZGVmaW5lVmVydGV4SG9va3MoIGRlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApe1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBkZWZzICl7XG4gICAgICAgICAgICB0aGlzLl92ZXJ0ZXhIb29rc1sga2V5IF0gPSBkZWZzW2tleV07XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIGRlZmluZUZyYWdtZW50SG9va3MoIGRlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nIH0gKSB7XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGRlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuX2ZyYWdtZW50SG9va3NbIGtleSBdID0gZGVmc1trZXldO1xuICAgICAgICB9XG5cbiAgICB9XG5cbn1cblxubGV0IGRlZmF1bHRNYXRlcmlhbE1vZGlmaWVyID0gbmV3IE1hdGVyaWFsTW9kaWZpZXIoIGRlZmF1bHRIb29rcy52ZXJ0ZXhIb29rcywgZGVmYXVsdEhvb2tzLmZyYWdtZW50SG9va3MgKTtcblxuZXhwb3J0IHsgRXh0ZW5kZWRNYXRlcmlhbCwgTWF0ZXJpYWxNb2RpZmllciwgU2hhZGVyRXh0ZW5zaW9uLCBTaGFkZXJFeHRlbnNpb25PcHRzLCBkZWZhdWx0TWF0ZXJpYWxNb2RpZmllciAgYXMgRGVmYXVsdE1hdGVyaWFsTW9kaWZpZXJ9IiwiZXhwb3J0IGRlZmF1bHQgLyogZ2xzbCAqL2BcbiAgICAgICAgLy8gYWJvdmUgaGVyZSwgdGhlIHRleHR1cmUgbG9va3VwIHdpbGwgYmUgZG9uZSwgd2hpY2ggd2VcbiAgICAgICAgLy8gY2FuIGRpc2FibGUgYnkgcmVtb3ZpbmcgdGhlIG1hcCBmcm9tIHRoZSBtYXRlcmlhbFxuICAgICAgICAvLyBidXQgaWYgd2UgbGVhdmUgaXQsIHdlIGNhbiBhbHNvIGNob29zZSB0aGUgYmxlbmQgdGhlIHRleHR1cmVcbiAgICAgICAgLy8gd2l0aCBvdXIgc2hhZGVyIGNyZWF0ZWQgY29sb3IsIG9yIHVzZSBpdCBpbiB0aGUgc2hhZGVyIG9yXG4gICAgICAgIC8vIHdoYXRldmVyXG4gICAgICAgIC8vXG4gICAgICAgIC8vIHZlYzQgdGV4ZWxDb2xvciA9IHRleHR1cmUyRCggbWFwLCB2VXYgKTtcbiAgICAgICAgLy8gdGV4ZWxDb2xvciA9IG1hcFRleGVsVG9MaW5lYXIoIHRleGVsQ29sb3IgKTtcbiAgICAgICAgXG4gICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgLy9tb2QodlV2Lnh5ICogdGV4UmVwZWF0Lnh5ICsgdGV4T2Zmc2V0Lnh5LCB2ZWMyKDEuMCwxLjApKTtcblxuICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgaWYgKHRleEZsaXBZID4gMCkgeyB1di55ID0gMS4wIC0gdXYueTt9XG4gICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG4gICAgICAgIFxuICAgICAgICB2ZWM0IHNoYWRlckNvbG9yO1xuICAgICAgICBtYWluSW1hZ2Uoc2hhZGVyQ29sb3IsIHV2Lnh5ICogaVJlc29sdXRpb24ueHkpO1xuICAgICAgICBzaGFkZXJDb2xvciA9IG1hcFRleGVsVG9MaW5lYXIoIHNoYWRlckNvbG9yICk7XG5cbiAgICAgICAgZGlmZnVzZUNvbG9yICo9IHNoYWRlckNvbG9yO1xuYDtcbiIsImV4cG9ydCBkZWZhdWx0IHtcbiAgICBpVGltZTogeyB2YWx1ZTogMC4wIH0sXG4gICAgaVJlc29sdXRpb246ICB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMyg1MTIsIDUxMiwgMSkgfSxcbiAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSxcbiAgICB0ZXhGbGlwWTogeyB2YWx1ZTogMCB9XG59OyIsImV4cG9ydCBkZWZhdWx0IC8qIGdsc2wgKi9gXG51bmlmb3JtIHZlYzMgaVJlc29sdXRpb247XG51bmlmb3JtIGZsb2F0IGlUaW1lO1xudW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbnVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG51bmlmb3JtIGludCB0ZXhGbGlwWTsgXG4gIGA7XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9hNDQ4ZTM0YjgxMzZmYWU1LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgYmF5ZXJJbWFnZSBmcm9tICcuLi9hc3NldHMvYmF5ZXIucG5nJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIGJheWVyVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoYmF5ZXJJbWFnZSwgKGJheWVyKSA9PiB7XG4gICAgYmF5ZXIubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYXllci5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJheWVyLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmF5ZXIud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYXllclRleCA9IGJheWVyXG59KVxuXG5sZXQgQmxlZXB5QmxvY2tzU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gIHVuaWZvcm1zOiB1bmlmb3JtcyxcblxuICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gIGZyYWdtZW50U2hhZGVyOiB7IFxuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgIC8vIEJ5IERhZWRlbHVzOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3VzZXIvRGFlZGVsdXNcbiAgICAgIC8vIGxpY2Vuc2U6IENyZWF0aXZlIENvbW1vbnMgQXR0cmlidXRpb24tTm9uQ29tbWVyY2lhbC1TaGFyZUFsaWtlIDMuMCBVbnBvcnRlZCBMaWNlbnNlLlxuICAgICAgI2RlZmluZSBUSU1FU0NBTEUgMC4yNSBcbiAgICAgICNkZWZpbmUgVElMRVMgOFxuICAgICAgI2RlZmluZSBDT0xPUiAwLjcsIDEuNiwgMi44XG5cbiAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgIHtcbiAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICB1di54ICo9IGlSZXNvbHV0aW9uLnggLyBpUmVzb2x1dGlvbi55O1xuICAgICAgICBcbiAgICAgICAgdmVjNCBub2lzZSA9IHRleHR1cmUyRChpQ2hhbm5lbDAsIGZsb29yKHV2ICogZmxvYXQoVElMRVMpKSAvIGZsb2F0KFRJTEVTKSk7XG4gICAgICAgIGZsb2F0IHAgPSAxLjAgLSBtb2Qobm9pc2UuciArIG5vaXNlLmcgKyBub2lzZS5iICsgaVRpbWUgKiBmbG9hdChUSU1FU0NBTEUpLCAxLjApO1xuICAgICAgICBwID0gbWluKG1heChwICogMy4wIC0gMS44LCAwLjEpLCAyLjApO1xuICAgICAgICBcbiAgICAgICAgdmVjMiByID0gbW9kKHV2ICogZmxvYXQoVElMRVMpLCAxLjApO1xuICAgICAgICByID0gdmVjMihwb3coci54IC0gMC41LCAyLjApLCBwb3coci55IC0gMC41LCAyLjApKTtcbiAgICAgICAgcCAqPSAxLjAgLSBwb3cobWluKDEuMCwgMTIuMCAqIGRvdChyLCByKSksIDIuMCk7XG4gICAgICAgIFxuICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KENPTE9SLCAxLjApICogcDtcbiAgICAgIH1cbiAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IGJheWVyVGV4XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IGJheWVyVGV4XG4gICAgfVxuXG59XG5leHBvcnQgeyBCbGVlcHlCbG9ja3NTaGFkZXIgfVxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBOb2lzZVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgI2RlZmluZSBuUEkgMy4xNDE1OTI2NTM1ODk3OTMyXG5cbiAgICAgICAgbWF0MiBuX3JvdGF0ZTJkKGZsb2F0IGFuZ2xlKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWF0Mihjb3MoYW5nbGUpLC1zaW4oYW5nbGUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbihhbmdsZSksIGNvcyhhbmdsZSkpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBuX3N0cmlwZShmbG9hdCBudW1iZXIpIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBtb2QgPSBtb2QobnVtYmVyLCAyLjApO1xuICAgICAgICAgICAgICAgIC8vcmV0dXJuIHN0ZXAoMC41LCBtb2QpKnN0ZXAoMS41LCBtb2QpO1xuICAgICAgICAgICAgICAgIC8vcmV0dXJuIG1vZC0xLjA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1pbigxLjAsIChzbW9vdGhzdGVwKDAuMCwgMC41LCBtb2QpIC0gc21vb3Roc3RlcCgwLjUsIDEuMCwgbW9kKSkqMS4wKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKSB7XG4gICAgICAgICAgICAgICAgdmVjMiB1X3Jlc29sdXRpb24gPSBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgICAgICBmbG9hdCB1X3RpbWUgPSBpVGltZTtcbiAgICAgICAgICAgICAgICB2ZWMzIGNvbG9yO1xuICAgICAgICAgICAgICAgIHZlYzIgc3QgPSBmcmFnQ29vcmQueHk7XG4gICAgICAgICAgICAgICAgc3QgKz0gMjAwMC4wICsgOTk4MDAwLjAqc3RlcCgxLjc1LCAxLjAtc2luKHVfdGltZS84LjApKTtcbiAgICAgICAgICAgICAgICBzdCArPSB1X3RpbWUvMjAwMC4wO1xuICAgICAgICAgICAgICAgIGZsb2F0IG0gPSAoMS4wKzkuMCpzdGVwKDEuMCwgMS4wLXNpbih1X3RpbWUvOC4wKSkpLygxLjArOS4wKnN0ZXAoMS4wLCAxLjAtc2luKHVfdGltZS8xNi4wKSkpO1xuICAgICAgICAgICAgICAgIHZlYzIgc3QxID0gc3QgKiAoNDAwLjAgKyAxMjAwLjAqc3RlcCgxLjc1LCAxLjArc2luKHVfdGltZSkpIC0gMzAwLjAqc3RlcCgxLjUsIDEuMCtzaW4odV90aW1lLzMuMCkpKTtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoc2luKHN0MS54KSpzaW4oc3QxLnkpLyhtKjEwMC4wK3VfdGltZS8xMDAuMCkpICogc3Q7XG4gICAgICAgICAgICAgICAgdmVjMiBzdDIgPSBzdCAqICgxMDAuMCArIDE5MDAuMCpzdGVwKDEuNzUsIDEuMC1zaW4odV90aW1lLzIuMCkpKTtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoY29zKHN0Mi54KSpjb3Moc3QyLnkpLyhtKjEwMC4wK3VfdGltZS8xMDAuMCkpICogc3Q7XG4gICAgICAgICAgICAgICAgc3QgPSBuX3JvdGF0ZTJkKDAuNSpuUEkrKG5QSSowLjUqc3RlcCggMS4wLDEuMCsgc2luKHVfdGltZS8xLjApKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsoblBJKjAuMSpzdGVwKCAxLjAsMS4wKyBjb3ModV90aW1lLzIuMCkpKSt1X3RpbWUqMC4wMDAxKSAqIHN0O1xuICAgICAgICAgICAgICAgIHN0ICo9IDEwLjA7XG4gICAgICAgICAgICAgICAgc3QgLz0gdV9yZXNvbHV0aW9uO1xuICAgICAgICAgICAgICAgIGNvbG9yID0gdmVjMyhuX3N0cmlwZShzdC54KnVfcmVzb2x1dGlvbi54LzEwLjArdV90aW1lLzEwLjApKTtcbiAgICAgICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgICB9XG4gICAgICAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgTm9pc2VTaGFkZXIgfVxuIiwiLy8gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvWGRzQkRCXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmxldCBMaXF1aWRNYXJibGVTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiksXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAvLy8vIENPTE9SUyAvLy8vXG5cbiAgICAgIGNvbnN0IHZlYzMgT1JBTkdFID0gdmVjMygxLjAsIDAuNiwgMC4yKTtcbiAgICAgIGNvbnN0IHZlYzMgUElOSyAgID0gdmVjMygwLjcsIDAuMSwgMC40KTsgXG4gICAgICBjb25zdCB2ZWMzIEJMVUUgICA9IHZlYzMoMC4wLCAwLjIsIDAuOSk7IFxuICAgICAgY29uc3QgdmVjMyBCTEFDSyAgPSB2ZWMzKDAuMCwgMC4wLCAwLjIpO1xuICAgICAgXG4gICAgICAvLy8vLyBOT0lTRSAvLy8vL1xuICAgICAgXG4gICAgICBmbG9hdCBoYXNoKCBmbG9hdCBuICkge1xuICAgICAgICAgIC8vcmV0dXJuIGZyYWN0KHNpbihuKSo0Mzc1OC41NDUzMTIzKTsgICBcbiAgICAgICAgICByZXR1cm4gZnJhY3Qoc2luKG4pKjc1NzI4LjU0NTMxMjMpOyBcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgICBmbG9hdCBub2lzZSggaW4gdmVjMiB4ICkge1xuICAgICAgICAgIHZlYzIgcCA9IGZsb29yKHgpO1xuICAgICAgICAgIHZlYzIgZiA9IGZyYWN0KHgpO1xuICAgICAgICAgIGYgPSBmKmYqKDMuMC0yLjAqZik7XG4gICAgICAgICAgZmxvYXQgbiA9IHAueCArIHAueSo1Ny4wO1xuICAgICAgICAgIHJldHVybiBtaXgobWl4KCBoYXNoKG4gKyAwLjApLCBoYXNoKG4gKyAxLjApLCBmLngpLCBtaXgoaGFzaChuICsgNTcuMCksIGhhc2gobiArIDU4LjApLCBmLngpLCBmLnkpO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLy8vLy8gRkJNIC8vLy8vLyBcbiAgICAgIFxuICAgICAgbWF0MiBtID0gbWF0MiggMC42LCAwLjYsIC0wLjYsIDAuOCk7XG4gICAgICBmbG9hdCBmYm0odmVjMiBwKXtcbiAgICAgICBcbiAgICAgICAgICBmbG9hdCBmID0gMC4wO1xuICAgICAgICAgIGYgKz0gMC41MDAwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDI7XG4gICAgICAgICAgZiArPSAwLjI1MDAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMztcbiAgICAgICAgICBmICs9IDAuMTI1MCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAxO1xuICAgICAgICAgIGYgKz0gMC4wNjI1ICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDQ7XG4gICAgICAgICAgZiAvPSAwLjkzNzU7XG4gICAgICAgICAgcmV0dXJuIGY7XG4gICAgICB9XG4gICAgICBcbiAgICAgIFxuICAgICAgdm9pZCBtYWluSW1hZ2Uob3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCl7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gcGl4ZWwgcmF0aW9cbiAgICAgICAgICBcbiAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHkgOyAgXG4gICAgICAgICAgdmVjMiBwID0gLSAxLiArIDIuICogdXY7XG4gICAgICAgICAgcC54ICo9IGlSZXNvbHV0aW9uLnggLyBpUmVzb2x1dGlvbi55O1xuICAgICAgICAgICBcbiAgICAgICAgICAvLyBkb21haW5zXG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgciA9IHNxcnQoZG90KHAscCkpOyBcbiAgICAgICAgICBmbG9hdCBhID0gY29zKHAueSAqIHAueCk7ICBcbiAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgLy8gZGlzdG9ydGlvblxuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IGYgPSBmYm0oIDUuMCAqIHApO1xuICAgICAgICAgIGEgKz0gZmJtKHZlYzIoMS45IC0gcC54LCAwLjkgKiBpVGltZSArIHAueSkpO1xuICAgICAgICAgIGEgKz0gZmJtKDAuNCAqIHApO1xuICAgICAgICAgIHIgKz0gZmJtKDIuOSAqIHApO1xuICAgICAgICAgICAgIFxuICAgICAgICAgIC8vIGNvbG9yaXplXG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMyBjb2wgPSBCTFVFO1xuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IGZmID0gMS4wIC0gc21vb3Roc3RlcCgtMC40LCAxLjEsIG5vaXNlKHZlYzIoMC41ICogYSwgMy4zICogYSkpICk7ICAgICAgICBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIE9SQU5HRSwgZmYpO1xuICAgICAgICAgICAgIFxuICAgICAgICAgIGZmID0gMS4wIC0gc21vb3Roc3RlcCguMCwgMi44LCByICk7XG4gICAgICAgICAgY29sICs9ICBtaXgoIGNvbCwgQkxBQ0ssICBmZik7XG4gICAgICAgICAgXG4gICAgICAgICAgZmYgLT0gMS4wIC0gc21vb3Roc3RlcCgwLjMsIDAuNSwgZmJtKHZlYzIoMS4wLCA0MC4wICogYSkpICk7IFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgUElOSywgIGZmKTsgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKDIuLCAyLjksIGEgKiAxLjUgKTsgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBCTEFDSywgIGZmKTsgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoY29sLCAxLik7XG4gICAgICB9XG4gICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKG1hdC5tYXAub2Zmc2V0LngrIE1hdGgucmFuZG9tKCksIG1hdC5tYXAub2Zmc2V0LngrIE1hdGgucmFuZG9tKCkpIH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgfVxufVxuXG5leHBvcnQgeyBMaXF1aWRNYXJibGVTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvY2VjZWZiNTBlNDA4ZDEwNS5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNsR1dOXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvc21hbGwtbm9pc2UucG5nJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG59KVxuXG5sZXQgR2FsYXh5U2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy9DQlNcbiAgICAgICAgLy9QYXJhbGxheCBzY3JvbGxpbmcgZnJhY3RhbCBnYWxheHkuXG4gICAgICAgIC8vSW5zcGlyZWQgYnkgSm9zaFAncyBTaW1wbGljaXR5IHNoYWRlcjogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L2xzbEdXclxuICAgICAgICBcbiAgICAgICAgLy8gaHR0cDovL3d3dy5mcmFjdGFsZm9ydW1zLmNvbS9uZXctdGhlb3JpZXMtYW5kLXJlc2VhcmNoL3Zlcnktc2ltcGxlLWZvcm11bGEtZm9yLWZyYWN0YWwtcGF0dGVybnMvXG4gICAgICAgIGZsb2F0IGZpZWxkKGluIHZlYzMgcCxmbG9hdCBzKSB7XG4gICAgICAgICAgICBmbG9hdCBzdHJlbmd0aCA9IDcuICsgLjAzICogbG9nKDEuZS02ICsgZnJhY3Qoc2luKGlUaW1lKSAqIDQzNzMuMTEpKTtcbiAgICAgICAgICAgIGZsb2F0IGFjY3VtID0gcy80LjtcbiAgICAgICAgICAgIGZsb2F0IHByZXYgPSAwLjtcbiAgICAgICAgICAgIGZsb2F0IHR3ID0gMC47XG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IDI2OyArK2kpIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBtYWcgPSBkb3QocCwgcCk7XG4gICAgICAgICAgICAgICAgcCA9IGFicyhwKSAvIG1hZyArIHZlYzMoLS41LCAtLjQsIC0xLjUpO1xuICAgICAgICAgICAgICAgIGZsb2F0IHcgPSBleHAoLWZsb2F0KGkpIC8gNy4pO1xuICAgICAgICAgICAgICAgIGFjY3VtICs9IHcgKiBleHAoLXN0cmVuZ3RoICogcG93KGFicyhtYWcgLSBwcmV2KSwgMi4yKSk7XG4gICAgICAgICAgICAgICAgdHcgKz0gdztcbiAgICAgICAgICAgICAgICBwcmV2ID0gbWFnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1heCgwLiwgNS4gKiBhY2N1bSAvIHR3IC0gLjcpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBMZXNzIGl0ZXJhdGlvbnMgZm9yIHNlY29uZCBsYXllclxuICAgICAgICBmbG9hdCBmaWVsZDIoaW4gdmVjMyBwLCBmbG9hdCBzKSB7XG4gICAgICAgICAgICBmbG9hdCBzdHJlbmd0aCA9IDcuICsgLjAzICogbG9nKDEuZS02ICsgZnJhY3Qoc2luKGlUaW1lKSAqIDQzNzMuMTEpKTtcbiAgICAgICAgICAgIGZsb2F0IGFjY3VtID0gcy80LjtcbiAgICAgICAgICAgIGZsb2F0IHByZXYgPSAwLjtcbiAgICAgICAgICAgIGZsb2F0IHR3ID0gMC47XG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IDE4OyArK2kpIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBtYWcgPSBkb3QocCwgcCk7XG4gICAgICAgICAgICAgICAgcCA9IGFicyhwKSAvIG1hZyArIHZlYzMoLS41LCAtLjQsIC0xLjUpO1xuICAgICAgICAgICAgICAgIGZsb2F0IHcgPSBleHAoLWZsb2F0KGkpIC8gNy4pO1xuICAgICAgICAgICAgICAgIGFjY3VtICs9IHcgKiBleHAoLXN0cmVuZ3RoICogcG93KGFicyhtYWcgLSBwcmV2KSwgMi4yKSk7XG4gICAgICAgICAgICAgICAgdHcgKz0gdztcbiAgICAgICAgICAgICAgICBwcmV2ID0gbWFnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG1heCgwLiwgNS4gKiBhY2N1bSAvIHR3IC0gLjcpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIG5yYW5kMyggdmVjMiBjbyApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgYSA9IGZyYWN0KCBjb3MoIGNvLngqOC4zZS0zICsgY28ueSApKnZlYzMoMS4zZTUsIDQuN2U1LCAyLjllNSkgKTtcbiAgICAgICAgICAgIHZlYzMgYiA9IGZyYWN0KCBzaW4oIGNvLngqMC4zZS0zICsgY28ueSApKnZlYzMoOC4xZTUsIDEuMGU1LCAwLjFlNSkgKTtcbiAgICAgICAgICAgIHZlYzMgYyA9IG1peChhLCBiLCAwLjUpO1xuICAgICAgICAgICAgcmV0dXJuIGM7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSAyLiAqIGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5IC0gMS47XG4gICAgICAgICAgICB2ZWMyIHV2cyA9IHV2ICogaVJlc29sdXRpb24ueHkgLyBtYXgoaVJlc29sdXRpb24ueCwgaVJlc29sdXRpb24ueSk7XG4gICAgICAgICAgICB2ZWMzIHAgPSB2ZWMzKHV2cyAvIDQuLCAwKSArIHZlYzMoMS4sIC0xLjMsIDAuKTtcbiAgICAgICAgICAgIHAgKz0gLjIgKiB2ZWMzKHNpbihpVGltZSAvIDE2LiksIHNpbihpVGltZSAvIDEyLiksICBzaW4oaVRpbWUgLyAxMjguKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGZyZXFzWzRdO1xuICAgICAgICAgICAgLy9Tb3VuZFxuICAgICAgICAgICAgZnJlcXNbMF0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMDEsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1sxXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4wNywgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzJdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjE1LCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbM10gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMzAsIDAuMjUgKSApLng7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdCA9IGZpZWxkKHAsZnJlcXNbMl0pO1xuICAgICAgICAgICAgZmxvYXQgdiA9ICgxLiAtIGV4cCgoYWJzKHV2LngpIC0gMS4pICogNi4pKSAqICgxLiAtIGV4cCgoYWJzKHV2LnkpIC0gMS4pICogNi4pKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9TZWNvbmQgTGF5ZXJcbiAgICAgICAgICAgIHZlYzMgcDIgPSB2ZWMzKHV2cyAvICg0LitzaW4oaVRpbWUqMC4xMSkqMC4yKzAuMitzaW4oaVRpbWUqMC4xNSkqMC4zKzAuNCksIDEuNSkgKyB2ZWMzKDIuLCAtMS4zLCAtMS4pO1xuICAgICAgICAgICAgcDIgKz0gMC4yNSAqIHZlYzMoc2luKGlUaW1lIC8gMTYuKSwgc2luKGlUaW1lIC8gMTIuKSwgIHNpbihpVGltZSAvIDEyOC4pKTtcbiAgICAgICAgICAgIGZsb2F0IHQyID0gZmllbGQyKHAyLGZyZXFzWzNdKTtcbiAgICAgICAgICAgIHZlYzQgYzIgPSBtaXgoLjQsIDEuLCB2KSAqIHZlYzQoMS4zICogdDIgKiB0MiAqIHQyICwxLjggICogdDIgKiB0MiAsIHQyKiBmcmVxc1swXSwgdDIpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vTGV0J3MgYWRkIHNvbWUgc3RhcnNcbiAgICAgICAgICAgIC8vVGhhbmtzIHRvIGh0dHA6Ly9nbHNsLmhlcm9rdS5jb20vZSM2OTA0LjBcbiAgICAgICAgICAgIHZlYzIgc2VlZCA9IHAueHkgKiAyLjA7XHRcbiAgICAgICAgICAgIHNlZWQgPSBmbG9vcihzZWVkICogaVJlc29sdXRpb24ueCk7XG4gICAgICAgICAgICB2ZWMzIHJuZCA9IG5yYW5kMyggc2VlZCApO1xuICAgICAgICAgICAgdmVjNCBzdGFyY29sb3IgPSB2ZWM0KHBvdyhybmQueSw0MC4wKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vU2Vjb25kIExheWVyXG4gICAgICAgICAgICB2ZWMyIHNlZWQyID0gcDIueHkgKiAyLjA7XG4gICAgICAgICAgICBzZWVkMiA9IGZsb29yKHNlZWQyICogaVJlc29sdXRpb24ueCk7XG4gICAgICAgICAgICB2ZWMzIHJuZDIgPSBucmFuZDMoIHNlZWQyICk7XG4gICAgICAgICAgICBzdGFyY29sb3IgKz0gdmVjNChwb3cocm5kMi55LDQwLjApKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnJhZ0NvbG9yID0gbWl4KGZyZXFzWzNdLS4zLCAxLiwgdikgKiB2ZWM0KDEuNSpmcmVxc1syXSAqIHQgKiB0KiB0ICwgMS4yKmZyZXFzWzFdICogdCAqIHQsIGZyZXFzWzNdKnQsIDEuMCkrYzIrc3RhcmNvbG9yO1xuICAgICAgICB9XG4gICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTAwMDAwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBHYWxheHlTaGFkZXIgfVxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy80c0dTemNcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBMYWNlVHVubmVsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gQ3JlYXRlZCBieSBTdGVwaGFuZSBDdWlsbGVyZGllciAtIEFpZWtpY2svMjAxNSAodHdpdHRlcjpAYWlla2ljaylcbiAgICAgICAgLy8gTGljZW5zZSBDcmVhdGl2ZSBDb21tb25zIEF0dHJpYnV0aW9uLU5vbkNvbW1lcmNpYWwtU2hhcmVBbGlrZSAzLjAgVW5wb3J0ZWQgTGljZW5zZS5cbiAgICAgICAgLy8gVHVuZWQgdmlhIFhTaGFkZSAoaHR0cDovL3d3dy5mdW5wYXJhZGlnbS5jb20veHNoYWRlLylcbiAgICAgICAgXG4gICAgICAgIHZlYzIgbHRfbW8gPSB2ZWMyKDApO1xuICAgICAgICBcbiAgICAgICAgZmxvYXQgbHRfcG4oIGluIHZlYzMgeCApIC8vIGlxIG5vaXNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgcCA9IGZsb29yKHgpO1xuICAgICAgICAgICAgdmVjMyBmID0gZnJhY3QoeCk7XG4gICAgICAgICAgICBmID0gZipmKigzLjAtMi4wKmYpO1xuICAgICAgICAgICAgdmVjMiB1diA9IChwLnh5K3ZlYzIoMzcuMCwxNy4wKSpwLnopICsgZi54eTtcbiAgICAgICAgICAgIHZlYzIgcmcgPSB0ZXh0dXJlKGlDaGFubmVsMCwgKHV2KyAwLjUpLzI1Ni4wLCAtMTAwLjAgKS55eDtcbiAgICAgICAgICAgIHJldHVybiAtMS4wKzIuNCptaXgoIHJnLngsIHJnLnksIGYueiApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMyIGx0X3BhdGgoZmxvYXQgdClcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIHZlYzIoY29zKHQqMC4yKSwgc2luKHQqMC4yKSkgKiAyLjtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teCA9IG1hdDMoMSwwLDAsMCw3LDAsMCwwLDcpO1xuICAgICAgICBjb25zdCBtYXQzIGx0X215ID0gbWF0Myg3LDAsMCwwLDEsMCwwLDAsNyk7XG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXogPSBtYXQzKDcsMCwwLDAsNywwLDAsMCwxKTtcbiAgICAgICAgXG4gICAgICAgIC8vIGJhc2Ugb24gc2hhbmUgdGVjaCBpbiBzaGFkZXIgOiBPbmUgVHdlZXQgQ2VsbHVsYXIgUGF0dGVyblxuICAgICAgICBmbG9hdCBsdF9mdW5jKHZlYzMgcClcbiAgICAgICAge1xuICAgICAgICAgICAgcCA9IGZyYWN0KHAvNjguNikgLSAuNTtcbiAgICAgICAgICAgIHJldHVybiBtaW4obWluKGFicyhwLngpLCBhYnMocC55KSksIGFicyhwLnopKSArIDAuMTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBsdF9lZmZlY3QodmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwICo9IGx0X216ICogbHRfbXggKiBsdF9teSAqIHNpbihwLnp4eSk7IC8vIHNpbihwLnp4eSkgaXMgYmFzZWQgb24gaXEgdGVjaCBmcm9tIHNoYWRlciAoU2N1bHB0dXJlIElJSSlcbiAgICAgICAgICAgIHJldHVybiB2ZWMzKG1pbihtaW4obHRfZnVuYyhwKmx0X214KSwgbHRfZnVuYyhwKmx0X215KSksIGx0X2Z1bmMocCpsdF9teikpLy42KTtcbiAgICAgICAgfVxuICAgICAgICAvL1xuICAgICAgICBcbiAgICAgICAgdmVjNCBsdF9kaXNwbGFjZW1lbnQodmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGNvbCA9IDEuLWx0X2VmZmVjdChwKjAuOCk7XG4gICAgICAgICAgICAgICBjb2wgPSBjbGFtcChjb2wsIC0uNSwgMS4pO1xuICAgICAgICAgICAgZmxvYXQgZGlzdCA9IGRvdChjb2wsdmVjMygwLjAyMykpO1xuICAgICAgICAgICAgY29sID0gc3RlcChjb2wsIHZlYzMoMC44MikpOy8vIGJsYWNrIGxpbmUgb24gc2hhcGVcbiAgICAgICAgICAgIHJldHVybiB2ZWM0KGRpc3QsY29sKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjNCBsdF9tYXAodmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwLnh5IC09IGx0X3BhdGgocC56KTtcbiAgICAgICAgICAgIHZlYzQgZGlzcCA9IGx0X2Rpc3BsYWNlbWVudChzaW4ocC56eHkqMi4pKjAuOCk7XG4gICAgICAgICAgICBwICs9IHNpbihwLnp4eSouNSkqMS41O1xuICAgICAgICAgICAgZmxvYXQgbCA9IGxlbmd0aChwLnh5KSAtIDQuO1xuICAgICAgICAgICAgcmV0dXJuIHZlYzQobWF4KC1sICsgMC4wOSwgbCkgLSBkaXNwLngsIGRpc3AueXp3KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdmVjMyBsdF9ub3IoIGluIHZlYzMgcG9zLCBmbG9hdCBwcmVjIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBlcHMgPSB2ZWMzKCBwcmVjLCAwLiwgMC4gKTtcbiAgICAgICAgICAgIHZlYzMgbHRfbm9yID0gdmVjMyhcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy54eXkpLnggLSBsdF9tYXAocG9zLWVwcy54eXkpLngsXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueXh5KS54IC0gbHRfbWFwKHBvcy1lcHMueXh5KS54LFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnl5eCkueCAtIGx0X21hcChwb3MtZXBzLnl5eCkueCApO1xuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZShsdF9ub3IpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgdmVjNCBsdF9saWdodCh2ZWMzIHJvLCB2ZWMzIHJkLCBmbG9hdCBkLCB2ZWMzIGxpZ2h0cG9zLCB2ZWMzIGxjKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIHAgPSBybyArIHJkICogZDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gb3JpZ2luYWwgbm9ybWFsZVxuICAgICAgICAgICAgdmVjMyBuID0gbHRfbm9yKHAsIDAuMSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgbGlnaHRkaXIgPSBsaWdodHBvcyAtIHA7XG4gICAgICAgICAgICBmbG9hdCBsaWdodGxlbiA9IGxlbmd0aChsaWdodHBvcyAtIHApO1xuICAgICAgICAgICAgbGlnaHRkaXIgLz0gbGlnaHRsZW47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGFtYiA9IDAuNjtcbiAgICAgICAgICAgIGZsb2F0IGRpZmYgPSBjbGFtcCggZG90KCBuLCBsaWdodGRpciApLCAwLjAsIDEuMCApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBicmRmID0gdmVjMygwKTtcbiAgICAgICAgICAgIGJyZGYgKz0gYW1iICogdmVjMygwLjIsMC41LDAuMyk7IC8vIGNvbG9yIG1hdFxuICAgICAgICAgICAgYnJkZiArPSBkaWZmICogMC42O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBicmRmID0gbWl4KGJyZGYsIGx0X21hcChwKS55encsIDAuNSk7Ly8gbWVyZ2UgbGlnaHQgYW5kIGJsYWNrIGxpbmUgcGF0dGVyblxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHZlYzQoYnJkZiwgbGlnaHRsZW4pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X3N0YXJzKHZlYzIgdXYsIHZlYzMgcmQsIGZsb2F0IGQsIHZlYzIgcywgdmVjMiBnKVxuICAgICAgICB7XG4gICAgICAgICAgICB1diAqPSA4MDAuICogcy54L3MueTtcbiAgICAgICAgICAgIGZsb2F0IGsgPSBmcmFjdCggY29zKHV2LnkgKiAwLjAwMDEgKyB1di54KSAqIDkwMDAwLik7XG4gICAgICAgICAgICBmbG9hdCB2YXIgPSBzaW4obHRfcG4oZCowLjYrcmQqMTgyLjE0KSkqMC41KzAuNTsvLyB0aGFuayB0byBrbGVtcyBmb3IgdGhlIHZhcmlhdGlvbiBpbiBteSBzaGFkZXIgc3VibHVtaW5pY1xuICAgICAgICAgICAgdmVjMyBjb2wgPSB2ZWMzKG1peCgwLiwgMS4sIHZhcipwb3coaywgMjAwLikpKTsvLyBjb21lIGZyb20gQ0JTIFNoYWRlciBcIlNpbXBsaWNpdHlcIiA6IGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc2xHV05cbiAgICAgICAgICAgIHJldHVybiBjb2w7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vLy8vLy8vTUFJTi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHMgPSBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgIHZlYzIgZyA9IGZyYWdDb29yZDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHRpbWUgPSBpVGltZSoxLjA7XG4gICAgICAgICAgICBmbG9hdCBjYW1fYSA9IHRpbWU7IC8vIGFuZ2xlIHpcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgY2FtX2UgPSAzLjI7IC8vIGVsZXZhdGlvblxuICAgICAgICAgICAgZmxvYXQgY2FtX2QgPSA0LjsgLy8gZGlzdGFuY2UgdG8gb3JpZ2luIGF4aXNcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgbWF4ZCA9IDQwLjsgLy8gcmF5IG1hcmNoaW5nIGRpc3RhbmNlIG1heFxuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIHV2ID0gKGcqMi4tcykvcy55O1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHZlYzMoMC4pO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgcm8gPSB2ZWMzKGx0X3BhdGgodGltZSkrbHRfbW8sdGltZSk7XG4gICAgICAgICAgICAgIHZlYzMgY3YgPSB2ZWMzKGx0X3BhdGgodGltZSswLjEpK2x0X21vLHRpbWUrMC4xKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBjdT12ZWMzKDAsMSwwKTtcbiAgICAgICAgICAgICAgdmVjMyByb3YgPSBub3JtYWxpemUoY3Ytcm8pO1xuICAgICAgICAgICAgdmVjMyB1ID0gbm9ybWFsaXplKGNyb3NzKGN1LHJvdikpO1xuICAgICAgICAgICAgICB2ZWMzIHYgPSBjcm9zcyhyb3YsdSk7XG4gICAgICAgICAgICAgIHZlYzMgcmQgPSBub3JtYWxpemUocm92ICsgdXYueCp1ICsgdXYueSp2KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBjdXJ2ZTAgPSB2ZWMzKDApO1xuICAgICAgICAgICAgdmVjMyBjdXJ2ZTEgPSB2ZWMzKDApO1xuICAgICAgICAgICAgdmVjMyBjdXJ2ZTIgPSB2ZWMzKDApO1xuICAgICAgICAgICAgZmxvYXQgb3V0U3RlcCA9IDAuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBhbyA9IDAuOyAvLyBhbyBsb3cgY29zdCA6KVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBzdCA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgZCA9IDAuO1xuICAgICAgICAgICAgZm9yKGludCBpPTA7aTwyNTA7aSsrKVxuICAgICAgICAgICAgeyAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChzdDwwLjAyNSpsb2coZCpkL3N0LzFlNSl8fGQ+bWF4ZCkgYnJlYWs7Ly8gc3BlY2lhbCBicmVhayBjb25kaXRpb24gZm9yIGxvdyB0aGlja25lc3Mgb2JqZWN0XG4gICAgICAgICAgICAgICAgc3QgPSBsdF9tYXAocm8rcmQqZCkueDtcbiAgICAgICAgICAgICAgICBkICs9IHN0ICogMC42OyAvLyB0aGUgMC42IGlzIHNlbGVjdGVkIGFjY29yZGluZyB0byB0aGUgMWU1IGFuZCB0aGUgMC4wMjUgb2YgdGhlIGJyZWFrIGNvbmRpdGlvbiBmb3IgZ29vZCByZXN1bHRcbiAgICAgICAgICAgICAgICBhbysrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZCA8IG1heGQpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmVjNCBsaSA9IGx0X2xpZ2h0KHJvLCByZCwgZCwgcm8sIHZlYzMoMCkpOy8vIHBvaW50IGxpZ2h0IG9uIHRoZSBjYW1cbiAgICAgICAgICAgICAgICBjb2wgPSBsaS54eXovKGxpLncqMC4yKTsvLyBjaGVhcCBsaWdodCBhdHRlbnVhdGlvblxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgIGNvbCA9IG1peCh2ZWMzKDEuLWFvLzEwMC4pLCBjb2wsIDAuNSk7Ly8gbG93IGNvc3QgYW8gOilcbiAgICAgICAgICAgICAgICBmcmFnQ29sb3IucmdiID0gbWl4KCBjb2wsIHZlYzMoMCksIDEuMC1leHAoIC0wLjAwMypkKmQgKSApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgZnJhZ0NvbG9yLnJnYiA9IGx0X3N0YXJzKHV2LCByZCwgZCwgcywgZnJhZ0Nvb3JkKTsvLyBzdGFycyBiZ1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB2aWduZXR0ZVxuICAgICAgICAgICAgdmVjMiBxID0gZnJhZ0Nvb3JkL3M7XG4gICAgICAgICAgICBmcmFnQ29sb3IucmdiICo9IDAuNSArIDAuNSpwb3coIDE2LjAqcS54KnEueSooMS4wLXEueCkqKDEuMC1xLnkpLCAwLjI1ICk7IC8vIGlxIHZpZ25ldHRlXG4gICAgICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgIH1cbn1cblxuZXhwb3J0IHsgTGFjZVR1bm5lbFNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9mMjdlMDEwNDYwNWYwY2Q3LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9NZGZHUlhcblxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9ub2lzZS0yNTYucG5nJ1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgaUNoYW5uZWxSZXNvbHV0aW9uOiB7IHZhbHVlOiBbIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKV0gfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG4gICAgY29uc29sZS5sb2coIFwibm9pc2UgdGV4dHVyZSBzaXplOiBcIiwgbm9pc2UuaW1hZ2Uud2lkdGgsbm9pc2UuaW1hZ2UuaGVpZ2h0ICk7XG59KVxuXG5sZXQgRmlyZVR1bm5lbFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgdW5pZm9ybSB2ZWMzIGlDaGFubmVsUmVzb2x1dGlvbls0XTtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBDcmVhdGVkIGJ5IGluaWdvIHF1aWxleiAtIGlxLzIwMTNcbi8vIEkgc2hhcmUgdGhpcyBwaWVjZSAoYXJ0IGFuZCBjb2RlKSBoZXJlIGluIFNoYWRlcnRveSBhbmQgdGhyb3VnaCBpdHMgUHVibGljIEFQSSwgb25seSBmb3IgZWR1Y2F0aW9uYWwgcHVycG9zZXMuIFxuLy8gWW91IGNhbm5vdCB1c2UsIHNlbGwsIHNoYXJlIG9yIGhvc3QgdGhpcyBwaWVjZSBvciBtb2RpZmljYXRpb25zIG9mIGl0IGFzIHBhcnQgb2YgeW91ciBvd24gY29tbWVyY2lhbCBvciBub24tY29tbWVyY2lhbCBwcm9kdWN0LCB3ZWJzaXRlIG9yIHByb2plY3QuXG4vLyBZb3UgY2FuIHNoYXJlIGEgbGluayB0byBpdCBvciBhbiB1bm1vZGlmaWVkIHNjcmVlbnNob3Qgb2YgaXQgcHJvdmlkZWQgeW91IGF0dHJpYnV0ZSBcImJ5IEluaWdvIFF1aWxleiwgQGlxdWlsZXpsZXMgYW5kIGlxdWlsZXpsZXMub3JnXCIuIFxuLy8gSWYgeW91IGFyZSBhIHRlY2hlciwgbGVjdHVyZXIsIGVkdWNhdG9yIG9yIHNpbWlsYXIgYW5kIHRoZXNlIGNvbmRpdGlvbnMgYXJlIHRvbyByZXN0cmljdGl2ZSBmb3IgeW91ciBuZWVkcywgcGxlYXNlIGNvbnRhY3QgbWUgYW5kIHdlJ2xsIHdvcmsgaXQgb3V0LlxuXG5mbG9hdCBmaXJlX25vaXNlKCBpbiB2ZWMzIHggKVxue1xuICAgIHZlYzMgcCA9IGZsb29yKHgpO1xuICAgIHZlYzMgZiA9IGZyYWN0KHgpO1xuXHRmID0gZipmKigzLjAtMi4wKmYpO1xuXHRcblx0dmVjMiB1diA9IChwLnh5K3ZlYzIoMzcuMCwxNy4wKSpwLnopICsgZi54eTtcblx0dmVjMiByZyA9IHRleHR1cmVMb2QoIGlDaGFubmVsMCwgKHV2KyAwLjUpLzI1Ni4wLCAwLjAgKS55eDtcblx0cmV0dXJuIG1peCggcmcueCwgcmcueSwgZi56ICk7XG59XG5cbnZlYzQgZmlyZV9tYXAoIHZlYzMgcCApXG57XG5cdGZsb2F0IGRlbiA9IDAuMiAtIHAueTtcblxuICAgIC8vIGludmVydCBzcGFjZVx0XG5cdHAgPSAtNy4wKnAvZG90KHAscCk7XG5cbiAgICAvLyB0d2lzdCBzcGFjZVx0XG5cdGZsb2F0IGNvID0gY29zKGRlbiAtIDAuMjUqaVRpbWUpO1xuXHRmbG9hdCBzaSA9IHNpbihkZW4gLSAwLjI1KmlUaW1lKTtcblx0cC54eiA9IG1hdDIoY28sLXNpLHNpLGNvKSpwLnh6O1xuXG4gICAgLy8gc21va2VcdFxuXHRmbG9hdCBmO1xuXHR2ZWMzIHEgPSBwICAgICAgICAgICAgICAgICAgICAgICAgICAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lOztcbiAgICBmICA9IDAuNTAwMDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAyIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjI1MDAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMyAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4xMjUwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDEgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMDYyNTAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAyIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjAzMTI1KmZpcmVfbm9pc2UoIHEgKTtcblxuXHRkZW4gPSBjbGFtcCggZGVuICsgNC4wKmYsIDAuMCwgMS4wICk7XG5cdFxuXHR2ZWMzIGNvbCA9IG1peCggdmVjMygxLjAsMC45LDAuOCksIHZlYzMoMC40LDAuMTUsMC4xKSwgZGVuICkgKyAwLjA1KnNpbihwKTtcblx0XG5cdHJldHVybiB2ZWM0KCBjb2wsIGRlbiApO1xufVxuXG52ZWMzIHJheW1hcmNoKCBpbiB2ZWMzIHJvLCBpbiB2ZWMzIHJkLCBpbiB2ZWMyIHBpeGVsIClcbntcblx0dmVjNCBzdW0gPSB2ZWM0KCAwLjAgKTtcblxuXHRmbG9hdCB0ID0gMC4wO1xuXG4gICAgLy8gZGl0aGVyaW5nXHRcblx0dCArPSAwLjA1KnRleHR1cmVMb2QoIGlDaGFubmVsMCwgcGl4ZWwueHkvaUNoYW5uZWxSZXNvbHV0aW9uWzBdLngsIDAuMCApLng7XG5cdFxuXHRmb3IoIGludCBpPTA7IGk8MTAwOyBpKysgKVxuXHR7XG5cdFx0aWYoIHN1bS5hID4gMC45OSApIGJyZWFrO1xuXHRcdFxuXHRcdHZlYzMgcG9zID0gcm8gKyB0KnJkO1xuXHRcdHZlYzQgY29sID0gZmlyZV9tYXAoIHBvcyApO1xuXHRcdFxuXHRcdGNvbC54eXogKj0gbWl4KCAzLjEqdmVjMygxLjAsMC41LDAuMDUpLCB2ZWMzKDAuNDgsMC41MywwLjUpLCBjbGFtcCggKHBvcy55LTAuMikvMi4wLCAwLjAsIDEuMCApICk7XG5cdFx0XG5cdFx0Y29sLmEgKj0gMC42O1xuXHRcdGNvbC5yZ2IgKj0gY29sLmE7XG5cblx0XHRzdW0gPSBzdW0gKyBjb2wqKDEuMCAtIHN1bS5hKTtcdFxuXG5cdFx0dCArPSAwLjA1O1xuXHR9XG5cblx0cmV0dXJuIGNsYW1wKCBzdW0ueHl6LCAwLjAsIDEuMCApO1xufVxuXG52b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG57XG5cdHZlYzIgcSA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgIHZlYzIgcCA9IC0xLjAgKyAyLjAqcTtcbiAgICBwLnggKj0gaVJlc29sdXRpb24ueC8gaVJlc29sdXRpb24ueTtcblx0XG4gICAgdmVjMiBtbyA9IHZlYzIoMC41LDAuNSk7IC8vaU1vdXNlLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgLy9pZiggaU1vdXNlLnc8PTAuMDAwMDEgKSBtbz12ZWMyKDAuMCk7XG5cdFxuICAgIC8vIGNhbWVyYVxuICAgIHZlYzMgcm8gPSA0LjAqbm9ybWFsaXplKHZlYzMoY29zKDMuMCptby54KSwgMS40IC0gMS4wKihtby55LS4xKSwgc2luKDMuMCptby54KSkpO1xuXHR2ZWMzIHRhID0gdmVjMygwLjAsIDEuMCwgMC4wKTtcblx0ZmxvYXQgY3IgPSAwLjUqY29zKDAuNyppVGltZSk7XG5cdFxuICAgIC8vIHNoYWtlXHRcdFxuXHRybyArPSAwLjEqKC0xLjArMi4wKnRleHR1cmVMb2QoIGlDaGFubmVsMCwgaVRpbWUqdmVjMigwLjAxMCwwLjAxNCksIDAuMCApLnh5eik7XG5cdHRhICs9IDAuMSooLTEuMCsyLjAqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBpVGltZSp2ZWMyKDAuMDEzLDAuMDA4KSwgMC4wICkueHl6KTtcblx0XG5cdC8vIGJ1aWxkIHJheVxuICAgIHZlYzMgd3cgPSBub3JtYWxpemUoIHRhIC0gcm8pO1xuICAgIHZlYzMgdXUgPSBub3JtYWxpemUoY3Jvc3MoIHZlYzMoc2luKGNyKSxjb3MoY3IpLDAuMCksIHd3ICkpO1xuICAgIHZlYzMgdnYgPSBub3JtYWxpemUoY3Jvc3Mod3csdXUpKTtcbiAgICB2ZWMzIHJkID0gbm9ybWFsaXplKCBwLngqdXUgKyBwLnkqdnYgKyAyLjAqd3cgKTtcblx0XG4gICAgLy8gcmF5bWFyY2hcdFxuXHR2ZWMzIGNvbCA9IHJheW1hcmNoKCBybywgcmQsIGZyYWdDb29yZCApO1xuXHRcblx0Ly8gY29udHJhc3QgYW5kIHZpZ25ldHRpbmdcdFxuXHRjb2wgPSBjb2wqMC41ICsgMC41KmNvbCpjb2wqKDMuMC0yLjAqY29sKTtcblx0Y29sICo9IDAuMjUgKyAwLjc1KnBvdyggMTYuMCpxLngqcS55KigxLjAtcS54KSooMS4wLXEueSksIDAuMSApO1xuXHRcbiAgICBmcmFnQ29sb3IgPSB2ZWM0KCBjb2wsIDEuMCApO1xufVxuXG4gICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTAwMDAwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsUmVzb2x1dGlvbi52YWx1ZVswXS54ID0gbm9pc2VUZXguaW1hZ2Uud2lkdGhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWxSZXNvbHV0aW9uLnZhbHVlWzBdLnkgPSBub2lzZVRleC5pbWFnZS5oZWlnaHRcbiAgICB9XG59XG5cbmV4cG9ydCB7IEZpcmVUdW5uZWxTaGFkZXIgfVxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy83bGZYUkJcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IE1pc3RTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiksXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG5cbiAgICAgICAgZmxvYXQgbXJhbmQodmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJldHVybiBmcmFjdChzaW4oZG90KGNvb3JkcywgdmVjMig1Ni4zNDU2LDc4LjM0NTYpKSAqIDUuMCkgKiAxMDAwMC4wKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbW5vaXNlKHZlYzIgY29vcmRzKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIGkgPSBmbG9vcihjb29yZHMpO1xuICAgICAgICAgICAgdmVjMiBmID0gZnJhY3QoY29vcmRzKTtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBhID0gbXJhbmQoaSk7XG4gICAgICAgICAgICBmbG9hdCBiID0gbXJhbmQoaSArIHZlYzIoMS4wLCAwLjApKTtcbiAgICAgICAgICAgIGZsb2F0IGMgPSBtcmFuZChpICsgdmVjMigwLjAsIDEuMCkpO1xuICAgICAgICAgICAgZmxvYXQgZCA9IG1yYW5kKGkgKyB2ZWMyKDEuMCwgMS4wKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMiBjdWJpYyA9IGYgKiBmICogKDMuMCAtIDIuMCAqIGYpO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBtaXgoYSwgYiwgY3ViaWMueCkgKyAoYyAtIGEpICogY3ViaWMueSAqICgxLjAgLSBjdWJpYy54KSArIChkIC0gYikgKiBjdWJpYy54ICogY3ViaWMueTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgZmJtKHZlYzIgY29vcmRzKVxuICAgICAgICB7XG4gICAgICAgICAgICBmbG9hdCB2YWx1ZSA9IDAuMDtcbiAgICAgICAgICAgIGZsb2F0IHNjYWxlID0gMC41O1xuICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMTA7IGkrKylcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBtbm9pc2UoY29vcmRzKSAqIHNjYWxlO1xuICAgICAgICAgICAgICAgIGNvb3JkcyAqPSA0LjA7XG4gICAgICAgICAgICAgICAgc2NhbGUgKj0gMC41O1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnkgKiAyLjA7XG4gICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGZpbmFsID0gMC4wO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0xOyBpIDwgNjsgaSsrKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZlYzIgbW90aW9uID0gdmVjMihmYm0odXYgKyB2ZWMyKDAuMCxpVGltZSkgKiAwLjA1ICsgdmVjMihpLCAwLjApKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGZpbmFsICs9IGZibSh1diArIG1vdGlvbik7XG4gICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmaW5hbCAvPSA1LjA7XG4gICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KG1peCh2ZWMzKC0wLjMpLCB2ZWMzKDAuNDUsIDAuNCwgMC42KSArIHZlYzMoMC42KSwgZmluYWwpLCAxKTtcbiAgICAgICAgfVxuICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEyKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgTWlzdFNoYWRlciB9XG4iLCIvLyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9YZHNCREJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3Qgc3RhdGUgPSB7XG4gICAgYW5pbWF0ZTogZmFsc2UsXG4gICAgbm9pc2VNb2RlOiAnc2NhbGUnLFxuICAgIGludmVydDogZmFsc2UsXG4gICAgc2hhcnBlbjogdHJ1ZSxcbiAgICBzY2FsZUJ5UHJldjogZmFsc2UsXG4gICAgZ2FpbjogMC41NCxcbiAgICBsYWN1bmFyaXR5OiAyLjAsXG4gICAgb2N0YXZlczogNSxcbiAgICBzY2FsZTE6IDMuMCxcbiAgICBzY2FsZTI6IDMuMCxcbiAgICB0aW1lU2NhbGVYOiAwLjQsXG4gICAgdGltZVNjYWxlWTogMC4zLFxuICAgIGNvbG9yMTogWzAsIDAsIDBdLFxuICAgIGNvbG9yMjogWzEzMCwgMTI5LDEyOV0sXG4gICAgY29sb3IzOiBbMTEwLCAxMTAsIDExMF0sXG4gICAgY29sb3I0OiBbODIsIDUxLCAxM10sXG4gICAgb2Zmc2V0QVg6IDAsXG4gICAgb2Zmc2V0QVk6IDAsXG4gICAgb2Zmc2V0Qlg6IDMuNyxcbiAgICBvZmZzZXRCWTogMC45LFxuICAgIG9mZnNldENYOiAyLjEsXG4gICAgb2Zmc2V0Q1k6IDMuMixcbiAgICBvZmZzZXREWDogNC4zLFxuICAgIG9mZnNldERZOiAyLjgsXG4gICAgb2Zmc2V0WDogMCxcbiAgICBvZmZzZXRZOiAwLFxufTtcblxubGV0IE1hcmJsZTFTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3Jtczoge1xuICAgICAgICBtYl9hbmltYXRlOiB7IHZhbHVlOiBzdGF0ZS5hbmltYXRlIH0sXG4gICAgICAgIG1iX2NvbG9yMTogeyB2YWx1ZTogc3RhdGUuY29sb3IxLm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2NvbG9yMjogeyB2YWx1ZTogc3RhdGUuY29sb3IyLm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2NvbG9yMzogeyB2YWx1ZTogc3RhdGUuY29sb3IzLm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2NvbG9yNDogeyB2YWx1ZTogc3RhdGUuY29sb3I0Lm1hcChjID0+IGMgLyAyNTUpIH0sXG4gICAgICAgIG1iX2dhaW46IHsgdmFsdWU6IHN0YXRlLmdhaW4gfSxcbiAgICAgICAgbWJfaW52ZXJ0OiB7IHZhbHVlOiBzdGF0ZS5pbnZlcnQgfSxcbiAgICAgICAgbWJfbGFjdW5hcml0eTogeyB2YWx1ZTogc3RhdGUubGFjdW5hcml0eSB9LFxuICAgICAgICBtYl9ub2lzZU1vZGU6IHsgdmFsdWU6IHN0YXRlLm5vaXNlTW9kZSA9PT0gJ3NjYWxlJyA/IDAgOiAxIH0sXG4gICAgICAgIG1iX29jdGF2ZXM6IHsgdmFsdWU6IHN0YXRlLm9jdGF2ZXMgfSxcbiAgICAgICAgbWJfb2Zmc2V0OiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0WCwgc3RhdGUub2Zmc2V0WV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0QTogeyB2YWx1ZTogW3N0YXRlLm9mZnNldEFYLCBzdGF0ZS5vZmZzZXRBWV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0QjogeyB2YWx1ZTogW3N0YXRlLm9mZnNldEJYLCBzdGF0ZS5vZmZzZXRCWV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0QzogeyB2YWx1ZTogW3N0YXRlLm9mZnNldENYLCBzdGF0ZS5vZmZzZXRDWV0gfSxcbiAgICAgICAgbWJfb2Zmc2V0RDogeyB2YWx1ZTogW3N0YXRlLm9mZnNldERYLCBzdGF0ZS5vZmZzZXREWV0gfSxcbiAgICAgICAgbWJfc2NhbGUxOiB7IHZhbHVlOiBzdGF0ZS5zY2FsZTEgfSxcbiAgICAgICAgbWJfc2NhbGUyOiB7IHZhbHVlOiBzdGF0ZS5zY2FsZTIgfSxcbiAgICAgICAgbWJfc2NhbGVCeVByZXY6IHsgdmFsdWU6IHN0YXRlLnNjYWxlQnlQcmV2IH0sXG4gICAgICAgIG1iX3NoYXJwZW46IHsgdmFsdWU6IHN0YXRlLnNoYXJwZW4gfSxcbiAgICAgICAgbWJfdGltZTogeyB2YWx1ZTogMCB9LFxuICAgICAgICBtYl90aW1lU2NhbGU6IHsgdmFsdWU6IFtzdGF0ZS50aW1lU2NhbGVYLCBzdGF0ZS50aW1lU2NhbGVZXSB9LFxuICAgICAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICAgICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0gICAgXG4gICAgfSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IGdsc2xgXG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfYW5pbWF0ZTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjE7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IyO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX2dhaW47XG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfaW52ZXJ0O1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9sYWN1bmFyaXR5O1xuICAgICAgICAgICAgdW5pZm9ybSBpbnQgbWJfbm9pc2VNb2RlO1xuICAgICAgICAgICAgdW5pZm9ybSBpbnQgbWJfb2N0YXZlcztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXQ7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRCO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0RDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfc2NhbGUxO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9zY2FsZTI7XG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfc2NhbGVCeVByZXY7XG4gICAgICAgICAgICB1bmlmb3JtIGJvb2wgbWJfc2hhcnBlbjtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfdGltZTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl90aW1lU2NhbGU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbiAgICAgICAgICAgICAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBTb21lIHVzZWZ1bCBmdW5jdGlvbnNcbiAgICAgICAgdmVjMyBtYl9tb2QyODkodmVjMyB4KSB7IHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7IH1cbiAgICAgICAgdmVjMiBtYl9tb2QyODkodmVjMiB4KSB7IHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7IH1cbiAgICAgICAgdmVjMyBtYl9wZXJtdXRlKHZlYzMgeCkgeyByZXR1cm4gbWJfbW9kMjg5KCgoeCozNC4wKSsxLjApKngpOyB9XG4gICAgICAgIFxuICAgICAgICAvL1xuICAgICAgICAvLyBEZXNjcmlwdGlvbiA6IEdMU0wgMkQgc2ltcGxleCBub2lzZSBmdW5jdGlvblxuICAgICAgICAvLyAgICAgIEF1dGhvciA6IElhbiBNY0V3YW4sIEFzaGltYSBBcnRzXG4gICAgICAgIC8vICBNYWludGFpbmVyIDogaWptXG4gICAgICAgIC8vICAgICBMYXN0bW9kIDogMjAxMTA4MjIgKGlqbSlcbiAgICAgICAgLy8gICAgIExpY2Vuc2UgOlxuICAgICAgICAvLyAgQ29weXJpZ2h0IChDKSAyMDExIEFzaGltYSBBcnRzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICAgICAgICAvLyAgRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTElDRU5TRSBmaWxlLlxuICAgICAgICAvLyAgaHR0cHM6Ly9naXRodWIuY29tL2FzaGltYS93ZWJnbC1ub2lzZVxuICAgICAgICAvL1xuICAgICAgICBmbG9hdCBtYl9zbm9pc2UodmVjMiB2KSB7XG4gICAgICAgICAgICAvLyBQcmVjb21wdXRlIHZhbHVlcyBmb3Igc2tld2VkIHRyaWFuZ3VsYXIgZ3JpZFxuICAgICAgICAgICAgY29uc3QgdmVjNCBDID0gdmVjNCgwLjIxMTMyNDg2NTQwNTE4NyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gKDMuMC1zcXJ0KDMuMCkpLzYuMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjM2NjAyNTQwMzc4NDQzOSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMC41KihzcXJ0KDMuMCktMS4wKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAtMC41NzczNTAyNjkxODk2MjYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0xLjAgKyAyLjAgKiBDLnhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC4wMjQzOTAyNDM5MDI0MzkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAxLjAgLyA0MS4wXG4gICAgICAgIFxuICAgICAgICAgICAgLy8gRmlyc3QgY29ybmVyICh4MClcbiAgICAgICAgICAgIHZlYzIgaSAgPSBmbG9vcih2ICsgZG90KHYsIEMueXkpKTtcbiAgICAgICAgICAgIHZlYzIgeDAgPSB2IC0gaSArIGRvdChpLCBDLnh4KTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBPdGhlciB0d28gY29ybmVycyAoeDEsIHgyKVxuICAgICAgICAgICAgdmVjMiBpMSA9IHZlYzIoMC4wKTtcbiAgICAgICAgICAgIGkxID0gKHgwLnggPiB4MC55KT8gdmVjMigxLjAsIDAuMCk6dmVjMigwLjAsIDEuMCk7XG4gICAgICAgICAgICB2ZWMyIHgxID0geDAueHkgKyBDLnh4IC0gaTE7XG4gICAgICAgICAgICB2ZWMyIHgyID0geDAueHkgKyBDLnp6O1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIERvIHNvbWUgcGVybXV0YXRpb25zIHRvIGF2b2lkXG4gICAgICAgICAgICAvLyB0cnVuY2F0aW9uIGVmZmVjdHMgaW4gcGVybXV0YXRpb25cbiAgICAgICAgICAgIGkgPSBtYl9tb2QyODkoaSk7XG4gICAgICAgICAgICB2ZWMzIHAgPSBtYl9wZXJtdXRlKFxuICAgICAgICAgICAgICAgICAgICBtYl9wZXJtdXRlKCBpLnkgKyB2ZWMzKDAuMCwgaTEueSwgMS4wKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICsgaS54ICsgdmVjMygwLjAsIGkxLngsIDEuMCApKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIG0gPSBtYXgoMC41IC0gdmVjMyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHgwLHgwKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHgxLHgxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZG90KHgyLHgyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApLCAwLjApO1xuICAgICAgICBcbiAgICAgICAgICAgIG0gPSBtKm07XG4gICAgICAgICAgICBtID0gbSptO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIEdyYWRpZW50czpcbiAgICAgICAgICAgIC8vICA0MSBwdHMgdW5pZm9ybWx5IG92ZXIgYSBsaW5lLCBtYXBwZWQgb250byBhIGRpYW1vbmRcbiAgICAgICAgICAgIC8vICBUaGUgcmluZyBzaXplIDE3KjE3ID0gMjg5IGlzIGNsb3NlIHRvIGEgbXVsdGlwbGVcbiAgICAgICAgICAgIC8vICAgICAgb2YgNDEgKDQxKjcgPSAyODcpXG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyB4ID0gMi4wICogZnJhY3QocCAqIEMud3d3KSAtIDEuMDtcbiAgICAgICAgICAgIHZlYzMgaCA9IGFicyh4KSAtIDAuNTtcbiAgICAgICAgICAgIHZlYzMgb3ggPSBmbG9vcih4ICsgMC41KTtcbiAgICAgICAgICAgIHZlYzMgYTAgPSB4IC0gb3g7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gTm9ybWFsaXNlIGdyYWRpZW50cyBpbXBsaWNpdGx5IGJ5IHNjYWxpbmcgbVxuICAgICAgICAgICAgLy8gQXBwcm94aW1hdGlvbiBvZjogbSAqPSBpbnZlcnNlc3FydChhMCphMCArIGgqaCk7XG4gICAgICAgICAgICBtICo9IDEuNzkyODQyOTE0MDAxNTkgLSAwLjg1MzczNDcyMDk1MzE0ICogKGEwKmEwK2gqaCk7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gQ29tcHV0ZSBmaW5hbCBub2lzZSB2YWx1ZSBhdCBQXG4gICAgICAgICAgICB2ZWMzIGcgPSB2ZWMzKDAuMCk7XG4gICAgICAgICAgICBnLnggID0gYTAueCAgKiB4MC54ICArIGgueCAgKiB4MC55O1xuICAgICAgICAgICAgZy55eiA9IGEwLnl6ICogdmVjMih4MS54LHgyLngpICsgaC55eiAqIHZlYzIoeDEueSx4Mi55KTtcbiAgICAgICAgICAgIHJldHVybiAxMzAuMCAqIGRvdChtLCBnKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfZ2V0Tm9pc2VWYWwodmVjMiBwKSB7XG4gICAgICAgICAgICBmbG9hdCByYXcgPSBtYl9zbm9pc2UocCk7XG4gICAgICAgIFxuICAgICAgICAgICAgaWYgKG1iX25vaXNlTW9kZSA9PSAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFicyhyYXcpO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiByYXcgKiAwLjUgKyAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1iX2ZibSh2ZWMyIHApIHtcbiAgICAgICAgICAgIGZsb2F0IHN1bSA9IDAuMDtcbiAgICAgICAgICAgIGZsb2F0IGZyZXEgPSAxLjA7XG4gICAgICAgICAgICBmbG9hdCBhbXAgPSAwLjU7XG4gICAgICAgICAgICBmbG9hdCBwcmV2ID0gMS4wO1xuICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgbWJfb2N0YXZlczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZmxvYXQgbiA9IG1iX2dldE5vaXNlVmFsKHAgKiBmcmVxKTtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX2ludmVydCkge1xuICAgICAgICAgICAgICAgICAgICBuID0gMS4wIC0gbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9zaGFycGVuKSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSBuICogbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIHN1bSArPSBuICogYW1wO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfc2NhbGVCeVByZXYpIHtcbiAgICAgICAgICAgICAgICAgICAgc3VtICs9IG4gKiBhbXAgKiBwcmV2O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgcHJldiA9IG47XG4gICAgICAgICAgICAgICAgZnJlcSAqPSBtYl9sYWN1bmFyaXR5O1xuICAgICAgICAgICAgICAgIGFtcCAqPSBtYl9nYWluO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBzdW07XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1iX3BhdHRlcm4oaW4gdmVjMiBwLCBvdXQgdmVjMiBxLCBvdXQgdmVjMiByKSB7XG4gICAgICAgICAgICBwICo9IG1iX3NjYWxlMTtcbiAgICAgICAgICAgIHAgKz0gbWJfb2Zmc2V0O1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHQgPSAwLjA7XG4gICAgICAgICAgICBpZiAobWJfYW5pbWF0ZSkge1xuICAgICAgICAgICAgICAgIHQgPSBtYl90aW1lICogMC4xO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIHEgPSB2ZWMyKG1iX2ZibShwICsgbWJfb2Zmc2V0QSArIHQgKiBtYl90aW1lU2NhbGUueCksIG1iX2ZibShwICsgbWJfb2Zmc2V0QiAtIHQgKiBtYl90aW1lU2NhbGUueSkpO1xuICAgICAgICAgICAgciA9IHZlYzIobWJfZmJtKHAgKyBtYl9zY2FsZTIgKiBxICsgbWJfb2Zmc2V0QyksIG1iX2ZibShwICsgbWJfc2NhbGUyICogcSArIG1iX29mZnNldEQpKTtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gbWJfZmJtKHAgKyBtYl9zY2FsZTIgKiByKTtcbiAgICAgICAgfVxuICAgIGAsXG4gICAgcmVwbGFjZU1hcDogZ2xzbGBcbiAgICAgICAgdmVjMyBtYXJibGVDb2xvciA9IHZlYzMoMC4wKTtcblxuICAgICAgICB2ZWMyIHE7XG4gICAgICAgIHZlYzIgcjtcblxuICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IFxuICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcblxuICAgICAgICBmbG9hdCBmID0gbWJfcGF0dGVybih1diwgcSwgcik7XG4gICAgICAgIFxuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYl9jb2xvcjEsIG1iX2NvbG9yMiwgZik7XG4gICAgICAgIG1hcmJsZUNvbG9yID0gbWl4KG1hcmJsZUNvbG9yLCBtYl9jb2xvcjMsIGxlbmd0aChxKSAvIDIuMCk7XG4gICAgICAgIG1hcmJsZUNvbG9yID0gbWl4KG1hcmJsZUNvbG9yLCBtYl9jb2xvcjQsIHIueSAvIDIuMCk7XG5cbiAgICAgICAgdmVjNCBtYXJibGVDb2xvcjQgPSBtYXBUZXhlbFRvTGluZWFyKCB2ZWM0KG1hcmJsZUNvbG9yLDEuMCkgKTtcblxuICAgICAgICBkaWZmdXNlQ29sb3IgKj0gbWFyYmxlQ29sb3I0O1xuICAgIGBcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX2ludmVydCA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyBzdGF0ZS5pbnZlcnQgOiAhc3RhdGUuaW52ZXJ0IH1cblxuICAgICAgICAvLyBsZXRzIGFkZCBhIGJpdCBvZiByYW5kb21uZXNzIHRvIHRoZSBpbnB1dCBzbyBtdWx0aXBsZSBpbnN0YW5jZXMgYXJlIGRpZmZlcmVudFxuICAgICAgICBsZXQgcnggPSBNYXRoLnJhbmRvbSgpXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX29mZnNldEEgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMiggc3RhdGUub2Zmc2V0QVggKyBNYXRoLnJhbmRvbSgpLCBzdGF0ZS5vZmZzZXRBWSArIE1hdGgucmFuZG9tKCkpIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfb2Zmc2V0QiA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKCBzdGF0ZS5vZmZzZXRCWCArIE1hdGgucmFuZG9tKCksIHN0YXRlLm9mZnNldEJZICsgTWF0aC5yYW5kb20oKSkgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl90aW1lLnZhbHVlID0gdGltZSAqIDAuMDAxXG4gICAgfVxufVxuXG5leHBvcnQgeyBNYXJibGUxU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzFlYzk2NWM1ZDZkZjU3N2MuanBnXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzR0MzN6OFxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCBub3RGb3VuZCBmcm9tICcuLi9hc3NldHMvYmFkU2hhZGVyLmpwZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgaUNoYW5uZWwxOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG59KVxudmFyIG5vdEZvdW5kVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZChub3RGb3VuZCwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub3RGb3VuZFRleCA9IG5vaXNlXG59KVxuXG5sZXQgTm90Rm91bmRTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDE7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgICAgICAgICB2ZWMyIHdhcnBVViA9IDIuICogdXY7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZCA9IGxlbmd0aCggd2FycFVWICk7XG4gICAgICAgICAgICB2ZWMyIHN0ID0gd2FycFVWKjAuMSArIDAuMip2ZWMyKGNvcygwLjA3MSppVGltZSoyLitkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW4oMC4wNzMqaVRpbWUqMi4tZCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgd2FycGVkQ29sID0gdGV4dHVyZSggaUNoYW5uZWwwLCBzdCApLnh5eiAqIDIuMDtcbiAgICAgICAgICAgIGZsb2F0IHcgPSBtYXgoIHdhcnBlZENvbC5yLCAwLjg1KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMiBvZmZzZXQgPSAwLjAxICogY29zKCB3YXJwZWRDb2wucmcgKiAzLjE0MTU5ICk7XG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHRleHR1cmUoIGlDaGFubmVsMSwgdXYgKyBvZmZzZXQgKS5yZ2IgKiB2ZWMzKDAuOCwgMC44LCAxLjUpIDtcbiAgICAgICAgICAgIGNvbCAqPSB3KjEuMjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNCggbWl4KGNvbCwgdGV4dHVyZSggaUNoYW5uZWwxLCB1diArIG9mZnNldCApLnJnYiwgMC41KSwgIDEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDEudmFsdWUgPSBub3RGb3VuZFRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwxLnZhbHVlID0gbm90Rm91bmRUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IE5vdEZvdW5kU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzQ4MWE5MmI0NGU1NmRhZDQucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuaW1wb3J0IHdhcnBmeCBmcm9tICcuLi9hc3NldHMvd2FycGZ4LnBuZydcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgdW5pZm9ybXMgPSB7XG4gICAgd2FycFRpbWU6IHt2YWx1ZTogMH0sXG4gICAgd2FycFRleDoge3ZhbHVlOiBudWxsfSxcbiAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSxcbiAgICB0ZXhGbGlwWTogeyB2YWx1ZTogMCB9XG59IFxuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIHdhcnBUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKHdhcnBmeCwgKHdhcnApID0+IHtcbiAgICB3YXJwLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIHdhcnAud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgd2FycFRleCA9IHdhcnBcbn0pXG5cbmxldCBXYXJwU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBmbG9hdCB3YXJwVGltZTtcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgd2FycFRleDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbiAgICAgICAgdW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuICAgICAgICAgICAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgICAgZmxvYXQgdCA9IHdhcnBUaW1lO1xuXG4gICAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG4gIFxuICAgICAgICAgIHZlYzIgc2NhbGVkVVYgPSB1diAqIDIuMCAtIDEuMDtcbiAgICAgICAgICB2ZWMyIHB1diA9IHZlYzIobGVuZ3RoKHNjYWxlZFVWLnh5KSwgYXRhbihzY2FsZWRVVi54LCBzY2FsZWRVVi55KSk7XG4gICAgICAgICAgdmVjNCBjb2wgPSB0ZXh0dXJlMkQod2FycFRleCwgdmVjMihsb2cocHV2LngpICsgdCAvIDUuMCwgcHV2LnkgLyAzLjE0MTU5MjYgKSk7XG4gICAgICAgICAgZmxvYXQgZ2xvdyA9ICgxLjAgLSBwdXYueCkgKiAoMC41ICsgKHNpbih0KSArIDIuMCApIC8gNC4wKTtcbiAgICAgICAgICAvLyBibHVlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgxMTguMC8yNTUuMCwgMTQ0LjAvMjU1LjAsIDIxOS4wLzI1NS4wLCAxLjApICogKDAuNCArIGdsb3cgKiAxLjApO1xuICAgICAgICAgIC8vIHdoaXRlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgwLjIpICogc21vb3Roc3RlcCgwLjAsIDIuMCwgZ2xvdyAqIGdsb3cpO1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbCA9IG1hcFRleGVsVG9MaW5lYXIoIGNvbCApO1xuICAgICAgICAgIGRpZmZ1c2VDb2xvciAqPSBjb2w7XG4gICAgICAgIGBcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSswLjUpICogMTBcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGV4LnZhbHVlID0gd2FycFRleFxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUgPSB7IHZhbHVlOiAwIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IFdhcnBTaGFkZXIgfVxuIiwiLypcbiAqIDNEIFNpbXBsZXggbm9pc2VcbiAqIFNJR05BVFVSRTogZmxvYXQgc25vaXNlKHZlYzMgdilcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9odWdoc2svZ2xzbC1ub2lzZVxuICovXG5cbmNvbnN0IGdsc2wgPSBgXG4vL1xuLy8gRGVzY3JpcHRpb24gOiBBcnJheSBhbmQgdGV4dHVyZWxlc3MgR0xTTCAyRC8zRC80RCBzaW1wbGV4XG4vLyAgICAgICAgICAgICAgIG5vaXNlIGZ1bmN0aW9ucy5cbi8vICAgICAgQXV0aG9yIDogSWFuIE1jRXdhbiwgQXNoaW1hIEFydHMuXG4vLyAgTWFpbnRhaW5lciA6IGlqbVxuLy8gICAgIExhc3Rtb2QgOiAyMDExMDgyMiAoaWptKVxuLy8gICAgIExpY2Vuc2UgOiBDb3B5cmlnaHQgKEMpIDIwMTEgQXNoaW1hIEFydHMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vLyAgICAgICAgICAgICAgIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZS5cbi8vICAgICAgICAgICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2FzaGltYS93ZWJnbC1ub2lzZVxuLy9cblxudmVjMyBtb2QyODkodmVjMyB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgbW9kMjg5KHZlYzQgeCkge1xuICByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wO1xufVxuXG52ZWM0IHBlcm11dGUodmVjNCB4KSB7XG4gICAgIHJldHVybiBtb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7XG59XG5cbnZlYzQgdGF5bG9ySW52U3FydCh2ZWM0IHIpXG57XG4gIHJldHVybiAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqIHI7XG59XG5cbmZsb2F0IHNub2lzZSh2ZWMzIHYpXG4gIHtcbiAgY29uc3QgdmVjMiAgQyA9IHZlYzIoMS4wLzYuMCwgMS4wLzMuMCkgO1xuICBjb25zdCB2ZWM0ICBEID0gdmVjNCgwLjAsIDAuNSwgMS4wLCAyLjApO1xuXG4vLyBGaXJzdCBjb3JuZXJcbiAgdmVjMyBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eXkpICk7XG4gIHZlYzMgeDAgPSAgIHYgLSBpICsgZG90KGksIEMueHh4KSA7XG5cbi8vIE90aGVyIGNvcm5lcnNcbiAgdmVjMyBnID0gc3RlcCh4MC55engsIHgwLnh5eik7XG4gIHZlYzMgbCA9IDEuMCAtIGc7XG4gIHZlYzMgaTEgPSBtaW4oIGcueHl6LCBsLnp4eSApO1xuICB2ZWMzIGkyID0gbWF4KCBnLnh5eiwgbC56eHkgKTtcblxuICAvLyAgIHgwID0geDAgLSAwLjAgKyAwLjAgKiBDLnh4eDtcbiAgLy8gICB4MSA9IHgwIC0gaTEgICsgMS4wICogQy54eHg7XG4gIC8vICAgeDIgPSB4MCAtIGkyICArIDIuMCAqIEMueHh4O1xuICAvLyAgIHgzID0geDAgLSAxLjAgKyAzLjAgKiBDLnh4eDtcbiAgdmVjMyB4MSA9IHgwIC0gaTEgKyBDLnh4eDtcbiAgdmVjMyB4MiA9IHgwIC0gaTIgKyBDLnl5eTsgLy8gMi4wKkMueCA9IDEvMyA9IEMueVxuICB2ZWMzIHgzID0geDAgLSBELnl5eTsgICAgICAvLyAtMS4wKzMuMCpDLnggPSAtMC41ID0gLUQueVxuXG4vLyBQZXJtdXRhdGlvbnNcbiAgaSA9IG1vZDI4OShpKTtcbiAgdmVjNCBwID0gcGVybXV0ZSggcGVybXV0ZSggcGVybXV0ZShcbiAgICAgICAgICAgICBpLnogKyB2ZWM0KDAuMCwgaTEueiwgaTIueiwgMS4wICkpXG4gICAgICAgICAgICsgaS55ICsgdmVjNCgwLjAsIGkxLnksIGkyLnksIDEuMCApKVxuICAgICAgICAgICArIGkueCArIHZlYzQoMC4wLCBpMS54LCBpMi54LCAxLjAgKSk7XG5cbi8vIEdyYWRpZW50czogN3g3IHBvaW50cyBvdmVyIGEgc3F1YXJlLCBtYXBwZWQgb250byBhbiBvY3RhaGVkcm9uLlxuLy8gVGhlIHJpbmcgc2l6ZSAxNyoxNyA9IDI4OSBpcyBjbG9zZSB0byBhIG11bHRpcGxlIG9mIDQ5ICg0OSo2ID0gMjk0KVxuICBmbG9hdCBuXyA9IDAuMTQyODU3MTQyODU3OyAvLyAxLjAvNy4wXG4gIHZlYzMgIG5zID0gbl8gKiBELnd5eiAtIEQueHp4O1xuXG4gIHZlYzQgaiA9IHAgLSA0OS4wICogZmxvb3IocCAqIG5zLnogKiBucy56KTsgIC8vICBtb2QocCw3KjcpXG5cbiAgdmVjNCB4XyA9IGZsb29yKGogKiBucy56KTtcbiAgdmVjNCB5XyA9IGZsb29yKGogLSA3LjAgKiB4XyApOyAgICAvLyBtb2QoaixOKVxuXG4gIHZlYzQgeCA9IHhfICpucy54ICsgbnMueXl5eTtcbiAgdmVjNCB5ID0geV8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IGggPSAxLjAgLSBhYnMoeCkgLSBhYnMoeSk7XG5cbiAgdmVjNCBiMCA9IHZlYzQoIHgueHksIHkueHkgKTtcbiAgdmVjNCBiMSA9IHZlYzQoIHguencsIHkuencgKTtcblxuICAvL3ZlYzQgczAgPSB2ZWM0KGxlc3NUaGFuKGIwLDAuMCkpKjIuMCAtIDEuMDtcbiAgLy92ZWM0IHMxID0gdmVjNChsZXNzVGhhbihiMSwwLjApKSoyLjAgLSAxLjA7XG4gIHZlYzQgczAgPSBmbG9vcihiMCkqMi4wICsgMS4wO1xuICB2ZWM0IHMxID0gZmxvb3IoYjEpKjIuMCArIDEuMDtcbiAgdmVjNCBzaCA9IC1zdGVwKGgsIHZlYzQoMC4wKSk7XG5cbiAgdmVjNCBhMCA9IGIwLnh6eXcgKyBzMC54enl3KnNoLnh4eXkgO1xuICB2ZWM0IGExID0gYjEueHp5dyArIHMxLnh6eXcqc2guenp3dyA7XG5cbiAgdmVjMyBwMCA9IHZlYzMoYTAueHksaC54KTtcbiAgdmVjMyBwMSA9IHZlYzMoYTAuencsaC55KTtcbiAgdmVjMyBwMiA9IHZlYzMoYTEueHksaC56KTtcbiAgdmVjMyBwMyA9IHZlYzMoYTEuencsaC53KTtcblxuLy9Ob3JtYWxpc2UgZ3JhZGllbnRzXG4gIHZlYzQgbm9ybSA9IHRheWxvckludlNxcnQodmVjNChkb3QocDAscDApLCBkb3QocDEscDEpLCBkb3QocDIsIHAyKSwgZG90KHAzLHAzKSkpO1xuICBwMCAqPSBub3JtLng7XG4gIHAxICo9IG5vcm0ueTtcbiAgcDIgKj0gbm9ybS56O1xuICBwMyAqPSBub3JtLnc7XG5cbi8vIE1peCBmaW5hbCBub2lzZSB2YWx1ZVxuICB2ZWM0IG0gPSBtYXgoMC42IC0gdmVjNChkb3QoeDAseDApLCBkb3QoeDEseDEpLCBkb3QoeDIseDIpLCBkb3QoeDMseDMpKSwgMC4wKTtcbiAgbSA9IG0gKiBtO1xuICByZXR1cm4gNDIuMCAqIGRvdCggbSptLCB2ZWM0KCBkb3QocDAseDApLCBkb3QocDEseDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QocDIseDIpLCBkb3QocDMseDMpICkgKTtcbiAgfSAgXG5gXG5leHBvcnQgZGVmYXVsdCBnbHNsXG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuaW1wb3J0IHdhcnBmeCBmcm9tICcuLi9hc3NldHMvd2FycGZ4LnBuZydcbmltcG9ydCBzbm9pc2UgZnJvbSAnLi9zbm9pc2UnXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCB1bmlmb3JtcyA9IHtcbiAgICB3YXJwVGltZToge3ZhbHVlOiAwfSxcbiAgICB3YXJwVGV4OiB7dmFsdWU6IG51bGx9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH0sXG4gICAgcG9ydGFsQ3ViZU1hcDogeyB2YWx1ZTogbmV3IFRIUkVFLkN1YmVUZXh0dXJlKCkgfSxcbiAgICBwb3J0YWxUaW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgcG9ydGFsUmFkaXVzOiB7IHZhbHVlOiAwLjUgfSxcbiAgICBwb3J0YWxSaW5nQ29sb3I6IHsgdmFsdWU6IG5ldyBUSFJFRS5Db2xvcihcInJlZFwiKSAgfSxcbiAgICBpbnZlcnRXYXJwQ29sb3I6IHsgdmFsdWU6IDAgfSxcbiAgICB0ZXhJbnZTaXplOiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH1cbn0gXG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5sZXQgY3ViZU1hcCA9IG5ldyBUSFJFRS5DdWJlVGV4dHVyZSgpXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciB3YXJwVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZCh3YXJwZngsICh3YXJwKSA9PiB7XG4gICAgd2FycC5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0TWlwbWFwTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RNaXBtYXBOZWFyZXN0RmlsdGVyO1xuICAgIHdhcnAud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgd2FycFRleCA9IHdhcnBcbiAgICBjdWJlTWFwLmltYWdlcyA9IFt3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlLCB3YXJwLmltYWdlXVxuICAgIGN1YmVNYXAubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sZXQgV2FycFBvcnRhbFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IGdsc2xgXG4gICAgICAgIHZhcnlpbmcgdmVjMyB2UmF5O1xuICAgICAgICB2YXJ5aW5nIHZlYzMgcG9ydGFsTm9ybWFsO1xuICAgICAgICAvL3ZhcnlpbmcgdmVjMyBjYW1lcmFMb2NhbDtcbiAgICAgICAgYCxcbiAgICAgICAgcG9zdFRyYW5zZm9ybTogZ2xzbGBcbiAgICAgICAgLy8gdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlKG1vZGVsTWF0cml4KSAqIHZlYzQoY2FtZXJhUG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgICAgICAgdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlKG1vZGVsVmlld01hdHJpeCkgKiB2ZWM0KDAuMCwwLjAsMC4wLCAxLjApKS54eXo7XG4gICAgICAgIHZSYXkgPSBwb3NpdGlvbiAtIGNhbWVyYUxvY2FsO1xuICAgICAgICBpZiAodlJheS56IDwgMC4wKSB7XG4gICAgICAgICAgICB2UmF5LnogPSAtdlJheS56O1xuICAgICAgICAgICAgdlJheS54ID0gLXZSYXkueDtcbiAgICAgICAgfVxuICAgICAgICAvL3ZSYXkgPSB2ZWMzKG12UG9zaXRpb24ueCwgbXZQb3NpdGlvbi55LCBtdlBvc2l0aW9uLnopO1xuICAgICAgICBwb3J0YWxOb3JtYWwgPSBub3JtYWxpemUoLTEuICogdlJheSk7XG4gICAgICAgIC8vZmxvYXQgcG9ydGFsX2Rpc3QgPSBsZW5ndGgoY2FtZXJhTG9jYWwpO1xuICAgICAgICBmbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aCh2UmF5KTtcbiAgICAgICAgdlJheS56ICo9IDEuMSAvICgxLiArIHBvdyhwb3J0YWxfZGlzdCwgMC41KSk7IC8vIENoYW5nZSBGT1YgYnkgc3F1YXNoaW5nIGxvY2FsIFogZGlyZWN0aW9uXG4gICAgICBgXG4gICAgfSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIGZ1bmN0aW9uczogc25vaXNlLFxuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyQ3ViZSBwb3J0YWxDdWJlTWFwO1xuICAgICAgICB1bmlmb3JtIGZsb2F0IHBvcnRhbFJhZGl1cztcbiAgICAgICAgdW5pZm9ybSB2ZWMzIHBvcnRhbFJpbmdDb2xvcjtcbiAgICAgICAgdW5pZm9ybSBmbG9hdCBwb3J0YWxUaW1lO1xuICAgICAgICB1bmlmb3JtIGludCBpbnZlcnRXYXJwQ29sb3I7XG5cbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleEludlNpemU7XG5cbiAgICAgICAgdmFyeWluZyB2ZWMzIHZSYXk7XG4gICAgICAgIHZhcnlpbmcgdmVjMyBwb3J0YWxOb3JtYWw7XG4gICAgICAgLy8gdmFyeWluZyB2ZWMzIGNhbWVyYUxvY2FsO1xuXG4gICAgICAgIHVuaWZvcm0gZmxvYXQgd2FycFRpbWU7XG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHdhcnBUZXg7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG4gICAgICAgIHVuaWZvcm0gaW50IHRleEZsaXBZOyBcblxuICAgICAgICAjZGVmaW5lIFJJTkdfV0lEVEggMC4xXG4gICAgICAgICNkZWZpbmUgUklOR19IQVJEX09VVEVSIDAuMDFcbiAgICAgICAgI2RlZmluZSBSSU5HX0hBUkRfSU5ORVIgMC4wOFxuICAgICAgICBgLFxuICAgICAgICByZXBsYWNlTWFwOiBnbHNsYFxuICAgICAgICAgIGZsb2F0IHQgPSB3YXJwVGltZTtcblxuICAgICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgLy9tb2QodlV2Lnh5ICogdGV4UmVwZWF0Lnh5ICsgdGV4T2Zmc2V0Lnh5LCB2ZWMyKDEuMCwxLjApKTtcblxuICAgICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgICAgaWYgKHRleEZsaXBZID4gMCkgeyB1di55ID0gMS4wIC0gdXYueTt9XG4gICAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuICBcbiAgICAgICAgICB2ZWMyIHNjYWxlZFVWID0gdXYgKiAyLjAgLSAxLjA7XG4gICAgICAgICAgdmVjMiBwdXYgPSB2ZWMyKGxlbmd0aChzY2FsZWRVVi54eSksIGF0YW4oc2NhbGVkVVYueCwgc2NhbGVkVVYueSkpO1xuICAgICAgICAgIHZlYzQgY29sID0gdGV4dHVyZTJEKHdhcnBUZXgsIHZlYzIobG9nKHB1di54KSArIHQgLyA1LjAsIHB1di55IC8gMy4xNDE1OTI2ICkpO1xuXG4gICAgICAgICAgZmxvYXQgZ2xvdyA9ICgxLjAgLSBwdXYueCkgKiAoMC41ICsgKHNpbih0KSArIDIuMCApIC8gNC4wKTtcbiAgICAgICAgICAvLyBibHVlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgxMTguMC8yNTUuMCwgMTQ0LjAvMjU1LjAsIDIxOS4wLzI1NS4wLCAxLjApICogKDAuNCArIGdsb3cgKiAxLjApO1xuICAgICAgICAgIC8vIHdoaXRlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgwLjIpICogc21vb3Roc3RlcCgwLjAsIDIuMCwgZ2xvdyAqIGdsb3cpO1xuICAgICAgICAgIGNvbCA9IG1hcFRleGVsVG9MaW5lYXIoIGNvbCApO1xuICAgICAgICAgXG4gICAgICAgICAgaWYgKGludmVydFdhcnBDb2xvciA+IDApIHtcbiAgICAgICAgICAgICAgY29sID0gdmVjNChjb2wuYiwgY29sLmcsIGNvbC5yLCBjb2wuYSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8vIHBvcnRhbCBzaGFkZXIgZWZmZWN0XG4gICAgICAgICAgdmVjMiBwb3J0YWxfY29vcmQgPSB2VXYgKiAyLjAgLSAxLjA7XG4gICAgICAgICAgZmxvYXQgcG9ydGFsX25vaXNlID0gc25vaXNlKHZlYzMocG9ydGFsX2Nvb3JkICogMS4sIHBvcnRhbFRpbWUpKSAqIDAuNSArIDAuNTtcbiAgICAgICAgXG4gICAgICAgICAgLy8gUG9sYXIgZGlzdGFuY2VcbiAgICAgICAgICBmbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aChwb3J0YWxfY29vcmQpO1xuICAgICAgICAgIHBvcnRhbF9kaXN0ICs9IHBvcnRhbF9ub2lzZSAqIDAuMjtcbiAgICAgICAgXG4gICAgICAgICAgZmxvYXQgbWFza091dGVyID0gMS4wIC0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSBSSU5HX0hBUkRfT1VURVIsIHBvcnRhbFJhZGl1cywgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIGZsb2F0IG1hc2tJbm5lciA9IDEuMCAtIHNtb290aHN0ZXAocG9ydGFsUmFkaXVzIC0gUklOR19XSURUSCwgcG9ydGFsUmFkaXVzIC0gUklOR19XSURUSCArIFJJTkdfSEFSRF9JTk5FUiwgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0b3J0aW9uID0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSAwLjIsIHBvcnRhbFJhZGl1cyArIDAuMiwgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIFxuICAgICAgICAgIHZlYzMgcG9ydGFsbm9ybWFsID0gbm9ybWFsaXplKHBvcnRhbE5vcm1hbCk7XG4gICAgICAgICAgdmVjMyBmb3J3YXJkUG9ydGFsID0gdmVjMygwLjAsIDAuMCwgLTEuMCk7XG5cbiAgICAgICAgICBmbG9hdCBwb3J0YWxfZGlyZWN0VmlldyA9IHNtb290aHN0ZXAoMC4wLCAwLjgsIGRvdChwb3J0YWxub3JtYWwsIGZvcndhcmRQb3J0YWwpKTtcbiAgICAgICAgICB2ZWMzIHBvcnRhbF90YW5nZW50T3V0d2FyZCA9IG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9jb29yZCwgMC4wKSk7XG4gICAgICAgICAgdmVjMyBwb3J0YWxfcmF5ID0gbWl4KHZSYXksIHBvcnRhbF90YW5nZW50T3V0d2FyZCwgcG9ydGFsX2Rpc3RvcnRpb24pO1xuXG4gICAgICAgICAgdmVjNCBteUN1YmVUZXhlbCA9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIHBvcnRhbF9yYXkpO1xuXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54IC0gdGV4SW52U2l6ZS5zLCBwb3J0YWxfcmF5Lnl6KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54IC0gdGV4SW52U2l6ZS5zLCBwb3J0YWxfcmF5Lnl6KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54LCBwb3J0YWxfcmF5LnkgLSB0ZXhJbnZTaXplLnQsIHBvcnRhbF9yYXkueikpKSAvIDguMDsgICAgICAgIFxuICAgICAgICAvLyAgIG15Q3ViZVRleGVsICs9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9yYXkueCwgcG9ydGFsX3JheS55IC0gdGV4SW52U2l6ZS50LCBwb3J0YWxfcmF5LnopKSkgLyA4LjA7ICAgICAgICBcblxuICAgICAgICAgIG15Q3ViZVRleGVsID0gbWFwVGV4ZWxUb0xpbmVhciggbXlDdWJlVGV4ZWwgKTtcblxuICAgICAgICAvLyAgIHZlYzQgcG9zQ29sID0gdmVjNChzbW9vdGhzdGVwKC02LjAsIDYuMCwgY2FtZXJhTG9jYWwpLCAxLjApOyAvL25vcm1hbGl6ZSgoY2FtZXJhTG9jYWwgLyA2LjApKTtcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCA9IHBvc0NvbDsgLy8gdmVjNChwb3NDb2wueCwgcG9zQ29sLnksIHBvc0NvbC55LCAxLjApO1xuICAgICAgICAgIHZlYzMgY2VudGVyTGF5ZXIgPSBteUN1YmVUZXhlbC5yZ2IgKiBtYXNrSW5uZXI7XG4gICAgICAgICAgdmVjMyByaW5nTGF5ZXIgPSBwb3J0YWxSaW5nQ29sb3IgKiAoMS4gLSBtYXNrSW5uZXIpO1xuICAgICAgICAgIHZlYzMgcG9ydGFsX2NvbXBvc2l0ZSA9IGNlbnRlckxheWVyICsgcmluZ0xheWVyO1xuICAgICAgICBcbiAgICAgICAgICAvL2dsX0ZyYWdDb2xvciBcbiAgICAgICAgICB2ZWM0IHBvcnRhbENvbCA9IHZlYzQocG9ydGFsX2NvbXBvc2l0ZSwgKG1hc2tPdXRlciAtIG1hc2tJbm5lcikgKyBtYXNrSW5uZXIgKiBwb3J0YWxfZGlyZWN0Vmlldyk7XG4gICAgICAgIFxuICAgICAgICAgIC8vIGJsZW5kIHRoZSB0d29cbiAgICAgICAgICBwb3J0YWxDb2wucmdiICo9IHBvcnRhbENvbC5hOyAvL3ByZW11bHRpcGx5IHNvdXJjZSBcbiAgICAgICAgICBjb2wucmdiICo9ICgxLjAgLSBwb3J0YWxDb2wuYSk7XG4gICAgICAgICAgY29sLnJnYiArPSBwb3J0YWxDb2wucmdiO1xuXG4gICAgICAgICAgZGlmZnVzZUNvbG9yICo9IGNvbDtcbiAgICAgICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwICYmIG1hdC5tYXAucmVwZWF0ID8gbWF0Lm1hcC5yZXBlYXQgOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcCAmJiBtYXQubWFwLm9mZnNldCA/IG1hdC5tYXAub2Zmc2V0IDogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAgJiYgbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUaW1lID0geyB2YWx1ZTogMCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFRpbWUgPSB7IHZhbHVlOiAwIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaW52ZXJ0V2FycENvbG9yID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLmludmVydFdhcnBDb2xvciA/IG1hdC51c2VyRGF0YS5pbnZlcnRXYXJwQ29sb3IgOiBmYWxzZX1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmluZ0NvbG9yID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLnJpbmdDb2xvciA/IG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgOiBuZXcgVEhSRUUuQ29sb3IoXCJyZWRcIikgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxDdWJlTWFwID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLmN1YmVNYXAgPyBtYXQudXNlckRhdGEuY3ViZU1hcCA6IGN1YmVNYXAgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxSYWRpdXMgPSAge3ZhbHVlOiBtYXQudXNlckRhdGEucmFkaXVzID8gbWF0LnVzZXJEYXRhLnJhZGl1cyA6IDAuNX1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsQ3ViZU1hcC52YWx1ZSA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgPyBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwIDogY3ViZU1hcCBcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmFkaXVzLnZhbHVlID0gbWF0ZXJpYWwudXNlckRhdGEucmFkaXVzID8gbWF0ZXJpYWwudXNlckRhdGEucmFkaXVzIDogMC41XG5cbiAgICAgICAgaWYgKG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgJiYgQXJyYXkuaXNBcnJheShtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlcykgJiYgbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcC5pbWFnZXNbMF0pIHtcbiAgICAgICAgICAgIGxldCBoZWlnaHQgPSBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlc1swXS5oZWlnaHRcbiAgICAgICAgICAgIGxldCB3aWR0aCA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzWzBdLndpZHRoXG4gICAgICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhJbnZTaXplLnZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMih3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfVxuIiwiLyoqXG4gKiBWYXJpb3VzIHNpbXBsZSBzaGFkZXJzXG4gKi9cblxuLy8gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TTogIEJsZWVweSBCbG9ja3NcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCwgRGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgYXMgTWF0ZXJpYWxNb2RpZmllciwgU2hhZGVyRXh0ZW5zaW9uT3B0cyB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5cbi8vIGFkZCAgaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzdkS0d6elxuXG5pbXBvcnQgeyBCbGVlcHlCbG9ja3NTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2JsZWVweS1ibG9ja3Mtc2hhZGVyJ1xuaW1wb3J0IHsgTm9pc2VTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL25vaXNlJ1xuaW1wb3J0IHsgTGlxdWlkTWFyYmxlU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9saXF1aWQtbWFyYmxlJ1xuaW1wb3J0IHsgR2FsYXh5U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9nYWxheHknXG5pbXBvcnQgeyBMYWNlVHVubmVsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9sYWNlLXR1bm5lbCdcbmltcG9ydCB7IEZpcmVUdW5uZWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2ZpcmUtdHVubmVsJ1xuaW1wb3J0IHsgTWlzdFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbWlzdCdcbmltcG9ydCB7IE1hcmJsZTFTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21hcmJsZTEnXG5pbXBvcnQgeyBOb3RGb3VuZFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbm90LWZvdW5kJ1xuaW1wb3J0IHsgV2FycFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvd2FycCdcbmltcG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAtcG9ydGFsJ1xuXG5mdW5jdGlvbiBtYXBNYXRlcmlhbHMob2JqZWN0M0Q6IFRIUkVFLk9iamVjdDNELCBmbjogKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCkgPT4gdm9pZCkge1xuICAgIGxldCBtZXNoID0gb2JqZWN0M0QgYXMgVEhSRUUuTWVzaFxuICAgIGlmICghbWVzaC5tYXRlcmlhbCkgcmV0dXJuO1xuICBcbiAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xuICAgICAgcmV0dXJuIG1lc2gubWF0ZXJpYWwubWFwKGZuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZuKG1lc2gubWF0ZXJpYWwpO1xuICAgIH1cbn1cbiAgXG4gIC8vIFRPRE86ICBrZXkgYSByZWNvcmQgb2YgbmV3IG1hdGVyaWFscywgaW5kZXhlZCBieSB0aGUgb3JpZ2luYWxcbiAgLy8gbWF0ZXJpYWwgVVVJRCwgc28gd2UgY2FuIGp1c3QgcmV0dXJuIGl0IGlmIHJlcGxhY2UgaXMgY2FsbGVkIG9uXG4gIC8vIHRoZSBzYW1lIG1hdGVyaWFsIG1vcmUgdGhhbiBvbmNlXG4gIGV4cG9ydCBmdW5jdGlvbiByZXBsYWNlTWF0ZXJpYWwgKG9sZE1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCwgc2hhZGVyOiBTaGFkZXJFeHRlbnNpb24sIHVzZXJEYXRhOiBhbnkpOiBudWxsIHwgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsIHtcbiAgICAvLyAgIGlmIChvbGRNYXRlcmlhbC50eXBlICE9IFwiTWVzaFN0YW5kYXJkTWF0ZXJpYWxcIikge1xuICAgIC8vICAgICAgIGNvbnNvbGUud2FybihcIlNoYWRlciBDb21wb25lbnQ6IGRvbid0IGtub3cgaG93IHRvIGhhbmRsZSBTaGFkZXJzIG9mIHR5cGUgJ1wiICsgb2xkTWF0ZXJpYWwudHlwZSArIFwiJywgb25seSBNZXNoU3RhbmRhcmRNYXRlcmlhbCBhdCB0aGlzIHRpbWUuXCIpXG4gICAgLy8gICAgICAgcmV0dXJuO1xuICAgIC8vICAgfVxuXG4gICAgICAvL2NvbnN0IG1hdGVyaWFsID0gb2xkTWF0ZXJpYWwuY2xvbmUoKTtcbiAgICAgIHZhciBDdXN0b21NYXRlcmlhbFxuICAgICAgdHJ5IHtcbiAgICAgICAgICBDdXN0b21NYXRlcmlhbCA9IE1hdGVyaWFsTW9kaWZpZXIuZXh0ZW5kIChvbGRNYXRlcmlhbC50eXBlLCB7XG4gICAgICAgICAgICB1bmlmb3Jtczogc2hhZGVyLnVuaWZvcm1zLFxuICAgICAgICAgICAgdmVydGV4U2hhZGVyOiBzaGFkZXIudmVydGV4U2hhZGVyLFxuICAgICAgICAgICAgZnJhZ21lbnRTaGFkZXI6IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgICAgIH0pXG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgLy8gY3JlYXRlIGEgbmV3IG1hdGVyaWFsLCBpbml0aWFsaXppbmcgdGhlIGJhc2UgcGFydCB3aXRoIHRoZSBvbGQgbWF0ZXJpYWwgaGVyZVxuICAgICAgbGV0IG1hdGVyaWFsID0gbmV3IEN1c3RvbU1hdGVyaWFsKClcblxuICAgICAgc3dpdGNoIChvbGRNYXRlcmlhbC50eXBlKSB7XG4gICAgICAgICAgY2FzZSBcIk1lc2hTdGFuZGFyZE1hdGVyaWFsXCI6XG4gICAgICAgICAgICAgIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsLnByb3RvdHlwZS5jb3B5LmNhbGwobWF0ZXJpYWwsIG9sZE1hdGVyaWFsKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwiTWVzaFBob25nTWF0ZXJpYWxcIjpcbiAgICAgICAgICAgICAgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJNZXNoQmFzaWNNYXRlcmlhbFwiOlxuICAgICAgICAgICAgICBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbC5wcm90b3R5cGUuY29weS5jYWxsKG1hdGVyaWFsLCBvbGRNYXRlcmlhbClcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIG1hdGVyaWFsLnVzZXJEYXRhID0gdXNlckRhdGE7XG4gICAgICBtYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICBzaGFkZXIuaW5pdChtYXRlcmlhbCk7XG4gICAgICBcbiAgICAgIHJldHVybiBtYXRlcmlhbFxuICB9XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVXaXRoU2hhZGVyKHNoYWRlckRlZjogU2hhZGVyRXh0ZW5zaW9uLCBlbDogYW55LCB0YXJnZXQ6IHN0cmluZywgdXNlckRhdGE6IGFueSA9IHt9KTogKFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbClbXSB7XG4gICAgLy8gbWVzaCB3b3VsZCBjb250YWluIHRoZSBvYmplY3QgdGhhdCBpcywgb3IgY29udGFpbnMsIHRoZSBtZXNoZXNcbiAgICB2YXIgbWVzaCA9IGVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBpZiAoIW1lc2gpIHtcbiAgICAgICAgLy8gaWYgbm8gbWVzaCwgd2UnbGwgc2VhcmNoIHRocm91Z2ggYWxsIG9mIHRoZSBjaGlsZHJlbi4gIFRoaXMgd291bGRcbiAgICAgICAgLy8gaGFwcGVuIGlmIHdlIGRyb3BwZWQgdGhlIGNvbXBvbmVudCBvbiBhIGdsYiBpbiBzcG9rZVxuICAgICAgICBtZXNoID0gZWwub2JqZWN0M0RcbiAgICB9XG4gICAgXG4gICAgbGV0IG1hdGVyaWFsczogYW55ID0gW11cbiAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0OiBUSFJFRS5PYmplY3QzRCkgPT4ge1xuICAgICAgbGV0IG1lc2ggPSBvYmplY3QgYXMgVEhSRUUuTWVzaFxuICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbiAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCkgPT4geyAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoIXRhcmdldCB8fCBtYXRlcmlhbC5uYW1lID09PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgIGxldCBuZXdNID0gcmVwbGFjZU1hdGVyaWFsKG1hdGVyaWFsLCBzaGFkZXJEZWYsIHVzZXJEYXRhKVxuICAgICAgICAgICAgICAgICAgaWYgKG5ld00pIHtcbiAgICAgICAgICAgICAgICAgICAgICBtZXNoLm1hdGVyaWFsID0gbmV3TVxuXG4gICAgICAgICAgICAgICAgICAgICAgbWF0ZXJpYWxzLnB1c2gobmV3TSlcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgICBjb25zdCBjaGlsZHJlbiA9IG9iamVjdC5jaGlsZHJlbjtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICB0cmF2ZXJzZShjaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdHJhdmVyc2UobWVzaCk7XG4gICAgcmV0dXJuIG1hdGVyaWFsc1xuICB9XG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3NoYWRlcicsIHtcbiAgICBtYXRlcmlhbHM6IG51bGwgYXMgKFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbClbXSB8IG51bGwsICBcbiAgICBzaGFkZXJEZWY6IG51bGwgYXMgU2hhZGVyRXh0ZW5zaW9uIHwgbnVsbCxcblxuICAgIHNjaGVtYToge1xuICAgICAgICBuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIm5vaXNlXCIgfSxcbiAgICAgICAgdGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIlwiIH0gIC8vIGlmIG5vdGhpbmcgcGFzc2VkLCBqdXN0IGNyZWF0ZSBzb21lIG5vaXNlXG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNoYWRlckRlZjogU2hhZGVyRXh0ZW5zaW9uO1xuXG4gICAgICAgIHN3aXRjaCAodGhpcy5kYXRhLm5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJub2lzZVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE5vaXNlU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJ3YXJwXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gV2FycFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwid2FycC1wb3J0YWxcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBXYXJwUG9ydGFsU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJsaXF1aWRtYXJibGVcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBMaXF1aWRNYXJibGVTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICAgICAgICBjYXNlIFwiYmxlZXB5YmxvY2tzXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gQmxlZXB5QmxvY2tzU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJnYWxheHlcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBHYWxheHlTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImxhY2V0dW5uZWxcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBMYWNlVHVubmVsU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJmaXJldHVubmVsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gRmlyZVR1bm5lbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgXCJtaXN0XCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTWlzdFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwibWFyYmxlMVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE1hcmJsZTFTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBhbiB1bmtub3duIG5hbWUgd2FzIHBhc3NlZCBpblxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcInVua25vd24gbmFtZSAnXCIgKyB0aGlzLmRhdGEubmFtZSArIFwiJyBwYXNzZWQgdG8gc2hhZGVyIGNvbXBvbmVudFwiKVxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE5vdEZvdW5kU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH0gXG5cbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIGxldCB1cGRhdGVNYXRlcmlhbHMgPSAoKSA9PntcbiAgICAgICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLmRhdGEudGFyZ2V0XG4gICAgICAgICAgICBpZiAodGFyZ2V0Lmxlbmd0aCA9PSAwKSB7dGFyZ2V0PW51bGx9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRoaXMubWF0ZXJpYWxzID0gdXBkYXRlV2l0aFNoYWRlcihzaGFkZXJEZWYsIHRoaXMuZWwsIHRhcmdldCk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgaW5pdGlhbGl6ZXIgPSAoKSA9PntcbiAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICBsZXQgZm4gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZU1hdGVyaWFscygpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBmbik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIGZuKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB1cGRhdGVNYXRlcmlhbHMoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4gICAgICAgIHRoaXMuc2hhZGVyRGVmID0gc2hhZGVyRGVmXG4gICAgfSxcblxuXG4gIHRpY2s6IGZ1bmN0aW9uKHRpbWUpIHtcbiAgICBpZiAodGhpcy5zaGFkZXJEZWYgPT0gbnVsbCB8fCB0aGlzLm1hdGVyaWFscyA9PSBudWxsKSB7IHJldHVybiB9XG5cbiAgICBsZXQgc2hhZGVyRGVmID0gdGhpcy5zaGFkZXJEZWZcbiAgICB0aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge3NoYWRlckRlZi51cGRhdGVVbmlmb3Jtcyh0aW1lLCBtYXQpfSlcbiAgICAvLyBzd2l0Y2ggKHRoaXMuZGF0YS5uYW1lKSB7XG4gICAgLy8gICAgIGNhc2UgXCJub2lzZVwiOlxuICAgIC8vICAgICAgICAgYnJlYWs7XG4gICAgLy8gICAgIGNhc2UgXCJibGVlcHlibG9ja3NcIjpcbiAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgIC8vICAgICBkZWZhdWx0OlxuICAgIC8vICAgICAgICAgYnJlYWs7XG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKHRoaXMuc2hhZGVyKSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZnJhZ21lbnQgc2hhZGVyOlwiLCB0aGlzLm1hdGVyaWFsLmZyYWdtZW50U2hhZGVyKVxuICAgIC8vICAgICB0aGlzLnNoYWRlciA9IG51bGxcbiAgICAvLyB9XG4gIH0sXG59KVxuXG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy8yYWViMDBiNjRhZTk1NjhmLmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvNTBhMWI2ZDMzOGNiMjQ2ZS5qcGdcIiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2FlYWIyMDkxZTRhNTNlOWQucG5nXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy8wY2U0NmM0MjJmOTQ1YTk2LmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvNmEzZThiNDMzMmQ0N2NlMi5qcGdcIiIsImxldCBTSVpFID0gMTAyNFxubGV0IFRBUkdFVFdJRFRIID0gU0laRVxubGV0IFRBUkdFVEhFSUdIVCA9IFNJWkVcblxud2luZG93LkFQUC53cml0ZVdheVBvaW50VGV4dHVyZXMgPSBmdW5jdGlvbihuYW1lcykge1xuICAgIGlmICggIUFycmF5LmlzQXJyYXkoIG5hbWVzICkgKSB7XG4gICAgICAgIG5hbWVzID0gWyBuYW1lcyBdXG4gICAgfVxuXG4gICAgZm9yICggbGV0IGsgPSAwOyBrIDwgbmFtZXMubGVuZ3RoOyBrKysgKSB7XG4gICAgICAgIGxldCB3YXlwb2ludHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKG5hbWVzW2tdKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHdheXBvaW50c1tpXS5jb21wb25lbnRzLndheXBvaW50KSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1YmVjYW0gPSBudWxsXG4gICAgICAgICAgICAgICAgLy8gXG4gICAgICAgICAgICAgICAgLy8gZm9yIChsZXQgaiA9IDA7IGogPCB3YXlwb2ludHNbaV0ub2JqZWN0M0QuY2hpbGRyZW4ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgaWYgKHdheXBvaW50c1tpXS5vYmplY3QzRC5jaGlsZHJlbltqXSBpbnN0YW5jZW9mIEN1YmVDYW1lcmFXcml0ZXIpIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGNvbnNvbGUubG9nKFwiZm91bmQgd2F5cG9pbnQgd2l0aCBjdWJlQ2FtZXJhICdcIiArIG5hbWVzW2tdICsgXCInXCIpXG4gICAgICAgICAgICAgICAgLy8gICAgICAgICBjdWJlY2FtID0gd2F5cG9pbnRzW2ldLm9iamVjdDNELmNoaWxkcmVuW2pdXG4gICAgICAgICAgICAgICAgLy8gICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAvLyAgICAgfVxuICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgICAgICAvLyBpZiAoIWN1YmVjYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJkaWRuJ3QgZmluZCB3YXlwb2ludCB3aXRoIGN1YmVDYW1lcmEgJ1wiICsgbmFtZXNba10gKyBcIicsIGNyZWF0aW5nIG9uZS5cIikgICAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBhIGN1YmUgbWFwIGNhbWVyYSBhbmQgcmVuZGVyIHRoZSB2aWV3IVxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMC4xLCAxMDAwLCBTSVpFKVxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLnBvc2l0aW9uLnkgPSAxLjZcbiAgICAgICAgICAgICAgICAgICAgY3ViZWNhbS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnRzW2ldLm9iamVjdDNELmFkZChjdWJlY2FtKVxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLnVwZGF0ZSh3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LkFQUC5zY2VuZS5vYmplY3QzRClcbiAgICAgICAgICAgICAgICAvLyB9ICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgY3ViZWNhbS5zYXZlQ3ViZU1hcFNpZGVzKG5hbWVzW2tdKVxuICAgICAgICAgICAgICAgIHdheXBvaW50c1tpXS5vYmplY3QzRC5yZW1vdmUoY3ViZWNhbSlcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuY2xhc3MgQ3ViZUNhbWVyYVdyaXRlciBleHRlbmRzIFRIUkVFLkN1YmVDYW1lcmEge1xuXG4gICAgY29uc3RydWN0b3IoLi4uYXJncykge1xuICAgICAgICBzdXBlciguLi5hcmdzKTtcblxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IFRBUkdFVFdJRFRIO1xuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSBUQVJHRVRIRUlHSFQ7XG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgLy8gdGhpcy5yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSB0cnVlO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhck1pcE1hcExpbmVhckZpbHRlcjtcbiAgICAgICAgLy8gdGhpcy5yZW5kZXJUYXJnZXQudGV4dHVyZS5tYWdGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG5cbiAgICAgICAgLy8gdGhpcy51cGRhdGUgPSBmdW5jdGlvbiggcmVuZGVyZXIsIHNjZW5lICkge1xuXG4gICAgICAgIC8vICAgICBsZXQgWyBjYW1lcmFQWCwgY2FtZXJhTlgsIGNhbWVyYVBZLCBjYW1lcmFOWSwgY2FtZXJhUFosIGNhbWVyYU5aIF0gPSB0aGlzLmNoaWxkcmVuO1xuXG4gICAgXHQvLyBcdGlmICggdGhpcy5wYXJlbnQgPT09IG51bGwgKSB0aGlzLnVwZGF0ZU1hdHJpeFdvcmxkKCk7XG5cbiAgICBcdC8vIFx0aWYgKCB0aGlzLnBhcmVudCA9PT0gbnVsbCApIHRoaXMudXBkYXRlTWF0cml4V29ybGQoKTtcblxuICAgIFx0Ly8gXHR2YXIgY3VycmVudFJlbmRlclRhcmdldCA9IHJlbmRlcmVyLmdldFJlbmRlclRhcmdldCgpO1xuXG4gICAgXHQvLyBcdHZhciByZW5kZXJUYXJnZXQgPSB0aGlzLnJlbmRlclRhcmdldDtcbiAgICBcdC8vIFx0Ly92YXIgZ2VuZXJhdGVNaXBtYXBzID0gcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzO1xuXG4gICAgXHQvLyBcdC8vcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZmFsc2U7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDAgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhUFggKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMSApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFOWCApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCAyICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYVBZICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDMgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhTlkgKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgNCApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFQWiApO1xuXG4gICAgXHQvLyBcdC8vcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZ2VuZXJhdGVNaXBtYXBzO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCA1ICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYU5aICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCBjdXJyZW50UmVuZGVyVGFyZ2V0ICk7XG4gICAgICAgIC8vIH07XG5cdH1cblxuICAgIHNhdmVDdWJlTWFwU2lkZXMoc2x1Zykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5jYXB0dXJlKHNsdWcsIGkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIGNhcHR1cmUgKHNsdWcsIHNpZGUpIHtcbiAgICAgICAgLy92YXIgaXNWUkVuYWJsZWQgPSB3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyLnhyLmVuYWJsZWQ7XG4gICAgICAgIHZhciByZW5kZXJlciA9IHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXI7XG4gICAgICAgIC8vIERpc2FibGUgVlIuXG4gICAgICAgIC8vcmVuZGVyZXIueHIuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlbmRlckNhcHR1cmUoc2lkZSk7XG4gICAgICAgIC8vIFRyaWdnZXIgZmlsZSBkb3dubG9hZC5cbiAgICAgICAgdGhpcy5zYXZlQ2FwdHVyZShzbHVnLCBzaWRlKTtcbiAgICAgICAgLy8gUmVzdG9yZSBWUi5cbiAgICAgICAgLy9yZW5kZXJlci54ci5lbmFibGVkID0gaXNWUkVuYWJsZWQ7XG4gICAgIH1cblxuICAgIHJlbmRlckNhcHR1cmUgKGN1YmVTaWRlKSB7XG4gICAgICAgIHZhciBpbWFnZURhdGE7XG4gICAgICAgIHZhciBwaXhlbHMzID0gbmV3IFVpbnQ4QXJyYXkoMyAqIFRBUkdFVFdJRFRIICogVEFSR0VUSEVJR0hUKTtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gd2luZG93LkFQUC5zY2VuZS5yZW5kZXJlcjtcblxuICAgICAgICByZW5kZXJlci5yZWFkUmVuZGVyVGFyZ2V0UGl4ZWxzKHRoaXMucmVuZGVyVGFyZ2V0LCAwLCAwLCBUQVJHRVRXSURUSCxUQVJHRVRIRUlHSFQsIHBpeGVsczMsIGN1YmVTaWRlKTtcblxuICAgICAgICBwaXhlbHMzID0gdGhpcy5mbGlwUGl4ZWxzVmVydGljYWxseShwaXhlbHMzLCBUQVJHRVRXSURUSCwgVEFSR0VUSEVJR0hUKTtcbiAgICAgICAgdmFyIHBpeGVsczQgPSB0aGlzLmNvbnZlcnQzdG80KHBpeGVsczMsIFRBUkdFVFdJRFRILCBUQVJHRVRIRUlHSFQpO1xuICAgICAgICBpbWFnZURhdGEgPSBuZXcgSW1hZ2VEYXRhKG5ldyBVaW50OENsYW1wZWRBcnJheShwaXhlbHM0KSwgVEFSR0VUV0lEVEgsIFRBUkdFVEhFSUdIVCk7XG5cbiAgICAgICAgLy8gQ29weSBwaXhlbHMgaW50byBjYW52YXMuXG5cbiAgICAgICAgLy8gY291bGQgdXNlIGRyYXdJbWFnZSBpbnN0ZWFkLCB0byBzY2FsZSwgaWYgd2Ugd2FudFxuICAgICAgICB0aGlzLmN0eC5wdXRJbWFnZURhdGEoaW1hZ2VEYXRhLCAwLCAwKTtcbiAgICB9XG5cbiAgICBmbGlwUGl4ZWxzVmVydGljYWxseSAocGl4ZWxzLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHZhciBmbGlwcGVkUGl4ZWxzID0gcGl4ZWxzLnNsaWNlKDApO1xuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHdpZHRoOyArK3gpIHtcbiAgICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IGhlaWdodDsgKyt5KSB7XG4gICAgICAgICAgICBmbGlwcGVkUGl4ZWxzW3ggKiAzICsgeSAqIHdpZHRoICogM10gPSBwaXhlbHNbeCAqIDMgKyAoaGVpZ2h0IC0geSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIDEgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIDEgKyAoaGVpZ2h0IC0geSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIDIgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIDIgKyAoaGVpZ2h0IC0geSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmxpcHBlZFBpeGVscztcbiAgICB9XG5cbiAgICBjb252ZXJ0M3RvNCAocGl4ZWxzLCB3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICAgIHZhciBuZXdQaXhlbHMgPSBuZXcgVWludDhBcnJheSg0ICogVEFSR0VUV0lEVEggKiBUQVJHRVRIRUlHSFQpO1xuXG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgd2lkdGg7ICsreCkge1xuICAgICAgICAgIGZvciAodmFyIHkgPSAwOyB5IDwgaGVpZ2h0OyArK3kpIHtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgKGhlaWdodCAtIHkpICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIDEgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIDEgKyAoaGVpZ2h0IC0geSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMiArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgMiArIChoZWlnaHQgLSB5KSAqIHdpZHRoICogM107XG4gICAgICAgICAgICBuZXdQaXhlbHNbeCAqIDQgKyAzICsgeSAqIHdpZHRoICogNF0gPSAyNTU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXdQaXhlbHM7XG4gICAgfVxuXG5cbiAgICBzaWRlcyA9IFtcbiAgICAgICAgXCJSaWdodFwiLCBcIkxlZnRcIiwgXCJUb3BcIiwgXCJCb3R0b21cIiwgXCJGcm9udFwiLCBcIkJhY2tcIlxuICAgIF1cblxuICAgIHNhdmVDYXB0dXJlIChzbHVnLCBzaWRlKSB7XG4gICAgICAgIHRoaXMuY2FudmFzLnRvQmxvYiggKGJsb2IpID0+IHtcbiAgICAgICAgICAgIHZhciBmaWxlTmFtZSA9IHNsdWcgKyAnLScgKyB0aGlzLnNpZGVzW3NpZGVdICsgJy5wbmcnO1xuICAgICAgICAgICAgdmFyIGxpbmtFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgICAgIHZhciB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICAgICAgbGlua0VsLmhyZWYgPSB1cmw7XG4gICAgICAgICAgICBsaW5rRWwuc2V0QXR0cmlidXRlKCdkb3dubG9hZCcsIGZpbGVOYW1lKTtcbiAgICAgICAgICAgIGxpbmtFbC5pbm5lckhUTUwgPSAnZG93bmxvYWRpbmcuLi4nO1xuICAgICAgICAgICAgbGlua0VsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGxpbmtFbCk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBsaW5rRWwuY2xpY2soKTtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGxpbmtFbCk7XG4gICAgICAgICAgICB9LCAxKTtcbiAgICAgICAgfSwgJ2ltYWdlL3BuZycpO1xuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQ3ViZUNhbWVyYVdyaXRlciIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBCaWRpcmVjdGlvbmFsIHNlZS10aHJvdWdoIHBvcnRhbC4gVHdvIHBvcnRhbHMgYXJlIHBhaXJlZCBieSBjb2xvci5cbiAqXG4gKiBVc2FnZVxuICogPT09PT09PVxuICogQWRkIHR3byBpbnN0YW5jZXMgb2YgYHBvcnRhbC5nbGJgIHRvIHRoZSBTcG9rZSBzY2VuZS5cbiAqIFRoZSBuYW1lIG9mIGVhY2ggaW5zdGFuY2Ugc2hvdWxkIGxvb2sgbGlrZSBcInNvbWUtZGVzY3JpcHRpdmUtbGFiZWxfX2NvbG9yXCJcbiAqIEFueSB2YWxpZCBUSFJFRS5Db2xvciBhcmd1bWVudCBpcyBhIHZhbGlkIGNvbG9yIHZhbHVlLlxuICogU2VlIGhlcmUgZm9yIGV4YW1wbGUgY29sb3IgbmFtZXMgaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9jc3NyZWYvY3NzX2NvbG9ycy5hc3BcbiAqXG4gKiBGb3IgZXhhbXBsZSwgdG8gbWFrZSBhIHBhaXIgb2YgY29ubmVjdGVkIGJsdWUgcG9ydGFscyxcbiAqIHlvdSBjb3VsZCBuYW1lIHRoZW0gXCJwb3J0YWwtdG9fX2JsdWVcIiBhbmQgXCJwb3J0YWwtZnJvbV9fYmx1ZVwiXG4gKi9cbiBpbXBvcnQgKiBhcyBodG1sQ29tcG9uZW50cyBmcm9tIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG5cbmltcG9ydCAnLi9wcm94aW1pdHktZXZlbnRzLmpzJ1xuLy8gaW1wb3J0IHZlcnRleFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC52ZXJ0LmpzJ1xuLy8gaW1wb3J0IGZyYWdtZW50U2hhZGVyIGZyb20gJy4uL3NoYWRlcnMvcG9ydGFsLmZyYWcuanMnXG4vLyBpbXBvcnQgc25vaXNlIGZyb20gJy4uL3NoYWRlcnMvc25vaXNlJ1xuXG5pbXBvcnQgeyBzaG93UmVnaW9uRm9yT2JqZWN0LCBoaWRlclJlZ2lvbkZvck9iamVjdCB9IGZyb20gJy4vcmVnaW9uLWhpZGVyLmpzJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuaW1wb3J0IHsgdXBkYXRlV2l0aFNoYWRlciB9IGZyb20gJy4vc2hhZGVyJ1xuaW1wb3J0IHsgV2FycFBvcnRhbFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvd2FycC1wb3J0YWwuanMnXG5cbmltcG9ydCBnb2xkY29sb3IgZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfQ09MT1IuanBnJ1xuaW1wb3J0IGdvbGREaXNwbGFjZW1lbnQgZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfRElTUC5qcGcnXG5pbXBvcnQgZ29sZGdsb3NzIGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX2dsb3NzaW5lc3MucG5nJ1xuaW1wb3J0IGdvbGRub3JtIGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX05STS5qcGcnXG5pbXBvcnQgZ29sZGFvIGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX09DQy5qcGcnXG5cbmltcG9ydCBDdWJlQ2FtZXJhV3JpdGVyIGZyb20gXCIuLi91dGlscy93cml0ZUN1YmVNYXAuanNcIjtcblxuaW1wb3J0IHsgTWFyYmxlMVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbWFyYmxlMSdcbmltcG9ydCB7IHJlcGxhY2VNYXRlcmlhbCBhcyByZXBsYWNlV2l0aFNoYWRlcn0gZnJvbSAnLi9zaGFkZXInXG5cbmNvbnN0IHdvcmxkUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRDYW1lcmFQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZERpciA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkUXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKClcbmNvbnN0IG1hdDQgPSBuZXcgVEhSRUUuTWF0cml4NCgpXG5cbi8vIGxvYWQgYW5kIHNldHVwIGFsbCB0aGUgYml0cyBvZiB0aGUgdGV4dHVyZXMgZm9yIHRoZSBkb29yXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG5jb25zdCBkb29yTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xuICAgIGNvbG9yOiAweGZmZmZmZixcbiAgICBtZXRhbG5lc3M6IDAuMCxcbiAgICByb3VnaG5lc3M6IDAuMCwgXG4gICAgLy9lbWlzc2l2ZUludGVuc2l0eTogMVxufSlcbmNvbnN0IGRvb3JtYXRlcmlhbFkgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xuICAgIGNvbG9yOiAweGZmZmZmZixcbiAgICBtZXRhbG5lc3M6IDAuMCxcbiAgICByb3VnaG5lc3M6IDAsIFxuICAgIC8vZW1pc3NpdmVJbnRlbnNpdHk6IDFcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRjb2xvciwgKGNvbG9yKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLm1hcCA9IGNvbG9yO1xuICAgIGNvbG9yLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBjb2xvci53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGNvbG9yLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcbmxvYWRlci5sb2FkKGdvbGRjb2xvciwgKGNvbG9yKSA9PiB7XG4gICAgLy9jb2xvciA9IGNvbG9yLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLm1hcCA9IGNvbG9yO1xuICAgIGNvbG9yLnJlcGVhdC5zZXQoMSwxKVxuICAgIGNvbG9yLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBjb2xvci53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGREaXNwbGFjZW1lbnQsIChkaXNwKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLmJ1bXBNYXAgPSBkaXNwO1xuICAgIGRpc3AucmVwZWF0LnNldCgxLDI1KVxuICAgIGRpc3Aud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkaXNwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZERpc3BsYWNlbWVudCwgKGRpc3ApID0+IHtcbiAgICAvL2Rpc3AgPSBkaXNwLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLmJ1bXBNYXAgPSBkaXNwO1xuICAgIGRpc3AucmVwZWF0LnNldCgxLDEpXG4gICAgZGlzcC53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZGlzcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRnbG9zcywgKGdsb3NzKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLnJvdWdobmVzcyA9IGdsb3NzXG4gICAgZ2xvc3MucmVwZWF0LnNldCgxLDI1KVxuICAgIGdsb3NzLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZ2xvc3Mud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkZ2xvc3MsIChnbG9zcykgPT4ge1xuICAgIC8vZ2xvc3MgPSBnbG9zcy5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5yb3VnaG5lc3MgPSBnbG9zc1xuICAgIGdsb3NzLnJlcGVhdC5zZXQoMSwxKVxuICAgIGdsb3NzLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBnbG9zcy53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG4gICAgICAgICBcbmxvYWRlci5sb2FkKGdvbGRhbywgKGFvKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLmFvTWFwID0gYW9cbiAgICBhby5yZXBlYXQuc2V0KDEsMjUpXG4gICAgYW8ud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBhby53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG4gICAgICAgICBcbmxvYWRlci5sb2FkKGdvbGRhbywgKGFvKSA9PiB7XG4gICAgLy8gYW8gPSBhby5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5hb01hcCA9IGFvXG4gICAgYW8ucmVwZWF0LnNldCgxLDEpXG4gICAgYW8ud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGFvLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkb29ybWF0ZXJpYWxZLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZG5vcm0sIChub3JtKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLm5vcm1hbE1hcCA9IG5vcm07XG4gICAgbm9ybS5yZXBlYXQuc2V0KDEsMjUpXG4gICAgbm9ybS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vcm0ud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkbm9ybSwgKG5vcm0pID0+IHtcbiAgICAvLyBub3JtID0gbm9ybS5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5ub3JtYWxNYXAgPSBub3JtO1xuICAgIG5vcm0ucmVwZWF0LnNldCgxLDEpXG4gICAgbm9ybS53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgbm9ybS53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbi8vIC8vIG1hcCBhbGwgbWF0ZXJpYWxzIHZpYSBhIGNhbGxiYWNrLiAgVGFrZW4gZnJvbSBodWJzIG1hdGVyaWFscy11dGlsc1xuLy8gZnVuY3Rpb24gbWFwTWF0ZXJpYWxzKG9iamVjdDNELCBmbikge1xuLy8gICAgIGxldCBtZXNoID0gb2JqZWN0M0QgXG4vLyAgICAgaWYgKCFtZXNoLm1hdGVyaWFsKSByZXR1cm47XG4gIFxuLy8gICAgIGlmIChBcnJheS5pc0FycmF5KG1lc2gubWF0ZXJpYWwpKSB7XG4vLyAgICAgICByZXR1cm4gbWVzaC5tYXRlcmlhbC5tYXAoZm4pO1xuLy8gICAgIH0gZWxzZSB7XG4vLyAgICAgICByZXR1cm4gZm4obWVzaC5tYXRlcmlhbCk7XG4vLyAgICAgfVxuLy8gfVxuICBcbkFGUkFNRS5yZWdpc3RlclN5c3RlbSgncG9ydGFsJywge1xuICBkZXBlbmRlbmNpZXM6IFsnZmFkZXItcGx1cyddLFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyID0gdGhpcy5lbC5zeXN0ZW1zWydodWJzLXN5c3RlbXMnXS5jaGFyYWN0ZXJDb250cm9sbGVyXG4gICAgdGhpcy5mYWRlciA9IHRoaXMuZWwuc3lzdGVtc1snZmFkZXItcGx1cyddXG4gICAgdGhpcy5yb29tRGF0YSA9IG51bGxcbiAgICB0aGlzLndhaXRGb3JGZXRjaCA9IHRoaXMud2FpdEZvckZldGNoLmJpbmQodGhpcylcblxuICAgIC8vIGlmIHRoZSB1c2VyIGlzIGxvZ2dlZCBpbiwgd2Ugd2FudCB0byByZXRyaWV2ZSB0aGVpciB1c2VyRGF0YSBmcm9tIHRoZSB0b3AgbGV2ZWwgc2VydmVyXG4gICAgaWYgKHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMgJiYgd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbiAmJiAhd2luZG93LkFQUC51c2VyRGF0YSkge1xuICAgICAgICB0aGlzLmZldGNoUm9vbURhdGEoKVxuICAgIH1cbiAgfSxcbiAgZmV0Y2hSb29tRGF0YTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXJhbXMgPSB7dG9rZW46IHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMudG9rZW4sXG4gICAgICAgICAgICAgICAgICByb29tX2lkOiB3aW5kb3cuQVBQLmh1YkNoYW5uZWwuaHViSWR9XG5cbiAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgb3B0aW9ucy5oZWFkZXJzID0gbmV3IEhlYWRlcnMoKTtcbiAgICBvcHRpb25zLmhlYWRlcnMuc2V0KFwiQXV0aG9yaXphdGlvblwiLCBgQmVhcmVyICR7cGFyYW1zfWApO1xuICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuICAgIGF3YWl0IGZldGNoKFwiaHR0cHM6Ly9yZWFsaXR5bWVkaWEuZGlnaXRhbC91c2VyRGF0YVwiLCBvcHRpb25zKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4gICAgICAgIC50aGVuKGRhdGEgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdTdWNjZXNzOicsIGRhdGEpO1xuICAgICAgICAgIHRoaXMucm9vbURhdGEgPSBkYXRhO1xuICAgIH0pXG4gICAgdGhpcy5yb29tRGF0YS50ZXh0dXJlcyA9IFtdXG4gIH0sXG4gIGdldFJvb21VUkw6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgIHRoaXMud2FpdEZvckZldGNoKClcbiAgICAgIC8vcmV0dXJuIHRoaXMucm9vbURhdGEucm9vbXMubGVuZ3RoID4gbnVtYmVyID8gXCJodHRwczovL3hyLnJlYWxpdHltZWRpYS5kaWdpdGFsL1wiICsgdGhpcy5yb29tRGF0YS5yb29tc1tudW1iZXJdIDogbnVsbDtcbiAgICAgIGxldCB1cmwgPSB3aW5kb3cuU1NPLnVzZXJJbmZvLnJvb21zLmxlbmd0aCA+IG51bWJlciA/IFwiaHR0cHM6Ly94ci5yZWFsaXR5bWVkaWEuZGlnaXRhbC9cIiArIHdpbmRvdy5TU08udXNlckluZm8ucm9vbXNbbnVtYmVyXSA6IG51bGw7XG4gICAgICByZXR1cm4gdXJsXG4gIH0sXG4gIGdldEN1YmVNYXA6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIsIHdheXBvaW50KSB7XG4gICAgICB0aGlzLndhaXRGb3JGZXRjaCgpXG5cbiAgICAgIGlmICghd2F5cG9pbnQgfHwgd2F5cG9pbnQubGVuZ3RoID09IDApIHtcbiAgICAgICAgICB3YXlwb2ludCA9IFwic3RhcnRcIlxuICAgICAgfVxuICAgICAgbGV0IHVybHMgPSBbXCJSaWdodFwiLFwiTGVmdFwiLFwiVG9wXCIsXCJCb3R0b21cIixcIkZyb250XCIsXCJCYWNrXCJdLm1hcChlbCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvZGF0YS9yb29tUGFub3MvXCIgKyBudW1iZXIudG9TdHJpbmcoKSArIFwiL1wiICsgd2F5cG9pbnQgKyBcIi1cIiArIGVsICsgXCIucG5nXCJcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdXJsc1xuICAgICAgLy9yZXR1cm4gdGhpcy5yb29tRGF0YS5jdWJlbWFwcy5sZW5ndGggPiBudW1iZXIgPyB0aGlzLnJvb21EYXRhLmN1YmVtYXBzW251bWJlcl0gOiBudWxsO1xuICB9LFxuICB3YWl0Rm9yRmV0Y2g6IGZ1bmN0aW9uICgpIHtcbiAgICAgaWYgKHRoaXMucm9vbURhdGEgJiYgd2luZG93LlNTTy51c2VySW5mbykgcmV0dXJuXG4gICAgIHNldFRpbWVvdXQodGhpcy53YWl0Rm9yRmV0Y2gsIDEwMCk7IC8vIHRyeSBhZ2FpbiBpbiAxMDAgbWlsbGlzZWNvbmRzXG4gIH0sXG4gIHRlbGVwb3J0VG86IGFzeW5jIGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gdHJ1ZVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZU91dCgpXG4gICAgLy8gU2NhbGUgc2NyZXdzIHVwIHRoZSB3YXlwb2ludCBsb2dpYywgc28ganVzdCBzZW5kIHBvc2l0aW9uIGFuZCBvcmllbnRhdGlvblxuICAgIG9iamVjdC5nZXRXb3JsZFF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG9iamVjdC5nZXRXb3JsZERpcmVjdGlvbih3b3JsZERpcilcbiAgICBvYmplY3QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICB3b3JsZFBvcy5hZGQod29ybGREaXIubXVsdGlwbHlTY2FsYXIoMykpIC8vIFRlbGVwb3J0IGluIGZyb250IG9mIHRoZSBwb3J0YWwgdG8gYXZvaWQgaW5maW5pdGUgbG9vcFxuICAgIG1hdDQubWFrZVJvdGF0aW9uRnJvbVF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG1hdDQuc2V0UG9zaXRpb24od29ybGRQb3MpXG4gICAgLy8gVXNpbmcgdGhlIGNoYXJhY3RlckNvbnRyb2xsZXIgZW5zdXJlcyB3ZSBkb24ndCBzdHJheSBmcm9tIHRoZSBuYXZtZXNoXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyLnRyYXZlbEJ5V2F5cG9pbnQobWF0NCwgdHJ1ZSwgZmFsc2UpXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlSW4oKVxuICAgIHRoaXMudGVsZXBvcnRpbmcgPSBmYWxzZVxuICB9LFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHBvcnRhbFR5cGU6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgICAgICBwb3J0YWxUYXJnZXQ6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgICAgICBzZWNvbmRhcnlUYXJnZXQ6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgICAgICBjb2xvcjogeyB0eXBlOiAnY29sb3InLCBkZWZhdWx0OiBudWxsIH0sXG4gICAgICAgIG1hdGVyaWFsVGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH0sXG4gICAgICAgIGRyYXdEb29yOiB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogZmFsc2UgfSxcbiAgICAgICAgdGV4dDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbH0sXG4gICAgICAgIHRleHRQb3NpdGlvbjogeyB0eXBlOiAndmVjMycgfSxcbiAgICAgICAgdGV4dFNpemU6IHsgdHlwZTogJ3ZlYzInIH0sXG4gICAgICAgIHRleHRTY2FsZTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9XG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gVEVTVElOR1xuICAgICAgICAvL3RoaXMuZGF0YS5kcmF3RG9vciA9IHRydWVcbiAgICAgICAgLy8gdGhpcy5kYXRhLm1haW5UZXh0ID0gXCJQb3J0YWwgdG8gdGhlIEFieXNzXCJcbiAgICAgICAgLy8gdGhpcy5kYXRhLnNlY29uZGFyeVRleHQgPSBcIlRvIHZpc2l0IHRoZSBBYnlzcywgZ28gdGhyb3VnaCB0aGUgZG9vciFcIlxuXG4gICAgICAgIC8vIEEtRnJhbWUgaXMgc3VwcG9zZWQgdG8gZG8gdGhpcyBieSBkZWZhdWx0IGJ1dCBkb2Vzbid0IHNlZW0gdG8/XG4gICAgICAgIHRoaXMuc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zLnBvcnRhbCBcblxuICAgICAgICBpZiAodGhpcy5kYXRhLnBvcnRhbFR5cGUubGVuZ3RoID4gMCApIHtcbiAgICAgICAgICAgIHRoaXMuc2V0UG9ydGFsSW5mbyh0aGlzLmRhdGEucG9ydGFsVHlwZSwgdGhpcy5kYXRhLnBvcnRhbFRhcmdldCwgdGhpcy5kYXRhLmNvbG9yKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAwKSB7XG4gICAgICAgICAgICAvLyBwYXJzZSB0aGUgbmFtZSB0byBnZXQgcG9ydGFsIHR5cGUsIHRhcmdldCwgYW5kIGNvbG9yXG4gICAgICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyB3YWl0IHVudGlsIHRoZSBzY2VuZSBsb2FkcyB0byBmaW5pc2guICBXZSB3YW50IHRvIG1ha2Ugc3VyZSBldmVyeXRoaW5nXG4gICAgICAgIC8vIGlzIGluaXRpYWxpemVkXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKGV2KSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplKClcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIGluaXRpYWxpemU6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICAgIC8vICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIC8vICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgICAgICAgLy8gICB1bmlmb3Jtczoge1xuICAgICAgICAvLyAgICAgY3ViZU1hcDogeyB2YWx1ZTogbmV3IFRIUkVFLlRleHR1cmUoKSB9LFxuICAgICAgICAvLyAgICAgdGltZTogeyB2YWx1ZTogMCB9LFxuICAgICAgICAvLyAgICAgcmFkaXVzOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIC8vICAgICByaW5nQ29sb3I6IHsgdmFsdWU6IHRoaXMuY29sb3IgfSxcbiAgICAgICAgLy8gICB9LFxuICAgICAgICAvLyAgIHZlcnRleFNoYWRlcixcbiAgICAgICAgLy8gICBmcmFnbWVudFNoYWRlcjogYFxuICAgICAgICAvLyAgICAgJHtzbm9pc2V9XG4gICAgICAgIC8vICAgICAke2ZyYWdtZW50U2hhZGVyfVxuICAgICAgICAvLyAgIGAsXG4gICAgICAgIC8vIH0pXG5cbiAgICAgICAgLy8gQXNzdW1lIHRoYXQgdGhlIG9iamVjdCBoYXMgYSBwbGFuZSBnZW9tZXRyeVxuICAgICAgICAvL2NvbnN0IG1lc2ggPSB0aGlzLmVsLmdldE9yQ3JlYXRlT2JqZWN0M0QoJ21lc2gnKVxuICAgICAgICAvL21lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbHMgPSBudWxsXG4gICAgICAgIHRoaXMucmFkaXVzID0gMC4yXG4gICAgICAgIHRoaXMuY3ViZU1hcCA9IG5ldyBUSFJFRS5DdWJlVGV4dHVyZSgpXG5cbiAgICAgICAgLy8gZ2V0IHRoZSBvdGhlciBiZWZvcmUgY29udGludWluZ1xuICAgICAgICB0aGlzLm90aGVyID0gYXdhaXQgdGhpcy5nZXRPdGhlcigpXG5cbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAgICAgcHJvcGVydHk6ICdjb21wb25lbnRzLnBvcnRhbC5yYWRpdXMnLFxuICAgICAgICAgICAgZHVyOiA3MDAsXG4gICAgICAgICAgICBlYXNpbmc6ICdlYXNlSW5PdXRDdWJpYycsXG4gICAgICAgIH0pXG5cbiAgICAgICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25iZWdpbicsICgpID0+ICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB0cnVlKSlcbiAgICAgICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25jb21wbGV0ZV9fcG9ydGFsJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9ICF0aGlzLmlzQ2xvc2VkKCkpKVxuXG4gICAgICAgIC8vIGdvaW5nIHRvIHdhbnQgdG8gdHJ5IGFuZCBtYWtlIHRoZSBvYmplY3QgdGhpcyBwb3J0YWwgaXMgb24gY2xpY2thYmxlXG4gICAgICAgIC8vIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywnJylcbiAgICAgICAgLy8gdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlfSlcbiAgICAgICAgLy90aGlzLmVsLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAvLyBvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBwb3J0YWwgbW92ZW1lbnQgXG4gICAgICAgIC8vdGhpcy5mb2xsb3dQb3J0YWwgPSB0aGlzLmZvbGxvd1BvcnRhbC5iaW5kKHRoaXMpXG4gICAgICAgIC8vdGhpcy5lbC5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuZm9sbG93UG9ydGFsKVxuXG4gICAgICAgIGlmICggdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdIHx8IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdICkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cFBvcnRhbCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLmRyYXdEb29yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgZm4pXG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgZm4pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKVxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cERvb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldHVwUG9ydGFsKClcbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHNldHVwUG9ydGFsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLmRhdGEubWF0ZXJpYWxUYXJnZXRcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0YXJnZXQubGVuZ3RoID09IDApIHt0YXJnZXQ9bnVsbH1cbiAgICBcbiAgICAgICAgdGhpcy5tYXRlcmlhbHMgPSB1cGRhdGVXaXRoU2hhZGVyKFdhcnBQb3J0YWxTaGFkZXIsIHRoaXMuZWwsIHRhcmdldCwge1xuICAgICAgICAgICAgcmFkaXVzOiB0aGlzLnJhZGl1cyxcbiAgICAgICAgICAgIHJpbmdDb2xvcjogdGhpcy5jb2xvcixcbiAgICAgICAgICAgIGN1YmVNYXA6IHRoaXMuY3ViZU1hcCxcbiAgICAgICAgICAgIGludmVydFdhcnBDb2xvcjogdGhpcy5wb3J0YWxUeXBlID09IDEgPyAxIDogMFxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Q3ViZU1hcCh0aGlzLnBvcnRhbFRhcmdldCwgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCkudGhlbiggdXJscyA9PiB7XG4gICAgICAgICAgICAgICAgLy9jb25zdCB1cmxzID0gW2N1YmVNYXBQb3NYLCBjdWJlTWFwTmVnWCwgY3ViZU1hcFBvc1ksIGN1YmVNYXBOZWdZLCBjdWJlTWFwUG9zWiwgY3ViZU1hcE5lZ1pdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLkN1YmVUZXh0dXJlTG9hZGVyKCkubG9hZCh1cmxzLCByZXNvbHZlLCB1bmRlZmluZWQsIHJlamVjdClcbiAgICAgICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRleHR1cmU7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gdGV4dHVyZVxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyIHx8IHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7ICAgIFxuICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMC4xLCAxMDAwLCAxMDI0KVxuICAgICAgICAgICAgLy90aGlzLmN1YmVDYW1lcmEucm90YXRlWShNYXRoLlBJKSAvLyBGYWNlIGZvcndhcmRzXG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlIFxuICAgICAgICAgICAgICAgIC8vdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTt9KVxuICAgICAgICAgICAgICAgIHRoaXMub3RoZXIuY29tcG9uZW50cy5wb3J0YWwuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsZXQgd2F5cG9pbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKHRoaXMucG9ydGFsVGFyZ2V0KVxuICAgICAgICAgICAgICAgIGlmICh3YXlwb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHdheXBvaW50ID0gd2F5cG9pbnQuaXRlbSgwKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEucG9zaXRpb24ueSA9IDEuNlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgIHdheXBvaW50Lm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgc2hvd1JlZ2lvbkZvck9iamVjdCh0aGlzLmVsKVxuICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS51cGRhdGUodGhpcy5lbC5zY2VuZUVsLnJlbmRlcmVyLCB0aGlzLmVsLnNjZW5lRWwub2JqZWN0M0QpXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IHRydWVcbiAgICAgICAgICAgICAgICAvLyB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgaGlkZXJSZWdpb25Gb3JPYmplY3QodGhpcy5lbClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBvZmZzZXQgdG8gY2VudGVyIG9mIHBvcnRhbCBhc3N1bWluZyB3YWxraW5nIG9uIGdyb3VuZFxuICAgICAgICB0aGlzLllvZmZzZXQgPSAtKHRoaXMuZWwub2JqZWN0M0QucG9zaXRpb24ueSAtIDEuNilcblxuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiA0LCBZb2Zmc2V0OiB0aGlzLllvZmZzZXQgfSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMub3BlbigpKVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5jbG9zZSgpKVxuICAgIFxuICAgICAgICB2YXIgdGl0bGVTY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgd2lkdGg6IHRoaXMuZGF0YS50ZXh0U2l6ZS54LFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmRhdGEudGV4dFNpemUueSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IHRoaXMuZGF0YS50ZXh0XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcG9ydGFsVGl0bGUgPSBodG1sQ29tcG9uZW50c1tcIlBvcnRhbFRpdGxlXCJdXG4gICAgICAgIC8vIGNvbnN0IHBvcnRhbFN1YnRpdGxlID0gaHRtbENvbXBvbmVudHNbXCJQb3J0YWxTdWJ0aXRsZVwiXVxuXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUgPSBwb3J0YWxUaXRsZSh0aXRsZVNjcmlwdERhdGEpXG4gICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUgPSBwb3J0YWxTdWJ0aXRsZShzdWJ0aXRsZVNjcmlwdERhdGEpXG5cbiAgICAgICAgdGhpcy5lbC5zZXRPYmplY3QzRCgncG9ydGFsVGl0bGUnLCB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QpXG5cbiAgICAgICAgbGV0IHNpemUgPSB0aGlzLnBvcnRhbFRpdGxlLmdldFNpemUoKVxuICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgbGV0IHNjYWxlWCA9IChzY2FsZU0ueCAqIHNjYWxlSS54KSAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiAgICAgICAgbGV0IHNjYWxlWSA9IChzY2FsZU0ueSAqIHNjYWxlSS55KSAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiAgICAgICAgbGV0IHNjYWxlWiA9IChzY2FsZU0ueSAqIHNjYWxlSS55KSAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiBcbiAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnggLz0gc2NhbGVYXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5zY2FsZS55IC89IHNjYWxlWVxuXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi54ID0gdGhpcy5kYXRhLnRleHRQb3NpdGlvbi54IC8gc2NhbGVYXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi55ID0gMC41ICsgc2l6ZS5oZWlnaHQgLyAyICsgdGhpcy5kYXRhLnRleHRQb3NpdGlvbi55IC8gc2NhbGVZXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi56ID0gdGhpcy5kYXRhLnRleHRQb3NpdGlvbi56IC8gc2NhbGVaXG4gICAgICAgIC8vIHRoaXMuZWwuc2V0T2JqZWN0M0QoJ3BvcnRhbFN1YnRpdGxlJywgdGhpcy5wb3J0YWxTdWJ0aXRsZS53ZWJMYXllcjNEKVxuICAgICAgICAvLyB0aGlzLnBvcnRhbFN1YnRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueCA9IDFcbiAgICAgICAgdGhpcy5lbC5zZXRPYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZS53ZWJMYXllcjNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG5cbiAgICAgICAgLy8gdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHtcbiAgICAgICAgLy8gICAgIG1hdC51c2VyRGF0YS5yYWRpdXMgPSB0aGlzLnJhZGl1c1xuICAgICAgICAvLyAgICAgbWF0LnVzZXJEYXRhLnJpbmdDb2xvciA9IHRoaXMuY29sb3JcbiAgICAgICAgLy8gICAgIG1hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlTWFwXG4gICAgICAgIC8vIH0pXG4gICAgfSxcbiAgICAgICAgLy8gICByZXBsYWNlTWF0ZXJpYWw6IGZ1bmN0aW9uIChuZXdNYXRlcmlhbCkge1xuLy8gICAgIGxldCB0YXJnZXQgPSB0aGlzLmRhdGEubWF0ZXJpYWxUYXJnZXRcbi8vICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgIFxuLy8gICAgIGxldCB0cmF2ZXJzZSA9IChvYmplY3QpID0+IHtcbi8vICAgICAgIGxldCBtZXNoID0gb2JqZWN0XG4vLyAgICAgICBpZiAobWVzaC5tYXRlcmlhbCkge1xuLy8gICAgICAgICAgIG1hcE1hdGVyaWFscyhtZXNoLCAobWF0ZXJpYWwpID0+IHsgICAgICAgICBcbi8vICAgICAgICAgICAgICAgaWYgKCF0YXJnZXQgfHwgbWF0ZXJpYWwubmFtZSA9PT0gdGFyZ2V0KSB7XG4vLyAgICAgICAgICAgICAgICAgICBtZXNoLm1hdGVyaWFsID0gbmV3TWF0ZXJpYWxcbi8vICAgICAgICAgICAgICAgfVxuLy8gICAgICAgICAgIH0pXG4vLyAgICAgICB9XG4vLyAgICAgICBjb25zdCBjaGlsZHJlbiA9IG9iamVjdC5jaGlsZHJlbjtcbi8vICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbi8vICAgICAgICAgICB0cmF2ZXJzZShjaGlsZHJlbltpXSk7XG4vLyAgICAgICB9XG4vLyAgICAgfVxuXG4vLyAgICAgbGV0IHJlcGxhY2VNYXRlcmlhbHMgPSAoKSA9PiB7XG4vLyAgICAgICAgIC8vIG1lc2ggd291bGQgY29udGFpbiB0aGUgb2JqZWN0IHRoYXQgaXMsIG9yIGNvbnRhaW5zLCB0aGUgbWVzaGVzXG4vLyAgICAgICAgIHZhciBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4vLyAgICAgICAgIGlmICghbWVzaCkge1xuLy8gICAgICAgICAgICAgLy8gaWYgbm8gbWVzaCwgd2UnbGwgc2VhcmNoIHRocm91Z2ggYWxsIG9mIHRoZSBjaGlsZHJlbi4gIFRoaXMgd291bGRcbi8vICAgICAgICAgICAgIC8vIGhhcHBlbiBpZiB3ZSBkcm9wcGVkIHRoZSBjb21wb25lbnQgb24gYSBnbGIgaW4gc3Bva2Vcbi8vICAgICAgICAgICAgIG1lc2ggPSB0aGlzLmVsLm9iamVjdDNEXG4vLyAgICAgICAgIH1cbi8vICAgICAgICAgdHJhdmVyc2UobWVzaCk7XG4vLyAgICAgICAgLy8gdGhpcy5lbC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGluaXRpYWxpemVyKTtcbi8vICAgICB9XG5cbi8vICAgICAvLyBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbi8vICAgICAvLyBsZXQgaW5pdGlhbGl6ZXIgPSAoKSA9Pntcbi8vICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbi8vICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgcmVwbGFjZU1hdGVyaWFscylcbi8vICAgICAgIH0gZWxzZSB7XG4vLyAgICAgICAgICAgcmVwbGFjZU1hdGVyaWFscygpXG4vLyAgICAgICB9XG4vLyAgICAgLy8gfTtcbi8vICAgICAvL3JlcGxhY2VNYXRlcmlhbHMoKVxuLy8gICAgIC8vIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4vLyAgIH0sXG5cbi8vICAgZm9sbG93UG9ydGFsOiBmdW5jdGlvbigpIHtcbi8vICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEpIHtcbi8vICAgICAgICAgY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhyZWYgdG8gXCIgKyB0aGlzLm90aGVyKVxuLy8gICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbi8vICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbi8vICAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuLy8gICAgICAgfVxuLy8gICB9LFxuXG4gICAgc2V0dXBEb29yOiBmdW5jdGlvbigpIHtcbiAgICAgICAgLy8gYXR0YWNoZWQgdG8gYW4gaW1hZ2UgaW4gc3Bva2UuICBUaGlzIGlzIHRoZSBvbmx5IHdheSB3ZSBhbGxvdyBidWlkbGluZyBhIFxuICAgICAgICAvLyBkb29yIGFyb3VuZCBpdFxuICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgdmFyIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICB2YXIgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICB2YXIgZGVwdGggPSAxLjA7IC8vICBzY2FsZU0ueiAqIHNjYWxlSS56XG5cbiAgICAgICAgY29uc3QgZW52aXJvbm1lbnRNYXBDb21wb25lbnQgPSB0aGlzLmVsLnNjZW5lRWwuY29tcG9uZW50c1tcImVudmlyb25tZW50LW1hcFwiXTtcblxuICAgICAgICAvLyBsZXQgYWJvdmUgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgLy8gICAgIG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSgxLCA1MCwgNTApLFxuICAgICAgICAvLyAgICAgZG9vcm1hdGVyaWFsWSBcbiAgICAgICAgLy8gKTtcbiAgICAgICAgLy8gaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgIC8vICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKGFib3ZlKTtcbiAgICAgICAgLy8gfVxuICAgICAgICAvLyBhYm92ZS5wb3NpdGlvbi5zZXQoMCwgMi41LCAwKVxuICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmFkZChhYm92ZSlcblxuICAgICAgICBsZXQgbGVmdCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgLy8gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwyL2hlaWdodCwwLjEvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwxLDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29ybWF0ZXJpYWxZLCBkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWxdLCBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAobGVmdCk7XG4gICAgICAgIH1cbiAgICAgICAgbGVmdC5wb3NpdGlvbi5zZXQoLTAuNTEsIDAsIDApXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKGxlZnQpXG5cbiAgICAgICAgbGV0IHJpZ2h0ID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMC4xL3dpZHRoLDEsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIFtkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsLGRvb3JtYXRlcmlhbFksIGRvb3JtYXRlcmlhbFksZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbF0sIFxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcChyaWdodCk7XG4gICAgICAgIH1cbiAgICAgICAgcmlnaHQucG9zaXRpb24uc2V0KDAuNTEsIDAsIDApXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHJpZ2h0KVxuXG4gICAgICAgIGxldCB0b3AgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxICsgMC4zL3dpZHRoLDAuMS9oZWlnaHQsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIFtkb29ybWF0ZXJpYWxZLGRvb3JtYXRlcmlhbFksZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKHRvcCk7XG4gICAgICAgIH1cbiAgICAgICAgdG9wLnBvc2l0aW9uLnNldCgwLjAsIDAuNTA1LCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0b3ApXG5cbiAgICAgICAgLy8gaWYgKHdpZHRoID4gMCAmJiBoZWlnaHQgPiAwKSB7XG4gICAgICAgIC8vICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAvLyAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgIC8vICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgLy8gfVxuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICAvL3RoaXMubWF0ZXJpYWwudW5pZm9ybXMudGltZS52YWx1ZSA9IHRpbWUgLyAxMDAwXG4gICAgICAgIGlmICghdGhpcy5tYXRlcmlhbHMpIHsgcmV0dXJuIH1cblxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLnRpY2sodGltZSlcbiAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZS50aWNrKHRpbWUpXG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHtcbiAgICAgICAgICAgIG1hdC51c2VyRGF0YS5yYWRpdXMgPSB0aGlzLnJhZGl1c1xuICAgICAgICAgICAgbWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0aGlzLmN1YmVNYXBcbiAgICAgICAgICAgIFdhcnBQb3J0YWxTaGFkZXIudXBkYXRlVW5pZm9ybXModGltZSwgbWF0KVxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICh0aGlzLm90aGVyICYmICF0aGlzLnN5c3RlbS50ZWxlcG9ydGluZykge1xuICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmFQb3MpXG4gICAgICAgICAgd29ybGRDYW1lcmFQb3MueSAtPSB0aGlzLllvZmZzZXRcbiAgICAgICAgICBjb25zdCBkaXN0ID0gd29ybGRDYW1lcmFQb3MuZGlzdGFuY2VUbyh3b3JsZFBvcylcblxuICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSAmJiBkaXN0IDwgMC41KSB7XG4gICAgICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInNldCB3aW5kb3cubG9jYXRpb24uaHJlZiB0byBcIiArIHRoaXMub3RoZXIpXG4gICAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyICYmIGRpc3QgPCAwLjUpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7XG4gICAgICAgICAgICAgIGlmIChkaXN0IDwgMC41KSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmxvY2F0aW9uaHJlZikge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhhc2ggdG8gXCIgKyB0aGlzLm90aGVyKVxuICAgICAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHRoaXMub3RoZXJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBzZXQgbG9jYXRpb25ocmVmLCB3ZSB0ZWxlcG9ydGVkLiAgd2hlbiBpdFxuICAgICAgICAgICAgICAgICAgLy8gZmluYWxseSBoYXBwZW5zLCBhbmQgd2UgbW92ZSBvdXRzaWRlIHRoZSByYW5nZSBvZiB0aGUgcG9ydGFsLFxuICAgICAgICAgICAgICAgICAgLy8gd2Ugd2lsbCBjbGVhciB0aGUgZmxhZ1xuICAgICAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSBudWxsXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICBnZXRPdGhlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMCkgcmVzb2x2ZShudWxsKVxuICAgICAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSAgPT0gMSkge1xuICAgICAgICAgICAgICAgIC8vIHRoZSB0YXJnZXQgaXMgYW5vdGhlciByb29tLCByZXNvbHZlIHdpdGggdGhlIFVSTCB0byB0aGUgcm9vbVxuICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldFJvb21VUkwodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4odXJsID0+IHsgXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0ICYmIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh1cmwgKyBcIiNcIiArIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCkgXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSAoXCIjXCIgKyB0aGlzLnBvcnRhbFRhcmdldClcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbm93IGZpbmQgdGhlIHBvcnRhbCB3aXRoaW4gdGhlIHJvb20uICBUaGUgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycyB3aXRoIHRoZSBzYW1lIHBvcnRhbFRhcmdldFxuICAgICAgICAgICAgY29uc3QgcG9ydGFscyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChgW3BvcnRhbF1gKSlcbiAgICAgICAgICAgIGNvbnN0IG90aGVyID0gcG9ydGFscy5maW5kKChlbCkgPT4gZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVHlwZSA9PSB0aGlzLnBvcnRhbFR5cGUgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVGFyZ2V0ID09PSB0aGlzLnBvcnRhbFRhcmdldCAmJiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZWwgIT09IHRoaXMuZWwpXG4gICAgICAgICAgICBpZiAob3RoZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIC8vIENhc2UgMTogVGhlIG90aGVyIHBvcnRhbCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgICAgIHJlc29sdmUob3RoZXIpO1xuICAgICAgICAgICAgICAgIG90aGVyLmVtaXQoJ3BhaXInLCB7IG90aGVyOiB0aGlzLmVsIH0pIC8vIExldCB0aGUgb3RoZXIga25vdyB0aGF0IHdlJ3JlIHJlYWR5XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIENhc2UgMjogV2UgY291bGRuJ3QgZmluZCB0aGUgb3RoZXIgcG9ydGFsLCB3YWl0IGZvciBpdCB0byBzaWduYWwgdGhhdCBpdCdzIHJlYWR5XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwYWlyJywgKGV2ZW50KSA9PiB7IFxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGV2ZW50LmRldGFpbC5vdGhlcilcbiAgICAgICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICB9LFxuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBub2RlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG5cbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBlaXRoZXIgXG4gICAgICAgIC8vIC0gXCJyb29tX25hbWVfY29sb3JcIlxuICAgICAgICAvLyAtIFwicG9ydGFsX05fY29sb3JcIiBcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiBOdW1iZXJlZCBwb3J0YWxzIHNob3VsZCBjb21lIGluIHBhaXJzLlxuICAgICAgICBjb25zdCBwYXJhbXMgPSBub2RlTmFtZS5tYXRjaCgvKFtBLVphLXpdKilfKFtBLVphLXowLTldKilfKFtBLVphLXowLTldKikkLylcbiAgICAgICAgXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiA0LCBmaXJzdCBtYXRjaCBpcyB0aGUgcG9ydGFsIHR5cGUsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgbmFtZSBvciBudW1iZXIsIGFuZCBsYXN0IGlzIHRoZSBjb2xvclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicG9ydGFsIG5vZGUgbmFtZSBub3QgZm9ybWVkIGNvcnJlY3RseTogXCIsIG5vZGVOYW1lKVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMFxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgICAgICB0aGlzLmNvbG9yID0gXCJyZWRcIiAvLyBkZWZhdWx0IHNvIHRoZSBwb3J0YWwgaGFzIGEgY29sb3IgdG8gdXNlXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuc2V0UG9ydGFsSW5mbyhwYXJhbXNbMV0sIHBhcmFtc1syXSwgcGFyYW1zWzNdKVxuICAgIH0sXG5cbiAgICBzZXRQb3J0YWxJbmZvOiBmdW5jdGlvbihwb3J0YWxUeXBlLCBwb3J0YWxUYXJnZXQsIGNvbG9yKSB7XG4gICAgICAgIGlmIChwb3J0YWxUeXBlID09PSBcInJvb21cIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMTtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcGFyc2VJbnQocG9ydGFsVGFyZ2V0KVxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwicG9ydGFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDI7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBvcnRhbFRhcmdldFxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMztcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcG9ydGFsVGFyZ2V0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IoY29sb3IpXG4gICAgfSxcblxuICAgIHNldFJhZGl1cyh2YWwpIHtcbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAvLyAgIGZyb206IHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlLFxuICAgICAgICAgICAgZnJvbTogdGhpcy5yYWRpdXMsXG4gICAgICAgICAgICB0bzogdmFsLFxuICAgICAgICB9KVxuICAgIH0sXG4gICAgb3BlbigpIHtcbiAgICAgICAgdGhpcy5zZXRSYWRpdXMoMSlcbiAgICB9LFxuICAgIGNsb3NlKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygwLjIpXG4gICAgfSxcbiAgICBpc0Nsb3NlZCgpIHtcbiAgICAgICAgLy8gcmV0dXJuIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlID09PSAwXG4gICAgICAgIHJldHVybiB0aGlzLnJhZGl1cyA9PT0gMC4yXG4gICAgfSxcbn0pXG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9lMTcwMmVhMjFhZmI0YTg2LnBuZ1wiIiwiY29uc3QgZ2xzbCA9IGBcbnZhcnlpbmcgdmVjMiBiYWxsdlV2O1xudmFyeWluZyB2ZWMzIGJhbGx2UG9zaXRpb247XG52YXJ5aW5nIHZlYzMgYmFsbHZOb3JtYWw7XG52YXJ5aW5nIHZlYzMgYmFsbHZXb3JsZFBvcztcbnVuaWZvcm0gZmxvYXQgYmFsbFRpbWU7XG51bmlmb3JtIGZsb2F0IHNlbGVjdGVkO1xuXG5tYXQ0IGJhbGxpbnZlcnNlKG1hdDQgbSkge1xuICBmbG9hdFxuICAgICAgYTAwID0gbVswXVswXSwgYTAxID0gbVswXVsxXSwgYTAyID0gbVswXVsyXSwgYTAzID0gbVswXVszXSxcbiAgICAgIGExMCA9IG1bMV1bMF0sIGExMSA9IG1bMV1bMV0sIGExMiA9IG1bMV1bMl0sIGExMyA9IG1bMV1bM10sXG4gICAgICBhMjAgPSBtWzJdWzBdLCBhMjEgPSBtWzJdWzFdLCBhMjIgPSBtWzJdWzJdLCBhMjMgPSBtWzJdWzNdLFxuICAgICAgYTMwID0gbVszXVswXSwgYTMxID0gbVszXVsxXSwgYTMyID0gbVszXVsyXSwgYTMzID0gbVszXVszXSxcblxuICAgICAgYjAwID0gYTAwICogYTExIC0gYTAxICogYTEwLFxuICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgYjAyID0gYTAwICogYTEzIC0gYTAzICogYTEwLFxuICAgICAgYjAzID0gYTAxICogYTEyIC0gYTAyICogYTExLFxuICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgYjA1ID0gYTAyICogYTEzIC0gYTAzICogYTEyLFxuICAgICAgYjA2ID0gYTIwICogYTMxIC0gYTIxICogYTMwLFxuICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgYjA4ID0gYTIwICogYTMzIC0gYTIzICogYTMwLFxuICAgICAgYjA5ID0gYTIxICogYTMyIC0gYTIyICogYTMxLFxuICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgYjExID0gYTIyICogYTMzIC0gYTIzICogYTMyLFxuXG4gICAgICBkZXQgPSBiMDAgKiBiMTEgLSBiMDEgKiBiMTAgKyBiMDIgKiBiMDkgKyBiMDMgKiBiMDggLSBiMDQgKiBiMDcgKyBiMDUgKiBiMDY7XG5cbiAgcmV0dXJuIG1hdDQoXG4gICAgICBhMTEgKiBiMTEgLSBhMTIgKiBiMTAgKyBhMTMgKiBiMDksXG4gICAgICBhMDIgKiBiMTAgLSBhMDEgKiBiMTEgLSBhMDMgKiBiMDksXG4gICAgICBhMzEgKiBiMDUgLSBhMzIgKiBiMDQgKyBhMzMgKiBiMDMsXG4gICAgICBhMjIgKiBiMDQgLSBhMjEgKiBiMDUgLSBhMjMgKiBiMDMsXG4gICAgICBhMTIgKiBiMDggLSBhMTAgKiBiMTEgLSBhMTMgKiBiMDcsXG4gICAgICBhMDAgKiBiMTEgLSBhMDIgKiBiMDggKyBhMDMgKiBiMDcsXG4gICAgICBhMzIgKiBiMDIgLSBhMzAgKiBiMDUgLSBhMzMgKiBiMDEsXG4gICAgICBhMjAgKiBiMDUgLSBhMjIgKiBiMDIgKyBhMjMgKiBiMDEsXG4gICAgICBhMTAgKiBiMTAgLSBhMTEgKiBiMDggKyBhMTMgKiBiMDYsXG4gICAgICBhMDEgKiBiMDggLSBhMDAgKiBiMTAgLSBhMDMgKiBiMDYsXG4gICAgICBhMzAgKiBiMDQgLSBhMzEgKiBiMDIgKyBhMzMgKiBiMDAsXG4gICAgICBhMjEgKiBiMDIgLSBhMjAgKiBiMDQgLSBhMjMgKiBiMDAsXG4gICAgICBhMTEgKiBiMDcgLSBhMTAgKiBiMDkgLSBhMTIgKiBiMDYsXG4gICAgICBhMDAgKiBiMDkgLSBhMDEgKiBiMDcgKyBhMDIgKiBiMDYsXG4gICAgICBhMzEgKiBiMDEgLSBhMzAgKiBiMDMgLSBhMzIgKiBiMDAsXG4gICAgICBhMjAgKiBiMDMgLSBhMjEgKiBiMDEgKyBhMjIgKiBiMDApIC8gZGV0O1xufVxuXG5cbm1hdDQgYmFsbHRyYW5zcG9zZShpbiBtYXQ0IG0pIHtcbiAgdmVjNCBpMCA9IG1bMF07XG4gIHZlYzQgaTEgPSBtWzFdO1xuICB2ZWM0IGkyID0gbVsyXTtcbiAgdmVjNCBpMyA9IG1bM107XG5cbiAgcmV0dXJuIG1hdDQoXG4gICAgdmVjNChpMC54LCBpMS54LCBpMi54LCBpMy54KSxcbiAgICB2ZWM0KGkwLnksIGkxLnksIGkyLnksIGkzLnkpLFxuICAgIHZlYzQoaTAueiwgaTEueiwgaTIueiwgaTMueiksXG4gICAgdmVjNChpMC53LCBpMS53LCBpMi53LCBpMy53KVxuICApO1xufVxuXG52b2lkIG1haW4oKVxue1xuICBiYWxsdlV2ID0gdXY7XG5cbiAgYmFsbHZQb3NpdGlvbiA9IHBvc2l0aW9uO1xuXG4gIHZlYzMgb2Zmc2V0ID0gdmVjMyhcbiAgICBzaW4ocG9zaXRpb24ueCAqIDUwLjAgKyBiYWxsVGltZSksXG4gICAgc2luKHBvc2l0aW9uLnkgKiAxMC4wICsgYmFsbFRpbWUgKiAyLjApLFxuICAgIGNvcyhwb3NpdGlvbi56ICogNDAuMCArIGJhbGxUaW1lKVxuICApICogMC4wMDM7XG5cbiAgIGJhbGx2UG9zaXRpb24gKj0gMS4wICsgc2VsZWN0ZWQgKiAwLjI7XG5cbiAgIGJhbGx2Tm9ybWFsID0gbm9ybWFsaXplKGJhbGxpbnZlcnNlKGJhbGx0cmFuc3Bvc2UobW9kZWxNYXRyaXgpKSAqIHZlYzQobm9ybWFsaXplKG5vcm1hbCksIDEuMCkpLnh5ejtcbiAgIGJhbGx2V29ybGRQb3MgPSAobW9kZWxNYXRyaXggKiB2ZWM0KGJhbGx2UG9zaXRpb24sIDEuMCkpLnh5ejtcblxuICAgdmVjNCBiYWxsdlBvc2l0aW9uID0gbW9kZWxWaWV3TWF0cml4ICogdmVjNChiYWxsdlBvc2l0aW9uICsgb2Zmc2V0LCAxLjApO1xuXG4gIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbk1hdHJpeCAqIGJhbGx2UG9zaXRpb247XG59XG5gXG5cbmV4cG9ydCBkZWZhdWx0IGdsc2wiLCJjb25zdCBnbHNsID0gYFxudW5pZm9ybSBzYW1wbGVyMkQgcGFub3RleDtcbnVuaWZvcm0gc2FtcGxlcjJEIHRleGZ4O1xudW5pZm9ybSBmbG9hdCBiYWxsVGltZTtcbnVuaWZvcm0gZmxvYXQgc2VsZWN0ZWQ7XG52YXJ5aW5nIHZlYzIgYmFsbHZVdjtcbnZhcnlpbmcgdmVjMyBiYWxsdlBvc2l0aW9uO1xudmFyeWluZyB2ZWMzIGJhbGx2Tm9ybWFsO1xudmFyeWluZyB2ZWMzIGJhbGx2V29ybGRQb3M7XG5cbnVuaWZvcm0gZmxvYXQgb3BhY2l0eTtcblxudm9pZCBtYWluKCB2b2lkICkge1xuICAgdmVjMiB1diA9IGJhbGx2VXY7XG4gIC8vdXYueSA9ICAxLjAgLSB1di55O1xuXG4gICB2ZWMzIGV5ZSA9IG5vcm1hbGl6ZShjYW1lcmFQb3NpdGlvbiAtIGJhbGx2V29ybGRQb3MpO1xuICAgZmxvYXQgZnJlc25lbCA9IGFicyhkb3QoZXllLCBiYWxsdk5vcm1hbCkpO1xuICAgZmxvYXQgc2hpZnQgPSBwb3coKDEuMCAtIGZyZXNuZWwpLCA0LjApICogMC4wNTtcblxuICB2ZWMzIGNvbCA9IHZlYzMoXG4gICAgdGV4dHVyZTJEKHBhbm90ZXgsIHV2IC0gc2hpZnQpLnIsXG4gICAgdGV4dHVyZTJEKHBhbm90ZXgsIHV2KS5nLFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1diArIHNoaWZ0KS5iXG4gICk7XG5cbiAgIGNvbCA9IG1peChjb2wgKiAwLjcsIHZlYzMoMS4wKSwgMC43IC0gZnJlc25lbCk7XG5cbiAgIGNvbCArPSBzZWxlY3RlZCAqIDAuMztcblxuICAgZmxvYXQgdCA9IGJhbGxUaW1lICogMC40ICsgYmFsbHZQb3NpdGlvbi54ICsgYmFsbHZQb3NpdGlvbi56O1xuICAgdXYgPSB2ZWMyKGJhbGx2VXYueCArIHQgKiAwLjIsIGJhbGx2VXYueSArIHQpO1xuICAgdmVjMyBmeCA9IHRleHR1cmUyRCh0ZXhmeCwgdXYpLnJnYiAqIDAuNDtcblxuICAvL3ZlYzQgY29sID0gdmVjNCgxLjAsIDEuMCwgMC4wLCAxLjApO1xuICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbCArIGZ4LCBvcGFjaXR5KTtcbiAgLy9nbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbCArIGZ4LCAxLjApO1xufVxuYFxuXG5leHBvcnQgZGVmYXVsdCBnbHNsIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIDM2MCBpbWFnZSB0aGF0IGZpbGxzIHRoZSB1c2VyJ3MgdmlzaW9uIHdoZW4gaW4gYSBjbG9zZSBwcm94aW1pdHkuXG4gKlxuICogVXNhZ2VcbiAqID09PT09PT1cbiAqIEdpdmVuIGEgMzYwIGltYWdlIGFzc2V0IHdpdGggdGhlIGZvbGxvd2luZyBVUkwgaW4gU3Bva2U6XG4gKiBodHRwczovL2d0LWFlbC1hcS1hc3NldHMuYWVsYXRndC1pbnRlcm5hbC5uZXQvZmlsZXMvMTIzNDVhYmMtNjc4OWRlZi5qcGdcbiAqXG4gKiBUaGUgbmFtZSBvZiB0aGUgYGltbWVyc2l2ZS0zNjAuZ2xiYCBpbnN0YW5jZSBpbiB0aGUgc2NlbmUgc2hvdWxkIGJlOlxuICogXCJzb21lLWRlc2NyaXB0aXZlLWxhYmVsX18xMjM0NWFiYy02Nzg5ZGVmX2pwZ1wiIE9SIFwiMTIzNDVhYmMtNjc4OWRlZl9qcGdcIlxuICovXG5cbmltcG9ydCBiYWxsZnggZnJvbSAnLi4vYXNzZXRzL2JhbGxmeC5wbmcnXG5pbXBvcnQgcGFub3ZlcnQgZnJvbSAnLi4vc2hhZGVycy9wYW5vYmFsbC52ZXJ0J1xuaW1wb3J0IHBhbm9mcmFnIGZyb20gJy4uL3NoYWRlcnMvcGFub2JhbGwuZnJhZydcblxuY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBiYWxsVGV4ID0gbnVsbFxubG9hZGVyLmxvYWQoYmFsbGZ4LCAoYmFsbCkgPT4ge1xuICAgIGJhbGwubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYWxsLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmFsbC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJhbGwud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYWxsVGV4ID0gYmFsbFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywge1xuICBzY2hlbWE6IHtcbiAgICB1cmw6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IG51bGwgfSxcbiAgfSxcbiAgaW5pdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHZhciB1cmwgPSB0aGlzLmRhdGEudXJsXG4gICAgaWYgKCF1cmwgfHwgdXJsID09IFwiXCIpIHtcbiAgICAgICAgdXJsID0gdGhpcy5wYXJzZVNwb2tlTmFtZSgpXG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHVybC5tYXRjaCgvXi4qXFwuKC4qKSQvKVsxXVxuXG4gICAgLy8gbWVkaWEtaW1hZ2Ugd2lsbCBzZXQgdXAgdGhlIHNwaGVyZSBnZW9tZXRyeSBmb3IgdXNcbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnbWVkaWEtaW1hZ2UnLCB7XG4gICAgICBwcm9qZWN0aW9uOiAnMzYwLWVxdWlyZWN0YW5ndWxhcicsXG4gICAgICBhbHBoYU1vZGU6ICdvcGFxdWUnLFxuICAgICAgc3JjOiB1cmwsXG4gICAgICB2ZXJzaW9uOiAxLFxuICAgICAgYmF0Y2g6IGZhbHNlLFxuICAgICAgY29udGVudFR5cGU6IGBpbWFnZS8ke2V4dGVuc2lvbn1gLFxuICAgICAgYWxwaGFDdXRvZmY6IDAsXG4gICAgfSlcbiAgICAvLyBidXQgd2UgbmVlZCB0byB3YWl0IGZvciB0aGlzIHRvIGhhcHBlblxuICAgIHRoaXMubWVzaCA9IGF3YWl0IHRoaXMuZ2V0TWVzaCgpXG5cbiAgICB2YXIgYmFsbCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICBuZXcgVEhSRUUuU3BoZXJlQnVmZmVyR2VvbWV0cnkoMC4xNSwgMzAsIDIwKSxcbiAgICAgICAgbmV3IFRIUkVFLlNoYWRlck1hdGVyaWFsKHtcbiAgICAgICAgICAgIHVuaWZvcm1zOiB7XG4gICAgICAgICAgICAgIHBhbm90ZXg6IHt2YWx1ZTogdGhpcy5tZXNoLm1hdGVyaWFsLm1hcH0sXG4gICAgICAgICAgICAgIHRleGZ4OiB7dmFsdWU6IGJhbGxUZXh9LFxuICAgICAgICAgICAgICBzZWxlY3RlZDoge3ZhbHVlOiAwfSxcbiAgICAgICAgICAgICAgYmFsbFRpbWU6IHt2YWx1ZTogMH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB2ZXJ0ZXhTaGFkZXI6IHBhbm92ZXJ0LFxuICAgICAgICAgICAgZnJhZ21lbnRTaGFkZXI6IHBhbm9mcmFnLFxuICAgICAgICAgICAgc2lkZTogVEhSRUUuQmFja1NpZGUsXG4gICAgICAgICAgfSlcbiAgICApXG4gICBcbiAgICBiYWxsLnJvdGF0aW9uLnNldChNYXRoLlBJLCAwLCAwKTtcbiAgICBiYWxsLnBvc2l0aW9uLmNvcHkodGhpcy5tZXNoLnBvc2l0aW9uKTtcbiAgICBiYWxsLnVzZXJEYXRhLmZsb2F0WSA9IHRoaXMubWVzaC5wb3NpdGlvbi55ICsgMC42O1xuICAgIGJhbGwudXNlckRhdGEuc2VsZWN0ZWQgPSAwO1xuICAgIGJhbGwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuICAgIHRoaXMuYmFsbCA9IGJhbGxcbiAgICB0aGlzLmVsLnNldE9iamVjdDNEKFwiYmFsbFwiLCBiYWxsKVxuXG4gICAgdGhpcy5tZXNoLmdlb21ldHJ5LnNjYWxlKDEwMCwgMTAwLCAxMDApXG4gICAgdGhpcy5tZXNoLm1hdGVyaWFsLnNldFZhbHVlcyh7XG4gICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgIGRlcHRoVGVzdDogZmFsc2UsXG4gICAgfSlcbiAgICB0aGlzLm1lc2gudmlzaWJsZSA9IGZhbHNlXG5cbiAgICB0aGlzLm5lYXIgPSAwLjhcbiAgICB0aGlzLmZhciA9IDEuMVxuXG4gICAgLy8gUmVuZGVyIE9WRVIgdGhlIHNjZW5lIGJ1dCBVTkRFUiB0aGUgY3Vyc29yXG4gICAgdGhpcy5tZXNoLnJlbmRlck9yZGVyID0gQVBQLlJFTkRFUl9PUkRFUi5DVVJTT1IgLSAwLjFcbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICBpZiAodGhpcy5tZXNoICYmIGJhbGxUZXgpIHtcbiAgICAgIHRoaXMuYmFsbC5wb3NpdGlvbi55ID0gdGhpcy5iYWxsLnVzZXJEYXRhLmZsb2F0WSArIE1hdGguY29zKCh0aW1lICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXQpLzEwMDAgKiAzICkgKiAwLjAyO1xuICAgICAgdGhpcy5iYWxsLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcblxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLnRleGZ4LnZhbHVlID0gYmFsbFRleFxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLmJhbGxUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgIC8vIExpbmVhcmx5IG1hcCBjYW1lcmEgZGlzdGFuY2UgdG8gbWF0ZXJpYWwgb3BhY2l0eVxuICAgICAgdGhpcy5tZXNoLmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSB3b3JsZFNlbGYuZGlzdGFuY2VUbyh3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IG9wYWNpdHkgPSAxIC0gKGRpc3RhbmNlIC0gdGhpcy5uZWFyKSAvICh0aGlzLmZhciAtIHRoaXMubmVhcilcbiAgICAgIGlmIChvcGFjaXR5IDwgMCkge1xuICAgICAgICAgIC8vIGZhciBhd2F5XG4gICAgICAgICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZVxuICAgICAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPSBvcGFjaXR5ID4gMSA/IDEgOiBvcGFjaXR5XG4gICAgICAgICAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRydWVcbiAgICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHlcbiAgICAgICAgfVxuICAgIH1cbiAgfSxcbiAgcGFyc2VTcG9rZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBBY2NlcHRlZCBuYW1lczogXCJsYWJlbF9faW1hZ2UtaGFzaF9leHRcIiBPUiBcImltYWdlLWhhc2hfZXh0XCJcbiAgICBjb25zdCBzcG9rZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgIGNvbnN0IG1hdGNoZXMgPSBzcG9rZU5hbWUubWF0Y2goLyg/Oi4qX18pPyguKilfKC4qKS8pXG4gICAgaWYgKCFtYXRjaGVzIHx8IG1hdGNoZXMubGVuZ3RoIDwgMykgeyByZXR1cm4gXCJcIiB9XG4gICAgY29uc3QgWywgaGFzaCwgZXh0ZW5zaW9uXSAgPSBtYXRjaGVzXG4gICAgY29uc3QgdXJsID0gYGh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2RhdGEvJHtoYXNofS4ke2V4dGVuc2lvbn1gXG4gICAgcmV0dXJuIHVybFxuICB9LFxuICBnZXRNZXNoOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgICBpZiAobWVzaCkgcmVzb2x2ZShtZXNoKVxuICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAnaW1hZ2UtbG9hZGVkJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJpbW1lcnNpdmUtMzYwIHBhbm8gbG9hZGVkOiBcIiArIHRoaXMuZGF0YS51cmwpXG4gICAgICAgICAgcmVzb2x2ZSh0aGlzLmVsLm9iamVjdDNETWFwLm1lc2gpXG4gICAgICAgIH0sXG4gICAgICAgIHsgb25jZTogdHJ1ZSB9XG4gICAgICApXG4gICAgfSlcbiAgfSxcbn0pXG4iLCIvLyBQYXJhbGxheCBPY2NsdXNpb24gc2hhZGVycyBmcm9tXG4vLyAgICBodHRwOi8vc3VuYW5kYmxhY2tjYXQuY29tL3RpcEZ1bGxWaWV3LnBocD90b3BpY2lkPTI4XG4vLyBObyB0YW5nZW50LXNwYWNlIHRyYW5zZm9ybXMgbG9naWMgYmFzZWQgb25cbi8vICAgaHR0cDovL21taWtrZWxzZW4zZC5ibG9nc3BvdC5zay8yMDEyLzAyL3BhcmFsbGF4cG9jLW1hcHBpbmctYW5kLW5vLXRhbmdlbnQuaHRtbFxuXG4vLyBJZGVudGl0eSBmdW5jdGlvbiBmb3IgZ2xzbC1saXRlcmFsIGhpZ2hsaWdodGluZyBpbiBWUyBDb2RlXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCBQYXJhbGxheFNoYWRlciA9IHtcbiAgLy8gT3JkZXJlZCBmcm9tIGZhc3Rlc3QgdG8gYmVzdCBxdWFsaXR5LlxuICBtb2Rlczoge1xuICAgIG5vbmU6ICdOT19QQVJBTExBWCcsXG4gICAgYmFzaWM6ICdVU0VfQkFTSUNfUEFSQUxMQVgnLFxuICAgIHN0ZWVwOiAnVVNFX1NURUVQX1BBUkFMTEFYJyxcbiAgICBvY2NsdXNpb246ICdVU0VfT0NMVVNJT05fUEFSQUxMQVgnLCAvLyBhLmsuYS4gUE9NXG4gICAgcmVsaWVmOiAnVVNFX1JFTElFRl9QQVJBTExBWCcsXG4gIH0sXG5cbiAgdW5pZm9ybXM6IHtcbiAgICBidW1wTWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgbWFwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgfSxcblxuICB2ZXJ0ZXhTaGFkZXI6IGdsc2xgXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZVdiA9IHV2O1xuICAgICAgdmVjNCBtdlBvc2l0aW9uID0gbW9kZWxWaWV3TWF0cml4ICogdmVjNCggcG9zaXRpb24sIDEuMCApO1xuICAgICAgdlZpZXdQb3NpdGlvbiA9IC1tdlBvc2l0aW9uLnh5ejtcbiAgICAgIHZOb3JtYWwgPSBub3JtYWxpemUoIG5vcm1hbE1hdHJpeCAqIG5vcm1hbCApO1xuICAgICAgXG4gICAgICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBtdlBvc2l0aW9uO1xuICAgIH1cbiAgYCxcblxuICBmcmFnbWVudFNoYWRlcjogZ2xzbGBcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBidW1wTWFwO1xuICAgIHVuaWZvcm0gc2FtcGxlcjJEIG1hcDtcblxuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhTY2FsZTtcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWluTGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNYXhMYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBmYWRlOyAvLyBDVVNUT01cblxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICAjaWZkZWYgVVNFX0JBU0lDX1BBUkFMTEFYXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgZmxvYXQgaW5pdGlhbEhlaWdodCA9IHRleHR1cmUyRChidW1wTWFwLCB2VXYpLnI7XG5cbiAgICAgIC8vIE5vIE9mZnNldCBMaW1pdHRpbmc6IG1lc3N5LCBmbG9hdGluZyBvdXRwdXQgYXQgZ3JhemluZyBhbmdsZXMuXG4gICAgICAvL1widmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56ICogaW5pdGlhbEhlaWdodDtcIixcblxuICAgICAgLy8gT2Zmc2V0IExpbWl0aW5nXG4gICAgICB2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgKiBpbml0aWFsSGVpZ2h0O1xuICAgICAgcmV0dXJuIHZVdiAtIHRleENvb3JkT2Zmc2V0O1xuICAgIH1cblxuICAgICNlbHNlXG5cbiAgICB2ZWMyIHBhcmFsbGF4TWFwKGluIHZlYzMgVikge1xuICAgICAgLy8gRGV0ZXJtaW5lIG51bWJlciBvZiBsYXllcnMgZnJvbSBhbmdsZSBiZXR3ZWVuIFYgYW5kIE5cbiAgICAgIGZsb2F0IG51bUxheWVycyA9IG1peChwYXJhbGxheE1heExheWVycywgcGFyYWxsYXhNaW5MYXllcnMsIGFicyhkb3QodmVjMygwLjAsIDAuMCwgMS4wKSwgVikpKTtcblxuICAgICAgZmxvYXQgbGF5ZXJIZWlnaHQgPSAxLjAgLyBudW1MYXllcnM7XG4gICAgICBmbG9hdCBjdXJyZW50TGF5ZXJIZWlnaHQgPSAwLjA7XG4gICAgICAvLyBTaGlmdCBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzIGZvciBlYWNoIGl0ZXJhdGlvblxuICAgICAgdmVjMiBkdGV4ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogLyBudW1MYXllcnM7XG5cbiAgICAgIHZlYzIgY3VycmVudFRleHR1cmVDb29yZHMgPSB2VXY7XG5cbiAgICAgIGZsb2F0IGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuXG4gICAgICAvLyB3aGlsZSAoIGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0IClcbiAgICAgIC8vIEluZmluaXRlIGxvb3BzIGFyZSBub3Qgd2VsbCBzdXBwb3J0ZWQuIERvIGEgXCJsYXJnZVwiIGZpbml0ZVxuICAgICAgLy8gbG9vcCwgYnV0IG5vdCB0b28gbGFyZ2UsIGFzIGl0IHNsb3dzIGRvd24gc29tZSBjb21waWxlcnMuXG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IDMwOyBpICs9IDEpIHtcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlIDw9IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBsYXllckhlaWdodDtcbiAgICAgICAgLy8gU2hpZnQgdGV4dHVyZSBjb29yZGluYXRlcyBhbG9uZyB2ZWN0b3IgVlxuICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkdGV4O1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgIH1cblxuICAgICAgI2lmZGVmIFVTRV9TVEVFUF9QQVJBTExBWFxuXG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX1JFTElFRl9QQVJBTExBWClcblxuICAgICAgdmVjMiBkZWx0YVRleENvb3JkID0gZHRleCAvIDIuMDtcbiAgICAgIGZsb2F0IGRlbHRhSGVpZ2h0ID0gbGF5ZXJIZWlnaHQgLyAyLjA7XG5cbiAgICAgIC8vIFJldHVybiB0byB0aGUgbWlkIHBvaW50IG9mIHByZXZpb3VzIGxheWVyXG4gICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuXG4gICAgICAvLyBCaW5hcnkgc2VhcmNoIHRvIGluY3JlYXNlIHByZWNpc2lvbiBvZiBTdGVlcCBQYXJhbGxheCBNYXBwaW5nXG4gICAgICBjb25zdCBpbnQgbnVtU2VhcmNoZXMgPSA1O1xuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBudW1TZWFyY2hlczsgaSArPSAxKSB7XG4gICAgICAgIGRlbHRhVGV4Q29vcmQgLz0gMi4wO1xuICAgICAgICBkZWx0YUhlaWdodCAvPSAyLjA7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgICAvLyBTaGlmdCBhbG9uZyBvciBhZ2FpbnN0IHZlY3RvciBWXG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCkge1xuICAgICAgICAgIC8vIEJlbG93IHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyAtPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCArPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBhYm92ZSB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfT0NMVVNJT05fUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgcHJldlRDb29yZHMgPSBjdXJyZW50VGV4dHVyZUNvb3JkcyArIGR0ZXg7XG5cbiAgICAgIC8vIEhlaWdodHMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCBuZXh0SCA9IGhlaWdodEZyb21UZXh0dXJlIC0gY3VycmVudExheWVySGVpZ2h0O1xuICAgICAgZmxvYXQgcHJldkggPSB0ZXh0dXJlMkQoYnVtcE1hcCwgcHJldlRDb29yZHMpLnIgLSBjdXJyZW50TGF5ZXJIZWlnaHQgKyBsYXllckhlaWdodDtcblxuICAgICAgLy8gUHJvcG9ydGlvbnMgZm9yIGxpbmVhciBpbnRlcnBvbGF0aW9uXG4gICAgICBmbG9hdCB3ZWlnaHQgPSBuZXh0SCAvIChuZXh0SCAtIHByZXZIKTtcblxuICAgICAgLy8gSW50ZXJwb2xhdGlvbiBvZiB0ZXh0dXJlIGNvb3JkaW5hdGVzXG4gICAgICByZXR1cm4gcHJldlRDb29yZHMgKiB3ZWlnaHQgKyBjdXJyZW50VGV4dHVyZUNvb3JkcyAqICgxLjAgLSB3ZWlnaHQpO1xuXG4gICAgICAjZWxzZSAvLyBOT19QQVJBTExBWFxuXG4gICAgICByZXR1cm4gdlV2O1xuXG4gICAgICAjZW5kaWZcbiAgICB9XG4gICAgI2VuZGlmXG5cbiAgICB2ZWMyIHBlcnR1cmJVdih2ZWMzIHN1cmZQb3NpdGlvbiwgdmVjMyBzdXJmTm9ybWFsLCB2ZWMzIHZpZXdQb3NpdGlvbikge1xuICAgICAgdmVjMiB0ZXhEeCA9IGRGZHgodlV2KTtcbiAgICAgIHZlYzIgdGV4RHkgPSBkRmR5KHZVdik7XG5cbiAgICAgIHZlYzMgdlNpZ21hWCA9IGRGZHgoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlNpZ21hWSA9IGRGZHkoc3VyZlBvc2l0aW9uKTtcbiAgICAgIHZlYzMgdlIxID0gY3Jvc3ModlNpZ21hWSwgc3VyZk5vcm1hbCk7XG4gICAgICB2ZWMzIHZSMiA9IGNyb3NzKHN1cmZOb3JtYWwsIHZTaWdtYVgpO1xuICAgICAgZmxvYXQgZkRldCA9IGRvdCh2U2lnbWFYLCB2UjEpO1xuXG4gICAgICB2ZWMyIHZQcm9qVnNjciA9ICgxLjAgLyBmRGV0KSAqIHZlYzIoZG90KHZSMSwgdmlld1Bvc2l0aW9uKSwgZG90KHZSMiwgdmlld1Bvc2l0aW9uKSk7XG4gICAgICB2ZWMzIHZQcm9qVnRleDtcbiAgICAgIHZQcm9qVnRleC54eSA9IHRleER4ICogdlByb2pWc2NyLnggKyB0ZXhEeSAqIHZQcm9qVnNjci55O1xuICAgICAgdlByb2pWdGV4LnogPSBkb3Qoc3VyZk5vcm1hbCwgdmlld1Bvc2l0aW9uKTtcblxuICAgICAgcmV0dXJuIHBhcmFsbGF4TWFwKHZQcm9qVnRleCk7XG4gICAgfVxuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdmVjMiBtYXBVdiA9IHBlcnR1cmJVdigtdlZpZXdQb3NpdGlvbiwgbm9ybWFsaXplKHZOb3JtYWwpLCBub3JtYWxpemUodlZpZXdQb3NpdGlvbikpO1xuICAgICAgXG4gICAgICAvLyBDVVNUT00gU1RBUlRcbiAgICAgIHZlYzQgdGV4ZWwgPSB0ZXh0dXJlMkQobWFwLCBtYXBVdik7XG4gICAgICB2ZWMzIGNvbG9yID0gbWl4KHRleGVsLnh5eiwgdmVjMygwKSwgZmFkZSk7XG4gICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgLy8gQ1VTVE9NIEVORFxuICAgIH1cblxuICBgLFxufVxuXG5leHBvcnQgeyBQYXJhbGxheFNoYWRlciB9XG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQ3JlYXRlIHRoZSBpbGx1c2lvbiBvZiBkZXB0aCBpbiBhIGNvbG9yIGltYWdlIGZyb20gYSBkZXB0aCBtYXBcbiAqXG4gKiBVc2FnZVxuICogPT09PT1cbiAqIENyZWF0ZSBhIHBsYW5lIGluIEJsZW5kZXIgYW5kIGdpdmUgaXQgYSBtYXRlcmlhbCAoanVzdCB0aGUgZGVmYXVsdCBQcmluY2lwbGVkIEJTREYpLlxuICogQXNzaWduIGNvbG9yIGltYWdlIHRvIFwiY29sb3JcIiBjaGFubmVsIGFuZCBkZXB0aCBtYXAgdG8gXCJlbWlzc2l2ZVwiIGNoYW5uZWwuXG4gKiBZb3UgbWF5IHdhbnQgdG8gc2V0IGVtaXNzaXZlIHN0cmVuZ3RoIHRvIHplcm8gc28gdGhlIHByZXZpZXcgbG9va3MgYmV0dGVyLlxuICogQWRkIHRoZSBcInBhcmFsbGF4XCIgY29tcG9uZW50IGZyb20gdGhlIEh1YnMgZXh0ZW5zaW9uLCBjb25maWd1cmUsIGFuZCBleHBvcnQgYXMgLmdsYlxuICovXG5cbmltcG9ydCB7IFBhcmFsbGF4U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMnXG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4Jywge1xuICBzY2hlbWE6IHtcbiAgICBzdHJlbmd0aDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC41IH0sXG4gICAgY3V0b2ZmVHJhbnNpdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDggfSxcbiAgICBjdXRvZmZBbmdsZTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogTWF0aC5QSSAvIDQgfSxcbiAgfSxcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBjb25zdCB7IG1hcDogY29sb3JNYXAsIGVtaXNzaXZlTWFwOiBkZXB0aE1hcCB9ID0gbWVzaC5tYXRlcmlhbFxuICAgIGNvbG9yTWFwLndyYXBTID0gY29sb3JNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgZGVwdGhNYXAud3JhcFMgPSBkZXB0aE1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBjb25zdCB7IHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIgfSA9IFBhcmFsbGF4U2hhZGVyXG4gICAgdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICBmcmFnbWVudFNoYWRlcixcbiAgICAgIGRlZmluZXM6IHsgVVNFX09DTFVTSU9OX1BBUkFMTEFYOiB0cnVlIH0sXG4gICAgICB1bmlmb3Jtczoge1xuICAgICAgICBtYXA6IHsgdmFsdWU6IGNvbG9yTWFwIH0sXG4gICAgICAgIGJ1bXBNYXA6IHsgdmFsdWU6IGRlcHRoTWFwIH0sXG4gICAgICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IC0xICogdGhpcy5kYXRhLnN0cmVuZ3RoIH0sXG4gICAgICAgIHBhcmFsbGF4TWluTGF5ZXJzOiB7IHZhbHVlOiAyMCB9LFxuICAgICAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogMzAgfSxcbiAgICAgICAgZmFkZTogeyB2YWx1ZTogMCB9LFxuICAgICAgfSxcbiAgICB9KVxuICAgIG1lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgaWYgKHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEpIHtcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih2ZWMpXG4gICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh2ZWMpXG4gICAgICBjb25zdCBhbmdsZSA9IHZlYy5hbmdsZVRvKGZvcndhcmQpXG4gICAgICBjb25zdCBmYWRlID0gbWFwTGluZWFyQ2xhbXBlZChcbiAgICAgICAgYW5nbGUsXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSAtIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgKyB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgMCwgLy8gSW4gdmlldyB6b25lLCBubyBmYWRlXG4gICAgICAgIDEgLy8gT3V0c2lkZSB2aWV3IHpvbmUsIGZ1bGwgZmFkZVxuICAgICAgKVxuICAgICAgdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5mYWRlLnZhbHVlID0gZmFkZVxuICAgIH1cbiAgfSxcbn0pXG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlLCBtaW4sIG1heCkge1xuICByZXR1cm4gTWF0aC5tYXgobWluLCBNYXRoLm1pbihtYXgsIHZhbHVlKSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBiMSArICgoeCAtIGExKSAqIChiMiAtIGIxKSkgLyAoYTIgLSBhMSlcbn1cblxuZnVuY3Rpb24gbWFwTGluZWFyQ2xhbXBlZCh4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gY2xhbXAobWFwTGluZWFyKHgsIGExLCBhMiwgYjEsIGIyKSwgYjEsIGIyKVxufVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGNyZWF0ZSBhIEhUTUwgb2JqZWN0IGJ5IHJlbmRlcmluZyBhIHNjcmlwdCB0aGF0IGNyZWF0ZXMgYW5kIG1hbmFnZXMgaXRcbiAqXG4gKi9cbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcbmltcG9ydCAqIGFzIGh0bWxDb21wb25lbnRzIGZyb20gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIjtcblxuLy8gdmFyIGh0bWxDb21wb25lbnRzO1xuLy8gdmFyIHNjcmlwdFByb21pc2U7XG4vLyBpZiAod2luZG93Ll9fdGVzdGluZ1Z1ZUFwcHMpIHtcbi8vICAgICBzY3JpcHRQcm9taXNlID0gaW1wb3J0KHdpbmRvdy5fX3Rlc3RpbmdWdWVBcHBzKSAgICBcbi8vIH0gZWxzZSB7XG4vLyAgICAgc2NyaXB0UHJvbWlzZSA9IGltcG9ydChcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiKSBcbi8vIH1cbi8vIC8vIHNjcmlwdFByb21pc2UgPSBzY3JpcHRQcm9taXNlLnRoZW4obW9kdWxlID0+IHtcbi8vIC8vICAgICByZXR1cm4gbW9kdWxlXG4vLyAvLyB9KTtcbi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG4gQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdodG1sLXNjcmlwdCcsIHsgIFxuICAgIGluaXQoKSB7XG4gICAgICAgIHRoaXMuc3lzdGVtVGljayA9IGh0bWxDb21wb25lbnRzW1wic3lzdGVtVGlja1wiXTtcbiAgICAgICAgdGhpcy5pbml0aWFsaXplRXRoZXJlYWwgPSBodG1sQ29tcG9uZW50c1tcImluaXRpYWxpemVFdGhlcmVhbFwiXVxuICAgICAgICBpZiAoIXRoaXMuc3lzdGVtVGljayB8fCAhdGhpcy5pbml0aWFsaXplRXRoZXJlYWwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJlcnJvciBpbiBodG1sLXNjcmlwdCBzeXN0ZW06IGh0bWxDb21wb25lbnRzIGhhcyBubyBzeXN0ZW1UaWNrIGFuZC9vciBpbml0aWFsaXplRXRoZXJlYWwgbWV0aG9kc1wiKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplRXRoZXJlYWwoKVxuICAgICAgICB9XG4gICAgfSxcbiAgXG4gICAgdGljayh0LCBkdCkge1xuICAgICAgICB0aGlzLnN5c3RlbVRpY2sodCwgZHQpXG4gICAgfSxcbiAgfSlcbiAgXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gXCIqX2NvbXBvbmVudE5hbWVcIlxuICAgICAgICBuYW1lOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICB3aWR0aDogeyB0eXBlOiBcIm51bWJlclwiLCBkZWZhdWx0OiAtMX0sXG4gICAgICAgIGhlaWdodDogeyB0eXBlOiBcIm51bWJlclwiLCBkZWZhdWx0OiAtMX0sXG4gICAgICAgIHBhcmFtZXRlcjE6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn0sXG4gICAgICAgIHBhcmFtZXRlcjI6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn0sXG4gICAgICAgIHBhcmFtZXRlcjM6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn0sXG4gICAgICAgIHBhcmFtZXRlcjQ6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn0sXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuXG4gICAgICAgIHRoaXMuc2NyaXB0RGF0YSA9IHtcbiAgICAgICAgICAgIHdpZHRoOiB0aGlzLmRhdGEud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IHRoaXMuZGF0YS5oZWlnaHQsXG4gICAgICAgICAgICBwYXJhbWV0ZXIxOiB0aGlzLmRhdGEucGFyYW1ldGVyMSxcbiAgICAgICAgICAgIHBhcmFtZXRlcjI6IHRoaXMuZGF0YS5wYXJhbWV0ZXIyLFxuICAgICAgICAgICAgcGFyYW1ldGVyMzogdGhpcy5kYXRhLnBhcmFtZXRlcjMsXG4gICAgICAgICAgICBwYXJhbWV0ZXI0OiB0aGlzLmRhdGEucGFyYW1ldGVyNFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLmZ1bGxOYW1lIHx8IHRoaXMuZnVsbE5hbWUubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRoaXMucGFyc2VOb2RlTmFtZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gdGhpcy5mdWxsTmFtZVxuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSA9PT0gXCJcIiB8fCB0aGlzLmRhdGEubmFtZSA9PT0gdGhpcy5mdWxsTmFtZSkgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICAvLyB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gdGhpcy5mdWxsTmFtZTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95U2NyaXB0KClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpO1xuICAgIH0sXG5cbiAgICBjcmVhdGVTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gZWFjaCB0aW1lIHdlIGxvYWQgYSBzY3JpcHQgY29tcG9uZW50IHdlIHdpbGwgcG9zc2libHkgY3JlYXRlXG4gICAgICAgIC8vIGEgbmV3IG5ldHdvcmtlZCBjb21wb25lbnQuICBUaGlzIGlzIGZpbmUsIHNpbmNlIHRoZSBuZXR3b3JrZWQgSWQgXG4gICAgICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBmdWxsIG5hbWUgcGFzc2VkIGFzIGEgcGFyYW1ldGVyLCBvciBhc3NpZ25lZCB0byB0aGVcbiAgICAgICAgLy8gY29tcG9uZW50IGluIFNwb2tlLiAgSXQgZG9lcyBtZWFuIHRoYXQgaWYgd2UgaGF2ZVxuICAgICAgICAvLyBtdWx0aXBsZSBvYmplY3RzIGluIHRoZSBzY2VuZSB3aGljaCBoYXZlIHRoZSBzYW1lIG5hbWUsIHRoZXkgd2lsbFxuICAgICAgICAvLyBiZSBpbiBzeW5jLiAgSXQgYWxzbyBtZWFucyB0aGF0IGlmIHlvdSB3YW50IHRvIGRyb3AgYSBjb21wb25lbnQgb25cbiAgICAgICAgLy8gdGhlIHNjZW5lIHZpYSBhIC5nbGIsIGl0IG11c3QgaGF2ZSBhIHZhbGlkIG5hbWUgcGFyYW1ldGVyIGluc2lkZSBpdC5cbiAgICAgICAgLy8gQSAuZ2xiIGluIHNwb2tlIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBzcG9rZSBuYW1lIGlmIHlvdSB1c2Ugb25lIHdpdGhvdXRcbiAgICAgICAgLy8gYSBuYW1lIGluc2lkZSBpdC5cbiAgICAgICAgbGV0IGxvYWRlciA9ICgpID0+IHtcblxuICAgICAgICAgICAgdGhpcy5sb2FkU2NyaXB0KCkudGhlbiggKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGdldCB0aGUgcGFyZW50IG5ldHdvcmtlZCBlbnRpdHksIHdoZW4gaXQncyBmaW5pc2hlZCBpbml0aWFsaXppbmcuICBcbiAgICAgICAgICAgICAgICAgICAgLy8gV2hlbiBjcmVhdGluZyB0aGlzIGFzIHBhcnQgb2YgYSBHTFRGIGxvYWQsIHRoZSBcbiAgICAgICAgICAgICAgICAgICAgLy8gcGFyZW50IGEgZmV3IHN0ZXBzIHVwIHdpbGwgYmUgbmV0d29ya2VkLiAgV2UnbGwgb25seSBkbyB0aGlzXG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBIVE1MIHNjcmlwdCB3YW50cyB0byBiZSBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBudWxsXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gYmluZCBjYWxsYmFja3NcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LnNldE5ldHdvcmtNZXRob2RzKHRoaXMudGFrZU93bmVyc2hpcCwgdGhpcy5zZXRTaGFyZWREYXRhKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHNldCB1cCB0aGUgbG9jYWwgY29udGVudCBhbmQgaG9vayBpdCB0byB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICBjb25zdCBzY3JpcHRFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IHNjcmlwdEVsXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRPYmplY3QzRChcIndlYmxheWVyM2RcIiwgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRClcblxuICAgICAgICAgICAgICAgIC8vIGxldHMgZmlndXJlIG91dCB0aGUgc2NhbGUsIGJ1dCBzY2FsaW5nIHRvIGZpbGwgdGhlIGEgMXgxbSBzcXVhcmUsIHRoYXQgaGFzIGFsc29cbiAgICAgICAgICAgICAgICAvLyBwb3RlbnRpYWxseSBiZWVuIHNjYWxlZCBieSB0aGUgcGFyZW50cyBwYXJlbnQgbm9kZS4gSWYgd2Ugc2NhbGUgdGhlIGVudGl0eSBpbiBzcG9rZSxcbiAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIHdoZXJlIHRoZSBzY2FsZSBpcyBzZXQuICBJZiB3ZSBkcm9wIGEgbm9kZSBpbiBhbmQgc2NhbGUgaXQsIHRoZSBzY2FsZSBpcyBhbHNvXG4gICAgICAgICAgICAgICAgLy8gc2V0IHRoZXJlLlxuICAgICAgICAgICAgICAgIC8vIFdlIHVzZWQgdG8gaGF2ZSBhIGZpeGVkIHNpemUgcGFzc2VkIGJhY2sgZnJvbSB0aGUgZW50aXR5LCBidXQgdGhhdCdzIHRvbyByZXN0cmljdGl2ZTpcbiAgICAgICAgICAgICAgICAvLyBjb25zdCB3aWR0aCA9IHRoaXMuc2NyaXB0LndpZHRoXG4gICAgICAgICAgICAgICAgLy8gY29uc3QgaGVpZ2h0ID0gdGhpcy5zY3JpcHQuaGVpZ2h0XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBuZWVkIHRvIGZpbmQgZW52aXJvbm1lbnQtc2NlbmUsIGdvIGRvd24gdHdvIGxldmVscyB0byB0aGUgZ3JvdXAgYWJvdmUgXG4gICAgICAgICAgICAgICAgLy8gdGhlIG5vZGVzIGluIHRoZSBzY2VuZS4gIFRoZW4gYWNjdW11bGF0ZSB0aGUgc2NhbGVzIHVwIGZyb20gdGhpcyBub2RlIHRvXG4gICAgICAgICAgICAgICAgLy8gdGhhdCBub2RlLiAgVGhpcyB3aWxsIGFjY291bnQgZm9yIGdyb3VwcywgYW5kIG5lc3RpbmcuXG5cbiAgICAgICAgICAgICAgICB2YXIgd2lkdGggPSAxLCBoZWlnaHQgPSAxO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1pbWFnZVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhdHRhY2hlZCB0byBhbiBpbWFnZSBpbiBzcG9rZSwgc28gdGhlIGltYWdlIG1lc2ggaXMgc2l6ZSAxIGFuZCBpcyBzY2FsZWQgZGlyZWN0bHlcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlTSA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdLnNjYWxlXG4gICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBzY2FsZU0ueSAqIHNjYWxlSS55XG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS54ID0gMVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnogPSAxXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGl0J3MgZW1iZWRkZWQgaW4gYSBzaW1wbGUgZ2x0ZiBtb2RlbDsgIG90aGVyIG1vZGVscyBtYXkgbm90IHdvcmtcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXNzdW1lIGl0J3MgYXQgdGhlIHRvcCBsZXZlbCBtZXNoLCBhbmQgdGhhdCB0aGUgbW9kZWwgaXRzZWxmIGlzIHNjYWxlZFxuICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXBbXCJtZXNoXCJdXG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgYm94ID0gbWVzaC5nZW9tZXRyeS5ib3VuZGluZ0JveDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gKGJveC5tYXgueCAtIGJveC5taW4ueCkgKiBtZXNoLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IChib3gubWF4LnkgLSBib3gubWluLnkpICogbWVzaC5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbWVzaFNjYWxlID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBtZXNoU2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gbWVzaFNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IHRoZSByb290IGdsdGYgc2NhbGUuXG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJlbnQyID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5vYmplY3QzRFxuICAgICAgICAgICAgICAgICAgICB3aWR0aCAqPSBwYXJlbnQyLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ICo9IHBhcmVudDIuc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAod2lkdGggPiAwICYmIGhlaWdodCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qge3dpZHRoOiB3c2l6ZSwgaGVpZ2h0OiBoc2l6ZX0gPSB0aGlzLnNjcmlwdC5nZXRTaXplKClcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZShcInNjYWxlXCIsIHsgeDogc2NhbGUsIHk6IHNjYWxlLCB6OiBzY2FsZX0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHRoZXJlIHdpbGwgYmUgb25lIGVsZW1lbnQgYWxyZWFkeSwgdGhlIGN1YmUgd2UgY3JlYXRlZCBpbiBibGVuZGVyXG4gICAgICAgICAgICAgICAgLy8gYW5kIGF0dGFjaGVkIHRoaXMgY29tcG9uZW50IHRvLCBzbyByZW1vdmUgaXQgaWYgaXQgaXMgdGhlcmUuXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5jaGlsZHJlbi5wb3AoKVxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgIGMudmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSBcImlzU3RhdGljXCIgaXMgY29ycmVjdDsgIGNhbid0IGJlIHN0YXRpYyBpZiBlaXRoZXIgaW50ZXJhY3RpdmUgb3IgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzU3RhdGljICYmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlIHx8IHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5pc1N0YXRpYyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBhZGQgaW4gb3VyIGNvbnRhaW5lclxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYXBwZW5kQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiAgd2UgYXJlIGdvaW5nIHRvIGhhdmUgdG8gbWFrZSBzdXJlIHRoaXMgd29ya3MgaWYgXG4gICAgICAgICAgICAgICAgLy8gdGhlIHNjcmlwdCBpcyBPTiBhbiBpbnRlcmFjdGFibGUgKGxpa2UgYW4gaW1hZ2UpXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBtYWtlIHRoZSBodG1sIG9iamVjdCBjbGlja2FibGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywnJylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGZvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBvYmplY3QgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xpY2tlZCA9IHRoaXMuY2xpY2tlZC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0RyYWdnYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXJlbid0IGdvaW5nIHRvIHJlYWxseSBkZWFsIHdpdGggdGhpcyB0aWxsIHdlIGhhdmUgYSB1c2UgY2FzZSwgYnV0XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjYW4gc2V0IGl0IHVwIGZvciBub3dcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzSG9sZGFibGU6IHRydWUsICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBob2xkYWJsZUJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tZG93bicsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnU3RhcnQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi11cCcsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5kcmFnRW5kKGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvL3RoaXMucmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlSID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gbm8gaW50ZXJhY3Rpdml0eSwgcGxlYXNlXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIFNIT1VMRCB3b3JrIGJ1dCBtYWtlIHN1cmUgaXQgd29ya3MgaWYgdGhlIGVsIHdlIGFyZSBvblxuICAgICAgICAgICAgICAgIC8vIGlzIG5ldHdvcmtlZCwgc3VjaCBhcyB3aGVuIGF0dGFjaGVkIHRvIGFuIGltYWdlXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5oYXNBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIilcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhbiBleGlzdGluZyBjb3B5IG9mIHRoZSBOZXR3b3JrZWQgRW50aXR5IChpZiB3ZSBhcmUgbm90IHRoZVxuICAgICAgICAgICAgICAgICAgICAvLyBmaXJzdCBjbGllbnQgaW4gdGhlIHJvb20gaXQgd2lsbCBleGlzdCBpbiBvdGhlciBjbGllbnRzIGFuZCBiZSBjcmVhdGVkIGJ5IE5BRilcbiAgICAgICAgICAgICAgICAgICAgLy8gb3IgY3JlYXRlIGFuIGVudGl0eSBpZiB3ZSBhcmUgZmlyc3QuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSBmdW5jdGlvbiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwZXJzaXN0ZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgYmUgcGFydCBvZiBhIE5ldHdvcmtlZCBHTFRGIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIHBpbm5lZCBhbmQgbG9hZGVkIHdoZW4gd2UgZW50ZXIgdGhlIHJvb20uICBVc2UgdGhlIG5ldHdvcmtlZCBwYXJlbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHBsdXMgYSBkaXNhbWJpZ3VhdGluZyBiaXQgb2YgdGV4dCB0byBjcmVhdGUgYSB1bmlxdWUgSWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSBOQUYudXRpbHMuZ2V0TmV0d29ya0lkKG5ldHdvcmtlZEVsKSArIFwiLWh0bWwtc2NyaXB0XCI7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBuZWVkIHRvIGNyZWF0ZSBhbiBlbnRpdHksIHVzZSB0aGUgc2FtZSBwZXJzaXN0ZW5jZSBhcyBvdXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrIGVudGl0eSAodHJ1ZSBpZiBwaW5uZWQsIGZhbHNlIGlmIG5vdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50ID0gZW50aXR5LmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEucGVyc2lzdGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBvbmx5IGhhcHBlbnMgaWYgdGhpcyBjb21wb25lbnQgaXMgb24gYSBzY2VuZSBmaWxlLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBlbGVtZW50cyBvbiB0aGUgc2NlbmUgYXJlbid0IG5ldHdvcmtlZC4gIFNvIGxldCdzIGFzc3VtZSBlYWNoIGVudGl0eSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzY2VuZSB3aWxsIGhhdmUgYSB1bmlxdWUgbmFtZS4gIEFkZGluZyBhIGJpdCBvZiB0ZXh0IHNvIHdlIGNhbiBmaW5kIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIERPTSB3aGVuIGRlYnVnZ2luZy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IHRoaXMuZnVsbE5hbWUucmVwbGFjZUFsbChcIl9cIixcIi1cIikgKyBcIi1odG1sLXNjcmlwdFwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBuZXR3b3JrZWQgZW50aXR5IHdlIGNyZWF0ZSBmb3IgdGhpcyBjb21wb25lbnQgYWxyZWFkeSBleGlzdHMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBjcmVhdGUgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gTk9URTogaXQgaXMgY3JlYXRlZCBvbiB0aGUgc2NlbmUsIG5vdCBhcyBhIGNoaWxkIG9mIHRoaXMgZW50aXR5LCBiZWNhdXNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIE5BRiBjcmVhdGVzIHJlbW90ZSBlbnRpdGllcyBpbiB0aGUgc2NlbmUuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5lbnRpdGllcy5oYXNFbnRpdHkobmV0SWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gTkFGLmVudGl0aWVzLmdldEVudGl0eShuZXRJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZXRob2QgdG8gcmV0cmlldmUgdGhlIHNjcmlwdCBkYXRhIG9uIHRoaXMgZW50aXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgXCJuZXR3b3JrZWRcIiBjb21wb25lbnQgc2hvdWxkIGhhdmUgcGVyc2lzdGVudD10cnVlLCB0aGUgdGVtcGxhdGUgYW5kIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBzZXQsIG93bmVyIHNldCB0byBcInNjZW5lXCIgKHNvIHRoYXQgaXQgZG9lc24ndCB1cGRhdGUgdGhlIHJlc3Qgb2ZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgd29ybGQgd2l0aCBpdCdzIGluaXRpYWwgZGF0YSwgYW5kIHNob3VsZCBOT1Qgc2V0IGNyZWF0b3IgKHRoZSBzeXN0ZW0gd2lsbCBkbyB0aGF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5zZXRBdHRyaWJ1dGUoJ25ldHdvcmtlZCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGU6IFwiI3NjcmlwdC1kYXRhLW1lZGlhXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQ6IHBlcnNpc3RlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG93bmVyOiBcInNjZW5lXCIsICAvLyBzbyB0aGF0IG91ciBpbml0aWFsIHZhbHVlIGRvZXNuJ3Qgb3ZlcndyaXRlIG90aGVyc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXR3b3JrSWQ6IG5ldElkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFwcGVuZENoaWxkKGVudGl0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNhdmUgYSBwb2ludGVyIHRvIHRoZSBuZXR3b3JrZWQgZW50aXR5IGFuZCB0aGVuIHdhaXQgZm9yIGl0IHRvIGJlIGZ1bGx5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCBiZWZvcmUgZ2V0dGluZyBhIHBvaW50ZXIgdG8gdGhlIGFjdHVhbCBuZXR3b3JrZWQgY29tcG9uZW50IGluIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5uZXRFbnRpdHkpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tcInNjcmlwdC1kYXRhXCJdXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIGlzIHRoZSBmaXJzdCBuZXR3b3JrZWQgZW50aXR5LCBpdCdzIHNoYXJlZERhdGEgd2lsbCBkZWZhdWx0IHRvIHRoZSBlbXB0eSBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcsIGFuZCB3ZSBzaG91bGQgaW5pdGlhbGl6ZSBpdCB3aXRoIHRoZSBpbml0aWFsIGRhdGEgZnJvbSB0aGUgc2NyaXB0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jLnNoYXJlZERhdGEgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5ldHdvcmtlZCA9IG5ldHdvcmtlZEVsLmNvbXBvbmVudHNbXCJuZXR3b3JrZWRcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgKG5ldHdvcmtlZC5kYXRhLmNyZWF0b3IgPT0gTkFGLmNsaWVudElkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICB0aGlzLnN0YXRlU3luYy5pbml0U2hhcmVkRGF0YSh0aGlzLnNjcmlwdC5nZXRTaGFyZWREYXRhKCkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5LmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLmVsKS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KG5ldHdvcmtlZEVsKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkoKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkID0gdGhpcy5zZXR1cE5ldHdvcmtlZC5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZXRob2QgaGFuZGxlcyB0aGUgZGlmZmVyZW50IHN0YXJ0dXAgY2FzZXM6XG4gICAgICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lLCBOQUYgd2lsbCBiZSBjb25uZWN0ZWQgYW5kIHdlIGNhbiBcbiAgICAgICAgICAgICAgICAgICAgLy8gICBpbW1lZGlhdGVseSBpbml0aWFsaXplXG4gICAgICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgaXMgaW4gdGhlIHJvb20gc2NlbmUgb3IgcGlubmVkLCBpdCB3aWxsIGxpa2VseSBiZSBjcmVhdGVkXG4gICAgICAgICAgICAgICAgICAgIC8vICAgYmVmb3JlIE5BRiBpcyBzdGFydGVkIGFuZCBjb25uZWN0ZWQsIHNvIHdlIHdhaXQgZm9yIGFuIGV2ZW50IHRoYXQgaXNcbiAgICAgICAgICAgICAgICAgICAgLy8gICBmaXJlZCB3aGVuIEh1YnMgaGFzIHN0YXJ0ZWQgTkFGXG4gICAgICAgICAgICAgICAgICAgIGlmIChOQUYuY29ubmVjdGlvbiAmJiBOQUYuY29ubmVjdGlvbi5pc0Nvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkKCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignZGlkQ29ubmVjdFRvTmV0d29ya2VkU2NlbmUnLCB0aGlzLnNldHVwTmV0d29ya2VkKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiBhdHRhY2hlZCB0byBhIG5vZGUgd2l0aCBhIG1lZGlhLWxvYWRlciBjb21wb25lbnQsIHRoaXMgbWVhbnMgd2UgYXR0YWNoZWQgdGhpcyBjb21wb25lbnRcbiAgICAgICAgLy8gdG8gYSBtZWRpYSBvYmplY3QgaW4gU3Bva2UuICBXZSBzaG91bGQgd2FpdCB0aWxsIHRoZSBvYmplY3QgaXMgZnVsbHkgbG9hZGVkLiAgXG4gICAgICAgIC8vIE90aGVyd2lzZSwgaXQgd2FzIGF0dGFjaGVkIHRvIHNvbWV0aGluZyBpbnNpZGUgYSBHTFRGIChwcm9iYWJseSBpbiBibGVuZGVyKVxuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHBsYXk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wbGF5KClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwYXVzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LnBhdXNlKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBoYW5kbGUgXCJpbnRlcmFjdFwiIGV2ZW50cyBmb3IgY2xpY2thYmxlIGVudGl0aWVzXG4gICAgY2xpY2tlZDogZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgIHRoaXMuc2NyaXB0LmNsaWNrZWQoZXZ0KSBcbiAgICB9LFxuICBcbiAgICAvLyBtZXRob2RzIHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gdGhlIGh0bWwgb2JqZWN0IHNvIHRoZXkgY2FuIHVwZGF0ZSBuZXR3b3JrZWQgZGF0YVxuICAgIHRha2VPd25lcnNoaXA6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXRlU3luYy50YWtlT3duZXJzaGlwKClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlOyAgLy8gc3VyZSwgZ28gYWhlYWQgYW5kIGNoYW5nZSBpdCBmb3Igbm93XG4gICAgICAgIH1cbiAgICB9LFxuICAgIFxuICAgIHNldFNoYXJlZERhdGE6IGZ1bmN0aW9uKGRhdGFPYmplY3QpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMuc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfSxcblxuICAgIC8vIHRoaXMgaXMgY2FsbGVkIGZyb20gYmVsb3csIHRvIGdldCB0aGUgaW5pdGlhbCBkYXRhIGZyb20gdGhlIHNjcmlwdFxuICAgIGdldFNoYXJlZERhdGE6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjcmlwdC5nZXRTaGFyZWREYXRhKClcbiAgICAgICAgfVxuICAgICAgICAvLyBzaG91bGRuJ3QgaGFwcGVuXG4gICAgICAgIGNvbnNvbGUud2FybihcInNjcmlwdC1kYXRhIGNvbXBvbmVudCBjYWxsZWQgcGFyZW50IGVsZW1lbnQgYnV0IHRoZXJlIGlzIG5vIHNjcmlwdCB5ZXQ/XCIpXG4gICAgICAgIHJldHVybiBcInt9XCJcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNjcmlwdCkgcmV0dXJuXG5cbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgIC8vIG1vcmUgb3IgbGVzcyBjb3BpZWQgZnJvbSBcImhvdmVyYWJsZS12aXN1YWxzLmpzXCIgaW4gaHVic1xuICAgICAgICAgICAgY29uc3QgdG9nZ2xpbmcgPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtc1tcImh1YnMtc3lzdGVtc1wiXS5jdXJzb3JUb2dnbGluZ1N5c3RlbTtcbiAgICAgICAgICAgIHZhciBwYXNzdGhydUludGVyYWN0b3IgPSBbXVxuXG4gICAgICAgICAgICBsZXQgaW50ZXJhY3Rvck9uZSwgaW50ZXJhY3RvclR3bztcbiAgICAgICAgICAgIGNvbnN0IGludGVyYWN0aW9uID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMuaW50ZXJhY3Rpb247XG4gICAgICAgICAgICBpZiAoIWludGVyYWN0aW9uLnJlYWR5KSByZXR1cm47IC8vRE9NQ29udGVudFJlYWR5IHdvcmthcm91bmRcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbGV0IGhvdmVyRWwgPSB0aGlzLnNpbXBsZUNvbnRhaW5lclxuICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdEhhbmQuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgICAhdG9nZ2xpbmcubGVmdFRvZ2dsZWRPZmZcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yT25lKSB7XG4gICAgICAgICAgICAgICAgbGV0IHBvcyA9IGludGVyYWN0b3JPbmUucG9zaXRpb25cbiAgICAgICAgICAgICAgICBsZXQgZGlyID0gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5nZXRXb3JsZERpcmVjdGlvbihuZXcgVEhSRUUuVmVjdG9yMygpKS5uZWdhdGUoKVxuICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMLnNldChwb3MsIGRpcilcblxuICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlMKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICF0b2dnbGluZy5yaWdodFRvZ2dsZWRPZmZcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRIYW5kLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yVHdvKSB7XG4gICAgICAgICAgICAgICAgbGV0IHBvcyA9IGludGVyYWN0b3JUd28ucG9zaXRpb25cbiAgICAgICAgICAgICAgICBsZXQgZGlyID0gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5nZXRXb3JsZERpcmVjdGlvbihuZXcgVEhSRUUuVmVjdG9yMygpKS5uZWdhdGUoKVxuICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlSLnNldChwb3MsIGRpcilcbiAgICAgICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaCh0aGlzLmhvdmVyUmF5UilcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5pbnRlcmFjdGlvblJheXMgPSBwYXNzdGhydUludGVyYWN0b3JcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZW4ndCBmaW5pc2hlZCBzZXR0aW5nIHVwIHRoZSBuZXR3b3JrZWQgZW50aXR5IGRvbid0IGRvIGFueXRoaW5nLlxuICAgICAgICAgICAgaWYgKCF0aGlzLm5ldEVudGl0eSB8fCAhdGhpcy5zdGF0ZVN5bmMpIHsgcmV0dXJuIH1cblxuICAgICAgICAgICAgLy8gaWYgdGhlIHN0YXRlIGhhcyBjaGFuZ2VkIGluIHRoZSBuZXR3b3JrZWQgZGF0YSwgdXBkYXRlIG91ciBodG1sIG9iamVjdFxuICAgICAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlU3luYy5jaGFuZ2VkID0gZmFsc2VcbiAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC51cGRhdGVTaGFyZWREYXRhKHRoaXMuc3RhdGVTeW5jLmRhdGFPYmplY3QpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNjcmlwdC50aWNrKHRpbWUpXG4gICAgfSxcbiAgXG4gICAgLy8gVE9ETzogIHNob3VsZCBvbmx5IGJlIGNhbGxlZCBpZiB0aGVyZSBpcyBubyBwYXJhbWV0ZXIgc3BlY2lmeWluZyB0aGVcbiAgICAvLyBodG1sIHNjcmlwdCBuYW1lLlxuICAgIHBhcnNlTm9kZU5hbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZnVsbE5hbWUgPT09IFwiXCIpIHtcblxuICAgICAgICAgICAgLy8gVE9ETzogIHN3aXRjaCB0aGlzIHRvIGZpbmQgZW52aXJvbm1lbnQtcm9vdCBhbmQgZ28gZG93biB0byBcbiAgICAgICAgICAgIC8vIHRoZSBub2RlIGF0IHRoZSByb29tIG9mIHNjZW5lIChvbmUgYWJvdmUgdGhlIHZhcmlvdXMgbm9kZXMpLiAgXG4gICAgICAgICAgICAvLyB0aGVuIGdvIHVwIGZyb20gaGVyZSB0aWxsIHdlIGdldCB0byBhIG5vZGUgdGhhdCBoYXMgdGhhdCBub2RlXG4gICAgICAgICAgICAvLyBhcyBpdCdzIHBhcmVudFxuICAgICAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG4gICAgICAgIH0gXG5cbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBcbiAgICAgICAgLy8gIFwiY29tcG9uZW50TmFtZVwiXG4gICAgICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gIFRoaXMgd2lsbCBmZXRjaCB0aGUgY29tcG9uZW50IGZyb20gdGhlIHJlc291cmNlXG4gICAgICAgIC8vIGNvbXBvbmVudE5hbWVcbiAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5mdWxsTmFtZS5tYXRjaCgvXyhbQS1aYS16MC05XSopJC8pXG5cbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDMsIGZpcnN0IG1hdGNoIGlzIHRoZSBkaXIsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgY29tcG9uZW50TmFtZSBuYW1lIG9yIG51bWJlclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiaHRtbC1zY3JpcHQgY29tcG9uZW50TmFtZSBub3QgZm9ybWF0dGVkIGNvcnJlY3RseTogXCIsIHRoaXMuZnVsbE5hbWUpXG4gICAgICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSBudWxsXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSBwYXJhbXNbMV1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBsb2FkU2NyaXB0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGlmIChzY3JpcHRQcm9taXNlKSB7XG4gICAgICAgIC8vICAgICB0cnkge1xuICAgICAgICAvLyAgICAgICAgIGh0bWxDb21wb25lbnRzID0gYXdhaXQgc2NyaXB0UHJvbWlzZTtcbiAgICAgICAgLy8gICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAvLyAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgIC8vICAgICAgICAgcmV0dXJuXG4gICAgICAgIC8vICAgICB9XG4gICAgICAgIC8vICAgICBzY3JpcHRQcm9taXNlID0gbnVsbFxuICAgICAgICAvLyB9XG4gICAgICAgIHZhciBpbml0U2NyaXB0ID0gaHRtbENvbXBvbmVudHNbdGhpcy5jb21wb25lbnROYW1lXVxuICAgICAgICBpZiAoIWluaXRTY3JpcHQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIidodG1sLXNjcmlwdCcgY29tcG9uZW50IGRvZXNuJ3QgaGF2ZSBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lKTtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbFxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2NyaXB0ID0gaW5pdFNjcmlwdCh0aGlzLnNjcmlwdERhdGEpXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCl7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QucmVmcmVzaCh0cnVlKVxuICAgICAgICAgICAgLy8gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC51cGRhdGUodHJ1ZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIidodG1sLXNjcmlwdCcgY29tcG9uZW50IGZhaWxlZCB0byBpbml0aWFsaXplIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGRlc3Ryb3lTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5jbGlja2VkKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWwucmVtb3ZlQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG4gICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gbnVsbFxuXG4gICAgICAgIHRoaXMuc2NyaXB0LmRlc3Ryb3koKVxuICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICB9XG59KVxuXG4vL1xuLy8gQ29tcG9uZW50IGZvciBvdXIgbmV0d29ya2VkIHN0YXRlLiAgVGhpcyBjb21wb25lbnQgZG9lcyBub3RoaW5nIGV4Y2VwdCBhbGwgdXMgdG8gXG4vLyBjaGFuZ2UgdGhlIHN0YXRlIHdoZW4gYXBwcm9wcmlhdGUuIFdlIGNvdWxkIHNldCB0aGlzIHVwIHRvIHNpZ25hbCB0aGUgY29tcG9uZW50IGFib3ZlIHdoZW5cbi8vIHNvbWV0aGluZyBoYXMgY2hhbmdlZCwgaW5zdGVhZCBvZiBoYXZpbmcgdGhlIGNvbXBvbmVudCBhYm92ZSBwb2xsIGVhY2ggZnJhbWUuXG4vL1xuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3NjcmlwdC1kYXRhJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzY3JpcHRkYXRhOiB7dHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJ7fVwifSxcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy50YWtlT3duZXJzaGlwID0gdGhpcy50YWtlT3duZXJzaGlwLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHRoaXMuZWwuZ2V0U2hhcmVkRGF0YSgpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXMuZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCB0aGlzLnNoYXJlZERhdGEpO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDb3VsZG4ndCBlbmNvZGUgaW5pdGlhbCBzY3JpcHQgZGF0YSBvYmplY3Q6IFwiLCBlLCB0aGlzLmRhdGFPYmplY3QpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcInt9XCJcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGFuZ2VkID0gZmFsc2U7XG4gICAgfSxcblxuICAgIHVwZGF0ZSgpIHtcbiAgICAgICAgdGhpcy5jaGFuZ2VkID0gISh0aGlzLnNoYXJlZERhdGEgPT09IHRoaXMuZGF0YS5zY3JpcHRkYXRhKTtcbiAgICAgICAgaWYgKHRoaXMuY2hhbmdlZCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudCh0aGlzLnNjcmlwdERhdGEpKVxuXG4gICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB0aGlzLmRhdGEuc2NyaXB0ZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY291bGRuJ3QgcGFyc2UgSlNPTiByZWNlaXZlZCBpbiBzY3JpcHQtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJcIlxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHt9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gaXQgaXMgbGlrZWx5IHRoYXQgYXBwbHlQZXJzaXN0ZW50U3luYyBvbmx5IG5lZWRzIHRvIGJlIGNhbGxlZCBmb3IgcGVyc2lzdGVudFxuICAgIC8vIG5ldHdvcmtlZCBlbnRpdGllcywgc28gd2UgX3Byb2JhYmx5XyBkb24ndCBuZWVkIHRvIGRvIHRoaXMuICBCdXQgaWYgdGhlcmUgaXMgbm9cbiAgICAvLyBwZXJzaXN0ZW50IGRhdGEgc2F2ZWQgZnJvbSB0aGUgbmV0d29yayBmb3IgdGhpcyBlbnRpdHksIHRoaXMgY29tbWFuZCBkb2VzIG5vdGhpbmcuXG4gICAgcGxheSgpIHtcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQpIHtcbiAgICAgICAgICAgIC8vIG5vdCBzdXJlIGlmIHRoaXMgaXMgcmVhbGx5IG5lZWRlZCwgYnV0IGNhbid0IGh1cnRcbiAgICAgICAgICAgIGlmIChBUFAudXRpbHMpIHsgLy8gdGVtcG9yYXJ5IHRpbGwgd2Ugc2hpcCBuZXcgY2xpZW50XG4gICAgICAgICAgICAgICAgQVBQLnV0aWxzLmFwcGx5UGVyc2lzdGVudFN5bmModGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLm5ldHdvcmtJZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgdGFrZU93bmVyc2hpcCgpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG5cbiAgICAvLyBpbml0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgLy8gICAgIHRyeSB7XG4gICAgLy8gICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAvLyAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAvLyAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAvLyAgICAgICAgIHJldHVybiB0cnVlXG4gICAgLy8gICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAvLyAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAvLyAgICAgICAgIHJldHVybiBmYWxzZVxuICAgIC8vICAgICB9XG4gICAgLy8gfSxcblxuICAgIC8vIFRoZSBrZXkgcGFydCBpbiB0aGVzZSBtZXRob2RzICh3aGljaCBhcmUgY2FsbGVkIGZyb20gdGhlIGNvbXBvbmVudCBhYm92ZSkgaXMgdG9cbiAgICAvLyBjaGVjayBpZiB3ZSBhcmUgYWxsb3dlZCB0byBjaGFuZ2UgdGhlIG5ldHdvcmtlZCBvYmplY3QuICBJZiB3ZSBvd24gaXQgKGlzTWluZSgpIGlzIHRydWUpXG4gICAgLy8gd2UgY2FuIGNoYW5nZSBpdC4gIElmIHdlIGRvbid0IG93biBpbiwgd2UgY2FuIHRyeSB0byBiZWNvbWUgdGhlIG93bmVyIHdpdGhcbiAgICAvLyB0YWtlT3duZXJzaGlwKCkuIElmIHRoaXMgc3VjY2VlZHMsIHdlIGNhbiBzZXQgdGhlIGRhdGEuICBcbiAgICAvL1xuICAgIC8vIE5PVEU6IHRha2VPd25lcnNoaXAgQVRURU1QVFMgdG8gYmVjb21lIHRoZSBvd25lciwgYnkgYXNzdW1pbmcgaXQgY2FuIGJlY29tZSB0aGVcbiAgICAvLyBvd25lciBhbmQgbm90aWZ5aW5nIHRoZSBuZXR3b3JrZWQgY29waWVzLiAgSWYgdHdvIG9yIG1vcmUgZW50aXRpZXMgdHJ5IHRvIGJlY29tZVxuICAgIC8vIG93bmVyLCAgb25seSBvbmUgKHRoZSBsYXN0IG9uZSB0byB0cnkpIGJlY29tZXMgdGhlIG93bmVyLiAgQW55IHN0YXRlIHVwZGF0ZXMgZG9uZVxuICAgIC8vIGJ5IHRoZSBcImZhaWxlZCBhdHRlbXB0ZWQgb3duZXJzXCIgd2lsbCBub3QgYmUgZGlzdHJpYnV0ZWQgdG8gdGhlIG90aGVyIGNsaWVudHMsXG4gICAgLy8gYW5kIHdpbGwgYmUgb3ZlcndyaXR0ZW4gKGV2ZW50dWFsbHkpIGJ5IHVwZGF0ZXMgZnJvbSB0aGUgb3RoZXIgY2xpZW50cy4gICBCeSBub3RcbiAgICAvLyBhdHRlbXB0aW5nIHRvIGd1YXJhbnRlZSBvd25lcnNoaXAsIHRoaXMgY2FsbCBpcyBmYXN0IGFuZCBzeW5jaHJvbm91cy4gIEFueSBcbiAgICAvLyBtZXRob2RzIGZvciBndWFyYW50ZWVpbmcgb3duZXJzaGlwIGNoYW5nZSB3b3VsZCB0YWtlIGEgbm9uLXRyaXZpYWwgYW1vdW50IG9mIHRpbWVcbiAgICAvLyBiZWNhdXNlIG9mIG5ldHdvcmsgbGF0ZW5jaWVzLlxuXG4gICAgc2V0U2hhcmVkRGF0YShkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdmFyIGh0bWxTdHJpbmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YU9iamVjdCkpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBodG1sU3RyaW5nXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShcInNjcmlwdC1kYXRhXCIsIFwic2NyaXB0ZGF0YVwiLCBodG1sU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gc2NyaXB0LXN5bmNcIilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSk7XG5cbi8vIEFkZCBvdXIgdGVtcGxhdGUgZm9yIG91ciBuZXR3b3JrZWQgb2JqZWN0IHRvIHRoZSBhLWZyYW1lIGFzc2V0cyBvYmplY3QsXG4vLyBhbmQgYSBzY2hlbWEgdG8gdGhlIE5BRi5zY2hlbWFzLiAgQm90aCBtdXN0IGJlIHRoZXJlIHRvIGhhdmUgY3VzdG9tIGNvbXBvbmVudHMgd29ya1xuXG5jb25zdCBhc3NldHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiYS1hc3NldHNcIik7XG5cbmFzc2V0cy5pbnNlcnRBZGphY2VudEhUTUwoXG4gICAgJ2JlZm9yZWVuZCcsXG4gICAgYFxuICAgIDx0ZW1wbGF0ZSBpZD1cInNjcmlwdC1kYXRhLW1lZGlhXCI+XG4gICAgICA8YS1lbnRpdHlcbiAgICAgICAgc2NyaXB0LWRhdGFcbiAgICAgID48L2EtZW50aXR5PlxuICAgIDwvdGVtcGxhdGU+XG4gIGBcbiAgKVxuXG5jb25zdCB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSA9IGVwc2lsb24gPT4ge1xuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRsZXQgcHJldiA9IG51bGw7XG5cdFx0XHRyZXR1cm4gY3VyciA9PiB7XG5cdFx0XHRcdGlmIChwcmV2ID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cHJldiA9IG5ldyBUSFJFRS5WZWN0b3IzKGN1cnIueCwgY3Vyci55LCBjdXJyLnopO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFOQUYudXRpbHMuYWxtb3N0RXF1YWxWZWMzKHByZXYsIGN1cnIsIGVwc2lsb24pKSB7XG5cdFx0XHRcdFx0cHJldi5jb3B5KGN1cnIpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH07XG5cdFx0fTtcblx0fTtcblxuTkFGLnNjaGVtYXMuYWRkKHtcbiAgXHR0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICBjb21wb25lbnRzOiBbXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwicm90YXRpb25cIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIC8vIHtcbiAgICAvLyAgICAgY29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgLy8gICAgIHByb3BlcnR5OiBcInNjYWxlXCIsXG4gICAgLy8gICAgIHJlcXVpcmVzTmV0d29ya1VwZGF0ZTogdmVjdG9yUmVxdWlyZXNVcGRhdGUoMC4wMDEpXG4gICAgLy8gfSxcbiAgICB7XG4gICAgICBcdGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgXHRwcm9wZXJ0eTogXCJzY3JpcHRkYXRhXCJcbiAgICB9XSxcbiAgICAgIG5vbkF1dGhvcml6ZWRDb21wb25lbnRzOiBbXG4gICAgICB7XG4gICAgICAgICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgICAgfVxuICAgIF0sXG5cbiAgfSk7XG5cbiIsIi8qKlxuICogY29udHJvbCBhIHZpZGVvIGZyb20gYSBjb21wb25lbnQgeW91IHN0YW5kIG9uLiAgSW1wbGVtZW50cyBhIHJhZGl1cyBmcm9tIHRoZSBjZW50ZXIgb2YgXG4gKiB0aGUgb2JqZWN0IGl0J3MgYXR0YWNoZWQgdG8sIGluIG1ldGVyc1xuICovXG5cbmltcG9ydCB7IEVudGl0eSwgQ29tcG9uZW50IH0gZnJvbSAnYWZyYW1lJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuaW1wb3J0ICcuL3Byb3hpbWl0eS1ldmVudHMuanMnXG5cbmludGVyZmFjZSBBT2JqZWN0M0QgZXh0ZW5kcyBUSFJFRS5PYmplY3QzRCB7XG4gICAgZWw6IEVudGl0eVxufVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3ZpZGVvLWNvbnRyb2wtcGFkJywge1xuICAgIG1lZGlhVmlkZW86IHt9IGFzIENvbXBvbmVudCxcbiAgICBcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgdGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIlwiIH0sICAvLyBpZiBub3RoaW5nIHBhc3NlZCwganVzdCBjcmVhdGUgc29tZSBub2lzZVxuICAgICAgICByYWRpdXM6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDEgfVxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEudGFyZ2V0Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCBtdXN0IGhhdmUgJ3RhcmdldCcgc2V0XCIpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHdhaXQgdW50aWwgdGhlIHNjZW5lIGxvYWRzIHRvIGZpbmlzaC4gIFdlIHdhbnQgdG8gbWFrZSBzdXJlIGV2ZXJ5dGhpbmdcbiAgICAgICAgLy8gaXMgaW5pdGlhbGl6ZWRcbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoKSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplKClcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IHYgPSB0aGlzLmVsLnNjZW5lRWw/Lm9iamVjdDNELmdldE9iamVjdEJ5TmFtZSh0aGlzLmRhdGEudGFyZ2V0KSBhcyBBT2JqZWN0M0RcbiAgICAgICAgaWYgKHYgPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCB0YXJnZXQgJ1wiICsgdGhpcy5kYXRhLnRhcmdldCArIFwiJyBkb2VzIG5vdCBleGlzdFwiKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSB8fCB2LmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSApIHtcbiAgICAgICAgICAgIGlmICh2LmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICBsZXQgZm4gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBWaWRlb1BhZCh2KVxuICAgICAgICAgICAgICAgICAgICB2LmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsIGZuKVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdi5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIGZuKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwVmlkZW9QYWQodilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIHRhcmdldCAnXCIgKyB0aGlzLmRhdGEudGFyZ2V0ICsgXCInIGlzIG5vdCBhIHZpZGVvIGVsZW1lbnRcIilcbiAgICAgICAgfVxuXG4gICAgfSxcblxuICAgIHNldHVwVmlkZW9QYWQ6IGZ1bmN0aW9uICh2aWRlbzogQU9iamVjdDNEKSB7XG4gICAgICAgIHRoaXMubWVkaWFWaWRlbyA9IHZpZGVvLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXVxuICAgICAgICBpZiAodGhpcy5tZWRpYVZpZGVvID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgdGFyZ2V0ICdcIiArIHRoaXMuZGF0YS50YXJnZXQgKyBcIicgaXMgbm90IGEgdmlkZW8gZWxlbWVudFwiKVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gLy9AdHMtaWdub3JlXG4gICAgICAgIC8vIGlmICghdGhpcy5tZWRpYVZpZGVvLnZpZGVvLnBhdXNlZCkge1xuICAgICAgICAvLyAgICAgLy9AdHMtaWdub3JlXG4gICAgICAgIC8vICAgICB0aGlzLm1lZGlhVmlkZW8udG9nZ2xlUGxheWluZygpXG4gICAgICAgIC8vIH1cblxuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiB0aGlzLmRhdGEucmFkaXVzLCBZb2Zmc2V0OiAxLjYgfSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMuZW50ZXJSZWdpb24oKSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHlsZWF2ZScsICgpID0+IHRoaXMubGVhdmVSZWdpb24oKSlcbiAgICB9LFxuXG4gICAgZW50ZXJSZWdpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMubWVkaWFWaWRlby5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBsZWF2ZVJlZ2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXRoaXMubWVkaWFWaWRlby5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgfVxuICAgIH0sXG59KVxuIiwiaW1wb3J0ICcuLi9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcG9ydGFsLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcGFyYWxsYXguanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvc2hhZGVyLnRzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy92aWRlby1jb250cm9sLXBhZCdcblxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCAnaW1tZXJzaXZlLTM2MCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywgJ3BvcnRhbCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnc2hhZGVyJywgJ3NoYWRlcicpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgncGFyYWxsYXgnLCAncGFyYWxsYXgnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ2h0bWwtc2NyaXB0JywgJ2h0bWwtc2NyaXB0JylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCAncmVnaW9uLWhpZGVyJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCd2aWRlby1jb250cm9sLXBhZCcsICd2aWRlby1jb250cm9sLXBhZCcpXG5cbi8vIGRvIGEgc2ltcGxlIG1vbmtleSBwYXRjaCB0byBzZWUgaWYgaXQgd29ya3NcblxuLy8gdmFyIG15aXNNaW5lT3JMb2NhbCA9IGZ1bmN0aW9uICh0aGF0KSB7XG4vLyAgICAgcmV0dXJuICF0aGF0LmVsLmNvbXBvbmVudHMubmV0d29ya2VkIHx8ICh0aGF0Lm5ldHdvcmtlZEVsICYmIE5BRi51dGlscy5pc01pbmUodGhhdC5uZXR3b3JrZWRFbCkpO1xuLy8gIH1cblxuLy8gIHZhciB2aWRlb0NvbXAgPSBBRlJBTUUuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4vLyAgdmlkZW9Db21wLkNvbXBvbmVudC5wcm90b3R5cGUuaXNNaW5lT3JMb2NhbCA9IG15aXNNaW5lT3JMb2NhbDtcblxuLy8gbGV0IGhvbWVQYWdlRGVzYyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tjbGFzc149XCJIb21lUGFnZV9fYXBwLWRlc2NyaXB0aW9uXCJdJylcbi8vIGlmIChob21lUGFnZURlc2MpIHtcbi8vICAgICBob21lUGFnZURlc2MuaW5uZXJIVE1MID0gXCJSZWFsaXR5IE1lZGlhIEltbWVyc2l2ZSBFeHBlcmllbmNlPGJyPjxicj5BZnRlciBzaWduaW5nIGluLCB2aXNpdCA8YSBocmVmPSdodHRwczovL3JlYWxpdHltZWRpYS5kaWdpdGFsJz5yZWFsaXR5bWVkaWEuZGlnaXRhbDwvYT4gdG8gZ2V0IHN0YXJ0ZWRcIlxuLy8gfVxuXG5cbmZ1bmN0aW9uIGhpZGVMb2JieVNwaGVyZSgpIHtcbiAgICAvLyBAdHMtaWdub3JlXG4gICAgd2luZG93LkFQUC5zY2VuZS5hZGRFdmVudExpc3RlbmVyKCdzdGF0ZWFkZGVkJywgZnVuY3Rpb24oZXZ0OkN1c3RvbUV2ZW50KSB7IFxuICAgICAgICBpZiAoZXZ0LmRldGFpbCA9PT0gJ2VudGVyZWQnKSB7XG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgICB2YXIgbG9iYnlTcGhlcmUgPSB3aW5kb3cuQVBQLnNjZW5lLm9iamVjdDNELmdldE9iamVjdEJ5TmFtZSgnbG9iYnlTcGhlcmUnKVxuICAgICAgICAgICAgaWYgKGxvYmJ5U3BoZXJlKSB7XG4gICAgICAgICAgICAgICAgbG9iYnlTcGhlcmUudmlzaWJsZSA9IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuaWYgKGRvY3VtZW50LnJlYWR5U3RhdGUgPT09ICdjb21wbGV0ZScpIHtcbiAgICBoaWRlTG9iYnlTcGhlcmUoKTtcbn0gZWxzZSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGhpZGVMb2JieVNwaGVyZSk7XG59Il0sIm5hbWVzIjpbIndvcmxkQ2FtZXJhIiwid29ybGRTZWxmIiwiZGVmYXVsdEhvb2tzIiwiZ2xzbCIsInVuaWZvcm1zIiwibG9hZGVyIiwibm9pc2VUZXgiLCJzbWFsbE5vaXNlIiwid2FycFRleCIsInNub2lzZSIsIk1hdGVyaWFsTW9kaWZpZXIiLCJwYW5vdmVydCIsInBhbm9mcmFnIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRTtBQUNwQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElBQUksU0FBUyxFQUFFLEVBQUUsSUFB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LFNBQVMsRUFBRUEsTUFBSSxDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7S0FpSWxCO1FBQ0QsVUFBVSxFQUFFQSxNQUFJLENBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQXFCZjtLQUNBO0lBQ0QsSUFBSSxFQUFFLFVBQVMsUUFBMkM7UUFDdEQsSUFBSSxHQUFHLEdBQUksUUFBMEQsQ0FBQTtRQUVyRSxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFBO1FBQ3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUE7O1FBR3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUE7UUFJckYsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFFLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQTtRQUM1SCxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUUsS0FBSyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxDQUFDLFFBQVEsR0FBRyxJQUFJLENB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Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FxRWY7S0FDSjtJQUNELElBQUksRUFBRSxVQUFTLFFBQTJDO1FBQ3RELElBQUksR0FBRyxHQUFJLFFBQTBELENBQUE7UUFFckUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7UUFDNUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7O1FBRTVHLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFBO1FBQ3hFLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFDLEdBQUcsSUFBSSxFQUFFLENBQUE7UUFFdkQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQTs7UUFHekMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUE7UUFDekMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUE7UUFDM0MsUUFBUSxDQUFDLFFBQVEsQ0FB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Q0FBQyxDQUFDO0FBQzVGLFlBQVksYUFBYSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDcEcsWUFBWSxhQUFhLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNwRyxXQUFXO0FBQ1gsU0FBUztBQUNULFFBQVEsT0FBTyxhQUFhLENBQUM7QUFDN0IsS0FBSztBQUNMO0FBQ0EsSUFBSSxXQUFXLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtBQUN4QyxRQUFRLElBQUksU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDLENBQUMsR0FBRyxXQUFXLEdBQUcsWUFBWSxDQUFDLENBQUM7QUFDdkU7QUFDQSxRQUFRLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDeEMsVUFBVSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQzNDLFlBQVksU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3hGLFlBQVksU0FBUyxDQUFDLENBQUMsR0FBRyxD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QUN6RDtBQUNBO0FBQ0EsUUFBUSxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQyxlQUFlLEVBQUM7QUFDdkQ7QUFDQTtBQUNBLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFDO0FBQ3ZFO0FBQ0EsUUFBUSxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sR0FBRTtBQUM3QyxRQUFRLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQUs7QUFDdEQsUUFBUSxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFLO0FBQzNDLFFBQVEsSUFBSSxNQUFNLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFTO0FBQ2hFLFFBQVEsSUFBSSxNQUFNLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFTO0FBQ2hFLFFBQVEsSUFBSSxNQUFNLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFTO0FBQ2hFO0FBQ0EsUUFBUSxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLE9BQU07QUFDckQsUUFBUSxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLE9BQU07QUFDckQ7QUFDQSxRQUFRLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLE9BQU07QUFDbEYsUUFBUSxJQUFJ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QWYsTUFBTUYsTUFBSSxHQUFHLENBQUM7QUFDZDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkEsTUFBTUEsTUFBSSxHQUFHLENBQUM7QUFDZDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0EsTUFBTSxXQUFXLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQ3ZDLE1BQU0sU0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUNyQztBQUNBLE1BQU0sTUFBTSxHQUFHLElBQUksS0FBSyxDQUFDLGFBQWEsR0FBRTtBQUN4QyxJQUFJLE9BQU8sR0FB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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxFQUFFLENBQUM7QUFDSDs7QUNwTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR0E7QUFDQSxNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLEdBQUU7QUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFDO0FBQzFDO0FBQ0EsTUFBTSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRTtBQUNyQyxFQUFFLE1BQU0sRUFBRTtBQUNWLElB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
