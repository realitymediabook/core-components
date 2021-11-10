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
    invertWarpColor: { value: 0 }
};
let cubeMap = new THREE.CubeTexture();
const loader$2 = new THREE.TextureLoader();
var warpTex;
loader$2.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestFilter;
    warp.magFilter = THREE.NearestFilter;
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
        vRay.z *= 1.3 / (1. + pow(portal_dist, 0.5)); // Change FOV by squashing local Z direction
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
    mainText: { type: 'string', default: null},
    secondaryText: { type: 'string', default: null}
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
            this.system.getCubeMap(this.portalTarget).then( urls => {
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
            this.cubeCamera = new THREE.CubeCamera(0.1, 1000, 1000);
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
                hiderRegionForObject(this.el);
            });
        }

        let scaleM = this.el.object3DMap["mesh"].scale;
        let scaleI = this.el.object3D.scale;
        this.Yoffset = -(scaleM.y * scaleI.y / 2) + 1.6;

        this.el.setAttribute('proximity-events', { radius: 4, Yoffset: this.Yoffset });
        this.el.addEventListener('proximityenter', () => this.open());
        this.el.addEventListener('proximityleave', () => this.close());
    
        var titleScriptData = {
            width: 300,
            height: 50,
            message: this.data.mainText
        };
        var subtitleScriptData = {
            width: 300,
            height: 50,
            message: this.data.secondaryText
        };
        const portalTitle = htmlComponents["PortalTitle"];
        const portalSubtitle = htmlComponents["PortalSubtitle"];

        this.portalTitle = portalTitle(titleScriptData);
        this.portalSubtitle = portalSubtitle(subtitleScriptData);

        this.el.setObject3D('portalTitle', this.portalTitle.webLayer3D);
        this.portalTitle.webLayer3D.position.y = 0.75;
        this.el.setObject3D('portalSubtitle', this.portalSubtitle.webLayer3D);
        this.portalSubtitle.webLayer3D.position.x = 1;
        this.el.setObject3D.matrixAutoUpdate = true;
        this.portalTitle.webLayer3D.matrixAutoUpdate = true;
        this.portalSubtitle.webLayer3D.matrixAutoUpdate = true;

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
    this.portalSubtitle.tick(time);

    this.materials.map((mat) => {
        mat.userData.radius = this.radius;
        mat.userData.cubeMap = this.cubeMap;
        WarpPortalShader.updateUniforms(time, mat);
    });

    if (this.other && !this.system.teleporting) {
      this.el.object3D.getWorldPosition(worldPos);
      this.el.sceneEl.camera.getWorldPosition(worldCameraPos) - this.Yoffset;
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
let homePageDesc = document.querySelector('[class^="HomePage__app-description"]');
if (homePageDesc) {
    homePageDesc.innerHTML = "Reality Media Immersive Experience<br><br>After signing in, visit <a href='https://realitymedia.digital'>realitymedia.digital</a> to get started";
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wcm94aW1pdHktZXZlbnRzLmpzIiwiLi4vc3JjL3V0aWxzL2NvbXBvbmVudC11dGlscy5qcyIsIi4uL3NyYy91dGlscy9zY2VuZS1ncmFwaC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcyIsIi4uL3NyYy91dGlscy9kZWZhdWx0SG9va3MudHMiLCIuLi9zcmMvdXRpbHMvTWF0ZXJpYWxNb2RpZmllci50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveU1haW4udHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lVbmlmb3JtT2JqLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95VW5pZm9ybV9wYXJhcy50cyIsIi4uL3NyYy9hc3NldHMvYmF5ZXIucG5nIiwiLi4vc3JjL3NoYWRlcnMvYmxlZXB5LWJsb2Nrcy1zaGFkZXIudHMiLCIuLi9zcmMvc2hhZGVycy9ub2lzZS50cyIsIi4uL3NyYy9zaGFkZXJzL2xpcXVpZC1tYXJibGUudHMiLCIuLi9zcmMvYXNzZXRzL3NtYWxsLW5vaXNlLnBuZyIsIi4uL3NyYy9zaGFkZXJzL2dhbGF4eS50cyIsIi4uL3NyYy9zaGFkZXJzL2xhY2UtdHVubmVsLnRzIiwiLi4vc3JjL2Fzc2V0cy9ub2lzZS0yNTYucG5nIiwiLi4vc3JjL3NoYWRlcnMvZmlyZS10dW5uZWwudHMiLCIuLi9zcmMvc2hhZGVycy9taXN0LnRzIiwiLi4vc3JjL3NoYWRlcnMvbWFyYmxlMS50cyIsIi4uL3NyYy9hc3NldHMvYmFkU2hhZGVyLmpwZyIsIi4uL3NyYy9zaGFkZXJzL25vdC1mb3VuZC50cyIsIi4uL3NyYy9hc3NldHMvd2FycGZ4LnBuZyIsIi4uL3NyYy9zaGFkZXJzL3dhcnAudHMiLCIuLi9zcmMvc2hhZGVycy9zbm9pc2UudHMiLCIuLi9zcmMvc2hhZGVycy93YXJwLXBvcnRhbC50cyIsIi4uL3NyYy9jb21wb25lbnRzL3NoYWRlci50cyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9DT0xPUi5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfRElTUC5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfZ2xvc3NpbmVzcy5wbmciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfTlJNLmpwZyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9PQ0MuanBnIiwiLi4vc3JjL2NvbXBvbmVudHMvcG9ydGFsLmpzIiwiLi4vc3JjL2Fzc2V0cy9iYWxsZngucG5nIiwiLi4vc3JjL3NoYWRlcnMvcGFub2JhbGwudmVydC5qcyIsIi4uL3NyYy9zaGFkZXJzL3Bhbm9iYWxsLmZyYWcuanMiLCIuLi9zcmMvY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzIiwiLi4vc3JjL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcGFyYWxsYXguanMiLCIuLi9zcmMvY29tcG9uZW50cy9odG1sLXNjcmlwdC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3ZpZGVvLWNvbnRyb2wtcGFkLnRzIiwiLi4vc3JjL3Jvb21zL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTW9kaWZpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS9odWJzL2Jsb2IvbWFzdGVyL3NyYy9jb21wb25lbnRzL2ZhZGVyLmpzXG4gKiB0byBpbmNsdWRlIGFkanVzdGFibGUgZHVyYXRpb24gYW5kIGNvbnZlcnRlZCBmcm9tIGNvbXBvbmVudCB0byBzeXN0ZW1cbiAqL1xuXG5BRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2ZhZGVyLXBsdXMnLCB7XG4gIHNjaGVtYToge1xuICAgIGRpcmVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogJ25vbmUnIH0sIC8vIFwiaW5cIiwgXCJvdXRcIiwgb3IgXCJub25lXCJcbiAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMjAwIH0sIC8vIFRyYW5zaXRpb24gZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogJ3doaXRlJyB9LFxuICB9LFxuXG4gIGluaXQoKSB7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KCksXG4gICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICBjb2xvcjogdGhpcy5kYXRhLmNvbG9yLFxuICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgb3BhY2l0eTogMCxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIGZvZzogZmFsc2UsXG4gICAgICB9KVxuICAgIClcbiAgICBtZXNoLnNjYWxlLnggPSBtZXNoLnNjYWxlLnkgPSAxXG4gICAgbWVzaC5zY2FsZS56ID0gMC4xNVxuICAgIG1lc2gubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgbWVzaC5yZW5kZXJPcmRlciA9IDEgLy8gcmVuZGVyIGFmdGVyIG90aGVyIHRyYW5zcGFyZW50IHN0dWZmXG4gICAgdGhpcy5lbC5jYW1lcmEuYWRkKG1lc2gpXG4gICAgdGhpcy5tZXNoID0gbWVzaFxuICB9LFxuXG4gIGZhZGVPdXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdvdXQnKVxuICB9LFxuXG4gIGZhZGVJbigpIHtcbiAgICByZXR1cm4gdGhpcy5iZWdpblRyYW5zaXRpb24oJ2luJylcbiAgfSxcblxuICBhc3luYyBiZWdpblRyYW5zaXRpb24oZGlyZWN0aW9uKSB7XG4gICAgaWYgKHRoaXMuX3Jlc29sdmVGaW5pc2gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZhZGUgd2hpbGUgYSBmYWRlIGlzIGhhcHBlbmluZy4nKVxuICAgIH1cblxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdmYWRlci1wbHVzJywgeyBkaXJlY3Rpb24gfSlcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzKSA9PiB7XG4gICAgICBpZiAodGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPT09IChkaXJlY3Rpb24gPT0gJ2luJyA/IDAgOiAxKSkge1xuICAgICAgICByZXMoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IHJlc1xuICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgdGljayh0LCBkdCkge1xuICAgIGNvbnN0IG1hdCA9IHRoaXMubWVzaC5tYXRlcmlhbFxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gdGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcgfHwgbWF0Lm9wYWNpdHkgIT09IDBcbiAgICBpZiAoIXRoaXMubWVzaC52aXNpYmxlKSByZXR1cm5cblxuICAgIGlmICh0aGlzLmRhdGEuZGlyZWN0aW9uID09PSAnaW4nKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWF4KDAsIG1hdC5vcGFjaXR5IC0gKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ291dCcpIHtcbiAgICAgIG1hdC5vcGFjaXR5ID0gTWF0aC5taW4oMSwgbWF0Lm9wYWNpdHkgKyAoMS4wIC8gdGhpcy5kYXRhLmR1cmF0aW9uKSAqIE1hdGgubWluKGR0LCA1MCkpXG4gICAgfVxuXG4gICAgaWYgKG1hdC5vcGFjaXR5ID09PSAwIHx8IG1hdC5vcGFjaXR5ID09PSAxKSB7XG4gICAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiAhPT0gJ25vbmUnKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCgpXG4gICAgICAgICAgdGhpcy5fcmVzb2x2ZUZpbmlzaCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uOiAnbm9uZScgfSlcbiAgICB9XG4gIH0sXG59KVxuIiwiY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncHJveGltaXR5LWV2ZW50cycsIHtcbiAgc2NoZW1hOiB7XG4gICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH0sXG4gICAgZnV6ejogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMC4xIH0sXG4gICAgWW9mZnNldDogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMCB9LFxuICB9LFxuICBpbml0KCkge1xuICAgIHRoaXMuaW5ab25lID0gZmFsc2VcbiAgICB0aGlzLmNhbWVyYSA9IHRoaXMuZWwuc2NlbmVFbC5jYW1lcmFcbiAgfSxcbiAgdGljaygpIHtcbiAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgY29uc3Qgd2FzSW56b25lID0gdGhpcy5pblpvbmVcblxuICAgIHdvcmxkQ2FtZXJhLnkgLT0gdGhpcy5kYXRhLllvZmZzZXRcbiAgICB2YXIgZGlzdCA9IHdvcmxkQ2FtZXJhLmRpc3RhbmNlVG8od29ybGRTZWxmKVxuICAgIHZhciB0aHJlc2hvbGQgPSB0aGlzLmRhdGEucmFkaXVzICsgKHRoaXMuaW5ab25lID8gdGhpcy5kYXRhLmZ1enogIDogMClcbiAgICB0aGlzLmluWm9uZSA9IGRpc3QgPCB0aHJlc2hvbGRcbiAgICBpZiAodGhpcy5pblpvbmUgJiYgIXdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHllbnRlcicpXG4gICAgaWYgKCF0aGlzLmluWm9uZSAmJiB3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5bGVhdmUnKVxuICB9LFxufSlcbiIsIi8vIFByb3ZpZGVzIGEgZ2xvYmFsIHJlZ2lzdHJ5IG9mIHJ1bm5pbmcgY29tcG9uZW50c1xuLy8gY29waWVkIGZyb20gaHVicyBzb3VyY2VcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UoY29tcG9uZW50LCBuYW1lKSB7XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgfHwge307XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gfHwgW107XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5wdXNoKGNvbXBvbmVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UoY29tcG9uZW50LCBuYW1lKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdKSByZXR1cm47XG4gICAgd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5zcGxpY2Uod2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXS5pbmRleE9mKGNvbXBvbmVudCksIDEpO1xufVxuICAiLCIvLyBjb3BpZWQgZnJvbSBodWJzXG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KGVudGl0eSwgY29tcG9uZW50TmFtZSkge1xuICAgIHdoaWxlIChlbnRpdHkgJiYgIShlbnRpdHkuY29tcG9uZW50cyAmJiBlbnRpdHkuY29tcG9uZW50c1tjb21wb25lbnROYW1lXSkpIHtcbiAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlO1xuICAgIH1cbiAgICByZXR1cm4gZW50aXR5O1xuICB9XG4gIFxuICBleHBvcnQgZnVuY3Rpb24gZmluZENvbXBvbmVudHNJbk5lYXJlc3RBbmNlc3RvcihlbnRpdHksIGNvbXBvbmVudE5hbWUpIHtcbiAgICBjb25zdCBjb21wb25lbnRzID0gW107XG4gICAgd2hpbGUgKGVudGl0eSkge1xuICAgICAgaWYgKGVudGl0eS5jb21wb25lbnRzKSB7XG4gICAgICAgIGZvciAoY29uc3QgYyBpbiBlbnRpdHkuY29tcG9uZW50cykge1xuICAgICAgICAgIGlmIChlbnRpdHkuY29tcG9uZW50c1tjXS5uYW1lID09PSBjb21wb25lbnROYW1lKSB7XG4gICAgICAgICAgICBjb21wb25lbnRzLnB1c2goZW50aXR5LmNvbXBvbmVudHNbY10pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBjb21wb25lbnRzO1xuICAgICAgfVxuICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGU7XG4gICAgfVxuICAgIHJldHVybiBjb21wb25lbnRzO1xuICB9XG4gICIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBicmVhayB0aGUgcm9vbSBpbnRvIHF1YWRyYW50cyBvZiBhIGNlcnRhaW4gc2l6ZSwgYW5kIGhpZGUgdGhlIGNvbnRlbnRzIG9mIGFyZWFzIHRoYXQgaGF2ZVxuICogbm9ib2R5IGluIHRoZW0uICBNZWRpYSB3aWxsIGJlIHBhdXNlZCBpbiB0aG9zZSBhcmVhcyB0b28uXG4gKiBcbiAqIEluY2x1ZGUgYSB3YXkgZm9yIHRoZSBwb3J0YWwgY29tcG9uZW50IHRvIHR1cm4gb24gZWxlbWVudHMgaW4gdGhlIHJlZ2lvbiBvZiB0aGUgcG9ydGFsIGJlZm9yZVxuICogaXQgY2FwdHVyZXMgYSBjdWJlbWFwXG4gKi9cblxuaW1wb3J0IHsgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSwgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlIH0gZnJvbSBcIi4uL3V0aWxzL2NvbXBvbmVudC11dGlsc1wiO1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuXG4gLy8gYXJiaXRyYXJpbHkgY2hvb3NlIDEwMDAwMDAgYXMgdGhlIG51bWJlciBvZiBjb21wdXRlZCB6b25lcyBpbiAgeCBhbmQgeVxubGV0IE1BWF9aT05FUyA9IDEwMDAwMDBcbmxldCByZWdpb25UYWcgPSBmdW5jdGlvbihzaXplLCBvYmozZCkge1xuICAgIGxldCBwb3MgPSBvYmozZC5wb3NpdGlvblxuICAgIGxldCB4cCA9IE1hdGguZmxvb3IocG9zLnggLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgbGV0IHpwID0gTWF0aC5mbG9vcihwb3MueiAvIHNpemUpICsgTUFYX1pPTkVTLzJcbiAgICByZXR1cm4gTUFYX1pPTkVTICogeHAgKyB6cFxufVxuXG5sZXQgcmVnaW9uc0luVXNlID0gW11cblxuLyoqXG4gKiBGaW5kIHRoZSBjbG9zZXN0IGFuY2VzdG9yIChpbmNsdWRpbmcgdGhlIHBhc3NlZCBpbiBlbnRpdHkpIHRoYXQgaGFzIGFuIGBvYmplY3QtcmVnaW9uLWZvbGxvd2VyYCBjb21wb25lbnQsXG4gKiBhbmQgcmV0dXJuIHRoYXQgY29tcG9uZW50XG4gKi9cbmZ1bmN0aW9uIGdldFJlZ2lvbkZvbGxvd2VyKGVudGl0eSkge1xuICAgIGxldCBjdXJFbnRpdHkgPSBlbnRpdHk7XG4gIFxuICAgIHdoaWxlKGN1ckVudGl0eSAmJiBjdXJFbnRpdHkuY29tcG9uZW50cyAmJiAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIGN1ckVudGl0eSA9IGN1ckVudGl0eS5wYXJlbnROb2RlO1xuICAgIH1cbiAgXG4gICAgaWYgKCFjdXJFbnRpdHkgfHwgIWN1ckVudGl0eS5jb21wb25lbnRzIHx8ICFjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdXG59XG4gIFxuZnVuY3Rpb24gYWRkVG9SZWdpb24ocmVnaW9uKSB7XG4gICAgcmVnaW9uc0luVXNlW3JlZ2lvbl0gPyByZWdpb25zSW5Vc2VbcmVnaW9uXSsrIDogcmVnaW9uc0luVXNlW3JlZ2lvbl0gPSAxXG4gICAgY29uc29sZS5sb2coXCJBdmF0YXJzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbiArIFwiOiBcIiArIHJlZ2lvbnNJblVzZVtyZWdpb25dKVxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAxKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdHJ1ZSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcImFscmVhZHkgYW5vdGhlciBhdmF0YXIgaW4gdGhpcyByZWdpb24sIG5vIGNoYW5nZVwiKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gc3VidHJhY3RGcm9tUmVnaW9uKHJlZ2lvbikge1xuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSkge3JlZ2lvbnNJblVzZVtyZWdpb25dLS0gfVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBsZWZ0IHJlZ2lvbiBcIiArIHJlZ2lvbiArIFwiOiBcIiArIHJlZ2lvbnNJblVzZVtyZWdpb25dKVxuXG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dID09IDApIHtcbiAgICAgICAgc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCBmYWxzZSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcInN0aWxsIGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93UmVnaW9uRm9yT2JqZWN0KGVsZW1lbnQpIHtcbiAgICBsZXQgZm9sbG93ZXIgPSBnZXRSZWdpb25Gb2xsb3dlcihlbGVtZW50KVxuICAgIGlmICghZm9sbG93ZXIpIHsgcmV0dXJuIH1cblxuICAgIGNvbnNvbGUubG9nKFwic2hvd2luZyBvYmplY3RzIG5lYXIgXCIgKyBmb2xsb3dlci5lbC5jbGFzc05hbWUpXG5cbiAgICBhZGRUb1JlZ2lvbihmb2xsb3dlci5yZWdpb24pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoaWRlclJlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcImhpZGluZyBvYmplY3RzIG5lYXIgXCIgKyBmb2xsb3dlci5lbC5jbGFzc05hbWUpXG5cbiAgICBzdWJ0cmFjdEZyb21SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5mdW5jdGlvbiBzaG93SGlkZU9iamVjdHMoKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQIHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5KVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zb2xlLmxvZyAoXCJzaG93aW5nL2hpZGluZyBhbGwgb2JqZWN0c1wiKVxuICAgIGNvbnN0IG9iamVjdHMgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSB8fCBbXTtcbiAgXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvYmplY3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBvYmogPSBvYmplY3RzW2ldO1xuICAgICAgXG4gICAgICBsZXQgdmlzaWJsZSA9IHJlZ2lvbnNJblVzZVtvYmoucmVnaW9uXSA/IHRydWU6IGZhbHNlXG4gICAgICAgIFxuICAgICAgaWYgKG9iai5lbC5vYmplY3QzRC52aXNpYmxlID09IHZpc2libGUpIHsgY29udGludWUgfVxuXG4gICAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmcgXCIgOiBcImhpZGluZyBcIikgKyBvYmouZWwuY2xhc3NOYW1lKVxuICAgICAgb2JqLnNob3dIaWRlKHZpc2libGUpXG4gICAgfVxuICBcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCB2aXNpYmxlKSB7XG4gICAgaWYgKCF3aW5kb3cuQVBQIHx8ICF3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5KVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmdcIiA6IFwiaGlkaW5nXCIpICsgXCIgYWxsIG9iamVjdHMgaW4gcmVnaW9uIFwiICsgcmVnaW9uKVxuICAgIGNvbnN0IG9iamVjdHMgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSB8fCBbXTtcbiAgXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvYmplY3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBvYmogPSBvYmplY3RzW2ldO1xuICAgICAgXG4gICAgICBpZiAob2JqLnJlZ2lvbiA9PSByZWdpb24pIHtcbiAgICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCIgaGlkaW5nXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgICAgb2JqLnNob3dIaWRlKHZpc2libGUpXG4gICAgICB9XG4gICAgfVxuICBcbiAgICByZXR1cm4gbnVsbDtcbn1cbiAgXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2F2YXRhci1yZWdpb24tZm9sbG93ZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcbiAgICAgICAgY29uc29sZS5sb2coXCJBdmF0YXI6IHJlZ2lvbiBcIiwgdGhpcy5yZWdpb24pXG4gICAgICAgIGFkZFRvUmVnaW9uKHRoaXMucmVnaW9uKVxuXG4gICAgICAgIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG4gICAgcmVtb3ZlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICAgICAgc3VidHJhY3RGcm9tUmVnaW9uKHRoaXMucmVnaW9uKVxuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCBuZXdSZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGlmIChuZXdSZWdpb24gIT0gdGhpcy5yZWdpb24pIHtcbiAgICAgICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICAgICAgICAgIGFkZFRvUmVnaW9uKG5ld1JlZ2lvbilcbiAgICAgICAgICAgIHRoaXMucmVnaW9uID0gbmV3UmVnaW9uXG4gICAgICAgIH1cbiAgICB9LFxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdvYmplY3QtcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH0sXG4gICAgICAgIGR5bmFtaWM6IHsgZGVmYXVsdDogdHJ1ZSB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuXG4gICAgICAgIHRoaXMuc2hvd0hpZGUgPSB0aGlzLnNob3dIaWRlLmJpbmQodGhpcylcbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICB0aGlzLndhc1BhdXNlZCA9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWRcbiAgICAgICAgfVxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZSBkb24ndCBtb3ZlXG4gICAgICAgIGlmICghdGhpcy5kYXRhLmR5bmFtaWMpIHsgcmV0dXJuIH1cblxuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICBsZXQgdmlzaWJsZSA9IHJlZ2lvbnNJblVzZVt0aGlzLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IHJldHVybiB9XG5cbiAgICAgICAgLy8gaGFuZGxlIHNob3cvaGlkaW5nIHRoZSBvYmplY3RzXG4gICAgICAgIHRoaXMuc2hvd0hpZGUodmlzaWJsZSlcbiAgICB9LFxuXG4gICAgc2hvd0hpZGU6IGZ1bmN0aW9uICh2aXNpYmxlKSB7XG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB2aXNpYmxlXG5cbiAgICAgICAgLy8vIGNoZWNrIGZvciBtZWRpYS12aWRlbyBjb21wb25lbnQgb24gcGFyZW50IHRvIHNlZSBpZiB3ZSdyZSBhIHZpZGVvLiAgQWxzbyBzYW1lIGZvciBhdWRpb1xuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0pIHtcbiAgICAgICAgICAgIGlmICh2aXNpYmxlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMud2FzUGF1c2VkICE9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLndhc1BhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS50b2dnbGVQbGF5aW5nKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIC8vIG5hbWUgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gXCIqX2NvbXBvbmVudE5hbWVcIlxuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBwYXJlbnQgd2l0aCBcIm5hdi1tZXNoLWhlbHBlclwiLCB0aGlzIGlzIGluIHRoZSBzY2VuZS4gIFxuICAgICAgICAvLyBJZiBub3QsIGl0J3MgaW4gYW4gb2JqZWN0IHdlIGRyb3BwZWQgb24gdGhlIHdpbmRvdywgd2hpY2ggd2UgZG9uJ3Qgc3VwcG9ydFxuICAgICAgICBpZiAoIWZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJuYXYtbWVzaC1oZWxwZXJcIikpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJlZ2lvbi1oaWRlciBjb21wb25lbnQgbXVzdCBiZSBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZ2xiLlwiKVxuICAgICAgICAgICAgdGhpcy5zaXplID0gMDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYodGhpcy5kYXRhLnNpemUgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnNpemUgPSAxMDtcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGlzLm5ld1NjZW5lID0gdGhpcy5uZXdTY2VuZS5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMubmV3U2NlbmUpXG4gICAgICAgIC8vIGNvbnN0IGVudmlyb25tZW50U2NlbmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2Vudmlyb25tZW50LXNjZW5lXCIpO1xuICAgICAgICAvLyB0aGlzLmFkZFNjZW5lRWxlbWVudCA9IHRoaXMuYWRkU2NlbmVFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQgPSB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIGVudmlyb25tZW50U2NlbmUuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWF0dGFjaGVkXCIsIHRoaXMuYWRkU2NlbmVFbGVtZW50KVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudClcblxuICAgICAgICAvLyB3ZSB3YW50IHRvIG5vdGljZSB3aGVuIG5ldyB0aGluZ3MgZ2V0IGFkZGVkIHRvIHRoZSByb29tLiAgVGhpcyB3aWxsIGhhcHBlbiBmb3JcbiAgICAgICAgLy8gb2JqZWN0cyBkcm9wcGVkIGluIHRoZSByb29tLCBvciBmb3IgbmV3IHJlbW90ZSBhdmF0YXJzLCBhdCBsZWFzdFxuICAgICAgICAvLyB0aGlzLmFkZFJvb3RFbGVtZW50ID0gdGhpcy5hZGRSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQgPSB0aGlzLnJlbW92ZVJvb3RFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFJvb3RFbGVtZW50KVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWRldGFjaGVkXCIsIHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2FudCB0byBzZWUgaWYgdGhlcmUgYXJlIHBpbm5lZCBvYmplY3RzIHRoYXQgd2VyZSBsb2FkZWQgZnJvbSBodWJzXG4gICAgICAgIGxldCByb29tT2JqZWN0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoXCJSb29tT2JqZWN0c1wiKVxuICAgICAgICB0aGlzLnJvb21PYmplY3RzID0gcm9vbU9iamVjdHMubGVuZ3RoID4gMCA/IHJvb21PYmplY3RzWzBdIDogbnVsbFxuXG4gICAgICAgIC8vIGdldCBhdmF0YXJzXG4gICAgICAgIGNvbnN0IGF2YXRhcnMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltwbGF5ZXItaW5mb11cIik7XG4gICAgICAgIGF2YXRhcnMuZm9yRWFjaCgoYXZhdGFyKSA9PiB7XG4gICAgICAgICAgICBhdmF0YXIuc2V0QXR0cmlidXRlKFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIG9iamVjdHMgaW4gdGhlIHJvb3QgKHRoaW5ncyB0aGF0IGhhdmUgYmVlbiBkcm9wcGVkIG9uIHRoZSBzY2VuZSlcbiAgICAgICAgLy8gLSBkcmF3aW5ncyBoYXZlIGNsYXNzPVwiZHJhd2luZ1wiLCBuZXR3b3JrZWQtZHJhd2luZ1xuICAgICAgICAvLyBOb3QgZ29pbmcgdG8gZG8gZHJhd2luZ3MgcmlnaHQgbm93LlxuXG4gICAgICAgIC8vIHBpbm5lZCBtZWRpYSBsaXZlIHVuZGVyIGEgbm9kZSB3aXRoIGNsYXNzPVwiUm9vbU9iamVjdHNcIlxuICAgICAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIi5Sb29tT2JqZWN0cyA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gLSBjYW1lcmEgaGFzIGNhbWVyYS10b29sICAgICAgICBcbiAgICAgICAgLy8gLSBpbWFnZSBmcm9tIGNhbWVyYSwgb3IgZHJvcHBlZCwgaGFzIG1lZGlhLWxvYWRlciwgbWVkaWEtaW1hZ2UsIGxpc3RlZC1tZWRpYVxuICAgICAgICAvLyAtIGdsYiBoYXMgbWVkaWEtbG9hZGVyLCBnbHRmLW1vZGVsLXBsdXMsIGxpc3RlZC1tZWRpYVxuICAgICAgICAvLyAtIHZpZGVvIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLXZpZGVvLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy9cbiAgICAgICAgLy8gIHNvLCBnZXQgYWxsIGNhbWVyYS10b29scywgYW5kIG1lZGlhLWxvYWRlciBvYmplY3RzIGF0IHRoZSB0b3AgbGV2ZWwgb2YgdGhlIHNjZW5lXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdLCBhLXNjZW5lID4gW21lZGlhLWxvYWRlcl1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHdhbGsgdGhlIG9iamVjdHMgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lLiAgTXVzdCB3YWl0IGZvciBzY2VuZSB0byBmaW5pc2ggbG9hZGluZ1xuICAgICAgICB0aGlzLnNjZW5lTG9hZGVkID0gdGhpcy5zY2VuZUxvYWRlZC5iaW5kKHRoaXMpXG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMuc2NlbmVMb2FkZWQpO1xuXG4gICAgfSxcblxuICAgIGlzQW5jZXN0b3I6IGZ1bmN0aW9uIChyb290LCBlbnRpdHkpIHtcbiAgICAgICAgd2hpbGUgKGVudGl0eSAmJiAhKGVudGl0eSA9PSByb290KSkge1xuICAgICAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAoZW50aXR5ID09IHJvb3QpO1xuICAgIH0sXG4gICAgXG4gICAgLy8gVGhpbmdzIHdlIGRvbid0IHdhbnQgdG8gaGlkZTpcbiAgICAvLyAtIFt3YXlwb2ludF1cbiAgICAvLyAtIHBhcmVudCBvZiBzb21ldGhpbmcgd2l0aCBbbmF2bWVzaF0gYXMgYSBjaGlsZCAodGhpcyBpcyB0aGUgbmF2aWdhdGlvbiBzdHVmZlxuICAgIC8vIC0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbFxuICAgIC8vIC0gW3NreWJveF1cbiAgICAvLyAtIFtkaXJlY3Rpb25hbC1saWdodF1cbiAgICAvLyAtIFthbWJpZW50LWxpZ2h0XVxuICAgIC8vIC0gW2hlbWlzcGhlcmUtbGlnaHRdXG4gICAgLy8gLSAjQ29tYmluZWRNZXNoXG4gICAgLy8gLSAjc2NlbmUtcHJldmlldy1jYW1lcmEgb3IgW3NjZW5lLXByZXZpZXctY2FtZXJhXVxuICAgIC8vXG4gICAgLy8gd2Ugd2lsbCBkb1xuICAgIC8vIC0gW21lZGlhLWxvYWRlcl1cbiAgICAvLyAtIFtzcG90LWxpZ2h0XVxuICAgIC8vIC0gW3BvaW50LWxpZ2h0XVxuICAgIHNjZW5lTG9hZGVkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGxldCBub2RlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZW52aXJvbm1lbnQtc2NlbmVcIikuY2hpbGRyZW5bMF0uY2hpbGRyZW5bMF1cbiAgICAgICAgLy92YXIgbm9kZXMgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLnBhcmVudEVsLmNoaWxkTm9kZXM7XG4gICAgICAgIGZvciAobGV0IGk9MDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgbm9kZSA9IG5vZGVzW2ldXG4gICAgICAgICAgICAvL2lmIChub2RlID09IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwpIHtjb250aW51ZX1cbiAgICAgICAgICAgIGlmICh0aGlzLmlzQW5jZXN0b3Iobm9kZSwgdGhpcy5lbCkpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNsID0gbm9kZS5jbGFzc05hbWVcbiAgICAgICAgICAgIGlmIChjbCA9PT0gXCJDb21iaW5lZE1lc2hcIiB8fCBjbCA9PT0gXCJzY2VuZS1wcmV2aWV3LWNhbWVyYVwiKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjID0gbm9kZS5jb21wb25lbnRzXG4gICAgICAgICAgICBpZiAoY1tcIndheXBvaW50XCJdIHx8IGNbXCJza3lib3hcIl0gfHwgY1tcImRpcmVjdGlvbmFsLWxpZ2h0XCJdIHx8IGNbXCJhbWJpZW50LWxpZ2h0XCJdIHx8IGNbXCJoZW1pc3BoZXJlLWxpZ2h0XCJdKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjaCA9IG5vZGUuY2hpbGRyZW5cbiAgICAgICAgICAgIHZhciBuYXZtZXNoID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGxldCBqPTA7IGogPCBjaC5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIGlmIChjaFtqXS5jb21wb25lbnRzW1wibmF2bWVzaFwiXSkge1xuICAgICAgICAgICAgICAgICAgICBuYXZtZXNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5hdm1lc2gpIHtjb250aW51ZX1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplLCBkeW5hbWljOiBmYWxzZSB9KVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWxsIG9iamVjdHMgYW5kIGF2YXRhciBzaG91bGQgYmUgc2V0IHVwLCBzbyBsZXRzIG1ha2Ugc3VyZSBhbGwgb2JqZWN0cyBhcmUgY29ycmVjdGx5IHNob3duXG4gICAgICAgIHNob3dIaWRlT2JqZWN0cygpXG4gICAgfSxcblxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5kYXRhLnNpemUgPT09IHRoaXMuc2l6ZSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5zaXplID0gMTBcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IHRoaXMucGFyc2VOb2RlTmFtZSh0aGlzLmRhdGEuc2l6ZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZWwuc2NlbmVFbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiZW52aXJvbm1lbnQtc2NlbmUtbG9hZGVkXCIsIHRoaXMuc2NlbmVMb2FkZWQpO1xuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICAvLyBzaXplID09IDAgaXMgdXNlZCB0byBzaWduYWwgXCJkbyBub3RoaW5nXCJcbiAgICAgICAgaWYgKHRoaXMuc2l6ZSA9PSAwKSB7cmV0dXJufVxuXG4gICAgICAgIC8vIHNlZSBpZiB0aGVyZSBhcmUgbmV3IGF2YXRhcnNcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dOm5vdChbYXZhdGFyLXJlZ2lvbi1mb2xsb3dlcl0pXCIpXG4gICAgICAgIG5vZGVzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gIHNlZSBpZiB0aGVyZSBhcmUgbmV3IGNhbWVyYS10b29scyBvciBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdOm5vdChbb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcl0pXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgXG4gICAgLy8gbmV3U2NlbmU6IGZ1bmN0aW9uKG1vZGVsKSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW52aXJvbm1lbnQgc2NlbmUgbG9hZGVkOiBcIiwgbW9kZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIGFkZFJvb3RFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgYWRkZWQgdG8gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IHJlbW92ZWQgZnJvbSByb290OiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIGFkZFNjZW5lRWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIGVudmlyb25tZW50IHNjZW5lOiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIHJlbW92ZVNjZW5lRWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IHJlbW92ZWQgZnJvbSBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sICBcbiAgICBcbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoc2l6ZSkge1xuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJzaXplXCIgKGFuIGludGVnZXIgbnVtYmVyKVxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuICBUaGlzIHdpbGwgc2V0IHRoZSBoaWRkZXIgY29tcG9uZW50IHRvIFxuICAgICAgICAvLyB1c2UgdGhhdCBzaXplIGluIG1ldGVycyBmb3IgdGhlIHF1YWRyYW50c1xuICAgICAgICB0aGlzLm5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLm5vZGVOYW1lLm1hdGNoKC9fKFswLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMiwgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50TmFtZSBub3QgZm9ybWF0dGVkIGNvcnJlY3RseTogXCIsIHRoaXMubm9kZU5hbWUpXG4gICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG5vZGVTaXplID0gcGFyc2VJbnQocGFyYW1zWzFdKVxuICAgICAgICAgICAgaWYgKCFub2RlU2l6ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzaXplXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBub2RlU2l6ZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSkiLCJsZXQgRGVmYXVsdEhvb2tzID0ge1xuICAgIHZlcnRleEhvb2tzOiB7XG4gICAgICAgIHVuaWZvcm1zOiAnaW5zZXJ0YmVmb3JlOiNpbmNsdWRlIDxjb21tb24+XFxuJyxcbiAgICAgICAgZnVuY3Rpb25zOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGNsaXBwaW5nX3BsYW5lc19wYXJzX3ZlcnRleD5cXG4nLFxuICAgICAgICBwcmVUcmFuc2Zvcm06ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8YmVnaW5fdmVydGV4PlxcbicsXG4gICAgICAgIHBvc3RUcmFuc2Zvcm06ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8cHJvamVjdF92ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcHJlTm9ybWFsOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGJlZ2lubm9ybWFsX3ZlcnRleD5cXG4nXG4gICAgfSxcbiAgICBmcmFnbWVudEhvb2tzOiB7XG4gICAgICAgIHVuaWZvcm1zOiAnaW5zZXJ0YmVmb3JlOiNpbmNsdWRlIDxjb21tb24+XFxuJyxcbiAgICAgICAgZnVuY3Rpb25zOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGNsaXBwaW5nX3BsYW5lc19wYXJzX2ZyYWdtZW50PlxcbicsXG4gICAgICAgIHByZUZyYWdDb2xvcjogJ2luc2VydGJlZm9yZTpnbF9GcmFnQ29sb3IgPSB2ZWM0KCBvdXRnb2luZ0xpZ2h0LCBkaWZmdXNlQ29sb3IuYSApO1xcbicsXG4gICAgICAgIHBvc3RGcmFnQ29sb3I6ICdpbnNlcnRhZnRlcjpnbF9GcmFnQ29sb3IgPSB2ZWM0KCBvdXRnb2luZ0xpZ2h0LCBkaWZmdXNlQ29sb3IuYSApO1xcbicsXG4gICAgICAgIHBvc3RNYXA6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8bWFwX2ZyYWdtZW50PlxcbicsXG4gICAgICAgIHJlcGxhY2VNYXA6ICdyZXBsYWNlOiNpbmNsdWRlIDxtYXBfZnJhZ21lbnQ+XFxuJ1xuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgRGVmYXVsdEhvb2tzIiwiLy8gYmFzZWQgb24gaHR0cHM6Ly9naXRodWIuY29tL2phbWllb3dlbi90aHJlZS1tYXRlcmlhbC1tb2RpZmllclxuXG5pbXBvcnQgZGVmYXVsdEhvb2tzIGZyb20gJy4vZGVmYXVsdEhvb2tzJztcblxuaW50ZXJmYWNlIEV4dGVuZGVkTWF0ZXJpYWwge1xuICAgIHVuaWZvcm1zOiBVbmlmb3JtcztcbiAgICB2ZXJ0ZXhTaGFkZXI6IHN0cmluZztcbiAgICBmcmFnbWVudFNoYWRlcjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2hhZGVyRXh0ZW5zaW9uT3B0cyB7XG4gICAgdW5pZm9ybXM6IHsgW3VuaWZvcm06IHN0cmluZ106IGFueSB9O1xuICAgIHZlcnRleFNoYWRlcjogeyBbcGF0dGVybjogc3RyaW5nXTogc3RyaW5nIH07XG4gICAgZnJhZ21lbnRTaGFkZXI6IHsgW3BhdHRlcm46IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGNsYXNzTmFtZT86IHN0cmluZztcbiAgICBwb3N0TW9kaWZ5VmVydGV4U2hhZGVyPzogKHNoYWRlcjogc3RyaW5nKSA9PiBzdHJpbmc7XG4gICAgcG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyPzogKHNoYWRlcjogc3RyaW5nKSA9PiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTaGFkZXJFeHRlbnNpb24gZXh0ZW5kcyBTaGFkZXJFeHRlbnNpb25PcHRzIHtcbiAgICBpbml0KG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpOiB2b2lkO1xuICAgIHVwZGF0ZVVuaWZvcm1zKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCk6IHZvaWRcbn1cblxuY29uc3QgbW9kaWZ5U291cmNlID0gKCBzb3VyY2U6IHN0cmluZywgaG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSwgaG9va3M6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApPT57XG4gICAgbGV0IG1hdGNoO1xuICAgIGZvciggbGV0IGtleSBpbiBob29rRGVmcyApe1xuICAgICAgICBpZiggaG9va3Nba2V5XSApe1xuICAgICAgICAgICAgbWF0Y2ggPSAvaW5zZXJ0KGJlZm9yZSk6KC4qKXxpbnNlcnQoYWZ0ZXIpOiguKil8KHJlcGxhY2UpOiguKikvLmV4ZWMoIGhvb2tEZWZzW2tleV0gKTtcblxuICAgICAgICAgICAgaWYoIG1hdGNoICl7XG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzFdICl7IC8vIGJlZm9yZVxuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSggbWF0Y2hbMl0sIGhvb2tzW2tleV0gKyAnXFxuJyArIG1hdGNoWzJdICk7XG4gICAgICAgICAgICAgICAgfWVsc2VcbiAgICAgICAgICAgICAgICBpZiggbWF0Y2hbM10gKXsgLy8gYWZ0ZXJcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzRdLCBtYXRjaFs0XSArICdcXG4nICsgaG9va3Nba2V5XSApO1xuICAgICAgICAgICAgICAgIH1lbHNlXG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzVdICl7IC8vIHJlcGxhY2VcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzZdLCBob29rc1trZXldICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHNvdXJjZTtcbn1cblxudHlwZSBVbmlmb3JtcyA9IHtcbiAgICBba2V5OiBzdHJpbmddOiBhbnk7XG59XG5cbi8vIGNvcGllZCBmcm9tIHRocmVlLnJlbmRlcmVycy5zaGFkZXJzLlVuaWZvcm1VdGlscy5qc1xuZXhwb3J0IGZ1bmN0aW9uIGNsb25lVW5pZm9ybXMoIHNyYzogVW5pZm9ybXMgKTogVW5pZm9ybXMge1xuXHR2YXIgZHN0OiBVbmlmb3JtcyA9IHt9O1xuXG5cdGZvciAoIHZhciB1IGluIHNyYyApIHtcblx0XHRkc3RbIHUgXSA9IHt9IDtcblx0XHRmb3IgKCB2YXIgcCBpbiBzcmNbIHUgXSApIHtcblx0XHRcdHZhciBwcm9wZXJ0eSA9IHNyY1sgdSBdWyBwIF07XG5cdFx0XHRpZiAoIHByb3BlcnR5ICYmICggcHJvcGVydHkuaXNDb2xvciB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc01hdHJpeDMgfHwgcHJvcGVydHkuaXNNYXRyaXg0IHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzVmVjdG9yMiB8fCBwcm9wZXJ0eS5pc1ZlY3RvcjMgfHwgcHJvcGVydHkuaXNWZWN0b3I0IHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzVGV4dHVyZSApICkge1xuXHRcdFx0XHQgICAgZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5LmNsb25lKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCBBcnJheS5pc0FycmF5KCBwcm9wZXJ0eSApICkge1xuXHRcdFx0XHRkc3RbIHUgXVsgcCBdID0gcHJvcGVydHkuc2xpY2UoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGRzdDtcbn1cblxudHlwZSBTdXBlckNsYXNzVHlwZXMgPSB0eXBlb2YgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuXG50eXBlIFN1cGVyQ2xhc3NlcyA9IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsIHwgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgfCBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHwgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwgfCBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuXG5pbnRlcmZhY2UgRXh0ZW5zaW9uRGF0YSB7XG4gICAgU2hhZGVyQ2xhc3M6IFN1cGVyQ2xhc3NUeXBlcztcbiAgICBTaGFkZXJMaWI6IFRIUkVFLlNoYWRlcjtcbiAgICBLZXk6IHN0cmluZyxcbiAgICBDb3VudDogbnVtYmVyLFxuICAgIE1vZGlmaWVkTmFtZSgpOiBzdHJpbmcsXG4gICAgVHlwZUNoZWNrOiBzdHJpbmdcbn1cblxubGV0IGNsYXNzTWFwOiB7W25hbWU6IHN0cmluZ106IHN0cmluZzt9ID0ge1xuICAgIE1lc2hTdGFuZGFyZE1hdGVyaWFsOiBcInN0YW5kYXJkXCIsXG4gICAgTWVzaEJhc2ljTWF0ZXJpYWw6IFwiYmFzaWNcIixcbiAgICBNZXNoTGFtYmVydE1hdGVyaWFsOiBcImxhbWJlcnRcIixcbiAgICBNZXNoUGhvbmdNYXRlcmlhbDogXCJwaG9uZ1wiLFxuICAgIE1lc2hEZXB0aE1hdGVyaWFsOiBcImRlcHRoXCIsXG4gICAgc3RhbmRhcmQ6IFwic3RhbmRhcmRcIixcbiAgICBiYXNpYzogXCJiYXNpY1wiLFxuICAgIGxhbWJlcnQ6IFwibGFtYmVydFwiLFxuICAgIHBob25nOiBcInBob25nXCIsXG4gICAgZGVwdGg6IFwiZGVwdGhcIlxufVxuXG5sZXQgc2hhZGVyTWFwOiB7W25hbWU6IHN0cmluZ106IEV4dGVuc2lvbkRhdGE7fVxuXG5jb25zdCBnZXRTaGFkZXJEZWYgPSAoIGNsYXNzT3JTdHJpbmc6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZyApPT57XG5cbiAgICBpZiggIXNoYWRlck1hcCApe1xuXG4gICAgICAgIGxldCBjbGFzc2VzOiB7W25hbWU6IHN0cmluZ106IFN1cGVyQ2xhc3NUeXBlczt9ID0ge1xuICAgICAgICAgICAgc3RhbmRhcmQ6IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsLFxuICAgICAgICAgICAgYmFzaWM6IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsLFxuICAgICAgICAgICAgbGFtYmVydDogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCxcbiAgICAgICAgICAgIHBob25nOiBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCxcbiAgICAgICAgICAgIGRlcHRoOiBUSFJFRS5NZXNoRGVwdGhNYXRlcmlhbFxuICAgICAgICB9XG5cbiAgICAgICAgc2hhZGVyTWFwID0ge307XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGNsYXNzZXMgKXtcbiAgICAgICAgICAgIHNoYWRlck1hcFsga2V5IF0gPSB7XG4gICAgICAgICAgICAgICAgU2hhZGVyQ2xhc3M6IGNsYXNzZXNbIGtleSBdLFxuICAgICAgICAgICAgICAgIFNoYWRlckxpYjogVEhSRUUuU2hhZGVyTGliWyBrZXkgXSxcbiAgICAgICAgICAgICAgICBLZXk6IGtleSxcbiAgICAgICAgICAgICAgICBDb3VudDogMCxcbiAgICAgICAgICAgICAgICBNb2RpZmllZE5hbWU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgTW9kaWZpZWRNZXNoJHsgdGhpcy5LZXlbMF0udG9VcHBlckNhc2UoKSArIHRoaXMuS2V5LnNsaWNlKDEpIH1NYXRlcmlhbF8keyArK3RoaXMuQ291bnQgfWA7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBUeXBlQ2hlY2s6IGBpc01lc2gkeyBrZXlbMF0udG9VcHBlckNhc2UoKSArIGtleS5zbGljZSgxKSB9TWF0ZXJpYWxgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgc2hhZGVyRGVmOiBFeHRlbnNpb25EYXRhIHwgdW5kZWZpbmVkO1xuXG4gICAgaWYgKCB0eXBlb2YgY2xhc3NPclN0cmluZyA9PT0gJ2Z1bmN0aW9uJyApe1xuICAgICAgICBmb3IoIGxldCBrZXkgaW4gc2hhZGVyTWFwICl7XG4gICAgICAgICAgICBpZiggc2hhZGVyTWFwWyBrZXkgXS5TaGFkZXJDbGFzcyA9PT0gY2xhc3NPclN0cmluZyApe1xuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IHNoYWRlck1hcFsga2V5IF07XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbGFzc09yU3RyaW5nID09PSAnc3RyaW5nJykge1xuICAgICAgICBsZXQgbWFwcGVkQ2xhc3NPclN0cmluZyA9IGNsYXNzTWFwWyBjbGFzc09yU3RyaW5nIF1cbiAgICAgICAgc2hhZGVyRGVmID0gc2hhZGVyTWFwWyBtYXBwZWRDbGFzc09yU3RyaW5nIHx8IGNsYXNzT3JTdHJpbmcgXTtcbiAgICB9XG5cbiAgICBpZiggIXNoYWRlckRlZiApe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoICdObyBTaGFkZXIgZm91bmQgdG8gbW9kaWZ5Li4uJyApO1xuICAgIH1cblxuICAgIHJldHVybiBzaGFkZXJEZWY7XG59XG5cbi8qKlxuICogVGhlIG1haW4gTWF0ZXJpYWwgTW9kb2ZpZXJcbiAqL1xuY2xhc3MgTWF0ZXJpYWxNb2RpZmllciB7XG4gICAgX3ZlcnRleEhvb2tzOiB7W3ZlcnRleGhvb2s6IHN0cmluZ106IHN0cmluZ31cbiAgICBfZnJhZ21lbnRIb29rczoge1tmcmFnZW1lbnRob29rOiBzdHJpbmddOiBzdHJpbmd9XG5cbiAgICBjb25zdHJ1Y3RvciggdmVydGV4SG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSwgZnJhZ21lbnRIb29rRGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICl7XG5cbiAgICAgICAgdGhpcy5fdmVydGV4SG9va3MgPSB7fTtcbiAgICAgICAgdGhpcy5fZnJhZ21lbnRIb29rcyA9IHt9O1xuXG4gICAgICAgIGlmKCB2ZXJ0ZXhIb29rRGVmcyApe1xuICAgICAgICAgICAgdGhpcy5kZWZpbmVWZXJ0ZXhIb29rcyggdmVydGV4SG9va0RlZnMgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCBmcmFnbWVudEhvb2tEZWZzICl7XG4gICAgICAgICAgICB0aGlzLmRlZmluZUZyYWdtZW50SG9va3MoIGZyYWdtZW50SG9va0RlZnMgKTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgbW9kaWZ5KCBzaGFkZXI6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZywgb3B0czogU2hhZGVyRXh0ZW5zaW9uT3B0cyApOiBFeHRlbmRlZE1hdGVyaWFsIHtcblxuICAgICAgICBsZXQgZGVmID0gZ2V0U2hhZGVyRGVmKCBzaGFkZXIgKTtcblxuICAgICAgICBsZXQgdmVydGV4U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLnZlcnRleFNoYWRlciwgdGhpcy5fdmVydGV4SG9va3MsIG9wdHMudmVydGV4U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCBmcmFnbWVudFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi5mcmFnbWVudFNoYWRlciwgdGhpcy5fZnJhZ21lbnRIb29rcywgb3B0cy5mcmFnbWVudFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgZGVmLlNoYWRlckxpYi51bmlmb3Jtcywgb3B0cy51bmlmb3JtcyB8fCB7fSApO1xuXG4gICAgICAgIHJldHVybiB7IHZlcnRleFNoYWRlcixmcmFnbWVudFNoYWRlcix1bmlmb3JtcyB9O1xuXG4gICAgfVxuXG4gICAgZXh0ZW5kKCBzaGFkZXI6IFN1cGVyQ2xhc3NlcyB8IHN0cmluZywgb3B0czogU2hhZGVyRXh0ZW5zaW9uT3B0cyApOiB7IG5ldygpOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgfSB7XG5cbiAgICAgICAgbGV0IGRlZiA9IGdldFNoYWRlckRlZiggc2hhZGVyICk7IC8vIEFESlVTVCBUSElTIFNIQURFUiBERUYgLSBPTkxZIERFRklORSBPTkNFIC0gQU5EIFNUT1JFIEEgVVNFIENPVU5UIE9OIEVYVEVOREVEIFZFUlNJT05TLlxuXG4gICAgICAgIGxldCB2ZXJ0ZXhTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIudmVydGV4U2hhZGVyLCB0aGlzLl92ZXJ0ZXhIb29rcywgb3B0cy52ZXJ0ZXhTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IGZyYWdtZW50U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLmZyYWdtZW50U2hhZGVyLCB0aGlzLl9mcmFnbWVudEhvb2tzLCBvcHRzLmZyYWdtZW50U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBkZWYuU2hhZGVyTGliLnVuaWZvcm1zLCBvcHRzLnVuaWZvcm1zIHx8IHt9ICk7XG5cbiAgICAgICAgbGV0IENsYXNzTmFtZSA9IG9wdHMuY2xhc3NOYW1lIHx8IGRlZi5Nb2RpZmllZE5hbWUoKTtcblxuICAgICAgICBsZXQgZXh0ZW5kTWF0ZXJpYWwgPSBuZXcgRnVuY3Rpb24oICdCYXNlQ2xhc3MnLCAndW5pZm9ybXMnLCAndmVydGV4U2hhZGVyJywgJ2ZyYWdtZW50U2hhZGVyJywgJ2Nsb25lVW5pZm9ybXMnLGBcblxuICAgICAgICAgICAgdmFyIGNscyA9IGZ1bmN0aW9uICR7Q2xhc3NOYW1lfSggcGFyYW1zICl7XG5cbiAgICAgICAgICAgICAgICBCYXNlQ2xhc3MuY2FsbCggdGhpcywgcGFyYW1zICk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1zID0gY2xvbmVVbmlmb3JtcyggdW5pZm9ybXMgKTtcblxuICAgICAgICAgICAgICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0VmFsdWVzKCBwYXJhbXMgKTtcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjbHMucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSggQmFzZUNsYXNzLnByb3RvdHlwZSApO1xuICAgICAgICAgICAgY2xzLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGNscztcbiAgICAgICAgICAgIGNscy5wcm90b3R5cGUuJHsgZGVmLlR5cGVDaGVjayB9ID0gdHJ1ZTtcblxuICAgICAgICAgICAgY2xzLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24oIHNvdXJjZSApe1xuXG4gICAgICAgICAgICAgICAgQmFzZUNsYXNzLnByb3RvdHlwZS5jb3B5LmNhbGwoIHRoaXMsIHNvdXJjZSApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy51bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBzb3VyY2UudW5pZm9ybXMgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRleFNoYWRlciA9IHZlcnRleFNoYWRlcjtcbiAgICAgICAgICAgICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gY2xzO1xuXG4gICAgICAgIGApO1xuXG4gICAgICAgIGlmKCBvcHRzLnBvc3RNb2RpZnlWZXJ0ZXhTaGFkZXIgKXtcbiAgICAgICAgICAgIHZlcnRleFNoYWRlciA9IG9wdHMucG9zdE1vZGlmeVZlcnRleFNoYWRlciggdmVydGV4U2hhZGVyICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYoIG9wdHMucG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyICl7XG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlciA9IG9wdHMucG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyKCBmcmFnbWVudFNoYWRlciApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGV4dGVuZE1hdGVyaWFsKCBkZWYuU2hhZGVyQ2xhc3MsIHVuaWZvcm1zLCB2ZXJ0ZXhTaGFkZXIsIGZyYWdtZW50U2hhZGVyLCBjbG9uZVVuaWZvcm1zICk7XG5cbiAgICB9XG5cbiAgICBkZWZpbmVWZXJ0ZXhIb29rcyggZGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICl7XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGRlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuX3ZlcnRleEhvb2tzWyBrZXkgXSA9IGRlZnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgZGVmaW5lRnJhZ21lbnRIb29rcyggZGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmcgfSApIHtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gZGVmcyApe1xuICAgICAgICAgICAgdGhpcy5fZnJhZ21lbnRIb29rc1sga2V5IF0gPSBkZWZzW2tleV07XG4gICAgICAgIH1cblxuICAgIH1cblxufVxuXG5sZXQgZGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgPSBuZXcgTWF0ZXJpYWxNb2RpZmllciggZGVmYXVsdEhvb2tzLnZlcnRleEhvb2tzLCBkZWZhdWx0SG9va3MuZnJhZ21lbnRIb29rcyApO1xuXG5leHBvcnQgeyBFeHRlbmRlZE1hdGVyaWFsLCBNYXRlcmlhbE1vZGlmaWVyLCBTaGFkZXJFeHRlbnNpb24sIFNoYWRlckV4dGVuc2lvbk9wdHMsIGRlZmF1bHRNYXRlcmlhbE1vZGlmaWVyICBhcyBEZWZhdWx0TWF0ZXJpYWxNb2RpZmllcn0iLCJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxuICAgICAgICAvLyBhYm92ZSBoZXJlLCB0aGUgdGV4dHVyZSBsb29rdXAgd2lsbCBiZSBkb25lLCB3aGljaCB3ZVxuICAgICAgICAvLyBjYW4gZGlzYWJsZSBieSByZW1vdmluZyB0aGUgbWFwIGZyb20gdGhlIG1hdGVyaWFsXG4gICAgICAgIC8vIGJ1dCBpZiB3ZSBsZWF2ZSBpdCwgd2UgY2FuIGFsc28gY2hvb3NlIHRoZSBibGVuZCB0aGUgdGV4dHVyZVxuICAgICAgICAvLyB3aXRoIG91ciBzaGFkZXIgY3JlYXRlZCBjb2xvciwgb3IgdXNlIGl0IGluIHRoZSBzaGFkZXIgb3JcbiAgICAgICAgLy8gd2hhdGV2ZXJcbiAgICAgICAgLy9cbiAgICAgICAgLy8gdmVjNCB0ZXhlbENvbG9yID0gdGV4dHVyZTJEKCBtYXAsIHZVdiApO1xuICAgICAgICAvLyB0ZXhlbENvbG9yID0gbWFwVGV4ZWxUb0xpbmVhciggdGV4ZWxDb2xvciApO1xuICAgICAgICBcbiAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgICAgICAgXG4gICAgICAgIHZlYzQgc2hhZGVyQ29sb3I7XG4gICAgICAgIG1haW5JbWFnZShzaGFkZXJDb2xvciwgdXYueHkgKiBpUmVzb2x1dGlvbi54eSk7XG4gICAgICAgIHNoYWRlckNvbG9yID0gbWFwVGV4ZWxUb0xpbmVhciggc2hhZGVyQ29sb3IgKTtcblxuICAgICAgICBkaWZmdXNlQ29sb3IgKj0gc2hhZGVyQ29sb3I7XG5gO1xuIiwiZXhwb3J0IGRlZmF1bHQge1xuICAgIGlUaW1lOiB7IHZhbHVlOiAwLjAgfSxcbiAgICBpUmVzb2x1dGlvbjogIHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IzKDUxMiwgNTEyLCAxKSB9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH1cbn07IiwiZXhwb3J0IGRlZmF1bHQgLyogZ2xzbCAqL2BcbnVuaWZvcm0gdmVjMyBpUmVzb2x1dGlvbjtcbnVuaWZvcm0gZmxvYXQgaVRpbWU7XG51bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xudW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbnVuaWZvcm0gaW50IHRleEZsaXBZOyBcbiAgYDtcbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2E0NDhlMzRiODEzNmZhZTUucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBiYXllckltYWdlIGZyb20gJy4uL2Fzc2V0cy9iYXllci5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgYmF5ZXJUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChiYXllckltYWdlLCAoYmF5ZXIpID0+IHtcbiAgICBiYXllci5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJheWVyLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmF5ZXIud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYXllci53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJheWVyVGV4ID0gYmF5ZXJcbn0pXG5cbmxldCBCbGVlcHlCbG9ja3NTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuXG4gIHZlcnRleFNoYWRlcjoge30sXG5cbiAgZnJhZ21lbnRTaGFkZXI6IHsgXG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgLy8gQnkgRGFlZGVsdXM6IGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdXNlci9EYWVkZWx1c1xuICAgICAgLy8gbGljZW5zZTogQ3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbi1Ob25Db21tZXJjaWFsLVNoYXJlQWxpa2UgMy4wIFVucG9ydGVkIExpY2Vuc2UuXG4gICAgICAjZGVmaW5lIFRJTUVTQ0FMRSAwLjI1IFxuICAgICAgI2RlZmluZSBUSUxFUyA4XG4gICAgICAjZGVmaW5lIENPTE9SIDAuNywgMS42LCAyLjhcblxuICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAge1xuICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgICAgIHV2LnggKj0gaVJlc29sdXRpb24ueCAvIGlSZXNvbHV0aW9uLnk7XG4gICAgICAgIFxuICAgICAgICB2ZWM0IG5vaXNlID0gdGV4dHVyZTJEKGlDaGFubmVsMCwgZmxvb3IodXYgKiBmbG9hdChUSUxFUykpIC8gZmxvYXQoVElMRVMpKTtcbiAgICAgICAgZmxvYXQgcCA9IDEuMCAtIG1vZChub2lzZS5yICsgbm9pc2UuZyArIG5vaXNlLmIgKyBpVGltZSAqIGZsb2F0KFRJTUVTQ0FMRSksIDEuMCk7XG4gICAgICAgIHAgPSBtaW4obWF4KHAgKiAzLjAgLSAxLjgsIDAuMSksIDIuMCk7XG4gICAgICAgIFxuICAgICAgICB2ZWMyIHIgPSBtb2QodXYgKiBmbG9hdChUSUxFUyksIDEuMCk7XG4gICAgICAgIHIgPSB2ZWMyKHBvdyhyLnggLSAwLjUsIDIuMCksIHBvdyhyLnkgLSAwLjUsIDIuMCkpO1xuICAgICAgICBwICo9IDEuMCAtIHBvdyhtaW4oMS4wLCAxMi4wICogZG90KHIsIHIpKSwgMi4wKTtcbiAgICAgICAgXG4gICAgICAgIGZyYWdDb2xvciA9IHZlYzQoQ09MT1IsIDEuMCkgKiBwO1xuICAgICAgfVxuICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gYmF5ZXJUZXhcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gYmF5ZXJUZXhcbiAgICB9XG5cbn1cbmV4cG9ydCB7IEJsZWVweUJsb2Nrc1NoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IE5vaXNlU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAjZGVmaW5lIG5QSSAzLjE0MTU5MjY1MzU4OTc5MzJcblxuICAgICAgICBtYXQyIG5fcm90YXRlMmQoZmxvYXQgYW5nbGUpe1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXQyKGNvcyhhbmdsZSksLXNpbihhbmdsZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luKGFuZ2xlKSwgY29zKGFuZ2xlKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG5fc3RyaXBlKGZsb2F0IG51bWJlcikge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1vZCA9IG1vZChudW1iZXIsIDIuMCk7XG4gICAgICAgICAgICAgICAgLy9yZXR1cm4gc3RlcCgwLjUsIG1vZCkqc3RlcCgxLjUsIG1vZCk7XG4gICAgICAgICAgICAgICAgLy9yZXR1cm4gbW9kLTEuMDtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWluKDEuMCwgKHNtb290aHN0ZXAoMC4wLCAwLjUsIG1vZCkgLSBzbW9vdGhzdGVwKDAuNSwgMS4wLCBtb2QpKSoxLjApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApIHtcbiAgICAgICAgICAgICAgICB2ZWMyIHVfcmVzb2x1dGlvbiA9IGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgICAgIGZsb2F0IHVfdGltZSA9IGlUaW1lO1xuICAgICAgICAgICAgICAgIHZlYzMgY29sb3I7XG4gICAgICAgICAgICAgICAgdmVjMiBzdCA9IGZyYWdDb29yZC54eTtcbiAgICAgICAgICAgICAgICBzdCArPSAyMDAwLjAgKyA5OTgwMDAuMCpzdGVwKDEuNzUsIDEuMC1zaW4odV90aW1lLzguMCkpO1xuICAgICAgICAgICAgICAgIHN0ICs9IHVfdGltZS8yMDAwLjA7XG4gICAgICAgICAgICAgICAgZmxvYXQgbSA9ICgxLjArOS4wKnN0ZXAoMS4wLCAxLjAtc2luKHVfdGltZS84LjApKSkvKDEuMCs5LjAqc3RlcCgxLjAsIDEuMC1zaW4odV90aW1lLzE2LjApKSk7XG4gICAgICAgICAgICAgICAgdmVjMiBzdDEgPSBzdCAqICg0MDAuMCArIDEyMDAuMCpzdGVwKDEuNzUsIDEuMCtzaW4odV90aW1lKSkgLSAzMDAuMCpzdGVwKDEuNSwgMS4wK3Npbih1X3RpbWUvMy4wKSkpO1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZChzaW4oc3QxLngpKnNpbihzdDEueSkvKG0qMTAwLjArdV90aW1lLzEwMC4wKSkgKiBzdDtcbiAgICAgICAgICAgICAgICB2ZWMyIHN0MiA9IHN0ICogKDEwMC4wICsgMTkwMC4wKnN0ZXAoMS43NSwgMS4wLXNpbih1X3RpbWUvMi4wKSkpO1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZChjb3Moc3QyLngpKmNvcyhzdDIueSkvKG0qMTAwLjArdV90aW1lLzEwMC4wKSkgKiBzdDtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoMC41Km5QSSsoblBJKjAuNSpzdGVwKCAxLjAsMS4wKyBzaW4odV90aW1lLzEuMCkpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyhuUEkqMC4xKnN0ZXAoIDEuMCwxLjArIGNvcyh1X3RpbWUvMi4wKSkpK3VfdGltZSowLjAwMDEpICogc3Q7XG4gICAgICAgICAgICAgICAgc3QgKj0gMTAuMDtcbiAgICAgICAgICAgICAgICBzdCAvPSB1X3Jlc29sdXRpb247XG4gICAgICAgICAgICAgICAgY29sb3IgPSB2ZWMzKG5fc3RyaXBlKHN0LngqdV9yZXNvbHV0aW9uLngvMTAuMCt1X3RpbWUvMTAuMCkpO1xuICAgICAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBOb2lzZVNoYWRlciB9XG4iLCIvLyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9YZHNCREJcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxubGV0IExpcXVpZE1hcmJsZVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgIC8vLy8gQ09MT1JTIC8vLy9cblxuICAgICAgY29uc3QgdmVjMyBPUkFOR0UgPSB2ZWMzKDEuMCwgMC42LCAwLjIpO1xuICAgICAgY29uc3QgdmVjMyBQSU5LICAgPSB2ZWMzKDAuNywgMC4xLCAwLjQpOyBcbiAgICAgIGNvbnN0IHZlYzMgQkxVRSAgID0gdmVjMygwLjAsIDAuMiwgMC45KTsgXG4gICAgICBjb25zdCB2ZWMzIEJMQUNLICA9IHZlYzMoMC4wLCAwLjAsIDAuMik7XG4gICAgICBcbiAgICAgIC8vLy8vIE5PSVNFIC8vLy8vXG4gICAgICBcbiAgICAgIGZsb2F0IGhhc2goIGZsb2F0IG4gKSB7XG4gICAgICAgICAgLy9yZXR1cm4gZnJhY3Qoc2luKG4pKjQzNzU4LjU0NTMxMjMpOyAgIFxuICAgICAgICAgIHJldHVybiBmcmFjdChzaW4obikqNzU3MjguNTQ1MzEyMyk7IFxuICAgICAgfVxuICAgICAgXG4gICAgICBcbiAgICAgIGZsb2F0IG5vaXNlKCBpbiB2ZWMyIHggKSB7XG4gICAgICAgICAgdmVjMiBwID0gZmxvb3IoeCk7XG4gICAgICAgICAgdmVjMiBmID0gZnJhY3QoeCk7XG4gICAgICAgICAgZiA9IGYqZiooMy4wLTIuMCpmKTtcbiAgICAgICAgICBmbG9hdCBuID0gcC54ICsgcC55KjU3LjA7XG4gICAgICAgICAgcmV0dXJuIG1peChtaXgoIGhhc2gobiArIDAuMCksIGhhc2gobiArIDEuMCksIGYueCksIG1peChoYXNoKG4gKyA1Ny4wKSwgaGFzaChuICsgNTguMCksIGYueCksIGYueSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vLy8vLyBGQk0gLy8vLy8vIFxuICAgICAgXG4gICAgICBtYXQyIG0gPSBtYXQyKCAwLjYsIDAuNiwgLTAuNiwgMC44KTtcbiAgICAgIGZsb2F0IGZibSh2ZWMyIHApe1xuICAgICAgIFxuICAgICAgICAgIGZsb2F0IGYgPSAwLjA7XG4gICAgICAgICAgZiArPSAwLjUwMDAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMjtcbiAgICAgICAgICBmICs9IDAuMjUwMCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAzO1xuICAgICAgICAgIGYgKz0gMC4xMjUwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDE7XG4gICAgICAgICAgZiArPSAwLjA2MjUgKiBub2lzZShwKTsgcCAqPSBtICogMi4wNDtcbiAgICAgICAgICBmIC89IDAuOTM3NTtcbiAgICAgICAgICByZXR1cm4gZjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgICB2b2lkIG1haW5JbWFnZShvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkKXtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBwaXhlbCByYXRpb1xuICAgICAgICAgIFxuICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eSA7ICBcbiAgICAgICAgICB2ZWMyIHAgPSAtIDEuICsgMi4gKiB1djtcbiAgICAgICAgICBwLnggKj0gaVJlc29sdXRpb24ueCAvIGlSZXNvbHV0aW9uLnk7XG4gICAgICAgICAgIFxuICAgICAgICAgIC8vIGRvbWFpbnNcbiAgICAgICAgICBcbiAgICAgICAgICBmbG9hdCByID0gc3FydChkb3QocCxwKSk7IFxuICAgICAgICAgIGZsb2F0IGEgPSBjb3MocC55ICogcC54KTsgIFxuICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAvLyBkaXN0b3J0aW9uXG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgZiA9IGZibSggNS4wICogcCk7XG4gICAgICAgICAgYSArPSBmYm0odmVjMigxLjkgLSBwLngsIDAuOSAqIGlUaW1lICsgcC55KSk7XG4gICAgICAgICAgYSArPSBmYm0oMC40ICogcCk7XG4gICAgICAgICAgciArPSBmYm0oMi45ICogcCk7XG4gICAgICAgICAgICAgXG4gICAgICAgICAgLy8gY29sb3JpemVcbiAgICAgICAgICBcbiAgICAgICAgICB2ZWMzIGNvbCA9IEJMVUU7XG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKC0wLjQsIDEuMSwgbm9pc2UodmVjMigwLjUgKiBhLCAzLjMgKiBhKSkgKTsgICAgICAgIFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgT1JBTkdFLCBmZik7XG4gICAgICAgICAgICAgXG4gICAgICAgICAgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKC4wLCAyLjgsIHIgKTtcbiAgICAgICAgICBjb2wgKz0gIG1peCggY29sLCBCTEFDSywgIGZmKTtcbiAgICAgICAgICBcbiAgICAgICAgICBmZiAtPSAxLjAgLSBzbW9vdGhzdGVwKDAuMywgMC41LCBmYm0odmVjMigxLjAsIDQwLjAgKiBhKSkgKTsgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBQSU5LLCAgZmYpOyAgXG4gICAgICAgICAgICBcbiAgICAgICAgICBmZiA9IDEuMCAtIHNtb290aHN0ZXAoMi4sIDIuOSwgYSAqIDEuNSApOyBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIEJMQUNLLCAgZmYpOyAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChjb2wsIDEuKTtcbiAgICAgIH1cbiAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIobWF0Lm1hcC5vZmZzZXQueCsgTWF0aC5yYW5kb20oKSwgbWF0Lm1hcC5vZmZzZXQueCsgTWF0aC5yYW5kb20oKSkgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICB9XG59XG5cbmV4cG9ydCB7IExpcXVpZE1hcmJsZVNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9jZWNlZmI1MGU0MDhkMTA1LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc2xHV05cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBHYWxheHlTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvL0NCU1xuICAgICAgICAvL1BhcmFsbGF4IHNjcm9sbGluZyBmcmFjdGFsIGdhbGF4eS5cbiAgICAgICAgLy9JbnNwaXJlZCBieSBKb3NoUCdzIFNpbXBsaWNpdHkgc2hhZGVyOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvbHNsR1dyXG4gICAgICAgIFxuICAgICAgICAvLyBodHRwOi8vd3d3LmZyYWN0YWxmb3J1bXMuY29tL25ldy10aGVvcmllcy1hbmQtcmVzZWFyY2gvdmVyeS1zaW1wbGUtZm9ybXVsYS1mb3ItZnJhY3RhbC1wYXR0ZXJucy9cbiAgICAgICAgZmxvYXQgZmllbGQoaW4gdmVjMyBwLGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMjY7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExlc3MgaXRlcmF0aW9ucyBmb3Igc2Vjb25kIGxheWVyXG4gICAgICAgIGZsb2F0IGZpZWxkMihpbiB2ZWMzIHAsIGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMTg7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbnJhbmQzKCB2ZWMyIGNvIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBhID0gZnJhY3QoIGNvcyggY28ueCo4LjNlLTMgKyBjby55ICkqdmVjMygxLjNlNSwgNC43ZTUsIDIuOWU1KSApO1xuICAgICAgICAgICAgdmVjMyBiID0gZnJhY3QoIHNpbiggY28ueCowLjNlLTMgKyBjby55ICkqdmVjMyg4LjFlNSwgMS4wZTUsIDAuMWU1KSApO1xuICAgICAgICAgICAgdmVjMyBjID0gbWl4KGEsIGIsIDAuNSk7XG4gICAgICAgICAgICByZXR1cm4gYztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkICkge1xuICAgICAgICAgICAgdmVjMiB1diA9IDIuICogZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHkgLSAxLjtcbiAgICAgICAgICAgIHZlYzIgdXZzID0gdXYgKiBpUmVzb2x1dGlvbi54eSAvIG1heChpUmVzb2x1dGlvbi54LCBpUmVzb2x1dGlvbi55KTtcbiAgICAgICAgICAgIHZlYzMgcCA9IHZlYzModXZzIC8gNC4sIDApICsgdmVjMygxLiwgLTEuMywgMC4pO1xuICAgICAgICAgICAgcCArPSAuMiAqIHZlYzMoc2luKGlUaW1lIC8gMTYuKSwgc2luKGlUaW1lIC8gMTIuKSwgIHNpbihpVGltZSAvIDEyOC4pKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZnJlcXNbNF07XG4gICAgICAgICAgICAvL1NvdW5kXG4gICAgICAgICAgICBmcmVxc1swXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4wMSwgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzFdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjA3LCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbMl0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMTUsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1szXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4zMCwgMC4yNSApICkueDtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0ID0gZmllbGQocCxmcmVxc1syXSk7XG4gICAgICAgICAgICBmbG9hdCB2ID0gKDEuIC0gZXhwKChhYnModXYueCkgLSAxLikgKiA2LikpICogKDEuIC0gZXhwKChhYnModXYueSkgLSAxLikgKiA2LikpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1NlY29uZCBMYXllclxuICAgICAgICAgICAgdmVjMyBwMiA9IHZlYzModXZzIC8gKDQuK3NpbihpVGltZSowLjExKSowLjIrMC4yK3NpbihpVGltZSowLjE1KSowLjMrMC40KSwgMS41KSArIHZlYzMoMi4sIC0xLjMsIC0xLik7XG4gICAgICAgICAgICBwMiArPSAwLjI1ICogdmVjMyhzaW4oaVRpbWUgLyAxNi4pLCBzaW4oaVRpbWUgLyAxMi4pLCAgc2luKGlUaW1lIC8gMTI4LikpO1xuICAgICAgICAgICAgZmxvYXQgdDIgPSBmaWVsZDIocDIsZnJlcXNbM10pO1xuICAgICAgICAgICAgdmVjNCBjMiA9IG1peCguNCwgMS4sIHYpICogdmVjNCgxLjMgKiB0MiAqIHQyICogdDIgLDEuOCAgKiB0MiAqIHQyICwgdDIqIGZyZXFzWzBdLCB0Mik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9MZXQncyBhZGQgc29tZSBzdGFyc1xuICAgICAgICAgICAgLy9UaGFua3MgdG8gaHR0cDovL2dsc2wuaGVyb2t1LmNvbS9lIzY5MDQuMFxuICAgICAgICAgICAgdmVjMiBzZWVkID0gcC54eSAqIDIuMDtcdFxuICAgICAgICAgICAgc2VlZCA9IGZsb29yKHNlZWQgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kID0gbnJhbmQzKCBzZWVkICk7XG4gICAgICAgICAgICB2ZWM0IHN0YXJjb2xvciA9IHZlYzQocG93KHJuZC55LDQwLjApKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9TZWNvbmQgTGF5ZXJcbiAgICAgICAgICAgIHZlYzIgc2VlZDIgPSBwMi54eSAqIDIuMDtcbiAgICAgICAgICAgIHNlZWQyID0gZmxvb3Ioc2VlZDIgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kMiA9IG5yYW5kMyggc2VlZDIgKTtcbiAgICAgICAgICAgIHN0YXJjb2xvciArPSB2ZWM0KHBvdyhybmQyLnksNDAuMCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmcmFnQ29sb3IgPSBtaXgoZnJlcXNbM10tLjMsIDEuLCB2KSAqIHZlYzQoMS41KmZyZXFzWzJdICogdCAqIHQqIHQgLCAxLjIqZnJlcXNbMV0gKiB0ICogdCwgZnJlcXNbM10qdCwgMS4wKStjMitzdGFyY29sb3I7XG4gICAgICAgIH1cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IEdhbGF4eVNoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzRzR1N6Y1xuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcblxubGV0IExhY2VUdW5uZWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBDcmVhdGVkIGJ5IFN0ZXBoYW5lIEN1aWxsZXJkaWVyIC0gQWlla2ljay8yMDE1ICh0d2l0dGVyOkBhaWVraWNrKVxuICAgICAgICAvLyBMaWNlbnNlIENyZWF0aXZlIENvbW1vbnMgQXR0cmlidXRpb24tTm9uQ29tbWVyY2lhbC1TaGFyZUFsaWtlIDMuMCBVbnBvcnRlZCBMaWNlbnNlLlxuICAgICAgICAvLyBUdW5lZCB2aWEgWFNoYWRlIChodHRwOi8vd3d3LmZ1bnBhcmFkaWdtLmNvbS94c2hhZGUvKVxuICAgICAgICBcbiAgICAgICAgdmVjMiBsdF9tbyA9IHZlYzIoMCk7XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBsdF9wbiggaW4gdmVjMyB4ICkgLy8gaXEgbm9pc2VcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBwID0gZmxvb3IoeCk7XG4gICAgICAgICAgICB2ZWMzIGYgPSBmcmFjdCh4KTtcbiAgICAgICAgICAgIGYgPSBmKmYqKDMuMC0yLjAqZik7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gKHAueHkrdmVjMigzNy4wLDE3LjApKnAueikgKyBmLnh5O1xuICAgICAgICAgICAgdmVjMiByZyA9IHRleHR1cmUoaUNoYW5uZWwwLCAodXYrIDAuNSkvMjU2LjAsIC0xMDAuMCApLnl4O1xuICAgICAgICAgICAgcmV0dXJuIC0xLjArMi40Km1peCggcmcueCwgcmcueSwgZi56ICk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzIgbHRfcGF0aChmbG9hdCB0KVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gdmVjMihjb3ModCowLjIpLCBzaW4odCowLjIpKSAqIDIuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXQzIGx0X214ID0gbWF0MygxLDAsMCwwLDcsMCwwLDAsNyk7XG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXkgPSBtYXQzKDcsMCwwLDAsMSwwLDAsMCw3KTtcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teiA9IG1hdDMoNywwLDAsMCw3LDAsMCwwLDEpO1xuICAgICAgICBcbiAgICAgICAgLy8gYmFzZSBvbiBzaGFuZSB0ZWNoIGluIHNoYWRlciA6IE9uZSBUd2VldCBDZWxsdWxhciBQYXR0ZXJuXG4gICAgICAgIGZsb2F0IGx0X2Z1bmModmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwID0gZnJhY3QocC82OC42KSAtIC41O1xuICAgICAgICAgICAgcmV0dXJuIG1pbihtaW4oYWJzKHAueCksIGFicyhwLnkpKSwgYWJzKHAueikpICsgMC4xO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X2VmZmVjdCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAgKj0gbHRfbXogKiBsdF9teCAqIGx0X215ICogc2luKHAuenh5KTsgLy8gc2luKHAuenh5KSBpcyBiYXNlZCBvbiBpcSB0ZWNoIGZyb20gc2hhZGVyIChTY3VscHR1cmUgSUlJKVxuICAgICAgICAgICAgcmV0dXJuIHZlYzMobWluKG1pbihsdF9mdW5jKHAqbHRfbXgpLCBsdF9mdW5jKHAqbHRfbXkpKSwgbHRfZnVuYyhwKmx0X216KSkvLjYpO1xuICAgICAgICB9XG4gICAgICAgIC8vXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2Rpc3BsYWNlbWVudCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgY29sID0gMS4tbHRfZWZmZWN0KHAqMC44KTtcbiAgICAgICAgICAgICAgIGNvbCA9IGNsYW1wKGNvbCwgLS41LCAxLik7XG4gICAgICAgICAgICBmbG9hdCBkaXN0ID0gZG90KGNvbCx2ZWMzKDAuMDIzKSk7XG4gICAgICAgICAgICBjb2wgPSBzdGVwKGNvbCwgdmVjMygwLjgyKSk7Ly8gYmxhY2sgbGluZSBvbiBzaGFwZVxuICAgICAgICAgICAgcmV0dXJuIHZlYzQoZGlzdCxjb2wpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X21hcCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAueHkgLT0gbHRfcGF0aChwLnopO1xuICAgICAgICAgICAgdmVjNCBkaXNwID0gbHRfZGlzcGxhY2VtZW50KHNpbihwLnp4eSoyLikqMC44KTtcbiAgICAgICAgICAgIHAgKz0gc2luKHAuenh5Ki41KSoxLjU7XG4gICAgICAgICAgICBmbG9hdCBsID0gbGVuZ3RoKHAueHkpIC0gNC47XG4gICAgICAgICAgICByZXR1cm4gdmVjNChtYXgoLWwgKyAwLjA5LCBsKSAtIGRpc3AueCwgZGlzcC55encpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X25vciggaW4gdmVjMyBwb3MsIGZsb2F0IHByZWMgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGVwcyA9IHZlYzMoIHByZWMsIDAuLCAwLiApO1xuICAgICAgICAgICAgdmVjMyBsdF9ub3IgPSB2ZWMzKFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnh5eSkueCAtIGx0X21hcChwb3MtZXBzLnh5eSkueCxcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy55eHkpLnggLSBsdF9tYXAocG9zLWVwcy55eHkpLngsXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueXl4KS54IC0gbHRfbWFwKHBvcy1lcHMueXl4KS54ICk7XG4gICAgICAgICAgICByZXR1cm4gbm9ybWFsaXplKGx0X25vcik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2xpZ2h0KHZlYzMgcm8sIHZlYzMgcmQsIGZsb2F0IGQsIHZlYzMgbGlnaHRwb3MsIHZlYzMgbGMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgcCA9IHJvICsgcmQgKiBkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBvcmlnaW5hbCBub3JtYWxlXG4gICAgICAgICAgICB2ZWMzIG4gPSBsdF9ub3IocCwgMC4xKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBsaWdodGRpciA9IGxpZ2h0cG9zIC0gcDtcbiAgICAgICAgICAgIGZsb2F0IGxpZ2h0bGVuID0gbGVuZ3RoKGxpZ2h0cG9zIC0gcCk7XG4gICAgICAgICAgICBsaWdodGRpciAvPSBsaWdodGxlbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYW1iID0gMC42O1xuICAgICAgICAgICAgZmxvYXQgZGlmZiA9IGNsYW1wKCBkb3QoIG4sIGxpZ2h0ZGlyICksIDAuMCwgMS4wICk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGJyZGYgPSB2ZWMzKDApO1xuICAgICAgICAgICAgYnJkZiArPSBhbWIgKiB2ZWMzKDAuMiwwLjUsMC4zKTsgLy8gY29sb3IgbWF0XG4gICAgICAgICAgICBicmRmICs9IGRpZmYgKiAwLjY7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZGYgPSBtaXgoYnJkZiwgbHRfbWFwKHApLnl6dywgMC41KTsvLyBtZXJnZSBsaWdodCBhbmQgYmxhY2sgbGluZSBwYXR0ZXJuXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdmVjNChicmRmLCBsaWdodGxlbik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfc3RhcnModmVjMiB1diwgdmVjMyByZCwgZmxvYXQgZCwgdmVjMiBzLCB2ZWMyIGcpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHV2ICo9IDgwMC4gKiBzLngvcy55O1xuICAgICAgICAgICAgZmxvYXQgayA9IGZyYWN0KCBjb3ModXYueSAqIDAuMDAwMSArIHV2LngpICogOTAwMDAuKTtcbiAgICAgICAgICAgIGZsb2F0IHZhciA9IHNpbihsdF9wbihkKjAuNityZCoxODIuMTQpKSowLjUrMC41Oy8vIHRoYW5rIHRvIGtsZW1zIGZvciB0aGUgdmFyaWF0aW9uIGluIG15IHNoYWRlciBzdWJsdW1pbmljXG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHZlYzMobWl4KDAuLCAxLiwgdmFyKnBvdyhrLCAyMDAuKSkpOy8vIGNvbWUgZnJvbSBDQlMgU2hhZGVyIFwiU2ltcGxpY2l0eVwiIDogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zbEdXTlxuICAgICAgICAgICAgcmV0dXJuIGNvbDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8vLy8vLy9NQUlOLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgcyA9IGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgdmVjMiBnID0gZnJhZ0Nvb3JkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdGltZSA9IGlUaW1lKjEuMDtcbiAgICAgICAgICAgIGZsb2F0IGNhbV9hID0gdGltZTsgLy8gYW5nbGUgelxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBjYW1fZSA9IDMuMjsgLy8gZWxldmF0aW9uXG4gICAgICAgICAgICBmbG9hdCBjYW1fZCA9IDQuOyAvLyBkaXN0YW5jZSB0byBvcmlnaW4gYXhpc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBtYXhkID0gNDAuOyAvLyByYXkgbWFyY2hpbmcgZGlzdGFuY2UgbWF4XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgdXYgPSAoZyoyLi1zKS9zLnk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY29sID0gdmVjMygwLik7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyBybyA9IHZlYzMobHRfcGF0aCh0aW1lKStsdF9tbyx0aW1lKTtcbiAgICAgICAgICAgICAgdmVjMyBjdiA9IHZlYzMobHRfcGF0aCh0aW1lKzAuMSkrbHRfbW8sdGltZSswLjEpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1PXZlYzMoMCwxLDApO1xuICAgICAgICAgICAgICB2ZWMzIHJvdiA9IG5vcm1hbGl6ZShjdi1ybyk7XG4gICAgICAgICAgICB2ZWMzIHUgPSBub3JtYWxpemUoY3Jvc3MoY3Uscm92KSk7XG4gICAgICAgICAgICAgIHZlYzMgdiA9IGNyb3NzKHJvdix1KTtcbiAgICAgICAgICAgICAgdmVjMyByZCA9IG5vcm1hbGl6ZShyb3YgKyB1di54KnUgKyB1di55KnYpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1cnZlMCA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMSA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMiA9IHZlYzMoMCk7XG4gICAgICAgICAgICBmbG9hdCBvdXRTdGVwID0gMC47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGFvID0gMC47IC8vIGFvIGxvdyBjb3N0IDopXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHN0ID0gMC47XG4gICAgICAgICAgICBmbG9hdCBkID0gMC47XG4gICAgICAgICAgICBmb3IoaW50IGk9MDtpPDI1MDtpKyspXG4gICAgICAgICAgICB7ICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHN0PDAuMDI1KmxvZyhkKmQvc3QvMWU1KXx8ZD5tYXhkKSBicmVhazsvLyBzcGVjaWFsIGJyZWFrIGNvbmRpdGlvbiBmb3IgbG93IHRoaWNrbmVzcyBvYmplY3RcbiAgICAgICAgICAgICAgICBzdCA9IGx0X21hcChybytyZCpkKS54O1xuICAgICAgICAgICAgICAgIGQgKz0gc3QgKiAwLjY7IC8vIHRoZSAwLjYgaXMgc2VsZWN0ZWQgYWNjb3JkaW5nIHRvIHRoZSAxZTUgYW5kIHRoZSAwLjAyNSBvZiB0aGUgYnJlYWsgY29uZGl0aW9uIGZvciBnb29kIHJlc3VsdFxuICAgICAgICAgICAgICAgIGFvKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkIDwgbWF4ZClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2ZWM0IGxpID0gbHRfbGlnaHQocm8sIHJkLCBkLCBybywgdmVjMygwKSk7Ly8gcG9pbnQgbGlnaHQgb24gdGhlIGNhbVxuICAgICAgICAgICAgICAgIGNvbCA9IGxpLnh5ei8obGkudyowLjIpOy8vIGNoZWFwIGxpZ2h0IGF0dGVudWF0aW9uXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgY29sID0gbWl4KHZlYzMoMS4tYW8vMTAwLiksIGNvbCwgMC41KTsvLyBsb3cgY29zdCBhbyA6KVxuICAgICAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgPSBtaXgoIGNvbCwgdmVjMygwKSwgMS4wLWV4cCggLTAuMDAzKmQqZCApICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBmcmFnQ29sb3IucmdiID0gbHRfc3RhcnModXYsIHJkLCBkLCBzLCBmcmFnQ29vcmQpOy8vIHN0YXJzIGJnXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHZpZ25ldHRlXG4gICAgICAgICAgICB2ZWMyIHEgPSBmcmFnQ29vcmQvcztcbiAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgKj0gMC41ICsgMC41KnBvdyggMTYuMCpxLngqcS55KigxLjAtcS54KSooMS4wLXEueSksIDAuMjUgKTsgLy8gaXEgdmlnbmV0dGVcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBMYWNlVHVubmVsU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2YyN2UwMTA0NjA1ZjBjZDcucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01kZkdSWFxuXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL25vaXNlLTI1Ni5wbmcnXG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBpQ2hhbm5lbFJlc29sdXRpb246IHsgdmFsdWU6IFsgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpXSB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2VcbiAgICBjb25zb2xlLmxvZyggXCJub2lzZSB0ZXh0dXJlIHNpemU6IFwiLCBub2lzZS5pbWFnZS53aWR0aCxub2lzZS5pbWFnZS5oZWlnaHQgKTtcbn0pXG5cbmxldCBGaXJlVHVubmVsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICB1bmlmb3JtIHZlYzMgaUNoYW5uZWxSZXNvbHV0aW9uWzRdO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIENyZWF0ZWQgYnkgaW5pZ28gcXVpbGV6IC0gaXEvMjAxM1xuLy8gSSBzaGFyZSB0aGlzIHBpZWNlIChhcnQgYW5kIGNvZGUpIGhlcmUgaW4gU2hhZGVydG95IGFuZCB0aHJvdWdoIGl0cyBQdWJsaWMgQVBJLCBvbmx5IGZvciBlZHVjYXRpb25hbCBwdXJwb3Nlcy4gXG4vLyBZb3UgY2Fubm90IHVzZSwgc2VsbCwgc2hhcmUgb3IgaG9zdCB0aGlzIHBpZWNlIG9yIG1vZGlmaWNhdGlvbnMgb2YgaXQgYXMgcGFydCBvZiB5b3VyIG93biBjb21tZXJjaWFsIG9yIG5vbi1jb21tZXJjaWFsIHByb2R1Y3QsIHdlYnNpdGUgb3IgcHJvamVjdC5cbi8vIFlvdSBjYW4gc2hhcmUgYSBsaW5rIHRvIGl0IG9yIGFuIHVubW9kaWZpZWQgc2NyZWVuc2hvdCBvZiBpdCBwcm92aWRlZCB5b3UgYXR0cmlidXRlIFwiYnkgSW5pZ28gUXVpbGV6LCBAaXF1aWxlemxlcyBhbmQgaXF1aWxlemxlcy5vcmdcIi4gXG4vLyBJZiB5b3UgYXJlIGEgdGVjaGVyLCBsZWN0dXJlciwgZWR1Y2F0b3Igb3Igc2ltaWxhciBhbmQgdGhlc2UgY29uZGl0aW9ucyBhcmUgdG9vIHJlc3RyaWN0aXZlIGZvciB5b3VyIG5lZWRzLCBwbGVhc2UgY29udGFjdCBtZSBhbmQgd2UnbGwgd29yayBpdCBvdXQuXG5cbmZsb2F0IGZpcmVfbm9pc2UoIGluIHZlYzMgeCApXG57XG4gICAgdmVjMyBwID0gZmxvb3IoeCk7XG4gICAgdmVjMyBmID0gZnJhY3QoeCk7XG5cdGYgPSBmKmYqKDMuMC0yLjAqZik7XG5cdFxuXHR2ZWMyIHV2ID0gKHAueHkrdmVjMigzNy4wLDE3LjApKnAueikgKyBmLnh5O1xuXHR2ZWMyIHJnID0gdGV4dHVyZUxvZCggaUNoYW5uZWwwLCAodXYrIDAuNSkvMjU2LjAsIDAuMCApLnl4O1xuXHRyZXR1cm4gbWl4KCByZy54LCByZy55LCBmLnogKTtcbn1cblxudmVjNCBmaXJlX21hcCggdmVjMyBwIClcbntcblx0ZmxvYXQgZGVuID0gMC4yIC0gcC55O1xuXG4gICAgLy8gaW52ZXJ0IHNwYWNlXHRcblx0cCA9IC03LjAqcC9kb3QocCxwKTtcblxuICAgIC8vIHR3aXN0IHNwYWNlXHRcblx0ZmxvYXQgY28gPSBjb3MoZGVuIC0gMC4yNSppVGltZSk7XG5cdGZsb2F0IHNpID0gc2luKGRlbiAtIDAuMjUqaVRpbWUpO1xuXHRwLnh6ID0gbWF0Mihjbywtc2ksc2ksY28pKnAueHo7XG5cbiAgICAvLyBzbW9rZVx0XG5cdGZsb2F0IGY7XG5cdHZlYzMgcSA9IHAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7O1xuICAgIGYgID0gMC41MDAwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDIgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMjUwMDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAzIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjEyNTAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMSAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4wNjI1MCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDIgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMDMxMjUqZmlyZV9ub2lzZSggcSApO1xuXG5cdGRlbiA9IGNsYW1wKCBkZW4gKyA0LjAqZiwgMC4wLCAxLjAgKTtcblx0XG5cdHZlYzMgY29sID0gbWl4KCB2ZWMzKDEuMCwwLjksMC44KSwgdmVjMygwLjQsMC4xNSwwLjEpLCBkZW4gKSArIDAuMDUqc2luKHApO1xuXHRcblx0cmV0dXJuIHZlYzQoIGNvbCwgZGVuICk7XG59XG5cbnZlYzMgcmF5bWFyY2goIGluIHZlYzMgcm8sIGluIHZlYzMgcmQsIGluIHZlYzIgcGl4ZWwgKVxue1xuXHR2ZWM0IHN1bSA9IHZlYzQoIDAuMCApO1xuXG5cdGZsb2F0IHQgPSAwLjA7XG5cbiAgICAvLyBkaXRoZXJpbmdcdFxuXHR0ICs9IDAuMDUqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBwaXhlbC54eS9pQ2hhbm5lbFJlc29sdXRpb25bMF0ueCwgMC4wICkueDtcblx0XG5cdGZvciggaW50IGk9MDsgaTwxMDA7IGkrKyApXG5cdHtcblx0XHRpZiggc3VtLmEgPiAwLjk5ICkgYnJlYWs7XG5cdFx0XG5cdFx0dmVjMyBwb3MgPSBybyArIHQqcmQ7XG5cdFx0dmVjNCBjb2wgPSBmaXJlX21hcCggcG9zICk7XG5cdFx0XG5cdFx0Y29sLnh5eiAqPSBtaXgoIDMuMSp2ZWMzKDEuMCwwLjUsMC4wNSksIHZlYzMoMC40OCwwLjUzLDAuNSksIGNsYW1wKCAocG9zLnktMC4yKS8yLjAsIDAuMCwgMS4wICkgKTtcblx0XHRcblx0XHRjb2wuYSAqPSAwLjY7XG5cdFx0Y29sLnJnYiAqPSBjb2wuYTtcblxuXHRcdHN1bSA9IHN1bSArIGNvbCooMS4wIC0gc3VtLmEpO1x0XG5cblx0XHR0ICs9IDAuMDU7XG5cdH1cblxuXHRyZXR1cm4gY2xhbXAoIHN1bS54eXosIDAuMCwgMS4wICk7XG59XG5cbnZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbntcblx0dmVjMiBxID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgdmVjMiBwID0gLTEuMCArIDIuMCpxO1xuICAgIHAueCAqPSBpUmVzb2x1dGlvbi54LyBpUmVzb2x1dGlvbi55O1xuXHRcbiAgICB2ZWMyIG1vID0gdmVjMigwLjUsMC41KTsgLy9pTW91c2UueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAvL2lmKCBpTW91c2Uudzw9MC4wMDAwMSApIG1vPXZlYzIoMC4wKTtcblx0XG4gICAgLy8gY2FtZXJhXG4gICAgdmVjMyBybyA9IDQuMCpub3JtYWxpemUodmVjMyhjb3MoMy4wKm1vLngpLCAxLjQgLSAxLjAqKG1vLnktLjEpLCBzaW4oMy4wKm1vLngpKSk7XG5cdHZlYzMgdGEgPSB2ZWMzKDAuMCwgMS4wLCAwLjApO1xuXHRmbG9hdCBjciA9IDAuNSpjb3MoMC43KmlUaW1lKTtcblx0XG4gICAgLy8gc2hha2VcdFx0XG5cdHJvICs9IDAuMSooLTEuMCsyLjAqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBpVGltZSp2ZWMyKDAuMDEwLDAuMDE0KSwgMC4wICkueHl6KTtcblx0dGEgKz0gMC4xKigtMS4wKzIuMCp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIGlUaW1lKnZlYzIoMC4wMTMsMC4wMDgpLCAwLjAgKS54eXopO1xuXHRcblx0Ly8gYnVpbGQgcmF5XG4gICAgdmVjMyB3dyA9IG5vcm1hbGl6ZSggdGEgLSBybyk7XG4gICAgdmVjMyB1dSA9IG5vcm1hbGl6ZShjcm9zcyggdmVjMyhzaW4oY3IpLGNvcyhjciksMC4wKSwgd3cgKSk7XG4gICAgdmVjMyB2diA9IG5vcm1hbGl6ZShjcm9zcyh3dyx1dSkpO1xuICAgIHZlYzMgcmQgPSBub3JtYWxpemUoIHAueCp1dSArIHAueSp2diArIDIuMCp3dyApO1xuXHRcbiAgICAvLyByYXltYXJjaFx0XG5cdHZlYzMgY29sID0gcmF5bWFyY2goIHJvLCByZCwgZnJhZ0Nvb3JkICk7XG5cdFxuXHQvLyBjb250cmFzdCBhbmQgdmlnbmV0dGluZ1x0XG5cdGNvbCA9IGNvbCowLjUgKyAwLjUqY29sKmNvbCooMy4wLTIuMCpjb2wpO1xuXHRjb2wgKj0gMC4yNSArIDAuNzUqcG93KCAxNi4wKnEueCpxLnkqKDEuMC1xLngpKigxLjAtcS55KSwgMC4xICk7XG5cdFxuICAgIGZyYWdDb2xvciA9IHZlYzQoIGNvbCwgMS4wICk7XG59XG5cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWxSZXNvbHV0aW9uLnZhbHVlWzBdLnggPSBub2lzZVRleC5pbWFnZS53aWR0aFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbFJlc29sdXRpb24udmFsdWVbMF0ueSA9IG5vaXNlVGV4LmltYWdlLmhlaWdodFxuICAgIH1cbn1cblxuZXhwb3J0IHsgRmlyZVR1bm5lbFNoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzdsZlhSQlxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5sZXQgTWlzdFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcblxuICAgICAgICBmbG9hdCBtcmFuZCh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIGZyYWN0KHNpbihkb3QoY29vcmRzLCB2ZWMyKDU2LjM0NTYsNzguMzQ1NikpICogNS4wKSAqIDEwMDAwLjApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtbm9pc2UodmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgaSA9IGZsb29yKGNvb3Jkcyk7XG4gICAgICAgICAgICB2ZWMyIGYgPSBmcmFjdChjb29yZHMpO1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGEgPSBtcmFuZChpKTtcbiAgICAgICAgICAgIGZsb2F0IGIgPSBtcmFuZChpICsgdmVjMigxLjAsIDAuMCkpO1xuICAgICAgICAgICAgZmxvYXQgYyA9IG1yYW5kKGkgKyB2ZWMyKDAuMCwgMS4wKSk7XG4gICAgICAgICAgICBmbG9hdCBkID0gbXJhbmQoaSArIHZlYzIoMS4wLCAxLjApKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIGN1YmljID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG1peChhLCBiLCBjdWJpYy54KSArIChjIC0gYSkgKiBjdWJpYy55ICogKDEuMCAtIGN1YmljLngpICsgKGQgLSBiKSAqIGN1YmljLnggKiBjdWJpYy55O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBmYm0odmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGZsb2F0IHZhbHVlID0gMC4wO1xuICAgICAgICAgICAgZmxvYXQgc2NhbGUgPSAwLjU7XG4gICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAxMDsgaSsrKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZhbHVlICs9IG1ub2lzZShjb29yZHMpICogc2NhbGU7XG4gICAgICAgICAgICAgICAgY29vcmRzICo9IDQuMDtcbiAgICAgICAgICAgICAgICBzY2FsZSAqPSAwLjU7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueSAqIDIuMDtcbiAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZmluYWwgPSAwLjA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaW50IGkgPTE7IGkgPCA2OyBpKyspXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmVjMiBtb3Rpb24gPSB2ZWMyKGZibSh1diArIHZlYzIoMC4wLGlUaW1lKSAqIDAuMDUgKyB2ZWMyKGksIDAuMCkpKTtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgZmluYWwgKz0gZmJtKHV2ICsgbW90aW9uKTtcbiAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZpbmFsIC89IDUuMDtcbiAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQobWl4KHZlYzMoLTAuMyksIHZlYzMoMC40NSwgMC40LCAwLjYpICsgdmVjMygwLjYpLCBmaW5hbCksIDEpO1xuICAgICAgICB9XG4gICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMTIpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBNaXN0U2hhZGVyIH1cbiIsIi8vIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L1hkc0JEQlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBzdGF0ZSA9IHtcbiAgICBhbmltYXRlOiBmYWxzZSxcbiAgICBub2lzZU1vZGU6ICdzY2FsZScsXG4gICAgaW52ZXJ0OiBmYWxzZSxcbiAgICBzaGFycGVuOiB0cnVlLFxuICAgIHNjYWxlQnlQcmV2OiBmYWxzZSxcbiAgICBnYWluOiAwLjU0LFxuICAgIGxhY3VuYXJpdHk6IDIuMCxcbiAgICBvY3RhdmVzOiA1LFxuICAgIHNjYWxlMTogMy4wLFxuICAgIHNjYWxlMjogMy4wLFxuICAgIHRpbWVTY2FsZVg6IDAuNCxcbiAgICB0aW1lU2NhbGVZOiAwLjMsXG4gICAgY29sb3IxOiBbMCwgMCwgMF0sXG4gICAgY29sb3IyOiBbMTMwLCAxMjksMTI5XSxcbiAgICBjb2xvcjM6IFsxMTAsIDExMCwgMTEwXSxcbiAgICBjb2xvcjQ6IFs4MiwgNTEsIDEzXSxcbiAgICBvZmZzZXRBWDogMCxcbiAgICBvZmZzZXRBWTogMCxcbiAgICBvZmZzZXRCWDogMy43LFxuICAgIG9mZnNldEJZOiAwLjksXG4gICAgb2Zmc2V0Q1g6IDIuMSxcbiAgICBvZmZzZXRDWTogMy4yLFxuICAgIG9mZnNldERYOiA0LjMsXG4gICAgb2Zmc2V0RFk6IDIuOCxcbiAgICBvZmZzZXRYOiAwLFxuICAgIG9mZnNldFk6IDAsXG59O1xuXG5sZXQgTWFyYmxlMVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB7XG4gICAgICAgIG1iX2FuaW1hdGU6IHsgdmFsdWU6IHN0YXRlLmFuaW1hdGUgfSxcbiAgICAgICAgbWJfY29sb3IxOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjEubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3IyOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjIubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3IzOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjMubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3I0OiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjQubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfZ2FpbjogeyB2YWx1ZTogc3RhdGUuZ2FpbiB9LFxuICAgICAgICBtYl9pbnZlcnQ6IHsgdmFsdWU6IHN0YXRlLmludmVydCB9LFxuICAgICAgICBtYl9sYWN1bmFyaXR5OiB7IHZhbHVlOiBzdGF0ZS5sYWN1bmFyaXR5IH0sXG4gICAgICAgIG1iX25vaXNlTW9kZTogeyB2YWx1ZTogc3RhdGUubm9pc2VNb2RlID09PSAnc2NhbGUnID8gMCA6IDEgfSxcbiAgICAgICAgbWJfb2N0YXZlczogeyB2YWx1ZTogc3RhdGUub2N0YXZlcyB9LFxuICAgICAgICBtYl9vZmZzZXQ6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRYLCBzdGF0ZS5vZmZzZXRZXSB9LFxuICAgICAgICBtYl9vZmZzZXRBOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0QVgsIHN0YXRlLm9mZnNldEFZXSB9LFxuICAgICAgICBtYl9vZmZzZXRCOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0QlgsIHN0YXRlLm9mZnNldEJZXSB9LFxuICAgICAgICBtYl9vZmZzZXRDOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0Q1gsIHN0YXRlLm9mZnNldENZXSB9LFxuICAgICAgICBtYl9vZmZzZXREOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0RFgsIHN0YXRlLm9mZnNldERZXSB9LFxuICAgICAgICBtYl9zY2FsZTE6IHsgdmFsdWU6IHN0YXRlLnNjYWxlMSB9LFxuICAgICAgICBtYl9zY2FsZTI6IHsgdmFsdWU6IHN0YXRlLnNjYWxlMiB9LFxuICAgICAgICBtYl9zY2FsZUJ5UHJldjogeyB2YWx1ZTogc3RhdGUuc2NhbGVCeVByZXYgfSxcbiAgICAgICAgbWJfc2hhcnBlbjogeyB2YWx1ZTogc3RhdGUuc2hhcnBlbiB9LFxuICAgICAgICBtYl90aW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIG1iX3RpbWVTY2FsZTogeyB2YWx1ZTogW3N0YXRlLnRpbWVTY2FsZVgsIHN0YXRlLnRpbWVTY2FsZVldIH0sXG4gICAgICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgICAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSAgICBcbiAgICB9LFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9hbmltYXRlO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjI7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IzO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yNDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfZ2FpbjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9pbnZlcnQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX2xhY3VuYXJpdHk7XG4gICAgICAgICAgICB1bmlmb3JtIGludCBtYl9ub2lzZU1vZGU7XG4gICAgICAgICAgICB1bmlmb3JtIGludCBtYl9vY3RhdmVzO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldDtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRBO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEI7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXREO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9zY2FsZTE7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3NjYWxlMjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9zY2FsZUJ5UHJldjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9zaGFycGVuO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl90aW1lO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX3RpbWVTY2FsZTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICAgICAgICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIFNvbWUgdXNlZnVsIGZ1bmN0aW9uc1xuICAgICAgICB2ZWMzIG1iX21vZDI4OSh2ZWMzIHgpIHsgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDsgfVxuICAgICAgICB2ZWMyIG1iX21vZDI4OSh2ZWMyIHgpIHsgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDsgfVxuICAgICAgICB2ZWMzIG1iX3Blcm11dGUodmVjMyB4KSB7IHJldHVybiBtYl9tb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7IH1cbiAgICAgICAgXG4gICAgICAgIC8vXG4gICAgICAgIC8vIERlc2NyaXB0aW9uIDogR0xTTCAyRCBzaW1wbGV4IG5vaXNlIGZ1bmN0aW9uXG4gICAgICAgIC8vICAgICAgQXV0aG9yIDogSWFuIE1jRXdhbiwgQXNoaW1hIEFydHNcbiAgICAgICAgLy8gIE1haW50YWluZXIgOiBpam1cbiAgICAgICAgLy8gICAgIExhc3Rtb2QgOiAyMDExMDgyMiAoaWptKVxuICAgICAgICAvLyAgICAgTGljZW5zZSA6XG4gICAgICAgIC8vICBDb3B5cmlnaHQgKEMpIDIwMTEgQXNoaW1hIEFydHMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gICAgICAgIC8vICBEaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMSUNFTlNFIGZpbGUuXG4gICAgICAgIC8vICBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlXG4gICAgICAgIC8vXG4gICAgICAgIGZsb2F0IG1iX3Nub2lzZSh2ZWMyIHYpIHtcbiAgICAgICAgICAgIC8vIFByZWNvbXB1dGUgdmFsdWVzIGZvciBza2V3ZWQgdHJpYW5ndWxhciBncmlkXG4gICAgICAgICAgICBjb25zdCB2ZWM0IEMgPSB2ZWM0KDAuMjExMzI0ODY1NDA1MTg3LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAoMy4wLXNxcnQoMy4wKSkvNi4wXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuMzY2MDI1NDAzNzg0NDM5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwLjUqKHNxcnQoMy4wKS0xLjApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0wLjU3NzM1MDI2OTE4OTYyNixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gLTEuMCArIDIuMCAqIEMueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjAyNDM5MDI0MzkwMjQzOSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDEuMCAvIDQxLjBcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBGaXJzdCBjb3JuZXIgKHgwKVxuICAgICAgICAgICAgdmVjMiBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eSkpO1xuICAgICAgICAgICAgdmVjMiB4MCA9IHYgLSBpICsgZG90KGksIEMueHgpO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIE90aGVyIHR3byBjb3JuZXJzICh4MSwgeDIpXG4gICAgICAgICAgICB2ZWMyIGkxID0gdmVjMigwLjApO1xuICAgICAgICAgICAgaTEgPSAoeDAueCA+IHgwLnkpPyB2ZWMyKDEuMCwgMC4wKTp2ZWMyKDAuMCwgMS4wKTtcbiAgICAgICAgICAgIHZlYzIgeDEgPSB4MC54eSArIEMueHggLSBpMTtcbiAgICAgICAgICAgIHZlYzIgeDIgPSB4MC54eSArIEMueno7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gRG8gc29tZSBwZXJtdXRhdGlvbnMgdG8gYXZvaWRcbiAgICAgICAgICAgIC8vIHRydW5jYXRpb24gZWZmZWN0cyBpbiBwZXJtdXRhdGlvblxuICAgICAgICAgICAgaSA9IG1iX21vZDI4OShpKTtcbiAgICAgICAgICAgIHZlYzMgcCA9IG1iX3Blcm11dGUoXG4gICAgICAgICAgICAgICAgICAgIG1iX3Blcm11dGUoIGkueSArIHZlYzMoMC4wLCBpMS55LCAxLjApKVxuICAgICAgICAgICAgICAgICAgICAgICAgKyBpLnggKyB2ZWMzKDAuMCwgaTEueCwgMS4wICkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgbSA9IG1heCgwLjUgLSB2ZWMzKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDAseDApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDEseDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDIseDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksIDAuMCk7XG4gICAgICAgIFxuICAgICAgICAgICAgbSA9IG0qbTtcbiAgICAgICAgICAgIG0gPSBtKm07XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gR3JhZGllbnRzOlxuICAgICAgICAgICAgLy8gIDQxIHB0cyB1bmlmb3JtbHkgb3ZlciBhIGxpbmUsIG1hcHBlZCBvbnRvIGEgZGlhbW9uZFxuICAgICAgICAgICAgLy8gIFRoZSByaW5nIHNpemUgMTcqMTcgPSAyODkgaXMgY2xvc2UgdG8gYSBtdWx0aXBsZVxuICAgICAgICAgICAgLy8gICAgICBvZiA0MSAoNDEqNyA9IDI4NylcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIHggPSAyLjAgKiBmcmFjdChwICogQy53d3cpIC0gMS4wO1xuICAgICAgICAgICAgdmVjMyBoID0gYWJzKHgpIC0gMC41O1xuICAgICAgICAgICAgdmVjMyBveCA9IGZsb29yKHggKyAwLjUpO1xuICAgICAgICAgICAgdmVjMyBhMCA9IHggLSBveDtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBOb3JtYWxpc2UgZ3JhZGllbnRzIGltcGxpY2l0bHkgYnkgc2NhbGluZyBtXG4gICAgICAgICAgICAvLyBBcHByb3hpbWF0aW9uIG9mOiBtICo9IGludmVyc2VzcXJ0KGEwKmEwICsgaCpoKTtcbiAgICAgICAgICAgIG0gKj0gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiAoYTAqYTAraCpoKTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBDb21wdXRlIGZpbmFsIG5vaXNlIHZhbHVlIGF0IFBcbiAgICAgICAgICAgIHZlYzMgZyA9IHZlYzMoMC4wKTtcbiAgICAgICAgICAgIGcueCAgPSBhMC54ICAqIHgwLnggICsgaC54ICAqIHgwLnk7XG4gICAgICAgICAgICBnLnl6ID0gYTAueXogKiB2ZWMyKHgxLngseDIueCkgKyBoLnl6ICogdmVjMih4MS55LHgyLnkpO1xuICAgICAgICAgICAgcmV0dXJuIDEzMC4wICogZG90KG0sIGcpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9nZXROb2lzZVZhbCh2ZWMyIHApIHtcbiAgICAgICAgICAgIGZsb2F0IHJhdyA9IG1iX3Nub2lzZShwKTtcbiAgICAgICAgXG4gICAgICAgICAgICBpZiAobWJfbm9pc2VNb2RlID09IDEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWJzKHJhdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHJhdyAqIDAuNSArIDAuNTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfZmJtKHZlYzIgcCkge1xuICAgICAgICAgICAgZmxvYXQgc3VtID0gMC4wO1xuICAgICAgICAgICAgZmxvYXQgZnJlcSA9IDEuMDtcbiAgICAgICAgICAgIGZsb2F0IGFtcCA9IDAuNTtcbiAgICAgICAgICAgIGZsb2F0IHByZXYgPSAxLjA7XG4gICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBtYl9vY3RhdmVzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBuID0gbWJfZ2V0Tm9pc2VWYWwocCAqIGZyZXEpO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfaW52ZXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSAxLjAgLSBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX3NoYXJwZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IG4gKiBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgc3VtICs9IG4gKiBhbXA7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9zY2FsZUJ5UHJldikge1xuICAgICAgICAgICAgICAgICAgICBzdW0gKz0gbiAqIGFtcCAqIHByZXY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBwcmV2ID0gbjtcbiAgICAgICAgICAgICAgICBmcmVxICo9IG1iX2xhY3VuYXJpdHk7XG4gICAgICAgICAgICAgICAgYW1wICo9IG1iX2dhaW47XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHN1bTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfcGF0dGVybihpbiB2ZWMyIHAsIG91dCB2ZWMyIHEsIG91dCB2ZWMyIHIpIHtcbiAgICAgICAgICAgIHAgKj0gbWJfc2NhbGUxO1xuICAgICAgICAgICAgcCArPSBtYl9vZmZzZXQ7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdCA9IDAuMDtcbiAgICAgICAgICAgIGlmIChtYl9hbmltYXRlKSB7XG4gICAgICAgICAgICAgICAgdCA9IG1iX3RpbWUgKiAwLjE7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcSA9IHZlYzIobWJfZmJtKHAgKyBtYl9vZmZzZXRBICsgdCAqIG1iX3RpbWVTY2FsZS54KSwgbWJfZmJtKHAgKyBtYl9vZmZzZXRCIC0gdCAqIG1iX3RpbWVTY2FsZS55KSk7XG4gICAgICAgICAgICByID0gdmVjMihtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHEgKyBtYl9vZmZzZXRDKSwgbWJfZmJtKHAgKyBtYl9zY2FsZTIgKiBxICsgbWJfb2Zmc2V0RCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHIpO1xuICAgICAgICB9XG4gICAgYCxcbiAgICByZXBsYWNlTWFwOiBnbHNsYFxuICAgICAgICB2ZWMzIG1hcmJsZUNvbG9yID0gdmVjMygwLjApO1xuXG4gICAgICAgIHZlYzIgcTtcbiAgICAgICAgdmVjMiByO1xuXG4gICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgXG4gICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuXG4gICAgICAgIGZsb2F0IGYgPSBtYl9wYXR0ZXJuKHV2LCBxLCByKTtcbiAgICAgICAgXG4gICAgICAgIG1hcmJsZUNvbG9yID0gbWl4KG1iX2NvbG9yMSwgbWJfY29sb3IyLCBmKTtcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWFyYmxlQ29sb3IsIG1iX2NvbG9yMywgbGVuZ3RoKHEpIC8gMi4wKTtcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWFyYmxlQ29sb3IsIG1iX2NvbG9yNCwgci55IC8gMi4wKTtcblxuICAgICAgICB2ZWM0IG1hcmJsZUNvbG9yNCA9IG1hcFRleGVsVG9MaW5lYXIoIHZlYzQobWFyYmxlQ29sb3IsMS4wKSApO1xuXG4gICAgICAgIGRpZmZ1c2VDb2xvciAqPSBtYXJibGVDb2xvcjQ7XG4gICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfaW52ZXJ0ID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IHN0YXRlLmludmVydCA6ICFzdGF0ZS5pbnZlcnQgfVxuXG4gICAgICAgIC8vIGxldHMgYWRkIGEgYml0IG9mIHJhbmRvbW5lc3MgdG8gdGhlIGlucHV0IHNvIG11bHRpcGxlIGluc3RhbmNlcyBhcmUgZGlmZmVyZW50XG4gICAgICAgIGxldCByeCA9IE1hdGgucmFuZG9tKClcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfb2Zmc2V0QSA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKCBzdGF0ZS5vZmZzZXRBWCArIE1hdGgucmFuZG9tKCksIHN0YXRlLm9mZnNldEFZICsgTWF0aC5yYW5kb20oKSkgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9vZmZzZXRCID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoIHN0YXRlLm9mZnNldEJYICsgTWF0aC5yYW5kb20oKSwgc3RhdGUub2Zmc2V0QlkgKyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX3RpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICB9XG59XG5cbmV4cG9ydCB7IE1hcmJsZTFTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvMWVjOTY1YzVkNmRmNTc3Yy5qcGdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvNHQzM3o4XG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvc21hbGwtbm9pc2UucG5nJ1xuaW1wb3J0IG5vdEZvdW5kIGZyb20gJy4uL2Fzc2V0cy9iYWRTaGFkZXIuanBnJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBpQ2hhbm5lbDE6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG52YXIgbm90Rm91bmRUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKG5vdEZvdW5kLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vdEZvdW5kVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBOb3RGb3VuZFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMTtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgIHZlYzIgd2FycFVWID0gMi4gKiB1djtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBkID0gbGVuZ3RoKCB3YXJwVVYgKTtcbiAgICAgICAgICAgIHZlYzIgc3QgPSB3YXJwVVYqMC4xICsgMC4yKnZlYzIoY29zKDAuMDcxKmlUaW1lKjIuK2QpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbigwLjA3MyppVGltZSoyLi1kKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyB3YXJwZWRDb2wgPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHN0ICkueHl6ICogMi4wO1xuICAgICAgICAgICAgZmxvYXQgdyA9IG1heCggd2FycGVkQ29sLnIsIDAuODUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIG9mZnNldCA9IDAuMDEgKiBjb3MoIHdhcnBlZENvbC5yZyAqIDMuMTQxNTkgKTtcbiAgICAgICAgICAgIHZlYzMgY29sID0gdGV4dHVyZSggaUNoYW5uZWwxLCB1diArIG9mZnNldCApLnJnYiAqIHZlYzMoMC44LCAwLjgsIDEuNSkgO1xuICAgICAgICAgICAgY29sICo9IHcqMS4yO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KCBtaXgoY29sLCB0ZXh0dXJlKCBpQ2hhbm5lbDEsIHV2ICsgb2Zmc2V0ICkucmdiLCAwLjUpLCAgMS4wKTtcbiAgICAgICAgfVxuICAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMS52YWx1ZSA9IG5vdEZvdW5kVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDEudmFsdWUgPSBub3RGb3VuZFRleFxuICAgIH1cbn1cblxuZXhwb3J0IHsgTm90Rm91bmRTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvNDgxYTkyYjQ0ZTU2ZGFkNC5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCB1bmlmb3JtcyA9IHtcbiAgICB3YXJwVGltZToge3ZhbHVlOiAwfSxcbiAgICB3YXJwVGV4OiB7dmFsdWU6IG51bGx9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH1cbn0gXG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgd2FycFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQod2FycGZ4LCAod2FycCkgPT4ge1xuICAgIHdhcnAubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnAud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwVGV4ID0gd2FycFxufSlcblxubGV0IFdhcnBTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB1bmlmb3JtIGZsb2F0IHdhcnBUaW1lO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCB3YXJwVGV4O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICB1bmlmb3JtIGludCB0ZXhGbGlwWTsgXG4gICAgICAgICAgICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogZ2xzbGBcbiAgICAgICAgICBmbG9hdCB0ID0gd2FycFRpbWU7XG5cbiAgICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgXG4gICAgICAgICAgdmVjMiBzY2FsZWRVViA9IHV2ICogMi4wIC0gMS4wO1xuICAgICAgICAgIHZlYzIgcHV2ID0gdmVjMihsZW5ndGgoc2NhbGVkVVYueHkpLCBhdGFuKHNjYWxlZFVWLngsIHNjYWxlZFVWLnkpKTtcbiAgICAgICAgICB2ZWM0IGNvbCA9IHRleHR1cmUyRCh3YXJwVGV4LCB2ZWMyKGxvZyhwdXYueCkgKyB0IC8gNS4wLCBwdXYueSAvIDMuMTQxNTkyNiApKTtcbiAgICAgICAgICBmbG9hdCBnbG93ID0gKDEuMCAtIHB1di54KSAqICgwLjUgKyAoc2luKHQpICsgMi4wICkgLyA0LjApO1xuICAgICAgICAgIC8vIGJsdWUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDExOC4wLzI1NS4wLCAxNDQuMC8yNTUuMCwgMjE5LjAvMjU1LjAsIDEuMCkgKiAoMC40ICsgZ2xvdyAqIDEuMCk7XG4gICAgICAgICAgLy8gd2hpdGUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDAuMikgKiBzbW9vdGhzdGVwKDAuMCwgMi4wLCBnbG93ICogZ2xvdyk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sID0gbWFwVGV4ZWxUb0xpbmVhciggY29sICk7XG4gICAgICAgICAgZGlmZnVzZUNvbG9yICo9IGNvbDtcbiAgICAgICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgV2FycFNoYWRlciB9XG4iLCIvKlxuICogM0QgU2ltcGxleCBub2lzZVxuICogU0lHTkFUVVJFOiBmbG9hdCBzbm9pc2UodmVjMyB2KVxuICogaHR0cHM6Ly9naXRodWIuY29tL2h1Z2hzay9nbHNsLW5vaXNlXG4gKi9cblxuY29uc3QgZ2xzbCA9IGBcbi8vXG4vLyBEZXNjcmlwdGlvbiA6IEFycmF5IGFuZCB0ZXh0dXJlbGVzcyBHTFNMIDJELzNELzREIHNpbXBsZXhcbi8vICAgICAgICAgICAgICAgbm9pc2UgZnVuY3Rpb25zLlxuLy8gICAgICBBdXRob3IgOiBJYW4gTWNFd2FuLCBBc2hpbWEgQXJ0cy5cbi8vICBNYWludGFpbmVyIDogaWptXG4vLyAgICAgTGFzdG1vZCA6IDIwMTEwODIyIChpam0pXG4vLyAgICAgTGljZW5zZSA6IENvcHlyaWdodCAoQykgMjAxMSBBc2hpbWEgQXJ0cy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vICAgICAgICAgICAgICAgRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTElDRU5TRSBmaWxlLlxuLy8gICAgICAgICAgICAgICBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlXG4vL1xuXG52ZWMzIG1vZDI4OSh2ZWMzIHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBtb2QyODkodmVjNCB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgcGVybXV0ZSh2ZWM0IHgpIHtcbiAgICAgcmV0dXJuIG1vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTtcbn1cblxudmVjNCB0YXlsb3JJbnZTcXJ0KHZlYzQgcilcbntcbiAgcmV0dXJuIDEuNzkyODQyOTE0MDAxNTkgLSAwLjg1MzczNDcyMDk1MzE0ICogcjtcbn1cblxuZmxvYXQgc25vaXNlKHZlYzMgdilcbiAge1xuICBjb25zdCB2ZWMyICBDID0gdmVjMigxLjAvNi4wLCAxLjAvMy4wKSA7XG4gIGNvbnN0IHZlYzQgIEQgPSB2ZWM0KDAuMCwgMC41LCAxLjAsIDIuMCk7XG5cbi8vIEZpcnN0IGNvcm5lclxuICB2ZWMzIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5eSkgKTtcbiAgdmVjMyB4MCA9ICAgdiAtIGkgKyBkb3QoaSwgQy54eHgpIDtcblxuLy8gT3RoZXIgY29ybmVyc1xuICB2ZWMzIGcgPSBzdGVwKHgwLnl6eCwgeDAueHl6KTtcbiAgdmVjMyBsID0gMS4wIC0gZztcbiAgdmVjMyBpMSA9IG1pbiggZy54eXosIGwuenh5ICk7XG4gIHZlYzMgaTIgPSBtYXgoIGcueHl6LCBsLnp4eSApO1xuXG4gIC8vICAgeDAgPSB4MCAtIDAuMCArIDAuMCAqIEMueHh4O1xuICAvLyAgIHgxID0geDAgLSBpMSAgKyAxLjAgKiBDLnh4eDtcbiAgLy8gICB4MiA9IHgwIC0gaTIgICsgMi4wICogQy54eHg7XG4gIC8vICAgeDMgPSB4MCAtIDEuMCArIDMuMCAqIEMueHh4O1xuICB2ZWMzIHgxID0geDAgLSBpMSArIEMueHh4O1xuICB2ZWMzIHgyID0geDAgLSBpMiArIEMueXl5OyAvLyAyLjAqQy54ID0gMS8zID0gQy55XG4gIHZlYzMgeDMgPSB4MCAtIEQueXl5OyAgICAgIC8vIC0xLjArMy4wKkMueCA9IC0wLjUgPSAtRC55XG5cbi8vIFBlcm11dGF0aW9uc1xuICBpID0gbW9kMjg5KGkpO1xuICB2ZWM0IHAgPSBwZXJtdXRlKCBwZXJtdXRlKCBwZXJtdXRlKFxuICAgICAgICAgICAgIGkueiArIHZlYzQoMC4wLCBpMS56LCBpMi56LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnkgKyB2ZWM0KDAuMCwgaTEueSwgaTIueSwgMS4wICkpXG4gICAgICAgICAgICsgaS54ICsgdmVjNCgwLjAsIGkxLngsIGkyLngsIDEuMCApKTtcblxuLy8gR3JhZGllbnRzOiA3eDcgcG9pbnRzIG92ZXIgYSBzcXVhcmUsIG1hcHBlZCBvbnRvIGFuIG9jdGFoZWRyb24uXG4vLyBUaGUgcmluZyBzaXplIDE3KjE3ID0gMjg5IGlzIGNsb3NlIHRvIGEgbXVsdGlwbGUgb2YgNDkgKDQ5KjYgPSAyOTQpXG4gIGZsb2F0IG5fID0gMC4xNDI4NTcxNDI4NTc7IC8vIDEuMC83LjBcbiAgdmVjMyAgbnMgPSBuXyAqIEQud3l6IC0gRC54eng7XG5cbiAgdmVjNCBqID0gcCAtIDQ5LjAgKiBmbG9vcihwICogbnMueiAqIG5zLnopOyAgLy8gIG1vZChwLDcqNylcblxuICB2ZWM0IHhfID0gZmxvb3IoaiAqIG5zLnopO1xuICB2ZWM0IHlfID0gZmxvb3IoaiAtIDcuMCAqIHhfICk7ICAgIC8vIG1vZChqLE4pXG5cbiAgdmVjNCB4ID0geF8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IHkgPSB5XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgaCA9IDEuMCAtIGFicyh4KSAtIGFicyh5KTtcblxuICB2ZWM0IGIwID0gdmVjNCggeC54eSwgeS54eSApO1xuICB2ZWM0IGIxID0gdmVjNCggeC56dywgeS56dyApO1xuXG4gIC8vdmVjNCBzMCA9IHZlYzQobGVzc1RoYW4oYjAsMC4wKSkqMi4wIC0gMS4wO1xuICAvL3ZlYzQgczEgPSB2ZWM0KGxlc3NUaGFuKGIxLDAuMCkpKjIuMCAtIDEuMDtcbiAgdmVjNCBzMCA9IGZsb29yKGIwKSoyLjAgKyAxLjA7XG4gIHZlYzQgczEgPSBmbG9vcihiMSkqMi4wICsgMS4wO1xuICB2ZWM0IHNoID0gLXN0ZXAoaCwgdmVjNCgwLjApKTtcblxuICB2ZWM0IGEwID0gYjAueHp5dyArIHMwLnh6eXcqc2gueHh5eSA7XG4gIHZlYzQgYTEgPSBiMS54enl3ICsgczEueHp5dypzaC56end3IDtcblxuICB2ZWMzIHAwID0gdmVjMyhhMC54eSxoLngpO1xuICB2ZWMzIHAxID0gdmVjMyhhMC56dyxoLnkpO1xuICB2ZWMzIHAyID0gdmVjMyhhMS54eSxoLnopO1xuICB2ZWMzIHAzID0gdmVjMyhhMS56dyxoLncpO1xuXG4vL05vcm1hbGlzZSBncmFkaWVudHNcbiAgdmVjNCBub3JtID0gdGF5bG9ySW52U3FydCh2ZWM0KGRvdChwMCxwMCksIGRvdChwMSxwMSksIGRvdChwMiwgcDIpLCBkb3QocDMscDMpKSk7XG4gIHAwICo9IG5vcm0ueDtcbiAgcDEgKj0gbm9ybS55O1xuICBwMiAqPSBub3JtLno7XG4gIHAzICo9IG5vcm0udztcblxuLy8gTWl4IGZpbmFsIG5vaXNlIHZhbHVlXG4gIHZlYzQgbSA9IG1heCgwLjYgLSB2ZWM0KGRvdCh4MCx4MCksIGRvdCh4MSx4MSksIGRvdCh4Mix4MiksIGRvdCh4Myx4MykpLCAwLjApO1xuICBtID0gbSAqIG07XG4gIHJldHVybiA0Mi4wICogZG90KCBtKm0sIHZlYzQoIGRvdChwMCx4MCksIGRvdChwMSx4MSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdChwMix4MiksIGRvdChwMyx4MykgKSApO1xuICB9ICBcbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuaW1wb3J0IHNub2lzZSBmcm9tICcuL3Nub2lzZSdcbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmNvbnN0IHVuaWZvcm1zID0ge1xuICAgIHdhcnBUaW1lOiB7dmFsdWU6IDB9LFxuICAgIHdhcnBUZXg6IHt2YWx1ZTogbnVsbH0sXG4gICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0sXG4gICAgdGV4RmxpcFk6IHsgdmFsdWU6IDAgfSxcbiAgICBwb3J0YWxDdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKSB9LFxuICAgIHBvcnRhbFRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICBwb3J0YWxSYWRpdXM6IHsgdmFsdWU6IDAuNSB9LFxuICAgIHBvcnRhbFJpbmdDb2xvcjogeyB2YWx1ZTogbmV3IFRIUkVFLkNvbG9yKFwicmVkXCIpICB9LFxuICAgIGludmVydFdhcnBDb2xvcjogeyB2YWx1ZTogMCB9XG59IFxuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IGN1YmVNYXAgPSBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgd2FycFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQod2FycGZ4LCAod2FycCkgPT4ge1xuICAgIHdhcnAubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnAud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwVGV4ID0gd2FycFxuICAgIGN1YmVNYXAuaW1hZ2VzID0gW3dhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2VdXG4gICAgY3ViZU1hcC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxldCBXYXJwUG9ydGFsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdmFyeWluZyB2ZWMzIHZSYXk7XG4gICAgICAgIHZhcnlpbmcgdmVjMyBwb3J0YWxOb3JtYWw7XG4gICAgICAgIC8vdmFyeWluZyB2ZWMzIGNhbWVyYUxvY2FsO1xuICAgICAgICBgLFxuICAgICAgICBwb3N0VHJhbnNmb3JtOiBnbHNsYFxuICAgICAgICAvLyB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxNYXRyaXgpICogdmVjNChjYW1lcmFQb3NpdGlvbiwgMS4wKSkueHl6O1xuICAgICAgICB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxWaWV3TWF0cml4KSAqIHZlYzQoMC4wLDAuMCwwLjAsIDEuMCkpLnh5ejtcbiAgICAgICAgdlJheSA9IHBvc2l0aW9uIC0gY2FtZXJhTG9jYWw7XG4gICAgICAgIGlmICh2UmF5LnogPCAwLjApIHtcbiAgICAgICAgICAgIHZSYXkueiA9IC12UmF5Lno7XG4gICAgICAgICAgICB2UmF5LnggPSAtdlJheS54O1xuICAgICAgICB9XG4gICAgICAgIC8vdlJheSA9IHZlYzMobXZQb3NpdGlvbi54LCBtdlBvc2l0aW9uLnksIG12UG9zaXRpb24ueik7XG4gICAgICAgIHBvcnRhbE5vcm1hbCA9IG5vcm1hbGl6ZSgtMS4gKiB2UmF5KTtcbiAgICAgICAgLy9mbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aChjYW1lcmFMb2NhbCk7XG4gICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0ID0gbGVuZ3RoKHZSYXkpO1xuICAgICAgICB2UmF5LnogKj0gMS4zIC8gKDEuICsgcG93KHBvcnRhbF9kaXN0LCAwLjUpKTsgLy8gQ2hhbmdlIEZPViBieSBzcXVhc2hpbmcgbG9jYWwgWiBkaXJlY3Rpb25cbiAgICAgIGBcbiAgICB9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgZnVuY3Rpb25zOiBzbm9pc2UsXG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB1bmlmb3JtIHNhbXBsZXJDdWJlIHBvcnRhbEN1YmVNYXA7XG4gICAgICAgIHVuaWZvcm0gZmxvYXQgcG9ydGFsUmFkaXVzO1xuICAgICAgICB1bmlmb3JtIHZlYzMgcG9ydGFsUmluZ0NvbG9yO1xuICAgICAgICB1bmlmb3JtIGZsb2F0IHBvcnRhbFRpbWU7XG4gICAgICAgIHVuaWZvcm0gaW50IGludmVydFdhcnBDb2xvcjtcblxuICAgICAgICB2YXJ5aW5nIHZlYzMgdlJheTtcbiAgICAgICAgdmFyeWluZyB2ZWMzIHBvcnRhbE5vcm1hbDtcbiAgICAgICAvLyB2YXJ5aW5nIHZlYzMgY2FtZXJhTG9jYWw7XG5cbiAgICAgICAgdW5pZm9ybSBmbG9hdCB3YXJwVGltZTtcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgd2FycFRleDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbiAgICAgICAgdW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuXG4gICAgICAgICNkZWZpbmUgUklOR19XSURUSCAwLjFcbiAgICAgICAgI2RlZmluZSBSSU5HX0hBUkRfT1VURVIgMC4wMVxuICAgICAgICAjZGVmaW5lIFJJTkdfSEFSRF9JTk5FUiAwLjA4XG4gICAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgICAgZmxvYXQgdCA9IHdhcnBUaW1lO1xuXG4gICAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG4gIFxuICAgICAgICAgIHZlYzIgc2NhbGVkVVYgPSB1diAqIDIuMCAtIDEuMDtcbiAgICAgICAgICB2ZWMyIHB1diA9IHZlYzIobGVuZ3RoKHNjYWxlZFVWLnh5KSwgYXRhbihzY2FsZWRVVi54LCBzY2FsZWRVVi55KSk7XG4gICAgICAgICAgdmVjNCBjb2wgPSB0ZXh0dXJlMkQod2FycFRleCwgdmVjMihsb2cocHV2LngpICsgdCAvIDUuMCwgcHV2LnkgLyAzLjE0MTU5MjYgKSk7XG5cbiAgICAgICAgICBmbG9hdCBnbG93ID0gKDEuMCAtIHB1di54KSAqICgwLjUgKyAoc2luKHQpICsgMi4wICkgLyA0LjApO1xuICAgICAgICAgIC8vIGJsdWUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDExOC4wLzI1NS4wLCAxNDQuMC8yNTUuMCwgMjE5LjAvMjU1LjAsIDEuMCkgKiAoMC40ICsgZ2xvdyAqIDEuMCk7XG4gICAgICAgICAgLy8gd2hpdGUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDAuMikgKiBzbW9vdGhzdGVwKDAuMCwgMi4wLCBnbG93ICogZ2xvdyk7XG4gICAgICAgICAgY29sID0gbWFwVGV4ZWxUb0xpbmVhciggY29sICk7XG4gICAgICAgICBcbiAgICAgICAgICBpZiAoaW52ZXJ0V2FycENvbG9yID4gMCkge1xuICAgICAgICAgICAgICBjb2wgPSB2ZWM0KGNvbC5iLCBjb2wuZywgY29sLnIsIGNvbC5hKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLy8gcG9ydGFsIHNoYWRlciBlZmZlY3RcbiAgICAgICAgICB2ZWMyIHBvcnRhbF9jb29yZCA9IHZVdiAqIDIuMCAtIDEuMDtcbiAgICAgICAgICBmbG9hdCBwb3J0YWxfbm9pc2UgPSBzbm9pc2UodmVjMyhwb3J0YWxfY29vcmQgKiAxLiwgcG9ydGFsVGltZSkpICogMC41ICsgMC41O1xuICAgICAgICBcbiAgICAgICAgICAvLyBQb2xhciBkaXN0YW5jZVxuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0ID0gbGVuZ3RoKHBvcnRhbF9jb29yZCk7XG4gICAgICAgICAgcG9ydGFsX2Rpc3QgKz0gcG9ydGFsX25vaXNlICogMC4yO1xuICAgICAgICBcbiAgICAgICAgICBmbG9hdCBtYXNrT3V0ZXIgPSAxLjAgLSBzbW9vdGhzdGVwKHBvcnRhbFJhZGl1cyAtIFJJTkdfSEFSRF9PVVRFUiwgcG9ydGFsUmFkaXVzLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgZmxvYXQgbWFza0lubmVyID0gMS4wIC0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSBSSU5HX1dJRFRILCBwb3J0YWxSYWRpdXMgLSBSSU5HX1dJRFRIICsgUklOR19IQVJEX0lOTkVSLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgZmxvYXQgcG9ydGFsX2Rpc3RvcnRpb24gPSBzbW9vdGhzdGVwKHBvcnRhbFJhZGl1cyAtIDAuMiwgcG9ydGFsUmFkaXVzICsgMC4yLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMyBwb3J0YWxub3JtYWwgPSBub3JtYWxpemUocG9ydGFsTm9ybWFsKTtcbiAgICAgICAgICB2ZWMzIGZvcndhcmRQb3J0YWwgPSB2ZWMzKDAuMCwgMC4wLCAtMS4wKTtcblxuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXJlY3RWaWV3ID0gc21vb3Roc3RlcCgwLjAsIDAuOCwgZG90KHBvcnRhbG5vcm1hbCwgZm9yd2FyZFBvcnRhbCkpO1xuICAgICAgICAgIHZlYzMgcG9ydGFsX3RhbmdlbnRPdXR3YXJkID0gbm9ybWFsaXplKHZlYzMocG9ydGFsX2Nvb3JkLCAwLjApKTtcbiAgICAgICAgICB2ZWMzIHBvcnRhbF9yYXkgPSBtaXgodlJheSwgcG9ydGFsX3RhbmdlbnRPdXR3YXJkLCBwb3J0YWxfZGlzdG9ydGlvbik7XG5cbiAgICAgICAgICB2ZWM0IG15Q3ViZVRleGVsID0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgcG9ydGFsX3JheSk7XG4gICAgICAgICAgbXlDdWJlVGV4ZWwgPSBtYXBUZXhlbFRvTGluZWFyKCBteUN1YmVUZXhlbCApO1xuXG4gICAgICAgIC8vICAgdmVjNCBwb3NDb2wgPSB2ZWM0KHNtb290aHN0ZXAoLTYuMCwgNi4wLCBjYW1lcmFMb2NhbCksIDEuMCk7IC8vbm9ybWFsaXplKChjYW1lcmFMb2NhbCAvIDYuMCkpO1xuICAgICAgICAvLyAgIG15Q3ViZVRleGVsID0gcG9zQ29sOyAvLyB2ZWM0KHBvc0NvbC54LCBwb3NDb2wueSwgcG9zQ29sLnksIDEuMCk7XG4gICAgICAgICAgdmVjMyBjZW50ZXJMYXllciA9IG15Q3ViZVRleGVsLnJnYiAqIG1hc2tJbm5lcjtcbiAgICAgICAgICB2ZWMzIHJpbmdMYXllciA9IHBvcnRhbFJpbmdDb2xvciAqICgxLiAtIG1hc2tJbm5lcik7XG4gICAgICAgICAgdmVjMyBwb3J0YWxfY29tcG9zaXRlID0gY2VudGVyTGF5ZXIgKyByaW5nTGF5ZXI7XG4gICAgICAgIFxuICAgICAgICAgIC8vZ2xfRnJhZ0NvbG9yIFxuICAgICAgICAgIHZlYzQgcG9ydGFsQ29sID0gdmVjNChwb3J0YWxfY29tcG9zaXRlLCAobWFza091dGVyIC0gbWFza0lubmVyKSArIG1hc2tJbm5lciAqIHBvcnRhbF9kaXJlY3RWaWV3KTtcbiAgICAgICAgXG4gICAgICAgICAgLy8gYmxlbmQgdGhlIHR3b1xuICAgICAgICAgIHBvcnRhbENvbC5yZ2IgKj0gcG9ydGFsQ29sLmE7IC8vcHJlbXVsdGlwbHkgc291cmNlIFxuICAgICAgICAgIGNvbC5yZ2IgKj0gKDEuMCAtIHBvcnRhbENvbC5hKTtcbiAgICAgICAgICBjb2wucmdiICs9IHBvcnRhbENvbC5yZ2I7XG5cbiAgICAgICAgICBkaWZmdXNlQ29sb3IgKj0gY29sO1xuICAgICAgICBgXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAgJiYgbWF0Lm1hcC5yZXBlYXQgPyBtYXQubWFwLnJlcGVhdCA6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwICYmIG1hdC5tYXAub2Zmc2V0ID8gbWF0Lm1hcC5vZmZzZXQgOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcCAmJiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICAgICAgXG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxUaW1lID0geyB2YWx1ZTogMCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmludmVydFdhcnBDb2xvciA9IHsgdmFsdWU6IG1hdC51c2VyRGF0YS5pbnZlcnRXYXJwQ29sb3IgPyBtYXQudXNlckRhdGEuaW52ZXJ0V2FycENvbG9yIDogZmFsc2V9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFJpbmdDb2xvciA9IHsgdmFsdWU6IG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgPyBtYXQudXNlckRhdGEucmluZ0NvbG9yIDogbmV3IFRIUkVFLkNvbG9yKFwicmVkXCIpIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsQ3ViZU1hcCA9IHsgdmFsdWU6IG1hdC51c2VyRGF0YS5jdWJlTWFwID8gbWF0LnVzZXJEYXRhLmN1YmVNYXAgOiBjdWJlTWFwIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmFkaXVzID0gIHt2YWx1ZTogbWF0LnVzZXJEYXRhLnJhZGl1cyA/IG1hdC51c2VyRGF0YS5yYWRpdXMgOiAwLjV9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbEN1YmVNYXAudmFsdWUgPSBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwID8gbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcCA6IGN1YmVNYXAgXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFJhZGl1cy52YWx1ZSA9IG1hdGVyaWFsLnVzZXJEYXRhLnJhZGl1cyA/IG1hdGVyaWFsLnVzZXJEYXRhLnJhZGl1cyA6IDAuNVxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH1cbiIsIi8qKlxuICogVmFyaW91cyBzaW1wbGUgc2hhZGVyc1xuICovXG5cbi8vIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek06ICBCbGVlcHkgQmxvY2tzXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwsIERlZmF1bHRNYXRlcmlhbE1vZGlmaWVyIGFzIE1hdGVyaWFsTW9kaWZpZXIsIFNoYWRlckV4dGVuc2lvbk9wdHMgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuXG4vLyBhZGQgIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy83ZEtHenpcblxuaW1wb3J0IHsgQmxlZXB5QmxvY2tzU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ibGVlcHktYmxvY2tzLXNoYWRlcidcbmltcG9ydCB7IE5vaXNlU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ub2lzZSdcbmltcG9ydCB7IExpcXVpZE1hcmJsZVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGlxdWlkLW1hcmJsZSdcbmltcG9ydCB7IEdhbGF4eVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvZ2FsYXh5J1xuaW1wb3J0IHsgTGFjZVR1bm5lbFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGFjZS10dW5uZWwnXG5pbXBvcnQgeyBGaXJlVHVubmVsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9maXJlLXR1bm5lbCdcbmltcG9ydCB7IE1pc3RTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21pc3QnXG5pbXBvcnQgeyBNYXJibGUxU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9tYXJibGUxJ1xuaW1wb3J0IHsgTm90Rm91bmRTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL25vdC1mb3VuZCdcbmltcG9ydCB7IFdhcnBTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAnXG5pbXBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy93YXJwLXBvcnRhbCdcblxuZnVuY3Rpb24gbWFwTWF0ZXJpYWxzKG9iamVjdDNEOiBUSFJFRS5PYmplY3QzRCwgZm46IChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpID0+IHZvaWQpIHtcbiAgICBsZXQgbWVzaCA9IG9iamVjdDNEIGFzIFRIUkVFLk1lc2hcbiAgICBpZiAoIW1lc2gubWF0ZXJpYWwpIHJldHVybjtcbiAgXG4gICAgaWYgKEFycmF5LmlzQXJyYXkobWVzaC5tYXRlcmlhbCkpIHtcbiAgICAgIHJldHVybiBtZXNoLm1hdGVyaWFsLm1hcChmbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmbihtZXNoLm1hdGVyaWFsKTtcbiAgICB9XG59XG4gIFxuICAvLyBUT0RPOiAga2V5IGEgcmVjb3JkIG9mIG5ldyBtYXRlcmlhbHMsIGluZGV4ZWQgYnkgdGhlIG9yaWdpbmFsXG4gIC8vIG1hdGVyaWFsIFVVSUQsIHNvIHdlIGNhbiBqdXN0IHJldHVybiBpdCBpZiByZXBsYWNlIGlzIGNhbGxlZCBvblxuICAvLyB0aGUgc2FtZSBtYXRlcmlhbCBtb3JlIHRoYW4gb25jZVxuICBleHBvcnQgZnVuY3Rpb24gcmVwbGFjZU1hdGVyaWFsIChvbGRNYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwsIHNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uLCB1c2VyRGF0YTogYW55KTogbnVsbCB8IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCB7XG4gICAgLy8gICBpZiAob2xkTWF0ZXJpYWwudHlwZSAhPSBcIk1lc2hTdGFuZGFyZE1hdGVyaWFsXCIpIHtcbiAgICAvLyAgICAgICBjb25zb2xlLndhcm4oXCJTaGFkZXIgQ29tcG9uZW50OiBkb24ndCBrbm93IGhvdyB0byBoYW5kbGUgU2hhZGVycyBvZiB0eXBlICdcIiArIG9sZE1hdGVyaWFsLnR5cGUgKyBcIicsIG9ubHkgTWVzaFN0YW5kYXJkTWF0ZXJpYWwgYXQgdGhpcyB0aW1lLlwiKVxuICAgIC8vICAgICAgIHJldHVybjtcbiAgICAvLyAgIH1cblxuICAgICAgLy9jb25zdCBtYXRlcmlhbCA9IG9sZE1hdGVyaWFsLmNsb25lKCk7XG4gICAgICB2YXIgQ3VzdG9tTWF0ZXJpYWxcbiAgICAgIHRyeSB7XG4gICAgICAgICAgQ3VzdG9tTWF0ZXJpYWwgPSBNYXRlcmlhbE1vZGlmaWVyLmV4dGVuZCAob2xkTWF0ZXJpYWwudHlwZSwge1xuICAgICAgICAgICAgdW5pZm9ybXM6IHNoYWRlci51bmlmb3JtcyxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogc2hhZGVyLnZlcnRleFNoYWRlcixcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyOiBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgICAgICB9KVxuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIC8vIGNyZWF0ZSBhIG5ldyBtYXRlcmlhbCwgaW5pdGlhbGl6aW5nIHRoZSBiYXNlIHBhcnQgd2l0aCB0aGUgb2xkIG1hdGVyaWFsIGhlcmVcbiAgICAgIGxldCBtYXRlcmlhbCA9IG5ldyBDdXN0b21NYXRlcmlhbCgpXG5cbiAgICAgIHN3aXRjaCAob2xkTWF0ZXJpYWwudHlwZSkge1xuICAgICAgICAgIGNhc2UgXCJNZXNoU3RhbmRhcmRNYXRlcmlhbFwiOlxuICAgICAgICAgICAgICBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbC5wcm90b3R5cGUuY29weS5jYWxsKG1hdGVyaWFsLCBvbGRNYXRlcmlhbClcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIk1lc2hQaG9uZ01hdGVyaWFsXCI6XG4gICAgICAgICAgICAgIFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsLnByb3RvdHlwZS5jb3B5LmNhbGwobWF0ZXJpYWwsIG9sZE1hdGVyaWFsKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwiTWVzaEJhc2ljTWF0ZXJpYWxcIjpcbiAgICAgICAgICAgICAgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBtYXRlcmlhbC51c2VyRGF0YSA9IHVzZXJEYXRhO1xuICAgICAgbWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgc2hhZGVyLmluaXQobWF0ZXJpYWwpO1xuICAgICAgXG4gICAgICByZXR1cm4gbWF0ZXJpYWxcbiAgfVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlV2l0aFNoYWRlcihzaGFkZXJEZWY6IFNoYWRlckV4dGVuc2lvbiwgZWw6IGFueSwgdGFyZ2V0OiBzdHJpbmcsIHVzZXJEYXRhOiBhbnkgPSB7fSk6IChUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpW10ge1xuICAgIC8vIG1lc2ggd291bGQgY29udGFpbiB0aGUgb2JqZWN0IHRoYXQgaXMsIG9yIGNvbnRhaW5zLCB0aGUgbWVzaGVzXG4gICAgdmFyIG1lc2ggPSBlbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgaWYgKCFtZXNoKSB7XG4gICAgICAgIC8vIGlmIG5vIG1lc2gsIHdlJ2xsIHNlYXJjaCB0aHJvdWdoIGFsbCBvZiB0aGUgY2hpbGRyZW4uICBUaGlzIHdvdWxkXG4gICAgICAgIC8vIGhhcHBlbiBpZiB3ZSBkcm9wcGVkIHRoZSBjb21wb25lbnQgb24gYSBnbGIgaW4gc3Bva2VcbiAgICAgICAgbWVzaCA9IGVsLm9iamVjdDNEXG4gICAgfVxuICAgIFxuICAgIGxldCBtYXRlcmlhbHM6IGFueSA9IFtdXG4gICAgbGV0IHRyYXZlcnNlID0gKG9iamVjdDogVEhSRUUuT2JqZWN0M0QpID0+IHtcbiAgICAgIGxldCBtZXNoID0gb2JqZWN0IGFzIFRIUkVFLk1lc2hcbiAgICAgIGlmIChtZXNoLm1hdGVyaWFsKSB7XG4gICAgICAgICAgbWFwTWF0ZXJpYWxzKG1lc2gsIChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpID0+IHsgICAgICAgICBcbiAgICAgICAgICAgICAgaWYgKCF0YXJnZXQgfHwgbWF0ZXJpYWwubmFtZSA9PT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICBsZXQgbmV3TSA9IHJlcGxhY2VNYXRlcmlhbChtYXRlcmlhbCwgc2hhZGVyRGVmLCB1c2VyRGF0YSlcbiAgICAgICAgICAgICAgICAgIGlmIChuZXdNKSB7XG4gICAgICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01cblxuICAgICAgICAgICAgICAgICAgICAgIG1hdGVyaWFscy5wdXNoKG5ld00pXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgfVxuICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRyYXZlcnNlKG1lc2gpO1xuICAgIHJldHVybiBtYXRlcmlhbHNcbiAgfVxuXG5jb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBmb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzaGFkZXInLCB7XG4gICAgbWF0ZXJpYWxzOiBudWxsIGFzIChUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpW10gfCBudWxsLCAgXG4gICAgc2hhZGVyRGVmOiBudWxsIGFzIFNoYWRlckV4dGVuc2lvbiB8IG51bGwsXG5cbiAgICBzY2hlbWE6IHtcbiAgICAgICAgbmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJub2lzZVwiIH0sXG4gICAgICAgIHRhcmdldDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJcIiB9ICAvLyBpZiBub3RoaW5nIHBhc3NlZCwganVzdCBjcmVhdGUgc29tZSBub2lzZVxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzaGFkZXJEZWY6IFNoYWRlckV4dGVuc2lvbjtcblxuICAgICAgICBzd2l0Y2ggKHRoaXMuZGF0YS5uYW1lKSB7XG4gICAgICAgICAgICBjYXNlIFwibm9pc2VcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBOb2lzZVNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwid2FycFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IFdhcnBTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcIndhcnAtcG9ydGFsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gV2FycFBvcnRhbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwibGlxdWlkbWFyYmxlXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTGlxdWlkTWFyYmxlU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIFxuICAgICAgICAgICAgY2FzZSBcImJsZWVweWJsb2Nrc1wiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IEJsZWVweUJsb2Nrc1NoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwiZ2FsYXh5XCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gR2FsYXh5U2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJsYWNldHVubmVsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTGFjZVR1bm5lbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwiZmlyZXR1bm5lbFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IEZpcmVUdW5uZWxTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICAgICAgICBjYXNlIFwibWlzdFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE1pc3RTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcIm1hcmJsZTFcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBNYXJibGUxU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLy8gYW4gdW5rbm93biBuYW1lIHdhcyBwYXNzZWQgaW5cbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ1bmtub3duIG5hbWUgJ1wiICsgdGhpcy5kYXRhLm5hbWUgKyBcIicgcGFzc2VkIHRvIHNoYWRlciBjb21wb25lbnRcIilcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBOb3RGb3VuZFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IFxuXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICBsZXQgdXBkYXRlTWF0ZXJpYWxzID0gKCkgPT57XG4gICAgICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLnRhcmdldFxuICAgICAgICAgICAgaWYgKHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1hdGVyaWFscyA9IHVwZGF0ZVdpdGhTaGFkZXIoc2hhZGVyRGVmLCB0aGlzLmVsLCB0YXJnZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGluaXRpYWxpemVyID0gKCkgPT57XG4gICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICAgICAgbGV0IGZuID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVNYXRlcmlhbHMoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgZm4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCBmbilcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlTWF0ZXJpYWxzKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuICAgICAgICB0aGlzLnNoYWRlckRlZiA9IHNoYWRlckRlZlxuICAgIH0sXG5cblxuICB0aWNrOiBmdW5jdGlvbih0aW1lKSB7XG4gICAgaWYgKHRoaXMuc2hhZGVyRGVmID09IG51bGwgfHwgdGhpcy5tYXRlcmlhbHMgPT0gbnVsbCkgeyByZXR1cm4gfVxuXG4gICAgbGV0IHNoYWRlckRlZiA9IHRoaXMuc2hhZGVyRGVmXG4gICAgdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHtzaGFkZXJEZWYudXBkYXRlVW5pZm9ybXModGltZSwgbWF0KX0pXG4gICAgLy8gc3dpdGNoICh0aGlzLmRhdGEubmFtZSkge1xuICAgIC8vICAgICBjYXNlIFwibm9pc2VcIjpcbiAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgIC8vICAgICBjYXNlIFwiYmxlZXB5YmxvY2tzXCI6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyAgICAgZGVmYXVsdDpcbiAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgIC8vIH1cblxuICAgIC8vIGlmICh0aGlzLnNoYWRlcikge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImZyYWdtZW50IHNoYWRlcjpcIiwgdGhpcy5tYXRlcmlhbC5mcmFnbWVudFNoYWRlcilcbiAgICAvLyAgICAgdGhpcy5zaGFkZXIgPSBudWxsXG4gICAgLy8gfVxuICB9LFxufSlcblxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvMmFlYjAwYjY0YWU5NTY4Zi5qcGdcIiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzUwYTFiNmQzMzhjYjI0NmUuanBnXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2NvcmUtY29tcG9uZW50cy9hZWFiMjA5MWU0YTUzZTlkLnBuZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9jb3JlLWNvbXBvbmVudHMvMGNlNDZjNDIyZjk0NWE5Ni5qcGdcIiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzLzZhM2U4YjQzMzJkNDdjZTIuanBnXCIiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQmlkaXJlY3Rpb25hbCBzZWUtdGhyb3VnaCBwb3J0YWwuIFR3byBwb3J0YWxzIGFyZSBwYWlyZWQgYnkgY29sb3IuXG4gKlxuICogVXNhZ2VcbiAqID09PT09PT1cbiAqIEFkZCB0d28gaW5zdGFuY2VzIG9mIGBwb3J0YWwuZ2xiYCB0byB0aGUgU3Bva2Ugc2NlbmUuXG4gKiBUaGUgbmFtZSBvZiBlYWNoIGluc3RhbmNlIHNob3VsZCBsb29rIGxpa2UgXCJzb21lLWRlc2NyaXB0aXZlLWxhYmVsX19jb2xvclwiXG4gKiBBbnkgdmFsaWQgVEhSRUUuQ29sb3IgYXJndW1lbnQgaXMgYSB2YWxpZCBjb2xvciB2YWx1ZS5cbiAqIFNlZSBoZXJlIGZvciBleGFtcGxlIGNvbG9yIG5hbWVzIGh0dHBzOi8vd3d3Lnczc2Nob29scy5jb20vY3NzcmVmL2Nzc19jb2xvcnMuYXNwXG4gKlxuICogRm9yIGV4YW1wbGUsIHRvIG1ha2UgYSBwYWlyIG9mIGNvbm5lY3RlZCBibHVlIHBvcnRhbHMsXG4gKiB5b3UgY291bGQgbmFtZSB0aGVtIFwicG9ydGFsLXRvX19ibHVlXCIgYW5kIFwicG9ydGFsLWZyb21fX2JsdWVcIlxuICovXG4gaW1wb3J0ICogYXMgaHRtbENvbXBvbmVudHMgZnJvbSBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiO1xuXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcbi8vIGltcG9ydCB2ZXJ0ZXhTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwudmVydC5qcydcbi8vIGltcG9ydCBmcmFnbWVudFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC5mcmFnLmpzJ1xuLy8gaW1wb3J0IHNub2lzZSBmcm9tICcuLi9zaGFkZXJzL3Nub2lzZSdcblxuaW1wb3J0IHsgc2hvd1JlZ2lvbkZvck9iamVjdCwgaGlkZXJSZWdpb25Gb3JPYmplY3QgfSBmcm9tICcuL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tICcuLi91dGlscy9zY2VuZS1ncmFwaCdcbmltcG9ydCB7IHVwZGF0ZVdpdGhTaGFkZXIgfSBmcm9tICcuL3NoYWRlcidcbmltcG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAtcG9ydGFsLmpzJ1xuXG5pbXBvcnQgZ29sZGNvbG9yIGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0NPTE9SLmpwZydcbmltcG9ydCBnb2xkRGlzcGxhY2VtZW50IGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0RJU1AuanBnJ1xuaW1wb3J0IGdvbGRnbG9zcyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9nbG9zc2luZXNzLnBuZydcbmltcG9ydCBnb2xkbm9ybSBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9OUk0uanBnJ1xuaW1wb3J0IGdvbGRhbyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9PQ0MuanBnJ1xuXG5pbXBvcnQgeyBNYXJibGUxU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9tYXJibGUxJ1xuaW1wb3J0IHsgcmVwbGFjZU1hdGVyaWFsIGFzIHJlcGxhY2VXaXRoU2hhZGVyfSBmcm9tICcuL3NoYWRlcidcblxuY29uc3Qgd29ybGRQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZENhbWVyYVBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkRGlyID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRRdWF0ID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKVxuY29uc3QgbWF0NCA9IG5ldyBUSFJFRS5NYXRyaXg0KClcblxuLy8gbG9hZCBhbmQgc2V0dXAgYWxsIHRoZSBiaXRzIG9mIHRoZSB0ZXh0dXJlcyBmb3IgdGhlIGRvb3JcbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbmNvbnN0IGRvb3JNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7XG4gICAgY29sb3I6IDB4ZmZmZmZmLFxuICAgIG1ldGFsbmVzczogMC4wLFxuICAgIHJvdWdobmVzczogMC4wLCBcbiAgICAvL2VtaXNzaXZlSW50ZW5zaXR5OiAxXG59KVxuY29uc3QgZG9vcm1hdGVyaWFsWSA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7XG4gICAgY29sb3I6IDB4ZmZmZmZmLFxuICAgIG1ldGFsbmVzczogMC4wLFxuICAgIHJvdWdobmVzczogMCwgXG4gICAgLy9lbWlzc2l2ZUludGVuc2l0eTogMVxufSlcblxubG9hZGVyLmxvYWQoZ29sZGNvbG9yLCAoY29sb3IpID0+IHtcbiAgICBkb29yTWF0ZXJpYWwubWFwID0gY29sb3I7XG4gICAgY29sb3IucmVwZWF0LnNldCgxLDI1KVxuICAgIGNvbG9yLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgY29sb3Iud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxubG9hZGVyLmxvYWQoZ29sZGNvbG9yLCAoY29sb3IpID0+IHtcbiAgICAvL2NvbG9yID0gY29sb3IuY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkubWFwID0gY29sb3I7XG4gICAgY29sb3IucmVwZWF0LnNldCgxLDEpXG4gICAgY29sb3Iud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGNvbG9yLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkb29ybWF0ZXJpYWxZLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZERpc3BsYWNlbWVudCwgKGRpc3ApID0+IHtcbiAgICBkb29yTWF0ZXJpYWwuYnVtcE1hcCA9IGRpc3A7XG4gICAgZGlzcC5yZXBlYXQuc2V0KDEsMjUpXG4gICAgZGlzcC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRpc3Aud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkRGlzcGxhY2VtZW50LCAoZGlzcCkgPT4ge1xuICAgIC8vZGlzcCA9IGRpc3AuY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkuYnVtcE1hcCA9IGRpc3A7XG4gICAgZGlzcC5yZXBlYXQuc2V0KDEsMSlcbiAgICBkaXNwLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkaXNwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkb29ybWF0ZXJpYWxZLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZGdsb3NzLCAoZ2xvc3MpID0+IHtcbiAgICBkb29yTWF0ZXJpYWwucm91Z2huZXNzID0gZ2xvc3NcbiAgICBnbG9zcy5yZXBlYXQuc2V0KDEsMjUpXG4gICAgZ2xvc3Mud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBnbG9zcy53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRnbG9zcywgKGdsb3NzKSA9PiB7XG4gICAgLy9nbG9zcyA9IGdsb3NzLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLnJvdWdobmVzcyA9IGdsb3NzXG4gICAgZ2xvc3MucmVwZWF0LnNldCgxLDEpXG4gICAgZ2xvc3Mud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGdsb3NzLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkb29ybWF0ZXJpYWxZLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcbiAgICAgICAgIFxubG9hZGVyLmxvYWQoZ29sZGFvLCAoYW8pID0+IHtcbiAgICBkb29yTWF0ZXJpYWwuYW9NYXAgPSBhb1xuICAgIGFvLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBhby53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGFvLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcbiAgICAgICAgIFxubG9hZGVyLmxvYWQoZ29sZGFvLCAoYW8pID0+IHtcbiAgICAvLyBhbyA9IGFvLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLmFvTWFwID0gYW9cbiAgICBhby5yZXBlYXQuc2V0KDEsMSlcbiAgICBhby53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgYW8ud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkbm9ybSwgKG5vcm0pID0+IHtcbiAgICBkb29yTWF0ZXJpYWwubm9ybWFsTWFwID0gbm9ybTtcbiAgICBub3JtLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBub3JtLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9ybS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRub3JtLCAobm9ybSkgPT4ge1xuICAgIC8vIG5vcm0gPSBub3JtLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLm5vcm1hbE1hcCA9IG5vcm07XG4gICAgbm9ybS5yZXBlYXQuc2V0KDEsMSlcbiAgICBub3JtLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBub3JtLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkb29ybWF0ZXJpYWxZLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxuLy8gLy8gbWFwIGFsbCBtYXRlcmlhbHMgdmlhIGEgY2FsbGJhY2suICBUYWtlbiBmcm9tIGh1YnMgbWF0ZXJpYWxzLXV0aWxzXG4vLyBmdW5jdGlvbiBtYXBNYXRlcmlhbHMob2JqZWN0M0QsIGZuKSB7XG4vLyAgICAgbGV0IG1lc2ggPSBvYmplY3QzRCBcbi8vICAgICBpZiAoIW1lc2gubWF0ZXJpYWwpIHJldHVybjtcbiAgXG4vLyAgICAgaWYgKEFycmF5LmlzQXJyYXkobWVzaC5tYXRlcmlhbCkpIHtcbi8vICAgICAgIHJldHVybiBtZXNoLm1hdGVyaWFsLm1hcChmbik7XG4vLyAgICAgfSBlbHNlIHtcbi8vICAgICAgIHJldHVybiBmbihtZXNoLm1hdGVyaWFsKTtcbi8vICAgICB9XG4vLyB9XG4gIFxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdwb3J0YWwnLCB7XG4gIGRlcGVuZGVuY2llczogWydmYWRlci1wbHVzJ10sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIgPSB0aGlzLmVsLnN5c3RlbXNbJ2h1YnMtc3lzdGVtcyddLmNoYXJhY3RlckNvbnRyb2xsZXJcbiAgICB0aGlzLmZhZGVyID0gdGhpcy5lbC5zeXN0ZW1zWydmYWRlci1wbHVzJ11cbiAgICB0aGlzLnJvb21EYXRhID0gbnVsbFxuICAgIHRoaXMud2FpdEZvckZldGNoID0gdGhpcy53YWl0Rm9yRmV0Y2guYmluZCh0aGlzKVxuXG4gICAgLy8gaWYgdGhlIHVzZXIgaXMgbG9nZ2VkIGluLCB3ZSB3YW50IHRvIHJldHJpZXZlIHRoZWlyIHVzZXJEYXRhIGZyb20gdGhlIHRvcCBsZXZlbCBzZXJ2ZXJcbiAgICBpZiAod2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscyAmJiB3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzLnRva2VuICYmICF3aW5kb3cuQVBQLnVzZXJEYXRhKSB7XG4gICAgICAgIHRoaXMuZmV0Y2hSb29tRGF0YSgpXG4gICAgfVxuICB9LFxuICBmZXRjaFJvb21EYXRhOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBhcmFtcyA9IHt0b2tlbjogd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbixcbiAgICAgICAgICAgICAgICAgIHJvb21faWQ6IHdpbmRvdy5BUFAuaHViQ2hhbm5lbC5odWJJZH1cblxuICAgIGNvbnN0IG9wdGlvbnMgPSB7fTtcbiAgICBvcHRpb25zLmhlYWRlcnMgPSBuZXcgSGVhZGVycygpO1xuICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJBdXRob3JpemF0aW9uXCIsIGBCZWFyZXIgJHtwYXJhbXN9YCk7XG4gICAgb3B0aW9ucy5oZWFkZXJzLnNldChcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gICAgYXdhaXQgZmV0Y2goXCJodHRwczovL3JlYWxpdHltZWRpYS5kaWdpdGFsL3VzZXJEYXRhXCIsIG9wdGlvbnMpXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1N1Y2Nlc3M6JywgZGF0YSk7XG4gICAgICAgICAgdGhpcy5yb29tRGF0YSA9IGRhdGE7XG4gICAgfSlcbiAgICB0aGlzLnJvb21EYXRhLnRleHR1cmVzID0gW11cbiAgfSxcbiAgZ2V0Um9vbVVSTDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgLy9yZXR1cm4gdGhpcy5yb29tRGF0YS5yb29tcy5sZW5ndGggPiBudW1iZXIgPyBcImh0dHBzOi8veHIucmVhbGl0eW1lZGlhLmRpZ2l0YWwvXCIgKyB0aGlzLnJvb21EYXRhLnJvb21zW251bWJlcl0gOiBudWxsO1xuICAgICAgbGV0IHVybCA9IHdpbmRvdy5TU08udXNlckluZm8ucm9vbXMubGVuZ3RoID4gbnVtYmVyID8gXCJodHRwczovL3hyLnJlYWxpdHltZWRpYS5kaWdpdGFsL1wiICsgd2luZG93LlNTTy51c2VySW5mby5yb29tc1tudW1iZXJdIDogbnVsbDtcbiAgICAgIHJldHVybiB1cmxcbiAgfSxcbiAgZ2V0Q3ViZU1hcDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgICAgdGhpcy53YWl0Rm9yRmV0Y2goKVxuICAgICAgcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgd2FpdEZvckZldGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgIGlmICh0aGlzLnJvb21EYXRhICYmIHdpbmRvdy5TU08udXNlckluZm8pIHJldHVyblxuICAgICBzZXRUaW1lb3V0KHRoaXMud2FpdEZvckZldGNoLCAxMDApOyAvLyB0cnkgYWdhaW4gaW4gMTAwIG1pbGxpc2Vjb25kc1xuICB9LFxuICB0ZWxlcG9ydFRvOiBhc3luYyBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IHRydWVcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVPdXQoKVxuICAgIC8vIFNjYWxlIHNjcmV3cyB1cCB0aGUgd2F5cG9pbnQgbG9naWMsIHNvIGp1c3Qgc2VuZCBwb3NpdGlvbiBhbmQgb3JpZW50YXRpb25cbiAgICBvYmplY3QuZ2V0V29ybGRRdWF0ZXJuaW9uKHdvcmxkUXVhdClcbiAgICBvYmplY3QuZ2V0V29ybGREaXJlY3Rpb24od29ybGREaXIpXG4gICAgb2JqZWN0LmdldFdvcmxkUG9zaXRpb24od29ybGRQb3MpXG4gICAgd29ybGRQb3MuYWRkKHdvcmxkRGlyLm11bHRpcGx5U2NhbGFyKDMpKSAvLyBUZWxlcG9ydCBpbiBmcm9udCBvZiB0aGUgcG9ydGFsIHRvIGF2b2lkIGluZmluaXRlIGxvb3BcbiAgICBtYXQ0Lm1ha2VSb3RhdGlvbkZyb21RdWF0ZXJuaW9uKHdvcmxkUXVhdClcbiAgICBtYXQ0LnNldFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgIC8vIFVzaW5nIHRoZSBjaGFyYWN0ZXJDb250cm9sbGVyIGVuc3VyZXMgd2UgZG9uJ3Qgc3RyYXkgZnJvbSB0aGUgbmF2bWVzaFxuICAgIHRoaXMuY2hhcmFjdGVyQ29udHJvbGxlci50cmF2ZWxCeVdheXBvaW50KG1hdDQsIHRydWUsIGZhbHNlKVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZUluKClcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywge1xuICBzY2hlbWE6IHtcbiAgICBwb3J0YWxUeXBlOiB7IGRlZmF1bHQ6IFwiXCIgfSxcbiAgICBwb3J0YWxUYXJnZXQ6IHsgZGVmYXVsdDogXCJcIiB9LFxuICAgIHNlY29uZGFyeVRhcmdldDogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogbnVsbCB9LFxuICAgIG1hdGVyaWFsVGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH0sXG4gICAgZHJhd0Rvb3I6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiBmYWxzZSB9LFxuICAgIG1haW5UZXh0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsfSxcbiAgICBzZWNvbmRhcnlUZXh0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsfVxuICB9LFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG5cbiAgICAvLyBURVNUSU5HXG4gICAgLy90aGlzLmRhdGEuZHJhd0Rvb3IgPSB0cnVlXG4gICAgLy8gdGhpcy5kYXRhLm1haW5UZXh0ID0gXCJQb3J0YWwgdG8gdGhlIEFieXNzXCJcbiAgICAvLyB0aGlzLmRhdGEuc2Vjb25kYXJ5VGV4dCA9IFwiVG8gdmlzaXQgdGhlIEFieXNzLCBnbyB0aHJvdWdoIHRoZSBkb29yIVwiXG5cbiAgICAvLyBBLUZyYW1lIGlzIHN1cHBvc2VkIHRvIGRvIHRoaXMgYnkgZGVmYXVsdCBidXQgZG9lc24ndCBzZWVtIHRvP1xuICAgIHRoaXMuc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zLnBvcnRhbCBcblxuICAgIGlmICh0aGlzLmRhdGEucG9ydGFsVHlwZS5sZW5ndGggPiAwICkge1xuICAgICAgICB0aGlzLnNldFBvcnRhbEluZm8odGhpcy5kYXRhLnBvcnRhbFR5cGUsIHRoaXMuZGF0YS5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5jb2xvcilcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgfVxuXG4gICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAwKSB7XG4gICAgICAgIC8vIHBhcnNlIHRoZSBuYW1lIHRvIGdldCBwb3J0YWwgdHlwZSwgdGFyZ2V0LCBhbmQgY29sb3JcbiAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKClcbiAgICB9XG4gICAgXG4gICAgLy8gd2FpdCB1bnRpbCB0aGUgc2NlbmUgbG9hZHMgdG8gZmluaXNoLiAgV2Ugd2FudCB0byBtYWtlIHN1cmUgZXZlcnl0aGluZ1xuICAgIC8vIGlzIGluaXRpYWxpemVkXG4gICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIChldikgPT4geyBcbiAgICAgICAgdGhpcy5pbml0aWFsaXplKClcbiAgICB9KTtcbiAgfSxcblxuICBpbml0aWFsaXplOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgLy8gdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgLy8gICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAvLyAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgLy8gICB1bmlmb3Jtczoge1xuICAgIC8vICAgICBjdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuVGV4dHVyZSgpIH0sXG4gICAgLy8gICAgIHRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAvLyAgICAgcmFkaXVzOiB7IHZhbHVlOiAwIH0sXG4gICAgLy8gICAgIHJpbmdDb2xvcjogeyB2YWx1ZTogdGhpcy5jb2xvciB9LFxuICAgIC8vICAgfSxcbiAgICAvLyAgIHZlcnRleFNoYWRlcixcbiAgICAvLyAgIGZyYWdtZW50U2hhZGVyOiBgXG4gICAgLy8gICAgICR7c25vaXNlfVxuICAgIC8vICAgICAke2ZyYWdtZW50U2hhZGVyfVxuICAgIC8vICAgYCxcbiAgICAvLyB9KVxuXG4gICAgLy8gQXNzdW1lIHRoYXQgdGhlIG9iamVjdCBoYXMgYSBwbGFuZSBnZW9tZXRyeVxuICAgIC8vY29uc3QgbWVzaCA9IHRoaXMuZWwuZ2V0T3JDcmVhdGVPYmplY3QzRCgnbWVzaCcpXG4gICAgLy9tZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuXG4gICAgdGhpcy5tYXRlcmlhbHMgPSBudWxsXG4gICAgdGhpcy5yYWRpdXMgPSAwLjJcbiAgICB0aGlzLmN1YmVNYXAgPSBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKVxuXG4gICAgLy8gZ2V0IHRoZSBvdGhlciBiZWZvcmUgY29udGludWluZ1xuICAgIHRoaXMub3RoZXIgPSBhd2FpdCB0aGlzLmdldE90aGVyKClcblxuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhbmltYXRpb25fX3BvcnRhbCcsIHtcbiAgICAgICAgcHJvcGVydHk6ICdjb21wb25lbnRzLnBvcnRhbC5yYWRpdXMnLFxuICAgICAgICBkdXI6IDcwMCxcbiAgICAgICAgZWFzaW5nOiAnZWFzZUluT3V0Q3ViaWMnLFxuICAgIH0pXG5cbiAgICAvLyB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmJlZ2luJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHRydWUpKVxuICAgIC8vIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcignYW5pbWF0aW9uY29tcGxldGVfX3BvcnRhbCcsICgpID0+ICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSAhdGhpcy5pc0Nsb3NlZCgpKSlcblxuICAgIC8vIGdvaW5nIHRvIHdhbnQgdG8gdHJ5IGFuZCBtYWtlIHRoZSBvYmplY3QgdGhpcyBwb3J0YWwgaXMgb24gY2xpY2thYmxlXG4gICAgLy8gdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgIC8vIHRoaXMuZWwuc2V0QXR0cmlidXRlKCd0YWdzJywge3NpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZX0pXG4gICAgLy90aGlzLmVsLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuICAgIC8vIG9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIHBvcnRhbCBtb3ZlbWVudCBcbiAgICAvL3RoaXMuZm9sbG93UG9ydGFsID0gdGhpcy5mb2xsb3dQb3J0YWwuYmluZCh0aGlzKVxuICAgIC8vdGhpcy5lbC5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuZm9sbG93UG9ydGFsKVxuXG4gICAgaWYgKCB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0gfHwgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtaW1hZ2VcIl0gKSB7XG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwUG9ydGFsKCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5kcmF3RG9vcikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsIGZuKVxuICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCBmbilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5kcmF3RG9vcikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBEb29yKCk7XG4gICAgICAgICAgICB9XG4gICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKVxuICAgICAgICBpZiAodGhpcy5kYXRhLmRyYXdEb29yKSB7XG4gICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICB9XG4gICAgfVxuICB9LFxuXG4gICAgc2V0dXBQb3J0YWw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMuZGF0YS5tYXRlcmlhbFRhcmdldFxuICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgIFxuICAgICAgICB0aGlzLm1hdGVyaWFscyA9IHVwZGF0ZVdpdGhTaGFkZXIoV2FycFBvcnRhbFNoYWRlciwgdGhpcy5lbCwgdGFyZ2V0LCB7XG4gICAgICAgICAgICByYWRpdXM6IHRoaXMucmFkaXVzLFxuICAgICAgICAgICAgcmluZ0NvbG9yOiB0aGlzLmNvbG9yLFxuICAgICAgICAgICAgY3ViZU1hcDogdGhpcy5jdWJlTWFwLFxuICAgICAgICAgICAgaW52ZXJ0V2FycENvbG9yOiB0aGlzLnBvcnRhbFR5cGUgPT0gMSA/IDEgOiAwXG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRDdWJlTWFwKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKCB1cmxzID0+IHtcbiAgICAgICAgICAgICAgICAvL2NvbnN0IHVybHMgPSBbY3ViZU1hcFBvc1gsIGN1YmVNYXBOZWdYLCBjdWJlTWFwUG9zWSwgY3ViZU1hcE5lZ1ksIGN1YmVNYXBQb3NaLCBjdWJlTWFwTmVnWl07XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuQ3ViZVRleHR1cmVMb2FkZXIoKS5sb2FkKHVybHMsIHJlc29sdmUsIHVuZGVmaW5lZCwgcmVqZWN0KVxuICAgICAgICAgICAgICAgICkudGhlbih0ZXh0dXJlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGV4dHVyZTtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGV4dHVyZTt9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVNYXAgPSB0ZXh0dXJlXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGUpKSAgICBcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIgfHwgdGhpcy5wb3J0YWxUeXBlID09IDMpIHsgICAgXG4gICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEgPSBuZXcgVEhSRUUuQ3ViZUNhbWVyYSgwLjEsIDEwMDAsIDEwMDApXG4gICAgICAgICAgICAvL3RoaXMuY3ViZUNhbWVyYS5yb3RhdGVZKE1hdGguUEkpIC8vIEZhY2UgZm9yd2FyZHNcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikge1xuICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgICAgICAgICAvLyB0aGlzLm90aGVyLmNvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFsLnVuaWZvcm1zLmN1YmVNYXAudmFsdWUgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmUgXG4gICAgICAgICAgICAgICAgLy90aGlzLm90aGVyLmNvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCB3YXlwb2ludCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUodGhpcy5wb3J0YWxUYXJnZXQpXG4gICAgICAgICAgICAgICAgaWYgKHdheXBvaW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnQgPSB3YXlwb2ludC5pdGVtKDApXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS5wb3NpdGlvbi55ID0gMS42XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIHdheXBvaW50Lm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgc2hvd1JlZ2lvbkZvck9iamVjdCh0aGlzLmVsKVxuICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS51cGRhdGUodGhpcy5lbC5zY2VuZUVsLnJlbmRlcmVyLCB0aGlzLmVsLnNjZW5lRWwub2JqZWN0M0QpXG4gICAgICAgICAgICAgICAgaGlkZXJSZWdpb25Gb3JPYmplY3QodGhpcy5lbClcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgdGhpcy5Zb2Zmc2V0ID0gLShzY2FsZU0ueSAqIHNjYWxlSS55IC8gMikgKyAxLjZcblxuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgncHJveGltaXR5LWV2ZW50cycsIHsgcmFkaXVzOiA0LCBZb2Zmc2V0OiB0aGlzLllvZmZzZXQgfSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHllbnRlcicsICgpID0+IHRoaXMub3BlbigpKVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5jbG9zZSgpKVxuICAgIFxuICAgICAgICB2YXIgdGl0bGVTY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgd2lkdGg6IDMwMCxcbiAgICAgICAgICAgIGhlaWdodDogNTAsXG4gICAgICAgICAgICBtZXNzYWdlOiB0aGlzLmRhdGEubWFpblRleHRcbiAgICAgICAgfVxuICAgICAgICB2YXIgc3VidGl0bGVTY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgd2lkdGg6IDMwMCxcbiAgICAgICAgICAgIGhlaWdodDogNTAsXG4gICAgICAgICAgICBtZXNzYWdlOiB0aGlzLmRhdGEuc2Vjb25kYXJ5VGV4dFxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBvcnRhbFRpdGxlID0gaHRtbENvbXBvbmVudHNbXCJQb3J0YWxUaXRsZVwiXVxuICAgICAgICBjb25zdCBwb3J0YWxTdWJ0aXRsZSA9IGh0bWxDb21wb25lbnRzW1wiUG9ydGFsU3VidGl0bGVcIl1cblxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlID0gcG9ydGFsVGl0bGUodGl0bGVTY3JpcHREYXRhKVxuICAgICAgICB0aGlzLnBvcnRhbFN1YnRpdGxlID0gcG9ydGFsU3VidGl0bGUoc3VidGl0bGVTY3JpcHREYXRhKVxuXG4gICAgICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoJ3BvcnRhbFRpdGxlJywgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNEKVxuICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QucG9zaXRpb24ueSA9IDAuNzVcbiAgICAgICAgdGhpcy5lbC5zZXRPYmplY3QzRCgncG9ydGFsU3VidGl0bGUnLCB0aGlzLnBvcnRhbFN1YnRpdGxlLndlYkxheWVyM0QpXG4gICAgICAgIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi54ID0gMVxuICAgICAgICB0aGlzLmVsLnNldE9iamVjdDNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICB0aGlzLnBvcnRhbFN1YnRpdGxlLndlYkxheWVyM0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcblxuICAgICAgICAvLyB0aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge1xuICAgICAgICAvLyAgICAgbWF0LnVzZXJEYXRhLnJhZGl1cyA9IHRoaXMucmFkaXVzXG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEucmluZ0NvbG9yID0gdGhpcy5jb2xvclxuICAgICAgICAvLyAgICAgbWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0aGlzLmN1YmVNYXBcbiAgICAgICAgLy8gfSlcbiAgICB9LFxuICAgICAgICAvLyAgIHJlcGxhY2VNYXRlcmlhbDogZnVuY3Rpb24gKG5ld01hdGVyaWFsKSB7XG4vLyAgICAgbGV0IHRhcmdldCA9IHRoaXMuZGF0YS5tYXRlcmlhbFRhcmdldFxuLy8gICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0Lmxlbmd0aCA9PSAwKSB7dGFyZ2V0PW51bGx9XG4gICAgXG4vLyAgICAgbGV0IHRyYXZlcnNlID0gKG9iamVjdCkgPT4ge1xuLy8gICAgICAgbGV0IG1lc2ggPSBvYmplY3Rcbi8vICAgICAgIGlmIChtZXNoLm1hdGVyaWFsKSB7XG4vLyAgICAgICAgICAgbWFwTWF0ZXJpYWxzKG1lc2gsIChtYXRlcmlhbCkgPT4geyAgICAgICAgIFxuLy8gICAgICAgICAgICAgICBpZiAoIXRhcmdldCB8fCBtYXRlcmlhbC5uYW1lID09PSB0YXJnZXQpIHtcbi8vICAgICAgICAgICAgICAgICAgIG1lc2gubWF0ZXJpYWwgPSBuZXdNYXRlcmlhbFxuLy8gICAgICAgICAgICAgICB9XG4vLyAgICAgICAgICAgfSlcbi8vICAgICAgIH1cbi8vICAgICAgIGNvbnN0IGNoaWxkcmVuID0gb2JqZWN0LmNoaWxkcmVuO1xuLy8gICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuLy8gICAgICAgICAgIHRyYXZlcnNlKGNoaWxkcmVuW2ldKTtcbi8vICAgICAgIH1cbi8vICAgICB9XG5cbi8vICAgICBsZXQgcmVwbGFjZU1hdGVyaWFscyA9ICgpID0+IHtcbi8vICAgICAgICAgLy8gbWVzaCB3b3VsZCBjb250YWluIHRoZSBvYmplY3QgdGhhdCBpcywgb3IgY29udGFpbnMsIHRoZSBtZXNoZXNcbi8vICAgICAgICAgdmFyIG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbi8vICAgICAgICAgaWYgKCFtZXNoKSB7XG4vLyAgICAgICAgICAgICAvLyBpZiBubyBtZXNoLCB3ZSdsbCBzZWFyY2ggdGhyb3VnaCBhbGwgb2YgdGhlIGNoaWxkcmVuLiAgVGhpcyB3b3VsZFxuLy8gICAgICAgICAgICAgLy8gaGFwcGVuIGlmIHdlIGRyb3BwZWQgdGhlIGNvbXBvbmVudCBvbiBhIGdsYiBpbiBzcG9rZVxuLy8gICAgICAgICAgICAgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0Rcbi8vICAgICAgICAgfVxuLy8gICAgICAgICB0cmF2ZXJzZShtZXNoKTtcbi8vICAgICAgICAvLyB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuLy8gICAgIH1cblxuLy8gICAgIC8vIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuLy8gICAgIC8vIGxldCBpbml0aWFsaXplciA9ICgpID0+e1xuLy8gICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuLy8gICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCByZXBsYWNlTWF0ZXJpYWxzKVxuLy8gICAgICAgfSBlbHNlIHtcbi8vICAgICAgICAgICByZXBsYWNlTWF0ZXJpYWxzKClcbi8vICAgICAgIH1cbi8vICAgICAvLyB9O1xuLy8gICAgIC8vcmVwbGFjZU1hdGVyaWFscygpXG4vLyAgICAgLy8gcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGluaXRpYWxpemVyKTtcbi8vICAgfSxcblxuLy8gICBmb2xsb3dQb3J0YWw6IGZ1bmN0aW9uKCkge1xuLy8gICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSkge1xuLy8gICAgICAgICBjb25zb2xlLmxvZyhcInNldCB3aW5kb3cubG9jYXRpb24uaHJlZiB0byBcIiArIHRoaXMub3RoZXIpXG4vLyAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdGhpcy5vdGhlclxuLy8gICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikge1xuLy8gICAgICAgICB0aGlzLnN5c3RlbS50ZWxlcG9ydFRvKHRoaXMub3RoZXIub2JqZWN0M0QpXG4vLyAgICAgICB9XG4vLyAgIH0sXG5cbiAgc2V0dXBEb29yOiBmdW5jdGlvbigpIHtcbiAgICAgICAgLy8gYXR0YWNoZWQgdG8gYW4gaW1hZ2UgaW4gc3Bva2UuICBUaGlzIGlzIHRoZSBvbmx5IHdheSB3ZSBhbGxvdyBidWlkbGluZyBhIFxuICAgICAgICAvLyBkb29yIGFyb3VuZCBpdFxuICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgdmFyIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICB2YXIgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICB2YXIgZGVwdGggPSAxLjA7IC8vICBzY2FsZU0ueiAqIHNjYWxlSS56XG5cbiAgICAgICAgY29uc3QgZW52aXJvbm1lbnRNYXBDb21wb25lbnQgPSB0aGlzLmVsLnNjZW5lRWwuY29tcG9uZW50c1tcImVudmlyb25tZW50LW1hcFwiXTtcblxuICAgICAgICAvLyBsZXQgYWJvdmUgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgLy8gICAgIG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSgxLCA1MCwgNTApLFxuICAgICAgICAvLyAgICAgZG9vcm1hdGVyaWFsWSBcbiAgICAgICAgLy8gKTtcbiAgICAgICAgLy8gaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgIC8vICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKGFib3ZlKTtcbiAgICAgICAgLy8gfVxuICAgICAgICAvLyBhYm92ZS5wb3NpdGlvbi5zZXQoMCwgMi41LCAwKVxuICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmFkZChhYm92ZSlcblxuICAgICAgICBsZXQgbGVmdCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgLy8gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwyL2hlaWdodCwwLjEvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwxLDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29ybWF0ZXJpYWxZLCBkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWxdLCBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAobGVmdCk7XG4gICAgICAgIH1cbiAgICAgICAgbGVmdC5wb3NpdGlvbi5zZXQoLTAuNTEsIDAsIDApXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKGxlZnQpXG5cbiAgICAgICAgbGV0IHJpZ2h0ID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMC4xL3dpZHRoLDEsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIFtkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsLGRvb3JtYXRlcmlhbFksIGRvb3JtYXRlcmlhbFksZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbF0sIFxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcChyaWdodCk7XG4gICAgICAgIH1cbiAgICAgICAgcmlnaHQucG9zaXRpb24uc2V0KDAuNTEsIDAsIDApXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHJpZ2h0KVxuXG4gICAgICAgIGxldCB0b3AgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxICsgMC4zL3dpZHRoLDAuMS9oZWlnaHQsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIFtkb29ybWF0ZXJpYWxZLGRvb3JtYXRlcmlhbFksZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKHRvcCk7XG4gICAgICAgIH1cbiAgICAgICAgdG9wLnBvc2l0aW9uLnNldCgwLjAsIDAuNTA1LCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0b3ApXG5cbiAgICAgICAgLy8gaWYgKHdpZHRoID4gMCAmJiBoZWlnaHQgPiAwKSB7XG4gICAgICAgIC8vICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAvLyAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgIC8vICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgLy8gfVxuICB9LFxuXG4gIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgLy90aGlzLm1hdGVyaWFsLnVuaWZvcm1zLnRpbWUudmFsdWUgPSB0aW1lIC8gMTAwMFxuICAgIGlmICghdGhpcy5tYXRlcmlhbHMpIHsgcmV0dXJuIH1cblxuICAgIHRoaXMucG9ydGFsVGl0bGUudGljayh0aW1lKVxuICAgIHRoaXMucG9ydGFsU3VidGl0bGUudGljayh0aW1lKVxuXG4gICAgdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHtcbiAgICAgICAgbWF0LnVzZXJEYXRhLnJhZGl1cyA9IHRoaXMucmFkaXVzXG4gICAgICAgIG1hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlTWFwXG4gICAgICAgIFdhcnBQb3J0YWxTaGFkZXIudXBkYXRlVW5pZm9ybXModGltZSwgbWF0KVxuICAgIH0pXG5cbiAgICBpZiAodGhpcy5vdGhlciAmJiAhdGhpcy5zeXN0ZW0udGVsZXBvcnRpbmcpIHtcbiAgICAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAgIHRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYVBvcykgLSB0aGlzLllvZmZzZXRcbiAgICAgIGNvbnN0IGRpc3QgPSB3b3JsZENhbWVyYVBvcy5kaXN0YW5jZVRvKHdvcmxkUG9zKVxuXG4gICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEgJiYgZGlzdCA8IDAuNSkge1xuICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiAmJiBkaXN0IDwgMC41KSB7XG4gICAgICAgIHRoaXMuc3lzdGVtLnRlbGVwb3J0VG8odGhpcy5vdGhlci5vYmplY3QzRClcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDMpIHtcbiAgICAgICAgICBpZiAoZGlzdCA8IDAuNSkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmxvY2F0aW9uaHJlZikge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInNldCB3aW5kb3cubG9jYXRpb24uaGFzaCB0byBcIiArIHRoaXMub3RoZXIpXG4gICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHRoaXMub3RoZXJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBpZiB3ZSBzZXQgbG9jYXRpb25ocmVmLCB3ZSB0ZWxlcG9ydGVkLiAgd2hlbiBpdFxuICAgICAgICAgICAgICAvLyBmaW5hbGx5IGhhcHBlbnMsIGFuZCB3ZSBtb3ZlIG91dHNpZGUgdGhlIHJhbmdlIG9mIHRoZSBwb3J0YWwsXG4gICAgICAgICAgICAgIC8vIHdlIHdpbGwgY2xlYXIgdGhlIGZsYWdcbiAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSBudWxsXG4gICAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSxcblxuICBnZXRPdGhlcjogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHJlc29sdmUobnVsbClcbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSAgPT0gMSkge1xuICAgICAgICAgICAgLy8gdGhlIHRhcmdldCBpcyBhbm90aGVyIHJvb20sIHJlc29sdmUgd2l0aCB0aGUgVVJMIHRvIHRoZSByb29tXG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRSb29tVVJMKHRoaXMucG9ydGFsVGFyZ2V0KS50aGVuKHVybCA9PiB7IFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0ICYmIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCArIFwiI1wiICsgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCkgXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDMpIHtcbiAgICAgICAgICAgIHJlc29sdmUgKFwiI1wiICsgdGhpcy5wb3J0YWxUYXJnZXQpXG4gICAgICAgIH1cblxuICAgICAgICAvLyBub3cgZmluZCB0aGUgcG9ydGFsIHdpdGhpbiB0aGUgcm9vbS4gIFRoZSBwb3J0YWxzIHNob3VsZCBjb21lIGluIHBhaXJzIHdpdGggdGhlIHNhbWUgcG9ydGFsVGFyZ2V0XG4gICAgICAgIGNvbnN0IHBvcnRhbHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtwb3J0YWxdYCkpXG4gICAgICAgIGNvbnN0IG90aGVyID0gcG9ydGFscy5maW5kKChlbCkgPT4gZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVHlwZSA9PSB0aGlzLnBvcnRhbFR5cGUgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwuY29tcG9uZW50cy5wb3J0YWwucG9ydGFsVGFyZ2V0ID09PSB0aGlzLnBvcnRhbFRhcmdldCAmJiBlbCAhPT0gdGhpcy5lbClcbiAgICAgICAgaWYgKG90aGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIENhc2UgMTogVGhlIG90aGVyIHBvcnRhbCBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgcmVzb2x2ZShvdGhlcik7XG4gICAgICAgICAgICBvdGhlci5lbWl0KCdwYWlyJywgeyBvdGhlcjogdGhpcy5lbCB9KSAvLyBMZXQgdGhlIG90aGVyIGtub3cgdGhhdCB3ZSdyZSByZWFkeVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2FzZSAyOiBXZSBjb3VsZG4ndCBmaW5kIHRoZSBvdGhlciBwb3J0YWwsIHdhaXQgZm9yIGl0IHRvIHNpZ25hbCB0aGF0IGl0J3MgcmVhZHlcbiAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncGFpcicsIChldmVudCkgPT4gcmVzb2x2ZShldmVudC5kZXRhaWwub3RoZXIpLCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgfVxuICAgIH0pXG4gIH0sXG5cbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnN0IG5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIGVpdGhlciBcbiAgICAgICAgLy8gLSBcInJvb21fbmFtZV9jb2xvclwiXG4gICAgICAgIC8vIC0gXCJwb3J0YWxfTl9jb2xvclwiIFxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuIE51bWJlcmVkIHBvcnRhbHMgc2hvdWxkIGNvbWUgaW4gcGFpcnMuXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IG5vZGVOYW1lLm1hdGNoKC8oW0EtWmEtel0qKV8oW0EtWmEtejAtOV0qKV8oW0EtWmEtejAtOV0qKSQvKVxuICAgICAgICBcbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDQsIGZpcnN0IG1hdGNoIGlzIHRoZSBwb3J0YWwgdHlwZSxcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBuYW1lIG9yIG51bWJlciwgYW5kIGxhc3QgaXMgdGhlIGNvbG9yXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCA0KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJwb3J0YWwgbm9kZSBuYW1lIG5vdCBmb3JtZWQgY29ycmVjdGx5OiBcIiwgbm9kZU5hbWUpXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgICAgIHRoaXMuY29sb3IgPSBcInJlZFwiIC8vIGRlZmF1bHQgc28gdGhlIHBvcnRhbCBoYXMgYSBjb2xvciB0byB1c2VcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBcbiAgICAgICAgdGhpcy5zZXRQb3J0YWxJbmZvKHBhcmFtc1sxXSwgcGFyYW1zWzJdLCBwYXJhbXNbM10pXG4gICAgfSxcblxuICAgIHNldFBvcnRhbEluZm86IGZ1bmN0aW9uKHBvcnRhbFR5cGUsIHBvcnRhbFRhcmdldCwgY29sb3IpIHtcbiAgICAgICAgaWYgKHBvcnRhbFR5cGUgPT09IFwicm9vbVwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAxO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwYXJzZUludChwb3J0YWxUYXJnZXQpXG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJwb3J0YWxcIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMjtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcG9ydGFsVGFyZ2V0XG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJ3YXlwb2ludFwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAzO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwb3J0YWxUYXJnZXRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDA7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgfSBcbiAgICAgICAgdGhpcy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcihjb2xvcilcbiAgICB9LFxuXG4gICAgc2V0UmFkaXVzKHZhbCkge1xuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnYW5pbWF0aW9uX19wb3J0YWwnLCB7XG4gICAgICAgIC8vICAgZnJvbTogdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5yYWRpdXMudmFsdWUsXG4gICAgICAgICAgICBmcm9tOiB0aGlzLnJhZGl1cyxcbiAgICAgICAgICAgIHRvOiB2YWwsXG4gICAgICAgIH0pXG4gICAgfSxcbiAgICBvcGVuKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygxKVxuICAgIH0sXG4gICAgY2xvc2UoKSB7XG4gICAgICAgIHRoaXMuc2V0UmFkaXVzKDAuMilcbiAgICB9LFxuICAgIGlzQ2xvc2VkKCkge1xuICAgICAgICAvLyByZXR1cm4gdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5yYWRpdXMudmFsdWUgPT09IDBcbiAgICAgICAgcmV0dXJuIHRoaXMucmFkaXVzID09PSAwLjJcbiAgICB9LFxufSlcbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvY29yZS1jb21wb25lbnRzL2UxNzAyZWEyMWFmYjRhODYucG5nXCIiLCJjb25zdCBnbHNsID0gYFxudmFyeWluZyB2ZWMyIGJhbGx2VXY7XG52YXJ5aW5nIHZlYzMgYmFsbHZQb3NpdGlvbjtcbnZhcnlpbmcgdmVjMyBiYWxsdk5vcm1hbDtcbnZhcnlpbmcgdmVjMyBiYWxsdldvcmxkUG9zO1xudW5pZm9ybSBmbG9hdCBiYWxsVGltZTtcbnVuaWZvcm0gZmxvYXQgc2VsZWN0ZWQ7XG5cbm1hdDQgYmFsbGludmVyc2UobWF0NCBtKSB7XG4gIGZsb2F0XG4gICAgICBhMDAgPSBtWzBdWzBdLCBhMDEgPSBtWzBdWzFdLCBhMDIgPSBtWzBdWzJdLCBhMDMgPSBtWzBdWzNdLFxuICAgICAgYTEwID0gbVsxXVswXSwgYTExID0gbVsxXVsxXSwgYTEyID0gbVsxXVsyXSwgYTEzID0gbVsxXVszXSxcbiAgICAgIGEyMCA9IG1bMl1bMF0sIGEyMSA9IG1bMl1bMV0sIGEyMiA9IG1bMl1bMl0sIGEyMyA9IG1bMl1bM10sXG4gICAgICBhMzAgPSBtWzNdWzBdLCBhMzEgPSBtWzNdWzFdLCBhMzIgPSBtWzNdWzJdLCBhMzMgPSBtWzNdWzNdLFxuXG4gICAgICBiMDAgPSBhMDAgKiBhMTEgLSBhMDEgKiBhMTAsXG4gICAgICBiMDEgPSBhMDAgKiBhMTIgLSBhMDIgKiBhMTAsXG4gICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICBiMDMgPSBhMDEgKiBhMTIgLSBhMDIgKiBhMTEsXG4gICAgICBiMDQgPSBhMDEgKiBhMTMgLSBhMDMgKiBhMTEsXG4gICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICBiMDYgPSBhMjAgKiBhMzEgLSBhMjEgKiBhMzAsXG4gICAgICBiMDcgPSBhMjAgKiBhMzIgLSBhMjIgKiBhMzAsXG4gICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICBiMDkgPSBhMjEgKiBhMzIgLSBhMjIgKiBhMzEsXG4gICAgICBiMTAgPSBhMjEgKiBhMzMgLSBhMjMgKiBhMzEsXG4gICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzIsXG5cbiAgICAgIGRldCA9IGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcblxuICByZXR1cm4gbWF0NChcbiAgICAgIGExMSAqIGIxMSAtIGExMiAqIGIxMCArIGExMyAqIGIwOSxcbiAgICAgIGEwMiAqIGIxMCAtIGEwMSAqIGIxMSAtIGEwMyAqIGIwOSxcbiAgICAgIGEzMSAqIGIwNSAtIGEzMiAqIGIwNCArIGEzMyAqIGIwMyxcbiAgICAgIGEyMiAqIGIwNCAtIGEyMSAqIGIwNSAtIGEyMyAqIGIwMyxcbiAgICAgIGExMiAqIGIwOCAtIGExMCAqIGIxMSAtIGExMyAqIGIwNyxcbiAgICAgIGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNyxcbiAgICAgIGEzMiAqIGIwMiAtIGEzMCAqIGIwNSAtIGEzMyAqIGIwMSxcbiAgICAgIGEyMCAqIGIwNSAtIGEyMiAqIGIwMiArIGEyMyAqIGIwMSxcbiAgICAgIGExMCAqIGIxMCAtIGExMSAqIGIwOCArIGExMyAqIGIwNixcbiAgICAgIGEwMSAqIGIwOCAtIGEwMCAqIGIxMCAtIGEwMyAqIGIwNixcbiAgICAgIGEzMCAqIGIwNCAtIGEzMSAqIGIwMiArIGEzMyAqIGIwMCxcbiAgICAgIGEyMSAqIGIwMiAtIGEyMCAqIGIwNCAtIGEyMyAqIGIwMCxcbiAgICAgIGExMSAqIGIwNyAtIGExMCAqIGIwOSAtIGExMiAqIGIwNixcbiAgICAgIGEwMCAqIGIwOSAtIGEwMSAqIGIwNyArIGEwMiAqIGIwNixcbiAgICAgIGEzMSAqIGIwMSAtIGEzMCAqIGIwMyAtIGEzMiAqIGIwMCxcbiAgICAgIGEyMCAqIGIwMyAtIGEyMSAqIGIwMSArIGEyMiAqIGIwMCkgLyBkZXQ7XG59XG5cblxubWF0NCBiYWxsdHJhbnNwb3NlKGluIG1hdDQgbSkge1xuICB2ZWM0IGkwID0gbVswXTtcbiAgdmVjNCBpMSA9IG1bMV07XG4gIHZlYzQgaTIgPSBtWzJdO1xuICB2ZWM0IGkzID0gbVszXTtcblxuICByZXR1cm4gbWF0NChcbiAgICB2ZWM0KGkwLngsIGkxLngsIGkyLngsIGkzLngpLFxuICAgIHZlYzQoaTAueSwgaTEueSwgaTIueSwgaTMueSksXG4gICAgdmVjNChpMC56LCBpMS56LCBpMi56LCBpMy56KSxcbiAgICB2ZWM0KGkwLncsIGkxLncsIGkyLncsIGkzLncpXG4gICk7XG59XG5cbnZvaWQgbWFpbigpXG57XG4gIGJhbGx2VXYgPSB1djtcblxuICBiYWxsdlBvc2l0aW9uID0gcG9zaXRpb247XG5cbiAgdmVjMyBvZmZzZXQgPSB2ZWMzKFxuICAgIHNpbihwb3NpdGlvbi54ICogNTAuMCArIGJhbGxUaW1lKSxcbiAgICBzaW4ocG9zaXRpb24ueSAqIDEwLjAgKyBiYWxsVGltZSAqIDIuMCksXG4gICAgY29zKHBvc2l0aW9uLnogKiA0MC4wICsgYmFsbFRpbWUpXG4gICkgKiAwLjAwMztcblxuICAgYmFsbHZQb3NpdGlvbiAqPSAxLjAgKyBzZWxlY3RlZCAqIDAuMjtcblxuICAgYmFsbHZOb3JtYWwgPSBub3JtYWxpemUoYmFsbGludmVyc2UoYmFsbHRyYW5zcG9zZShtb2RlbE1hdHJpeCkpICogdmVjNChub3JtYWxpemUobm9ybWFsKSwgMS4wKSkueHl6O1xuICAgYmFsbHZXb3JsZFBvcyA9IChtb2RlbE1hdHJpeCAqIHZlYzQoYmFsbHZQb3NpdGlvbiwgMS4wKSkueHl6O1xuXG4gICB2ZWM0IGJhbGx2UG9zaXRpb24gPSBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KGJhbGx2UG9zaXRpb24gKyBvZmZzZXQsIDEuMCk7XG5cbiAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uTWF0cml4ICogYmFsbHZQb3NpdGlvbjtcbn1cbmBcblxuZXhwb3J0IGRlZmF1bHQgZ2xzbCIsImNvbnN0IGdsc2wgPSBgXG51bmlmb3JtIHNhbXBsZXIyRCBwYW5vdGV4O1xudW5pZm9ybSBzYW1wbGVyMkQgdGV4Zng7XG51bmlmb3JtIGZsb2F0IGJhbGxUaW1lO1xudW5pZm9ybSBmbG9hdCBzZWxlY3RlZDtcbnZhcnlpbmcgdmVjMiBiYWxsdlV2O1xudmFyeWluZyB2ZWMzIGJhbGx2UG9zaXRpb247XG52YXJ5aW5nIHZlYzMgYmFsbHZOb3JtYWw7XG52YXJ5aW5nIHZlYzMgYmFsbHZXb3JsZFBvcztcblxudW5pZm9ybSBmbG9hdCBvcGFjaXR5O1xuXG52b2lkIG1haW4oIHZvaWQgKSB7XG4gICB2ZWMyIHV2ID0gYmFsbHZVdjtcbiAgLy91di55ID0gIDEuMCAtIHV2Lnk7XG5cbiAgIHZlYzMgZXllID0gbm9ybWFsaXplKGNhbWVyYVBvc2l0aW9uIC0gYmFsbHZXb3JsZFBvcyk7XG4gICBmbG9hdCBmcmVzbmVsID0gYWJzKGRvdChleWUsIGJhbGx2Tm9ybWFsKSk7XG4gICBmbG9hdCBzaGlmdCA9IHBvdygoMS4wIC0gZnJlc25lbCksIDQuMCkgKiAwLjA1O1xuXG4gIHZlYzMgY29sID0gdmVjMyhcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYgLSBzaGlmdCkucixcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYpLmcsXG4gICAgdGV4dHVyZTJEKHBhbm90ZXgsIHV2ICsgc2hpZnQpLmJcbiAgKTtcblxuICAgY29sID0gbWl4KGNvbCAqIDAuNywgdmVjMygxLjApLCAwLjcgLSBmcmVzbmVsKTtcblxuICAgY29sICs9IHNlbGVjdGVkICogMC4zO1xuXG4gICBmbG9hdCB0ID0gYmFsbFRpbWUgKiAwLjQgKyBiYWxsdlBvc2l0aW9uLnggKyBiYWxsdlBvc2l0aW9uLno7XG4gICB1diA9IHZlYzIoYmFsbHZVdi54ICsgdCAqIDAuMiwgYmFsbHZVdi55ICsgdCk7XG4gICB2ZWMzIGZ4ID0gdGV4dHVyZTJEKHRleGZ4LCB1dikucmdiICogMC40O1xuXG4gIC8vdmVjNCBjb2wgPSB2ZWM0KDEuMCwgMS4wLCAwLjAsIDEuMCk7XG4gIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29sICsgZngsIG9wYWNpdHkpO1xuICAvL2dsX0ZyYWdDb2xvciA9IHZlYzQoY29sICsgZngsIDEuMCk7XG59XG5gXG5cbmV4cG9ydCBkZWZhdWx0IGdsc2wiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogMzYwIGltYWdlIHRoYXQgZmlsbHMgdGhlIHVzZXIncyB2aXNpb24gd2hlbiBpbiBhIGNsb3NlIHByb3hpbWl0eS5cbiAqXG4gKiBVc2FnZVxuICogPT09PT09PVxuICogR2l2ZW4gYSAzNjAgaW1hZ2UgYXNzZXQgd2l0aCB0aGUgZm9sbG93aW5nIFVSTCBpbiBTcG9rZTpcbiAqIGh0dHBzOi8vZ3QtYWVsLWFxLWFzc2V0cy5hZWxhdGd0LWludGVybmFsLm5ldC9maWxlcy8xMjM0NWFiYy02Nzg5ZGVmLmpwZ1xuICpcbiAqIFRoZSBuYW1lIG9mIHRoZSBgaW1tZXJzaXZlLTM2MC5nbGJgIGluc3RhbmNlIGluIHRoZSBzY2VuZSBzaG91bGQgYmU6XG4gKiBcInNvbWUtZGVzY3JpcHRpdmUtbGFiZWxfXzEyMzQ1YWJjLTY3ODlkZWZfanBnXCIgT1IgXCIxMjM0NWFiYy02Nzg5ZGVmX2pwZ1wiXG4gKi9cblxuaW1wb3J0IGJhbGxmeCBmcm9tICcuLi9hc3NldHMvYmFsbGZ4LnBuZydcbmltcG9ydCBwYW5vdmVydCBmcm9tICcuLi9zaGFkZXJzL3Bhbm9iYWxsLnZlcnQnXG5pbXBvcnQgcGFub2ZyYWcgZnJvbSAnLi4vc2hhZGVycy9wYW5vYmFsbC5mcmFnJ1xuXG5jb25zdCB3b3JsZENhbWVyYSA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkU2VsZiA9IG5ldyBUSFJFRS5WZWN0b3IzKClcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIGJhbGxUZXggPSBudWxsXG5sb2FkZXIubG9hZChiYWxsZngsIChiYWxsKSA9PiB7XG4gICAgYmFsbC5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJhbGwubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYWxsLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmFsbC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJhbGxUZXggPSBiYWxsXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2ltbWVyc2l2ZS0zNjAnLCB7XG4gIHNjaGVtYToge1xuICAgIHVybDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbCB9LFxuICB9LFxuICBpbml0OiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHVybCA9IHRoaXMuZGF0YS51cmxcbiAgICBpZiAoIXVybCB8fCB1cmwgPT0gXCJcIikge1xuICAgICAgICB1cmwgPSB0aGlzLnBhcnNlU3Bva2VOYW1lKClcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZXh0ZW5zaW9uID0gdXJsLm1hdGNoKC9eLipcXC4oLiopJC8pWzFdXG5cbiAgICAvLyBtZWRpYS1pbWFnZSB3aWxsIHNldCB1cCB0aGUgc3BoZXJlIGdlb21ldHJ5IGZvciB1c1xuICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdtZWRpYS1pbWFnZScsIHtcbiAgICAgIHByb2plY3Rpb246ICczNjAtZXF1aXJlY3Rhbmd1bGFyJyxcbiAgICAgIGFscGhhTW9kZTogJ29wYXF1ZScsXG4gICAgICBzcmM6IHVybCxcbiAgICAgIHZlcnNpb246IDEsXG4gICAgICBiYXRjaDogZmFsc2UsXG4gICAgICBjb250ZW50VHlwZTogYGltYWdlLyR7ZXh0ZW5zaW9ufWAsXG4gICAgICBhbHBoYUN1dG9mZjogMCxcbiAgICB9KVxuICAgIC8vIGJ1dCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoaXMgdG8gaGFwcGVuXG4gICAgdGhpcy5tZXNoID0gYXdhaXQgdGhpcy5nZXRNZXNoKClcblxuICAgIHZhciBiYWxsID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSgwLjE1LCAzMCwgMjApLFxuICAgICAgICBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgICAgcGFub3RleDoge3ZhbHVlOiB0aGlzLm1lc2gubWF0ZXJpYWwubWFwfSxcbiAgICAgICAgICAgICAgdGV4Zng6IHt2YWx1ZTogYmFsbFRleH0sXG4gICAgICAgICAgICAgIHNlbGVjdGVkOiB7dmFsdWU6IDB9LFxuICAgICAgICAgICAgICBiYWxsVGltZToge3ZhbHVlOiAwfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogcGFub3ZlcnQsXG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlcjogcGFub2ZyYWcsXG4gICAgICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgICB9KVxuICAgIClcbiAgIFxuICAgIGJhbGwucm90YXRpb24uc2V0KE1hdGguUEksIDAsIDApO1xuICAgIGJhbGwucG9zaXRpb24uY29weSh0aGlzLm1lc2gucG9zaXRpb24pO1xuICAgIGJhbGwudXNlckRhdGEuZmxvYXRZID0gdGhpcy5tZXNoLnBvc2l0aW9uLnkgKyAwLjY7XG4gICAgYmFsbC51c2VyRGF0YS5zZWxlY3RlZCA9IDA7XG4gICAgYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgdGhpcy5iYWxsID0gYmFsbFxuICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoXCJiYWxsXCIsIGJhbGwpXG5cbiAgICB0aGlzLm1lc2guZ2VvbWV0cnkuc2NhbGUoMTAwLCAxMDAsIDEwMClcbiAgICB0aGlzLm1lc2gubWF0ZXJpYWwuc2V0VmFsdWVzKHtcbiAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgZGVwdGhUZXN0OiBmYWxzZSxcbiAgICB9KVxuICAgIHRoaXMubWVzaC52aXNpYmxlID0gZmFsc2VcblxuICAgIHRoaXMubmVhciA9IDAuOFxuICAgIHRoaXMuZmFyID0gMS4xXG5cbiAgICAvLyBSZW5kZXIgT1ZFUiB0aGUgc2NlbmUgYnV0IFVOREVSIHRoZSBjdXJzb3JcbiAgICB0aGlzLm1lc2gucmVuZGVyT3JkZXIgPSBBUFAuUkVOREVSX09SREVSLkNVUlNPUiAtIDAuMVxuICB9LFxuICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgIGlmICh0aGlzLm1lc2ggJiYgYmFsbFRleCkge1xuICAgICAgdGhpcy5iYWxsLnBvc2l0aW9uLnkgPSB0aGlzLmJhbGwudXNlckRhdGEuZmxvYXRZICsgTWF0aC5jb3MoKHRpbWUgKyB0aGlzLmJhbGwudXNlckRhdGEudGltZU9mZnNldCkvMTAwMCAqIDMgKSAqIDAuMDI7XG4gICAgICB0aGlzLmJhbGwubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuXG4gICAgICB0aGlzLmJhbGwubWF0ZXJpYWwudW5pZm9ybXMudGV4ZngudmFsdWUgPSBiYWxsVGV4XG4gICAgICB0aGlzLmJhbGwubWF0ZXJpYWwudW5pZm9ybXMuYmFsbFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyB0aGlzLmJhbGwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgLy8gTGluZWFybHkgbWFwIGNhbWVyYSBkaXN0YW5jZSB0byBtYXRlcmlhbCBvcGFjaXR5XG4gICAgICB0aGlzLm1lc2guZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmEpXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IHdvcmxkU2VsZi5kaXN0YW5jZVRvKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3Qgb3BhY2l0eSA9IDEgLSAoZGlzdGFuY2UgLSB0aGlzLm5lYXIpIC8gKHRoaXMuZmFyIC0gdGhpcy5uZWFyKVxuICAgICAgaWYgKG9wYWNpdHkgPCAwKSB7XG4gICAgICAgICAgLy8gZmFyIGF3YXlcbiAgICAgICAgICB0aGlzLm1lc2gudmlzaWJsZSA9IGZhbHNlXG4gICAgICAgICAgdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPSAxXG4gICAgICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLm9wYWNpdHkgPSAxXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eSA9IG9wYWNpdHkgPiAxID8gMSA6IG9wYWNpdHlcbiAgICAgICAgICAgIHRoaXMubWVzaC52aXNpYmxlID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLm9wYWNpdHkgPSB0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eVxuICAgICAgICB9XG4gICAgfVxuICB9LFxuICBwYXJzZVNwb2tlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgIC8vIEFjY2VwdGVkIG5hbWVzOiBcImxhYmVsX19pbWFnZS1oYXNoX2V4dFwiIE9SIFwiaW1hZ2UtaGFzaF9leHRcIlxuICAgIGNvbnN0IHNwb2tlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG4gICAgY29uc3QgbWF0Y2hlcyA9IHNwb2tlTmFtZS5tYXRjaCgvKD86LipfXyk/KC4qKV8oLiopLylcbiAgICBpZiAoIW1hdGNoZXMgfHwgbWF0Y2hlcy5sZW5ndGggPCAzKSB7IHJldHVybiBcIlwiIH1cbiAgICBjb25zdCBbLCBoYXNoLCBleHRlbnNpb25dICA9IG1hdGNoZXNcbiAgICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvZGF0YS8ke2hhc2h9LiR7ZXh0ZW5zaW9ufWBcbiAgICByZXR1cm4gdXJsXG4gIH0sXG4gIGdldE1lc2g6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbiAgICAgIGlmIChtZXNoKSByZXNvbHZlKG1lc2gpXG4gICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdpbWFnZS1sb2FkZWQnLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltbWVyc2l2ZS0zNjAgcGFubyBsb2FkZWQ6IFwiICsgdGhpcy5kYXRhLnVybClcbiAgICAgICAgICByZXNvbHZlKHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaClcbiAgICAgICAgfSxcbiAgICAgICAgeyBvbmNlOiB0cnVlIH1cbiAgICAgIClcbiAgICB9KVxuICB9LFxufSlcbiIsIi8vIFBhcmFsbGF4IE9jY2x1c2lvbiBzaGFkZXJzIGZyb21cbi8vICAgIGh0dHA6Ly9zdW5hbmRibGFja2NhdC5jb20vdGlwRnVsbFZpZXcucGhwP3RvcGljaWQ9Mjhcbi8vIE5vIHRhbmdlbnQtc3BhY2UgdHJhbnNmb3JtcyBsb2dpYyBiYXNlZCBvblxuLy8gICBodHRwOi8vbW1pa2tlbHNlbjNkLmJsb2dzcG90LnNrLzIwMTIvMDIvcGFyYWxsYXhwb2MtbWFwcGluZy1hbmQtbm8tdGFuZ2VudC5odG1sXG5cbi8vIElkZW50aXR5IGZ1bmN0aW9uIGZvciBnbHNsLWxpdGVyYWwgaGlnaGxpZ2h0aW5nIGluIFZTIENvZGVcbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmNvbnN0IFBhcmFsbGF4U2hhZGVyID0ge1xuICAvLyBPcmRlcmVkIGZyb20gZmFzdGVzdCB0byBiZXN0IHF1YWxpdHkuXG4gIG1vZGVzOiB7XG4gICAgbm9uZTogJ05PX1BBUkFMTEFYJyxcbiAgICBiYXNpYzogJ1VTRV9CQVNJQ19QQVJBTExBWCcsXG4gICAgc3RlZXA6ICdVU0VfU1RFRVBfUEFSQUxMQVgnLFxuICAgIG9jY2x1c2lvbjogJ1VTRV9PQ0xVU0lPTl9QQVJBTExBWCcsIC8vIGEuay5hLiBQT01cbiAgICByZWxpZWY6ICdVU0VfUkVMSUVGX1BBUkFMTEFYJyxcbiAgfSxcblxuICB1bmlmb3Jtczoge1xuICAgIGJ1bXBNYXA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBtYXA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheFNjYWxlOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNaW5MYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogbnVsbCB9LFxuICB9LFxuXG4gIHZlcnRleFNoYWRlcjogZ2xzbGBcbiAgICB2YXJ5aW5nIHZlYzIgdlV2O1xuICAgIHZhcnlpbmcgdmVjMyB2Vmlld1Bvc2l0aW9uO1xuICAgIHZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdlV2ID0gdXY7XG4gICAgICB2ZWM0IG12UG9zaXRpb24gPSBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KCBwb3NpdGlvbiwgMS4wICk7XG4gICAgICB2Vmlld1Bvc2l0aW9uID0gLW12UG9zaXRpb24ueHl6O1xuICAgICAgdk5vcm1hbCA9IG5vcm1hbGl6ZSggbm9ybWFsTWF0cml4ICogbm9ybWFsICk7XG4gICAgICBcbiAgICAgIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbk1hdHJpeCAqIG12UG9zaXRpb247XG4gICAgfVxuICBgLFxuXG4gIGZyYWdtZW50U2hhZGVyOiBnbHNsYFxuICAgIHVuaWZvcm0gc2FtcGxlcjJEIGJ1bXBNYXA7XG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgbWFwO1xuXG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheFNjYWxlO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNaW5MYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheE1heExheWVycztcbiAgICB1bmlmb3JtIGZsb2F0IGZhZGU7IC8vIENVU1RPTVxuXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgICNpZmRlZiBVU0VfQkFTSUNfUEFSQUxMQVhcblxuICAgIHZlYzIgcGFyYWxsYXhNYXAoaW4gdmVjMyBWKSB7XG4gICAgICBmbG9hdCBpbml0aWFsSGVpZ2h0ID0gdGV4dHVyZTJEKGJ1bXBNYXAsIHZVdikucjtcblxuICAgICAgLy8gTm8gT2Zmc2V0IExpbWl0dGluZzogbWVzc3ksIGZsb2F0aW5nIG91dHB1dCBhdCBncmF6aW5nIGFuZ2xlcy5cbiAgICAgIC8vXCJ2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogKiBpbml0aWFsSGVpZ2h0O1wiLFxuXG4gICAgICAvLyBPZmZzZXQgTGltaXRpbmdcbiAgICAgIHZlYzIgdGV4Q29vcmRPZmZzZXQgPSBwYXJhbGxheFNjYWxlICogVi54eSAqIGluaXRpYWxIZWlnaHQ7XG4gICAgICByZXR1cm4gdlV2IC0gdGV4Q29vcmRPZmZzZXQ7XG4gICAgfVxuXG4gICAgI2Vsc2VcblxuICAgIHZlYzIgcGFyYWxsYXhNYXAoaW4gdmVjMyBWKSB7XG4gICAgICAvLyBEZXRlcm1pbmUgbnVtYmVyIG9mIGxheWVycyBmcm9tIGFuZ2xlIGJldHdlZW4gViBhbmQgTlxuICAgICAgZmxvYXQgbnVtTGF5ZXJzID0gbWl4KHBhcmFsbGF4TWF4TGF5ZXJzLCBwYXJhbGxheE1pbkxheWVycywgYWJzKGRvdCh2ZWMzKDAuMCwgMC4wLCAxLjApLCBWKSkpO1xuXG4gICAgICBmbG9hdCBsYXllckhlaWdodCA9IDEuMCAvIG51bUxheWVycztcbiAgICAgIGZsb2F0IGN1cnJlbnRMYXllckhlaWdodCA9IDAuMDtcbiAgICAgIC8vIFNoaWZ0IG9mIHRleHR1cmUgY29vcmRpbmF0ZXMgZm9yIGVhY2ggaXRlcmF0aW9uXG4gICAgICB2ZWMyIGR0ZXggPSBwYXJhbGxheFNjYWxlICogVi54eSAvIFYueiAvIG51bUxheWVycztcblxuICAgICAgdmVjMiBjdXJyZW50VGV4dHVyZUNvb3JkcyA9IHZVdjtcblxuICAgICAgZmxvYXQgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG5cbiAgICAgIC8vIHdoaWxlICggaGVpZ2h0RnJvbVRleHR1cmUgPiBjdXJyZW50TGF5ZXJIZWlnaHQgKVxuICAgICAgLy8gSW5maW5pdGUgbG9vcHMgYXJlIG5vdCB3ZWxsIHN1cHBvcnRlZC4gRG8gYSBcImxhcmdlXCIgZmluaXRlXG4gICAgICAvLyBsb29wLCBidXQgbm90IHRvbyBsYXJnZSwgYXMgaXQgc2xvd3MgZG93biBzb21lIGNvbXBpbGVycy5cbiAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMzA7IGkgKz0gMSkge1xuICAgICAgICBpZiAoaGVpZ2h0RnJvbVRleHR1cmUgPD0gY3VycmVudExheWVySGVpZ2h0KSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudExheWVySGVpZ2h0ICs9IGxheWVySGVpZ2h0O1xuICAgICAgICAvLyBTaGlmdCB0ZXh0dXJlIGNvb3JkaW5hdGVzIGFsb25nIHZlY3RvciBWXG4gICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzIC09IGR0ZXg7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgfVxuXG4gICAgICAjaWZkZWYgVVNFX1NURUVQX1BBUkFMTEFYXG5cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfUkVMSUVGX1BBUkFMTEFYKVxuXG4gICAgICB2ZWMyIGRlbHRhVGV4Q29vcmQgPSBkdGV4IC8gMi4wO1xuICAgICAgZmxvYXQgZGVsdGFIZWlnaHQgPSBsYXllckhlaWdodCAvIDIuMDtcblxuICAgICAgLy8gUmV0dXJuIHRvIHRoZSBtaWQgcG9pbnQgb2YgcHJldmlvdXMgbGF5ZXJcbiAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzICs9IGRlbHRhVGV4Q29vcmQ7XG4gICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG5cbiAgICAgIC8vIEJpbmFyeSBzZWFyY2ggdG8gaW5jcmVhc2UgcHJlY2lzaW9uIG9mIFN0ZWVwIFBhcmFsbGF4IE1hcHBpbmdcbiAgICAgIGNvbnN0IGludCBudW1TZWFyY2hlcyA9IDU7XG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IG51bVNlYXJjaGVzOyBpICs9IDEpIHtcbiAgICAgICAgZGVsdGFUZXhDb29yZCAvPSAyLjA7XG4gICAgICAgIGRlbHRhSGVpZ2h0IC89IDIuMDtcbiAgICAgICAgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG4gICAgICAgIC8vIFNoaWZ0IGFsb25nIG9yIGFnYWluc3QgdmVjdG9yIFZcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0KSB7XG4gICAgICAgICAgLy8gQmVsb3cgdGhlIHN1cmZhY2VcblxuICAgICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzIC09IGRlbHRhVGV4Q29vcmQ7XG4gICAgICAgICAgY3VycmVudExheWVySGVpZ2h0ICs9IGRlbHRhSGVpZ2h0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGFib3ZlIHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCAtPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGN1cnJlbnRUZXh0dXJlQ29vcmRzO1xuXG4gICAgICAjZWxpZiBkZWZpbmVkKFVTRV9PQ0xVU0lPTl9QQVJBTExBWClcblxuICAgICAgdmVjMiBwcmV2VENvb3JkcyA9IGN1cnJlbnRUZXh0dXJlQ29vcmRzICsgZHRleDtcblxuICAgICAgLy8gSGVpZ2h0cyBmb3IgbGluZWFyIGludGVycG9sYXRpb25cbiAgICAgIGZsb2F0IG5leHRIID0gaGVpZ2h0RnJvbVRleHR1cmUgLSBjdXJyZW50TGF5ZXJIZWlnaHQ7XG4gICAgICBmbG9hdCBwcmV2SCA9IHRleHR1cmUyRChidW1wTWFwLCBwcmV2VENvb3JkcykuciAtIGN1cnJlbnRMYXllckhlaWdodCArIGxheWVySGVpZ2h0O1xuXG4gICAgICAvLyBQcm9wb3J0aW9ucyBmb3IgbGluZWFyIGludGVycG9sYXRpb25cbiAgICAgIGZsb2F0IHdlaWdodCA9IG5leHRIIC8gKG5leHRIIC0gcHJldkgpO1xuXG4gICAgICAvLyBJbnRlcnBvbGF0aW9uIG9mIHRleHR1cmUgY29vcmRpbmF0ZXNcbiAgICAgIHJldHVybiBwcmV2VENvb3JkcyAqIHdlaWdodCArIGN1cnJlbnRUZXh0dXJlQ29vcmRzICogKDEuMCAtIHdlaWdodCk7XG5cbiAgICAgICNlbHNlIC8vIE5PX1BBUkFMTEFYXG5cbiAgICAgIHJldHVybiB2VXY7XG5cbiAgICAgICNlbmRpZlxuICAgIH1cbiAgICAjZW5kaWZcblxuICAgIHZlYzIgcGVydHVyYlV2KHZlYzMgc3VyZlBvc2l0aW9uLCB2ZWMzIHN1cmZOb3JtYWwsIHZlYzMgdmlld1Bvc2l0aW9uKSB7XG4gICAgICB2ZWMyIHRleER4ID0gZEZkeCh2VXYpO1xuICAgICAgdmVjMiB0ZXhEeSA9IGRGZHkodlV2KTtcblxuICAgICAgdmVjMyB2U2lnbWFYID0gZEZkeChzdXJmUG9zaXRpb24pO1xuICAgICAgdmVjMyB2U2lnbWFZID0gZEZkeShzdXJmUG9zaXRpb24pO1xuICAgICAgdmVjMyB2UjEgPSBjcm9zcyh2U2lnbWFZLCBzdXJmTm9ybWFsKTtcbiAgICAgIHZlYzMgdlIyID0gY3Jvc3Moc3VyZk5vcm1hbCwgdlNpZ21hWCk7XG4gICAgICBmbG9hdCBmRGV0ID0gZG90KHZTaWdtYVgsIHZSMSk7XG5cbiAgICAgIHZlYzIgdlByb2pWc2NyID0gKDEuMCAvIGZEZXQpICogdmVjMihkb3QodlIxLCB2aWV3UG9zaXRpb24pLCBkb3QodlIyLCB2aWV3UG9zaXRpb24pKTtcbiAgICAgIHZlYzMgdlByb2pWdGV4O1xuICAgICAgdlByb2pWdGV4Lnh5ID0gdGV4RHggKiB2UHJvalZzY3IueCArIHRleER5ICogdlByb2pWc2NyLnk7XG4gICAgICB2UHJvalZ0ZXgueiA9IGRvdChzdXJmTm9ybWFsLCB2aWV3UG9zaXRpb24pO1xuXG4gICAgICByZXR1cm4gcGFyYWxsYXhNYXAodlByb2pWdGV4KTtcbiAgICB9XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICB2ZWMyIG1hcFV2ID0gcGVydHVyYlV2KC12Vmlld1Bvc2l0aW9uLCBub3JtYWxpemUodk5vcm1hbCksIG5vcm1hbGl6ZSh2Vmlld1Bvc2l0aW9uKSk7XG4gICAgICBcbiAgICAgIC8vIENVU1RPTSBTVEFSVFxuICAgICAgdmVjNCB0ZXhlbCA9IHRleHR1cmUyRChtYXAsIG1hcFV2KTtcbiAgICAgIHZlYzMgY29sb3IgPSBtaXgodGV4ZWwueHl6LCB2ZWMzKDApLCBmYWRlKTtcbiAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuMCk7XG4gICAgICAvLyBDVVNUT00gRU5EXG4gICAgfVxuXG4gIGAsXG59XG5cbmV4cG9ydCB7IFBhcmFsbGF4U2hhZGVyIH1cbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBDcmVhdGUgdGhlIGlsbHVzaW9uIG9mIGRlcHRoIGluIGEgY29sb3IgaW1hZ2UgZnJvbSBhIGRlcHRoIG1hcFxuICpcbiAqIFVzYWdlXG4gKiA9PT09PVxuICogQ3JlYXRlIGEgcGxhbmUgaW4gQmxlbmRlciBhbmQgZ2l2ZSBpdCBhIG1hdGVyaWFsIChqdXN0IHRoZSBkZWZhdWx0IFByaW5jaXBsZWQgQlNERikuXG4gKiBBc3NpZ24gY29sb3IgaW1hZ2UgdG8gXCJjb2xvclwiIGNoYW5uZWwgYW5kIGRlcHRoIG1hcCB0byBcImVtaXNzaXZlXCIgY2hhbm5lbC5cbiAqIFlvdSBtYXkgd2FudCB0byBzZXQgZW1pc3NpdmUgc3RyZW5ndGggdG8gemVybyBzbyB0aGUgcHJldmlldyBsb29rcyBiZXR0ZXIuXG4gKiBBZGQgdGhlIFwicGFyYWxsYXhcIiBjb21wb25lbnQgZnJvbSB0aGUgSHVicyBleHRlbnNpb24sIGNvbmZpZ3VyZSwgYW5kIGV4cG9ydCBhcyAuZ2xiXG4gKi9cblxuaW1wb3J0IHsgUGFyYWxsYXhTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3BhcmFsbGF4LXNoYWRlci5qcydcblxuY29uc3QgdmVjID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3QgZm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncGFyYWxsYXgnLCB7XG4gIHNjaGVtYToge1xuICAgIHN0cmVuZ3RoOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwLjUgfSxcbiAgICBjdXRvZmZUcmFuc2l0aW9uOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiBNYXRoLlBJIC8gOCB9LFxuICAgIGN1dG9mZkFuZ2xlOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiBNYXRoLlBJIC8gNCB9LFxuICB9LFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuICAgIGNvbnN0IHsgbWFwOiBjb2xvck1hcCwgZW1pc3NpdmVNYXA6IGRlcHRoTWFwIH0gPSBtZXNoLm1hdGVyaWFsXG4gICAgY29sb3JNYXAud3JhcFMgPSBjb2xvck1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBkZXB0aE1hcC53cmFwUyA9IGRlcHRoTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZ1xuICAgIGNvbnN0IHsgdmVydGV4U2hhZGVyLCBmcmFnbWVudFNoYWRlciB9ID0gUGFyYWxsYXhTaGFkZXJcbiAgICB0aGlzLm1hdGVyaWFsID0gbmV3IFRIUkVFLlNoYWRlck1hdGVyaWFsKHtcbiAgICAgIHZlcnRleFNoYWRlcixcbiAgICAgIGZyYWdtZW50U2hhZGVyLFxuICAgICAgZGVmaW5lczogeyBVU0VfT0NMVVNJT05fUEFSQUxMQVg6IHRydWUgfSxcbiAgICAgIHVuaWZvcm1zOiB7XG4gICAgICAgIG1hcDogeyB2YWx1ZTogY29sb3JNYXAgfSxcbiAgICAgICAgYnVtcE1hcDogeyB2YWx1ZTogZGVwdGhNYXAgfSxcbiAgICAgICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogLTEgKiB0aGlzLmRhdGEuc3RyZW5ndGggfSxcbiAgICAgICAgcGFyYWxsYXhNaW5MYXllcnM6IHsgdmFsdWU6IDIwIH0sXG4gICAgICAgIHBhcmFsbGF4TWF4TGF5ZXJzOiB7IHZhbHVlOiAzMCB9LFxuICAgICAgICBmYWRlOiB7IHZhbHVlOiAwIH0sXG4gICAgICB9LFxuICAgIH0pXG4gICAgbWVzaC5tYXRlcmlhbCA9IHRoaXMubWF0ZXJpYWxcbiAgfSxcbiAgdGljaygpIHtcbiAgICBpZiAodGhpcy5lbC5zY2VuZUVsLmNhbWVyYSkge1xuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHZlYylcbiAgICAgIHRoaXMuZWwub2JqZWN0M0Qud29ybGRUb0xvY2FsKHZlYylcbiAgICAgIGNvbnN0IGFuZ2xlID0gdmVjLmFuZ2xlVG8oZm9yd2FyZClcbiAgICAgIGNvbnN0IGZhZGUgPSBtYXBMaW5lYXJDbGFtcGVkKFxuICAgICAgICBhbmdsZSxcbiAgICAgICAgdGhpcy5kYXRhLmN1dG9mZkFuZ2xlIC0gdGhpcy5kYXRhLmN1dG9mZlRyYW5zaXRpb24sXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSArIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICAwLCAvLyBJbiB2aWV3IHpvbmUsIG5vIGZhZGVcbiAgICAgICAgMSAvLyBPdXRzaWRlIHZpZXcgem9uZSwgZnVsbCBmYWRlXG4gICAgICApXG4gICAgICB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLmZhZGUudmFsdWUgPSBmYWRlXG4gICAgfVxuICB9LFxufSlcblxuZnVuY3Rpb24gY2xhbXAodmFsdWUsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKVxufVxuXG5mdW5jdGlvbiBtYXBMaW5lYXIoeCwgYTEsIGEyLCBiMSwgYjIpIHtcbiAgcmV0dXJuIGIxICsgKCh4IC0gYTEpICogKGIyIC0gYjEpKSAvIChhMiAtIGExKVxufVxuXG5mdW5jdGlvbiBtYXBMaW5lYXJDbGFtcGVkKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBjbGFtcChtYXBMaW5lYXIoeCwgYTEsIGEyLCBiMSwgYjIpLCBiMSwgYjIpXG59XG4iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogY3JlYXRlIGEgSFRNTCBvYmplY3QgYnkgcmVuZGVyaW5nIGEgc2NyaXB0IHRoYXQgY3JlYXRlcyBhbmQgbWFuYWdlcyBpdFxuICpcbiAqL1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuaW1wb3J0ICogYXMgaHRtbENvbXBvbmVudHMgZnJvbSBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL3Z1ZS1hcHBzL2Rpc3QvaHVicy5qc1wiO1xuXG4vLyB2YXIgaHRtbENvbXBvbmVudHM7XG4vLyB2YXIgc2NyaXB0UHJvbWlzZTtcbi8vIGlmICh3aW5kb3cuX190ZXN0aW5nVnVlQXBwcykge1xuLy8gICAgIHNjcmlwdFByb21pc2UgPSBpbXBvcnQod2luZG93Ll9fdGVzdGluZ1Z1ZUFwcHMpICAgIFxuLy8gfSBlbHNlIHtcbi8vICAgICBzY3JpcHRQcm9taXNlID0gaW1wb3J0KFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCIpIFxuLy8gfVxuLy8gLy8gc2NyaXB0UHJvbWlzZSA9IHNjcmlwdFByb21pc2UudGhlbihtb2R1bGUgPT4ge1xuLy8gLy8gICAgIHJldHVybiBtb2R1bGVcbi8vIC8vIH0pO1xuLyoqXG4gKiBNb2RpZmllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL2h1YnMvYmxvYi9tYXN0ZXIvc3JjL2NvbXBvbmVudHMvZmFkZXIuanNcbiAqIHRvIGluY2x1ZGUgYWRqdXN0YWJsZSBkdXJhdGlvbiBhbmQgY29udmVydGVkIGZyb20gY29tcG9uZW50IHRvIHN5c3RlbVxuICovXG5cbiBBRlJBTUUucmVnaXN0ZXJTeXN0ZW0oJ2h0bWwtc2NyaXB0JywgeyAgXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW1UaWNrID0gaHRtbENvbXBvbmVudHNbXCJzeXN0ZW1UaWNrXCJdO1xuICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCA9IGh0bWxDb21wb25lbnRzW1wiaW5pdGlhbGl6ZUV0aGVyZWFsXCJdXG4gICAgICAgIGlmICghdGhpcy5zeXN0ZW1UaWNrIHx8ICF0aGlzLmluaXRpYWxpemVFdGhlcmVhbCkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImVycm9yIGluIGh0bWwtc2NyaXB0IHN5c3RlbTogaHRtbENvbXBvbmVudHMgaGFzIG5vIHN5c3RlbVRpY2sgYW5kL29yIGluaXRpYWxpemVFdGhlcmVhbCBtZXRob2RzXCIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemVFdGhlcmVhbCgpXG4gICAgICAgIH1cbiAgICB9LFxuICBcbiAgICB0aWNrKHQsIGR0KSB7XG4gICAgICAgIHRoaXMuc3lzdGVtVGljayh0LCBkdClcbiAgICB9LFxuICB9KVxuICBcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdodG1sLXNjcmlwdCcsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBcIipfY29tcG9uZW50TmFtZVwiXG4gICAgICAgIG5hbWU6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJcIn0sXG4gICAgICAgIHdpZHRoOiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IC0xfSxcbiAgICAgICAgaGVpZ2h0OiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IC0xfSxcbiAgICAgICAgcGFyYW1ldGVyMTogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyMjogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyMzogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgcGFyYW1ldGVyNDogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsO1xuICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5kYXRhLm5hbWU7XG5cbiAgICAgICAgdGhpcy5zY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgd2lkdGg6IHRoaXMuZGF0YS53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogdGhpcy5kYXRhLmhlaWdodCxcbiAgICAgICAgICAgIHBhcmFtZXRlcjE6IHRoaXMuZGF0YS5wYXJhbWV0ZXIxLFxuICAgICAgICAgICAgcGFyYW1ldGVyMjogdGhpcy5kYXRhLnBhcmFtZXRlcjIsXG4gICAgICAgICAgICBwYXJhbWV0ZXIzOiB0aGlzLmRhdGEucGFyYW1ldGVyMyxcbiAgICAgICAgICAgIHBhcmFtZXRlcjQ6IHRoaXMuZGF0YS5wYXJhbWV0ZXI0XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuZnVsbE5hbWUgfHwgdGhpcy5mdWxsTmFtZS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSB0aGlzLmZ1bGxOYW1lXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIChldikgPT4geyBcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlU2NyaXB0KClcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy90aGlzLmNyZWF0ZVNjcmlwdCgpO1xuICAgIH0sXG5cbiAgICB1cGRhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5uYW1lID09PSBcIlwiIHx8IHRoaXMuZGF0YS5uYW1lID09PSB0aGlzLmZ1bGxOYW1lKSByZXR1cm5cblxuICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5kYXRhLm5hbWU7XG4gICAgICAgIC8vIHRoaXMucGFyc2VOb2RlTmFtZSgpO1xuICAgICAgICB0aGlzLmNvbXBvbmVudE5hbWUgPSB0aGlzLmZ1bGxOYW1lO1xuICAgICAgICBcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLmRlc3Ryb3lTY3JpcHQoKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY3JlYXRlU2NyaXB0KCk7XG4gICAgfSxcblxuICAgIGNyZWF0ZVNjcmlwdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBlYWNoIHRpbWUgd2UgbG9hZCBhIHNjcmlwdCBjb21wb25lbnQgd2Ugd2lsbCBwb3NzaWJseSBjcmVhdGVcbiAgICAgICAgLy8gYSBuZXcgbmV0d29ya2VkIGNvbXBvbmVudC4gIFRoaXMgaXMgZmluZSwgc2luY2UgdGhlIG5ldHdvcmtlZCBJZCBcbiAgICAgICAgLy8gaXMgYmFzZWQgb24gdGhlIGZ1bGwgbmFtZSBwYXNzZWQgYXMgYSBwYXJhbWV0ZXIsIG9yIGFzc2lnbmVkIHRvIHRoZVxuICAgICAgICAvLyBjb21wb25lbnQgaW4gU3Bva2UuICBJdCBkb2VzIG1lYW4gdGhhdCBpZiB3ZSBoYXZlXG4gICAgICAgIC8vIG11bHRpcGxlIG9iamVjdHMgaW4gdGhlIHNjZW5lIHdoaWNoIGhhdmUgdGhlIHNhbWUgbmFtZSwgdGhleSB3aWxsXG4gICAgICAgIC8vIGJlIGluIHN5bmMuICBJdCBhbHNvIG1lYW5zIHRoYXQgaWYgeW91IHdhbnQgdG8gZHJvcCBhIGNvbXBvbmVudCBvblxuICAgICAgICAvLyB0aGUgc2NlbmUgdmlhIGEgLmdsYiwgaXQgbXVzdCBoYXZlIGEgdmFsaWQgbmFtZSBwYXJhbWV0ZXIgaW5zaWRlIGl0LlxuICAgICAgICAvLyBBIC5nbGIgaW4gc3Bva2Ugd2lsbCBmYWxsIGJhY2sgdG8gdGhlIHNwb2tlIG5hbWUgaWYgeW91IHVzZSBvbmUgd2l0aG91dFxuICAgICAgICAvLyBhIG5hbWUgaW5zaWRlIGl0LlxuICAgICAgICBsZXQgbG9hZGVyID0gKCkgPT4ge1xuXG4gICAgICAgICAgICB0aGlzLmxvYWRTY3JpcHQoKS50aGVuKCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNjcmlwdCkgcmV0dXJuXG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2V0IHRoZSBwYXJlbnQgbmV0d29ya2VkIGVudGl0eSwgd2hlbiBpdCdzIGZpbmlzaGVkIGluaXRpYWxpemluZy4gIFxuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIGNyZWF0aW5nIHRoaXMgYXMgcGFydCBvZiBhIEdMVEYgbG9hZCwgdGhlIFxuICAgICAgICAgICAgICAgICAgICAvLyBwYXJlbnQgYSBmZXcgc3RlcHMgdXAgd2lsbCBiZSBuZXR3b3JrZWQuICBXZSdsbCBvbmx5IGRvIHRoaXNcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIEhUTUwgc2NyaXB0IHdhbnRzIHRvIGJlIG5ldHdvcmtlZFxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IG51bGxcblxuICAgICAgICAgICAgICAgICAgICAvLyBiaW5kIGNhbGxiYWNrc1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YWtlT3duZXJzaGlwID0gdGhpcy50YWtlT3duZXJzaGlwLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSA9IHRoaXMuc2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuc2V0TmV0d29ya01ldGhvZHModGhpcy50YWtlT3duZXJzaGlwLCB0aGlzLnNldFNoYXJlZERhdGEpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgIGNvbnN0IHNjcmlwdEVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyID0gc2NyaXB0RWxcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldE9iamVjdDNEKFwid2VibGF5ZXIzZFwiLCB0aGlzLnNjcmlwdC53ZWJMYXllcjNEKVxuXG4gICAgICAgICAgICAgICAgLy8gbGV0cyBmaWd1cmUgb3V0IHRoZSBzY2FsZSwgYnV0IHNjYWxpbmcgdG8gZmlsbCB0aGUgYSAxeDFtIHNxdWFyZSwgdGhhdCBoYXMgYWxzb1xuICAgICAgICAgICAgICAgIC8vIHBvdGVudGlhbGx5IGJlZW4gc2NhbGVkIGJ5IHRoZSBwYXJlbnRzIHBhcmVudCBub2RlLiBJZiB3ZSBzY2FsZSB0aGUgZW50aXR5IGluIHNwb2tlLFxuICAgICAgICAgICAgICAgIC8vIHRoaXMgaXMgd2hlcmUgdGhlIHNjYWxlIGlzIHNldC4gIElmIHdlIGRyb3AgYSBub2RlIGluIGFuZCBzY2FsZSBpdCwgdGhlIHNjYWxlIGlzIGFsc29cbiAgICAgICAgICAgICAgICAvLyBzZXQgdGhlcmUuXG4gICAgICAgICAgICAgICAgLy8gV2UgdXNlZCB0byBoYXZlIGEgZml4ZWQgc2l6ZSBwYXNzZWQgYmFjayBmcm9tIHRoZSBlbnRpdHksIGJ1dCB0aGF0J3MgdG9vIHJlc3RyaWN0aXZlOlxuICAgICAgICAgICAgICAgIC8vIGNvbnN0IHdpZHRoID0gdGhpcy5zY3JpcHQud2lkdGhcbiAgICAgICAgICAgICAgICAvLyBjb25zdCBoZWlnaHQgPSB0aGlzLnNjcmlwdC5oZWlnaHRcblxuICAgICAgICAgICAgICAgIC8vIFRPRE86IG5lZWQgdG8gZmluZCBlbnZpcm9ubWVudC1zY2VuZSwgZ28gZG93biB0d28gbGV2ZWxzIHRvIHRoZSBncm91cCBhYm92ZSBcbiAgICAgICAgICAgICAgICAvLyB0aGUgbm9kZXMgaW4gdGhlIHNjZW5lLiAgVGhlbiBhY2N1bXVsYXRlIHRoZSBzY2FsZXMgdXAgZnJvbSB0aGlzIG5vZGUgdG9cbiAgICAgICAgICAgICAgICAvLyB0aGF0IG5vZGUuICBUaGlzIHdpbGwgYWNjb3VudCBmb3IgZ3JvdXBzLCBhbmQgbmVzdGluZy5cblxuICAgICAgICAgICAgICAgIHZhciB3aWR0aCA9IDEsIGhlaWdodCA9IDE7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGF0dGFjaGVkIHRvIGFuIGltYWdlIGluIHNwb2tlLCBzbyB0aGUgaW1hZ2UgbWVzaCBpcyBzaXplIDEgYW5kIGlzIHNjYWxlZCBkaXJlY3RseVxuICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBzY2FsZU0ueCAqIHNjYWxlSS54XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnggPSAxXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS55ID0gMVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaXQncyBlbWJlZGRlZCBpbiBhIHNpbXBsZSBnbHRmIG1vZGVsOyAgb3RoZXIgbW9kZWxzIG1heSBub3Qgd29ya1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhc3N1bWUgaXQncyBhdCB0aGUgdG9wIGxldmVsIG1lc2gsIGFuZCB0aGF0IHRoZSBtb2RlbCBpdHNlbGYgaXMgc2NhbGVkXG4gICAgICAgICAgICAgICAgICAgIGxldCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl1cbiAgICAgICAgICAgICAgICAgICAgaWYgKG1lc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBib3ggPSBtZXNoLmdlb21ldHJ5LmJvdW5kaW5nQm94O1xuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSAoYm94Lm1heC54IC0gYm94Lm1pbi54KSAqIG1lc2guc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gKGJveC5tYXgueSAtIGJveC5taW4ueSkgKiBtZXNoLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtZXNoU2NhbGUgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IG1lc2hTY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSBtZXNoU2NhbGUueVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS56ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgdGhlIHJvb3QgZ2x0ZiBzY2FsZS5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmVudDIgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLm9iamVjdDNEXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoICo9IHBhcmVudDIuc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQgKj0gcGFyZW50Mi5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAgICAgICAgICAgICB2YXIgc2NhbGUgPSBNYXRoLm1pbih3aWR0aCAvIHdzaXplLCBoZWlnaHQgLyBoc2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwgeyB4OiBzY2FsZSwgeTogc2NhbGUsIHo6IHNjYWxlfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgd2lsbCBiZSBvbmUgZWxlbWVudCBhbHJlYWR5LCB0aGUgY3ViZSB3ZSBjcmVhdGVkIGluIGJsZW5kZXJcbiAgICAgICAgICAgICAgICAvLyBhbmQgYXR0YWNoZWQgdGhpcyBjb21wb25lbnQgdG8sIHNvIHJlbW92ZSBpdCBpZiBpdCBpcyB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuLnBvcCgpXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgYy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIFwiaXNTdGF0aWNcIiBpcyBjb3JyZWN0OyAgY2FuJ3QgYmUgc3RhdGljIGlmIGVpdGhlciBpbnRlcmFjdGl2ZSBvciBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNTdGF0aWMgJiYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUgfHwgdGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hcHBlbmRDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcblxuICAgICAgICAgICAgICAgIC8vIFRPRE86ICB3ZSBhcmUgZ29pbmcgdG8gaGF2ZSB0byBtYWtlIHN1cmUgdGhpcyB3b3JrcyBpZiBcbiAgICAgICAgICAgICAgICAvLyB0aGUgc2NyaXB0IGlzIE9OIGFuIGludGVyYWN0YWJsZSAobGlrZSBhbiBpbWFnZSlcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIG1ha2UgdGhlIGh0bWwgb2JqZWN0IGNsaWNrYWJsZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gZm9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIG9iamVjdCBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGlja2VkID0gdGhpcy5jbGlja2VkLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzRHJhZ2dhYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhcmVuJ3QgZ29pbmcgdG8gcmVhbGx5IGRlYWwgd2l0aCB0aGlzIHRpbGwgd2UgaGF2ZSBhIHVzZSBjYXNlLCBidXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGNhbiBzZXQgaXQgdXAgZm9yIG5vd1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNIb2xkYWJsZTogdHJ1ZSwgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhvbGRhYmxlQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi1kb3duJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmRyYWdTdGFydChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLXVwJywgKGV2dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmRyYWdFbmQoZXZ0KVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5yYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBubyBpbnRlcmFjdGl2aXR5LCBwbGVhc2VcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHRoaXMgU0hPVUxEIHdvcmsgYnV0IG1ha2Ugc3VyZSBpdCB3b3JrcyBpZiB0aGUgZWwgd2UgYXJlIG9uXG4gICAgICAgICAgICAgICAgLy8gaXMgbmV0d29ya2VkLCBzdWNoIGFzIHdoZW4gYXR0YWNoZWQgdG8gYW4gaW1hZ2VcblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmhhc0F0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIGZpbmRzIGFuIGV4aXN0aW5nIGNvcHkgb2YgdGhlIE5ldHdvcmtlZCBFbnRpdHkgKGlmIHdlIGFyZSBub3QgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGZpcnN0IGNsaWVudCBpbiB0aGUgcm9vbSBpdCB3aWxsIGV4aXN0IGluIG90aGVyIGNsaWVudHMgYW5kIGJlIGNyZWF0ZWQgYnkgTkFGKVxuICAgICAgICAgICAgICAgICAgICAvLyBvciBjcmVhdGUgYW4gZW50aXR5IGlmIHdlIGFyZSBmaXJzdC5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IGZ1bmN0aW9uIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ldElkO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBiZSBwYXJ0IG9mIGEgTmV0d29ya2VkIEdMVEYgaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgcGlubmVkIGFuZCBsb2FkZWQgd2hlbiB3ZSBlbnRlciB0aGUgcm9vbS4gIFVzZSB0aGUgbmV0d29ya2VkIHBhcmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgcGx1cyBhIGRpc2FtYmlndWF0aW5nIGJpdCBvZiB0ZXh0IHRvIGNyZWF0ZSBhIHVuaXF1ZSBJZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IE5BRi51dGlscy5nZXROZXR3b3JrSWQobmV0d29ya2VkRWwpICsgXCItaHRtbC1zY3JpcHRcIjtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIG5lZWQgdG8gY3JlYXRlIGFuIGVudGl0eSwgdXNlIHRoZSBzYW1lIHBlcnNpc3RlbmNlIGFzIG91clxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmsgZW50aXR5ICh0cnVlIGlmIHBpbm5lZCwgZmFsc2UgaWYgbm90KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQgPSBlbnRpdHkuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5wZXJzaXN0ZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIG9ubHkgaGFwcGVucyBpZiB0aGlzIGNvbXBvbmVudCBpcyBvbiBhIHNjZW5lIGZpbGUsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsZW1lbnRzIG9uIHRoZSBzY2VuZSBhcmVuJ3QgbmV0d29ya2VkLiAgU28gbGV0J3MgYXNzdW1lIGVhY2ggZW50aXR5IGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNjZW5lIHdpbGwgaGF2ZSBhIHVuaXF1ZSBuYW1lLiAgQWRkaW5nIGEgYml0IG9mIHRleHQgc28gd2UgY2FuIGZpbmQgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgRE9NIHdoZW4gZGVidWdnaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gdGhpcy5mdWxsTmFtZS5yZXBsYWNlQWxsKFwiX1wiLFwiLVwiKSArIFwiLWh0bWwtc2NyaXB0XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgdGhlIG5ldHdvcmtlZCBlbnRpdHkgd2UgY3JlYXRlIGZvciB0aGlzIGNvbXBvbmVudCBhbHJlYWR5IGV4aXN0cy4gXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UsIGNyZWF0ZSBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gLSBOT1RFOiBpdCBpcyBjcmVhdGVkIG9uIHRoZSBzY2VuZSwgbm90IGFzIGEgY2hpbGQgb2YgdGhpcyBlbnRpdHksIGJlY2F1c2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgTkFGIGNyZWF0ZXMgcmVtb3RlIGVudGl0aWVzIGluIHRoZSBzY2VuZS5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmVudGl0aWVzLmhhc0VudGl0eShuZXRJZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBOQUYuZW50aXRpZXMuZ2V0RW50aXR5KG5ldElkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1ldGhvZCB0byByZXRyaWV2ZSB0aGUgc2NyaXB0IGRhdGEgb24gdGhpcyBlbnRpdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBcIm5ldHdvcmtlZFwiIGNvbXBvbmVudCBzaG91bGQgaGF2ZSBwZXJzaXN0ZW50PXRydWUsIHRoZSB0ZW1wbGF0ZSBhbmQgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHNldCwgb3duZXIgc2V0IHRvIFwic2NlbmVcIiAoc28gdGhhdCBpdCBkb2Vzbid0IHVwZGF0ZSB0aGUgcmVzdCBvZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSB3b3JsZCB3aXRoIGl0J3MgaW5pdGlhbCBkYXRhLCBhbmQgc2hvdWxkIE5PVCBzZXQgY3JlYXRvciAodGhlIHN5c3RlbSB3aWxsIGRvIHRoYXQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LnNldEF0dHJpYnV0ZSgnbmV0d29ya2VkJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudDogcGVyc2lzdGVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3duZXI6IFwic2NlbmVcIiwgIC8vIHNvIHRoYXQgb3VyIGluaXRpYWwgdmFsdWUgZG9lc24ndCBvdmVyd3JpdGUgb3RoZXJzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtJZDogbmV0SWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYXBwZW5kQ2hpbGQoZW50aXR5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2F2ZSBhIHBvaW50ZXIgdG8gdGhlIG5ldHdvcmtlZCBlbnRpdHkgYW5kIHRoZW4gd2FpdCBmb3IgaXQgdG8gYmUgZnVsbHlcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIGJlZm9yZSBnZXR0aW5nIGEgcG9pbnRlciB0byB0aGUgYWN0dWFsIG5ldHdvcmtlZCBjb21wb25lbnQgaW4gaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLm5ldEVudGl0eSkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wic2NyaXB0LWRhdGFcIl1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgdGhlIGZpcnN0IG5ldHdvcmtlZCBlbnRpdHksIGl0J3Mgc2hhcmVkRGF0YSB3aWxsIGRlZmF1bHQgdG8gdGhlIGVtcHR5IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0cmluZywgYW5kIHdlIHNob3VsZCBpbml0aWFsaXplIGl0IHdpdGggdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuc2hhcmVkRGF0YSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgbmV0d29ya2VkID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tcIm5ldHdvcmtlZFwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiAobmV0d29ya2VkLmRhdGEuY3JlYXRvciA9PSBOQUYuY2xpZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIHRoaXMuc3RhdGVTeW5jLmluaXRTaGFyZWREYXRhKHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMuZWwpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkobmV0d29ya2VkRWwpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSgpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSB0aGlzLnNldHVwTmV0d29ya2VkLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIG1ldGhvZCBoYW5kbGVzIHRoZSBkaWZmZXJlbnQgc3RhcnR1cCBjYXNlczpcbiAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmUsIE5BRiB3aWxsIGJlIGNvbm5lY3RlZCBhbmQgd2UgY2FuIFxuICAgICAgICAgICAgICAgICAgICAvLyAgIGltbWVkaWF0ZWx5IGluaXRpYWxpemVcbiAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiBpcyBpbiB0aGUgcm9vbSBzY2VuZSBvciBwaW5uZWQsIGl0IHdpbGwgbGlrZWx5IGJlIGNyZWF0ZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gICBiZWZvcmUgTkFGIGlzIHN0YXJ0ZWQgYW5kIGNvbm5lY3RlZCwgc28gd2Ugd2FpdCBmb3IgYW4gZXZlbnQgdGhhdCBpc1xuICAgICAgICAgICAgICAgICAgICAvLyAgIGZpcmVkIHdoZW4gSHVicyBoYXMgc3RhcnRlZCBOQUZcbiAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5jb25uZWN0aW9uICYmIE5BRi5jb25uZWN0aW9uLmlzQ29ubmVjdGVkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQoKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdkaWRDb25uZWN0VG9OZXR3b3JrZWRTY2VuZScsIHRoaXMuc2V0dXBOZXR3b3JrZWQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIC8vIGlmIGF0dGFjaGVkIHRvIGEgbm9kZSB3aXRoIGEgbWVkaWEtbG9hZGVyIGNvbXBvbmVudCwgdGhpcyBtZWFucyB3ZSBhdHRhY2hlZCB0aGlzIGNvbXBvbmVudFxuICAgICAgICAvLyB0byBhIG1lZGlhIG9iamVjdCBpbiBTcG9rZS4gIFdlIHNob3VsZCB3YWl0IHRpbGwgdGhlIG9iamVjdCBpcyBmdWxseSBsb2FkZWQuICBcbiAgICAgICAgLy8gT3RoZXJ3aXNlLCBpdCB3YXMgYXR0YWNoZWQgdG8gc29tZXRoaW5nIGluc2lkZSBhIEdMVEYgKHByb2JhYmx5IGluIGJsZW5kZXIpXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgcGxheTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LnBsYXkoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHBhdXNlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQucGF1c2UoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIGhhbmRsZSBcImludGVyYWN0XCIgZXZlbnRzIGZvciBjbGlja2FibGUgZW50aXRpZXNcbiAgICBjbGlja2VkOiBmdW5jdGlvbihldnQpIHtcbiAgICAgICAgdGhpcy5zY3JpcHQuY2xpY2tlZChldnQpIFxuICAgIH0sXG4gIFxuICAgIC8vIG1ldGhvZHMgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgaHRtbCBvYmplY3Qgc28gdGhleSBjYW4gdXBkYXRlIG5ldHdvcmtlZCBkYXRhXG4gICAgdGFrZU93bmVyc2hpcDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnRha2VPd25lcnNoaXAoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7ICAvLyBzdXJlLCBnbyBhaGVhZCBhbmQgY2hhbmdlIGl0IGZvciBub3dcbiAgICAgICAgfVxuICAgIH0sXG4gICAgXG4gICAgc2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oZGF0YU9iamVjdCkge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXRlU3luYy5zZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9LFxuXG4gICAgLy8gdGhpcyBpcyBjYWxsZWQgZnJvbSBiZWxvdywgdG8gZ2V0IHRoZSBpbml0aWFsIGRhdGEgZnJvbSB0aGUgc2NyaXB0XG4gICAgZ2V0U2hhcmVkRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyaXB0LmdldFNoYXJlZERhdGEoKVxuICAgICAgICB9XG4gICAgICAgIC8vIHNob3VsZG4ndCBoYXBwZW5cbiAgICAgICAgY29uc29sZS53YXJuKFwic2NyaXB0LWRhdGEgY29tcG9uZW50IGNhbGxlZCBwYXJlbnQgZWxlbWVudCBidXQgdGhlcmUgaXMgbm8gc2NyaXB0IHlldD9cIilcbiAgICAgICAgcmV0dXJuIFwie31cIlxuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICBpZiAoIXRoaXMuc2NyaXB0KSByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgLy8gbW9yZSBvciBsZXNzIGNvcGllZCBmcm9tIFwiaG92ZXJhYmxlLXZpc3VhbHMuanNcIiBpbiBodWJzXG4gICAgICAgICAgICBjb25zdCB0b2dnbGluZyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zW1wiaHVicy1zeXN0ZW1zXCJdLmN1cnNvclRvZ2dsaW5nU3lzdGVtO1xuICAgICAgICAgICAgdmFyIHBhc3N0aHJ1SW50ZXJhY3RvciA9IFtdXG5cbiAgICAgICAgICAgIGxldCBpbnRlcmFjdG9yT25lLCBpbnRlcmFjdG9yVHdvO1xuICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcbiAgICAgICAgICAgIGlmICghaW50ZXJhY3Rpb24ucmVhZHkpIHJldHVybjsgLy9ET01Db250ZW50UmVhZHkgd29ya2Fyb3VuZFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBsZXQgaG92ZXJFbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdEhhbmQuaGVsZCkge1xuICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICF0b2dnbGluZy5sZWZ0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JPbmUpIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3Rvck9uZS5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheUwuc2V0KHBvcywgZGlyKVxuXG4gICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheUwpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgIXRvZ2dsaW5nLnJpZ2h0VG9nZ2xlZE9mZlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdG9yVHdvID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5yaWdodEhhbmQuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGludGVyYWN0b3JUd28pIHtcbiAgICAgICAgICAgICAgICBsZXQgcG9zID0gaW50ZXJhY3RvclR3by5wb3NpdGlvblxuICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgcG9zLmFkZFNjYWxlZFZlY3RvcihkaXIsIC0wLjEpXG4gICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIuc2V0KHBvcywgZGlyKVxuICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlSKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmludGVyYWN0aW9uUmF5cyA9IHBhc3N0aHJ1SW50ZXJhY3RvclxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlbid0IGZpbmlzaGVkIHNldHRpbmcgdXAgdGhlIG5ldHdvcmtlZCBlbnRpdHkgZG9uJ3QgZG8gYW55dGhpbmcuXG4gICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykgeyByZXR1cm4gfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgc3RhdGUgaGFzIGNoYW5nZWQgaW4gdGhlIG5ldHdvcmtlZCBkYXRhLCB1cGRhdGUgb3VyIGh0bWwgb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LnVwZGF0ZVNoYXJlZERhdGEodGhpcy5zdGF0ZVN5bmMuZGF0YU9iamVjdClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2NyaXB0LnRpY2sodGltZSlcbiAgICB9LFxuICBcbiAgICAvLyBUT0RPOiAgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIGlmIHRoZXJlIGlzIG5vIHBhcmFtZXRlciBzcGVjaWZ5aW5nIHRoZVxuICAgIC8vIGh0bWwgc2NyaXB0IG5hbWUuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5mdWxsTmFtZSA9PT0gXCJcIikge1xuXG4gICAgICAgICAgICAvLyBUT0RPOiAgc3dpdGNoIHRoaXMgdG8gZmluZCBlbnZpcm9ubWVudC1yb290IGFuZCBnbyBkb3duIHRvIFxuICAgICAgICAgICAgLy8gdGhlIG5vZGUgYXQgdGhlIHJvb20gb2Ygc2NlbmUgKG9uZSBhYm92ZSB0aGUgdmFyaW91cyBub2RlcykuICBcbiAgICAgICAgICAgIC8vIHRoZW4gZ28gdXAgZnJvbSBoZXJlIHRpbGwgd2UgZ2V0IHRvIGEgbm9kZSB0aGF0IGhhcyB0aGF0IG5vZGVcbiAgICAgICAgICAgIC8vIGFzIGl0J3MgcGFyZW50XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICAgICAgfSBcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJjb21wb25lbnROYW1lXCJcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIGZldGNoIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgcmVzb3VyY2VcbiAgICAgICAgLy8gY29tcG9uZW50TmFtZVxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmZ1bGxOYW1lLm1hdGNoKC9fKFtBLVphLXowLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMywgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJodG1sLXNjcmlwdCBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5mdWxsTmFtZSlcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IG51bGxcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHBhcmFtc1sxXVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxvYWRTY3JpcHQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaWYgKHNjcmlwdFByb21pc2UpIHtcbiAgICAgICAgLy8gICAgIHRyeSB7XG4gICAgICAgIC8vICAgICAgICAgaHRtbENvbXBvbmVudHMgPSBhd2FpdCBzY3JpcHRQcm9taXNlO1xuICAgICAgICAvLyAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgLy8gICAgICAgICByZXR1cm5cbiAgICAgICAgLy8gICAgIH1cbiAgICAgICAgLy8gICAgIHNjcmlwdFByb21pc2UgPSBudWxsXG4gICAgICAgIC8vIH1cbiAgICAgICAgdmFyIGluaXRTY3JpcHQgPSBodG1sQ29tcG9uZW50c1t0aGlzLmNvbXBvbmVudE5hbWVdXG4gICAgICAgIGlmICghaW5pdFNjcmlwdCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiJ2h0bWwtc2NyaXB0JyBjb21wb25lbnQgZG9lc24ndCBoYXZlIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JpcHQgPSBpbml0U2NyaXB0KHRoaXMuc2NyaXB0RGF0YSlcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KXtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0Lm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgLy8gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC5yZWZyZXNoKHRydWUpXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnVwZGF0ZSh0cnVlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiJ2h0bWwtc2NyaXB0JyBjb21wb25lbnQgZmFpbGVkIHRvIGluaXRpYWxpemUgc2NyaXB0IGZvciBcIiArIHRoaXMuY29tcG9uZW50TmFtZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgZGVzdHJveVNjcmlwdDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QucmVtb3ZlRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbC5yZW1vdmVDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcbiAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBudWxsXG5cbiAgICAgICAgdGhpcy5zY3JpcHQuZGVzdHJveSgpXG4gICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbFxuICAgIH1cbn0pXG5cbi8vXG4vLyBDb21wb25lbnQgZm9yIG91ciBuZXR3b3JrZWQgc3RhdGUuICBUaGlzIGNvbXBvbmVudCBkb2VzIG5vdGhpbmcgZXhjZXB0IGFsbCB1cyB0byBcbi8vIGNoYW5nZSB0aGUgc3RhdGUgd2hlbiBhcHByb3ByaWF0ZS4gV2UgY291bGQgc2V0IHRoaXMgdXAgdG8gc2lnbmFsIHRoZSBjb21wb25lbnQgYWJvdmUgd2hlblxuLy8gc29tZXRoaW5nIGhhcyBjaGFuZ2VkLCBpbnN0ZWFkIG9mIGhhdmluZyB0aGUgY29tcG9uZW50IGFib3ZlIHBvbGwgZWFjaCBmcmFtZS5cbi8vXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnc2NyaXB0LWRhdGEnLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNjcmlwdGRhdGE6IHt0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcInt9XCJ9LFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnRha2VPd25lcnNoaXAgPSB0aGlzLnRha2VPd25lcnNoaXAuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhID0gdGhpcy5zZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG5cbiAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gdGhpcy5lbC5nZXRTaGFyZWREYXRhKCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkodGhpcy5kYXRhT2JqZWN0KSlcbiAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKFwic2NyaXB0LWRhdGFcIiwgXCJzY3JpcHRkYXRhXCIsIHRoaXMuc2hhcmVkRGF0YSk7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkNvdWxkbid0IGVuY29kZSBpbml0aWFsIHNjcmlwdCBkYXRhIG9iamVjdDogXCIsIGUsIHRoaXMuZGF0YU9iamVjdClcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IFwie31cIlxuICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoYW5nZWQgPSBmYWxzZTtcbiAgICB9LFxuXG4gICAgdXBkYXRlKCkge1xuICAgICAgICB0aGlzLmNoYW5nZWQgPSAhKHRoaXMuc2hhcmVkRGF0YSA9PT0gdGhpcy5kYXRhLnNjcmlwdGRhdGEpO1xuICAgICAgICBpZiAodGhpcy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHRoaXMuc2NyaXB0RGF0YSkpXG5cbiAgICAgICAgICAgICAgICAvLyBkbyB0aGVzZSBhZnRlciB0aGUgSlNPTiBwYXJzZSB0byBtYWtlIHN1cmUgaXQgaGFzIHN1Y2NlZWRlZFxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IHRoaXMuZGF0YS5zY3JpcHRkYXRhO1xuICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlZCA9IHRydWVcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjb3VsZG4ndCBwYXJzZSBKU09OIHJlY2VpdmVkIGluIHNjcmlwdC1zeW5jOiBcIiwgZSlcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcIlwiXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBpdCBpcyBsaWtlbHkgdGhhdCBhcHBseVBlcnNpc3RlbnRTeW5jIG9ubHkgbmVlZHMgdG8gYmUgY2FsbGVkIGZvciBwZXJzaXN0ZW50XG4gICAgLy8gbmV0d29ya2VkIGVudGl0aWVzLCBzbyB3ZSBfcHJvYmFibHlfIGRvbid0IG5lZWQgdG8gZG8gdGhpcy4gIEJ1dCBpZiB0aGVyZSBpcyBub1xuICAgIC8vIHBlcnNpc3RlbnQgZGF0YSBzYXZlZCBmcm9tIHRoZSBuZXR3b3JrIGZvciB0aGlzIGVudGl0eSwgdGhpcyBjb21tYW5kIGRvZXMgbm90aGluZy5cbiAgICBwbGF5KCkge1xuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZCkge1xuICAgICAgICAgICAgLy8gbm90IHN1cmUgaWYgdGhpcyBpcyByZWFsbHkgbmVlZGVkLCBidXQgY2FuJ3QgaHVydFxuICAgICAgICAgICAgaWYgKEFQUC51dGlscykgeyAvLyB0ZW1wb3JhcnkgdGlsbCB3ZSBzaGlwIG5ldyBjbGllbnRcbiAgICAgICAgICAgICAgICBBUFAudXRpbHMuYXBwbHlQZXJzaXN0ZW50U3luYyh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEubmV0d29ya0lkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICB0YWtlT3duZXJzaGlwKCkge1xuICAgICAgICBpZiAoIU5BRi51dGlscy5pc01pbmUodGhpcy5lbCkgJiYgIU5BRi51dGlscy50YWtlT3duZXJzaGlwKHRoaXMuZWwpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcblxuICAgIC8vIGluaXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAvLyAgICAgdHJ5IHtcbiAgICAvLyAgICAgICAgIHZhciBodG1sU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgIC8vICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gaHRtbFN0cmluZ1xuICAgIC8vICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gZGF0YU9iamVjdFxuICAgIC8vICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAvLyAgICAgfSBjYXRjaCAoZSkge1xuICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgIC8vICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgLy8gICAgIH1cbiAgICAvLyB9LFxuXG4gICAgLy8gVGhlIGtleSBwYXJ0IGluIHRoZXNlIG1ldGhvZHMgKHdoaWNoIGFyZSBjYWxsZWQgZnJvbSB0aGUgY29tcG9uZW50IGFib3ZlKSBpcyB0b1xuICAgIC8vIGNoZWNrIGlmIHdlIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSB0aGUgbmV0d29ya2VkIG9iamVjdC4gIElmIHdlIG93biBpdCAoaXNNaW5lKCkgaXMgdHJ1ZSlcbiAgICAvLyB3ZSBjYW4gY2hhbmdlIGl0LiAgSWYgd2UgZG9uJ3Qgb3duIGluLCB3ZSBjYW4gdHJ5IHRvIGJlY29tZSB0aGUgb3duZXIgd2l0aFxuICAgIC8vIHRha2VPd25lcnNoaXAoKS4gSWYgdGhpcyBzdWNjZWVkcywgd2UgY2FuIHNldCB0aGUgZGF0YS4gIFxuICAgIC8vXG4gICAgLy8gTk9URTogdGFrZU93bmVyc2hpcCBBVFRFTVBUUyB0byBiZWNvbWUgdGhlIG93bmVyLCBieSBhc3N1bWluZyBpdCBjYW4gYmVjb21lIHRoZVxuICAgIC8vIG93bmVyIGFuZCBub3RpZnlpbmcgdGhlIG5ldHdvcmtlZCBjb3BpZXMuICBJZiB0d28gb3IgbW9yZSBlbnRpdGllcyB0cnkgdG8gYmVjb21lXG4gICAgLy8gb3duZXIsICBvbmx5IG9uZSAodGhlIGxhc3Qgb25lIHRvIHRyeSkgYmVjb21lcyB0aGUgb3duZXIuICBBbnkgc3RhdGUgdXBkYXRlcyBkb25lXG4gICAgLy8gYnkgdGhlIFwiZmFpbGVkIGF0dGVtcHRlZCBvd25lcnNcIiB3aWxsIG5vdCBiZSBkaXN0cmlidXRlZCB0byB0aGUgb3RoZXIgY2xpZW50cyxcbiAgICAvLyBhbmQgd2lsbCBiZSBvdmVyd3JpdHRlbiAoZXZlbnR1YWxseSkgYnkgdXBkYXRlcyBmcm9tIHRoZSBvdGhlciBjbGllbnRzLiAgIEJ5IG5vdFxuICAgIC8vIGF0dGVtcHRpbmcgdG8gZ3VhcmFudGVlIG93bmVyc2hpcCwgdGhpcyBjYWxsIGlzIGZhc3QgYW5kIHN5bmNocm9ub3VzLiAgQW55IFxuICAgIC8vIG1ldGhvZHMgZm9yIGd1YXJhbnRlZWluZyBvd25lcnNoaXAgY2hhbmdlIHdvdWxkIHRha2UgYSBub24tdHJpdmlhbCBhbW91bnQgb2YgdGltZVxuICAgIC8vIGJlY2F1c2Ugb2YgbmV0d29yayBsYXRlbmNpZXMuXG5cbiAgICBzZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKFwic2NyaXB0LWRhdGFcIiwgXCJzY3JpcHRkYXRhXCIsIGh0bWxTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuLy8gQWRkIG91ciB0ZW1wbGF0ZSBmb3Igb3VyIG5ldHdvcmtlZCBvYmplY3QgdG8gdGhlIGEtZnJhbWUgYXNzZXRzIG9iamVjdCxcbi8vIGFuZCBhIHNjaGVtYSB0byB0aGUgTkFGLnNjaGVtYXMuICBCb3RoIG11c3QgYmUgdGhlcmUgdG8gaGF2ZSBjdXN0b20gY29tcG9uZW50cyB3b3JrXG5cbmNvbnN0IGFzc2V0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJhLWFzc2V0c1wiKTtcblxuYXNzZXRzLmluc2VydEFkamFjZW50SFRNTChcbiAgICAnYmVmb3JlZW5kJyxcbiAgICBgXG4gICAgPHRlbXBsYXRlIGlkPVwic2NyaXB0LWRhdGEtbWVkaWFcIj5cbiAgICAgIDxhLWVudGl0eVxuICAgICAgICBzY3JpcHQtZGF0YVxuICAgICAgPjwvYS1lbnRpdHk+XG4gICAgPC90ZW1wbGF0ZT5cbiAgYFxuICApXG5cbmNvbnN0IHZlY3RvclJlcXVpcmVzVXBkYXRlID0gZXBzaWxvbiA9PiB7XG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdGxldCBwcmV2ID0gbnVsbDtcblx0XHRcdHJldHVybiBjdXJyID0+IHtcblx0XHRcdFx0aWYgKHByZXYgPT09IG51bGwpIHtcblx0XHRcdFx0XHRwcmV2ID0gbmV3IFRIUkVFLlZlY3RvcjMoY3Vyci54LCBjdXJyLnksIGN1cnIueik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIU5BRi51dGlscy5hbG1vc3RFcXVhbFZlYzMocHJldiwgY3VyciwgZXBzaWxvbikpIHtcblx0XHRcdFx0XHRwcmV2LmNvcHkoY3Vycik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9O1xuXG5OQUYuc2NoZW1hcy5hZGQoe1xuICBcdHRlbXBsYXRlOiBcIiNzY3JpcHQtZGF0YS1tZWRpYVwiLFxuICAgIGNvbXBvbmVudHM6IFtcbiAgICAvLyB7XG4gICAgLy8gICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgIC8vICAgICBwcm9wZXJ0eTogXCJyb3RhdGlvblwiLFxuICAgIC8vICAgICByZXF1aXJlc05ldHdvcmtVcGRhdGU6IHZlY3RvclJlcXVpcmVzVXBkYXRlKDAuMDAxKVxuICAgIC8vIH0sXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwic2NhbGVcIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIHtcbiAgICAgIFx0Y29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgICBcdHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgIH1dLFxuICAgICAgbm9uQXV0aG9yaXplZENvbXBvbmVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgICAgICAgcHJvcGVydHk6IFwic2NyaXB0ZGF0YVwiXG4gICAgICB9XG4gICAgXSxcblxuICB9KTtcblxuIiwiLyoqXG4gKiBjb250cm9sIGEgdmlkZW8gZnJvbSBhIGNvbXBvbmVudCB5b3Ugc3RhbmQgb24uICBJbXBsZW1lbnRzIGEgcmFkaXVzIGZyb20gdGhlIGNlbnRlciBvZiBcbiAqIHRoZSBvYmplY3QgaXQncyBhdHRhY2hlZCB0bywgaW4gbWV0ZXJzXG4gKi9cblxuaW1wb3J0IHsgRW50aXR5LCBDb21wb25lbnQgfSBmcm9tICdhZnJhbWUnXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcblxuaW50ZXJmYWNlIEFPYmplY3QzRCBleHRlbmRzIFRIUkVFLk9iamVjdDNEIHtcbiAgICBlbDogRW50aXR5XG59XG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgndmlkZW8tY29udHJvbC1wYWQnLCB7XG4gICAgbWVkaWFWaWRlbzoge30gYXMgQ29tcG9uZW50LFxuICAgIFxuICAgIHNjaGVtYToge1xuICAgICAgICB0YXJnZXQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IFwiXCIgfSwgIC8vIGlmIG5vdGhpbmcgcGFzc2VkLCBqdXN0IGNyZWF0ZSBzb21lIG5vaXNlXG4gICAgICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9XG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS50YXJnZXQubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIG11c3QgaGF2ZSAndGFyZ2V0JyBzZXRcIilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gd2FpdCB1bnRpbCB0aGUgc2NlbmUgbG9hZHMgdG8gZmluaXNoLiAgV2Ugd2FudCB0byBtYWtlIHN1cmUgZXZlcnl0aGluZ1xuICAgICAgICAvLyBpcyBpbml0aWFsaXplZFxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsICgpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemUoKVxuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgdiA9IHRoaXMuZWwuc2NlbmVFbD8ub2JqZWN0M0QuZ2V0T2JqZWN0QnlOYW1lKHRoaXMuZGF0YS50YXJnZXQpIGFzIEFPYmplY3QzRFxuICAgICAgICBpZiAodiA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIHRhcmdldCAnXCIgKyB0aGlzLmRhdGEudGFyZ2V0ICsgXCInIGRvZXMgbm90IGV4aXN0XCIpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICggdi5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdIHx8IHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdICkge1xuICAgICAgICAgICAgaWYgKHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cFZpZGVvUGFkKHYpXG4gICAgICAgICAgICAgICAgICAgIHYuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgZm4pXG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2LmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgZm4pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBWaWRlb1BhZCh2KVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgdGFyZ2V0ICdcIiArIHRoaXMuZGF0YS50YXJnZXQgKyBcIicgaXMgbm90IGEgdmlkZW8gZWxlbWVudFwiKVxuICAgICAgICB9XG5cbiAgICB9LFxuXG4gICAgc2V0dXBWaWRlb1BhZDogZnVuY3Rpb24gKHZpZGVvOiBBT2JqZWN0M0QpIHtcbiAgICAgICAgdGhpcy5tZWRpYVZpZGVvID0gdmlkZW8uZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4gICAgICAgIGlmICh0aGlzLm1lZGlhVmlkZW8gPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCB0YXJnZXQgJ1wiICsgdGhpcy5kYXRhLnRhcmdldCArIFwiJyBpcyBub3QgYSB2aWRlbyBlbGVtZW50XCIpXG4gICAgICAgIH1cblxuICAgICAgICAvLyAvL0B0cy1pZ25vcmVcbiAgICAgICAgLy8gaWYgKCF0aGlzLm1lZGlhVmlkZW8udmlkZW8ucGF1c2VkKSB7XG4gICAgICAgIC8vICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgLy8gICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgLy8gfVxuXG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdwcm94aW1pdHktZXZlbnRzJywgeyByYWRpdXM6IHRoaXMuZGF0YS5yYWRpdXMsIFlvZmZzZXQ6IDEuNiB9KVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWVudGVyJywgKCkgPT4gdGhpcy5lbnRlclJlZ2lvbigpKVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5sZWF2ZVJlZ2lvbigpKVxuICAgIH0sXG5cbiAgICBlbnRlclJlZ2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5tZWRpYVZpZGVvLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgIC8vQHRzLWlnbm9yZVxuICAgICAgICAgICAgdGhpcy5tZWRpYVZpZGVvLnRvZ2dsZVBsYXlpbmcoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxlYXZlUmVnaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5tZWRpYVZpZGVvLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgIC8vQHRzLWlnbm9yZVxuICAgICAgICAgICAgdGhpcy5tZWRpYVZpZGVvLnRvZ2dsZVBsYXlpbmcoKVxuICAgICAgICB9XG4gICAgfSxcbn0pXG4iLCJpbXBvcnQgJy4uL3N5c3RlbXMvZmFkZXItcGx1cy5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9wb3J0YWwuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvaW1tZXJzaXZlLTM2MC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9wYXJhbGxheC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9zaGFkZXIudHMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcmVnaW9uLWhpZGVyLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3ZpZGVvLWNvbnRyb2wtcGFkJ1xuXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnaW1tZXJzaXZlLTM2MCcsICdpbW1lcnNpdmUtMzYwJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCAncG9ydGFsJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdzaGFkZXInLCAnc2hhZGVyJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdwYXJhbGxheCcsICdwYXJhbGxheCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCAnaHRtbC1zY3JpcHQnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3JlZ2lvbi1oaWRlcicsICdyZWdpb24taGlkZXInKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3ZpZGVvLWNvbnRyb2wtcGFkJywgJ3ZpZGVvLWNvbnRyb2wtcGFkJylcblxuLy8gZG8gYSBzaW1wbGUgbW9ua2V5IHBhdGNoIHRvIHNlZSBpZiBpdCB3b3Jrc1xuXG4vLyB2YXIgbXlpc01pbmVPckxvY2FsID0gZnVuY3Rpb24gKHRoYXQpIHtcbi8vICAgICByZXR1cm4gIXRoYXQuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQgfHwgKHRoYXQubmV0d29ya2VkRWwgJiYgTkFGLnV0aWxzLmlzTWluZSh0aGF0Lm5ldHdvcmtlZEVsKSk7XG4vLyAgfVxuXG4vLyAgdmFyIHZpZGVvQ29tcCA9IEFGUkFNRS5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl1cbi8vICB2aWRlb0NvbXAuQ29tcG9uZW50LnByb3RvdHlwZS5pc01pbmVPckxvY2FsID0gbXlpc01pbmVPckxvY2FsO1xuXG5sZXQgaG9tZVBhZ2VEZXNjID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2NsYXNzXj1cIkhvbWVQYWdlX19hcHAtZGVzY3JpcHRpb25cIl0nKVxuaWYgKGhvbWVQYWdlRGVzYykge1xuICAgIGhvbWVQYWdlRGVzYy5pbm5lckhUTUwgPSBcIlJlYWxpdHkgTWVkaWEgSW1tZXJzaXZlIEV4cGVyaWVuY2U8YnI+PGJyPkFmdGVyIHNpZ25pbmcgaW4sIHZpc2l0IDxhIGhyZWY9J2h0dHBzOi8vcmVhbGl0eW1lZGlhLmRpZ2l0YWwnPnJlYWxpdHltZWRpYS5kaWdpdGFsPC9hPiB0byBnZXQgc3RhcnRlZFwiXG59XG4iXSwibmFtZXMiOlsid29ybGRDYW1lcmEiLCJ3b3JsZFNlbGYiLCJkZWZhdWx0SG9va3MiLCJnbHNsIiwidW5pZm9ybXMiLCJsb2FkZXIiLCJub2lzZVRleCIsInNtYWxsTm9pc2UiLCJ3YXJwVGV4Iiwic25vaXNlIiwiTWF0ZXJpYWxNb2RpZmllciIsInBhbm92ZXJ0IiwicGFub2ZyYWciXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFO0FBQ3BDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDbEQsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDOUMsR0FBRztBQUNIO0FBQ0EsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLElBQUk7QUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUU7QUFDN0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztBQUNsQyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUs7QUFDOUIsUUFBUSxJQUFJLEVBQUUsS0FBSyxDQUFDLFFB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TUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFO1FBQ3BELFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFO1FBQ3BELE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFO1FBQzlCLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ2xDLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsVUFBVSxFQUFFO1FBQzFDLFlBQVksRUFBRSxFQUFFLEtBQUssRUFBZ0MsQ0FBQyxDQUFJLEVBQUU7UUFDNUQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUU7UUFDcEMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDcEQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUU7UUFDbEMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxN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Q0FBQyxRQUFRLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUE7UUFDeEUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQTtRQUV2RCxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFBOztRQUd6QyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsR0FBRyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQTtRQUN6QyxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQTtRQUMzQyxRQUFRLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyxLQUFLLEVBQUMsQ0FBQTtRQUNqSCxRQUFRLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQTtRQUN2SCxRQUFRLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sR0FBRyxPQUFPLEVBQUUsQ0FBQTtRQUNsRyxRQUFRLENBQUMsUUFBUSxDQUFDLFlBQVksR0FBSSxFQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxH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QUNaO0FBQ0EsUUFBUSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUM7QUFDNUMsUUFBUSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztBQUM3QyxRQUFRLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQzlDLFFBQVEsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDO0FBQ2xELFFBQVEsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDO0FBQ2xELFFBQVEsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDO0FBQ2xELFFBQVEsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDO0FBQ2xELEtBQUs7QUFDTCxJQUFJLElBQUksRUFBRSxZQUFZO0FBQ3RCLFFBQVEsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFDM0IsUUFBUSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQ3ZDO0FBQ0EsUUFBUSxJQUFJLENBQUMsVUFBVSxHQUFHO0FBQzFCLFlBQVksS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSztBQUNsQyxZQUFZLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU07QUFDcEMsWUFBWSxVQUFVLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVO0FBQzVDLFlBQVksVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVTtBQUM1QyxZQUFZLFVBQVUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVU7QUFDNUMsWUFBWSxVQUFVLEVBQUUs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
