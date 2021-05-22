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

//import {WebLayer3D, toDOM, THREE} from '/node_modules/ethereal/dist/ethereal.es.js'

// const errorHTML = '<div id="hello" xr-width="2" style="width: 200px; height: 30px; background: rgba(1, 0, 0, 0.6); position:absolute">No Text Provided</div>'

import * as htmlComponents from "https://blairhome.ngrok.io/test-vue-app/dist/hubs.js";

AFRAME.registerComponent('html-script', {
    init: function () {

        this.parseNodeName().then( () => {
            if (!this.scriptData) return

            this.simpleContainer = new THREE.Object3D()
            this.simpleContainer.matrixAutoUpdate = true
            this.simpleContainer.add(this.scriptData.webLayer3D)
            this.scriptData.webLayer3D._webLayer._hashingCanvas.width = 20
            this.scriptData.webLayer3D._webLayer._hashingCanvas.height = 20

            const width = this.scriptData.width
            const height = this.scriptData.height
            if (width && width > 0 && height && height > 0) {
                var bbox = new THREE.Box3().setFromObject(this.scriptData.webLayer3D);
                var wsize = bbox.max.x - bbox.min.x
                var hsize = bbox.max.y - bbox.min.y
                var scale = Math.max(width / wsize, height / hsize)
                this.simpleContainer.scale.set(scale,scale,scale)
            }
            // move the layers back.  Hubs uses render order
            // 0: background
            // 1: cursor
            // 2: sprites
            // so, if we start at 0 and increment by 1, we start being interspersed with
            // cursor and icons
            this.scriptData.webLayer3D.traverseLayersPreOrder((layer) => {
                layer.renderOrder = -1000 + layer.renderOrder
            })

            //this.scriptData.webLayer3D.children[0].material.map.encoding = THREE.sRGBEncoding
            // this.scriptData.webLayer3D.children[0].material.needsUpdate = true
            this.el.object3D.add(this.simpleContainer)
            setInterval(() => {
                this.scriptData.webLayer3D.refresh(true)
                this.scriptData.webLayer3D.update(true)
                this.scriptData.webLayer3D.traverseLayersPreOrder((layer) => {
                    layer.renderOrder = -1000 + layer.renderOrder
                    if (layer.children[0].material.map) {
                        layer.children[0].material.map.encoding = THREE.sRGBEncoding
                        layer.children[0].material.needsUpdate = true
                    }
    
                })
    
                // this.scriptData.webLayer3D.traverseLayersPreOrder((layer) => {layer.refresh(); layer.update()})
            }, 50)

            // going to want to try and make the html object clickable
            this.el.setAttribute('is-remote-hover-target','')
            this.el.setAttribute('tags', {singleActionButton: true})
            this.el.setAttribute('class', "interactable")
            // forward the 'interact' events to our object 
            this.clicked = this.clicked.bind(this)
            this.el.object3D.addEventListener('interact', this.clicked)

            this.raycaster = new THREE.Raycaster()
            this.hoverRayL = new THREE.Ray()
            this.hoverRayR = new THREE.Ray()
        })
    },

    clicked: function(evt) {
        const obj = evt.object3D
        this.raycaster.ray.set(obj.position, this.scriptData.webLayer3D.getWorldDirection(new THREE.Vector3()).negate())
        const hit = this.scriptData.webLayer3D.hitTest(this.raycaster.ray)
        if (hit) {
          hit.target.click()
          hit.target.focus()
          console.log('hit', hit.target, hit.layer)
        }   
    },
    // function onSelect(evt: THREE.Event) {
    //     const controller = evt.target as THREE.Object3D
    //     raycaster.ray.set(controller.position, controller.getWorldDirection(new THREE.Vector3()).negate())
    //     const hit = todoLayer.hitTest(raycaster.ray)
    //     if (hit) {
    //       hit.target.click()
    //       hit.target.focus()
    //       console.log('hit', hit.target, hit.layer)
    //     }
    //   }

  
    tick: function (time) {
        // more or less copied from "hoverable-visuals.js" in hubs
        const toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;
        var passthruInteractor = []

        let interactorOne, interactorTwo;
        const interaction = this.el.sceneEl.systems.interaction;
        if (!interaction.ready) return; //DOMContentReady workaround
        
        if (interaction.state.leftHand.hovered === this.el && !interaction.state.leftHand.held) {
          interactorOne = interaction.options.leftHand.entity.object3D;
        }
        if (
          interaction.state.leftRemote.hovered === this.el &&
          !interaction.state.leftRemote.held &&
          !toggling.leftToggledOff
        ) {
          interactorOne = interaction.options.leftRemote.entity.object3D;
        }
        if (interactorOne) {
            let pos = interactorOne.position
            let dir = this.scriptData.webLayer3D.getWorldDirection(new THREE.Vector3()).negate()
            pos.addScaledVector(dir, -0.1)
            this.hoverRayL.set(pos, dir)

            passthruInteractor.push(this.hoverRayL)
        }
        if (
          interaction.state.rightRemote.hovered === this.el &&
          !interaction.state.rightRemote.held &&
          !toggling.rightToggledOff
        ) {
          interactorTwo = interaction.options.rightRemote.entity.object3D;
        }
        if (interaction.state.rightHand.hovered === this.el && !interaction.state.rightHand.held) {
            interactorTwo = interaction.options.rightHand.entity.object3D;
        }
        if (interactorTwo) {
            let pos = interactorTwo.position
            let dir = this.scriptData.webLayer3D.getWorldDirection(new THREE.Vector3()).negate()
            pos.addScaledVector(dir, -0.1)
            this.hoverRayR.set(pos, dir)
            passthruInteractor.push(this.hoverRayR)
        }

        this.scriptData.webLayer3D.interactionRays = passthruInteractor
    },
  
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
        console.warn("html-script dirname_filename not formatted correctly: ", nodeName)
        this.dirname = null
        this.filename = null
        this.scriptData = null
    } else {
        this.dirname = params[1]
        this.filename = params[2]

        var initScript = htmlComponents[this.filename]
        if (!initScript) {
            console.warn("'html-script' component doesn't have script for " + nodeName);
            this.scriptData = null
            return;
        }
        this.scriptData = initScript()
        if (this.scriptData){
            this.scriptData.webLayer3D._webLayer._hashingCanvas.width = 200; 
            this.scriptData.webLayer3D._webLayer._hashingCanvas.height = 200
            this.scriptData.webLayer3D.refresh(true)
            this.scriptData.webLayer3D.update(true)
        } else {
            console.warn("'html-script' component failed to initialize script for " + nodeName);
        }

        // try {
        //     const scriptURL = "https://blairhome.ngrok.io/test-vue-app/" + this.filename + ".js"
        //     //const scriptURL = "https://resources.realitymedia.digital/test-vue-app/" + this.filename + ".js"
        //     var scriptPromise = import(scriptURL);
        //     try {
        //         const {d} = await scriptPromise;
        //         this.scriptData = d
        //         this.div = this.scriptData.div
        //         this.scriptData.webLayer3D.update()
        //     } catch (err) {
        //         this.scriptData = null;
        //         console.error(`Custom script for html-script componentg ${nodeName} failed to load. Reason: ${err}`);
        //     }
        // } catch (e) {
        //     console.warn("Couldn't fetch script for " + nodeName);
        // }  
    }
  }
})
