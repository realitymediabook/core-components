/**
 * Description
 * ===========
 * break the room into quadrants of a certain size, and hide the contents of areas that have
 * nobody in them.  Media will be paused in those areas too.
 */

 AFRAME.registerComponent('region-hider', {
    schema: {
        // name must follow the pattern "*_componentName"
        size: { default: 0}
    },
    init: function () {
        this.script = null;

        if (this.el != window.APP.scene) {
            this.nodeName = this.el.parentEl.parentEl.className
        } else {
            this.nodeName = ""
        }
        this.size = this.data.size;

        if (this.size == 0) {
            // if no size provided, look at the name
            this.parseNodeName();
        }

        this.newScene = this.newScene.bind(this)
        this.addRootElement = this.addRootElement.bind(this)
        this.removeRootElement = this.removeRootElement.bind(this)
        this.addSceneElement = this.addSceneElement.bind(this)
        this.removeSceneElement = this.removeSceneElement.bind(this)

        this.el.sceneEl.addEventListener("environment-scene-loaded", this.newScene)
        this.el.sceneEl.addEventListener("child-attached", this.addRootElement)
        this.el.sceneEl.addEventListener("child-detached", this.removeRootElement)

        const environmentScene = document.querySelector("#environment-scene");
        environmentScene.addEventListener("child-attached", this.addSceneElement)
        environmentScene.addEventListener("child-detached", this.removeSceneElement)

    },

    update: function () {
        if (this.data.size === this.size) return

        this.size = this.data.size;
        if (this.size == 0) {
            // if no size provided, look at the name
            this.parseNodeName();
        }

        if (this.script) {
            this.destroyScript()
        }
        this.createScript();
    },

    // per frame stuff
    tick: function (time) {

    },
  
    newScene: function(model) {
        console.log("environment scene loaded: ", model)
    },

    addRootElement: function({ detail: { el } }) {
        console.log("entity added to root: ", el)
    },

    removeRootElement: function({ detail: { el } }) {
        console.log("entity removed from root: ", el)
    },

    addSceneElement: function({ detail: { el } }) {
        console.log("entity added to environment scene: ", el)
    },

    removeSceneElement: function({ detail: { el } }) {
        console.log("entity removed from environment scene: ", el)
    },  
    
    parseNodeName: function () {
        // nodes should be named anything at the beginning with 
        //  "size" (an integer number)
        // at the very end.  This will set the hidder script to 
        // use that size in meters for the quadrants
        const params = this.nodeName.match(/_([0-9]*)$/)

        // if pattern matches, we will have length of 2, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("region-hider componentName not formatted correctly: ", this.nodeName)
            this.size = 10
        } else {
            this.size = parseInt(params[1])
        }
    }
})