/**
 * Description
 * ===========
 * break the room into quadrants of a certain size, and hide the contents of areas that have
 * nobody in them.  Media will be paused in those areas too.
 */

 AFRAME.registerComponent('region-hider', {
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
            this.destroyScript()
        }
        this.createScript();
    },

    createScript: function () {
 
    },

    // per frame stuff
    tick: function (time) {

    },
  
  parseNodeName: function () {
        if (this.fullName === "") {
            this.fullName = this.el.parentEl.parentEl.className
        }

        // nodes should be named anything at the beginning with 
        //  "size" (an integer number)
        // at the very end.  This will set the hidder script to 
        // use that size in meters for the quadrants
        const params = this.fullName.match(/_([0-9]*)$/)

        // if pattern matches, we will have length of 2, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("region-hider componentName not formatted correctly: ", this.fullName)
            this.size = 10
        } else {
            this.regionSize = parseInt(params[1])
        }
  },

  loadScript: async function () {

  },

  destroyScript: function () {
      
  }
})