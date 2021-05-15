/**
 * Description
 * ===========
 * create a text object by rendering HTML
 *
 * Usage
 * =====
 * Create a plane in Blender and give it a material (just the default Principled BSDF).
 * Assign color image to "color" channel and depth map to "emissive" channel.
 * You may want to set emissive strength to zero so the preview looks better.
 * Add the "parallax" component from the Hubs extension, configure, and export as .glb
 */

import {WebLayer3D, toDOM, THREE} from '/node_modules/ethereal/dist/ethereal.es.js'

const errorHTML = '<div id="hello" xr-width="2" style="width: 200px; height: 30px; background: rgba(1, 0, 0, 0.6); position:absolute">No Text Provided</div>'

AFRAME.registerComponent('html-text', {
  init: function () {

    this.parseNodeName().then( () => {
        this.div = toDOM(this.htmlText)
        this.simpleLayer = new WebLayer3D(this.div)
        this.simpleLayer.update()

        this.simpleContainer = new THREE.Object3D()
        this.simpleContainer.matrixAutoUpdate = true
        this.simpleContainer.add(this.simpleLayer)

        const widthTxt = this.div.getAttribute("xr-width")
        const width = widthTxt ? parseInt(widthTxt) : 0
        if (width > 0) {
            var bbox = new THREE.Box3().setFromObject(this.simpleLayer);
            var size = bbox.max.x - bbox.min.x
            var scale = width / size
            this.simpleContainer.scale.set(scale,scale,scale)
        }
        this.el.object3D.add(this.simpleContainer)
        setInterval(() => {
            this.simpleLayer.update()
        }, 50)
    })
  },
//   tick() {
//   },

parseNodeName: async function () {
    const nodeName = this.el.parentEl.parentEl.className

    // nodes should be named anything at the beginning with 
    //  "dirname_filename"
    // at the very end.  This will fetch a file from the resources
    // directory data/htmltext/dirname/filename
    const params = nodeName.match(/([A-Za-z0-9]*)_([A-Za-z0-9]*)$/)
    
    // if pattern matches, we will have length of 3, first match is the dir,
    // second is the filename name or number
    if (!params || params.length < 3) {
        console.warn("html-text dirname_filename not formatted correctly: ", nodeName)
        this.dirname = null
        this.filename = null
        this.htmlText = errorHTML // default so the portal has a color to use
    } else {
        this.dirname = params[1]
        this.filename = params[2]
        try {
            const fileURL = "https://resources.realitymedia.digital/data/htmlText/" + this.dirname + "/" + this.filename + ".html"
            const res = await fetch(fileURL);
            if (res.ok) {
                this.htmlText = await res.text();
            } else {
                console.warn("Couldn't fetch file " + fileURL);
                this.htmlText = errorHTML
            }
        } catch (e) {
            console.warn("Couldn't fetch file " + fileURL);
        }  
    }
  },

})
