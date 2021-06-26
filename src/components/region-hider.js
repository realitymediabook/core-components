/**
 * Description
 * ===========
 * break the room into quadrants of a certain size, and hide the contents of areas that have
 * nobody in them.  Media will be paused in those areas too.
 * 
 * Include a way for the portal component to turn on elements in the region of the portal before
 * it captures a cubemap
 */

import { registerComponentInstance, deregisterComponentInstance } from "../utils/component-utils";
import { findAncestorWithComponent } from "../utils/scene-graph";

 // arbitrarily choose 1000000 as the number of computed zones in  x and y
let MAX_ZONES = 1000000
let regionTag = function(size, obj3d) {
    let pos = obj3d.position
    let xp = Math.floor(pos.x / size) + MAX_ZONES/2
    let zp = Math.floor(pos.z / size) + MAX_ZONES/2
    return MAX_ZONES * xp + zp
}

let regionsInUse = []

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
    regionsInUse[region] ? regionsInUse[region]++ : regionsInUse[region] = 1
    console.log("Avatars in region " + region + ": " + regionsInUse[region])
    if (regionsInUse[region] == 1) {
        showHideObjectsInRegion(region, true)
    } else {
        console.log("already another avatar in this region, no change")
    }
}

function subtractFromRegion(region) {
    if (regionsInUse[region]) {regionsInUse[region]-- }
    console.log("Avatars left region " + region + ": " + regionsInUse[region])

    if (regionsInUse[region] == 0) {
        showHideObjectsInRegion(region, false)
    } else {
        console.log("still another avatar in this region, no change")
    }
}

export function showRegionForObject(element) {
    let follower = getRegionFollower(element)
    if (!follower) { return }

    console.log("showing objects near " + follower.el.className)

    addToRegion(follower.region)
}

export function hiderRegionForObject(element) {
    let follower = getRegionFollower(element)
    if (!follower) { return }

    console.log("hiding objects near " + follower.el.className)

    subtractFromRegion(follower.region)
}

function showHideObjects() {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ("showing/hiding all objects")
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      let visible = regionsInUse[obj.region] ? true: false
        
      if (obj.el.object3D.visible == visible) { continue }

      console.log ((visible ? "showing " : "hiding ") + obj.el.className)
      obj.showHide(visible)
    }
  
    return null;
}

function showHideObjectsInRegion(region, visible) {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ((visible ? "showing" : "hiding") + " all objects in region " + region)
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      if (obj.region == region) {
        console.log ((visible ? "showing " : " hiding") + obj.el.className)
        obj.showHide(visible)
      }
    }
  
    return null;
}
  
AFRAME.registerComponent('avatar-region-follower', {
    schema: {
        size: { default: 10 }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D)
        console.log("Avatar: region ", this.region)
        addToRegion(this.region)

        registerComponentInstance(this, "avatar-region-follower");
    },
    remove: function() {
        deregisterComponentInstance(this, "avatar-region-follower");
        subtractFromRegion(this.region)
    },

    tick: function () {
        let newRegion = regionTag(this.data.size, this.el.object3D)
        if (newRegion != this.region) {
            subtractFromRegion(this.region)
            addToRegion(newRegion)
            this.region = newRegion
        }
    },
})

AFRAME.registerComponent('object-region-follower', {
    schema: {
        size: { default: 10 },
        dynamic: { default: true }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D)

        this.showHide = this.showHide.bind(this)
        if (this.el.components["media-video"]) {
            this.wasPaused = this.el.components["media-video"].data.videoPaused
        }
        registerComponentInstance(this, "object-region-follower");
    },

    remove: function() {
        deregisterComponentInstance(this, "object-region-follower");
    },

    tick: function () {
        // objects in the environment scene don't move
        if (!this.data.dynamic) { return }

        this.region = regionTag(this.data.size, this.el.object3D)

        let visible = regionsInUse[this.region] ? true: false
        
        if (this.el.object3D.visible == visible) { return }

        // handle show/hiding the objects
        this.showHide(visible)
    },

    showHide: function (visible) {
        // handle show/hiding the objects
        this.el.object3D.visible = visible

        /// check for media-video component on parent to see if we're a video.  Also same for audio
        if (this.el.components["media-video"]) {
            if (visible) {
                if (this.wasPaused != this.el.components["media-video"].data.videoPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            } else {
                this.wasPaused = this.el.components["media-video"].data.videoPaused
                if (!this.wasPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            }
        }
    }
})

AFRAME.registerComponent('region-hider', {
    schema: {
        // name must follow the pattern "*_componentName"
        size: { default: 10 }
    },
    init: function () {
        // If there is a parent with "nav-mesh-helper", this is in the scene.  
        // If not, it's in an object we dropped on the window, which we don't support
        if (!findAncestorWithComponent(this.el, "nav-mesh-helper")) {
            console.warn("region-hider component must be in the environment scene glb.")
            this.size = 0;
            return;
        }
        
        this.nodeName = this.el.parentEl.parentEl.className
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
        let roomObjects = document.getElementsByClassName("RoomObjects")
        this.roomObjects = roomObjects.length > 0 ? roomObjects[0] : null

        // get avatars
        const avatars = this.el.sceneEl.querySelectorAll("[player-info]");
        avatars.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size })
        });

        // walk objects in the root (things that have been dropped on the scene)
        // - drawings have class="drawing", networked-drawing
        // Not going to do drawings right now.

        // pinned media live under a node with class="RoomObjects"
        var nodes = this.el.sceneEl.querySelectorAll(".RoomObjects > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size })
        });

        // - camera has camera-tool        
        // - image from camera, or dropped, has media-loader, media-image, listed-media
        // - glb has media-loader, gltf-model-plus, listed-media
        // - video has media-loader, media-video, listed-media
        //
        //  so, get all camera-tools, and media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool], a-scene > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size })
        });

        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size })
        });

        // walk the objects in the environment scene.  Must wait for scene to finish loading
        this.sceneLoaded = this.sceneLoaded.bind(this)
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
            let node = nodes[i]
            if (node == this.el.parentEl.parentEl) {continue}

            let cl = node.className
            if (cl === "CombinedMesh" || cl === "scene-preview-camera") {continue}

            let c = node.components
            if (c["waypoint"] || c["skybox"] || c["directional-light"] || c["ambient-light"] || c["hemisphere-light"]) {continue}

            let ch = node.children
            var navmesh = false;
            for (let j=0; j < ch.length; j++) {
                if (ch[j].components["navmesh"]) {
                    navmesh = true;
                    break;
                }
            }
            if (navmesh) {continue}
            
            node.setAttribute("object-region-follower", { size: this.size, dynamic: false })
        }

        // all objects and avatar should be set up, so lets make sure all objects are correctly shown
        showHideObjects()
    },

    update: function () {
        if (this.data.size == 0) {this.data.size = 10}
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
        var nodes = this.el.sceneEl.querySelectorAll("[player-info]:not([avatar-region-follower])")
        nodes.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size })
        });

        //  see if there are new camera-tools or media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]:not([object-region-follower]), a-scene > [media-loader]:not([object-region-follower])");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size })
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
        const params = this.nodeName.match(/_([0-9]*)$/)

        // if pattern matches, we will have length of 2, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("region-hider componentName not formatted correctly: ", this.nodeName)
            return size
        } else {
            let nodeSize = parseInt(params[1])
            if (!nodeSize) {
                return size
            } else {
                return nodeSize
            }
        }
    }
})